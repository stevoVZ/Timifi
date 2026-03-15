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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { AlertTriangle, CheckCircle2, Send, Loader2, Building2, Info, FileEdit } from "lucide-react";
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

interface PayPeriodOption {
  calendarId: string;
  calendarName: string;
  calendarType: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  label: string;
  hasDraft: boolean;
  draftPayRunId: string | null;
}

interface PreparedEmployee {
  id: string;
  firstName: string;
  lastName: string;
  xeroEmployeeId: string | null;
  hourlyRate: number;
  timesheet: { id: string; totalHours: number; status: string } | null;
  calculated: { hours: number; rate: number; gross: number; payg: number; super: number; net: number };
  hoursSource: "XERO" | "TIMESHEET" | "INVOICE" | "NONE";
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
  const [selectedPeriodKey, setSelectedPeriodKey] = useState("");
  const [isUnscheduled, setIsUnscheduled] = useState(false);
  const [selectedDraftInfo, setSelectedDraftInfo] = useState<{ hasDraft: boolean; draftPayRunId: string | null }>({ hasDraft: false, draftPayRunId: null });
  const [hoursOverride, setHoursOverride] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isUnscheduled) {
      setPeriodStart(getFirstDayOfMonth(year, month));
      setPeriodEnd(getLastDayOfMonth(year, month));
      setPaymentDate(getLastDayOfMonth(year, month));
    }
  }, [month, year, isUnscheduled]);

  const { data: periodsData, isLoading: periodsLoading } = useQuery<{ periods: PayPeriodOption[] }>({
    queryKey: ["/api/payroll/pay-periods"],
    queryFn: async () => {
      const r = await fetch("/api/payroll/pay-periods", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load pay periods");
      return r.json();
    },
    enabled: open,
  });

  const payPeriods = periodsData?.periods || [];

  const periodsByCalendar = payPeriods.reduce<Record<string, PayPeriodOption[]>>((acc, p) => {
    if (!acc[p.calendarName]) acc[p.calendarName] = [];
    acc[p.calendarName].push(p);
    return acc;
  }, {});

  function handlePeriodSelect(key: string) {
    setSelectedPeriodKey(key);
    if (key === "unscheduled") {
      setIsUnscheduled(true);
      setCalendarId("");
      setPeriodStart(getFirstDayOfMonth(year, month));
      setPeriodEnd(getLastDayOfMonth(year, month));
      setPaymentDate(getLastDayOfMonth(year, month));
      setSelectedDraftInfo({ hasDraft: false, draftPayRunId: null });
      setHoursOverride({});
      return;
    }
    setIsUnscheduled(false);
    const period = payPeriods.find(p => `${p.calendarId}|${p.periodStart}|${p.periodEnd}` === key);
    if (period) {
      setCalendarId(period.calendarId);
      setPeriodStart(period.periodStart);
      setPeriodEnd(period.periodEnd);
      setPaymentDate(period.paymentDate);
      setSelectedDraftInfo({ hasDraft: period.hasDraft, draftPayRunId: period.draftPayRunId });

      const startDate = new Date(period.periodStart);
      setMonth(startDate.getMonth() + 1);
      setYear(startDate.getFullYear());
    }
  }

  const { data, isLoading, error } = useQuery<PrepareData>({
    queryKey: ["/api/payroll/prepare", month, year, selectedDraftInfo.draftPayRunId],
    queryFn: async () => {
      const params = new URLSearchParams({ month: String(month), year: String(year) });
      if (selectedDraftInfo.draftPayRunId) params.set("draftPayRunId", selectedDraftInfo.draftPayRunId);
      const r = await fetch(`/api/payroll/prepare?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load employee data");
      return r.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (data) {
      setSelected(new Set(data.employees.filter(e => e.included).map(e => e.id)));
    }
  }, [data]);

  const pushMutation = useMutation({
    mutationFn: async () => {
      const selectedEmps = (data?.employees || [])
        .filter(e => selected.has(e.id))
        .map(e => {
          const overriddenHours = hoursOverride[e.id] !== undefined
            ? parseFloat(hoursOverride[e.id]) || 0
            : e.calculated.hours;
          return {
            appEmployeeId: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            xeroEmployeeId: e.xeroEmployeeId || null,
            hours: overriddenHours,
            rate: e.calculated.rate,
            gross: Math.round(overriddenHours * e.calculated.rate * 100) / 100,
          };
        });

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
      const action = selectedDraftInfo.hasDraft ? "updated" : "created";
      toast({ title: `Pay run ${action} in Xero`, description: `${res.payslipsUpdated} payslip(s) updated as draft.` });
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
  const noHours = employees.filter(e => {
    if (!selected.has(e.id)) return false;
    const ov = hoursOverride[e.id];
    const hrs = ov !== undefined ? (parseFloat(ov) || 0) : e.calculated.hours;
    return hrs === 0;
  });
  const canPush = selectedEmps.length > 0 && calendarId && periodStart && periodEnd && paymentDate && noHours.length === 0;

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
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (!v) {
        setStep("select");
        setResult(null);
        setSelectedPeriodKey("");
        setIsUnscheduled(false);
        setCalendarId("");
        setPeriodStart("");
        setPeriodEnd("");
        setPaymentDate("");
        setSelectedDraftInfo({ hasDraft: false, draftPayRunId: null });
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle data-testid="text-dialog-title">Create Draft Pay Run in Xero</DialogTitle>
              <DialogDescription>
                Select a pay period and review employee hours before pushing to Xero.
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
                <div className="text-lg font-semibold" data-testid="text-payrun-result">Pay run {selectedDraftInfo.hasDraft ? "updated" : "created"} in Xero</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Status: <span className="font-medium">{result.payRunStatus}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-2">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-xl font-bold text-green-600" data-testid="text-payslips-updated">{result.payslipsUpdated}</div>
                  <div className="text-xs text-muted-foreground">Payslips updated</div>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-xl font-bold text-amber-600" data-testid="text-payslips-skipped">{result.payslipsSkipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
              </div>
              {result.errors?.filter((e: string) => !e.startsWith("Reused existing")).length > 0 && (
                  <Alert variant="destructive" className="w-full text-left">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-1">Some payslips had errors:</div>
                    {result.errors.filter((e: string) => !e.startsWith("Reused existing")).map((e: string, i: number) => (
                      <div key={i} className="text-xs">{e}</div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
              {result.errors?.some((e: string) => e.startsWith("Reused existing")) && (
                <Alert className="w-full text-left border-blue-200 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-xs">
                    Updated existing draft — no new pay run was created in Xero.
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
            {/* Pay Period selector */}
            <div className="pb-3 border-b">
              <Label className="text-xs font-medium mb-1.5 block">Select a Pay Period</Label>
              {periodsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedPeriodKey} onValueChange={handlePeriodSelect} data-testid="select-pay-period">
                  <SelectTrigger className="h-9 text-sm" data-testid="select-pay-period-trigger">
                    <SelectValue placeholder="Choose a pay period..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(periodsByCalendar).map(([calName, periods]) => (
                      <SelectGroup key={calName}>
                        <SelectLabel className="text-xs font-semibold text-muted-foreground">{calName}</SelectLabel>
                        {periods.map(p => {
                          const key = `${p.calendarId}|${p.periodStart}|${p.periodEnd}`;
                          return (
                            <SelectItem key={key} value={key} data-testid={`select-period-${p.calendarId}-${p.periodStart}`}>
                              <span className="flex items-center gap-2">
                                <span>{p.label}</span>
                                {p.hasDraft && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">
                                    Draft
                                  </Badge>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    ))}
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-muted-foreground">Other</SelectLabel>
                      <SelectItem value="unscheduled" data-testid="select-period-unscheduled">
                        Unscheduled pay run
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Draft indicator */}
            {selectedDraftInfo.hasDraft && (
              <Alert className="border-amber-200 bg-amber-50">
                <FileEdit className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800" data-testid="text-draft-indicator">
                  <span className="font-medium">Draft already exists</span> — payslips will be updated on the existing draft pay run instead of creating a new one.
                </AlertDescription>
              </Alert>
            )}

            {/* Unscheduled mode: show manual date pickers */}
            {isUnscheduled && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b">
                <div>
                  <Label className="text-xs">Month</Label>
                  <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                    <SelectTrigger className="h-8 text-sm" data-testid="select-month">
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
                    <SelectTrigger className="h-8 text-sm" data-testid="select-year">
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
                      <SelectTrigger className="h-8 text-sm" data-testid="select-calendar">
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
                    data-testid="input-payment-date"
                  />
                </div>
              </div>
            )}

            {/* Period dates display (for scheduled) or editable (for unscheduled) */}
            {isUnscheduled ? (
              <div className="grid grid-cols-2 gap-3 pb-3 border-b">
                <div>
                  <Label className="text-xs">Period Start</Label>
                  <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="h-8 text-sm" data-testid="input-period-start" />
                </div>
                <div>
                  <Label className="text-xs">Period End</Label>
                  <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="h-8 text-sm" data-testid="input-period-end" />
                </div>
              </div>
            ) : selectedPeriodKey && !isUnscheduled ? (
              <div className="grid grid-cols-3 gap-3 pb-3 border-b text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Period Start</Label>
                  <div className="font-medium" data-testid="text-period-start">{periodStart}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Period End</Label>
                  <div className="font-medium" data-testid="text-period-end">{periodEnd}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Payment Date</Label>
                  <div className="font-medium" data-testid="text-payment-date">{paymentDate}</div>
                </div>
              </div>
            ) : null}

            {/* Warnings */}
            {!isLoading && noXeroId.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-xs">
                  <span className="font-medium">{noXeroId.map(e => `${e.firstName} ${e.lastName}`).join(", ")}</span> {noXeroId.length === 1 ? "has" : "have"} no Xero ID — will attempt name-based matching. Run a Xero sync first if push fails.
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
                          data-testid="checkbox-select-all"
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
                          data-testid={`row-employee-${emp.id}`}
                        >
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleEmployee(emp.id)}
                              data-testid={`checkbox-employee-${emp.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm" data-testid={`text-employee-name-${emp.id}`}>{emp.firstName} {emp.lastName}</div>
                            {emp.hourlyRate > 0 && (
                              <div className="text-xs text-muted-foreground">${emp.hourlyRate}/hr</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      placeholder={emp.calculated.hours > 0 ? emp.calculated.hours.toFixed(2) : "0"}
                                      value={hoursOverride[emp.id] !== undefined ? hoursOverride[emp.id] : (emp.calculated.hours > 0 ? emp.calculated.hours.toFixed(2) : "")}
                                      onChange={ev => setHoursOverride(prev => ({ ...prev, [emp.id]: ev.target.value }))}
                                      className={`w-20 text-right text-sm font-mono border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary ${emp.hoursSource === "XERO" && hoursOverride[emp.id] === undefined ? "border-green-400 bg-green-50" : ""}`}
                                      data-testid={`input-hours-${emp.id}`}
                                    />
                                    {emp.hoursSource !== "NONE" && emp.hoursSource !== "TIMESHEET" && (
                                      <Info className="w-3 h-3 text-blue-500 cursor-help" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                  <div className="text-xs space-y-1">
                                    <div className="font-medium">
                                      Source: {emp.hoursSource === "XERO" ? "✓ Xero payslip" : emp.hoursSource === "TIMESHEET" ? "Timesheet" : emp.hoursSource === "INVOICE" ? "Invoice (fallback)" : "No data — enter manually"}
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
                  <div className="font-bold font-mono text-sm" data-testid="text-total-gross">{fmt(totalGross)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">PAYG</div>
                  <div className="font-bold font-mono text-sm text-red-600" data-testid="text-total-payg">{fmt(totalPayg)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Super ({data?.superRate?.toFixed(1)}%)</div>
                  <div className="font-bold font-mono text-sm text-purple-600" data-testid="text-total-super">{fmt(totalSuper)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Net Pay</div>
                  <div className="font-bold font-mono text-sm text-green-600" data-testid="text-total-net">{fmt(totalNet)}</div>
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {step === "done" ? (
            <Button onClick={() => onOpenChange(false)} data-testid="button-close">Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">Cancel</Button>
              <Button
                onClick={() => pushMutation.mutate()}
                disabled={!canPush || pushMutation.isPending}
                className="gap-2"
                data-testid="button-push-to-xero"
              >
                {pushMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Pushing to Xero...</>
                ) : selectedDraftInfo.hasDraft ? (
                  <><FileEdit className="w-4 h-4" /> Update Draft — {selectedEmps.filter(e => e.xeroEmployeeId).length} Employee{selectedEmps.filter(e => e.xeroEmployeeId).length !== 1 ? "s" : ""}</>
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