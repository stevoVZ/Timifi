import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Users, Clock, FileText, CreditCard, ArrowRight, TrendingUp, AlertTriangle } from "lucide-react";

interface DashboardStats {
  activeContractors: number;
  pendingContractors: number;
  timesheetsDue: number;
  outstandingInvoiceAmount: string;
  overdueAmount: string;
  nextPayRunDate: string | null;
  nextPayRunCount: number;
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Not scheduled";
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const kpis = stats ? [
    {
      label: "Active contractors",
      value: String(stats.activeContractors),
      sub: `${stats.pendingContractors} pending onboarding`,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/5",
    },
    {
      label: "Timesheets due",
      value: String(stats.timesheetsDue),
      sub: "This month",
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "Invoices outstanding",
      value: formatCurrency(stats.outstandingInvoiceAmount),
      sub: `Aged 30+ days: ${formatCurrency(stats.overdueAmount)}`,
      icon: FileText,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-50 dark:bg-red-900/20",
    },
    {
      label: "Next pay run",
      value: formatDate(stats.nextPayRunDate),
      sub: `${stats.nextPayRunCount} contractors`,
      icon: CreditCard,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
    },
  ] : [];

  const quickLinks = [
    {
      title: "Upload timesheets",
      desc: "Drop PDFs for one or more contractors",
      href: "/timesheets",
      icon: Clock,
    },
    {
      title: "Process pay run",
      desc: "Review and file this month's payroll",
      href: "/payroll",
      icon: CreditCard,
    },
    {
      title: "Review contractors",
      desc: "Onboarding, profiles, contract hours",
      href: "/contractors",
      icon: Users,
    },
    {
      title: "Send invoices",
      desc: "Create and email invoices",
      href: "/invoices",
      icon: FileText,
    },
  ];

  const currentMonth = new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Dashboard" subtitle={currentMonth} />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-6">
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
                  <Card key={k.label} className="hover-elevate">
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
                ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickLinks.map((q) => (
              <Link key={q.href} href={q.href}>
                <Card className="hover-elevate cursor-pointer group">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <q.icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground" data-testid={`link-${q.title.replace(/\s/g, "-").toLowerCase()}`}>
                        {q.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{q.desc}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
