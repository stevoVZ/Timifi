import { describe, it, expect } from "vitest";
import {
  reconstructGross, resolveGrossEarnings,
  calculatePayrollFeeRevenue, calculatePayrollTax,
} from "../payroll.js";

describe("reconstructGross", () => {
  it("net + payg", () => { expect(reconstructGross(4000, 1000)).toBe(5000); });
  it("net only", () => { expect(reconstructGross(4000, 0)).toBe(4000); });
  it("both zero", () => { expect(reconstructGross(0, 0)).toBe(0); });
});

describe("resolveGrossEarnings", () => {
  it("uses rawGross when > 0", () => {
    const r = resolveGrossEarnings("5000", "4000", "1000");
    expect(r.gross).toBe(5000);
    expect(r.usedFallback).toBe(false);
  });
  it("fallback when rawGross = 0", () => {
    const r = resolveGrossEarnings("0", "4000", "1000");
    expect(r.gross).toBe(5000);
    expect(r.usedFallback).toBe(true);
  });
  it("fallback when rawGross is null", () => {
    const r = resolveGrossEarnings(null, "3500", "500");
    expect(r.gross).toBe(4000);
    expect(r.usedFallback).toBe(true);
  });
  it("all null => 0 no fallback", () => {
    const r = resolveGrossEarnings(null, null, null);
    expect(r.gross).toBe(0);
    expect(r.usedFallback).toBe(false);
  });
  it("string zero => fallback", () => {
    const r = resolveGrossEarnings("0.00", "2000", "300");
    expect(r.gross).toBe(2300);
    expect(r.usedFallback).toBe(true);
  });
});

describe("calculatePayrollFeeRevenue", () => {
  it("5% of 10000 = 500", () => { expect(calculatePayrollFeeRevenue(10000, 5)).toBe(500); });
  it("0% => 0", () => { expect(calculatePayrollFeeRevenue(10000, 0)).toBe(0); });
  it("gross 0 => 0", () => { expect(calculatePayrollFeeRevenue(0, 5)).toBe(0); });
  it("2.75% of 20000 = 550", () => { expect(calculatePayrollFeeRevenue(20000, 2.75)).toBe(550); });
});

describe("calculatePayrollTax", () => {
  // ratesByState uses DECIMAL rates (0.0685 = 6.85%) — matches lib signature
  const rates = { ACT: 0.0685, NSW: 0.0545 };
  it("ACT 6.85% on 100000 = 6850", () => {
    expect(calculatePayrollTax({ taxableBase: 100000, state: "ACT", ratesByState: rates })).toBe(6850);
  });
  it("NSW 5.45% on 50000 = 2725", () => {
    expect(calculatePayrollTax({ taxableBase: 50000, state: "NSW", ratesByState: rates })).toBe(2725);
  });
  it("null state => 0", () => {
    expect(calculatePayrollTax({ taxableBase: 100000, state: null, ratesByState: rates })).toBe(0);
  });
  it("unknown state => 0", () => {
    expect(calculatePayrollTax({ taxableBase: 100000, state: "QLD", ratesByState: rates })).toBe(0);
  });
});
