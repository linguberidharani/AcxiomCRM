// Dashboard: KPI cards, three Chart.js charts and the work lists.

App.page(function (me) {

    var BLUE = '#2f6fad', GREEN = '#1f7a57', ORANGE = '#c9741f';
    var charts = {};

    Chart.defaults.font.family = '"IBM Plex Sans", "Segoe UI", Arial, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#485667';

    var scopeText = {
        Admin: 'All records in the system',
        Manager: 'Records owned by you and your team',
        SalesExecutive: 'Records assigned to you'
    };

    function rangeFor(key) {
        var t = App.today(), d = App.parseDate(t);
        if (key === 'today') { return { from: t, to: t }; }
        if (key === 'week') {
            var day = (d.getDay() + 6) % 7;     // Monday = 0
            var from = App.addDays(t, -day);
            return { from: from, to: App.addDays(from, 6) };
        }
        if (key === 'month') {
            return {
                from: App.toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)),
                to: App.toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))
            };
        }
        if (key === 'custom') { return { from: $('#rangeFrom').val(), to: $('#rangeTo').val() }; }
        return {};
    }

    function rangeLabel(r) {
        if (!r.from && !r.to) { return ''; }
        if (r.from && r.to) { return r.from === r.to ? ', added on ' + App.fmtDate(r.from) : ', added ' + App.fmtDate(r.from) + ' to ' + App.fmtDate(r.to); }
        return r.from ? ', added from ' + App.fmtDate(r.from) : ', added up to ' + App.fmtDate(r.to);
    }

    function stat(label, value, href, note) {
        return '<div class="stat"><div class="label">' + label + '</div>' +
            '<div class="value">' + (href ? '<a href="' + App.url(href) + '">' + value + '</a>' : value) + '</div>' +
            (note ? '<div class="note">' + note + '</div>' : '') + '</div>';
    }

    function drawChart(id, config) {
        if (charts[id]) { charts[id].destroy(); }
        charts[id] = new Chart(document.getElementById(id), config);
    }

    // sideways = horizontal bars, so the stage / status names have room
    function chartOptions(money, sideways) {
        var valueAxis = {
            beginAtZero: true,
            border: { display: false },
            grid: { color: '#e9edf1' },
            ticks: money ? { maxTicksLimit: 5, callback: function (v) { return App.moneyShort(v); } } : { precision: 0, maxTicksLimit: 6 }
        };
        var labelAxis = { grid: { display: false }, border: { color: '#dce1e7' }, ticks: { autoSkip: false } };
        return {
            indexAxis: sideways ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            var v = sideways ? ctx.parsed.x : ctx.parsed.y;
                            if (!money) { return v + ' lead' + (v === 1 ? '' : 's'); }
                            var n = ctx.dataset.counts ? ctx.dataset.counts[ctx.dataIndex] : null;
                            return App.money(v) + (n === null ? '' : ' from ' + n + ' opportunit' + (n === 1 ? 'y' : 'ies'));
                        }
                    }
                }
            },
            scales: sideways ? { x: valueAxis, y: labelAxis } : { x: labelAxis, y: valueAxis }
        };
    }

    function load() {
        var range = rangeFor($('input[name=range]:checked').val());
        var d = ReportService.dashboard(range).data, c = d.cards;

        $('#scopeText').text(scopeText[me.Role] + rangeLabel(range));

        $('#stats').html(
            stat('Total Customers', c.totalCustomers, 'Customers/Index.html') +
            stat('Total Leads', c.totalLeads, 'Leads/Index.html') +
            stat('Open Leads', c.openLeads, null, 'New, Contacted or Qualified') +
            stat('Total Opportunities', c.totalOpportunities, 'Opportunities/Index.html') +
            stat('Open Opportunities', c.openOpportunities, 'Opportunities/Pipeline.html') +
            stat('Won Opportunities', c.wonOpportunities, 'Opportunities/Index.html?stage=Won') +
            stat('Lost Opportunities', c.lostOpportunities, 'Opportunities/Index.html?stage=Lost') +
            stat('Total Pipeline Value', App.moneyShort(c.pipelineValue), null, 'Weighted ' + App.moneyShort(c.weightedPipeline))
        );

        // lead status
        var leadColor = { New: BLUE, Contacted: BLUE, Qualified: BLUE, Converted: GREEN, Unqualified: ORANGE, Lost: ORANGE };
        $('#leadHint').text(c.totalLeads + ' lead' + (c.totalLeads === 1 ? '' : 's'));
        drawChart('leadChart', {
            type: 'bar',
            data: {
                labels: $.map(d.leadStatus, function (x) { return x.label; }),
                datasets: [{
                    data: $.map(d.leadStatus, function (x) { return x.value; }),
                    backgroundColor: $.map(d.leadStatus, function (x) { return leadColor[x.label]; }),
                    borderRadius: 3, maxBarThickness: 22
                }]
            },
            options: chartOptions(false, true)
        });
        $('#leadChart').attr('aria-label', 'Leads by status: ' + $.map(d.leadStatus, function (x) { return x.label + ' ' + x.value; }).join(', '));

        // pipeline by stage
        var stageColor = { Qualification: BLUE, Proposal: BLUE, Negotiation: BLUE, Won: GREEN, Lost: ORANGE };
        drawChart('pipelineChart', {
            type: 'bar',
            data: {
                labels: $.map(d.pipeline, function (x) { return x.label; }),
                datasets: [{
                    data: $.map(d.pipeline, function (x) { return x.amount; }),
                    counts: $.map(d.pipeline, function (x) { return x.count; }),
                    backgroundColor: $.map(d.pipeline, function (x) { return stageColor[x.label]; }),
                    borderRadius: 3, maxBarThickness: 22
                }]
            },
            options: chartOptions(true, true)
        });
        $('#pipelineChart').attr('aria-label', 'Opportunity amount by stage: ' + $.map(d.pipeline, function (x) { return x.label + ' ' + App.money(x.amount); }).join(', '));

        // monthly sales
        var lineOptions = chartOptions(true, false);
        lineOptions.interaction = { mode: 'index', intersect: false };
        drawChart('salesChart', {
            type: 'line',
            data: {
                labels: $.map(d.monthly, function (x) { return x.label; }),
                datasets: [{
                    data: $.map(d.monthly, function (x) { return x.amount; }),
                    counts: $.map(d.monthly, function (x) { return x.count; }),
                    borderColor: GREEN, backgroundColor: GREEN,
                    borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: '#fff', pointBorderWidth: 2, tension: 0
                }]
            },
            options: lineOptions
        });
        $('#salesChart').attr('aria-label', 'Won amount per month: ' + $.map(d.monthly, function (x) { return x.label + ' ' + App.money(x.amount); }).join(', '));

        // pending follow-ups
        $('#followHint').html(c.pendingFollowUps + ' pending' + (c.overdueFollowUps ? ', <span class="text-danger">' + c.overdueFollowUps + ' overdue</span>' : ''));
        var today = App.today();
        var html = $.map(d.upcoming, function (f) {
            var when = f.IsOverdue ? App.tag('Overdue') : (f.FollowUpDate === today ? App.tag('Today') : '');
            return '<li><div class="main"><a href="' + App.url('FollowUps/Index.html?view=Pending') + '">' + App.esc(f.Subject) + '</a>' +
                '<small>' + App.esc(f.FollowUpType) + ' with ' + App.esc(f.RelatedName) + (me.Role === 'SalesExecutive' ? '' : ', ' + App.esc(f.AssignedToName)) + '</small></div>' +
                '<div class="side">' + App.fmtDate(f.FollowUpDate) + '<br>' + when + '</div></li>';
        }).join('');
        $('#upcomingList').html(html || '<li class="none">No pending follow-ups.</li>');

        // recent activities
        var icons = { Call: 'bi-telephone', Meeting: 'bi-people', Email: 'bi-envelope', Task: 'bi-check2-square' };
        html = $.map(d.recent, function (a) {
            return '<li><div class="main"><i class="bi ' + icons[a.ActivityType] + ' text-muted me-2"></i>' + App.esc(a.Subject) +
                '<small>' + App.esc(a.ActivityType) + (a.RelatedName ? ' with ' + App.esc(a.RelatedName) : '') + (me.Role === 'SalesExecutive' ? '' : ', ' + App.esc(a.AssignedToName)) + '</small></div>' +
                '<div class="side">' + App.fmtDate(a.ActivityDate) + '<br>' + App.tag(a.Status) + '</div></li>';
        }).join('');
        $('#recentList').html(html || '<li class="none">No activities yet.</li>');

        if (d.team) {
            $('#teamPanel').removeClass('d-none');
            teamGrid.setRows(d.team);
        }

        if (d.admin) {
            $('#adminPanel').removeClass('d-none');
            $('#adminStats').html(
                '<div><small>Active users</small><b>' + d.admin.activeUsers + '</b></div>' +
                '<div><small>Inactive users</small><b>' + d.admin.inactiveUsers + '</b></div>' +
                '<div><small>Locked accounts</small><b>' + d.admin.lockedUsers + '</b></div>' +
                '<div><small>Failed logins, last 7 days</small><b>' + d.admin.failedLogins + '</b></div>' +
                '<div><small>Audit events today</small><b>' + d.admin.eventsToday + '</b></div>'
            );
        }
    }

    var teamGrid = App.grid({
        el: '#teamGrid',
        pageSize: 8,
        sortBy: 3, sortDir: 'desc',
        empty: 'No team activity for this period.',
        columns: [
            { title: 'Owner', key: 'Name', sort: true },
            { title: 'Open leads', key: 'OpenLeads', sort: true, cls: 'text-end num' },
            { title: 'Open opportunities', key: 'OpenOpportunities', sort: true, cls: 'text-end num' },
            { title: 'Pipeline', sort: 'Pipeline', cls: 'text-end num', render: function (r) { return App.money(r.Pipeline); } },
            { title: 'Won', sort: 'Won', cls: 'text-end num', render: function (r) { return App.money(r.Won); } },
            { title: 'Overdue follow-ups', sort: 'Overdue', cls: 'text-end num', render: function (r) { return r.Overdue ? '<span class="text-danger">' + r.Overdue + '</span>' : '0'; } }
        ]
    });

    $('input[name=range]').on('change', function () {
        var custom = this.value === 'custom';
        $('#customRange').toggleClass('d-none', !custom);
        if (!custom) { load(); }
    });

    $('#customRange').on('submit', function (e) {
        e.preventDefault();
        var from = $('#rangeFrom').val(), to = $('#rangeTo').val();
        var bad = from && to && from > to;
        $('#rangeError').toggleClass('d-none', !bad);
        if (!bad) { load(); }
    });

    load();
});
