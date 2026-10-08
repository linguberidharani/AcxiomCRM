// Opportunity rules: amount, probability, close date and pipeline stage movement.

var OpportunityService = (function () {

    var T = 'opportunities';
    var auditFields = ['OpportunityName', 'CustomerId', 'Amount', 'Stage', 'Probability', 'ExpectedCloseDate', 'Source', 'AssignedTo', 'Notes'];

    function isOpen(stage) {
        return $.inArray(stage, Config.openStages) >= 0;
    }

    function toDto(o) {
        var c = Store.find('customers', o.CustomerId);
        o.CustomerName = c ? c.CustomerName : '';
        o.CompanyName = c ? c.CompanyName : '';
        o.AssignedToName = Svc.userName(o.AssignedTo);
        o.Code = Seed.code('OPP', o.OpportunityId);
        o.WeightedAmount = Math.round(o.Amount * o.Probability) / 100;     // Amount x Probability / 100
        o.IsOpen = o.Status === 'Open';
        o.IsOverdue = o.IsOpen && o.ExpectedCloseDate < App.today();
        return o;
    }

    // opts.skipCustomer is used during lead conversion, when the customer does not exist yet
    function validate(dto, opts) {
        opts = opts || {};
        var e = {}, c = Svc.check, m = Config.maxLength;

        c.required(e, dto, 'OpportunityName', 'Opportunity Name is required.');
        c.maxLength(e, dto, 'OpportunityName', m.subject, 'Opportunity Name');

        if (!opts.skipCustomer) {
            var customer = Svc.isBlank(dto.CustomerId) ? null : Store.find('customers', dto.CustomerId);
            if (Svc.isBlank(dto.CustomerId)) { e.CustomerId = 'Customer is required.'; }
            else if (!customer || !Auth.inScope(customer.AssignedTo)) { e.CustomerId = 'Select a valid customer.'; }
            else { dto.CustomerId = customer.CustomerId; }
        }

        c.required(e, dto, 'Stage', 'Stage is required.');
        c.oneOf(e, dto, 'Stage', Config.stages, 'Select a valid stage.');
        var open = isOpen(dto.Stage);

        var amount = Number(dto.Amount);
        if (Svc.isBlank(dto.Amount)) { e.Amount = 'Opportunity Amount is required.'; }
        else if (isNaN(amount)) { e.Amount = 'Opportunity Amount must be a number.'; }
        else if (amount <= 0) { e.Amount = 'Opportunity Amount must be greater than 0.'; }
        else if (amount > Config.maxAmount) { e.Amount = 'Opportunity Amount is too large.'; }
        else { dto.Amount = Math.round(amount * 100) / 100; }

        var prob = Number(dto.Probability);
        if (Svc.isBlank(dto.Probability)) { e.Probability = 'Probability is required.'; }
        else if (isNaN(prob) || prob < 0 || prob > 100) { e.Probability = 'Probability must be between 0 and 100.'; }
        else { dto.Probability = Math.round(prob); }

        c.required(e, dto, 'ExpectedCloseDate', 'Expected Close Date is required.');
        c.date(e, dto, 'ExpectedCloseDate', 'Expected Close Date');
        if (!e.ExpectedCloseDate && open && dto.ExpectedCloseDate < App.today()) {
            e.ExpectedCloseDate = 'Expected Close Date cannot be in the past.';
        }

        c.oneOf(e, dto, 'Source', Config.leadSources, 'Select a valid source.');
        c.maxLength(e, dto, 'Notes', m.notes, 'Notes');

        if (opts.owner) { dto.AssignedTo = opts.owner; }
        else { Svc.assignee(e, dto); }
        return e;
    }

    function list(filter) {
        filter = filter || {};
        var q = (filter.q || '').toLowerCase();
        var rows = $.map(Svc.scoped(Store.all(T)), toDto);
        rows = $.grep(rows, function (o) {
            if (filter.stage && o.Stage !== filter.stage) { return false; }
            if (filter.status && o.Status !== filter.status) { return false; }
            if (filter.customerId && o.CustomerId !== Number(filter.customerId)) { return false; }
            if (filter.assignedTo && o.AssignedTo !== Number(filter.assignedTo)) { return false; }
            if (q) {
                var text = [o.OpportunityName, o.CustomerName, o.CompanyName, o.Code].join(' ').toLowerCase();
                if (text.indexOf(q) < 0) { return false; }
            }
            return true;
        });
        return Svc.ok(rows);
    }

    function get(id) {
        var o = Store.find(T, id);
        if (!o) { return Svc.notFound('Opportunity'); }
        if (!Auth.inScope(o.AssignedTo)) { return Svc.denied('Opportunity', o.OpportunityId, 'View'); }
        return Svc.ok(toDto(o));
    }

    function create(dto) {
        dto = Svc.trimAll(dto);
        if (!dto.Stage) { dto.Stage = 'Qualification'; }
        var e = validate(dto);
        if (!e.Stage && !isOpen(dto.Stage)) { e.Stage = 'A new opportunity must start in an open stage.'; }
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Opportunity was not saved.', e); }

        var o = Store.insert(T, {
            OpportunityName: dto.OpportunityName, CustomerId: dto.CustomerId, LeadId: dto.LeadId || null,
            Amount: dto.Amount, Stage: dto.Stage, Probability: dto.Probability,
            ExpectedCloseDate: dto.ExpectedCloseDate, Status: 'Open',
            Source: dto.Source || '', Notes: dto.Notes || '', Outcome: '',
            CreatedDate: new Date().toISOString(), ClosedDate: null, AssignedTo: dto.AssignedTo
        });
        Audit.log({
            action: 'Create', entity: 'Opportunity', recordId: o.OpportunityId,
            newValue: { OpportunityName: o.OpportunityName, CustomerId: o.CustomerId, Amount: o.Amount, Stage: o.Stage, Probability: o.Probability, ExpectedCloseDate: o.ExpectedCloseDate },
            details: Seed.code('OPP', o.OpportunityId) + ' created'
        });
        return Svc.ok(toDto(o), 201);
    }

    function update(id, dto) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Opportunity'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Opportunity', old.OpportunityId, 'Update'); }
        if (old.Status !== 'Open') { return Svc.fail(409, 'A closed opportunity cannot be edited.'); }

        dto = Svc.trimAll(dto);
        if (!dto.Stage) { dto.Stage = old.Stage; }
        var e = validate(dto);
        if (!e.Stage && !isOpen(dto.Stage)) { e.Stage = 'Use Mark as Won or Mark as Lost to close an opportunity.'; }
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Opportunity was not saved.', e); }

        var o = Store.update(T, old.OpportunityId, {
            OpportunityName: dto.OpportunityName, CustomerId: dto.CustomerId,
            Amount: dto.Amount, Stage: dto.Stage, Probability: dto.Probability,
            ExpectedCloseDate: dto.ExpectedCloseDate, Source: dto.Source || '', Notes: dto.Notes || '',
            AssignedTo: dto.AssignedTo
        });
        var ch = Audit.changes(old, o, auditFields);
        if (ch) {
            Audit.log({
                action: ch.newValue.Stage !== undefined ? 'Status Change' : 'Update', entity: 'Opportunity', recordId: o.OpportunityId,
                oldValue: ch.oldValue, newValue: ch.newValue, details: Seed.code('OPP', o.OpportunityId) + ' updated'
            });
        }
        return Svc.ok(toDto(o));
    }

    // moves an open opportunity to another stage. Won / Lost close it and record the outcome.
    function moveStage(id, stage, outcome) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Opportunity'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Opportunity', old.OpportunityId, 'Stage change'); }
        if ($.inArray(stage, Config.stages) < 0) { return Svc.fail(400, 'Select a valid stage.'); }
        if (old.Status !== 'Open') { return Svc.fail(409, 'This opportunity is already closed as ' + old.Stage + '.'); }
        if (old.Stage === stage) { return Svc.ok(toDto(old)); }

        outcome = $.trim(outcome || '');
        if (outcome.length > Config.maxLength.notes) {
            return Svc.fail(400, 'Opportunity was not updated.', { Outcome: 'Outcome cannot be longer than ' + Config.maxLength.notes + ' characters.' });
        }
        if (stage === 'Lost' && !outcome) {
            return Svc.fail(400, 'Opportunity was not updated.', { Outcome: 'Enter the reason for losing this opportunity.' });
        }

        var changes = { Stage: stage, Probability: Config.stageProbability[stage] };
        if (!isOpen(stage)) {
            changes.Status = stage;
            changes.Outcome = outcome;
            changes.ClosedDate = new Date().toISOString();
        }
        var o = Store.update(T, old.OpportunityId, changes);
        Audit.log({
            action: 'Status Change', entity: 'Opportunity', recordId: o.OpportunityId,
            oldValue: { Stage: old.Stage, Probability: old.Probability },
            newValue: { Stage: o.Stage, Probability: o.Probability },
            details: Seed.code('OPP', o.OpportunityId) + (isOpen(stage) ? ' moved to ' + stage : ' marked ' + stage) + (outcome ? ': ' + outcome : '')
        });
        return Svc.ok(toDto(o));
    }

    function remove(id) {
        var o = Store.find(T, id);
        if (!o) { return Svc.notFound('Opportunity'); }
        if (!Svc.canManage() || !Auth.inScope(o.AssignedTo)) { return Svc.denied('Opportunity', o.OpportunityId, 'Delete'); }
        $.each(Store.all('followUps'), function (i, f) {
            if (f.OpportunityId === o.OpportunityId) { Store.update('followUps', f.FollowUpId, { OpportunityId: null }); }
        });
        Store.remove(T, o.OpportunityId);
        Audit.log({
            action: 'Delete', entity: 'Opportunity', recordId: o.OpportunityId, details: Seed.code('OPP', o.OpportunityId) + ' deleted',
            oldValue: { OpportunityName: o.OpportunityName, Amount: o.Amount, Stage: o.Stage }
        });
        return Svc.ok(null);
    }

    return {
        list: list, get: get, create: create, update: update, remove: remove,
        moveStage: moveStage, validate: validate, isOpen: isOpen
    };

})();
