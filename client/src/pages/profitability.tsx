import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  CreditCard, Receipt, Clock, Plus,
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
  };
  cost: {
    grossEarnings: number;
    superAmount: number;
    netPay: number;
    totalCost: number;
    costSource: "PAYROLL" | "CONTRACTOR_SPEND";
    contractorSpend: number;
    contractorSpendTxnCount: number;
    payRunLines: PayRunLineDetail[];
    contractorTxns: BankTxnDetail[];
  };
  payrollFeeRevenue: number;
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
    totalProfit: number;
    totalCashReceived: number;
    totalPayrollFees: number;
    avgMargin: number;
  };
  period: { month: number; year: number };
}

function fmtCurrency(n: number): string {
  if (n === 0) return "$0";
  return "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrencyFull(n: number): string {
  const prefix = n < 0 ? "-" : "";
  return prefix + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type DrillDownColumn = "revenue" | "hours" | "grossPay" | "super" | "totalCost" | "cashIn" | "profit";

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
  const { toast } = useToast();

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
  const totals = data?.totals || { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalCashReceived: 0, totalPayrollFees: 0, avgMargin: 0 };

  return (
    <div className="flex flex-col h-full" data-testid="page-profitability">
      <TopBar title="Client Profitability" subtitle="Revenue vs cost analysis per employee placement" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
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

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" data-testid="kpi-cards">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  Revenue (ex GST)
                </div>
                <div className="text-xl font-bold" data-testid="kpi-revenue">
                  {fmtCurrency(totals.totalRevenue)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Users className="w-3.5 h-3.5" />
                  Employee Cost
                </div>
                <div className="text-xl font-bold" data-testid="kpi-cost">
                  {fmtCurrency(totals.totalCost)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Profit
                </div>
                <div className={`text-xl font-bold ${totals.totalProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="kpi-profit">
                  {totals.totalProfit < 0 ? "-" : ""}{fmtCurrency(totals.totalProfit)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Percent className="w-3.5 h-3.5" />
                  Avg Margin
                </div>
                <div className={`text-xl font-bold ${totals.avgMargin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="kpi-margin">
                  {totals.avgMargin.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Wallet className="w-3.5 h-3.5" />
                  Cash Received
                </div>
                <div className="text-xl font-bold" data-testid="kpi-cash-received">
                  {fmtCurrency(totals.totalCashReceived)}
                </div>
              </CardContent>
            </Card>
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
                      <th className="text-right px-4 py-2.5 font-medium">Rate</th>
                      <th className="text-right px-4 py-2.5 font-medium">Invoiced Hrs</th>
                      <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2.5 font-medium">Gross Pay</th>
                      <th className="text-right px-4 py-2.5 font-medium">Super</th>
                      <th className="text-right px-4 py-2.5 font-medium">Total Cost</th>
                      <th className="text-right px-4 py-2.5 font-medium">Profit</th>
                      <th className="text-right px-4 py-2.5 font-medium">Margin</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cash In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const profitColor = row.profit > 0
                        ? "text-green-600 dark:text-green-400"
                        : row.profit < 0
                        ? "text-red-600 dark:text-red-400"
                        : "";
                      const marginColor = row.marginPercent > 10
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : row.marginPercent > 0
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
                      const ProfitIcon = row.profit > 0 ? ArrowUpRight : row.profit < 0 ? ArrowDownRight : Minus;

                      return (
                        <tr
                          key={row.placementId}
                          className={`border-b hover:bg-muted/30 transition-colors ${row.placementStatus === "ENDED" ? "opacity-70" : ""}`}
                          data-testid={`row-profitability-${row.placementId}`}
                        >
                          <td className="px-4 py-3 font-medium" data-testid={`text-employee-${row.employee.id}`}>
                            <div className="flex items-center gap-2">
                              {row.employee.firstName} {row.employee.lastName}
                              {row.placementStatus === "ENDED" && (
                                <Badge variant="outline" className="text-[10px] font-normal" data-testid={`badge-ended-${row.placementId}`}>Ended</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground" data-testid={`text-client-${row.placementId}`}>
                            {row.client.name}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            ${parseFloat(row.employee.chargeOutRate || "0").toFixed(0)}/hr
                          </td>
                          <td
                            className="px-4 py-3 text-right tabular-nums cursor-pointer hover:bg-muted/60 transition-colors"
                            onClick={() => setDrillDown({ row, column: "hours" })}
                            data-testid={`cell-hours-${row.placementId}`}
                          >
                            <span className="inline-flex items-center gap-1 border-b border-dashed border-muted-foreground/50">
                              {row.revenue.bestAvailableHours > 0 ? (
                                <>
                                  <span className={row.revenue.hoursSource === "ESTIMATED" ? "text-muted-foreground" : ""}>
                                    {row.revenue.bestAvailableHours.toFixed(1)}
                                  </span>
                                  {row.revenue.hoursSource === "TIMESHEET" && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight" data-testid={`badge-hours-source-${row.placementId}`}>T</Badge>
                                  )}
                                  {row.revenue.hoursSource === "ESTIMATED" && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal leading-tight text-muted-foreground" data-testid={`badge-hours-source-${row.placementId}`}>E</Badge>
                                  )}
                                </>
                              ) : "—"}
                            </span>
                          </td>
                          <DrillDownCell
                            value={row.revenue.amountExGst}
                            display={row.revenue.amountExGst !== 0 ? fmtCurrencyFull(row.revenue.amountExGst) : "—"}
                            onClick={() => setDrillDown({ row, column: "revenue" })}
                            className="font-medium"
                            testId={`cell-revenue-${row.placementId}`}
                          />
                          <DrillDownCell
                            value={row.cost.grossEarnings}
                            display={row.cost.grossEarnings !== 0 ? fmtCurrencyFull(row.cost.grossEarnings) : "—"}
                            onClick={() => setDrillDown({ row, column: "grossPay" })}
                            testId={`cell-gross-${row.placementId}`}
                          />
                          <DrillDownCell
                            value={row.cost.superAmount}
                            display={row.cost.superAmount !== 0 ? fmtCurrencyFull(row.cost.superAmount) : "—"}
                            onClick={() => setDrillDown({ row, column: "super" })}
                            testId={`cell-super-${row.placementId}`}
                          />
                          <DrillDownCell
                            value={row.cost.totalCost}
                            display={row.cost.totalCost !== 0 ? fmtCurrencyFull(row.cost.totalCost) : "—"}
                            onClick={() => setDrillDown({ row, column: "totalCost" })}
                            className="font-medium"
                            testId={`cell-totalcost-${row.placementId}`}
                          />
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${profitColor} ${row.profit !== 0 ? "cursor-pointer hover:bg-muted/60 transition-colors" : ""}`}
                            onClick={() => row.profit !== 0 && setDrillDown({ row, column: "profit" })}
                            data-testid={`cell-profit-${row.placementId}`}
                          >
                            <span className={`inline-flex items-center gap-1 ${row.profit !== 0 ? "border-b border-dashed border-current" : ""}`}>
                              <ProfitIcon className="w-3.5 h-3.5" />
                              {fmtCurrencyFull(row.profit)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant="secondary" className={`text-xs ${marginColor}`} data-testid={`badge-margin-${row.placementId}`}>
                              {row.marginPercent.toFixed(1)}%
                            </Badge>
                          </td>
                          <DrillDownCell
                            value={row.cashReceived}
                            display={row.cashReceived !== 0 ? fmtCurrencyFull(row.cashReceived) : "—"}
                            onClick={() => setDrillDown({ row, column: "cashIn" })}
                            testId={`cell-cashin-${row.placementId}`}
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/50 font-semibold">
                        <td className="px-4 py-3" colSpan={4}>Totals</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrencyFull(totals.totalRevenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums" colSpan={2}></td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrencyFull(totals.totalCost)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${totals.totalProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmtCurrencyFull(totals.totalProfit)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant="secondary" className="text-xs">{totals.avgMargin.toFixed(1)}%</Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrencyFull(totals.totalCashReceived)}</td>
                      </tr>
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

      {drillDown && (
        <DrillDownDialog
          row={drillDown.row}
          column={drillDown.column}
          period={{ month, year }}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

function DrillDownCell({
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
  hours: "Invoiced Hours",
  grossPay: "Gross Pay",
  super: "Superannuation",
  totalCost: "Total Cost",
  cashIn: "Cash Received",
  profit: "Profit Breakdown",
};

function HoursDrillDown({ row, period }: { row: ProfitabilityRow; period: { month: number; year: number } }) {
  const { toast } = useToast();
  const [addHours, setAddHours] = useState("");
  const [addRegular, setAddRegular] = useState("");
  const [addOvertime, setAddOvertime] = useState("");
  const hasAnyHoursData = row.revenue.invoicedHours > 0 || row.revenue.timesheetHours > 0 || row.revenue.estimatedHours > 0;
  const showAddForm = !hasAnyHoursData || (row.revenue.invoicedHours === 0 && row.revenue.timesheetHours === 0);

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

  return (
    <div className="space-y-4">
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
            Estimated Hours
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
          <div className="text-xs font-medium text-muted-foreground mb-2">From invoices</div>
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
                    <TableCell className="font-mono">{inv.invoiceNumber || "—"}</TableCell>
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
          <div className="text-xs font-medium text-muted-foreground mb-2">From RCTIs</div>
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
                    <TableCell>{r.clientName || "—"}</TableCell>
                    <TableCell>{MONTHS[r.month]} {r.year}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.hours > 0 ? r.hours.toFixed(1) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
      case "grossPay":
      case "super":
        return row.cost.payRunLines.length > 0
          ? `${row.cost.payRunLines.length} pay run${row.cost.payRunLines.length !== 1 ? "s" : ""} in ${MONTHS[period.month]} ${period.year}`
          : "No pay run data";
      case "totalCost":
        if (row.cost.costSource === "CONTRACTOR_SPEND")
          return `${row.cost.contractorTxns.length} bank transaction${row.cost.contractorTxns.length !== 1 ? "s" : ""} to ${row.employee.companyName || "contractor"}`;
        return `${row.cost.payRunLines.length} pay run${row.cost.payRunLines.length !== 1 ? "s" : ""} (gross + super)`;
      case "cashIn":
        return row.cashReceivedTxns.length > 0
          ? `${row.cashReceivedTxns.length} bank receipt${row.cashReceivedTxns.length !== 1 ? "s" : ""} from ${row.client.name}`
          : "No matching bank receipts";
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.revenue.invoices.map((inv) => (
                        <TableRow key={inv.id} className="text-sm" data-testid={`drilldown-invoice-${inv.id}`}>
                          <TableCell className="font-mono">{inv.invoiceNumber || "—"}</TableCell>
                          <TableCell>{inv.contactName || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{inv.hours > 0 ? inv.hours.toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtCurrencyFull(inv.amountExclGst)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(inv.issueDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold text-sm">
                        <TableCell colSpan={3}>Invoice subtotal</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.revenue.invoices.reduce((s, i) => s + i.amountExclGst, 0))}</TableCell>
                        <TableCell colSpan={2} />
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
                          <TableCell>{r.clientName || "—"}</TableCell>
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
            {row.revenue.invoices.length === 0 && row.revenue.rctis.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">No revenue records found for this period.</div>
            )}
          </div>
        );

      case "hours":
        return (
          <HoursDrillDown row={row} period={period} />
        );

      case "grossPay":
      case "super":
        return (
          <div>
            {row.cost.payRunLines.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Pay Date</TableHead>
                      <TableHead className="text-right">Gross Earnings</TableHead>
                      <TableHead className="text-right">Super</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.cost.payRunLines.map((pl, idx) => (
                      <TableRow key={idx} className="text-sm" data-testid={`drilldown-payline-${idx}`}>
                        <TableCell className="whitespace-nowrap">{fmtDate(pl.payDate)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${column === "grossPay" ? "font-medium" : ""}`}>{fmtCurrencyFull(pl.grossEarnings)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${column === "super" ? "font-medium" : ""}`}>{fmtCurrencyFull(pl.superAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.netPay)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold text-sm">
                      <TableCell>Totals</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.grossEarnings, 0))}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.superAmount, 0))}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cost.payRunLines.reduce((s, l) => s + l.netPay, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-6">No pay run data for this period.</div>
            )}
          </div>
        );

      case "totalCost":
        if (row.cost.costSource === "CONTRACTOR_SPEND") {
          return (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Bank payments to {row.employee.companyName || "contractor"}
              </div>
              {row.cost.contractorTxns.length > 0 ? (
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
              ) : (
                <div className="text-center text-sm text-muted-foreground py-6">No contractor transactions found.</div>
              )}
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-md p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross Earnings</span>
                <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.grossEarnings)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">+ Superannuation</span>
                <span className="tabular-nums font-medium">{fmtCurrencyFull(row.cost.superAmount)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Total Employee Cost</span>
                <span className="tabular-nums">{fmtCurrencyFull(row.cost.totalCost)}</span>
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
                        <TableHead className="text-right">Super</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.cost.payRunLines.map((pl, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="whitespace-nowrap">{fmtDate(pl.payDate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.grossEarnings)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.superAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCurrencyFull(pl.netPay)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        );

      case "cashIn":
        return (
          <div>
            {row.cashReceivedTxns.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Date</TableHead>
                      <TableHead>Bank Account</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.cashReceivedTxns.map((t) => (
                      <TableRow key={t.id} className="text-sm" data-testid={`drilldown-cashin-${t.id}`}>
                        <TableCell className="whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                        <TableCell className="text-muted-foreground">{t.bankAccountName || "—"}</TableCell>
                        <TableCell>{t.contactName || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-muted-foreground text-xs">{t.reference || t.description || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtCurrencyFull(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold text-sm">
                      <TableCell colSpan={4}>Total cash received</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCurrencyFull(row.cashReceivedTxns.reduce((s, t) => s + t.amount, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-6">No bank receipts matched for this client in this period.</div>
            )}
          </div>
        );

      case "profit":
        return (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-5 space-y-3">
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
              <div className="border-t pt-3 flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Total Employee Cost
                  {row.cost.costSource === "CONTRACTOR_SPEND" && (
                    <Badge variant="outline" className="text-[10px]">Contractor</Badge>
                  )}
                </span>
                <span className="tabular-nums font-medium text-foreground">-{fmtCurrencyFull(row.cost.totalCost)}</span>
              </div>
              {row.cost.costSource === "PAYROLL" && row.cost.payRunLines.length > 0 && (
                <div className="pl-6 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Gross earnings</span>
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
                  <span>{row.cost.contractorSpendTxnCount} payment{row.cost.contractorSpendTxnCount !== 1 ? "s" : ""} to {row.employee.companyName}</span>
                </div>
              )}
              <div className="border-t border-dashed pt-3 flex justify-between items-center font-semibold">
                <span className="flex items-center gap-2">
                  <Calculator className="w-3.5 h-3.5" />
                  Profit
                </span>
                <span className={`tabular-nums ${row.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {fmtCurrencyFull(row.profit)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Margin</span>
                <Badge variant="secondary" className="text-xs">
                  {row.marginPercent.toFixed(1)}%
                </Badge>
              </div>
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
