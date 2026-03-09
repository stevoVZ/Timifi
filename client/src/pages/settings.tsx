import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TopBar } from "@/components/top-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Save, Palette, Building2, Banknote, RefreshCw, Globe, UserCog, Link2, Unlink, CheckCircle, XCircle, Clock, Loader2, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import type { Setting } from "@shared/schema";

function useSettings() {
  return useQuery<Setting[]>({ queryKey: ["/api/settings"] });
}

function useSettingValue(settings: Setting[] | undefined, key: string, defaultValue = "") {
  if (!settings) return defaultValue;
  const found = settings.find((s) => s.key === key);
  return found ? found.value : defaultValue;
}

function SettingsTabSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function BrandingTab({ settings }: { settings: Setting[] | undefined }) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [tagline, setTagline] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setCompanyName(useSettingValue(settings, "branding.companyName", "Recruitment Portal"));
      setTagline(useSettingValue(settings, "branding.tagline", "Labour Hire Management"));
      setPrimaryColor(useSettingValue(settings, "branding.primaryColor", "#2563eb"));
      setLogoUrl(useSettingValue(settings, "branding.logoUrl", ""));
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/branding.companyName", { value: companyName });
      await apiRequest("PUT", "/api/settings/branding.tagline", { value: tagline });
      await apiRequest("PUT", "/api/settings/branding.primaryColor", { value: primaryColor });
      await apiRequest("PUT", "/api/settings/branding.logoUrl", { value: logoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Branding settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="company-name" data-testid="label-company-name">Company Name</Label>
        <Input
          id="company-name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          data-testid="input-company-name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tagline" data-testid="label-tagline">Tagline</Label>
        <Input
          id="tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          data-testid="input-tagline"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="primary-color" data-testid="label-primary-color">Primary Color</Label>
        <div className="flex items-center gap-3">
          <Input
            id="primary-color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="flex-1"
            data-testid="input-primary-color"
          />
          <div
            className="w-9 h-9 rounded-md border flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
            data-testid="preview-primary-color"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="logo-url" data-testid="label-logo-url">Logo URL</Label>
        <Input
          id="logo-url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          data-testid="input-logo-url"
        />
      </div>
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-branding">
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? "Saving..." : "Save Branding"}
      </Button>
    </div>
  );
}

function CompanyTab({ settings }: { settings: Setting[] | undefined }) {
  const { toast } = useToast();
  const [abn, setAbn] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    if (settings) {
      setAbn(useSettingValue(settings, "company.abn", ""));
      setAddress(useSettingValue(settings, "company.address", ""));
      setPhone(useSettingValue(settings, "company.phone", ""));
      setEmail(useSettingValue(settings, "company.email", ""));
      setWebsite(useSettingValue(settings, "company.website", ""));
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/company.abn", { value: abn });
      await apiRequest("PUT", "/api/settings/company.address", { value: address });
      await apiRequest("PUT", "/api/settings/company.phone", { value: phone });
      await apiRequest("PUT", "/api/settings/company.email", { value: email });
      await apiRequest("PUT", "/api/settings/company.website", { value: website });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Company settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="abn" data-testid="label-abn">ABN</Label>
        <Input id="abn" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="00 000 000 000" data-testid="input-abn" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address" data-testid="label-address">Business Address</Label>
        <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} data-testid="input-address" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-phone" data-testid="label-company-phone">Phone</Label>
        <Input id="company-phone" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-company-phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-email" data-testid="label-company-email">Email</Label>
        <Input id="company-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-company-email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-website" data-testid="label-company-website">Website</Label>
        <Input id="company-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" data-testid="input-company-website" />
      </div>
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-company">
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? "Saving..." : "Save Company Details"}
      </Button>
    </div>
  );
}

