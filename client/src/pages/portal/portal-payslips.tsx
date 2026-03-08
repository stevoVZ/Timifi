import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Receipt, DollarSign, ShieldCheck, ChevronDown, ChevronUp, Download, Calendar } from "lucide-react";
import type { PayRunLine, PayRun } from "@shared/schema";

type PayslipEntry = PayRunLine & { payRun: PayRun };

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Contractor";
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

function PayslipCard({ payslip }: { payslip: PayslipEntry }) {
  const [open, setOpen] = useState(false);
  const payRun = payslip.payRun;
  const periodLabel = payRun.periodStart && payRun.periodEnd
    ? `${new Date(payRun.periodStart).toLocaleDateString("en-AU")} - ${new Date(payRun.periodEnd).toLocaleDateString("en-AU")}`
    : `${MONTHS[payRun.month]} ${payRun.year}`;

  const paymentDateLabel = payRun.paymentDate
    ? new Date(payRun.paymentDate).toLocaleDateString("en-AU")
    : payRun.payDate
      ? new Date(payRun.payDate).toLocaleDateString("en-AU")
      : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card data-testid={`card-portal-payslip-${payslip.id}`}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground" data-testid={`text-portal-payslip-period-${payslip.id}`}>
                      {MONTHS[payRun.month]} {payRun.year}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {periodLabel}
                    {paymentDateLabel && ` · Paid ${paymentDateLabel}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-foreground" data-testid={`text-portal-payslip-net-${payslip.id}`}>
                    {formatCurrency(payslip.netPay)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Net pay</div>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 border-t">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Earnings</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Hours worked</span>
                    <span className="font-mono text-foreground" data-testid={`text-payslip-hours-${payslip.id}`}>{parseFloat(payslip.hoursWorked).toFixed(2)} hrs</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Hourly rate</span>
                    <span className="font-mono text-foreground" data-testid={`text-payslip-rate-${payslip.id}`}>{formatCurrency(payslip.ratePerHour)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm font-semibold border-t pt-1.5">
                    <span className="text-foreground">Gross earnings</span>
                    <span className="font-mono text-foreground" data-testid={`text-payslip-gross-${payslip.id}`}>{formatCurrency(payslip.grossEarnings)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Deductions & Super</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">PAYG withheld</span>
                    <span className="font-mono text-destructive" data-testid={`text-payslip-payg-${payslip.id}`}>-{formatCurrency(payslip.paygWithheld)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Super (employer)</span>
                    <span className="font-mono text-foreground" data-testid={`text-payslip-super-${payslip.id}`}>{formatCurrency(payslip.superAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm font-semibold border-t pt-1.5">
                    <span className="text-foreground">Net pay</span>
                    <span className="font-mono text-foreground" data-testid={`text-payslip-netpay-${payslip.id}`}>{formatCurrency(payslip.netPay)}</span>
                  </div>
                </div>
              </div>
            </div>

            {(payRun.periodStart || payRun.paymentDate) && (
              <div className="mt-4 pt-3 border-t">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Pay Period</h4>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  {payRun.periodStart && payRun.periodEnd && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(payRun.periodStart).toLocaleDateString("en-AU")} — {new Date(payRun.periodEnd).toLocaleDateString("en-AU")}</span>
                    </div>
                  )}
                  {paymentDateLabel && (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Payment: {paymentDateLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t flex justify-end">
              <Button
                variant="outline"
                size="sm"
                data-testid={`button-download-payslip-${payslip.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`/api/payslips/${payslip.id}`, "_blank");
                }}
              >
                <Download className="w-4 h-4 mr-1.5" />
                View Payslip
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function PortalPayslipsPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data, isLoading } = useQuery<{ payslips: PayslipEntry[] }>({
    queryKey: ["/api/payslips", contractorId],
    queryFn: async () => {
      const res = await fetch(`/api/payslips?contractorId=${contractorId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payslips");
      return res.json();
    },
  });

  const payslips = data?.payslips || [];

  const currentYear = new Date().getFullYear();
  const ytdGross = payslips
    .filter((p) => p.payRun?.year === currentYear)
    .reduce((sum, p) => sum + parseFloat(p.grossEarnings), 0);
  const ytdPayg = payslips
    .filter((p) => p.payRun?.year === currentYear)
    .reduce((sum, p) => sum + parseFloat(p.paygWithheld), 0);
  const ytdSuper = payslips
    .filter((p) => p.payRun?.year === currentYear)
    .reduce((sum, p) => sum + parseFloat(p.superAmount), 0);

  const sortedPayslips = [...payslips].sort((a, b) => {
    const aRun = a.payRun;
    const bRun = b.payRun;
    if (!aRun || !bRun) return 0;
    if (bRun.year !== aRun.year) return bRun.year - aRun.year;
    return bRun.month - aRun.month;
  });

  return (
    <PortalShell contractorName={getContractorName()}>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">YTD Gross</span>
                  <div className="w-8 h-8 rounded-md bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-400" data-testid="text-portal-ytd-gross">
                  {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(ytdGross)}
                </div>
                <div className="text-xs text-muted-foreground">{currentYear} year to date</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">YTD PAYG</span>
                  <div className="w-8 h-8 rounded-md bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400" data-testid="text-portal-ytd-payg">
                  {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(ytdPayg)}
                </div>
                <div className="text-xs text-muted-foreground">Tax withheld</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">YTD Super</span>
                  <div className="w-8 h-8 rounded-md bg-primary/5 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-primary" data-testid="text-portal-ytd-super">
                  {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(ytdSuper)}
                </div>
                <div className="text-xs text-muted-foreground">Employer contributions</div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sortedPayslips.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <div className="text-sm text-muted-foreground">No payslips yet</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sortedPayslips.map((payslip) => (
                <PayslipCard key={payslip.id} payslip={payslip} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
