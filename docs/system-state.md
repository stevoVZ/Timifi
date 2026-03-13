# Timifi — System State Reference

> Last reconciled: March 2026  
> This document is the single authoritative reference for what is built,  
> what is planned, and what the build order is.  
> All other design docs defer to this one.

---

## 1. What Is Built (Current Production State)

### Database — 24 tables

| Table | Purpose | Notes |
|---|---|---|
| `employees` | Core employee records | Has `chargeOutRate`, `hourlyRate`, `paymentMethod` (PAYROLL/INVOICE) |
| `placements` | Employee ↔ Client assignments | Has `chargeOutRate`, `payRate`, `payrollFeePercent` |
| `clients` | Client records | Has `isRcti: boolean` — RCTI clients flagged here |
| `timesheets` | Timesheet records | `source` is free text: XERO_SYNC, PDF_UPLOAD, ADMIN_ENTRY, MANUAL_ENTRY |
| `invoices` | Revenue invoices | Has `timesheetId` FK (rarely populated), `invoiceType`, `category` |
| `invoice_line_items` | Invoice line items | Linked to invoices |
| `invoice_employees` | Invoice ↔ employee join | Multi-employee invoices |
| `invoice_payments` | Payment records | Synced from Xero |
| `pay_runs` | Payroll runs | Has `superRate`, totals |
| `pay_run_lines` | Per-employee pay data | `grossEarnings`, `paygWithheld`, `superAmount`, `netPay` |
| `payslip_lines` | Detailed payslip breakdown | EARNINGS/DEDUCTION/SUPER/TAX lines |
| `rctis` | Recipient-Created Tax Invoices | Received from RCTI clients (DFAT, ACIC) |
| `bank_transactions` | Bank statement lines | Synced from Xero, linkable to invoices/employees |
| `documents` | File attachments | Payslips, contracts, timesheets |
| `monthly_expected_hours` | Forecasted hours per employee/month | Feeds utilisation on Profitability page |
| `rate_history` | Historical rate changes | Sources: PAYROLL_SYNC, MANUAL |
| `timesheet_audit_log` | Timesheet change history | Field-level audit trail |
| `payroll_tax_rates` | State payroll tax rates | Editable per state/FY |
| `pay_items` | Payroll earning/deduction types | |
| `tax_declarations` | Employee TFN declarations | |
| `bank_accounts` | Employee bank account details | |
| `super_memberships` | Super fund details | |
| `leave_requests` | Leave applications | |
| `notifications` | System notifications | |
| `messages` | Admin ↔ employee messaging | |
| `settings` | Key-value configuration store | Used for ABA settings, opening balances, etc. |
| `users` | Admin users | |

### RCTI Client Recognition (already built)

`clients.isRcti: boolean` — already exists and is deeply wired:
- `POST /api/rctis/auto-match` — creates RCTIs from bank RECEIVE txns for isRcti=true clients
- `/api/bank-transactions/linkage` — flags transactions from RCTI clients differently
- `/api/profitability` — treats RCTI revenue differently from invoiced revenue
- Currently: DFAT and ACIC are marked isRcti = true

**No schema change needed for RCTI client recognition.** The `billingType` enum proposed in earlier specs is redundant — `isRcti` already does the job.

### Timesheet Sources (currently in use)

| Value | Meaning |
|---|---|
| `XERO_SYNC` | Created from Xero pay run rebuild |
| `PDF_UPLOAD` | Created from OCR scan of uploaded PDF |
| `ADMIN_ENTRY` | Created manually by admin |
| `MANUAL_ENTRY` | Created by employee in portal (currently used for portal) |

`source` is a free-text field (not a DB enum), so new values can be added without a migration.

### Expected Hours (already built)

`monthly_expected_hours` table with per-employee, per-month entries. Endpoints: `GET /api/expected-hours`, `POST /api/expected-hours`, `DELETE /api/expected-hours/:id`, `POST /api/generate-expected-hours`. Feeds utilisation on the Profitability page.

**No change needed.** The earlier spec proposal to "move expected hours to placements" is dropped — the existing system works and is wired into profitability.

### Settings / Config (already built)

`settings` table with `key`/`value`/`updatedAt`. Endpoints: `GET /api/settings`, `GET /api/settings/:key`, `PUT /api/settings/:key`. Currently stores: ABA company name, opening balances, etc.

Business rules config (discrepancy thresholds, invoice terms, etc.) will use **this same table** — not a new `system_rules` table.

### Business Logic Layer (just added — not yet wired)

