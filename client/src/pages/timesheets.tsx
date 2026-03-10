import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Clock, FileText, CheckCircle, AlertTriangle, XCircle,
  Mail, Upload, UserCheck, Monitor, Paperclip, ChevronDown, ChevronUp,
  X, Eye, Loader2, Info, ArrowRight, UploadCloud, FilePlus, Users,
  ChevronLeft, ChevronRight, Trash2,
} from "lucide-react";
import type { Timesheet, Employee, Document as DocType } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const INTAKE_SOURCES = [
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "PORTAL_UPLOAD", label: "Portal Upload", icon: Upload },
  { value: "WALK_IN", label: "Walk-in", icon: UserCheck },
  { value: "ADMIN_ENTRY", label: "Admin Entry", icon: Monitor },
];

const INTAKE_BADGE_STYLES: Record<string, string> = {
  EMAIL: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  PORTAL_UPLOAD: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  WALK_IN: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  ADMIN_ENTRY: "bg-gray-50 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300",
};

const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

interface QueueItem {
  id: string;
  file: File;
  fileBase64: string | null;
  status: "scanning" | "done" | "error";
  result: ScanResult | null;
  excluded: boolean;
  assignedEmployeeId: string | null;
  assignedMonth: number;
  assignedYear: number;
}

interface ScanResult {
  fileName: string;
  fileSize: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  period: string;
  format: string;
  confidence: number;
  warnings: string[];
  weeks: { wk: string; h: number }[];
  notes: string | null;
  employeeName?: string | null;
  clientName?: string | null;
  signatureDetected?: boolean;
  monthBoundaryWarning?: string | null;
}

function parseMonthFromPeriod(period: string): { month: number; year: number } | null {
  if (!period) return null;
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const lower = period.toLowerCase();
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i])) {
      const yearMatch = period.match(/20\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
      return { month: i + 1, year };
    }
  }
  return null;
}

