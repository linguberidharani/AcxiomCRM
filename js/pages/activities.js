// Activities: call / meeting / email / task log.

App.page(function (me) {

    var icons = { Call: 'bi-telephone', Meeting: 'bi-people', Email: 'bi-envelope', Task: 'bi-check2-square' };
    var rowsById = {};
    var editId = null;

    App.fillSelect($('#type'), Config.activityTypes, 'All');
    App.fillSelect($('#status'), Config.activityStatuses, 'All');
    App.fillSelect($('#assignedTo'), Svc.owners(true), 'Everyone');
    if (me.Role === 'SalesExecutive') { $('#ownerFilter').addClass('d-none'); }

    var grid = App.grid({
        el: '#activityGrid',
        sortBy: 0, sortDir: 'desc',
        empty: 'No activities match the filters.',
        columns: [
            { title: 'Date', sort: 'ActivityDate', render: function (a) { return App.fmtDate(a.ActivityDate); } },
            { title: 'Type', sort: 'ActivityType', render: function (a) { return '<i class="bi ' + icons[a.ActivityType] + ' text-muted me-2"></i>' + App.esc(a.ActivityType); } },
            {
                title: 'Subject', sort: 'Subject', render: function (a) {
                    return App.esc(a.Subject) + (a.Description ? '<span class="sub">' + App.esc(a.Description) + '</span>' : '');
                }
            },
            {
                title: 'Customer / Lead', sort: 'RelatedName', render: function (a) {
                    return a.RelatedUrl ? '<a href="' + App.url(a.RelatedUrl) + '">' + App.esc(a.RelatedName) + '</a>' : '<span class="text-muted">-</span>';
                }
            },
            { title: 'Assigned To', key: 'AssignedToName', sort: true },
            { title: 'Status', sort: 'Status', render: function (a) { return App.tag(a.Status); } },
            {
                title: '', cls: 'row-actions', render: function (a) {
                    return (a.Status === 'Planned' ? '<button type="button" class="btn btn-sm" data-act="complete" data-id="' + a.ActivityId + '" title="Mark as completed" aria-label="Mark as completed"><i class="bi bi-check2-circle"></i></button>' : '') +
                        '<button type="button" class="btn btn-sm" data-act="edit" data-id="' + a.ActivityId + '" title="Edit" aria-label="Edit activity"><i class="bi bi-pencil"></i></button>' +
                        '<button type="button" class="btn btn-sm text-danger" data-act="delete" data-id="' + a.ActivityId + '" title="Delete" aria-label="Delete activity"><i class="bi bi-trash"></i></button>';
                }
            }
        ]
    });

    function search(keepPage) {
        var rows = ActivityService.list({
            type: $('#type').val(), status: $('#status').val(), from: $('#from').val(), to: $('#to').val(),
            assignedTo: $('#assignedTo').val()
        }).data;
        rowsById = {};
        $.each(rows, function (i, a) { rowsById[a.ActivityId] = a; });
        if (keepPage) { grid.reload(rows); } else { grid.setRows(rows); }
    }

    $('#filterForm').on('input change', function () { search(); })
        .on('submit', function (e) { e.preventDefault(); })
        .on('reset', function () { setTimeout(search, 0); });

    // ---- form ----
    var $form = $('#activityForm');
    App.fillSelect($('#ActivityType'), Config.activityTypes);
    App.fillSelect($('#Status'), Config.activityStatuses);
    App.ownerSelect($('#AssignedTo'), 'Select user');

    // customers and leads in one box, grouped
    var related = '<option value="">Not linked</option><optgroup label="Customers">';
    $.each(CustomerService.lookup(), function (i, c) { related += '<option value="C:' + c.value + '">' + App.esc(c.text) + '</option>'; });
    related += '</optgroup><optgroup label="Leads">';
    $.each(LeadService.list().data, function (i, l) {
        related += '<option value="L:' + l.LeadId + '">' + App.esc(l.LeadName + (l.CompanyName ? ' - ' + l.CompanyName : '')) + '</option>';
    });
    $('#Related').html(related + '</optgroup>');

    function openForm(activity, type) {
        App.clearErrors($form);
        $form[0].reset();
        editId = activity ? activity.ActivityId : null;
        if (activity) {
            App.fillForm($form, activity);
            $('#activityTitle').text('Edit activity');
        } else {
            $('#ActivityType').val(type || 'Call');
            $('#ActivityDate').val(App.today());
            $('#Status').val(type === 'Task' ? 'Planned' : 'Completed');
            $('#activityTitle').text('Log ' + (type || 'call').toLowerCase());
        }
        if (me.Role === 'SalesExecutive') { $('#AssignedTo').val(me.UserId); }
        bootstrap.Modal.getOrCreateInstance('#activityModal').show();
    }

    $('[data-new]').on('click', function () { openForm(null, $(this).data('new')); });

    $form.on('submit', function (e) {
        e.preventDefault();
        App.clearErrors($form);
        if (!$form.valid()) { return; }
        var dto = App.formData($form);
        var r = editId ? ActivityService.update(editId, dto) : ActivityService.create(dto);
        if (!r.ok) { App.showErrors($form, r); return; }
        bootstrap.Modal.getInstance('#activityModal').hide();
        App.toast(editId ? 'Activity was updated.' : 'Activity was saved.');
        search(!!editId);
    });

    $('#activityGrid').on('click', '[data-act]', function () {
        var a = rowsById[$(this).data('id')], act = $(this).data('act');
        if (!a) { return; }
        if (act === 'edit') { openForm(a); }
        if (act === 'complete') {
            var r = ActivityService.complete(a.ActivityId);
            if (!r.ok) { App.toast(r.message, 'danger'); return; }
            App.toast('Activity marked as completed.');
            search(true);
        }
        if (act === 'delete') {
            App.confirm({ title: 'Delete activity', message: 'Delete "' + a.Subject + '"? This cannot be undone.' }, function () {
                var res = ActivityService.remove(a.ActivityId);
                if (!res.ok) { App.toast(res.message, 'danger'); return; }
                App.toast('Activity deleted.');
                search(true);
            });
        }
    });

    search();
});
