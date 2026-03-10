import { XeroClient } from "xero-node";
import { storage } from "./storage";
import { getSuperRate, calculateChargeOutFromPayRate } from "./rates";
import crypto from "crypto";
import type { InsertPayslipLine } from "@shared/schema";

function parseRetryAfter(header: string): number {
  const numeric = parseInt(header, 10);
  if (!isNaN(numeric) && String(numeric) === header.trim()) {
    if (numeric > 1700000000) {
      return Math.max(Math.ceil(numeric - Date.now() / 1000), 5);
    }
    return Math.max(numeric, 5);
  }
  const dateMs = Date.parse(header);
  if (!isNaN(dateMs)) {
    return Math.max(Math.ceil((dateMs - Date.now()) / 1000), 5);
  }
  return 60;
}

async function xeroFetch(url: string, options: RequestInit, maxRetries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      let waitSec = retryAfter ? parseRetryAfter(retryAfter) : Math.min(2 ** attempt * 5, 60);
      if (waitSec > 120) {
        const urlPath = new URL(url).pathname;
        console.log(`Xero daily rate limit hit on ${urlPath}, Retry-After=${retryAfter} (${waitSec}s). Aborting retries.`);
        throw new Error(`Xero daily rate limit exceeded for ${urlPath}. Try again later.`);
      }
      const urlPath = new URL(url).pathname;
      console.log(`Xero 429 on ${urlPath}, Retry-After=${retryAfter}, waiting ${waitSec}s (retry ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
      continue;
    }
    return response;
  }
  throw new Error(`Xero API rate limit exceeded after ${maxRetries} retries for ${url}`);
}

let xeroClient: XeroClient | null = null;
let cachedClientId: string | null = null;

async function getSettingValue(key: string): Promise<string> {
  const s = await storage.getSetting(key);
  return s?.value || "";
}

async function saveSetting(key: string, value: string): Promise<void> {
  await storage.upsertSetting(key, value);
}

function getRedirectUri(): string {
  return process.env.XERO_REDIRECT_URI || "http://localhost:5000/api/xero/callback";
}

export function getCallbackUri(): string {
  return getRedirectUri();
}

export async function getConsentUrl(): Promise<string> {
  const clientId = await getSettingValue("xero.clientId");
  if (!clientId) {
    throw new Error("Xero Client ID is required. Configure it in Settings.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  await saveSetting("xero.oauthState", state);

  const redirectUri = getRedirectUri();
  const scopes = [
    "openid",
    "profile",
    "email",
    "payroll.employees",
    "payroll.employees.read",
    "payroll.payruns",
    "payroll.payruns.read",
    "payroll.payslip",
    "payroll.payslip.read",
    "payroll.settings",
    "payroll.settings.read",
    "payroll.timesheets",
    "payroll.timesheets.read",
    "accounting.invoices",
    "accounting.invoices.read",
    "accounting.contacts.read",
    "accounting.banktransactions.read",
    "offline_access",
  ];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state: state,
  });

  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}

export async function handleCallback(url: string): Promise<void> {
  const parsedUrl = new URL(url, "https://placeholder.com");
  const code = parsedUrl.searchParams.get("code");
  const returnedState = parsedUrl.searchParams.get("state");

  if (!code) {
    const error = parsedUrl.searchParams.get("error");
    const errorDesc = parsedUrl.searchParams.get("error_description");
    throw new Error(`Xero authorization failed: ${error || "no code returned"}. ${errorDesc || ""}`);
  }

  const savedState = await getSettingValue("xero.oauthState");
  if (savedState && returnedState !== savedState) {
    throw new Error("OAuth state mismatch. Please try connecting again.");
  }

  const clientId = await getSettingValue("xero.clientId");
  const clientSecret = await getSettingValue("xero.clientSecret");
  const redirectUri = getRedirectUri();

  const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error("Xero token exchange failed:", tokenResponse.status, errorBody);
    throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorBody}`);
  }

  const tokenData = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    id_token?: string;
  };

  const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

  await saveSetting("xero.accessToken", tokenData.access_token);
  await saveSetting("xero.refreshToken", tokenData.refresh_token);
  await saveSetting("xero.tokenExpiry", String(expiresAt));

  const tenantsResponse = await xeroFetch("https://api.xero.com/connections", {
    headers: {
      "Authorization": `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (tenantsResponse.ok) {
    const tenants = await tenantsResponse.json() as Array<{ tenantId: string; tenantName: string; tenantType: string }>;
    await saveSetting("xero.tenants", JSON.stringify(tenants));
    if (tenants.length > 0) {
      const currentTenantId = await getSettingValue("xero.tenantId");
      const stillExists = tenants.find(t => t.tenantId === currentTenantId);
      if (!stillExists) {
        await saveSetting("xero.tenantId", tenants[0].tenantId);
        await saveSetting("xero.tenantName", tenants[0].tenantName || "");
        const { setActiveTenantId } = await import("./storage");
        setActiveTenantId(tenants[0].tenantId);
      }
    }
  }

  await saveSetting("xero.connected", "true");
}

export async function getTenants(): Promise<Array<{ tenantId: string; tenantName: string; tenantType: string; selected: boolean }>> {
  const tenantsJson = await getSettingValue("xero.tenants");
  const currentTenantId = await getSettingValue("xero.tenantId");
  let tenants: Array<{ tenantId: string; tenantName: string; tenantType: string }> = [];
  try {
    tenants = JSON.parse(tenantsJson || "[]");
  } catch {}
  return tenants.map(t => ({
    ...t,
    selected: t.tenantId === currentTenantId,
  }));
}

export async function selectTenant(tenantId: string): Promise<void> {
  const tenantsJson = await getSettingValue("xero.tenants");
  let tenants: Array<{ tenantId: string; tenantName: string; tenantType: string }> = [];
  try {
    tenants = JSON.parse(tenantsJson || "[]");
  } catch {}
  const tenant = tenants.find(t => t.tenantId === tenantId);
  if (!tenant) {
    throw new Error("Tenant not found. Please reconnect to Xero.");
  }
  await saveSetting("xero.tenantId", tenant.tenantId);
  await saveSetting("xero.tenantName", tenant.tenantName || "");
  const { setActiveTenantId } = await import("./storage");
  setActiveTenantId(tenant.tenantId);
}

async function getXeroClientForApi(): Promise<XeroClient> {
  const clientId = await getSettingValue("xero.clientId");
  const clientSecret = await getSettingValue("xero.clientSecret");

  if (!clientId || !clientSecret) {
    throw new Error("Xero Client ID and Client Secret are required.");
  }

  if (xeroClient && cachedClientId === clientId) {
    return xeroClient;
  }

  const redirectUri = getRedirectUri();
  xeroClient = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: ["openid", "profile", "email", "offline_access"],
  });

  cachedClientId = clientId;
  return xeroClient;
}

export async function refreshTokenIfNeeded(): Promise<{ accessToken: string; tenantId: string }> {
  const accessToken = await getSettingValue("xero.accessToken");
  const refreshToken = await getSettingValue("xero.refreshToken");
  const tokenExpiry = await getSettingValue("xero.tokenExpiry");
  const tenantId = await getSettingValue("xero.tenantId");

  if (!accessToken || !refreshToken) {
    throw new Error("Xero is not connected. Please connect via Settings.");
  }

  if (!tenantId) {
    throw new Error("Xero Tenant ID not found. Please reconnect to Xero.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parseInt(tokenExpiry, 10) || 0;

  if (now >= expiresAt - 60) {
    const clientId = await getSettingValue("xero.clientId");
    const clientSecret = await getSettingValue("xero.clientSecret");

    const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      throw new Error(`Token refresh failed: ${errorBody}`);
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const newExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
    await saveSetting("xero.accessToken", tokenData.access_token);
    await saveSetting("xero.refreshToken", tokenData.refresh_token);
    await saveSetting("xero.tokenExpiry", String(newExpiresAt));

    return { accessToken: tokenData.access_token, tenantId };
  }

  return { accessToken, tenantId };
}

async function tenantSyncKey(base: string): Promise<string> {
  const tid = await getSettingValue("xero.tenantId");
  return tid ? `${base}.${tid}` : base;
}

export async function isConnected(): Promise<{
  connected: boolean;
  tenantName: string;
  lastSyncAt: string;
}> {
  const connected = (await getSettingValue("xero.connected")) === "true";
  const tenantName = await getSettingValue("xero.tenantName");
  const lastSyncAt = await getSettingValue(await tenantSyncKey("xero.lastSyncAt"));
  return { connected, tenantName, lastSyncAt };
}

export async function disconnect(): Promise<void> {
  xeroClient = null;
  cachedClientId = null;
  const keys = [
    "xero.accessToken",
    "xero.refreshToken",
    "xero.tokenExpiry",
    "xero.tenantId",
    "xero.tenantName",
    "xero.connected",
    "xero.oauthState",
    "xero.tenants",
  ];
  for (const key of keys) {
    await saveSetting(key, "");
  }
  const { setActiveTenantId } = await import("./storage");
  setActiveTenantId(null);
}

function parseXeroDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/\/Date\((\d+)([+-]\d+)?\)\//);
  if (match) {
    const ms = parseInt(match[1], 10);
    const d = new Date(ms);
    return d.toISOString().split("T")[0];
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {}
  return null;
}

function mapXeroStatus(status: string | undefined): "ACTIVE" | "PENDING_SETUP" | "OFFBOARDED" {
  if (!status) return "ACTIVE";
  const upper = status.toUpperCase();
  if (upper === "ACTIVE") return "ACTIVE";
  if (upper === "TERMINATED") return "OFFBOARDED";
  return "PENDING_SETUP";
}

function mapPayFrequency(calendarType: string | undefined): "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" {
  if (!calendarType) return "MONTHLY";
  const upper = calendarType.toUpperCase();
  if (upper.includes("WEEK")) return "WEEKLY";
  if (upper.includes("FORTNIGHT")) return "FORTNIGHTLY";
  return "MONTHLY";
}

export async function syncEmployees(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let allEmployees: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const empResponse = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/Employees?page=${page}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!empResponse.ok) {
      const errorBody = await empResponse.text();
      throw new Error(`Failed to fetch employees from Xero (${empResponse.status}): ${errorBody}`);
    }

    const empData = await empResponse.json() as { Employees?: any[] };
    const batch = empData.Employees || [];
    allEmployees = allEmployees.concat(batch);
    hasMore = batch.length === 100;
    page++;
  }

  const employees = allEmployees;

  let calendarsMap: Record<string, string> = {};
  try {
    const calResponse = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });
    if (calResponse.ok) {
      const calData = await calResponse.json() as { PayrollCalendars?: any[] };
      const calendars = calData.PayrollCalendars || [];
      for (const cal of calendars) {
        if (cal.PayrollCalendarID && cal.CalendarType) {
          calendarsMap[cal.PayrollCalendarID] = cal.CalendarType;
        }
      }
    }
  } catch {}

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const emp of employees) {
    try {
      const email = emp.Email;
      const xeroId = emp.EmployeeID;

      if (!email && !xeroId) {
        errors.push(`Skipped employee without email or ID: ${emp.FirstName} ${emp.LastName}`);
        continue;
      }

      const hourlyRate = emp.PayTemplate?.EarningsLines?.[0]?.RatePerUnit;
      const calendarType = emp.PayrollCalendarID
        ? calendarsMap[emp.PayrollCalendarID]
        : undefined;

      const address = emp.HomeAddress;

      const employeeData: Record<string, any> = {
        firstName: emp.FirstName || "Unknown",
        lastName: emp.LastName || "Unknown",
        email: email || `${xeroId}@xero-sync.local`,
        phone: emp.Phone || emp.Mobile || null,
        jobTitle: emp.JobTitle || emp.Title || null,
        status: mapXeroStatus(emp.Status),
        startDate: parseXeroDate(emp.StartDate),
        endDate: parseXeroDate(emp.TerminationDate),
        dateOfBirth: parseXeroDate(emp.DateOfBirth),
        gender: emp.Gender || null,
        xeroEmployeeId: xeroId,
        employmentType: "LABOURHIRE" as const,
      };

      if (hourlyRate !== undefined && hourlyRate !== null) {
        employeeData.hourlyRate = String(hourlyRate);
      }

      if (calendarType) {
        employeeData.payFrequency = mapPayFrequency(calendarType);
      }

      if (address) {
        if (address.AddressLine1) employeeData.addressLine1 = address.AddressLine1;
        if (address.City) employeeData.suburb = address.City;
        if (address.Region) employeeData.state = address.Region.substring(0, 3).toUpperCase();
        if (address.PostalCode) employeeData.postcode = address.PostalCode;
      }

      let existing = xeroId
        ? await storage.getEmployeeByXeroId(xeroId)
        : null;

      if (!existing && email) {
        existing = await storage.getEmployeeByEmail(email);
      }

      if (existing) {
        await storage.updateEmployee(existing.id, employeeData);
        updated++;
      } else {
        await storage.createEmployee(employeeData as any);
        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing ${emp.FirstName} ${emp.LastName}: ${err.message}`);
    }
  }

  await saveSetting(await tenantSyncKey("xero.lastSyncAt"), new Date().toISOString());
  await saveSetting(await tenantSyncKey("xero.lastEmployeeSyncAt"), new Date().toISOString());

  return {
    total: employees.length,
    created,
    updated,
    errors,
  };
}

