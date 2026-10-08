// Leads: list, create / edit form, details with status workflow and conversion.

App.page(function (me) {

    var canDelete = me.Role !== 'SalesExecutive';

    function removeLead(l, done) {
        App.confirm({
            title: 'Delete lead',
            message: 'Delete ' + l.LeadName + ' (' + l.LeadCode + ')? Follow-ups and activities of this lead are deleted as well. This cannot be undone.'
        }, function () {
            var r = LeadService.remove(l.LeadId);
            if (!r.ok) { App.toast(r.message, 'danger'); return; }
            done();
        });
    }

    // ---------------- list ----------------
    if ($('#leadGrid').length) {
        var scope = { Admin: 'All leads', Manager: 'Leads assigned to you and your team', SalesExecutive: 'Leads assigned to you' };
        $('#scopeText').text(scope[me.Role]);

        App.fillSelect($('#status'), Config.leadStatuses, 'All');
        App.fillSelect($('#source'), Config.leadSources, 'All');
        App.fillSelect($('#assignedTo'), Svc.owners(true), 'Everyone');
        if (me.Role === 'SalesExecutive') { $('#ownerFilter').addClass('d-none'); }
        if (App.qs('status')) { $('#status').val(App.qs('status')); }

        var rowsById = {};

        var grid = App.grid({
            el: '#leadGrid',
            sortBy: 0, sortDir: 'desc',
            empty: 'No leads match the search.',
            columns: [
                { title: 'Code', sort: 'LeadId', render: function (l) { return '<span class="code">' + App.esc(l.LeadCode) + '</span>'; } },
                {
                    title: 'Lead', sort: 'LeadName', render: function (l) {
                        return '<a href="Details.html?id=' + l.LeadId + '">' + App.esc(l.LeadName) + '</a>' +
                            '<span class="sub">' + App.esc(l.CompanyName) + '</span>';
                    }
                },
                { title: 'Source', key: 'Source', sort: true },
                { title: 'Status', sort: 'Status', render: function (l) { return App.tag(l.Status); } },
                { title: 'Priority', sort: function (l) { return $.inArray(l.Priority, Config.leadPriorities); }, render: function (l) { return App.tag(l.Priority); } },
                { title: 'Expected value', sort: 'ExpectedValue', cls: 'text-end num', render: function (l) { return App.money(l.ExpectedValue); } },
                { title: 'Assigned To', key: 'AssignedToName', sort: true },
                { title: 'Created', sort: 'CreatedDate', render: function (l) { return App.fmtDate(l.CreatedDate); } },
                {
                    title: '', cls: 'row-actions', render: function (l) {
                        var locked = l.Status === 'Converted';
                        return '<a class="btn btn-sm" href="Details.html?id=' + l.LeadId + '" title="View" aria-label="View ' + App.esc(l.LeadName) + '"><i class="bi bi-eye"></i></a>' +
                            (locked ? '' : '<a class="btn btn-sm" href="Edit.html?id=' + l.LeadId + '" title="Edit" aria-label="Edit ' + App.esc(l.LeadName) + '"><i class="bi bi-pencil"></i></a>') +
                            (canDelete && !locked ? '<button type="button" class="btn btn-sm text-danger" data-delete="' + l.LeadId + '" title="Delete" aria-label="Delete ' + App.esc(l.LeadName) + '"><i class="bi bi-trash"></i></button>' : '');
                    }
                }
            ]
        });

        var search = function (keepPage) {
            var rows = LeadService.list({
                q: $('#q').val(), status: $('#status').val(), source: $('#source').val(), assignedTo: $('#assignedTo').val()
            }).data;
            rowsById = {};
            $.each(rows, function (i, l) { rowsById[l.LeadId] = l; });
            if (keepPage) { grid.reload(rows); } else { grid.setRows(rows); }
        };

        $('#filterForm').on('input change', function () { search(); })
            .on('submit', function (e) { e.preventDefault(); })
            .on('reset', function () { setTimeout(search, 0); });

        $('#leadGrid').on('click', '[data-delete]', function () {
            var l = rowsById[$(this).data('delete')];
            removeLead(l, function () {
                App.toast(l.LeadName + ' was deleted.');
                search(true);
            });
        });

        search();
    }

    // ---------------- create / edit ----------------
    var $form = $('#leadForm');
    if ($form.length) {
        var editing = $form.data('mode') === 'edit';
        var id = Number(App.qs('id'));

        App.fillSelect($('#Source'), Config.leadSources, 'Select source');
        App.fillSelect($('#Priority'), Config.leadPriorities);
        $('#Priority').val('Medium');
        App.ownerSelect($('#AssignedTo'), 'Select user');

        if (editing) {
            var r = LeadService.get(id);
            if (!r.ok) {
                App.flash(r.message, 'danger');
                App.go('Leads/Index.html');
                return;
            }
            var lead = r.data;
            if (lead.Status === 'Converted') {
                App.flash('A converted lead cannot be changed.', 'warning');
                App.go('Leads/Details.html?id=' + id);
                return;
            }
            // only the current status and the statuses it can move to
            var next = $.grep(lead.NextStatuses, function (s) { return s !== 'Converted'; });
            App.fillSelect($('#Status'), [lead.Status].concat(next));
            $('#statusHelp').text(next.length ? 'From ' + lead.Status + ' a lead can move to ' + next.join(', ') + '.' : 'This status is final.');
            App.fillForm($form, lead);
            $('#pageTitle').text('Edit ' + lead.LeadName);
            $('#cancelLink').attr('href', 'Details.html?id=' + id);
        } else {
            App.fillSelect($('#Status'), ['New']);
            $('#Status').prop('disabled', true);
            $('#statusHelp').text('A new lead always starts as New.');
        }

        $form.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($form);
            if (!$form.valid()) { return; }

            var dto = App.formData($form);
            var result = editing ? LeadService.update(id, dto) : LeadService.create(dto);
            if (!result.ok) { App.showErrors($form, result); return; }

            App.flash(editing ? 'Lead was updated.' : 'Lead ' + result.data.LeadCode + ' was created.');
            App.go('Leads/Details.html?id=' + result.data.LeadId);
        });
    }

    // ---------------- details ----------------
    if ($('#leadDetails').length) {
        var lid = Number(App.qs('id'));
        var res = LeadService.get(lid);
        if (!res.ok) {
            App.flash(res.message, 'danger');
            App.go('Leads/Index.html');
            return;
        }
        var l = res.data;

        document.title = l.LeadName + ' - AcxiomCRM';
        $('#crumb').text(l.LeadName);
        $('#dName').text(l.LeadName);
        $('#dStatus').html(App.tag(l.Status));
        $('#dSub').text(l.CompanyName || '');
        $('#dCode').text(l.LeadCode);
        $('#dCompany').text(l.CompanyName || '-');
        $('#dEmail').html('<a href="mailto:' + App.esc(l.Email) + '">' + App.esc(l.Email) + '</a>');
        $('#dPhone').text(l.Phone);
        $('#dSource').text(l.Source);
        $('#dPriority').html(App.tag(l.Priority));
        $('#dValue').text(App.money(l.ExpectedValue));
        $('#dOwner').text(l.AssignedToName);
        $('#dCreated').text(App.fmtDate(l.CreatedDate));
        $('#dNotes').text(l.Notes || 'No notes.').toggleClass('text-muted', !l.Notes);

        $('#followUpLink').attr('href', App.url('FollowUps/Index.html?for=Lead&id=' + lid));
        $('#editLink').attr('href', 'Edit.html?id=' + lid).toggleClass('d-none', l.Status === 'Converted');

        // status tracker: New > Contacted > Qualified > Converted, or the closing status when the lead dropped out
        var path = ['New', 'Contacted', 'Qualified', 'Converted'];
        var dropped = l.Status === 'Lost' || l.Status === 'Unqualified';
        if (dropped) { path[3] = l.Status; }
        var at = $.inArray(l.Status, path);
        $('#steps').html($.map(path, function (s, i) {
            var cls = '';
            if (dropped) { cls = i === 3 ? 'current end-bad' : ''; }
            else if (i < at) { cls = 'done'; }
            else if (i === at) { cls = 'current' + (s === 'Converted' ? ' end-good' : ''); }
            return '<li class="' + cls + '"' + (cls.indexOf('current') >= 0 ? ' aria-current="step"' : '') + '>' + s + '</li>';
        }).join(''));

        var moves = $.grep(l.NextStatuses, function (s) { return s !== 'Converted'; });
        if (l.Status === 'Converted') {
            var cust = Store.find('customers', l.ConvertedCustomerId);
            var opp = $.grep(OpportunityService.list().data, function (o) { return o.LeadId === lid; })[0];
            $('#nextText').html('Converted on ' + App.fmtDate(l.ConvertedDate) + '.' +
                (cust && Auth.inScope(cust.AssignedTo) ? ' Customer: <a href="' + App.url('Customers/Details.html?id=' + cust.CustomerId) + '">' + App.esc(cust.CustomerName) + '</a>.' : '') +
                (opp ? ' Opportunity: <a href="' + App.url('Opportunities/Details.html?id=' + opp.OpportunityId) + '">' + App.esc(opp.OpportunityName) + '</a>.' : ''));
        } else if (!moves.length && l.Status !== 'Qualified') {
            $('#nextText').text('This lead is closed as ' + l.Status + '.');
        } else {
            $('#nextText').text(l.Status === 'Qualified' ? 'Convert this lead, or move it to' : 'Move this lead to');
            $('#nextButtons').html($.map(moves, function (s) {
                var bad = s === 'Lost' || s === 'Unqualified';
                return '<button type="button" class="btn btn-sm ' + (bad ? 'btn-light border' : 'btn-outline-primary') + '" data-status="' + s + '">' +
                    s + '</button>';
            }).join(''));
        }

        $('#nextButtons').on('click', '[data-status]', function () {
            var status = $(this).data('status');
            var move = function () {
                var r = LeadService.changeStatus(lid, status);
                if (!r.ok) { App.toast(r.message, 'danger'); return; }
                App.flash('Lead moved to ' + status + '.');
                window.location.reload();
            };
            if (status === 'Lost') {
                App.confirm({ title: 'Mark lead as Lost', message: 'A lost lead is closed and cannot be reopened. Continue?', yes: 'Mark as Lost' }, move);
            } else { move(); }
        });

        var follow = FollowUpService.list({ leadId: lid }).data;
        follow.sort(function (a, b) { return a.FollowUpDate < b.FollowUpDate ? 1 : -1; });
        $('#nFollow').text('(' + follow.length + ')');
        $('#tabFollow').html(App.simpleTable([
            { title: 'Date', render: function (f) { return App.fmtDate(f.FollowUpDate); } },
            { title: 'Subject', key: 'Subject' },
            { title: 'Type', key: 'FollowUpType' },
            { title: 'Assigned To', key: 'AssignedToName' },
            { title: 'Status', render: function (f) { return App.tag(f.DisplayStatus); } }
        ], follow, 'No follow-ups for this lead yet.'));

        var acts = ActivityService.list({ leadId: lid }).data;
        acts.sort(function (a, b) { return a.ActivityDate < b.ActivityDate ? 1 : -1; });
        $('#nActs').text('(' + acts.length + ')');
        $('#tabActs').html(App.simpleTable([
            { title: 'Date', render: function (a) { return App.fmtDate(a.ActivityDate); } },
            { title: 'Type', key: 'ActivityType' },
            { title: 'Subject', render: function (a) { return App.esc(a.Subject) + (a.Description ? '<span class="sub">' + App.esc(a.Description) + '</span>' : ''); } },
            { title: 'Assigned To', key: 'AssignedToName' },
            { title: 'Status', render: function (a) { return App.tag(a.Status); } }
        ], acts, 'No activities for this lead yet.'));

        $('#history').html(App.timeline(Audit.forRecord('Lead', lid)));

        if (canDelete && l.Status !== 'Converted') {
            $('#deleteButton').removeClass('d-none').on('click', function () {
                removeLead(l, function () {
                    App.flash(l.LeadName + ' was deleted.');
                    App.go('Leads/Index.html');
                });
            });
        }

        // ---- conversion ----
        var $convert = $('#convertForm');
        if (l.Status === 'Qualified') {
            $('#convertButton').removeClass('d-none').on('click', function () {
                App.clearErrors($convert);
                $('#convertText').text('A customer record will be created for ' + l.LeadName +
                    (l.CompanyName ? ' (' + l.CompanyName + ')' : '') + ' using the email and phone of this lead. ' +
                    'If a customer with the same email or phone already exists, that customer is used.');
                $('#CreateOpportunity').prop('checked', true).trigger('change');
                $('#OpportunityName').val((l.CompanyName || l.LeadName) + ' - new requirement');
                $('#Amount').val(l.ExpectedValue || '');
                $('#Probability').val(Config.stageProbability.Qualification);
                $('#ExpectedCloseDate').val(App.addDays(App.today(), 30));
                bootstrap.Modal.getOrCreateInstance('#convertModal').show();
            });
        }

        $('#CreateOpportunity').on('change', function () {
            $('#oppFields').toggleClass('d-none', !this.checked).find('input').prop('disabled', !this.checked);
        });

        $convert.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($convert);
            if (!$convert.valid()) { return; }

            var r = LeadService.convert(lid, App.formData($convert));
            if (!r.ok) { App.showErrors($convert, r); return; }

            App.flash(r.data.usedExisting
                ? 'Lead converted. Existing customer ' + r.data.customer.CustomerCode + ' was used.'
                : 'Lead converted to customer ' + r.data.customer.CustomerCode + '.');
            if (r.data.opportunity) { App.go('Opportunities/Details.html?id=' + r.data.opportunity.OpportunityId); }
            else { App.go('Customers/Details.html?id=' + r.data.customer.CustomerId); }
        });
    }
});
