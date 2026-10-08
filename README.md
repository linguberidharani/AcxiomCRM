# AcxiomCRM - Front End

Front end for the AcxiomCRM assignment (ASP.NET Core MVC project). This part covers the
presentation layer: all screens, navigation, client-side validation, role based menus and the
dashboard charts. The backend (Identity, EF Core, API controllers) is not connected yet, so the
pages work on sample data kept in the browser.

Built with Bootstrap 5.3, jQuery 3.7, jQuery Validation + Unobtrusive Validation, Chart.js 4 and
Bootstrap Icons. All libraries are inside `lib/`, no internet connection is needed.


## Running it

Any static web server will do. From this folder:

    python -m http.server 5500

and open http://localhost:5500. In VS Code, "Open with Live Server" on `index.html` also works.

Opening `index.html` directly from disk works in Chrome and Edge. Firefox keeps separate storage
for every local file, so the login is lost between pages there. Use a server with Firefox.


## Test accounts

| Role            | Username       | Password    |
|-----------------|----------------|-------------|
| Admin           | admin          | Admin@123   |
| Manager         | suresh.menon   | Manager@123 |
| Manager         | anjali.deshpande | Manager@123 |
| Sales Executive | rohit.verma    | Sales@123   |
| Sales Executive | priya.nair, karthik.rao, sneha.kulkarni, imran.shaikh | Sales@123 |

`vikram.joshi` is an inactive account (to show that inactive users cannot sign in).
Suresh's team is Rohit, Priya and Karthik. Anjali's team is Sneha, Imran and Vikram.

The sample data is created the first time the site is opened. "Reset sample data" under
*Test accounts* on the login page loads it again.


## Folder structure

    Account/         Login, Register, ChangePassword, AccessDenied
    Dashboard/       Index
    Customers/       Index, Create, Edit, Details
    Leads/           Index, Create, Edit, Details (status workflow + conversion)
    Opportunities/   Index, Create, Edit, Details, Pipeline (board)
    FollowUps/       Index (schedule / complete / reschedule dialogs)
    Activities/      Index (call / meeting / email / task)
    Users/           Index, Create, Edit
    Roles/           Index (roles and permission matrix)
    AuditLog/        Index
    Reports/         Index (8 reports)
    css/site.css     all custom styles
    js/config.js     settings and lookup lists (statuses, stages, password policy, lockout)
    js/site.js       common helpers: formatting, toasts, confirm dialog, table with sorting + paging, CSV export
    js/layout.js     access check, side menu, top bar, search, notifications
    js/validation.js extra validation rules (phone, not-in-past date, close date, password policy)
    js/store.js      data access (localStorage)
    js/seed.js       sample data
    js/auth.js       login, register, lockout, password policy, role scope
    js/audit.js      audit trail
    js/services/     business rules for each module
    js/pages/        one script per module for the screens
    lib/             third party libraries

The folders are named like the MVC controllers on purpose. Each HTML page becomes the Razor view
with the same name (`Customers/Index.html` -> `Views/Customers/Index.cshtml`), `js/layout.js`
becomes `_Layout.cshtml`, and `css`, `js`, `lib` go into `wwwroot` as they are.


## How the layers map to the backend

| Front end file            | Backend equivalent                                   |
|---------------------------|------------------------------------------------------|
| `js/store.js`, `js/seed.js` | `Data/` - DbContext, repositories, seed data        |
| `js/services/*.js`        | `Services/` + API controllers (`/api/customers` ...) |
| `js/auth.js`              | ASP.NET Core Identity (SignInManager, UserManager)   |
| `js/audit.js`             | AuditLog service                                     |
| objects returned by the services | DTOs / ViewModels                             |
| `js/layout.js` access check | `[Authorize(Roles = ...)]`                         |

Every service method returns `{ ok, status, data }` or `{ ok, status, message, errors }` and uses
the same status codes the API will return: 200, 201, 400 (validation), 401, 403 (no permission),
404, 409 (duplicate or not allowed in the current state) and 423 (locked account).


