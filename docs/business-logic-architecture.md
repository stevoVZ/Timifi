# Business Logic Architecture

> Status: **Approved — ready to implement**  
> Created: March 2026

---

## The Problem

All financial logic lives scattered inside `server/routes.ts` (6,240 lines). The audit found:

| Problem | Count | Risk |
|---|---|---|
| `parseFloat()` calls inline | 268 | Silent `NaN` on bad data |
| `Math.round` with manual `* 100 / 100` | 89 | Inconsistent rounding precision |
| `rateIsSuperInclusive` check duplicated | 8 | One wrong assumption breaks payroll silently |
| Gross reconstruction (`netPay + paygWithheld`) duplicated | 6 | Different thresholds in different places |
| Margin / profit calculation duplicated | 24 | Dashboard vs Placements page can show different margins for the same employee |
| Rate resolution fallback chain reimplemented | 5 | Different pages show different rates for same employee |
| `estimatePayg()` defined **inline** inside a single route handler | 1 | Cannot be unit tested, cannot be reused |
| Payroll tax applied at different bases in different endpoints | 13 | Inconsistent payroll tax across reports |

---

## The Solution: A Business Logic Layer

All financial calculations, rate resolution, and business rules move into `server/lib/`. These are **pure functions** — no DB calls, no HTTP, just inputs → outputs. They are:

- Fully unit testable
- Imported by any route that needs them
- The single source of truth for every formula in the system

A **System Rules** admin page exposes configurable values (super rates, GST rate, discrepancy threshold, invoice terms) so they can be audited and updated without a code deploy.

---

## File Structure

```
server/
  lib/
    calc.ts         ← GST, rounding, safe money helpers
    payg.ts         ← PAYG withholding (ATO brackets)
    super.ts        ← Super rate schedule + inclusive/exclusive decomposition
    rates.ts        ← Rate resolution engine (precedence chain)
    payroll.ts      ← Gross, super, net, payroll tax, payroll fee
    margins.ts      ← Revenue, cost, margin, profitability
    timesheet.ts    ← Timesheet rules (discrepancy, lock, source precedence)
    invoice.ts      ← Invoice creation rules (line items, dates)
    index.ts        ← Re-exports everything

client/src/lib/
    calc.ts         ← Shared subset (GST, rounding) for frontend display

docs/
  business-logic-architecture.md   ← This file
```

---

## Module Contracts

### `calc.ts` — Money Arithmetic

All money operations go through these. No raw arithmetic on financial values elsewhere.

```typescript
// Rounding
roundMoney(n)      // 2dp, half-up
roundHours(n)      // 2dp
roundPercent(n)    // 1dp

// Safe parsing — replaces all parseFloat(x || "0")
parseMoney(val)    // null/undefined/empty → 0
parseHours(val)
parseRate(val)

// GST
addGst(exGst)                    // × 1.10
removeGst(inclGst)               // ÷ 1.10
gstComponent(inclGst)            // ÷ 11
gstTriplet(exGst)                // → { exGst, gst, inclGst }
gstTripletFromIncl(inclGst)      // → { exGst, gst, inclGst }
```

### `super.ts` — Superannuation

The #1 source of silent bugs is the super-inclusive vs super-exclusive confusion.

```
SUPER-INCLUSIVE (placements, employees)
  Rate = total employer cost per hour (base wage + super bundled in)
  base = rate / (1 + superRate)
  super = base × superRate

SUPER-EXCLUSIVE (Xero payslip ratePerHour)
  Rate = base wage only
  super = rate × superRate
  total = rate × (1 + superRate)
```

`decomposeCostRate(rate, hours, mode, superRateDecimal)` handles both modes correctly. This is the ONE place this decomposition lives.

### `rates.ts` — Rate Resolution Engine

Single canonical fallback chain — not reimplemented per route.

```
Charge-out:  Placement.chargeOutRate
          → Rate history (most recent ≤ period)
          → Invoice-derived (amountExclGst / hours)
          → Employee.chargeOutRate

Pay rate:    Placement.payRate
          → Rate history
          → Payroll-derived (grossEarnings / hoursWorked from pay run line)
          → Employee.hourlyRate
```

`resolveRates(inputs)` returns `{ chargeOutRate, chargeOutRateSource, payRate, payRateSource, superMode }`.

### `payroll.ts` — Payroll Calculations

- `calculatePayrollLine(input)` → `{ grossEarnings, paygWithheld, superAmount, netPay }`
- `reconstructGross(netPay, paygWithheld)` — THE one place gross reconstruction lives
- `resolveGrossEarnings(rawGross, net, payg)` — handles fallback logic
- `calculatePayrollTax({ taxableBase, state, ratesByState })`
- `calculatePayrollFeeRevenue(gross, feePercent)`

### `payg.ts` — PAYG Withholding (ATO 2024-25)

`calculatePayg(grossForPeriod, payFrequency, taxFlags)` replaces the inline `estimatePayg()` that was defined inside a single route handler and could not be tested or reused.

Includes: progressive brackets, LITO, Medicare Levy (2%), HELP debt.

### `margins.ts` — Profitability

