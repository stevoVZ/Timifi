import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  DollarSign, Percent, Users, FileText, Wallet, Link2,
  ArrowUpRight, ArrowDownRight, Minus, X, Calculator,
  CreditCard, Receipt, Clock, Plus, Activity, Landmark,
  ExternalLink, CheckCircle2, AlertCircle, Eye, Paperclip, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  contactName: string | null;
  hours: number;
  amountExclGst: number;
  amountInclGst: number;
  issueDate: string | null;
  status: string;
  invoiceType: string | null;
  bankLinked?: boolean;
}

interface TimesheetDetail {
  id: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  status: string;
  fileName: string | null;
  source: string | null;
  clientName: string | null;
}

interface RctiDetail {
  id: string;
  clientName: string | null;
  hours: number;
  amountExclGst: number;
  amountInclGst: number;
  month: number;
  year: number;
}

interface PayRunLineDetail {
  payRunId: string;
  payDate: string | null;
  grossEarnings: number;
  superAmount: number;
  netPay: number;
  paygWithheld: number;
}

interface BankTxnDetail {
  id: string;
  contactName: string | null;
  amount: number;
  date: string | null;
  bankAccountName: string | null;
  reference: string | null;
  description: string | null;
}

interface ProfitabilityRow {
  placementId: string;
  placementStatus: string;
  placementEndDate: string | null;
  chargeOutRate: number;
  payRate: number;
  rateSpread: number;
  payRateSource?: "PLACEMENT" | "RATE_HISTORY" | "PAYROLL_DERIVED" | "EMPLOYEE_DEFAULT";
  chargeOutRateSource?: "PLACEMENT" | "RATE_HISTORY" | "INVOICE_DERIVED" | "EMPLOYEE_DEFAULT";
  expectedHours: number;
  utilisation: number;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    chargeOutRate: string | null;
    hourlyRate: string | null;
    payrollFeePercent: string | null;
    paymentMethod: string | null;
    companyName: string | null;
  };
  client: { id: string | null; name: string };
  revenue: {
    invoiceCount: number;
    rctiCount: number;
    hours: number;
    invoicedHours: number;
    timesheetHours: number;
    estimatedHours: number;
    bestAvailableHours: number;
    hoursSource: "INVOICED" | "TIMESHEET" | "ESTIMATED";
    amountExGst: number;
    amountInclGst: number;
    rctiAmountExGst: number;
    invoices: InvoiceDetail[];
    rctis: RctiDetail[];
    timesheets?: TimesheetDetail[];
  };
  cost: {
    grossEarnings: number;
    superAmount: number;
    netPay: number;
    paygWithheld: number;
    totalCost: number;
    totalCostIncPT: number;
    payrollTaxRate: number;
    payrollTaxAmount: number;
    payrollTaxApplicable: boolean;
    costSource: "PAYROLL" | "CONTRACTOR_SPEND" | "ESTIMATED";
    contractorSpend: number;
    contractorSpendTxnCount: number;
    payRunLines: PayRunLineDetail[];
    contractorTxns: BankTxnDetail[];
  };
  payrollFeeRevenue: number;
  profitExPayrollTax: number;
  profitIncPayrollTax: number;
  marginExPT: number;
  marginIncPT: number;
  cashReceived: number;
  cashReceivedTxns: BankTxnDetail[];
  profit: number;
  marginPercent: number;
}

interface ProfitabilityData {
  rows: ProfitabilityRow[];
  totals: {
    totalRevenue: number;
    totalCost: number;
    totalCostIncPT: number;
    totalPayrollTax: number;
    totalProfitExPT: number;
    totalProfitIncPT: number;
    totalProfit: number;
    totalCashReceived: number;
    totalPayrollFees: number;
    avgMargin: number;
    avgMarginExPT: number;
    avgMarginIncPT: number;
    avgUtilisation: number;
    totalActualHours: number;
    totalExpectedHours: number;
  };
  period: { month: number; year: number };
}

