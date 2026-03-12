import { refreshTokenIfNeeded } from "./xero";

async function xeroFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const wait = Math.min(2 ** attempt * 5, 60);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    return response;
  }
  throw new Error("Xero rate limit exceeded");
}

function toXeroDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `/Date(${d.getTime()}+0000)/`;
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

function parseXeroDate(dateStr: string): string | null {
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//);
  if (match) {
    return new Date(parseInt(match[1])).toISOString().split("T")[0];
  }
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return null;
  }
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

  // Step 1: Create the draft pay run
  const createBody = {
    PayrollCalendarID: opts.calendarId,
    PayRunPeriodStartDate: toXeroDate(opts.periodStart),
    PayRunPeriodEndDate: toXeroDate(opts.periodEnd),
    PaymentDate: toXeroDate(opts.paymentDate),
  };

  const createRes = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayRuns", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ PayRuns: [createBody] }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Xero create pay run failed (${createRes.status}): ${body}`);
  }

  const createData = (await createRes.json()) as { PayRuns?: any[] };
  const payRun = createData.PayRuns?.[0];
  if (!payRun) throw new Error("Xero did not return a pay run");

  const xeroPayRunId: string = payRun.PayRunID;
  const xeroPayRunStatus: string = payRun.PayRunStatus || "DRAFT";

  // Step 2: Match payslips by employee ID and update earnings
  const payslips: any[] = payRun.Payslips || [];
  const employeeMap = new Map(opts.employees.map(e => [e.xeroEmployeeId, e]));

  const errors: string[] = [];
  let payslipsUpdated = 0;
  let payslipsSkipped = 0;

  // Fetch earnings rates to find the "Ordinary Time" rate ID
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
        errors.push(`Payslip ${payslip.PayslipID} update failed: ${errBody}`);
        payslipsSkipped++;
      } else {
        payslipsUpdated++;
      }
      // Throttle to respect rate limits
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
