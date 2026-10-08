// Audit trail. Records are only ever added, there is no update or delete.

var Audit = (function () {

    var secret = ['Password', 'ConfirmPassword', 'CurrentPassword', 'PasswordHash', 'Salt'];

    function clean(obj) {
        if (!obj) { return null; }
        var out = {};
        $.each(obj, function (k, v) {
            if ($.inArray(k, secret) < 0) { out[k] = v; }
        });
        return JSON.stringify(out);
    }

    function log(e) {
        var userId = e.userId;
        if (userId === undefined) {
            var me = Auth.user();
            userId = me ? me.UserId : null;
        }
        Store.insert('auditLogs', {
            UserId: userId,
            Action: e.action,
            EntityName: e.entity,
            RecordId: e.recordId || null,
            OldValue: clean(e.oldValue),
            NewValue: clean(e.newValue),
            Result: e.result || 'Success',
            Details: e.details || '',
            CreatedDate: new Date().toISOString(),
            IpAddress: '127.0.0.1'    // filled from HttpContext on the server
        });
    }

    // returns only the fields that changed, as { oldValue: {}, newValue: {} }
    function changes(before, after, fields) {
        var o = {}, n = {}, any = false;
        $.each(fields, function (i, f) {
            var a = before[f], b = after[f];
            if (a === undefined || a === null) { a = ''; }
            if (b === undefined || b === null) { b = ''; }
            if (String(a) !== String(b)) { o[f] = before[f]; n[f] = after[f]; any = true; }
        });
        return any ? { oldValue: o, newValue: n } : null;
    }

    // Admin sees everything. Manager sees business events of the team, not account/security events.
    function list(filter) {
        filter = filter || {};
        var me = Auth.user();
        if (!me || !Auth.can('AuditLog')) { return Svc.fail(403, 'You do not have permission to view the audit log.'); }

        var names = {};
        $.each(Store.all('users'), function (i, u) { names[u.UserId] = u.FullName; });
        var ids = Auth.scopeIds();

        var rows = $.grep(Store.all('auditLogs'), function (a) {
            if (me.Role !== 'Admin') {
                if (a.EntityName === 'Account' || a.EntityName === 'User') { return false; }
                if ($.inArray(a.UserId, ids) < 0) { return false; }
            }
            if (filter.userId && a.UserId !== Number(filter.userId)) { return false; }
            if (filter.entity && a.EntityName !== filter.entity) { return false; }
            if (filter.action && a.Action !== filter.action) { return false; }
            if (filter.result && a.Result !== filter.result) { return false; }
            var d = App.toDateStr(new Date(a.CreatedDate));
            if (filter.from && d < filter.from) { return false; }
            if (filter.to && d > filter.to) { return false; }
            return true;
        });

        $.each(rows, function (i, a) {
            a.UserFullName = a.UserId ? (names[a.UserId] || 'User #' + a.UserId) : 'Anonymous';
        });
        rows.sort(function (a, b) { return a.AuditLogId < b.AuditLogId ? 1 : -1; });
        return Svc.ok(rows);
    }

    // history of one record, newest first. The caller has already checked access to the record itself.
    function forRecord(entity, recordId) {
        var rows = $.grep(Store.all('auditLogs'), function (a) {
            return a.EntityName === entity && a.RecordId === Number(recordId) && a.Action !== 'Access Denied';
        });
        $.each(rows, function (i, a) { a.UserFullName = Svc.userName(a.UserId); });
        rows.reverse();
        return rows;
    }

    return { log: log, changes: changes, list: list, forRecord: forRecord };

})();
