// Customers: list, create / edit form and details page.

App.page(function (me) {

    var canDelete = me.Role !== 'SalesExecutive';

    function removeCustomer(c, done) {
        App.confirm({
            title: 'Delete customer',
            message: 'Delete ' + c.CustomerName + ' (' + c.CustomerCode + ')? Follow-ups and activities of this customer are deleted as well. This cannot be undone.'
        }, function () {
            var r = CustomerService.remove(c.CustomerId);
            if (!r.ok) { App.toast(r.message, 'danger'); return; }
            done();
        });
    }

    // ---------------- list ----------------
    if ($('#customerGrid').length) {
        var scope = { Admin: 'All customers', Manager: 'Customers assigned to you and your team', SalesExecutive: 'Customers assigned to you' };
        $('#scopeText').text(scope[me.Role]);

        App.fillSelect($('#status'), Config.customerStatuses, 'All');
        App.fillSelect($('#assignedTo'), Svc.owners(true), 'Everyone');
        if (me.Role === 'SalesExecutive') { $('#ownerFilter').addClass('d-none'); }

        var rowsById = {};

        var grid = App.grid({
            el: '#customerGrid',
            sortBy: 0, sortDir: 'desc',
            empty: 'No customers match the search.',
            columns: [
                { title: 'Code', sort: 'CustomerId', render: function (c) { return '<span class="code">' + App.esc(c.CustomerCode) + '</span>'; } },
                {
                    title: 'Customer', sort: 'CustomerName', render: function (c) {
                        return '<a href="Details.html?id=' + c.CustomerId + '">' + App.esc(c.CustomerName) + '</a>' +
                            '<span class="sub">' + App.esc(c.CompanyName) + '</span>';
                    }
                },
                {
                    title: 'Contact', sort: 'Email', render: function (c) {
                        return App.esc(c.Email) + '<span class="sub num">' + App.esc(c.Phone) + '</span>';
                    }
                },
                { title: 'City', key: 'City', sort: true },
                { title: 'Status', sort: 'Status', render: function (c) { return App.tag(c.Status); } },
                { title: 'Assigned To', key: 'AssignedToName', sort: true },
                { title: 'Created', sort: 'CreatedDate', render: function (c) { return App.fmtDate(c.CreatedDate); } },
                {
                    title: '', cls: 'row-actions', render: function (c) {
                        return '<a class="btn btn-sm" href="Details.html?id=' + c.CustomerId + '" title="View" aria-label="View ' + App.esc(c.CustomerName) + '"><i class="bi bi-eye"></i></a>' +
                            '<a class="btn btn-sm" href="Edit.html?id=' + c.CustomerId + '" title="Edit" aria-label="Edit ' + App.esc(c.CustomerName) + '"><i class="bi bi-pencil"></i></a>' +
                            (canDelete ? '<button type="button" class="btn btn-sm text-danger" data-delete="' + c.CustomerId + '" title="Delete" aria-label="Delete ' + App.esc(c.CustomerName) + '"><i class="bi bi-trash"></i></button>' : '');
                    }
                }
            ]
        });

        var search = function (keepPage) {
            var rows = CustomerService.list({ q: $('#q').val(), status: $('#status').val(), assignedTo: $('#assignedTo').val() }).data;
            rowsById = {};
            $.each(rows, function (i, c) { rowsById[c.CustomerId] = c; });
            if (keepPage) { grid.reload(rows); } else { grid.setRows(rows); }
        };

        $('#filterForm').on('input change', function () { search(); })
            .on('submit', function (e) { e.preventDefault(); })
            .on('reset', function () { setTimeout(search, 0); });

        $('#customerGrid').on('click', '[data-delete]', function () {
            var c = rowsById[$(this).data('delete')];
            removeCustomer(c, function () {
                App.toast(c.CustomerName + ' was deleted.');
                search(true);
            });
        });

        search();
    }

    // ---------------- create / edit ----------------
    var $form = $('#customerForm');
    if ($form.length) {
        var editing = $form.data('mode') === 'edit';
        var id = Number(App.qs('id'));

        App.fillSelect($('#State'), Config.states, 'Select state');
        App.fillSelect($('#Status'), Config.customerStatuses);
        App.ownerSelect($('#AssignedTo'), 'Select user');

        if (editing) {
            var r = CustomerService.get(id);
            if (!r.ok) {
                App.flash(r.message, 'danger');
                App.go('Customers/Index.html');
                return;
            }
            App.fillForm($form, r.data);
            $('#pageTitle').text('Edit ' + r.data.CustomerName);
            $('#cancelLink').attr('href', 'Details.html?id=' + id);
        }

        $form.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($form);
            if (!$form.valid()) { return; }

            var dto = App.formData($form);
            var result = editing ? CustomerService.update(id, dto) : CustomerService.create(dto);
            if (!result.ok) { App.showErrors($form, result); return; }

            App.flash(editing ? 'Customer was updated.' : 'Customer ' + result.data.CustomerCode + ' was created.');
            App.go('Customers/Details.html?id=' + result.data.CustomerId);
        });
    }

    // ---------------- details ----------------
    if ($('#customerDetails').length) {
        var cid = Number(App.qs('id'));
        var res = CustomerService.get(cid);
        if (!res.ok) {
            App.flash(res.message, 'danger');
            App.go('Customers/Index.html');
            return;
        }
        var c = res.data;

        document.title = c.CustomerName + ' - AcxiomCRM';
        $('#crumb').text(c.CustomerName);
        $('#dName').text(c.CustomerName);
        $('#dStatus').html(App.tag(c.Status));
        $('#dSub').text(c.CompanyName || '');
        $('#dCode').text(c.CustomerCode);
        $('#dCompany').text(c.CompanyName || '-');
        $('#dEmail').html('<a href="mailto:' + App.esc(c.Email) + '">' + App.esc(c.Email) + '</a>');
        $('#dPhone').text(c.Phone);
        $('#dAddress').text($.grep([c.Address, c.City, c.State], function (x) { return x; }).join(', ') || '-');
        $('#dOwner').text(c.AssignedToName);
        $('#dCreated').text(App.fmtDate(c.CreatedDate) + ' by ' + c.CreatedByName);
        $('#dModified').text(c.ModifiedDate ? App.fmtDateTime(c.ModifiedDate) : '-');
        $('#dNotes').text(c.Notes || 'No notes.').toggleClass('text-muted', !c.Notes);

        $('#editLink').attr('href', 'Edit.html?id=' + cid);
        $('#followUpLink').attr('href', App.url('FollowUps/Index.html?for=Customer&id=' + cid));
        $('#opportunityLink').attr('href', App.url('Opportunities/Create.html?customerId=' + cid));

        var opps = OpportunityService.list({ customerId: cid }).data;
        $('#nOpps').text('(' + opps.length + ')');
        $('#tabOpps').html(App.simpleTable([
            { title: 'Opportunity', render: function (o) { return '<a href="' + App.url('Opportunities/Details.html?id=' + o.OpportunityId) + '">' + App.esc(o.OpportunityName) + '</a>'; } },
            { title: 'Stage', render: function (o) { return App.tag(o.Stage); } },
            { title: 'Amount', cls: 'text-end num', render: function (o) { return App.money(o.Amount); } },
            { title: 'Expected close', render: function (o) { return App.fmtDate(o.ExpectedCloseDate); } },
            { title: 'Owner', key: 'AssignedToName' }
        ], opps, 'No opportunities for this customer yet.'));

        var follow = FollowUpService.list({ customerId: cid }).data;
        follow.sort(function (a, b) { return a.FollowUpDate < b.FollowUpDate ? 1 : -1; });
        $('#nFollow').text('(' + follow.length + ')');
        $('#tabFollow').html(App.simpleTable([
            { title: 'Date', render: function (f) { return App.fmtDate(f.FollowUpDate); } },
            { title: 'Subject', key: 'Subject' },
            { title: 'Type', key: 'FollowUpType' },
            { title: 'Assigned To', key: 'AssignedToName' },
            { title: 'Status', render: function (f) { return App.tag(f.DisplayStatus); } }
        ], follow, 'No follow-ups for this customer yet.'));

        var acts = ActivityService.list({ customerId: cid }).data;
        acts.sort(function (a, b) { return a.ActivityDate < b.ActivityDate ? 1 : -1; });
        $('#nActs').text('(' + acts.length + ')');
        $('#tabActs').html(App.simpleTable([
            { title: 'Date', render: function (a) { return App.fmtDate(a.ActivityDate); } },
            { title: 'Type', key: 'ActivityType' },
            { title: 'Subject', render: function (a) { return App.esc(a.Subject) + (a.Description ? '<span class="sub">' + App.esc(a.Description) + '</span>' : ''); } },
            { title: 'Assigned To', key: 'AssignedToName' },
            { title: 'Status', render: function (a) { return App.tag(a.Status); } }
        ], acts, 'No activities for this customer yet.'));

        $('#history').html(App.timeline(Audit.forRecord('Customer', cid)));

        if (canDelete) {
            $('#deleteButton').removeClass('d-none').on('click', function () {
                removeCustomer(c, function () {
                    App.flash(c.CustomerName + ' was deleted.');
                    App.go('Customers/Index.html');
                });
            });
        }
    }
});
