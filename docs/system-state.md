# Timifi -- System State Reference

> Last reconciled: March 2026 (sessions 1-5 complete)
> Single authoritative reference for what is built and what remains.

---

## 1. What Is Built

### Schema -- 24 tables, Phase 1 additions applied via db:push

| Table | Column | Notes |
|---|---|---|
| `timesheets` | `rcti_id` | FK -> rctis.id, nullable |
| `timesheets` | `locked_by_pay_run_id` | text, nullable |
| `timesheets` | `discrepancy_status` | text, DEFAULT 'NONE' |
| `rctis` | `timesheet_id` | FK -> timesheets.id, nullable |
| `rctis` | `source` | text, DEFAULT 'MANUAL' |

### Settings keys (seeded via server/seed.ts, idempotent)

| Key | Default |
|---|---|
| `rcti_discrepancy_threshold_hours` | `0.5` |
| `invoice_payment_terms_days` | `14` |
| `default_invoice_account_code` | `200` |
| `invoice_default_tax_type` | `OUTPUT` |
| `payroll_lock_requires_confirmation` | `true` |

### Business Logic Layer -- server/lib/ (complete, wired into routes)

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

`server/rates.ts` is now a re-export shim -> `server/lib/super.ts`.
All inline formulas in `routes.ts` replaced with lib imports (Phase 5 complete).

### Unit Tests -- server/lib/__tests__/ (npm test)

Requires `npm install` on Replit to pull vitest.

| File | Coverage |
|---|---|
| `calc.test.ts` | Rounding, parsing, all GST helpers |
| `super.test.ts` | FY calc, rate schedule, decomposeCostRate both modes |
| `payg.test.ts` | Annual PAYG brackets, period annualisation |
| `payroll.test.ts` | reconstructGross, resolveGrossEarnings, fee, payroll tax |
| `margins.test.ts` | calculateMargin, aggregateMargins, DFAT scenario |
| `timesheet.test.ts` | Discrepancy, source precedence, gross calcs |
| `invoice.test.ts` | Line builder regular/OT/custom, labels, due dates |
| `rates.test.ts` | Full fallback chain, super mode, history date filter |

### UI -- Timesheets Reconciliation (Phases 3 + 4)

Actions dropdown per row: Create Invoice, Link RCTI, Lock for Payroll, Resolve Discrepancy.

### UI -- Settings Business Rules tab (Phase 2)

5 editable config keys + Formula Reference panel.

---

## 2. Commit History

| SHA | Description |
|---|---|
| Latest | feat(tests): Vitest unit test suite for server/lib |
| `0560233a` | refactor(routes): Phase 5 -- wire server/lib into routes |
| `a6fcdc14` | refactor(rates): convert to re-export shim |
| `682bacfb` | feat(timesheets): Phase 4 -- action flows |
| `8babf567` | feat(timesheets): Phase 3 -- Reconciliation grid |
| `3caba8c6` | feat(settings): Phase 2 -- Business Rules tab |
| `86fcb410` | seed: upsert business rules keys |
| `3abb0e24` | schema(phase-1): new timesheet/rcti columns |

---

## 3. Decisions Locked

| Decision | Rule |
|---|---|
| RCTI clients | `clients.isRcti: boolean`. No `billingType` field. |
| Expected hours | Keep `monthly_expected_hours` table. |
| System config | Extend `settings` table. No new `system_rules` table. |
| Invoices | Separate per placement, multi-line-item. |
| RCTI discrepancy | Detect + notify. Admin resolves. Does NOT block payroll. |
| Payroll lock | Admin confirms. Audit logged. |
| Source values | Free text: XERO_SYNC, PDF_UPLOAD, ADMIN_ENTRY, PORTAL, RCTI |
| Business logic | All calcs in `server/lib/`. No new inline formulas in routes. |

---

## 4. Key Rate Data (Locked)

- Ben Sharman (DFAT): charge-out = **$154.32/hr** (pay rate = $140)
- Roozbeh Pooladvand (ACIC): charge-out = **$180/hr**
- Steven Diep (ACIC): charge-out = **$210/hr**

---

## 5. What Remains

### Immediate
- [ ] `npm install` on Replit then `npm test` to verify all assertions pass
- [ ] Timesheet Inbox tab (submitted needing approval, missing past 5th, discrepancy alerts)
- [ ] Documents tab (searchable PDF library, bulk download)
- [ ] Unlock flow (reason field + audit log)

### Medium term
- [ ] Replace remaining `gross * 0.19` flat PAYG estimate (~line 6191 routes.ts)
- [ ] Remove `server/rates.ts` shim; update all imports to `./lib/index`
- [ ] Wire `resolveRates()` into profitability routes (still uses ad-hoc resolution)
- [ ] Wire `calculateMargin()` into profitability routes (still uses inline calc)
- [ ] HIGH priority notification when RCTI discrepancy detected on link

---

## 6. Files Not to Touch

| File | Reason |
|---|---|
| `server/ocr.ts` | AI scan -- no changes needed |
| `server/xero.ts` | Xero sync -- no changes needed |
| `client/src/pages/portal/portal-timesheets.tsx` | Employee portal -- no changes needed |
| `server/storage.ts` | Add query methods only, don't refactor existing |
