import { refreshTokenIfNeeded, xeroFetch } from "./xero";

function toXeroDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `/Date(${d.getTime()}+0000)/`;
}

function parseXeroDate(dateStr: string): string | null {
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//);
  if (match) {
    const d = new Date(parseInt(match[1]));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

function parseXeroErrorMessage(body: string): string {
  const msgMatch = body.match(/<Message>([\s\S]*?)<\/Message>/);
  if (msgMatch) {
    return msgMatch[1].trim();
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed.Message) return parsed.Message;
    if (parsed.message) return parsed.message;
    if (parsed.ErrorMessage) return parsed.ErrorMessage;
  } catch {}
  return body.length > 300 ? body.substring(0, 300) + "..." : body;
}

export async function getXeroPayrollCalendars(): Promise<
  Array<{ id: string; name: string; type: string; startDate: string | null; paymentDate: string | null }>
> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();
  const res = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Xero calendars fetch failed (${res.status})`);
  const data = (await res.json()) as { PayrollCalendars?: any[] };
  return (data.PayrollCalendars || []).map((c: any) => ({
    id: c.PayrollCalendarID,
    name: c.Name,
    type: c.CalendarType,
    startDate: c.StartDate ? parseXeroDate(c.StartDate) : null,
    paymentDate: c.PaymentDate ? parseXeroDate(c.PaymentDate) : null,
  }));
}

async function findExistingDraftPayRun(
  calendarId: string,
  periodStart: string,
  periodEnd: string,
  accessToken: string,
  tenantId: string
): Promise<any | null> {
  let allPayRuns: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/PayRuns?page=${page}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    });
    if (!res.ok) break;
    const data = (await res.json()) as { PayRuns?: any[] };
    const batch = data.PayRuns || [];
    allPayRuns = allPayRuns.concat(batch);
    hasMore = batch.length === 100;
    page++;
  }

  for (const pr of allPayRuns) {
    if (pr.PayrollCalendarID !== calendarId) continue;
    const prStatus = (pr.PayRunStatus || "").toUpperCase();
    if (prStatus !== "DRAFT") continue;

    const prStart = pr.PayRunPeriodStartDate ? parseXeroDate(pr.PayRunPeriodStartDate) : null;
    const prEnd = pr.PayRunPeriodEndDate ? parseXeroDate(pr.PayRunPeriodEndDate) : null;

    if (prStart === periodStart && prEnd === periodEnd) {
      return pr;
    }
  }

  return null;
}

async function fetchPayRunDetail(
  payRunId: string,
  accessToken: string,
  tenantId: string
): Promise<any | null> {
  const res = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/PayRuns/${payRunId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { PayRuns?: any[] };
  return data.PayRuns?.[0] || null;
}

export interface PayPeriodOption {
  calendarId: string;
  calendarName: string;
  calendarType: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  label: string;
  hasDraft: boolean;
  draftPayRunId: string | null;
}

function addPeriod(date: Date, calendarType: string): Date {
  const result = new Date(date);
  switch (calendarType) {
    case "WEEKLY":
      result.setDate(result.getDate() + 7);
      break;
    case "FORTNIGHTLY":
      result.setDate(result.getDate() + 14);
      break;
    case "FOURWEEKLY":
      result.setDate(result.getDate() + 28);
      break;
    case "MONTHLY":
      result.setMonth(result.getMonth() + 1);
      break;
    case "TWICEMONTHLY":
      if (result.getDate() <= 15) {
        result.setDate(16);
      } else {
        result.setMonth(result.getMonth() + 1);
        result.setDate(1);
      }
      break;
    case "QUARTERLY":
      result.setMonth(result.getMonth() + 3);
      break;
    default:
      result.setMonth(result.getMonth() + 1);
  }
  return result;
}

function getPeriodEnd(periodStart: Date, calendarType: string): Date {
  const end = addPeriod(periodStart, calendarType);
  end.setDate(end.getDate() - 1);
  return end;
}

function formatDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPeriodLabel(calendarName: string, periodStart: Date, periodEnd: Date): string {
  const startMonth = periodStart.toLocaleString("en-AU", { month: "long", year: "numeric" });
  const endMonth = periodEnd.toLocaleString("en-AU", { month: "long", year: "numeric" });
  if (startMonth === endMonth) {
    return `${calendarName}: ${startMonth}`;
  }
  return `${calendarName}: ${periodStart.toLocaleString("en-AU", { day: "numeric", month: "short" })} - ${periodEnd.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
}

export async function getAvailablePayPeriods(): Promise<PayPeriodOption[]> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  const calRes = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });
  if (!calRes.ok) throw new Error(`Xero calendars fetch failed (${calRes.status})`);
  const calData = (await calRes.json()) as { PayrollCalendars?: any[] };
  const calendars = calData.PayrollCalendars || [];

  let allPayRuns: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/PayRuns?page=${page}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    });
    if (!res.ok) break;
    const data = (await res.json()) as { PayRuns?: any[] };
    const batch = data.PayRuns || [];
    allPayRuns = allPayRuns.concat(batch);
    hasMore = batch.length === 100;
    page++;
  }

  const payRunsByCalendar = new Map<string, any[]>();
  for (const pr of allPayRuns) {
    const calId = pr.PayrollCalendarID;
    if (!payRunsByCalendar.has(calId)) payRunsByCalendar.set(calId, []);
    payRunsByCalendar.get(calId)!.push(pr);
  }

  const periods: PayPeriodOption[] = [];
  const now = new Date();

  for (const cal of calendars) {
    const calId = cal.PayrollCalendarID;
    const calName = cal.Name || "Unknown Calendar";
    const calType = cal.CalendarType || "MONTHLY";
    const calRuns = payRunsByCalendar.get(calId) || [];

    const draftRuns = calRuns.filter(
      (pr: any) => (pr.PayRunStatus || "").toUpperCase() === "DRAFT"
    );
    for (const draft of draftRuns) {
      const pStart = draft.PayRunPeriodStartDate ? parseXeroDate(draft.PayRunPeriodStartDate) : null;
      const pEnd = draft.PayRunPeriodEndDate ? parseXeroDate(draft.PayRunPeriodEndDate) : null;
      const pPayment = draft.PaymentDate ? parseXeroDate(draft.PaymentDate) : null;
      if (pStart && pEnd) {
        periods.push({
          calendarId: calId,
          calendarName: calName,
          calendarType: calType,
          periodStart: pStart,
          periodEnd: pEnd,
          paymentDate: pPayment || pEnd,
          label: formatPeriodLabel(calName, new Date(pStart), new Date(pEnd)),
          hasDraft: true,
          draftPayRunId: draft.PayRunID,
        });
      }
    }

    // Only look at recent/current pay runs to find the next period
    // We only want the LATEST completed run, not historical ones
    let latestPostedEnd: Date | null = null;
    for (const pr of calRuns) {
      const prStatus = (pr.PayRunStatus || "").toUpperCase();
      if (prStatus === "DRAFT") continue; // skip drafts when finding latest posted
      const pEnd = pr.PayRunPeriodEndDate ? parseXeroDate(pr.PayRunPeriodEndDate) : null;
      if (pEnd) {
        const d = new Date(pEnd);
        if (!latestPostedEnd || d > latestPostedEnd) latestPostedEnd = d;
      }
    }

    let nextStart: Date;
    if (latestPostedEnd) {
      nextStart = new Date(latestPostedEnd);
      nextStart.setDate(nextStart.getDate() + 1);
    } else {
      // No posted runs — start from current month
      nextStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Only generate 2 upcoming periods (current + next month)
    const periodsToGenerate = 2;
    for (let i = 0; i < periodsToGenerate; i++) {
      const pEnd = getPeriodEnd(nextStart, calType);
      const paymentDate = cal.PaymentDate ? parseXeroDate(cal.PaymentDate) : null;
      let payDate = pEnd;
      if (paymentDate) {
        const origPayDay = new Date(paymentDate).getDate();
        payDate = new Date(pEnd.getFullYear(), pEnd.getMonth(), origPayDay);
        if (payDate < pEnd) {
          payDate.setMonth(payDate.getMonth() + 1);
        }
      }

      const startStr = formatDateStr(nextStart);
      const endStr = formatDateStr(pEnd);

      const alreadyListed = periods.some(
        p => p.calendarId === calId && p.periodStart === startStr && p.periodEnd === endStr
      );

      if (!alreadyListed) {
        const existingDraft = draftRuns.find((dr: any) => {
          const drStart = dr.PayRunPeriodStartDate ? parseXeroDate(dr.PayRunPeriodStartDate) : null;
          const drEnd = dr.PayRunPeriodEndDate ? parseXeroDate(dr.PayRunPeriodEndDate) : null;
          return drStart === startStr && drEnd === endStr;
        });

        periods.push({
          calendarId: calId,
          calendarName: calName,
          calendarType: calType,
          periodStart: startStr,
          periodEnd: endStr,
          paymentDate: formatDateStr(payDate),
          label: formatPeriodLabel(calName, nextStart, pEnd),
          hasDraft: !!existingDraft,
          draftPayRunId: existingDraft ? existingDraft.PayRunID : null,
        });
      }

      nextStart = new Date(pEnd);
      nextStart.setDate(nextStart.getDate() + 1);
    }
  }

  periods.sort((a, b) => {
    if (a.calendarName !== b.calendarName) return a.calendarName.localeCompare(b.calendarName);
    return a.periodStart.localeCompare(b.periodStart);
  });

  return periods;
}


