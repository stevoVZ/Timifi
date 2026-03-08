import { XeroClient } from "xero-node";
import { storage } from "./storage";
import crypto from "crypto";

let xeroClient: XeroClient | null = null;
let oauthState: string | null = null;

async function getSettingValue(key: string): Promise<string> {
  const s = await storage.getSetting(key);
  return s?.value || "";
}

async function saveSetting(key: string, value: string): Promise<void> {
  await storage.upsertSetting(key, value);
}

export async function getXeroClient(): Promise<XeroClient> {
  const clientId = await getSettingValue("xero.clientId");
  const clientSecret = await getSettingValue("xero.clientSecret");

  if (!clientId || !clientSecret) {
    throw new Error("Xero Client ID and Client Secret are required. Configure them in Settings.");
  }

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : "http://localhost:5000";

  const redirectUri = `${baseUrl}/api/xero/callback`;

  xeroClient = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: [
      "openid",
      "profile",
      "email",
      "payroll.employees",
      "payroll.employees.read",
      "payroll.payruns",
      "payroll.payruns.read",
      "payroll.payslip",
      "payroll.payslip.read",
      "payroll.timesheets",
      "payroll.timesheets.read",
      "payroll.settings",
      "payroll.settings.read",
      "offline_access",
    ],
  });

  return xeroClient;
}

export async function getConsentUrl(): Promise<string> {
  const client = await getXeroClient();
  oauthState = crypto.randomBytes(32).toString("hex");
  const url = await client.buildConsentUrl();
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}state=${oauthState}`;
}

export async function handleCallback(callbackUrl: string): Promise<void> {
  const urlObj = new URL(callbackUrl);
  const returnedState = urlObj.searchParams.get("state");
  if (!oauthState || returnedState !== oauthState) {
    oauthState = null;
    throw new Error("OAuth state mismatch. Please try connecting again.");
  }
  oauthState = null;

  const client = await getXeroClient();
  const tokenSet = await client.apiCallback(callbackUrl);
  await client.updateTenants();

  if (tokenSet.access_token) {
    await saveSetting("xero.accessToken", tokenSet.access_token);
  }
  if (tokenSet.refresh_token) {
    await saveSetting("xero.refreshToken", tokenSet.refresh_token);
  }
  if (tokenSet.expires_at) {
    await saveSetting("xero.tokenExpiry", String(tokenSet.expires_at));
  }

  if (client.tenants && client.tenants.length > 0) {
    const tenant = client.tenants[0];
    await saveSetting("xero.tenantId", tenant.tenantId);
    await saveSetting("xero.tenantName", tenant.tenantName || "");
  }

  await saveSetting("xero.connected", "true");
}

export async function refreshTokenIfNeeded(): Promise<XeroClient> {
  const client = await getXeroClient();

  const accessToken = await getSettingValue("xero.accessToken");
  const refreshToken = await getSettingValue("xero.refreshToken");
  const tokenExpiry = await getSettingValue("xero.tokenExpiry");

  if (!accessToken || !refreshToken) {
    throw new Error("Xero is not connected. Please connect via Settings.");
  }

  const clientId = await getSettingValue("xero.clientId");
  const clientSecret = await getSettingValue("xero.clientSecret");

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parseInt(tokenExpiry, 10) || 0;

  if (now >= expiresAt - 60) {
    const newTokenSet = await client.refreshWithRefreshToken(
      clientId,
      clientSecret,
      refreshToken
    );

    if (newTokenSet.access_token) {
      await saveSetting("xero.accessToken", newTokenSet.access_token);
    }
    if (newTokenSet.refresh_token) {
      await saveSetting("xero.refreshToken", newTokenSet.refresh_token);
    }
    if (newTokenSet.expires_at) {
      await saveSetting("xero.tokenExpiry", String(newTokenSet.expires_at));
    }
  } else {
    client.setTokenSet({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      token_type: "Bearer",
    });
  }

  const tenantId = await getSettingValue("xero.tenantId");
  if (tenantId && (!client.tenants || client.tenants.length === 0)) {
    (client as any).tenants = [{ tenantId, tenantName: await getSettingValue("xero.tenantName") }];
  }

  return client;
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
  const keys = [
    "xero.accessToken",
    "xero.refreshToken",
    "xero.tokenExpiry",
    "xero.tenantId",
    "xero.tenantName",
    "xero.connected",
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
  const client = await refreshTokenIfNeeded();
  const tenantId = await getSettingValue("xero.tenantId");

  if (!tenantId) {
    throw new Error("Xero Tenant ID not found. Please reconnect to Xero.");
  }

  const response = await client.payrollAUApi.getEmployees(tenantId);
  const employees = (response.body as any)?.employees || [];

  let calendarsMap: Record<string, string> = {};
  try {
    const calResponse = await client.payrollAUApi.getPayrollCalendars(tenantId);
    const calendars = (calResponse.body as any)?.payrollCalendars || [];
    for (const cal of calendars) {
      if (cal.payrollCalendarID && cal.calendarType) {
        calendarsMap[cal.payrollCalendarID] = cal.calendarType;
      }
    }
  } catch {}

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const emp of employees) {
    try {
      const email = emp.email;
      const xeroId = emp.employeeID;

      if (!email && !xeroId) {
        errors.push(`Skipped employee without email or ID: ${emp.firstName} ${emp.lastName}`);
        continue;
      }

      const hourlyRate = emp.payTemplate?.earningsLines?.[0]?.ratePerUnit;
      const calendarType = emp.payrollCalendarID
        ? calendarsMap[emp.payrollCalendarID]
        : undefined;

      const address = emp.homeAddress;

      const contractorData: Record<string, any> = {
        firstName: emp.firstName || "Unknown",
        lastName: emp.lastName || "Unknown",
        email: email || `${xeroId}@xero-sync.local`,
        phone: emp.phone || emp.mobile || null,
        jobTitle: emp.jobTitle || emp.title || null,
        status: mapXeroStatus(emp.status),
        startDate: parseXeroDate(emp.startDate),
        endDate: parseXeroDate(emp.terminationDate),
        dateOfBirth: parseXeroDate(emp.dateOfBirth),
        gender: emp.gender || null,
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
        if (address.addressLine1) contractorData.addressLine1 = address.addressLine1;
        if (address.city) contractorData.suburb = address.city;
        if (address.region) contractorData.state = address.region.substring(0, 3).toUpperCase();
        if (address.postalCode) contractorData.postcode = address.postalCode;
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
      errors.push(`Error syncing ${emp.firstName} ${emp.lastName}: ${err.message}`);
    }
  }

  await saveSetting("xero.lastSyncAt", new Date().toISOString());

  return {
    total: employees.length,
    created,
    updated,
    errors,
  };
}
