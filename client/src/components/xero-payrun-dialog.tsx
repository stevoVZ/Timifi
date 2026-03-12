import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, Send, Loader2, Building2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MONTHS = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(n);
}

function getLastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().split("T")[0];
}
function getFirstDayOfMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString().split("T")[0];
}

interface PreparedEmployee {
  id: string;
  firstName: string;
  lastName: string;
  xeroEmployeeId: string | null;
  hourlyRate: number;
  timesheet: { id: string; totalHours: number; status: string } | null;
  calculated: { hours: number; rate: number; gross: number; payg: number; super: number; net: number };
  hoursSource: "TIMESHEET" | "INVOICE" | "NONE";
  hoursDetail: string;
  included: boolean;
}

interface PrepareData {
  employees: PreparedEmployee[];
  superRate: number;
  calendars: Array<{ id: string; name: string; type: string }>;
}

interface XeroPayrunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function XeroPayrunDialog({ open, onOpenChange }: XeroPayrunDialogProps) {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [calendarId, setCalendarId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"select" | "confirm" | "done">("select");
  const [result, setResult] = useState<any>(null);

  // Auto-fill period dates when month/year changes
  useEffect(() => {
    setPeriodStart(getFirstDayOfMonth(year, month));
    setPeriodEnd(getLastDayOfMonth(year, month));
    // Payment date: last business day ≈ last day of month
    setPaymentDate(getLastDayOfMonth(year, month));
  }, [month, year]);

  const { data, isLoading, error } = useQuery<PrepareData>({
    queryKey: ["/api/payroll/prepare", month, year],
    queryFn: async () => {
      const r = await fetch(`/api/payroll/prepare?month=${month}&year=${year}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load employee data");
      return r.json();
    },
    enabled: open,
  });

  // Sync default selection when data loads
  useEffect(() => {
    if (data) {
      setSelected(new Set(data.employees.filter(e => e.included).map(e => e.id)));
      if (data.calendars.length > 0 && !calendarId) {
        setCalendarId(data.calendars[0].id);
      }
    }
  }, [data]);

  const pushMutation = useMutation({
    mutationFn: async () => {
      const selectedEmps = (data?.employees || [])
        .filter(e => selected.has(e.id) && e.xeroEmployeeId)
        .map(e => ({
          xeroEmployeeId: e.xeroEmployeeId!,
          hours: e.calculated.hours,
          rate: e.calculated.rate,
          gross: e.calculated.gross,
        }));

      const r = await fetch("/api/payroll/push-to-xero", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId, periodStart, periodEnd, paymentDate, employees: selectedEmps }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message || "Push failed");
      }
      return r.json();
    },
    onSuccess: (res) => {
      setResult(res);
      setStep("done");
      toast({ title: "Pay run created in Xero", description: `${res.payslipsUpdated} payslip(s) updated as draft.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to push to Xero", description: err.message, variant: "destructive" });
    },
  });

  const employees = data?.employees || [];
  const calendars = data?.calendars || [];
  const selectedEmps = employees.filter(e => selected.has(e.id));
  const totalGross = selectedEmps.reduce((s, e) => s + e.calculated.gross, 0);
  const totalPayg = selectedEmps.reduce((s, e) => s + e.calculated.payg, 0);
  const totalSuper = selectedEmps.reduce((s, e) => s + e.calculated.super, 0);
  const totalNet = selectedEmps.reduce((s, e) => s + e.calculated.net, 0);

  const noXeroId = employees.filter(e => selected.has(e.id) && !e.xeroEmployeeId);
  const noHours = employees.filter(e => selected.has(e.id) && e.calculated.hours === 0);
  const canPush = selectedEmps.length > 0 && calendarId && periodStart && periodEnd && paymentDate && noXeroId.length === 0;

  function toggleEmployee(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === employees.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(employees.map(e => e.id)));
    }
  }

