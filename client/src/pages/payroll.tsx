import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  DollarSign,
  TrendingUp,
  Search,
  CalendarDays,
  FileText,
  Download,
  Send,
} from "lucide-react";
import type { PayRun } from "@shared/schema";
import { XeroPayrunDialog } from "@/components/xero-payrun-dialog";

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(num);
}

function downloadCSV(rows: PayRun[]) {
  const headers = ["Pay Run Ref", "Frequency", "Period", "Payment Date", "Wages", "Tax", "Super", "Net Pay", "Status"];
  const csvRows = rows.map((r) => [
    r.payRunRef || "",
    r.calendarName || "Monthly",
    `${MONTHS[r.month]} ${r.year}`,
    r.paymentDate || r.payDate || "",
    Number(r.totalGross).toFixed(2),
    Number(r.totalPayg).toFixed(2),
    Number(r.totalSuper).toFixed(2),
    Number(r.totalNet).toFixed(2),
    r.status,
  ]);
  const csv = [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-export-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PayrollPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("period");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [xeroDialogOpen, setXeroDialogOpen] = useState(false);

  const { data: payRunsList, isLoading } = useQuery<PayRun[]>({
    queryKey: ["/api/pay-runs"],
  });

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const availableYears = Array.from(
    new Set(payRunsList?.map((r) => r.year) || [])
  ).sort((a, b) => b - a);

  const filtered = payRunsList?.filter((run) => {
    if (yearFilter !== "all" && run.year !== Number(yearFilter)) return false;
    if (statusFilter !== "all" && run.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const period = `${MONTHS[run.month]} ${run.year}`.toLowerCase();
      const ref = (run.payRunRef || "").toLowerCase();
      const cal = (run.calendarName || "").toLowerCase();
      if (!period.includes(q) && !ref.includes(q) && !cal.includes(q)) return false;
    }
    return true;
  }) || [];

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "frequency": return (a.calendarName || "").localeCompare(b.calendarName || "") * dir;
      case "period": {
        const dA = a.year * 100 + a.month;
        const dB = b.year * 100 + b.month;
        return (dA - dB) * dir;
      }
      case "paymentDate": {
        const dA = a.paymentDate || a.payDate || "";
        const dB = b.paymentDate || b.payDate || "";
        return dA.localeCompare(dB) * dir;
      }
      case "wages": return (Number(a.totalGross) - Number(b.totalGross)) * dir;
      case "tax": return (Number(a.totalPayg) - Number(b.totalPayg)) * dir;
      case "super": return (Number(a.totalSuper) - Number(b.totalSuper)) * dir;
      case "net": return (Number(a.totalNet) - Number(b.totalNet)) * dir;
      case "stpFiling": return a.status.localeCompare(b.status) * dir;
      default: return 0;
    }
  });

  const now = new Date();
  const fyStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const ytdRuns = payRunsList?.filter((r) => {
    const runDate = new Date(r.year, r.month - 1);
    return runDate >= new Date(fyStart, 6, 1);
  }) || [];
  const ytdWages = ytdRuns.reduce((s, r) => s + Number(r.totalGross), 0);
  const ytdTax = ytdRuns.reduce((s, r) => s + Number(r.totalPayg), 0);
  const ytdSuper = ytdRuns.reduce((s, r) => s + Number(r.totalSuper), 0);

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Payroll"
        subtitle={`${payRunsList?.length || 0} pay runs`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              onClick={() => setXeroDialogOpen(true)}
              data-testid="button-create-xero-payrun"
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              Create in Xero
            </Button>
            <Button variant="outline" onClick={() => downloadCSV(sorted)} data-testid="button-export-csv">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card data-testid="kpi-total-runs">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Pay Runs</p>
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-total-runs">{payRunsList?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-ytd-wages">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">YTD Wages</p>
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-ytd-wages">{formatCurrency(ytdWages)}</p>
                    <p className="text-[11px] text-muted-foreground">FY{fyStart}/{fyStart + 1 - 2000}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-ytd-tax">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">YTD Tax</p>
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-ytd-tax">{formatCurrency(ytdTax)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-ytd-super">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">YTD Super</p>
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-ytd-super">{formatCurrency(ytdSuper)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search pay runs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-payruns"
              />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px]" data-testid="select-year-filter">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="FILED">Filed</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="REVIEW">Review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <div className="text-sm text-muted-foreground" data-testid="text-no-pay-runs">
                  No pay runs found
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-end px-4 py-2 border-b text-xs text-muted-foreground">
                  {sorted.length} pay run{sorted.length !== 1 ? "s" : ""}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHeader field="frequency" label="Frequency" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHeader field="period" label="Period" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHeader field="paymentDate" label="Payment Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHeader field="wages" label="Wages" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="tax" label="Tax" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="super" label="Super" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="net" label="Net Pay" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="stpFiling" label="STP Filing" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((run) => (
                        <TableRow
                          key={run.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/payroll/${run.id}`)}
                          data-testid={`row-pay-run-${run.id}`}
                        >
                          <TableCell className="text-sm text-foreground">
                            {run.calendarName || "Monthly"}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground" data-testid={`text-pay-run-ref-${run.id}`}>
                              {MONTHS[run.month]} {run.year}
                            </div>
                            <div className="text-xs text-muted-foreground">{run.payRunRef}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {run.paymentDate || run.payDate
                              ? new Date(run.paymentDate || run.payDate!).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(run.totalGross)}</TableCell>
                          <TableCell className="text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(run.totalPayg)}</TableCell>
                          <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatCurrency(run.totalSuper)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(run.totalNet)}</TableCell>
                          <TableCell className="text-center">
                            <StatusBadge status={run.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <XeroPayrunDialog open={xeroDialogOpen} onOpenChange={setXeroDialogOpen} />
    </div>
  );
}

function SortableHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  field: string;
  label: string;
  sortField: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = sortField === field;
  const alignClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        {isActive ? (
          sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40" />
        )}
      </div>
    </TableHead>
  );
}
