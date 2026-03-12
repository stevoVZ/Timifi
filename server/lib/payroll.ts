/**
 * payroll.ts — Payroll line calculations
 *
 * Gross earnings, PAYG, super, net pay, payroll tax, payroll fee.
 * No payroll arithmetic anywhere else in the codebase.
 */

import { roundMoney, parseMoney, parseHours, parseRate, parsePercent } from './calc';
import { decomposeCostRate, type SuperRateMode } from './super';
import { calculatePayg, type TaxDeclarationFlags, DEFAULT_TAX_FLAGS } from './payg';

export interface PayrollLineInput {
  hours: number;
  payRate: number;
  superMode: SuperRateMode;
  superRateDecimal: number;
  payFrequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  taxFlags?: TaxDeclarationFlags;
}

export interface PayrollLineResult {
  grossEarnings: number;
  paygWithheld: number;
  superAmount: number;
  netPay: number;
}

export function calculatePayrollLine(input: PayrollLineInput): PayrollLineResult {
  const { hours, payRate, superMode, superRateDecimal, payFrequency, taxFlags } = input;
  const { grossEarnings, superAmount } = decomposeCostRate(payRate, hours, superMode, superRateDecimal);
  const paygWithheld = calculatePayg(grossEarnings, payFrequency, taxFlags ?? DEFAULT_TAX_FLAGS);
  return { grossEarnings, paygWithheld, superAmount, netPay: roundMoney(grossEarnings - paygWithheld) };
}

/**
 * Reconstruct gross from net + PAYG when Xero returns grossEarnings = 0.
 * This is THE single canonical place for this reconstruction.
 */
export function reconstructGross(netPay: number, paygWithheld: number): number {
  const net = parseMoney(netPay);
  const payg = parseMoney(paygWithheld);
  if (net <= 0 && payg <= 0) return 0;
  return roundMoney(payg > 0 ? net + payg : net);
}

/**
 * Resolve gross earnings from a pay run line, using reconstruction as fallback.
 * Replaces the 6+ identical inline blocks across route handlers.
 */
export function resolveGrossEarnings(
  rawGross: string | number | null,
  netPay: string | number | null,
  paygWithheld: string | number | null,
): { gross: number; usedFallback: boolean } {
  const raw = parseMoney(rawGross);
  if (raw > 0) return { gross: raw, usedFallback: false };
  const net = parseMoney(netPay);
  const payg = parseMoney(paygWithheld);
  if (net > 0 || payg > 0) return { gross: reconstructGross(net, payg), usedFallback: true };
  return { gross: 0, usedFallback: false };
}

export interface PayrollTaxInput {
  taxableBase: number;
  state: string | null | undefined;
  ratesByState: Record<string, number>;
}

export function calculatePayrollTax(input: PayrollTaxInput): number {
  if (!input.state) return 0;
  const rate = input.ratesByState[input.state] ?? 0;
  return roundMoney(input.taxableBase * rate);
}

export function calculatePayrollFeeRevenue(grossEarnings: number, feePercent: number): number {
  if (feePercent <= 0 || grossEarnings <= 0) return 0;
  return roundMoney(grossEarnings * (feePercent / 100));
}
