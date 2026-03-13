# Timifi -- System State Reference

> Last reconciled: March 2026 (sessions 1-7 complete)
> Single authoritative reference for what is built and what remains.

---

## 1. What Is Built

### Schema -- 27 tables, all columns applied via db:push

| Table | Column | Notes |
|---|---|---|
| `timesheets` | `rcti_id` | FK -> rctis.id, nullable |
| `timesheets` | `locked_by_pay_run_id` | text, nullable |
| `timesheets` | `discrepancy_status` | text, DEFAULT 'NONE' |
| `rctis` | `timesheet_id` | FK -> timesheets.id, nullable |
| `rctis` | `source` | text, DEFAULT 'MANUAL' |

Enums updated:
- `notificationTypeEnum`: added `RCTI` value (db:push required on next deploy)

### Settings keys (seeded via server/seed.ts, idempotent)

| Key | Default |
|---|---|
| `rcti_discrepancy_threshold_hours` | `0.5` |
| `invoice_payment_terms_days` | `14` |
| `default_invoice_account_code` | `200` |
| `invoice_default_tax_type` | `OUTPUT` |
| `payroll_lock_requires_confirmation` | `true` |

### Business Logic Layer -- server/lib/ (complete, fully wired)

| Module | Key exports |
|---|---|
| `calc.ts` | GST triplets, rounding, safe parsing |
| `super.ts` | Super schedule, `decomposeCostRate()` INCLUSIVE/EXCLUSIVE |
| `payg.ts` | `calculatePayg()` ATO 2024-25 |
| `rates.ts` | `resolveRates()` fallback chain |
| `payroll.ts` | `resolveGrossEarnings()`, `calculatePayrollFeeRevenue()`, `calculatePayrollTax()` |
| `margins.ts` | `calculateMargin()`, `aggregateMargins()` |
| `timesheet.ts` | `hasRctiDiscrepancy()`, source precedence |
| `invoice.ts` | `buildInvoiceLinesFromTimesheet()`, due date calc |

`server/rates.ts` is now a **tombstone** (blank export). All consumers import from `./lib/index` directly.

### Unit Tests -- server/lib/__tests__/ (npm test)

95/95 passing. All test bugs fixed (float rounding, GST tolerance, payroll tax rate units).

### Routes -- server/routes.ts (6311 lines, Phase 5+6 complete)

All inline business logic formulas replaced with lib calls:
- PAYG: `calculatePayg(gross, 'MONTHLY')` (was `gross * 0.19`)
- Margin: `calculateMargin({ revenue, employeeCost, payrollTaxAmount, payrollFeeRevenue })`
- RCTI discrepancy fires `HIGH` priority `RCTI`-type notification when linked with hours mismatch

### CSV Export Endpoints

| Route | Description |
|---|---|
| `GET /api/export/timesheets.csv` | All timesheets with employee, period, hours, status, discrepancy |
| `GET /api/export/profitability.csv?month=&year=` | Active placements revenue summary for a period |

### Dashboard Stats -- getDashboardStats

Returns (in addition to existing fields):
- `overdueInvoices: number` -- count of OVERDUE invoices
- `rctiDiscrepancies: number` -- count of timesheets with unresolved discrepancy

### UI Pages

| Page | Status |
|---|---|
| Settings > Business Rules | 5 editable config keys + Formula Reference |
| Timesheets > Upload | PDF batch scan + manual entry |
| Timesheets > Submissions | All timesheets list with status filter |
| Timesheets > Monthly Hours | Expected hours vs actual grid |
| Timesheets > Reconciliation | Full action grid: Create Invoice, Link RCTI, Lock, Unlock, Resolve Discrepancy, **View History** |
| Timesheets > Inbox | Awaiting approval, RCTI discrepancies, Missing timesheets sections |
| Timesheets > Documents | Searchable document viewer with download |
| Profitability | Revenue vs cost per placement; **Export CSV** button |
| Notifications | Full filter by type (incl. **RCTI**) and priority |
| Dashboard | KPI cards + **Urgency alert banner** (submitted timesheets, RCTI discrepancies, overdue invoices) |

### Audit Log History Drawer

Available from Reconciliation row dropdown > **View History**.
Fetches `GET /api/timesheets/:id/history` and renders field-level changes:
- field name, old → new value, change source label, changed-by, timestamp

---

## 2. Commit History (most recent first)

| SHA | Description |
|---|---|
| `67fa3535` | feat(timesheets): audit log history drawer, Unlock + View History in row dropdown |
| `bd124165` | feat(profitability): CSV export button |
| `77b5a7bd` | feat(dashboard): urgency alert banner |
| `4f02040c` | feat(notifications): add RCTI type to filter and icon map |
| `36f347eb` | chore(rates): tombstone shim |
| `4602684b` | feat(storage): urgency KPIs in getDashboardStats |
| `8f735cc4` | refactor(routes): remove rates shim, fix flat PAYG, calculateMargin, RCTI notification, CSV exports |
| `a0dbc20a` | feat(schema): add RCTI to notificationTypeEnum |
| `b53ffbe9` | feat(timesheets): Inbox, Documents, Unlock flow |
| `0560233a` | refactor(routes): Phase 5 -- wire server/lib into routes |
| `a6fcdc14` | refactor(rates): convert to re-export shim |
| `682bacfb` | feat(timesheets): Phase 4 -- action flows |
| `8babf567` | feat(timesheets): Phase 3 -- Reconciliation grid |
| `3caba8c6` | feat(settings): Phase 2 -- Business Rules tab |
| `86fcb410` | seed: upsert business rules settings keys on startup |
| `3abb0e24` | schema(phase-1): add rctiId, lockedByPayRunId, discrepancyStatus |

---

## 3. Locked Decisions

| Decision | Rule |
|---|---|
| RCTI clients | Use `clients.isRcti: boolean`. No new `billingType` field. |
| Expected hours | Keep `monthly_expected_hours` table. Do NOT move to placements. |
| System config | Extend existing `settings` table. No new `system_rules` table. |
| Invoices | Separate invoice per placement. Multi-line-item support. |
| RCTI discrepancy | Detect (on link) and notify (HIGH priority RCTI notification). Admin resolves. Does NOT block payroll. |
| Payroll lock | Admin confirms via dialog. Audit logged. |
| Source values | `XERO_SYNC, PDF_UPLOAD, ADMIN_ENTRY, PORTAL, RCTI` -- free text, backward compat. |
| Business logic | All calculations via `server/lib/`. No inline formulas in routes. |

---

## 4. Known Remaining Items

| Item | Priority | Notes |
|---|---|---|
| `db:push` to apply `RCTI` enum value | HIGH | Schema updated but Replit DB needs `npm run db:push` |
| Unlock reason field persisted to audit log | MEDIUM | Currently only cleared + toast shown; reason not stored in DB |
| Messages system | LOW | Table + routes exist, no frontend page |
| Remove `server/rates.ts` tombstone entirely | LOW | After confirming no lingering imports |
