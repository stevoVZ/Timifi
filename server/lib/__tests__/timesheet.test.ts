import { describe, it, expect } from "vitest";
import {
  hasRctiDiscrepancy, getDiscrepancyMagnitude, getDiscrepancyDirection,
  getSourcePrecedence, getPreferredSource,
  calculateTimesheetGross, calculateTimesheetInvoiceValue,
  DEFAULT_RCTI_DISCREPANCY_THRESHOLD,
} from "../timesheet.js";

describe("RCTI discrepancy", () => {
  it("no discrepancy <= 0.5h delta", () => {
    expect(hasRctiDiscrepancy(160, 160)).toBe(false);
    expect(hasRctiDiscrepancy(160, 160.5)).toBe(false);
    expect(hasRctiDiscrepancy(160, 159.5)).toBe(false);
  });
  it("discrepancy when > 0.5h", () => {
    expect(hasRctiDiscrepancy(160, 161)).toBe(true);
    expect(hasRctiDiscrepancy(160, 158)).toBe(true);
  });
  it("custom threshold", () => {
    expect(hasRctiDiscrepancy(160, 160.3, 0.25)).toBe(true);
    expect(hasRctiDiscrepancy(160, 160.2, 0.25)).toBe(false);
  });
  it("default threshold = 0.5", () => {
    expect(DEFAULT_RCTI_DISCREPANCY_THRESHOLD).toBe(0.5);
  });
});

describe("getDiscrepancyMagnitude", () => {
  it("always positive", () => {
    expect(getDiscrepancyMagnitude(160, 158)).toBe(2);
    expect(getDiscrepancyMagnitude(158, 160)).toBe(2);
  });
});

describe("getDiscrepancyDirection", () => {
  it("MATCH within threshold", () => {
    expect(getDiscrepancyDirection(160, 160)).toBe("MATCH");
    expect(getDiscrepancyDirection(160, 160.4)).toBe("MATCH");
  });
  it("RCTI_HIGHER", () => { expect(getDiscrepancyDirection(152, 160)).toBe("RCTI_HIGHER"); });
  it("TIMESHEET_HIGHER", () => { expect(getDiscrepancyDirection(160, 152)).toBe("TIMESHEET_HIGHER"); });
});

describe("source precedence", () => {
  it("RCTI=4, PORTAL=3, PDF_UPLOAD=2, ADMIN_ENTRY=1", () => {
    expect(getSourcePrecedence("RCTI")).toBe(4);
    expect(getSourcePrecedence("PORTAL")).toBe(3);
    expect(getSourcePrecedence("PDF_UPLOAD")).toBe(2);
    expect(getSourcePrecedence("ADMIN_ENTRY")).toBe(1);
  });
  it("getPreferredSource picks higher", () => {
    expect(getPreferredSource("RCTI", "PORTAL")).toBe("RCTI");
    expect(getPreferredSource("ADMIN_ENTRY", "PDF_UPLOAD")).toBe("PDF_UPLOAD");
    expect(getPreferredSource("PORTAL", "PORTAL")).toBe("PORTAL");
  });
});

describe("gross value calcs", () => {
  it("timesheetGross = hours x payRate", () => {
    expect(calculateTimesheetGross(160, 140)).toBe(22400);
    expect(calculateTimesheetGross(0, 140)).toBe(0);
  });
  it("invoiceValue = hours x chargeOutRate", () => {
    expect(calculateTimesheetInvoiceValue(160, 154.32)).toBeCloseTo(24691.2, 2);
    expect(calculateTimesheetInvoiceValue(160, 180)).toBe(28800);
  });
});
