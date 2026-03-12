/**
 * timesheet.ts — Timesheet business rules
 *
 * RCTI discrepancy detection, source precedence, gross value calculation.
 */

import { roundMoney, parseHours, parseRate } from './calc';

// ---------------------------------------------------------------------------
// Source precedence
// ---------------------------------------------------------------------------

export type TimesheetSource = 'PORTAL' | 'PDF_UPLOAD' | 'ADMIN_ENTRY' | 'RCTI';

/**
 * Authority level for payroll purposes.
 * RCTI = highest (signed legal document from client)
 * PORTAL = employee self-reported
 * PDF_UPLOAD = admin-processed document
 * ADMIN_ENTRY = manual estimate (lowest)
 */
export const SOURCE_PRECEDENCE: Record<TimesheetSource, number> = {
  RCTI: 4,
  PORTAL: 3,
  PDF_UPLOAD: 2,
  ADMIN_ENTRY: 1,
};

export function getSourcePrecedence(source: TimesheetSource): number {
  return SOURCE_PRECEDENCE[source] ?? 0;
}

export function getPreferredSource(a: TimesheetSource, b: TimesheetSource): TimesheetSource {
  return getSourcePrecedence(a) >= getSourcePrecedence(b) ? a : b;
}

// ---------------------------------------------------------------------------
// RCTI discrepancy
// ---------------------------------------------------------------------------

/** Default hours threshold — override via system_rules.rcti_discrepancy_threshold_hours */
export const DEFAULT_RCTI_DISCREPANCY_THRESHOLD = 0.5;

export function hasRctiDiscrepancy(
  timesheetHours: number,
  rctiHours: number,
  threshold = DEFAULT_RCTI_DISCREPANCY_THRESHOLD,
): boolean {
  return Math.abs(timesheetHours - rctiHours) > threshold;
}

export function getDiscrepancyMagnitude(timesheetHours: number, rctiHours: number): number {
  return Math.abs(timesheetHours - rctiHours);
}

export type DiscrepancyDirection = 'RCTI_HIGHER' | 'TIMESHEET_HIGHER' | 'MATCH';

export function getDiscrepancyDirection(timesheetHours: number, rctiHours: number): DiscrepancyDirection {
  const diff = rctiHours - timesheetHours;
  if (Math.abs(diff) <= DEFAULT_RCTI_DISCREPANCY_THRESHOLD) return 'MATCH';
  return diff > 0 ? 'RCTI_HIGHER' : 'TIMESHEET_HIGHER';
}

// ---------------------------------------------------------------------------
// Value calculations
// ---------------------------------------------------------------------------

/** Gross cost to the business: hours × payRate (NOT charge-out rate) */
export function calculateTimesheetGross(hours: number, payRate: number): number {
  return roundMoney(parseHours(hours) * parseRate(payRate));
}

/** Billable invoice value: hours × chargeOutRate */
export function calculateTimesheetInvoiceValue(hours: number, chargeOutRate: number): number {
  return roundMoney(parseHours(hours) * parseRate(chargeOutRate));
}