async function fetchPayRunDetail(payRunId: string, accessToken: string, tenantId: string): Promise<any | null> {
  try {
    const response = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/PayRuns/${payRunId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });
    if (!response.ok) return null;
    const data = await response.json() as { PayRuns?: any[] };
    return data.PayRuns?.[0] || null;
  } catch {
    return null;
  }
}

async function syncPayRunLines(payRunId: string, localPayRunId: string, accessToken: string, tenantId: string, errors: string[], periodStart?: string | null): Promise<number> {
  const detail = await fetchPayRunDetail(payRunId, accessToken, tenantId);
  if (!detail || !detail.Payslips || !Array.isArray(detail.Payslips) || detail.Payslips.length === 0) {
    return 0;
  }

  await storage.deletePayRunLines(localPayRunId);

  let lineCount = 0;
  for (const slip of detail.Payslips) {
    try {
      const employee = slip.EmployeeID
        ? await storage.getEmployeeByXeroId(slip.EmployeeID)
        : null;
      if (!employee) continue;

      let hoursWorked = "0";
      let ratePerHour = "0";
      if (slip.EarningsLines && Array.isArray(slip.EarningsLines) && slip.EarningsLines.length > 0) {
        const totalHours = slip.EarningsLines.reduce((sum: number, el: any) => sum + (el.NumberOfUnits || 0), 0);
        hoursWorked = String(totalHours);
        const primaryLine = slip.EarningsLines[0];
        ratePerHour = String(primaryLine.RatePerUnit || 0);
      }

      const grossEarnings = slip.EarningsLines
        ? String(slip.EarningsLines.reduce((sum: number, el: any) => sum + (el.Amount || 0), 0))
        : "0";

      const payRunLine = await storage.createPayRunLine({
        payRunId: localPayRunId,
        employeeId: employee.id,
        hoursWorked,
        ratePerHour,
        grossEarnings,
        paygWithheld: String(slip.Tax || 0),
        superAmount: String(slip.Super || 0),
        netPay: String(slip.NetPay || 0),
        status: "INCLUDED",
      });

      const payslipDetailLines: InsertPayslipLine[] = [];

      if (slip.EarningsLines && Array.isArray(slip.EarningsLines)) {
        for (const el of slip.EarningsLines) {
          payslipDetailLines.push({
            payRunLineId: payRunLine.id,
            lineType: "EARNINGS",
            name: el.EarningsRateName || null,
            xeroRateId: el.EarningsRateID || null,
            units: el.NumberOfUnits != null ? String(el.NumberOfUnits) : null,
            rate: el.RatePerUnit != null ? String(el.RatePerUnit) : null,
            amount: String(el.Amount || 0),
          });
        }
      }

      if (slip.DeductionLines && Array.isArray(slip.DeductionLines)) {
        for (const dl of slip.DeductionLines) {
          payslipDetailLines.push({
            payRunLineId: payRunLine.id,
            lineType: "DEDUCTION",
            name: dl.DeductionTypeName || null,
            xeroRateId: dl.DeductionTypeID || null,
            amount: String(dl.Amount || 0),
          });
        }
      }

      if (slip.SuperannuationLines && Array.isArray(slip.SuperannuationLines)) {
        for (const sl of slip.SuperannuationLines) {
          payslipDetailLines.push({
            payRunLineId: payRunLine.id,
            lineType: "SUPER",
            name: sl.ContributionType || sl.SuperMembershipName || null,
            xeroRateId: sl.SuperMembershipID || null,
            amount: String(sl.Amount || 0),
            percentage: sl.Percentage != null ? String(sl.Percentage) : null,
          });
        }
      }

      if (slip.ReimbursementLines && Array.isArray(slip.ReimbursementLines)) {
        for (const rl of slip.ReimbursementLines) {
          payslipDetailLines.push({
            payRunLineId: payRunLine.id,
            lineType: "REIMBURSEMENT",
            name: rl.ReimbursementTypeName || rl.Description || null,
            xeroRateId: rl.ReimbursementTypeID || null,
            amount: String(rl.Amount || 0),
          });
        }
      }

      if (slip.TaxLines && Array.isArray(slip.TaxLines)) {
        for (const tl of slip.TaxLines) {
          payslipDetailLines.push({
            payRunLineId: payRunLine.id,
            lineType: "TAX",
            name: tl.TaxTypeName || tl.Description || null,
            amount: String(tl.Amount || 0),
          });
        }
      }

      if (slip.LeaveAccrualLines && Array.isArray(slip.LeaveAccrualLines)) {
        for (const ll of slip.LeaveAccrualLines) {
          payslipDetailLines.push({
            payRunLineId: payRunLine.id,
            lineType: "LEAVE",
            name: ll.LeaveTypeName || null,
            xeroRateId: ll.LeaveTypeID || null,
            units: ll.NumberOfUnits != null ? String(ll.NumberOfUnits) : null,
            amount: String(ll.Amount || 0),
          });
        }
      }

      if (payslipDetailLines.length > 0) {
        await storage.createPayslipLines(payslipDetailLines);
      }

      if (ratePerHour !== "0" && parseFloat(ratePerHour) > 0) {
        try {
          const latestRate = await storage.getLatestRateHistory(employee.id);
          const currentPayRate = parseFloat(ratePerHour);
          const lastKnownRate = latestRate ? parseFloat(latestRate.payRate) : null;

          if (lastKnownRate === null || Math.abs(currentPayRate - lastKnownRate) >= 0.01) {
            const effectiveDate = periodStart || new Date().toISOString().split("T")[0];
            const dateObj = new Date(effectiveDate);
            const superPercent = getSuperRate(dateObj);
            const chargeOut = calculateChargeOutFromPayRate(currentPayRate, superPercent);

            await storage.createRateHistory({
              employeeId: employee.id,
              effectiveDate,
              payRate: String(currentPayRate),
              chargeOutRate: String(chargeOut.toFixed(2)),
              superPercent: String(superPercent),
              source: "PAYROLL_SYNC",
              payRunId: localPayRunId,
            });
          }
        } catch {}
      }

      lineCount++;
    } catch (lineErr: any) {
      errors.push(`Error syncing payslip for employee ${slip.EmployeeID}: ${lineErr.message}`);
    }
  }
  return lineCount;
}

