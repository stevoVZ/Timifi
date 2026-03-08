# Recruitment Portal

Labour hire agency management portal for contractors, timesheets, invoicing, and payroll. Includes a self-service contractor portal. Connected to live Xero data — no demo/seed data.

## Architecture

- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components, wouter routing
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Fonts**: DM Sans + DM Mono
- **Auth**: Passport.js local strategy with express-session (connect-pg-simple store)

## Key Features

### Admin Panel
- **Admin Login**: Username/password authentication required. Default credentials: admin/admin. Sessions stored in PostgreSQL.
- **Dashboard**: Enhanced KPI overview (active contractors, pending timesheets, outstanding invoices, next pay run, YTD billings), recent activity feed from notifications, contractors mini-table, quick action grid
- **Contractors**: KPI strip (Active/Pending/YTD Billings/Avg Rate), sortable table (name/rate/YTD hours/start date), search, filter by status, add new (full form + quick add), detail view with timesheet history
- **Timesheets**: Two-tab layout (Upload/Submissions). Upload tab: drag-and-drop PDF zone, contractor + period pickers, intake source form, file queue with scanning simulation + extracted data (hours/confidence/weekly breakdown), batch summary sidebar, duplicate detection. Submissions tab: existing timesheet list with status tabs, manual entry dialog, approve/reject workflow, intake source badges
- **Payroll**: Enhanced pay run management with contractor-level pay lines (hours, rate, gross, PAYG, super, net), file workflow (Draft → Review → Filed), ABA direct entry file download, payslip generation, month navigation
- **Invoices**: KPI strip (Outstanding, Overdue, Paid totals), filter tabs, pending invoices from approved timesheets, create/send workflow
- **Leave Management**: 2-column layout with request tabs (Pending/Approved/Rejected) on left and per-contractor balance sidebar cards on right with progress bars, approve/reject with review notes
- **Pay Items**: Pay code management with type, rate, multiplier, taxable/superable flags, active toggle
- **Notifications**: Priority-based notification center with filtering by type/priority, mark read/unread
- **Settings**: Tabbed settings page (Branding, Company, Payroll, Xero, Portal, Users)
- **Xero Integration**: OAuth2 connection to Xero Payroll AU + Accounting API. Organisation (tenant) picker for multi-org support. Individual sync for: Employees, Pay Runs, Timesheets, Invoices, Payroll Settings. Sync All button. Xero-synced contractors show badge and locked fields.

### Contractor Portal (/portal/*)
- **Portal Login**: Email-based login for contractors
- **Portal Dashboard**: 3 KPI cards (This month hours, YTD earnings, Next pay date), contract utilisation progress bar, quick action links, recent timesheets/payslips mini-tables
- **Portal Timesheets**: Weekly hour breakdown entry (auto-generated week labels per month), auto-calculated totals, expandable history with week-by-week detail, resubmit rejected timesheets
- **Portal Leave**: Tab-based layout (History/New Request tabs), 2 balance cards (Annual/Sick) with progress bars, inline leave request form with 2x2 leave type grid buttons
- **Portal Payslips**: 4-card YTD summary strip (Gross/Tax/Super/Net YTD with Australian FY calculation), table layout with columns (Pay Date, Period, Gross, Tax, Super, Net, Status, Download), per-row PDF download button
- **Portal Messages**: Split-pane inbox with message list sidebar, conversation detail view, reply functionality, compose new message
- **Portal Onboarding**: 7-step wizard (Welcome, Personal, Address, Tax, Bank, Super, Complete)

## File Structure

```
client/src/
  App.tsx                     - Main app with admin/portal layout routing, auth guard
  pages/
    login.tsx                 - Admin login page (username/password)
    dashboard.tsx             - Dashboard with KPIs and quick links
    contractors.tsx           - Contractor list with search/filter
    contractor-new.tsx        - Full contractor creation form
    contractor-detail.tsx     - Contractor detail with tabs
    timesheets.tsx            - Timesheet management with tabs
    payroll.tsx               - Pay run overview
    invoices.tsx              - Invoice management
    leave.tsx                 - Leave request management (admin)
    pay-items.tsx             - Pay items/pay codes management
    notifications.tsx         - Notification center with filters
    settings.tsx              - Settings with tabbed interface (includes Xero org picker + sync controls)
    portal/                   - Contractor self-service portal pages

server/
  index.ts                    - Express server setup with seed
  auth.ts                     - Passport.js auth setup, password hashing, requireAuth middleware
  routes.ts                   - API routes for all entities + Xero sync endpoints
  storage.ts                  - Database storage layer with Drizzle
  db.ts                       - Database connection
  seed.ts                     - Creates default admin user + settings only (no demo data)
  payslip.ts                  - Payslip generation (jsPDF server-side PDF + HTML fallback)
  aba.ts                      - ABA direct entry file generation
  xero.ts                     - Xero Payroll AU + Accounting API integration (OAuth2, multi-tenant, sync employees/payruns/timesheets/invoices/payroll-settings)

shared/
  schema.ts                   - Drizzle schema with all tables and types
```

## Database Tables

- `contractors` - Contractor profiles with optional `xero_employee_id` for Xero sync
- `timesheets` - Monthly timesheet records with hours and status workflow
- `invoices` - Invoice records with GST calculations and status tracking
- `pay_runs` - Payroll run records with PAYG/super breakdowns, period dates, payment date
- `pay_run_lines` - Contractor-level pay run detail lines
- `documents` - Contractor documents with categories
- `notifications` - Admin notification center
- `messages` - Messaging between admin and contractors
- `settings` - Key-value application settings (includes Xero OAuth tokens, tenant config)
- `users` - Admin user accounts (username/hashed password)
- `leave_requests` - Leave requests with approval workflow
- `pay_items` - Pay codes/items with rate, multiplier, flags
- `tax_declarations` - Contractor TFN declarations
- `bank_accounts` - Contractor bank details
- `super_memberships` - Contractor superannuation fund details
- `session` - Express sessions (created automatically by connect-pg-simple)

## Auth

- **Admin auth**: Passport.js local strategy with scrypt password hashing and express-session. Protected via `requireAuth` middleware on all `/api/*` routes except `/api/auth/*`, `/api/portal/*`, and `/api/xero/callback`.
- **Portal auth**: Uses `localStorage` keys `portal_contractor_id` and `portal_contractor_name`; route guard in App.tsx redirects unauthenticated portal users to `/portal/login`. POST `/api/portal/login` looks up contractor by email, no password validation (MVP).
- **Default admin**: username `admin`, password `admin` — seeded on first startup.

## Xero Integration

- OAuth2 with Xero Payroll AU API + Accounting API
- Scopes: openid, profile, email, payroll.*, accounting.transactions.*, accounting.contacts.read, offline_access
- Multi-organisation support via tenant picker in settings
- Sync functions: syncEmployees, syncPayRuns, syncTimesheets, syncInvoices, syncPayrollSettings
- Token refresh handled automatically
- Connected tenant: stored in settings as xero.tenantId / xero.tenantName
- Last sync timestamps stored per data type (xero.lastEmployeeSyncAt, etc.)

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Express session secret
- `XERO_REDIRECT_URI` - Xero OAuth callback URI (defaults to http://localhost:5000/api/xero/callback)
