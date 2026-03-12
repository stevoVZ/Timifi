import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useRef, useCallback } from "react";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Shield, MapPin, Briefcase, Mail, Phone, Calendar,
  DollarSign, Clock, Pencil, Check, X, AlertTriangle, FileText,
  Receipt, User, Upload, CloudUpload, Trash2, Eye, FileBadge,
  Landmark, CreditCard, IdCard, Search, ShieldCheck, GraduationCap, File, Lock, RefreshCw,
  TrendingUp, CheckCircle, AlertCircle, CircleDollarSign, Percent, History, Calculator,
} from "lucide-react";
import type { Employee, Timesheet, Invoice, Document, Client, Placement } from "@shared/schema";

function getCurrentSuperRate(): number {
  const now = new Date();
  const fy = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const rates: { fyStart: number; rate: number }[] = [
    { fyStart: 2026, rate: 12.0 },
    { fyStart: 2025, rate: 11.5 },
    { fyStart: 2024, rate: 11.0 },
    { fyStart: 2023, rate: 10.5 },
    { fyStart: 2022, rate: 10.0 },
  ];
  for (const entry of rates) {
    if (fy >= entry.fyStart) return entry.rate / 100;
  }
  return 0.095;
}

interface ReconciliationPeriod {
  month: number;
  year: number;
  timesheetHours: number;
  timesheetStatus: string | null;
  timesheetGross: number;
  invoicedHours: number;
  invoicedAmount: number;
  invoicedAmountExGst: number;
  paymentStatus: string | null;
  paidAmount: number;
  paidDate: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
}

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isClearanceExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const expiryDate = new Date(expiry);
  const now = new Date();
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);
  return expiryDate > now && expiryDate <= threeMonths;
}

function isClearanceExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  return new Date(expiry) <= new Date();
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [portalPwOpen, setPortalPwOpen] = useState(false);
  const [portalPw, setPortalPw] = useState("");
  const setPortalPwMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`/api/employees/${id}/set-portal-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal password set", description: "Employee can now log into the portal." });
      setPortalPwOpen(false);
      setPortalPw("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: ["/api/employees", id],
  });

  const { data: timesheetsList } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets/employee", id],
    enabled: !!id,
  });

  const { data: invoicesList } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices/employee", id],
    enabled: !!id,
  });

  const { data: documentsList } = useQuery<Document[]>({
    queryKey: ["/api/documents", id],
    enabled: !!id,
  });

  const { data: reconciliation } = useQuery<ReconciliationPeriod[]>({
    queryKey: ["/api/employees", id, "reconciliation"],
    enabled: !!id,
  });

  const { data: clientsList } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: invoiceContacts } = useQuery<{ name: string; xeroContactId: string | null }[]>({
    queryKey: ["/api/clients/invoice-contacts"],
  });

  const { data: supplierContacts } = useQuery<{ contactName: string; xeroContactId: string }[]>({
    queryKey: ["/api/supplier-contacts"],
    enabled: !!id,
  });

  const { data: placementsList } = useQuery<Placement[]>({
    queryKey: ["/api/employees", id, "placements"],
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/employees/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id, "rate-history"] });
      toast({ title: "Updated", description: "Employee details saved." });
      setEditingField(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function startEdit(field: string, currentValue: string) {
    setEditingField(field);
    setEditValues({ ...editValues, [field]: currentValue || "" });
  }

  function cancelEdit() {
    setEditingField(null);
  }

  function saveEdit(field: string) {
    updateMutation.mutate({ [field]: editValues[field] });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Loading..." />
        <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
          <div className="max-w-4xl mx-auto space-y-4">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-60 w-full rounded-md" />
          </div>
        </main>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Employee Not Found" />
        <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30 flex items-center justify-center">
          <Card>
            <CardContent className="py-12 px-8 text-center">
              <div className="text-lg font-semibold mb-2">Employee not found</div>
              <Link href="/employees">
                <Button variant="secondary">Back to Employees</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const monthlyAllocation = (employee.contractHoursPA || 2000) / 12;
  const clearanceExpiring = isClearanceExpiringSoon(employee.clearanceExpiry);
  const clearanceExpired = isClearanceExpired(employee.clearanceExpiry);

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={`${employee.preferredName || employee.firstName} ${employee.lastName}`}
        subtitle={employee.jobTitle || "Employee"}
        actions={
          <Link href="/employees">
            <Button variant="secondary" size="sm" data-testid="button-back-employees">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-5">
                <div className={`w-14 h-14 rounded-md flex items-center justify-center font-bold text-lg flex-shrink-0 border ${getAvatarColor(employee.firstName + employee.lastName)}`}>
                  {getInitials(employee.firstName, employee.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h2 className="text-xl font-bold text-foreground" data-testid="text-employee-full-name">
                      {employee.preferredName ? `${employee.preferredName} ${employee.lastName}` : `${employee.firstName} ${employee.lastName}`}
                      {employee.preferredName && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">({employee.firstName})</span>
                      )}
                    </h2>
                    <StatusBadge status={employee.status} />
                    {employee.xeroEmployeeId && (
                      <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" data-testid="badge-xero-synced">
                        Xero Synced
                      </Badge>
                    )}
                    {employee.clearanceLevel && employee.clearanceLevel !== "NONE" && (
                      <span className="text-xs font-semibold flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-600 dark:text-amber-400">{employee.clearanceLevel}</span>
                        {employee.clearanceExpiry && (
                          <span className={`font-normal ml-1 ${
                            clearanceExpired
                              ? "text-destructive"
                              : clearanceExpiring
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }`}>
                            exp. {new Date(employee.clearanceExpiry).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
                          </span>
                        )}
                        {clearanceExpired && (
                          <Badge variant="destructive" className="ml-1" data-testid="badge-clearance-expired">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Expired
                          </Badge>
                        )}
                        {clearanceExpiring && !clearanceExpired && (
                          <Badge variant="secondary" className="ml-1" data-testid="badge-clearance-expiring">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Expiring Soon
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="w-full justify-start flex-wrap gap-1" data-testid="tabs-employee-detail">
              <TabsTrigger value="profile" data-testid="tab-profile">
                <User className="w-4 h-4 mr-1.5" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="financials" data-testid="tab-financials">
                <TrendingUp className="w-4 h-4 mr-1.5" />
                Financials
              </TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents">
                <FileText className="w-4 h-4 mr-1.5" />
                Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Contact & Employment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    <EditableField
                      icon={Mail}
                      label="Email"
                      field="email"
                      value={employee.email}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-email"
                      locked={!!employee.xeroEmployeeId}
                    />
                    <EditableField
                      icon={Phone}
                      label="Phone"
                      field="phone"
                      value={employee.phone || "Not provided"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-phone"
                      locked={!!employee.xeroEmployeeId}
                    />
                    <EditableField
                      icon={Briefcase}
                      label="Job Title"
                      field="jobTitle"
                      value={employee.jobTitle || "Not set"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-job-title"
                      locked={!!employee.xeroEmployeeId}
                    />
                    <div className="flex items-center gap-3 py-2" data-testid="field-client">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-muted-foreground mb-0.5">Client</div>
                        <Select
                          value={employee.clientName || "__none__"}
                          onValueChange={(v) => {
                            const val = v === "__none__" ? "" : v;
                            updateMutation.mutate({ clientName: val });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid="select-client">
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Not assigned</SelectItem>
                            {(invoiceContacts || []).map((c) => (
                              <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <EditableField
                      icon={User}
                      label="Preferred Name"
                      field="preferredName"
                      value={employee.preferredName || "Not set"}
                      rawValue={employee.preferredName || ""}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-preferred-name"
                    />
                    <EditableField
                      icon={FileBadge}
                      label="Contract Code"
                      field="contractCode"
                      value={employee.contractCode || "Not set"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-contract-code"
                    />
                    <EditableField
                      icon={Briefcase}
                      label="Role Title"
                      field="roleTitle"
                      value={employee.roleTitle || "Not set"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-role-title"
                    />
                    <InfoRow icon={CreditCard} label="Payment Method" value={employee.paymentMethod === "INVOICE" ? "Invoice (Pty Ltd)" : "Payroll"} testId="text-payment-method" />
                    {employee.paymentMethod === "INVOICE" && (
                      <>
                        <EditableField
                          icon={Landmark}
                          label="Company Name"
                          field="companyName"
                          value={employee.companyName || "Not set"}
                          editingField={editingField}
                          editValues={editValues}
                          setEditValues={setEditValues}
                          onStartEdit={startEdit}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                          isPending={updateMutation.isPending}
                          testId="text-company-name"
                        />
                        <EditableField
                          icon={IdCard}
                          label="ABN"
                          field="abn"
                          value={employee.abn || "Not set"}
                          editingField={editingField}
                          editValues={editValues}
                          setEditValues={setEditValues}
                          onStartEdit={startEdit}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                          isPending={updateMutation.isPending}
                          testId="text-abn"
                        />
                        <div className="flex items-center gap-3 py-2" data-testid="field-supplier-contact">
                          <Landmark className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-muted-foreground mb-0.5">Supplier Contact</div>
                            <Select
                              value={employee.supplierContactId || "__none__"}
                              onValueChange={(v) => {
                                const val = v === "__none__" ? null : v;
                                updateMutation.mutate({ supplierContactId: val });
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm" data-testid="select-supplier-contact">
                                <SelectValue placeholder="Select supplier contact" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Not linked</SelectItem>
                                {(supplierContacts || []).map((sc) => (
                                  <SelectItem key={sc.xeroContactId} value={sc.xeroContactId}>
                                    {sc.contactName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    )}
                    <InfoRow icon={Calendar} label="Start Date" value={employee.startDate ? new Date(employee.startDate).toLocaleDateString("en-AU") : "Not set"} testId="text-start-date" />
                    <InfoRow icon={Clock} label="Contract Hours" value={`${employee.contractHoursPA?.toLocaleString()} h/yr (${Math.round(monthlyAllocation)} h/mo)`} testId="text-contract-hours" />
                    <InfoRow icon={MapPin} label="Location" value={[employee.suburb, employee.state].filter(Boolean).join(", ") || "Not set"} testId="text-location" />
                    {employee.xeroEmployeeId && (
                      <div className="flex items-center gap-2 col-span-full pt-2 border-t">
                        <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs text-muted-foreground">Synced from Xero</span>
                        <span className="text-xs font-mono text-muted-foreground/70" data-testid="text-xero-employee-id">
                          ID: {employee.xeroEmployeeId}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Rates & Billing</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const activePls = (placementsList || []).filter(p => p.status === "ACTIVE");
                    const hasMultiple = activePls.length > 1;
                    const activePl = activePls.length === 1 ? activePls[0] : null;
                    const displayChargeOut = activePl ? activePl.chargeOutRate : (hasMultiple ? null : employee.chargeOutRate);
                    const displayPayRate = activePl ? activePl.payRate : (hasMultiple ? null : employee.hourlyRate);
                    const displayFee = activePl ? activePl.payrollFeePercent : (hasMultiple ? null : employee.payrollFeePercent);
                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                          <InfoRow
                            icon={DollarSign}
                            label="Charge-Out Rate (Ex GST)"
                            value={hasMultiple ? "Multiple placements" : (displayChargeOut ? `$${parseFloat(displayChargeOut).toFixed(2)}/hr` : "Not set")}
                            testId="text-charge-out-rate"
                          />
                          <InfoRow
                            icon={DollarSign}
                            label="Pay Rate (Incl Super, Ex GST)"
                            value={hasMultiple ? "Multiple placements" : (displayPayRate ? `$${parseFloat(displayPayRate).toFixed(2)}/hr` : "Not set")}
                            testId="text-pay-rate"
                          />
                          <InfoRow
                            icon={Percent}
                            label="Payroll Service Fee %"
                            value={hasMultiple ? "See placements" : (displayFee ? `${parseFloat(displayFee).toFixed(2)}%` : "0%")}
                            testId="text-payroll-fee-percent"
                          />
                          <div className="flex items-center gap-3 py-2" data-testid="field-payroll-tax-applicable">
                            <Calculator className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-muted-foreground mb-0.5">Payroll Tax Applicable</div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={employee.payrollTaxApplicable}
                                  onCheckedChange={(checked) => {
                                    updateMutation.mutate({ payrollTaxApplicable: checked });
                                  }}
                                  data-testid="switch-payroll-tax-applicable"
                                />
                                <span className="text-sm text-foreground" data-testid="text-payroll-tax-status">
                                  {employee.payrollTaxApplicable ? "Yes" : "No"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {activePls.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-2 italic" data-testid="text-rates-placement-hint">
                            Rates are managed via Placements below
                          </p>
                        )}
                        {!hasMultiple && (displayChargeOut || displayPayRate) && (() => {
                          const superRate = getCurrentSuperRate();
                          const payRateNum = displayPayRate ? parseFloat(displayPayRate) : 0;
                          const baseWage = payRateNum / (1 + superRate);
                          const superAmount = payRateNum - baseWage;
                          return (
                          <div className={`grid grid-cols-2 ${displayPayRate ? "md:grid-cols-3" : "md:grid-cols-4"} gap-3 mt-4 p-3 rounded-lg bg-muted/50 border border-border`}>
                            <div>
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Rate (Inc GST)</span>
                              <div className="text-sm font-bold text-foreground" data-testid="text-total-rate-inc-gst">
                                {displayChargeOut ? `$${(parseFloat(displayChargeOut) * 1.1).toFixed(2)}` : "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Billable Rate (Ex GST)</span>
                              <div className="text-sm font-bold text-foreground" data-testid="text-billable-rate-ex-gst">
                                {displayChargeOut ? `$${parseFloat(displayChargeOut).toFixed(2)}` : "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">GST</span>
                              <div className="text-sm font-bold text-foreground" data-testid="text-gst-amount">
                                {displayChargeOut ? `$${(parseFloat(displayChargeOut) * 0.1).toFixed(2)}` : "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Margin</span>
                              <div className="text-sm font-bold text-foreground" data-testid="text-margin">
                                {displayChargeOut && displayPayRate
                                  ? `$${(parseFloat(displayChargeOut) - parseFloat(displayPayRate)).toFixed(2)}/hr`
                                  : "—"}
                              </div>
                            </div>
                            {displayPayRate && (
                              <>
                                <div>
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Base Wage</span>
                                  <div className="text-sm font-bold text-foreground" data-testid="text-base-wage">
                                    ${baseWage.toFixed(2)}/hr
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Super ({(superRate * 100).toFixed(1)}%)</span>
                                  <div className="text-sm font-bold text-foreground" data-testid="text-super-amount">
                                    ${superAmount.toFixed(2)}/hr
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
                  <CardTitle className="text-base">Notes</CardTitle>
                  {editingField !== "notes" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit("notes", employee.notes || "")}
                      data-testid="button-edit-notes"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {editingField === "notes" ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValues["notes"] || ""}
                        onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                        className="min-h-[100px]"
                        data-testid="input-notes"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit("notes")}
                          disabled={updateMutation.isPending}
                          data-testid="button-save-notes"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          data-testid="button-cancel-notes"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-notes">
                      {employee.notes || "No notes added."}
                    </p>
                  )}
                </CardContent>
              </Card>

              <PlacementsCard
                employeeId={id!}
                placements={placementsList || []}
                clients={clientsList || []}
                invoiceContacts={invoiceContacts || []}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Portal Access
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {portalPwOpen ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        placeholder="Min 6 characters"
                        value={portalPw}
                        onChange={(e) => setPortalPw(e.target.value)}
                        className="max-w-xs"
                        data-testid="input-portal-password"
                      />
                      <Button
                        size="sm"
                        onClick={() => setPortalPwMutation.mutate(portalPw)}
                        disabled={setPortalPwMutation.isPending || portalPw.length < 6}
                        data-testid="button-save-portal-password"
                      >
                        {setPortalPwMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setPortalPwOpen(false); setPortalPw(""); }} data-testid="button-cancel-portal-password">
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setPortalPwOpen(true)} data-testid="button-set-portal-password">
                      <Lock className="w-3.5 h-3.5 mr-1.5" />
                      Set Portal Password
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Set or reset the employee's password for the self-service portal.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financials" className="mt-4">
              <FinancialsTab reconciliation={reconciliation || []} employeeId={id!} />
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <DocumentsTab employeeId={id!} documents={documentsList || []} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

const FULL_MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function FinancialsTab({ reconciliation, employeeId }: { reconciliation: ReconciliationPeriod[]; employeeId: string }) {
  const { toast } = useToast();
  const [portalPwOpen, setPortalPwOpen] = useState(false);
  const [portalPw, setPortalPw] = useState("");
  const setPortalPwMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`/api/employees/${employeeId}/set-portal-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal password set", description: "Employee can now log into the portal." });
      setPortalPwOpen(false);
      setPortalPw("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: rateHistory } = useQuery<any[]>({
    queryKey: ["/api/employees", employeeId, "rate-history"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${employeeId}/rate-history`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const totalTimesheetHours = reconciliation.reduce((s, p) => s + p.timesheetHours, 0);
  const totalInvoiced = reconciliation.reduce((s, p) => s + p.invoicedAmount, 0);
  const totalPaid = reconciliation.reduce((s, p) => s + p.paidAmount, 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  const kpis = [
    { label: "Timesheet Hours", value: `${totalTimesheetHours.toFixed(1)}h`, icon: Clock, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800" },
    { label: "Total Invoiced", value: `$${totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Receipt, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800" },
    { label: "Total Paid", value: `$${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: CheckCircle, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800" },
    { label: "Outstanding", value: `$${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: AlertCircle, color: totalOutstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400", bg: totalOutstanding > 0 ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800" : "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800" },
  ];

  function paymentBadge(status: string | null) {
    if (!status) return <span className="text-xs text-muted-foreground">—</span>;
    const styles: Record<string, string> = {
      PAID: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
      SENT: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      AUTHORISED: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
      DRAFT: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700",
      OVERDUE: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
      VOIDED: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    };
    return (
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${styles[status] || styles.DRAFT}`} data-testid={`badge-payment-${status}`}>
        {status}
      </Badge>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`p-3.5 rounded-lg border ${k.bg}`} data-testid={`kpi-${k.label.toLowerCase().replace(/\s/g, "-")}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <k.icon className={`w-4 h-4 ${k.color}`} />
              <span className="text-[11px] font-medium text-muted-foreground">{k.label}</span>
            </div>
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Period Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          {reconciliation.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm" data-testid="text-no-financials">
              No timesheet or invoice data yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-reconciliation">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Period</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">TS Hours</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">Inv Hours</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Variance</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">Invoiced</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">Paid</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.map((p) => {
                    const variance = p.timesheetHours - p.invoicedHours;
                    const hasVariance = Math.abs(variance) > 0.01 && p.invoicedHours > 0 && p.timesheetHours > 0;
                    return (
                      <tr
                        key={`${p.year}-${p.month}`}
                        className={`border-b border-border last:border-0 ${hasVariance ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                        data-testid={`row-period-${p.year}-${p.month}`}
                      >
                        <td className="py-2.5 px-2">
                          <div className="font-medium text-foreground">{FULL_MONTHS[p.month]?.slice(0, 3)} {p.year}</div>
                          {p.invoiceNumber && <div className="text-[10px] text-muted-foreground">{p.invoiceNumber}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <span className="font-mono text-foreground">{p.timesheetHours > 0 ? `${p.timesheetHours}` : "—"}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <span className="font-mono text-foreground">{p.invoicedHours > 0 ? `${p.invoicedHours}` : "—"}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right hidden sm:table-cell">
                          {hasVariance ? (
                            <span className={`font-mono text-xs font-semibold ${variance > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                              {variance > 0 ? "+" : ""}{variance.toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              {p.timesheetHours > 0 && p.invoicedHours > 0 ? <Check className="w-3.5 h-3.5 inline" /> : "—"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <span className="font-mono text-foreground">
                            {p.invoicedAmount > 0 ? `$${p.invoicedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <span className={`font-mono ${p.paidAmount > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                            {p.paidAmount > 0 ? `$${p.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {paymentBadge(p.paymentStatus || p.invoiceStatus || p.timesheetStatus)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Portal Access */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Portal Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Set a password so this employee can log into the employee portal.
            </p>
            {!portalPwOpen ? (
              <Button size="sm" variant="outline" onClick={() => setPortalPwOpen(true)} data-testid="button-open-set-portal-pw">
                <Lock className="w-3.5 h-3.5 mr-1.5" /> Set Portal Password
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  className="h-8 text-sm border rounded px-3 w-48 bg-background"
                  placeholder="Min. 6 characters"
                  value={portalPw}
                  onChange={e => setPortalPw(e.target.value)}
                  data-testid="input-portal-password"
                />
                <Button size="sm" disabled={portalPw.length < 6 || setPortalPwMutation.isPending}
                  onClick={() => setPortalPwMutation.mutate(portalPw)}
                  data-testid="button-confirm-portal-pw">
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setPortalPwOpen(false); setPortalPw(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {rateHistory && rateHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Rate History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-rate-history">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Effective Date</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Client</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">Pay Rate (Incl Super, Ex GST)</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">Charge-Out (Ex GST)</th>
                    <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground">Super %</th>
                    <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rateHistory.map((rh: any, idx: number) => (
                    <tr key={rh.id} className={`border-b border-border/50 ${idx === 0 ? "bg-blue-50/50 dark:bg-blue-900/20" : ""}`} data-testid={`row-rate-history-${idx}`}>
                      <td className="py-2.5 px-2 text-foreground">
                        {rh.effectiveDate ? new Date(rh.effectiveDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        {idx === 0 && <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">Current</Badge>}
                      </td>
                      <td className="py-2.5 px-2 text-foreground text-xs">{rh.clientName || "—"}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-foreground">${parseFloat(rh.payRate).toFixed(2)}/hr</td>
                      <td className="py-2.5 px-2 text-right font-mono text-foreground">{rh.chargeOutRate ? `$${parseFloat(rh.chargeOutRate).toFixed(2)}/hr` : "—"}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-foreground">{rh.superPercent ? `${parseFloat(rh.superPercent).toFixed(1)}%` : "—"}</td>
                      <td className="py-2.5 px-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rh.source}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const DOC_CATEGORIES = [
  "Contract",
  "Tax File Number Declaration",
  "Super Choice Form",
  "ID Verification",
  "Police Check",
  "Working With Vulnerable People",
  "Qualification / Certification",
  "Other",
] as const;

const CATEGORY_ICONS: Record<string, any> = {
  "Contract": FileBadge,
  "Tax File Number Declaration": Landmark,
  "Super Choice Form": CreditCard,
  "ID Verification": IdCard,
  "Police Check": Search,
  "Working With Vulnerable People": ShieldCheck,
  "Qualification / Certification": GraduationCap,
  "Other": File,
};

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab({ employeeId, documents }: { employeeId: string; documents: Document[] }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [category, setCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (payload: { name: string; category: string; fileType: string; fileUrl: string; fileSize: number }) => {
      const res = await apiRequest("POST", `/api/documents/${employeeId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", employeeId] });
      toast({ title: "Uploaded", description: "Document uploaded successfully." });
      setFile(null);
      setCustomName("");
      setCategory(DOC_CATEGORIES[0]);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      setDeletingId(docId);
      const res = await apiRequest("DELETE", `/api/documents/doc/${docId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", employeeId] });
      toast({ title: "Deleted", description: "Document removed." });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setDeletingId(null);
    },
  });

  const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const validateFile = (f: File): boolean => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast({ title: "Invalid file", description: "Please upload PDF, image, or Word document.", variant: "destructive" });
      return false;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "File must be under 10 MB.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleFile = useCallback((f: File) => {
    if (validateFile(f)) {
      setFile(f);
      if (!customName) setCustomName(f.name.replace(/\.[^.]+$/, ""));
    }
  }, [customName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        name: customName || file.name,
        category,
        fileType: file.type,
        fileUrl: reader.result as string,
        fileSize: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-lg" data-testid="text-no-documents">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">No documents uploaded yet.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const IconComp = CATEGORY_ICONS[doc.category || "Other"] || File;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 py-3 px-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                    data-testid={`document-row-${doc.id}`}
                  >
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <IconComp className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate" data-testid={`text-doc-name-${doc.id}`}>
                        {doc.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {doc.category || doc.type}
                        {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ""}
                        {" · "}
                        {new Date(doc.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {doc.fileUrl && (
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-view-doc-${doc.id}`}>
                          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deletingId === doc.id}
                        data-testid={`button-delete-doc-${doc.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {deletingId === doc.id ? "..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-primary bg-primary/5"
                : file
                  ? "border-green-500 bg-green-50 dark:bg-green-900/10"
                  : "border-border hover:border-primary/50"
            }`}
            data-testid="dropzone-document"
          >
            {file ? (
              <>
                <FileText className="w-6 h-6 mx-auto text-green-600 dark:text-green-400 mb-1.5" />
                <div className="text-xs font-semibold text-green-700 dark:text-green-300 truncate">{file.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{formatFileSize(file.size)}</div>
              </>
            ) : (
              <>
                <CloudUpload className="w-7 h-7 mx-auto text-muted-foreground mb-1.5" />
                <div className="text-xs text-muted-foreground">
                  Drag & drop or <span className="text-primary font-semibold">browse</span>
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">PDF, Word, images — max 10 MB</div>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
            data-testid="input-document-file"
          />

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Document Name</label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Employment Contract 2024"
              className="h-8 text-sm"
              data-testid="input-document-name"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-document-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploadMutation.isPending || !file}
            className="w-full"
            data-testid="button-upload-document"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PlacementsCard({ employeeId, placements, clients, invoiceContacts }: { employeeId: string; placements: Placement[]; clients: Client[]; invoiceContacts: { name: string; xeroContactId: string | null }[] }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [endingPlacementId, setEndingPlacementId] = useState<string | null>(null);
  const [endDateValue, setEndDateValue] = useState(new Date().toISOString().split("T")[0]);
  const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    clientId: "",
    clientName: "",
    startDate: "",
    endDate: "",
    chargeOutRate: "",
    payRate: "",
    payrollFeePercent: "",
    notes: "",
    rateEffectiveDate: "",
  });
  const [formData, setFormData] = useState({
    clientId: "",
    clientName: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    chargeOutRate: "",
    payRate: "",
    payrollFeePercent: "",
    notes: "",
    status: "ACTIVE" as "ACTIVE" | "ENDED",
  });

  const startEditing = (p: Placement) => {
    setEditingPlacementId(p.id);
    setEndingPlacementId(null);
    setEditData({
      clientId: p.clientId || "",
      clientName: p.clientName || "",
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      chargeOutRate: p.chargeOutRate || "",
      payRate: p.payRate || "",
      payrollFeePercent: p.payrollFeePercent || "0",
      notes: p.notes || "",
      rateEffectiveDate: new Date().toISOString().split("T")[0],
    });
  };

  const cancelEditing = () => {
    setEditingPlacementId(null);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/employees/${employeeId}/placements`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId] });
      toast({ title: "Placement Added", description: "New placement created." });
      setShowForm(false);
      setFormData({ clientId: "", clientName: "", startDate: new Date().toISOString().split("T")[0], endDate: "", chargeOutRate: "", payRate: "", payrollFeePercent: "", notes: "", status: "ACTIVE" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ placementId, data }: { placementId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/placements/${placementId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "placements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "rate-history"] });
      toast({ title: "Placement Updated", description: "Placement details saved." });
      setEditingPlacementId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveEdit = (placementId: string) => {
    const client = clients.find(c => c.id === editData.clientId);
    editMutation.mutate({
      placementId,
      data: {
        clientId: editData.clientId || null,
        clientName: client?.name || editData.clientName || null,
        startDate: editData.startDate || null,
        endDate: editData.endDate || null,
        chargeOutRate: editData.chargeOutRate || null,
        payRate: editData.payRate || null,
        payrollFeePercent: editData.payrollFeePercent || "0",
        notes: editData.notes || null,
        rateEffectiveDate: editData.rateEffectiveDate || null,
      },
    });
  };

  const endMutation = useMutation({
    mutationFn: async ({ placementId, endDate }: { placementId: string; endDate: string }) => {
      const res = await apiRequest("PATCH", `/api/placements/${placementId}`, { status: "ENDED", endDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "placements"] });
      toast({ title: "Placement Ended" });
    },
  });

  const activePlacements = placements.filter(p => p.status === "ACTIVE");
  const endedPlacements = placements.filter(p => p.status === "ENDED");

  const handleSubmit = () => {
    if (formData.status === "ENDED" && !formData.endDate) {
      toast({ title: "End date required", description: "Please provide an end date for an ended placement.", variant: "destructive" });
      return;
    }
    if (formData.status === "ENDED" && formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      toast({ title: "Invalid dates", description: "End date cannot be before start date.", variant: "destructive" });
      return;
    }
    const client = clients.find(c => c.id === formData.clientId);
    createMutation.mutate({
      clientId: formData.clientId || null,
      clientName: client?.name || formData.clientName || null,
      startDate: formData.startDate || null,
      endDate: formData.status === "ACTIVE" ? null : formData.endDate || null,
      chargeOutRate: formData.chargeOutRate || null,
      payRate: formData.payRate || null,
      payrollFeePercent: formData.payrollFeePercent || "0",
      notes: formData.notes || null,
      status: formData.status,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Placements
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)} data-testid="button-add-placement">
            {showForm ? <X className="w-4 h-4 mr-1" /> : <Pencil className="w-4 h-4 mr-1" />}
            {showForm ? "Cancel" : "Add Placement"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Client</label>
                <Select value={formData.clientId || "__none__"} onValueChange={(v) => setFormData(prev => ({ ...prev, clientId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-placement-client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select a client...</SelectItem>
                    {invoiceContacts.length > 0
                      ? invoiceContacts.map((c) => {
                          const matchedClient = clients.find(cl => cl.name === c.name);
                          return <SelectItem key={c.name} value={matchedClient?.id || c.name}>{c.name}</SelectItem>;
                        })
                      : clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as "ACTIVE" | "ENDED" }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-placement-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ENDED">Ended (Historical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                <Input type="date" className="h-8 text-sm" value={formData.startDate} onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))} data-testid="input-placement-start" />
              </div>
              {formData.status === "ENDED" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                  <Input type="date" className="h-8 text-sm" value={formData.endDate} onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))} data-testid="input-placement-end" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Charge Out Rate (Ex GST)</label>
                <Input type="number" className="h-8 text-sm" placeholder="$/hr" value={formData.chargeOutRate} onChange={(e) => setFormData(prev => ({ ...prev, chargeOutRate: e.target.value }))} data-testid="input-placement-charge-rate" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pay Rate (Incl Super, Ex GST)</label>
                <Input type="number" className="h-8 text-sm" placeholder="$/hr" value={formData.payRate} onChange={(e) => setFormData(prev => ({ ...prev, payRate: e.target.value }))} data-testid="input-placement-pay-rate" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Payroll Fee %</label>
                <Input type="number" className="h-8 text-sm" placeholder="%" value={formData.payrollFeePercent} onChange={(e) => setFormData(prev => ({ ...prev, payrollFeePercent: e.target.value }))} data-testid="input-placement-fee" />
              </div>
            </div>
            <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-placement">
              <Check className="w-4 h-4 mr-1" />
              {createMutation.isPending ? "Saving..." : "Save Placement"}
            </Button>
          </div>
        )}

        {activePlacements.length === 0 && endedPlacements.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-placements">No placements recorded.</p>
        )}

        {activePlacements.map((p) => (
          <div key={p.id} className="p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" data-testid={`placement-active-${p.id}`}>
            {editingPlacementId === p.id ? (
              <PlacementEditForm
                editData={editData}
                setEditData={setEditData}
                clients={clients}
                onSave={() => handleSaveEdit(p.id)}
                onCancel={cancelEditing}
                isPending={editMutation.isPending}
                placementId={p.id}
                originalChargeOutRate={p.chargeOutRate || ""}
                originalPayRate={p.payRate || ""}
              />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">Active</Badge>
                    <span className="text-sm font-semibold">{p.clientName || "Unknown Client"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {endingPlacementId === p.id ? (
                      <>
                        <Input
                          type="date"
                          className="h-7 text-xs w-36"
                          value={endDateValue}
                          onChange={(e) => setEndDateValue(e.target.value)}
                          data-testid={`input-end-date-${p.id}`}
                        />
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            endMutation.mutate({ placementId: p.id, endDate: endDateValue });
                            setEndingPlacementId(null);
                          }}
                          disabled={endMutation.isPending || !endDateValue}
                          data-testid={`button-confirm-end-${p.id}`}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEndingPlacementId(null)}
                          data-testid={`button-cancel-end-${p.id}`}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(p)}
                          data-testid={`button-edit-placement-${p.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setEndDateValue(new Date().toISOString().split("T")[0]);
                            setEndingPlacementId(p.id);
                          }}
                          disabled={endMutation.isPending}
                          data-testid={`button-end-placement-${p.id}`}
                        >
                          End Placement
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span>From: {p.startDate || "N/A"}</span>
                  {p.chargeOutRate && <span>Charge (Ex GST): ${p.chargeOutRate}/hr</span>}
                  {p.payRate && <span>Pay (Ex GST): ${p.payRate}/hr</span>}
                  {p.payrollFeePercent && parseFloat(p.payrollFeePercent) > 0 && <span>Fee: {p.payrollFeePercent}%</span>}
                  {p.notes && <span className="truncate max-w-[200px]">Notes: {p.notes}</span>}
                </div>
              </>
            )}
          </div>
        ))}

        {endedPlacements.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">History</div>
            {endedPlacements.map((p) => (
              <div key={p.id} className={`p-3 border rounded-lg ${editingPlacementId === p.id ? "" : "opacity-60"}`} data-testid={`placement-ended-${p.id}`}>
                {editingPlacementId === p.id ? (
                  <PlacementEditForm
                    editData={editData}
                    setEditData={setEditData}
                    clients={clients}
                    onSave={() => handleSaveEdit(p.id)}
                    onCancel={cancelEditing}
                    isPending={editMutation.isPending}
                    placementId={p.id}
                    originalChargeOutRate={p.chargeOutRate || ""}
                    originalPayRate={p.payRate || ""}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">Ended</Badge>
                        <span className="text-sm font-medium">{p.clientName || "Unknown Client"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(p)}
                        data-testid={`button-edit-placement-${p.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>{p.startDate || "N/A"} — {p.endDate || "N/A"}</span>
                      {p.chargeOutRate && <span>Charge (Ex GST): ${p.chargeOutRate}/hr</span>}
                      {p.payRate && <span>Pay (Ex GST): ${p.payRate}/hr</span>}
                      {p.payrollFeePercent && parseFloat(p.payrollFeePercent) > 0 && <span>Fee: {p.payrollFeePercent}%</span>}
                      {p.notes && <span className="truncate max-w-[200px]">Notes: {p.notes}</span>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlacementEditForm({
  editData,
  setEditData,
  clients,
  onSave,
  onCancel,
  isPending,
  placementId,
  originalChargeOutRate,
  originalPayRate,
}: {
  editData: { clientId: string; clientName: string; startDate: string; endDate: string; chargeOutRate: string; payRate: string; payrollFeePercent: string; notes: string; rateEffectiveDate?: string };
  setEditData: (v: any) => void;
  originalChargeOutRate?: string;
  originalPayRate?: string;
  clients: Client[];
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  placementId: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Client</label>
          <Select
            value={editData.clientId || "__none__"}
            onValueChange={(v) => setEditData((prev: any) => ({ ...prev, clientId: v === "__none__" ? "" : v }))}
          >
            <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-client-${placementId}`}>
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select a client...</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
          <Input
            type="date"
            className="h-8 text-sm"
            value={editData.startDate}
            onChange={(e) => setEditData((prev: any) => ({ ...prev, startDate: e.target.value }))}
            data-testid={`input-edit-start-${placementId}`}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
          <Input
            type="date"
            className="h-8 text-sm"
            value={editData.endDate}
            onChange={(e) => setEditData((prev: any) => ({ ...prev, endDate: e.target.value }))}
            data-testid={`input-edit-end-${placementId}`}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Charge Out Rate (Ex GST)</label>
          <Input
            type="number"
            className="h-8 text-sm"
            placeholder="$/hr"
            value={editData.chargeOutRate}
            onChange={(e) => setEditData((prev: any) => ({ ...prev, chargeOutRate: e.target.value }))}
            data-testid={`input-edit-charge-rate-${placementId}`}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Pay Rate (Ex GST)</label>
          <Input
            type="number"
            className="h-8 text-sm"
            placeholder="$/hr"
            value={editData.payRate}
            onChange={(e) => setEditData((prev: any) => ({ ...prev, payRate: e.target.value }))}
            data-testid={`input-edit-pay-rate-${placementId}`}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Payroll Fee %</label>
          <Input
            type="number"
            className="h-8 text-sm"
            placeholder="%"
            value={editData.payrollFeePercent}
            onChange={(e) => setEditData((prev: any) => ({ ...prev, payrollFeePercent: e.target.value }))}
            data-testid={`input-edit-fee-${placementId}`}
          />
        </div>
      </div>
      {((editData.chargeOutRate !== (originalChargeOutRate || "")) || (editData.payRate !== (originalPayRate || ""))) && (
        <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <label className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 block">Rate Change Effective Date</label>
          <Input
            type="date"
            className="h-8 text-sm"
            value={editData.rateEffectiveDate || ""}
            onChange={(e) => setEditData((prev: any) => ({ ...prev, rateEffectiveDate: e.target.value }))}
            data-testid={`input-edit-rate-effective-${placementId}`}
          />
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">This date will be recorded in rate history for forecasting</p>
        </div>
      )}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
        <Input
          className="h-8 text-sm"
          placeholder="Notes..."
          value={editData.notes}
          onChange={(e) => setEditData((prev: any) => ({ ...prev, notes: e.target.value }))}
          data-testid={`input-edit-notes-${placementId}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={isPending} data-testid={`button-save-edit-${placementId}`}>
          <Check className="w-4 h-4 mr-1" />
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid={`button-cancel-edit-${placementId}`}>
          <X className="w-4 h-4 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, testId }: { icon: any; label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-sm text-foreground truncate" data-testid={testId}>{value}</span>
    </div>
  );
}

interface EditableFieldProps {
  icon: any;
  label: string;
  field: string;
  value: string;
  rawValue?: string;
  editingField: string | null;
  editValues: Record<string, string>;
  setEditValues: (v: Record<string, string>) => void;
  onStartEdit: (field: string, value: string) => void;
  onSave: (field: string) => void;
  onCancel: () => void;
  isPending: boolean;
  testId: string;
  locked?: boolean;
}

function EditableField({
  icon: Icon, label, field, value, rawValue, editingField, editValues,
  setEditValues, onStartEdit, onSave, onCancel, isPending, testId, locked
}: EditableFieldProps) {
  const isEditing = editingField === field;

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">{label}:</span>
        <Input
          value={editValues[field] || ""}
          onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
          className="h-7 text-sm flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(field);
            if (e.key === "Escape") onCancel();
          }}
          data-testid={`input-edit-${field}`}
        />
        <Button variant="ghost" size="icon" onClick={() => onSave(field)} disabled={isPending} data-testid={`button-save-${field}`}>
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onCancel} data-testid={`button-cancel-${field}`}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-sm text-foreground truncate" data-testid={testId}>{value}</span>
      {locked ? (
        <Lock className="w-3 h-3 text-muted-foreground/50" data-testid={`icon-locked-${field}`} />
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="invisible group-hover:visible"
          onClick={() => onStartEdit(field, rawValue !== undefined ? rawValue : value)}
          data-testid={`button-edit-${field}`}
        >
          <Pencil className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
