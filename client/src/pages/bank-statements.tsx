import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowUpDown,
  Search, CheckCircle, XCircle, ChevronDown, ChevronUp, Wallet,
  Landmark, CreditCard, Link2, Unlink, FileText, Receipt,
  Wand2, Check, X, Edit3, User, RotateCcw, Tag, AlertCircle,
} from "lucide-react";
import type { BankTransaction } from "@shared/schema";

interface LinkageInfo {
  status: "linked_invoice" | "linked_rcti" | "matched_contact" | "confirmed" | "manual" | "suggested" | "rejected" | "unlinked";
  invoiceId?: string;
  invoiceNumber?: string;
  rctiId?: string;
  contactName?: string;
  isRctiClient?: boolean;
  employeeId?: string;
  employeeName?: string;
  category?: string;
  notes?: string;
  employees?: { id: string; name: string; placementId: string }[];
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string | null;
  contactName: string | null;
  amountInclGst: string | null;
  date: string | null;
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const EXPENSE_CATEGORIES = [
  "Payroll",
  "Superannuation",
  "ATO / Tax",
  "Contractor Payment",
  "Office Expense",
  "Software / IT",
  "Professional Fees",
  "Insurance",
  "Travel",
  "Bank Fees",
  "Utilities",
  "Marketing",
  "Training",
  "Other",
];

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

interface AccountSummary {
  bankAccountId: string;
  bankAccountName: string;
  totalIn: number;
  totalOut: number;
  txnCount: number;
}

function isLinkedStatus(info?: LinkageInfo): boolean {
  if (!info) return false;
  return ["linked_invoice", "linked_rcti", "matched_contact", "confirmed", "manual"].includes(info.status);
}

export default function BankStatementsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "RECEIVE" | "SPEND">("all");
  const [initialPeriodSet, setInitialPeriodSet] = useState(false);
  const [linkDialogTxn, setLinkDialogTxn] = useState<BankTransaction | null>(null);
  const [linkInvoiceId, setLinkInvoiceId] = useState("");
  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [linkCategory, setLinkCategory] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [linkTab, setLinkTab] = useState<"invoice" | "employee" | "category">("invoice");
  const [expandedLinked, setExpandedLinked] = useState(true);
  const [expandedUnlinked, setExpandedUnlinked] = useState(true);
  const { toast } = useToast();

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

