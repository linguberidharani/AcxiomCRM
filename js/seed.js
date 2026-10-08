// Sample data loaded the first time the site is opened.
// Dates are written as offsets from today so follow-ups and close dates always look current.

var Seed = (function () {

    var VERSION = 4;   // increase this to force everyone's browser to reload the sample data

    function day(n) { return App.addDays(App.today(), n); }

    function at(n, hour, min) {
        var d = new Date();
        d.setDate(d.getDate() + n);
        d.setHours(hour, min || 0, 0, 0);
        return d.toISOString();
    }

    function code(prefix, n) {
        return prefix + '-' + ('0000' + n).slice(-4);
    }

    function build() {
        var db = {
            version: VERSION,
            users: [], customers: [], leads: [], opportunities: [], followUps: [], activities: [], auditLogs: [],
            seq: {}
        };

        // ---- users (test passwords are listed in README) ----
        var users = [
            // name, user name, phone, role, manager, active, created (days ago)
            ['Kavitha Reddy', 'admin', '9848022110', 'Admin', null, true, -410],
            ['Suresh Menon', 'suresh.menon', '9845031276', 'Manager', null, true, -400],
            ['Anjali Deshpande', 'anjali.deshpande', '9822045613', 'Manager', null, true, -385],
            ['Rohit Verma', 'rohit.verma', '9810367421', 'SalesExecutive', 2, true, -330],
            ['Priya Nair', 'priya.nair', '9895214730', 'SalesExecutive', 2, true, -300],
            ['Karthik Rao', 'karthik.rao', '9886120954', 'SalesExecutive', 2, true, -260],
            ['Sneha Kulkarni', 'sneha.kulkarni', '9823316087', 'SalesExecutive', 3, true, -240],
            ['Imran Shaikh', 'imran.shaikh', '9867453201', 'SalesExecutive', 3, true, -190],
            ['Vikram Joshi', 'vikram.joshi', '9712508846', 'SalesExecutive', 3, false, -150]
        ];
        var defaultPassword = { Admin: 'Admin@123', Manager: 'Manager@123', SalesExecutive: 'Sales@123' };

        $.each(users, function (i, u) {
            var salt = Auth.newSalt();
            db.users.push({
                UserId: i + 1,
                FullName: u[0],
                UserName: u[1],
                Email: (u[1] === 'admin' ? 'admin' : u[1]) + '@acxiomcrm.local',
                Phone: u[2],
                PasswordHash: Auth.hashPassword(defaultPassword[u[3]], salt),
                Salt: salt,
                Role: u[3],
                ManagerId: u[4],
                IsActive: u[5],
                FailedLoginCount: 0,
                LockoutEnd: null,
                CreatedDate: at(u[6], 10, 15),
                LastLoginDate: u[5] ? at(-(i % 3) - 1, 9, 5 + i * 4) : at(-62, 9, 30)
            });
        });

        // ---- customers ----
        var customers = [
            // contact, company, email, phone, address, city, state, status, owner, created
            ['Arvind Kulkarni', 'Sahyadri Agro Foods Pvt Ltd', 'arvind@sahyadriagro.in', '9822310457', 'Plot 14, MIDC Bhosari', 'Pune', 'Maharashtra', 'Active', 7, -210],
            ['Meenakshi Sundaram', 'Kaveri Textiles', 'meenakshi@kaveritextiles.in', '9843066129', '22 Avinashi Road', 'Coimbatore', 'Tamil Nadu', 'Active', 5, -198],
            ['Rajesh Gupta', 'Gupta Steel Traders', 'rajesh.gupta@guptasteel.co.in', '9811742360', 'B-41 Loha Mandi', 'Ghaziabad', 'Uttar Pradesh', 'Active', 4, -185],
            ['Fatima Khan', 'Deccan Pharma Distributors', 'fatima@deccanpharma.in', '9849503372', '6-3-248 Banjara Hills Road No 1', 'Hyderabad', 'Telangana', 'Active', 6, -176],
            ['Nikhil Shah', 'Shah Polymers', 'nikhil@shahpolymers.in', '9825096614', '108 GIDC Vatva Phase 2', 'Ahmedabad', 'Gujarat', 'Active', 8, -160],
            ['Lakshmi Narayanan', 'Vaigai Logistics', 'lakshmi.n@vaigailogistics.in', '9842155708', '17 Bypass Road', 'Madurai', 'Tamil Nadu', 'Active', 5, -151],
            ['Deepak Malhotra', 'Malhotra Auto Components', 'deepak@malhotraauto.in', '9810228845', 'Plot 233, Udyog Vihar Phase 4', 'Gurugram', 'Haryana', 'Active', 4, -140],
            ['Ananya Bose', 'Hooghly Tea Exports', 'ananya.bose@hooghlytea.in', '9830471926', '9 Strand Road', 'Kolkata', 'West Bengal', 'Active', 8, -122],
            ['Harish Patel', 'Sabarmati Ceramics', 'harish@sabarmaticeramics.in', '9879340215', 'Survey No 62, Lakhdhirpur Road', 'Morbi', 'Gujarat', 'Active', 7, -110],
            ['Sunita Rao', 'Tungabhadra Packaging', 'sunita.rao@tbpackaging.in', '9880561347', '3rd Main, Peenya 2nd Stage', 'Bengaluru', 'Karnataka', 'Active', 6, -96],
            ['Manoj Pillai', 'Malabar Spices Co', 'manoj@malabarspices.in', '9847218063', 'Bazaar Road, Mattancherry', 'Kochi', 'Kerala', 'Active', 5, -88],
            ['Pooja Agarwal', 'Aravali Furnishings', 'pooja@aravalifurnishings.in', '9829174450', 'C-12 Sitapura Industrial Area', 'Jaipur', 'Rajasthan', 'Active', 4, -75],
            ['Vivek Chatterjee', 'Eastern Print Works', 'vivek@easternprint.in', '9831650972', '44 Canal East Road', 'Kolkata', 'West Bengal', 'Inactive', 8, -230],
            ['Ramya Krishnan', 'Nilgiri Dairy Products', 'ramya@nilgiridairy.in', '9840337581', '51 Poonamallee High Road', 'Chennai', 'Tamil Nadu', 'Active', 6, -48],
            ['Sandeep Singh', 'Doaba Farm Equipment', 'sandeep@doabafarm.in', '9814206639', 'GT Road, Dhandari Kalan', 'Ludhiana', 'Punjab', 'Active', 4, -33],
            ['Geeta Joshi', 'Narmada Solar Solutions', 'geeta.joshi@narmadasolar.in', '9826043318', '27 Scheme No 78, Vijay Nagar', 'Indore', 'Madhya Pradesh', 'Active', 7, -41]
        ];
        $.each(customers, function (i, c) {
            db.customers.push({
                CustomerId: i + 1, CustomerCode: code('CUS', i + 1),
                CustomerName: c[0], CompanyName: c[1], Email: c[2], Phone: c[3],
                Address: c[4], City: c[5], State: c[6], Status: c[7], AssignedTo: c[8],
                Notes: '',
                CreatedDate: at(c[9], 11, 20 + i), CreatedBy: c[8], ModifiedDate: null
            });
        });
        db.customers[1].Notes = 'Prefers calls after 4 pm. Decision is taken jointly with her brother who handles finance.';
        db.customers[6].Notes = 'Key account. AMC renewal comes up every April.';
        db.customers[12].Notes = 'Unit closed for renovation, marked inactive until they reopen.';
        db.customers[12].ModifiedDate = at(-58, 15, 40);

        // ---- leads ----
        var leads = [
            // name, company, email, phone, source, status, priority, expected value, owner, created, converted customer
            ['Aditya Bhatt', 'Bhatt Cold Chain', 'aditya@bhattcoldchain.in', '9909126734', 'Website', 'New', 'High', 650000, 8, -2, null],
            ['Shruti Hegde', 'Canara Coffee Works', 'shruti@canaracoffee.in', '9449051283', 'Trade Show', 'New', 'Medium', 380000, 6, -3, null],
            ['Mohammed Rafi', 'Charminar Bakers', 'rafi@charminarbakers.in', '9700348215', 'Cold Call', 'New', 'Low', 120000, 6, -1, null],
            ['Neha Saxena', 'Saxena Medicals', 'neha@saxenamedicals.in', '9415620087', 'Referral', 'New', 'Medium', 290000, 4, -4, null],
            ['Gaurav Mehta', 'Mehta Paper Mills', 'gaurav@mehtapaper.in', '9824417590', 'Email Campaign', 'Contacted', 'High', 1400000, 8, -12, null],
            ['Divya Iyer', 'Iyer & Sons Jewellers', 'divya@iyerjewellers.in', '9841276305', 'Referral', 'Contacted', 'High', 520000, 5, -15, null],
            ['Tarun Kapoor', 'Kapoor Hosiery', 'tarun@kapoorhosiery.in', '9872104466', 'Website', 'Contacted', 'Medium', 310000, 4, -9, null],
            ['Rekha Pawar', 'Pawar Sugar Industries', 'rekha@pawarsugar.in', '9850739921', 'Partner', 'Contacted', 'Low', 870000, 7, -18, null],
            ['Ashok Naidu', 'Godavari Aqua Feeds', 'ashok@godavariaqua.in', '9866015748', 'Trade Show', 'Qualified', 'High', 1150000, 6, -26, null],
            ['Kiran Desai', 'Desai Machine Tools', 'kiran@desaimachinetools.in', '9898231607', 'Referral', 'Qualified', 'High', 960000, 8, -30, null],
            ['Swati Mishra', 'Mishra Handlooms', 'swati@mishrahandlooms.in', '9935482016', 'Social Media', 'Qualified', 'Medium', 240000, 4, -22, null],
            ['Joseph Mathew', 'Periyar Rubber Estates', 'joseph@periyarrubber.in', '9447360182', 'Cold Call', 'Unqualified', 'Low', 150000, 5, -40, null],
            ['Alok Tiwari', 'Tiwari Stationers', 'alok@tiwaristationers.in', '9889247713', 'Website', 'Unqualified', 'Low', 60000, 4, -52, null],
            ['Bhavna Trivedi', 'Trivedi Dyes & Chemicals', 'bhavna@trivedidyes.in', '9825513094', 'Email Campaign', 'Lost', 'Medium', 700000, 8, -70, null],
            ['Ramya Krishnan', 'Nilgiri Dairy Products', 'ramya@nilgiridairy.in', '9840337581', 'Trade Show', 'Converted', 'High', 720000, 6, -64, 14],
            ['Sandeep Singh', 'Doaba Farm Equipment', 'sandeep@doabafarm.in', '9814206639', 'Referral', 'Converted', 'Medium', 590000, 4, -51, 15],
            ['Geeta Joshi', 'Narmada Solar Solutions', 'geeta.joshi@narmadasolar.in', '9826043318', 'Website', 'Converted', 'High', 1350000, 7, -66, 16],
            ['Prakash Shetty', 'Udupi Hospitality Group', 'prakash@udupihospitality.in', '9844097365', 'Partner', 'Lost', 'High', 1800000, 5, -85, null]
        ];
        $.each(leads, function (i, l) {
            db.leads.push({
                LeadId: i + 1, LeadCode: code('LD', i + 1),
                LeadName: l[0], CompanyName: l[1], Email: l[2], Phone: l[3],
                Source: l[4], Status: l[5], Priority: l[6], ExpectedValue: l[7], AssignedTo: l[8],
                Notes: '',
                CreatedDate: at(l[9], 10, 5 + i * 2), CreatedBy: l[8],
                ConvertedCustomerId: l[10],
                ConvertedDate: l[10] ? db.customers[l[10] - 1].CreatedDate : null
            });
        });
        db.leads[4].Notes = 'Wants a demo for the plant head before sharing the budget.';
        db.leads[8].Notes = 'Budget approved. Comparing us with one other vendor.';
        db.leads[13].Notes = 'Went with an in-house team.';
        db.leads[17].Notes = 'Lost on price.';

        // ---- opportunities ----
        var opps = [
            // name, customer, lead, amount, stage, close date offset, owner, created, source, outcome
            ['Cold storage monitoring system', 1, null, 850000, 'Proposal', 21, 7, -34, 'Referral', ''],
            ['Loom automation - phase 1', 2, null, 1250000, 'Negotiation', 12, 5, -47, 'Trade Show', ''],
            ['Annual inventory software licence', 3, null, 420000, 'Qualification', 35, 4, -9, 'Website', ''],
            ['Distributor ordering portal', 4, null, 980000, 'Proposal', 28, 6, -25, 'Referral', ''],
            ['ERP rollout for moulding unit', 5, null, 2400000, 'Negotiation', 9, 8, -60, 'Partner', ''],
            ['Fleet tracking subscription', 6, null, 360000, 'Won', -12, 5, -55, 'Cold Call', 'Purchase order received for 40 vehicles.'],
            ['Dealer management system', 7, null, 1650000, 'Won', -40, 4, -98, 'Referral', 'Signed for two years.'],
            ['Export documentation module', 8, null, 540000, 'Qualification', 45, 8, -6, 'Email Campaign', ''],
            ['Showroom billing software', 9, null, 275000, 'Won', -70, 7, -102, 'Website', 'Closed after second demo.'],
            ['Packaging line MES', 10, null, 1900000, 'Proposal', 30, 6, -20, 'Trade Show', ''],
            ['Warehouse barcode solution', 11, null, 310000, 'Lost', -30, 5, -76, 'Website', 'Customer postponed the project to next year.'],
            ['Retail POS for 4 outlets', 12, null, 460000, 'Won', -95, 4, -128, 'Social Media', 'Order confirmed by email.'],
            ['Milk route planning app', 14, 15, 720000, 'Negotiation', 6, 6, -48, 'Trade Show', ''],
            ['Service CRM for dealers', 15, 16, 590000, 'Qualification', 40, 4, -33, 'Referral', ''],
            ['Solar plant monitoring dashboard', 16, 17, 1350000, 'Won', -5, 7, -41, 'Website', 'Advance payment received.'],
            ['Print job costing tool', 13, null, 240000, 'Lost', -100, 8, -150, 'Cold Call', 'No response after proposal.'],
            ['AMC renewal', 7, null, 180000, 'Won', -130, 4, -165, 'Referral', 'Renewed at the same rate.'],
            ['Quality lab data system', 4, null, 640000, 'Won', -160, 6, -200, 'Referral', 'Delivered and signed off.']
        ];
        $.each(opps, function (i, o) {
            var closed = o[4] === 'Won' || o[4] === 'Lost';
            db.opportunities.push({
                OpportunityId: i + 1,
                OpportunityName: o[0], CustomerId: o[1], LeadId: o[2],
                Amount: o[3], Stage: o[4], Probability: Config.stageProbability[o[4]],
                ExpectedCloseDate: day(o[5]),
                Status: closed ? o[4] : 'Open',
                Source: o[8], Notes: '', Outcome: o[9],
                CreatedDate: at(o[7], 12, 10 + i),
                ClosedDate: closed ? at(o[5], 16, 30) : null,
                AssignedTo: o[6]
            });
        });
        db.opportunities[1].Probability = 80;
        db.opportunities[4].Notes = 'Commercials shared. Waiting for sign-off from their director.';

        // ---- follow-ups ----
        var followUps = [
            // customer, lead, opportunity, date offset, type, subject, remarks, status, owner
            [1, null, 1, 2, 'Meeting', 'Walk through revised proposal', 'Carry the hardware price break-up.', 'Planned', 7],
            [2, null, 2, 0, 'Call', 'Confirm payment terms', '', 'Planned', 5],
            [5, null, 5, 1, 'Call', 'Check on director approval', '', 'Planned', 8],
            [4, null, 4, 4, 'Demo', 'Portal demo for distributor team', 'They want to see order tracking.', 'Planned', 6],
            [null, 5, null, 3, 'Demo', 'Plant head demo', '', 'Planned', 8],
            [null, 6, null, -1, 'Call', 'Share brochure and pricing', 'Did not pick up yesterday.', 'Planned', 5],
            [3, null, 3, -3, 'Email', 'Send licence comparison sheet', '', 'Planned', 4],
            [null, 9, null, 0, 'Meeting', 'Discuss vendor comparison', '', 'Planned', 6],
            [10, null, 10, 7, 'Site Visit', 'Visit Peenya plant', 'Meet the production manager.', 'Planned', 6],
            [7, null, null, 5, 'Call', 'Quarterly account review', '', 'Planned', 4],
            [14, null, 13, -2, 'Call', 'Negotiation call', 'Agreed on 5% discount for annual billing.', 'Completed', 6],
            [16, null, 15, -6, 'Meeting', 'Contract signing', 'Signed copy collected.', 'Completed', 7],
            [6, null, 6, -14, 'Call', 'Confirm vehicle count', '40 vehicles in first phase.', 'Completed', 5],
            [null, 7, null, -8, 'Call', 'Intro call', 'Asked to call back next week.', 'Missed', 4],
            [11, null, 11, -28, 'Meeting', 'Final discussion', 'Project postponed by customer.', 'Cancelled', 5],
            [null, 10, null, 2, 'Email', 'Send case studies', '', 'Planned', 8],
            [12, null, null, -5, 'Call', 'Feedback on POS rollout', 'Happy with the rollout, asked about loyalty module.', 'Completed', 4],
            [9, null, null, 9, 'Call', 'Check interest in inventory add-on', '', 'Planned', 7]
        ];
        $.each(followUps, function (i, f) {
            db.followUps.push({
                FollowUpId: i + 1,
                CustomerId: f[0], LeadId: f[1], OpportunityId: f[2],
                FollowUpDate: day(f[3]), FollowUpType: f[4], Subject: f[5], Remarks: f[6],
                Status: f[7], AssignedTo: f[8],
                CreatedDate: at(Math.min(f[3] - 4, -1), 17, 10),
                CompletedDate: f[7] === 'Completed' ? at(f[3], 15, 20) : null
            });
        });

        // ---- activities ----
        var activities = [
            // type, subject, description, date offset, customer, lead, owner, status
            ['Call', 'Negotiation call', 'Agreed on 5% discount for annual billing.', -2, 14, null, 6, 'Completed'],
            ['Meeting', 'Contract signing', 'Signed copy collected.', -6, 16, null, 7, 'Completed'],
            ['Email', 'Sent proposal v2', 'Revised proposal with hardware split.', -4, 1, null, 7, 'Completed'],
            ['Call', 'First call with lead', 'Explained product range. Interested in demo.', -11, null, 5, 8, 'Completed'],
            ['Task', 'Prepare demo data for Deccan Pharma', '', 2, 4, null, 6, 'Planned'],
            ['Meeting', 'Requirement discussion', 'Met purchase and IT heads.', -19, 10, null, 6, 'Completed'],
            ['Email', 'Shared pricing brochure', '', -14, null, 6, 5, 'Completed'],
            ['Call', 'Feedback on POS rollout', 'Happy with the rollout.', -5, 12, null, 4, 'Completed'],
            ['Task', 'Update quotation with GST', '', 1, 2, null, 5, 'Planned'],
            ['Meeting', 'Kick-off meeting', 'Project plan shared.', -9, 7, null, 4, 'Completed'],
            ['Call', 'Cold call', 'Not interested this year.', -50, null, 13, 4, 'Completed'],
            ['Task', 'Collect KYC documents', '', 3, 16, null, 7, 'Planned'],
            ['Email', 'Thank you mail after demo', '', -24, null, 9, 6, 'Completed'],
            ['Meeting', 'Dealer meet presentation', 'Cancelled due to their internal audit.', -7, 15, null, 4, 'Cancelled'],
            ['Call', 'Renewal reminder', '', 6, 7, null, 4, 'Planned'],
            ['Task', 'Send credit note', '', 0, 9, null, 7, 'Planned']
        ];
        $.each(activities, function (i, a) {
            db.activities.push({
                ActivityId: i + 1,
                ActivityType: a[0], Subject: a[1], Description: a[2], ActivityDate: day(a[3]),
                CustomerId: a[4], LeadId: a[5], AssignedTo: a[6], Status: a[7],
                CreatedDate: at(Math.min(a[3], 0) - 1, 18, 5)
            });
        });

        // ---- audit log ----
        var logs = [];
        function log(when, userId, action, entity, recordId, oldValue, newValue, result, details) {
            logs.push({
                UserId: userId, Action: action, EntityName: entity, RecordId: recordId,
                OldValue: oldValue ? JSON.stringify(oldValue) : null,
                NewValue: newValue ? JSON.stringify(newValue) : null,
                Result: result || 'Success', Details: details || '',
                CreatedDate: when, IpAddress: '10.20.' + (userId ? userId + 10 : 4) + '.' + (20 + logs.length % 60)
            });
        }

        $.each(db.customers, function (i, c) {
            log(c.CreatedDate, c.CreatedBy, 'Create', 'Customer', c.CustomerId, null,
                { CustomerName: c.CustomerName, CompanyName: c.CompanyName, Status: 'Active' }, 'Success', c.CustomerCode + ' created');
        });
        $.each(db.leads, function (i, l) {
            log(l.CreatedDate, l.CreatedBy, 'Create', 'Lead', l.LeadId, null,
                { LeadName: l.LeadName, Source: l.Source, Status: 'New' }, 'Success', l.LeadCode + ' created');
            if (l.ConvertedCustomerId) {
                log(l.ConvertedDate, l.AssignedTo, 'Convert', 'Lead', l.LeadId, { Status: 'Qualified' },
                    { Status: 'Converted', CustomerId: l.ConvertedCustomerId }, 'Success', l.LeadCode + ' converted to customer');
            }
        });
        $.each(db.opportunities, function (i, o) {
            log(o.CreatedDate, o.AssignedTo, 'Create', 'Opportunity', o.OpportunityId, null,
                { OpportunityName: o.OpportunityName, Amount: o.Amount, Stage: 'Qualification' }, 'Success', '');
            if (o.ClosedDate) {
                log(o.ClosedDate, o.AssignedTo, 'Status Change', 'Opportunity', o.OpportunityId, { Stage: 'Negotiation' },
                    { Stage: o.Stage }, 'Success', 'Marked ' + o.Stage);
            }
        });
        log(at(-58, 15, 40), 3, 'Update', 'Customer', 13, { Status: 'Active' }, { Status: 'Inactive' }, 'Success', 'CUS-0013 updated');
        log(at(-62, 18, 2), 1, 'Update', 'User', 9, { IsActive: true }, { IsActive: false }, 'Success', 'vikram.joshi deactivated');
        log(at(-150, 10, 30), 1, 'Create', 'User', 9, null, { UserName: 'vikram.joshi', Role: 'SalesExecutive' }, 'Success', '');
        log(at(-120, 11, 12), 1, 'Role Change', 'User', 3, { Role: 'SalesExecutive' }, { Role: 'Manager' }, 'Success', 'anjali.deshpande');
        log(at(-21, 9, 48), 1, 'Password Reset', 'User', 6, null, null, 'Success', 'Password reset by administrator for karthik.rao');
        log(at(-6, 15, 20), 7, 'Update', 'FollowUp', 12, { Status: 'Planned' }, { Status: 'Completed' }, 'Success', 'Follow-up completed');
        log(at(-2, 15, 20), 6, 'Update', 'FollowUp', 11, { Status: 'Planned' }, { Status: 'Completed' }, 'Success', 'Follow-up completed');
        log(at(-3, 9, 2), null, 'Failed Login', 'Account', null, null, null, 'Failed', 'Unknown user: rohit.varma');
        log(at(-3, 9, 3), 4, 'Login', 'Account', 4, null, null, 'Success', '');
        log(at(-2, 9, 14), 6, 'Failed Login', 'Account', 6, null, null, 'Failed', 'Wrong password (attempt 1 of 5)');
        log(at(-2, 9, 15), 6, 'Login', 'Account', 6, null, null, 'Success', '');
        log(at(-1, 9, 5), 1, 'Login', 'Account', 1, null, null, 'Success', '');
        log(at(-1, 9, 31), 2, 'Login', 'Account', 2, null, null, 'Success', '');
        log(at(-1, 9, 40), 5, 'Login', 'Account', 5, null, null, 'Success', '');
        log(at(-1, 18, 12), 5, 'Logout', 'Account', 5, null, null, 'Success', '');
        log(at(-1, 10, 2), 7, 'Login', 'Account', 7, null, null, 'Success', '');
        log(at(-1, 10, 26), 8, 'Login', 'Account', 8, null, null, 'Success', '');
        log(at(-1, 18, 40), 1, 'Logout', 'Account', 1, null, null, 'Success', '');

        logs.sort(function (a, b) { return a.CreatedDate < b.CreatedDate ? -1 : 1; });
        $.each(logs, function (i, l) { l.AuditLogId = i + 1; db.auditLogs.push(l); });

        $.each(['users', 'customers', 'leads', 'opportunities', 'followUps', 'activities', 'auditLogs'], function (i, t) {
            db.seq[t] = db[t].length;
        });

        return db;
    }

    return { version: VERSION, build: build, code: code };

})();
