import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  DollarSign,
  Clock,
  FileText,
  Users,
  Calculator,
  TrendingUp,
  Receipt,
  Building2,
  Briefcase,
  ExternalLink,
} from "lucide-react";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProfitabilityDetailPage() {
  const params = useParams<{ employeeId: string; year: string; month: string }>();
  const employeeId = params.employeeId;
  const year = parseInt(params.year || "");
  const month = parseInt(params.month || "");

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/profitability", employeeId, year, month],
    queryFn: async () => {
      const res = await fetch(`/api/profitability/${employeeId}/${year}/${month}`);
      if (!res.ok) throw new Error("Failed to fetch profitability detail");
      return res.json();
    },
    enabled: !!employeeId && !isNaN(year) && !isNaN(month),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <TopBar title="Profitability Detail" />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-screen">
        <TopBar title="Profitability Detail" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">Failed to load profitability detail</p>
            <Link href="/profitability">
              <Button variant="outline" data-testid="button-back-profitability">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Profitability
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { employee, period, placements, hours, rateEconomics, revenue, cost, profit } = data;
  const employeeName = `${employee.firstName} ${employee.lastName}`;
  const profitColor = (v: number) => v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  const primaryPlacement = placements[0]?.placement;

  return (
    <div className="flex flex-col h-screen">
      <TopBar title={`${employeeName} — ${MONTHS[period.month]} ${period.year}`} />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/profitability">
            <Button variant="ghost" size="sm" data-testid="button-back-profitability">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
          <div className="flex-1" />
          <Link href={`/employees/${employee.id}`}>
            <Button variant="outline" size="sm" data-testid="link-employee-page">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Employee Details
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" data-testid="badge-period">{MONTHS[period.month]} {period.year}</Badge>
          <Badge variant="outline" data-testid="badge-fy">FY{period.financialYear}/{(period.financialYear + 1).toString().slice(-2)}</Badge>
          <Badge variant="outline" data-testid="badge-payment-method">{employee.paymentMethod || "—"}</Badge>
          {employee.state && <Badge variant="outline" data-testid="badge-state">{employee.state}</Badge>}
          {employee.payrollTaxApplicable && <Badge variant="secondary" className="text-xs" data-testid="badge-pt-applicable">PT Applicable</Badge>}
          {!employee.payrollTaxApplicable && <Badge variant="outline" className="text-xs opacity-50" data-testid="badge-pt-exempt">PT Exempt</Badge>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-revenue">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <DollarSign className="w-3.5 h-3.5" /> Revenue (ex GST)
              </div>
              <div className="text-2xl font-bold tabular-nums" data-testid="text-total-revenue">{fmtCurrency(revenue.total)}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-cost">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Users className="w-3.5 h-3.5" /> Total Cost (inc PT)
                {cost.costSource === "ESTIMATED" && <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px] ml-1" data-testid="badge-estimated-cost">Estimated</Badge>}
              </div>
              <div className="text-2xl font-bold tabular-nums" data-testid="text-total-cost">{fmtCurrency(cost.totalCostIncPT)}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-profit">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Calculator className="w-3.5 h-3.5" /> Profit (inc PT)
              </div>
              <div className={`text-2xl font-bold tabular-nums ${profitColor(profit.profitIncPayrollTax)}`} data-testid="text-profit">
                {fmtCurrency(profit.profitIncPayrollTax)}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-margin">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="w-3.5 h-3.5" /> Margin (inc PT)
              </div>
              <div className={`text-2xl font-bold tabular-nums ${profitColor(profit.marginIncPT)}`} data-testid="text-margin">
                {profit.marginIncPT.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="card-rate-economics">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Rate Economics (Ex GST)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Charge Rate</div>
                  <div className="text-lg font-bold tabular-nums" data-testid="text-charge-rate">${rateEconomics.chargeOutRate.toFixed(0)}</div>
                  <div className="text-[10px] text-muted-foreground">per hour</div>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pay Rate</div>
                  <div className="text-lg font-bold tabular-nums" data-testid="text-pay-rate">{rateEconomics.payRate > 0 ? `$${rateEconomics.payRate.toFixed(0)}` : "—"}</div>
                  <div className="text-[10px] text-muted-foreground">per hour</div>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Spread</div>
                  <div className={`text-lg font-bold tabular-nums ${profitColor(rateEconomics.spread)}`} data-testid="text-spread">${rateEconomics.spread.toFixed(0)}</div>
                  <div className="text-[10px] text-muted-foreground">per hour</div>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Profit/hr</div>
                  <div className={`text-lg font-bold tabular-nums ${profitColor(rateEconomics.marginPerHour)}`} data-testid="text-profit-per-hour">${rateEconomics.marginPerHour.toFixed(0)}</div>
                  <div className="text-[10px] text-muted-foreground">actual</div>
                </div>
              </div>
              {primaryPlacement && (
                <div className="pt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" />
                  {primaryPlacement.clientName}
                  {primaryPlacement.status === "ENDED" && <Badge variant="outline" className="text-[9px] ml-1">Ended</Badge>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-hours">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" /> Hours Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Invoiced</div>
                  <div className="text-lg font-bold tabular-nums" data-testid="text-invoiced-hours">{hours.invoicedHours}</div>
                  <div className="text-[10px] text-muted-foreground">hours</div>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Timesheet</div>
                  <div className="text-lg font-bold tabular-nums" data-testid="text-timesheet-hours">{hours.timesheetHours}</div>
                  <div className="text-[10px] text-muted-foreground">hours</div>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Expected</div>
                  <div className="text-lg font-bold tabular-nums" data-testid="text-expected-hours">{hours.estimatedHours}</div>
                  <div className="text-[10px] text-muted-foreground">hours</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="text-muted-foreground">Utilisation</span>
                <Badge variant={hours.utilisation >= 90 ? "default" : "secondary"} data-testid="text-utilisation">
                  {hours.utilisation}%
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hours Source</span>
                <Badge variant="outline" className="text-xs" data-testid="text-hours-source">{hours.hoursSource}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-revenue-breakdown">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" /> Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.allInvoices.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">Invoices ({data.allInvoices.length})</div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Amount (ex GST)</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.allInvoices.map((inv: any) => (
                        <TableRow key={inv.id} className="text-sm" data-testid={`row-invoice-${inv.id}`}>
                          <TableCell className="font-mono text-xs">{inv.invoiceNumber || "—"}</TableCell>
                          <TableCell>{inv.contactName}</TableCell>
                          <TableCell className="text-right tabular-nums">{inv.hours > 0 ? inv.hours.toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(inv.amountExclGst)}</TableCell>
                          <TableCell className="text-xs">{fmtDate(inv.issueDate)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "PAID" ? "default" : "secondary"} className="text-[10px]">{inv.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {data.allRctis.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">RCTIs ({data.allRctis.length})</div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Amount (ex GST)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.allRctis.map((r: any) => (
                        <TableRow key={r.id} className="text-sm" data-testid={`row-rcti-${r.id}`}>
                          <TableCell>{r.clientName}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.hours > 0 ? r.hours.toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(r.amountExclGst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {data.allInvoices.length === 0 && data.allRctis.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No invoices or RCTIs for this period</p>
            )}
            <div className="border-t pt-3 flex justify-between items-center font-semibold text-sm">
              <span>Total Revenue (ex GST)</span>
              <span className="tabular-nums" data-testid="text-revenue-total">{fmtCurrency(revenue.total)}</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-cost-breakdown">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" /> Cost Breakdown
              {cost.costSource === "CONTRACTOR_SPEND" && <Badge variant="outline" className="text-[10px]">Contractor</Badge>}
              {cost.costSource === "ESTIMATED" && <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">Estimated</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cost.costSource === "ESTIMATED" && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-2">
                  <div className="text-xs font-medium text-amber-700 mb-1">Estimated from placement pay rates (payroll not yet processed)</div>
                  {placements && placements.map((p: any) => (
                    <div key={p.placement.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{p.placement.clientName}: {p.totalHours.toFixed(1)}h × ${p.placement.payRate}/hr</span>
                      <span className="tabular-nums">{fmtCurrency(p.totalHours * p.placement.payRate)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between text-sm font-medium">
                    <span>Total Estimated Cost (inc super)</span>
                    <span className="tabular-nums">{fmtCurrency(cost.totalCostExPT)}</span>
                  </div>
                </div>
              </div>
            )}
            {cost.costSource === "PAYROLL" && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-md p-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Payroll Summary</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Net Pay</span>
                    <span className="tabular-nums" data-testid="text-net-pay">{fmtCurrency(cost.netPay)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PAYG Withheld</span>
                    <span className="tabular-nums" data-testid="text-payg">{fmtCurrency(cost.paygWithheld)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm font-medium">
                    <span>Gross Earnings</span>
                    <span className="tabular-nums" data-testid="text-gross">{fmtCurrency(cost.grossEarnings)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Superannuation</span>
                    <span className="tabular-nums" data-testid="text-super">{fmtCurrency(cost.superAmount)}</span>
                  </div>
                </div>

                {cost.payRunDetails && cost.payRunDetails.length > 0 && cost.payRunDetails.some((pr: any) => pr.payslipLines?.length > 0) && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Payslip Line Items</div>
                    {cost.payRunDetails.map((pr: any, idx: number) => (
                      pr.payslipLines?.length > 0 && (
                        <div key={idx} className="mb-3">
                          {cost.payRunDetails.length > 1 && (
                            <div className="text-xs text-muted-foreground mb-1">Pay date: {fmtDate(pr.payDate)}</div>
                          )}
                          <div className="border rounded-md overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="text-xs">
                                  <TableHead>Type</TableHead>
                                  <TableHead>Name</TableHead>
                                  <TableHead className="text-right">Units</TableHead>
                                  <TableHead className="text-right">Rate</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pr.payslipLines.map((line: any) => (
                                  <TableRow key={line.id} className="text-sm" data-testid={`row-payslip-${line.id}`}>
                                    <TableCell>
                                      <Badge variant="outline" className="text-[10px]">{line.lineType}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{line.name || "—"}</TableCell>
                                    <TableCell className="text-right tabular-nums text-xs">{line.units != null ? line.units.toFixed(2) : "—"}</TableCell>
                                    <TableCell className="text-right tabular-nums text-xs">{line.rate != null ? `$${line.rate.toFixed(2)}` : "—"}</TableCell>
                                    <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(line.amount)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}

            {cost.costSource === "CONTRACTOR_SPEND" && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-md p-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Contractor Payments</div>
                  {cost.contractorTxns.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Contact</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount (ex GST)</TableHead>
                            <TableHead className="text-right">Amount (inc GST)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cost.contractorTxns.map((t: any) => (
                            <TableRow key={t.id} className="text-sm" data-testid={`row-contractor-txn-${t.id}`}>
                              <TableCell className="text-xs">{t.contactName}</TableCell>
                              <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(t.amount)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtCurrency(t.amountInclGst)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No matched payments</p>
                  )}
                </div>
              </div>
            )}

            <div className="border-t mt-4 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {cost.costSource === "ESTIMATED" ? "Estimated (pay rates × hours + super)" : cost.costSource === "PAYROLL" ? "Gross + Super" : "Contractor Cost (ex GST)"}
                </span>
                <span className="tabular-nums font-medium" data-testid="text-base-cost">{fmtCurrency(cost.totalCostExPT)}</span>
              </div>
              {cost.payrollFeePercent > 0 && cost.payrollFeeAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="w-3 h-3" /> Management Fee ({cost.payrollFeePercent}%)
                  </span>
                  <span className="tabular-nums">{fmtCurrency(cost.payrollFeeAmount)}</span>
                </div>
              )}
              {cost.payrollTaxApplicable && cost.payrollTaxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="w-3 h-3" /> Payroll Tax ({cost.payrollTaxRate}%)
                  </span>
                  <span className="tabular-nums" data-testid="text-payroll-tax">{fmtCurrency(cost.payrollTaxAmount)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-semibold text-sm">
                <span>Total Cost (inc PT)</span>
                <span className="tabular-nums" data-testid="text-total-cost-inc-pt">{fmtCurrency(cost.totalCostIncPT)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-profit-summary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Profit Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-md p-4 space-y-3">
                <div className="text-xs font-medium text-muted-foreground">Excluding Payroll Tax</div>
                <div className={`text-2xl font-bold tabular-nums ${profitColor(profit.profitExPayrollTax)}`} data-testid="text-profit-ex-pt">
                  {fmtCurrency(profit.profitExPayrollTax)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Margin</span>
                  <Badge variant={profit.marginExPT >= 20 ? "default" : "secondary"} data-testid="text-margin-ex-pt">
                    {profit.marginExPT.toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <div className={`rounded-md p-4 space-y-3 ${profit.profitIncPayrollTax >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                <div className="text-xs font-medium text-muted-foreground">Including Payroll Tax</div>
                <div className={`text-2xl font-bold tabular-nums ${profitColor(profit.profitIncPayrollTax)}`} data-testid="text-profit-inc-pt">
                  {fmtCurrency(profit.profitIncPayrollTax)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Margin</span>
                  <Badge variant={profit.marginIncPT >= 20 ? "default" : "secondary"} data-testid="text-margin-inc-pt">
                    {profit.marginIncPT.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Revenue</span>
                <span className="tabular-nums">{fmtCurrency(revenue.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>− Cost (ex PT)</span>
                <span className="tabular-nums">{fmtCurrency(cost.totalCostExPT)}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground">
                <span>= Profit (ex PT)</span>
                <span className="tabular-nums">{fmtCurrency(profit.profitExPayrollTax)}</span>
              </div>
              {cost.payrollTaxAmount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>− Payroll Tax</span>
                    <span className="tabular-nums">{fmtCurrency(cost.payrollTaxAmount)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-foreground">
                    <span>= Profit (inc PT)</span>
                    <span className="tabular-nums">{fmtCurrency(profit.profitIncPayrollTax)}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