export async function syncPayRuns(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let calendarNamesMap: Record<string, string> = {};
  try {
    const calResponse = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });
    if (calResponse.ok) {
      const calData = await calResponse.json() as { PayrollCalendars?: any[] };
      for (const cal of calData.PayrollCalendars || []) {
        if (cal.PayrollCalendarID && cal.Name) {
          calendarNamesMap[cal.PayrollCalendarID] = cal.Name;
        }
      }
    }
  } catch {}

  let allPayRuns: any[] = [];
  let prPage = 1;
  let prHasMore = true;

  while (prHasMore) {
    const response = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/PayRuns?page=${prPage}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch pay runs from Xero (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as { PayRuns?: any[] };
    const batch = data.PayRuns || [];
    allPayRuns = allPayRuns.concat(batch);
    prHasMore = batch.length === 100;
    prPage++;
  }

  const payRuns = allPayRuns;

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  const existingPayRuns = await storage.getPayRuns();

  for (const pr of payRuns) {
    try {
      const payDate = parseXeroDate(pr.PaymentDate) || parseXeroDate(pr.PayRunPeriodEndDate);
      const periodStart = parseXeroDate(pr.PayRunPeriodStartDate);
      const periodEnd = parseXeroDate(pr.PayRunPeriodEndDate);

      const workPeriodDate = periodEnd || payDate;
      const workPeriodObj = workPeriodDate ? new Date(workPeriodDate) : new Date();
      const year = workPeriodObj.getFullYear();
      const month = workPeriodObj.getMonth() + 1;

      let xeroStatus = (pr.PayRunStatus || "").toUpperCase();
      let localStatus = "DRAFT";
      if (xeroStatus === "POSTED" || xeroStatus === "CLOSE") localStatus = "FILED";
      else if (xeroStatus === "DRAFT") localStatus = "DRAFT";

      const payRunRef = `XERO-${pr.PayRunID?.substring(0, 8) || year + "-" + month}`;
      const employeeCount = pr.Payslips?.length || 0;
      const calendarName = pr.PayrollCalendarID ? calendarNamesMap[pr.PayrollCalendarID] || null : null;

      const existing = existingPayRuns.find(
        epr => epr.payRunRef === payRunRef
      );

      if (existing) {
        const newGross = String(pr.Wages || 0);
        const newPayg = String(pr.Tax || 0);
        const newSuper = String(pr.Super || 0);
        const newNet = String(pr.NetPay || 0);
        const totalsChanged = existing.totalGross !== newGross ||
          existing.totalPayg !== newPayg ||
          existing.totalSuper !== newSuper ||
          existing.totalNet !== newNet;
        const statusChanged = existing.status !== localStatus;

        await storage.updatePayRun(existing.id, {
          status: localStatus,
          periodStart,
          periodEnd,
          paymentDate: payDate,
          totalGross: newGross,
          totalPayg: newPayg,
          totalSuper: newSuper,
          totalNet: newNet,
          employeeCount,
          calendarName,
          year,
          month,
        });

        if (pr.PayRunID) {
          const existingLines = await storage.getPayRunLines(existing.id);
          if (existingLines.length === 0 || totalsChanged || statusChanged) {
            console.log(`Fetching detail for ${totalsChanged ? 'changed' : statusChanged ? 'status-changed' : 'empty'} pay run ${payRunRef}`);
            await syncPayRunLines(pr.PayRunID, existing.id, accessToken, tenantId, errors, periodStart);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        updated++;
      } else {
        const newPayRun = await storage.createPayRun({
          payRunRef,
          year,
          month,
          payDate,
          periodStart,
          periodEnd,
          paymentDate: payDate,
          superRate: "0.1150",
          totalGross: String(pr.Wages || 0),
          totalPayg: String(pr.Tax || 0),
          totalSuper: String(pr.Super || 0),
          totalNet: String(pr.NetPay || 0),
          employeeCount,
          calendarName,
          status: localStatus,
        });

        if (pr.PayRunID) {
          console.log(`Fetching detail for new pay run ${payRunRef}`);
          await syncPayRunLines(pr.PayRunID, newPayRun.id, accessToken, tenantId, errors, periodStart);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        created++;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err: any) {
      errors.push(`Error syncing pay run ${pr.PayRunID}: ${err.message}`);
    }
  }

  await saveSetting(await tenantSyncKey("xero.lastPayRunSyncAt"), new Date().toISOString());

  return { total: payRuns.length, created, updated, errors };
}

export async function syncTimesheets(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let allTimesheets: any[] = [];
  let tsPage = 1;
  let tsHasMore = true;

  while (tsHasMore) {
    const response = await xeroFetch(`https://api.xero.com/payroll.xro/1.0/Timesheets?page=${tsPage}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch timesheets from Xero (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as { Timesheets?: any[] };
    const batch = data.Timesheets || [];
    allTimesheets = allTimesheets.concat(batch);
    tsHasMore = batch.length === 100;
    tsPage++;
  }

  const xeroTimesheets = allTimesheets;

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const ts of xeroTimesheets) {
    try {
      const employee = ts.EmployeeID
        ? await storage.getEmployeeByXeroId(ts.EmployeeID)
        : null;
      if (!employee) {
        errors.push(`Skipped timesheet — employee ${ts.EmployeeID} not found locally`);
        continue;
      }

      const startDate = parseXeroDate(ts.StartDate);
      const endDate = parseXeroDate(ts.EndDate);
      const startDateObj = startDate ? new Date(startDate) : new Date();
      const year = startDateObj.getFullYear();
      const month = startDateObj.getMonth() + 1;

      let totalHours = 0;
      if (ts.TimesheetLines && Array.isArray(ts.TimesheetLines)) {
        for (const line of ts.TimesheetLines) {
          if (line.NumberOfUnits && Array.isArray(line.NumberOfUnits)) {
            totalHours += line.NumberOfUnits.reduce((s: number, u: any) => s + (Number(u.NumberOfUnits) || 0), 0);
          }
        }
      }

      let xeroStatus = (ts.Status || "").toUpperCase();
      let localStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" = "DRAFT";
      if (xeroStatus === "APPROVED") localStatus = "APPROVED";
      else if (xeroStatus === "SUBMITTED" || xeroStatus === "PENDING") localStatus = "SUBMITTED";
      else if (xeroStatus === "REJECTED") localStatus = "REJECTED";

      const rate = employee.hourlyRate ? parseFloat(employee.hourlyRate) : 0;
      const grossValue = totalHours * rate;

      const existingTimesheets = await storage.getTimesheetsByEmployee(employee.id);
      const existing = existingTimesheets.find(
        et => et.year === year && et.month === month
      );

      if (existing) {
        await storage.updateTimesheet(existing.id, {
          totalHours: String(totalHours.toFixed(2)),
          grossValue: String(grossValue.toFixed(2)),
          status: localStatus,
        });
        updated++;
      } else {
        await storage.createTimesheet({
          employeeId: employee.id,
          year,
          month,
          totalHours: String(totalHours.toFixed(2)),
          regularHours: String(totalHours.toFixed(2)),
          overtimeHours: "0.00",
          grossValue: String(grossValue.toFixed(2)),
          status: localStatus,
        });
        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing timesheet ${ts.TimesheetID}: ${err.message}`);
    }
  }

  await saveSetting(await tenantSyncKey("xero.lastTimesheetSyncAt"), new Date().toISOString());

  return { total: xeroTimesheets.length, created, updated, errors };
}

export async function syncPayrollSettings(): Promise<{
  calendars: any[];
  earningsRates: any[];
  leaveTypes: any[];
  payItemsSynced: number;
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let calendars: any[] = [];
  let earningsRates: any[] = [];
  let leaveTypes: any[] = [];
  let payItemsSynced = 0;

  try {
    const calResponse = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });
    if (calResponse.ok) {
      const calData = await calResponse.json() as { PayrollCalendars?: any[] };
      calendars = (calData.PayrollCalendars || []).map(c => ({
        id: c.PayrollCalendarID,
        name: c.Name,
        type: c.CalendarType,
        startDate: parseXeroDate(c.StartDate),
        paymentDate: parseXeroDate(c.PaymentDate),
      }));
    }
  } catch {}

  try {
    const piResponse = await xeroFetch("https://api.xero.com/payroll.xro/1.0/PayItems", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });
    if (piResponse.ok) {
      const piData = await piResponse.json() as { PayItems?: any };
      const payItems = piData.PayItems || {};

      if (payItems.EarningsRates) {
        earningsRates = payItems.EarningsRates.map((er: any) => ({
          id: er.EarningsRateID,
          name: er.Name,
          type: er.EarningsType,
          rateType: er.RateType,
          rate: er.RatePerUnit,
          multiplier: er.Multiplier,
          isActive: er.IsActive !== false,
        }));

        for (const er of payItems.EarningsRates) {
          try {
            const code = (er.Name || "").substring(0, 10).toUpperCase().replace(/\s+/g, "_") || `XER_${payItemsSynced}`;
            const existingItems = await storage.getPayItems();
            const exists = existingItems.find(pi => pi.code === code);
            if (!exists) {
              await storage.createPayItem({
                code,
                name: er.Name || "Unknown",
                description: `Synced from Xero: ${er.EarningsType || ""}`,
                itemType: "EARNINGS",
                rate: er.RatePerUnit ? String(er.RatePerUnit) : undefined,
                multiplier: er.Multiplier ? String(er.Multiplier) : "1.00",
                isTaxable: true,
                isSuperable: er.EarningsType !== "ALLOWANCE",
                isDefault: false,
                isActive: er.IsActive !== false,
              });
              payItemsSynced++;
            }
          } catch {}
        }
      }

      if (payItems.LeaveTypes) {
        leaveTypes = payItems.LeaveTypes.map((lt: any) => ({
          id: lt.LeaveTypeID,
          name: lt.Name,
          isPaidLeave: lt.IsPaidLeave,
          showOnPayslip: lt.ShowOnPayslip,
        }));
      }
    }
  } catch {}

  await saveSetting(await tenantSyncKey("xero.lastSettingsSyncAt"), new Date().toISOString());

  return { calendars, earningsRates, leaveTypes, payItemsSynced };
}