export interface XeroEarningsLine {
  earningsRateId: string;
  earningsRateName: string;
  ratePerUnit: number;
  numberOfUnits: number;
}

export interface XeroDeductionLine {
  deductionTypeId: string;
  deductionTypeName: string;
  calculationType: string; // FIXEDAMOUNT, PERCENTAGEOFGROSS etc
  amount: number;
  percentage?: number;
}

export interface XeroSuperLine {
  superMembershipId: string;
  fundName: string;
  contributionType: string;
  calculationType: string;
  minimumMonthlyEarnings: number;
  percentage: number;
  amount: number;
}

export interface XeroTaxLine {
  taxType: string;
  amount: number;
  manualTax: boolean;
}

export interface XeroPayslipData {
  xeroEmployeeId: string;
  firstName: string;
  lastName: string;
  hours: number;
  ratePerUnit: number;
  // Full template data from the live payslip
  earningsLines: XeroEarningsLine[];
  deductionLines: XeroDeductionLine[];
  superLines: XeroSuperLine[];
  taxLines: XeroTaxLine[];
}

export async function getXeroPayslipHours(
  payRunId: string
): Promise<XeroPayslipData[]> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  // Fetch the pay run detail (includes Payslips with EmployeeID)
  const prRes = await xeroFetch(
    `https://api.xero.com/payroll.xro/1.0/PayRuns/${payRunId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    }
  );
  if (!prRes.ok) throw new Error(`Xero PayRun fetch failed (${prRes.status})`);
  const prData = (await prRes.json()) as { PayRuns?: any[] };
  const payRun = prData.PayRuns?.[0];
  if (!payRun) throw new Error("Pay run not found in Xero");

  const payslipStubs: any[] = payRun.Payslips || [];

  // Fetch full employee list for name resolution
  const empRes = await xeroFetch(
    "https://api.xero.com/payroll.xro/1.0/Employees",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    }
  );
  const empData = empRes.ok
    ? ((await empRes.json()) as { Employees?: any[] })
    : { Employees: [] };
  const xeroEmpMap = new Map<string, { firstName: string; lastName: string }>();
  for (const xe of empData.Employees || []) {
    xeroEmpMap.set(xe.EmployeeID, {
      firstName: xe.FirstName || "",
      lastName: xe.LastName || "",
    });
  }

  const results: XeroPayslipData[] = [];

  for (const stub of payslipStubs) {
    // Fetch individual payslip to get EarningsLines
    const psRes = await xeroFetch(
      `https://api.xero.com/payroll.xro/1.0/Payslip/${stub.PayslipID}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          Accept: "application/json",
        },
      }
    );
    if (!psRes.ok) continue;
    const psData = (await psRes.json()) as { Payslip?: any };
    const ps = psData.Payslip;
    if (!ps) continue;

    const rawEarnings: any[] = ps.EarningsLines || [];
    const totalHours = rawEarnings.reduce(
      (sum: number, el: any) => sum + (parseFloat(el.NumberOfUnits) || 0),
      0
    );
    const ratePerUnit =
      rawEarnings.length > 0
        ? parseFloat(rawEarnings[0].RatePerUnit) || 0
        : 0;

    const earningsLines: XeroEarningsLine[] = rawEarnings.map((el: any) => ({
      earningsRateId: el.EarningsRateID || "",
      earningsRateName: el.EarningsRateName || el.EarningsRateID || "Ordinary Hours",
      ratePerUnit: parseFloat(el.RatePerUnit) || 0,
      numberOfUnits: parseFloat(el.NumberOfUnits) || 0,
    }));

    const deductionLines: XeroDeductionLine[] = (ps.DeductionLines || []).map((dl: any) => ({
      deductionTypeId: dl.DeductionTypeID || "",
      deductionTypeName: dl.DeductionTypeName || dl.DeductionTypeID || "Deduction",
      calculationType: dl.CalculationType || "FIXEDAMOUNT",
      amount: parseFloat(dl.Amount) || 0,
      percentage: dl.Percentage ? parseFloat(dl.Percentage) : undefined,
    }));

    const superLines: XeroSuperLine[] = (ps.SuperLines || []).map((sl: any) => ({
      superMembershipId: sl.SuperMembershipID || "",
      fundName: sl.FundName || sl.SuperMembershipID || "Superannuation",
      contributionType: sl.ContributionType || "",
      calculationType: sl.CalculationType || "PERCENTAGEOFEARNINGS",
      minimumMonthlyEarnings: parseFloat(sl.MinimumMonthlyEarnings) || 0,
      percentage: parseFloat(sl.Percentage) || 0,
      amount: parseFloat(sl.Amount) || 0,
    }));

    const taxLines: XeroTaxLine[] = (ps.TaxLines || []).map((tl: any) => ({
      taxType: tl.TaxType || "PAYG",
      amount: parseFloat(tl.Amount) || 0,
      manualTax: !!tl.ManualTax,
    }));

    const emp = xeroEmpMap.get(stub.EmployeeID);
    results.push({
      xeroEmployeeId: stub.EmployeeID,
      firstName: emp?.firstName || "",
      lastName: emp?.lastName || "",
      hours: totalHours,
      ratePerUnit,
      earningsLines,
      deductionLines,
      superLines,
      taxLines,
    });

    await new Promise(r => setTimeout(r, 200)); // rate-limit courtesy
  }

  return results;
}

