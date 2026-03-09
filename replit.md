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
-   **Schema:** Key tables include `employees`, `timesheets`, `invoices` (with `client_id` for traceability), `pay_runs`, `pay_run_lines`, `documents`, `notifications`, `messages`, `settings`, `users`, `leave_requests`, `pay_items`, `tax_declarations`, `bank_accounts`, `super_memberships`, `clients` (with `is_rcti` flag), `placements`, `bank_transactions`, `payslip_lines`, `rate_history`, `timesheet_audit_log`, `invoice_employees`, and `rctis`.

**Feature Specifications:**
-   **Admin Panel:** Includes comprehensive modules for Dashboard, Employees (with detailed profiles, financials, documents), Timesheets (upload with AI OCR, review, approval workflow, monthly hours editor for inline editing, change history/audit trail per timesheet, duplicate upload warnings for approved timesheets), Payroll (pay run management, payslip generation, ABA files), Invoices (with detail dialog showing multi-employee linkage via `invoice_employees` junction table with checkbox multi-select and chips), RCTIs (Recipient Created Tax Invoices — track revenue from RCTI clients with auto-match from bank transactions, RCTI client toggle, CRUD management, integrated into profitability and reconciliation), Reconciliation (interactive cells linking to related records, quick edit dialog for timesheet hours, includes junction-linked invoices and RCTI amounts, contractor cost tracking via SPEND bank transactions for INVOICE employees, month completeness KPI, gross earnings fallback when Xero returns $0), Bank Statements (synced from Xero), Profitability (revenue vs cost per employee-client placement with auto-link invoices; includes RCTI revenue), Client Ledger (client payments received vs employee costs paid with flexible date ranges and drill-down), Notifications, Settings (including Xero integration), Clients, and Placements (active placements hide end date; ending a placement shows a date picker).
-   **Employee Portal:** Provides self-service functionalities for employees including Dashboard, Timesheet entry, Leave requests, Payslip access, Messaging, and an Onboarding wizard.

## External Dependencies

-   **OpenAI GPT-4o Vision:** Accessed via Replit AI Integrations for PDF timesheet OCR and data extraction.
-   **Xero API:** OAuth2 integration with Xero Payroll AU API and Xero Accounting API for financial data synchronization (employees, pay runs, timesheets, invoices, contacts, bank transactions). Uses `xeroFetch()` helper with automatic retry on 429 rate limits (up to 5 retries with exponential backoff). Daily rate limits (Retry-After > 120s) abort immediately with a clear error. Pay runs sync is optimized to skip detail fetches for unchanged records.
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