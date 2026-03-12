# Timesheet Page Redesign — Design Specification

> Status: **Approved — ready to build**  
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
- **RCTI discrepancy alerts** — RCTI hours differ from linked timesheet hours (see Section 12)

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
- **Create Invoice** → opens invoice form pre-filled (see Section 10)
- **View Invoice** → if invoice already exists (shows status badge)

### Timesheet approved — RCTI client
- **Log RCTI Reference** → link to an existing RCTI record (or create new RCTI stub)
- Invoice column shows `RCTI [ref]` once linked
- No "Create Invoice" option — RCTI is the billing instrument

### Included in payroll (admin-confirmed lock)
- Lock icon on hours — hours become read-only
- **View Pay Run** → links to Xero pay run
- Lock is set manually via **"Lock for Payroll"** action button; admin confirms in a dialog before it applies

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

An optional `rctiOverride` boolean on `placements` handles the edge case where one placement at an INVOICE client still uses RCTI billing.

### Where RCTI shows in the UI
- **Client profile page**: "Billing Type" field. Changing to RCTI shows a note explaining the flow difference.
- **Timesheet grid**: RCTI badge next to client name on every row for that client
- **Invoice column**: RCTI rows show RCTI reference instead of invoice number
- **Invoice creation**: "Create Invoice" button is hidden for RCTI clients — replaced with "Log RCTI"

---

## 10. Invoice Creation From Timesheet

### Decision: Separate invoice per placement, multi-line-item support

Each placement produces its own invoice. However, a single timesheet/invoice can contain **multiple line items** with different rates — for example, the same employee billed at standard rate for regular hours and a different rate for a specific deliverable.

### Trigger
Approved timesheet row → Actions → "Create Invoice"

### Invoice form pre-fill
- Client, Employee, Period
- **Line items** (not just a single hours field):
  - Line 1: Regular hours × chargeOut rate (from placement)
  - Line 2: Overtime hours × OT rate (if OT rate is set on placement) — auto-added if OT hours > 0
  - User can add/remove/edit additional lines before creating
- GST auto-calculated on total
- Description: "[Employee Name] — [Month Year]"

### Existing draft detection
Before opening the form, check: does a DRAFT invoice already exist for this placement this period?
- If yes: show a prompt — "A draft invoice already exists for this placement (#INV-0042). Open it to add lines, or create a separate invoice?"
- If no: open fresh form

### After creation
Invoice column on the timesheet row updates to `DRAFT` with a link.

---

## 11. Timesheet Locking for Payroll

### Rule: Admin must confirm the lock

Timesheets are **not** automatically locked when added to a Xero pay run. The pay run can reference the timesheet hours, but the lock is a separate deliberate action.

### Lock flow
1. On the timesheet row, after it has been included in a Xero pay run, an action button appears: **"Lock for Payroll"**
2. Clicking it shows a confirmation dialog:
   > "Lock [Employee]'s timesheet for [Month Year]?  
   > Hours: 152h regular + 8h OT  
   > Pay run: #XPR-2026-03  
   > **Once locked, hours cannot be edited without admin override.**  
   > [Cancel] [Lock Timesheet]"
3. On confirm: `lockedByPayRunId` is set on the timesheet, hours fields become read-only in the grid
4. An audit log entry is created: `field: "locked"`, `changeSource: "PAYROLL_LOCK"`, `changedBy: admin`

### Unlock (emergency)
A separate admin-only action "Unlock" exists but requires a reason field. Unlock also creates an audit log entry.

---

## 12. RCTI Discrepancy Detection

### When a discrepancy occurs
A discrepancy is detected when:
- An RCTI is linked to a timesheet AND
- `rcti.hours` differs from `timesheet.totalHours` by more than 0.5h (configurable threshold)

### What happens
1. A **discrepancy notification** is created (type: `RCTI_DISCREPANCY`, priority: `HIGH`)
2. The timesheet row in the grid shows an amber warning icon with a tooltip: "RCTI hours (160h) differ from timesheet hours (152h)"
3. The discrepancy appears in the **Inbox** tab as an action item
4. Payroll: the timesheet is **not blocked** from payroll — admin decides which figure is correct

