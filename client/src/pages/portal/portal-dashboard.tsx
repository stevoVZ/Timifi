import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Clock, DollarSign, Calendar, FileText, Receipt, MessageSquare, ArrowRight } from "lucide-react";
import type { Contractor } from "@shared/schema";

interface RecentTimesheet {
  id: string;
  period: string;
  hours: number;
  status: string;
  gross: number;
  year: number;
  month: number;
}

interface RecentPayslip {
  id: string;
  period: string;
  gross: number;
  net: number;
  payDate: string | null;
  year: number;
  month: number;
}

interface PortalStats {
  contractor: Contractor;
  hoursThisMonth: number;
  pendingTimesheets: number;
  unreadMessages: number;
  totalTimesheets: number;
  ytdHours: number;
  ytdGross: number;
  contractHoursPA: number;
  rate: number;
  recentTimesheets: RecentTimesheet[];
  recentPayslips: RecentPayslip[];
}

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Employee";
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatMonth(year: number, month: number): string {
  const d = new Date(year, month - 1);
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

export default function PortalDashboardPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: stats, isLoading } = useQuery<PortalStats>({
    queryKey: ["/api/portal/employee", contractorId, "stats"],
  });

  const contractorName = stats
    ? `${stats.contractor.firstName} ${stats.contractor.lastName}`
    : getContractorName();

  const currentMonth = new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const kpis = stats
    ? [
        {
          label: "Hours this month",
          value: String(stats.hoursThisMonth),
          sub: currentMonth,
          icon: Clock,
          color: "text-primary",
          bgColor: "bg-primary/5",
        },
        {
          label: "YTD earnings",
          value: formatCurrency(stats.ytdGross),
          sub: `${stats.ytdHours.toFixed(1)} hours worked`,
          icon: DollarSign,
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50 dark:bg-green-900/20",
        },
        {
          label: "Next pay date",
          value: getNextPayDate(),
          sub: stats.contractor.payFrequency || "Monthly",
          icon: Calendar,
          color: "text-amber-600 dark:text-amber-400",
          bgColor: "bg-amber-50 dark:bg-amber-900/20",
        },
      ]
    : [];

  const utilisationPct = stats
    ? Math.min(100, Math.round((stats.ytdHours / stats.contractHoursPA) * 100))
    : 0;

  const annualContractValue = stats
    ? stats.contractHoursPA * stats.rate
    : 0;

  return (
    <PortalShell contractorName={contractorName}>
      <div className="p-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-portal-dashboard-title">
              Welcome back, {stats ? stats.contractor.firstName : "..."}
            </h1>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-portal-dashboard-subtitle">
              {currentMonth}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-5">
                      <Skeleton className="h-3 w-24 mb-3" />
                      <Skeleton className="h-8 w-20 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))
              : kpis.map((k) => (
                  <Card key={k.label}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-1 mb-3">
                        <span
                          className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                          data-testid={`portal-label-${k.label.replace(/\s/g, "-").toLowerCase()}`}
                        >
                          {k.label}
                        </span>
                        <div className={`w-8 h-8 rounded-md ${k.bgColor} flex items-center justify-center`}>
                          <k.icon className={`w-4 h-4 ${k.color}`} />
                        </div>
                      </div>
                      <div
                        className={`text-2xl font-bold font-mono ${k.color} mb-1`}
                        data-testid={`portal-value-${k.label.replace(/\s/g, "-").toLowerCase()}`}
                      >
                        {k.value}
                      </div>
                      <div className="text-xs text-muted-foreground">{k.sub}</div>
                    </CardContent>
                  </Card>
                ))}
          </div>

          {stats && (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4" data-testid="text-contract-utilisation-heading">
                  Contract utilisation
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                    <span className="text-muted-foreground">
                      YTD hours: <span className="font-medium text-foreground" data-testid="text-ytd-hours">{stats.ytdHours.toFixed(1)}</span> / {stats.contractHoursPA}
                    </span>
                    <span className="font-medium text-foreground" data-testid="text-utilisation-pct">{utilisationPct}%</span>
                  </div>
                  <Progress value={utilisationPct} className="h-2" data-testid="progress-utilisation" />
                  <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                    <span className="text-muted-foreground">
                      Annual contract value
                    </span>
                    <span className="font-medium text-foreground" data-testid="text-annual-contract-value">
                      {formatCurrency(annualContractValue)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/portal/timesheets">
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/5 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground" data-testid="link-quick-timesheets">Timesheets</div>
                    <div className="text-xs text-muted-foreground">Submit & track hours</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/portal/payslips">
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground" data-testid="link-quick-payslips">Payslips</div>
                    <div className="text-xs text-muted-foreground">View pay history</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/portal/messages">
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground" data-testid="link-quick-messages">Messages</div>
                    <div className="text-xs text-muted-foreground">
                      {stats ? `${stats.unreadMessages} unread` : "View messages"}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <h2 className="text-sm font-semibold text-foreground" data-testid="text-recent-timesheets-heading">
                    Recent timesheets
                  </h2>
                  <Link href="/portal/timesheets">
                    <Button variant="ghost" size="sm" data-testid="link-view-all-timesheets">
                      View all
                    </Button>
                  </Link>
                </div>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : stats && stats.recentTimesheets.length > 0 ? (
                  <div className="space-y-2">
                    {stats.recentTimesheets.map((ts) => (
                      <div
                        key={ts.id}
                        className="flex items-center justify-between gap-2 flex-wrap py-2 border-b last:border-b-0"
                        data-testid={`row-timesheet-${ts.id}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            {formatMonth(ts.year, ts.month)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ts.hours.toFixed(1)} hrs · {formatCurrency(ts.gross)}
                          </div>
                        </div>
                        <StatusBadge status={ts.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-timesheets">No timesheets yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <h2 className="text-sm font-semibold text-foreground" data-testid="text-recent-payslips-heading">
                    Recent payslips
                  </h2>
                  <Link href="/portal/payslips">
                    <Button variant="ghost" size="sm" data-testid="link-view-all-payslips">
                      View all
                    </Button>
                  </Link>
                </div>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : stats && stats.recentPayslips.length > 0 ? (
                  <div className="space-y-2">
                    {stats.recentPayslips.map((ps) => (
                      <div
                        key={ps.id}
                        className="flex items-center justify-between gap-2 flex-wrap py-2 border-b last:border-b-0"
                        data-testid={`row-payslip-${ps.id}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            {formatMonth(ps.year, ps.month)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Paid {ps.payDate ? new Date(ps.payDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-foreground" data-testid={`text-payslip-net-${ps.id}`}>
                            {formatCurrency(ps.net)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Gross {formatCurrency(ps.gross)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-payslips">No payslips yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

function getNextPayDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
