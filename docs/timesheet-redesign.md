# Timesheet Page Redesign — Design Specification

> Status: **Proposed — not yet built**  
> Last updated: March 2026  
> Supersedes: existing three-tab `timesheets.tsx` (Upload / Submissions / Monthly Hours)

---

## 1. The Problem With the Current Design

The existing page has three independent tabs that don't talk to each other:

| Tab | What it does | What it's missing |
|---|---|---|
| Upload | Drop PDFs → AI scan → batch submit | No awareness of existing invoices or RCTIs. Can't see "has this placement already been billed?" |
| Submissions | Lists all timesheets by status | Can't create an invoice from here. No RCTI distinction. Estimates and actuals look identical. |
| Monthly Hours | Grid of hours per employee/month | Purely payroll prep. Doesn't show billing status, doesn't link to invoices. |

The deeper problem: **timesheets, invoices, RCTIs, and payroll are all disconnected silos.** After a timesheet is approved nothing automatically happens — the user must manually go to invoices and re-enter the same hours.

Industry best practice is a **linear pipeline**:
```
Hours confirmed → Timesheet approved → Invoice/RCTI reconciled → Payroll run
```
Every step should be visible and actionable from a single view.

---

## 2. Core Mental Model: Period-Centric Reconciliation

The new design centres on a **month × employee/placement grid** — one row per active placement, showing the complete billing and payroll status for that period.

The upload and manual entry flows remain, but they are **entry points into the grid**, not standalone tabs.

---

