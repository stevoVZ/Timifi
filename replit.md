# Recruitment Portal

Labour hire agency management portal for contractors, timesheets, invoicing, and payroll. Includes a self-service contractor portal.

## Architecture

- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components, wouter routing
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Fonts**: DM Sans + DM Mono

## Key Features

### Admin Panel
- **Dashboard**: KPI overview with active contractors, timesheets due, outstanding invoices, next pay run
- **Contractors**: List, search, filter by status, add new (full form + quick add), detail view with timesheet history
- **Timesheets**: Create, view by status tabs (pending/approved/drafts/rejected), approve/reject workflow
- **Payroll**: Current pay run overview, pay run history with gross/PAYG/super/net breakdown
- **Invoices**: Create, track by status (outstanding/paid/draft), send/mark paid workflow
- **Leave Management**: Pending/approved/rejected tabs, approve/reject with review notes
- **Pay Items**: Pay code management with type, rate, multiplier, taxable/superable flags, active toggle
- **Notifications**: Priority-based notification center with filtering by type/priority, mark read/unread
- **Settings**: Tabbed settings page (Branding, Company, Payroll, Xero, Portal, Users)

### Contractor Portal (/portal/*)
- **Portal Login**: Email-based login for contractors
- **Portal Dashboard**: Contractor-specific KPIs (hours, pending timesheets, messages)
- **Portal Timesheets**: View and submit timesheets
- **Portal Leave**: View leave balances, request leave, see history
- **Portal Payslips**: View invoices and payment history
- **Portal Messages**: Send/receive messages with admin
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
    contractor-detail.tsx     - Individual contractor view
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

shared/
  schema.ts                   - Drizzle schema with all tables and types
```

## Database Tables

- `contractors` - Contractor profiles with clearance, rates, employment, personal details
- `timesheets` - Monthly timesheet records with hours and status workflow
- `invoices` - Invoice records with GST calculations and status tracking
- `pay_runs` - Payroll run records with PAYG/super breakdowns
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
