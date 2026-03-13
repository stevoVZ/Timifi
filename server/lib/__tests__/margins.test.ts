import { describe, it, expect } from "vitest";
import { calculateMargin, aggregateMargins } from "../margins.js";

describe("calculateMargin", () => {
  it("basic profitability", () => {
    const r = calculateMargin({ revenue: 10000, employeeCost: 8000, payrollTaxAmount: 500, payrollFeeRevenue: 200 });
    expect(r.profitExPayrollTax).toBe(2200);
    expect(r.profitIncPayrollTax).toBe(1700);
    expect(r.marginExPT).toBe(22);
    expect(r.marginIncPT).toBe(17);
    expect(r.totalRevenue).toBe(10000);
    expect(r.totalCost).toBe(8500);
  });
  it("zero revenue => 0 margins (no div/0)", () => {
    const r = calculateMargin({ revenue: 0, employeeCost: 0, payrollTaxAmount: 0, payrollFeeRevenue: 0 });
    expect(r.marginExPT).toBe(0);
    expect(r.marginIncPT).toBe(0);
  });
  it("no payroll tax", () => {
    const r = calculateMargin({ revenue: 20000, employeeCost: 15000, payrollTaxAmount: 0, payrollFeeRevenue: 0 });
    expect(r.profitExPayrollTax).toBe(5000);
    expect(r.marginExPT).toBe(25);
  });
  it("DFAT/Ben Sharman scenario", () => {
    // chargeOut=154.32, payRate=140, 160h
    const r = calculateMargin({ revenue: 154.32 * 160, employeeCost: 140 * 160, payrollTaxAmount: 0, payrollFeeRevenue: 0 });
    expect(r.totalRevenue).toBeCloseTo(24691.2, 1);
    expect(r.profitExPayrollTax).toBeCloseTo(2291.2, 1);
    expect(r.marginExPT).toBeCloseTo(9.3, 0);
  });
});

describe("aggregateMargins", () => {
  it("sums rows correctly", () => {
    const a = calculateMargin({ revenue: 10000, employeeCost: 8000, payrollTaxAmount: 200, payrollFeeRevenue: 100 });
    const b = calculateMargin({ revenue: 5000, employeeCost: 4000, payrollTaxAmount: 100, payrollFeeRevenue: 50 });
    const agg = aggregateMargins([a, b]);
    expect(agg.totalRevenue).toBe(15000);
    expect(agg.profitExPayrollTax).toBeCloseTo(a.profitExPayrollTax + b.profitExPayrollTax, 2);
    expect(agg.marginExPT).toBeGreaterThan(0);
  });
  it("empty array => zeros", () => {
    const agg = aggregateMargins([]);
    expect(agg.totalRevenue).toBe(0);
    expect(agg.marginExPT).toBe(0);
  });
});
