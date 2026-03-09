import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { TopBar } from "@/components/top-bar";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Users, Clock, FileText, CreditCard, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowUpDown, DollarSign, Percent,
  ExternalLink, Pencil,
} from "lucide-react";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
  timesheet: { id: string; hours: number; regularHours: number; overtimeHours: number; status: string; grossValue: number } | null;
  invoice: { id: string; amount: number; amountExGst: number; invoiceNumber: string | null; status: string; paidDate: string | null } | null;
  payroll: { payRunId: string | null; grossEarnings: number; netPay: number; hoursWorked: number; payRunStatus: string | null } | null;
  contractorCost?: { total: number; transactionCount: number; companyName: string | null } | null;
  financials: { expectedRevenue: number; employeeCost: number; margin: number; marginPercent: number; payrollFeeRevenue: number };
}

interface ReconciliationData {
  employees: ReconciliationRow[];
  cashFlow: { cashIn: number; cashOut: number; netCashFlow: number };
  totals: { totalRevenue: number; totalCost: number; totalMargin: number; totalPayrollFeeRevenue: number };
}

function StatusIcon({ status, type }: { status: "complete" | "partial" | "missing"; type: string }) {
  if (status === "complete") {
    return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" data-testid={`icon-${type}-complete`} />;
  }
  if (status === "partial") {
    return <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" data-testid={`icon-${type}-partial`} />;
  }
  return <XCircle className="w-4 h-4 text-red-400 dark:text-red-500" data-testid={`icon-${type}-missing`} />;
}

function getTimesheetStatus(ts: ReconciliationRow["timesheet"]): "complete" | "partial" | "missing" {
  if (!ts) return "missing";
  if (ts.status === "APPROVED") return "complete";
  return "partial";
}

function getInvoiceStatus(inv: ReconciliationRow["invoice"]): "complete" | "partial" | "missing" {
  if (!inv) return "missing";
  if (inv.status === "PAID") return "complete";
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
  const ts = getTimesheetStatus(row.timesheet);
  const inv = getInvoiceStatus(row.invoice);
  const pay = getPayrollStatus(row);
  const items = [ts, inv, pay];
  const complete = items.filter(i => i === "complete").length;
  const status = complete === 3 ? "complete" : complete > 0 ? "partial" : "missing";
  return { complete, total: 3, status };
}

function rowBg(row: ReconciliationRow): string {
  const { status } = getRowCompleteness(row);
  if (status === "complete") {
    return "bg-green-50/50 dark:bg-green-950/20";
  }
  return "";
}

