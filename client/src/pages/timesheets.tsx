import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
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
  Plus, Search, Clock, FileText, CheckCircle, AlertTriangle, XCircle,
  Mail, Upload, UserCheck, Monitor, Paperclip, ChevronDown, ChevronUp,
  X, Eye, Loader2, Info, ArrowRight, UploadCloud, FilePlus, Users,
  ChevronLeft, ChevronRight,
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
            </TabsList>

            <TabsContent value="upload">
              <UploadView />
            </TabsContent>

            <TabsContent value="submissions">
              <SubmissionsView />
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

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const notesObj: Record<string, any> = { intakeSource };
    if (senderEmail) notesObj.senderEmail = senderEmail;
    if (intakeNotes) notesObj.intakeNotes = intakeNotes;
    if (receivedDate) notesObj.receivedDate = receivedDate;
    const notesStr = JSON.stringify(notesObj);

    const items = groupSummaries.map((g) => ({
      employeeId: g.empId,
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

    try {
      const res = await apiRequest("POST", "/api/timesheets/batch", { items });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to submit" }));
        throw new Error(err.message);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setSubmitting(false);
      setSubmitted(true);
      toast({ title: "Timesheets submitted", description: `${groupSummaries.length} timesheet${groupSummaries.length > 1 ? "s" : ""} created for review.` });
    } catch (err: any) {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setQueue([]);
    setSubmitted(false);
    setExpandedId(null);
    setShowIntake(false);
    setReviewMode(false);
    setReviewIdx(0);
  };

  if (submitted) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1" data-testid="text-submit-success">
            {groupSummaries.length > 1
              ? `${groupSummaries.length} timesheets submitted`
              : "Timesheet submitted"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {doneActive.length} file{doneActive.length !== 1 ? "s" : ""} processed
          </p>

          <div className="text-left space-y-3 mb-6">
            {groupSummaries.map((g) => (
              <div key={`${g.empId}-${g.month}-${g.year}`} className="p-3 rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground">
                    {g.emp ? `${g.emp.firstName} ${g.emp.lastName}` : "Unknown"}
                  </span>
                  <span className="font-mono text-sm font-bold text-primary">{g.totalHours}h</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {MONTHS[g.month]} {g.year} · {g.items.length} file{g.items.length !== 1 ? "s" : ""}
                  {g.grossValue > 0 && ` · $${g.grossValue.toLocaleString()}`}
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full" onClick={resetAll} data-testid="button-upload-another">
            Upload another batch
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "65vh" }}>
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

            {reviewIdx === reviewItems.length - 1 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="text-sm font-bold text-foreground">Ready to submit</div>
                  <div className="text-xs text-muted-foreground">
                    {groupSummaries.length} timesheet{groupSummaries.length !== 1 ? "s" : ""} · {batchTotalHours}h total
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
            )}
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
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
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
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function TimesheetRow({
  timesheet: ts,
  employee: c,
  intakeSource,
  onApprove,
  onReject,
  onSubmit,
}: {
  timesheet: Timesheet;
  employee: Employee | undefined;
  intakeSource: string | null;
  onApprove: () => void;
  onReject: () => void;
  onSubmit: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [docs, setDocs] = useState<DocType[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocIdx, setSelectedDocIdx] = useState(0);
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
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
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
                {ts.status === "SUBMITTED" && (
                  <>
                    <Button size="sm" onClick={onApprove} data-testid={`button-approve-${ts.id}`}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={onReject} data-testid={`button-reject-${ts.id}`}>
                      Reject
                    </Button>
                  </>
                )}
                {ts.status === "DRAFT" && (
                  <Button size="sm" onClick={onSubmit} data-testid={`button-submit-${ts.id}`}>
                    Submit
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
