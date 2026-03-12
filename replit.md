# Recruitment Portal

## Overview

The Recruitment Portal is a comprehensive management system for labour hire agencies, centralizing employees, timesheets, invoicing, and payroll. It features both an administrative panel and a self-service employee portal. The system aims to streamline operations, enhance efficiency, and provide real-time financial insights through direct integration with Xero. Key capabilities include AI-powered OCR for timesheet processing, robust payroll management with ABA file generation, and detailed financial reconciliation. The project's vision is to modernize labour hire agency management, reduce manual overhead, and improve the experience for agency staff and employees.

## User Preferences

I prefer clear and concise communication. For any proposed changes, please provide a brief explanation of the "why" behind them. I value iterative development, so feel free to suggest small, incremental improvements. When making significant architectural decisions or adding new external dependencies, please ask for my approval first.

## System Architecture

The Recruitment Portal is a full-stack application designed for scalability and maintainability.

**Frontend:**
-   **Technology Stack:** React with TypeScript, Vite, Tailwind CSS, and shadcn/ui.
-   **UI/UX Design:** Admin panel features dashboards with KPIs, sortable tables, and quick actions. Employee portal is simplified for self-service.

**Backend:**
-   **Technology Stack:** Express.js with TypeScript.
-   **Authentication:** Passport.js for admin authentication; employee portal uses email-based login.
-   **AI/OCR:** Integrates OpenAI GPT-4o Vision for PDF timesheet scanning and data extraction.
-   **Payroll:** Generates payslips (PDF) and ABA direct entry files.
-   **Xero Integration:** OAuth2-based integration for syncing employees, pay runs, timesheets, invoices, contacts, bank transactions, and payroll settings across multiple organizations.

**Database:**
-   **Type:** PostgreSQL with Drizzle ORM.
-   **Schema Design:** 24 data tables, all designed with a `tenant_id` for multi-tenancy. Key tables include `employees`, `timesheets`, `invoices`, `pay_runs`, `documents`, `notifications`, and `users`.

**Feature Specifications:**
-   **Admin Panel:** Modules for Dashboard, Employee management, Timesheet processing (AI OCR upload, review, approval, monthly hours editor), Payroll (pay run management, payslips, ABA files), Invoicing (Gap Analysis, multi-line creation, duplicate detection, Xero push, Alignment Wizard), RCTIs (AI-powered extraction, batch creation), Reconciliation (drill-downs, inline editing, financial KPIs), Bank Statements (Xero sync, manual/auto-linking), Profitability (revenue vs. cost analysis, three-tier hours model, drill-downs, client ledger), Notifications, and Settings (Employee Merge/Transfer tool).
-   **Employee Portal:** Self-service functions including Dashboard, Timesheet entry, Leave requests, Payslip access, Messaging, and Onboarding.
-   **Profitability Calculations:** Comprehensive cost formulas (gross earnings + super + payroll tax for payroll employees; ex-GST bank spend transactions for contractors). Revenue is ex-GST. Profit and margin calculations available with/without payroll tax. Contractor costs use GST-aware conversion. **Super-inclusive rate handling:** Placement and employee pay rates are total cost inclusive of super — estimated costs use `rate × hours` directly. Rate history and payroll-derived rates (from Xero payslips) are super-exclusive base wages — estimated costs add super on top (`rate × hours × (1 + super%)`).
-   **Work Period Alignment:** All profitability data aligns to the work period month.
-   **Pay Rate Derivation:** System can derive employee hourly pay rates from payslip data when Xero provides zero rates. Profitability engine has a second-pass that captures employees with payroll data but no placements, deriving pay rates from `pay_run_lines.ratePerHour` and charge-out rates from matching invoices. Rate source tracking (`payRateSource`, `chargeOutRateSource`) shows where each rate originated: PLACEMENT, RATE_HISTORY, PAYROLL_DERIVED, INVOICE_DERIVED, or EMPLOYEE_DEFAULT.
-   **ACT Working Days Calculator:** Computes working days per month for the ACT, accounting for public holidays and shutdowns.
-   **Duplicate Timesheet Detection:** Uses content hash, file size, and employee/month match for robust detection across upload and reconciliation.
-   **Cash Position Dashboard:** Provides treasury overview with KPIs, bank data gap warning, revenue by client, cost summary, Amex debt tracker, and monthly bank flows from multiple Xero data sources.
-   **Bank Statements Page:** Manages bank transactions with KPIs, linked/unlinked split, link dialog (Invoice, Employee, Category), auto-linking based on references and contacts, and a Data Coverage panel with per-account gap analysis and "Sync All Tenants" button.
-   **Multi-Tenant Bank Sync:** `POST /api/xero/sync-bank-transactions-all` syncs bank transactions for all Xero tenants sequentially. `GET /api/bank-transactions/coverage` returns per-account date ranges, gap months, transaction counts, and sync timestamps.
-   **Global Search:** Searches employees, invoices, pay runs, timesheets with a keyboard shortcut.
-   **Auto-Notifications:** System generates notifications for timesheet/leave approvals/rejections and pay run filings.
-   **CSV Export:** Available for Payroll and Invoices pages.
-   **Portal PDF Upload:** Employees can upload timesheet PDFs for OCR processing and auto-filling forms.
-   **Timesheet Source Tracking:** `timesheets` table tracks `source` (XERO_SYNC, PDF_UPLOAD, ADMIN_ENTRY, MANUAL_ENTRY) to manage different input methods.
-   **Timesheet Month Mapping:** XERO_SYNC timesheets use the pay run's `period_start` month (work period) — NOT the `payment_date` month. `POST /api/xero/rebuild-timesheets` deletes all XERO_SYNC timesheets and rebuilds them from pay_run_lines grouped by `period_start` month, with placement/client attribution.
-   **RCTI Auto-Match Logic:** `POST /api/rctis/auto-match` creates RCTI records from bank RECEIVE transactions for `is_rcti=true` clients. Bank amount is always source of truth. Rate hierarchy for deriving hours: placement `chargeOutRate` → employee `chargeOutRate` → null. Multi-employee attribution: uses placement active dates, name matching in description, and rate-based amount prediction. Unattributable multi-employee payments are flagged `[UNATTRIBUTED - manual review needed]`. Currently DFAT and ACIC are RCTI clients.
-   **Key Rate Data:** Ben Sharman DFAT charge-out rate is $154.32/hr (not pay rate of $140). Roozbeh Pooladvand ACIC rate is $180/hr. Steven Diep ACIC rate is $210/hr.

## External Dependencies

-   **OpenAI GPT-4o Vision:** For AI-powered OCR and data extraction.
-   **Xero API:** OAuth2 integration for financial data synchronization.
-   **PostgreSQL:** Primary relational database.
-   **pdftoppm:** Utility for converting PDF to PNG for OCR.
-   **jsPDF:** Server-side library for generating PDF payslips.
-   **Passport.js:** Authentication middleware.
-   **express-session & connect-pg-simple:** For session management.
-   **Drizzle ORM:** TypeScript ORM for PostgreSQL.
-   **Tailwind CSS & shadcn/ui:** For styling and UI components.
-   **Vite:** Frontend build tool.