  const yearOptions = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setStep("select"); setResult(null); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle>Create Draft Pay Run in Xero</DialogTitle>
              <DialogDescription>
                Review employee hours for the period and push to Xero as a draft pay run.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === "done" && result ? (
          <div className="flex-1 overflow-auto py-4">
            <div className="flex flex-col items-center gap-4 text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <div className="text-lg font-semibold">Pay run created in Xero</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Status: <span className="font-medium">{result.payRunStatus}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-2">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-xl font-bold text-green-600">{result.payslipsUpdated}</div>
                  <div className="text-xs text-muted-foreground">Payslips updated</div>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-xl font-bold text-amber-600">{result.payslipsSkipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <Alert variant="destructive" className="w-full text-left">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-1">Some payslips had errors:</div>
                    {result.errors.map((e: string, i: number) => (
                      <div key={i} className="text-xs">{e}</div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
              <div className="text-xs text-muted-foreground">
                Xero Pay Run ID: <code className="font-mono">{result.xeroPayRunId}</code>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Period selector row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b">
              <div>
                <Label className="text-xs">Month</Label>
                <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(m => (
                      <SelectItem key={m} value={String(m)}>{MONTHS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Year</Label>
                <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Xero Calendar</Label>
                {calendars.length === 0 ? (
                  <div className="h-8 flex items-center">
                    <span className="text-xs text-muted-foreground italic">No calendars found</span>
                  </div>
                ) : (
                  <Select value={calendarId} onValueChange={setCalendarId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="text-xs">Payment Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Period dates row */}
            <div className="grid grid-cols-2 gap-3 pb-3 border-b">
              <div>
                <Label className="text-xs">Period Start</Label>
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Period End</Label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            {/* Warnings */}
            {!isLoading && noXeroId.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {noXeroId.map(e => `${e.firstName} ${e.lastName}`).join(", ")} {noXeroId.length === 1 ? "has" : "have"} no Xero Employee ID — they will be excluded from the push.
                </AlertDescription>
              </Alert>
            )}
            {!isLoading && noHours.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {noHours.map(e => `${e.firstName} ${e.lastName}`).join(", ")} {noHours.length === 1 ? "has" : "have"} 0 hours for this period.
                </AlertDescription>
              </Alert>
            )}

            {/* Employee table */}
            <div className="flex-1 overflow-auto border rounded-md">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : error ? (
                <div className="p-6 text-center text-sm text-destructive">
                  {(error as Error).message}
                </div>
              ) : employees.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No active payroll employees found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selected.size === employees.length && employees.length > 0}
                          onCheckedChange={toggleAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">PAYG</TableHead>
                      <TableHead className="text-right">Super</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Xero</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(emp => {
                      const isSelected = selected.has(emp.id);
                      const tsStatus = emp.timesheet?.status;
                      return (
                        <TableRow
                          key={emp.id}
                          className={isSelected ? "bg-primary/5" : "opacity-60"}
                          onClick={() => toggleEmployee(emp.id)}
                        >
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleEmployee(emp.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{emp.firstName} {emp.lastName}</div>
                            {emp.hourlyRate > 0 && (
                              <div className="text-xs text-muted-foreground">${emp.hourlyRate}/hr</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`inline-flex items-center gap-1 cursor-help ${emp.hoursSource === "INVOICE" ? "text-blue-600" : emp.hoursSource === "NONE" ? "text-muted-foreground" : ""}`}>
                                    {emp.calculated.hours > 0 ? emp.calculated.hours.toFixed(2) : "—"}
                                    {emp.calculated.hours > 0 && emp.hoursSource !== "TIMESHEET" && (
                                      <Info className="w-3 h-3" />
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                  <div className="text-xs space-y-1">
                                    <div className="font-medium">
                                      Source: {emp.hoursSource === "TIMESHEET" ? "Timesheet" : emp.hoursSource === "INVOICE" ? "Invoice (fallback)" : "No data"}
                                    </div>
                                    <div className="text-muted-foreground">{emp.hoursDetail}</div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{emp.calculated.rate > 0 ? fmt(emp.calculated.rate) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">{emp.calculated.gross > 0 ? fmt(emp.calculated.gross) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">{emp.calculated.payg > 0 ? fmt(emp.calculated.payg) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-purple-600">{emp.calculated.super > 0 ? fmt(emp.calculated.super) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-600 font-semibold">{emp.calculated.net > 0 ? fmt(emp.calculated.net) : "—"}</TableCell>
                          <TableCell className="text-center">
                            {tsStatus ? (
                              <Badge
                                variant={tsStatus === "APPROVED" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {tsStatus}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">No TS</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.xeroEmployeeId ? (
                              <span className="text-xs text-green-600 font-medium">✓</span>
                            ) : (
                              <span className="text-xs text-destructive font-medium">✗</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Totals summary */}
            {selectedEmps.length > 0 && (
              <div className="grid grid-cols-4 gap-3 pt-2 border-t">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Gross</div>
                  <div className="font-bold font-mono text-sm">{fmt(totalGross)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">PAYG</div>
                  <div className="font-bold font-mono text-sm text-red-600">{fmt(totalPayg)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Super ({data?.superRate?.toFixed(1)}%)</div>
                  <div className="font-bold font-mono text-sm text-purple-600">{fmt(totalSuper)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Net Pay</div>
                  <div className="font-bold font-mono text-sm text-green-600">{fmt(totalNet)}</div>
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {step === "done" ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => pushMutation.mutate()}
                disabled={!canPush || pushMutation.isPending}
                className="gap-2"
              >
                {pushMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Pushing to Xero...</>
                ) : (
                  <><Send className="w-4 h-4" /> Push {selectedEmps.filter(e => e.xeroEmployeeId).length} Employee{selectedEmps.filter(e => e.xeroEmployeeId).length !== 1 ? "s" : ""} to Xero</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}