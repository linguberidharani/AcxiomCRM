// Customer rules. Mirrors what CustomerService + the /api/customers controller will do.

var CustomerService = (function () {

    var T = 'customers';
    var auditFields = ['CustomerName', 'CompanyName', 'Email', 'Phone', 'Address', 'City', 'State', 'Status', 'AssignedTo', 'Notes'];

    function toDto(c) {
        c.AssignedToName = Svc.userName(c.AssignedTo);
        c.CreatedByName = Svc.userName(c.CreatedBy);
        return c;
    }

    function validate(dto, id) {
        var e = {}, c = Svc.check, m = Config.maxLength;

        c.required(e, dto, 'CustomerName', 'Customer Name is required.');
        c.maxLength(e, dto, 'CustomerName', m.name, 'Customer Name');
        c.required(e, dto, 'Email', 'Email is required.');
        c.email(e, dto, 'Email');
        c.maxLength(e, dto, 'Email', m.email, 'Email');
        c.required(e, dto, 'Phone', 'Phone is required.');
        c.phone(e, dto, 'Phone');
        c.maxLength(e, dto, 'CompanyName', m.company, 'Company Name');
        c.maxLength(e, dto, 'Address', m.address, 'Address');
        c.maxLength(e, dto, 'City', m.city, 'City');
        c.oneOf(e, dto, 'State', Config.states, 'Select a valid state.');
        c.required(e, dto, 'Status', 'Status is required.');
        c.oneOf(e, dto, 'Status', Config.customerStatuses, 'Select a valid status.');
        c.maxLength(e, dto, 'Notes', m.notes, 'Notes');
        Svc.assignee(e, dto);

        // email and phone must be unique across all customers, not only the ones this user can see
        var duplicate = false;
        $.each(Store.all(T), function (i, x) {
            if (x.CustomerId === id) { return; }
            if (!e.Email && x.Email.toLowerCase() === dto.Email.toLowerCase()) {
                e.Email = 'A customer with this email already exists (' + x.CustomerCode + ').';
                duplicate = true;
            }
            if (!e.Phone && x.Phone === dto.Phone) {
                e.Phone = 'A customer with this phone number already exists (' + x.CustomerCode + ').';
                duplicate = true;
            }
        });
        return { errors: e, duplicate: duplicate };
    }

    function list(filter) {
        filter = filter || {};
        var q = (filter.q || '').toLowerCase();
        var rows = $.grep(Svc.scoped(Store.all(T)), function (c) {
            if (filter.status && c.Status !== filter.status) { return false; }
            if (filter.assignedTo && c.AssignedTo !== Number(filter.assignedTo)) { return false; }
            if (q) {
                var text = [c.CustomerName, c.Email, c.Phone, c.CompanyName, c.CustomerCode].join(' ').toLowerCase();
                if (text.indexOf(q) < 0) { return false; }
            }
            return true;
        });
        return Svc.ok($.map(rows, toDto));
    }

    function get(id) {
        var c = Store.find(T, id);
        if (!c) { return Svc.notFound('Customer'); }
        if (!Auth.inScope(c.AssignedTo)) { return Svc.denied('Customer', c.CustomerId, 'View'); }
        return Svc.ok(toDto(c));
    }

    function create(dto) {
        dto = Svc.trimAll(dto);
        if (!dto.Status) { dto.Status = 'Active'; }
        var v = validate(dto, 0);
        if (Svc.hasErrors(v.errors)) {
            return Svc.fail(v.duplicate ? 409 : 400, v.duplicate ? 'This customer already exists.' : 'Customer was not saved.', v.errors);
        }
        var me = Auth.user();
        var c = Store.insert(T, {
            CustomerCode: '',
            CustomerName: dto.CustomerName, CompanyName: dto.CompanyName || '', Email: dto.Email, Phone: dto.Phone,
            Address: dto.Address || '', City: dto.City || '', State: dto.State || '',
            Status: dto.Status, AssignedTo: dto.AssignedTo, Notes: dto.Notes || '',
            CreatedDate: new Date().toISOString(), CreatedBy: me.UserId, ModifiedDate: null
        });
        c = Store.update(T, c.CustomerId, { CustomerCode: Seed.code('CUS', c.CustomerId) });
        Audit.log({
            action: 'Create', entity: 'Customer', recordId: c.CustomerId, details: c.CustomerCode + ' created',
            newValue: { CustomerName: c.CustomerName, CompanyName: c.CompanyName, Email: c.Email, Phone: c.Phone, Status: c.Status, AssignedTo: c.AssignedTo }
        });
        return Svc.ok(toDto(c), 201);
    }

    function update(id, dto) {
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('Customer'); }
        if (!Auth.inScope(old.AssignedTo)) { return Svc.denied('Customer', old.CustomerId, 'Update'); }

        dto = Svc.trimAll(dto);
        var v = validate(dto, old.CustomerId);
        if (Svc.hasErrors(v.errors)) {
            return Svc.fail(v.duplicate ? 409 : 400, 'Customer was not saved.', v.errors);
        }
        var c = Store.update(T, old.CustomerId, {
            CustomerName: dto.CustomerName, CompanyName: dto.CompanyName || '', Email: dto.Email, Phone: dto.Phone,
            Address: dto.Address || '', City: dto.City || '', State: dto.State || '',
            Status: dto.Status, AssignedTo: dto.AssignedTo, Notes: dto.Notes || '',
            ModifiedDate: new Date().toISOString()
        });
        var ch = Audit.changes(old, c, auditFields);
        if (ch) {
            var statusChanged = ch.newValue.Status !== undefined;
            Audit.log({
                action: statusChanged ? 'Status Change' : 'Update', entity: 'Customer', recordId: c.CustomerId,
                oldValue: ch.oldValue, newValue: ch.newValue, details: c.CustomerCode + ' updated'
            });
        }
        return Svc.ok(toDto(c));
    }

    function remove(id) {
        var c = Store.find(T, id);
        if (!c) { return Svc.notFound('Customer'); }
        if (!Svc.canManage() || !Auth.inScope(c.AssignedTo)) { return Svc.denied('Customer', c.CustomerId, 'Delete'); }

        var opps = $.grep(Store.all('opportunities'), function (o) { return o.CustomerId === c.CustomerId; });
        if (opps.length) {
            return Svc.fail(409, c.CustomerName + ' has ' + opps.length + ' opportunit' + (opps.length === 1 ? 'y' : 'ies') +
                ' and cannot be deleted. Set the status to Inactive instead.');
        }
        $.each(Store.all('followUps'), function (i, f) { if (f.CustomerId === c.CustomerId) { Store.remove('followUps', f.FollowUpId); } });
        $.each(Store.all('activities'), function (i, a) { if (a.CustomerId === c.CustomerId) { Store.remove('activities', a.ActivityId); } });
        Store.remove(T, c.CustomerId);
        Audit.log({
            action: 'Delete', entity: 'Customer', recordId: c.CustomerId, details: c.CustomerCode + ' deleted',
            oldValue: { CustomerName: c.CustomerName, CompanyName: c.CompanyName, Email: c.Email, Phone: c.Phone }
        });
        return Svc.ok(null);
    }

    // small list for dropdowns
    function lookup() {
        var rows = Svc.scoped(Store.all(T));
        rows.sort(function (a, b) { return a.CustomerName < b.CustomerName ? -1 : 1; });
        return $.map(rows, function (c) {
            return { value: c.CustomerId, text: c.CustomerName + (c.CompanyName ? ' - ' + c.CompanyName : ''), status: c.Status };
        });
    }

    return { list: list, get: get, create: create, update: update, remove: remove, lookup: lookup };

})();