  const { data: invoicesData } = useQuery<InvoiceOption[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: employeesData } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const invalidateLinkage = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions/linkage", month, year] });
    queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions", month, year] });
  };

  const autoSuggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bank-transactions/auto-suggest?month=${month}&year=${year}`);
      return res.json();
    },
    onSuccess: (data: { suggestedCount: number; autoLinkedCount?: number; totalTransactions: number }) => {
      invalidateLinkage();
      const linked = data.autoLinkedCount || 0;
      const suggested = data.suggestedCount;
      toast({
        title: "Auto-Link Complete",
        description: linked + suggested > 0
          ? `${linked} auto-linked, ${suggested} suggestions to review out of ${data.totalTransactions} transactions.`
          : `No new links found for ${data.totalTransactions} transactions.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Auto-Link Failed", description: err.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ id, action, invoiceId, employeeId, category, notes }: { id: string; action: string; invoiceId?: string; employeeId?: string; category?: string; notes?: string }) => {
      await apiRequest("PATCH", `/api/bank-transactions/${id}/link`, { action, invoiceId, employeeId, category, notes });
    },
    onSuccess: () => {
      invalidateLinkage();
    },
    onError: (err: Error) => {
      toast({ title: "Link Failed", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bank-transactions/${id}/link`);
    },
    onSuccess: () => {
      invalidateLinkage();
    },
    onError: (err: Error) => {
      toast({ title: "Unlink Failed", description: err.message, variant: "destructive" });
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

  const filtered = useMemo(() => {
    let result = transactions;
    if (selectedAccount !== "all") {
      result = result.filter(t => (t.bankAccountId || "unknown") === selectedAccount);
    }
    if (typeFilter !== "all") {
      result = result.filter(t => t.type === typeFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(t =>
        (t.contactName || "").toLowerCase().includes(s) ||
        (t.description || "").toLowerCase().includes(s) ||
        (t.reference || "").toLowerCase().includes(s) ||
        (t.bankAccountName || "").toLowerCase().includes(s)
      );
    }
    return result;
  }, [transactions, selectedAccount, typeFilter, search]);

  const { linkedTxns, unlinkedTxns, suggestedTxns } = useMemo(() => {
    const linked: BankTransaction[] = [];
    const unlinked: BankTransaction[] = [];
    const suggested: BankTransaction[] = [];
    for (const t of filtered) {
      const info = linkageData?.[t.id];
      if (info?.status === "suggested") {
        suggested.push(t);
      } else if (isLinkedStatus(info)) {
        linked.push(t);
      } else {
        unlinked.push(t);
      }
    }
    return { linkedTxns: linked, unlinkedTxns: unlinked, suggestedTxns: suggested };
  }, [filtered, linkageData]);

  const totalIncome = filtered.filter(t => t.type === "RECEIVE").reduce((s, t) => s + safeAmount(t.amount), 0);
  const totalExpenses = filtered.filter(t => t.type === "SPEND").reduce((s, t) => s + safeAmount(t.amount), 0);
  const netCashFlow = totalIncome - totalExpenses;
  const linkedTotal = linkedTxns.reduce((s, t) => s + safeAmount(t.amount), 0);
  const unlinkedTotal = unlinkedTxns.reduce((s, t) => s + safeAmount(t.amount), 0);
  const suggestedTotal = suggestedTxns.reduce((s, t) => s + safeAmount(t.amount), 0);
  const linkedPct = filtered.length > 0 ? Math.round((linkedTxns.length / filtered.length) * 100) : 0;

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

  const openLinkDialog = (txn: BankTransaction) => {
    setLinkDialogTxn(txn);
    setLinkInvoiceId("");
    setLinkEmployeeId("");
    setLinkCategory("");
    setLinkNotes("");
    setInvoiceSearch("");
    setEmployeeSearch("");
    setLinkTab(txn.type === "SPEND" ? "category" : "invoice");
  };

  const handleManualLink = () => {
    if (!linkDialogTxn) return;
    if (!linkInvoiceId && !linkEmployeeId && !linkCategory) {
      toast({ title: "Select an invoice, employee, or category", variant: "destructive" });
      return;
    }
    linkMutation.mutate({
      id: linkDialogTxn.id,
      action: "manual",
      invoiceId: linkInvoiceId || undefined,
      employeeId: linkEmployeeId || undefined,
      category: linkCategory || undefined,
      notes: linkNotes || undefined,
    });
    setLinkDialogTxn(null);
  };

  const handleConfirm = (txnId: string) => {
    linkMutation.mutate({ id: txnId, action: "confirm" });
  };

  const handleReject = (txnId: string) => {
    linkMutation.mutate({ id: txnId, action: "reject" });
  };

  const handleUnlink = (txnId: string) => {
    unlinkMutation.mutate(txnId);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Bank Statements" />
        <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
          <div className="max-w-7xl mx-auto space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Bank Statements"
        subtitle={`${MONTHS[month]} ${year}`}
      />
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={prevMonth} data-testid="button-prev-month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                  <SelectTrigger className="h-8 w-[100px] sm:w-[130px] text-sm font-semibold" data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.slice(1).map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger className="h-8 w-[72px] sm:w-[80px] text-sm font-semibold" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2022, 2023, 2024, 2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={nextMonth} data-testid="button-next-month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => autoSuggestMutation.mutate()}
                disabled={autoSuggestMutation.isPending}
                data-testid="button-auto-suggest"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {autoSuggestMutation.isPending ? "Linking..." : "Auto-Link"}
              </Button>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs" data-testid="select-account-filter">
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
                    className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                      typeFilter === val
                        ? "bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted/60 text-muted-foreground"
                    }`}
                    data-testid={`button-type-${val}`}
                  >
                    {val === "all" ? "All" : val === "RECEIVE" ? "Income" : "Expenses"}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-8 h-8 w-full sm:w-[180px] text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800" data-testid="kpi-income">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] font-medium text-muted-foreground">Income</span>
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalIncome)}</div>
            </div>
            <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800" data-testid="kpi-expenses">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                <span className="text-[10px] font-medium text-muted-foreground">Expenses</span>
              </div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{fmtCurrency(totalExpenses)}</div>
            </div>
            <div className={`p-3 rounded-lg border ${netCashFlow >= 0 ? "bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800" : "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"}`} data-testid="kpi-cashflow">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpDown className={`w-3.5 h-3.5 ${netCashFlow >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`} />
                <span className="text-[10px] font-medium text-muted-foreground">Net Flow</span>
              </div>
              <div className={`text-lg font-bold ${netCashFlow >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}`}>
                {netCashFlow >= 0 ? "" : "-"}{fmtCurrency(netCashFlow)}
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" data-testid="kpi-linked">
              <div className="flex items-center gap-1.5 mb-1">
                <Link2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] font-medium text-muted-foreground">Linked</span>
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{linkedTxns.length}</div>
              <div className="text-[10px] text-muted-foreground">{linkedPct}% of {filtered.length}</div>
            </div>
            <div className={`p-3 rounded-lg border ${unlinkedTxns.length + suggestedTxns.length > 0 ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800" : "bg-muted/30 border-border"}`} data-testid="kpi-unlinked">
              <div className="flex items-center gap-1.5 mb-1">
                <Unlink className={`w-3.5 h-3.5 ${unlinkedTxns.length + suggestedTxns.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
                <span className="text-[10px] font-medium text-muted-foreground">Unlinked</span>
              </div>
              <div className={`text-lg font-bold ${unlinkedTxns.length + suggestedTxns.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{unlinkedTxns.length + suggestedTxns.length}</div>
              {suggestedTxns.length > 0 && <div className="text-[10px] text-amber-600 dark:text-amber-400">{suggestedTxns.length} suggested</div>}
            </div>
          </div>

          {transactions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                <h3 className="text-sm font-semibold mb-1" data-testid="text-no-transactions">No bank transactions</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No bank transactions found for {MONTHS[month]} {year}.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">

              {(unlinkedTxns.length > 0 || suggestedTxns.length > 0) && (
                <Card className="border-amber-200 dark:border-amber-800" data-testid="section-unlinked">
                  <CardHeader className="pb-2 px-4 pt-3">
                    <button
                      className="flex items-center justify-between w-full"
                      onClick={() => setExpandedUnlinked(!expandedUnlinked)}
                      data-testid="button-toggle-unlinked"
                    >
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        Needs Attention
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                          {unlinkedTxns.length + suggestedTxns.length}
                        </Badge>
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          {fmtCurrency(unlinkedTotal + suggestedTotal)}
                        </span>
                      </CardTitle>
                      {expandedUnlinked ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </CardHeader>
                  {expandedUnlinked && (
                    <CardContent className="px-0 pb-0">
                      {suggestedTxns.length > 0 && (
                        <div className="mb-0">
                          <div className="px-4 py-2 bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/30">
                            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                              <Wand2 className="w-3 h-3" /> Suggested Links ({suggestedTxns.length})
                            </span>
                          </div>
                          <TransactionRows
                            transactions={suggestedTxns}
                            linkage={linkageData}
                            onLink={openLinkDialog}
                            onConfirm={handleConfirm}
                            onReject={handleReject}
                            onUnlink={handleUnlink}
                            isPending={linkMutation.isPending || unlinkMutation.isPending}
                          />
                        </div>
                      )}
                      {unlinkedTxns.length > 0 && (
                        <div>
                          {suggestedTxns.length > 0 && (
                            <div className="px-4 py-2 bg-muted/30 border-b border-t">
                              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                                <Unlink className="w-3 h-3" /> Unlinked ({unlinkedTxns.length})
                              </span>
                            </div>
                          )}
                          <TransactionRows
                            transactions={unlinkedTxns}
                            linkage={linkageData}
                            onLink={openLinkDialog}
                            onConfirm={handleConfirm}
                            onReject={handleReject}
                            onUnlink={handleUnlink}
                            isPending={linkMutation.isPending || unlinkMutation.isPending}
                          />
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {linkedTxns.length > 0 && (
                <Card data-testid="section-linked">
                  <CardHeader className="pb-2 px-4 pt-3">
                    <button
                      className="flex items-center justify-between w-full"
                      onClick={() => setExpandedLinked(!expandedLinked)}
                      data-testid="button-toggle-linked"
                    >
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        Linked Transactions
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          {linkedTxns.length}
                        </Badge>
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          {fmtCurrency(linkedTotal)}
                        </span>
                      </CardTitle>
                      {expandedLinked ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </CardHeader>
                  {expandedLinked && (
                    <CardContent className="px-0 pb-0">
                      <TransactionRows
                        transactions={linkedTxns}
                        linkage={linkageData}
                        onLink={openLinkDialog}
                        onConfirm={handleConfirm}
                        onReject={handleReject}
                        onUnlink={handleUnlink}
                        isPending={linkMutation.isPending || unlinkMutation.isPending}
                      />
                    </CardContent>
                  )}
                </Card>
              )}

              {filtered.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">No transactions match your filters.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!linkDialogTxn} onOpenChange={(open) => { if (!open) setLinkDialogTxn(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Transaction</DialogTitle>
            <DialogDescription>
              {linkDialogTxn && (
                <span className="flex items-center gap-2">
                  <Badge className={`text-[10px] px-1.5 py-0 ${linkDialogTxn.type === "RECEIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {linkDialogTxn.type === "RECEIVE" ? "IN" : "OUT"}
                  </Badge>
                  {fmtDate(linkDialogTxn.date)} — {linkDialogTxn.contactName || "Unknown"} — {fmtCurrency(safeAmount(linkDialogTxn.amount))}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex rounded-md border overflow-hidden mb-3" data-testid="link-type-tabs">
            {([
              { key: "invoice" as const, label: "Invoice", icon: FileText },
              { key: "employee" as const, label: "Employee", icon: User },
              { key: "category" as const, label: "Category", icon: Tag },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setLinkTab(key);
                  if (key !== "invoice") setLinkInvoiceId("");
                  if (key !== "employee") setLinkEmployeeId("");
                  if (key !== "category") setLinkCategory("");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  linkTab === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted/60 text-muted-foreground"
                }`}
                data-testid={`button-link-tab-${key}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {linkTab === "invoice" && (
              <div>
                <Input
                  placeholder="Search invoices by number or contact..."
                  className="h-8 text-sm mb-2"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  data-testid="input-search-invoice"
                />
                <div className="max-h-[200px] overflow-y-auto border rounded-md">
                  {(invoicesData || [])
                    .filter(inv => {
                      if (!invoiceSearch.trim()) return true;
                      const s = invoiceSearch.toLowerCase();
                      return (inv.invoiceNumber || "").toLowerCase().includes(s) ||
                        (inv.contactName || "").toLowerCase().includes(s);
                    })
                    .slice(0, 50)
                    .map(inv => (
                      <button
                        key={inv.id}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors border-b last:border-0 flex items-center justify-between ${linkInvoiceId === inv.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                        onClick={() => setLinkInvoiceId(linkInvoiceId === inv.id ? "" : inv.id)}
                        data-testid={`option-invoice-${inv.id}`}
                      >
                        <div className="flex items-center gap-2">
                          {linkInvoiceId === inv.id && <Check className="w-3 h-3 text-primary shrink-0" />}
                          <span className="font-medium">{inv.invoiceNumber || "—"}</span>
                          <span className="text-muted-foreground truncate max-w-[150px]">{inv.contactName}</span>
                        </div>
                        <span className="font-mono shrink-0">{fmtCurrency(safeAmount(inv.amountInclGst))}</span>
                      </button>
                    ))}
                  {(invoicesData || []).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No invoices loaded</p>
                  )}
                </div>
              </div>
            )}

            {linkTab === "employee" && (
              <div>
                <Input
                  placeholder="Search employees..."
                  className="h-8 text-sm mb-2"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  data-testid="input-search-employee"
                />
                <div className="max-h-[200px] overflow-y-auto border rounded-md">
                  {(employeesData || [])
                    .filter(emp => {
                      if (!employeeSearch.trim()) return true;
                      const s = employeeSearch.toLowerCase();
                      return `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(s);
                    })
                    .slice(0, 30)
                    .map(emp => (
                      <button
                        key={emp.id}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors border-b last:border-0 flex items-center gap-2 ${linkEmployeeId === emp.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                        onClick={() => setLinkEmployeeId(linkEmployeeId === emp.id ? "" : emp.id)}
                        data-testid={`option-employee-${emp.id}`}
                      >
                        {linkEmployeeId === emp.id ? <Check className="w-3 h-3 text-primary" /> : <User className="w-3 h-3 text-muted-foreground" />}
                        <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {linkTab === "category" && (
              <div>
                <div className="grid grid-cols-2 gap-1.5">
                  {EXPENSE_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setLinkCategory(linkCategory === cat ? "" : cat)}
                      className={`px-3 py-2 text-xs rounded-md border text-left transition-colors flex items-center gap-2 ${
                        linkCategory === cat
                          ? "bg-primary/10 border-primary ring-1 ring-primary/30 font-medium"
                          : "bg-card hover:bg-muted/60 text-muted-foreground"
                      }`}
                      data-testid={`option-category-${cat.replace(/[\s\/]+/g, "-").toLowerCase()}`}
                    >
                      {linkCategory === cat && <Check className="w-3 h-3 text-primary shrink-0" />}
                      <Tag className="w-3 h-3 shrink-0" />
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes (optional)</label>
              <Textarea
                placeholder="Add a note..."
                className="text-sm h-16 resize-none"
                value={linkNotes}
                onChange={(e) => setLinkNotes(e.target.value)}
                data-testid="input-link-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogTxn(null)} data-testid="button-cancel-link">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleManualLink}
              disabled={!linkInvoiceId && !linkEmployeeId && !linkCategory}
              data-testid="button-save-link"
            >
              <Link2 className="w-3.5 h-3.5 mr-1" />
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransactionRows({ transactions, linkage, onLink, onConfirm, onReject, onUnlink, isPending }: {
  transactions: BankTransaction[];
  linkage?: Record<string, LinkageInfo>;
  onLink: (txn: BankTransaction) => void;
  onConfirm: (txnId: string) => void;
  onReject: (txnId: string) => void;
  onUnlink: (txnId: string) => void;
  isPending: boolean;
}) {
  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[85px]">Date</th>
            <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[40px]">Type</th>
            <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
            <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Description</th>
            <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Account</th>
            <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">Amount</th>
            <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">Status</th>
            <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const info = linkage?.[t.id];
            return (
              <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-txn-${t.id}`}>
                <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(t.date)}</td>
                <td className="py-2 px-3">
                  <Badge className={`text-[9px] px-1 py-0 ${t.type === "RECEIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}`}>
                    {t.type === "RECEIVE" ? "IN" : "OUT"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-xs font-medium truncate max-w-[180px]">{t.contactName || "—"}</td>
                <td className="py-2 px-3 text-[11px] text-muted-foreground truncate max-w-[200px] hidden md:table-cell">{t.description || t.reference || "—"}</td>
                <td className="py-2 px-3 text-[11px] text-muted-foreground truncate max-w-[120px] hidden lg:table-cell">{t.bankAccountName || "—"}</td>
                <td className="py-2 px-3 text-right">
                  <span className={`font-mono text-xs font-semibold ${t.type === "RECEIVE" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {t.type === "RECEIVE" ? "+" : "-"}{fmtCurrency(safeAmount(t.amount))}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  <LinkageBadge info={info} />
                </td>
                <td className="py-2 px-3 text-center">
                  <LinkActions
                    info={info}
                    txn={t}
                    onLink={() => onLink(t)}
                    onConfirm={() => onConfirm(t.id)}
                    onReject={() => onReject(t.id)}
                    onUnlink={() => onUnlink(t.id)}
                    isPending={isPending}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LinkActions({ info, txn, onLink, onConfirm, onReject, onUnlink, isPending }: {
  info?: LinkageInfo;
  txn: BankTransaction;
  onLink: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onUnlink: () => void;
  isPending: boolean;
}) {
  if (!info || info.status === "unlinked") {
    return (
      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2.5 gap-1" onClick={onLink} disabled={isPending} data-testid={`button-link-${txn.id}`}>
        <Link2 className="w-3 h-3" />
        Link
      </Button>
    );
  }

  if (info.status === "suggested") {
    return (
      <div className="flex items-center justify-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={onConfirm} disabled={isPending} data-testid={`button-confirm-${txn.id}`}>
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onReject} disabled={isPending} data-testid={`button-reject-${txn.id}`}>
          <X className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={onLink} disabled={isPending} data-testid={`button-edit-link-${txn.id}`}>
          <Edit3 className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  if (info.status === "rejected") {
    return (
      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground" onClick={onLink} disabled={isPending} data-testid={`button-relink-${txn.id}`}>
        <RotateCcw className="w-3 h-3" />
        Re-link
      </Button>
    );
  }

  if (info.status === "confirmed" || info.status === "manual") {
    return (
      <div className="flex items-center justify-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={onLink} disabled={isPending} data-testid={`button-edit-link-${txn.id}`}>
          <Edit3 className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-muted-foreground hover:text-red-600" onClick={onUnlink} disabled={isPending} data-testid={`button-unlink-${txn.id}`}>
          <Unlink className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  if (info.status === "linked_invoice" || info.status === "linked_rcti" || info.status === "matched_contact") {
    return (
      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground" onClick={onLink} disabled={isPending} data-testid={`button-override-${txn.id}`}>
        <Edit3 className="w-3 h-3" />
        Override
      </Button>
    );
  }

  return null;
}

function LinkageBadge({ info }: { info?: LinkageInfo }) {
  if (!info) return <span className="text-muted-foreground/30 text-[10px]">—</span>;

  if (info.status === "confirmed" || info.status === "manual") {
    if (info.category) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 gap-0.5" data-testid="badge-category">
          <Tag className="w-2.5 h-2.5" />
          {info.category}
        </Badge>
      );
    }
    if (info.invoiceNumber) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 gap-0.5" data-testid="badge-confirmed">
          <FileText className="w-2.5 h-2.5" />
          {info.invoiceNumber}
        </Badge>
      );
    }
    if (info.employeeName) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 gap-0.5" data-testid="badge-employee">
          <User className="w-2.5 h-2.5" />
          {info.employeeName}
        </Badge>
      );
    }
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 gap-0.5" data-testid="badge-linked">
        <CheckCircle className="w-2.5 h-2.5" />
        Linked
      </Badge>
    );
  }

  if (info.status === "suggested") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 gap-0.5" data-testid="badge-suggested">
        <Wand2 className="w-2.5 h-2.5" />
        {info.invoiceNumber || info.employeeName || "Suggested"}
      </Badge>
    );
  }

  if (info.status === "rejected") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 gap-0.5" data-testid="badge-rejected">
        <X className="w-2.5 h-2.5" />
        Rejected
      </Badge>
    );
  }

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
