/**
 * super.ts — Superannuation rate schedule and cost decomposition
 *
 * This replaces server/rates.ts (which re-exports from here during migration).
 *
 * KEY CONCEPT — super-inclusive vs super-exclusive:
 *
 *   SUPER-INCLUSIVE (stored on placements and employees)
 *     The rate is total employer cost per hour.
 *     base wage + super are both embedded.
 *     base = rate / (1 + superRate)
 *     super = base × superRate
 *
 *   SUPER-EXCLUSIVE (Xero payslip ratePerHour)
 *     The rate is base wage only. Super is separate.
 *     super = rate × superRate
 *     total = rate × (1 + superRate)
 *
 * NEVER apply calculateChargeOutFromPayRate() to a super-inclusive rate.
 * That double-counts super.
 */

import { roundMoney } from './calc';

// ---------------------------------------------------------------------------
// ATO legislated super rate schedule
// ---------------------------------------------------------------------------

const AU_SUPER_RATES: { fyStart: number; rate: number }[] = [
  { fyStart: 2027, rate: 12.0 },
  { fyStart: 2026, rate: 12.0 },
  { fyStart: 2025, rate: 11.5 },
  { fyStart: 2024, rate: 11.0 },
  { fyStart: 2023, rate: 10.5 },
  { fyStart: 2022, rate: 10.0 },
  { fyStart: 2021, rate: 9.5 },
  { fyStart: 2020, rate: 9.5 },
];

export function getAustralianFY(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

/** Returns super rate as a percentage, e.g. 12.0 */
export function getSuperRate(date: Date): number {
  return getSuperRateForFY(getAustralianFY(date));
}

/** Returns super rate as a decimal, e.g. 0.12 */
export function getSuperRateDecimal(date: Date): number {
  return getSuperRate(date) / 100;
}

export function getSuperRateForFY(fy: number): number {
  for (const entry of AU_SUPER_RATES) {
    if (fy >= entry.fyStart) return entry.rate;
  }
  return 9.5;
}

// ---------------------------------------------------------------------------
// Cost decomposition — the ONE place super-inclusive/exclusive logic lives
// ---------------------------------------------------------------------------

export type SuperRateMode = 'INCLUSIVE' | 'EXCLUSIVE';

export interface DecomposedCost {
  grossEarnings: number;
  superAmount: number;
  totalCost: number;
}

/**
 * Given a rate, hours, and mode, return gross earnings, super, and total cost.
 *
 * INCLUSIVE mode (placements / employee records):
 *   gross = (rate / (1 + superRate)) × hours
 *
 * EXCLUSIVE mode (Xero payslip ratePerHour):
 *   gross = rate × hours
 *
 * In both modes: super = gross × superRate, totalCost = gross + super
 */
export function decomposeCostRate(
  rate: number,
  hours: number,
  mode: SuperRateMode,
  superRateDecimal: number,
): DecomposedCost {
  const gross = mode === 'INCLUSIVE'
    ? roundMoney((rate / (1 + superRateDecimal)) * hours)
    : roundMoney(rate * hours);
  const superAmount = roundMoney(gross * superRateDecimal);
  return { grossEarnings: gross, superAmount, totalCost: roundMoney(gross + superAmount) };
}

export type RateSource = 'PLACEMENT' | 'RATE_HISTORY' | 'INVOICE_DERIVED' | 'PAYROLL_DERIVED' | 'EMPLOYEE_DEFAULT';

/** Placement and employee rates are super-inclusive. Payroll-derived rates are super-exclusive. */
export function getSuperModeForSource(source: RateSource): SuperRateMode {
  return source === 'PAYROLL_DERIVED' ? 'EXCLUSIVE' : 'INCLUSIVE';
}

// ---------------------------------------------------------------------------
// Convenience helpers (kept from original rates.ts for compatibility)
// ---------------------------------------------------------------------------

/** Derive base wage from a charge-out rate. Only valid for super-exclusive rates. */
export function calculatePayRate(chargeOutRateExGst: number, superPercent: number): number {
  return chargeOutRateExGst / (1 + superPercent / 100);
}

/** Build charge-out rate from a super-EXCLUSIVE base wage (e.g. Xero ratePerHour). */
export function calculateChargeOutFromPayRate(payRate: number, superPercent: number): number {
  return payRate * (1 + superPercent / 100);
}

/** Super amount from a super-EXCLUSIVE base wage. */
export function calculateSuperAmount(payRate: number, superPercent: number): number {
  return payRate * (superPercent / 100);
}