### Resolution options (from the Inbox card)
- **Use timesheet hours** — the PDF/portal submission is authoritative; log a note on the RCTI
- **Use RCTI hours** — update timesheet total to match the RCTI; log reason and audit entry
- **Flag for client clarification** — marks as `DISPUTED`, removes from payroll queue until resolved

### Discrepancy log
All resolutions are written to the timesheet audit trail with `changeSource: "RCTI_DISCREPANCY_RESOLUTION"`.

---

## 13. Where Estimated Hours Go (Out of Timesheets)

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

## 14. Schema Changes Summary

| Table | Change | Reason |
|---|---|---|
| `clients` | Add `billingType: 'INVOICE' \| 'RCTI'` | Drive RCTI vs invoice flow per client |
| `placements` | Add `forecastedHoursPerMonth: numeric` (nullable) | Move estimates out of timesheets |
| `placements` | Add `rctiOverride: boolean` default false | Per-placement RCTI override for mixed clients |
| `timesheets` | Add `rctiId: FK → rctis.id` (nullable) | Link received RCTI to timesheet |
| `timesheets` | Add `lockedByPayRunId: text` (nullable) | Lock hours once admin confirms payroll lock |
| `timesheets` | Add `discrepancyStatus: 'NONE' \| 'FLAGGED' \| 'DISPUTED' \| 'RESOLVED'` default 'NONE' | Track RCTI discrepancy state |
| `timesheets` | Formalise `source` as enum: `PORTAL \| PDF_UPLOAD \| ADMIN_ENTRY \| RCTI` | Consistent source typing |

All additions are nullable or have defaults — no breaking changes to existing rows.

---

## 15. What Stays the Same

- AI PDF scan endpoint (`/api/timesheets/scan`) — no changes needed
- Batch submit endpoint (`/api/timesheets/batch`) — no changes needed
- Audit history trail — keep as-is, shown in row expand
- Portal timesheet submission (`portal-timesheets.tsx`) — no changes
- Approve/reject status flow — same logic, new UI surface
- Xero payrun dialog — feeds from this grid's approved hours

---

## 16. Build Order

**Phase 1 — Schema + data layer (no UI changes)**
1. Add `billingType` to clients + migration
2. Add `rctiId`, `lockedByPayRunId`, `discrepancyStatus` to timesheets + migration
3. Add `forecastedHoursPerMonth`, `rctiOverride` to placements + migration
4. Update client profile UI: billing type field
5. Update RCTI link endpoint: detect discrepancy, create notification, set `discrepancyStatus`

**Phase 2 — Reconciliation grid**
6. New `timesheets.tsx`: month selector + reconciliation grid replacing three-tab layout
7. Row states (red/amber/white/green), source badges, invoice column, payroll column
8. RCTI badge + discrepancy warning rendering
9. Inbox tab with action cards

**Phase 3 — Action flows**
10. Upload PDF from specific row (pre-filled employee/month)
11. "Create Invoice from Timesheet" — multi-line-item form, existing draft detection
12. "Log RCTI" action for RCTI-client rows
13. Payroll lock flow (confirm dialog → lock → audit entry)
14. RCTI discrepancy resolution flow (use TS / use RCTI / dispute)

**Phase 4 — Forecasting (separate, lower priority)**
15. Forecasted hours on placements
16. Revenue forecast widget on dashboard

---

## 17. Decisions Locked (No Longer Open Questions)

| # | Question | Decision |
|---|---|---|
| 1 | Multiple placements, one client, one month | **Separate invoice per placement.** One invoice can have multiple line items (e.g. regular + OT at different rates, or different deliverables). No consolidated multi-placement invoices. |
| 2 | RCTI hours discrepancy | **Detect, notify, don't block.** Discrepancy creates a HIGH priority notification and Inbox card. Admin resolves by choosing which figure is authoritative or flagging as disputed. Not a payroll block. |
| 3 | Timesheet lock | **Admin confirms.** Lock is a deliberate action after pay run inclusion. Confirmation dialog required. Audit logged. Unlock also possible with reason. |
