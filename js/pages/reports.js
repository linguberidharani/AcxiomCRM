// Reports: one page, the report is picked from the list on the left (?report=leads).

App.page(function (me) {

    var scope = { Admin: 'All records', Manager: 'Records owned by you and your team', SalesExecutive: 'Records assigned to you' };
    $('#scopeText').text(scope[me.Role]);

    var reports = ReportService.available();
    var current = null, result = null, grid = null;

    $('#reportList').html($.map(reports, function (r) {
        return '<a class="list-group-item list-group-item-action" href="?report=' + r.id + '" data-report="' + r.id + '">' + App.esc(r.title) + '</a>';
    }).join(''));

    App.fillSelect($('#owner'), Svc.owners(true), 'Everyone');

    function filter() {
        var f = {};
        if (has('date')) { f.from = $('#from').val(); f.to = $('#to').val(); }
        if (has('owner')) { f.owner = $('#owner').val(); }
        if (has('status')) { f.status = $('#status').val(); }
        if (has('group')) { f.group = $('#group').val(); }
        return f;
    }

    function has(name) { return $.inArray(name, current.filters) >= 0; }

    // turns a report column into a grid column
    function gridColumn(c) {
        var value = function (row) { return typeof c.value === 'function' ? c.value(row) : row[c.value]; };
        return {
            title: c.title,
            sort: value,
            cls: c.cls || (c.money ? 'text-end num' : (c.date || c.datetime ? 'text-nowrap' : '')),
            render: function (row) {
                var v = value(row);
                if (c.money) { return App.money(v); }
                if (c.tag) { return App.tag(v); }
                if (c.date) { return v ? App.fmtDate(v) : ''; }
                if (c.datetime) { return App.fmtDateTime(v); }
                return App.esc(v) + (c.suffix && v !== '' ? c.suffix : '');
            }
        };
    }

    function run() {
        var f = filter();
        if (f.from && f.to && f.from > f.to) {
            App.toast('From date cannot be after To date.', 'warning');
            return;
        }
        var r = ReportService.run(current.id, f);
        if (!r.ok) { App.toast(r.message, 'danger'); return; }
        result = r.data;

        $('#summary').html($.map(result.summary, function (s) {
            return '<div><small>' + App.esc(s.label) + '</small><b>' + App.esc(s.value) + '</b></div>';
        }).join(''));

        // the columns can change with the filters (pipeline by stage / owner), so the grid is rebuilt
        $('#reportGrid').off().empty();
        grid = App.grid({
            el: '#reportGrid',
            rows: result.rows,
            pageSize: 12,
            empty: 'No data for the selected filters.',
            columns: $.map(result.columns, gridColumn)
        });
    }

    function show(id) {
        current = $.grep(reports, function (r) { return r.id === id; })[0] || reports[0];
        $('#reportList a').removeClass('active').removeAttr('aria-current')
            .filter('[data-report="' + current.id + '"]').addClass('active').attr('aria-current', 'true');
        $('#reportTitle').text(current.title);
        $('#reportAbout').text(current.about);
        document.title = current.title + ' - AcxiomCRM';

        $('#filterForm')[0].reset();
        $('[data-filter]').each(function () {
            $(this).toggleClass('d-none', !has($(this).data('filter')));
        });
        // a Sales Executive only has own records, so there is nothing to pick
        if (me.Role === 'SalesExecutive') { $('[data-filter="owner"]').addClass('d-none'); }
        $('.date-label').text(current.dateLabel || 'Date');
        $('#statusLabel').text(current.statusLabel || 'Status');
        App.fillSelect($('#status'), current.statusOptions || [], 'All');
        run();
    }

    $('#reportList').on('click', 'a', function (e) {
        e.preventDefault();
        var id = $(this).data('report');
        window.history.replaceState(null, '', '?report=' + id);
        show(id);
    });

    $('#filterForm').on('input change', run)
        .on('submit', function (e) { e.preventDefault(); })
        .on('reset', function () { setTimeout(run, 0); });

    $('#exportButton').on('click', function () {
        var columns = $.map(result.columns, function (c) {
            return {
                title: c.title,
                value: function (row) {
                    var v = typeof c.value === 'function' ? c.value(row) : row[c.value];
                    if (c.datetime) { return App.fmtDateTime(v); }
                    if (c.date) { return v ? App.fmtDate(v) : ''; }
                    return v;
                }
            };
        });
        App.exportCsv(current.id + '-report-' + App.today() + '.csv', columns, grid.rows());
    });

    $('#printButton').on('click', function () { window.print(); });

    show(App.qs('report'));
});
