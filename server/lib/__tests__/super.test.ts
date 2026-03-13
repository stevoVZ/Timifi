import { describe, it, expect } from "vitest";
import {
  getSuperRateForFY, getSuperRateDecimal, getAustralianFY,
  decomposeCostRate, getSuperModeForSource,
  calculatePayRate, calculateChargeOutFromPayRate, calculateSuperAmount,
} from "../super.js";

describe("Australian FY", () => {
  it("July 2024 => FY2025", () => {
    expect(getAustralianFY(new Date("2024-07-01"))).toBe(2025);
  });
  it("June 2024 => FY2024", () => {
    expect(getAustralianFY(new Date("2024-06-30"))).toBe(2024);
  });
  it("January 2025 => FY2025", () => {
    expect(getAustralianFY(new Date("2025-01-15"))).toBe(2025);
  });
});

describe("super rate schedule", () => {
  it("FY2025 = 11.5%", () => { expect(getSuperRateForFY(2025)).toBe(11.5); });
  it("FY2026 = 12.0%", () => { expect(getSuperRateForFY(2026)).toBe(12.0); });
  it("FY2024 = 11.0%", () => { expect(getSuperRateForFY(2024)).toBe(11.0); });
  it("getSuperRateDecimal returns decimal", () => {
    const rate = getSuperRateDecimal(new Date("2026-03-01"));
    expect(rate).toBeCloseTo(0.12, 4);
  });
});

describe("decomposeCostRate INCLUSIVE", () => {
  it("Ben Sharman: 140 inclusive, 160h, 11.5%", () => {
    const d = decomposeCostRate(140, 160, "INCLUSIVE", 0.115);
    const expectedGross = Math.round((140 / 1.115) * 160 * 100) / 100;
    expect(d.grossEarnings).toBe(expectedGross);
    const expectedSuper = Math.round(expectedGross * 0.115 * 100) / 100;
    expect(d.superAmount).toBe(expectedSuper);
    expect(d.totalCost).toBe(Math.round((expectedGross + expectedSuper) * 100) / 100);
  });
  it("total cost is approx rate x hours", () => {
    const d = decomposeCostRate(140, 160, "INCLUSIVE", 0.115);
    expect(d.totalCost).toBeCloseTo(140 * 160, 0);
  });
});

describe("decomposeCostRate EXCLUSIVE", () => {
  it("Xero rate 125, 160h, 11.5%", () => {
    const d = decomposeCostRate(125, 160, "EXCLUSIVE", 0.115);
    expect(d.grossEarnings).toBe(20000);
    expect(d.superAmount).toBe(2300);
    expect(d.totalCost).toBe(22300);
  });
  it("gross = rate x hours", () => {
    const d = decomposeCostRate(180, 100, "EXCLUSIVE", 0.12);
    expect(d.grossEarnings).toBe(18000);
  });
});

describe("getSuperModeForSource", () => {
  it("PAYROLL_DERIVED => EXCLUSIVE", () => {
    expect(getSuperModeForSource("PAYROLL_DERIVED")).toBe("EXCLUSIVE");
  });
  it("PLACEMENT => INCLUSIVE", () => {
    expect(getSuperModeForSource("PLACEMENT")).toBe("INCLUSIVE");
  });
  it("EMPLOYEE_DEFAULT => INCLUSIVE", () => {
    expect(getSuperModeForSource("EMPLOYEE_DEFAULT")).toBe("INCLUSIVE");
  });
});

describe("rate helpers", () => {
  it("calculatePayRate", () => {
    expect(calculatePayRate(154.32, 11.5)).toBeCloseTo(138.40, 1);
  });
  it("calculateChargeOutFromPayRate", () => {
    expect(calculateChargeOutFromPayRate(125, 11.5)).toBeCloseTo(139.375, 3);
  });
  it("calculateSuperAmount", () => {
    expect(calculateSuperAmount(125, 11.5)).toBeCloseTo(14.375, 3);
  });
});
