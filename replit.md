# Recruitment Portal

Labour hire agency management portal for contractors, timesheets, invoicing, and payroll. Includes a self-service contractor portal.

## Architecture

- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components, wouter routing
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Fonts**: DM Sans + DM Mono

## Key Features

### Admin Panel
- **Dashboard**: Enhanced KPI overview (active contractors, pending timesheets, outstanding invoices, next pay run, YTD billings), recent activity feed from notifications, contractors mini-table, quick action grid
- **Contractors**: KPI strip (Active/Pending/YTD Billings/Avg Rate), sortable table (name/rate/YTD hours/start date), search, filter by status, add new (full form + quick add), detail view with timesheet history
- **Timesheets**: Two-tab layout (Upload/Submissions). Upload tab: drag-and-drop PDF zone, contractor + period pickers, intake source form, file queue with scanning simulation + extracted data (hours/confidence/weekly breakdown), batch summary sidebar, duplicate detection. Submissions tab: existing timesheet list with status tabs, manual entry dialog, approve/reject workflow, intake source badges
- **Payroll**: Enhanced pay run management with contractor-level pay lines (hours, rate, gross, PAYG, super, net), file workflow (Draft → Review → Filed), ABA direct entry file download, payslip generation, month navigation
- **Invoices**: KPI strip (Outstanding, Overdue, Paid totals), filter tabs, pending invoices from approved timesheets, create/send workflow
- **Leave Management**: 2-column layout with request tabs (Pending/Approved/Rejected) on left and per-contractor balance sidebar cards on right with progress bars, approve/reject with review notes
- **Pay Items**: Pay code management with type, rate, multiplier, taxable/superable flags, active toggle
- **Notifications**: Priority-based notification center with filtering by type/priority, mark read/unread
- **Settings**: Tabbed settings page (Branding, Company, Payroll, Xero, Portal, Users)
- **Xero Integration**: OAuth2 connection to Xero Payroll AU API, employee sync (Xero as source of truth), connection status display, sync results, Xero-synced contractors show badge and locked fields

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
  App.tsx                     - Main app with admin/portal layout routing
  components/
    app-sidebar.tsx           - Admin navigation sidebar with notification badge
    portal-shell.tsx          - Contractor portal layout shell
    top-bar.tsx               - Page header component
    status-badge.tsx          - Reusable status badge
  pages/
    dashboard.tsx             - Dashboard with KPIs and quick links
    contractors.tsx           - Contractor list with search/filter
    contractor-new.tsx        - Full contractor creation form
    contractor-detail.tsx     - Contractor detail with tabs (Profile, Timesheets, Invoices, Documents)
    timesheets.tsx            - Timesheet management with tabs
    payroll.tsx               - Pay run overview
    invoices.tsx              - Invoice management
    leave.tsx                 - Leave request management (admin)
    pay-items.tsx             - Pay items/pay codes management
    notifications.tsx         - Notification center with filters
    settings.tsx              - Settings with tabbed interface
    portal/
      portal-login.tsx        - Contractor login page
      portal-dashboard.tsx    - Contractor dashboard
      portal-timesheets.tsx   - Contractor timesheet view/submit
      portal-leave.tsx        - Contractor leave requests
      portal-payslips.tsx     - Contractor payslip/invoice history
      portal-messages.tsx     - Contractor messaging
      portal-onboarding.tsx   - Onboarding wizard (7 steps)

server/
  index.ts                    - Express server setup with seed
  routes.ts                   - API routes for all entities
  storage.ts                  - Database storage layer with Drizzle
  db.ts                       - Database connection
  seed.ts                     - Seed data for development
  payslip.ts                  - Payslip generation (jsPDF server-side PDF + HTML fallback)
  aba.ts                      - ABA direct entry file generation
  xero.ts                     - Xero Payroll AU API integration (OAuth2, employee sync)

shared/
  schema.ts                   - Drizzle schema with all tables and types
```

## Database Tables

- `contractors` - Contractor profiles with clearance, rates, employment, personal details, optional `xero_employee_id` for Xero sync
- `timesheets` - Monthly timesheet records with hours and status workflow
- `invoices` - Invoice records with GST calculations and status tracking
- `pay_runs` - Payroll run records with PAYG/super breakdowns, period dates, payment date
- `pay_run_lines` - Contractor-level pay run detail lines (hours, rate, gross, PAYG, super, net)
- `documents` - Contractor documents with categories (Contract, TFN Declaration, Super Choice, ID Verification, Police Check, WWVP, Qualification, Other), file size tracking, drag-drop upload
- `notifications` - Admin notification center with type/priority/read status
- `messages` - Messaging between admin and contractors
- `settings` - Key-value application settings
- `users` - Admin user accounts
- `leave_requests` - Leave requests with type, dates, approval workflow
- `pay_items` - Pay codes/items with type, rate, multiplier, taxable/superable flags
- `tax_declarations` - Contractor TFN declarations for onboarding
- `bank_accounts` - Contractor bank details for onboarding
- `super_memberships` - Contractor superannuation fund details for onboarding

## Design System

- Uses DM Sans for body text, DM Mono for numerical values
- shadcn/ui components with custom elevation system (hover-elevate)
- Responsive layout with sidebar navigation
- Admin panel uses shadcn sidebar, portal uses custom shell layout

## Auth

- Portal auth: Uses `localStorage` keys `portal_contractor_id` and `portal_contractor_name`; route guard in App.tsx redirects unauthenticated portal users to `/portal/login`
- Portal login endpoint: POST `/api/portal/login` looks up contractor by email, no password validation (MVP)
