# Timesheet Page Redesign

> **This document is superseded by `docs/system-state.md` (Sections 3 and 4).**  
> See that document for the current accurate spec, build order, and all locked decisions.  
> The content below is retained for historical context only.

---

## Summary of Key Corrections Made During Reconciliation (March 2026)

The following items from the original spec were **incorrect** and have been corrected in `system-state.md`:

| Original Spec | Correction |
|---|---|
| Add `billingType: 'INVOICE' \| 'RCTI'` to clients | **Wrong.** `clients.isRcti: boolean` already exists and is deeply wired. No change needed. |
| Add `forecastedHoursPerMonth` to placements | **Wrong.** `monthly_expected_hours` table already exists with full API. Leave it. |
| Add `rctiOverride` to placements | **Dropped.** Not needed. `isRcti` on client handles it. |
| New `system_rules` table | **Wrong.** Extend existing `settings` table instead. Same API already exists. |
| Source enum: `PORTAL \| PDF_UPLOAD \| ADMIN_ENTRY \| RCTI` | **Corrected.** Existing values: `XERO_SYNC, PDF_UPLOAD, ADMIN_ENTRY, MANUAL_ENTRY`. Adding `PORTAL` and `RCTI`. Free text — no migration. |

## Decisions That Stand (locked, see system-state.md §5)

- Separate invoice per placement, multi-line-item support
- RCTI discrepancy: detect and notify, never block payroll  
- Payroll lock: admin confirms via dialog, audit logged
- Three new timesheet columns: `rctiId`, `lockedByPayRunId`, `discrepancyStatus`
- One new rctis column: `timesheetId`