function PayrollTab({ settings }: { settings: Setting[] | undefined }) {
  const { toast } = useToast();
  const [defaultPayFrequency, setDefaultPayFrequency] = useState("MONTHLY");
  const [superRate, setSuperRate] = useState("11.5");
  const [defaultHourlyRate, setDefaultHourlyRate] = useState("65.00");
  const [paySlipEmailEnabled, setPaySlipEmailEnabled] = useState(false);
  const [stpEnabled, setStpEnabled] = useState(false);

  useEffect(() => {
    if (settings) {
      setDefaultPayFrequency(useSettingValue(settings, "payroll.defaultPayFrequency", "MONTHLY"));
      setSuperRate(useSettingValue(settings, "payroll.superRate", "11.5"));
      setDefaultHourlyRate(useSettingValue(settings, "payroll.defaultHourlyRate", "65.00"));
      setPaySlipEmailEnabled(useSettingValue(settings, "payroll.paySlipEmailEnabled", "false") === "true");
      setStpEnabled(useSettingValue(settings, "payroll.stpEnabled", "false") === "true");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/payroll.defaultPayFrequency", { value: defaultPayFrequency });
      await apiRequest("PUT", "/api/settings/payroll.superRate", { value: superRate });
      await apiRequest("PUT", "/api/settings/payroll.defaultHourlyRate", { value: defaultHourlyRate });
      await apiRequest("PUT", "/api/settings/payroll.paySlipEmailEnabled", { value: String(paySlipEmailEnabled) });
      await apiRequest("PUT", "/api/settings/payroll.stpEnabled", { value: String(stpEnabled) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Payroll settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label data-testid="label-pay-frequency">Default Pay Frequency</Label>
        <Select value={defaultPayFrequency} onValueChange={setDefaultPayFrequency}>
          <SelectTrigger data-testid="select-pay-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WEEKLY">Weekly</SelectItem>
            <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="super-rate" data-testid="label-super-rate">Superannuation Rate (%)</Label>
        <Input id="super-rate" value={superRate} onChange={(e) => setSuperRate(e.target.value)} data-testid="input-super-rate" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="default-hourly-rate" data-testid="label-default-hourly-rate">Default Hourly Rate ($)</Label>
        <Input id="default-hourly-rate" value={defaultHourlyRate} onChange={(e) => setDefaultHourlyRate(e.target.value)} data-testid="input-default-hourly-rate" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-payslip-email">Pay Slip Email Notifications</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Email pay slips to employees after each pay run</p>
        </div>
        <Switch checked={paySlipEmailEnabled} onCheckedChange={setPaySlipEmailEnabled} data-testid="switch-payslip-email" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-stp">Single Touch Payroll (STP)</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Enable STP reporting to the ATO</p>
        </div>
        <Switch checked={stpEnabled} onCheckedChange={setStpEnabled} data-testid="switch-stp" />
      </div>
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-payroll">
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? "Saving..." : "Save Payroll Settings"}
      </Button>
    </div>
  );
}

type SyncResult = { total: number; created: number; updated: number; errors: string[] };
type PayrollSettingsResult = { calendars: any[]; earningsRates: any[]; leaveTypes: any[]; payItemsSynced: number };

function SyncButton({ label, endpoint, invalidateKeys, onResult, isPending, setIsPending }: {
  label: string;
  endpoint: string;
  invalidateKeys: string[];
  onResult: (label: string, data: SyncResult) => void;
  isPending: boolean;
  setIsPending: (v: boolean) => void;
}) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      setIsPending(true);
      const res = await apiRequest("POST", endpoint);
      return res.json();
    },
    onSuccess: (data: SyncResult) => {
      setIsPending(false);
      onResult(label, data);
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/xero/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: `${label}: ${data.total} found, ${data.created} created, ${data.updated} updated` });
    },
    onError: (err: Error) => {
      setIsPending(false);
      toast({ title: `${label} sync failed: ${err.message}`, variant: "destructive" });
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={isPending}
      data-testid={`button-sync-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
      {isPending ? "Syncing..." : `Sync ${label}`}
    </Button>
  );
}

function XeroTab({ settings }: { settings: Setting[] | undefined }) {
  const { toast } = useToast();
  const [xeroClientId, setXeroClientId] = useState("");
  const [xeroClientSecret, setXeroClientSecret] = useState("");
  const [autoSyncEmployees, setAutoSyncEmployees] = useState(false);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [syncingLabel, setSyncingLabel] = useState<string | null>(null);
  const [syncAllPending, setSyncAllPending] = useState(false);

  const statusQuery = useQuery<{ connected: boolean; tenantName: string; lastSyncAt: string; callbackUri: string }>({
    queryKey: ["/api/xero/status"],
    queryFn: async () => {
      const res = await fetch("/api/xero/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const tenantsQuery = useQuery<Array<{ tenantId: string; tenantName: string; tenantType: string; selected: boolean }>>({
    queryKey: ["/api/xero/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/xero/tenants", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: statusQuery.data?.connected || false,
  });

  useEffect(() => {
    if (settings) {
      setXeroClientId(useSettingValue(settings, "xero.clientId", ""));
      setXeroClientSecret(useSettingValue(settings, "xero.clientSecret", ""));
      setAutoSyncEmployees(useSettingValue(settings, "xero.autoSyncEmployees", "false") === "true");
    }
  }, [settings]);

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/xero.clientId", { value: xeroClientId });
      await apiRequest("PUT", "/api/settings/xero.clientSecret", { value: xeroClientSecret });
      await apiRequest("PUT", "/api/settings/xero.autoSyncEmployees", { value: String(autoSyncEmployees) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Xero credentials saved" });
    },
    onError: () => {
      toast({ title: "Failed to save credentials", variant: "destructive" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/xero.clientId", { value: xeroClientId });
      await apiRequest("PUT", "/api/settings/xero.clientSecret", { value: xeroClientSecret });
      const res = await fetch("/api/xero/connect", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to connect");
      }
      const data = await res.json();
      return data.url;
    },
    onSuccess: (url: string) => {
      window.open(url, "_blank");
      toast({ title: "Xero login opened in a new tab. Complete authorization there, then return here." });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const addOrgMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/xero/connect", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to initiate connection");
      }
      const data = await res.json();
      return data.url;
    },
    onSuccess: (url: string) => {
      const popup = window.open(url, "_blank");
      const checkInterval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/xero/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xero/tenants"] });
      }, 5000);
      setTimeout(() => clearInterval(checkInterval), 120000);
      toast({ title: "Xero login opened in a new tab. Authorise the additional organisation, then return here." });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/xero/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xero/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xero/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Disconnected from Xero" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const selectTenantMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      await apiRequest("POST", "/api/xero/tenants/select", { tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Organisation switched. Previous data has been cleared — please run Sync All to load data for the new organisation." });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to switch organisation", variant: "destructive" });
    },
  });

  const handleSyncResult = (label: string, data: SyncResult) => {
    setSyncResults(prev => ({ ...prev, [label]: data }));
  };

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      setSyncAllPending(true);
      const endpoints = [
        { label: "Employees", url: "/api/xero/sync" },
        { label: "Pay Runs", url: "/api/xero/sync-payruns" },
        { label: "Timesheets", url: "/api/xero/sync-timesheets" },
        { label: "Invoices", url: "/api/xero/sync-invoices" },
        { label: "Contacts", url: "/api/xero/sync-contacts" },
        { label: "Bank Transactions", url: "/api/xero/sync-bank-transactions" },
      ];
      const results: Record<string, SyncResult> = {};
      for (const ep of endpoints) {
        try {
          const res = await apiRequest("POST", ep.url);
          const data = await res.json();
          results[ep.label] = data;
        } catch (err: any) {
          results[ep.label] = { total: 0, created: 0, updated: 0, errors: [err.message || "Failed"] };
        }
      }
      try {
        const res = await fetch("/api/xero/payroll-settings", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          results["Payroll Settings"] = { total: data.payItemsSynced || 0, created: data.payItemsSynced || 0, updated: 0, errors: [] };
        }
      } catch {}
      return results;
    },
    onSuccess: (results: Record<string, SyncResult>) => {
      setSyncAllPending(false);
      setSyncResults(results);
      queryClient.invalidateQueries({ queryKey: ["/api/xero/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      const totalCreated = Object.values(results).reduce((s, r) => s + r.created, 0);
      const totalUpdated = Object.values(results).reduce((s, r) => s + r.updated, 0);
      toast({ title: `Sync All complete: ${totalCreated} created, ${totalUpdated} updated` });
    },
    onError: () => {
      setSyncAllPending(false);
      toast({ title: "Sync All failed", variant: "destructive" });
    },
  });

  const isConnected = statusQuery.data?.connected || false;
  const tenantName = statusQuery.data?.tenantName || "";
  const lastSyncAt = statusQuery.data?.lastSyncAt || "";

  const lastEmployeeSyncAt = useSettingValue(settings, "xero.lastEmployeeSyncAt", "");
  const lastPayRunSyncAt = useSettingValue(settings, "xero.lastPayRunSyncAt", "");
  const lastTimesheetSyncAt = useSettingValue(settings, "xero.lastTimesheetSyncAt", "");
  const lastInvoiceSyncAt = useSettingValue(settings, "xero.lastInvoiceSyncAt", "");
  const lastContactSyncAt = useSettingValue(settings, "xero.lastContactSyncAt", "");
  const lastBankTxnSyncAt = useSettingValue(settings, "xero.lastBankTxnSyncAt", "");
  const lastSettingsSyncAt = useSettingValue(settings, "xero.lastSettingsSyncAt", "");

  const tenants = tenantsQuery.data || [];
  const selectedTenantId = tenants.find(t => t.selected)?.tenantId || "";

  const syncItems = [
    { label: "Employees", endpoint: "/api/xero/sync", invalidateKeys: ["/api/employees"], lastSync: lastEmployeeSyncAt },
    { label: "Pay Runs", endpoint: "/api/xero/sync-payruns", invalidateKeys: ["/api/pay-runs"], lastSync: lastPayRunSyncAt },
    { label: "Timesheets", endpoint: "/api/xero/sync-timesheets", invalidateKeys: ["/api/timesheets"], lastSync: lastTimesheetSyncAt },
    { label: "Invoices", endpoint: "/api/xero/sync-invoices", invalidateKeys: ["/api/invoices"], lastSync: lastInvoiceSyncAt },
    { label: "Contacts", endpoint: "/api/xero/sync-contacts", invalidateKeys: ["/api/clients"], lastSync: lastContactSyncAt },
    { label: "Bank Transactions", endpoint: "/api/xero/sync-bank-transactions", invalidateKeys: ["/api/bank-transactions"], lastSync: lastBankTxnSyncAt },
  ];

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-lg border ${isConnected ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" : "bg-muted/50 border-border"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <div className="font-medium text-sm" data-testid="text-xero-status">
                {isConnected ? "Connected to Xero" : "Not connected"}
              </div>
              {isConnected && tenantName && (
                <div className="text-xs text-muted-foreground" data-testid="text-xero-tenant">
                  Organisation: {tenantName}
                </div>
              )}
              {isConnected && lastSyncAt && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" data-testid="text-xero-last-sync">
                  <Clock className="w-3 h-3" />
                  Last synced: {new Date(lastSyncAt).toLocaleString("en-AU")}
                </div>
              )}
            </div>
          </div>
          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-xero-disconnect"
            >
              <Unlink className="w-4 h-4" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {isConnected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label data-testid="label-xero-org-picker">Organisation</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addOrgMutation.mutate()}
              disabled={addOrgMutation.isPending}
              data-testid="button-xero-add-org"
            >
              <Plus className="w-3 h-3" />
              Add Organisation
            </Button>
          </div>
          {tenants.length > 1 ? (
            <Select
              value={selectedTenantId}
              onValueChange={(val) => selectTenantMutation.mutate(val)}
            >
              <SelectTrigger data-testid="select-xero-org">
                <SelectValue placeholder="Select organisation" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.tenantId} value={t.tenantId} data-testid={`option-org-${t.tenantId}`}>
                    {t.tenantName} ({t.tenantType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : tenants.length === 1 ? (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid="text-xero-single-org">{tenants[0].tenantName}</span>
              <span className="text-xs text-muted-foreground">({tenants[0].tenantType})</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-xero-no-orgs">No organisations connected. Click "Add Organisation" to authorise one.</p>
          )}
          <p className="text-xs text-muted-foreground">
            {tenants.length > 1 ? "Switch between your connected Xero organisations" : tenants.length === 1 ? "Connected organisation" : ""}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="xero-client-id" data-testid="label-xero-client-id">Client ID</Label>
          <Input
            id="xero-client-id"
            value={xeroClientId}
            onChange={(e) => setXeroClientId(e.target.value)}
            placeholder="Enter your Xero app Client ID"
            data-testid="input-xero-client-id"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="xero-client-secret" data-testid="label-xero-client-secret">Client Secret</Label>
          <Input
            id="xero-client-secret"
            type="password"
            value={xeroClientSecret}
            onChange={(e) => setXeroClientSecret(e.target.value)}
            placeholder="Enter your Xero app Client Secret"
            data-testid="input-xero-client-secret"
          />
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Create an app at developer.xero.com/myapps and set the redirect URI to:</p>
          {statusQuery.data?.callbackUri && (
            <code className="block bg-muted px-2 py-1 rounded text-[11px] font-mono select-all break-all" data-testid="text-callback-uri">
              {statusQuery.data.callbackUri}
            </code>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              if (!xeroClientId || !xeroClientSecret) {
                toast({ title: "Enter Client ID and Client Secret first", variant: "destructive" });
                return;
              }
              connectMutation.mutate();
            }}
            disabled={connectMutation.isPending || !xeroClientId || !xeroClientSecret}
            data-testid="button-xero-connect"
          >
            {connectMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {connectMutation.isPending ? "Connecting..." : "Connect to Xero"}
          </Button>
          <Button
            variant="outline"
            onClick={() => saveCredentialsMutation.mutate()}
            disabled={saveCredentialsMutation.isPending}
            data-testid="button-save-xero-credentials"
          >
            <Save className="w-4 h-4" />
            {saveCredentialsMutation.isPending ? "Saving..." : "Save Credentials"}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Data Sync</Label>
              <Button
                size="sm"
                onClick={() => syncAllMutation.mutate()}
                disabled={syncAllPending || syncingLabel !== null}
                data-testid="button-sync-all"
              >
                {syncAllPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {syncAllPending ? "Syncing All..." : "Sync All"}
              </Button>
            </div>

            <div className="space-y-2">
              {syncItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  data-testid={`sync-row-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    {item.lastSync && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(item.lastSync).toLocaleString("en-AU")}
                      </div>
                    )}
                    {syncResults[item.label] && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {syncResults[item.label].created} created, {syncResults[item.label].updated} updated
                        {syncResults[item.label].errors.length > 0 && (
                          <span className="text-destructive ml-1">({syncResults[item.label].errors.length} errors)</span>
                        )}
                      </div>
                    )}
                  </div>
                  <SyncButton
                    label={item.label}
                    endpoint={item.endpoint}
                    invalidateKeys={item.invalidateKeys}
                    onResult={handleSyncResult}
                    isPending={syncingLabel === item.label || syncAllPending}
                    setIsPending={(v) => setSyncingLabel(v ? item.label : null)}
                  />
                </div>
              ))}

              <div
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
                data-testid="sync-row-payroll-settings"
              >
                <div>
                  <div className="text-sm font-medium">Payroll Settings</div>
                  {lastSettingsSyncAt && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(lastSettingsSyncAt).toLocaleString("en-AU")}
                    </div>
                  )}
                  {syncResults["Payroll Settings"] && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {syncResults["Payroll Settings"].created} pay items synced
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setSyncingLabel("Payroll Settings");
                    try {
                      const res = await fetch("/api/xero/payroll-settings", { credentials: "include" });
                      if (!res.ok) throw new Error("Failed to fetch payroll settings");
                      const data: PayrollSettingsResult = await res.json();
                      handleSyncResult("Payroll Settings", { total: data.payItemsSynced, created: data.payItemsSynced, updated: 0, errors: [] });
                      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                      toast({ title: `Payroll Settings: ${data.calendars.length} calendars, ${data.earningsRates.length} earnings rates, ${data.leaveTypes.length} leave types` });
                    } catch (err: any) {
                      toast({ title: err.message || "Failed", variant: "destructive" });
                    }
                    setSyncingLabel(null);
                  }}
                  disabled={syncingLabel === "Payroll Settings" || syncAllPending}
                  data-testid="button-sync-payroll-settings"
                >
                  {syncingLabel === "Payroll Settings" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {syncingLabel === "Payroll Settings" ? "Syncing..." : "Sync Settings"}
                </Button>
              </div>
            </div>
          </div>

          {Object.values(syncResults).some(r => r.errors.length > 0) && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm space-y-1" data-testid="text-sync-errors">
              <div className="font-medium text-destructive">Sync Errors</div>
              {Object.entries(syncResults).map(([label, result]) =>
                result.errors.map((e, i) => (
                  <div key={`${label}-${i}`} className="text-xs text-destructive/80">
                    [{label}] {e}
                  </div>
                ))
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label data-testid="label-auto-sync-employees">Auto-sync Employees</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically sync employee data from Xero on a schedule</p>
            </div>
            <Switch
              checked={autoSyncEmployees}
              onCheckedChange={(val) => {
                setAutoSyncEmployees(val);
                saveCredentialsMutation.mutate();
              }}
              data-testid="switch-auto-sync-employees"
            />
          </div>

          <Button
            variant="outline"
            onClick={() => saveCredentialsMutation.mutate()}
            disabled={saveCredentialsMutation.isPending}
            data-testid="button-save-xero-settings"
          >
            <Save className="w-4 h-4" />
            {saveCredentialsMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PortalTab({ settings }: { settings: Setting[] | undefined }) {
  const { toast } = useToast();
  const [portalEnabled, setPortalEnabled] = useState(true);
  const [selfServiceTimesheets, setSelfServiceTimesheets] = useState(true);
  const [portalWelcomeMessage, setPortalWelcomeMessage] = useState("");
  const [allowMessageAttachments, setAllowMessageAttachments] = useState(false);

  useEffect(() => {
    if (settings) {
      setPortalEnabled(useSettingValue(settings, "portal.enabled", "true") === "true");
      setSelfServiceTimesheets(useSettingValue(settings, "portal.selfServiceTimesheets", "true") === "true");
      setPortalWelcomeMessage(useSettingValue(settings, "portal.welcomeMessage", ""));
      setAllowMessageAttachments(useSettingValue(settings, "portal.allowMessageAttachments", "false") === "true");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/portal.enabled", { value: String(portalEnabled) });
      await apiRequest("PUT", "/api/settings/portal.selfServiceTimesheets", { value: String(selfServiceTimesheets) });
      await apiRequest("PUT", "/api/settings/portal.welcomeMessage", { value: portalWelcomeMessage });
      await apiRequest("PUT", "/api/settings/portal.allowMessageAttachments", { value: String(allowMessageAttachments) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Portal settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-portal-enabled">Enable Employee Portal</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Allow employees to access the self-service portal</p>
        </div>
        <Switch checked={portalEnabled} onCheckedChange={setPortalEnabled} data-testid="switch-portal-enabled" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-self-service-timesheets">Self-service Timesheets</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Let employees submit timesheets via the portal</p>
        </div>
        <Switch checked={selfServiceTimesheets} onCheckedChange={setSelfServiceTimesheets} data-testid="switch-self-service-timesheets" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="welcome-message" data-testid="label-welcome-message">Welcome Message</Label>
        <Textarea
          id="welcome-message"
          value={portalWelcomeMessage}
          onChange={(e) => setPortalWelcomeMessage(e.target.value)}
          placeholder="Welcome to the employee portal..."
          data-testid="input-welcome-message"
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-message-attachments">Allow Message Attachments</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Allow employees to attach files to messages</p>
        </div>
        <Switch checked={allowMessageAttachments} onCheckedChange={setAllowMessageAttachments} data-testid="switch-message-attachments" />
      </div>
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-portal">
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? "Saving..." : "Save Portal Settings"}
      </Button>
    </div>
  );
}

type AdminUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
};

function UsersTab() {
  const { toast } = useToast();
  const { data: users = [], isLoading } = useQuery<AdminUser[]>({ queryKey: ["/api/users"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const openCreate = () => {
    setEditUser(null);
    setFormName("");
    setFormUsername("");
    setFormEmail("");
    setFormPassword("");
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setFormName(u.displayName || "");
    setFormUsername(u.username);
    setFormEmail(u.email || "");
    setFormPassword("");
    setShowPassword(false);
    setDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; displayName: string; email: string }) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User updated" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted" });
      setDeleteConfirmId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeleteConfirmId(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editUser) {
      const data: Record<string, any> = {
        displayName: formName,
        username: formUsername,
        email: formEmail,
      };
      if (formPassword) data.password = formPassword;
      updateMutation.mutate({ id: editUser.id, data });
    } else {
      if (!formPassword) {
        toast({ title: "Password is required", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        username: formUsername,
        password: formPassword,
        displayName: formName,
        email: formEmail,
      });
    }
  };

  const getInitials = (u: AdminUser) => {
    if (u.displayName) {
      return u.displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    }
    return u.username.slice(0, 2).toUpperCase();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) return <SettingsTabSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" data-testid="text-users-info">
          Manage admin users who can access this portal.
        </p>
        <Button size="sm" onClick={openCreate} data-testid="button-create-user">
          <Plus className="w-4 h-4 mr-1" />
          Add User
        </Button>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary" data-testid={`avatar-user-${u.id}`}>
                    {getInitials(u)}
                  </div>
                  <div>
                    <div className="text-sm font-medium" data-testid={`text-user-name-${u.id}`}>
                      {u.displayName || u.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {u.email ? `${u.email} · ` : ""}{u.username}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium capitalize" data-testid={`text-user-role-${u.id}`}>
                    {u.role}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)} data-testid={`button-edit-user-${u.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteConfirmId(u.id)}
                    data-testid={`button-delete-user-${u.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Create User"}</DialogTitle>
            <DialogDescription>
              {editUser ? "Update user details. Leave password blank to keep it unchanged." : "Add a new admin user to the portal."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Display Name</Label>
              <Input
                id="user-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Sarah Chen"
                data-testid="input-user-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-username">Username</Label>
              <Input
                id="user-username"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="e.g. sarah"
                required
                data-testid="input-user-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="e.g. sarah@company.com"
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">{editUser ? "New Password (optional)" : "Password"}</Label>
              <div className="relative">
                <Input
                  id="user-password"
                  type={showPassword ? "text" : "password"}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editUser ? "Leave blank to keep current" : "Enter password"}
                  required={!editUser}
                  className="pr-10"
                  data-testid="input-user-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={isPending} data-testid="button-save-user">
                {isPending ? "Saving..." : editUser ? "Save Changes" : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? They will no longer be able to access the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete-user">Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
              data-testid="button-confirm-delete-user"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const tabs = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "company", label: "Company", icon: Building2 },
  { id: "payroll", label: "Payroll", icon: Banknote },
  { id: "xero", label: "Xero", icon: RefreshCw },
  { id: "portal", label: "Portal", icon: Globe },
  { id: "users", label: "Users", icon: UserCog },
];

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get("tab");
  const connectedFromUrl = urlParams.get("connected");
  const errorFromUrl = urlParams.get("error");

  useEffect(() => {
    if (connectedFromUrl === "true") {
      toast({ title: "Successfully connected to Xero" });
      window.history.replaceState({}, "", "/settings");
    } else if (errorFromUrl) {
      toast({ title: `Xero connection failed: ${errorFromUrl}`, variant: "destructive" });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Settings" subtitle="Configure your recruitment portal" />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <Tabs defaultValue={tabFromUrl || "branding"}>
            <TabsList className="mb-6 flex-wrap" data-testid="tabs-settings">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5" data-testid={`tab-${tab.id}`}>
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <Card>
              <CardContent className="p-6">
                <TabsContent value="branding" className="mt-0">
                  {isLoading ? <SettingsTabSkeleton /> : <BrandingTab settings={settings} />}
                </TabsContent>
                <TabsContent value="company" className="mt-0">
                  {isLoading ? <SettingsTabSkeleton /> : <CompanyTab settings={settings} />}
                </TabsContent>
                <TabsContent value="payroll" className="mt-0">
                  {isLoading ? <SettingsTabSkeleton /> : <PayrollTab settings={settings} />}
                </TabsContent>
                <TabsContent value="xero" className="mt-0">
                  {isLoading ? <SettingsTabSkeleton /> : <XeroTab settings={settings} />}
                </TabsContent>
                <TabsContent value="portal" className="mt-0">
                  {isLoading ? <SettingsTabSkeleton /> : <PortalTab settings={settings} />}
                </TabsContent>
                <TabsContent value="users" className="mt-0">
                  <UsersTab />
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