function rateSourceLabel(source?: string): { label: string; color: string; title: string } {
  switch (source) {
    case "PLACEMENT": return { label: "P", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", title: "From placement" };
    case "RATE_HISTORY": return { label: "H", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", title: "From rate history" };
    case "PAYROLL_DERIVED": return { label: "PR", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", title: "Derived from payroll" };
    case "INVOICE_DERIVED": return { label: "INV", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", title: "Derived from invoices" };
    case "EMPLOYEE_DEFAULT": return { label: "D", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", title: "Employee default rate" };
    default: return { label: "", color: "", title: "" };
  }
}

function RateSourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const { label, color, title } = rateSourceLabel(source);
  if (!label) return null;
  return (
    <span className={`inline-flex items-center justify-center text-[9px] font-semibold rounded px-1 py-0.5 leading-none ml-1 ${color}`} title={title}>
      {label}
    </span>
  );
}

function fmtCurrency(n: number): string {
  if (n === 0) return "$0";
  const prefix = n < 0 ? "-" : "";
  return prefix + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrencyFull(n: number): string {
  const prefix = n < 0 ? "-" : "";
  return prefix + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type DrillDownColumn = "revenue" | "hours" | "cost" | "profit";

interface DrillDownState {
  row: ProfitabilityRow;
  column: DrillDownColumn;
}

export default function ProfitabilityPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [initialPeriodSet, setInitialPeriodSet] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [closedViaBack, setClosedViaBack] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (drillDown) {
      setClosedViaBack(false);
      history.pushState({ drillDown: true }, "");
      const onPopState = (e: PopStateEvent) => {
        if (e.state?.drillDown) return;
        setClosedViaBack(true);
        setDrillDown(null);
      };
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    }
  }, [drillDown]);

  const { data: latestPeriod } = useQuery<{ month: number; year: number }>({
    queryKey: ["/api/bank-transactions/latest-period"],
    queryFn: async () => {
      const res = await fetch("/api/bank-transactions/latest-period", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (latestPeriod && !initialPeriodSet) {
      setMonth(latestPeriod.month);
      setYear(latestPeriod.year);
      setInitialPeriodSet(true);
    }
  }, [latestPeriod, initialPeriodSet]);

  const { data, isLoading } = useQuery<ProfitabilityData>({
    queryKey: ["/api/profitability", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/profitability?month=${month}&year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invoices/auto-link");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Auto-Link Complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/profitability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to auto-link invoices", variant: "destructive" });
    },
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const rows = data?.rows || [];
  const totals = data?.totals || { totalRevenue: 0, totalCost: 0, totalCostIncPT: 0, totalPayrollTax: 0, totalProfitExPT: 0, totalProfitIncPT: 0, totalProfit: 0, totalCashReceived: 0, totalPayrollFees: 0, avgMargin: 0, avgMarginExPT: 0, avgMarginIncPT: 0, avgUtilisation: 0, totalActualHours: 0, totalExpectedHours: 0 };

  return (
    <div className="flex flex-col h-full" data-testid="page-profitability">
      <TopBar title="Client Profitability" subtitle="Revenue vs cost analysis per employee placement" />

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-3 sm:px-6 py-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth} data-testid="button-prev-month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium w-40 text-center" data-testid="text-current-period">
                {MONTHS[month]} {year}
              </span>
              <Button variant="outline" size="icon" onClick={nextMonth} data-testid="button-next-month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoLinkMutation.mutate()}
              disabled={autoLinkMutation.isPending}
              data-testid="button-auto-link"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {autoLinkMutation.isPending ? "Linking..." : "Auto-Link Invoices"}
            </Button>
          </div>
        </div>
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" data-testid="kpi-cards">
            <KpiCard
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Revenue (ex GST)"
              value={fmtCurrency(totals.totalRevenue)}
              testId="kpi-revenue"
            />
            <KpiCard
              icon={<Users className="w-3.5 h-3.5" />}
              label="Employee Cost"
              value={fmtCurrency(totals.totalCost)}
              testId="kpi-cost"
            />
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Profit (inc PT)"
              value={fmtCurrency(totals.totalProfitIncPT)}
              subtitle={totals.totalPayrollTax > 0 ? `PT: ${fmtCurrency(totals.totalPayrollTax)}` : undefined}
              valueColor={totals.totalProfitIncPT >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
              testId="kpi-profit"
            />
            <KpiCard
              icon={<Percent className="w-3.5 h-3.5" />}
              label="Avg Margin (inc PT)"
              value={`${totals.avgMarginIncPT.toFixed(1)}%`}
              valueColor={totals.avgMarginIncPT >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
              testId="kpi-margin"
            />
            <KpiCard
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Avg Utilisation"
              value={`${totals.avgUtilisation.toFixed(1)}%`}
              subtitle={`${totals.totalActualHours.toFixed(0)}h / ${totals.totalExpectedHours.toFixed(0)}h`}
              valueColor={totals.avgUtilisation >= 90 ? "text-green-600 dark:text-green-400" : totals.avgUtilisation >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}
              testId="kpi-utilisation"
            />
          </div>
        )}

        {rows.length === 0 && !isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-state">No Active Placements</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Create placements on employee profile pages to link employees to clients.
                Once placements are active, profitability data will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Placement Profitability</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-profitability">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium">Employee</th>
                      <th className="text-left px-4 py-2.5 font-medium">Client</th>
                      <th className="text-right px-4 py-2.5 font-medium">Charge</th>
                      <th className="text-right px-4 py-2.5 font-medium">Pay</th>
                      <th className="text-right px-4 py-2.5 font-medium">Spread</th>
                      <th className="text-right px-4 py-2.5 font-medium">Hours</th>
                      <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cost</th>
                      <th className="text-right px-4 py-2.5 font-medium">Profit (ex PT)</th>
                      <th className="text-right px-4 py-2.5 font-medium">Profit (inc PT)</th>
                      <th className="text-right px-4 py-2.5 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const profitExColor = row.profitExPayrollTax > 0
                        ? "text-green-600 dark:text-green-400"
                        : row.profitExPayrollTax < 0
                        ? "text-red-600 dark:text-red-400"
                        : "";
                      const profitIncColor = row.profitIncPayrollTax > 0
                        ? "text-green-600 dark:text-green-400"
                        : row.profitIncPayrollTax < 0
                        ? "text-red-600 dark:text-red-400"
                        : "";
                      const marginColor = row.marginIncPT > 15
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : row.marginIncPT > 5
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
                      const ProfitExIcon = row.profitExPayrollTax > 0 ? ArrowUpRight : row.profitExPayrollTax < 0 ? ArrowDownRight : Minus;
                      const ProfitIncIcon = row.profitIncPayrollTax > 0 ? ArrowUpRight : row.profitIncPayrollTax < 0 ? ArrowDownRight : Minus;
                      const spreadColor = row.rateSpread > 0
                        ? "text-green-600 dark:text-green-400"
                        : row.rateSpread < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground";

                      return (
                        <tr
                          key={row.placementId}
                          className={`border-b hover:bg-muted/30 transition-colors cursor-default ${row.placementStatus === "ENDED" ? "opacity-70" : ""}`}
                          data-testid={`row-profitability-${row.placementId}`}
                        >
                          <td className="px-4 py-3 font-medium" data-testid={`text-employee-${row.employee.id}`}>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/profitability/${row.employee.id}/${year}/${month}`}
                                className="hover:underline text-foreground"
                                data-testid={`link-employee-detail-${row.employee.id}`}
                              >
                                {row.employee.firstName} {row.employee.lastName}
                              </Link>
                              {row.placementStatus === "ENDED" && (
                                <Badge variant="outline" className="text-[10px] font-normal" data-testid={`badge-ended-${row.placementId}`}>Ended</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground" data-testid={`text-client-${row.placementId}`}>
                            <Link
                              href={`/employees/${row.employee.id}`}
                              className="hover:underline text-muted-foreground"
                              data-testid={`link-client-${row.placementId}`}
                            >
                              {row.client.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground" data-testid={`cell-charge-rate-${row.placementId}`}>
                            <span className="inline-flex items-center">${row.chargeOutRate.toFixed(0)}<RateSourceBadge source={row.chargeOutRateSource} /></span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground" data-testid={`cell-pay-rate-${row.placementId}`}>
                            <span className="inline-flex items-center">{row.payRate > 0 ? `$${row.payRate.toFixed(0)}` : "—"}<RateSourceBadge source={row.payRateSource} /></span>
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-medium ${spreadColor}`} data-testid={`cell-spread-${row.placementId}`}>
                            {row.rateSpread !== 0 ? `$${row.rateSpread.toFixed(0)}` : "—"}
                          </td>
                          <td
                            className="px-4 py-3 text-right tabular-nums cursor-pointer hover:bg-muted/60 transition-colors"
                            onClick={() => setDrillDown({ row, column: "hours" })}
                            data-testid={`cell-hours-${row.placementId}`}
                          >
                            <div className="border-b border-dashed border-muted-foreground/50 inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1">
                                <span className={row.revenue.hoursSource === "ESTIMATED" ? "text-muted-foreground" : ""}>
                                  {row.revenue.bestAvailableHours > 0 ? row.revenue.bestAvailableHours.toFixed(1) : "—"}
                                </span>
                                {row.revenue.hoursSource === "TIMESHEET" && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight">T</Badge>
                                )}
                                {row.revenue.hoursSource === "ESTIMATED" && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight text-muted-foreground">E</Badge>
                                )}
                              </span>
                              {row.expectedHours > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  / {row.expectedHours.toFixed(0)} ({row.utilisation.toFixed(0)}%)
                                </span>
                              )}
                            </div>
                          </td>
                          <ClickableCell
                            value={row.revenue.amountExGst}
                            display={row.revenue.amountExGst !== 0 ? fmtCurrencyFull(row.revenue.amountExGst) : "—"}
                            onClick={() => setDrillDown({ row, column: "revenue" })}
                            className="font-medium"
                            testId={`cell-revenue-${row.placementId}`}
                          />
                          <ClickableCell
                            value={row.cost.totalCost}
                            display={row.cost.totalCost !== 0 ? fmtCurrencyFull(row.cost.totalCost) : "—"}
                            onClick={() => setDrillDown({ row, column: "cost" })}
                            testId={`cell-cost-${row.placementId}`}
                          />
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${profitExColor}`}
                            data-testid={`cell-profit-ex-pt-${row.placementId}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              <ProfitExIcon className="w-3.5 h-3.5" />
                              {fmtCurrencyFull(row.profitExPayrollTax)}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${profitIncColor} ${row.profitIncPayrollTax !== 0 ? "cursor-pointer hover:bg-muted/60 transition-colors" : ""}`}
                            onClick={() => row.profitIncPayrollTax !== 0 && setDrillDown({ row, column: "profit" })}
                            data-testid={`cell-profit-inc-pt-${row.placementId}`}
                          >
                            <span className={`inline-flex items-center gap-1 ${row.profitIncPayrollTax !== 0 ? "border-b border-dashed border-current" : ""}`}>
                              <ProfitIncIcon className="w-3.5 h-3.5" />
                              {fmtCurrencyFull(row.profitIncPayrollTax)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant="secondary" className={`text-xs ${marginColor}`} data-testid={`badge-margin-${row.placementId}`}>
                              {row.marginIncPT.toFixed(1)}%
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/50 font-semibold">
                        <td className="px-4 py-3" colSpan={5}>Totals</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                          {totals.totalActualHours.toFixed(0)}h / {totals.totalExpectedHours.toFixed(0)}h
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrencyFull(totals.totalRevenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrencyFull(totals.totalCost)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${totals.totalProfitExPT >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmtCurrencyFull(totals.totalProfitExPT)}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums ${totals.totalProfitIncPT >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmtCurrencyFull(totals.totalProfitIncPT)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant="secondary" className="text-xs">{totals.avgMarginIncPT.toFixed(1)}%</Badge>
                        </td>
                      </tr>
                      {totals.totalPayrollTax > 0 && (
                        <tr className="bg-muted/30 text-sm text-muted-foreground">
                          <td className="px-4 py-2" colSpan={8}>Payroll Tax Total</td>
                          <td className="px-4 py-2 text-right tabular-nums" colSpan={3}>
                            {fmtCurrencyFull(totals.totalPayrollTax)}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {rows.length > 0 && totals.totalPayrollFees > 0 && (
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Payroll Fee Revenue
                </div>
                <div className="text-lg font-bold" data-testid="text-payroll-fees">
                  {fmtCurrencyFull(totals.totalPayrollFees)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {drillDown && (
        <DrillDownDialog
          row={drillDown.row}
          column={drillDown.column}
          period={{ month, year }}
          onClose={() => {
            if (!closedViaBack) {
              history.back();
            }
            setDrillDown(null);
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
  valueColor = "",
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
          {icon}
          {label}
        </div>
        <div className={`text-xl font-bold ${valueColor}`} data-testid={testId}>
          {value}
        </div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}

function ClickableCell({
  value,
  display,
  onClick,
  className = "",
  testId,
}: {
  value: number;
  display: string;
  onClick: () => void;
  className?: string;
  testId?: string;
}) {
  const isClickable = value !== 0;
  return (
    <td
      className={`px-4 py-3 text-right tabular-nums ${className} ${
        isClickable ? "cursor-pointer hover:bg-muted/60 transition-colors" : ""
      }`}
      onClick={isClickable ? onClick : undefined}
      data-testid={testId}
    >
      <span className={isClickable ? "border-b border-dashed border-muted-foreground/50" : ""}>
        {display}
      </span>
    </td>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const COLUMN_LABELS: Record<DrillDownColumn, string> = {
  revenue: "Revenue (ex GST)",
  hours: "Hours & Utilisation",
  cost: "Employee Cost",
  profit: "Profit Breakdown",
};

function HoursDrillDown({ row, period }: { row: ProfitabilityRow; period: { month: number; year: number } }) {
  const { toast } = useToast();
  const [addHours, setAddHours] = useState("");
  const [addRegular, setAddRegular] = useState("");
  const [addOvertime, setAddOvertime] = useState("");
  const hasAnyHoursData = row.revenue.invoicedHours > 0 || row.revenue.timesheetHours > 0 || row.revenue.estimatedHours > 0;
  const showAddForm = !hasAnyHoursData || (row.revenue.invoicedHours === 0 && row.revenue.timesheetHours === 0);
  const [pdfViewId, setPdfViewId] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");

  const handleViewPdf = useCallback(async (tsId: string, fileName: string) => {
    setPdfViewId(tsId);
    setPdfTitle(fileName);
    setPdfLoading(true);
    setPdfData(null);
    try {
      const res = await fetch(`/api/timesheets/${tsId}/documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch document");
      const docs = await res.json();
      if (docs.length > 0 && docs[0].fileUrl) {
        setPdfData(docs[0].fileUrl);
      } else {
        toast({ title: "No PDF document found", variant: "destructive" });
        setPdfViewId(null);
      }
    } catch {
      toast({ title: "Failed to load PDF", variant: "destructive" });
      setPdfViewId(null);
    } finally {
      setPdfLoading(false);
    }
  }, [toast]);

  const addHoursMutation = useMutation({
    mutationFn: async () => {
      const totalHours = parseFloat(addHours) || 0;
      const regularHours = parseFloat(addRegular) || totalHours;
      const overtimeHours = parseFloat(addOvertime) || 0;
      const res = await apiRequest("POST", "/api/timesheets", {
        employeeId: row.employee.id,
        month: period.month,
        year: period.year,
        totalHours: String(totalHours),
        regularHours: String(regularHours),
        overtimeHours: String(overtimeHours),
        status: "DRAFT",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Hours Added", description: "Timesheet hours saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/profitability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setAddHours("");
      setAddRegular("");
      setAddOvertime("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save hours", variant: "destructive" });
    },
  });

  const utilisationPercent = row.expectedHours > 0 ? (row.revenue.bestAvailableHours / row.expectedHours) * 100 : 0;
  const utilisationColor = utilisationPercent >= 90 ? "bg-green-500" : utilisationPercent >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-4">
      {row.expectedHours > 0 && (
        <div className="bg-muted/50 rounded-md p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Utilisation
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {row.revenue.bestAvailableHours.toFixed(1)}h worked / {row.expectedHours.toFixed(1)}h expected
            </span>
            <span className="font-semibold">{utilisationPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${utilisationColor}`}
              style={{ width: `${Math.min(utilisationPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-muted/50 rounded-md p-4 space-y-2">
        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Hours Breakdown — Three-Tier View
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Invoiced / RCTI Hours</span>
          <span className="tabular-nums font-medium">
            {row.revenue.invoicedHours > 0 ? row.revenue.invoicedHours.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            Timesheet Hours
            <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight">T</Badge>
          </span>
          <span className="tabular-nums font-medium">
            {row.revenue.timesheetHours > 0 ? row.revenue.timesheetHours.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            Estimated Hours (ACT)
            <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight text-muted-foreground">E</Badge>
          </span>
          <span className="tabular-nums font-medium text-muted-foreground">
            {row.revenue.estimatedHours > 0 ? row.revenue.estimatedHours.toFixed(1) : "—"}
          </span>
        </div>
        <div className="border-t pt-2 flex justify-between text-sm font-semibold">
          <span>Best Available</span>
          <span className="tabular-nums inline-flex items-center gap-1">
            {row.revenue.bestAvailableHours > 0 ? row.revenue.bestAvailableHours.toFixed(1) : "—"}
            {row.revenue.hoursSource === "TIMESHEET" && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight">T</Badge>
            )}
            {row.revenue.hoursSource === "ESTIMATED" && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight text-muted-foreground">E</Badge>
            )}
          </span>
        </div>
      </div>

      {row.revenue.invoices.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            From invoices
          </div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.revenue.invoices.map((inv) => (
                  <TableRow key={inv.id} className="text-sm">
                    <TableCell className="font-mono">
                      <Link href="/invoices" className="text-primary hover:underline inline-flex items-center gap-1" data-testid={`link-invoice-${inv.id}`}>
                        {inv.invoiceNumber || "—"}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </TableCell>
                    <TableCell>{inv.contactName || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{inv.hours > 0 ? inv.hours.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{inv.hours > 0 ? fmtCurrencyFull(inv.amountExclGst / inv.hours) + "/hr" : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold text-sm">
                  <TableCell colSpan={2}>Total hours</TableCell>
                  <TableCell className="text-right tabular-nums">{row.revenue.invoices.reduce((s, i) => s + i.hours, 0).toFixed(1)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {row.revenue.rctis.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" />
            From RCTIs
          </div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Client</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.revenue.rctis.map((r) => (
                  <TableRow key={r.id} className="text-sm">
                    <TableCell>
                      <Link href="/rctis" className="text-primary hover:underline inline-flex items-center gap-1" data-testid={`link-rcti-${r.id}`}>
                        {r.clientName || "—"}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </TableCell>
                    <TableCell>{MONTHS[r.month]} {r.year}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.hours > 0 ? r.hours.toFixed(1) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {(row.revenue.timesheets?.length ?? 0) > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            From timesheets ({row.revenue.timesheets!.length})
          </div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Regular</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.revenue.timesheets!.map((ts) => (
                  <TableRow key={ts.id} className="text-sm" data-testid={`drilldown-timesheet-${ts.id}`}>
                    <TableCell>
                      <div>{ts.clientName || "—"}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {ts.fileName ? (
                          <>
                            <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={ts.fileName}>{ts.fileName}</span>
                            <button
                              className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline ml-1"
                              onClick={() => handleViewPdf(ts.id, ts.fileName!)}
                              data-testid={`button-view-pdf-${ts.id}`}
                            >
                              <Eye className="w-3 h-3" /> View
                            </button>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-[9px] h-4">
                            {ts.source === "XERO_SYNC" ? "Xero Sync" : ts.source === "ADMIN_ENTRY" ? "Admin Entry" : "Manual entry"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{ts.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ts.regularHours > 0 ? ts.regularHours.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{ts.overtimeHours > 0 ? ts.overtimeHours.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      <Link href="/timesheets" className="text-primary hover:underline inline-flex items-center gap-1" data-testid={`link-timesheet-${ts.id}`}>
                        {ts.totalHours.toFixed(1)}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold text-sm">
                  <TableCell colSpan={2}>Total timesheet hours</TableCell>
                  <TableCell className="text-right tabular-nums">{row.revenue.timesheets!.reduce((s, t) => s + t.regularHours, 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.revenue.timesheets!.reduce((s, t) => s + t.overtimeHours, 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.revenue.timesheets!.reduce((s, t) => s + t.totalHours, 0).toFixed(1)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {pdfViewId && (
            <div className="border rounded-lg overflow-hidden mt-2">
              <div className="flex items-center justify-between p-2 bg-muted/50 border-b">
                <div className="flex items-center gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="font-medium truncate max-w-[250px]">{pdfTitle}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setPdfViewId(null); setPdfData(null); }} data-testid="button-close-profitability-pdf">
                  Close
                </Button>
              </div>
              {pdfLoading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : pdfData ? (
                <ProfitabilityPdfIframe pdfData={pdfData} />
              ) : null}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="border rounded-md p-4 space-y-3">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Timesheet Hours
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Total Hours</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={addHours}
                onChange={(e) => setAddHours(e.target.value)}
                data-testid="input-add-total-hours"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Regular</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={addRegular}
                onChange={(e) => setAddRegular(e.target.value)}
                data-testid="input-add-regular-hours"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Overtime</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={addOvertime}
                onChange={(e) => setAddOvertime(e.target.value)}
                data-testid="input-add-overtime-hours"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => addHoursMutation.mutate()}
            disabled={addHoursMutation.isPending || !addHours || parseFloat(addHours) <= 0}
            data-testid="button-save-hours"
          >
            {addHoursMutation.isPending ? "Saving..." : "Save Hours"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfitabilityPdfIframe({ pdfData }: { pdfData: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfData) { setBlobUrl(null); return; }
    try {
      let raw = pdfData;
      if (raw.startsWith("data:")) raw = raw.split(",")[1];
      const bytes = atob(raw);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch { setBlobUrl(null); }
  }, [pdfData]);

  if (!blobUrl) return <div className="flex items-center justify-center h-[400px] text-xs text-muted-foreground">Unable to load PDF</div>;
  return <iframe src={blobUrl} className="w-full h-[400px]" title="Timesheet PDF" data-testid="iframe-profitability-pdf-preview" />;
}

function DrillDownDialog({
  row,
  column,
  period,
  onClose,
}: {
  row: ProfitabilityRow;
  column: DrillDownColumn;
  period: { month: number; year: number };
  onClose: () => void;
}) {
  const empName = `${row.employee.firstName} ${row.employee.lastName}`;
  const label = COLUMN_LABELS[column];

  const renderSubtitle = () => {
    switch (column) {
      case "revenue": {
        const parts: string[] = [];
        if (row.revenue.invoices.length > 0)
          parts.push(`${row.revenue.invoices.length} invoice${row.revenue.invoices.length !== 1 ? "s" : ""}`);
        if (row.revenue.rctis.length > 0)
          parts.push(`${row.revenue.rctis.length} RCTI${row.revenue.rctis.length !== 1 ? "s" : ""}`);
        if (parts.length === 0) return "No matching records";
        return parts.join(" + ") + ` from ${row.client.name}`;
      }
      case "hours": {
        const sourceLabel = row.revenue.hoursSource === "INVOICED" ? "invoiced/RCTI"
          : row.revenue.hoursSource === "TIMESHEET" ? "timesheet"
          : "estimated";
        if (row.revenue.bestAvailableHours > 0)
          return `Showing ${sourceLabel} hours (${row.revenue.bestAvailableHours.toFixed(1)}h) for ${row.client.name}`;
        return `No hours data — click to add timesheet hours`;
      }
      case "cost":
        if (row.cost.costSource === "CONTRACTOR_SPEND")
          return `${row.cost.contractorTxns.length} bank transaction${row.cost.contractorTxns.length !== 1 ? "s" : ""} to ${row.employee.companyName || "contractor"}`;
        return `${row.cost.payRunLines.length} pay run${row.cost.payRunLines.length !== 1 ? "s" : ""} (gross + super)`;
      case "profit":
        return `Revenue minus cost for ${MONTHS[period.month]} ${period.year}`;
      default:
        return "";
    }
  };

  const renderContent = () => {
    switch (column) {
      case "revenue":
        return (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-md p-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Rate Economics</div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Charge-out rate</span>
                <span className="tabular-nums font-medium inline-flex items-center">${row.chargeOutRate.toFixed(2)}/hr<RateSourceBadge source={row.chargeOutRateSource} /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">× Hours worked</span>
                <span className="tabular-nums">{row.revenue.bestAvailableHours.toFixed(1)}h</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Revenue</span>
                <span className="tabular-nums">{fmtCurrencyFull(row.revenue.amountExGst)}</span>
              </div>
            </div>

            {row.revenue.invoices.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Invoices ({row.revenue.invoices.length})
                </div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Amount (ex GST)</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Bank</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.revenue.invoices.map((inv) => (
                        <TableRow key={inv.id} className="text-sm" data-testid={`drilldown-invoice-${inv.id}`}>
                          <TableCell className="font-mono">
                            <Link href="/invoices" className="text-primary hover:underline inline-flex items-center gap-1" data-testid={`link-revenue-invoice-${inv.id}`}>
                              {inv.invoiceNumber || "—"}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </TableCell>
                          <TableCell>{inv.contactName || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{inv.hours > 0 ? inv.hours.toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtCurrencyFull(inv.amountExclGst)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(inv.issueDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {inv.bankLinked ? (
                              <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 bg-green-50" data-testid={`badge-bank-linked-${inv.id}`}>
                                <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                Paid
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50" data-testid={`badge-bank-unlinked-${inv.id}`}>
                                <AlertCircle className="w-3 h-3 mr-0.5" />
                                Unpaid
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold text-sm">
                        <TableCell colSpan={3}>Invoice subtotal</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.revenue.invoices.reduce((s, i) => s + i.amountExclGst, 0))}</TableCell>
                        <TableCell colSpan={3} />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {row.revenue.rctis.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  RCTIs ({row.revenue.rctis.length})
                </div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Client</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Amount (ex GST)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.revenue.rctis.map((r) => (
                        <TableRow key={r.id} className="text-sm" data-testid={`drilldown-rcti-${r.id}`}>
                          <TableCell>
                            <Link href="/rctis" className="text-primary hover:underline inline-flex items-center gap-1" data-testid={`link-revenue-rcti-${r.id}`}>
                              {r.clientName || "—"}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </TableCell>
                          <TableCell>{MONTHS[r.month]} {r.year}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.hours > 0 ? r.hours.toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtCurrencyFull(r.amountExclGst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {row.cashReceivedTxns.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5" />
                  Bank Statements ({row.cashReceivedTxns.length})
                </div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Date</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="max-w-[120px]">Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.cashReceivedTxns.map((t) => (
                        <TableRow key={t.id} className="text-sm" data-testid={`drilldown-bank-${t.id}`}>
                          <TableCell className="whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                          <TableCell>{t.contactName || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{t.reference || "—"}</TableCell>
                          <TableCell className="max-w-[120px] truncate text-muted-foreground">{t.description || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtCurrencyFull(t.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold text-sm">
                        <TableCell colSpan={4}>Cash received subtotal</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cashReceivedTxns.reduce((s, t) => s + t.amount, 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {row.revenue.invoices.length === 0 && row.revenue.rctis.length === 0 && row.cashReceivedTxns.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">No revenue records found for this period.</div>
            )}
          </div>
        );

      case "hours":
        return (
          <HoursDrillDown row={row} period={period} />
        );

      case "cost":
        if (row.cost.costSource === "CONTRACTOR_SPEND") {
          return (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-md p-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">Contractor Cost</div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bank payments to {row.employee.companyName || "contractor"}</span>
                  <span className="tabular-nums font-semibold">{fmtCurrencyFull(row.cost.totalCost)}</span>
                </div>
              </div>
              {row.cost.contractorTxns.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Bank Transactions ({row.cost.contractorTxns.length})
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Date</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {row.cost.contractorTxns.map((t) => (
                          <TableRow key={t.id} className="text-sm" data-testid={`drilldown-contractor-${t.id}`}>
                            <TableCell className="whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                            <TableCell>{t.contactName || "—"}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">{t.description || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmtCurrencyFull(t.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold text-sm">
                          <TableCell colSpan={3}>Total contractor spend</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.contractorTxns.reduce((s, t) => s + t.amount, 0))}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-md p-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">Rate Economics</div>
              {row.payRate > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pay rate (incl super)</span>
                    <span className="tabular-nums inline-flex items-center">${row.payRate.toFixed(2)}/hr<RateSourceBadge source={row.payRateSource} /></span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">× Hours worked</span>
                    <span className="tabular-nums">{row.revenue.bestAvailableHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Estimated gross (rate × hrs)</span>
                    <span className="tabular-nums">{fmtCurrencyFull(row.payRate * row.revenue.bestAvailableHours)}</span>
                  </div>
                </>
              )}
              <div className="border-t pt-2 space-y-1">
                {row.cost.costSource === "ESTIMATED" ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]" data-testid="badge-estimated-cost">Estimated</Badge>
                      <span className="text-xs text-muted-foreground">Based on placement pay rates (incl super) × hours (payroll not yet processed)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Cost (pay rates incl super × hours)</span>
                      <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.totalCost)}</span>
                    </div>
                  </>
                ) : row.cost.costSource === "PAYROLL" ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Net Pay</span>
                      <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.netPay)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">+ PAYG Withheld</span>
                      <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.paygWithheld)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-1">
                      <span className="text-muted-foreground">= Gross Earnings</span>
                      <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.grossEarnings)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">+ Superannuation</span>
                      <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.superAmount)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contractor Spend (ex GST)</span>
                    <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.contractorSpend)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span>Total Employee Cost</span>
                  <span className="tabular-nums">{fmtCurrencyFull(row.cost.totalCost)}</span>
                </div>
              </div>
            </div>
            {row.cost.payRunLines.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Pay run detail</div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Pay Date</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">PAYG</TableHead>
                        <TableHead className="text-right">Super</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.cost.payRunLines.map((pl, idx) => (
                        <TableRow key={idx} className="text-sm" data-testid={`drilldown-payline-${idx}`}>
                          <TableCell className="whitespace-nowrap">
                            <Link href={`/payroll/${pl.payRunId}`} className="text-primary hover:underline inline-flex items-center gap-1" data-testid={`link-payrun-${pl.payRunId}`}>
                              {fmtDate(pl.payDate)}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.grossEarnings)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.paygWithheld)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.superAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.netPay)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold text-sm">
                        <TableCell>Totals</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.grossEarnings, 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.paygWithheld, 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.superAmount, 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.netPay, 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        );

      case "profit":
        return (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-5 space-y-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">Hourly Economics</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-background rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Charge Rate</div>
                  <div className="text-lg font-bold tabular-nums inline-flex items-center justify-center">${row.chargeOutRate.toFixed(0)}<RateSourceBadge source={row.chargeOutRateSource} /></div>
                  <div className="text-[10px] text-muted-foreground">per hour</div>
                </div>
                <div className="bg-background rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pay Rate (Incl Super)</div>
                  <div className="text-lg font-bold tabular-nums inline-flex items-center justify-center">{row.payRate > 0 ? `$${row.payRate.toFixed(0)}` : "—"}<RateSourceBadge source={row.payRateSource} /></div>
                  <div className="text-[10px] text-muted-foreground">per hour</div>
                </div>
                <div className="bg-background rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Spread</div>
                  <div className={`text-lg font-bold tabular-nums ${row.rateSpread >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    ${row.rateSpread.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">per hour</div>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Revenue (ex GST)
                  </span>
                  <span className="tabular-nums font-medium text-foreground">{fmtCurrencyFull(row.revenue.amountExGst)}</span>
                </div>
                {row.revenue.invoices.length > 0 && (
                  <div className="pl-6 text-xs text-muted-foreground space-y-0.5">
                    {row.revenue.invoices.map(inv => (
                      <div key={inv.id} className="flex justify-between">
                        <span>INV {inv.invoiceNumber || "—"} · {inv.contactName}</span>
                        <span className="tabular-nums">{fmtCurrencyFull(inv.amountExclGst)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {row.revenue.rctis.length > 0 && (
                  <div className="pl-6 text-xs text-muted-foreground space-y-0.5">
                    {row.revenue.rctis.map(r => (
                      <div key={r.id} className="flex justify-between">
                        <span>RCTI · {r.clientName}</span>
                        <span className="tabular-nums">{fmtCurrencyFull(r.amountExclGst)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Employee Cost
                    {row.cost.costSource === "CONTRACTOR_SPEND" && (
                      <Badge variant="outline" className="text-[10px]">Contractor</Badge>
                    )}
                  </span>
                  <span className="tabular-nums font-medium text-foreground">-{fmtCurrencyFull(row.cost.totalCost)}</span>
                </div>
                {row.cost.costSource === "PAYROLL" && row.cost.payRunLines.length > 0 && (
                  <div className="pl-6 text-xs text-muted-foreground space-y-0.5">
                    <div className="flex justify-between">
                      <span>Gross earnings (net + PAYG)</span>
                      <span className="tabular-nums">{fmtCurrencyFull(row.cost.grossEarnings)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Superannuation</span>
                      <span className="tabular-nums">{fmtCurrencyFull(row.cost.superAmount)}</span>
                    </div>
                  </div>
                )}
                {row.cost.costSource === "CONTRACTOR_SPEND" && (
                  <div className="pl-6 text-xs text-muted-foreground">
                    <span>{row.cost.contractorSpendTxnCount} payment{row.cost.contractorSpendTxnCount !== 1 ? "s" : ""} to {row.employee.companyName} (ex GST)</span>
                  </div>
                )}

                {row.cost.payrollTaxAmount > 0 && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Receipt className="w-3.5 h-3.5" />
                        Payroll Tax ({row.cost.payrollTaxRate}%)
                      </span>
                      <span className="tabular-nums font-medium text-foreground">-{fmtCurrencyFull(row.cost.payrollTaxAmount)}</span>
                    </div>
                  </>
                )}

                <div className="border-t border-dashed pt-3 space-y-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="flex items-center gap-2">
                      <Calculator className="w-3.5 h-3.5" />
                      Profit (ex PT)
                    </span>
                    <span className={`tabular-nums ${row.profitExPayrollTax >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtCurrencyFull(row.profitExPayrollTax)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Margin (ex PT)</span>
                    <Badge variant="secondary" className="text-xs">
                      {row.marginExPT.toFixed(1)}%
                    </Badge>
                  </div>
                  {row.cost.payrollTaxAmount > 0 && (
                    <>
                      <div className="flex justify-between items-center font-semibold">
                        <span className="flex items-center gap-2">
                          <Calculator className="w-3.5 h-3.5" />
                          Profit (inc PT)
                        </span>
                        <span className={`tabular-nums ${row.profitIncPayrollTax >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmtCurrencyFull(row.profitIncPayrollTax)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Margin (inc PT)</span>
                        <Badge variant="secondary" className="text-xs">
                          {row.marginIncPT.toFixed(1)}%
                        </Badge>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {row.rateSpread !== 0 && row.revenue.bestAvailableHours > 0 && (
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground">
                    Quick check: ${row.rateSpread.toFixed(2)} spread × {row.revenue.bestAvailableHours.toFixed(1)}h = {fmtCurrencyFull(row.rateSpread * row.revenue.bestAvailableHours)} (before super)
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto" data-testid="sheet-drilldown">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base" data-testid="drilldown-title">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            {label}
          </SheetTitle>
          <SheetDescription data-testid="drilldown-context">
            {empName} · {row.client.name} · {MONTHS[period.month]} {period.year}
          </SheetDescription>
          <div className="text-xs text-muted-foreground/70 mt-0.5" data-testid="drilldown-subtitle">
            {renderSubtitle()}
          </div>
        </SheetHeader>
        <div className="mt-4">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