## Validation

Client side validation uses the same `data-val-*` attributes that Razor tag helpers generate,
so the markup does not change when the pages become views.

| Rule | Where | Message |
|------|-------|---------|
| Required | all mandatory fields | "Customer Name is required." etc. |
| Email | customer, lead, user | "Enter a valid email address." |
| Phone | 10 digit mobile number starting with 6-9 | "Enter a valid phone number." |
| Length | names 100, company 150, subject 150, notes 1000 | "... cannot be longer than N characters." |
| Amount | opportunity | "Opportunity Amount must be greater than 0." |
| Probability | opportunity | "Probability must be between 0 and 100." |
| Close date | open opportunity | "Expected Close Date cannot be in the past." |
| Follow-up date | new / rescheduled follow-up | "Follow-up date cannot be earlier than today." |
| Unique email and phone | customer | "A customer with this email already exists (CUS-0001)." |
| Expected value | lead, 0 to 10,00,00,000 | "Expected Value must be between 0 and 10,00,00,000." |
| Lead status | only allowed transitions | "A lead cannot be moved from New to Qualified." |
| Password policy | register, new user, reset, change | 8+ characters, upper, lower, number, special |

The services check everything again before saving. To see that the second check works without the
form, open the browser console on any page after signing in and run for example:

    CustomerService.create({ CustomerName: '', Email: 'abc', Phone: '123' })
    OpportunityService.create({ OpportunityName: 'Test', CustomerId: 3, Amount: 0, Probability: 101, ExpectedCloseDate: '2020-01-01', AssignedTo: 4 })

Both come back with status 400 and the list of field errors.


## Roles

| Module          | Admin | Manager             | Sales Executive |
|-----------------|-------|---------------------|-----------------|
| Dashboard       | all   | own + team          | own             |
| Customers, Leads, Opportunities, Follow-Ups, Activities | all | own + team | own |
| Delete customer / lead / opportunity | yes | yes (team) | no |
| Users           | full  | view team           | no access       |
| Roles           | view  | no access           | no access       |
| Audit Log       | all   | team business events | no access      |
| Reports         | all 8 | 7 (no Audit Report) | 6 (own data)    |

Menu items are hidden for roles that cannot use them, and opening the URL directly goes to the
Access Denied page. The services also check the owner of each record, so a Sales Executive cannot
load or change another user's record by changing the id in the URL.


## Workflows

- Lead: New -> Contacted -> Qualified -> Converted. Unqualified and Lost are the exits.
  Convert creates the customer (or reuses one with the same email / phone) and optionally an
  opportunity, and writes the conversion to the audit log.
- Opportunity: Qualification -> Proposal -> Negotiation -> Won / Lost. A reason is required for
  Lost. Closed opportunities are read only. Weighted amount = Amount x Probability / 100.
- Follow-up: Planned -> Completed / Missed / Cancelled, or rescheduled. Completing a follow-up
  logs an activity on the customer or lead, moves a New lead to Contacted and can schedule the
  next follow-up.
- Account lockout: 5 wrong passwords lock the account for 15 minutes. An admin can unlock it from
  Users. Login, failed login, lockout, unlock, role change and password reset are all audited.


## Still to do on the backend

- Replace `js/auth.js` hashing with ASP.NET Core Identity. The browser version only makes sure no
  plain text password is stored, it is not a replacement for Identity's hashing.
- `[ValidateAntiForgeryToken]` on the POST actions (`@Html.AntiForgeryToken()` in each form).
- Repeat the rules in `js/services/` in the C# services with data annotations / FluentValidation.
- EF Core entities and migrations for Customer, Lead, Opportunity, FollowUp, Activity, AuditLog.
- API controllers for customers, leads and opportunities returning DTOs.
- Real client IP address in the audit log (it is fixed to 127.0.0.1 here).
"# AcxiomCRM" 
