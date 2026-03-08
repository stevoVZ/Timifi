# Recruitment Portal

Labour hire agency management portal for employees, timesheets, invoicing, and payroll. Includes a self-service employee portal. Connected to live Xero data — no demo/seed data.

## Architecture

- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components, wouter routing
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Fonts**: DM Sans + DM Mono
- **Auth**: Passport.js local strategy with express-session (connect-pg-simple store)
- **AI/OCR**: OpenAI GPT-4o vision via Replit AI Integrations for PDF timesheet scanning (PDF→PNG conversion via pdftoppm)

## Key Features

### Admin Panel
- **Admin Login**: Username/password authentication required. Default credentials: admin/admin. Sessions stored in PostgreSQL.
- **Dashboard**: KPI overview (active employees, total invoices, total paid, FY pay runs), recent invoices table (last 5), recent pay runs table (last 5), employees sidebar, quick actions (upload timesheets, view invoices, view payroll, add employee), YTD billings card, recent activity feed
- **Employees** (`/employees`): KPI strip (Active/Pending/YTD Billings/Avg Rate), sortable table (name/rate/YTD hours/start date), search, filter by status, add new (full form + quick add), detail view with timesheet history
- **Timesheets**: Two-tab layout (Upload/Submissions). Upload tab: drag-and-drop PDF zone with real AI-powered OCR (GPT-4o vision), employee + period pickers, intake source form, file queue with AI-extracted data (hours/confidence/weekly breakdown/employee name/signature detection), batch summary sidebar, duplicate detection, auto-employee detection from OCR. PDF files saved as base64 documents linked to timesheets. Submissions tab: existing timesheet list with status tabs, manual entry dialog, approve/reject workflow, intake source badges, PDF viewer dialog for viewing uploaded timesheet documents
- **Payroll**: Enhanced pay run management with employee-level pay lines (hours, rate, gross, PAYG, super, net), file workflow (Draft → Review → Filed), ABA direct entry file download, payslip generation, month navigation. Sortable table columns on both pay lines and pay run history tables.
- **Invoices**: KPI strip (Total Billed, Outstanding, Paid, Voided), filter tabs including Voided tab, pending invoices from approved timesheets, create/send workflow. Table view with sortable columns matching Xero layout. Search filters table rows.
- **Payroll**: Defaults to most recent pay run month (not current calendar month)
- **Notifications**: Priority-based notification center with filtering by type/priority, mark read/unread
- **Settings**: Tabbed settings page (Branding, Company, Payroll, Xero, Portal, Users)
- **Pay Items**: Pay codes/items management
- **Xero Integration**: OAuth2 connection to Xero Payroll AU + Accounting API. Organisation (tenant) picker for multi-org support. Individual sync for: Employees, Pay Runs, Timesheets, Invoices, Payroll Settings. Sync All button. Xero-synced employees show badge and locked fields.

### Employee Portal (/portal/*)
- **Portal Login**: Email-based login for employees
- **Portal Dashboard**: 3 KPI cards (This month hours, YTD earnings, Next pay date), contract utilisation progress bar, quick action links, recent timesheets/payslips mini-tables
- **Portal Timesheets**: Weekly hour breakdown entry, auto-calculated totals, expandable history, resubmit rejected timesheets
- **Portal Leave**: Tab-based layout (History/New Request tabs), 2 balance cards (Annual/Sick) with progress bars, inline leave request form
- **Portal Payslips**: 4-card YTD summary strip, table layout with PDF download
- **Portal Messages**: Split-pane inbox with message list sidebar, conversation detail view, reply functionality, compose new message
- **Portal Onboarding**: 7-step wizard (Welcome, Personal, Address, Tax, Bank, Super, Complete)

## File Structure

```
client/src/
  App.tsx                     - Main app with admin/portal layout routing, auth guard
  pages/
    login.tsx                 - Admin login page (username/password)
    dashboard.tsx             - Dashboard with KPIs and quick links
    employees.tsx             - Employee list with search/filter
    employee-new.tsx          - Full employee creation form
    employee-detail.tsx       - Employee detail with tabs
    timesheets.tsx            - Timesheet management with AI OCR scanning
    payroll.tsx               - Pay run overview
    payroll-detail.tsx        - Pay run detail with employee pay lines
    invoices.tsx              - Invoice management
    leave.tsx                 - Leave request management (admin)
    pay-items.tsx             - Pay items/pay codes management
    notifications.tsx         - Notification center with filters
    settings.tsx              - Settings with tabbed interface (includes Xero org picker + sync controls)
    portal/                   - Employee self-service portal pages

server/
  index.ts                    - Express server setup with seed
  auth.ts                     - Passport.js auth setup, password hashing, requireAuth middleware
  routes.ts                   - API routes for all entities + Xero sync endpoints
  storage.ts                  - Database storage layer with Drizzle
  db.ts                       - Database connection
  seed.ts                     - Creates default admin user + settings only (no demo data)
  ocr.ts                      - GPT-4o vision PDF timesheet scanner (converts PDF→PNG via pdftoppm, sends images to GPT-4o)
  payslip.ts                  - Payslip generation (jsPDF server-side PDF + HTML fallback)
  aba.ts                      - ABA direct entry file generation
  xero.ts                     - Xero Payroll AU + Accounting API integration

shared/
  schema.ts                   - Drizzle schema with all tables and types
```

