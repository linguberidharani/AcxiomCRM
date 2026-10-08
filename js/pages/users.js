// Users list, user form and the Roles & Permissions page.

App.page(function (me) {

    var isAdmin = me.Role === 'Admin';

    // ---------------- list ----------------
    if ($('#userGrid').length) {
        $('#scopeText').text(isAdmin ? 'All user accounts' : 'You and the users reporting to you. Only an administrator can change accounts.');
        $('#newLink').toggleClass('d-none', !isAdmin);
        App.fillSelect($('#role'), $.map(Config.roles, function (r) { return { value: r, text: Config.roleNames[r] }; }), 'All');

        if (App.qs('role')) { $('#role').val(App.qs('role')); }

        var rowsById = {};
        var current = null;

        var columns = [
            {
                title: 'User', sort: 'FullName', render: function (u) {
                    return '<div class="d-flex align-items-center gap-2"><span class="avatar">' + App.esc(App.initials(u.FullName)) + '</span>' +
                        '<div>' + App.esc(u.FullName) + (u.UserId === me.UserId ? ' <span class="text-muted">(you)</span>' : '') +
                        '<span class="sub">' + App.esc(u.UserName) + '</span></div></div>';
                }
            },
            { title: 'Contact', sort: 'Email', render: function (u) { return App.esc(u.Email) + '<span class="sub num">' + App.esc(u.Phone) + '</span>'; } },
            { title: 'Role', sort: 'RoleName', key: 'RoleName' },
            { title: 'Reports to', sort: 'ManagerName', render: function (u) { return u.ManagerName ? App.esc(u.ManagerName) : '<span class="text-muted">-</span>'; } },
            {
                title: 'Account', sort: 'Status', render: function (u) {
                    var extra = '';
                    if (u.IsLocked) { extra = '<span class="sub">until ' + App.fmtDateTime(u.LockoutEnd).split(', ')[1] + '</span>'; }
                    else if (u.IsActive && u.FailedLoginCount) { extra = '<span class="sub">' + u.FailedLoginCount + ' failed attempt' + (u.FailedLoginCount === 1 ? '' : 's') + '</span>'; }
                    return App.tag(u.Status) + extra;
                }
            },
            { title: 'Last login', sort: 'LastLoginDate', render: function (u) { return u.LastLoginDate ? App.fmtDateTime(u.LastLoginDate) : '<span class="text-muted">Never</span>'; } }
        ];

        if (isAdmin) {
            columns.push({
                title: '', cls: 'row-actions', render: function (u) {
                    var html = '<a class="btn btn-sm" href="Edit.html?id=' + u.UserId + '" title="Edit" aria-label="Edit ' + App.esc(u.FullName) + '"><i class="bi bi-pencil"></i></a>' +
                        '<div class="dropdown d-inline-block"><button type="button" class="btn btn-sm" data-bs-toggle="dropdown" aria-expanded="false" aria-label="More actions for ' + App.esc(u.FullName) + '"><i class="bi bi-three-dots-vertical"></i></button>' +
                        '<ul class="dropdown-menu dropdown-menu-end">' +
                        '<li><button type="button" class="dropdown-item" data-act="reset" data-id="' + u.UserId + '">Reset password</button></li>';
                    if (u.IsLocked) { html += '<li><button type="button" class="dropdown-item" data-act="unlock" data-id="' + u.UserId + '">Unlock account</button></li>'; }
                    if (u.UserId !== me.UserId) {
                        html += '<li><button type="button" class="dropdown-item' + (u.IsActive ? ' text-danger' : '') + '" data-act="' + (u.IsActive ? 'deactivate' : 'activate') + '" data-id="' + u.UserId + '">' +
                            (u.IsActive ? 'Deactivate' : 'Activate') + '</button></li>';
                    }
                    return html + '</ul></div>';
                }
            });
        }

        var grid = App.grid({ el: '#userGrid', sortBy: 0, empty: 'No users match the search.', columns: columns });

        var search = function (keepPage) {
            var rows = UserService.list({ q: $('#q').val(), role: $('#role').val(), status: $('#status').val() }).data;
            rowsById = {};
            $.each(rows, function (i, u) { rowsById[u.UserId] = u; });
            if (keepPage) { grid.reload(rows); } else { grid.setRows(rows); }
        };

        $('#filterForm').on('input change', function () { search(); })
            .on('submit', function (e) { e.preventDefault(); })
            .on('reset', function () { setTimeout(search, 0); });

        var $reset = $('#resetForm');
        showPasswordRules('#Password', '#passwordRules');

        $('#userGrid').on('click', '[data-act]', function () {
            var act = $(this).data('act');
            current = rowsById[$(this).data('id')];
            if (!current) { return; }

            if (act === 'reset') {
                App.clearErrors($reset);
                $reset[0].reset();
                $('#Password').trigger('input');
                $('#resetText').text('Set a new password for ' + current.FullName + ' (' + current.UserName + '). This also unlocks the account.');
                bootstrap.Modal.getOrCreateInstance('#resetModal').show();
            } else if (act === 'unlock') {
                var r = UserService.unlock(current.UserId);
                if (!r.ok) { App.toast(r.message, 'danger'); return; }
                App.toast(current.FullName + ' was unlocked.');
                search(true);
            } else {
                var off = act === 'deactivate';
                App.confirm({
                    title: off ? 'Deactivate user' : 'Activate user',
                    message: off ? current.FullName + ' will not be able to sign in. Records assigned to this user stay as they are.' : current.FullName + ' will be able to sign in again.',
                    yes: off ? 'Deactivate' : 'Activate', danger: off
                }, function () {
                    var res = UserService.setActive(current.UserId, !off);
                    if (!res.ok) { App.toast(res.message, 'danger'); return; }
                    App.toast(current.FullName + (off ? ' was deactivated.' : ' was activated.'));
                    search(true);
                });
            }
        });

        $reset.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($reset);
            if (!$reset.valid()) { return; }
            var r = UserService.resetPassword(current.UserId, { Password: $('#Password').val(), ConfirmPassword: $('#ConfirmPassword').val() });
            if (!r.ok) { App.showErrors($reset, r); return; }
            bootstrap.Modal.getInstance('#resetModal').hide();
            App.toast('Password was reset for ' + current.FullName + '.');
            search(true);
        });

        search();
    }

    // ---------------- create / edit ----------------
    var $form = $('#userForm');
    if ($form.length) {
        var editing = $form.data('mode') === 'edit';
        var id = Number(App.qs('id'));

        App.fillSelect($('#Role'), $.map(Config.roles, function (r) { return { value: r, text: Config.roleNames[r] }; }), 'Select role');
        App.fillSelect($('#ManagerId'), UserService.managers(), 'No manager');

        var toggleManager = function () {
            var sales = $('#Role').val() === 'SalesExecutive';
            $('#ManagerId').prop('disabled', !sales);
            if (!sales) { $('#ManagerId').val(''); }
        };
        $('#Role').on('change', toggleManager);

        if (editing) {
            $('#passwordPanel').remove();      // passwords are changed with Reset password on the list
            var r = UserService.get(id);
            if (!r.ok) {
                App.flash(r.message, 'danger');
                App.go('Users/Index.html');
                return;
            }
            App.fillForm($form, r.data);
            $('#pageTitle').text('Edit ' + r.data.FullName);
            if (id === me.UserId) {
                // an admin cannot lock themselves out
                $('#Role, #IsActive').prop('disabled', true);
            }
        } else {
            showPasswordRules('#Password', '#passwordRules');
        }
        toggleManager();

        $form.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($form);
            if (!$form.valid()) { return; }

            var dto = App.formData($form);
            dto.Password = $('#Password').val();
            dto.ConfirmPassword = $('#ConfirmPassword').val();
            if (editing && id === me.UserId) { dto.Role = me.Role; dto.IsActive = true; }

            var result = editing ? UserService.update(id, dto) : UserService.create(dto);
            if (!result.ok) { App.showErrors($form, result); return; }

            App.flash(editing ? result.data.FullName + ' was updated.' : 'User ' + result.data.UserName + ' was created.');
            App.go('Users/Index.html');
        });
    }

    // ---------------- roles & permissions ----------------
    if ($('#roleList').length) {
        var roles = UserService.roles().data;
        $('#roleList').html(App.simpleTable([
            { title: 'Role', render: function (r) { return '<strong>' + App.esc(r.DisplayName) + '</strong>'; } },
            { title: 'What the role can do', key: 'Description' },
            { title: 'Users', cls: 'text-end num', render: function (r) { return '<a href="' + App.url('Users/Index.html?role=' + r.RoleName) + '">' + r.Users + '</a>'; } },
            { title: 'Active', cls: 'text-end num', key: 'ActiveUsers' }
        ], roles, 'No roles.'));

        $('#matrixBody').html($.map(Config.permissionMatrix, function (p) {
            function cell(v) { return '<td' + (v === 'No' ? ' class="no"' : '') + '>' + App.esc(v) + '</td>'; }
            return '<tr><th scope="row" class="fw-normal">' + App.esc(p.module) + '</th>' + cell(p.Admin) + cell(p.Manager) + cell(p.SalesExecutive) + '</tr>';
        }).join(''));
    }
});
