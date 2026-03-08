import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Users, TrendingUp, ChevronDown, ChevronUp,
  Receipt, ArrowUpRight, ArrowDownRight, Minus, Search,
} from "lucide-react";

interface Payment {
  date: string;
  amount: number;
  reference: string | null;
  bankAccount: string | null;
}

interface PayrollEntry {
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  gross: number;
  super_: number;
  net: number;
}

interface MatchedClient {
  clientId: string;
  clientName: string;
  hasPlacement: boolean;
  employeeCount: number;
  employees: { name: string; chargeOutRate: string | null }[];
  paymentCount: number;
  totalPaid: number;
  totalCost: number;
  net: number;
  payments: Payment[];
  payrollEntries: PayrollEntry[];
}

interface UnmatchedClient {
  clientName: string;
  hasPlacement: false;
  payments: Payment[];
  totalPaid: number;
}

interface LedgerData {
  matched: MatchedClient[];
  unmatched: UnmatchedClient[];
  totals: { totalClientPaid: number; totalEmployeeCost: number; netPosition: number };
  dateRange: { from: string; to: string };
}

function fmtCurrency(n: number): string {
  const prefix = n < 0 ? "-" : "";
  return prefix + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

type Preset = "1m" | "3m" | "6m" | "12m" | "all" | "custom";

function getPresetDates(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  if (preset === "all") return { from: "2018-01-01", to };
  const months = preset === "1m" ? 1 : preset === "3m" ? 3 : preset === "6m" ? 6 : 12;
  const from = new Date(now.getFullYear(), now.getMonth() - months, 1);
  return { from: from.toISOString().split("T")[0], to };
}

export default function ClientLedgerPage() {
  const [preset, setPreset] = useState<Preset>("3m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedUnmatched, setExpandedUnmatched] = useState(false);
  const [search, setSearch] = useState("");

  const dateRange = useMemo(() => {
    if (preset === "custom") {
      if (customFrom && customTo) return { from: customFrom, to: customTo };
      return null;
    }
    return getPresetDates(preset);
  }, [preset, customFrom, customTo]);

  const { data, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/client-ledger", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const res = await fetch(`/api/client-ledger?from=${dateRange!.from}&to=${dateRange!.to}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: dateRange !== null,
  });

  const toggleClient = (id: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const matched = data?.matched || [];
  const unmatched = data?.unmatched || [];
  const totals = data?.totals || { totalClientPaid: 0, totalEmployeeCost: 0, netPosition: 0 };

  const filteredMatched = useMemo(() => {
    if (!search.trim()) return matched;
    const s = search.toLowerCase();
    return matched.filter(c =>
      c.clientName.toLowerCase().includes(s) ||
      c.employees.some(e => e.name.toLowerCase().includes(s))
    );
  }, [matched, search]);

  const filteredUnmatched = useMemo(() => {
    if (!search.trim()) return unmatched;
    const s = search.toLowerCase();
    return unmatched.filter(c => c.clientName.toLowerCase().includes(s));
  }, [unmatched, search]);

  const NetIcon = totals.netPosition > 0 ? ArrowUpRight : totals.netPosition < 0 ? ArrowDownRight : Minus;

  return (
    <div className="flex flex-col h-full" data-testid="page-client-ledger">
      <TopBar title="Client Ledger" subtitle="Client payments received vs employee costs paid" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Period</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-44 h-9" data-testid="select-period-preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Last Month</SelectItem>
                <SelectItem value="3m">Last 3 Months</SelectItem>
                <SelectItem value="6m">Last 6 Months</SelectItem>
                <SelectItem value="12m">Last 12 Months</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                <Input type="date" className="h-9 w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} data-testid="input-date-from" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                <Input type="date" className="h-9 w-40" value={customTo} onChange={(e) => setCustomTo(e.target.value)} data-testid="input-date-to" />
              </div>
            </>
          )}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Filter clients or employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>
        </div>

        {data?.dateRange && (
          <p className="text-xs text-muted-foreground" data-testid="text-date-range">
            Showing data from {fmtDate(data.dateRange.from)} to {fmtDate(data.dateRange.to)}
          </p>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="kpi-cards">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Receipt className="w-3.5 h-3.5" />
                  Client Payments Received
                </div>
                <div className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="kpi-total-paid">
                  {fmtCurrency(totals.totalClientPaid)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Users className="w-3.5 h-3.5" />
                  Employee Costs Paid
                </div>
                <div className="text-xl font-bold" data-testid="kpi-total-cost">
                  {fmtCurrency(totals.totalEmployeeCost)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <NetIcon className="w-3.5 h-3.5" />
                  Net Position
                </div>
                <div className={`text-xl font-bold ${totals.netPosition >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="kpi-net-position">
                  {fmtCurrency(totals.netPosition)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {filteredMatched.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2" data-testid="text-no-matched">No Matched Clients</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Create placements on employee profiles to link employees to clients, then payments will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {filteredMatched.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Clients with Placements</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-matched-clients">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium w-8"></th>
                      <th className="text-left px-4 py-2.5 font-medium">Client</th>
                      <th className="text-right px-4 py-2.5 font-medium">Employees</th>
                      <th className="text-right px-4 py-2.5 font-medium">Payments</th>
                      <th className="text-right px-4 py-2.5 font-medium">Total Paid</th>
                      <th className="text-right px-4 py-2.5 font-medium">Employee Cost</th>
                      <th className="text-right px-4 py-2.5 font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatched.map((client) => {
                      const isExpanded = expandedClients.has(client.clientId);
                      const netColor = client.net > 0
                        ? "text-green-600 dark:text-green-400"
                        : client.net < 0
                        ? "text-red-600 dark:text-red-400"
                        : "";
                      return (
                        <MatchedClientRow
                          key={client.clientId}
                          client={client}
                          isExpanded={isExpanded}
                          onToggle={() => toggleClient(client.clientId)}
                          netColor={netColor}
                        />
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold">
                      <td className="px-4 py-3" colSpan={4}>Totals (Matched)</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(filteredMatched.reduce((s, c) => s + c.totalPaid, 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(filteredMatched.reduce((s, c) => s + c.totalCost, 0))}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${totals.netPosition >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmtCurrency(filteredMatched.reduce((s, c) => s + c.net, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {filteredUnmatched.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Other Payments (No Placement)</span>
                <Button variant="ghost" size="sm" onClick={() => setExpandedUnmatched(!expandedUnmatched)} data-testid="button-toggle-unmatched">
                  {expandedUnmatched ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="ml-1 text-xs">{filteredUnmatched.length} sources</span>
                </Button>
              </CardTitle>
            </CardHeader>
            {expandedUnmatched && (
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-unmatched-clients">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2.5 font-medium">Contact</th>
                        <th className="text-right px-4 py-2.5 font-medium">Payments</th>
                        <th className="text-right px-4 py-2.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnmatched.map((client) => (
                        <tr key={client.clientName} className="border-b" data-testid={`row-unmatched-${client.clientName}`}>
                          <td className="px-4 py-2.5">{client.clientName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{client.payments.length}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtCurrency(client.totalPaid)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50 font-semibold">
                        <td className="px-4 py-3">Total</td>
                        <td className="px-4 py-3 text-right tabular-nums">{filteredUnmatched.reduce((s, c) => s + c.payments.length, 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(filteredUnmatched.reduce((s, c) => s + c.totalPaid, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function MatchedClientRow({ client, isExpanded, onToggle, netColor }: {
  client: MatchedClient;
  isExpanded: boolean;
  onToggle: () => void;
  netColor: string;
}) {
  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
        data-testid={`row-client-${client.clientId}`}
      >
        <td className="px-4 py-3">
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3 font-medium">
          <div>{client.clientName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {client.employees.map(e => e.name).join(", ")}
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{client.employeeCount}</td>
        <td className="px-4 py-3 text-right tabular-nums">{client.paymentCount}</td>
        <td className="px-4 py-3 text-right tabular-nums font-medium text-green-600 dark:text-green-400">
          {client.totalPaid > 0 ? fmtCurrency(client.totalPaid) : "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-medium">
          {client.totalCost > 0 ? fmtCurrency(client.totalCost) : "—"}
        </td>
        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${netColor}`}>
          {fmtCurrency(client.net)}
        </td>
      </tr>
      {isExpanded && (
        <tr data-testid={`detail-client-${client.clientId}`}>
          <td colSpan={7} className="px-0 py-0">
            <div className="bg-muted/20 border-b">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-x">
                <div className="p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Payments Received ({client.payments.length})
                  </h4>
                  {client.payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments in this period</p>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {client.payments.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                          <div>
                            <span className="text-muted-foreground">{fmtDate(p.date)}</span>
                            {p.reference && <span className="text-xs text-muted-foreground ml-2">Ref: {p.reference}</span>}
                          </div>
                          <span className="font-medium tabular-nums text-green-600 dark:text-green-400">{fmtCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Employee Payroll ({client.payrollEntries.length})
                  </h4>
                  {client.payrollEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payroll entries in this period</p>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {client.payrollEntries.map((pe, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                          <div>
                            <span className="font-medium">{pe.employeeName}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {fmtDate(pe.periodStart)} — {fmtDate(pe.periodEnd)}
                            </span>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="font-medium">{fmtCurrency(pe.gross + pe.super_)}</span>
                            <span className="text-xs text-muted-foreground ml-1">(gross+super)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
