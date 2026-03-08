import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "wouter";
import {
  Users, Clock, FileText, CreditCard, ArrowRight,
  Upload, Receipt, UserPlus, CalendarDays, Briefcase,
  Bell, AlertTriangle, FileCheck, ShieldCheck,
} from "lucide-react";
import type { Contractor, Notification } from "@shared/schema";

interface DashboardStats {
  activeContractors: number;
  pendingContractors: number;
  timesheetsDue: number;
  outstandingInvoiceAmount: string;
  overdueAmount: string;
  nextPayRunDate: string | null;
  nextPayRunCount: number;
  submittedTimesheets: number;
  approvedThisMonth: number;
  ytdBillings: string;
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Not scheduled";
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  TIMESHEET: FileText,
  INVOICE: Receipt,
  PAYRUN: CreditCard,
  CLEARANCE: ShieldCheck,
  SYSTEM: Bell,
  SUPER: Briefcase,
};

const now = new Date();
const currentMonth = now.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
const fy = now.getMonth() >= 6
  ? `FY${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
  : `FY${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: contractors } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const activeContractors = contractors?.filter((c) => c.status === "ACTIVE" || c.status === "PENDING_SETUP").slice(0, 6) || [];
  const recentActivity = notifications?.slice(0, 8) || [];

  const kpis = stats ? [
    {
      label: "Active contractors",
      value: String(stats.activeContractors),
      sub: `${stats.pendingContractors} pending setup`,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/5",
      href: "/contractors",
    },
    {
      label: "Pending timesheets",
      value: String(stats.submittedTimesheets),
      sub: `${stats.approvedThisMonth} approved this month`,
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
      href: "/timesheets",
    },
    {
      label: "Invoices outstanding",
      value: formatCurrency(stats.outstandingInvoiceAmount),
      sub: `Overdue: ${formatCurrency(stats.overdueAmount)}`,
      icon: FileText,
      color: parseFloat(stats.overdueAmount) > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400",
      bgColor: parseFloat(stats.overdueAmount) > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20",
      href: "/invoices",
    },
    {
      label: "Next pay run",
      value: formatDate(stats.nextPayRunDate),
      sub: `${stats.nextPayRunCount} contractors`,
      icon: CreditCard,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
      href: "/payroll",
    },
  ] : [];

  const quickLinks = [
    { title: "Upload timesheets", desc: "Drop PDFs for one or more contractors", href: "/timesheets", icon: Upload, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Create invoice", desc: "Create and email invoices", href: "/invoices", icon: Receipt, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-900/20" },
    { title: "Run payroll", desc: "Review and file this month's payroll", href: "/payroll", icon: CreditCard, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900/20" },
    { title: "Add contractor", desc: "Set up a new contractor profile", href: "/contractors/new", icon: UserPlus, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Leave requests", desc: "Review pending leave requests", href: "/leave", icon: CalendarDays, color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-900/20" },
    { title: "Pay items", desc: "Manage pay codes and rates", href: "/pay-items", icon: Briefcase, color: "text-muted-foreground", bgColor: "bg-muted" },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Dashboard" subtitle={`${currentMonth} · ${fy}`} />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-7xl mx-auto space-y-6">
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
                  <Link key={k.label} href={k.href} data-testid={`link-kpi-${k.label.replace(/\s/g, "-").toLowerCase()}`}>
                    <Card className="hover-elevate cursor-pointer">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground" data-testid={`label-kpi-${k.label.replace(/\s/g, "-").toLowerCase()}`}>
                            {k.label}
                          </span>
                          <div className={`w-8 h-8 rounded-md ${k.bgColor} flex items-center justify-center`}>
                            <k.icon className={`w-4 h-4 ${k.color}`} />
                          </div>
                        </div>
                        <div className={`text-2xl font-bold font-mono ${k.color} mb-1`} data-testid={`value-kpi-${k.label.replace(/\s/g, "-").toLowerCase()}`}>
                          {k.value}
                        </div>
                        <div className="text-xs text-muted-foreground">{k.sub}</div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm font-semibold text-foreground mb-4" data-testid="text-quick-actions-title">Quick actions</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {quickLinks.map((q) => (
                      <Link key={q.href} href={q.href} data-testid={`link-quick-${q.title.replace(/\s/g, "-").toLowerCase()}`}>
                        <div className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-center gap-2.5`}>
                          <div className={`w-8 h-8 rounded-md ${q.bgColor} flex items-center justify-center flex-shrink-0`}>
                            <q.icon className={`w-4 h-4 ${q.color}`} />
                          </div>
                          <span className="text-[13px] font-semibold text-foreground leading-tight">{q.title}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <div className="flex items-center justify-between px-5 py-3.5 border-b">
                  <span className="text-sm font-semibold text-foreground" data-testid="text-contractors-table-title">Contractors</span>
                  <Link href="/contractors" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-contractors">
                    View all →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Contractor</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeContractors.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">No contractors</td>
                        </tr>
                      ) : (
                        activeContractors.map((c) => (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/contractors/${c.id}`} data-testid={`link-contractor-${c.id}`}>
                                <div className="flex items-center gap-2.5 cursor-pointer">
                                  <div
                                    className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                                    style={{ backgroundColor: `${c.accentColour || "#2563eb"}15`, color: c.accentColour || "#2563eb" }}
                                  >
                                    {getInitials(c.firstName, c.lastName)}
                                  </div>
                                  <span className="text-[13px] font-semibold text-foreground">{c.firstName} {c.lastName}</span>
                                </div>
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-[13px] text-muted-foreground">{c.clientName || "—"}</td>
                            <td className="px-4 py-3 text-[13px] font-mono text-foreground">${c.hourlyRate}/hr</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={c.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <div className="flex items-center justify-between px-5 py-3.5 border-b">
                  <span className="text-sm font-semibold text-foreground" data-testid="text-activity-title">Recent activity</span>
                  <Link href="/notifications" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-activity">
                    View all →
                  </Link>
                </div>
                <CardContent className="p-0">
                  {recentActivity.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No recent activity</div>
                  ) : (
                    <div className="divide-y">
                      {recentActivity.map((n) => {
                        const Icon = NOTIFICATION_ICONS[n.type] || Bell;
                        return (
                          <div key={n.id} className="px-5 py-3 hover:bg-muted/30 transition-colors" data-testid={`activity-item-${n.id}`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${n.read ? "bg-muted" : "bg-primary/10"}`}>
                                <Icon className={`w-3.5 h-3.5 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-[13px] leading-snug ${n.read ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                                  {n.title}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {timeAgo(n.createdAt)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {stats && parseFloat(stats.ytdBillings) > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{fy} Billings</div>
                    <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-400" data-testid="value-ytd-billings">
                      {formatCurrency(stats.ytdBillings)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Paid invoices year-to-date</div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
