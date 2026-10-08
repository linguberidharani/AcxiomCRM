// Data access for the front end. Everything is kept in localStorage for now so the
// screens can be used without the server. Replace with EF Core repositories later.

var Store = (function () {

    var KEY = 'acxiomcrm.db';

    var keys = {
        users: 'UserId',
        customers: 'CustomerId',
        leads: 'LeadId',
        opportunities: 'OpportunityId',
        followUps: 'FollowUpId',
        activities: 'ActivityId',
        auditLogs: 'AuditLogId'
    };

    var db = null;

    function load() {
        if (db) { return db; }
        var raw = localStorage.getItem(KEY);
        if (raw) {
            try { db = JSON.parse(raw); } catch (e) { db = null; }
        }
        if (!db || db.version !== Seed.version) {
            db = Seed.build();
            save();
        }
        return db;
    }

    function save() {
        localStorage.setItem(KEY, JSON.stringify(db));
    }

    function copy(row) { return row ? $.extend({}, row) : null; }

    function all(table) {
        return $.map(load()[table], function (r) { return copy(r); });
    }

    function index(table, id) {
        var rows = load()[table], key = keys[table];
        for (var i = 0; i < rows.length; i++) {
            if (rows[i][key] === id) { return i; }
        }
        return -1;
    }

    function find(table, id) {
        var i = index(table, Number(id));
        return i < 0 ? null : copy(load()[table][i]);
    }

    function insert(table, row) {
        load();
        db.seq[table] = (db.seq[table] || 0) + 1;
        row = copy(row);
        row[keys[table]] = db.seq[table];
        db[table].push(row);
        save();
        return copy(row);
    }

    function update(table, id, changes) {
        var i = index(table, Number(id));
        if (i < 0) { return null; }
        $.extend(db[table][i], changes);
        save();
        return copy(db[table][i]);
    }

    function remove(table, id) {
        var i = index(table, Number(id));
        if (i < 0) { return false; }
        db[table].splice(i, 1);
        save();
        return true;
    }

    // wipes local data and loads the sample records again
    function reset() {
        db = Seed.build();
        save();
    }

    return { all: all, find: find, insert: insert, update: update, remove: remove, reset: reset };

})();
