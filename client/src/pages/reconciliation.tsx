import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Link } from "wouter";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Clock, FileText, CreditCard, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, CircleDollarSign, TrendingUp,
} from "lucide-react";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface ReconciliationRow {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    clientName: string | null;
    hourlyRate: string | null;
    paymentMethod: string | null;
  };
  timesheet: { hours: number; status: string; grossValue: number } | null;
  invoice: { amount: number; amountExGst: number; invoiceNumber: string | null; status: string; paidDate: string | null } | null;
  payroll: { grossEarnings: number; netPay: number; hoursWorked: number; payRunStatus: string | null } | null;
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

function getPayrollStatus(pay: ReconciliationRow["payroll"]): "complete" | "partial" | "missing" {
  if (!pay) return "missing";
  if (pay.payRunStatus === "FILED") return "complete";
  return "partial";
}

function rowBg(row: ReconciliationRow): string {
  const ts = getTimesheetStatus(row.timesheet);
  const inv = getInvoiceStatus(row.invoice);
  const pay = getPayrollStatus(row.payroll);
  if (ts === "complete" && inv === "complete" && pay === "complete") {
    return "bg-green-50/50 dark:bg-green-950/20";
  }
  if (ts === "missing" && inv === "missing" && pay === "missing") {
    return "";
  }
  return "";
}

export default function ReconciliationPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading } = useQuery<ReconciliationRow[]>({
    queryKey: ["/api/reconciliation", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/reconciliation?month=${month}&year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const rows = data || [];
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

  const kpis = [
    {
      label: "Employees",
      value: String(total),
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800",
      sub: `${total} active`,
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
      label: "Payroll",
      value: `${payComplete}/${total}`,
      icon: CreditCard,
      color: payComplete === total ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400",
      bg: payComplete === total
        ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
        : "bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800",
      sub: `${payComplete} filed`,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Monthly Reconciliation"
        subtitle="Track workflow completion across all employees"
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-5">
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Employee Status — {MONTHS[month]} {year}</span>
                {total > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {rows.filter((r) => getTimesheetStatus(r.timesheet) === "complete" && getInvoiceStatus(r.invoice) === "complete" && getPayrollStatus(r.payroll) === "complete").length}/{total} fully complete
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
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const tsStatus = getTimesheetStatus(row.timesheet);
                        const invStatus = getInvoiceStatus(row.invoice);
                        const payStatus = getPayrollStatus(row.payroll);

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
                              {row.employee.paymentMethod === "INVOICE" && (
                                <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 font-normal text-muted-foreground border-border">
                                  Contractor
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-2 hidden sm:table-cell">
                              <span className="text-xs text-muted-foreground">{row.employee.clientName || "—"}</span>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center justify-center gap-2">
                                <StatusIcon status={tsStatus} type="ts" />
                                <div className="text-center min-w-[60px]">
                                  {row.timesheet ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-foreground">{row.timesheet.hours}h</div>
                                      <div className="text-[10px] text-muted-foreground">{row.timesheet.status}</div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">Missing</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center justify-center gap-2">
                                <StatusIcon status={invStatus} type="inv" />
                                <div className="text-center min-w-[70px]">
                                  {row.invoice ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-foreground">
                                        ${row.invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                              <div className="flex items-center justify-center gap-2">
                                <StatusIcon status={payStatus} type="pay" />
                                <div className="text-center min-w-[70px]">
                                  {row.payroll ? (
                                    <>
                                      <div className="font-mono text-xs font-semibold text-foreground">
                                        ${row.payroll.netPay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">{row.payroll.payRunStatus}</div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">Missing</div>
                                  )}
                                </div>
                              </div>
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

          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Timesheets", count: tsReceived, total, approved: tsApproved, color: "bg-blue-500" },
                { label: "Invoices", count: invRaised, total, approved: invPaid, color: "bg-violet-500" },
                { label: "Payroll", count: payComplete, total, approved: payComplete, color: "bg-orange-500" },
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
    </div>
  );
}