`server/lib/` — pure calculation functions, no routes changed yet:
- `calc.ts` — GST, rounding, safe parsing
- `super.ts` — super rate schedule, inclusive/exclusive decomposition
- `payg.ts` — PAYG withholding (ATO 2024-25)
- `rates.ts` — rate resolution engine
- `payroll.ts` — gross, PAYG, super, net, payroll tax, payroll fee
- `margins.ts` — revenue, cost, margin
- `timesheet.ts` — RCTI discrepancy, source precedence
- `invoice.ts` — invoice line defaults, dates

**server/rates.ts still exists** — not yet replaced. Routes still import from there. Migration is incremental.

---

## 2. Real Gaps (What Needs to Be Built)

### 2a. Schema Additions Required

Minimal — only what isn't already there:

| Table | Column | Type | Default | Purpose |
|---|---|---|---|---|
| `timesheets` | `rcti_id` | `varchar` FK → `rctis.id` | `null` | Link timesheet to received RCTI |
| `timesheets` | `locked_by_pay_run_id` | `text` | `null` | Set when admin confirms payroll lock |
| `timesheets` | `discrepancy_status` | `text` | `'NONE'` | `NONE / FLAGGED / DISPUTED / RESOLVED` |
| `rctis` | `timesheet_id` | `varchar` FK → `timesheets.id` | `null` | Bidirectional link |

All nullable / defaulted. Applied via `db:push` (no migration files).

### 2b. Timesheet Source Values — Standardise

Add to valid values (no schema change, free text field):
- `PORTAL` — replace `MANUAL_ENTRY` for new portal submissions (keep old rows as-is)
- `RCTI` — when a timesheet stub is created from a received RCTI record

### 2c. Settings Keys — Add Business Rules Config

Add to `settings` table via seed/upsert (no schema change):

| Key | Value | Purpose |
|---|---|---|
| `rcti_discrepancy_threshold_hours` | `0.5` | Hours delta before discrepancy fires |
| `invoice_payment_terms_days` | `14` | Default due date offset |
| `default_invoice_account_code` | `200` | Xero account code for labour invoices |
| `invoice_default_tax_type` | `OUTPUT` | GST tax type on line items |
| `payroll_lock_requires_confirmation` | `true` | Admin must confirm before locking |

### 2d. New Feature: Timesheet Reconciliation Page

Replace `timesheets.tsx` (3-tab: Upload / Submissions / Monthly Hours) with a new period-centric reconciliation view.

See Section 3 for full spec.

### 2e. New Feature: Invoice Creation from Timesheet

Approved timesheet row → "Create Invoice" → pre-filled form with line items.

See Section 3 for spec.

### 2f. New Feature: Payroll Lock Flow

Admin confirms before timesheet hours are locked. Sets `lockedByPayRunId`. Audit logged.

### 2g. New Feature: RCTI Discrepancy Detection

When `rctiId` is set on a timesheet, compare hours. If delta > threshold → set `discrepancyStatus = FLAGGED`, create HIGH priority notification, surface in Inbox.

---

## 3. Timesheet Page Redesign

### Mental Model

Period-centric grid: one row per active placement per month. Upload and manual entry are entry points into the grid, not standalone tabs.

### Tab Structure

**Tab 1: Reconciliation (default)**

Month selector in topbar. Grid columns:

| Column | Content |
|---|---|
| Employee + Client | Name / client name. RCTI badge if `client.isRcti = true`. |
| Source | `XERO_SYNC / PDF_UPLOAD / ADMIN_ENTRY / PORTAL / RCTI` badge |
| Hours | Regular + OT. Dash if no timesheet. |
| Timesheet Status | Clickable status pill (DRAFT → SUBMITTED → APPROVED / REJECTED) |
| Invoice | `—` / `DRAFT` / `SENT` / `PAID` / `RCTI [ref]` |
| Payroll | Pay run reference if included. Lock icon if locked. |
| Actions | Contextual (see below) |

Row colours: red = missing, amber = needs action, white = in progress, green = fully reconciled.

**Tab 2: Inbox**

Action queue: submitted needing approval, rejected needing correction, approved with no invoice (non-RCTI), missing past 5th of month, RCTI discrepancy alerts.

**Tab 3: Documents**

Searchable PDF library with bulk download.

### Contextual Actions

| Row State | Actions |
|---|---|
| No timesheet | Upload PDF (pre-filled) / Manual Entry / Link RCTI (isRcti clients) |
| Submitted | Approve / Reject / View Document |
| Approved, non-RCTI | Create Invoice / Add to Existing Draft / View Invoice |
| Approved, isRcti | Log RCTI Reference |
| Locked | View Pay Run (read-only) |

