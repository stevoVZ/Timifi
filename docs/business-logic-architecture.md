# Business Logic Architecture

> **This document is superseded by `docs/system-state.md` (Sections 1 and 4).**  
> The `server/lib/` implementation committed alongside this doc is correct and accurate.  
> The section about a new `system_rules` table has been corrected — use the existing `settings` table instead.

---

## Correction: No New `system_rules` Table

The original version of this document proposed a new `system_rules` database table.  
The `settings` table already exists with the same capability and has `GET/PUT` endpoints wired.  
Business rules config keys will be seeded into `settings` directly (Phase 1, Step 4 in system-state.md).

## What Was Built (accurate)

`server/lib/` — 9 files of pure calculation functions. See README.md in that directory.

These are correct and ready to use. All new route code must import from `server/lib/` rather than implementing formulas inline.

## Migration Checklist (per route handler)

See `server/lib/README.md` for the per-handler checklist.

The migration of existing routes is Phase 5 — parallel with the timesheet redesign build, not a blocker.