export default function TimesheetsPage() {
  const [mainTab, setMainTab] = useState("upload");

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Timesheets"
        subtitle="Upload, review and manage employee timesheets"
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <Tabs value={mainTab} onValueChange={setMainTab}>
            <TabsList className="mb-4" data-testid="tabs-main-view">
              <TabsTrigger value="upload" className="gap-1.5" data-testid="tab-upload">
                <UploadCloud className="w-3.5 h-3.5" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="submissions" className="gap-1.5" data-testid="tab-submissions">
                <FileText className="w-3.5 h-3.5" />
                Submissions
              </TabsTrigger>
              <TabsTrigger value="monthly" className="gap-1.5" data-testid="tab-monthly">
                <Users className="w-3.5 h-3.5" />
                Monthly Hours
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload">
              <UploadView />
            </TabsContent>

            <TabsContent value="submissions">
              <SubmissionsView />
            </TabsContent>

            <TabsContent value="monthly">
              <MonthlyHoursView />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function UploadView() {
  const { toast } = useToast();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmittedCount, setLastSubmittedCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);

  const [intakeSource, setIntakeSource] = useState("ADMIN_ENTRY");
  const [senderEmail, setSenderEmail] = useState("");
  const [receivedDate, setReceivedDate] = useState(now.toISOString().slice(0, 10));
  const [intakeNotes, setIntakeNotes] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const activeEmployees = employees?.filter((c) => c.status === "ACTIVE") || [];

  const readFileBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const updItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const matchEmployee = useCallback((name: string | null | undefined): string | null => {
    if (!name || activeEmployees.length === 0) return null;
    const lower = name.toLowerCase();
    const match = activeEmployees.find((e) => {
      const full = `${e.firstName} ${e.lastName}`.toLowerCase();
      return full === lower || (lower.includes(e.firstName.toLowerCase()) && lower.includes(e.lastName.toLowerCase()));
    });
    return match?.id || null;
  }, [activeEmployees]);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf");
    if (pdfs.length < files.length) {
      toast({ title: "Non-PDF files skipped", description: "Only PDF files are supported.", variant: "destructive" });
    }
    if (!pdfs.length) return;

    const itemIds: string[] = [];
    pdfs.forEach((f) => {
      const id = uid();
      itemIds.push(id);
      setQueue((q) => [...q, {
        id, file: f, fileBase64: null, status: "scanning", result: null, excluded: false,
        assignedEmployeeId: null, assignedMonth: currentMonth, assignedYear: currentYear,
      }]);
    });

    const base64Promises = pdfs.map(async (f, idx) => {
      const b64 = await readFileBase64(f);
      const id = itemIds[idx];
      setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, fileBase64: b64 } : item)));
    });

    const formData = new FormData();
    pdfs.forEach((f) => formData.append("files", f));
    formData.append("month", String(currentMonth));
    formData.append("year", String(currentYear));

    try {
      const [res] = await Promise.all([
        fetch("/api/timesheets/scan", { method: "POST", body: formData, credentials: "include" }),
        ...base64Promises,
      ]);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "Scan failed" }));
        throw new Error(errData.message || "Scan failed");
      }
      const data = await res.json();
      const results: ScanResult[] = data.results || [];

      results.forEach((result: ScanResult, idx: number) => {
        const id = itemIds[idx];
        if (id) {
          const empId = matchEmployee(result.employeeName);
          const parsed = parseMonthFromPeriod(result.period);
          setQueue((prev) => prev.map((item) => (item.id === id ? {
            ...item,
            status: "done",
            result,
            assignedEmployeeId: empId,
            assignedMonth: parsed?.month || currentMonth,
            assignedYear: parsed?.year || currentYear,
          } : item)));
        }
      });

      itemIds.forEach((id, idx) => {
        if (idx >= results.length) {
          setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, status: "error", result: null } : item)));
        }
      });

      const autoDetected = results.filter((r) => matchEmployee(r.employeeName));
      if (autoDetected.length > 0) {
        toast({ title: "Employees detected", description: `Auto-assigned ${autoDetected.length} file${autoDetected.length > 1 ? "s" : ""} from scanned data.` });
      }
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message || "AI extraction failed", variant: "destructive" });
      itemIds.forEach((id) => {
        setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, status: "error", result: null } : item)));
      });
    }
  }, [currentMonth, currentYear, toast, matchEmployee]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const activeQueue = queue.filter((i) => !i.excluded);
  const doneActive = activeQueue.filter((i) => i.status === "done" && i.result);
  const allDone = activeQueue.length > 0 && activeQueue.every((i) => i.status === "done" || i.status === "error");
  const anyScanning = queue.some((i) => i.status === "scanning");
  const allAssigned = doneActive.every((i) => !!i.assignedEmployeeId);
  const canSubmit = allDone && doneActive.length > 0 && !anyScanning && allAssigned;

  const grouped = doneActive.reduce<Record<string, QueueItem[]>>((acc, item) => {
    const key = `${item.assignedEmployeeId}__${item.assignedMonth}__${item.assignedYear}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const groupSummaries = Object.entries(grouped).map(([key, items]) => {
    const [empId, monthStr, yearStr] = key.split("__");
    const emp = activeEmployees.find((e) => e.id === empId);
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);
    const totalHours = items.reduce((s, i) => s + (i.result?.totalHours || 0), 0);
    const regularHours = items.reduce((s, i) => s + (i.result?.regularHours || 0), 0);
    const overtimeHours = items.reduce((s, i) => s + (i.result?.overtimeHours || 0), 0);
    const rate = emp ? parseFloat(emp.hourlyRate || "0") : 0;
    return { empId, emp, month, year, items, totalHours, regularHours, overtimeHours, grossValue: totalHours * rate };
  });

  const batchTotalHours = doneActive.reduce((s, i) => s + (i.result?.totalHours || 0), 0);

  const [overwriteWarnings, setOverwriteWarnings] = useState<{ employeeName: string; month: number; year: number; existingStatus: string }[]>([]);
  const [pendingItems, setPendingItems] = useState<any[]>([]);

  const buildItems = () => {
    const notesObj: Record<string, any> = { intakeSource };
    if (senderEmail) notesObj.senderEmail = senderEmail;
    if (intakeNotes) notesObj.intakeNotes = intakeNotes;
    if (receivedDate) notesObj.receivedDate = receivedDate;
    const notesStr = JSON.stringify(notesObj);

    return groupSummaries.map((g) => ({
      employeeId: g.empId,
      employeeName: g.emp ? `${g.emp.firstName} ${g.emp.lastName}` : g.empId,
      year: g.year,
      month: g.month,
      totalHours: String(g.totalHours),
      regularHours: String(g.regularHours),
      overtimeHours: String(g.overtimeHours),
      grossValue: String(g.grossValue),
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      fileName: g.items.length === 1
        ? g.items[0].result!.fileName
        : `Batch (${g.items.length} files)`,
      notes: notesStr,
      files: g.items
        .filter((item) => item.fileBase64)
        .map((item) => ({
          name: item.result?.fileName || item.file.name,
          data: item.fileBase64,
          type: item.file.type || "application/pdf",
          size: item.file.size,
        })),
    }));
  };

  const submitBatch = async (items: any[], forceOverwrite = false) => {
    try {
      const res = await fetch("/api/timesheets/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items, forceOverwrite }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setOverwriteWarnings(data.warnings || []);
        setPendingItems(items);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to submit" }));
        throw new Error(err.message);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setLastSubmittedCount(groupSummaries.length);
      setSubmitting(false);
      setSubmitted(true);
      toast({ title: "Timesheets submitted", description: `${groupSummaries.length} timesheet${groupSummaries.length > 1 ? "s" : ""} created for review.` });
    } catch (err: any) {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const items = buildItems();
    await submitBatch(items);
  };

  const handleForceOverwrite = async () => {
    setOverwriteWarnings([]);
    setSubmitting(true);
    await submitBatch(pendingItems, true);
    setPendingItems([]);
  };

  const cancelOverwrite = () => {
    setOverwriteWarnings([]);
    setPendingItems([]);
  };

  const resetAll = () => {
    setQueue([]);
    setSubmitted(false);
    setExpandedId(null);
    setShowIntake(false);
    setReviewMode(false);
    setReviewIdx(0);
  };

  const successCard = submitted ? (
    <Card className="max-w-lg mx-auto">
      <CardContent className="p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1" data-testid="text-submit-success">
          {lastSubmittedCount > 1
            ? `${lastSubmittedCount} timesheets submitted`
            : "Timesheet submitted"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Files processed successfully
        </p>

        <Button variant="outline" className="w-full" onClick={resetAll} data-testid="button-upload-another">
          Upload another batch
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  ) : null;

  const overwriteDialog = overwriteWarnings.length > 0 ? (
    <Dialog open onOpenChange={() => cancelOverwrite()}>
      <DialogContent className="max-w-md" data-testid="dialog-overwrite-warning">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Overwrite Warning
          </DialogTitle>
          <DialogDescription>
            The following timesheets already have <strong>approved</strong> records that will be overwritten:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {overwriteWarnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-md text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>{w.employeeName}</strong> — {MONTHS[w.month]} {w.year} ({w.existingStatus})</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={cancelOverwrite} data-testid="button-cancel-overwrite">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleForceOverwrite}
            data-testid="button-confirm-overwrite"
          >
            Overwrite Approved
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  if (submitted) {
    return (
      <>
        {successCard}
        {overwriteDialog}
      </>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <DropZone
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDrop={handleDrop}
          fileRef={fileRef}
          addFiles={addFiles}
          large
        />
        <p className="text-center text-xs text-muted-foreground">
          Drop one or many PDFs — different employees and months are handled automatically
        </p>
      </div>
    );
  }

  const reviewItems = doneActive.filter((i) => i.result);
  const currentReview = reviewItems[reviewIdx];

  if (reviewMode && currentReview) {
    const r = currentReview.result!;
    const assignedEmp = activeEmployees.find((e) => e.id === currentReview.assignedEmployeeId);
    const confColor = r.confidence >= 90 ? "text-green-600" : r.confidence >= 70 ? "text-amber-600" : "text-red-600";

    return (
      <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => { setReviewMode(false); setReviewIdx(0); }} data-testid="button-back-to-queue">
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              Back to files
            </Button>
            <span className="text-sm text-muted-foreground">
              Reviewing {reviewIdx + 1} of {reviewItems.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm"
              disabled={reviewIdx === 0}
              onClick={() => setReviewIdx(reviewIdx - 1)}
              data-testid="button-review-prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={reviewIdx >= reviewItems.length - 1}
              onClick={() => setReviewIdx(reviewIdx + 1)}
              data-testid="button-review-next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4" style={{ minHeight: "65vh" }}>
          <ReviewPdfPanel item={currentReview} />


          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Detected Data</h3>
                  <span className={`text-xs font-semibold ${confColor}`} data-testid="text-review-confidence">{r.confidence}% confidence</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Total", `${r.totalHours}h`, "text-primary"],
                    ["Regular", `${r.regularHours}h`, "text-green-600"],
                    ["Overtime", `${r.overtimeHours}h`, r.overtimeHours > 8 ? "text-red-600" : "text-amber-600"],
                  ].map(([label, val, color]) => (
                    <div key={label} className="p-2.5 rounded-lg bg-muted border border-border text-center">
                      <div className={`font-mono text-lg font-semibold ${color}`} data-testid={`text-review-${(label as string).toLowerCase()}`}>{val}</div>
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-0">
                  {[
                    ["Period", r.period],
                    ["Format", r.format],
                    ...(r.employeeName ? [["Employee Detected", r.employeeName]] : []),
                    ...(r.clientName ? [["Client", r.clientName]] : []),
                    ["Signature", r.signatureDetected ? "Detected" : "Not detected"],
                    ...(r.notes ? [["Notes", r.notes]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1.5 border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground">{k}</span>
                      <span className={`text-xs font-medium text-foreground text-right max-w-[220px] ${k === "Signature" && r.signatureDetected ? "text-green-600" : ""}`}>{v}</span>
                    </div>
                  ))}
                </div>

                {r.weeks.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Weekly breakdown</div>
                    {r.weeks.map((w, i) => {
                      const maxH = Math.max(...r.weeks.map((x) => x.h));
                      const pct = (w.h / maxH) * 100;
                      return (
                        <div key={i} className="mb-2">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs text-muted-foreground">{w.wk}</span>
                            <span className={`font-mono text-xs ${w.h > 44 ? "text-red-600" : w.h > 40 ? "text-amber-600" : "text-green-600"}`}>{w.h}h</span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {r.warnings.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    {r.warnings.map((w, i) => (
                      <div key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Assignment</h3>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Employee</Label>
                    <Select
                      value={currentReview.assignedEmployeeId || ""}
                      onValueChange={(v) => updItem(currentReview.id, { assignedEmployeeId: v })}
                    >
                      <SelectTrigger className={`h-8 text-sm ${!currentReview.assignedEmployeeId ? "border-amber-300 dark:border-amber-700" : ""}`} data-testid="select-review-employee">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeEmployees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Month</Label>
                      <Select
                        value={String(currentReview.assignedMonth)}
                        onValueChange={(v) => updItem(currentReview.id, { assignedMonth: parseInt(v) })}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid="select-review-month">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.slice(1).map((m, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Year</Label>
                      <Select
                        value={String(currentReview.assignedYear)}
                        onValueChange={(v) => updItem(currentReview.id, { assignedYear: parseInt(v) })}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid="select-review-year">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="text-sm font-bold text-foreground">Batch Summary</div>
                <div className="text-xs text-muted-foreground">
                  {groupSummaries.length} timesheet{groupSummaries.length !== 1 ? "s" : ""} · {batchTotalHours}h total
                  {reviewIdx < reviewItems.length - 1 && ` · reviewing ${reviewIdx + 1}/${reviewItems.length}`}
                </div>

                {!allAssigned && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                    <Users className="w-3.5 h-3.5 flex-shrink-0" />
                    Assign an employee to each file first
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!canSubmit || submitting}
                  onClick={handleSubmit}
                  data-testid="button-submit-batch"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : (
                    <>Submit {groupSummaries.length} timesheet{groupSummaries.length !== 1 ? "s" : ""}</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex gap-1.5 justify-center">
          {reviewItems.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setReviewIdx(idx)}
              className={`w-2 h-2 rounded-full transition-all ${idx === reviewIdx ? "bg-primary scale-125" : "bg-border hover:bg-muted-foreground/50"}`}
              data-testid={`button-review-dot-${idx}`}
            />
          ))}
        </div>
      </div>
      {overwriteDialog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {anyScanning && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
          <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
          <span className="text-sm font-medium text-violet-700 dark:text-violet-400">
            Scanning {queue.filter((i) => i.status === "scanning").length} file{queue.filter((i) => i.status === "scanning").length !== 1 ? "s" : ""}...
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-2">
          {queue.map((item, idx) => (
            <FileQueueCard
              key={item.id}
              item={item}
              idx={idx}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onExclude={() => updItem(item.id, { excluded: !item.excluded })}
              onRemove={() => setQueue((q) => q.filter((i) => i.id !== item.id))}
              onAssignEmployee={(empId) => updItem(item.id, { assignedEmployeeId: empId })}
              onAssignMonth={(m) => updItem(item.id, { assignedMonth: m })}
              onAssignYear={(y) => updItem(item.id, { assignedYear: y })}
              employees={activeEmployees}
            />
          ))}

          <DropZone
            dragOver={dragOver}
            setDragOver={setDragOver}
            onDrop={handleDrop}
            fileRef={fileRef}
            addFiles={addFiles}
            large={false}
          />
        </div>

        <div className="sticky top-6 space-y-3 z-10">
          <Card>
            <CardContent className="p-0">
              <div className="p-3.5 border-b border-border bg-muted/50">
                <div className="text-sm font-bold text-foreground">Batch Summary</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {doneActive.length} file{doneActive.length !== 1 ? "s" : ""} · {groupSummaries.length} timesheet{groupSummaries.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {groupSummaries.length > 0 && (
                  <div className="space-y-2">
                    {groupSummaries.map((g) => (
                      <div key={`${g.empId}-${g.month}-${g.year}`} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate max-w-[160px]">
                            {g.emp ? `${g.emp.firstName} ${g.emp.lastName}` : "Unassigned"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {MONTHS[g.month]?.slice(0, 3)} {g.year} · {g.items.length} file{g.items.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold text-primary flex-shrink-0">{g.totalHours}h</span>
                      </div>
                    ))}
                  </div>
                )}

                {batchTotalHours > 0 && (
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-foreground">Total</span>
                      <span className="font-mono font-bold text-foreground">{batchTotalHours}h</span>
                    </div>
                  </div>
                )}

                {!allAssigned && doneActive.length > 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                    <Users className="w-3.5 h-3.5 flex-shrink-0" />
                    Assign an employee to each file before submitting
                  </div>
                )}

                {doneActive.length > 0 && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => { setReviewMode(true); setReviewIdx(0); }}
                    data-testid="button-review-confirm"
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    Review & Confirm
                  </Button>
                )}

                <div>
                  <button
                    onClick={() => setShowIntake(!showIntake)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-2"
                    data-testid="button-toggle-intake"
                  >
                    {showIntake ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Intake details (optional)
                  </button>
                  {showIntake && (
                    <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Source</Label>
                        <Select value={intakeSource} onValueChange={setIntakeSource}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-intake-source">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INTAKE_SOURCES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Sender email</Label>
                        <Input className="h-7 text-xs" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="employee@email.com" data-testid="input-sender-email" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Received</Label>
                        <Input type="date" className="h-7 text-xs" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} data-testid="input-received-date" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Notes</Label>
                        <Input className="h-7 text-xs" value={intakeNotes} onChange={(e) => setIntakeNotes(e.target.value)} placeholder="Optional..." data-testid="input-intake-notes" />
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  disabled={!canSubmit || submitting}
                  onClick={handleSubmit}
                  data-testid="button-submit-batch"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : (
                    <>Submit {groupSummaries.length} timesheet{groupSummaries.length !== 1 ? "s" : ""}</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {overwriteDialog}
    </div>
  );
}

function DropZone({
  dragOver, setDragOver, onDrop, fileRef, addFiles, large,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  addFiles: (files: FileList | null) => void;
  large: boolean;
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileRef.current?.click()}
      className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40"
      } ${large ? "py-16 px-8" : "py-4 px-5"}`}
      data-testid="dropzone"
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
        data-testid="input-file-drop"
      />

      {large ? (
        <>
          <UploadCloud className={`w-12 h-12 mx-auto mb-4 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
          <div className="text-lg font-semibold text-foreground mb-1">Drop PDF timesheets here</div>
          <div className="text-sm text-muted-foreground mb-5">
            Multiple files, different employees and months — we'll sort it out
          </div>
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} data-testid="button-browse-files">
            Browse files
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-3 justify-center">
          <FilePlus className={`w-5 h-5 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
          <div className="text-left">
            <div className="text-sm font-semibold text-muted-foreground">Add more PDFs</div>
            <div className="text-xs text-muted-foreground/70">Drop or click to browse</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPdfPanel({ item }: { item: QueueItem }) {
  const blobUrl = useBase64BlobUrl(item.fileBase64);
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate" data-testid="text-review-filename">{item.file.name}</span>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">{(item.file.size / 1024).toFixed(0)} KB</span>
      </div>
      <div className="flex-1 min-h-0 bg-muted">
        {blobUrl ? (
          <iframe
            src={blobUrl}
            className="w-full h-full"
            title={item.file.name}
            data-testid="iframe-review-pdf"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {item.fileBase64 ? "Loading PDF..." : "PDF preview not available"}
          </div>
        )}
      </div>
    </Card>
  );
}

function useBase64BlobUrl(base64Data: string | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!base64Data) {
      setBlobUrl(null);
      return;
    }
    try {
      let raw = base64Data;
      if (raw.startsWith("data:")) {
        raw = raw.split(",")[1];
      }
      const bytes = atob(raw);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setBlobUrl(null);
    }
  }, [base64Data]);

  return blobUrl;
}