## 3. Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ TopBar: "Timesheets"  ← Mar 2026 →  [Upload PDFs]  summary pills   │
├─────────────────────────────────────────────────────────────────────┤
│ Tab bar: [Reconciliation ●] [Inbox (3)] [Documents]                 │
├─────────────────────────────────────────────────────────────────────┤
│ Filter bar: All | Needs Action | Missing | Ready to Invoice          │
├─────────────────────────────────────────────────────────────────────┤
│  RECONCILIATION GRID                                                 │
│  Employee         Source    Hours   TS Status   Invoice   Payroll   │
│  ─────────────────────────────────────────────────────────────────  │
│  Jane Smith       PDF ✓     152h    APPROVED    SENT →    ✓ Pay run │
│   └─ TechCorp                                                        │
│  John Doe         Portal    —       MISSING     NO INV    —          │
│   └─ GovDept      RCTI                          RCTI ref            │
│  Ali Hassan       Admin     160h    SUBMITTED   DRAFT     —          │
│  ...                                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Footer totals: X employees · Xh total · $X gross · X missing         │
└─────────────────────────────────────────────────────────────────────┘
```

### Summary Pills (TopBar)
Real-time counts for the selected month:
- 🟡 **X pending** — submitted, awaiting approval
- 🔴 **X missing** — active placements with no timesheet at all
- 🟢 **X approved** — approved, ready to act on
- 🔵 **X to invoice** — approved, no invoice yet (non-RCTI clients)

---

## 4. Tab 1: Reconciliation Grid (default)

### Columns

| Column | Notes |
|---|---|
| **Employee + Client** | Two-line: employee name / client name. RCTI badge if client is RCTI-billed. |
| **Source** | Badge: `Portal` / `PDF` / `Admin` / `RCTI`. PDF and RCTI show a paperclip if document is attached. |
| **Hours** | Regular + OT sub-line. Greyed dash if no timesheet. |
| **Timesheet Status** | Clickable status pill with dropdown (DRAFT → SUBMITTED → APPROVED / REJECTED). |
| **Invoice** | Shows: `—` (none), `DRAFT`, `SENT`, `PAID`, or `RCTI [ref]` for RCTI clients. Clicking opens inline actions. |
| **Payroll** | Tick + pay run reference if included in a Xero pay run. Dash if not yet. |
| **Actions** | Contextual — see Section 7. |

### Row States (colour coding)
- **Red row** — missing: active placement, no timesheet for this month
- **Amber row** — needs action: submitted/rejected/draft not progressed
- **White row** — in progress or complete
- **Green row** — fully reconciled: approved + invoiced/RCTI matched + in payroll

### Grouping
Rows are grouped by client by default (collapsible). Can switch to group by employee.

---

## 5. Tab 2: Inbox

A focused action queue — only items that need something done. Sorted by urgency.

Inbox items:
- Timesheets in `SUBMITTED` status (need approval/rejection)
- Timesheets in `REJECTED` status (need re-submission or admin correction)
- Approved timesheets with no invoice and non-RCTI client (ready to invoice)
- Active placements with no timesheet at all past the 5th of the following month

Each card shows the issue, the employee/client, and a primary action button. This is the "things to do today" view.

---

## 6. Tab 3: Documents

A searchable library of all uploaded timesheet PDFs/screenshots.

Columns: Employee, Client, Period, File name, File type, Uploaded date, Linked timesheet status.

Allows bulk download. Supports filtering by month, employee, or document type.

---

## 7. Contextual Actions Per Row

Actions shown depend on the row state:

### No timesheet yet
- **Upload PDF** → opens upload dialog pre-filled with this employee/month
- **Manual Entry** → opens inline edit
- **Link RCTI** → (RCTI clients only) link existing RCTI record

### Timesheet submitted
- **Approve** (primary)
- **Reject** with rejection reason
- **View Document** (if attached)

### Timesheet approved — non-RCTI client
- **Create Invoice** → pre-fills invoice form with hours, rate, client, period
- **Add to Existing Invoice** → if a draft invoice already exists for this client/period, shows a prompt:
  > "You have a draft invoice for TechCorp — March 2026 (#INV-0042).  
  > **Add these hours** · **View draft** · **Create separate invoice**"
- **View Invoice** → if invoice already exists

### Timesheet approved — RCTI client
- **Log RCTI Reference** → link to an existing RCTI record (or create new RCTI stub)
- The invoice column shows `RCTI [ref]` once linked
- No "Create Invoice" option shown — RCTI is the billing instrument

### Included in payroll
- Lock icon on hours — timesheet hours are read-only once in a pay run
- **View Pay Run** → links to the Xero pay run

---

## 8. Upload Flow (Revised)

The upload panel is no longer a standalone tab. It is triggered by:
- **[Upload PDFs]** button in the TopBar → multi-file batch upload as today
- **Upload PDF** action on a specific missing row → employee and month are pre-filled

The AI scan flow itself is unchanged. After successful upload and assignment, the grid row updates immediately.

---

## 9. RCTI Client/Employee Recognition

### Schema change required
Add `billingType` to the `clients` table:
```
billingType: 'INVOICE' (default) | 'RCTI'
```

Most of the time the client setting drives everything. An optional `rctiOverride` on `placements` handles the edge case where one placement at an INVOICE client still uses RCTI.

### Where RCTI shows in the UI
- **Client profile page**: "Billing Type" field. Changing to RCTI shows a note explaining the flow difference.
- **Timesheet grid**: RCTI badge next to client name on every row for that client
- **Invoice column**: RCTI rows show RCTI reference instead of invoice number
- **Invoice creation**: "Create Invoice" button is hidden for RCTI clients — replaced with "Log RCTI"

---

## 10. Invoice Creation From Timesheet

### Trigger
Approved timesheet row → Actions → "Create Invoice"

### Pre-filled fields
- Client, Employee, Period
- Hours (from approved timesheet)
- Rate (from placement `chargeOutRate`, falls back to employee `hourlyRate`)
- GST auto-calculated
- Description: "[Employee Name] — [Month Year] — [X]h"

### If a draft invoice already exists for this client this period
Show an inline banner before opening the form:
> "You have a draft invoice for TechCorp — March 2026 (#INV-0042) with 2 line items.  
> **Add these hours** · **View draft** · **Create separate invoice**"

This prevents duplicate invoices for clients with multiple placements.

### After creation
The invoice column on the timesheet row updates to `DRAFT` with a link.

---

## 11. RCTI as Source of Truth

When an RCTI is received from a client:
1. It is logged on the RCTIs page as usual
2. From the RCTI record, user can **"Link to Timesheet"** → sets `rctiId` on the timesheet
3. The timesheet row shows `RCTI [ref]` in the invoice column
4. If RCTI hours differ from timesheet hours, a warning is shown (discrepancy, not a block)
5. Bank reconciliation: RCTI amount matches bank transaction when received (same as invoice payment matching)

If an RCTI arrives and there is no timesheet for that employee/period:
- RCTIs page flags this: "No timesheet found for [Employee] — [Period]"
- Admin can create a timesheet stub from the RCTI (source: `RCTI`, hours from RCTI)

---

## 12. Where Estimated Hours Go (Out of Timesheets)

Estimated/forecasted hours are **planning data**, not operational data. They move to the **Placement** record.

### Proposed location: Placements page
Add to the placement detail panel:
- **Forecasted Hours/Month** — the expected monthly hours for this placement
- **Forecasted Revenue/Month** — auto-calculated from forecasted hours × charge-out rate

This feeds:
- A **Revenue Forecast** widget on the Dashboard ("expected vs actual by month")
- Utilisation reporting

On the Timesheets page, the "Expected" column from the old Monthly Hours tab is **removed**. The reconciliation grid shows actuals only.

---

## 13. Schema Changes Summary

| Table | Change | Reason |
|---|---|---|
| `clients` | Add `billingType: 'INVOICE' \| 'RCTI'` | Drive RCTI vs invoice flow |
| `placements` | Add `forecastedHoursPerMonth: numeric` | Move estimates out of timesheets |
| `timesheets` | Add `rctiId: FK → rctis.id` (nullable) | Link RCTI to timesheet |
| `timesheets` | Add `lockedByPayRunId` (nullable) | Lock hours once in payroll |
| `timesheets` | Formalise `source` as enum: `PORTAL \| PDF_UPLOAD \| ADMIN_ENTRY \| RCTI` | Consistent source typing |

All additions are nullable columns — no breaking changes.

---

## 14. What Stays the Same

- AI PDF scan endpoint (`/api/timesheets/scan`) — no changes needed
- Batch submit endpoint (`/api/timesheets/batch`) — no changes needed
- Audit history trail — keep as-is, shown in row expand
- Portal timesheet submission (`portal-timesheets.tsx`) — no changes
- Approve/reject status flow — same logic, new UI surface
- Xero payrun dialog (recently built) — feeds from this grid's approved hours

---

## 15. Build Order

**Phase 1 — Schema + data layer (no UI)**
1. Add `billingType` to clients table + migration
2. Add `rctiId` FK to timesheets + migration
3. Add `forecastedHoursPerMonth` to placements + migration
4. Update client profile UI with billing type field

**Phase 2 — Reconciliation grid**
5. New `timesheets.tsx` with month selector + reconciliation grid
6. Row states, source badges, invoice column, payroll column
7. RCTI badge rendering for RCTI clients
8. Inbox tab

**Phase 3 — Action flows**
9. Upload PDF triggered from row (pre-filled)
10. "Create Invoice from Timesheet" dialog
11. "Add to existing invoice" detection + prompt
12. "Link RCTI" action on RCTI-client rows

**Phase 4 — Forecasting (separate work)**
13. Forecasted hours on placements
14. Revenue forecast widget on dashboard

---

## 16. Open Questions (Confirm Before Building)

1. **Multiple placements, one client, one month** — one consolidated invoice or separate invoices per placement?
2. **RCTI hours discrepancy** — warning only, or does it block payroll?
3. **Timesheet lock** — auto-lock on adding to Xero pay run, or manual confirmation?
