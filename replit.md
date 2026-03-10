# Recruitment Portal

## Overview

This project is a comprehensive management portal designed for labour hire agencies. It centralizes the management of employees, timesheets, invoicing, and payroll, offering both an administrative panel and a self-service employee portal. The system is built to streamline agency operations, improve efficiency, and provide real-time financial insights by integrating directly with Xero. Its key capabilities include AI-powered OCR for timesheet processing, robust payroll management with ABA file generation, and detailed financial reconciliation. The overarching goal is to modernize labour hire agency management, reduce manual overhead, and enhance the experience for both agency staff and employees.

## User Preferences

I prefer clear and concise communication. For any proposed changes, please provide a brief explanation of the "why" behind them. I value iterative development, so feel free to suggest small, incremental improvements. When making significant architectural decisions or adding new external dependencies, please ask for my approval first.

## System Architecture

The Recruitment Portal is built as a full-stack application.

**Frontend:**
-   **Framework:** React with TypeScript, using Vite for fast development.
-   **Styling:** Tailwind CSS for utility-first styling, complemented by shadcn/ui components for a modern and accessible UI.
-   **Routing:** `wouter` for a lightweight and flexible routing solution.
-   **UI/UX Decisions:** The admin panel features a dashboard with key performance indicators (KPIs), sortable tables, and quick action links. Employee detail views are tabbed for clear organization. The employee portal offers a simplified, self-service experience with progress bars and quick access to essential information.

**Backend:**
-   **Framework:** Express.js with TypeScript for a robust and scalable API layer.
-   **Authentication:** Passport.js with a local strategy for admin login and `express-session` using `connect-pg-simple` for session storage in PostgreSQL. Portal authentication uses email-based login without password validation for simplicity.
-   **AI/OCR:** Utilizes OpenAI GPT-4o vision via Replit AI Integrations for advanced PDF timesheet scanning. This involves converting PDFs to PNGs (`pdftoppm`) and sending images to GPT-4o for data extraction and auto-detection of employee/month/year.
-   **Payroll:** Server-side generation of payslips (using `jsPDF`) and ABA direct entry files for payroll processing.
-   **Xero Integration:** OAuth2-based integration with Xero Payroll AU and Accounting APIs for syncing employees, pay runs, timesheets, invoices, contacts, bank transactions, and payroll settings. Supports multi-organisation selection.

**Database:**
-   **Type:** PostgreSQL.
-   **ORM:** Drizzle ORM for type-safe database interactions.
-   **Schema:** Key tables include `employees` (with `preferred_name` for display names that differ from Xero legal names, `contract_code` and `role_title` fields for client contract identifiers and role descriptions — used to auto-populate invoice description/reference; preferred name takes priority over first name in invoice auto-population and employee list displays), `timesheets` (with `client_id` and `placement_id` for per-client timesheet tracking), `invoices` (with `client_id`, `xero_contact_id`, `invoice_type` ACCPAY/ACCREC, and `reference` for Xero data), `invoice_line_items` (all line items per invoice with description, quantity, unit_amount, line_amount, account_code, tax_type, tracking), `invoice_payments` (payment details per invoice with payment_date, amount, bank_account), `pay_runs`, `pay_run_lines`, `documents`, `notifications`, `messages`, `settings`, `users` (with `display_name`, `email`, `role` columns for full admin user management), `leave_requests`, `pay_items`, `tax_declarations`, `bank_accounts`, `super_memberships`, `clients` (with `is_rcti` flag), `placements`, `bank_transactions`, `payslip_lines`, `rate_history` (auto-created on every rate change via PATCH employee or PATCH placement — sources: MANUAL, PLACEMENT_UPDATE, PAYROLL_SYNC; includes effective_date for forecasting/budgets), `timesheet_audit_log`, `invoice_employees`, `rctis`, and `monthly_expected_hours` (per-employee expected working hours by month/year for three-tier hours model).
-   **Employee Transitions:** Edmond Apoderado (CD012406) is OFFBOARDED with ENDED PM&C placement (end 2025-12-31); William Gill replaced him on CD012406 from Feb 2026. CD012378 was shared by Zean, Raihan, and Guy historically — invoices are linked by name in description, not just contract code.
-   **Multi-tenancy:** All 24 data tables have a `tenant_id` column for per-Xero-organisation data isolation. The `users` and `settings` tables are app-wide (no tenant_id). Tenant filtering is applied on all read queries and tenant stamping on all writes via `getActiveTenantId()` / `setActiveTenantId()` cached helpers in `server/storage.ts`. Switching organisations no longer clears data — it just changes the active tenant filter. Indexes exist on tenant_id for employees, invoices, timesheets, clients, pay_runs, and bank_transactions.