### Invoice Creation Flow

1. Check for existing DRAFT invoice for same placement + period
2. If found: prompt — "Add to existing draft / Create separate / View draft"
3. If not: open form pre-filled with:
   - Regular hours line: `qty = regularHours`, `rate = placement.chargeOutRate`
   - OT hours line (if OT > 0): `qty = overtimeHours`, `rate = chargeOutRate × 1.5`
   - User can add/remove/edit lines before saving
4. On save: `timesheets.invoiceId` → no, the existing `invoices.timesheetId` FK is set

### RCTI Discrepancy Flow

1. `timesheets.rctiId` set → compare hours
2. Delta > `settings.rcti_discrepancy_threshold_hours` → set `discrepancyStatus = FLAGGED`
3. HIGH priority notification created
4. Inbox card shows: "RCTI hours (160h) differ from timesheet (152h)"
5. Resolution options: Use TS hours / Use RCTI hours / Mark DISPUTED
6. Resolution writes to `timesheet_audit_log` with `changeSource = RCTI_DISCREPANCY_RESOLUTION`
7. Payroll is NOT blocked — admin decides

### Payroll Lock Flow

1. After timesheet appears in a pay run, "Lock for Payroll" action appears
2. Confirmation dialog shows: hours, pay run ref, warning
3. On confirm: `lockedByPayRunId` set, audit log entry created
4. Hours become read-only in grid
5. "Unlock" exists with required reason field

---

## 4. Build Order

### Phase 1 — Schema + Settings (no UI changes, `db:push`)

1. Add columns to `timesheets`: `rctiId`, `lockedByPayRunId`, `discrepancyStatus`
2. Add column to `rctis`: `timesheetId`
3. Update `shared/schema.ts` for both tables
4. Seed new settings keys into `settings` table via a one-time script

### Phase 2 — System Rules UI (lightweight, reuses existing settings API)

5. New page `/settings/system-rules` (or section within Settings page)
   - Editable table: discrepancy threshold, invoice terms, account code, tax type, lock confirmation
   - Read-only formula reference panel

### Phase 3 — Reconciliation Grid

6. New `timesheets.tsx`: month selector + reconciliation grid (replaces 3-tab layout)
7. Row states, source badges, invoice column, payroll column, RCTI badge
8. Inbox tab with action cards
9. Documents tab (reuse existing document query)

### Phase 4 — Action Flows

10. Upload PDF from specific row (employee/month pre-filled)
11. "Create Invoice from Timesheet" dialog (multi-line, draft detection)
12. "Link RCTI" action for isRcti rows
13. Payroll lock flow (confirm dialog → lock → audit)
14. RCTI discrepancy detection + resolution flow

### Phase 5 — Business Logic Migration (parallel, ongoing)

15. Wire `server/lib/` into existing route handlers (replace inline formulas)
16. Retire `server/rates.ts` (re-export from `server/lib/super.ts` then remove import)
17. Add unit tests for `server/lib/`

---

## 5. Decisions Locked

| # | Decision |
|---|---|
| RCTI clients | Use existing `clients.isRcti: boolean`. No new `billingType` field. |
| Expected hours | Keep `monthly_expected_hours` table. Do NOT move to placements. |
| System config | Extend existing `settings` table. No new `system_rules` table. |
| Invoices | Separate invoice per placement. One invoice can have multiple line items (regular + OT + custom). |
| RCTI discrepancy | Detect and notify. Admin resolves. Does NOT block payroll. |
| Payroll lock | Admin confirms. Deliberate action after pay run. Audit logged. |
| Source values | `XERO_SYNC, PDF_UPLOAD, ADMIN_ENTRY, PORTAL, RCTI` — free text, backward compat. |
| Business logic | All new calculations import from `server/lib/`. No new inline formulas in routes. |

---

## 6. Key Rate Data (Locked, Do Not Lose)

From `replit.md`:
- Ben Sharman (DFAT): charge-out = **$154.32/hr** (pay rate = $140)
- Roozbeh Pooladvand (ACIC): charge-out = **$180/hr**
- Steven Diep (ACIC): charge-out = **$210/hr**

---

## 7. Files Not to Touch

| File | Reason |
|---|---|
| `server/rates.ts` | Still imported by routes. Migrate incrementally. |
| `server/ocr.ts` | AI scan endpoint — no changes needed |
| `server/xero.ts` | Xero sync — no changes needed for redesign |
| `client/src/pages/portal/portal-timesheets.tsx` | Employee portal — no changes needed |
| `server/storage.ts` | Storage layer — add new query methods only, don't refactor existing |
