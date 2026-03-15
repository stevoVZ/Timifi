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

export async function pushPayRunToXero(opts: {
  calendarId: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  employees: Array<{
    xeroEmployeeId: string;
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
  const employeeMap = new Map(opts.employees.map(e => [e.xeroEmployeeId, e]));

  const errors: string[] = [];
  let payslipsUpdated = 0;
  let payslipsSkipped = 0;

  if (reusedExisting) {
    errors.push(`Reused existing draft pay run for this period (${opts.periodStart} to ${opts.periodEnd})`);
  }

  let ordinaryEarningsRateId: string | null = null;
  try {
    const piRes = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayItems", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
    });
    if (piRes.ok) {
      const piData = (await piRes.json()) as { PayItems?: any };
      const earningsRates = piData.PayItems?.EarningsRates || [];
      const ordinary = earningsRates.find(
        (r: any) =>
          (r.Name || "").toLowerCase().includes("ordinary") ||
          r.EarningsType === "REGULAREARNINGS"
      );
      if (ordinary) ordinaryEarningsRateId = ordinary.EarningsRateID;
    }
  } catch {}

  for (const payslip of payslips) {
    const empData = employeeMap.get(payslip.EmployeeID);
    if (!empData || empData.hours <= 0) {
      payslipsSkipped++;
      continue;
    }

    const earningsLine: any = {
      NumberOfUnits: empData.hours,
      RatePerUnit: empData.rate,
    };
    if (empData.earningsRateId || ordinaryEarningsRateId) {
      earningsLine.EarningsRateID = empData.earningsRateId || ordinaryEarningsRateId;
    }

    const updateBody = {
      PayslipID: payslip.PayslipID,
      EmployeeID: payslip.EmployeeID,
      EarningsLines: [earningsLine],
      // Explicitly clear any stale manual tax/deduction overrides on existing drafts
      TaxLines: [],
      DeductionLines: [],
      ReimbursementLines: [],
      LeaveLines: [],
    };

    try {
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
          body: JSON.stringify({ Payslip: updateBody }),
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
