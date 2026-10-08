// Activities: calls, meetings, emails and tasks logged against a customer or a lead.

var ActivityService = (function () {

    var T = 'activities';
    var auditFields = ['ActivityType', 'Subject', 'Description', 'ActivityDate', 'CustomerId', 'LeadId', 'AssignedTo', 'Status'];

    function toDto(a) {
        a.AssignedToName = Svc.userName(a.AssignedTo);
        a.RelatedName = '';
        a.RelatedUrl = '';
        a.Related = '';
        if (a.CustomerId) {
            var c = Store.find('customers', a.CustomerId);
            a.RelatedName = c ? c.CustomerName : '(deleted)';
            a.RelatedUrl = 'Customers/Details.html?id=' + a.CustomerId;
            a.Related = 'C:' + a.CustomerId;
        } else if (a.LeadId) {
            var l = Store.find('leads', a.LeadId);
            a.RelatedName = l ? l.LeadName : '(deleted)';
            a.RelatedUrl = 'Leads/Details.html?id=' + a.LeadId;
            a.Related = 'L:' + a.LeadId;
        }
        return a;
    }

    // the form sends "C:12" for a customer or "L:5" for a lead. Linking a record is optional.
    function validate(dto) {
        var e = {}, c = Svc.check;
        c.required(e, dto, 'ActivityType', 'Activity Type is required.');
        c.oneOf(e, dto, 'ActivityType', Config.activityTypes, 'Select a valid activity type.');
        c.required(e, dto, 'Subject', 'Subject is required.');
        c.maxLength(e, dto, 'Subject', Config.maxLength.subject, 'Subject');
        c.maxLength(e, dto, 'Description', Config.maxLength.notes, 'Description');
        c.required(e, dto, 'ActivityDate', 'Activity Date is required.');
        c.date(e, dto, 'ActivityDate', 'Activity Date');
        c.required(e, dto, 'Status', 'Status is required.');
        c.oneOf(e, dto, 'Status', Config.activityStatuses, 'Select a valid status.');

        dto.CustomerId = null;
        dto.LeadId = null;
        if (!Svc.isBlank(dto.Related)) {
            var m = /^([CL]):(\d+)$/.exec(dto.Related);
            var rec = m ? Store.find(m[1] === 'C' ? 'customers' : 'leads', m[2]) : null;
            if (!rec || !Auth.inScope(rec.AssignedTo)) { e.Related = 'Select a valid customer or lead.'; }
            else if (m[1] === 'C') { dto.CustomerId = rec.CustomerId; }
            else { dto.LeadId = rec.LeadId; }
        }
        Svc.assignee(e, dto);
        return e;
    }

    function list(filter) {
        filter = filter || {};
        var rows = $.map(Svc.scoped(Store.all(T)), toDto);
        rows = $.grep(rows, function (a) {
            if (filter.type && a.ActivityType !== filter.type) { return false; }
            if (filter.status && a.Status !== filter.status) { return false; }
            if (filter.assignedTo && a.AssignedTo !== Number(filter.assignedTo)) { return false; }
            if (filter.from && a.ActivityDate < filter.from) { return false; }
            if (filter.to && a.ActivityDate > filter.to) { return false; }
            if (filter.customerId && a.CustomerId !== Number(filter.customerId)) { return false; }
            if (filter.leadId && a.LeadId !== Number(filter.leadId)) { return false; }
            return true;
        });
        return Svc.ok(rows);
    }

    function get(id) {
        var a = Store.find(T, id);
        if (!a) { return Svc.notFound('Activity'); }
        if (!Auth.inScope(a.AssignedTo)) { return Svc.denied('Activity', a.ActivityId, 'View'); }
        return Svc.ok(toDto(a));
    }

    function create(dto) {
        dto = Svc.trimAll(dto);
        var e = validate(dto);
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Activity was not saved.', e); }
        var a = Store.insert(T, {
            ActivityType: dto.ActivityType, Subject: dto.Subject, Description: dto.Description || '',
            ActivityDate: dto.ActivityDate, CustomerId: dto.CustomerId, LeadId: dto.LeadId,
            AssignedTo: dto.AssignedTo, Status: dto.Status, CreatedDate: new Date().toISOString()
        });
        Audit.log({
            action: 'Create', entity: 'Activity', recordId: a.ActivityId,
            newValue: { ActivityType: a.ActivityType, Subject: a.Subject, ActivityDate: a.ActivityDate, Status: a.Status }
        });
        return Svc.ok(toDto(a), 201);
    }

    function update(id, dto) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Activity'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Activity', old.ActivityId, 'Update'); }
        dto = Svc.trimAll(dto);
        var e = validate(dto);
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Activity was not saved.', e); }
        var a = Store.update(T, old.ActivityId, {
            ActivityType: dto.ActivityType, Subject: dto.Subject, Description: dto.Description || '',
            ActivityDate: dto.ActivityDate, CustomerId: dto.CustomerId, LeadId: dto.LeadId,
            AssignedTo: dto.AssignedTo, Status: dto.Status
        });
        var ch = Audit.changes(old, a, auditFields);
        if (ch) { Audit.log({ action: 'Update', entity: 'Activity', recordId: a.ActivityId, oldValue: ch.oldValue, newValue: ch.newValue }); }
        return Svc.ok(toDto(a));
    }

    function complete(id) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Activity'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Activity', old.ActivityId, 'Complete'); }
        if (old.Status !== 'Planned') { return Svc.fail(409, 'This activity is already ' + old.Status.toLowerCase() + '.'); }
        var a = Store.update(T, old.ActivityId, { Status: 'Completed' });
        Audit.log({ action: 'Status Change', entity: 'Activity', recordId: a.ActivityId, oldValue: { Status: 'Planned' }, newValue: { Status: 'Completed' } });
        return Svc.ok(toDto(a));
    }

    function remove(id) {
        var a = Store.find(T, id);
        if (!a) { return Svc.notFound('Activity'); }
        if (!Auth.inScope(a.AssignedTo)) { return Svc.denied('Activity', a.ActivityId, 'Delete'); }
        Store.remove(T, a.ActivityId);
        Audit.log({ action: 'Delete', entity: 'Activity', recordId: a.ActivityId, oldValue: { ActivityType: a.ActivityType, Subject: a.Subject, ActivityDate: a.ActivityDate } });
        return Svc.ok(null);
    }

    return { list: list, get: get, create: create, update: update, complete: complete, remove: remove };

})();
