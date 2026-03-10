import OpenAI from "openai";
import { writeFile, readFile, unlink, readdir, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";

const execFileAsync = promisify(execFile);

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface WeekBreakdown {
  weekLabel: string;
  startDate: string | null;
  endDate: string | null;
  hours: number;
  overtimeHours: number;
}

export interface ScanResult {
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  fileHash: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  period: string;
  format: string;
  confidence: number;
  warnings: string[];
  weeks: { wk: string; h: number }[];
  notes: string | null;
  employeeName: string | null;
  clientName: string | null;
  signatureDetected: boolean;
  monthBoundaryWarning: string | null;
}

const SYSTEM_PROMPT = `You are a timesheet data extraction assistant. You will receive one or more page images from a PDF timesheet and must extract structured data from them.

Extract the following information:
1. Employee name (the person who worked the hours)
2. Client/company name (the organisation approving the timesheet)
3. Period dates (start and end date of the timesheet period)
4. Total hours worked
5. Regular hours (non-overtime)
6. Overtime hours
7. Weekly breakdown: for each week, extract the week label/dates and hours worked
8. Whether a signature or approval is present
9. Any notes or comments on the timesheet
10. The format/template type of the timesheet

IMPORTANT RULES FOR MONTH BOUNDARIES:
- If a weekly timesheet spans two months (e.g., a week from Dec 28 to Jan 3), note this explicitly
- Report the actual dates as they appear on the timesheet
- Flag any month boundary issues in the warnings

Return your response as a JSON object with this exact structure:
{
  "employeeName": "string or null",
  "clientName": "string or null",
  "periodStart": "YYYY-MM-DD or null",
  "periodEnd": "YYYY-MM-DD or null",
  "totalHours": number,
  "regularHours": number,
  "overtimeHours": number,
  "weeks": [
    {
      "weekLabel": "string description like 'Week 1 (3-7 Mar)'",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "hours": number,
      "overtimeHours": number
    }
  ],
  "signatureDetected": boolean,
  "approverName": "string or null",
  "notes": "string or null",
  "format": "string describing the template format",
  "confidence": number between 0 and 100,
  "warnings": ["array of warning strings"],
  "monthBoundaryWarning": "string or null - describe if the timesheet spans two months"
}

Be precise with numbers. If you cannot read a value clearly, set confidence lower and add a warning. Always return valid JSON.`;

async function pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "ocr-"));
  const pdfPath = join(tempDir, "input.pdf");
  const outputPrefix = join(tempDir, "page");

  try {
    await writeFile(pdfPath, pdfBuffer);
    await execFileAsync("pdftoppm", ["-png", "-r", "200", pdfPath, outputPrefix]);

    const files = await readdir(tempDir);
    const pngFiles = files.filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();

    const images: Buffer[] = [];
    for (const png of pngFiles) {
      images.push(await readFile(join(tempDir, png)));
    }

    return images;
  } finally {
    try {
      const files = await readdir(tempDir);
      for (const f of files) {
        await unlink(join(tempDir, f)).catch(() => {});
      }
      await unlink(tempDir).catch(() => {});
      const { rmdir } = await import("fs/promises");
      await rmdir(tempDir).catch(() => {});
    } catch {}
  }
}

export async function scanTimesheetPdf(
  fileBuffer: Buffer,
  fileName: string,
  targetMonth: number,
  targetYear: number
): Promise<ScanResult> {
  const fileSizeKB = (fileBuffer.length / 1024).toFixed(0);
  const fileSizeBytes = fileBuffer.length;
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  try {
    const pageImages = await pdfToImages(fileBuffer);

    if (pageImages.length === 0) {
      throw new Error("Failed to convert PDF to images — no pages extracted");
    }

    const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = pageImages.map(
      (img) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:image/png;base64,${img.toString("base64")}`,
          detail: "high" as const,
        },
      })
    );

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract timesheet data from these ${pageImages.length} page image(s) of a PDF timesheet. The expected period is ${getMonthName(targetMonth)} ${targetYear}. If the timesheet covers a different period, note that in warnings. Parse all hours carefully.`,
            },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const totalHours = Number(parsed.totalHours) || 0;
    const regularHours = Number(parsed.regularHours) || 0;
    const overtimeHours = Number(parsed.overtimeHours) || 0;
    const confidence = Math.min(100, Math.max(0, Number(parsed.confidence) || 70));
    const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    const weeks = Array.isArray(parsed.weeks)
      ? parsed.weeks.map((w: any) => ({
          wk: w.weekLabel || "Unknown Week",
          h: Number(w.hours) || 0,
        }))
      : [];

    let period = `${getMonthName(targetMonth)} ${targetYear}`;
    if (parsed.periodStart && parsed.periodEnd) {
      period = `${formatDateShort(parsed.periodStart)} - ${formatDateShort(parsed.periodEnd)}`;
    }

    if (parsed.monthBoundaryWarning) {
      warnings.push(parsed.monthBoundaryWarning);
    }

    if (overtimeHours > 20) {
      warnings.push(`High overtime hours detected: ${overtimeHours}h`);
    }

    if (confidence < 70) {
      warnings.push("Low confidence scan — please verify extracted data manually");
    }

    return {
      fileName,
      fileSize: `${fileSizeKB} KB`,
      fileSizeBytes,
      fileHash,
      totalHours,
      regularHours,
      overtimeHours,
      period,
      format: parsed.format || "Unknown Format",
      confidence,
      warnings,
      weeks,
      notes: buildNotes(parsed),
      employeeName: parsed.employeeName || null,
      clientName: parsed.clientName || null,
      signatureDetected: Boolean(parsed.signatureDetected),
      monthBoundaryWarning: parsed.monthBoundaryWarning || null,
    };
  } catch (error: any) {
    console.error(`OCR error for ${fileName}:`, error.message);
    return {
      fileName,
      fileSize: `${fileSizeKB} KB`,
      fileSizeBytes,
      fileHash,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      period: `${getMonthName(targetMonth)} ${targetYear}`,
      format: "Error",
      confidence: 0,
      warnings: [`AI extraction failed: ${error.message}`],
      weeks: [],
      notes: null,
      employeeName: null,
      clientName: null,
      signatureDetected: false,
      monthBoundaryWarning: null,
    };
  }
}

function getMonthName(month: number): string {
  const months = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return months[month] || "";
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function buildNotes(parsed: any): string | null {
  const parts: string[] = [];
  if (parsed.approverName) parts.push(`Approved by: ${parsed.approverName}`);
  if (parsed.notes) parts.push(parsed.notes);
  return parts.length > 0 ? parts.join(". ") : null;
}