function PdfViewerDialog({
  open,
  onOpenChange,
  pdfData,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pdfData: string | null;
  title: string;
}) {
  const blobUrl = useBase64BlobUrl(open ? pdfData : null);
  if (!pdfData) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {title}
          </DialogTitle>
          <DialogDescription>Review the uploaded timesheet PDF</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border bg-muted">
          {blobUrl ? (
            <iframe
              src={blobUrl}
              className="w-full h-full"
              title={title}
              data-testid="iframe-pdf-viewer"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading PDF...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileQueueCard({
  item, idx, expanded, onToggleExpand, onExclude, onRemove,
  onAssignEmployee, onAssignMonth, onAssignYear, employees,
}: {
  item: QueueItem;
  idx: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onExclude: () => void;
  onRemove: () => void;
  onAssignEmployee: (id: string) => void;
  onAssignMonth: (m: number) => void;
  onAssignYear: (y: number) => void;
  employees: Employee[];
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const r = item.result;
  const assignedEmp = employees.find((e) => e.id === item.assignedEmployeeId);
  const confColor = !r ? "text-muted-foreground" : r.confidence >= 90 ? "text-green-600" : r.confidence >= 70 ? "text-amber-600" : "text-red-600";

  return (
    <>
      <PdfViewerDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        pdfData={item.fileBase64}
        title={item.file.name}
      />
      <Card
        className={`transition-all ${item.excluded ? "opacity-45" : ""}`}
        data-testid={`card-queue-${item.id}`}
      >
        <CardContent className="p-0">
          <div className="p-3 flex items-start gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
              item.status === "scanning"
                ? "bg-violet-50 dark:bg-violet-900/30 text-violet-600 border border-violet-200 dark:border-violet-800"
                : item.status === "done"
                  ? "bg-green-50 dark:bg-green-900/30 text-green-600 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-900/30 text-red-600 border border-red-200 dark:border-red-800"
            }`}>
              {item.status === "scanning" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : item.excluded ? "-" : idx + 1}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className={`text-sm font-semibold truncate ${item.excluded ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.file.name}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.fileBase64 && !item.excluded && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewOpen(true)} data-testid={`button-preview-${item.id}`}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {r && !item.excluded && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onToggleExpand} data-testid={`button-expand-${item.id}`}>
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={onRemove} data-testid={`button-remove-${item.id}`}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                <span>{(item.file.size / 1024).toFixed(0)} KB</span>
                {item.status === "scanning" && <span className="text-violet-600 dark:text-violet-400 font-semibold"> · Scanning...</span>}
                {r && !item.excluded && (
                  <>
                    <span> · </span>
                    <span className="font-semibold text-foreground">{r.totalHours}h</span>
                    <span> · {r.period}</span>
                    <span className={confColor}> · {r.confidence}%</span>
                  </>
                )}
                {item.status === "error" && <span className="text-red-600"> · Scan failed</span>}
              </div>

              {r && !item.excluded && item.status === "done" && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Select
                    value={item.assignedEmployeeId || ""}
                    onValueChange={(v) => onAssignEmployee(v)}
                  >
                    <SelectTrigger className={`h-7 text-xs w-[160px] ${!item.assignedEmployeeId ? "border-amber-300 dark:border-amber-700" : ""}`} data-testid={`select-employee-${item.id}`}>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={String(item.assignedMonth)}
                    onValueChange={(v) => onAssignMonth(parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs w-[100px]" data-testid={`select-month-${item.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.slice(1).map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m.slice(0, 3)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={String(item.assignedYear)}
                    onValueChange={(v) => onAssignYear(parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs w-[80px]" data-testid={`select-year-${item.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {item.excluded ? (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs border-green-200 text-green-700 dark:border-green-800 dark:text-green-400" onClick={onExclude} data-testid={`button-exclude-${item.id}`}>
                      Include
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={onExclude} data-testid={`button-exclude-${item.id}`}>
                      Skip
                    </Button>
                  )}
                </div>
              )}

              {r && !item.excluded && r.warnings.length > 0 && !expanded && (
                <div className="mt-1.5">
                  {r.warnings.slice(0, 1).map((w, i) => (
                    <div key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {item.status === "scanning" && (
            <div className="h-0.5 overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-violet-300 via-violet-500 to-violet-300 animate-pulse" />
            </div>
          )}

          {expanded && r && !item.excluded && (
            <div className="p-3 border-t border-border bg-muted/30 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Total", `${r.totalHours}h`, "text-primary"],
                  ["Regular", `${r.regularHours}h`, "text-green-600"],
                  ["Overtime", `${r.overtimeHours}h`, r.overtimeHours > 8 ? "text-red-600" : "text-amber-600"],
                ].map(([label, val, color]) => (
                  <div key={label} className="p-2 rounded-lg bg-card border border-border text-center">
                    <div className={`font-mono text-base font-semibold ${color}`}>{val}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-0">
                {[
                  ["Period", r.period],
                  ["Format", r.format],
                  ["Confidence", `${r.confidence}%`],
                  ...(r.employeeName ? [["Employee Detected", r.employeeName]] : []),
                  ...(r.clientName ? [["Client", r.clientName]] : []),
                  ["Signature", r.signatureDetected ? "Detected" : "Not detected"],
                  ...(r.notes ? [["Notes", r.notes]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1.5 border-b border-border last:border-0">
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className={`text-xs font-medium text-foreground text-right max-w-[220px] ${k === "Confidence" ? confColor : k === "Signature" && r.signatureDetected ? "text-green-600" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>

              {r.weeks.length > 0 && (
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Weekly breakdown</Label>
                  {r.weeks.map((w, i) => {
                    const maxH = Math.max(...r.weeks.map((x) => x.h));
                    const pct = (w.h / maxH) * 100;
                    return (
                      <div key={i} className="mb-2">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs text-muted-foreground">{w.wk}</span>
                          <span className={`font-mono text-xs ${w.h > 44 ? "text-red-600" : w.h > 40 ? "text-amber-600" : "text-green-600"}`}>{w.h}h</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })}
                </div>
              )}

              {r.warnings.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  {r.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SubmissionsView() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: timesheetsList, isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const employeeMap = new Map(employees?.map((c) => [c.id, c]) || []);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/timesheets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDialogOpen(false);
      toast({ title: "Timesheet created", description: "New timesheet entry has been added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Timesheet updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/timesheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Timesheet deleted", description: "Draft timesheet has been removed." });
      setDeleteConfirmId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeleteConfirmId(null);
    },
  });

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const raw: Record<string, any> = {};
    formData.forEach((v, k) => { if (v) raw[k] = v as string; });

    const notesObj: Record<string, string> = {};
    if (raw.intakeSource) notesObj.intakeSource = raw.intakeSource;

    const payload: Record<string, any> = {
      employeeId: raw.employeeId,
      year: parseInt(raw.year),
      month: parseInt(raw.month),
      totalHours: raw.totalHours || "0",
      regularHours: raw.regularHours || "0",
      overtimeHours: raw.overtimeHours || "0",
      grossValue: raw.grossValue || "0",
      status: "DRAFT",
      notes: Object.keys(notesObj).length > 0 ? JSON.stringify(notesObj) : null,
    };

    if (selectedFile) {
      payload.fileName = selectedFile.name;
      payload.fileData = await readFileAsBase64(selectedFile);
      payload.fileType = selectedFile.type;
    }

    createMutation.mutate(payload);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  function getIntakeSource(notes: string | null): string | null {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
      return parsed.intakeSource || null;
    } catch {
      return null;
    }
  }

  const filtered = timesheetsList?.filter((ts) => {
    const c = employeeMap.get(ts.employeeId);
    const name = c ? `${c.firstName} ${c.lastName}` : "";
    return `${name} ${MONTHS[ts.month]} ${ts.year}`.toLowerCase().includes(search.toLowerCase());
  });

  const grouped = {
    pending: filtered?.filter((t) => t.status === "SUBMITTED") || [],
    approved: filtered?.filter((t) => t.status === "APPROVED") || [],
    drafts: filtered?.filter((t) => t.status === "DRAFT") || [],
    rejected: filtered?.filter((t) => t.status === "REJECTED") || [],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search timesheets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-timesheets"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-timesheet">
              <Plus className="w-4 h-4" />
              Manual Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Timesheet Entry</DialogTitle>
              <DialogDescription>Create a timesheet manually for an employee</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <Select name="employeeId" required>
                  <SelectTrigger data-testid="select-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" name="year" type="number" defaultValue={new Date().getFullYear()} required data-testid="input-year" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="month">Month</Label>
                  <Select name="month" defaultValue={String(new Date().getMonth() + 1)}>
                    <SelectTrigger data-testid="select-month">
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
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="totalHours">Total Hours</Label>
                  <Input id="totalHours" name="totalHours" type="number" step="0.5" required data-testid="input-total-hours" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="regularHours">Regular</Label>
                  <Input id="regularHours" name="regularHours" type="number" step="0.5" defaultValue="0" data-testid="input-regular-hours" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="overtimeHours">Overtime</Label>
                  <Input id="overtimeHours" name="overtimeHours" type="number" step="0.5" defaultValue="0" data-testid="input-overtime-hours" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grossValue">Gross Value ($)</Label>
                <Input id="grossValue" name="grossValue" type="number" step="0.01" required data-testid="input-gross-value" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Intake Source</Label>
                  <Select name="intakeSource" defaultValue="ADMIN_ENTRY">
                    <SelectTrigger data-testid="select-intake-source-manual">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTAKE_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Attach File</Label>
                  <div className="relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      data-testid="input-file-upload"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-choose-file"
                    >
                      <Upload className="w-4 h-4 mr-2 flex-shrink-0" />
                      <span className="truncate text-sm">
                        {selectedFile ? selectedFile.name : "Choose file..."}
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
              {selectedFile && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate flex-1 text-foreground font-medium" data-testid="text-selected-file">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{(selectedFile.size / 1024).toFixed(0)} KB</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    data-testid="button-remove-file"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-timesheet">
                {createMutation.isPending ? "Creating..." : "Create Timesheet"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList data-testid="tabs-timesheet-status">
            <TabsTrigger value="pending" className="gap-1.5" data-testid="tab-pending">
              <AlertTriangle className="w-3.5 h-3.5" />
              Pending ({grouped.pending.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-1.5" data-testid="tab-approved">
              <CheckCircle className="w-3.5 h-3.5" />
              Approved ({grouped.approved.length})
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-1.5" data-testid="tab-drafts">
              <FileText className="w-3.5 h-3.5" />
              Drafts ({grouped.drafts.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-1.5" data-testid="tab-rejected">
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
                  {items.map((ts) => {
                    const c = employeeMap.get(ts.employeeId);
                    const intakeSource = getIntakeSource(ts.notes);
                    return (
                      <TimesheetRow
                        key={ts.id}
                        timesheet={ts}
                        employee={c}
                        intakeSource={intakeSource}
                        onApprove={() => updateMutation.mutate({ id: ts.id, data: { status: "APPROVED", reviewedAt: new Date().toISOString() } })}
                        onReject={() => updateMutation.mutate({ id: ts.id, data: { status: "REJECTED", reviewedAt: new Date().toISOString() } })}
                        onSubmit={() => updateMutation.mutate({ id: ts.id, data: { status: "SUBMITTED", submittedAt: new Date().toISOString() } })}
                        onDelete={() => setDeleteConfirmId(ts.id)}
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Timesheet</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this timesheet? This action cannot be undone. Any attached documents will also be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AuditLogEntry {
  id: string;
  timesheetId: string;
  employeeId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changeSource: string;
  changedBy: string | null;
  notes: string | null;
  createdAt: string;
}

function TimesheetRow({
  timesheet: ts,
  employee: c,
  intakeSource,
  onApprove,
  onReject,
  onSubmit,
  onDelete,
}: {
  timesheet: Timesheet;
  employee: Employee | undefined;
  intakeSource: string | null;
  onApprove: () => void;
  onReject: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [docs, setDocs] = useState<DocType[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocIdx, setSelectedDocIdx] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const overtimeHours = parseFloat(ts.overtimeHours || "0");
  const intakeLabel = intakeSource ? INTAKE_SOURCES.find((s) => s.value === intakeSource)?.label : null;
  const intakeBadgeClass = intakeSource ? INTAKE_BADGE_STYLES[intakeSource] || "" : "";

  const handleViewPdf = async () => {
    setDocs([]);
    setSelectedDocIdx(0);
    setLoadingDocs(true);
    setViewerOpen(true);
    try {
      const res = await fetch(`/api/timesheets/${ts.id}/documents`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      }
    } catch {}
    setLoadingDocs(false);
  };

  const selectedDoc = docs[selectedDocIdx];

  return (
    <>
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {ts.fileName || "Timesheet Document"}
            </DialogTitle>
            <DialogDescription>
              {c ? `${c.firstName} ${c.lastName}` : "Unknown"} · {MONTHS[ts.month]} {ts.year} · {ts.totalHours}h
            </DialogDescription>
          </DialogHeader>
          {docs.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {docs.map((d, idx) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDocIdx(idx)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    selectedDocIdx === idx
                      ? "border-primary bg-primary/5 font-semibold text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  }`}
                  data-testid={`button-doc-tab-${idx}`}
                >
                  <FileText className="w-3 h-3 inline mr-1" />
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border bg-muted">
            {docs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {loadingDocs ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</>
                ) : (
                  "No PDF documents attached to this timesheet"
                )}
              </div>
            ) : selectedDoc?.fileUrl ? (
              <iframe
                src={selectedDoc.fileUrl.startsWith("data:") ? selectedDoc.fileUrl : `data:application/pdf;base64,${selectedDoc.fileUrl}`}
                className="w-full h-full"
                title={selectedDoc.name}
                data-testid="iframe-pdf-viewer"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                File data not available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="hover-elevate" data-testid={`card-timesheet-${ts.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {c && (
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center font-semibold text-xs flex-shrink-0"
                  style={{ backgroundColor: `${c.accentColour || "#2563eb"}15`, color: c.accentColour || "#2563eb" }}
                >
                  {c.firstName[0]}{c.lastName[0]}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground" data-testid={`text-timesheet-name-${ts.id}`}>
                    {c ? `${c.firstName} ${c.lastName}` : "Unknown"}
                  </span>
                  <StatusBadge status={ts.status} />
                  {intakeLabel && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${intakeBadgeClass}`} data-testid={`badge-intake-${ts.id}`}>
                      {intakeLabel}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span>{MONTHS[ts.month]} {ts.year}</span>
                  {ts.fileName && (
                    <>
                      <span>·</span>
                      <Paperclip className="w-3 h-3 inline" />
                      <span data-testid={`text-timesheet-file-${ts.id}`}>{ts.fileName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-right">
                <div className="text-sm font-mono font-medium text-foreground" data-testid={`text-timesheet-hours-${ts.id}`}>
                  {ts.totalHours}h
                </div>
                {overtimeHours > 0 && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400">+{ts.overtimeHours}h OT</div>
                )}
              </div>
              <div className="text-right min-w-[90px]">
                <div className="text-sm font-mono font-semibold text-foreground" data-testid={`text-timesheet-value-${ts.id}`}>
                  ${parseFloat(ts.grossValue || "0").toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleViewPdf}
                  disabled={loadingDocs}
                  data-testid={`button-view-pdf-${ts.id}`}
                >
                  {loadingDocs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="ml-1">View</span>
                </Button>
                {ts.status !== "APPROVED" && (
                  <Button size="sm" onClick={onApprove} data-testid={`button-approve-${ts.id}`}>
                    {ts.status === "SUBMITTED" ? "Approve" : "Force Approve"}
                  </Button>
                )}
                {ts.status !== "REJECTED" && ts.status !== "DRAFT" && (
                  <Button size="sm" variant="secondary" onClick={onReject} data-testid={`button-reject-${ts.id}`}>
                    {ts.status === "SUBMITTED" ? "Reject" : "Force Reject"}
                  </Button>
                )}
                {ts.status !== "SUBMITTED" && (
                  <Button size="sm" variant={ts.status === "DRAFT" ? "default" : "outline"} onClick={onSubmit} data-testid={`button-submit-${ts.id}`}>
                    {ts.status === "DRAFT" ? "Submit" : "Re-submit"}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onDelete}
                    data-testid={`button-delete-${ts.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={async () => {
                    if (!showHistory && auditLogs.length === 0) {
                      setLoadingHistory(true);
                      try {
                        const res = await fetch(`/api/timesheets/${ts.id}/history`, { credentials: "include" });
                        if (res.ok) setAuditLogs(await res.json());
                      } catch {}
                      setLoadingHistory(false);
                    }
                    setShowHistory(!showHistory);
                  }}
                  data-testid={`button-history-${ts.id}`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span className="ml-1 text-xs">History</span>
                  {showHistory ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                </Button>
              </div>
            </div>
          </div>
          {showHistory && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Change History
              </div>
              {loadingHistory ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2" data-testid={`text-no-history-${ts.id}`}>
                  No changes recorded yet.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto" data-testid={`list-history-${ts.id}`}>
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-muted/40" data-testid={`audit-log-${log.id}`}>
                      <div className="shrink-0 mt-0.5">
                        {log.field === "created" ? (
                          <Plus className="w-3 h-3 text-green-600" />
                        ) : log.field === "status" ? (
                          <ArrowRight className="w-3 h-3 text-blue-600" />
                        ) : (
                          <Info className="w-3 h-3 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold capitalize">{log.field === "created" ? "Created" : log.field.replace(/([A-Z])/g, " $1").trim()}</span>
                          {log.field !== "created" && (
                            <>
                              <span className="text-muted-foreground">
                                {log.oldValue} → {log.newValue}
                              </span>
                            </>
                          )}
                          {log.field === "created" && (
                            <span className="text-muted-foreground">{log.newValue}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                            {log.changeSource.replace(/_/g, " ")}
                          </Badge>
                          {log.changedBy && <span>by {log.changedBy}</span>}
                          <span>·</span>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                          {log.notes && <><span>·</span><span>{log.notes}</span></>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

interface PlacementData {
  id: string;
  employeeId: string;
  clientId: string | null;
  clientName: string | null;
  chargeOutRate: string | null;
  payRate: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

function getActiveRate(placement: PlacementData | null, emp: Employee): { rate: number; source: "placement" | "employee" | "none" } {
  if (placement?.payRate) {
    const r = parseFloat(placement.payRate);
    if (r > 0) return { rate: r, source: "placement" };
  }
  if (emp.hourlyRate) {
    const r = parseFloat(emp.hourlyRate);
    if (r > 0) return { rate: r, source: "employee" };
  }
  return { rate: 0, source: "none" };
}

function MonthlyHoursView() {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [editing, setEditing] = useState<Record<string, { totalHours: string; regularHours: string; overtimeHours: string }>>({});
  const [docViewerOpen, setDocViewerOpen] = useState(false);
  const [docViewerData, setDocViewerData] = useState<string | null>(null);
  const [docViewerTitle, setDocViewerTitle] = useState("");

  const { data: employees } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: timesheets, isLoading } = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"] });
  const { data: placements } = useQuery<PlacementData[]>({ queryKey: ["/api/placements"] });
  const { data: expectedHoursData } = useQuery<{ id: string; employeeId: string; month: number; year: number; expectedDays: string | null; expectedHours: string }[]>({
    queryKey: ["/api/expected-hours", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/expected-hours?month=${month}&year=${year}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const [editingExpected, setEditingExpected] = useState<Record<string, string>>({});

  const activeEmployees = employees?.filter(e => e.status === "ACTIVE") || [];

  const monthTimesheets = useMemo(() => {
    return (timesheets || []).filter(t => t.month === month && t.year === year);
  }, [timesheets, month, year]);

  const timesheetIds = useMemo(() => monthTimesheets.map(t => t.id), [monthTimesheets]);

  const { data: allDocsForMonth } = useQuery<Record<string, DocType[]>>({
    queryKey: ["/api/timesheets/documents-batch", month, year],
    queryFn: async () => {
      if (timesheetIds.length === 0) return {};
      const results: Record<string, DocType[]> = {};
      await Promise.all(
        timesheetIds.map(async (tsId) => {
          try {
            const res = await fetch(`/api/timesheets/${tsId}/documents`, { credentials: "include" });
            if (res.ok) {
              const docs = await res.json();
              if (docs.length > 0) results[tsId] = docs;
            }
          } catch {}
        })
      );
      return results;
    },
    enabled: timesheetIds.length > 0,
  });

  const statusChangeMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, { status, changeSource: "STATUS_CHANGE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openDocument = (doc: DocType) => {
    setDocViewerData(doc.fileUrl);
    setDocViewerTitle(doc.name);
    setDocViewerOpen(true);
  };

  const getExpectedHours = (empId: string): string | null => {
    const entry = (expectedHoursData || []).find(e => e.employeeId === empId);
    return entry?.expectedHours || null;
  };

  const expectedHoursMutation = useMutation({
    mutationFn: async (data: { employeeId: string; month: number; year: number; expectedHours: string; expectedDays?: string }) => {
      const res = await apiRequest("POST", "/api/expected-hours", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expected-hours", month, year] });
      toast({ title: "Expected hours saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);

  const placementRows = useMemo(() => {
    const rows: { employee: Employee; placement: PlacementData | null; clientName: string; rowKey: string }[] = [];

    for (const emp of activeEmployees) {
      const empPlacements = (placements || []).filter(p => {
        if (p.employeeId !== emp.id) return false;
        if (p.status !== "ACTIVE" && p.status !== "ENDED") return false;
        if (p.startDate && new Date(p.startDate) > periodEnd) return false;
        if (p.endDate && new Date(p.endDate) < periodStart) return false;
        return true;
      });

      if (empPlacements.length > 0) {
        for (const p of empPlacements) {
          rows.push({
            employee: emp,
            placement: p,
            clientName: p.clientName || "Unknown",
            rowKey: `${emp.id}__${p.id}`,
          });
        }
      } else {
        rows.push({
          employee: emp,
          placement: null,
          clientName: "",
          rowKey: emp.id,
        });
      }
    }

    rows.sort((a, b) => {
      const nameA = `${a.employee.firstName} ${a.employee.lastName}`;
      const nameB = `${b.employee.firstName} ${b.employee.lastName}`;
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.clientName.localeCompare(b.clientName);
    });

    return rows;
  }, [activeEmployees, placements, month, year]);

  const getTimesheet = (empId: string, placementId: string | null, hasOtherPlacementRows: boolean) => {
    if (!timesheets) return null;
    if (placementId) {
      const byPlacement = timesheets.find(t =>
        t.employeeId === empId && (t as any).placementId === placementId && t.month === month && t.year === year
      );
      if (byPlacement) return byPlacement;
      if (!hasOtherPlacementRows) {
        const byEmployee = timesheets.find(t =>
          t.employeeId === empId && !(t as any).placementId && t.month === month && t.year === year
        );
        if (byEmployee) return byEmployee;
      }
      return null;
    }
    const byEmployee = timesheets.find(t =>
      t.employeeId === empId && !(t as any).placementId && t.month === month && t.year === year
    );
    return byEmployee || null;
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, rowKey, data }: { id: string; rowKey: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setEditing(prev => { const next = { ...prev }; delete next[vars.rowKey]; return next; });
      toast({ title: "Timesheet updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any> & { employeeId: string; rowKey: string }) => {
      const { rowKey, ...payload } = data;
      const res = await apiRequest("POST", "/api/timesheets", payload);
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setEditing(prev => { const next = { ...prev }; delete next[vars.rowKey]; return next; });
      toast({ title: "Timesheet created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (rowKey: string, ts: Timesheet | null) => {
    setEditing(prev => ({
      ...prev,
      [rowKey]: {
        totalHours: ts?.totalHours || "0",
        regularHours: ts?.regularHours || "0",
        overtimeHours: ts?.overtimeHours || "0",
      },
    }));
  };

  const cancelEdit = (rowKey: string) => {
    setEditing(prev => { const next = { ...prev }; delete next[rowKey]; return next; });
  };

  const saveEdit = (rowKey: string, emp: Employee, placement: PlacementData | null, ts: Timesheet | null) => {
    const edit = editing[rowKey];
    if (!edit) return;

    const total = parseFloat(edit.totalHours) || 0;
    const regular = parseFloat(edit.regularHours) || 0;
    const overtime = parseFloat(edit.overtimeHours) || 0;
    const { rate } = getActiveRate(placement, emp);

    if (ts) {
      updateMutation.mutate({
        id: ts.id,
        rowKey,
        data: {
          totalHours: String(total),
          regularHours: String(regular),
          overtimeHours: String(overtime),
          grossValue: String(total * rate),
          ...(placement && { clientId: placement.clientId, placementId: placement.id }),
        },
      });
    } else {
      createMutation.mutate({
        rowKey,
        employeeId: emp.id,
        ...(placement && { clientId: placement.clientId, placementId: placement.id }),
        month,
        year,
        totalHours: String(total),
        regularHours: String(regular),
        overtimeHours: String(overtime),
        grossValue: String(total * rate),
        status: "DRAFT",
        notes: JSON.stringify({ intakeSource: "ADMIN_ENTRY" }),
      });
    }
  };

  const updateEditField = (rowKey: string, field: string, value: string) => {
    setEditing(prev => {
      const current = prev[rowKey];
      if (!current) return prev;
      const updated = { ...current, [field]: value };
      if (field === "regularHours" || field === "overtimeHours") {
        const reg = parseFloat(updated.regularHours) || 0;
        const ot = parseFloat(updated.overtimeHours) || 0;
        updated.totalHours = String(reg + ot);
      }
      return { ...prev, [rowKey]: updated };
    });
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  return (
    <div className="space-y-4">
      <PdfViewerDialog
        open={docViewerOpen}
        onOpenChange={setDocViewerOpen}
        pdfData={docViewerData}
        title={docViewerTitle}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth} data-testid="button-monthly-prev">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
          <SelectTrigger className="h-8 w-[130px] text-sm font-semibold" data-testid="select-monthly-month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.slice(1).map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="h-8 w-[80px] text-sm font-semibold" data-testid="select-monthly-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth} data-testid="button-monthly-next">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-monthly-hours">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2.5 font-medium">Employee</th>
                    <th className="text-left px-4 py-2.5 font-medium">Client</th>
                    <th className="text-right px-4 py-2.5 font-medium w-20">Expected</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Regular</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Overtime</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Total</th>
                    <th className="text-center px-4 py-2.5 font-medium w-24">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {placementRows.map(({ employee, placement, clientName, rowKey }) => {
                    const empPlacementCount = placementRows.filter(r => r.employee.id === employee.id && r.placement !== null).length;
                    const hasOtherPlacementRows = empPlacementCount > 1;
                    const timesheet = getTimesheet(employee.id, placement?.id || null, hasOtherPlacementRows);
                    const isRowEditing = !!editing[rowKey];
                    const edit = editing[rowKey];

                    return (
                      <tr key={rowKey} className="border-b last:border-0" data-testid={`row-monthly-${rowKey}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{employee.firstName} {employee.lastName}</span>
                          {(() => {
                            const { rate, source } = getActiveRate(placement, employee);
                            if (source === "none") {
                              return (
                                <span className="inline-flex items-center gap-0.5 ml-2" data-testid={`rate-warning-${rowKey}`}>
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                  <span className="text-xs text-amber-500">No rate</span>
                                </span>
                              );
                            }
                            return (
                              <span className="text-xs text-muted-foreground ml-2" data-testid={`rate-display-${rowKey}`}>
                                ${rate.toFixed(0)}/hr
                                {source === "placement" && (
                                  <span className="text-[10px] ml-0.5 opacity-60">(placement)</span>
                                )}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm" data-testid={`text-client-${rowKey}`}>
                          {clientName || <span className="text-xs italic">No placement</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {editingExpected[employee.id] !== undefined ? (
                            <Input
                              type="number"
                              step="0.5"
                              className="h-7 w-16 text-right font-mono text-xs ml-auto"
                              value={editingExpected[employee.id]}
                              autoFocus
                              onChange={(e) => setEditingExpected(prev => ({ ...prev, [employee.id]: e.target.value }))}
                              onBlur={() => {
                                const val = editingExpected[employee.id];
                                if (val && parseFloat(val) > 0) {
                                  expectedHoursMutation.mutate({ employeeId: employee.id, month, year, expectedHours: val });
                                }
                                setEditingExpected(prev => { const n = { ...prev }; delete n[employee.id]; return n; });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingExpected(prev => { const n = { ...prev }; delete n[employee.id]; return n; });
                              }}
                              data-testid={`input-expected-${rowKey}`}
                            />
                          ) : (
                            <span
                              className="font-mono tabular-nums text-xs cursor-pointer hover:bg-muted/50 px-1.5 py-0.5 rounded"
                              onClick={() => setEditingExpected(prev => ({ ...prev, [employee.id]: getExpectedHours(employee.id) || "" }))}
                              data-testid={`text-expected-${rowKey}`}
                            >
                              {getExpectedHours(employee.id) ? parseFloat(getExpectedHours(employee.id)!).toFixed(1) : <span className="text-muted-foreground/50">—</span>}
                            </span>
                          )}
                        </td>
                        {isRowEditing ? (
                          <>
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.5"
                                className="h-8 w-20 text-right font-mono ml-auto"
                                value={edit.regularHours}
                                onChange={(e) => updateEditField(rowKey, "regularHours", e.target.value)}
                                data-testid={`input-regular-${rowKey}`}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.5"
                                className="h-8 w-20 text-right font-mono ml-auto"
                                value={edit.overtimeHours}
                                onChange={(e) => updateEditField(rowKey, "overtimeHours", e.target.value)}
                                data-testid={`input-overtime-${rowKey}`}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                step="0.5"
                                className="h-8 w-20 text-right font-mono ml-auto"
                                value={edit.totalHours}
                                onChange={(e) => updateEditField(rowKey, "totalHours", e.target.value)}
                                data-testid={`input-total-${rowKey}`}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{timesheet?.regularHours || "—"}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{timesheet?.overtimeHours || "—"}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">{timesheet?.totalHours || "—"}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center">
                          {timesheet ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 cursor-pointer"
                                  data-testid={`dropdown-status-${rowKey}`}
                                >
                                  <Badge variant={timesheet.status === "APPROVED" ? "default" : timesheet.status === "REJECTED" ? "destructive" : "secondary"} className="text-[10px]">
                                    {timesheet.status}
                                  </Badge>
                                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center">
                                {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]
                                  .filter(s => s !== timesheet.status)
                                  .map(s => (
                                    <DropdownMenuItem
                                      key={s}
                                      onClick={() => statusChangeMutation.mutate({ id: timesheet.id, status: s })}
                                      data-testid={`menu-status-${s.toLowerCase()}-${rowKey}`}
                                    >
                                      {s === "APPROVED" && <CheckCircle className="w-3.5 h-3.5 mr-2 text-green-600" />}
                                      {s === "REJECTED" && <XCircle className="w-3.5 h-3.5 mr-2 text-red-600" />}
                                      {s === "SUBMITTED" && <ArrowRight className="w-3.5 h-3.5 mr-2 text-blue-600" />}
                                      {s === "DRAFT" && <FileText className="w-3.5 h-3.5 mr-2 text-muted-foreground" />}
                                      {s}
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(() => {
                            const tsDocs = timesheet && allDocsForMonth ? allDocsForMonth[timesheet.id] : null;
                            if (!tsDocs || tsDocs.length === 0) return null;
                            return (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="inline-flex mr-1"
                                onClick={() => openDocument(tsDocs[0])}
                                data-testid={`button-attachment-${rowKey}`}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </Button>
                            );
                          })()}
                          {isRowEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelEdit(rowKey)}
                                data-testid={`button-cancel-${rowKey}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => saveEdit(rowKey, employee, placement, timesheet)}
                                disabled={updateMutation.isPending || createMutation.isPending}
                                data-testid={`button-save-${rowKey}`}
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Save
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(rowKey, timesheet)}
                              data-testid={`button-edit-${rowKey}`}
                            >
                              <FilePlus className="w-3.5 h-3.5" />
                              {timesheet ? "Edit" : "Add"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {placementRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        No active employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
