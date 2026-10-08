// Common layout: access check, side menu, top bar and footer.
// This is the job of _Layout.cshtml + [Authorize] once the pages become Razor views.

var Layout = { authorized: false };

// page scripts use App.page(function (me) { ... }) so nothing runs for a visitor who is being redirected
App.page = function (fn) {
    $(function () {
        if (Layout.authorized) { fn(Auth.user()); }
    });
};

// fills an "Assigned To" dropdown with the users the signed-in user may assign to.
// A Sales Executive only works on own records, so the box is fixed to them.
App.ownerSelect = function ($select, placeholder, includeInactive) {
    var me = Auth.user();
    App.fillSelect($select, Svc.owners(includeInactive), placeholder);
    if (me.Role === 'SalesExecutive') { $select.val(me.UserId).prop('disabled', true); }
};

$(function () {

    var $body = $('body');
    var module = $body.data('module');
    var nav = $body.data('nav') || module;
    var me = Auth.user();

    // login and register do not use the layout
    if ($body.data('public')) {
        Layout.authorized = true;
        App.showFlash();
        return;
    }

    if (!me) {
        var back = window.location.pathname.split('/').slice(-2).join('/') + window.location.search;
        window.location.replace(App.url('Account/Login.html?returnUrl=' + encodeURIComponent(back)));
        return;
    }

    if (!Auth.can(module)) {
        Audit.log({ action: 'Access Denied', entity: module, result: 'Denied', details: 'Tried to open ' + window.location.pathname.split('/').slice(-2).join('/') });
        window.location.replace(App.url('Account/AccessDenied.html'));
        return;
    }

    Layout.authorized = true;

    var menu = [
        { title: '', items: [
            { key: 'Dashboard', module: 'Dashboard', text: 'Dashboard', icon: 'bi-speedometer2', href: 'Dashboard/Index.html' }
        ] },
        { title: 'Sales', items: [
            { key: 'Customers', module: 'Customers', text: 'Customers', icon: 'bi-people', href: 'Customers/Index.html' },
            { key: 'Leads', module: 'Leads', text: 'Leads', icon: 'bi-person-plus', href: 'Leads/Index.html' },
            { key: 'Opportunities', module: 'Opportunities', text: 'Opportunities', icon: 'bi-briefcase', href: 'Opportunities/Index.html' },
            { key: 'Pipeline', module: 'Opportunities', text: 'Sales Pipeline', icon: 'bi-kanban', href: 'Opportunities/Pipeline.html' }
        ] },
        { title: 'Work', items: [
            { key: 'FollowUps', module: 'FollowUps', text: 'Follow-Ups', icon: 'bi-calendar-check', href: 'FollowUps/Index.html' },
            { key: 'Activities', module: 'Activities', text: 'Activities', icon: 'bi-journal-text', href: 'Activities/Index.html' }
        ] },
        { title: 'Analysis', items: [
            { key: 'Reports', module: 'Reports', text: 'Reports', icon: 'bi-bar-chart', href: 'Reports/Index.html' }
        ] },
        { title: 'Administration', items: [
            { key: 'Users', module: 'Users', text: 'Users', icon: 'bi-person-gear', href: 'Users/Index.html' },
            { key: 'Roles', module: 'Roles', text: 'Roles & Permissions', icon: 'bi-shield-lock', href: 'Roles/Index.html' },
            { key: 'AuditLog', module: 'AuditLog', text: 'Audit Log', icon: 'bi-clock-history', href: 'AuditLog/Index.html' }
        ] }
    ];

    // follow-ups that are due today or overdue
    var today = App.today();
    var due = $.grep(FollowUpService.list({ status: 'Pending' }).data, function (f) { return f.FollowUpDate <= today; });
    due.sort(function (a, b) { return a.FollowUpDate < b.FollowUpDate ? -1 : 1; });
    var overdue = $.grep(due, function (f) { return f.IsOverdue; }).length;

    // ---- side menu ----
    var side = '<a class="skip-link" href="#content">Skip to content</a>' +
        '<aside class="sidebar" id="sidebar">' +
        '<a class="brand" href="' + App.url('Dashboard/Index.html') + '"><span class="brand-mark"></span><span>Acxiom<span class="light">CRM</span></span></a>' +
        '<nav aria-label="Main menu">';
    $.each(menu, function (i, group) {
        var links = '';
        $.each(group.items, function (j, item) {
            if (!Auth.can(item.module)) { return; }
            links += '<a class="nav-link' + (item.key === nav ? ' active' : '') + '" href="' + App.url(item.href) + '"' +
                (item.key === nav ? ' aria-current="page"' : '') + '>' +
                '<i class="bi ' + item.icon + '"></i><span>' + item.text + '</span>' +
                (item.key === 'FollowUps' && overdue ? '<span class="nav-count" title="Overdue follow-ups">' + overdue + '</span>' : '') +
                '</a>';
        });
        if (!links) { return; }
        if (group.title) { side += '<div class="nav-group">' + group.title + '</div>'; }
        side += links;
    });
    side += '</nav><div class="sidebar-foot">Signed in as ' + App.esc(Config.roleNames[me.Role]) + '</div></aside>' +
        '<div class="sidebar-backdrop"></div>';

    // ---- top bar ----
    var notes = '';
    $.each(due.slice(0, 6), function (i, f) {
        notes += '<a class="item" href="' + App.url('FollowUps/Index.html?view=' + (f.IsOverdue ? 'Overdue' : 'Pending')) + '">' +
            App.esc(f.Subject) + ' ' + App.tag(f.IsOverdue ? 'Overdue' : 'Planned') +
            '<small>' + App.esc(f.RelatedName) + ', ' + (f.IsOverdue ? 'was due ' + App.fmtDate(f.FollowUpDate) : 'due today') + '</small></a>';
    });
    if (!notes) { notes = '<div class="none">Nothing due today.</div>'; }

    var top = '<header class="topbar">' +
        '<button type="button" class="btn-icon d-lg-none" id="menuToggle" aria-label="Open menu"><i class="bi bi-list"></i></button>' +
        '<form class="global-search" role="search" id="searchForm" autocomplete="off">' +
        '<i class="bi bi-search"></i>' +
        '<input type="search" class="form-control form-control-sm" id="searchBox" placeholder="Search customers, leads, opportunities" aria-label="Search customers, leads and opportunities">' +
        '<div class="search-results" id="searchResults"></div></form>' +
        '<div class="ms-auto d-flex align-items-center gap-1">' +
        '<div class="dropdown">' +
        '<button type="button" class="btn-icon" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Follow-ups due (' + due.length + ')">' +
        '<i class="bi bi-bell"></i>' + (due.length ? '<span class="bell-count">' + due.length + '</span>' : '') + '</button>' +
        '<div class="dropdown-menu dropdown-menu-end notify-menu"><div class="head">Follow-ups due</div>' + notes +
        '<a class="foot" href="' + App.url('FollowUps/Index.html') + '">View all follow-ups</a></div></div>' +
        '<div class="dropdown">' +
        '<button type="button" class="user-button" data-bs-toggle="dropdown" aria-expanded="false">' +
        '<span class="avatar">' + App.esc(App.initials(me.FullName)) + '</span>' +
        '<span class="who">' + App.esc(me.FullName) + '<small>' + App.esc(Config.roleNames[me.Role]) + '</small></span>' +
        '<i class="bi bi-chevron-down small text-muted"></i></button>' +
        '<ul class="dropdown-menu dropdown-menu-end">' +
        '<li><span class="dropdown-item-text text-muted small">' + App.esc(me.Email) + '</span></li>' +
        '<li><hr class="dropdown-divider"></li>' +
        '<li><a class="dropdown-item" href="' + App.url('Account/ChangePassword.html') + '"><i class="bi bi-key me-2"></i>Change password</a></li>' +
        '<li><button type="button" class="dropdown-item" id="logoutButton"><i class="bi bi-box-arrow-right me-2"></i>Sign out</button></li>' +
        '</ul></div></div></header>';

    var foot = '<footer class="app-footer"><span>&copy; ' + new Date().getFullYear() + ' AcxiomCRM</span><span>Version ' + Config.version + '</span></footer>';

    var $content = $('#content');
    $content.wrap('<div class="app-main"></div>');
    $content.before(top).after(foot);
    $('.app-main').before(side);
    $body.addClass('ready');

    App.showFlash();

    // ---- events ----
    $('#menuToggle').on('click', function () { $body.toggleClass('sidebar-open'); });
    $('.sidebar-backdrop').on('click', function () { $body.removeClass('sidebar-open'); });

    $('#logoutButton').on('click', function () {
        Auth.logout();
        App.flash('You have been signed out.', 'info');
        App.go('Account/Login.html');
    });

    // ---- search across customers, leads and opportunities ----
    var $results = $('#searchResults');

    function search(text) {
        text = $.trim(text);
        if (text.length < 2) { $results.removeClass('show').empty(); return; }
        var html = '';
        $.each(CustomerService.list({ q: text }).data.slice(0, 5), function (i, c) {
            html += '<a href="' + App.url('Customers/Details.html?id=' + c.CustomerId) + '"><span>' + App.esc(c.CustomerName) +
                (c.CompanyName ? ' <span class="text-muted">' + App.esc(c.CompanyName) + '</span>' : '') + '</span><span class="kind">Customer</span></a>';
        });
        $.each(LeadService.list({ q: text }).data.slice(0, 5), function (i, l) {
            html += '<a href="' + App.url('Leads/Details.html?id=' + l.LeadId) + '"><span>' + App.esc(l.LeadName) +
                (l.CompanyName ? ' <span class="text-muted">' + App.esc(l.CompanyName) + '</span>' : '') + '</span><span class="kind">Lead</span></a>';
        });
        $.each(OpportunityService.list({ q: text }).data.slice(0, 5), function (i, o) {
            html += '<a href="' + App.url('Opportunities/Details.html?id=' + o.OpportunityId) + '"><span>' + App.esc(o.OpportunityName) +
                '</span><span class="kind">Opportunity</span></a>';
        });
        $results.html(html || '<div class="none">No matches for "' + App.esc(text) + '".</div>').addClass('show');
    }

    $('#searchBox').on('input focus', function () { search(this.value); })
        .on('keydown', function (e) {
            if (e.key === 'Escape') { $results.removeClass('show'); }
            if (e.key === 'ArrowDown') { e.preventDefault(); $results.find('a:first').trigger('focus'); }
        });
    $results.on('keydown', 'a', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); $(this).next('a').trigger('focus'); }
        if (e.key === 'ArrowUp') { e.preventDefault(); var $p = $(this).prev('a'); ($p.length ? $p : $('#searchBox')).trigger('focus'); }
    });
    $('#searchForm').on('submit', function (e) {
        e.preventDefault();
        var $first = $results.find('a:first');
        if ($first.length) { window.location.href = $first.attr('href'); }
    });
    $(document).on('click', function (e) {
        if (!$(e.target).closest('#searchForm').length) { $results.removeClass('show'); }
    });
});
