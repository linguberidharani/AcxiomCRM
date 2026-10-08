// Sign in, Register and Change password pages.

App.page(function (me) {

    // ---- sign in ----
    var $login = $('#loginForm');
    if ($login.length) {
        if (me) { App.go('Dashboard/Index.html'); return; }

        $login.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($login);
            if (!$login.valid()) { return; }

            var r = Auth.login($('#Login').val(), $('#Password').val(), $('#RememberMe').prop('checked'));
            if (!r.ok) {
                $login.find('.form-alert').text(r.message).removeClass('d-none');
                $('#Password').val('').trigger('focus');
                return;
            }

            // only go back to a page inside this site
            var back = App.qs('returnUrl');
            if (back && /^[A-Za-z]+\/[A-Za-z]+\.html(\?[\w=&%.-]*)?$/.test(back)) { App.go(back); }
            else { App.go('Dashboard/Index.html'); }
        });

        $('#showPassword').on('click', function () {
            var $p = $('#Password'), show = $p.attr('type') === 'password';
            $p.attr('type', show ? 'text' : 'password');
            $(this).attr('aria-pressed', show).find('i').attr('class', show ? 'bi bi-eye-slash' : 'bi bi-eye');
        });

        $('.test-accounts button[data-login]').on('click', function () {
            $('#Login').val($(this).data('login'));
            $('#Password').val($(this).data('password'));
            App.clearErrors($login);
            $login.find('button[type=submit]').trigger('focus');
        });

        $('#resetData').on('click', function () {
            App.confirm({
                title: 'Reset sample data',
                message: 'This removes everything you have added on this browser and loads the sample records again.',
                yes: 'Reset data'
            }, function () {
                Store.reset();
                App.toast('Sample data has been loaded again.');
            });
        });
    }

    // ---- register ----
    var $register = $('#registerForm');
    if ($register.length) {
        showPasswordRules('#Password', '#passwordRules');

        $register.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($register);
            if (!$register.valid()) { return; }

            var r = Auth.register({
                FullName: $('#FullName').val(), UserName: $('#UserName').val(),
                Email: $('#Email').val(), Phone: $('#Phone').val(),
                Password: $('#Password').val(), ConfirmPassword: $('#ConfirmPassword').val()
            });
            if (!r.ok) { App.showErrors($register, r); return; }

            // sign the new user in straight away
            var login = Auth.login(r.data.UserName, $('#Password').val(), false);
            if (login.ok) {
                App.flash('Welcome to AcxiomCRM, ' + r.data.FullName + '.');
                App.go('Dashboard/Index.html');
            } else {
                App.flash('Your account has been created. Please sign in.');
                App.go('Account/Login.html');
            }
        });
    }

    // ---- change password ----
    var $password = $('#passwordForm');
    if ($password.length) {
        showPasswordRules('#Password', '#passwordRules');

        $password.on('submit', function (e) {
            e.preventDefault();
            App.clearErrors($password);
            if (!$password.valid()) { return; }

            var r = Auth.changePassword({
                CurrentPassword: $('#CurrentPassword').val(),
                Password: $('#Password').val(),
                ConfirmPassword: $('#ConfirmPassword').val()
            });
            if (!r.ok) { App.showErrors($password, r); return; }
            App.flash('Your password has been changed.');
            App.go('Dashboard/Index.html');
        });
    }
});
