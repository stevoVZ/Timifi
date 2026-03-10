import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet, TrendingUp, TrendingDown, CreditCard, Building2,
  ArrowUpDown, Users, Receipt, DollarSign, Landmark, PiggyBank
} from "lucide-react";

interface AccountSummary {
  name: string;
  totalIn: number;
  totalOut: number;
  net: number;
  txnCount: number;
  earliest: string | null;
  latest: string | null;
}

interface EmployeeCashFlow {
  id: string;
  name: string;
  revenue: number;
  cost: number;
  txns: number;
}

interface MonthlyFlow {
  month: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

interface CashPositionData {
  accounts: AccountSummary[];
  netCashFlow: number;
  amex: {
    totalCharged: number;
    cardPurchases: number;
    totalCredits: number;
    repaymentsFromBank: number;
    totalPaidOff: number;
    outstandingDebt: number;
  };
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    linkedRevenue: number;
    linkedCost: number;
    atoSpend: number;
    superSpend: number;
    businessExpenses: number;
    interAccountTransfers: number;
    linkedTxns: number;
    unlinkedTxns: number;
  };
  employees: EmployeeCashFlow[];
  monthlyFlow: MonthlyFlow[];
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatMonth(m: string): string {
  const [y, mo] = m.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(mo)]} ${y}`;
}

function KpiCard({ title, value, subtitle, icon: Icon, variant = "default", testId }: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  variant?: "default" | "positive" | "negative" | "warning";
  testId: string;
}) {
  const colors = {
    default: "text-foreground",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
  };
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold tabular-nums ${colors[variant]}`} data-testid={`${testId}-value`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountCard({ account }: { account: AccountSummary }) {
  const isAmex = account.name.includes("American Express");
  const icon = isAmex ? CreditCard : account.name.includes("Tax") ? Receipt : Landmark;
  const Icon = icon;
  const displayName = isAmex ? "Amex Platinum Business" : account.name;

  return (
    <Card data-testid={`card-account-${account.name.replace(/\s+/g, "-").toLowerCase()}`}>
      <CardHeader className="pb-2 px-5 pt-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">{displayName}</CardTitle>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {account.earliest && account.latest
            ? `${new Date(account.earliest).toLocaleDateString("en-AU", { month: "short", year: "numeric" })} — ${new Date(account.latest).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`
            : ""}
          {" "} ({account.txnCount} transactions)
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Money In</p>
            <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(account.totalIn)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Money Out</p>
            <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{fmt(account.totalOut)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Net</p>
            <p className={`text-sm font-bold tabular-nums ${account.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {fmt(account.net)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CashPositionPage() {
  const { data, isLoading } = useQuery<CashPositionData>({
    queryKey: ["/api/cash-position"],
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Cash Position" />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        </div>
      </div>
    );
  }

  const operatingNet = data.netCashFlow;
  const amexDebt = data.amex.outstandingDebt;

  const recentMonths = data.monthlyFlow.slice(-12);

  const maxBar = Math.max(...recentMonths.map(m => Math.max(m.cashIn, m.cashOut)), 1);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Cash Position" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        <p className="text-xs text-muted-foreground">
          Based on all synced bank transactions. Net cash flow reflects total movement since first transaction — not the current bank balance (opening balances are not included).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Net Cash Flow"
            value={fmt(operatingNet)}
            subtitle="Total inflows minus outflows (excl. Amex)"
            icon={Wallet}
            variant={operatingNet >= 0 ? "positive" : "negative"}
            testId="kpi-net-position"
          />
          <KpiCard
            title="Amex Outstanding"
            value={fmt(amexDebt)}
            subtitle={`${fmt(data.amex.repaymentsFromBank)} repaid so far`}
            icon={CreditCard}
            variant={amexDebt > 0 ? "warning" : "default"}
            testId="kpi-amex-debt"
          />
          <KpiCard
            title="Total Revenue Received"
            value={fmt(data.summary.linkedRevenue)}
            subtitle={`${data.summary.linkedTxns} linked transactions`}
            icon={TrendingUp}
            variant="positive"
            testId="kpi-total-revenue"
          />
          <KpiCard
            title="Total Employee Costs"
            value={fmt(data.summary.linkedCost)}
            subtitle="Payroll + contractor payments"
            icon={Users}
            variant="negative"
            testId="kpi-total-costs"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.accounts.filter(a => !a.name.includes("American Express")).map(acct => (
            <AccountCard key={acct.name} account={acct} />
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          <Card className="xl:col-span-2" data-testid="card-amex-tracker">
            <CardHeader className="pb-3 px-5 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Amex Debt Tracker
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {(() => {
                const totalCharged = data.amex.totalCharged;
                const totalPaidOff = data.amex.totalPaidOff;
                const repaidPct = totalCharged > 0 ? (totalPaidOff / totalCharged) * 100 : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">Total Charged</p>
                        <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{fmt(totalCharged)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">Credits/Refunds</p>
                        <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(data.amex.totalCredits)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">Repaid from Bank</p>
                        <p className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{fmt(data.amex.repaymentsFromBank)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">Outstanding Debt</p>
                        <p className={`text-lg font-bold tabular-nums ${data.amex.outstandingDebt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {fmt(data.amex.outstandingDebt)}
                        </p>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                      <div className="h-full flex">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(repaidPct, 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {repaidPct.toFixed(0)}% paid off
                      </span>
                      <span className="text-[11px] text-muted-foreground">{fmt(totalCharged)} total</span>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card data-testid="card-expense-breakdown">
            <CardHeader className="pb-3 px-5 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PiggyBank className="w-4 h-4" />
                Expense Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-3">
              {[
                { label: "ATO / Tax", value: data.summary.atoSpend, icon: Receipt },
                { label: "Superannuation", value: data.summary.superSpend, icon: PiggyBank },
                { label: "Business Expenses (Amex)", value: data.summary.businessExpenses, icon: CreditCard },
                { label: "Inter-Account Transfers", value: data.summary.interAccountTransfers, icon: ArrowUpDown },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{fmt(item.value)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex items-center justify-between">
                <span className="text-sm font-medium">Linked / Unlinked Txns</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-emerald-600">{data.summary.linkedTxns} linked</Badge>
                  <Badge variant="outline" className="text-amber-600">{data.summary.unlinkedTxns} unlinked</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-monthly-flow">
          <CardHeader className="pb-3 px-5 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Monthly Cash Flow (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-2">
              <div className="grid grid-cols-[100px_1fr_100px_100px_100px] gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b">
                <div>Month</div>
                <div>Flow</div>
                <div className="text-right">In</div>
                <div className="text-right">Out</div>
                <div className="text-right">Net</div>
              </div>
              {recentMonths.map(m => {
                const inPct = (m.cashIn / maxBar) * 100;
                const outPct = (m.cashOut / maxBar) * 100;
                return (
                  <div key={m.month} className="grid grid-cols-[100px_1fr_100px_100px_100px] gap-2 items-center" data-testid={`row-flow-${m.month}`}>
                    <div className="text-sm font-medium">{formatMonth(m.month)}</div>
                    <div className="flex flex-col gap-0.5">
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${inPct}%` }} />
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${outPct}%` }} />
                      </div>
                    </div>
                    <div className="text-sm tabular-nums text-right text-emerald-600 dark:text-emerald-400">{fmt(m.cashIn)}</div>
                    <div className="text-sm tabular-nums text-right text-red-600 dark:text-red-400">{fmt(m.cashOut)}</div>
                    <div className={`text-sm font-semibold tabular-nums text-right ${m.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmt(m.net)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-employee-cashflow">
          <CardHeader className="pb-3 px-5 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Employee Cash Flow Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-[11px] font-medium text-muted-foreground uppercase">Employee</th>
                    <th className="text-right py-2 px-2 text-[11px] font-medium text-muted-foreground uppercase">Revenue In</th>
                    <th className="text-right py-2 px-2 text-[11px] font-medium text-muted-foreground uppercase">Costs Out</th>
                    <th className="text-right py-2 px-2 text-[11px] font-medium text-muted-foreground uppercase">Net</th>
                    <th className="text-right py-2 px-2 text-[11px] font-medium text-muted-foreground uppercase">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map(emp => {
                    const net = emp.revenue - emp.cost;
                    return (
                      <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-employee-${emp.id}`}>
                        <td className="py-2 px-2 font-medium">{emp.name}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {emp.revenue > 0 ? fmtFull(emp.revenue) : "—"}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-red-600 dark:text-red-400">
                          {emp.cost > 0 ? fmtFull(emp.cost) : "—"}
                        </td>
                        <td className={`py-2 px-2 text-right tabular-nums font-semibold ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmtFull(net)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{emp.txns}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-2 px-2">Total</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtFull(data.employees.reduce((s, e) => s + e.revenue, 0))}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-red-600 dark:text-red-400">
                      {fmtFull(data.employees.reduce((s, e) => s + e.cost, 0))}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums ${data.employees.reduce((s, e) => s + e.revenue - e.cost, 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtFull(data.employees.reduce((s, e) => s + e.revenue - e.cost, 0))}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {data.employees.reduce((s, e) => s + e.txns, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
