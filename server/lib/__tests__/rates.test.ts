import { describe, it, expect } from "vitest";
import { resolveRates } from "../rates.js";

const emp = { chargeOutRate: "154.32", hourlyRate: "140" };

describe("resolveRates charge-out precedence", () => {
  it("PLACEMENT wins", () => {
    const r = resolveRates({ placement: { chargeOutRate: "180", payRate: "160" },
      rateHistory: [], invoices: [], payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.chargeOutRate).toBe(180);
    expect(r.chargeOutRateSource).toBe("PLACEMENT");
  });
  it("falls back to rate history", () => {
    const r = resolveRates({ placement: { chargeOutRate: null, payRate: null },
      rateHistory: [{ effectiveDate: "2024-01-01", payRate: "140", chargeOutRate: "165" }],
      invoices: [], payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.chargeOutRate).toBe(165);
    expect(r.chargeOutRateSource).toBe("RATE_HISTORY");
  });
  it("falls back to invoice-derived", () => {
    const r = resolveRates({ placement: { chargeOutRate: null, payRate: null },
      rateHistory: [],
      invoices: [{ hours: "160", amountExclGst: "24691.20", hourlyRate: "154.32" }],
      payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.chargeOutRate).toBe(154.32);
    expect(r.chargeOutRateSource).toBe("INVOICE_DERIVED");
  });
  it("falls back to employee default", () => {
    const r = resolveRates({ placement: { chargeOutRate: null, payRate: null },
      rateHistory: [], invoices: [], payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.chargeOutRate).toBe(154.32);
    expect(r.chargeOutRateSource).toBe("EMPLOYEE_DEFAULT");
  });
});

describe("resolveRates super mode", () => {
  it("PAYROLL_DERIVED => EXCLUSIVE", () => {
    const r = resolveRates({ placement: { chargeOutRate: null, payRate: null },
      rateHistory: [], invoices: [],
      payRunLines: [{ hoursWorked: "160", ratePerHour: "125", grossEarnings: null }],
      employee: emp, period: { month: 3, year: 2025 } });
    expect(r.payRateSource).toBe("PAYROLL_DERIVED");
    expect(r.superMode).toBe("EXCLUSIVE");
  });
  it("PLACEMENT => INCLUSIVE", () => {
    const r = resolveRates({ placement: { chargeOutRate: "180", payRate: "160" },
      rateHistory: [], invoices: [], payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.payRateSource).toBe("PLACEMENT");
    expect(r.superMode).toBe("INCLUSIVE");
  });
});

describe("resolveRates history date filtering", () => {
  it("future history not applied to past period", () => {
    const r = resolveRates({ placement: { chargeOutRate: null, payRate: null },
      rateHistory: [{ effectiveDate: "2025-07-01", payRate: "150", chargeOutRate: "200" }],
      invoices: [], payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.chargeOutRateSource).toBe("EMPLOYEE_DEFAULT");
  });
  it("uses most recent applicable", () => {
    const r = resolveRates({ placement: { chargeOutRate: null, payRate: null },
      rateHistory: [
        { effectiveDate: "2024-01-01", payRate: "130", chargeOutRate: "150" },
        { effectiveDate: "2025-01-01", payRate: "140", chargeOutRate: "165" },
      ],
      invoices: [], payRunLines: [], employee: emp, period: { month: 3, year: 2025 } });
    expect(r.chargeOutRate).toBe(165);
  });
});
