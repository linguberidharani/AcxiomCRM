// Application settings and lookup lists.
// These will move to appsettings.json / enums once the backend is in place.

var Config = {
    appName: 'AcxiomCRM',
    version: '1.0',

    pageSize: 10,

    // 10 digit Indian mobile number
    phonePattern: /^[6-9][0-9]{9}$/,
    emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    userNamePattern: /^[a-zA-Z0-9._]{4,30}$/,

    password: {
        minLength: 8,
        requireUpper: true,
        requireLower: true,
        requireDigit: true,
        requireSpecial: true
    },

    lockout: {
        maxAttempts: 5,
        minutes: 15
    },

    sessionMinutes: 60,

    maxLength: {
        name: 100,
        company: 150,
        email: 150,
        address: 250,
        city: 60,
        subject: 150,
        notes: 1000
    },

    maxExpectedValue: 100000000,
    maxAmount: 1000000000,

    roles: ['Admin', 'Manager', 'SalesExecutive'],
    roleNames: {
        Admin: 'Admin',
        Manager: 'Manager',
        SalesExecutive: 'Sales Executive'
    },

    customerStatuses: ['Active', 'Inactive'],

    leadStatuses: ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost'],
    leadSources: ['Website', 'Referral', 'Cold Call', 'Email Campaign', 'Trade Show', 'Social Media', 'Partner'],
    leadPriorities: ['High', 'Medium', 'Low'],

    // allowed lead status changes. Converted is only set by the conversion step.
    leadTransitions: {
        New: ['Contacted', 'Unqualified', 'Lost'],
        Contacted: ['Qualified', 'Unqualified', 'Lost'],
        Qualified: ['Converted', 'Lost'],
        Unqualified: ['Contacted', 'Lost'],
        Converted: [],
        Lost: []
    },

    stages: ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    openStages: ['Qualification', 'Proposal', 'Negotiation'],
    stageProbability: {
        Qualification: 20,
        Proposal: 50,
        Negotiation: 75,
        Won: 100,
        Lost: 0
    },

    followUpTypes: ['Call', 'Meeting', 'Email', 'Demo', 'Site Visit'],
    followUpStatuses: ['Planned', 'Completed', 'Missed', 'Cancelled'],

    activityTypes: ['Call', 'Meeting', 'Email', 'Task'],
    activityStatuses: ['Planned', 'Completed', 'Cancelled'],

    states: ['Andhra Pradesh', 'Delhi', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh',
        'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'],

    // which roles can open which module
    access: {
        Dashboard: ['Admin', 'Manager', 'SalesExecutive'],
        Customers: ['Admin', 'Manager', 'SalesExecutive'],
        Leads: ['Admin', 'Manager', 'SalesExecutive'],
        Opportunities: ['Admin', 'Manager', 'SalesExecutive'],
        FollowUps: ['Admin', 'Manager', 'SalesExecutive'],
        Activities: ['Admin', 'Manager', 'SalesExecutive'],
        Reports: ['Admin', 'Manager', 'SalesExecutive'],
        Users: ['Admin', 'Manager'],          // list (a Manager sees the team, read-only)
        UserAdmin: ['Admin'],                 // create / edit user
        Roles: ['Admin'],
        AuditLog: ['Admin', 'Manager'],
        Account: ['Admin', 'Manager', 'SalesExecutive']
    },

    // shown on the Roles page (section 7.1 of the requirement document)
    permissionMatrix: [
        { module: 'Dashboard', Admin: 'Full', Manager: 'Team', SalesExecutive: 'Own / Assigned' },
        { module: 'Customers', Admin: 'Full', Manager: 'Team', SalesExecutive: 'Own / Assigned' },
        { module: 'Leads', Admin: 'Full', Manager: 'Team', SalesExecutive: 'Own / Assigned' },
        { module: 'Opportunities', Admin: 'Full', Manager: 'Team', SalesExecutive: 'Own / Assigned' },
        { module: 'Follow-Ups', Admin: 'Full', Manager: 'Team', SalesExecutive: 'Own / Assigned' },
        { module: 'Activities', Admin: 'Full', Manager: 'Team', SalesExecutive: 'Own / Assigned' },
        { module: 'User Management', Admin: 'Full', Manager: 'View team', SalesExecutive: 'No' },
        { module: 'Role Management', Admin: 'Full', Manager: 'No', SalesExecutive: 'No' },
        { module: 'Audit Log', Admin: 'Full', Manager: 'Team business events', SalesExecutive: 'No' },
        { module: 'Reports', Admin: 'All', Manager: 'Team reports', SalesExecutive: 'Own reports' }
    ]
};
