import { describe, it, expect } from "vitest";
import {
  buildInvoiceLinesFromTimesheet,
  buildInvoiceDescription, buildPeriodLabel,
  calculateInvoiceDueDate,
} from "../invoice.js";

describe("buildPeriodLabel", () => {
  it("January 2025", () => { expect(buildPeriodLabel({ month: 1, year: 2025 })).toBe("January 2025"); });
  it("December 2024", () => { expect(buildPeriodLabel({ month: 12, year: 2024 })).toBe("December 2024"); });
});

describe("buildInvoiceDescription", () => {
  it("formats correctly", () => {
    expect(buildInvoiceDescription("Ben Sharman", { month: 3, year: 2025 }))
      .toBe("Ben Sharman — March 2025");
  });
});

describe("calculateInvoiceDueDate", () => {
  it("14 days default", () => { expect(calculateInvoiceDueDate("2025-01-01")).toBe("2025-01-15"); });
  it("30 days", () => { expect(calculateInvoiceDueDate("2025-01-01", 30)).toBe("2025-01-31"); });
  it("crosses month", () => { expect(calculateInvoiceDueDate("2025-01-20", 14)).toBe("2025-02-03"); });
});

describe("buildInvoiceLinesFromTimesheet", () => {
  const period = { month: 3, year: 2025 };

  it("regular hours only", () => {
    const lines = buildInvoiceLinesFromTimesheet(
      { regularHours: 160, overtimeHours: 0 },
      { chargeOutRate: 154.32 }, "Ben Sharman", period);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(160);
    expect(lines[0].unitAmount).toBe(154.32);
    expect(lines[0].taxType).toBe("OUTPUT");
    expect(lines[0].lineAmount).toBeCloseTo(160 * 154.32, 2);
  });

  it("regular + OT = two lines", () => {
    const lines = buildInvoiceLinesFromTimesheet(
      { regularHours: 152, overtimeHours: 8 },
      { chargeOutRate: 180 }, "Roozbeh Pooladvand", period);
    expect(lines).toHaveLength(2);
    expect(lines[0].description).toContain("Standard Hours");
    expect(lines[1].description).toContain("Overtime");
    expect(lines[1].unitAmount).toBe(270); // 180 x 1.5
  });

  it("custom OT rate", () => {
    const lines = buildInvoiceLinesFromTimesheet(
      { regularHours: 0, overtimeHours: 8 },
      { chargeOutRate: 180, chargeOutRateOT: 250 }, "Steven Diep", period);
    expect(lines).toHaveLength(1);
    expect(lines[0].unitAmount).toBe(250);
  });

  it("zero hours => empty", () => {
    const lines = buildInvoiceLinesFromTimesheet(
      { regularHours: 0, overtimeHours: 0 },
      { chargeOutRate: 180 }, "Test", period);
    expect(lines).toHaveLength(0);
  });

  it("GST breakdown correct", () => {
    const lines = buildInvoiceLinesFromTimesheet(
      { regularHours: 10, overtimeHours: 0 },
      { chargeOutRate: 100 }, "Test", period);
    expect(lines[0].lineAmount).toBe(1000);
    expect(lines[0].taxAmount).toBe(100);
    expect(lines[0].totalAmount).toBe(1100);
  });
});
