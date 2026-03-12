/**
 * payg.ts — PAYG Withholding (ATO 2024-25)
 *
 * Previously defined as estimatePayg() inline inside a single route handler.
 * This is now the canonical implementation, usable from any route.
 *
 * NOTE: This is an *estimate* for internal payroll preparation.
 * Actual PAYG is determined by Xero via the ATO STP API.
 */

import { roundMoney } from './calc';

export interface TaxDeclarationFlags {
  claimTaxFreeThreshold: boolean;
  helpDebt: boolean;
  studentLoan: boolean;
  seniorsOffset: boolean;
  residencyStatus: 'RESIDENT' | 'FOREIGN_RESIDENT' | 'WORKING_HOLIDAY';
}

export const DEFAULT_TAX_FLAGS: TaxDeclarationFlags = {
  claimTaxFreeThreshold: true,
  helpDebt: false,
  studentLoan: false,
  seniorsOffset: false,
  residencyStatus: 'RESIDENT',
};

/** Calculate annual PAYG from annual gross income (2024-25 brackets). */
export function calculateAnnualPayg(annualGross: number, flags: TaxDeclarationFlags = DEFAULT_TAX_FLAGS): number {
  if (annualGross <= 0) return 0;

  if (flags.residencyStatus === 'WORKING_HOLIDAY') {
    const tax = annualGross <= 45000 ? annualGross * 0.15 : 6750 + (annualGross - 45000) * 0.325;
    return roundMoney(Math.max(0, tax));
  }

  if (flags.residencyStatus === 'FOREIGN_RESIDENT') {
    let tax = 0;
    if (annualGross <= 120000) tax = annualGross * 0.325;
    else if (annualGross <= 180000) tax = 39000 + (annualGross - 120000) * 0.37;
    else tax = 61200 + (annualGross - 180000) * 0.45;
    return roundMoney(Math.max(0, tax));
  }

  // Australian resident 2024-25
  let tax = 0;
  if (annualGross <= 18200) tax = 0;
  else if (annualGross <= 45000) tax = (annualGross - 18200) * 0.19;
  else if (annualGross <= 120000) tax = 5092 + (annualGross - 45000) * 0.325;
  else if (annualGross <= 180000) tax = 29467 + (annualGross - 120000) * 0.37;
  else tax = 51667 + (annualGross - 180000) * 0.45;

  // Low Income Tax Offset (LITO)
  let lito = 0;
  if (annualGross <= 37500) lito = 700;
  else if (annualGross <= 45000) lito = 700 - (annualGross - 37500) * 0.05;
  else if (annualGross <= 66667) lito = 325 - (annualGross - 45000) * 0.015;
  tax -= lito;

  // Medicare Levy 2%
  if (annualGross > 26000) tax += annualGross * 0.02;

  // HELP debt
  if (flags.helpDebt && annualGross >= 54435) {
    let helpRate = 0;
    if (annualGross < 62738) helpRate = 0.01;
    else if (annualGross < 70540) helpRate = 0.025;
    else if (annualGross < 79203) helpRate = 0.035;
    else if (annualGross < 88898) helpRate = 0.04;
    else if (annualGross < 99846) helpRate = 0.055;
    else if (annualGross < 112229) helpRate = 0.065;
    else if (annualGross < 126097) helpRate = 0.075;
    else if (annualGross < 141683) helpRate = 0.085;
    else helpRate = 0.10;
    tax += annualGross * helpRate;
  }

  return roundMoney(Math.max(0, tax));
}

/** Calculate PAYG for a pay period by annualising first. */
export function calculatePayg(
  grossForPeriod: number,
  payFrequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY',
  flags: TaxDeclarationFlags = DEFAULT_TAX_FLAGS,
): number {
  if (grossForPeriod <= 0) return 0;
  const periods = payFrequency === 'WEEKLY' ? 52 : payFrequency === 'FORTNIGHTLY' ? 26 : 12;
  return roundMoney(calculateAnnualPayg(grossForPeriod * periods, flags) / periods);
}
