import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Users, TrendingUp, Calendar } from "lucide-react";
import type { PayRun } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

export default function PayrollPage() {
  const { data: payRunsList, isLoading } = useQuery<PayRun[]>({
    queryKey: ["/api/pay-runs"],
  });

  const draftRun = payRunsList?.find((p) => p.status === "DRAFT");
  const filedRuns = payRunsList?.filter((p) => p.status === "FILED") || [];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Payroll" subtitle="Pay runs, PAYG & superannuation" />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full rounded-md" />
              <Skeleton className="h-60 w-full rounded-md" />
            </div>
          ) : (
            <>
              {draftRun && (
                <Card data-testid="card-current-pay-run">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base">Current Pay Run</CardTitle>
                      <StatusBadge status={draftRun.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="text-lg font-semibold text-foreground" data-testid="text-pay-run-ref">
                        {draftRun.payRunRef}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {MONTHS[draftRun.month]} {draftRun.year}
                      </span>
                      {draftRun.payDate && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Pay date: {new Date(draftRun.payDate).toLocaleDateString("en-AU")}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <PayRunStat
                        icon={DollarSign}
                        label="Gross Pay"
                        value={formatCurrency(draftRun.totalGross)}
                        color="text-foreground"
                        bgColor="bg-muted/50"
                        testId="text-gross-pay"
                      />
                      <PayRunStat
                        icon={TrendingUp}
                        label="PAYG Withholding"
                        value={formatCurrency(draftRun.totalPayg)}
                        color="text-red-600 dark:text-red-400"
                        bgColor="bg-red-50 dark:bg-red-900/20"
                        testId="text-payg"
                      />
                      <PayRunStat
                        icon={TrendingUp}
                        label="Superannuation"
                        value={formatCurrency(draftRun.totalSuper)}
                        color="text-amber-600 dark:text-amber-400"
                        bgColor="bg-amber-50 dark:bg-amber-900/20"
                        testId="text-super"
                      />
                      <PayRunStat
                        icon={DollarSign}
                        label="Net Pay"
                        value={formatCurrency(draftRun.totalNet)}
                        color="text-green-600 dark:text-green-400"
                        bgColor="bg-green-50 dark:bg-green-900/20"
                        testId="text-net-pay"
                      />
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{draftRun.employeeCount} contractors included</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Pay Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  {filedRuns.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No completed pay runs yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filedRuns.map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center justify-between gap-4 py-3 px-4 rounded-md bg-muted/50 flex-wrap"
                          data-testid={`row-pay-run-${run.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-semibold text-foreground" data-testid={`text-pay-run-ref-${run.id}`}>
                              {run.payRunRef}
                            </div>
                            <StatusBadge status={run.status} />
                            <span className="text-xs text-muted-foreground">
                              {MONTHS[run.month]} {run.year}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Gross</div>
                              <div className="font-mono font-medium text-foreground">{formatCurrency(run.totalGross)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Net</div>
                              <div className="font-mono font-medium text-green-600 dark:text-green-400">{formatCurrency(run.totalNet)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Employees</div>
                              <div className="font-mono text-foreground">{run.employeeCount}</div>
                            </div>
                          </div>
                        </div>
                      ))}
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

function PayRunStat({ icon: Icon, label, value, color, bgColor, testId }: { icon: any; label: string; value: string; color: string; bgColor: string; testId: string }) {
  return (
    <div className={`p-4 rounded-md ${bgColor}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-lg font-mono font-bold ${color}`} data-testid={testId}>{value}</div>
    </div>
  );
}
