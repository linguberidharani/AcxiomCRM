// Opportunities: list, create / edit form, details and the pipeline board.

App.page(function (me) {

    var canDelete = me.Role !== 'SalesExecutive';

    // ---- Mark as Won / Lost dialog, used on Details and on the Pipeline board ----
    var $close = $('#closeForm');
    var closing = null;     // { opp, stage, done }

    function askOutcome(opp, stage, done) {
        closing = { opp: opp, stage: stage, done: done };
        App.clearErrors($close);
        var won = stage === 'Won';
        $('#closeTitle').text('Mark as ' + stage);
        $('#closeText').text(opp.OpportunityName + ' (' + App.money(opp.Amount) + ') will be closed as ' + stage + '. A closed opportunity cannot be edited.');
        $('#outcomeLabel').text(won ? 'Outcome (optional)' : 'Reason for losing').toggleClass('required', !won);
        $('#Outcome').val('');
        $('#closeSubmit').text('Mark as ' + stage).attr('class', 'btn ' + (won ? 'btn-success' : 'btn-danger'));
        bootstrap.Modal.getOrCreateInstance('#closeModal').show();
    }

    $close.on('submit', function (e) {
        e.preventDefault();
        App.clearErrors($close);
        if (!$close.valid()) { return; }
        var r = OpportunityService.moveStage(closing.opp.OpportunityId, closing.stage, $('#Outcome').val());
        if (!r.ok) { App.showErrors($close, r); return; }
        bootstrap.Modal.getInstance('#closeModal').hide();
        closing.done(r.data);
    });

    function moveTo(opp, stage, done) {
        if (stage === 'Won' || stage === 'Lost') { askOutcome(opp, stage, done); return; }
        var r = OpportunityService.moveStage(opp.OpportunityId, stage);
        if (!r.ok) { App.toast(r.message, 'danger'); return; }
        done(r.data);
    }

    function removeOpp(o, done) {
        App.confirm({
            title: 'Delete opportunity',
            message: 'Delete ' + o.OpportunityName + '? This cannot be undone.'
        }, function () {
            var r = OpportunityService.remove(o.OpportunityId);
            if (!r.ok) { App.toast(r.message, 'danger'); return; }
            done();
        });
    }

    // ---------------- list ----------------
    if ($('#oppGrid').length) {
        App.fillSelect($('#stage'), Config.stages, 'All');
        App.fillSelect($('#assignedTo'), Svc.owners(true), 'Everyone');
        if (me.Role === 'SalesExecutive') { $('#ownerFilter').addClass('d-none'); }
        if (App.qs('stage')) { $('#stage').val(App.qs('stage')); }

        var rowsById = {};

        var grid = App.grid({
            el: '#oppGrid',
            sortBy: 5, sortDir: 'asc',
            empty: 'No opportunities match the search.',
            columns: [
                {
                    title: 'Opportunity', sort: 'OpportunityName', render: function (o) {
                        return '<a href="Details.html?id=' + o.OpportunityId + '">' + App.esc(o.OpportunityName) + '</a>' +
                            '<span class="sub">' + App.esc(o.CustomerName) + (o.CompanyName ? ', ' + App.esc(o.CompanyName) : '') + '</span>';
                    }
                },
                { title: 'Stage', sort: function (o) { return $.inArray(o.Stage, Config.stages); }, render: function (o) { return App.tag(o.Stage); } },
                { title: 'Amount', sort: 'Amount', cls: 'text-end num', render: function (o) { return App.money(o.Amount); } },
                { title: 'Probability', sort: 'Probability', cls: 'text-end num', render: function (o) { return o.Probability + '%'; } },
                { title: 'Weighted', sort: 'WeightedAmount', cls: 'text-end num', render: function (o) { return App.money(o.WeightedAmount); } },
                {
                    title: 'Expected close', sort: 'ExpectedCloseDate', render: function (o) {
                        return App.fmtDate(o.ExpectedCloseDate) + (o.IsOverdue ? '<span class="sub text-danger">Past due</span>' : '');
                    }
                },
                { title: 'Assigned To', key: 'AssignedToName', sort: true },
                {
                    title: '', cls: 'row-actions', render: function (o) {
                        return '<a class="btn btn-sm" href="Details.html?id=' + o.OpportunityId + '" title="View" aria-label="View ' + App.esc(o.OpportunityName) + '"><i class="bi bi-eye"></i></a>' +
                            (o.IsOpen ? '<a class="btn btn-sm" href="Edit.html?id=' + o.OpportunityId + '" title="Edit" aria-label="Edit ' + App.esc(o.OpportunityName) + '"><i class="bi bi-pencil"></i></a>' : '') +
                            (canDelete ? '<button type="button" class="btn btn-sm text-danger" data-delete="' + o.OpportunityId + '" title="Delete" aria-label="Delete ' + App.esc(o.OpportunityName) + '"><i class="bi bi-trash"></i></button>' : '');
                    }
                }
            ]
        });

        var search = function (keepPage) {
            var rows = OpportunityService.list({
                q: $('#q').val(), stage: $('#stage').val(), status: $('#status').val(), assignedTo: $('#assignedTo').val()
            }).data;
            rowsById = {};
            var total = 0, weighted = 0, open = 0;
            $.each(rows, function (i, o) {
                rowsById[o.OpportunityId] = o;
                if (o.IsOpen) { open++; total += o.Amount; weighted += o.WeightedAmount; }
            });
            $('#totalsText').text(open + ' open, ' + App.moneyShort(total) + ' in pipeline, ' + App.moneyShort(weighted) + ' weighted');
            if (keepPage) { grid.reload(rows); } else { grid.setRows(rows); }
        };

        $('#filterForm').on('input change', function () { search(); })
            .on('submit', function (e) { e.preventDefault(); })
            .on('reset', function () { setTimeout(search, 0); });

        $('#oppGrid').on('click', '[data-delete]', function () {
            var o = rowsById[$(this).data('delete')];
            removeOpp(o, function () {
                App.toast(o.OpportunityName + ' was deleted.');
                search(true);
            });
        });

        search();
    }

    // ---------------- create / edit ----------------
    var $form = $('#oppForm');
    if ($form.length) {
        var editing = $form.data('mode') === 'edit';
        var id = Number(App.qs('id'));

        var customers = $.grep(CustomerService.lookup(), function (c) { return c.status === 'Active'; });
        App.fillSelect($('#Stage'), Config.openStages);
        App.fillSelect($('#Source'), Config.leadSources, 'Not specified');
        App.ownerSelect($('#AssignedTo'), 'Select user');

        var showWeighted = function () {
            var a = Number($('#Amount').val()), p = Number($('#Probability').val());
            var ok = $('#Amount').val() !== '' && $('#Probability').val() !== '' && a > 0 && p >= 0 && p <= 100;
            $('#weighted').text(ok ? App.money(a * p / 100) : '-');
        };

        if (editing) {
            var r = OpportunityService.get(id);
            if (!r.ok) {
                App.flash(r.message, 'danger');
                App.go('Opportunities/Index.html');
                return;
            }
            var opp = r.data;
            if (!opp.IsOpen) {
                App.flash('A closed opportunity cannot be edited.', 'warning');
                App.go('Opportunities/Details.html?id=' + id);
                return;
            }
            // keep the current customer in the list even if it was made inactive later
            if (!$.grep(customers, function (c) { return c.value === opp.CustomerId; }).length) {
                customers.push({ value: opp.CustomerId, text: opp.CustomerName });
            }
            App.fillSelect($('#CustomerId'), customers, 'Select customer');
            App.fillForm($form, opp);
            $('#pageTitle').text('Edit ' + opp.OpportunityName);
            $('#cancelLink').attr('href', 'Details.html?id=' + id);
        } else {
            App.fillSelect($('#CustomerId'), customers, 'Select customer');
            if (App.qs('customerId')) { $('#CustomerId').val(App.qs('customerId')); }
            $('#Probability').val(Config.stageProbability.Qualification);
        }
        showWeighted();

        // picking a stage suggests its usual probability
        $('#Stage').on('change', function () {
            $('#Probability').val(Config.stageProbability[this.value]);
            showWeighted();
        });
        $('#Amount, #Probability').on('input', showWeighted);

        $form.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($form);
            if (!$form.valid()) { return; }

            var dto = App.formData($form);
            var result = editing ? OpportunityService.update(id, dto) : OpportunityService.create(dto);
            if (!result.ok) { App.showErrors($form, result); return; }

            App.flash(editing ? 'Opportunity was updated.' : 'Opportunity was created.');
            App.go('Opportunities/Details.html?id=' + result.data.OpportunityId);
        });
    }

    // ---------------- details ----------------
    if ($('#oppDetails').length) {
        var oid = Number(App.qs('id'));
        var res = OpportunityService.get(oid);
        if (!res.ok) {
            App.flash(res.message, 'danger');
            App.go('Opportunities/Index.html');
            return;
        }
        var o = res.data;

        document.title = o.OpportunityName + ' - AcxiomCRM';
        $('#crumb').text(o.OpportunityName);
        $('#dName').text(o.OpportunityName);
        $('#dStage').html(App.tag(o.Stage));
        $('#dSub').text(o.CustomerName + (o.CompanyName ? ', ' + o.CompanyName : ''));
        $('#dCode').text(o.Code);
        $('#dCustomer').html('<a href="' + App.url('Customers/Details.html?id=' + o.CustomerId) + '">' + App.esc(o.CustomerName) + '</a>');
        $('#dAmount').text(App.money(o.Amount));
        $('#dProbability').text(o.Probability + '%');
        $('#dWeighted').text(App.money(o.WeightedAmount));
        $('#dClose').html(App.fmtDate(o.ExpectedCloseDate) + (o.IsOverdue ? ' <span class="text-danger">(past due)</span>' : ''));
        $('#dStatus').html(App.tag(o.Status));
        $('#dSource').text(o.Source || '-');
        $('#dOwner').text(o.AssignedToName);
        $('#dCreated').text(App.fmtDate(o.CreatedDate));
        $('#dNotes').text(o.Notes || 'No notes.').toggleClass('text-muted', !o.Notes);

        var lead = o.LeadId ? Store.find('leads', o.LeadId) : null;
        if (lead && Auth.inScope(lead.AssignedTo)) {
            $('#dLead').html('<a href="' + App.url('Leads/Details.html?id=' + lead.LeadId) + '">' + App.esc(lead.LeadCode) + '</a>');
        } else { $('#dLead').text('-'); }

        if (!o.IsOpen) {
            $('#outcomePanel').removeClass('d-none');
            $('#dClosed').text('Closed ' + App.fmtDate(o.ClosedDate));
            $('#dOutcome').text(o.Outcome || 'No outcome was recorded.').toggleClass('text-muted', !o.Outcome);
        }

        // stage tracker
        var path = ['Qualification', 'Proposal', 'Negotiation', o.Stage === 'Lost' ? 'Lost' : 'Won'];
        var at = $.inArray(o.Stage, path);
        $('#steps').html($.map(path, function (s, i) {
            var cls = '';
            if (o.Stage === 'Lost') { cls = i === 3 ? 'current end-bad' : ''; }
            else if (i < at) { cls = 'done'; }
            else if (i === at) { cls = 'current' + (s === 'Won' ? ' end-good' : ''); }
            return '<li class="' + cls + '"' + (cls.indexOf('current') >= 0 ? ' aria-current="step"' : '') + '>' + s + '</li>';
        }).join(''));

        var afterMove = function (updated) {
            App.flash(updated.IsOpen ? 'Opportunity moved to ' + updated.Stage + '.' : 'Opportunity marked as ' + updated.Stage + '.');
            window.location.reload();
        };

        if (o.IsOpen) {
            $('#stageText').text('Move to');
            $('#stageButtons').html($.map(Config.openStages, function (s) {
                return s === o.Stage ? '' : '<button type="button" class="btn btn-sm btn-outline-primary" data-stage="' + s + '">' + s + '</button>';
            }).join(''));
            $('#stageButtons').on('click', '[data-stage]', function () { moveTo(o, $(this).data('stage'), afterMove); });
            $('#editLink').removeClass('d-none').attr('href', 'Edit.html?id=' + oid);
            $('#wonButton').removeClass('d-none').on('click', function () { moveTo(o, 'Won', afterMove); });
            $('#lostButton').removeClass('d-none').on('click', function () { moveTo(o, 'Lost', afterMove); });
        } else {
            $('#stageText').text('This opportunity was closed as ' + o.Stage + ' on ' + App.fmtDate(o.ClosedDate) + '.');
        }

        $('#followUpLink').attr('href', App.url('FollowUps/Index.html?for=Opportunity&id=' + oid));

        var follow = FollowUpService.list({ opportunityId: oid }).data;
        follow.sort(function (a, b) { return a.FollowUpDate < b.FollowUpDate ? 1 : -1; });
        $('#nFollow').text('(' + follow.length + ')');
        $('#tabFollow').html(App.simpleTable([
            { title: 'Date', render: function (f) { return App.fmtDate(f.FollowUpDate); } },
            { title: 'Subject', render: function (f) { return App.esc(f.Subject) + (f.Remarks ? '<span class="sub">' + App.esc(f.Remarks) + '</span>' : ''); } },
            { title: 'Type', key: 'FollowUpType' },
            { title: 'Assigned To', key: 'AssignedToName' },
            { title: 'Status', render: function (f) { return App.tag(f.DisplayStatus); } }
        ], follow, 'No follow-ups for this opportunity yet.'));

        $('#history').html(App.timeline(Audit.forRecord('Opportunity', oid)));

        if (canDelete) {
            $('#deleteButton').removeClass('d-none').on('click', function () {
                removeOpp(o, function () {
                    App.flash(o.OpportunityName + ' was deleted.');
                    App.go('Opportunities/Index.html');
                });
            });
        }
    }

    // ---------------- pipeline board ----------------
    var $board = $('#board');
    if ($board.length) {
        App.fillSelect($('#boardOwner'), Svc.owners(true), 'Everyone');
        if (me.Role === 'SalesExecutive') { $('#ownerFilter').addClass('d-none'); }

        var byId = {};

        var draw = function () {
            var rows = OpportunityService.list({ assignedTo: $('#boardOwner').val() }).data;
            var cutoff = App.addDays(App.today(), -90);
            var total = 0, weighted = 0, open = 0, html = '';
            byId = {};

            $.each(Config.stages, function (i, stage) {
                var isOpenStage = OpportunityService.isOpen(stage);
                var cards = $.grep(rows, function (o) {
                    if (o.Stage !== stage) { return false; }
                    return isOpenStage || App.toDateStr(new Date(o.ClosedDate)) >= cutoff;
                });
                cards.sort(function (a, b) { return a.ExpectedCloseDate < b.ExpectedCloseDate ? -1 : 1; });
                if (!isOpenStage) { cards.reverse(); }

                var sum = 0;
                $.each(cards, function (j, o) {
                    sum += o.Amount;
                    byId[o.OpportunityId] = o;
                    if (o.IsOpen) { open++; total += o.Amount; weighted += o.WeightedAmount; }
                });

                html += '<section class="board-col" data-stage="' + stage + '" aria-label="' + stage + '">' +
                    '<header><h2>' + stage + ' <span>' + cards.length + '</span></h2><div class="total">' + App.money(sum) + '</div></header>' +
                    '<div class="board-cards">';
                if (!cards.length) { html += '<div class="board-empty">' + (isOpenStage ? 'No opportunities in this stage' : 'Nothing closed recently') + '</div>'; }
                $.each(cards, function (j, o) {
                    html += '<article class="deal" data-id="' + o.OpportunityId + '"' + (o.IsOpen ? ' draggable="true"' : '') + '>' +
                        '<a class="name" href="Details.html?id=' + o.OpportunityId + '">' + App.esc(o.OpportunityName) + '</a>' +
                        '<span class="cust">' + App.esc(o.CompanyName || o.CustomerName) + '</span>' +
                        '<div class="meta"><span class="amount text-body">' + App.money(o.Amount) + '</span>' +
                        (o.IsOpen ? '<span>' + o.Probability + '%</span>' : '') + '</div>' +
                        '<div class="meta"><span class="' + (o.IsOverdue ? 'late' : '') + '"><i class="bi bi-calendar3 me-1"></i>' +
                        App.fmtDate(o.IsOpen ? o.ExpectedCloseDate : o.ClosedDate) + '</span>' +
                        '<span class="avatar sm" title="' + App.esc(o.AssignedToName) + '">' + App.esc(App.initials(o.AssignedToName)) + '</span></div>';
                    if (o.IsOpen) {
                        html += '<select class="form-select form-select-sm" data-move="' + o.OpportunityId + '" aria-label="Stage of ' + App.esc(o.OpportunityName) + '">' +
                            $.map(Config.stages, function (s) {
                                return '<option value="' + s + '"' + (s === stage ? ' selected' : '') + '>' + (s === stage ? s : 'Move to ' + s) + '</option>';
                            }).join('') + '</select>';
                    }
                    html += '</article>';
                });
                html += '</div></section>';
            });

            $board.html(html);
            $('#pipelineTotals').text(open + ' open opportunit' + (open === 1 ? 'y' : 'ies') + ', ' + App.moneyShort(total) + ' in pipeline, ' + App.moneyShort(weighted) + ' weighted');
        };

        var change = function (id, stage) {
            var o = byId[id];
            if (!o || o.Stage === stage) { draw(); return; }
            moveTo(o, stage, function (updated) {
                App.toast(updated.OpportunityName + (updated.IsOpen ? ' moved to ' : ' marked as ') + updated.Stage + '.');
                draw();
            });
        };

        $('#boardOwner').on('change', draw);
        $board.on('change', '[data-move]', function () { change($(this).data('move'), this.value); });

        // put the card's stage box back if the Won / Lost dialog is cancelled
        $('#closeModal').on('hidden.bs.modal', draw);

        // drag and drop between columns
        var dragId = null;
        $board.on('dragstart', '.deal[draggable]', function (e) {
            dragId = $(this).data('id');
            $(this).addClass('dragging');
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            e.originalEvent.dataTransfer.setData('text/plain', String(dragId));
        });
        $board.on('dragend', '.deal', function () {
            $(this).removeClass('dragging');
            $board.find('.drag-over').removeClass('drag-over');
        });
        $board.on('dragover', '.board-col', function (e) {
            if (dragId === null) { return; }
            e.preventDefault();
            $(this).addClass('drag-over');
        });
        $board.on('dragleave', '.board-col', function (e) {
            if (!$.contains(this, e.relatedTarget)) { $(this).removeClass('drag-over'); }
        });
        $board.on('drop', '.board-col', function (e) {
            e.preventDefault();
            $(this).removeClass('drag-over');
            if (dragId === null) { return; }
            var id = dragId;
            dragId = null;
            change(id, $(this).data('stage'));
        });

        draw();
    }
});