export async function syncInvoices(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let page = 1;
  let allInvoices: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const response = await xeroFetch(`https://api.xero.com/api.xro/2.0/Invoices?Statuses=AUTHORISED,PAID,SUBMITTED,DRAFT,VOIDED&page=${page}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch invoices from Xero (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as { Invoices?: any[] };
    const invoices = data.Invoices || [];
    allInvoices = allInvoices.concat(invoices);
    hasMore = invoices.length === 100;
    page++;
  }

  const xeroInvoices = allInvoices;

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  const allEmployees = await storage.getEmployees();
  const employeeByEmail = new Map(allEmployees.map(c => [c.email.toLowerCase(), c]));
  const employeeByCompany = new Map(
    allEmployees.filter(c => c.companyName).map(c => [c.companyName!.toLowerCase(), c])
  );

  const allClients = await storage.getClients();
  const clientByXeroContactId = new Map(
    allClients.filter(c => c.xeroContactId).map(c => [c.xeroContactId!, c])
  );
  const clientByName = new Map(
    allClients.map(c => [c.name.toLowerCase().trim(), c])
  );

  const allPlacements = await storage.getAllPlacements();
  const placementsByClientId = new Map<string, typeof allPlacements>();
  for (const p of allPlacements) {
    if (!p.clientId) continue;
    const existing = placementsByClientId.get(p.clientId) || [];
    existing.push(p);
    placementsByClientId.set(p.clientId, existing);
  }

  for (const inv of xeroInvoices) {
    try {
      if (inv.Type !== "ACCPAY" && inv.Type !== "ACCREC") continue;

      const contactEmail = inv.Contact?.EmailAddress?.toLowerCase();
      const contactName = inv.Contact?.Name || "";
      const xeroContactId = inv.Contact?.ContactID || null;

      let client = xeroContactId
        ? clientByXeroContactId.get(xeroContactId)
        : undefined;
      if (!client && contactName) {
        client = clientByName.get(contactName.toLowerCase().trim());
      }
      const clientId = client?.id || null;

      let employee = contactEmail ? employeeByEmail.get(contactEmail) : undefined;

      if (!employee && contactName) {
        employee = employeeByCompany.get(contactName.toLowerCase());
      }

      if (!employee && contactName) {
        const nameParts = contactName.split(" ");
        if (nameParts.length >= 2) {
          employee = allEmployees.find(
            c => c.firstName.toLowerCase() === nameParts[0].toLowerCase() &&
                 c.lastName.toLowerCase() === nameParts[nameParts.length - 1].toLowerCase()
          );
        }
      }

      if (!employee && clientId) {
        const clientPlacements = placementsByClientId.get(clientId) || [];
        const activePlacements = clientPlacements.filter(p => p.status === "ACTIVE");
        if (activePlacements.length === 1) {
          employee = allEmployees.find(e => e.id === activePlacements[0].employeeId);
        }
      }

      const invoiceDate = parseXeroDate(inv.Date) || new Date().toISOString().split("T")[0];
      const dueDate = parseXeroDate(inv.DueDate);
      const invoiceDateObj = new Date(invoiceDate);
      const isAccRec = inv.Type === "ACCREC";
      const workPeriodDateObj = isAccRec
        ? new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth() - 1, 1)
        : invoiceDateObj;
      const year = workPeriodDateObj.getFullYear();
      const month = workPeriodDateObj.getMonth() + 1;

      const amountExclGst = inv.SubTotal || inv.Total || 0;
      const gstAmount = inv.TotalTax || 0;
      const amountInclGst = inv.Total || amountExclGst;

      let localStatus: "DRAFT" | "AUTHORISED" | "SENT" | "PAID" | "VOIDED" | "OVERDUE" = "DRAFT";
      const xeroStatus = (inv.Status || "").toUpperCase();
      if (xeroStatus === "PAID") localStatus = "PAID";
      else if (xeroStatus === "AUTHORISED") localStatus = "AUTHORISED";
      else if (xeroStatus === "SUBMITTED") localStatus = "SENT";
      else if (xeroStatus === "VOIDED") localStatus = "VOIDED";
      else if (xeroStatus === "DRAFT") localStatus = "DRAFT";

      if (localStatus === "AUTHORISED" && dueDate && new Date(dueDate) < new Date()) {
        localStatus = "OVERDUE";
      }

      const invNumber = inv.InvoiceNumber || null;
      const xeroInvoiceId = inv.InvoiceID || null;
      let existing = invNumber ? await storage.getInvoiceByNumber(invNumber) : undefined;
      if (!existing && xeroInvoiceId) {
        existing = await storage.getInvoiceByXeroId(xeroInvoiceId);
      }

      let totalHours: string | undefined;
      let hourlyRateVal: string | undefined;
      let descriptionVal: string | undefined;
      if (inv.LineItems && inv.LineItems.length > 0) {
        const firstLine = inv.LineItems[0];
        if (firstLine.Quantity) totalHours = String(firstLine.Quantity);
        if (firstLine.UnitAmount) hourlyRateVal = String(firstLine.UnitAmount);
        if (firstLine.Description) descriptionVal = firstLine.Description;
      }

      const invoiceTypeVal = inv.Type === "ACCPAY" ? "ACCPAY" : inv.Type === "ACCREC" ? "ACCREC" : null;
      const referenceVal = inv.Reference || null;

      let invoiceId: string;

      if (existing) {
        await storage.updateInvoice(existing.id, {
          contactName: contactName || existing.contactName,
          employeeId: employee?.id || existing.employeeId,
          xeroInvoiceId: xeroInvoiceId || existing.xeroInvoiceId,
          xeroContactId: xeroContactId || existing.xeroContactId,
          clientId: clientId || existing.clientId,
          status: localStatus,
          amountExclGst: String(amountExclGst),
          gstAmount: String(gstAmount),
          amountInclGst: String(amountInclGst),
          issueDate: invoiceDate,
          dueDate: dueDate || existing.dueDate,
          paidDate: localStatus === "PAID" ? (parseXeroDate(inv.FullyPaidOnDate) || existing.paidDate) : existing.paidDate,
          hours: totalHours || existing.hours,
          hourlyRate: hourlyRateVal || existing.hourlyRate,
          description: descriptionVal || inv.Reference || existing.description,
          invoiceType: invoiceTypeVal || existing.invoiceType,
          reference: referenceVal || existing.reference,
          year,
          month,
        });
        invoiceId = existing.id;
        updated++;
      } else {
        const newInvoice = await storage.createInvoice({
          employeeId: employee?.id || null,
          contactName: contactName || null,
          xeroInvoiceId: xeroInvoiceId,
          xeroContactId: xeroContactId,
          clientId: clientId,
          year,
          month,
          invoiceNumber: invNumber,
          amountExclGst: String(amountExclGst),
          gstAmount: String(gstAmount),
          amountInclGst: String(amountInclGst),
          hours: totalHours,
          hourlyRate: hourlyRateVal,
          description: descriptionVal || inv.Reference || `${contactName} - ${inv.InvoiceNumber || "Invoice"}`,
          issueDate: invoiceDate,
          dueDate,
          paidDate: localStatus === "PAID" ? parseXeroDate(inv.FullyPaidOnDate) : null,
          status: localStatus,
          invoiceType: invoiceTypeVal,
          reference: referenceVal,
        });
        invoiceId = newInvoice.id;
        created++;
      }

      if (inv.LineItems && inv.LineItems.length > 0) {
        const lineItems = inv.LineItems.map((li: any) => ({
          invoiceId,
          lineItemId: li.LineItemID || null,
          description: li.Description || null,
          quantity: li.Quantity != null ? String(li.Quantity) : null,
          unitAmount: li.UnitAmount != null ? String(li.UnitAmount) : null,
          lineAmount: li.LineAmount != null ? String(li.LineAmount) : null,
          accountCode: li.AccountCode || null,
          taxType: li.TaxType || null,
          taxAmount: li.TaxAmount != null ? String(li.TaxAmount) : null,
          tracking: li.Tracking && li.Tracking.length > 0 ? li.Tracking : null,
        }));
        await storage.setInvoiceLineItems(invoiceId, lineItems);
      }

      if (inv.Payments && inv.Payments.length > 0) {
        const payments = inv.Payments.map((p: any) => ({
          invoiceId,
          xeroPaymentId: p.PaymentID || null,
          paymentDate: parseXeroDate(p.Date) || null,
          amount: String(p.Amount || 0),
          currencyCode: p.CurrencyRate ? inv.CurrencyCode : null,
          bankAccountId: p.Account?.AccountID || null,
          bankAccountName: p.Account?.Name || null,
          reference: p.Reference || null,
          status: p.Status || null,
        }));
        await storage.setInvoicePayments(invoiceId, payments);
      }
    } catch (err: any) {
      errors.push(`Error syncing invoice ${inv.InvoiceNumber || inv.InvoiceID}: ${err.message}`);
    }
  }

  await saveSetting(await tenantSyncKey("xero.lastInvoiceSyncAt"), new Date().toISOString());

  return { total: xeroInvoices.length, created, updated, errors };
}

export async function syncContacts(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let page = 1;
  let allContacts: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const response = await xeroFetch(`https://api.xero.com/api.xro/2.0/Contacts?page=${page}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch contacts from Xero (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as { Contacts?: any[] };
    const contacts = data.Contacts || [];
    allContacts = allContacts.concat(contacts);
    hasMore = contacts.length === 100;
    page++;
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const contact of allContacts) {
    try {
      const xeroContactId = contact.ContactID;
      if (!xeroContactId) continue;

      const name = contact.Name || "";
      const email = contact.EmailAddress || null;
      const phone = contact.Phones?.find((p: any) => p.PhoneType === "DEFAULT")?.PhoneNumber || null;
      const isCustomer = contact.IsCustomer === true;
      const isSupplier = contact.IsSupplier === true;

      let addressLine1: string | null = null;
      let city: string | null = null;
      let region: string | null = null;
      let postalCode: string | null = null;
      let country: string | null = null;
      const addr = contact.Addresses?.find((a: any) => a.AddressType === "STREET") ||
                   contact.Addresses?.find((a: any) => a.AddressType === "POBOX");
      if (addr) {
        addressLine1 = addr.AddressLine1 || null;
        city = addr.City || null;
        region = addr.Region || null;
        postalCode = addr.PostalCode || null;
        country = addr.Country || null;
      }

      const existing = await storage.getClientByXeroId(xeroContactId);

      if (existing) {
        await storage.updateClient(existing.id, {
          name,
          email,
          phone,
          isCustomer,
          isSupplier,
          addressLine1,
          city,
          region,
          postalCode,
          country,
        });
        updated++;
      } else {
        await storage.createClient({
          name,
          xeroContactId,
          email,
          phone,
          isCustomer,
          isSupplier,
          addressLine1,
          city,
          region,
          postalCode,
          country,
        });
        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing contact ${contact.Name || contact.ContactID}: ${err.message}`);
    }
  }

  await saveSetting(await tenantSyncKey("xero.lastContactSyncAt"), new Date().toISOString());

  return { total: allContacts.length, created, updated, errors };
}

export async function syncBankTransactions(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  let page = 1;
  let allTxns: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const response = await xeroFetch(`https://api.xero.com/api.xro/2.0/BankTransactions?page=${page}&where=Status!%3D%22DELETED%22`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Accept": "application/json",
      },
    });

    if (response.status === 403) {
      throw new Error("Bank Transactions scope not authorized. Please disconnect Xero in Settings and reconnect — the new authorization will include the required 'accounting.banktransactions.read' scope. You may also need to enable this scope in your Xero Developer Portal app configuration.");
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch bank transactions from Xero (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as { BankTransactions?: any[] };
    const txns = data.BankTransactions || [];
    allTxns = allTxns.concat(txns);
    hasMore = txns.length === 100;
    page++;
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const txn of allTxns) {
    try {
      const xeroId = txn.BankTransactionID;
      if (!xeroId) continue;

      const txnDate = parseXeroDate(txn.Date) || new Date().toISOString().split("T")[0];
      const dateObj = new Date(txnDate);
      const month = dateObj.getMonth() + 1;
      const year = dateObj.getFullYear();

      const type = txn.Type === "RECEIVE" ? "RECEIVE" as const : "SPEND" as const;
      const amount = Math.abs(txn.Total || 0);

      const txnData = {
        xeroBankTransactionId: xeroId,
        bankAccountId: txn.BankAccount?.AccountID || null,
        bankAccountName: txn.BankAccount?.Name || null,
        contactName: txn.Contact?.Name || null,
        xeroContactId: txn.Contact?.ContactID || null,
        date: txnDate,
        amount: String(amount),
        type,
        reference: txn.Reference || null,
        description: txn.LineItems?.[0]?.Description || null,
        status: txn.Status || null,
        isReconciled: txn.IsReconciled === true,
        month,
        year,
      };

      const existing = await storage.getBankTransactionByXeroId(xeroId);

      if (existing) {
        await storage.updateBankTransaction(existing.id, txnData);
        updated++;
      } else {
        await storage.createBankTransaction(txnData);
        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing bank txn ${txn.BankTransactionID}: ${err.message}`);
    }
  }

  await saveSetting(await tenantSyncKey("xero.lastBankTxnSyncAt"), new Date().toISOString());

  return { total: allTxns.length, created, updated, errors };
}

export async function pushInvoiceToXero(invoiceId: string): Promise<{ xeroInvoiceId: string; invoiceNumber: string }> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  const invoice = await storage.getInvoice(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "DRAFT") throw new Error("Only DRAFT invoices can be pushed to Xero");
  if (invoice.xeroInvoiceId) throw new Error("Invoice is already linked to Xero");

  let contactId = (invoice as any).xeroContactId;
  if (!contactId && (invoice as any).clientId) {
    const client = await storage.getClient((invoice as any).clientId);
    if (client) contactId = (client as any).xeroContactId;
  }
  if (!contactId) throw new Error("No Xero contact linked. Please assign a client with a Xero contact ID first.");

  const lineDescription = invoice.description || `${MONTHS_SHORT[invoice.month]} ${invoice.year} services`;
  const amountExcl = parseFloat(invoice.amountExclGst);
  const hours = invoice.hours ? parseFloat(invoice.hours) : 0;
  const rate = invoice.hourlyRate ? parseFloat(invoice.hourlyRate) : 0;

  let quantity: number;
  let unitAmount: number;
  if (hours > 0 && rate > 0) {
    quantity = hours;
    unitAmount = rate;
  } else if (hours > 0 && amountExcl > 0) {
    quantity = hours;
    unitAmount = Math.round((amountExcl / hours) * 100) / 100;
  } else {
    quantity = 1;
    unitAmount = amountExcl;
  }

  const xeroInvoice: Record<string, any> = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Status: "DRAFT",
    LineAmountTypes: "Exclusive",
    LineItems: [
      {
        Description: lineDescription,
        Quantity: quantity,
        UnitAmount: unitAmount,
        AccountCode: "200",
        TaxType: "OUTPUT",
      },
    ],
  };

  if (invoice.issueDate) xeroInvoice.Date = invoice.issueDate;
  if (invoice.dueDate) xeroInvoice.DueDate = invoice.dueDate;
  if ((invoice as any).reference) xeroInvoice.Reference = (invoice as any).reference;
  if (invoice.invoiceNumber) xeroInvoice.InvoiceNumber = invoice.invoiceNumber;

  const response = await xeroFetch("https://api.xero.com/api.xro/2.0/Invoices", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ Invoices: [xeroInvoice] }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Xero API error (${response.status}): ${errorBody}`);
  }

  const result = await response.json() as any;
  const created = result.Invoices?.[0];
  if (!created) throw new Error("Xero did not return a created invoice");

  const xeroInvoiceId = created.InvoiceID;
  const xeroInvoiceNumber = created.InvoiceNumber || invoice.invoiceNumber;

  await storage.updateInvoice(invoiceId, {
    xeroInvoiceId,
    invoiceNumber: xeroInvoiceNumber,
    xeroContactId: contactId,
    invoiceType: "ACCREC",
  });

  return { xeroInvoiceId, invoiceNumber: xeroInvoiceNumber };
}

const MONTHS_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
