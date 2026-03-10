import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InvoiceLineItem, InvoicePayment } from "@shared/schema";
import {
  Users, Clock, FileText, CreditCard, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowUpDown, DollarSign, Percent,
  ExternalLink, Loader2, Send, Building2, UploadCloud,
} from "lucide-react";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface TimesheetEntry {
  id: string; hours: number; regularHours: number; overtimeHours: number; status: string; grossValue: number;
  clientId?: string | null; placementId?: string | null; fileName?: string | null;
}

interface InvoiceEntry {
  id: string; amount: number; amountExGst: number; invoiceNumber: string | null; status: string;
  paidDate: string | null; issueDate?: string | null; month?: number; year?: number; description?: string | null;
}

interface ReconciliationRow {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    clientName: string | null;
    hourlyRate: string | null;
    chargeOutRate: string | null;
    paymentMethod: string | null;
    payrollFeePercent: string | null;
    companyName?: string | null;
  };
  timesheet: TimesheetEntry | null;
  timesheets?: TimesheetEntry[];
  timesheetSummary?: { totalHours: number; status: string | null; count: number };
  invoice: InvoiceEntry | null;
  invoices?: InvoiceEntry[];
  invoiceSummary?: { totalExGst: number; totalInclGst: number; count: number; allPaid: boolean };
  payroll: { payRunId: string | null; grossEarnings: number; netPay: number; hoursWorked: number; payRunStatus: string | null; paygWithheld?: number; superAmount?: number } | null;
  contractorCost?: { total: number; transactionCount: number; companyName: string | null } | null;
  financials: { expectedRevenue: number; employeeCost: number; margin: number; marginPercent: number; payrollFeeRevenue: number };
}

interface ReconciliationData {
  employees: ReconciliationRow[];
  cashFlow: { cashIn: number; cashOut: number; netCashFlow: number };
  totals: { totalRevenue: number; totalCost: number; totalMargin: number; totalPayrollFeeRevenue: number };
}

function StatusIcon({ status, type }: { status: "complete" | "partial" | "missing"; type: string }) {
  if (status === "complete") return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" data-testid={`icon-${type}-complete`} />;
  if (status === "partial") return <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" data-testid={`icon-${type}-partial`} />;
  return <XCircle className="w-4 h-4 text-red-400 dark:text-red-500" data-testid={`icon-${type}-missing`} />;
}

function getTimesheetStatus(row: ReconciliationRow): "complete" | "partial" | "missing" {
  const summary = row.timesheetSummary;
  if (summary && summary.count > 0) {
    if (summary.status === "APPROVED") return "complete";
    return "partial";
  }
  if (!row.timesheet) return "missing";
  if (row.timesheet.status === "APPROVED") return "complete";
  return "partial";
}

function getInvoiceStatus(row: ReconciliationRow): "complete" | "partial" | "missing" {
  const summary = row.invoiceSummary;
  if (summary && summary.count > 0) {
    if (summary.allPaid) return "complete";
    return "partial";
  }
  if (!row.invoice) return "missing";
  if (row.invoice.status === "PAID") return "complete";
  return "partial";
}

function getPayrollStatus(row: ReconciliationRow): "complete" | "partial" | "missing" {
  if (row.employee.paymentMethod === "INVOICE") {
    return row.contractorCost && row.contractorCost.total > 0 ? "complete" : "missing";
  }
  if (!row.payroll) return "missing";
  if (row.payroll.payRunStatus === "FILED") return "complete";
  return "partial";
}

function getRowCompleteness(row: ReconciliationRow): { complete: number; total: number; status: "complete" | "partial" | "missing" } {
  const ts = getTimesheetStatus(row);
  const inv = getInvoiceStatus(row);
  const pay = getPayrollStatus(row);
  const items = [ts, inv, pay];
  const complete = items.filter(i => i === "complete").length;
  const status = complete === 3 ? "complete" : complete > 0 ? "partial" : "missing";
  return { complete, total: 3, status };
}

function rowBg(row: ReconciliationRow): string {
  const { status } = getRowCompleteness(row);
  if (status === "complete") return "bg-green-50/50 dark:bg-green-950/20";
  return "";
}

