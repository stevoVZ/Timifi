import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, DollarSign } from "lucide-react";
import type { Invoice } from "@shared/schema";

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

export default function PortalPayslipsPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices/contractor", contractorId],
  });

  const paidInvoices = invoices?.filter((i) => i.status === "PAID") || [];
  const pendingInvoices = invoices?.filter((i) => ["AUTHORISED", "SENT", "OVERDUE"].includes(i.status)) || [];
  const totalPaid = paidInvoices.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);

  return (
    <PortalShell contractorName={getContractorName()}>
      <div className="p-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-portal-payslips-title">
              Payslips
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View your pay history and invoices
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total paid</span>
                  <div className="w-8 h-8 rounded-md bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-400" data-testid="text-portal-total-paid">
                  {formatCurrency(totalPaid)}
                </div>
                <div className="text-xs text-muted-foreground">{paidInvoices.length} payments</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pending</span>
                  <div className="w-8 h-8 rounded-md bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400" data-testid="text-portal-pending-count">
                  {pendingInvoices.length}
                </div>
                <div className="text-xs text-muted-foreground">Awaiting payment</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total invoices</span>
                  <div className="w-8 h-8 rounded-md bg-primary/5 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-primary" data-testid="text-portal-total-invoices">
                  {invoices?.length || 0}
                </div>
                <div className="text-xs text-muted-foreground">All time</div>
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
          ) : !invoices || invoices.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <div className="text-sm text-muted-foreground">No payslips yet</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <Card key={inv.id} className="hover-elevate" data-testid={`card-portal-payslip-${inv.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground font-mono" data-testid={`text-portal-payslip-ref-${inv.id}`}>
                              {inv.invoiceNumber || "—"}
                            </span>
                            <StatusBadge status={inv.status} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {MONTHS[inv.month]} {inv.year}
                            {inv.paidDate && ` · Paid ${new Date(inv.paidDate).toLocaleDateString("en-AU")}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-foreground" data-testid={`text-portal-payslip-amount-${inv.id}`}>
                          {formatCurrency(inv.amountInclGst)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatCurrency(inv.amountExclGst)} + GST
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
