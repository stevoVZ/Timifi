import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Building2, Landmark, CheckCircle2, Receipt, Download } from "lucide-react";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import type { PayRunLine, PayRun } from "@shared/schema";

type PayslipEntry = PayRunLine & { payRun: PayRun };

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

function getAustralianFYBounds(): { fyStart: Date; fyEnd: Date; fyLabel: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 6) {
    return {
      fyStart: new Date(year, 6, 1),
      fyEnd: new Date(year + 1, 5, 30),
      fyLabel: `FY ${year}/${year + 1}`,
    };
  }
  return {
    fyStart: new Date(year - 1, 6, 1),
    fyEnd: new Date(year, 5, 30),
    fyLabel: `FY ${year - 1}/${year}`,
  };
}

function isInCurrentFY(payRun: PayRun): boolean {
  const { fyStart, fyEnd } = getAustralianFYBounds();
  const payDate = payRun.paymentDate || payRun.payDate;
  if (payDate) {
    const d = new Date(payDate);
    return d >= fyStart && d <= fyEnd;
  }
  const runDate = new Date(payRun.year, payRun.month - 1, 1);
  return runDate >= fyStart && runDate <= fyEnd;
}

export default function PortalPayslipsPage() {
  const [, setLocation] = useLocation();
  const { employeeId, employeeName } = usePortalAuth();

  const { data, isLoading } = useQuery<{ payslips: PayslipEntry[] }>({
    queryKey: ["/api/payslips", employeeId],
    queryFn: async () => {
      const res = await fetch(`/api/payslips?employeeId=${employeeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payslips");
      return res.json();
    },
    enabled: !!employeeId,
  });

  if (!employeeId) {
    setLocation("/portal/login");
    return null;
  }

  const payslips = data?.payslips || [];

  const fyPayslips = payslips.filter((p) => p.payRun && isInCurrentFY(p.payRun));
  const ytdGross = fyPayslips.reduce((sum, p) => sum + parseFloat(p.grossEarnings), 0);
  const ytdTax = fyPayslips.reduce((sum, p) => sum + parseFloat(p.paygWithheld), 0);
  const ytdSuper = fyPayslips.reduce((sum, p) => sum + parseFloat(p.superAmount), 0);
  const ytdNet = fyPayslips.reduce((sum, p) => sum + parseFloat(p.netPay), 0);
  const { fyLabel } = getAustralianFYBounds();

  const sortedPayslips = [...payslips].sort((a, b) => {
    const aRun = a.payRun;
    const bRun = b.payRun;
    if (!aRun || !bRun) return 0;
    if (bRun.year !== aRun.year) return bRun.year - aRun.year;
    return bRun.month - aRun.month;
  });

  const ytdCards = [
    { label: "Gross YTD", value: ytdGross, icon: DollarSign, colorClass: "text-green-600 dark:text-green-400", bgClass: "bg-green-50 dark:bg-green-900/20", testId: "text-portal-ytd-gross" },
    { label: "Tax YTD", value: ytdTax, icon: Building2, colorClass: "text-amber-600 dark:text-amber-400", bgClass: "bg-amber-50 dark:bg-amber-900/20", testId: "text-portal-ytd-tax" },
    { label: "Super YTD", value: ytdSuper, icon: Landmark, colorClass: "text-blue-600 dark:text-blue-400", bgClass: "bg-blue-50 dark:bg-blue-900/20", testId: "text-portal-ytd-super" },
    { label: "Net YTD", value: ytdNet, icon: CheckCircle2, colorClass: "text-primary", bgClass: "bg-primary/5", testId: "text-portal-ytd-net" },
  ];

  return (
    <PortalShell employeeName={employeeName}>
      <div className="p-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-portal-payslips-title">
              Payslips
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View your pay history and download payslips
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ytdCards.map((card) => (
              <Card key={card.testId}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-1 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{card.label}</span>
                    <div className={`w-8 h-8 rounded-md ${card.bgClass} flex items-center justify-center`}>
                      <card.icon className={`w-4 h-4 ${card.colorClass}`} />
                    </div>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${card.colorClass}`} data-testid={card.testId}>
                    {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(card.value)}
                  </div>
                  <div className="text-xs text-muted-foreground">{fyLabel}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="p-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : sortedPayslips.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <div className="text-sm text-muted-foreground">No payslips yet</div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pay Date</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Super</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Download</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPayslips.map((payslip) => {
                      const payRun = payslip.payRun;
                      const payDate = payRun.paymentDate || payRun.payDate;
                      const payDateLabel = payDate
                        ? new Date(payDate).toLocaleDateString("en-AU")
                        : `${MONTHS[payRun.month]} ${payRun.year}`;
                      const periodLabel = payRun.periodStart && payRun.periodEnd
                        ? `${new Date(payRun.periodStart).toLocaleDateString("en-AU")} - ${new Date(payRun.periodEnd).toLocaleDateString("en-AU")}`
                        : `${MONTHS[payRun.month]} ${payRun.year}`;

                      return (
                        <TableRow key={payslip.id} data-testid={`row-payslip-${payslip.id}`}>
                          <TableCell className="text-sm" data-testid={`text-payslip-date-${payslip.id}`}>
                            {payDateLabel}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground" data-testid={`text-payslip-period-${payslip.id}`}>
                            {periodLabel}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm" data-testid={`text-payslip-gross-${payslip.id}`}>
                            {formatCurrency(payslip.grossEarnings)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-destructive" data-testid={`text-payslip-tax-${payslip.id}`}>
                            -{formatCurrency(payslip.paygWithheld)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm" data-testid={`text-payslip-super-${payslip.id}`}>
                            {formatCurrency(payslip.superAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold" data-testid={`text-payslip-net-${payslip.id}`}>
                            {formatCurrency(payslip.netPay)}
                          </TableCell>
                          <TableCell data-testid={`text-payslip-status-${payslip.id}`}>
                            <Badge variant="secondary" className="text-xs">
                              {payslip.status === "INCLUDED" ? "Paid" : payslip.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-download-payslip-${payslip.id}`}
                              onClick={() => {
                                window.open(`/api/payslips/${payslip.id}`, "_blank");
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