export async function pushPayRunToXero(opts: {
  calendarId: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  employees: Array<{
    appEmployeeId?: string;
    firstName?: string;
    lastName?: string;
    xeroEmployeeId: string | null;
    hours: number;
    rate: number;
    gross: number;
    earningsRateId?: string;
  }>;
}): Promise<{
  xeroPayRunId: string;
  payRunStatus: string;
  payslipsUpdated: number;
  payslipsSkipped: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let payRun: any = null;
  let reusedExisting = false;

  const existingDraft = await findExistingDraftPayRun(
    opts.calendarId,
    opts.periodStart,
    opts.periodEnd,
    accessToken,
    tenantId
  );

  if (existingDraft) {
    const detail = await fetchPayRunDetail(existingDraft.PayRunID, accessToken, tenantId);
    if (detail) {
      payRun = detail;
      reusedExisting = true;
      console.log(`Reusing existing draft pay run ${existingDraft.PayRunID} for period ${opts.periodStart} - ${opts.periodEnd}`);
    }
  }

  if (!payRun) {
    const createBody = {
      PayrollCalendarID: opts.calendarId,
      PayRunPeriodStartDate: toXeroDate(opts.periodStart),
      PayRunPeriodEndDate: toXeroDate(opts.periodEnd),
      PaymentDate: toXeroDate(opts.paymentDate),
    };

    const createHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const wrappedBody = JSON.stringify({ PayRuns: [createBody] });
    const bareBody = JSON.stringify([createBody]);

    let createRes = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayRuns", {
      method: "POST",
      headers: createHeaders,
      body: wrappedBody,
    });

    if (!createRes.ok && createRes.status === 400) {
      const errorBody = await createRes.text();
      const isDeserializationError = errorBody.includes("deserialize") || errorBody.includes("JSON array");
      if (isDeserializationError) {
        console.log("Xero PayRun create: wrapped format failed, retrying with bare array format");
        createRes = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayRuns", {
          method: "POST",
          headers: createHeaders,
          body: bareBody,
        });
        if (!createRes.ok) {
          const fallbackBody = await createRes.text();
          throw new Error(`Xero create pay run failed (${createRes.status}): ${parseXeroErrorMessage(fallbackBody)}`);
        }
      } else {
        throw new Error(`Xero create pay run failed (${createRes.status}): ${parseXeroErrorMessage(errorBody)}`);
      }
    } else if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Xero create pay run failed (${createRes.status}): ${parseXeroErrorMessage(body)}`);
    }

    const createData = await createRes.json();
    if (Array.isArray(createData)) {
      payRun = createData[0];
    } else {
      payRun = createData.PayRuns?.[0];
    }
    if (!payRun) throw new Error("Xero did not return a pay run after creation");
  }

  const xeroPayRunId: string = payRun.PayRunID;
  const xeroPayRunStatus: string = payRun.PayRunStatus || "DRAFT";

  const payslips: any[] = payRun.Payslips || [];

  // Build primary map by xeroEmployeeId (only employees that already have one)
  const employeeMap = new Map(
    opts.employees.filter(e => e.xeroEmployeeId).map(e => [e.xeroEmployeeId!, e])
  );

  // Name-based fallback for employees without xeroEmployeeId
  const unmatchedEmployees = opts.employees.filter(e => !e.xeroEmployeeId);
  if (unmatchedEmployees.length > 0 && payslips.length > 0) {
    try {
      const empRes = await xeroFetch("https://api.xero.com/payroll.xro/1.0/Employees", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          Accept: "application/json",
        },
      });
      if (empRes.ok) {
        const empData = (await empRes.json()) as { Employees?: any[] };
        const xeroEmployees = empData.Employees || [];
        const xeroNameMap = new Map<string, string>();
        for (const xe of xeroEmployees) {
          const key = `${(xe.FirstName || "").toLowerCase().trim()} ${(xe.LastName || "").toLowerCase().trim()}`;
          xeroNameMap.set(key, xe.EmployeeID);
        }
        for (const emp of unmatchedEmployees) {
          const key = `${(emp.firstName || "").toLowerCase().trim()} ${(emp.lastName || "").toLowerCase().trim()}`;
          const matchedXeroId = xeroNameMap.get(key);
          if (matchedXeroId) {
            employeeMap.set(matchedXeroId, { ...emp, xeroEmployeeId: matchedXeroId });
            // Persist the match back to DB
            try {
              const { storage } = await import("./storage");
              if (emp.appEmployeeId) {
                await storage.updateEmployee(emp.appEmployeeId, { xeroEmployeeId: matchedXeroId });
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  const errors: string[] = [];
  let payslipsUpdated = 0;
  let payslipsSkipped = 0;

  if (reusedExisting) {
    errors.push(`Reused existing draft pay run for this period (${opts.periodStart} to ${opts.periodEnd})`);
  }

  for (const payslip of payslips) {
    const empData = employeeMap.get(payslip.EmployeeID);
    if (!empData || empData.hours <= 0) {
      payslipsSkipped++;
      continue;
    }

    try {
      // Step 1: Fetch the full existing payslip from Xero to preserve all existing data
      // (rate, tax type, deductions, super fund, leave lines, etc.)
      const fullPsRes = await xeroFetch(
        `https://api.xero.com/payroll.xro/1.0/Payslip/${payslip.PayslipID}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-Tenant-Id": tenantId,
            Accept: "application/json",
          },
        }
      );

      let updateBody: any;

      if (fullPsRes.ok) {
        const fullPsData = (await fullPsRes.json()) as { Payslip?: any };
        const existingPayslip = fullPsData.Payslip;

        if (existingPayslip) {
          // Step 2: Clone the existing payslip and only update NumberOfUnits
          // on the primary earnings line — preserve rate, tax, deductions, super, etc.
          const existingEarningsLines: any[] = existingPayslip.EarningsLines || [];

          let updatedEarningsLines: any[];
          if (existingEarningsLines.length > 0) {
            // Update hours on the first (primary) earnings line only, keep everything else
            updatedEarningsLines = existingEarningsLines.map((el: any, idx: number) => {
              if (idx === 0) {
                return { ...el, NumberOfUnits: empData.hours };
              }
              return el;
            });
          } else {
            // No existing earnings lines — create one using Timifi rate as fallback
            updatedEarningsLines = [{
              NumberOfUnits: empData.hours,
              RatePerUnit: empData.rate,
            }];
          }

          updateBody = {
            PayslipID: existingPayslip.PayslipID,
            EmployeeID: existingPayslip.EmployeeID,
            EarningsLines: updatedEarningsLines,
            // Preserve all existing lines from Xero — don't override
            ...(existingPayslip.TaxLines?.length > 0 && { TaxLines: existingPayslip.TaxLines }),
            ...(existingPayslip.DeductionLines?.length > 0 && { DeductionLines: existingPayslip.DeductionLines }),
            ...(existingPayslip.SuperLines?.length > 0 && { SuperLines: existingPayslip.SuperLines }),
            ...(existingPayslip.ReimbursementLines?.length > 0 && { ReimbursementLines: existingPayslip.ReimbursementLines }),
          };
        } else {
          // Fallback if payslip not found in response
          updateBody = {
            PayslipID: payslip.PayslipID,
            EmployeeID: payslip.EmployeeID,
            EarningsLines: [{ NumberOfUnits: empData.hours, RatePerUnit: empData.rate }],
          };
        }
      } else {
        // Fallback if fetch failed
        updateBody = {
          PayslipID: payslip.PayslipID,
          EmployeeID: payslip.EmployeeID,
          EarningsLines: [{ NumberOfUnits: empData.hours, RatePerUnit: empData.rate }],
        };
      }

      // Step 3: Push the updated payslip back to Xero
      const updateRes = await xeroFetch(
        `https://api.xero.com/payroll.xro/1.0/Payslip/${payslip.PayslipID}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-Tenant-Id": tenantId,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify([updateBody]),
        }
      );

      if (!updateRes.ok) {
        const errBody = await updateRes.text();
        errors.push(`Payslip ${payslip.PayslipID} update failed: ${parseXeroErrorMessage(errBody)}`);
        payslipsSkipped++;
      } else {
        payslipsUpdated++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      errors.push(`Payslip ${payslip.PayslipID}: ${err.message}`);
      payslipsSkipped++;
    }
  }

  return {
    xeroPayRunId,
    payRunStatus: xeroPayRunStatus,
    payslipsUpdated,
    payslipsSkipped,
    errors,
  };
}