## API Routes

- `GET/POST /api/employees` - List/create employees
- `GET/PATCH /api/employees/:id` - Get/update employee
- `GET /api/employees/stats` - Employee stats with YTD data
- `POST /api/timesheets/scan` - Upload PDFs for AI OCR scanning (multipart form data)
- `GET /api/timesheets/employee/:employeeId` - Timesheets by employee
- `GET /api/messages/employee/:employeeId` - Messages by employee
- `GET /api/invoices/employee/:employeeId` - Invoices by employee
- `GET /api/leave/employee/:employeeId` - Leave requests by employee
- `GET /api/portal/employee/:employeeId/stats` - Portal dashboard stats
- `GET /api/portal/employee/:employeeId/tax|bank|super` - Portal onboarding data

## Database Tables

- `employees` - Employee profiles with optional `xero_employee_id` for Xero sync, `payment_method` (PAYROLL/INVOICE enum), `company_name`, `abn`
- `timesheets` - Monthly timesheet records with `employee_id` FK, hours and status workflow
- `invoices` - Invoice records with GST calculations and status tracking, nullable `employee_id`, `contact_name` for client org, `xero_invoice_id` for sync dedup
- `pay_runs` - Payroll run records with PAYG/super breakdowns, period dates, payment date
- `pay_run_lines` - Employee-level pay run detail lines with `employee_id` FK
- `documents` - Employee documents with categories, `employee_id` FK, optional `timesheet_id` FK for linking uploaded PDFs to timesheets
- `notifications` - Admin notification center, optional `employee_id` FK
- `messages` - Messaging between admin and employees, `employee_id` FK
- `settings` - Key-value application settings (includes Xero OAuth tokens, tenant config)
- `users` - Admin user accounts (username/hashed password)
- `leave_requests` - Leave requests with approval workflow, `employee_id` FK
- `pay_items` - Pay codes/items with rate, multiplier, flags
- `tax_declarations` - Employee TFN declarations, `employee_id` FK
- `bank_accounts` - Employee bank details, `employee_id` FK
- `super_memberships` - Employee superannuation fund details, `employee_id` FK
- `session` - Express sessions (created automatically by connect-pg-simple)

## Auth

- **Admin auth**: Passport.js local strategy with scrypt password hashing and express-session. Protected via `requireAuth` middleware on all `/api/*` routes except `/api/auth/*`, `/api/portal/*`, and `/api/xero/callback`.
- **Portal auth**: Uses `localStorage` keys `portal_employee_id` and `portal_employee_name`; route guard in App.tsx redirects unauthenticated portal users to `/portal/login`. POST `/api/portal/login` looks up employee by email, no password validation (MVP).
- **Default admin**: username `admin`, password `admin` — seeded on first startup.

## AI/OCR Integration

- Uses OpenAI GPT-4o vision model via Replit AI Integrations (billed to Replit credits, no external API key needed)
- Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `server/ocr.ts` accepts PDF buffer, converts to PNG images using `pdftoppm` (200 DPI), sends each page as base64 image_url to GPT-4o
- Multi-page PDFs: all pages sent in a single GPT-4o request for context
- Extracts: employee name, client name, total hours, regular/overtime hours, weekly breakdown, signature detection, confidence score, month-boundary warnings
- Endpoint: `POST /api/timesheets/scan` with multer (max 20 files, 20MB each)

## Xero Integration

- OAuth2 with Xero Payroll AU API + Accounting API
- Scopes: openid, profile, email, payroll.*, accounting.invoices, accounting.invoices.read, accounting.contacts.read, offline_access
- Multi-organisation support via tenant picker in settings
- Sync functions: syncEmployees, syncPayRuns, syncTimesheets, syncInvoices, syncPayrollSettings
- Token refresh handled automatically
- Connected tenant: stored in settings as xero.tenantId / xero.tenantName
- Last sync timestamps stored per data type (xero.lastEmployeeSyncAt, etc.)

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Express session secret
- `XERO_REDIRECT_URI` - Xero OAuth callback URI (defaults to http://localhost:5000/api/xero/callback)
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit AI Integrations)

## Important Notes

- After every `npm run db:push`, must recreate session table: `CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL PRIMARY KEY, "sess" json NOT NULL, "expire" timestamp(6) NOT NULL)`
- paymentMethodEnum values: "PAYROLL" (default) or "INVOICE"
- Invoice dedup: getInvoiceByNumber first, fallback to getInvoiceByXeroId
- ytdBillings uses `paidDate` for FY filtering
- DB fully renamed: `employees` table (was `contractors`), `employee_id` FKs (was `contractor_id`), `employee_status` enum (was `contractor_status`)
