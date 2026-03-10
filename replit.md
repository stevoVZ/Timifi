# Recruitment Portal

## Overview

The Recruitment Portal is a comprehensive management system for labour hire agencies. It centralizes the management of employees, timesheets, invoicing, and payroll, featuring both an administrative panel and a self-service employee portal. The system aims to streamline agency operations, enhance efficiency, and provide real-time financial insights through direct integration with Xero. Key capabilities include AI-powered OCR for timesheet processing, robust payroll management with ABA file generation, and detailed financial reconciliation. The project's vision is to modernize labour hire agency management, significantly reduce manual overhead, and improve the experience for agency staff and employees alike.

## User Preferences

I prefer clear and concise communication. For any proposed changes, please provide a brief explanation of the "why" behind them. I value iterative development, so feel free to suggest small, incremental improvements. When making significant architectural decisions or adding new external dependencies, please ask for my approval first.

## System Architecture

The Recruitment Portal is a full-stack application designed for scalability and maintainability.

**Frontend:**
-   **Technology Stack:** React with TypeScript, Vite for bundling, Tailwind CSS for styling, and shadcn/ui for UI components.
-   **UI/UX Design:** Features a dashboard with KPIs, sortable tables, and quick actions for administrators. The employee portal is simplified for self-service, emphasizing progress tracking and essential information access.

**Backend:**
-   **Technology Stack:** Express.js with TypeScript.
-   **Authentication:** Passport.js for admin authentication (local strategy) and `express-session` with PostgreSQL for session storage. Employee portal uses email-based login without password validation.
-   **AI/OCR:** Integrates OpenAI GPT-4o Vision via Replit AI for PDF timesheet scanning, including data extraction and auto-detection of key details.
-   **Payroll:** Generates payslips (PDF) and ABA direct entry files server-side.
-   **Xero Integration:** OAuth2-based integration for syncing employees, pay runs, timesheets, invoices, contacts, bank transactions, and payroll settings across multiple organizations.

**Database:**
-   **Type:** PostgreSQL.
-   **ORM:** Drizzle ORM for type-safe interactions.
-   **Schema Design:** Features 24 data tables, all designed with a `tenant_id` column to support multi-tenancy for Xero organization data isolation. `users` and `settings` tables are application-wide.
-   **Key Data Structures:** Includes `employees` (with `preferred_name`, `contract_code`, `role_title`), `timesheets` (with `client_id`, `placement_id`), `invoices` (with `client_id`, `xero_contact_id`, `invoice_type`, `reference`), `invoice_line_items`, `pay_runs`, `documents`, `notifications`, `users` (with `display_name`, `email`, `role`), `clients` (with `is_rcti` flag), `placements`, and `rate_history` (tracking rate changes with effective dates).

**Feature Specifications:**
-   **Admin Panel:** Modules for Dashboard, Employee management (profiles, financials), Timesheet processing (AI OCR upload, review, approval, audit trails, monthly hours editor; all status actions always visible for flexibility), Payroll (pay run management, payslips, ABA files), Invoicing (redesigned with Gap Analysis sidebar showing per-placement missing/unlinked/unpaid invoices by month with charge-out rates, multi-line invoice creation supporting multiple placements at different rates with auto-detection, dedicated Create Invoice expandable section with duplicate detection, Push to Xero always visible with re-push confirmation for corrections, KPI cards, and Invoice Alignment Wizard for auto-matching), RCTIs (Recipient Created Tax Invoices management), Reconciliation (redesigned with clickable drill-down dialogs for Timesheet/Invoice/Payroll cells, inline hour editing, invoice period editing, financial KPIs with completeness tracking, progress bars, and payroll detail with PAYG/super breakdown), Bank Statements (synced from Xero with linkage status), Profitability (revenue vs. cost per employee-client placement, three-tier hours model, drill-down capabilities, client ledger with estimated revenue), Notifications, and Settings.
-   **Employee Portal:** Self-service functions including Dashboard, Timesheet entry, Leave requests, Payslip access, Messaging, and Onboarding.
-   **Profitability Calculations:** Includes comprehensive cost formulas (gross earnings + super + payroll tax for payroll employees; ex-GST bank spend transactions for contractors). Revenue is always ex-GST. Profit and margin calculations are available with and without payroll tax.
-   **Work Period Alignment:** All profitability data aligns to the work period month (not payment/issue dates) for pay runs, ACCREC invoices (shifted one month prior to issue date), ACCPAY invoices, and bank transactions.
-   **Pay Rate Derivation:** System can derive employee hourly pay rates from payslip data (net pay + super / hours) when Xero provides zero rates, updating `rate_history`.
-   **ACT Working Days Calculator:** Computes working days per month for the ACT, accounting for public holidays and shutdown periods, used for baseline `monthly_expected_hours` and profitability estimates.

## External Dependencies

-   **OpenAI GPT-4o Vision:** Utilized for AI-powered OCR and data extraction from PDF timesheets.
-   **Xero API:** OAuth2 integration for synchronizing financial data across Xero Payroll AU and Xero Accounting APIs. Includes robust error handling and rate limit management.
-   **PostgreSQL:** The primary relational database for all application data.
-   **pdftoppm:** Command-line utility for converting PDF documents to PNG images for OCR.
-   **jsPDF:** Server-side library used for generating PDF payslips.
-   **Passport.js:** Authentication middleware for Node.js.
-   **express-session & connect-pg-simple:** For session management and PostgreSQL-backed session storage.
-   **Drizzle ORM:** TypeScript ORM for interacting with PostgreSQL.
-   **Tailwind CSS:** Utility-first CSS framework for styling.
-   **shadcn/ui:** Component library built on Tailwind CSS for UI.
-   **wouter:** A lightweight React router.
-   **Vite:** Frontend build tool for fast development.
-   **DM Sans + DM Mono:** Selected fonts for the application's typography.