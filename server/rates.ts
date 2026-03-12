const AU_SUPER_RATES: { fyStart: number; rate: number }[] = [
  { fyStart: 2026, rate: 12.0 },
  { fyStart: 2025, rate: 11.5 },
  { fyStart: 2024, rate: 11.0 },
  { fyStart: 2023, rate: 10.5 },
  { fyStart: 2022, rate: 10.0 },
  { fyStart: 2021, rate: 9.5 },
  { fyStart: 2020, rate: 9.5 },
];

export function getAustralianFY(date: Date): number {
  const month = date.getMonth();
  const year = date.getFullYear();
  return month >= 6 ? year + 1 : year;
}

export function getSuperRate(date: Date): number {
  const fy = getAustralianFY(date);
  for (const entry of AU_SUPER_RATES) {
    if (fy >= entry.fyStart) return entry.rate;
  }
  return 9.5;
}

export function getSuperRateForFY(fy: number): number {
  for (const entry of AU_SUPER_RATES) {
    if (fy >= entry.fyStart) return entry.rate;
  }
  return 9.5;
}

/**
 * Derives the base wage (super-exclusive) from a charge-out rate.
 * chargeOutRate = baseWage × (1 + super%), so baseWage = chargeOutRate / (1 + super%).
 * NOTE: Placement/employee pay rates are already super-INCLUSIVE (total cost).
 * This function is for deriving the base wage component, not for converting placement rates.
 */
export function calculatePayRate(chargeOutRateExGst: number, superPercent: number): number {
  return chargeOutRateExGst / (1 + superPercent / 100);
}

/**
 * Calculates charge-out rate from a super-EXCLUSIVE base wage (e.g. Xero payslip ratePerHour).
 * Result = baseWage × (1 + super%).
 * WARNING: Do NOT pass placement/employee pay rates here — those are already super-inclusive
 * and would result in double-counting super.
 * Used primarily during payroll sync to derive charge-out from payslip base wages.
 */
export function calculateChargeOutFromPayRate(payRate: number, superPercent: number): number {
  return payRate * (1 + superPercent / 100);
}

/**
 * Calculates the super component from a super-EXCLUSIVE base wage.
 * For super-inclusive rates (placement/employee), use: rate / (1 + super%) × super%.
 */
export function calculateSuperAmount(payRate: number, superPercent: number): number {
  return payRate * (superPercent / 100);
}
