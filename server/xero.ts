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
    if (tenants.length > 0) {
      await saveSetting("xero.tenantId", tenants[0].tenantId);
      await saveSetting("xero.tenantName", tenants[0].tenantName || "");
    }
  }

  await saveSetting("xero.connected", "true");
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

  return {
    total: employees.length,
    created,
    updated,
    errors,
  };
}
