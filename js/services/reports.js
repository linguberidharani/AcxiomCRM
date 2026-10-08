// Dashboard numbers and report data. Everything is built from the other services,
// so a user only ever gets figures for the records they are allowed to see.

var ReportService = (function () {

    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function dateOf(value) {
        if (!value) { return ''; }
        return value.length === 10 ? value : App.toDateStr(new Date(value));
    }

    function inRange(value, f) {
        if (!f || (!f.from && !f.to)) { return true; }
        var d = dateOf(value);
        if (!d) { return false; }
        if (f.from && d < f.from) { return false; }
        if (f.to && d > f.to) { return false; }
        return true;
    }

    function byDate(rows, field, f) {
        return $.grep(rows, function (r) { return inRange(r[field], f); });
    }

    function sum(rows, field) {
        var t = 0;
        $.each(rows, function (i, r) { t += Number(r[field]) || 0; });
        return t;
    }

    function count(rows, test) {
        return $.grep(rows, test).length;
    }

    function percent(part, whole) {
        return whole ? Math.round(part * 1000 / whole) / 10 : 0;
    }

    // ---- dashboard ---------------------------------------------------

    function dashboard(range) {
        var me = Auth.user();
        var customers = byDate(CustomerService.list().data, 'CreatedDate', range);
        var leads = byDate(LeadService.list().data, 'CreatedDate', range);
        var allOpps = OpportunityService.list().data;
        var opps = byDate(allOpps, 'CreatedDate', range);
        var followUps = FollowUpService.list().data;
        var open = $.grep(opps, function (o) { return o.IsOpen; });

        var data = {
            cards: {
                totalCustomers: customers.length,
                totalLeads: leads.length,
                openLeads: count(leads, function (l) { return $.inArray(l.Status, ['New', 'Contacted', 'Qualified']) >= 0; }),
                totalOpportunities: opps.length,
                openOpportunities: open.length,
                wonOpportunities: count(opps, function (o) { return o.Status === 'Won'; }),
                lostOpportunities: count(opps, function (o) { return o.Status === 'Lost'; }),
                pipelineValue: sum(open, 'Amount'),
                weightedPipeline: sum(open, 'WeightedAmount'),
                pendingFollowUps: count(followUps, function (f) { return f.Status === 'Planned'; }),
                overdueFollowUps: count(followUps, function (f) { return f.IsOverdue; })
            }
        };

        data.leadStatus = $.map(Config.leadStatuses, function (s) {
            return { label: s, value: count(leads, function (l) { return l.Status === s; }) };
        });

        data.pipeline = $.map(Config.stages, function (s) {
            var rows = $.grep(opps, function (o) { return o.Stage === s; });
            return { label: s, count: rows.length, amount: sum(rows, 'Amount') };
        });

        // won amount for the last six months, by closing date
        data.monthly = [];
        var now = new Date();
        for (var i = 5; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
            var won = $.grep(allOpps, function (o) { return o.Status === 'Won' && dateOf(o.ClosedDate).substring(0, 7) === key; });
            data.monthly.push({ label: monthNames[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2), amount: sum(won, 'Amount'), count: won.length });
        }

        var planned = $.grep(followUps, function (f) { return f.Status === 'Planned'; });
        planned.sort(function (a, b) { return a.FollowUpDate < b.FollowUpDate ? -1 : (a.FollowUpDate > b.FollowUpDate ? 1 : 0); });
        data.upcoming = planned.slice(0, 6);

        var acts = ActivityService.list().data;
        acts.sort(function (a, b) { return a.ActivityDate < b.ActivityDate ? 1 : -1; });
        data.recent = $.grep(acts, function (a) { return a.ActivityDate <= App.today(); }).slice(0, 6);

        if (me.Role !== 'SalesExecutive') {
            data.team = $.map(Svc.owners(true), function (u) {
                var mine = $.grep(opps, function (o) { return o.AssignedTo === u.value; });
                var mineOpen = $.grep(mine, function (o) { return o.IsOpen; });
                return {
                    UserId: u.value, Name: u.text,
                    OpenLeads: count(leads, function (l) { return l.AssignedTo === u.value && $.inArray(l.Status, ['New', 'Contacted', 'Qualified']) >= 0; }),
                    OpenOpportunities: mineOpen.length,
                    Pipeline: sum(mineOpen, 'Amount'),
                    Won: sum($.grep(mine, function (o) { return o.Status === 'Won'; }), 'Amount'),
                    Overdue: count(followUps, function (f) { return f.AssignedTo === u.value && f.IsOverdue; })
                };
            });
            data.team = $.grep(data.team, function (t) { return t.OpenLeads || t.OpenOpportunities || t.Won || t.Overdue; });
        }

        if (me.Role === 'Admin') {
            var users = Store.all('users');
            var weekAgo = App.addDays(App.today(), -7);
            var logs = Store.all('auditLogs');
            data.admin = {
                activeUsers: count(users, function (u) { return u.IsActive; }),
                inactiveUsers: count(users, function (u) { return !u.IsActive; }),
                lockedUsers: count(users, function (u) { return Auth.toDto(u).IsLocked; }),
                failedLogins: count(logs, function (a) { return a.Action === 'Failed Login' && dateOf(a.CreatedDate) >= weekAgo; }),
                eventsToday: count(logs, function (a) { return dateOf(a.CreatedDate) === App.today(); })
            };
        }
        return Svc.ok(data);
    }

    // ---- reports -----------------------------------------------------

    function ownerFilter(rows, f) {
        if (!f.owner) { return rows; }
        return $.grep(rows, function (r) { return r.AssignedTo === Number(f.owner); });
    }

    function statusFilter(rows, f, field) {
        if (!f.status) { return rows; }
        return $.grep(rows, function (r) { return r[field] === f.status; });
    }

    var reports = [
        {
            id: 'customers', title: 'Customer Report', roles: Config.roles,
            about: 'Customers with status, owner and the date they were added.',
            filters: ['date', 'owner', 'status'], dateLabel: 'Created', statusOptions: Config.customerStatuses,
            run: function (f) {
                var rows = statusFilter(ownerFilter(byDate(CustomerService.list().data, 'CreatedDate', f), f), f, 'Status');
                return {
                    rows: rows,
                    summary: [
                        { label: 'Customers', value: rows.length },
                        { label: 'Active', value: count(rows, function (c) { return c.Status === 'Active'; }) },
                        { label: 'Inactive', value: count(rows, function (c) { return c.Status === 'Inactive'; }) }
                    ],
                    columns: [
                        { title: 'Code', value: 'CustomerCode', cls: 'text-nowrap' },
                        { title: 'Customer', value: 'CustomerName' },
                        { title: 'Company', value: 'CompanyName' },
                        { title: 'City', value: 'City' },
                        { title: 'Status', value: 'Status', tag: true },
                        { title: 'Owner', value: 'AssignedToName' },
                        { title: 'Created', value: function (r) { return dateOf(r.CreatedDate); }, date: true }
                    ]
                };
            }
        },
        {
            id: 'leads', title: 'Lead Report', roles: Config.roles,
            about: 'Leads by source, status and owner, with conversion details.',
            filters: ['date', 'owner', 'status'], dateLabel: 'Created', statusOptions: Config.leadStatuses,
            run: function (f) {
                var rows = statusFilter(ownerFilter(byDate(LeadService.list().data, 'CreatedDate', f), f), f, 'Status');
                var converted = count(rows, function (l) { return l.Status === 'Converted'; });
                return {
                    rows: rows,
                    summary: [
                        { label: 'Leads', value: rows.length },
                        { label: 'Converted', value: converted },
                        { label: 'Conversion rate', value: percent(converted, rows.length) + '%' },
                        { label: 'Expected value', value: App.moneyShort(sum(rows, 'ExpectedValue')) }
                    ],
                    columns: [
                        { title: 'Code', value: 'LeadCode', cls: 'text-nowrap' },
                        { title: 'Lead', value: 'LeadName' },
                        { title: 'Company', value: 'CompanyName' },
                        { title: 'Source', value: 'Source' },
                        { title: 'Status', value: 'Status', tag: true },
                        { title: 'Expected value', value: 'ExpectedValue', money: true },
                        { title: 'Owner', value: 'AssignedToName' },
                        { title: 'Created', value: function (r) { return dateOf(r.CreatedDate); }, date: true },
                        { title: 'Converted on', value: function (r) { return dateOf(r.ConvertedDate); }, date: true }
                    ]
                };
            }
        },
        {
            id: 'followups', title: 'Follow-Up Report', roles: Config.roles,
            about: 'Planned, completed, missed and overdue follow-ups.',
            filters: ['date', 'owner', 'status'], dateLabel: 'Follow-up date',
            statusOptions: ['Planned', 'Overdue', 'Completed', 'Missed', 'Cancelled'],
            run: function (f) {
                var rows = ownerFilter(byDate(FollowUpService.list().data, 'FollowUpDate', f), f);
                if (f.status === 'Overdue') { rows = $.grep(rows, function (r) { return r.IsOverdue; }); }
                else { rows = statusFilter(rows, f, 'Status'); }
                return {
                    rows: rows,
                    summary: [
                        { label: 'Planned', value: count(rows, function (r) { return r.Status === 'Planned'; }) },
                        { label: 'Overdue', value: count(rows, function (r) { return r.IsOverdue; }) },
                        { label: 'Completed', value: count(rows, function (r) { return r.Status === 'Completed'; }) },
                        { label: 'Missed', value: count(rows, function (r) { return r.Status === 'Missed'; }) }
                    ],
                    columns: [
                        { title: 'Date', value: 'FollowUpDate', date: true },
                        { title: 'Subject', value: 'Subject' },
                        { title: 'Type', value: 'FollowUpType' },
                        { title: 'Related to', value: function (r) { return r.RelatedType + ': ' + r.RelatedName; } },
                        { title: 'Owner', value: 'AssignedToName' },
                        { title: 'Status', value: 'DisplayStatus', tag: true }
                    ]
                };
            }
        },
        {
            id: 'opportunities', title: 'Opportunity Report', roles: Config.roles,
            about: 'Opportunities with stage, amount, probability and expected close date.',
            filters: ['date', 'owner', 'status'], dateLabel: 'Expected close', statusLabel: 'Stage', statusOptions: Config.stages,
            run: function (f) {
                var rows = statusFilter(ownerFilter(byDate(OpportunityService.list().data, 'ExpectedCloseDate', f), f), f, 'Stage');
                return {
                    rows: rows,
                    summary: [
                        { label: 'Opportunities', value: rows.length },
                        { label: 'Total amount', value: App.moneyShort(sum(rows, 'Amount')) },
                        { label: 'Weighted amount', value: App.moneyShort(sum(rows, 'WeightedAmount')) }
                    ],
                    columns: [
                        { title: 'Opportunity', value: 'OpportunityName' },
                        { title: 'Customer', value: 'CustomerName' },
                        { title: 'Stage', value: 'Stage', tag: true },
                        { title: 'Amount', value: 'Amount', money: true },
                        { title: 'Probability', value: 'Probability', suffix: '%', cls: 'text-end' },
                        { title: 'Weighted', value: 'WeightedAmount', money: true },
                        { title: 'Expected close', value: 'ExpectedCloseDate', date: true },
                        { title: 'Owner', value: 'AssignedToName' }
                    ]
                };
            }
        },
        {
            id: 'pipeline', title: 'Pipeline Report', roles: Config.roles,
            about: 'Open pipeline grouped by stage or by owner, with the weighted amount.',
            filters: ['owner', 'group'],
            run: function (f) {
                var opps = ownerFilter($.grep(OpportunityService.list().data, function (o) { return o.IsOpen; }), f);
                var groups;
                if (f.group === 'owner') {
                    groups = $.map(Svc.owners(true), function (u) {
                        return { name: u.text, rows: $.grep(opps, function (o) { return o.AssignedTo === u.value; }) };
                    });
                    groups = $.grep(groups, function (g) { return g.rows.length; });
                } else {
                    groups = $.map(Config.openStages, function (s) {
                        return { name: s, rows: $.grep(opps, function (o) { return o.Stage === s; }) };
                    });
                }
                var total = sum(opps, 'Amount');
                var rows = $.map(groups, function (g) {
                    var amount = sum(g.rows, 'Amount');
                    return { Group: g.name, Count: g.rows.length, Amount: amount, Weighted: sum(g.rows, 'WeightedAmount'), Share: percent(amount, total) };
                });
                return {
                    rows: rows,
                    summary: [
                        { label: 'Open opportunities', value: opps.length },
                        { label: 'Pipeline amount', value: App.moneyShort(total) },
                        { label: 'Weighted pipeline', value: App.moneyShort(sum(opps, 'WeightedAmount')) }
                    ],
                    columns: [
                        { title: f.group === 'owner' ? 'Owner' : 'Stage', value: 'Group' },
                        { title: 'Opportunities', value: 'Count', cls: 'text-end' },
                        { title: 'Amount', value: 'Amount', money: true },
                        { title: 'Weighted amount', value: 'Weighted', money: true },
                        { title: 'Share of pipeline', value: 'Share', suffix: '%', cls: 'text-end' }
                    ]
                };
            }
        },
        {
            id: 'conversion', title: 'Sales / Conversion Report', roles: Config.roles,
            about: 'Lead conversion and opportunity win rate for each owner.',
            filters: ['date', 'owner'], dateLabel: 'Created',
            run: function (f) {
                var leads = ownerFilter(byDate(LeadService.list().data, 'CreatedDate', f), f);
                var opps = ownerFilter(byDate(OpportunityService.list().data, 'CreatedDate', f), f);
                var rows = $.map(Svc.owners(true), function (u) {
                    var l = $.grep(leads, function (x) { return x.AssignedTo === u.value; });
                    var o = $.grep(opps, function (x) { return x.AssignedTo === u.value; });
                    var conv = count(l, function (x) { return x.Status === 'Converted'; });
                    var won = $.grep(o, function (x) { return x.Status === 'Won'; });
                    var lost = count(o, function (x) { return x.Status === 'Lost'; });
                    return {
                        Owner: u.text, Leads: l.length, Converted: conv, NotConverted: l.length - conv, LeadRate: percent(conv, l.length),
                        Won: won.length, Lost: lost, WinRate: percent(won.length, won.length + lost), WonAmount: sum(won, 'Amount')
                    };
                });
                rows = $.grep(rows, function (r) { return r.Leads || r.Won || r.Lost; });
                var totalLeads = sum(rows, 'Leads'), totalConv = sum(rows, 'Converted'), totalWon = sum(rows, 'Won'), totalLost = sum(rows, 'Lost');
                return {
                    rows: rows,
                    summary: [
                        { label: 'Leads converted', value: totalConv + ' of ' + totalLeads },
                        { label: 'Lead conversion', value: percent(totalConv, totalLeads) + '%' },
                        { label: 'Win rate', value: percent(totalWon, totalWon + totalLost) + '%' },
                        { label: 'Won amount', value: App.moneyShort(sum(rows, 'WonAmount')) }
                    ],
                    columns: [
                        { title: 'Owner', value: 'Owner' },
                        { title: 'Leads', value: 'Leads', cls: 'text-end' },
                        { title: 'Converted', value: 'Converted', cls: 'text-end' },
                        { title: 'Not converted', value: 'NotConverted', cls: 'text-end' },
                        { title: 'Conversion', value: 'LeadRate', suffix: '%', cls: 'text-end' },
                        { title: 'Won', value: 'Won', cls: 'text-end' },
                        { title: 'Lost', value: 'Lost', cls: 'text-end' },
                        { title: 'Win rate', value: 'WinRate', suffix: '%', cls: 'text-end' },
                        { title: 'Won amount', value: 'WonAmount', money: true }
                    ]
                };
            }
        },
        {
            id: 'useractivity', title: 'User Activity Report', roles: ['Admin', 'Manager'],
            about: 'How many records each user created, changed or deleted.',
            filters: ['date'], dateLabel: 'Action date',
            run: function (f) {
                var logs = byDate(Store.all('auditLogs'), 'CreatedDate', f);
                var users = Svc.scoped(Store.all('users'), 'UserId');
                var rows = $.map(users, function (u) {
                    var mine = $.grep(logs, function (a) { return a.UserId === u.UserId; });
                    function n(action) { return count(mine, function (a) { return a.Action === action; }); }
                    return {
                        User: u.FullName, Role: Config.roleNames[u.Role],
                        Logins: n('Login'), Created: n('Create'), Updated: n('Update') + n('Status Change'),
                        Deleted: n('Delete'), Converted: n('Convert'), Total: mine.length,
                        LastLogin: u.LastLoginDate ? dateOf(u.LastLoginDate) : ''
                    };
                });
                return {
                    rows: rows,
                    summary: [
                        { label: 'Users', value: rows.length },
                        { label: 'Actions recorded', value: sum(rows, 'Total') }
                    ],
                    columns: [
                        { title: 'User', value: 'User' },
                        { title: 'Role', value: 'Role' },
                        { title: 'Logins', value: 'Logins', cls: 'text-end' },
                        { title: 'Created', value: 'Created', cls: 'text-end' },
                        { title: 'Updated', value: 'Updated', cls: 'text-end' },
                        { title: 'Deleted', value: 'Deleted', cls: 'text-end' },
                        { title: 'Leads converted', value: 'Converted', cls: 'text-end' },
                        { title: 'All actions', value: 'Total', cls: 'text-end' },
                        { title: 'Last login', value: 'LastLogin', date: true }
                    ]
                };
            }
        },
        {
            id: 'audit', title: 'Audit Report', roles: ['Admin'],
            about: 'Security and business events from the audit log.',
            filters: ['date', 'status'], dateLabel: 'Event date', statusLabel: 'Result', statusOptions: ['Success', 'Failed', 'Denied'],
            run: function (f) {
                var rows = Audit.list({ from: f.from, to: f.to, result: f.status }).data || [];
                return {
                    rows: rows,
                    summary: [
                        { label: 'Events', value: rows.length },
                        { label: 'Failed logins', value: count(rows, function (a) { return a.Action === 'Failed Login'; }) },
                        { label: 'Access denied', value: count(rows, function (a) { return a.Action === 'Access Denied'; }) }
                    ],
                    columns: [
                        { title: 'Date and time', value: 'CreatedDate', datetime: true },
                        { title: 'User', value: 'UserFullName' },
                        { title: 'Action', value: 'Action' },
                        { title: 'Module', value: 'EntityName' },
                        { title: 'Record', value: function (r) { return r.RecordId || ''; }, cls: 'text-end' },
                        { title: 'Result', value: 'Result', tag: true },
                        { title: 'Details', value: 'Details' }
                    ]
                };
            }
        }
    ];

    function available() {
        var me = Auth.user();
        return $.grep(reports, function (r) { return $.inArray(me.Role, r.roles) >= 0; });
    }

    function run(id, filter) {
        var def = $.grep(available(), function (r) { return r.id === id; })[0];
        if (!def) { return Svc.denied('Report', null, id); }
        return Svc.ok(def.run(filter || {}));
    }

    return { dashboard: dashboard, available: available, run: run };

})();
