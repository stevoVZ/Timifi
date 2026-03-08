import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  DollarSign,
  Download,
  FileText,
  TrendingUp,
  Users,
  Calendar,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PayRun, Contractor, Timesheet, PayRunLine } from "@shared/schema";

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

type EnrichedLine = PayRunLine & { contractor: Contractor | null };

export default function PayrollPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [hasInitialized, setHasInitialized] = useState(false);
  const [lineSortField, setLineSortField] = useState<string>("contractor");
  const [lineSortDir, setLineSortDir] = useState<"asc" | "desc">("asc");
  const [historySortField, setHistorySortField] = useState<string>("period");
  const [historySortDir, setHistorySortDir] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();

  const { data: payRunsList, isLoading: loadingPayRuns } = useQuery<PayRun[]>({
    queryKey: ["/api/pay-runs"],
  });

  const { data: contractors } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: timesheets } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  useEffect(() => {
    if (!hasInitialized && payRunsList && payRunsList.length > 0) {
      const sorted = [...payRunsList].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
      const latest = sorted[0];
      setSelectedMonth(latest.month);
      setSelectedYear(latest.year);
      setHasInitialized(true);
    }
  }, [payRunsList, hasInitialized]);

  const currentPayRun = payRunsList?.find(
    (p) => p.year === selectedYear && p.month === selectedMonth
  );

  const { data: payRunLines, isLoading: loadingLines } = useQuery<
    EnrichedLine[]
  >({
    queryKey: ["/api/pay-runs", currentPayRun?.id, "lines"],
    enabled: !!currentPayRun?.id,
  });

  const approvedTimesheets =
    timesheets?.filter(
      (t) =>
        t.status === "APPROVED" &&
        t.year === selectedYear &&
        t.month === selectedMonth
    ) || [];

  const contractorsWithApproved = new Set(
    approvedTimesheets.map((t) => t.contractorId)
  );

  const contractorsInLines = new Set(
    payRunLines?.map((l) => l.contractorId) || []
  );

  const activeContractors =
    contractors?.filter((c) => c.status === "ACTIVE") || [];

  const missingTimesheetContractors = activeContractors.filter(
    (c) =>
      !contractorsWithApproved.has(c.id) && !contractorsInLines.has(c.id)
  );

  const createPayRunMutation = useMutation({
    mutationFn: async () => {
      const ref = `PR-${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
      const res = await apiRequest("POST", "/api/pay-runs", {
        payRunRef: ref,
        year: selectedYear,
        month: selectedMonth,
        status: "DRAFT",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pay-runs"] });
      toast({ title: "Pay run created" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create pay run",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const filePayRunMutation = useMutation({
    mutationFn: async (payRunId: string) => {
      const res = await apiRequest("POST", `/api/pay-runs/${payRunId}/file`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pay-runs"] });
      if (currentPayRun) {
        queryClient.invalidateQueries({
          queryKey: ["/api/pay-runs", currentPayRun.id, "lines"],
        });
      }
      toast({ title: "Pay run filed successfully" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to file pay run",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      payRunId,
      status,
    }: {
      payRunId: string;
      status: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/pay-runs/${payRunId}`, {
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pay-runs"] });
      toast({ title: "Pay run status updated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const abaMutation = useMutation({
    mutationFn: async (payRunId: string) => {
      const res = await apiRequest("POST", "/api/payroll/aba", { payRunId });
      const content = await res.text();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "payroll.aba";
      return { content, filename };
    },
    onSuccess: (data: { content: string; filename: string }) => {
      const blob = new Blob([data.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ABA file downloaded" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to generate ABA file",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function prevMonth() {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  }

  function nextMonth() {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  }

  const includedLines =
    payRunLines?.filter((l) => l.status === "INCLUDED") || [];
  const totalGross = includedLines.reduce(
    (s, l) => s + Number(l.grossEarnings),
    0
  );
  const totalPayg = includedLines.reduce(
    (s, l) => s + Number(l.paygWithheld),
    0
  );
  const totalSuper = includedLines.reduce(
    (s, l) => s + Number(l.superAmount),
    0
  );
  const totalNet = includedLines.reduce((s, l) => s + Number(l.netPay), 0);

  const isFiled = currentPayRun?.status === "FILED";
  const isDraft = currentPayRun?.status === "DRAFT";
  const isReview = currentPayRun?.status === "REVIEW";
  const isLoading = loadingPayRuns;

  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    years.push(y);
  }

  function toggleLineSort(field: string) {
    if (lineSortField === field) {
      setLineSortDir(lineSortDir === "asc" ? "desc" : "asc");
    } else {
      setLineSortField(field);
      setLineSortDir("asc");
    }
  }

  function toggleHistorySort(field: string) {
    if (historySortField === field) {
      setHistorySortDir(historySortDir === "asc" ? "desc" : "asc");
    } else {
      setHistorySortField(field);
      setHistorySortDir("asc");
    }
  }

  const sortedLines = [...(payRunLines || [])].sort((a, b) => {
    const dir = lineSortDir === "asc" ? 1 : -1;
    switch (lineSortField) {
      case "contractor": {
        const nameA = a.contractor ? `${a.contractor.firstName} ${a.contractor.lastName}` : "";
        const nameB = b.contractor ? `${b.contractor.firstName} ${b.contractor.lastName}` : "";
        return nameA.localeCompare(nameB) * dir;
      }
      case "hours": return (Number(a.hoursWorked) - Number(b.hoursWorked)) * dir;
      case "rate": return (Number(a.ratePerHour) - Number(b.ratePerHour)) * dir;
      case "gross": return (Number(a.grossEarnings) - Number(b.grossEarnings)) * dir;
      case "payg": return (Number(a.paygWithheld) - Number(b.paygWithheld)) * dir;
      case "super": return (Number(a.superAmount) - Number(b.superAmount)) * dir;
      case "net": return (Number(a.netPay) - Number(b.netPay)) * dir;
      default: return 0;
    }
  });

  const sortedHistory = [...(payRunsList?.filter(
    (r) => r.status === "FILED" && r.id !== currentPayRun?.id
  ) || [])].sort((a, b) => {
    const dir = historySortDir === "asc" ? 1 : -1;
    switch (historySortField) {
      case "period": {
        const dateA = a.year * 100 + a.month;
        const dateB = b.year * 100 + b.month;
        return (dateA - dateB) * dir;
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
      case "employees": return (a.employeeCount - b.employeeCount) * dir;
      default: return 0;
    }
  });

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Payroll"
        subtitle="Pay runs, PAYG & superannuation"
        actions={
          currentPayRun && isFiled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => abaMutation.mutate(currentPayRun.id)}
              disabled={abaMutation.isPending}
              data-testid="button-download-aba"
            >
              {abaMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="ml-1.5">ABA File</span>
            </Button>
          ) : null
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={prevMonth}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(v) => setSelectedMonth(Number(v))}
                >
                  <SelectTrigger
                    className="w-[140px]"
                    data-testid="select-month"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.slice(1).map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => setSelectedYear(Number(v))}
                >
                  <SelectTrigger
                    className="w-[100px]"
                    data-testid="select-year"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={nextMonth}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!currentPayRun && !isLoading && (
                <Button
                  onClick={() => createPayRunMutation.mutate()}
                  disabled={createPayRunMutation.isPending}
                  data-testid="button-create-pay-run"
                >
                  {createPayRunMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">Create Pay Run</span>
                </Button>
              )}
              {isDraft && currentPayRun && (
                <Button
                  variant="outline"
                  onClick={() =>
                    updateStatusMutation.mutate({
                      payRunId: currentPayRun.id,
                      status: "REVIEW",
                    })
                  }
                  disabled={updateStatusMutation.isPending}
                  data-testid="button-mark-review"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="ml-1.5">Mark for Review</span>
                </Button>
              )}
              {isReview && currentPayRun && (
                <Button
                  onClick={() => filePayRunMutation.mutate(currentPayRun.id)}
                  disabled={filePayRunMutation.isPending}
                  data-testid="button-file-pay-run"
                >
                  {filePayRunMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">File Pay Run</span>
                </Button>
              )}
              {isFiled && currentPayRun && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/api/payslips?payRunId=${currentPayRun.id}`,
                      "_blank"
                    )
                  }
                  data-testid="button-generate-payslips"
                >
                  <FileText className="w-4 h-4" />
                  <span className="ml-1.5">Generate Payslips</span>
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full rounded-md" />
              <Skeleton className="h-60 w-full rounded-md" />
            </div>
          ) : !currentPayRun ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-3">
                  <Calendar className="w-10 h-10 mx-auto text-muted-foreground" />
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="text-no-pay-run"
                  >
                    No pay run exists for {MONTHS[selectedMonth]}{" "}
                    {selectedYear}.
                  </p>
                  <Button
                    onClick={() => createPayRunMutation.mutate()}
                    disabled={createPayRunMutation.isPending}
                    data-testid="button-create-pay-run-empty"
                  >
                    {createPayRunMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    <span className="ml-1.5">Create Pay Run</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card data-testid="card-pay-run-header">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-base">
                        {currentPayRun.payRunRef}
                      </CardTitle>
                      <StatusBadge status={currentPayRun.status} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {currentPayRun.periodStart && currentPayRun.periodEnd && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(
                            currentPayRun.periodStart
                          ).toLocaleDateString("en-AU")}{" "}
                          -{" "}
                          {new Date(
                            currentPayRun.periodEnd
                          ).toLocaleDateString("en-AU")}
                        </span>
                      )}
                      {currentPayRun.payDate && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          Pay date:{" "}
                          {new Date(currentPayRun.payDate).toLocaleDateString(
                            "en-AU"
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <PayRunStat
                      icon={DollarSign}
                      label="Gross Pay"
                      value={formatCurrency(
                        payRunLines?.length
                          ? totalGross
                          : currentPayRun.totalGross
                      )}
                      color="text-foreground"
                      bgColor="bg-muted/50"
                      testId="text-gross-pay"
                    />
                    <PayRunStat
                      icon={TrendingUp}
                      label="PAYG Withholding"
                      value={formatCurrency(
                        payRunLines?.length
                          ? totalPayg
                          : currentPayRun.totalPayg
                      )}
                      color="text-red-600 dark:text-red-400"
                      bgColor="bg-red-50 dark:bg-red-900/20"
                      testId="text-payg"
                    />
                    <PayRunStat
                      icon={TrendingUp}
                      label="Superannuation"
                      value={formatCurrency(
                        payRunLines?.length
                          ? totalSuper
                          : currentPayRun.totalSuper
                      )}
                      color="text-amber-600 dark:text-amber-400"
                      bgColor="bg-amber-50 dark:bg-amber-900/20"
                      testId="text-super"
                    />
                    <PayRunStat
                      icon={DollarSign}
                      label="Net Pay"
                      value={formatCurrency(
                        payRunLines?.length
                          ? totalNet
                          : currentPayRun.totalNet
                      )}
                      color="text-green-600 dark:text-green-400"
                      bgColor="bg-green-50 dark:bg-green-900/20"
                      testId="text-net-pay"
                    />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span data-testid="text-employee-count">
                      {payRunLines?.length || currentPayRun.employeeCount}{" "}
                      contractors included
                    </span>
                  </div>
                </CardContent>
              </Card>

              {missingTimesheetContractors.length > 0 && !isFiled && (
                <Card
                  className="border-amber-300 dark:border-amber-700"
                  data-testid="card-missing-timesheets"
                >
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Missing Timesheets
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          The following active contractors have no approved
                          timesheet for {MONTHS[selectedMonth]} {selectedYear}:
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {missingTimesheetContractors.map((c) => (
                            <Badge
                              key={c.id}
                              variant="secondary"
                              data-testid={`badge-missing-${c.id}`}
                            >
                              {c.firstName} {c.lastName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-pay-lines">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Contractor Pay Lines
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingLines ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full rounded-md" />
                      <Skeleton className="h-10 w-full rounded-md" />
                      <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                  ) : !payRunLines || payRunLines.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <p data-testid="text-no-lines">
                        {isDraft || isReview
                          ? "No pay lines yet. File the pay run to generate lines from approved timesheets."
                          : "No contractor pay lines for this period."}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHeader field="contractor" label="Contractor" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} />
                            <SortableHeader field="hours" label="Hours" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} align="right" />
                            <SortableHeader field="rate" label="Rate" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} align="right" />
                            <SortableHeader field="gross" label="Gross" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} align="right" />
                            <SortableHeader field="payg" label="PAYG" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} align="right" />
                            <SortableHeader field="super" label="Super" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} align="right" />
                            <SortableHeader field="net" label="Net" sortField={lineSortField} sortDir={lineSortDir} onSort={toggleLineSort} align="right" />
                            <TableHead className="text-center">
                              Status
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedLines.map((line) => (
                            <TableRow
                              key={line.id}
                              data-testid={`row-pay-line-${line.id}`}
                            >
                              <TableCell>
                                <span
                                  className="font-medium text-foreground"
                                  data-testid={`text-contractor-name-${line.id}`}
                                >
                                  {line.contractor
                                    ? `${line.contractor.firstName} ${line.contractor.lastName}`
                                    : "Unknown"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {Number(line.hoursWorked).toFixed(1)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(line.ratePerHour)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(line.grossEarnings)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                                {formatCurrency(line.paygWithheld)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                                {formatCurrency(line.superAmount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-green-600 dark:text-green-400">
                                {formatCurrency(line.netPay)}
                              </TableCell>
                              <TableCell className="text-center">
                                <StatusBadge status={line.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-semibold">
                            <TableCell>Totals</TableCell>
                            <TableCell className="text-right font-mono">
                              {includedLines
                                .reduce(
                                  (s, l) => s + Number(l.hoursWorked),
                                  0
                                )
                                .toFixed(1)}
                            </TableCell>
                            <TableCell />
                            <TableCell
                              className="text-right font-mono"
                              data-testid="text-total-gross"
                            >
                              {formatCurrency(totalGross)}
                            </TableCell>
                            <TableCell
                              className="text-right font-mono text-red-600 dark:text-red-400"
                              data-testid="text-total-payg"
                            >
                              {formatCurrency(totalPayg)}
                            </TableCell>
                            <TableCell
                              className="text-right font-mono text-amber-600 dark:text-amber-400"
                              data-testid="text-total-super"
                            >
                              {formatCurrency(totalSuper)}
                            </TableCell>
                            <TableCell
                              className="text-right font-mono text-green-600 dark:text-green-400"
                              data-testid="text-total-net"
                            >
                              {formatCurrency(totalNet)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Pay Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  {sortedHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No other completed pay runs yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHeader field="period" label="Period" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} />
                            <SortableHeader field="paymentDate" label="Payment Date" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} />
                            <SortableHeader field="wages" label="Wages" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} align="right" />
                            <SortableHeader field="tax" label="Tax" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} align="right" />
                            <SortableHeader field="super" label="Super" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} align="right" />
                            <SortableHeader field="net" label="Net Pay" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} align="right" />
                            <SortableHeader field="employees" label="Employees" sortField={historySortField} sortDir={historySortDir} onSort={toggleHistorySort} align="center" />
                            <TableHead className="text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedHistory.map((run) => (
                            <TableRow
                              key={run.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedMonth(run.month);
                                setSelectedYear(run.year);
                              }}
                              data-testid={`row-pay-run-${run.id}`}
                            >
                              <TableCell>
                                <div className="font-medium text-foreground" data-testid={`text-pay-run-ref-${run.id}`}>
                                  {MONTHS[run.month]} {run.year}
                                </div>
                                <div className="text-xs text-muted-foreground">{run.payRunRef}</div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {run.paymentDate || run.payDate
                                  ? new Date(run.paymentDate || run.payDate!).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(run.totalGross)}</TableCell>
                              <TableCell className="text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(run.totalPayg)}</TableCell>
                              <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatCurrency(run.totalSuper)}</TableCell>
                              <TableCell className="text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(run.totalNet)}</TableCell>
                              <TableCell className="text-center font-mono">{run.employeeCount}</TableCell>
                              <TableCell className="text-center">
                                <StatusBadge status={run.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function PayRunStat({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  testId,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  testId: string;
}) {
  return (
    <div className={`p-4 rounded-md ${bgColor}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className={`text-lg font-mono font-bold ${color}`} data-testid={testId}>
        {value}
      </div>
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
