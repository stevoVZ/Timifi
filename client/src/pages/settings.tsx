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
import { Save, Palette, Building2, Banknote, RefreshCw, Globe, UserCog } from "lucide-react";
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
  const [xeroEnabled, setXeroEnabled] = useState(false);
  const [xeroClientId, setXeroClientId] = useState("");
  const [xeroTenantId, setXeroTenantId] = useState("");
  const [autoSyncInvoices, setAutoSyncInvoices] = useState(false);

  useEffect(() => {
    if (settings) {
      setXeroEnabled(useSettingValue(settings, "xero.enabled", "false") === "true");
      setXeroClientId(useSettingValue(settings, "xero.clientId", ""));
      setXeroTenantId(useSettingValue(settings, "xero.tenantId", ""));
      setAutoSyncInvoices(useSettingValue(settings, "xero.autoSyncInvoices", "false") === "true");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/xero.enabled", { value: String(xeroEnabled) });
      await apiRequest("PUT", "/api/settings/xero.clientId", { value: xeroClientId });
      await apiRequest("PUT", "/api/settings/xero.tenantId", { value: xeroTenantId });
      await apiRequest("PUT", "/api/settings/xero.autoSyncInvoices", { value: String(autoSyncInvoices) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Xero settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Label data-testid="label-xero-enabled">Enable Xero Integration</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Connect your Xero account for accounting sync</p>
        </div>
        <Switch checked={xeroEnabled} onCheckedChange={setXeroEnabled} data-testid="switch-xero-enabled" />
      </div>
      {xeroEnabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="xero-client-id" data-testid="label-xero-client-id">Client ID</Label>
            <Input id="xero-client-id" value={xeroClientId} onChange={(e) => setXeroClientId(e.target.value)} data-testid="input-xero-client-id" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="xero-tenant-id" data-testid="label-xero-tenant-id">Tenant ID</Label>
            <Input id="xero-tenant-id" value={xeroTenantId} onChange={(e) => setXeroTenantId(e.target.value)} data-testid="input-xero-tenant-id" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label data-testid="label-auto-sync">Auto-sync Invoices</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically push invoices to Xero when created</p>
            </div>
            <Switch checked={autoSyncInvoices} onCheckedChange={setAutoSyncInvoices} data-testid="switch-auto-sync" />
          </div>
        </>
      )}
      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-xero">
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? "Saving..." : "Save Xero Settings"}
      </Button>
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

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Settings" subtitle="Configure your recruitment portal" />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <Tabs defaultValue="branding">
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
