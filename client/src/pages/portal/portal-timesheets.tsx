import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Clock, FileText, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { Timesheet } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface WeekEntry {
  label: string;
  regular: string;
  overtime: string;
}

interface WeeklyBreakdown {
  weeks: WeekEntry[];
}

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Contractor";
}

function getWeeksForMonth(year: number, month: number): string[] {
  const labels: string[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monthNames[month - 1];

  let weekStart = new Date(firstDay);
  let dayOfWeek = weekStart.getDay();
  if (dayOfWeek !== 1) {
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + diff);
  }

  while (weekStart <= lastDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);

    const startInMonth = weekStart >= firstDay ? weekStart : firstDay;
    const endInMonth = weekEnd <= lastDay ? weekEnd : lastDay;

    const startLabel = `${startInMonth.getDate()} ${mon}`;
    const endLabel = `${endInMonth.getDate()} ${mon}`;
    labels.push(`${startLabel} – ${endLabel}`);

    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return labels;
}

function parseBreakdown(notes: string | null): WeeklyBreakdown | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && Array.isArray(parsed.weeks)) return parsed as WeeklyBreakdown;
    return null;
  } catch {
    return null;
  }
}

function TimesheetSubmitForm({
  contractorId,
  onSuccess,
  isPending,
  onSubmit,
  initialData,
}: {
  contractorId: string;
  onSuccess?: () => void;
  isPending: boolean;
  onSubmit: (data: Record<string, any>) => void;
  initialData?: Timesheet | null;
}) {
  const now = new Date();
  const [year, setYear] = useState(initialData?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initialData?.month ?? now.getMonth() + 1);
  const [grossValue, setGrossValue] = useState(initialData?.grossValue ?? "");

  const weekLabels = useMemo(() => getWeeksForMonth(year, month), [year, month]);

  const existingBreakdown = initialData ? parseBreakdown(initialData.notes) : null;

  const [weekEntries, setWeekEntries] = useState<WeekEntry[]>(() => {
    if (existingBreakdown && existingBreakdown.weeks.length === weekLabels.length) {
      return existingBreakdown.weeks;
    }
    return weekLabels.map((label) => ({ label, regular: "", overtime: "" }));
  });

  const initialYear = initialData?.year;
  const initialMonth = initialData?.month;
  useEffect(() => {
    if (year === initialYear && month === initialMonth && existingBreakdown && existingBreakdown.weeks.length === weekLabels.length) {
      return;
    }
    setWeekEntries(weekLabels.map((label) => ({ label, regular: "", overtime: "" })));
  }, [year, month]);

  const totals = useMemo(() => {
    let regular = 0;
    let overtime = 0;
    for (const w of weekEntries) {
      regular += parseFloat(w.regular) || 0;
      overtime += parseFloat(w.overtime) || 0;
    }
    return { regular, overtime, total: regular + overtime };
  }, [weekEntries]);

  const updateWeek = (index: number, field: "regular" | "overtime", value: string) => {
    setWeekEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const breakdown: WeeklyBreakdown = { weeks: weekEntries };
    onSubmit({
      contractorId,
      year,
      month,
      totalHours: String(totals.total.toFixed(2)),
      regularHours: String(totals.regular.toFixed(2)),
      overtimeHours: String(totals.overtime.toFixed(2)),
      grossValue: grossValue || "0",
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      notes: JSON.stringify(breakdown),
    });
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="portal-year">Year</Label>
          <Input
            id="portal-year"
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || now.getFullYear())}
            required
            data-testid="input-portal-ts-year"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Month</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger data-testid="select-portal-ts-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.slice(1).map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Weekly Hour Breakdown</Label>
        <div className="space-y-2">
          {weekEntries.map((week, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap" data-testid={`row-portal-ts-week-${i}`}>
              <span className="text-xs text-muted-foreground min-w-[110px]">{weekLabels[i]}</span>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Reg"
                  value={week.regular}
                  onChange={(e) => updateWeek(i, "regular", e.target.value)}
                  className="flex-1 min-w-[70px]"
                  data-testid={`input-portal-ts-week-${i}-regular`}
                />
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="OT"
                  value={week.overtime}
                  onChange={(e) => updateWeek(i, "overtime", e.target.value)}
                  className="flex-1 min-w-[70px]"
                  data-testid={`input-portal-ts-week-${i}-overtime`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Total Hours</Label>
          <Input
            type="number"
            value={totals.total.toFixed(2)}
            readOnly
            className="bg-muted/50"
            data-testid="input-portal-ts-total-hours"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Regular</Label>
          <Input
            type="number"
            value={totals.regular.toFixed(2)}
            readOnly
            className="bg-muted/50"
            data-testid="input-portal-ts-regular-hours"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Overtime</Label>
          <Input
            type="number"
            value={totals.overtime.toFixed(2)}
            readOnly
            className="bg-muted/50"
            data-testid="input-portal-ts-overtime-hours"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="portal-grossValue">Gross Value ($)</Label>
        <Input
          id="portal-grossValue"
          type="number"
          step="0.01"
          value={grossValue}
          onChange={(e) => setGrossValue(e.target.value)}
          required
          data-testid="input-portal-ts-gross-value"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending} data-testid="button-portal-submit-timesheet">
        {isPending ? "Submitting..." : initialData ? "Resubmit Timesheet" : "Submit Timesheet"}
      </Button>
    </form>
  );
}

function TimesheetCard({ ts, onResubmit }: { ts: Timesheet; onResubmit?: (ts: Timesheet) => void }) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = parseBreakdown(ts.notes);

  return (
    <Card className="hover-elevate" data-testid={`card-portal-timesheet-${ts.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground" data-testid={`text-portal-ts-period-${ts.id}`}>
                {MONTHS[ts.month]} {ts.year}
              </span>
              <StatusBadge status={ts.status} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {ts.fileName && `${ts.fileName} · `}
              {ts.submittedAt
                ? `Submitted ${new Date(ts.submittedAt).toLocaleDateString("en-AU")}`
                : "Not submitted"}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-right">
              <div className="text-sm font-mono font-medium text-foreground" data-testid={`text-portal-ts-hours-${ts.id}`}>
                {ts.totalHours}h
              </div>
              {parseFloat(ts.overtimeHours || "0") > 0 && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400">+{ts.overtimeHours}h OT</div>
              )}
            </div>
            <div className="text-right min-w-[90px]">
              <div className="text-sm font-mono font-semibold text-foreground" data-testid={`text-portal-ts-value-${ts.id}`}>
                ${parseFloat(ts.grossValue || "0").toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {ts.status === "REJECTED" && onResubmit && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onResubmit(ts)}
                  data-testid={`button-portal-resubmit-${ts.id}`}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
              {breakdown && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setExpanded(!expanded)}
                  data-testid={`button-portal-expand-${ts.id}`}
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>
        {expanded && breakdown && (
          <div className="mt-3 pt-3 border-t space-y-1.5" data-testid={`section-portal-ts-breakdown-${ts.id}`}>
            <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>Week</span>
              <span className="text-right">Regular</span>
              <span className="text-right">Overtime</span>
            </div>
            {breakdown.weeks.map((w, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_80px_80px] gap-2 text-sm"
                data-testid={`row-portal-ts-breakdown-${ts.id}-${i}`}
              >
                <span className="text-muted-foreground">{w.label}</span>
                <span className="text-right font-mono">{parseFloat(w.regular || "0").toFixed(1)}h</span>
                <span className="text-right font-mono text-amber-600 dark:text-amber-400">
                  {parseFloat(w.overtime || "0") > 0 ? `${parseFloat(w.overtime).toFixed(1)}h` : "–"}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-sm font-semibold border-t pt-1.5">
              <span>Total</span>
              <span className="text-right font-mono">{ts.regularHours}h</span>
              <span className="text-right font-mono text-amber-600 dark:text-amber-400">
                {parseFloat(ts.overtimeHours || "0") > 0 ? `${ts.overtimeHours}h` : "–"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalTimesheetsPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resubmitTs, setResubmitTs] = useState<Timesheet | null>(null);
  const { toast } = useToast();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: timesheetsList, isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets/contractor", contractorId],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/timesheets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/contractor", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contractor", contractorId, "stats"] });
      setDialogOpen(false);
      setResubmitTs(null);
      toast({ title: "Timesheet submitted", description: "Your timesheet has been submitted for review." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const grouped = {
    submitted: timesheetsList?.filter((t) => t.status === "SUBMITTED") || [],
    approved: timesheetsList?.filter((t) => t.status === "APPROVED") || [],
    drafts: timesheetsList?.filter((t) => t.status === "DRAFT") || [],
    rejected: timesheetsList?.filter((t) => t.status === "REJECTED") || [],
  };

  const handleResubmit = (ts: Timesheet) => {
    setResubmitTs(ts);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setResubmitTs(null);
  };

  return (
    <PortalShell contractorName={getContractorName()}>
      <div className="p-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold text-foreground" data-testid="text-portal-timesheets-title">
                My Timesheets
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and submit your timesheets
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button data-testid="button-portal-new-timesheet">
                  <Plus className="w-4 h-4" />
                  Submit Timesheet
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{resubmitTs ? "Resubmit Timesheet" : "Submit Timesheet"}</DialogTitle>
                </DialogHeader>
                <TimesheetSubmitForm
                  contractorId={contractorId}
                  isPending={createMutation.isPending}
                  onSubmit={(data) => createMutation.mutate(data)}
                  initialData={resubmitTs}
                />
              </DialogContent>
            </Dialog>
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
          ) : (
            <Tabs defaultValue="submitted">
              <TabsList data-testid="tabs-portal-timesheet-status">
                <TabsTrigger value="submitted" className="gap-1.5" data-testid="tab-portal-submitted">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Submitted ({grouped.submitted.length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="gap-1.5" data-testid="tab-portal-approved">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Approved ({grouped.approved.length})
                </TabsTrigger>
                <TabsTrigger value="drafts" className="gap-1.5" data-testid="tab-portal-drafts">
                  <FileText className="w-3.5 h-3.5" />
                  Drafts ({grouped.drafts.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="gap-1.5" data-testid="tab-portal-rejected">
                  <XCircle className="w-3.5 h-3.5" />
                  Rejected ({grouped.rejected.length})
                </TabsTrigger>
              </TabsList>

              {Object.entries(grouped).map(([key, items]) => (
                <TabsContent key={key} value={key}>
                  {items.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                        <div className="text-sm text-muted-foreground">No {key} timesheets</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {items.map((ts) => (
                        <TimesheetCard
                          key={ts.id}
                          ts={ts}
                          onResubmit={key === "rejected" ? handleResubmit : undefined}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
