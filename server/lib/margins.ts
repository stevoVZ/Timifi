/**
 * margins.ts — Revenue, cost, margin, and profitability
 *
 * Previously duplicated across Dashboard, Placements, Employee detail,
 * and Profitability report routes with slight formula variations.
 */

import { roundMoney, roundPercent } from './calc';

export interface MarginInput {
  revenue: number;            // ex-GST
  employeeCost: number;       // grossEarnings + superAmount
  payrollTaxAmount: number;
  payrollFeeRevenue: number;
}

export interface MarginResult {
  totalRevenue: number;
  totalCost: number;
  profitExPayrollTax: number;
  profitIncPayrollTax: number;
  marginExPT: number;   // %
  marginIncPT: number;  // %
}

/**
 * Calculate margin and profitability.
 *
 *   profitExPT  = revenue - employeeCost + payrollFeeRevenue
 *   profitIncPT = profitExPT - payrollTaxAmount
 *   marginExPT  = profitExPT / revenue * 100
 *   marginIncPT = profitIncPT / revenue * 100
 */
export function calculateMargin(input: MarginInput): MarginResult {
  const { revenue, employeeCost, payrollTaxAmount, payrollFeeRevenue } = input;
  const profitExPT = roundMoney(revenue - employeeCost + payrollFeeRevenue);
  const profitIncPT = roundMoney(profitExPT - payrollTaxAmount);
  return {
    totalRevenue: roundMoney(revenue),
    totalCost: roundMoney(employeeCost + payrollTaxAmount),
    profitExPayrollTax: profitExPT,
    profitIncPayrollTax: profitIncPT,
    marginExPT: revenue > 0 ? roundPercent((profitExPT / revenue) * 100) : 0,
    marginIncPT: revenue > 0 ? roundPercent((profitIncPT / revenue) * 100) : 0,
  };
}

export function aggregateMargins(rows: MarginResult[]): MarginResult {
  const rev = roundMoney(rows.reduce((s, r) => s + r.totalRevenue, 0));
  const exPT = roundMoney(rows.reduce((s, r) => s + r.profitExPayrollTax, 0));
  const incPT = roundMoney(rows.reduce((s, r) => s + r.profitIncPayrollTax, 0));
  return {
    totalRevenue: rev,
    totalCost: roundMoney(rows.reduce((s, r) => s + r.totalCost, 0)),
    profitExPayrollTax: exPT,
    profitIncPayrollTax: incPT,
    marginExPT: rev > 0 ? roundPercent((exPT / rev) * 100) : 0,
    marginIncPT: rev > 0 ? roundPercent((incPT / rev) * 100) : 0,
  };
}
