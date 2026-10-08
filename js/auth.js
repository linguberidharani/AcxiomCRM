// Login, register, logout, password rules, lockout and "who can see what".
// On the server this is handled by ASP.NET Core Identity. The checks are repeated here
// so the screens behave the same way while the backend is not connected.

var Auth = (function () {

    var SESSION_KEY = 'acxiomcrm.session';
    var current;   // cached for the page

    // ---- hashing -----------------------------------------------------

    // plain SHA-256 so no password is ever kept as text in the browser store
    function sha256(ascii) {
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }

        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var i, j;
        var result = '';
        var words = [];
        var asciiBitLength = ascii.length * 8;

        var hash = sha256.h = sha256.h || [];
        var k = sha256.k = sha256.k || [];
        var primeCounter = k.length;

        var isComposite = {};
        for (var candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
                hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }

        ascii += '\x80';
        while (ascii.length % 64 - 56) { ascii += '\x00'; }
        for (i = 0; i < ascii.length; i++) {
            j = ascii.charCodeAt(i);
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words.length] = ((asciiBitLength / maxWord) | 0);
        words[words.length] = (asciiBitLength);

        for (j = 0; j < words.length;) {
            var w = words.slice(j, j += 16);
            var oldHash = hash;
            hash = hash.slice(0, 8);

            for (i = 0; i < 64; i++) {
                var w15 = w[i - 15], w2 = w[i - 2];
                var a = hash[0], e = hash[4];
                var temp1 = hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + w[i - 7]
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0);
                var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }

            for (i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; }
        }

        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                var b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    }

    function newSalt() {
        var bytes = new Uint8Array(8), s = '';
        window.crypto.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) { s += ('0' + bytes[i].toString(16)).slice(-2); }
        return s;
    }

    function hashPassword(password, salt) {
        var value = unescape(encodeURIComponent(password));   // utf-8 bytes
        var h = sha256(salt + value);
        for (var i = 0; i < 200; i++) { h = sha256(h + salt); }
        return h;
    }

    // ---- password policy ---------------------------------------------

    function passwordRules() {
        var p = Config.password;
        var rules = [{ id: 'len', text: 'At least ' + p.minLength + ' characters', test: function (v) { return v.length >= p.minLength; } }];
        if (p.requireUpper) { rules.push({ id: 'upper', text: 'One uppercase letter', test: function (v) { return /[A-Z]/.test(v); } }); }
        if (p.requireLower) { rules.push({ id: 'lower', text: 'One lowercase letter', test: function (v) { return /[a-z]/.test(v); } }); }
        if (p.requireDigit) { rules.push({ id: 'digit', text: 'One number', test: function (v) { return /[0-9]/.test(v); } }); }
        if (p.requireSpecial) { rules.push({ id: 'special', text: 'One special character', test: function (v) { return /[^A-Za-z0-9]/.test(v); } }); }
        return rules;
    }

    function passwordOk(value) {
        var ok = true;
        $.each(passwordRules(), function (i, r) { if (!r.test(value || '')) { ok = false; } });
        return ok;
    }

    var PASSWORD_MESSAGE = 'Password does not meet the password policy.';

    // ---- session -----------------------------------------------------

    function readSession() {
        var raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
        if (!raw) { return null; }
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function writeSession(s) {
        var box = s.Remember ? localStorage : sessionStorage;
        box.setItem(SESSION_KEY, JSON.stringify(s));
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        current = undefined;
    }

    function toDto(u) {
        // never hand the hash or salt to the pages
        return {
            UserId: u.UserId, FullName: u.FullName, UserName: u.UserName, Email: u.Email, Phone: u.Phone,
            Role: u.Role, ManagerId: u.ManagerId, IsActive: u.IsActive,
            IsLocked: isLocked(u), LockoutEnd: u.LockoutEnd, FailedLoginCount: u.FailedLoginCount,
            CreatedDate: u.CreatedDate, LastLoginDate: u.LastLoginDate
        };
    }

    function isLocked(u) {
        return !!u.LockoutEnd && new Date(u.LockoutEnd).getTime() > Date.now();
    }

    function user() {
        if (current !== undefined) { return current; }
        current = null;
        var s = readSession();
        if (!s) { return null; }
        if (new Date(s.Expires).getTime() < Date.now()) { clearSession(); current = null; return null; }
        var u = Store.find('users', s.UserId);
        if (!u || !u.IsActive) { clearSession(); current = null; return null; }

        // sliding expiry
        s.Expires = new Date(Date.now() + Config.sessionMinutes * 60000).toISOString();
        writeSession(s);
        current = toDto(u);
        return current;
    }

    function findByLogin(login) {
        login = $.trim(login).toLowerCase();
        var found = null;
        $.each(Store.all('users'), function (i, u) {
            if (u.Email.toLowerCase() === login || u.UserName.toLowerCase() === login) { found = u; }
        });
        return found;
    }

    function login(loginName, password, remember) {
        var generic = 'Invalid username or password.';
        if (!$.trim(loginName) || !password) {
            return Svc.fail(400, 'Enter your username and password.');
        }

        var u = findByLogin(loginName);
        if (!u) {
            Audit.log({ userId: null, action: 'Failed Login', entity: 'Account', result: 'Failed', details: 'Unknown user: ' + $.trim(loginName).substring(0, 60) });
            return Svc.fail(401, generic);
        }

        if (isLocked(u)) {
            var mins = Math.ceil((new Date(u.LockoutEnd).getTime() - Date.now()) / 60000);
            Audit.log({ userId: u.UserId, action: 'Failed Login', entity: 'Account', recordId: u.UserId, result: 'Failed', details: 'Account is locked' });
            return Svc.fail(423, 'This account is locked. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' or contact your administrator.');
        }

        if (hashPassword(password, u.Salt) !== u.PasswordHash) {
            var count = (u.FailedLoginCount || 0) + 1;
            var max = Config.lockout.maxAttempts;
            if (count >= max) {
                Store.update('users', u.UserId, {
                    FailedLoginCount: 0,
                    LockoutEnd: new Date(Date.now() + Config.lockout.minutes * 60000).toISOString()
                });
                Audit.log({ userId: u.UserId, action: 'Failed Login', entity: 'Account', recordId: u.UserId, result: 'Failed', details: 'Wrong password (attempt ' + count + ' of ' + max + ')' });
                Audit.log({ userId: u.UserId, action: 'Lockout', entity: 'Account', recordId: u.UserId, result: 'Failed', details: 'Locked for ' + Config.lockout.minutes + ' minutes after ' + max + ' failed attempts' });
                return Svc.fail(423, 'Too many failed attempts. This account is locked for ' + Config.lockout.minutes + ' minutes.');
            }
            Store.update('users', u.UserId, { FailedLoginCount: count });
            Audit.log({ userId: u.UserId, action: 'Failed Login', entity: 'Account', recordId: u.UserId, result: 'Failed', details: 'Wrong password (attempt ' + count + ' of ' + max + ')' });
            var left = max - count;
            return Svc.fail(401, generic + (left <= 2 ? ' ' + left + ' attempt' + (left === 1 ? '' : 's') + ' left before the account is locked.' : ''));
        }

        if (!u.IsActive) {
            Audit.log({ userId: u.UserId, action: 'Failed Login', entity: 'Account', recordId: u.UserId, result: 'Failed', details: 'Account is inactive' });
            return Svc.fail(403, 'This account is inactive. Contact your administrator.');
        }

        Store.update('users', u.UserId, { FailedLoginCount: 0, LockoutEnd: null, LastLoginDate: new Date().toISOString() });
        clearSession();
        writeSession({
            UserId: u.UserId,
            Remember: !!remember,
            Expires: new Date(Date.now() + Config.sessionMinutes * 60000).toISOString()
        });
        current = undefined;
        Audit.log({ userId: u.UserId, action: 'Login', entity: 'Account', recordId: u.UserId });
        return Svc.ok(user());
    }

    function logout() {
        var u = user();
        if (u) { Audit.log({ userId: u.UserId, action: 'Logout', entity: 'Account', recordId: u.UserId }); }
        clearSession();
    }

    // checks shared by Register and by Users > Create / Edit
    function validateAccount(dto, id) {
        var e = {}, c = Svc.check;
        c.required(e, dto, 'FullName', 'Full Name is required.');
        c.maxLength(e, dto, 'FullName', Config.maxLength.name, 'Full Name');
        c.required(e, dto, 'UserName', 'Username is required.');
        if (!e.UserName && !Config.userNamePattern.test(dto.UserName)) {
            e.UserName = 'Username must be 4 to 30 characters: letters, numbers, dot or underscore.';
        }
        c.required(e, dto, 'Email', 'Email is required.');
        c.email(e, dto, 'Email');
        c.maxLength(e, dto, 'Email', Config.maxLength.email, 'Email');
        c.required(e, dto, 'Phone', 'Phone is required.');
        c.phone(e, dto, 'Phone');

        var dup = false;
        $.each(Store.all('users'), function (i, u) {
            if (u.UserId === id) { return; }
            if (!e.Email && u.Email.toLowerCase() === dto.Email.toLowerCase()) { e.Email = 'This email is already registered.'; dup = true; }
            if (!e.UserName && u.UserName.toLowerCase() === dto.UserName.toLowerCase()) { e.UserName = 'This username is already taken.'; dup = true; }
        });
        return { errors: e, duplicate: dup };
    }

    function validateNewPassword(e, dto) {
        if (!dto.Password) { e.Password = 'Password is required.'; }
        else if (!passwordOk(dto.Password)) { e.Password = PASSWORD_MESSAGE; }
        if (dto.ConfirmPassword !== undefined && !e.Password && dto.ConfirmPassword !== dto.Password) {
            e.ConfirmPassword = 'Password and confirmation do not match.';
        }
    }

    // self registration. New accounts start as Sales Executive, an admin can change the role later.
    function register(dto) {
        dto = Svc.trimAll(dto, ['Password', 'ConfirmPassword']);
        var v = validateAccount(dto, 0);
        validateNewPassword(v.errors, dto);
        if (!$.isEmptyObject(v.errors)) {
            return Svc.fail(v.duplicate ? 409 : 400, 'Registration could not be completed.', v.errors);
        }
        var salt = newSalt();
        var u = Store.insert('users', {
            FullName: dto.FullName, UserName: dto.UserName, Email: dto.Email, Phone: dto.Phone,
            PasswordHash: hashPassword(dto.Password, salt), Salt: salt,
            Role: 'SalesExecutive', ManagerId: null, IsActive: true,
            FailedLoginCount: 0, LockoutEnd: null,
            CreatedDate: new Date().toISOString(), LastLoginDate: null
        });
        Audit.log({ userId: u.UserId, action: 'Register', entity: 'User', recordId: u.UserId, newValue: { UserName: u.UserName, Role: u.Role } });
        return Svc.ok(toDto(u), 201);
    }

    function changePassword(dto) {
        var me = user();
        if (!me) { return Svc.fail(401, 'Please sign in.'); }
        var u = Store.find('users', me.UserId), e = {};
        if (!dto.CurrentPassword) { e.CurrentPassword = 'Current Password is required.'; }
        else if (hashPassword(dto.CurrentPassword, u.Salt) !== u.PasswordHash) { e.CurrentPassword = 'Current password is not correct.'; }
        validateNewPassword(e, dto);
        if (!e.Password && dto.Password === dto.CurrentPassword) { e.Password = 'New password must be different from the current password.'; }
        if (!$.isEmptyObject(e)) {
            Audit.log({ action: 'Password Change', entity: 'User', recordId: u.UserId, result: 'Failed' });
            return Svc.fail(400, 'Password was not changed.', e);
        }
        var salt = newSalt();
        Store.update('users', u.UserId, { PasswordHash: hashPassword(dto.Password, salt), Salt: salt });
        Audit.log({ action: 'Password Change', entity: 'User', recordId: u.UserId });
        return Svc.ok(null);
    }

    // ---- authorization -----------------------------------------------

    function is(role) {
        var u = user();
        return !!u && u.Role === role;
    }

    function can(module) {
        var u = user();
        var roles = Config.access[module];
        return !!u && !!roles && $.inArray(u.Role, roles) >= 0;
    }

    function teamIds(managerId) {
        var ids = [];
        $.each(Store.all('users'), function (i, x) { if (x.ManagerId === managerId) { ids.push(x.UserId); } });
        return ids;
    }

    // user ids whose records the signed-in user may see. null means everything (Admin).
    function scopeIds() {
        var u = user();
        if (!u) { return []; }
        if (u.Role === 'Admin') { return null; }
        if (u.Role === 'Manager') { return [u.UserId].concat(teamIds(u.UserId)); }
        return [u.UserId];
    }

    function inScope(userId) {
        var ids = scopeIds();
        return ids === null || $.inArray(userId, ids) >= 0;
    }

    return {
        newSalt: newSalt,
        hashPassword: hashPassword,
        passwordRules: passwordRules,
        passwordOk: passwordOk,
        passwordMessage: PASSWORD_MESSAGE,
        user: user,
        toDto: toDto,
        login: login,
        logout: logout,
        register: register,
        changePassword: changePassword,
        validateAccount: validateAccount,
        validateNewPassword: validateNewPassword,
        is: is,
        can: can,
        scopeIds: scopeIds,
        inScope: inScope,
        teamIds: teamIds
    };

})();
