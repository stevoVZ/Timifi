import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  ChevronRight,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
} from "lucide-react";
import type { PayRun, Employee, PayRunLine } from "@shared/schema";

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

type EnrichedLine = PayRunLine & { employee: Employee | null };

export default function PayrollDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("employee");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: allPayRuns, isLoading: loadingPayRuns } = useQuery<PayRun[]>({
    queryKey: ["/api/pay-runs"],
  });

  const payRun = allPayRuns?.find((r) => r.id === params.id);

  const { data: payRunLines, isLoading: loadingLines } = useQuery<EnrichedLine[]>({
    queryKey: ["/api/pay-runs", params.id, "lines"],
    enabled: !!params.id,
  });

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedLines = [...(payRunLines || [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "employee": {
        const nameA = a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : "";
        const nameB = b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : "";
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

  const includedLines = sortedLines.filter((l) => l.status === "INCLUDED");
  const totalGross = includedLines.reduce((s, l) => s + Number(l.grossEarnings), 0);
  const totalPayg = includedLines.reduce((s, l) => s + Number(l.paygWithheld), 0);
  const totalSuper = includedLines.reduce((s, l) => s + Number(l.superAmount), 0);
  const totalNet = includedLines.reduce((s, l) => s + Number(l.netPay), 0);
  const totalHours = includedLines.reduce((s, l) => s + Number(l.hoursWorked), 0);

  if (loadingPayRuns) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Pay Run" subtitle="Loading..." />
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="max-w-6xl mx-auto space-y-4">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-60 w-full rounded-md" />
          </div>
        </main>
      </div>
    );
  }

  if (!payRun) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Pay Run" subtitle="Not found" />
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Pay run not found.</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate("/payroll")} data-testid="button-back-to-payroll">
                  Back to Payroll
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={`${MONTHS[payRun.month]} ${payRun.year}`}
        subtitle={`${payRun.payRunRef} · ${payRun.calendarName || "Monthly"}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/payroll")} data-testid="button-back-to-payroll">
            <ArrowLeft className="w-4 h-4" />
            <span className="ml-1.5">Back to Payroll</span>
          </Button>
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-4">
          <Card data-testid="card-pay-run-summary">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge status={payRun.status} />
                  {payRun.calendarName && (
                    <span className="text-sm text-muted-foreground">{payRun.calendarName}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  {payRun.periodStart && payRun.periodEnd && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(payRun.periodStart).toLocaleDateString("en-AU")} - {new Date(payRun.periodEnd).toLocaleDateString("en-AU")}
                    </span>
                  )}
                  {(payRun.paymentDate || payRun.payDate) && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Pay date: {new Date(payRun.paymentDate || payRun.payDate!).toLocaleDateString("en-AU")}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={DollarSign} label="Gross Pay" value={formatCurrency(payRunLines?.length ? totalGross : payRun.totalGross)} color="text-foreground" bgColor="bg-muted/50" testId="text-gross-pay" />
                <StatCard icon={TrendingUp} label="PAYG Withholding" value={formatCurrency(payRunLines?.length ? totalPayg : payRun.totalPayg)} color="text-red-600 dark:text-red-400" bgColor="bg-red-50 dark:bg-red-900/20" testId="text-payg" />
                <StatCard icon={TrendingUp} label="Superannuation" value={formatCurrency(payRunLines?.length ? totalSuper : payRun.totalSuper)} color="text-amber-600 dark:text-amber-400" bgColor="bg-amber-50 dark:bg-amber-900/20" testId="text-super" />
                <StatCard icon={DollarSign} label="Net Pay" value={formatCurrency(payRunLines?.length ? totalNet : payRun.totalNet)} color="text-green-600 dark:text-green-400" bgColor="bg-green-50 dark:bg-green-900/20" testId="text-net-pay" />
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span data-testid="text-employee-count">
                  {payRunLines?.length || payRun.employeeCount} employee{(payRunLines?.length || payRun.employeeCount) !== 1 ? "s" : ""}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-employee-lines">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Employees</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLines ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ) : !payRunLines || payRunLines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-lines">
                  No employee pay lines for this pay run.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <SortableHeader field="employee" label="Employee" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHeader field="hours" label="Hours" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="rate" label="Rate" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="gross" label="Gross" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="payg" label="PAYG" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="super" label="Super" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <SortableHeader field="net" label="Net" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLines.map((line) => {
                        const isExpanded = expandedLine === line.id;
                        const employeeName = line.employee
                          ? `${line.employee.firstName} ${line.employee.lastName}`
                          : "Unknown";
                        return (
                          <Fragment key={line.id}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedLine(isExpanded ? null : line.id)}
                              data-testid={`row-employee-${line.id}`}
                            >
                              <TableCell className="w-8 px-2">
                                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              </TableCell>
                              <TableCell>
                                <span className="font-medium text-foreground" data-testid={`text-employee-name-${line.id}`}>
                                  {employeeName}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono">{Number(line.hoursWorked).toFixed(1)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(line.ratePerHour)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(line.grossEarnings)}</TableCell>
                              <TableCell className="text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(line.paygWithheld)}</TableCell>
                              <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{formatCurrency(line.superAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(line.netPay)}</TableCell>
                              <TableCell className="text-center">
                                <StatusBadge status={line.status} />
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${line.id}-detail`} className="bg-muted/30" data-testid={`detail-employee-${line.id}`}>
                                <TableCell colSpan={9} className="p-0">
                                  <div className="p-4 space-y-3">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Earnings</p>
                                        <p className="text-sm font-mono font-medium">{formatCurrency(line.grossEarnings)}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          {Number(line.hoursWorked).toFixed(1)} hrs @ {formatCurrency(line.ratePerHour)}/hr
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tax (PAYG)</p>
                                        <p className="text-sm font-mono font-medium text-red-600 dark:text-red-400">{formatCurrency(line.paygWithheld)}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Superannuation</p>
                                        <p className="text-sm font-mono font-medium text-amber-600 dark:text-amber-400">{formatCurrency(line.superAmount)}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Pay</p>
                                        <p className="text-sm font-mono font-medium text-green-600 dark:text-green-400">{formatCurrency(line.netPay)}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 pt-2 border-t">
                                      <span className="text-xs text-muted-foreground">
                                        Status: <StatusBadge status={line.status} />
                                      </span>
                                      {line.employee && (
                                        <Link
                                          href={`/employees/${line.employee.id}`}
                                          className="text-xs text-primary hover:underline"
                                          data-testid={`link-employee-${line.id}`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          View Employee Profile →
                                        </Link>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell />
                        <TableCell>Totals</TableCell>
                        <TableCell className="text-right font-mono">{totalHours.toFixed(1)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono" data-testid="text-total-gross">{formatCurrency(totalGross)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600 dark:text-red-400" data-testid="text-total-payg">{formatCurrency(totalPayg)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400" data-testid="text-total-super">{formatCurrency(totalSuper)}</TableCell>
                        <TableCell className="text-right font-mono text-green-600 dark:text-green-400" data-testid="text-total-net">{formatCurrency(totalNet)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatCard({
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
