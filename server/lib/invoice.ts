/**
 * invoice.ts — Invoice creation rules
 *
 * Line item defaults when creating from a timesheet,
 * description formatting, due date calculation.
 */

import { roundMoney, roundRate, gstTriplet } from './calc';

export interface TimesheetSummaryForInvoice {
  regularHours: number;
  overtimeHours: number;
}

export interface PlacementRatesForInvoice {
  chargeOutRate: number;
  chargeOutRateOT?: number; // defaults to chargeOutRate * 1.5
}

export interface InvoiceLineDefaults {
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  taxType: 'OUTPUT';
  taxAmount: number;
  totalAmount: number;
}

/**
 * Build invoice line items from timesheet data.
 * Returns regular hours line + optional OT line.
 */
export function buildInvoiceLinesFromTimesheet(
  ts: TimesheetSummaryForInvoice,
  rates: PlacementRatesForInvoice,
  employeeName: string,
  period: { month: number; year: number },
): InvoiceLineDefaults[] {
  const lines: InvoiceLineDefaults[] = [];
  const label = buildPeriodLabel(period);

  if (ts.regularHours > 0) {
    const gst = gstTriplet(roundMoney(ts.regularHours * rates.chargeOutRate));
    lines.push({ description: `${employeeName} — Standard Hours — ${label}`, quantity: ts.regularHours, unitAmount: roundRate(rates.chargeOutRate), lineAmount: gst.exGst, taxType: 'OUTPUT', taxAmount: gst.gst, totalAmount: gst.inclGst });
  }

  if (ts.overtimeHours > 0) {
    const otRate = rates.chargeOutRateOT ?? roundRate(rates.chargeOutRate * 1.5);
    const gst = gstTriplet(roundMoney(ts.overtimeHours * otRate));
    lines.push({ description: `${employeeName} — Overtime — ${label}`, quantity: ts.overtimeHours, unitAmount: roundRate(otRate), lineAmount: gst.exGst, taxType: 'OUTPUT', taxAmount: gst.gst, totalAmount: gst.inclGst });
  }

  return lines;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function buildPeriodLabel(period: { month: number; year: number }): string {
  return `${MONTHS[period.month - 1]} ${period.year}`;
}

export function buildInvoiceDescription(employeeName: string, period: { month: number; year: number }): string {
  return `${employeeName} — ${buildPeriodLabel(period)}`;
}

export function calculateInvoiceDueDate(issueDateStr: string, termsDays = 14): string {
  const d = new Date(issueDateStr);
  d.setDate(d.getDate() + termsDays);
  return d.toISOString().split('T')[0];
}