function fmtCurrency(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrencyFull(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

export default function ReconciliationPage() {
  const [, navigate] = useLocation();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [timesheetDetail, setTimesheetDetail] = useState<{ row: ReconciliationRow } | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<{ row: ReconciliationRow } | null>(null);
  const [payrollDetail, setPayrollDetail] = useState<{ row: ReconciliationRow } | null>(null);

  const { data, isLoading } = useQuery<ReconciliationData>({
    queryKey: ["/api/reconciliation", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/reconciliation?month=${month}&year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const rows = data?.employees || [];
  const cashFlow = data?.cashFlow || { cashIn: 0, cashOut: 0, netCashFlow: 0 };
  const totals = data?.totals || { totalRevenue: 0, totalCost: 0, totalMargin: 0, totalPayrollFeeRevenue: 0 };
  const total = rows.length;
  const tsReceived = rows.filter((r) => (r.timesheetSummary?.count || 0) > 0 || !!r.timesheet).length;
  const tsApproved = rows.filter((r) => (r.timesheetSummary?.status === "APPROVED") || (r.timesheet?.status === "APPROVED")).length;
  const invRaised = rows.filter((r) => (r.invoiceSummary?.count || 0) > 0 || !!r.invoice).length;
  const invPaid = rows.filter((r) => r.invoiceSummary?.allPaid || r.invoice?.status === "PAID").length;

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const marginPercent = totals.totalRevenue > 0 ? Math.round((totals.totalMargin / totals.totalRevenue) * 100) : 0;

  const payrollEmployees = rows.filter(r => r.employee.paymentMethod !== "INVOICE");
  const contractorEmployees = rows.filter(r => r.employee.paymentMethod === "INVOICE");
  const payrollWithCost = payrollEmployees.filter(r => r.payroll?.payRunStatus === "FILED").length;
  const contractorsWithCost = contractorEmployees.filter(r => r.contractorCost && r.contractorCost.total > 0).length;
  const costComplete = payrollWithCost + contractorsWithCost;

  const completeRows = rows.filter(r => getRowCompleteness(r).status === "complete").length;
  const completenessPercent = total > 0 ? Math.round((completeRows / total) * 100) : 0;

  const currentYear = new Date().getFullYear();
  const yearRange = Array.from({ length: currentYear - 2022 + 2 }, (_, i) => 2022 + i);

  const kpis = [
    {
      label: "Completeness",
      value: `${completenessPercent}%`,
      icon: CheckCircle,
      color: completenessPercent === 100 ? "text-green-600 dark:text-green-400" : completenessPercent >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400",
      bg: completenessPercent === 100
        ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
        : completenessPercent >= 50
          ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"
          : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800",
      sub: `${completeRows}/${total} employees complete`,
    },
    {
      label: "Timesheets",
      value: `${tsReceived}/${total}`,
      icon: Clock,
      color: tsReceived === total ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400",
      bg: tsReceived === total
        ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
        : "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
      sub: `${tsApproved} approved`,
    },
    {
      label: "Invoices",
      value: `${invRaised}/${total}`,
      icon: FileText,
      color: invPaid === total ? "text-green-600 dark:text-green-400" : "text-violet-600 dark:text-violet-400",
      bg: invPaid === total
        ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
        : "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800",
      sub: `${invPaid} paid`,
    },
    {
      label: "Cost Tracking",
      value: `${costComplete}/${total}`,
      icon: CreditCard,
      color: costComplete === total ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400",
      bg: costComplete === total
        ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
        : "bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800",
      sub: `${payrollWithCost} payroll, ${contractorsWithCost} contractor`,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Monthly Reconciliation"
        subtitle="Track workflow completion across all employees"
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth} data-testid="button-prev-month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger className="h-8 w-[130px] text-sm font-semibold" data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.slice(1).map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger className="h-8 w-[80px] text-sm font-semibold" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearRange.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth} data-testid="button-next-month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className={`p-3.5 rounded-lg border ${k.bg}`} data-testid={`kpi-${k.label.toLowerCase()}`}>
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                  <span className="text-[11px] font-medium text-muted-foreground">{k.label}</span>
                </div>
                <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-lg border bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800" data-testid="kpi-revenue">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] font-medium text-muted-foreground">Expected Revenue</span>
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totals.totalRevenue)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Based on charge-out rates</div>
            </div>
            <div className="p-3.5 rounded-lg border bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800" data-testid="kpi-cost">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-[11px] font-medium text-muted-foreground">Employee Cost</span>
              </div>
              <div className="text-xl font-bold text-red-600 dark:text-red-400">{fmtCurrency(totals.totalCost)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Payroll gross or pay rate</div>
            </div>
            <div className={`p-3.5 rounded-lg border ${totals.totalMargin >= 0 ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"}`} data-testid="kpi-margin">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className={`w-4 h-4 ${totals.totalMargin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} />
                <span className="text-[11px] font-medium text-muted-foreground">Gross Margin</span>
              </div>
              <div className={`text-xl font-bold ${totals.totalMargin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{fmtCurrency(totals.totalMargin)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{marginPercent}% margin</div>
            </div>
            <div className="p-3.5 rounded-lg border bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800" data-testid="kpi-payroll-fee">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="text-[11px] font-medium text-muted-foreground">Payroll Fee Revenue</span>
              </div>
              <div className="text-xl font-bold text-violet-600 dark:text-violet-400">{fmtCurrency(totals.totalPayrollFeeRevenue)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">1.4-2% of gross payroll</div>
            </div>
            <div className={`p-3.5 rounded-lg border ${cashFlow.netCashFlow >= 0 ? "bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800" : "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"}`} data-testid="kpi-cashflow">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpDown className={`w-4 h-4 ${cashFlow.netCashFlow >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`} />
                <span className="text-[11px] font-medium text-muted-foreground">Net Cash Flow</span>
              </div>
              <div className={`text-xl font-bold ${cashFlow.netCashFlow >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`}>{fmtCurrency(cashFlow.netCashFlow)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">In: {fmtCurrency(cashFlow.cashIn)} / Out: {fmtCurrency(cashFlow.cashOut)}</div>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Employee Status — {MONTHS[month]} {year}</span>
                {total > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {completeRows}/{total} fully complete
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-no-employees">
                  No active employees found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-reconciliation">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Employee</th>
                        <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Client</th>
                        <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">
                          <div className="flex items-center justify-center gap-1"><Clock className="w-3 h-3" />Timesheet</div>
                        </th>
                        <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">
                          <div className="flex items-center justify-center gap-1"><FileText className="w-3 h-3" />Invoice</div>
                        </th>
                        <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">
                          <div className="flex items-center justify-center gap-1"><CreditCard className="w-3 h-3" />Payroll</div>
                        </th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Revenue</th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Cost</th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Margin</th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Payroll Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const tsStatus = getTimesheetStatus(row);
                        const invStatus = getInvoiceStatus(row);
                        const payStatus = getPayrollStatus(row);
                        const isContractor = row.employee.paymentMethod === "INVOICE";

                        return (
                          <tr
                            key={row.employee.id}
                            className={`border-b border-border last:border-0 transition-colors ${rowBg(row)}`}
                            data-testid={`row-employee-${row.employee.id}`}
                          >
                            <td className="py-3 px-2">
                              <Link href={`/employees/${row.employee.id}`}>
                                <span className="text-sm font-semibold text-primary hover:underline cursor-pointer" data-testid={`link-employee-${row.employee.id}`}>
                                  {row.employee.firstName} {row.employee.lastName}
                                </span>
                              </Link>
                              {isContractor && (
                                <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 font-normal text-muted-foreground border-border" title={row.employee.companyName || undefined}>
                                  Contractor
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-2 hidden sm:table-cell">
                              <span className="text-xs text-muted-foreground">{row.employee.clientName || "—"}</span>
                            </td>
                            <td className="py-3 px-2">
                              <div
                                className="group flex items-center justify-center gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors"
                                onClick={() => setTimesheetDetail({ row })}
                                title="View timesheet details"
                                data-testid={`cell-ts-${row.employee.id}`}
                              >
                                <StatusIcon status={tsStatus} type="ts" />
                                <div className="text-center min-w-[60px]">
                                  {(row.timesheetSummary?.count || 0) > 0 ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-primary">{row.timesheetSummary!.totalHours}h</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {row.timesheetSummary!.status}
                                        {(row.timesheetSummary!.count || 0) > 1 && <span className="ml-0.5">({row.timesheetSummary!.count})</span>}
                                      </div>
                                    </>
                                  ) : row.timesheet ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-primary">{row.timesheet.hours}h</div>
                                      <div className="text-[10px] text-muted-foreground">{row.timesheet.status}</div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">Missing</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div
                                className="flex items-center justify-center gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors"
                                onClick={() => setInvoiceDetail({ row })}
                                title={row.invoiceSummary && row.invoiceSummary.count > 0 ? `${row.invoiceSummary.count} invoice(s)` : row.invoice ? `Invoice ${row.invoice.invoiceNumber || ""}` : "No invoice — click to view"}
                                data-testid={`cell-inv-${row.employee.id}`}
                              >
                                <StatusIcon status={invStatus} type="inv" />
                                <div className="text-center min-w-[70px]">
                                  {row.invoiceSummary && row.invoiceSummary.count > 0 ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-primary">{fmtCurrency(row.invoiceSummary.totalInclGst)}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {row.invoiceSummary.allPaid ? "PAID" : row.invoice?.status || "—"}
                                        {row.invoiceSummary.count > 1 && <span className="ml-0.5">({row.invoiceSummary.count})</span>}
                                      </div>
                                    </>
                                  ) : row.invoice ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-primary">{fmtCurrency(row.invoice.amount)}</div>
                                      <div className="text-[10px] text-muted-foreground">{row.invoice.status}</div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">Missing</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              {isContractor ? (
                                <div
                                  className="flex items-center justify-center gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors"
                                  onClick={() => setPayrollDetail({ row })}
                                  title={row.contractorCost ? `${row.contractorCost.transactionCount} payment(s)` : "No contractor payments"}
                                  data-testid={`cell-pay-${row.employee.id}`}
                                >
                                  <StatusIcon status={payStatus} type="pay" />
                                  <div className="text-center min-w-[70px]">
                                    {row.contractorCost && row.contractorCost.total > 0 ? (
                                      <>
                                        <div className="font-mono text-xs font-semibold text-primary">{fmtCurrency(row.contractorCost.total)}</div>
                                        <div className="text-[10px] text-muted-foreground">{row.contractorCost.companyName}</div>
                                      </>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">No payment</div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="flex items-center justify-center gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors"
                                  onClick={() => setPayrollDetail({ row })}
                                  title={row.payroll ? "View payroll details" : "No payroll data"}
                                  data-testid={`cell-pay-${row.employee.id}`}
                                >
                                  <StatusIcon status={payStatus} type="pay" />
                                  <div className="text-center min-w-[70px]">
                                    {row.payroll ? (
                                      <>
                                        <div className="font-mono text-xs font-semibold text-primary">{fmtCurrency(row.payroll.netPay)}</div>
                                        <div className="text-[10px] text-muted-foreground">{row.payroll.payRunStatus}</div>
                                      </>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">Missing</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 hidden md:table-cell">
                              <div className="text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                {row.financials.expectedRevenue > 0 ? fmtCurrency(row.financials.expectedRevenue) : "—"}
                              </div>
                            </td>
                            <td className="py-3 px-2 hidden md:table-cell">
                              <div className="text-right font-mono text-xs font-semibold text-red-600 dark:text-red-400">
                                {row.financials.employeeCost > 0 ? fmtCurrency(row.financials.employeeCost) : "—"}
                              </div>
                            </td>
                            <td className="py-3 px-2 hidden md:table-cell">
                              <div className={`text-right font-mono text-xs font-semibold ${row.financials.margin >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                {row.financials.expectedRevenue > 0 ? (
                                  <>
                                    {fmtCurrency(row.financials.margin)}
                                    <div className="text-[10px] text-muted-foreground font-normal">{row.financials.marginPercent}%</div>
                                  </>
                                ) : "—"}
                              </div>
                            </td>
                            <td className="py-3 px-2 hidden lg:table-cell">
                              <div className="text-right font-mono text-xs font-semibold text-violet-700 dark:text-violet-400">
                                {row.financials.payrollFeeRevenue > 0 ? fmtCurrency(row.financials.payrollFeeRevenue) : "—"}
                                {row.employee.payrollFeePercent && parseFloat(row.employee.payrollFeePercent) > 0 && (
                                  <div className="text-[10px] text-muted-foreground font-normal">{parseFloat(row.employee.payrollFeePercent).toFixed(1)}%</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length > 0 && (
                        <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                          <td className="py-3 px-2 text-xs" colSpan={5}>Totals</td>
                          <td className="py-3 px-2 hidden md:table-cell text-right font-mono text-xs text-emerald-700 dark:text-emerald-400">{fmtCurrency(totals.totalRevenue)}</td>
                          <td className="py-3 px-2 hidden md:table-cell text-right font-mono text-xs text-red-600 dark:text-red-400">{fmtCurrency(totals.totalCost)}</td>
                          <td className="py-3 px-2 hidden md:table-cell text-right font-mono text-xs text-green-700 dark:text-green-400">{fmtCurrency(totals.totalMargin)}<div className="text-[10px] text-muted-foreground font-normal">{marginPercent}%</div></td>
                          <td className="py-3 px-2 hidden lg:table-cell text-right font-mono text-xs text-violet-700 dark:text-violet-400">{fmtCurrency(totals.totalPayrollFeeRevenue)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Timesheets", count: tsReceived, total, approved: tsApproved, color: "bg-blue-500" },
                { label: "Invoices", count: invRaised, total, approved: invPaid, color: "bg-violet-500" },
                { label: "Cost Tracking", count: costComplete, total, approved: costComplete, color: "bg-orange-500" },
              ].map((bar) => (
                <Card key={bar.label}>
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground">{bar.label}</span>
                      <span className="text-xs font-bold text-foreground">{bar.count}/{bar.total}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${bar.color}`}
                        style={{ width: `${bar.total > 0 ? (bar.count / bar.total) * 100 : 0}%` }}
                        data-testid={`progress-${bar.label.toLowerCase()}`}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {bar.total > 0 ? Math.round((bar.count / bar.total) * 100) : 0}% received
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {timesheetDetail && (
        <TimesheetDetailDialog
          row={timesheetDetail.row}
          month={month}
          year={year}
          onClose={() => setTimesheetDetail(null)}
        />
      )}

      {invoiceDetail && (
        <InvoiceDetailDialog
          row={invoiceDetail.row}
          month={month}
          year={year}
          onClose={() => setInvoiceDetail(null)}
        />
      )}

      {payrollDetail && (
        <PayrollDetailDialog
          row={payrollDetail.row}
          month={month}
          year={year}
          onClose={() => setPayrollDetail(null)}
        />
      )}
    </div>
  );
}

function TimesheetDetailDialog({
  row,
  month,
  year,
  onClose,
}: {
  row: ReconciliationRow;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const allTs = row.timesheets && row.timesheets.length > 0 ? row.timesheets : (row.timesheet ? [row.timesheet] : []);
  const summary = row.timesheetSummary || { totalHours: row.timesheet?.hours || 0, status: row.timesheet?.status || null, count: allTs.length };
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const editTs = editIdx !== null ? allTs[editIdx] : allTs[0] || null;
  const [hours, setHours] = useState(String(editTs?.hours || 0));
  const [regularHours, setRegularHours] = useState(String(editTs?.regularHours || 0));
  const [overtimeHours, setOvertimeHours] = useState(String(editTs?.overtimeHours || 0));
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf");
    if (pdfs.length === 0) {
      toast({ title: "Only PDF files are supported", variant: "destructive" });
      return;
    }
    setScanWarning(null);
    const fileName = pdfs[0].name;
    const existingMatch = allTs.find(ts => ts.fileName && ts.fileName === fileName);
    if (existingMatch) {
      setScanWarning(`"${fileName}" was already uploaded (${existingMatch.hours}h, ${existingMatch.status})`);
    }
    setScanning(true);
    setScanError(null);
    try {
      const formData = new FormData();
      pdfs.forEach(f => formData.append("files", f));
      formData.append("month", String(month));
      formData.append("year", String(year));
      const res = await fetch("/api/timesheets/scan", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "Scan failed" }));
        throw new Error(errData.message || "Scan failed");
      }
      const data = await res.json();
      const results = data.results || [];
      if (results.length > 0) {
        const r = results[0];
        if (r.totalHours != null) setHours(String(r.totalHours));
        if (r.regularHours != null) setRegularHours(String(r.regularHours));
        if (r.overtimeHours != null) setOvertimeHours(String(r.overtimeHours));
        const extractedTotal = r.totalHours || 0;
        const hoursMatch = allTs.find(ts => Math.abs(ts.hours - extractedTotal) < 0.01 && extractedTotal > 0);
        if (hoursMatch && !existingMatch) {
          setScanWarning(`Extracted hours (${extractedTotal}h) match an existing timesheet`);
        }
        toast({ title: "Timesheet scanned", description: `Extracted ${extractedTotal} total hours` });
      } else {
        setScanError("No data could be extracted from the PDF");
      }
    } catch (err: any) {
      setScanError(err.message || "Scan failed");
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [month, year, toast, allTs]);

  const updateTimesheetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliation", month, year] });
      toast({ title: "Timesheet hours updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createTimesheetMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/timesheets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliation", month, year] });
      toast({ title: "Timesheet created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveHours = () => {
    const total = parseFloat(hours) || 0;
    const reg = parseFloat(regularHours) || 0;
    const ot = parseFloat(overtimeHours) || 0;
    const rate = row.employee.hourlyRate ? parseFloat(row.employee.hourlyRate) : 0;

    if (editTs?.id) {
      updateTimesheetMutation.mutate({
        id: editTs.id,
        data: { totalHours: String(total), regularHours: String(reg), overtimeHours: String(ot), grossValue: String(total * rate) },
      });
    } else {
      createTimesheetMutation.mutate({
        employeeId: row.employee.id,
        month, year,
        totalHours: String(total), regularHours: String(reg), overtimeHours: String(ot),
        grossValue: String(total * rate), status: "DRAFT",
        notes: JSON.stringify({ intakeSource: "ADMIN_ENTRY" }),
      });
    }
  };

  const isPending = updateTimesheetMutation.isPending || createTimesheetMutation.isPending;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-timesheet-detail">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timesheet — {row.employee.firstName} {row.employee.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">{MONTHS[month]} {year}</div>

          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50 text-xs">
            <div>
              <span className="text-muted-foreground">Pay Rate</span>
              <div className="font-semibold">{row.employee.hourlyRate ? `$${parseFloat(row.employee.hourlyRate).toFixed(2)}/hr` : "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Charge-out</span>
              <div className="font-semibold">{row.employee.chargeOutRate ? `$${parseFloat(row.employee.chargeOutRate).toFixed(2)}/hr` : "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="font-semibold">{summary.status || "No timesheet"}</div>
            </div>
          </div>

          {allTs.length > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">
                  {allTs.length > 1 ? `${allTs.length} Timesheets` : "Timesheet"}
                </span>
                <span className="font-semibold font-mono">{summary.totalHours}h total</span>
              </div>
              {allTs.map((ts, idx) => (
                <div
                  key={ts.id}
                  className={`flex justify-between items-center p-2 rounded border cursor-pointer transition-colors ${editIdx === idx || (editIdx === null && idx === 0) ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  onClick={() => { setEditIdx(idx); setHours(String(ts.hours)); setRegularHours(String(ts.regularHours)); setOvertimeHours(String(ts.overtimeHours)); }}
                  data-testid={`ts-entry-${idx}`}
                >
                  <div>
                    <span className="font-mono font-semibold">{ts.hours}h</span>
                    <Badge variant="secondary" className="text-[9px] ml-1.5">{ts.status}</Badge>
                  </div>
                  <span className="font-mono text-muted-foreground">{fmtCurrencyFull(ts.grossValue)}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handlePdfUpload(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-timesheet-pdf"
          >
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { handlePdfUpload(e.target.files); e.target.value = ""; }} data-testid="input-timesheet-pdf" />
            {scanning ? (
              <div className="flex flex-col items-center gap-2 py-1">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Scanning PDF...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-1">
                <UploadCloud className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Drop a timesheet PDF or click to upload</span>
              </div>
            )}
            {scanError && <p className="text-xs text-destructive mt-1">{scanError}</p>}
            {scanWarning && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600" data-testid="text-scan-warning">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{scanWarning}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              {allTs.length === 0 ? "Create Timesheet" : `Edit Hours${allTs.length > 1 ? ` — Entry ${(editIdx ?? 0) + 1}` : ""}`}
              {editTs && <Badge variant="secondary" className="text-[10px] ml-auto">{editTs.status}</Badge>}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Total</Label>
                <Input type="number" step="0.5" className="h-8 font-mono text-sm" value={hours} onChange={e => setHours(e.target.value)} data-testid="input-edit-total-hours" />
              </div>
              <div>
                <Label className="text-xs">Regular</Label>
                <Input type="number" step="0.5" className="h-8 font-mono text-sm" value={regularHours} onChange={e => setRegularHours(e.target.value)} data-testid="input-edit-regular-hours" />
              </div>
              <div>
                <Label className="text-xs">Overtime</Label>
                <Input type="number" step="0.5" className="h-8 font-mono text-sm" value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)} data-testid="input-edit-overtime-hours" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveHours} disabled={isPending} data-testid="button-save-hours">
                {isPending ? "Saving..." : editTs?.id ? "Update Hours" : "Create Timesheet"}
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailDialog({
  row,
  month,
  year,
  onClose,
}: {
  row: ReconciliationRow;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const allInvs = row.invoices && row.invoices.length > 0 ? row.invoices : (row.invoice ? [row.invoice] : []);
  const summary = row.invoiceSummary || { totalExGst: row.invoice?.amountExGst || 0, totalInclGst: row.invoice?.amount || 0, count: allInvs.length, allPaid: row.invoice?.status === "PAID" };
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedInv = allInvs[selectedIdx] || null;

  const [editMonth, setEditMonth] = useState<number>(selectedInv?.month || month);
  const [editYear, setEditYear] = useState<number>(selectedInv?.year || year);

  const { data: lineItems, isLoading: lineItemsLoading } = useQuery<InvoiceLineItem[]>({
    queryKey: ["/api/invoices", selectedInv?.id, "line-items"],
    queryFn: async () => {
      if (!selectedInv?.id) return [];
      const res = await fetch(`/api/invoices/${selectedInv.id}/line-items`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedInv?.id,
  });

  const { data: payments } = useQuery<InvoicePayment[]>({
    queryKey: ["/api/invoices", selectedInv?.id, "payments"],
    queryFn: async () => {
      if (!selectedInv?.id) return [];
      const res = await fetch(`/api/invoices/${selectedInv.id}/payments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedInv?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/invoices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliation", month, year] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (allInvs.length === 0) {
    return (
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="max-w-md" data-testid="dialog-invoice-detail-missing">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoice — {row.employee.firstName} {row.employee.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center py-6">
              <XCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
              <p className="text-sm text-muted-foreground">No invoice found for {MONTHS[month]} {year}</p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => navigate("/invoices")} data-testid="button-go-create-invoice">
                <ExternalLink className="w-3 h-3 mr-1" /> Go to Invoices
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const periodChanged = selectedInv && (editMonth !== (selectedInv.month || month) || editYear !== (selectedInv.year || year));
  const nowYear = new Date().getFullYear();
  const minYear = Math.min(nowYear - 5, editYear);
  const maxYear = Math.max(nowYear + 4, editYear);
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-invoice-detail">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {allInvs.length > 1 ? `Invoices (${allInvs.length})` : `Invoice ${selectedInv?.invoiceNumber || "—"}`} — {row.employee.firstName} {row.employee.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {allInvs.length > 1 && (
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">{allInvs.length} Invoices</span>
                <span className="font-semibold font-mono">{fmtCurrencyFull(summary.totalExGst)} ex. GST</span>
              </div>
              {allInvs.map((inv, idx) => (
                <div
                  key={inv.id}
                  className={`flex justify-between items-center p-2 rounded border cursor-pointer transition-colors ${selectedIdx === idx ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  onClick={() => { setSelectedIdx(idx); setEditMonth(inv.month || month); setEditYear(inv.year || year); }}
                  data-testid={`inv-entry-${idx}`}
                >
                  <div>
                    <span className="font-medium">{inv.invoiceNumber || "—"}</span>
                    <Badge variant="secondary" className="text-[9px] ml-1.5">{inv.status}</Badge>
                  </div>
                  <span className="font-mono">{fmtCurrencyFull(inv.amountExGst)}</span>
                </div>
              ))}
            </div>
          )}

          {selectedInv && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Amount (excl. GST)</span>
                  <span className="font-mono font-medium">{fmtCurrencyFull(selectedInv.amountExGst)}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Amount (incl. GST)</span>
                  <span className="font-mono font-medium">{fmtCurrencyFull(selectedInv.amount)}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Status</span>
                  <StatusBadge status={selectedInv.status} />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Issue Date</span>
                  <span>{selectedInv.issueDate ? new Date(selectedInv.issueDate).toLocaleDateString("en-AU") : "—"}</span>
                </div>
                {selectedInv.paidDate && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Paid Date</span>
                    <span>{new Date(selectedInv.paidDate).toLocaleDateString("en-AU")}</span>
                  </div>
                )}
                {selectedInv.description && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground block">Description</span>
                    <span className="text-sm">{selectedInv.description}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <span className="text-xs text-muted-foreground block mb-1">Work Period</span>
                <div className="flex items-center gap-2">
                  <Select value={String(editMonth)} onValueChange={val => setEditMonth(parseInt(val))}>
                    <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-recon-period-month"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={String(editYear)} onValueChange={val => setEditYear(parseInt(val))}>
                    <SelectTrigger className="h-8 w-24 text-xs" data-testid="select-recon-period-year"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {periodChanged && <span className="text-xs text-amber-600 dark:text-amber-400">Changed</span>}
                </div>
              </div>

              {lineItemsLoading && <div className="border-t pt-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4 mt-2" /></div>}

              {!lineItemsLoading && lineItems && lineItems.length > 0 && (
                <div className="border-t pt-3" data-testid="section-line-items">
                  <Label className="text-sm font-semibold mb-2 block">Line Items ({lineItems.length})</Label>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right w-20">Qty</TableHead>
                          <TableHead className="text-right w-24">Rate</TableHead>
                          <TableHead className="text-right w-24">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((li, idx) => (
                          <TableRow key={li.id || idx} className="text-xs">
                            <TableCell className="py-1.5">{li.description || "—"}</TableCell>
                            <TableCell className="text-right font-mono py-1.5">{li.quantity ? parseFloat(li.quantity).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-right font-mono py-1.5">{li.unitAmount ? fmtCurrencyFull(li.unitAmount) : "—"}</TableCell>
                            <TableCell className="text-right font-mono py-1.5">{li.lineAmount ? fmtCurrencyFull(li.lineAmount) : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {payments && payments.length > 0 && (
                <div className="border-t pt-3" data-testid="section-payments">
                  <Label className="text-sm font-semibold mb-2 block">Payments ({payments.length})</Label>
                  <div className="space-y-2">
                    {payments.map((pmt, idx) => (
                      <div key={pmt.id || idx} className="flex items-center justify-between p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm">
                        <div>
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmtCurrencyFull(pmt.amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {pmt.paymentDate ? new Date(pmt.paymentDate).toLocaleDateString("en-AU") : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 justify-end border-t pt-3">
            <Button size="sm" variant="outline" onClick={() => navigate("/invoices")} data-testid="button-go-invoices">
              <ExternalLink className="w-3 h-3 mr-1" /> View in Invoices
            </Button>
            {periodChanged && selectedInv && (
              <Button size="sm" onClick={() => updateMutation.mutate({ id: selectedInv.id, data: { month: editMonth, year: editYear } })} disabled={updateMutation.isPending} data-testid="button-save-period">
                {updateMutation.isPending ? "Saving..." : "Save Period"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayrollDetailDialog({
  row,
  month,
  year,
  onClose,
}: {
  row: ReconciliationRow;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const isContractor = row.employee.paymentMethod === "INVOICE";

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-payroll-detail">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            {isContractor ? "Contractor Cost" : "Payroll"} — {row.employee.firstName} {row.employee.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">{MONTHS[month]} {year}</div>

          {isContractor ? (
            row.contractorCost && row.contractorCost.total > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 text-xs">
                  <div>
                    <span className="text-muted-foreground">Total Cost</span>
                    <div className="font-semibold font-mono text-base">{fmtCurrencyFull(row.contractorCost.total)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Transactions</span>
                    <div className="font-semibold">{row.contractorCost.transactionCount}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Company</span>
                    <div className="font-semibold">{row.contractorCost.companyName || "—"}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <XCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
                <p className="text-sm text-muted-foreground">No contractor payments found for this period</p>
              </div>
            )
          ) : row.payroll ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 text-xs">
                <div>
                  <span className="text-muted-foreground">Gross Earnings</span>
                  <div className="font-semibold font-mono text-base">{fmtCurrencyFull(row.payroll.grossEarnings)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Pay</span>
                  <div className="font-semibold font-mono text-base">{fmtCurrencyFull(row.payroll.netPay)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">PAYG Withheld</span>
                  <div className="font-semibold font-mono">{row.payroll.paygWithheld != null ? fmtCurrencyFull(row.payroll.paygWithheld) : "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Super</span>
                  <div className="font-semibold font-mono">{row.payroll.superAmount != null ? fmtCurrencyFull(row.payroll.superAmount) : "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Hours Worked</span>
                  <div className="font-semibold font-mono">{row.payroll.hoursWorked}h</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="font-semibold">{row.payroll.payRunStatus || "—"}</div>
                </div>
              </div>
              {row.payroll.payRunId && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/payroll/${row.payroll!.payRunId}`)} data-testid="button-go-payroll">
                  <ExternalLink className="w-3 h-3 mr-1" /> View Full Pay Run
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <XCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
              <p className="text-sm text-muted-foreground">No payroll data found for this period</p>
            </div>
          )}

          <div className="flex gap-2 justify-end border-t pt-3">
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
