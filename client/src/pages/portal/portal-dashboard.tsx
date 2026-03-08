import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, FileText, MessageSquare, Calendar } from "lucide-react";
import type { Contractor } from "@shared/schema";

interface PortalStats {
  contractor: Contractor;
  hoursThisMonth: number;
  pendingTimesheets: number;
  unreadMessages: number;
  totalTimesheets: number;
}

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Contractor";
}

export default function PortalDashboardPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: stats, isLoading } = useQuery<PortalStats>({
    queryKey: ["/api/portal/contractor", contractorId, "stats"],
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
          label: "Pending timesheets",
          value: String(stats.pendingTimesheets),
          sub: `${stats.totalTimesheets} total submitted`,
          icon: FileText,
          color: "text-amber-600 dark:text-amber-400",
          bgColor: "bg-amber-50 dark:bg-amber-900/20",
        },
        {
          label: "Next pay date",
          value: getNextPayDate(),
          sub: stats.contractor.payFrequency || "Monthly",
          icon: Calendar,
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50 dark:bg-green-900/20",
        },
        {
          label: "Unread messages",
          value: String(stats.unreadMessages),
          sub: "From admin",
          icon: MessageSquare,
          color: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-900/20",
        },
      ]
    : [];

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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
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
                <h2 className="text-sm font-semibold text-foreground mb-3" data-testid="text-portal-profile-heading">
                  Your details
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <p className="font-medium text-foreground" data-testid="text-portal-contractor-name">
                      {stats.contractor.firstName} {stats.contractor.lastName}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p className="font-medium text-foreground" data-testid="text-portal-contractor-email">
                      {stats.contractor.email}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Job title</span>
                    <p className="font-medium text-foreground" data-testid="text-portal-contractor-job">
                      {stats.contractor.jobTitle || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Client</span>
                    <p className="font-medium text-foreground" data-testid="text-portal-contractor-client">
                      {stats.contractor.clientName || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pay frequency</span>
                    <p className="font-medium text-foreground" data-testid="text-portal-contractor-pay-frequency">
                      {stats.contractor.payFrequency}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hourly rate</span>
                    <p className="font-medium text-foreground" data-testid="text-portal-contractor-rate">
                      {stats.contractor.hourlyRate
                        ? `$${parseFloat(stats.contractor.hourlyRate).toFixed(2)}/hr`
                        : "Not set"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
