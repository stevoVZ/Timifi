import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "wouter";
import {
  Users, Clock, FileText, CreditCard, ArrowRight,
  Upload, Receipt, UserPlus, Briefcase,
  Bell, ShieldCheck, DollarSign,
} from "lucide-react";
import type { Employee, Notification, Invoice, PayRun } from "@shared/schema";

interface DashboardStats {
  activeEmployees: number;
  pendingEmployees: number;
  totalInvoices: number;
  totalBilled: string;
  totalPaid: string;
  paidInvoiceCount: number;
  outstandingInvoiceAmount: string;
  overdueAmount: string;
  payRunCount: number;
  payRunTotalGross: string;
  latestPayRunDate: string | null;
  submittedTimesheets: number;
  ytdBillings: string;
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
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

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: payRuns } = useQuery<PayRun[]>({
    queryKey: ["/api/pay-runs"],
  });

  const activeEmployees = employees?.filter((c) => c.status === "ACTIVE" || c.status === "PENDING_SETUP").slice(0, 6) || [];
  const recentActivity = notifications?.slice(0, 8) || [];

  const recentInvoices = invoices
    ? [...invoices]
        .sort((a, b) => {
          const dateA = a.paidDate || a.issueDate || a.createdAt;
          const dateB = b.paidDate || b.issueDate || b.createdAt;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        })
        .slice(0, 5)
    : [];

  const recentPayRuns = payRuns
    ? [...payRuns]
        .sort((a, b) => new Date(b.payDate).getTime() - new Date(a.payDate).getTime())
        .slice(0, 5)
    : [];

  const kpis = stats ? [
    {
      label: "Active employees",
      value: String(stats.activeEmployees),
      sub: `${stats.pendingEmployees} pending setup`,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/5",
      href: "/employees",
    },
    {
      label: "Total invoices",
      value: String(stats.totalInvoices),
      sub: `${formatCurrency(stats.totalBilled)} billed`,
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      href: "/invoices",
    },
    {
      label: "Total paid",
      value: formatCurrency(stats.totalPaid),
      sub: `${stats.paidInvoiceCount} invoices paid`,
      icon: DollarSign,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
      href: "/invoices",
    },
    {
      label: `Pay runs (${fy})`,
      value: String(stats.payRunCount),
      sub: `${formatCurrency(stats.payRunTotalGross)} gross`,
      icon: CreditCard,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
      href: "/payroll",
    },
  ] : [];

  const quickLinks = [
    { title: "Upload timesheets", desc: "Drop PDFs for one or more employees", href: "/timesheets", icon: Upload, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "View invoices", desc: "Browse all synced Xero invoices", href: "/invoices", icon: Receipt, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-900/20" },
    { title: "View payroll", desc: "Review pay runs and payroll history", href: "/payroll", icon: CreditCard, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900/20" },
    { title: "Add employee", desc: "Set up a new employee profile", href: "/employees/new", icon: UserPlus, color: "text-primary", bgColor: "bg-primary/10" },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Dashboard" subtitle={`${currentMonth} · ${fy}`} />
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {quickLinks.map((q) => (
                      <Link key={q.href} href={q.href} data-testid={`link-quick-${q.title.replace(/\s/g, "-").toLowerCase()}`}>
                        <div className="p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-center gap-2.5">
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
                  <span className="text-sm font-semibold text-foreground" data-testid="text-recent-invoices-title">Recent invoices</span>
                  <Link href="/invoices" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-invoices">
                    View all <ArrowRight className="w-3 h-3 inline" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Invoice</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">No invoices</td>
                        </tr>
                      ) : (
                        recentInvoices.map((inv) => (
                          <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-invoice-${inv.id}`}>
                            <td className="px-4 py-3">
                              <span className="text-[13px] font-mono font-semibold text-foreground">{inv.invoiceNumber || "\u2014"}</span>
                            </td>
                            <td className="px-4 py-3 text-[13px] text-muted-foreground">{inv.contactName || "\u2014"}</td>
                            <td className="px-4 py-3 text-[13px] font-mono font-medium text-foreground text-right">{formatCurrency(inv.amountInclGst)}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={inv.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between px-5 py-3.5 border-b">
                  <span className="text-sm font-semibold text-foreground" data-testid="text-recent-payruns-title">Recent pay runs</span>
                  <Link href="/payroll" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-payruns">
                    View all <ArrowRight className="w-3 h-3 inline" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Pay date</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Employees</th>
                        <th className="px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Gross</th>
                        <th className="px-4 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Net</th>
                        <th className="px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayRuns.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No pay runs</td>
                        </tr>
                      ) : (
                        recentPayRuns.map((pr) => (
                          <tr key={pr.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-payrun-${pr.id}`}>
                            <td className="px-4 py-3 text-[13px] text-foreground">{formatDate(pr.payDate)}</td>
                            <td className="px-4 py-3 text-[13px] text-muted-foreground">{pr.employeeCount}</td>
                            <td className="px-4 py-3 text-[13px] font-mono font-medium text-foreground text-right">{formatCurrency(pr.totalGross || "0")}</td>
                            <td className="px-4 py-3 text-[13px] font-mono font-medium text-foreground text-right">{formatCurrency(pr.totalNet || "0")}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={pr.status} />
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
                  <span className="text-sm font-semibold text-foreground" data-testid="text-employees-table-title">Employees</span>
                  <Link href="/employees" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-employees">
                    View all <ArrowRight className="w-3 h-3 inline" />
                  </Link>
                </div>
                <CardContent className="p-0">
                  {activeEmployees.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No employees</div>
                  ) : (
                    <div className="divide-y">
                      {activeEmployees.map((c) => (
                        <Link key={c.id} href={`/employees/${c.id}`} data-testid={`link-employee-${c.id}`}>
                          <div className="px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                                style={{ backgroundColor: `${c.accentColour || "#2563eb"}15`, color: c.accentColour || "#2563eb" }}
                              >
                                {getInitials(c.firstName, c.lastName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[13px] font-semibold text-foreground">{c.firstName} {c.lastName}</span>
                                <div className="text-[11px] text-muted-foreground">{c.clientName || "\u2014"} · ${c.hourlyRate}/hr</div>
                              </div>
                              <StatusBadge status={c.status} />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <div className="flex items-center justify-between px-5 py-3.5 border-b">
                  <span className="text-sm font-semibold text-foreground" data-testid="text-activity-title">Recent activity</span>
                  <Link href="/notifications" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-all-activity">
                    View all <ArrowRight className="w-3 h-3 inline" />
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
