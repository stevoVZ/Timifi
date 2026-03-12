/**
 * calc.ts — Core money arithmetic
 *
 * ALL financial arithmetic in the system goes through these functions.
 * No raw arithmetic on monetary values anywhere else.
 *
 * Rules:
 *   Money:       2dp, half-up rounding
 *   Hours:       2dp
 *   Percentages: 1dp for display
 *   GST rate:    10% (configurable via system_rules at runtime)
 */

export const GST_RATE = 0.10;

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/** Round to 2dp — money. Half-up. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 2dp — hours. */
export function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 1dp — percentages for display. */
export function roundPercent(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Round to 4dp — unit amounts / rates on invoice line items. */
export function roundRate(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Safe parsing — replaces all inline parseFloat(x || "0") calls
// ---------------------------------------------------------------------------

function safeNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

/** Parse a monetary value (2dp). */
export function parseMoney(val: string | number | null | undefined): number {
  return roundMoney(safeNum(val));
}

/** Parse an hours value (2dp). */
export function parseHours(val: string | number | null | undefined): number {
  return roundHours(safeNum(val));
}

/** Parse a rate value (4dp for precision). */
export function parseRate(val: string | number | null | undefined): number {
  return roundRate(safeNum(val));
}

/** Parse a percentage (stored as e.g. 10.5 meaning 10.5%, not 0.105). */
export function parsePercent(val: string | number | null | undefined): number {
  return safeNum(val);
}

// ---------------------------------------------------------------------------
// GST helpers
// ---------------------------------------------------------------------------

/** Add GST: exGst * 1.10 */
export function addGst(exGst: number): number {
  return roundMoney(exGst * (1 + GST_RATE));
}

/** Remove GST from an incl-GST amount: inclGst / 1.10 */
export function removeGst(inclGst: number): number {
  return roundMoney(inclGst / (1 + GST_RATE));
}

/** Extract the GST component from an incl-GST amount: inclGst / 11 */
export function gstComponent(inclGst: number): number {
  return roundMoney(inclGst / (1 + 1 / GST_RATE));
}

/** Build full GST triplet from an ex-GST amount. */
export function gstTriplet(exGst: number): { exGst: number; gst: number; inclGst: number } {
  const ex = roundMoney(exGst);
  const gst = roundMoney(ex * GST_RATE);
  return { exGst: ex, gst, inclGst: roundMoney(ex + gst) };
}

/** Build full GST triplet from an incl-GST amount. */
export function gstTripletFromIncl(inclGst: number): { exGst: number; gst: number; inclGst: number } {
  const incl = roundMoney(inclGst);
  const gst = gstComponent(incl);
  return { exGst: roundMoney(incl - gst), gst, inclGst: incl };
}

/** Validate that exGst + gst ≈ inclGst (within 2 cents rounding tolerance). */
export function isGstConsistent(exGst: number, gst: number, inclGst: number): boolean {
  return Math.abs(exGst + gst - inclGst) <= 0.02;
}
