// Common helpers used by every page (formatting, alerts, confirm dialog, table with paging).

var App = (function ($) {

    // work out the path back to the site root from the script tag,
    // so the same links work from /Customers/Index.html and /index.html
    var root = '';
    var tags = document.getElementsByTagName('script');
    for (var i = 0; i < tags.length; i++) {
        var src = tags[i].getAttribute('src') || '';
        var pos = src.indexOf('js/site.js');
        if (pos >= 0) { root = src.substring(0, pos); }
    }

    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function toDateStr(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function today() { return toDateStr(new Date()); }

    function parseDate(v) {
        if (!v) { return null; }
        if (v instanceof Date) { return v; }
        // date only values are kept as yyyy-MM-dd and treated as local dates
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            var p = v.split('-');
            return new Date(+p[0], +p[1] - 1, +p[2]);
        }
        var d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }

    function addDays(dateStr, n) {
        var d = parseDate(dateStr);
        d.setDate(d.getDate() + n);
        return toDateStr(d);
    }

    function fmtDate(v) {
        var d = parseDate(v);
        if (!d) { return ''; }
        return pad(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    }

    function fmtDateTime(v) {
        var d = parseDate(v);
        if (!d) { return ''; }
        var h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) { h = 12; }
        return fmtDate(d) + ', ' + h + ':' + pad(d.getMinutes()) + ' ' + ampm;
    }

    function money(n) {
        n = Number(n) || 0;
        return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }

    // 1250000 -> ₹12.5 L, 23000000 -> ₹2.3 Cr
    function moneyShort(n) {
        n = Number(n) || 0;
        if (n >= 10000000) { return '₹' + trimZero((n / 10000000).toFixed(2)) + ' Cr'; }
        if (n >= 100000) { return '₹' + trimZero((n / 100000).toFixed(2)) + ' L'; }
        return money(n);
    }

    function trimZero(s) { return s.replace(/\.?0+$/, ''); }

    function esc(v) {
        if (v === null || v === undefined) { return ''; }
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function qs(name) {
        var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
    }

    function url(path) { return root + path; }

    function go(path) { window.location.href = url(path); }

    // ---- status tags -------------------------------------------------

    var tagColors = {
        Active: 'green', Inactive: 'grey',
        New: 'blue', Contacted: 'indigo', Qualified: 'teal', Unqualified: 'grey', Converted: 'green', Lost: 'red',
        Qualification: 'blue', Proposal: 'indigo', Negotiation: 'amber', Won: 'green',
        Open: 'blue',
        Planned: 'blue', Completed: 'green', Missed: 'red', Cancelled: 'grey', Overdue: 'red', Today: 'amber',
        High: 'red', Medium: 'amber', Low: 'grey',
        Locked: 'red', Success: 'green', Failed: 'red', Denied: 'amber'
    };

    function tag(text) {
        if (!text) { return ''; }
        return '<span class="tag tag-' + (tagColors[text] || 'grey') + '">' + esc(text) + '</span>';
    }

    function initials(name) {
        var parts = $.trim(name || '').split(/\s+/);
        if (!parts[0]) { return '?'; }
        return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
    }

    // ---- messages ----------------------------------------------------

    function toast(message, type) {
        type = type || 'success';
        var icons = { success: 'bi-check-circle', danger: 'bi-x-circle', warning: 'bi-exclamation-triangle', info: 'bi-info-circle' };
        var $box = $('#toastBox');
        if (!$box.length) {
            $box = $('<div id="toastBox" class="toast-container position-fixed top-0 end-0 p-3"></div>').appendTo('body');
        }
        var $t = $('<div class="toast app-toast app-toast-' + type + '" role="alert" aria-live="assertive" aria-atomic="true">' +
            '<div class="d-flex"><div class="toast-body"><i class="bi ' + icons[type] + ' me-2"></i>' + esc(message) + '</div>' +
            '<button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div></div>');
        $box.append($t);
        var t = new bootstrap.Toast($t[0], { delay: type === 'danger' ? 6000 : 3500 });
        $t.on('hidden.bs.toast', function () { $t.remove(); });
        t.show();
    }

    // message that should appear on the next page (same idea as TempData)
    function flash(message, type) {
        sessionStorage.setItem('acxiomcrm.flash', JSON.stringify({ message: message, type: type || 'success' }));
    }

    function showFlash() {
        var raw = sessionStorage.getItem('acxiomcrm.flash');
        if (!raw) { return; }
        sessionStorage.removeItem('acxiomcrm.flash');
        try {
            var f = JSON.parse(raw);
            toast(f.message, f.type);
        } catch (e) { /* ignore */ }
    }

    function confirmBox(opts, onYes) {
        var $m = $('#confirmModal');
        if (!$m.length) {
            $m = $('<div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmTitle" aria-hidden="true">' +
                '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
                '<div class="modal-header"><h5 class="modal-title" id="confirmTitle"></h5>' +
                '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
                '<div class="modal-body"></div>' +
                '<div class="modal-footer"><button type="button" class="btn btn-light border" id="confirmNo" data-bs-dismiss="modal">Cancel</button>' +
                '<button type="button" class="btn" id="confirmYes"></button></div>' +
                '</div></div></div>').appendTo('body');
        }
        $m.find('.modal-title').text(opts.title || 'Please confirm');
        $m.find('.modal-body').text(opts.message || 'Are you sure?');
        $m.find('#confirmNo').text(opts.no || 'Cancel');
        $m.find('#confirmYes').attr('class', 'btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger'))
            .text(opts.yes || 'Delete')
            .off('click').on('click', function () {
                bootstrap.Modal.getInstance($m[0]).hide();
                onYes();
            });
        bootstrap.Modal.getOrCreateInstance($m[0]).show();
    }

    // ---- forms -------------------------------------------------------

    function fillSelect($sel, items, placeholder) {
        var html = placeholder !== undefined && placeholder !== null ? '<option value="">' + esc(placeholder) + '</option>' : '';
        $.each(items, function (i, it) {
            if (typeof it === 'object') {
                html += '<option value="' + esc(it.value) + '">' + esc(it.text) + '</option>';
            } else {
                html += '<option value="' + esc(it) + '">' + esc(it) + '</option>';
            }
        });
        $sel.html(html);
    }

    function formData($form) {
        var data = {};
        $.each($form.serializeArray(), function (i, f) { data[f.name] = $.trim(f.value); });
        $form.find('input[type=checkbox][name]').each(function () { data[this.name] = this.checked; });
        return data;
    }

    function fillForm($form, obj) {
        $form.find('[name]').each(function () {
            var v = obj[this.name];
            if (v === undefined || v === null) { v = ''; }
            if (this.type === 'checkbox') { this.checked = !!v; }
            else { $(this).val(String(v)); }
        });
    }

    // puts the errors returned by a service next to the fields
    function showErrors($form, result) {
        var fieldErrors = {}, other = [];
        $.each(result.errors || {}, function (name, msg) {
            if ($form.find('[name="' + name + '"]').length) { fieldErrors[name] = msg; }
            else { other.push(msg); }
        });
        var v = $form.data('validator');
        if (v && !$.isEmptyObject(fieldErrors)) { v.showErrors(fieldErrors); }

        var text = result.message || 'Please correct the highlighted fields.';
        if (other.length) { text += ' ' + other.join(' '); }
        var $alert = $form.find('.form-alert');
        if ($alert.length) { $alert.text(text).removeClass('d-none'); }
        else { toast(text, 'danger'); }
        $form.find('.input-validation-error:first').trigger('focus');
    }

    function clearErrors($form) {
        $form.find('.form-alert').addClass('d-none').text('');
        var v = $form.data('validator');
        if (v) { v.resetForm(); }
        $form.find('.input-validation-error').removeClass('input-validation-error');
        $form.find('.field-validation-error').removeClass('field-validation-error').addClass('field-validation-valid').empty();
    }

    // ---- table with sorting and paging ---------------------------------

    function grid(opts) {
        var $el = $(opts.el);
        var st = {
            rows: opts.rows || [],
            page: 1,
            pageSize: opts.pageSize || Config.pageSize,
            sortCol: opts.sortBy === undefined ? -1 : opts.sortBy,
            desc: opts.sortDir === 'desc'
        };

        function sortValue(col, row) {
            if (typeof col.sort === 'function') { return col.sort(row); }
            return row[col.sort === true ? col.key : col.sort];
        }

        function sorted() {
            if (st.sortCol < 0) { return st.rows; }
            var col = opts.columns[st.sortCol];
            var list = st.rows.slice();
            list.sort(function (a, b) {
                var x = sortValue(col, a), y = sortValue(col, b);
                if (x === null || x === undefined) { x = ''; }
                if (y === null || y === undefined) { y = ''; }
                if (typeof x === 'string') { x = x.toLowerCase(); }
                if (typeof y === 'string') { y = y.toLowerCase(); }
                if (x < y) { return st.desc ? 1 : -1; }
                if (x > y) { return st.desc ? -1 : 1; }
                return 0;
            });
            return list;
        }

        function render() {
            var rows = sorted();
            var total = rows.length;
            var pages = Math.max(1, Math.ceil(total / st.pageSize));
            if (st.page > pages) { st.page = pages; }
            var start = (st.page - 1) * st.pageSize;
            var pageRows = rows.slice(start, start + st.pageSize);

            var html = '<div class="table-responsive"><table class="table table-hover align-middle mb-0 grid-table"><thead><tr>';
            $.each(opts.columns, function (i, c) {
                var cls = c.cls || '';
                if (c.sort) {
                    var icon = st.sortCol === i ? (st.desc ? 'bi-caret-down-fill' : 'bi-caret-up-fill') : 'bi-chevron-expand';
                    html += '<th scope="col" class="sortable ' + cls + '" data-col="' + i + '" tabindex="0"' +
                        (st.sortCol === i ? ' aria-sort="' + (st.desc ? 'descending' : 'ascending') + '"' : '') + '>' +
                        esc(c.title) + ' <i class="bi ' + icon + '"></i></th>';
                } else {
                    html += '<th scope="col" class="' + cls + '">' + esc(c.title) + '</th>';
                }
            });
            html += '</tr></thead><tbody>';

            if (!total) {
                html += '<tr><td colspan="' + opts.columns.length + '" class="grid-empty">' + esc(opts.empty || 'No records found.') + '</td></tr>';
            }
            $.each(pageRows, function (r, row) {
                html += '<tr>';
                $.each(opts.columns, function (i, c) {
                    html += '<td class="' + (c.cls || '') + '">' + (c.render ? c.render(row) : esc(row[c.key])) + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';

            html += '<div class="grid-footer"><div class="grid-count">';
            html += total ? 'Showing ' + (start + 1) + ' to ' + (start + pageRows.length) + ' of ' + total : '0 records';
            html += '</div>';
            if (pages > 1) {
                html += '<nav aria-label="Pages"><ul class="pagination pagination-sm mb-0">';
                html += pageLink(st.page - 1, 'Previous', st.page === 1, false);
                var from = Math.max(1, st.page - 2), to = Math.min(pages, from + 4);
                from = Math.max(1, to - 4);
                for (var p = from; p <= to; p++) { html += pageLink(p, p, false, p === st.page); }
                html += pageLink(st.page + 1, 'Next', st.page === pages, false);
                html += '</ul></nav>';
            }
            html += '</div>';
            $el.html(html);
        }

        function pageLink(p, text, disabled, active) {
            return '<li class="page-item' + (disabled ? ' disabled' : '') + (active ? ' active' : '') + '">' +
                '<a class="page-link" href="#" data-page="' + p + '">' + text + '</a></li>';
        }

        function sortBy(i) {
            if (st.sortCol === i) { st.desc = !st.desc; }
            else { st.sortCol = i; st.desc = false; }
            render();
        }

        $el.on('click', 'th.sortable', function () { sortBy(+$(this).data('col')); });
        $el.on('keydown', 'th.sortable', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(+$(this).data('col')); }
        });
        $el.on('click', 'a[data-page]', function (e) {
            e.preventDefault();
            if ($(this).parent().hasClass('disabled')) { return; }
            st.page = +$(this).data('page');
            render();
        });

        render();

        return {
            setRows: function (rows) { st.rows = rows; st.page = 1; render(); },
            reload: function (rows) { st.rows = rows; render(); },   // keeps the current page
            rows: function () { return sorted(); }
        };
    }

    // small table without paging, used on the details pages
    function simpleTable(columns, rows, empty) {
        if (!rows.length) { return '<div class="grid-empty">' + esc(empty) + '</div>'; }
        var html = '<div class="table-responsive"><table class="table align-middle mb-0 grid-table"><thead><tr>';
        $.each(columns, function (i, c) { html += '<th scope="col" class="' + (c.cls || '') + '">' + esc(c.title) + '</th>'; });
        html += '</tr></thead><tbody>';
        $.each(rows, function (r, row) {
            html += '<tr>';
            $.each(columns, function (i, c) { html += '<td class="' + (c.cls || '') + '">' + (c.render ? c.render(row) : esc(row[c.key])) + '</td>'; });
            html += '</tr>';
        });
        return html + '</tbody></table></div>';
    }

    // "Status: Active to Inactive" style text for one audit record
    function auditSummary(a) {
        var o = {}, n = {};
        try { o = a.OldValue ? JSON.parse(a.OldValue) : {}; n = a.NewValue ? JSON.parse(a.NewValue) : {}; } catch (e) { /* ignore */ }
        function show(key, v) {
            if (v === null || v === undefined || v === '') { return 'blank'; }
            if (key === 'AssignedTo' || key === 'ManagerId') { return Svc.userName(v); }
            if (key === 'Amount' || key === 'ExpectedValue') { return money(v); }
            if (/Date$/.test(key)) { return fmtDate(v); }
            if (v === true) { return 'Yes'; }
            if (v === false) { return 'No'; }
            return String(v);
        }
        function label(key) { return key.replace(/([a-z])([A-Z])/g, '$1 $2'); }
        var parts = [];
        $.each(n, function (key, v) {
            if (o[key] !== undefined) { parts.push(label(key) + ': ' + show(key, o[key]) + ' to ' + show(key, v)); }
        });
        return parts.join('; ');
    }

    function timeline(rows, empty) {
        if (!rows.length) { return '<li class="text-muted">' + esc(empty || 'No history yet.') + '</li>'; }
        return $.map(rows, function (a) {
            var summary = auditSummary(a);
            return '<li><strong>' + esc(a.Action) + '</strong> by ' + esc(a.UserFullName) +
                '<div class="when">' + fmtDateTime(a.CreatedDate) + '</div>' +
                (summary ? '<div>' + esc(summary) + '</div>' : (a.Details ? '<div>' + esc(a.Details) + '</div>' : '')) + '</li>';
        }).join('');
    }

    function exportCsv(fileName, columns, rows) {
        function cell(v) {
            if (v === null || v === undefined) { v = ''; }
            v = String(v);
            // stop Excel treating a value as a formula
            if (/^[=+\-@]/.test(v)) { v = "'" + v; }
            return '"' + v.replace(/"/g, '""') + '"';
        }
        var lines = [$.map(columns, function (c) { return cell(c.title); }).join(',')];
        $.each(rows, function (i, row) {
            lines.push($.map(columns, function (c) {
                return cell(typeof c.value === 'function' ? c.value(row) : row[c.value]);
            }).join(','));
        });
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    return {
        root: root,
        url: url,
        go: go,
        qs: qs,
        esc: esc,
        today: today,
        toDateStr: toDateStr,
        parseDate: parseDate,
        addDays: addDays,
        fmtDate: fmtDate,
        fmtDateTime: fmtDateTime,
        money: money,
        moneyShort: moneyShort,
        tag: tag,
        initials: initials,
        toast: toast,
        flash: flash,
        showFlash: showFlash,
        confirm: confirmBox,
        fillSelect: fillSelect,
        formData: formData,
        fillForm: fillForm,
        showErrors: showErrors,
        clearErrors: clearErrors,
        grid: grid,
        simpleTable: simpleTable,
        auditSummary: auditSummary,
        timeline: timeline,
        exportCsv: exportCsv
    };

})(jQuery);
