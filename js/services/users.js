// User and role administration. Only an Admin can change anything here.
// A Manager gets a read-only list of the people in the team.

var UserService = (function () {

    var T = 'users';

    function toDto(u) {
        var d = Auth.toDto(u);
        d.RoleName = Config.roleNames[u.Role];
        d.ManagerName = u.ManagerId ? Svc.userName(u.ManagerId) : '';
        d.Status = !u.IsActive ? 'Inactive' : (d.IsLocked ? 'Locked' : 'Active');
        return d;
    }

    function adminOnly(recordId, what) {
        if (Auth.is('Admin')) { return null; }
        return Svc.denied('User', recordId || null, what);
    }

    function activeAdmins(exceptId) {
        return $.grep(Store.all(T), function (u) { return u.Role === 'Admin' && u.IsActive && u.UserId !== exceptId; }).length;
    }

    function checkRole(e, dto) {
        Svc.check.required(e, dto, 'Role', 'Role is required.');
        Svc.check.oneOf(e, dto, 'Role', Config.roles, 'Select a valid role.');
        dto.ManagerId = Number(dto.ManagerId) || null;
        if (dto.Role !== 'SalesExecutive') { dto.ManagerId = null; }
        if (dto.ManagerId) {
            var m = Store.find(T, dto.ManagerId);
            if (!m || m.Role !== 'Manager' || !m.IsActive) { e.ManagerId = 'Select a valid manager.'; }
        }
    }

    function list(filter) {
        if (!Auth.can('Users')) { return Svc.denied('User', null, 'List'); }
        filter = filter || {};
        var q = (filter.q || '').toLowerCase();
        var rows = Svc.scoped(Store.all(T), 'UserId');
        rows = $.map(rows, toDto);
        rows = $.grep(rows, function (u) {
            if (filter.role && u.Role !== filter.role) { return false; }
            if (filter.status && u.Status !== filter.status) { return false; }
            if (q && [u.FullName, u.UserName, u.Email, u.Phone].join(' ').toLowerCase().indexOf(q) < 0) { return false; }
            return true;
        });
        return Svc.ok(rows);
    }

    function get(id) {
        var denied = adminOnly(Number(id), 'View');
        if (denied) { return denied; }
        var u = Store.find(T, id);
        return u ? Svc.ok(toDto(u)) : Svc.notFound('User');
    }

    function create(dto) {
        var denied = adminOnly(null, 'Create');
        if (denied) { return denied; }

        dto = Svc.trimAll(dto, ['Password', 'ConfirmPassword']);
        var v = Auth.validateAccount(dto, 0), e = v.errors;
        checkRole(e, dto);
        Auth.validateNewPassword(e, dto);
        if (Svc.hasErrors(e)) { return Svc.fail(v.duplicate ? 409 : 400, 'User was not created.', e); }

        var salt = Auth.newSalt();
        var u = Store.insert(T, {
            FullName: dto.FullName, UserName: dto.UserName, Email: dto.Email, Phone: dto.Phone,
            PasswordHash: Auth.hashPassword(dto.Password, salt), Salt: salt,
            Role: dto.Role, ManagerId: dto.ManagerId, IsActive: dto.IsActive !== false,
            FailedLoginCount: 0, LockoutEnd: null,
            CreatedDate: new Date().toISOString(), LastLoginDate: null
        });
        Audit.log({
            action: 'Create', entity: 'User', recordId: u.UserId, details: u.UserName + ' created',
            newValue: { FullName: u.FullName, UserName: u.UserName, Email: u.Email, Role: u.Role, IsActive: u.IsActive }
        });
        return Svc.ok(toDto(u), 201);
    }

    function update(id, dto) {
        var denied = adminOnly(Number(id), 'Update');
        if (denied) { return denied; }
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('User'); }

        dto = Svc.trimAll(dto);
        var me = Auth.user();
        var v = Auth.validateAccount(dto, old.UserId), e = v.errors;
        checkRole(e, dto);
        var active = dto.IsActive !== false;

        if (old.UserId === me.UserId) {
            if (!e.Role && dto.Role !== old.Role) { e.Role = 'You cannot change your own role.'; }
            if (!active) { e.IsActive = 'You cannot deactivate your own account.'; }
        }
        if (old.Role === 'Admin' && old.IsActive && (dto.Role !== 'Admin' || !active) && activeAdmins(old.UserId) === 0) {
            e.Role = e.Role || 'At least one active Admin is required.';
        }
        if (Svc.hasErrors(e)) { return Svc.fail(v.duplicate ? 409 : 400, 'User was not saved.', e); }

        var u = Store.update(T, old.UserId, {
            FullName: dto.FullName, UserName: dto.UserName, Email: dto.Email, Phone: dto.Phone,
            Role: dto.Role, ManagerId: dto.ManagerId, IsActive: active
        });

        // people reporting to someone who is no longer a manager are left without one
        if (old.Role === 'Manager' && u.Role !== 'Manager') {
            $.each(Store.all(T), function (i, x) {
                if (x.ManagerId === u.UserId) { Store.update(T, x.UserId, { ManagerId: null }); }
            });
        }

        if (old.Role !== u.Role) {
            Audit.log({ action: 'Role Change', entity: 'User', recordId: u.UserId, oldValue: { Role: old.Role }, newValue: { Role: u.Role }, details: u.UserName });
        }
        if (old.IsActive !== u.IsActive) {
            Audit.log({ action: 'Status Change', entity: 'User', recordId: u.UserId, oldValue: { IsActive: old.IsActive }, newValue: { IsActive: u.IsActive }, details: u.UserName + (u.IsActive ? ' activated' : ' deactivated') });
        }
        var ch = Audit.changes(old, u, ['FullName', 'UserName', 'Email', 'Phone', 'ManagerId']);
        if (ch) { Audit.log({ action: 'Update', entity: 'User', recordId: u.UserId, oldValue: ch.oldValue, newValue: ch.newValue, details: u.UserName + ' updated' }); }
        return Svc.ok(toDto(u));
    }

    function setActive(id, active) {
        var denied = adminOnly(Number(id), active ? 'Activate' : 'Deactivate');
        if (denied) { return denied; }
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('User'); }
        if (old.UserId === Auth.user().UserId) { return Svc.fail(409, 'You cannot deactivate your own account.'); }
        if (!active && old.Role === 'Admin' && activeAdmins(old.UserId) === 0) { return Svc.fail(409, 'At least one active Admin is required.'); }
        if (old.IsActive === active) { return Svc.ok(toDto(old)); }
        var u = Store.update(T, old.UserId, { IsActive: active });
        Audit.log({ action: 'Status Change', entity: 'User', recordId: u.UserId, oldValue: { IsActive: old.IsActive }, newValue: { IsActive: active }, details: u.UserName + (active ? ' activated' : ' deactivated') });
        return Svc.ok(toDto(u));
    }

    function unlock(id) {
        var denied = adminOnly(Number(id), 'Unlock');
        if (denied) { return denied; }
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('User'); }
        var u = Store.update(T, old.UserId, { LockoutEnd: null, FailedLoginCount: 0 });
        Audit.log({ action: 'Unlock', entity: 'User', recordId: u.UserId, details: u.UserName + ' unlocked by administrator' });
        return Svc.ok(toDto(u));
    }

    // the new password is hashed straight away and is never written to the audit log
    function resetPassword(id, dto) {
        var denied = adminOnly(Number(id), 'Password reset');
        if (denied) { return denied; }
        var old = Store.find(T, id);
        if (!old) { return Svc.notFound('User'); }
        var e = {};
        Auth.validateNewPassword(e, dto);
        if (Svc.hasErrors(e)) { return Svc.fail(400, 'Password was not reset.', e); }
        var salt = Auth.newSalt();
        Store.update(T, old.UserId, { PasswordHash: Auth.hashPassword(dto.Password, salt), Salt: salt, FailedLoginCount: 0, LockoutEnd: null });
        Audit.log({ action: 'Password Reset', entity: 'User', recordId: old.UserId, details: 'Password reset by administrator for ' + old.UserName });
        return Svc.ok(null);
    }

    function roles() {
        var denied = adminOnly(null, 'Roles');
        if (denied) { return denied; }
        var about = {
            Admin: 'Full administration: users, roles, audit log, all CRM records and all reports.',
            Manager: 'Manages the CRM records, pipeline, follow-ups and reports of the team. No security administration.',
            SalesExecutive: 'Works on assigned customers, leads, opportunities, follow-ups and activities.'
        };
        var all = Store.all(T);
        return Svc.ok($.map(Config.roles, function (r, i) {
            return {
                RoleId: i + 1, RoleName: r, DisplayName: Config.roleNames[r], Description: about[r],
                Users: $.grep(all, function (u) { return u.Role === r; }).length,
                ActiveUsers: $.grep(all, function (u) { return u.Role === r && u.IsActive; }).length
            };
        }));
    }

    function managers() {
        var list = $.grep(Store.all(T), function (u) { return u.Role === 'Manager' && u.IsActive; });
        return $.map(list, function (u) { return { value: u.UserId, text: u.FullName }; });
    }

    return {
        list: list, get: get, create: create, update: update, setActive: setActive,
        unlock: unlock, resetPassword: resetPassword, roles: roles, managers: managers
    };

})();
