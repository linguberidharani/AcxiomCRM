// Follow-up rules: scheduling, completing, rescheduling and missed / cancelled.

var FollowUpService = (function () {

    var T = 'followUps';

    function related(f) {
        if (f.OpportunityId) {
            var o = Store.find('opportunities', f.OpportunityId);
            return { type: 'Opportunity', id: f.OpportunityId, name: o ? o.OpportunityName : '(deleted)', url: 'Opportunities/Details.html?id=' + f.OpportunityId };
        }
        if (f.LeadId) {
            var l = Store.find('leads', f.LeadId);
            return { type: 'Lead', id: f.LeadId, name: l ? l.LeadName : '(deleted)', url: 'Leads/Details.html?id=' + f.LeadId };
        }
        var c = Store.find('customers', f.CustomerId);
        return { type: 'Customer', id: f.CustomerId, name: c ? c.CustomerName : '(deleted)', url: 'Customers/Details.html?id=' + f.CustomerId };
    }

    function toDto(f) {
        var r = related(f);
        f.RelatedType = r.type;
        f.RelatedId = r.id;
        f.RelatedName = r.name;
        f.RelatedUrl = r.url;
        f.AssignedToName = Svc.userName(f.AssignedTo);
        f.IsOverdue = f.Status === 'Planned' && f.FollowUpDate < App.today();
        f.DisplayStatus = f.IsOverdue ? 'Overdue' : f.Status;
        return f;
    }

    // works out CustomerId / LeadId / OpportunityId from the "related to" choice
    function resolveRelated(e, dto) {
        var type = dto.RelatedType, id = Number(dto.RelatedId);
        var ids = { CustomerId: null, LeadId: null, OpportunityId: null };
        if ($.inArray(type, ['Customer', 'Lead', 'Opportunity']) < 0) { e.RelatedType = 'Select what this follow-up is for.'; return ids; }
        if (!id) { e.RelatedId = type + ' is required.'; return ids; }

        var rec = null;
        if (type === 'Customer') { rec = Store.find('customers', id); ids.CustomerId = id; }
        if (type === 'Lead') { rec = Store.find('leads', id); ids.LeadId = id; }
        if (type === 'Opportunity') {
            rec = Store.find('opportunities', id);
            ids.OpportunityId = id;
            if (rec) { ids.CustomerId = rec.CustomerId; }
        }
        if (!rec || !Auth.inScope(rec.AssignedTo)) { e.RelatedId = 'Select a valid ' + type.toLowerCase() + '.'; }
        return ids;
    }

    function checkDate(e, dto, field, label) {
        Svc.check.required(e, dto, field, label + ' is required.');
        Svc.check.date(e, dto, field, label);
        if (!e[field] && dto[field] < App.today()) { e[field] = 'Follow-up date cannot be earlier than today.'; }
    }

    function list(filter) {
        filter = filter || {};
        var rows = $.map(Svc.scoped(Store.all(T)), toDto);
        var today = App.today();
        rows = $.grep(rows, function (f) {
            if (filter.status) {
                if (filter.status === 'Overdue') { if (!f.IsOverdue) { return false; } }
                else if (filter.status === 'Pending') { if (f.Status !== 'Planned') { return false; } }
                else if (filter.status === 'Upcoming') { if (f.Status !== 'Planned' || f.FollowUpDate < today) { return false; } }
                else if (f.Status !== filter.status) { return false; }
            }
            if (filter.assignedTo && f.AssignedTo !== Number(filter.assignedTo)) { return false; }
            if (filter.from && f.FollowUpDate < filter.from) { return false; }
            if (filter.to && f.FollowUpDate > filter.to) { return false; }
            if (filter.relatedType && f.RelatedType !== filter.relatedType) { return false; }
            if (filter.customerId && f.CustomerId !== Number(filter.customerId)) { return false; }
            if (filter.leadId && f.LeadId !== Number(filter.leadId)) { return false; }
            if (filter.opportunityId && f.OpportunityId !== Number(filter.opportunityId)) { return false; }
            if (filter.q) {
                var text = (f.Subject + ' ' + f.RelatedName).toLowerCase();
                if (text.indexOf(filter.q.toLowerCase()) < 0) { return false; }
            }
            return true;
        });
        return Svc.ok(rows);
    }

    function get(id) {
        var f = Store.find(T, id);
        if (!f) { return Svc.notFound('Follow-up'); }
        if (!Auth.inScope(f.AssignedTo)) { return Svc.denied('FollowUp', f.FollowUpId, 'View'); }
        return Svc.ok(toDto(f));
    }

    function create(dto) {
        dto = Svc.trimAll(dto);
        var e = {}, c = Svc.check;
        var ids = resolveRelated(e, dto);
        c.required(e, dto, 'Subject', 'Subject is required.');
        c.maxLength(e, dto, 'Subject', Config.maxLength.subject, 'Subject');
        c.required(e, dto, 'FollowUpType', 'Follow-up Type is required.');
        c.oneOf(e, dto, 'FollowUpType', Config.followUpTypes, 'Select a valid follow-up type.');
        checkDate(e, dto, 'FollowUpDate', 'Follow-up Date');
        c.maxLength(e, dto, 'Remarks', Config.maxLength.notes, 'Remarks');
        Svc.assignee(e, dto);
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Follow-up was not scheduled.', e); }

        var f = Store.insert(T, {
            CustomerId: ids.CustomerId, LeadId: ids.LeadId, OpportunityId: ids.OpportunityId,
            FollowUpDate: dto.FollowUpDate, FollowUpType: dto.FollowUpType, Subject: dto.Subject,
            Remarks: dto.Remarks || '', Status: 'Planned', AssignedTo: dto.AssignedTo,
            CreatedDate: new Date().toISOString(), CompletedDate: null
        });
        Audit.log({
            action: 'Create', entity: 'FollowUp', recordId: f.FollowUpId, details: 'Follow-up scheduled for ' + App.fmtDate(f.FollowUpDate),
            newValue: { Subject: f.Subject, FollowUpType: f.FollowUpType, FollowUpDate: f.FollowUpDate, AssignedTo: f.AssignedTo }
        });
        return Svc.ok(toDto(f), 201);
    }

    function loadPlanned(id, what) {
        var f = Store.find(T, id);
        if (!f) { return { error: Svc.notFound('Follow-up') }; }
        if (!Auth.inScope(f.AssignedTo)) { return { error: Svc.denied('FollowUp', f.FollowUpId, what) }; }
        if (f.Status !== 'Planned') { return { error: Svc.fail(409, 'This follow-up is already ' + f.Status.toLowerCase() + '.') }; }
        return { row: f };
    }

    // Completing a follow-up also logs it as an activity on the customer / lead,
    // and a New lead moves to Contacted.
    function complete(id, dto) {
        var x = loadPlanned(id, 'Complete');
        if (x.error) { return x.error; }
        var old = x.row;

        dto = Svc.trimAll(dto);
        var e = {};
        Svc.check.required(e, dto, 'Outcome', 'Outcome is required.');
        Svc.check.maxLength(e, dto, 'Outcome', Config.maxLength.notes, 'Outcome');
        if (!Svc.isBlank(dto.NextDate)) { checkDate(e, dto, 'NextDate', 'Next Follow-up Date'); }
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Follow-up was not completed.', e); }

        var f = Store.update(T, old.FollowUpId, {
            Status: 'Completed', CompletedDate: new Date().toISOString(),
            Remarks: old.Remarks ? old.Remarks + '\nOutcome: ' + dto.Outcome : dto.Outcome
        });
        Audit.log({
            action: 'Update', entity: 'FollowUp', recordId: f.FollowUpId, details: 'Follow-up completed',
            oldValue: { Status: 'Planned' }, newValue: { Status: 'Completed' }
        });

        var typeMap = { Call: 'Call', Email: 'Email', Meeting: 'Meeting', Demo: 'Meeting', 'Site Visit': 'Meeting' };
        var a = Store.insert('activities', {
            ActivityType: typeMap[f.FollowUpType] || 'Task', Subject: f.Subject, Description: dto.Outcome,
            ActivityDate: App.today(), CustomerId: f.CustomerId, LeadId: f.LeadId,
            AssignedTo: f.AssignedTo, Status: 'Completed', CreatedDate: new Date().toISOString()
        });
        Audit.log({ action: 'Create', entity: 'Activity', recordId: a.ActivityId, details: 'Logged from follow-up #' + f.FollowUpId, newValue: { ActivityType: a.ActivityType, Subject: a.Subject } });

        if (f.LeadId) {
            var lead = Store.find('leads', f.LeadId);
            if (lead && lead.Status === 'New') {
                Store.update('leads', lead.LeadId, { Status: 'Contacted' });
                Audit.log({
                    action: 'Status Change', entity: 'Lead', recordId: lead.LeadId, details: lead.LeadCode + ' moved to Contacted after follow-up',
                    oldValue: { Status: 'New' }, newValue: { Status: 'Contacted' }
                });
            }
        }

        var next = null;
        if (!Svc.isBlank(dto.NextDate)) {
            next = Store.insert(T, {
                CustomerId: f.CustomerId, LeadId: f.LeadId, OpportunityId: f.OpportunityId,
                FollowUpDate: dto.NextDate, FollowUpType: f.FollowUpType, Subject: f.Subject,
                Remarks: '', Status: 'Planned', AssignedTo: f.AssignedTo,
                CreatedDate: new Date().toISOString(), CompletedDate: null
            });
            Audit.log({
                action: 'Create', entity: 'FollowUp', recordId: next.FollowUpId, details: 'Next follow-up scheduled for ' + App.fmtDate(next.FollowUpDate),
                newValue: { Subject: next.Subject, FollowUpDate: next.FollowUpDate }
            });
        }
        return Svc.ok({ followUp: toDto(f), next: next });
    }

    function reschedule(id, dto) {
        var x = loadPlanned(id, 'Reschedule');
        if (x.error) { return x.error; }
        var old = x.row;

        dto = Svc.trimAll(dto);
        var e = {};
        checkDate(e, dto, 'FollowUpDate', 'New Date');
        Svc.check.maxLength(e, dto, 'Reason', 250, 'Reason');
        if (!e.FollowUpDate && dto.FollowUpDate === old.FollowUpDate) { e.FollowUpDate = 'Choose a different date.'; }
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Follow-up was not rescheduled.', e); }

        var f = Store.update(T, old.FollowUpId, {
            FollowUpDate: dto.FollowUpDate,
            Remarks: dto.Reason ? (old.Remarks ? old.Remarks + '\n' : '') + 'Rescheduled: ' + dto.Reason : old.Remarks
        });
        Audit.log({
            action: 'Update', entity: 'FollowUp', recordId: f.FollowUpId,
            details: 'Follow-up rescheduled' + (dto.Reason ? ': ' + dto.Reason : ''),
            oldValue: { FollowUpDate: old.FollowUpDate }, newValue: { FollowUpDate: f.FollowUpDate }
        });
        return Svc.ok(toDto(f));
    }

    // status is Missed or Cancelled
    function close(id, status) {
        if (status !== 'Missed' && status !== 'Cancelled') { return Svc.fail(400, 'Select a valid status.'); }
        var x = loadPlanned(id, status);
        if (x.error) { return x.error; }
        var f = Store.update(T, x.row.FollowUpId, { Status: status });
        Audit.log({
            action: 'Status Change', entity: 'FollowUp', recordId: f.FollowUpId, details: 'Follow-up marked ' + status,
            oldValue: { Status: 'Planned' }, newValue: { Status: status }
        });
        return Svc.ok(toDto(f));
    }

    function remove(id) {
        var f = Store.find(T, id);
        if (!f) { return Svc.notFound('Follow-up'); }
        if (!Svc.canManage() || !Auth.inScope(f.AssignedTo)) { return Svc.denied('FollowUp', f.FollowUpId, 'Delete'); }
        Store.remove(T, f.FollowUpId);
        Audit.log({ action: 'Delete', entity: 'FollowUp', recordId: f.FollowUpId, details: 'Follow-up deleted', oldValue: { Subject: f.Subject, FollowUpDate: f.FollowUpDate, Status: f.Status } });
        return Svc.ok(null);
    }

    return { list: list, get: get, create: create, complete: complete, reschedule: reschedule, close: close, remove: remove };

})();
