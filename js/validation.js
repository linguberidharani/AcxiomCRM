// Extra client-side rules for jquery.validate.unobtrusive.
// Each rule is switched on with a data-val-* attribute, the same way Razor tag helpers emit them.

(function ($) {

    if (!$.validator) { return; }

    // Fields are not re-checked on blur. A message that disappears on blur moves the Save button
    // while it is being clicked, and the click is lost. After the first submit a field is
    // re-checked as the user types, and dropdowns / date pickers when the value changes.
    $.validator.setDefaults({ onfocusout: false });

    $(document).on('change', 'form select, form input[type=date]', function () {
        var v = $(this.form).data('validator');
        if (v && this.name && (this.name in v.submitted || this.name in v.invalid)) { v.element(this); }
    });

    // the built-in email rule accepts "name@host" with no domain ending
    $.validator.methods.email = function (value, element) {
        return this.optional(element) || Config.emailPattern.test($.trim(value));
    };

    // data-val-phone
    $.validator.addMethod('phone', function (value, element) {
        return this.optional(element) || Config.phonePattern.test($.trim(value));
    });
    $.validator.unobtrusive.adapters.addBool('phone');

    // data-val-notpast : date cannot be earlier than today
    $.validator.addMethod('notpast', function (value, element) {
        return this.optional(element) || value >= App.today();
    });
    $.validator.unobtrusive.adapters.addBool('notpast');

    // data-val-closedate + data-val-closedate-stage="#Stage"
    // the close date may only be in the past when the opportunity is already Won or Lost
    $.validator.addMethod('closedate', function (value, element, stageSelector) {
        if (this.optional(element)) { return true; }
        var stage = $(stageSelector).val();
        if (stage === 'Won' || stage === 'Lost') { return true; }
        return value >= App.today();
    });
    $.validator.unobtrusive.adapters.add('closedate', ['stage'], function (options) {
        options.rules.closedate = options.params.stage || '#Stage';
        options.messages.closedate = options.message;
    });

    // data-val-passwordpolicy
    $.validator.addMethod('passwordpolicy', function (value, element) {
        return this.optional(element) || Auth.passwordOk(value);
    });
    $.validator.unobtrusive.adapters.addBool('passwordpolicy');

    // data-val-username
    $.validator.addMethod('username', function (value, element) {
        return this.optional(element) || Config.userNamePattern.test(value);
    });
    $.validator.unobtrusive.adapters.addBool('username');

    // amounts must be strictly above zero. data-val-range cannot express "> 0" for decimals.
    $.validator.addMethod('positive', function (value, element) {
        return this.optional(element) || Number(value) > 0;
    });
    $.validator.unobtrusive.adapters.addBool('positive');

})(jQuery);


// live checklist under a new password box
function showPasswordRules(inputSelector, listSelector) {
    var $list = $(listSelector), rules = Auth.passwordRules();
    $list.html($.map(rules, function (r) {
        return '<li data-rule="' + r.id + '">' + r.text + '</li>';
    }).join(''));
    $(inputSelector).on('input', function () {
        var value = this.value;
        $.each(rules, function (i, r) {
            $list.find('[data-rule="' + r.id + '"]').toggleClass('ok', r.test(value));
        });
    });
}