function fmtCurrency(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ReconciliationPage() {
  const [, navigate] = useLocation();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [editRow, setEditRow] = useState<ReconciliationRow | null>(null);

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
  const tsReceived = rows.filter((r) => r.timesheet).length;
  const tsApproved = rows.filter((r) => r.timesheet?.status === "APPROVED").length;
  const invRaised = rows.filter((r) => r.invoice).length;
  const invPaid = rows.filter((r) => r.invoice?.status === "PAID").length;
  const payComplete = rows.filter((r) => r.payroll?.payRunStatus === "FILED").length;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const marginPercent = totals.totalRevenue > 0 ? Math.round((totals.totalMargin / totals.totalRevenue) * 100) : 0;

  const payrollEmployees = rows.filter(r => r.employee.paymentMethod !== "INVOICE");
  const contractorEmployees = rows.filter(r => r.employee.paymentMethod === "INVOICE");
  const payrollWithCost = payrollEmployees.filter(r => r.payroll?.payRunStatus === "FILED").length;
  const contractorsWithCost = contractorEmployees.filter(r => r.contractorCost && r.contractorCost.total > 0).length;
  const costComplete = payrollWithCost + contractorsWithCost;

  const completeRows = rows.filter(r => getRowCompleteness(r).status === "complete").length;
  const completenessPercent = total > 0 ? Math.round((completeRows / total) * 100) : 0;

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
                    {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
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
                    {rows.filter((r) => getRowCompleteness(r).status === "complete").length}/{total} fully complete
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
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3" />
                            Timesheet
                          </div>
                        </th>
                        <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">
                          <div className="flex items-center justify-center gap-1">
                            <FileText className="w-3 h-3" />
                            Invoice
                          </div>
                        </th>
                        <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">
                          <div className="flex items-center justify-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            Payroll
                          </div>
                        </th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Revenue</th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Cost</th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Margin</th>
                        <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Payroll Fee</th>
                        <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const tsStatus = getTimesheetStatus(row.timesheet);
                        const invStatus = getInvoiceStatus(row.invoice);
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
                                <Badge
                                  variant="outline"
                                  className="ml-1.5 text-[9px] px-1 py-0 font-normal text-muted-foreground border-border"
                                  title={row.employee.companyName || undefined}
                                >
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
                                onClick={() => navigate(`/employees/${row.employee.id}`)}
                                title="View employee timesheets"
                                data-testid={`cell-ts-${row.employee.id}`}
                              >
                                <StatusIcon status={tsStatus} type="ts" />
                                <div className="text-center min-w-[60px]">
                                  {row.timesheet ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-primary">{row.timesheet.hours}h</div>
                                      <div className="text-[10px] text-muted-foreground">{row.timesheet.status}</div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">Missing</div>
                                  )}
                                </div>
                                <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div
                                className="flex items-center justify-center gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors"
                                onClick={() => navigate(`/invoices`)}
                                title={row.invoice ? `Invoice ${row.invoice.invoiceNumber || ""}` : "View invoices"}
                                data-testid={`cell-inv-${row.employee.id}`}
                              >
                                <StatusIcon status={invStatus} type="inv" />
                                <div className="text-center min-w-[70px]">
                                  {row.invoice ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-primary">
                                        {fmtCurrency(row.invoice.amount)}
                                      </div>
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
                                  className="flex items-center justify-center gap-2 rounded-md px-1 py-0.5 transition-colors"
                                  title={row.contractorCost ? `${row.contractorCost.transactionCount} payment(s) to ${row.contractorCost.companyName}` : "No contractor payments"}
                                  data-testid={`cell-pay-${row.employee.id}`}
                                >
                                  <StatusIcon status={payStatus} type="pay" />
                                  <div className="text-center min-w-[70px]">
                                    {row.contractorCost && row.contractorCost.total > 0 ? (
                                      <>
                                        <div className="font-mono text-xs font-semibold text-primary">
                                          {fmtCurrency(row.contractorCost.total)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">{row.contractorCost.companyName}</div>
                                      </>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">No payment</div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`flex items-center justify-center gap-2 rounded-md px-1 py-0.5 transition-colors ${row.payroll?.payRunId ? "cursor-pointer hover:bg-muted/60" : ""}`}
                                  onClick={() => row.payroll?.payRunId && navigate(`/payroll/${row.payroll.payRunId}`)}
                                  title={row.payroll ? "View pay run" : "No payroll data"}
                                  data-testid={`cell-pay-${row.employee.id}`}
                                >
                                  <StatusIcon status={payStatus} type="pay" />
                                  <div className="text-center min-w-[70px]">
                                    {row.payroll ? (
                                      <>
                                        <div className="font-mono text-xs font-semibold text-primary">
                                          {fmtCurrency(row.payroll.netPay)}
                                        </div>
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
                            <td className="py-3 px-2 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditRow(row)}
                                title="Quick edit"
                                data-testid={`button-edit-row-${row.employee.id}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
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
                          <td className="py-3 px-2"></td>
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

      {editRow && (
        <ReconciliationEditDialog
          row={editRow}
          month={month}
          year={year}
          onClose={() => setEditRow(null)}
        />
      )}
    </div>
  );
}

function ReconciliationEditDialog({
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
  const [hours, setHours] = useState(String(row.timesheet?.hours || 0));
  const [regularHours, setRegularHours] = useState(String(row.timesheet?.regularHours || 0));
  const [overtimeHours, setOvertimeHours] = useState(String(row.timesheet?.overtimeHours || 0));

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

    if (row.timesheet?.id) {
      updateTimesheetMutation.mutate({
        id: row.timesheet.id,
        data: {
          totalHours: String(total),
          regularHours: String(reg),
          overtimeHours: String(ot),
          grossValue: String(total * rate),
        },
      });
    } else {
      createTimesheetMutation.mutate({
        employeeId: row.employee.id,
        month,
        year,
        totalHours: String(total),
        regularHours: String(reg),
        overtimeHours: String(ot),
        grossValue: String(total * rate),
        status: "DRAFT",
        notes: JSON.stringify({ intakeSource: "ADMIN_ENTRY" }),
      });
    }
  };

  const isPending = updateTimesheetMutation.isPending || createTimesheetMutation.isPending;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-reconciliation-edit">
        <DialogHeader>
          <DialogTitle className="text-base">
            {row.employee.firstName} {row.employee.lastName} — {MONTHS[month]} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50 text-xs">
            <div>
              <span className="text-muted-foreground">Rate</span>
              <div className="font-semibold">{row.employee.hourlyRate ? `$${parseFloat(row.employee.hourlyRate).toFixed(0)}/hr` : "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Charge-out</span>
              <div className="font-semibold">{row.employee.chargeOutRate ? `$${parseFloat(row.employee.chargeOutRate).toFixed(0)}/hr` : "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Client</span>
              <div className="font-semibold truncate">{row.employee.clientName || "—"}</div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Timesheet Hours
              {row.timesheet && (
                <Badge variant="secondary" className="text-[10px] ml-auto">{row.timesheet.status}</Badge>
              )}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Total</Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 font-mono text-sm"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  data-testid="input-edit-total-hours"
                />
              </div>
              <div>
                <Label className="text-xs">Regular</Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 font-mono text-sm"
                  value={regularHours}
                  onChange={(e) => setRegularHours(e.target.value)}
                  data-testid="input-edit-regular-hours"
                />
              </div>
              <div>
                <Label className="text-xs">Overtime</Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 font-mono text-sm"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(e.target.value)}
                  data-testid="input-edit-overtime-hours"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleSaveHours}
              disabled={isPending}
              data-testid="button-save-hours"
            >
              {row.timesheet ? "Update Hours" : "Create Timesheet"}
            </Button>
          </div>

          <div className="border-t pt-3 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Invoice
            </h4>
            {row.invoice ? (
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold">{row.invoice.invoiceNumber || "No number"}</span>
                  <span className="ml-2">{fmtCurrency(row.invoice.amount)}</span>
                  <Badge variant="secondary" className="text-[10px] ml-2">{row.invoice.status}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => navigate("/invoices")}
                  data-testid="button-go-invoices"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  View
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No invoice for this period</div>
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Payroll
            </h4>
            {row.payroll ? (
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold">Gross: {fmtCurrency(row.payroll.grossEarnings)}</span>
                  <span className="ml-2">Net: {fmtCurrency(row.payroll.netPay)}</span>
                  <Badge variant="secondary" className="text-[10px] ml-2">{row.payroll.payRunStatus}</Badge>
                </div>
                {row.payroll.payRunId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => navigate(`/payroll/${row.payroll!.payRunId}`)}
                    data-testid="button-go-payroll"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No payroll for this period</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
