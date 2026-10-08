// Audit log: read-only list with filters. There is no edit or delete on purpose.

App.page(function (me) {

    var isAdmin = me.Role === 'Admin';
    var rowsById = {};

    $('#scopeText').text(isAdmin
        ? 'Security and business events for all users. Records cannot be changed or deleted.'
        : 'Business events for you and your team. Sign-in and account events are visible to administrators only.');

    var users = isAdmin ? Store.all('users') : Svc.scoped(Store.all('users'), 'UserId');
    App.fillSelect($('#userId'), $.map(users, function (u) { return { value: u.UserId, text: u.FullName }; }), 'All users');

    var modules = ['Customer', 'Lead', 'Opportunity', 'FollowUp', 'Activity'];
    var actions = ['Create', 'Update', 'Delete', 'Status Change', 'Convert'];
    if (isAdmin) {
        modules = ['Account', 'User'].concat(modules);
        actions = ['Login', 'Failed Login', 'Logout', 'Lockout', 'Unlock', 'Register', 'Role Change', 'Password Reset', 'Password Change', 'Access Denied'].concat(actions);
    }
    App.fillSelect($('#entity'), modules, 'All modules');
    App.fillSelect($('#action'), actions, 'All actions');

    var grid = App.grid({
        el: '#auditGrid',
        pageSize: 15,
        empty: 'No audit records match the filters.',
        columns: [
            { title: 'Date and time', sort: 'AuditLogId', render: function (a) { return App.fmtDateTime(a.CreatedDate); } },
            { title: 'User', key: 'UserFullName', sort: true },
            { title: 'Action', key: 'Action', sort: true },
            { title: 'Module', key: 'EntityName', sort: true },
            { title: 'Record', sort: 'RecordId', cls: 'num', render: function (a) { return a.RecordId ? '#' + a.RecordId : ''; } },
            { title: 'Result', sort: 'Result', render: function (a) { return App.tag(a.Result); } },
            { title: 'Details', render: function (a) { return App.esc(a.Details || App.auditSummary(a)); } },
            {
                title: '', cls: 'row-actions', render: function (a) {
                    return '<button type="button" class="btn btn-sm" data-view="' + a.AuditLogId + '" title="View record" aria-label="View audit record"><i class="bi bi-eye"></i></button>';
                }
            }
        ]
    });

    function filter() {
        return {
            userId: $('#userId').val(), entity: $('#entity').val(), action: $('#action').val(),
            from: $('#from').val(), to: $('#to').val()
        };
    }

    function search() {
        var rows = Audit.list(filter()).data;
        rowsById = {};
        $.each(rows, function (i, a) { rowsById[a.AuditLogId] = a; });
        grid.setRows(rows);
    }

    $('#filterForm').on('input change', search)
        .on('submit', function (e) { e.preventDefault(); })
        .on('reset', function () { setTimeout(search, 0); });

    function pretty(json) {
        if (!json) { return '-'; }
        try {
            var obj = JSON.parse(json);
            return $.map(obj, function (v, k) { return k + ': ' + (v === null ? '' : v); }).join('\n');
        } catch (e) { return json; }
    }

    $('#auditGrid').on('click', '[data-view]', function () {
        var a = rowsById[$(this).data('view')];
        $('#aWhen').text(App.fmtDateTime(a.CreatedDate));
        $('#aUser').text(a.UserFullName);
        $('#aAction').text(a.Action);
        $('#aEntity').text(a.EntityName);
        $('#aRecord').text(a.RecordId || '-');
        $('#aResult').html(App.tag(a.Result));
        $('#aIp').text(a.IpAddress || '-');
        $('#aDetails').text(a.Details || '-');
        $('#aOld').text(pretty(a.OldValue));
        $('#aNew').text(pretty(a.NewValue));
        bootstrap.Modal.getOrCreateInstance('#auditModal').show();
    });

    $('#exportButton').on('click', function () {
        App.exportCsv('audit-log-' + App.today() + '.csv', [
            { title: 'Date', value: function (a) { return App.fmtDateTime(a.CreatedDate); } },
            { title: 'User', value: 'UserFullName' },
            { title: 'Action', value: 'Action' },
            { title: 'Module', value: 'EntityName' },
            { title: 'Record ID', value: 'RecordId' },
            { title: 'Result', value: 'Result' },
            { title: 'Details', value: 'Details' },
            { title: 'Old value', value: 'OldValue' },
            { title: 'New value', value: 'NewValue' },
            { title: 'IP address', value: 'IpAddress' }
        ], grid.rows());
    });

    search();
});
