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
import { Save, Palette, Building2, Banknote, RefreshCw, Globe, UserCog, Link2, Unlink, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
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
          <p className="text-xs text-muted-foreground mt-0.5">Email pay slips to contractors after each pay run</p>
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

function XeroTab({ settings }: { settings: Setting[] | undefined }) {
  const { toast } = useToast();
  const [xeroClientId, setXeroClientId] = useState("");
  const [xeroClientSecret, setXeroClientSecret] = useState("");
  const [autoSyncEmployees, setAutoSyncEmployees] = useState(false);
  const [syncResult, setSyncResult] = useState<{ total: number; created: number; updated: number; errors: string[] } | null>(null);

  const statusQuery = useQuery<{ connected: boolean; tenantName: string; lastSyncAt: string; callbackUri: string }>({
    queryKey: ["/api/xero/status"],
    queryFn: async () => {
      const res = await fetch("/api/xero/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 30000,
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
      const res = await fetch("/api/xero/connect");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to connect");
      }
      const data = await res.json();
      return data.url;
    },
    onSuccess: (url: string) => {
      window.location.href = url;
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
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Disconnected from Xero" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/xero/sync");
      return res.json();
    },
    onSuccess: (data: { total: number; created: number; updated: number; errors: string[] }) => {
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/xero/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({ title: `Synced ${data.total} employees (${data.created} new, ${data.updated} updated)` });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Sync failed", variant: "destructive" });
    },
  });

  const isConnected = statusQuery.data?.connected || false;
  const tenantName = statusQuery.data?.tenantName || "";
  const lastSyncAt = statusQuery.data?.lastSyncAt || "";

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
        <div className="space-y-4">
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

          <div className="flex items-center gap-3">
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-xero-sync"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {syncMutation.isPending ? "Syncing..." : "Sync Employees Now"}
            </Button>
            <Button
              variant="outline"
              onClick={() => saveCredentialsMutation.mutate()}
              disabled={saveCredentialsMutation.isPending}
              data-testid="button-save-xero-settings"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </Button>
          </div>

          {syncResult && (
            <div className="p-3 rounded-lg bg-muted/50 border text-sm space-y-1" data-testid="text-sync-result">
              <div className="font-medium">Sync Complete</div>
              <div className="text-muted-foreground">
                Total: {syncResult.total} employees | {syncResult.created} created | {syncResult.updated} updated
              </div>
              {syncResult.errors.length > 0 && (
                <div className="text-destructive text-xs mt-1">
                  {syncResult.errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
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
          <Label data-testid="label-portal-enabled">Enable Contractor Portal</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Allow contractors to access the self-service portal</p>
        </div>
        <Switch checked={portalEnabled} onCheckedChange={setPortalEnabled} data-testid="switch-portal-enabled" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-self-service-timesheets">Self-service Timesheets</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Let contractors submit timesheets via the portal</p>
        </div>
        <Switch checked={selfServiceTimesheets} onCheckedChange={setSelfServiceTimesheets} data-testid="switch-self-service-timesheets" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="welcome-message" data-testid="label-welcome-message">Welcome Message</Label>
        <Textarea
          id="welcome-message"
          value={portalWelcomeMessage}
          onChange={(e) => setPortalWelcomeMessage(e.target.value)}
          placeholder="Welcome to the contractor portal..."
          data-testid="input-welcome-message"
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-message-attachments">Allow Message Attachments</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Allow contractors to attach files to messages</p>
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

function UsersTab() {
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground" data-testid="text-users-info">
        User management allows you to add, remove, and configure admin users who can access this portal.
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                SC
              </div>
              <div>
                <div className="text-sm font-medium" data-testid="text-user-name-sarah">Sarah Chen</div>
                <div className="text-xs text-muted-foreground">sarah@company.com</div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-medium" data-testid="text-user-role-sarah">Admin</span>
          </div>
        </CardContent>
      </Card>
      <Button variant="outline" data-testid="button-invite-user">
        <UserCog className="w-4 h-4" />
        Invite User
      </Button>
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
