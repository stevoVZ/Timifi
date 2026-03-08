import { XeroClient } from "xero-node";
import { storage } from "./storage";
import crypto from "crypto";

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
    "accounting.transactions",
    "accounting.transactions.read",
    "accounting.contacts.read",
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

  const tenantsResponse = await fetch("https://api.xero.com/connections", {
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

export async function isConnected(): Promise<{
  connected: boolean;
  tenantName: string;
  lastSyncAt: string;
}> {
  const connected = (await getSettingValue("xero.connected")) === "true";
  const tenantName = await getSettingValue("xero.tenantName");
  const lastSyncAt = await getSettingValue("xero.lastSyncAt");
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

  const empResponse = await fetch("https://api.xero.com/payroll.xro/1.0/Employees", {
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
  const employees = empData.Employees || [];

  let calendarsMap: Record<string, string> = {};
  try {
    const calResponse = await fetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
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

      const contractorData: Record<string, any> = {
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
        contractorData.hourlyRate = String(hourlyRate);
      }

      if (calendarType) {
        contractorData.payFrequency = mapPayFrequency(calendarType);
      }

      if (address) {
        if (address.AddressLine1) contractorData.addressLine1 = address.AddressLine1;
        if (address.City) contractorData.suburb = address.City;
        if (address.Region) contractorData.state = address.Region.substring(0, 3).toUpperCase();
        if (address.PostalCode) contractorData.postcode = address.PostalCode;
      }

      let existing = xeroId
        ? await storage.getContractorByXeroId(xeroId)
        : null;

      if (!existing && email) {
        existing = await storage.getContractorByEmail(email);
      }

      if (existing) {
        await storage.updateContractor(existing.id, contractorData);
        updated++;
      } else {
        await storage.createContractor(contractorData as any);
        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing ${emp.FirstName} ${emp.LastName}: ${err.message}`);
    }
  }

  await saveSetting("xero.lastSyncAt", new Date().toISOString());
  await saveSetting("xero.lastEmployeeSyncAt", new Date().toISOString());

  return {
    total: employees.length,
    created,
    updated,
    errors,
  };
}

export async function syncPayRuns(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  const response = await fetch("https://api.xero.com/payroll.xro/1.0/PayRuns", {
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
  const payRuns = data.PayRuns || [];

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const pr of payRuns) {
    try {
      const payDate = parseXeroDate(pr.PaymentDate) || parseXeroDate(pr.PayRunPeriodEndDate);
      const periodStart = parseXeroDate(pr.PayRunPeriodStartDate);
      const periodEnd = parseXeroDate(pr.PayRunPeriodEndDate);

      const payDateObj = payDate ? new Date(payDate) : new Date();
      const year = payDateObj.getFullYear();
      const month = payDateObj.getMonth() + 1;

      let xeroStatus = (pr.PayRunStatus || "").toUpperCase();
      let localStatus = "DRAFT";
      if (xeroStatus === "POSTED" || xeroStatus === "CLOSE") localStatus = "FILED";
      else if (xeroStatus === "DRAFT") localStatus = "DRAFT";

      const payRunRef = `XERO-${pr.PayRunID?.substring(0, 8) || year + "-" + month}`;

      const existingPayRuns = await storage.getPayRuns();
      const existing = existingPayRuns.find(
        epr => epr.payRunRef === payRunRef
      );

      if (existing) {
        await storage.updatePayRun(existing.id, {
          status: localStatus,
          totalGross: String(pr.Wages || 0),
          totalPayg: String(pr.Tax || 0),
          totalSuper: String(pr.Super || 0),
          totalNet: String(pr.NetPay || 0),
          employeeCount: pr.PayslipsSummary?.length || 0,
        });
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
          employeeCount: pr.PayslipsSummary?.length || 0,
          status: localStatus,
        });

        if (pr.Payslips && Array.isArray(pr.Payslips)) {
          for (const slip of pr.Payslips) {
            try {
              const contractor = slip.EmployeeID
                ? await storage.getContractorByXeroId(slip.EmployeeID)
                : null;
              if (!contractor) continue;

              await storage.createPayRunLine({
                payRunId: newPayRun.id,
                contractorId: contractor.id,
                hoursWorked: String(slip.NumberOfUnits || 0),
                ratePerHour: String(slip.RatePerUnit || 0),
                grossEarnings: String(slip.Wages || 0),
                paygWithheld: String(slip.Tax || 0),
                superAmount: String(slip.Super || 0),
                netPay: String(slip.NetPay || 0),
                status: "INCLUDED",
              });
            } catch (lineErr: any) {
              errors.push(`Error syncing payslip for employee ${slip.EmployeeID}: ${lineErr.message}`);
            }
          }
        }

        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing pay run ${pr.PayRunID}: ${err.message}`);
    }
  }

  await saveSetting("xero.lastPayRunSyncAt", new Date().toISOString());

  return { total: payRuns.length, created, updated, errors };
}

export async function syncTimesheets(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  const response = await fetch("https://api.xero.com/payroll.xro/1.0/Timesheets", {
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
  const xeroTimesheets = data.Timesheets || [];

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const ts of xeroTimesheets) {
    try {
      const contractor = ts.EmployeeID
        ? await storage.getContractorByXeroId(ts.EmployeeID)
        : null;
      if (!contractor) {
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

      const rate = contractor.hourlyRate ? parseFloat(contractor.hourlyRate) : 0;
      const grossValue = totalHours * rate;

      const existingTimesheets = await storage.getTimesheetsByContractor(contractor.id);
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
          contractorId: contractor.id,
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

  await saveSetting("xero.lastTimesheetSyncAt", new Date().toISOString());

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
    const calResponse = await fetch("https://api.xero.com/payroll.xro/1.0/PayrollCalendars", {
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
    const piResponse = await fetch("https://api.xero.com/payroll.xro/1.0/PayItems", {
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

  await saveSetting("xero.lastSettingsSyncAt", new Date().toISOString());

  return { calendars, earningsRates, leaveTypes, payItemsSynced };
}

export async function syncInvoices(): Promise<{
  total: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const { accessToken, tenantId } = await refreshTokenIfNeeded();

  const response = await fetch("https://api.xero.com/api.xro/2.0/Invoices?Statuses=AUTHORISED,PAID,SUBMITTED,DRAFT,VOIDED&page=1", {
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
  const xeroInvoices = data.Invoices || [];

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  const allContractors = await storage.getContractors();
  const contractorByEmail = new Map(allContractors.map(c => [c.email.toLowerCase(), c]));

  for (const inv of xeroInvoices) {
    try {
      if (inv.Type !== "ACCPAY" && inv.Type !== "ACCREC") continue;

      const contactEmail = inv.Contact?.EmailAddress?.toLowerCase();
      const contactName = inv.Contact?.Name || "";
      let contractor = contactEmail ? contractorByEmail.get(contactEmail) : undefined;

      if (!contractor) {
        const nameParts = contactName.split(" ");
        if (nameParts.length >= 2) {
          contractor = allContractors.find(
            c => c.firstName.toLowerCase() === nameParts[0].toLowerCase() &&
                 c.lastName.toLowerCase() === nameParts[nameParts.length - 1].toLowerCase()
          );
        }
      }

      if (!contractor) {
        errors.push(`Skipped invoice ${inv.InvoiceNumber || inv.InvoiceID} — no matching contractor for contact "${contactName}"`);
        continue;
      }

      const invoiceDate = parseXeroDate(inv.Date) || new Date().toISOString().split("T")[0];
      const dueDate = parseXeroDate(inv.DueDate);
      const invoiceDateObj = new Date(invoiceDate);
      const year = invoiceDateObj.getFullYear();
      const month = invoiceDateObj.getMonth() + 1;

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

      const existingInvoices = await storage.getInvoicesByContractor(contractor.id);
      const existing = existingInvoices.find(
        ei => ei.invoiceNumber === inv.InvoiceNumber
      );

      if (existing) {
        await storage.updateInvoice(existing.id, {
          status: localStatus,
          amountExclGst: String(amountExclGst),
          gstAmount: String(gstAmount),
          amountInclGst: String(amountInclGst),
        });
        updated++;
      } else {
        let totalHours: string | undefined;
        let hourlyRate: string | undefined;
        if (inv.LineItems && inv.LineItems.length > 0) {
          const firstLine = inv.LineItems[0];
          if (firstLine.Quantity) totalHours = String(firstLine.Quantity);
          if (firstLine.UnitAmount) hourlyRate = String(firstLine.UnitAmount);
        }

        await storage.createInvoice({
          contractorId: contractor.id,
          year,
          month,
          invoiceNumber: inv.InvoiceNumber || null,
          amountExclGst: String(amountExclGst),
          gstAmount: String(gstAmount),
          amountInclGst: String(amountInclGst),
          hours: totalHours,
          hourlyRate,
          description: inv.Reference || `${contactName} - ${inv.InvoiceNumber || "Invoice"}`,
          issueDate: invoiceDate,
          dueDate,
          paidDate: localStatus === "PAID" ? parseXeroDate(inv.FullyPaidOnDate) : null,
          status: localStatus,
        });
        created++;
      }
    } catch (err: any) {
      errors.push(`Error syncing invoice ${inv.InvoiceNumber || inv.InvoiceID}: ${err.message}`);
    }
  }

  await saveSetting("xero.lastInvoiceSyncAt", new Date().toISOString());

  return { total: xeroInvoices.length, created, updated, errors };
}
