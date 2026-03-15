import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractPdfTextHints } from "../../ocr";

const SUMMER_PDF_PATH = join(
  __dirname,
  "../../../attached_assets/Timesheet_-_Summer_Field-Sinclair_-_February_2026_-_TW_signed_1773553557385.pdf"
);

describe("extractPdfTextHints", () => {
  it("extracts correct total hours from Summer's timesheet", async () => {
    const pdfBuffer = readFileSync(SUMMER_PDF_PATH);
    const hints = await extractPdfTextHints(Buffer.from(pdfBuffer));
    expect(hints.totalHours).toBe(145.89);
  });

  it("extracts correct employee name from Contractor Name field", async () => {
    const pdfBuffer = readFileSync(SUMMER_PDF_PATH);
    const hints = await extractPdfTextHints(Buffer.from(pdfBuffer));
    expect(hints.employeeName).toBe("Summer Field-Sinclair");
  });

  it("extracts correct client name", async () => {
    const pdfBuffer = readFileSync(SUMMER_PDF_PATH);
    const hints = await extractPdfTextHints(Buffer.from(pdfBuffer));
    expect(hints.clientName).toContain("PM&C");
    expect(hints.clientName).toContain("DSWOD");
  });

  it("extracts correct weekly breakdown totals", async () => {
    const pdfBuffer = readFileSync(SUMMER_PDF_PATH);
    const hints = await extractPdfTextHints(Buffer.from(pdfBuffer));
    expect(hints.weeklyTotals).toEqual([33.08, 38.91, 36.75, 37.15]);
    const sum = hints.weeklyTotals.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(145.89, 2);
  });

  it("returns null values for non-timesheet PDF", async () => {
    const fakePdf = Buffer.from("%PDF-1.4\nsome random content\n%%EOF");
    const hints = await extractPdfTextHints(fakePdf);
    expect(hints.totalHours).toBeNull();
    expect(hints.employeeName).toBeNull();
    expect(hints.weeklyTotals).toEqual([]);
  });
});
