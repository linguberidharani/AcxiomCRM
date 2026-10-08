// Lead rules: capture, status workflow and conversion to customer / opportunity.

var LeadService = (function () {

    var T = 'leads';
    var auditFields = ['LeadName', 'CompanyName', 'Email', 'Phone', 'Source', 'Status', 'Priority', 'ExpectedValue', 'AssignedTo', 'Notes'];

    function toDto(l) {
        l.AssignedToName = Svc.userName(l.AssignedTo);
        l.NextStatuses = Config.leadTransitions[l.Status] || [];
        return l;
    }

    function validate(dto) {
        var e = {}, c = Svc.check, m = Config.maxLength;

        c.required(e, dto, 'LeadName', 'Lead Name is required.');
        c.maxLength(e, dto, 'LeadName', m.name, 'Lead Name');
        c.maxLength(e, dto, 'CompanyName', m.company, 'Company Name');
        c.required(e, dto, 'Email', 'Email is required.');
        c.email(e, dto, 'Email');
        c.maxLength(e, dto, 'Email', m.email, 'Email');
        c.required(e, dto, 'Phone', 'Phone is required.');
        c.phone(e, dto, 'Phone');
        c.required(e, dto, 'Source', 'Lead Source is required.');
        c.oneOf(e, dto, 'Source', Config.leadSources, 'Select a valid lead source.');
        c.required(e, dto, 'Priority', 'Priority is required.');
        c.oneOf(e, dto, 'Priority', Config.leadPriorities, 'Select a valid priority.');
        c.required(e, dto, 'Status', 'Lead Status is required.');
        c.oneOf(e, dto, 'Status', Config.leadStatuses, 'Select a valid lead status.');
        c.maxLength(e, dto, 'Notes', m.notes, 'Notes');

        if (Svc.isBlank(dto.ExpectedValue)) { dto.ExpectedValue = 0; }
        var value = Number(dto.ExpectedValue);
        if (isNaN(value) || value < 0 || value > Config.maxExpectedValue) {
            e.ExpectedValue = 'Expected Value must be between 0 and ' + Config.maxExpectedValue.toLocaleString('en-IN') + '.';
        } else {
            dto.ExpectedValue = Math.round(value * 100) / 100;
        }

        Svc.assignee(e, dto);
        return e;
    }

    function transitionError(from, to) {
        if (from === to) { return null; }
        if (to === 'Converted') { return 'Use Convert Lead to mark a lead as Converted.'; }
        if ($.inArray(to, Config.leadTransitions[from] || []) < 0) {
            return 'A lead cannot be moved from ' + from + ' to ' + to + '.';
        }
        return null;
    }

    function list(filter) {
        filter = filter || {};
        var q = (filter.q || '').toLowerCase();
        var rows = $.grep(Svc.scoped(Store.all(T)), function (l) {
            if (filter.status && l.Status !== filter.status) { return false; }
            if (filter.assignedTo && l.AssignedTo !== Number(filter.assignedTo)) { return false; }
            if (filter.source && l.Source !== filter.source) { return false; }
            if (q) {
                var text = [l.LeadName, l.CompanyName, l.LeadCode, l.Email, l.Phone].join(' ').toLowerCase();
                if (text.indexOf(q) < 0) { return false; }
            }
            return true;
        });
        return Svc.ok($.map(rows, toDto));
    }

    function get(id) {
        var l = Store.find(T, id);
        if (!l) { return Svc.notFound('Lead'); }
        if (!Auth.inScope(l.AssignedTo)) { return Svc.denied('Lead', l.LeadId, 'View'); }
        return Svc.ok(toDto(l));
    }

    function create(dto) {
        dto = Svc.trimAll(dto);
        dto.Status = 'New';     // every lead starts as New
        var e = validate(dto);
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Lead was not saved.', e); }

        var me = Auth.user();
        var l = Store.insert(T, {
            LeadCode: '',
            LeadName: dto.LeadName, CompanyName: dto.CompanyName || '', Email: dto.Email, Phone: dto.Phone,
            Source: dto.Source, Status: 'New', Priority: dto.Priority, ExpectedValue: dto.ExpectedValue,
            AssignedTo: dto.AssignedTo, Notes: dto.Notes || '',
            CreatedDate: new Date().toISOString(), CreatedBy: me.UserId,
            ConvertedCustomerId: null, ConvertedDate: null
        });
        l = Store.update(T, l.LeadId, { LeadCode: Seed.code('LD', l.LeadId) });
        Audit.log({
            action: 'Create', entity: 'Lead', recordId: l.LeadId, details: l.LeadCode + ' created',
            newValue: { LeadName: l.LeadName, Source: l.Source, Status: l.Status, AssignedTo: l.AssignedTo }
        });
        return Svc.ok(toDto(l), 201);
    }

    function update(id, dto) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Lead'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Lead', old.LeadId, 'Update'); }
        if (old.Status === 'Converted') { return Svc.fail(409, 'A converted lead cannot be changed.'); }

        dto = Svc.trimAll(dto);
        if (!dto.Status) { dto.Status = old.Status; }
        var e = validate(dto);
        if (!e.Status) {
            var bad = transitionError(old.Status, dto.Status);
            if (bad) { e.Status = bad; }
        }
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Lead was not saved.', e); }

        var l = Store.update(T, old.LeadId, {
            LeadName: dto.LeadName, CompanyName: dto.CompanyName || '', Email: dto.Email, Phone: dto.Phone,
            Source: dto.Source, Status: dto.Status, Priority: dto.Priority, ExpectedValue: dto.ExpectedValue,
            AssignedTo: dto.AssignedTo, Notes: dto.Notes || ''
        });
        var ch = Audit.changes(old, l, auditFields);
        if (ch) {
            Audit.log({
                action: ch.newValue.Status !== undefined ? 'Status Change' : 'Update', entity: 'Lead', recordId: l.LeadId,
                oldValue: ch.oldValue, newValue: ch.newValue, details: l.LeadCode + ' updated'
            });
        }
        return Svc.ok(toDto(l));
    }

    function changeStatus(id, status) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Lead'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Lead', old.LeadId, 'Status change'); }
        if ($.inArray(status, Config.leadStatuses) < 0) { return Svc.fail(400, 'Select a valid lead status.'); }
        var bad = transitionError(old.Status, status);
        if (bad) { return Svc.fail(409, bad); }
        if (old.Status === status) { return Svc.ok(toDto(old)); }

        var l = Store.update(T, old.LeadId, { Status: status });
        Audit.log({
            action: 'Status Change', entity: 'Lead', recordId: l.LeadId,
            oldValue: { Status: old.Status }, newValue: { Status: status }, details: l.LeadCode + ' moved to ' + status
        });
        return Svc.ok(toDto(l));
    }

    function remove(id) {
        var l = Store.find(T, id);
        if (!l) { return Svc.notFound('Lead'); }
        if (!Svc.canManage() || !Auth.inScope(l.AssignedTo)) { return Svc.denied('Lead', l.LeadId, 'Delete'); }
        if (l.Status === 'Converted') {
            return Svc.fail(409, 'A converted lead cannot be deleted because a customer was created from it.');
        }
        $.each(Store.all('followUps'), function (i, f) { if (f.LeadId === l.LeadId) { Store.remove('followUps', f.FollowUpId); } });
        $.each(Store.all('activities'), function (i, a) { if (a.LeadId === l.LeadId) { Store.remove('activities', a.ActivityId); } });
        Store.remove(T, l.LeadId);
        Audit.log({
            action: 'Delete', entity: 'Lead', recordId: l.LeadId, details: l.LeadCode + ' deleted',
            oldValue: { LeadName: l.LeadName, CompanyName: l.CompanyName, Status: l.Status }
        });
        return Svc.ok(null);
    }

    // Qualified lead -> customer (+ opportunity if asked for).
    // If a customer with the same email or phone is already there, that customer is reused.
    function convert(id, dto) {
        var l = Store.find(T, id);
        if (!l) { return Svc.notFound('Lead'); }
        if (!Auth.inScope(l.AssignedTo)) { return Svc.denied('Lead', l.LeadId, 'Convert'); }
        if (l.Status !== 'Qualified') { return Svc.fail(409, 'Only a Qualified lead can be converted.'); }

        dto = Svc.trimAll(dto);
        var withOpp = dto.CreateOpportunity === true || dto.CreateOpportunity === 'true' || dto.CreateOpportunity === 'on';

        var oppDto = null;
        if (withOpp) {
            oppDto = {
                OpportunityName: dto.OpportunityName, Amount: dto.Amount, Probability: dto.Probability,
                ExpectedCloseDate: dto.ExpectedCloseDate, Stage: 'Qualification', Source: l.Source,
                AssignedTo: l.AssignedTo, Notes: ''
            };
            var oe = OpportunityService.validate(oppDto, { skipCustomer: true, owner: l.AssignedTo });
            if (Svc.hasErrors(oe)) { return Svc.fail(400, 'Lead was not converted.', oe); }
        }

        var existing = null;
        $.each(Store.all('customers'), function (i, c) {
            if (c.Email.toLowerCase() === l.Email.toLowerCase() || c.Phone === l.Phone) { existing = c; }
        });
        if (existing && !Auth.inScope(existing.AssignedTo)) {
            return Svc.fail(409, 'A customer with this email or phone already exists and is assigned to another team.');
        }

        var me = Auth.user(), customer = existing;
        if (!customer) {
            customer = Store.insert('customers', {
                CustomerCode: '',
                CustomerName: l.LeadName, CompanyName: l.CompanyName, Email: l.Email, Phone: l.Phone,
                Address: '', City: '', State: '', Status: 'Active', AssignedTo: l.AssignedTo,
                Notes: 'Converted from lead ' + l.LeadCode + '.',
                CreatedDate: new Date().toISOString(), CreatedBy: me.UserId, ModifiedDate: null
            });
            customer = Store.update('customers', customer.CustomerId, { CustomerCode: Seed.code('CUS', customer.CustomerId) });
            Audit.log({
                action: 'Create', entity: 'Customer', recordId: customer.CustomerId, details: customer.CustomerCode + ' created from ' + l.LeadCode,
                newValue: { CustomerName: customer.CustomerName, Email: customer.Email, Phone: customer.Phone, AssignedTo: customer.AssignedTo }
            });
        }

        var opp = null;
        if (withOpp) {
            oppDto.CustomerId = customer.CustomerId;
            oppDto.LeadId = l.LeadId;
            var r = OpportunityService.create(oppDto);
            if (!r.ok) { return r; }
            opp = r.data;
        }

        var now = new Date().toISOString();
        l = Store.update(T, l.LeadId, { Status: 'Converted', ConvertedCustomerId: customer.CustomerId, ConvertedDate: now });
        Audit.log({
            action: 'Convert', entity: 'Lead', recordId: l.LeadId,
            oldValue: { Status: 'Qualified' },
            newValue: { Status: 'Converted', CustomerId: customer.CustomerId, OpportunityId: opp ? opp.OpportunityId : null },
            details: l.LeadCode + ' converted to ' + customer.CustomerCode + (existing ? ' (existing customer)' : '')
        });

        return Svc.ok({ lead: toDto(l), customer: customer, opportunity: opp, usedExisting: !!existing });
    }

    return {
        list: list, get: get, create: create, update: update, remove: remove,
        changeStatus: changeStatus, convert: convert
    };

})();