`calculateMargin({ revenue, employeeCost, payrollTaxAmount, payrollFeeRevenue })` → `{ profitExPT, profitIncPT, marginExPT%, marginIncPT% }`.

Used by: Dashboard, Placements page, Employee detail, Profitability report. All pages show identical margins for the same data.

### `timesheet.ts` — Timesheet Rules

- Source precedence: `RCTI(4) > PORTAL(3) > PDF_UPLOAD(2) > ADMIN_ENTRY(1)`
- `hasRctiDiscrepancy(tsHours, rctiHours, threshold)` — configurable threshold
- `calculateTimesheetGross(hours, payRate)` — pay cost
- `calculateTimesheetInvoiceValue(hours, chargeOutRate)` — billable amount

### `invoice.ts` — Invoice Creation Rules

- `buildInvoiceLinesFromTimesheet(ts, rates, employeeName, period)` → array of line items with regular + OT
- `buildInvoiceDescription(employeeName, period)`
- `calculateInvoiceDueDate(issueDate, termsDays)`

---

## The `system_rules` Database Table

Configurable values live in the DB, editable via the System Rules admin page.

```sql
CREATE TABLE system_rules (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  value       text NOT NULL,
  data_type   text NOT NULL DEFAULT 'string',  -- 'number' | 'boolean' | 'string'
  label       text NOT NULL,
  description text,
  category    text NOT NULL,  -- 'GST' | 'SUPER' | 'PAYG' | 'INVOICE' | 'TIMESHEET' | 'PAYROLL'
  is_editable boolean NOT NULL DEFAULT true,
  tenant_id   varchar,
  updated_at  timestamp NOT NULL DEFAULT now()
);
```

### Seed Values

| Key | Default | Category | Description |
|---|---|---|---|
| `gst_rate` | `0.10` | GST | Australian GST rate |
| `invoice_payment_terms_days` | `14` | INVOICE | Default days until invoice due |
| `rcti_discrepancy_threshold_hours` | `0.5` | TIMESHEET | Hours delta before RCTI discrepancy fires |
| `payroll_lock_requires_confirmation` | `true` | PAYROLL | Admin must confirm before locking timesheet |
| `super_rate_override` | `` | SUPER | Override statutory super (empty = use schedule) |
| `default_invoice_account_code` | `200` | INVOICE | Xero account code for labour hire invoices |
| `payroll_tax_applies_default` | `true` | PAYROLL | Default payroll tax flag for new employees |
| `invoice_default_tax_type` | `OUTPUT` | INVOICE | GST tax type on invoice line items |

---

## System Rules Admin Page

Route: `/settings/system-rules`

### Section 1: Editable Rules
Table of all `system_rules` rows with `is_editable = true`. Grouped by category. Inline edit. Shows `updated_at`.

### Section 2: Formula Reference (read-only)

| Formula | Rule |
|---|---|
| **GST** | Amount excl. GST × 1.10 = Amount incl. GST |
| **GST component** | Amount incl. GST ÷ 11 = GST amount |
| **Gross (super-exclusive rate)** | Hours × rate = gross |
| **Gross (super-inclusive rate)** | Hours × (rate ÷ (1 + super%)) = gross |
| **Super** | Gross × super% |
| **Net pay** | Gross − PAYG withheld |
| **Total employer cost** | Gross + super |
| **Margin** | (Revenue − total cost) ÷ Revenue × 100 |
| **Payroll fee revenue** | Gross × fee% |
| **Payroll tax** | Gross × state rate% |
| **Rate — charge-out** | Placement → Rate history → Invoice-derived → Employee default |
| **Rate — pay rate** | Placement → Rate history → Payroll-derived → Employee default |
| **PAYG** | ATO 2024-25 brackets + LITO + 2% Medicare levy |
| **Utilisation** | Actual hours ÷ Expected hours × 100 |
| **RCTI discrepancy** | \|RCTI hours − TS hours\| > threshold → flag |

---

## Migration Plan

**Step 1 — Create `server/lib/` files** (done — this commit)  
No routes change yet. Pure functions only.

**Step 2 — Schema: add `system_rules` table**  
Migration + seed + `/api/system-rules` GET/PATCH endpoints.

**Step 3 — System Rules UI page**  
`/settings/system-rules` with editable rules + formula reference.

**Step 4 — Route migration** (highest-impact first):
1. Replace `parseFloat(x || "0")` with `parseMoney/parseHours/parseRate`
2. Replace `rateIsSuperInclusive` blocks with `decomposeCostRate()`
3. Replace `netPay + paygWithheld` fallbacks with `resolveGrossEarnings()`
4. Replace inline `estimatePayg` with `calculatePayg()`
5. Replace margin formulas with `calculateMargin()`
6. Replace rate resolution blocks with `resolveRates()`

**Step 5 — Unit tests** for every function in `server/lib/`

**Step 6 — Retire `server/rates.ts`** (re-export during transition, then remove)

---

## Rule for new code

> **Any new route handler or service that needs financial calculations MUST import from `server/lib/`. No new inline formulas.**

This applies to all timesheet redesign build phases.
