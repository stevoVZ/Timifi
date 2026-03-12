/**
 * rates.ts — Rate resolution engine
 *
 * The single canonical implementation of the rate fallback chain.
 * Previously this was reimplemented (with slight variations) in 5 route handlers.
 *
 * Charge-out precedence:  Placement → Rate history → Invoice-derived → Employee default
 * Pay rate precedence:    Placement → Rate history → Payroll-derived → Employee default
 */

import { parseRate, parseHours, parseMoney } from './calc';
import { getSuperModeForSource, type SuperRateMode, type RateSource } from './super';

export type { RateSource, SuperRateMode };

export interface ResolvedRate {
  chargeOutRate: number;
  chargeOutRateSource: RateSource;
  payRate: number;
  payRateSource: RateSource;
  superMode: SuperRateMode;
}

export interface RateHistoryEntry {
  effectiveDate: string;
  payRate: string | null;
  chargeOutRate: string | null;
}

export interface InvoiceSummary {
  hours: string | null;
  amountExclGst: string | null;
  hourlyRate: string | null;
  lineItems?: { unitAmount: string | null; quantity: string | null }[];
}

export interface PayRunLineSummary {
  hoursWorked: string | null;
  ratePerHour: string | null;
  grossEarnings: string | null;
}

export interface RateResolutionInputs {
  placement: { chargeOutRate: string | null; payRate: string | null } | null;
  rateHistory: RateHistoryEntry[];
  invoices: InvoiceSummary[];
  payRunLines: PayRunLineSummary[];
  employee: { chargeOutRate: string | null; hourlyRate: string | null };
  period: { month: number; year: number };
}

function getEffectiveHistory(history: RateHistoryEntry[], month: number, year: number): RateHistoryEntry | null {
  const periodDate = new Date(year, month - 1, 1);
  return history
    .filter(r => new Date(r.effectiveDate) <= periodDate)
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0] ?? null;
}

function deriveChargeOutFromInvoices(invoices: InvoiceSummary[]): number {
  for (const inv of invoices) {
    if (inv.lineItems?.length) {
      const rate = parseRate(inv.lineItems[0].unitAmount);
      if (rate > 0) return rate;
    }
    const stored = parseRate(inv.hourlyRate);
    if (stored > 0) return stored;
    const hours = parseHours(inv.hours);
    const amount = parseMoney(inv.amountExclGst);
    if (hours > 0 && amount > 0) return parseRate(amount / hours);
  }
  return 0;
}

function derivePayRateFromPayroll(lines: PayRunLineSummary[]): number {
  for (const pl of lines) {
    const rate = parseRate(pl.ratePerHour);
    if (rate > 0) return rate;
    const gross = parseMoney(pl.grossEarnings);
    const hours = parseHours(pl.hoursWorked);
    if (gross > 0 && hours > 0) return parseRate(gross / hours);
  }
  return 0;
}

/**
 * Resolve effective charge-out rate and pay rate for a given employee/period.
 * This is the ONLY implementation of the rate precedence chain.
 */
export function resolveRates(inputs: RateResolutionInputs): ResolvedRate {
  const { placement, rateHistory, invoices, payRunLines, employee, period } = inputs;
  const history = getEffectiveHistory(rateHistory, period.month, period.year);

  // Charge-out
  let chargeOutRate = 0;
  let chargeOutRateSource: RateSource = 'EMPLOYEE_DEFAULT';
  const pco = parseRate(placement?.chargeOutRate);
  if (pco > 0) { chargeOutRate = pco; chargeOutRateSource = 'PLACEMENT'; }
  else if (history && parseRate(history.chargeOutRate) > 0) { chargeOutRate = parseRate(history.chargeOutRate); chargeOutRateSource = 'RATE_HISTORY'; }
  else { const d = deriveChargeOutFromInvoices(invoices); if (d > 0) { chargeOutRate = d; chargeOutRateSource = 'INVOICE_DERIVED'; } else { chargeOutRate = parseRate(employee.chargeOutRate); } }

  // Pay rate
  let payRate = 0;
  let payRateSource: RateSource = 'EMPLOYEE_DEFAULT';
  const ppr = parseRate(placement?.payRate);
  if (ppr > 0) { payRate = ppr; payRateSource = 'PLACEMENT'; }
  else if (history && parseRate(history.payRate) > 0) { payRate = parseRate(history.payRate); payRateSource = 'RATE_HISTORY'; }
  else { const d = derivePayRateFromPayroll(payRunLines); if (d > 0) { payRate = d; payRateSource = 'PAYROLL_DERIVED'; } else { payRate = parseRate(employee.hourlyRate); } }

  return { chargeOutRate, chargeOutRateSource, payRate, payRateSource, superMode: getSuperModeForSource(payRateSource) };
}