**Feature Specifications:**
-   **Admin Panel:** Includes comprehensive modules for Dashboard, Employees (with detailed profiles, financials, documents), Timesheets (upload with AI OCR, review, approval workflow, monthly hours editor for inline editing, change history/audit trail per timesheet, duplicate upload warnings for approved timesheets), Payroll (pay run management, payslip generation, ABA files), Invoices (with detail dialog showing multi-employee linkage via `invoice_employees` junction table with checkbox multi-select and chips; **Invoice Alignment Wizard** — triggered via "Align" button, runs auto-matching rules then shows proposed links for review before committing; matches by placement, charge-out rate, and employee name in description; includes "Unlinked" tab filter; detail dialog shows placement-specific charge-out rates per client), RCTIs (Recipient Created Tax Invoices — track revenue from RCTI clients with auto-match from bank transactions, RCTI client toggle, CRUD management, integrated into profitability and reconciliation), Reconciliation (interactive cells linking to related records, quick edit dialog for timesheet hours, includes junction-linked invoices and RCTI amounts, contractor cost tracking via SPEND bank transactions for INVOICE employees, month completeness KPI, gross earnings fallback when Xero returns $0), Bank Statements (synced from Xero; **invoice linkage status** — each transaction shows whether it's linked to an invoice payment, RCTI, or contact+amount match, with Linked/Unlinked filter toggle; type filter, amount range filter, and contact column sorting), Profitability (revenue vs cost per employee-client placement with auto-link invoices; includes RCTI revenue; **three-tier hours model** — Invoiced/RCTI hours (highest confidence) → Timesheet hours (medium, "T" badge) → Estimated hours (lowest, "E" badge); **drill-down on every numeric cell** — clicking any value opens a right-side Sheet slide-out showing source records with three-tier breakdown card, and empty cells allow adding hours via inline form), Client Ledger (client payments received vs employee costs paid with flexible date ranges, drill-down, **estimated revenue column** using three-tier hours × charge-out rate with source indicators), Notifications, Settings (including Xero integration), Clients, and Placements (active placements hide end date; ending a placement shows a date picker).
-   **Employee Portal:** Provides self-service functionalities for employees including Dashboard, Timesheet entry, Leave requests, Payslip access, Messaging, and an Onboarding wizard.

## External Dependencies

-   **OpenAI GPT-4o Vision:** Accessed via Replit AI Integrations for PDF timesheet OCR and data extraction.
-   **Xero API:** OAuth2 integration with Xero Payroll AU API and Xero Accounting API for financial data synchronization (employees, pay runs, timesheets, invoices, contacts, bank transactions). Uses `xeroFetch()` helper with automatic retry on 429 rate limits (up to 5 retries with exponential backoff). Daily rate limits (Retry-After > 120s) abort immediately with a clear error. Pay runs sync is optimized to skip detail fetches for unchanged records. **Push to Xero:** Draft invoices can be pushed to Xero as DRAFT via `pushInvoiceToXero()` in `server/xero.ts` — creates ACCREC invoice with account code 200, OUTPUT tax type, and links back to local record. Sync timestamps are stored per-tenant (e.g. `xero.lastEmployeeSyncAt.{tenantId}`).
-   **PostgreSQL:** Relational database for all application data storage.
-   **pdftoppm:** Utility used server-side for converting PDF documents to PNG images for OCR processing.
-   **jsPDF:** Server-side library for generating PDF payslips.
-   **Passport.js:** Authentication middleware for Node.js.
-   **express-session:** Session management middleware for Express.
-   **connect-pg-simple:** PostgreSQL session store for `express-session`.
-   **Drizzle ORM:** TypeScript ORM for PostgreSQL.
-   **Tailwind CSS:** Utility-first CSS framework.
-   **shadcn/ui:** Reusable UI components.
-   **wouter:** Lightweight React router.
-   **Vite:** Frontend build tool.
-   **DM Sans + DM Mono:** Chosen fonts for the application.

## ACT Working Days Calculator

The system includes an ACT (Australian Capital Territory) working days calculator (`server/act-working-days.ts`) that computes working days per month accounting for:
- ACT public holidays (New Year's, Australia Day, Canberra Day, Easter, Anzac Day, Reconciliation Day, King's Birthday, Family & Community Day, Christmas, Boxing Day)
- Christmas/New Year shutdown period (~20 Dec – 3 Jan)
- Standard 7.5 hour working day

Used for:
- Populating `monthly_expected_hours` baseline data for profitability estimates
- Settings > Data tab shows working days calendar by year
- API: `GET /api/act-working-days?year=YYYY` and `POST /api/generate-expected-hours` (accepts `startYear`, `endYear`)

## Pay Rate Derivation

The system derives employee hourly pay rates from payslip data when Xero returns $0 for rate_per_hour (common with salaried/monthly contract employees).

**Formula:** `pay_rate = (net_pay + super_amount) / hours`
- Hours sourced from timesheets first, then invoices as fallback
- Falls back to gross_earnings if net_pay + super unavailable
- Creates `rate_history` records with source "PAYROLL_SYNC"
- Updates each employee's `hourly_rate` to their latest derived rate
- Skips rates outside $0-$1000/hr range as invalid

**API:** `POST /api/employees/derive-pay-rates` — uses current active tenant from session settings
**UI:** Settings > Data tab has a "Derive Pay Rates from Payslips" button

## Timesheet Auto-Population

Timesheets are auto-created from invoiced hours: for every employee-month with invoice data, an APPROVED timesheet record exists with `total_hours` = sum of invoice hours. This feeds the three-tier hours model in profitability (Invoiced → Timesheet → Estimated).