import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  DollarSign, Percent, Users, FileText, Wallet, Link2,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
  };
  client: { id: string | null; name: string };
  revenue: { invoiceCount: number; hours: number; amountExGst: number; amountInclGst: number };
  cost: { grossEarnings: number; superAmount: number; netPay: number; totalCost: number };
  payrollFeeRevenue: number;
  cashReceived: number;
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

export default function ProfitabilityPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [initialPeriodSet, setInitialPeriodSet] = useState(false);
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
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.revenue.hours > 0 ? row.revenue.hours.toFixed(1) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {row.revenue.amountExGst > 0 ? fmtCurrencyFull(row.revenue.amountExGst) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.cost.grossEarnings > 0 ? fmtCurrencyFull(row.cost.grossEarnings) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.cost.superAmount > 0 ? fmtCurrencyFull(row.cost.superAmount) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {row.cost.totalCost > 0 ? fmtCurrencyFull(row.cost.totalCost) : "—"}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold ${profitColor}`}>
                            <span className="inline-flex items-center gap-1">
                              <ProfitIcon className="w-3.5 h-3.5" />
                              {fmtCurrencyFull(row.profit)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant="secondary" className={`text-xs ${marginColor}`} data-testid={`badge-margin-${row.placementId}`}>
                              {row.marginPercent.toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.cashReceived > 0 ? fmtCurrencyFull(row.cashReceived) : "—"}
                          </td>
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
    </div>
  );
}
