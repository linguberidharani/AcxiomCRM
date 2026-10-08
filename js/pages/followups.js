// Follow-ups: pending list, schedule, complete, reschedule, missed / cancelled.

App.page(function (me) {

    var canDelete = me.Role !== 'SalesExecutive';
    var today = App.today();
    var rowsById = {};
    var current = null;     // follow-up the open dialog is about

    App.fillSelect($('#assignedTo'), Svc.owners(true), 'Everyone');
    if (me.Role === 'SalesExecutive') { $('#ownerFilter').addClass('d-none'); }
    if (App.qs('view') !== null) { $('#status').val(App.qs('view')); }

    var grid = App.grid({
        el: '#followGrid',
        sortBy: 0, sortDir: 'asc',
        empty: 'No follow-ups match the filters.',
        columns: [
            {
                title: 'Date', sort: 'FollowUpDate', render: function (f) {
                    var note = '';
                    if (f.IsOverdue) { note = '<span class="sub text-danger">Overdue</span>'; }
                    else if (f.Status === 'Planned' && f.FollowUpDate === today) { note = '<span class="sub">Today</span>'; }
                    return App.fmtDate(f.FollowUpDate) + note;
                }
            },
            {
                title: 'Subject', sort: 'Subject', render: function (f) {
                    return App.esc(f.Subject) + (f.Remarks ? '<span class="sub notes-text">' + App.esc(f.Remarks) + '</span>' : '');
                }
            },
            { title: 'Type', key: 'FollowUpType', sort: true },
            {
                title: 'Related to', sort: 'RelatedName', render: function (f) {
                    return '<a href="' + App.url(f.RelatedUrl) + '">' + App.esc(f.RelatedName) + '</a><span class="sub">' + f.RelatedType + '</span>';
                }
            },
            { title: 'Assigned To', key: 'AssignedToName', sort: true },
            { title: 'Status', sort: 'DisplayStatus', render: function (f) { return App.tag(f.DisplayStatus); } },
            {
                title: '', cls: 'row-actions', render: function (f) {
                    var html = '';
                    if (f.Status === 'Planned') {
                        html += '<button type="button" class="btn btn-sm" data-act="complete" data-id="' + f.FollowUpId + '" title="Complete" aria-label="Complete follow-up"><i class="bi bi-check2-circle"></i></button>' +
                            '<button type="button" class="btn btn-sm" data-act="reschedule" data-id="' + f.FollowUpId + '" title="Reschedule" aria-label="Reschedule follow-up"><i class="bi bi-calendar-event"></i></button>';
                    }
                    if (f.Status === 'Planned' || canDelete) {
                        html += '<div class="dropdown d-inline-block"><button type="button" class="btn btn-sm" data-bs-toggle="dropdown" aria-expanded="false" aria-label="More actions"><i class="bi bi-three-dots-vertical"></i></button>' +
                            '<ul class="dropdown-menu dropdown-menu-end">';
                        if (f.Status === 'Planned') {
                            html += '<li><button type="button" class="dropdown-item" data-act="Missed" data-id="' + f.FollowUpId + '">Mark as missed</button></li>' +
                                '<li><button type="button" class="dropdown-item" data-act="Cancelled" data-id="' + f.FollowUpId + '">Cancel follow-up</button></li>';
                        }
                        if (canDelete) {
                            html += '<li><button type="button" class="dropdown-item text-danger" data-act="delete" data-id="' + f.FollowUpId + '">Delete</button></li>';
                        }
                        html += '</ul></div>';
                    }
                    return html;
                }
            }
        ]
    });

    function search(keepPage) {
        var rows = FollowUpService.list({
            status: $('#status').val(), from: $('#from').val(), to: $('#to').val(),
            assignedTo: $('#assignedTo').val(), q: $('#q').val()
        }).data;
        rowsById = {};
        $.each(rows, function (i, f) { rowsById[f.FollowUpId] = f; });
        if (keepPage) { grid.reload(rows); } else { grid.setRows(rows); }

        var all = FollowUpService.list().data;
        var pending = $.grep(all, function (f) { return f.Status === 'Planned'; }).length;
        var overdue = $.grep(all, function (f) { return f.IsOverdue; }).length;
        var dueToday = $.grep(all, function (f) { return f.Status === 'Planned' && f.FollowUpDate === today; }).length;
        $('#countText').text(pending + ' pending, ' + dueToday + ' due today, ' + overdue + ' overdue');
    }

    $('#filterForm').on('input change', function () { search(); })
        .on('submit', function (e) { e.preventDefault(); })
        .on('reset', function () { setTimeout(search, 0); });

    // ---- schedule ----
    var $follow = $('#followForm');
    var records = {
        Customer: $.grep(CustomerService.lookup(), function (c) { return c.status === 'Active'; }),
        Lead: $.map($.grep(LeadService.list().data, function (l) { return l.Status !== 'Converted' && l.Status !== 'Lost'; }), function (l) {
            return { value: l.LeadId, text: l.LeadName + (l.CompanyName ? ' - ' + l.CompanyName : ''), owner: l.AssignedTo };
        }),
        Opportunity: $.map($.grep(OpportunityService.list().data, function (o) { return o.IsOpen; }), function (o) {
            return { value: o.OpportunityId, text: o.OpportunityName + ' - ' + o.CustomerName, owner: o.AssignedTo };
        })
    };

    App.fillSelect($('#FollowUpType'), Config.followUpTypes);
    App.ownerSelect($('#AssignedTo'), 'Select user');

    function fillRecords() {
        var type = $('#RelatedType').val();
        $('#relatedLabel').text(type);
        App.fillSelect($('#RelatedId'), records[type], 'Select ' + type.toLowerCase());
    }

    $('#RelatedType').on('change', fillRecords);

    // a manager scheduling for a record gets the record's owner suggested
    $('#RelatedId').on('change', function () {
        if (me.Role === 'SalesExecutive') { return; }
        var type = $('#RelatedType').val(), id = Number(this.value), owner = null;
        if (type === 'Customer') { var c = Store.find('customers', id); owner = c ? c.AssignedTo : null; }
        else { $.each(records[type], function (i, r) { if (r.value === id) { owner = r.owner; } }); }
        if (owner && $('#AssignedTo option[value="' + owner + '"]').length) { $('#AssignedTo').val(owner).trigger('change'); }
    });

    function openSchedule(type, id) {
        App.clearErrors($follow);
        $follow[0].reset();
        if (me.Role === 'SalesExecutive') { $('#AssignedTo').val(me.UserId); }
        $('#RelatedType').val(type || 'Customer');
        fillRecords();
        if (id) { $('#RelatedId').val(id).trigger('change'); }
        $('#FollowUpDate').val(App.addDays(today, 1));
        bootstrap.Modal.getOrCreateInstance('#followModal').show();
    }

    $('#newButton').on('click', function () { openSchedule(); });

    $follow.on('submit', function (e) {
        e.preventDefault();
        App.clearErrors($follow);
        if (!$follow.valid()) { return; }
        var r = FollowUpService.create(App.formData($follow));
        if (!r.ok) { App.showErrors($follow, r); return; }
        bootstrap.Modal.getInstance('#followModal').hide();
        App.toast('Follow-up scheduled for ' + App.fmtDate(r.data.FollowUpDate) + '.');
        search(true);
    });

    // ---- complete ----
    var $complete = $('#completeForm');
    $complete.on('submit', function (e) {
        e.preventDefault();
        App.clearErrors($complete);
        if (!$complete.valid()) { return; }
        var r = FollowUpService.complete(current.FollowUpId, App.formData($complete));
        if (!r.ok) { App.showErrors($complete, r); return; }
        bootstrap.Modal.getInstance('#completeModal').hide();
        App.toast('Follow-up completed' + (r.data.next ? '. Next one is on ' + App.fmtDate(r.data.next.FollowUpDate) + '.' : ' and logged as an activity.'));
        search(true);
    });

    // ---- reschedule ----
    var $reschedule = $('#rescheduleForm');
    $reschedule.on('submit', function (e) {
        e.preventDefault();
        App.clearErrors($reschedule);
        if (!$reschedule.valid()) { return; }
        var r = FollowUpService.reschedule(current.FollowUpId, App.formData($reschedule));
        if (!r.ok) { App.showErrors($reschedule, r); return; }
        bootstrap.Modal.getInstance('#rescheduleModal').hide();
        App.toast('Follow-up moved to ' + App.fmtDate(r.data.FollowUpDate) + '.');
        search(true);
    });

    // ---- row buttons ----
    $('#followGrid').on('click', '[data-act]', function () {
        var act = $(this).data('act');
        current = rowsById[$(this).data('id')];
        if (!current) { return; }
        var what = current.Subject + ' with ' + current.RelatedName + ', ' + App.fmtDate(current.FollowUpDate);

        if (act === 'complete') {
            App.clearErrors($complete);
            $complete[0].reset();
            $('#completeText').text(what);
            bootstrap.Modal.getOrCreateInstance('#completeModal').show();
        } else if (act === 'reschedule') {
            App.clearErrors($reschedule);
            $reschedule[0].reset();
            $('#rescheduleText').text(what);
            bootstrap.Modal.getOrCreateInstance('#rescheduleModal').show();
        } else if (act === 'delete') {
            App.confirm({ title: 'Delete follow-up', message: 'Delete "' + current.Subject + '"? This cannot be undone.' }, function () {
                var r = FollowUpService.remove(current.FollowUpId);
                if (!r.ok) { App.toast(r.message, 'danger'); return; }
                App.toast('Follow-up deleted.');
                search(true);
            });
        } else {
            var missed = act === 'Missed';
            App.confirm({
                title: missed ? 'Mark as missed' : 'Cancel follow-up',
                message: (missed ? 'Mark "' : 'Cancel "') + current.Subject + '"' + (missed ? ' as missed?' : '?'),
                yes: missed ? 'Mark as missed' : 'Cancel follow-up', no: missed ? 'Cancel' : 'Keep it', danger: false
            }, function () {
                var r = FollowUpService.close(current.FollowUpId, act);
                if (!r.ok) { App.toast(r.message, 'danger'); return; }
                App.toast('Follow-up marked ' + act.toLowerCase() + '.');
                search(true);
            });
        }
    });

    search();

    // opened from a customer, lead or opportunity page: ?for=Lead&id=5
    var forType = App.qs('for');
    if (forType && records[forType]) {
        $('#status').val('');
        search();
        openSchedule(forType, Number(App.qs('id')));
    }
});
