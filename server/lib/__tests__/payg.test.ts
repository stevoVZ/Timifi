import { describe, it, expect } from "vitest";
import { calculateAnnualPayg, calculatePayg, DEFAULT_TAX_FLAGS } from "../payg.js";

describe("calculateAnnualPayg resident", () => {
  const flags = DEFAULT_TAX_FLAGS;

  it("$0 => $0", () => { expect(calculateAnnualPayg(0, flags)).toBe(0); });

  it("$18200 => $0 (below threshold)", () => {
    expect(calculateAnnualPayg(18200, flags)).toBe(0);
  });

  it("$60000 mid bracket", () => {
    // Tax: 5092 + 4875 = 9967, LITO: 100, Medicare: 1200 => 11067
    expect(calculateAnnualPayg(60000, flags)).toBe(11067);
  });

  it("$120000 upper bracket", () => {
    // Tax: 29467, LITO: 0, Medicare: 2400 => 31867
    expect(calculateAnnualPayg(120000, flags)).toBe(31867);
  });

  it("never negative", () => {
    expect(calculateAnnualPayg(10000, flags)).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateAnnualPayg working holiday", () => {
  const flags = { ...DEFAULT_TAX_FLAGS, residencyStatus: "WORKING_HOLIDAY" as const };
  it("$40000 => 15% flat", () => {
    expect(calculateAnnualPayg(40000, flags)).toBe(6000);
  });
  it("$50000 => above $45k bracket", () => {
    expect(calculateAnnualPayg(50000, flags)).toBe(8375);
  });
});

describe("calculatePayg period", () => {
  it("monthly annualises by 12", () => {
    const gross = 5000;
    const expected = Math.round((calculateAnnualPayg(gross * 12, DEFAULT_TAX_FLAGS) / 12) * 100) / 100;
    expect(calculatePayg(gross, "MONTHLY")).toBe(expected);
  });
  it("weekly annualises by 52", () => {
    const gross = 1000;
    const expected = Math.round((calculateAnnualPayg(gross * 52, DEFAULT_TAX_FLAGS) / 52) * 100) / 100;
    expect(calculatePayg(gross, "WEEKLY")).toBe(expected);
  });
  it("$0 => $0", () => { expect(calculatePayg(0, "MONTHLY")).toBe(0); });
});
