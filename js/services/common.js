// Shared pieces for the service files: result objects, field checks and scope helpers.
// Every save goes through these checks again even though the form already validated,
// because whatever the browser sends cannot be trusted.

var Svc = (function () {

    function ok(data, status) {
        return { ok: true, status: status || 200, data: data };
    }

    function fail(status, message, errors) {
        return { ok: false, status: status, message: message, errors: errors || {} };
    }

    function trimAll(dto, skip) {
        var out = {};
        $.each(dto || {}, function (k, v) {
            out[k] = (typeof v === 'string' && $.inArray(k, skip || []) < 0) ? $.trim(v) : v;
        });
        return out;
    }

    function isBlank(v) {
        return v === undefined || v === null || v === '';
    }

    function isDate(v) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) { return false; }
        var d = App.parseDate(v);
        return !!d && App.toDateStr(d) === v;
    }

    var check = {
        required: function (e, dto, field, message) {
            if (!e[field] && isBlank(dto[field])) { e[field] = message; }
        },
        maxLength: function (e, dto, field, max, label) {
            if (!e[field] && !isBlank(dto[field]) && String(dto[field]).length > max) {
                e[field] = label + ' cannot be longer than ' + max + ' characters.';
            }
        },
        email: function (e, dto, field) {
            if (!e[field] && !isBlank(dto[field]) && !Config.emailPattern.test(dto[field])) {
                e[field] = 'Enter a valid email address.';
            }
        },
        phone: function (e, dto, field) {
            if (!e[field] && !isBlank(dto[field]) && !Config.phonePattern.test(dto[field])) {
                e[field] = 'Enter a valid phone number.';
            }
        },
        oneOf: function (e, dto, field, list, message) {
            if (!e[field] && !isBlank(dto[field]) && $.inArray(dto[field], list) < 0) { e[field] = message; }
        },
        date: function (e, dto, field, label) {
            if (!e[field] && !isBlank(dto[field]) && !isDate(dto[field])) { e[field] = label + ' is not a valid date.'; }
        }
    };

    // ---- users / ownership -----------------------------------------------

    var names = null;

    function userName(id) {
        if (!id) { return ''; }
        if (!names || !names[id]) {
            names = {};
            $.each(Store.all('users'), function (i, u) { names[u.UserId] = u.FullName; });
        }
        return names[id] || 'User #' + id;
    }

    // keeps only the rows the signed-in user is allowed to see
    function scoped(rows, field) {
        var ids = Auth.scopeIds();
        if (ids === null) { return rows; }
        field = field || 'AssignedTo';
        return $.grep(rows, function (r) { return $.inArray(r[field], ids) >= 0; });
    }

    // users that a record can be assigned to by the signed-in user
    function owners(includeInactive) {
        var list = $.grep(scoped(Store.all('users'), 'UserId'), function (u) {
            return u.Role !== 'Admin' && (includeInactive || u.IsActive);
        });
        list.sort(function (a, b) { return a.FullName < b.FullName ? -1 : 1; });
        return $.map(list, function (u) { return { value: u.UserId, text: u.FullName }; });
    }

    // Sales Executives always own what they create. Admin / Manager pick an owner from their scope.
    function assignee(e, dto) {
        var me = Auth.user();
        if (me.Role === 'SalesExecutive') { dto.AssignedTo = me.UserId; return; }
        var id = Number(dto.AssignedTo);
        if (!id) { e.AssignedTo = 'Assigned To is required.'; return; }
        var u = Store.find('users', id);
        if (!u || !u.IsActive || u.Role === 'Admin' || !Auth.inScope(id)) {
            e.AssignedTo = 'Select a valid user.';
            return;
        }
        dto.AssignedTo = id;
    }

    function canManage() {
        return Auth.is('Admin') || Auth.is('Manager');
    }

    function denied(entity, recordId, what) {
        Audit.log({ action: 'Access Denied', entity: entity, recordId: recordId, result: 'Denied', details: what || '' });
        return fail(403, 'You do not have permission to do this.');
    }

    function notFound(label) {
        return fail(404, label + ' was not found.');
    }

    function hasErrors(e) { return !$.isEmptyObject(e); }

    return {
        ok: ok, fail: fail, trimAll: trimAll, isBlank: isBlank, isDate: isDate, check: check,
        userName: userName, scoped: scoped, owners: owners, assignee: assignee,
        canManage: canManage, denied: denied, notFound: notFound, hasErrors: hasErrors
    };

})();
