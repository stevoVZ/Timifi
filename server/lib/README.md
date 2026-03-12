# server/lib — Business Logic Layer

Pure calculation functions. No DB calls. No HTTP. Fully testable.

## Files

| File | Responsibility |
|---|---|
| `calc.ts` | GST, rounding, safe number parsing |
| `super.ts` | Super rate schedule, inclusive/exclusive decomposition |
| `payg.ts` | PAYG withholding (ATO 2024-25) |
| `rates.ts` | Rate resolution engine (charge-out + pay rate fallback chain) |
| `payroll.ts` | Gross, PAYG, super, net pay, payroll tax, payroll fee |
| `margins.ts` | Revenue, cost, margin, profitability |
| `timesheet.ts` | RCTI discrepancy, source precedence, gross value |
| `invoice.ts` | Invoice line item defaults, descriptions, due dates |
| `index.ts` | Re-exports everything |

## Rules

1. No DB calls. No HTTP. Pure functions only.
2. All money arithmetic goes through `calc.ts`. No raw `* 0.1` or `/ 1.1` elsewhere.
3. All `parseFloat(x || "0")` → `parseMoney()` / `parseHours()` / `parseRate()`.
4. Rate precedence chain → `rates.ts::resolveRates()` only.
5. Super inclusive/exclusive → `super.ts::decomposeCostRate()` only.
6. Gross reconstruction → `payroll.ts::resolveGrossEarnings()` only.
7. Margin formula → `margins.ts::calculateMargin()` only.

## Migration Checklist (per route handler)

- [ ] `parseFloat(x || "0")` → `parseMoney/parseHours/parseRate`
- [ ] `/ 1.1` or `* 0.1` → `removeGst()` / `gstTriplet()`
- [ ] `rateIsSuperInclusive` block → `decomposeCostRate()`
- [ ] gross reconstruction block → `resolveGrossEarnings()`
- [ ] inline `estimatePayg` → `calculatePayg()`
- [ ] margin formula → `calculateMargin()`
- [ ] rate resolution block → `resolveRates()`
- [ ] `Math.round(x * 100) / 100` → `roundMoney()`
