import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowUpDown,
  Search, CheckCircle, XCircle, ChevronDown, ChevronUp, Wallet,
  Landmark, CreditCard, Link2, Unlink, FileText, Receipt,
} from "lucide-react";
import type { BankTransaction } from "@shared/schema";

interface LinkageInfo {
  status: "linked_invoice" | "linked_rcti" | "matched_contact" | "unlinked";
  invoiceId?: string;
  invoiceNumber?: string;
  rctiId?: string;
  contactName?: string;
  isRctiClient?: boolean;
  employees?: { id: string; name: string; placementId: string }[];
}

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtCurrency(n: number): string {
  const val = isNaN(n) ? 0 : n;
  return "$" + Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeAmount(s: string | null | undefined): number {
  const n = parseFloat(s || "0");
  return isNaN(n) ? 0 : n;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

interface GroupedExpenses {
  contactName: string;
  total: number;
  count: number;
  transactions: BankTransaction[];
}

interface AccountSummary {
  bankAccountId: string;
  bankAccountName: string;
  totalIn: number;
  totalOut: number;
  txnCount: number;
}

export default function BankStatementsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "RECEIVE" | "SPEND">("all");
  const [linkageFilter, setLinkageFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [initialPeriodSet, setInitialPeriodSet] = useState(false);

  const { data: latestPeriod } = useQuery<{ month: number; year: number }>({
    queryKey: ["/api/bank-transactions/latest-period"],
    queryFn: async () => {
      const res = await fetch("/api/bank-transactions/latest-period", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
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

  const { data, isLoading } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/bank-transactions?month=${month}&year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const { data: linkageData } = useQuery<Record<string, LinkageInfo>>({
    queryKey: ["/api/bank-transactions/linkage", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/bank-transactions/linkage?month=${month}&year=${year}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const transactions = data || [];

  const accountSummaries = useMemo(() => {
    const map: Record<string, AccountSummary> = {};
    for (const t of transactions) {
      const id = t.bankAccountId || "unknown";
      if (!map[id]) {
        map[id] = {
          bankAccountId: id,
          bankAccountName: t.bankAccountName || "Unknown Account",
          totalIn: 0,
          totalOut: 0,
          txnCount: 0,
        };
      }
      map[id].txnCount++;
      if (t.type === "RECEIVE") {
        map[id].totalIn += safeAmount(t.amount);
      } else {
        map[id].totalOut += safeAmount(t.amount);
      }
    }
    return Object.values(map).sort((a, b) => b.txnCount - a.txnCount);
  }, [transactions]);

  const accountFiltered = useMemo(() => {
    if (selectedAccount === "all") return transactions;
    return transactions.filter(t => (t.bankAccountId || "unknown") === selectedAccount);
  }, [transactions, selectedAccount]);

  const typeFiltered = useMemo(() => {
    if (typeFilter === "all") return accountFiltered;
    return accountFiltered.filter(t => t.type === typeFilter);
  }, [accountFiltered, typeFilter]);

  const amountFiltered = useMemo(() => {
    const min = amountMin ? parseFloat(amountMin) : null;
    const max = amountMax ? parseFloat(amountMax) : null;
    if (min === null && max === null) return typeFiltered;
    return typeFiltered.filter(t => {
      const amt = safeAmount(t.amount);
      if (min !== null && amt < min) return false;
      if (max !== null && amt > max) return false;
      return true;
    });
  }, [typeFiltered, amountMin, amountMax]);

  const linkageFiltered = useMemo(() => {
    if (linkageFilter === "all" || !linkageData) return amountFiltered;
    return amountFiltered.filter(t => {
      const info = linkageData[t.id];
      const isLinked = info && (info.status === "linked_invoice" || info.status === "linked_rcti" || info.status === "matched_contact");
      return linkageFilter === "linked" ? isLinked : !isLinked;
    });
  }, [amountFiltered, linkageFilter, linkageData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return linkageFiltered;
    const s = search.toLowerCase();
    return linkageFiltered.filter(t =>
      (t.contactName || "").toLowerCase().includes(s) ||
      (t.description || "").toLowerCase().includes(s) ||
      (t.reference || "").toLowerCase().includes(s) ||
      (t.bankAccountName || "").toLowerCase().includes(s)
    );
  }, [linkageFiltered, search]);

  const expenses = filtered.filter(t => t.type === "SPEND");
  const income = filtered.filter(t => t.type === "RECEIVE");

  const totalIncome = income.reduce((s, t) => s + safeAmount(t.amount), 0);
  const totalExpenses = expenses.reduce((s, t) => s + safeAmount(t.amount), 0);
  const netCashFlow = totalIncome - totalExpenses;

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, GroupedExpenses> = {};
    for (const t of expenses) {
      const key = t.contactName || "Unknown";
      if (!groups[key]) {
        groups[key] = { contactName: key, total: 0, count: 0, transactions: [] };
      }
      groups[key].total += safeAmount(t.amount);
      groups[key].count++;
      groups[key].transactions.push(t);
    }
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const getAccountIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("credit") || lower.includes("amex") || lower.includes("card")) {
      return <CreditCard className="w-4 h-4" />;
    }
    return <Landmark className="w-4 h-4" />;
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Bank Statements"
        subtitle="View income and expenses from Xero bank transactions"
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

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="h-8 w-[180px] text-sm" data-testid="select-account-filter">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accountSummaries.map(a => (
                    <SelectItem key={a.bankAccountId} value={a.bankAccountId}>
                      {a.bankAccountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center rounded-md border overflow-hidden" data-testid="filter-type-toggle">
                {(["all", "RECEIVE", "SPEND"] as const).map((val) => (
                  <button
                    key={val}
                    onClick={() => setTypeFilter(val)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      typeFilter === val
                        ? "bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted/60 text-muted-foreground"
                    }`}
                    data-testid={`button-type-${val}`}
                  >
                    {val === "all" ? "All" : val === "RECEIVE" ? "Receive" : "Spend"}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-md border overflow-hidden" data-testid="filter-linkage-toggle">
                {(["all", "linked", "unlinked"] as const).map((val) => (
                  <button
                    key={val}
                    onClick={() => setLinkageFilter(val)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      linkageFilter === val
                        ? "bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted/60 text-muted-foreground"
                    }`}
                    data-testid={`button-linkage-${val}`}
                  >
                    {val === "all" ? "All" : val === "linked" ? <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />Linked</span> : <span className="flex items-center gap-1"><Unlink className="w-3 h-3" />Unlinked</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  placeholder="Min $"
                  className="h-8 w-[80px] text-sm"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  data-testid="input-amount-min"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="number"
                  placeholder="Max $"
                  className="h-8 w-[80px] text-sm"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  data-testid="input-amount-max"
                />
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  className="pl-8 h-8 w-[220px] text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>

          {accountSummaries.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="bank-accounts-overview">
              {accountSummaries.map(a => {
                const net = a.totalIn - a.totalOut;
                const isSelected = selectedAccount === a.bankAccountId;
                return (
                  <button
                    key={a.bankAccountId}
                    onClick={() => setSelectedAccount(isSelected ? "all" : a.bankAccountId)}
                    className={`p-3 rounded-lg border text-left transition-all hover:shadow-sm ${
                      isSelected
                        ? "ring-2 ring-primary border-primary bg-primary/5"
                        : "bg-card hover:border-primary/40"
                    }`}
                    data-testid={`card-account-${a.bankAccountId}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-md ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {getAccountIcon(a.bankAccountName)}
                      </div>
                      <span className="text-xs font-semibold truncate">{a.bankAccountName}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">In</span>
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">+{fmtCurrency(a.totalIn)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Out</span>
                        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">-{fmtCurrency(a.totalOut)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-1 mt-1">
                        <span className="text-[10px] text-muted-foreground">Net</span>
                        <span className={`text-[11px] font-bold ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {net >= 0 ? "+" : "-"}{fmtCurrency(net)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1.5">{a.txnCount} transactions</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg border bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800" data-testid="kpi-income">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] font-medium text-muted-foreground">Total Income</span>
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalIncome)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{income.length} transactions</div>
            </div>
            <div className="p-3.5 rounded-lg border bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800" data-testid="kpi-expenses">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-[11px] font-medium text-muted-foreground">Total Expenses</span>
              </div>
              <div className="text-xl font-bold text-red-600 dark:text-red-400">{fmtCurrency(totalExpenses)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{expenses.length} transactions</div>
            </div>
            <div className={`p-3.5 rounded-lg border ${netCashFlow >= 0 ? "bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800" : "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"}`} data-testid="kpi-cashflow">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpDown className={`w-4 h-4 ${netCashFlow >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`} />
                <span className="text-[11px] font-medium text-muted-foreground">Net Cash Flow</span>
              </div>
              <div className={`text-xl font-bold ${netCashFlow >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`}>
                {netCashFlow >= 0 ? "" : "-"}{fmtCurrency(netCashFlow)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{filtered.length} total transactions</div>
            </div>
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              </CardContent>
            </Card>
          ) : transactions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                <h3 className="text-sm font-semibold mb-1" data-testid="text-no-transactions">No bank transactions</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No bank transactions found for {MONTHS[month]} {year}. Sync bank transactions from Xero in Settings to see your expenses here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="expenses">
              <TabsList data-testid="tabs-bank">
                <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses ({expenses.length})</TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-all">All Transactions ({filtered.length})</TabsTrigger>
                <TabsTrigger value="income" data-testid="tab-income">Income ({income.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="expenses" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Expenses by Payee — {MONTHS[month]} {year}
                      {selectedAccount !== "all" && (
                        <span className="text-xs font-normal text-muted-foreground ml-2">
                          ({accountSummaries.find(a => a.bankAccountId === selectedAccount)?.bankAccountName})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {groupedExpenses.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No expenses found.</p>
                    ) : (
                      <div className="space-y-1">
                        {groupedExpenses.map((group) => (
                          <div key={group.contactName} className="border rounded-lg overflow-hidden" data-testid={`expense-group-${group.contactName}`}>
                            <button
                              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                              onClick={() => toggleGroup(group.contactName)}
                              data-testid={`button-toggle-${group.contactName}`}
                            >
                              <div className="flex items-center gap-2">
                                {expandedGroups.has(group.contactName) ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="text-sm font-semibold">{group.contactName}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{group.count}</Badge>
                              </div>
                              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                                {fmtCurrency(group.total)}
                              </span>
                            </button>
                            {expandedGroups.has(group.contactName) && (
                              <div className="border-t">
                                <table className="w-full text-sm">
                                  <tbody>
                                    {group.transactions.map((t) => (
                                      <tr key={t.id} className="border-b last:border-0 border-border/50">
                                        <td className="py-2 px-3 text-xs text-muted-foreground w-[90px]">{fmtDate(t.date)}</td>
                                        <td className="py-2 px-3 text-xs truncate max-w-[200px]">{t.description || t.reference || "—"}</td>
                                        <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[120px] hidden md:table-cell">{t.bankAccountName || "—"}</td>
                                        <td className="py-2 px-3 text-right">
                                          <span className="font-mono text-xs font-semibold text-red-600 dark:text-red-400">
                                            {fmtCurrency(safeAmount(t.amount))}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 w-[30px]">
                                          {t.isReconciled ? (
                                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                          ) : (
                                            <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-3 border-t-2 border-border font-semibold">
                          <span className="text-sm">Total Expenses</span>
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">{fmtCurrency(totalExpenses)}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                <TransactionTable transactions={filtered} title={`All Transactions — ${MONTHS[month]} ${year}`} linkage={linkageData} />
              </TabsContent>

              <TabsContent value="income" className="mt-4">
                <TransactionTable transactions={income} title={`Income — ${MONTHS[month]} ${year}`} linkage={linkageData} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}

function LinkageBadge({ info }: { info?: LinkageInfo }) {
  if (!info) return <span className="text-muted-foreground/30 text-[10px]">—</span>;

  if (info.status === "linked_invoice") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 gap-0.5" data-testid="badge-linked-invoice">
        <FileText className="w-2.5 h-2.5" />
        {info.invoiceNumber || "INV"}
      </Badge>
    );
  }

  if (info.status === "linked_rcti") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 gap-0.5" data-testid="badge-linked-rcti">
        <Receipt className="w-2.5 h-2.5" />
        RCTI
      </Badge>
    );
  }

  if (info.status === "matched_contact") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 gap-0.5" data-testid="badge-matched-contact">
        <Link2 className="w-2.5 h-2.5" />
        {info.invoiceNumber || "Match"}
      </Badge>
    );
  }

  if (info.isRctiClient) {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 gap-0.5" data-testid="badge-unlinked-rcti">
        <Unlink className="w-2.5 h-2.5" />
        Unlinked RCTI
      </Badge>
    );
  }

  return <span className="text-muted-foreground/30 text-[10px]">—</span>;
}

function TransactionTable({ transactions, title, linkage }: { transactions: BankTransaction[]; title: string; linkage?: Record<string, LinkageInfo> }) {
  const [sortField, setSortField] = useState<"date" | "amount" | "contact">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      if (sortField === "date") {
        const cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortField === "contact") {
        const cmp = (a.contactName || "").localeCompare(b.contactName || "");
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = safeAmount(a.amount) - safeAmount(b.amount);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, sortField, sortDir]);

  const toggleSort = (field: "date" | "amount" | "contact") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "contact" ? "asc" : "desc"); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-transactions">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("date")}>
                    <div className="flex items-center gap-1">Date {sortField === "date" && (sortDir === "asc" ? "↑" : "↓")}</div>
                  </th>
                  <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("contact")}>
                    <div className="flex items-center gap-1">Contact {sortField === "contact" && (sortDir === "asc" ? "↑" : "↓")}</div>
                  </th>
                  <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Description</th>
                  <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Reference</th>
                  <th className="text-left py-2.5 px-2 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Account</th>
                  <th className="text-right py-2.5 px-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                    <div className="flex items-center justify-end gap-1">Amount {sortField === "amount" && (sortDir === "asc" ? "↑" : "↓")}</div>
                  </th>
                  <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground">Linked</th>
                  <th className="text-center py-2.5 px-2 text-xs font-semibold text-muted-foreground w-[40px]">Rec</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-txn-${t.id}`}>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="py-2.5 px-2">
                      <Badge
                        className={`text-[10px] px-1.5 py-0 ${t.type === "RECEIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}`}
                      >
                        {t.type === "RECEIVE" ? "IN" : "OUT"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-sm font-medium truncate max-w-[180px]">{t.contactName || "—"}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground truncate max-w-[200px] hidden md:table-cell">{t.description || "—"}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground truncate max-w-[120px] hidden lg:table-cell">{t.reference || "—"}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground truncate max-w-[120px] hidden lg:table-cell">{t.bankAccountName || "—"}</td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={`font-mono text-xs font-semibold ${t.type === "RECEIVE" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {t.type === "RECEIVE" ? "+" : "-"}{fmtCurrency(safeAmount(t.amount))}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <LinkageBadge info={linkage?.[t.id]} />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {t.isReconciled ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
