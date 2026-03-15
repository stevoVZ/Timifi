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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  ChevronLeft, ChevronRight, Trash2, LayoutGrid, Lock, AlertCircle, Receipt,
  MoreHorizontal, Link2 as LinkIcon, FileCheck, DollarSign,
  Inbox, FolderOpen, LockOpen, Download, History,
} from "lucide-react";
import type { Timesheet, Employee, Document as DocType } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const INTAKE_SOURCES = [
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "PORTAL_UPLOAD", label: "Portal Upload", icon: Upload },
  { value: "WALK_IN", label: "Walk-in", icon: UserCheck },
  { value: "ADMIN_ENTRY", label: "Admin Entry", icon: Monitor },
];

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  XERO_SYNC:   { label: "Xero",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  PDF_UPLOAD:  { label: "Upload", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  ADMIN_ENTRY: { label: "Manual", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  PORTAL:      { label: "Portal", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  RCTI:        { label: "RCTI",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

interface PlacementAllocation {
  placementId: string;
  hours: number;
}

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
  assignedPlacementId: string | null;
  assignedPlacements: PlacementAllocation[];
}

interface PlacementOption {
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

function getPlacementsForEmployee(placements: PlacementOption[], empId: string, month: number, year: number): PlacementOption[] {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);
  return placements.filter(p => {
    if (p.employeeId !== empId) return false;
    if (p.status !== "ACTIVE" && p.status !== "ENDED") return false;
    if (p.startDate && new Date(p.startDate) > periodEnd) return false;
    if (p.endDate && new Date(p.endDate) < periodStart) return false;
    return true;
  });
}

function PlacementSelect({ placements, value, onChange, testId }: { placements: PlacementOption[]; value: string | null; onChange: (id: string | null) => void; testId?: string }) {
  if (placements.length === 0) return <span className="text-xs text-muted-foreground italic">No placements</span>;
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger className="h-8 text-sm" data-testid={testId}>
        <SelectValue placeholder="Select placement" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No placement</SelectItem>
        {placements.map(p => (
          <SelectItem key={p.id} value={p.id}>
            {p.clientName || "Unknown"} — ${p.chargeOutRate || "?"}/hr
            {p.startDate && p.endDate ? ` (${p.startDate.slice(0, 7)} → ${p.endDate.slice(0, 7)})` : p.startDate ? ` (from ${p.startDate.slice(0, 7)})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ScanResult {
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  fileHash: string;
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
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
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
              <TabsTrigger value="reconciliation" className="gap-1.5" data-testid="tab-reconciliation">
                <LayoutGrid className="w-3.5 h-3.5" />
                Reconciliation
              </TabsTrigger>
              <TabsTrigger value="inbox" className="gap-1.5" data-testid="tab-inbox">
                <Inbox className="w-3.5 h-3.5" />
                Inbox
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5" data-testid="tab-documents">
                <FolderOpen className="w-3.5 h-3.5" />
                Documents
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

            <TabsContent value="reconciliation">
              <ReconciliationView />
            </TabsContent>

            <TabsContent value="inbox">
              <InboxView />
            </TabsContent>

            <TabsContent value="documents">
              <DocumentsView />
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
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const QUEUE_STORAGE_KEY = "simplfi_upload_queue";

  const loadPersistedQueue = (): QueueItem[] => {
    try {
      const raw = sessionStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const items = JSON.parse(raw) as Array<any>;
      return items.map((s: any) => {
        const f = new File([], s._fileName || "restored.pdf", { type: s._fileType || "application/pdf" });
        Object.defineProperty(f, "size", { value: s._fileSize || 0 });
        return { ...s, file: f, assignedPlacements: s.assignedPlacements || [] };
      });
    } catch { return []; }
  };

  const [targetMonth, setTargetMonth] = useState(prevMonth);
  const [targetYear, setTargetYear] = useState(prevMonthYear);
  const [queue, setQueue] = useState<QueueItem[]>(loadPersistedQueue);
  const [dragOver, setDragOver] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmittedCount, setLastSubmittedCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (queue.length === 0) {
      sessionStorage.removeItem(QUEUE_STORAGE_KEY);
      return;
    }
    const toSave = queue.filter((i) => i.status === "done" || i.status === "error").map((i) => ({
      id: i.id,
      _fileName: i.file.name,
      _fileType: i.file.type,
      _fileSize: i.file.size,
      fileBase64: i.fileBase64,
      status: i.status,
      result: i.result,
      excluded: i.excluded,
      assignedEmployeeId: i.assignedEmployeeId,
      assignedMonth: i.assignedMonth,
      assignedYear: i.assignedYear,
      assignedPlacementId: i.assignedPlacementId,
      assignedPlacements: i.assignedPlacements,
    }));
    try { sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(toSave)); } catch {}
  }, [queue]);
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

  const { data: existingTimesheets } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: allPlacements } = useQuery<PlacementOption[]>({
    queryKey: ["/api/placements"],
  });

  const activeEmployees = employees?.filter((c) => c.status === "ACTIVE") || [];

  const getDuplicateWarning = useCallback((item: QueueItem): string | null => {
    if (!item.result) return null;
    const hash = item.result.fileHash;
    if (hash) {
      const queueDup = queue.find(q => q.id !== item.id && !q.excluded && q.result?.fileHash === hash);
      if (queueDup) {
        return `Duplicate in queue — same file content as "${queueDup.file.name}"`;
      }
      if (existingTimesheets) {
        const hashMatch = existingTimesheets.find(ts => ts.fileHash && ts.fileHash === hash);
        if (hashMatch) {
          const emp = activeEmployees.find(e => e.id === hashMatch.employeeId);
          const empName = emp ? `${emp.firstName} ${emp.lastName}` : "unknown employee";
          const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `Exact duplicate — this file was already uploaded for ${empName} (${monthNames[hashMatch.month || 0]} ${hashMatch.year}, ${hashMatch.totalHours}h, ${hashMatch.status})`;
        }
      }
    }
    if (!item.assignedEmployeeId || !existingTimesheets) return null;
    const matching = existingTimesheets.filter(ts =>
      ts.employeeId === item.assignedEmployeeId &&
      ts.month === item.assignedMonth &&
      ts.year === item.assignedYear
    );
    if (matching.length === 0) return null;
    const sizeBytes = item.result.fileSizeBytes;
    if (sizeBytes) {
      const sizeMatch = matching.find(ts => ts.fileSizeBytes && Math.abs(ts.fileSizeBytes - sizeBytes) < 100);
      if (sizeMatch) {
        return `Likely duplicate — same employee/month with near-identical file size (${sizeMatch.totalHours}h, ${sizeMatch.status})`;
      }
    }
    const best = matching[0];
    return `Existing timesheet found for this employee/month (${best.totalHours}h, ${best.status})`;
  }, [existingTimesheets, activeEmployees, queue]);

  const readFileBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const updItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, ...patch };
      const empChanged = "assignedEmployeeId" in patch;
      const periodChanged = "assignedMonth" in patch || "assignedYear" in patch;
      if ((empChanged || periodChanged) && !("assignedPlacementId" in patch) && !("assignedPlacements" in patch) && allPlacements && updated.assignedEmployeeId) {
        const empPlacements = getPlacementsForEmployee(allPlacements, updated.assignedEmployeeId, updated.assignedMonth, updated.assignedYear);
        if (empPlacements.length === 1) {
          updated.assignedPlacementId = empPlacements[0].id;
          updated.assignedPlacements = [{ placementId: empPlacements[0].id, hours: updated.result?.totalHours || 0 }];
        } else if (empPlacements.length > 1) {
          updated.assignedPlacementId = null;
          const splitHours = Math.round(((updated.result?.totalHours || 0) / empPlacements.length) * 100) / 100;
          updated.assignedPlacements = empPlacements.map(p => ({ placementId: p.id, hours: splitHours }));
        } else {
          updated.assignedPlacementId = null;
          updated.assignedPlacements = [];
        }
      }
      if (empChanged && !patch.assignedEmployeeId) {
        updated.assignedPlacementId = null;
        updated.assignedPlacements = [];
      }
      return updated;
    }));
  }, [allPlacements]);

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
        assignedEmployeeId: null, assignedMonth: targetMonth, assignedYear: targetYear,
        assignedPlacementId: null, assignedPlacements: [],
      }]);
    });

    const base64Promises = pdfs.map(async (f, idx) => {
      const b64 = await readFileBase64(f);
      const id = itemIds[idx];
      setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, fileBase64: b64 } : item)));
    });

    const formData = new FormData();
    pdfs.forEach((f) => formData.append("files", f));
    formData.append("month", String(targetMonth));
    formData.append("year", String(targetYear));

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
          const m = parsed?.month || targetMonth;
          const y = parsed?.year || targetYear;
          let autoPlacement: string | null = null;
          let autoPlacements: PlacementAllocation[] = [];
          if (empId && allPlacements) {
            const empPlacements = getPlacementsForEmployee(allPlacements, empId, m, y);
            if (empPlacements.length === 1) {
              autoPlacement = empPlacements[0].id;
              autoPlacements = [{ placementId: empPlacements[0].id, hours: result.totalHours }];
            } else if (empPlacements.length > 1) {
              const splitHours = Math.round((result.totalHours / empPlacements.length) * 100) / 100;
              autoPlacements = empPlacements.map(p => ({ placementId: p.id, hours: splitHours }));
            }
          }
          setQueue((prev) => prev.map((item) => (item.id === id ? {
            ...item,
            status: "done",
            result,
            assignedEmployeeId: empId,
            assignedMonth: m,
            assignedYear: y,
            assignedPlacementId: autoPlacement,
            assignedPlacements: autoPlacements,
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
  }, [targetMonth, targetYear, toast, matchEmployee, allPlacements]);

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
  const allPlacementsResolved = doneActive.every((i) => {
    if (!i.assignedEmployeeId || !allPlacements) return true;
    const m = i.assignedMonth || new Date().getMonth() + 1;
    const y = i.assignedYear || new Date().getFullYear();
    const empPlacements = getPlacementsForEmployee(allPlacements || [], i.assignedEmployeeId, m, y);
    if (empPlacements.length <= 1) return true;
    if (i.assignedPlacements?.length > 0) return true;
    return !!i.assignedPlacementId;
  });
  const canSubmit = allDone && doneActive.length > 0 && !anyScanning && allAssigned && allPlacementsResolved;

  interface GroupSummary {
    empId: string;
    emp: Employee | undefined;
    month: number;
    year: number;
    items: QueueItem[];
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    grossValue: number;
    placementId: string | null;
    placement: PlacementOption | undefined | null;
  }

  const groupSummaries = useMemo(() => {
    const summaries: GroupSummary[] = [];
    for (const item of doneActive) {
      if (!item.result) continue;
      const ap = item.assignedPlacements || [];
      if (ap.length > 1) {
        const totalItemHours = item.result.totalHours;
        for (const alloc of ap) {
          if (alloc.hours <= 0) continue;
          const ratio = totalItemHours > 0 ? alloc.hours / totalItemHours : 0;
          const emp = activeEmployees.find((e) => e.id === item.assignedEmployeeId);
          const rate = emp ? parseFloat(emp.hourlyRate || "0") : 0;
          const placement = allPlacements?.find(p => p.id === alloc.placementId) || null;
          summaries.push({
            empId: item.assignedEmployeeId!,
            emp,
            month: item.assignedMonth,
            year: item.assignedYear,
            items: [item],
            totalHours: alloc.hours,
            regularHours: Math.round(item.result.regularHours * ratio * 100) / 100,
            overtimeHours: Math.round(item.result.overtimeHours * ratio * 100) / 100,
            grossValue: alloc.hours * rate,
            placementId: alloc.placementId,
            placement,
          });
        }
      } else {
        const placementId = ap.length === 1
          ? ap[0].placementId
          : item.assignedPlacementId;
        const emp = activeEmployees.find((e) => e.id === item.assignedEmployeeId);
        const rate = emp ? parseFloat(emp.hourlyRate || "0") : 0;
        const placement = placementId && allPlacements ? allPlacements.find(p => p.id === placementId) : null;
        summaries.push({
          empId: item.assignedEmployeeId!,
          emp,
          month: item.assignedMonth,
          year: item.assignedYear,
          items: [item],
          totalHours: item.result.totalHours,
          regularHours: item.result.regularHours,
          overtimeHours: item.result.overtimeHours,
          grossValue: item.result.totalHours * rate,
          placementId: placementId || null,
          placement,
        });
      }
    }
    return summaries;
  }, [doneActive, activeEmployees, allPlacements]);

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
      ...(g.placementId && { placementId: g.placementId }),
      ...(g.placement?.clientId && { clientId: g.placement.clientId }),
      fileName: g.items.length === 1
        ? g.items[0].result!.fileName
        : `Batch (${g.items.length} files)`,
      fileHash: g.items.length === 1
        ? g.items[0].result!.fileHash
        : null,
      fileSizeBytes: g.items.length === 1
        ? g.items[0].result!.fileSizeBytes
        : null,
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

  const periodSelector = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Target period:</span>
      <Select value={String(targetMonth)} onValueChange={(v) => setTargetMonth(parseInt(v))}>
        <SelectTrigger className="h-8 w-[100px] text-xs" data-testid="select-target-month">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.slice(1).map((m, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>{m.slice(0, 3)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(targetYear)} onValueChange={(v) => setTargetYear(parseInt(v))}>
        <SelectTrigger className="h-8 w-[80px] text-xs" data-testid="select-target-year">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (queue.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex justify-center">{periodSelector}</div>
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
                  {([
                    ["Total", r.totalHours, "text-primary", (v: number) => {
                      const oldTotal = r.totalHours;
                      const newRegular = Math.max(0, v - r.overtimeHours);
                      setQueue((q) => q.map((qi) => {
                        if (qi.id !== currentReview.id || !qi.result) return qi;
                        const upd = { ...qi, result: { ...qi.result, totalHours: v, regularHours: newRegular, overtimeHours: r.overtimeHours } };
                        const ap = qi.assignedPlacements || [];
                        if (ap.length > 0 && oldTotal > 0) {
                          upd.assignedPlacements = ap.map(a => ({ ...a, hours: Math.round((a.hours / oldTotal) * v * 100) / 100 }));
                        } else if (ap.length === 1) {
                          upd.assignedPlacements = [{ ...ap[0], hours: v }];
                        }
                        return upd;
                      }));
                    }],
                    ["Regular", r.regularHours, "text-green-600", (v: number) => {
                      const newTotal = v + r.overtimeHours;
                      const oldTotal = r.totalHours;
                      setQueue((q) => q.map((qi) => {
                        if (qi.id !== currentReview.id || !qi.result) return qi;
                        const upd = { ...qi, result: { ...qi.result, totalHours: newTotal, regularHours: v, overtimeHours: r.overtimeHours } };
                        const ap = qi.assignedPlacements || [];
                        if (ap.length > 0 && oldTotal > 0) {
                          upd.assignedPlacements = ap.map(a => ({ ...a, hours: Math.round((a.hours / oldTotal) * newTotal * 100) / 100 }));
                        } else if (ap.length === 1) {
                          upd.assignedPlacements = [{ ...ap[0], hours: newTotal }];
                        }
                        return upd;
                      }));
                    }],
                    ["Overtime", r.overtimeHours, r.overtimeHours > 8 ? "text-red-600" : "text-amber-600", (v: number) => {
                      const newTotal = r.regularHours + v;
                      const oldTotal = r.totalHours;
                      setQueue((q) => q.map((qi) => {
                        if (qi.id !== currentReview.id || !qi.result) return qi;
                        const upd = { ...qi, result: { ...qi.result, totalHours: newTotal, regularHours: r.regularHours, overtimeHours: v } };
                        const ap = qi.assignedPlacements || [];
                        if (ap.length > 0 && oldTotal > 0) {
                          upd.assignedPlacements = ap.map(a => ({ ...a, hours: Math.round((a.hours / oldTotal) * newTotal * 100) / 100 }));
                        } else if (ap.length === 1) {
                          upd.assignedPlacements = [{ ...ap[0], hours: newTotal }];
                        }
                        return upd;
                      }));
                    }],
                  ] as [string, number, string, (v: number) => void][]).map(([label, val, color, onChange]) => (
                    <div key={label} className="p-2.5 rounded-lg bg-muted border border-border text-center">
                      <input
                        type="number"
                        step="0.5"
                        value={val}
                        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        className={`font-mono text-lg font-semibold ${color} bg-transparent text-center w-full outline-none border-b border-transparent hover:border-border focus:border-primary`}
                        data-testid={`input-review-${label.toLowerCase()}-hours`}
                      />
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
                  {currentReview.assignedEmployeeId && (() => {
                    const empPlacements = getPlacementsForEmployee(allPlacements || [], currentReview.assignedEmployeeId!, currentReview.assignedMonth, currentReview.assignedYear);
                    if (empPlacements.length === 0) return null;
                    if (empPlacements.length === 1) {
                      return (
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Placement</Label>
                          <span className="text-xs font-medium text-foreground block py-1">{empPlacements[0].clientName || "Unknown"} — ${empPlacements[0].chargeOutRate || "?"}/hr</span>
                        </div>
                      );
                    }
                    return (
                      <div className="col-span-2 space-y-1.5 mt-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Split across placements</Label>
                          {r && (() => {
                            const ap = currentReview.assignedPlacements || [];
                            const allocTotal = ap.reduce((s: number, a: PlacementAllocation) => s + a.hours, 0);
                            const diff = Math.abs(allocTotal - r.totalHours);
                            return diff > 0.01 ? (
                              <span className="text-[10px] text-amber-600">{allocTotal.toFixed(1)}h of {r.totalHours}h</span>
                            ) : (
                              <span className="text-[10px] text-green-600">✓ {allocTotal.toFixed(1)}h</span>
                            );
                          })()}
                        </div>
                        {empPlacements.map(p => {
                          const crAp = currentReview.assignedPlacements || [];
                          const alloc = crAp.find((a: PlacementAllocation) => a.placementId === p.id);
                          const hours = alloc?.hours ?? 0;
                          return (
                            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                              <div className="flex-1 min-w-0 text-xs truncate">{p.clientName || "Unknown"} — ${p.chargeOutRate || "?"}/hr</div>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={hours}
                                onChange={(e) => {
                                  const newHours = parseFloat(e.target.value) || 0;
                                  const updated = (currentReview.assignedPlacements || []).filter((a: PlacementAllocation) => a.placementId !== p.id);
                                  if (newHours > 0) updated.push({ placementId: p.id, hours: newHours });
                                  updItem(currentReview.id, { assignedPlacements: updated });
                                }}
                                className="w-16 h-6 text-xs font-mono text-center bg-background border border-border rounded px-1 outline-none focus:border-primary"
                                data-testid={`input-review-placement-hours-${p.id}`}
                              />
                              <span className="text-[10px] text-muted-foreground">h</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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
              onAssignPlacement={(id) => updItem(item.id, { assignedPlacementId: id })}
              onUpdateHours={(total, regular, overtime) => {
                setQueue((q) => q.map((qi) => {
                  if (qi.id !== item.id || !qi.result) return qi;
                  const oldTotal = qi.result.totalHours;
                  const updated = { ...qi, result: { ...qi.result, totalHours: total, regularHours: regular, overtimeHours: overtime } };
                  const ap = qi.assignedPlacements || [];
                  if (ap.length > 0 && oldTotal > 0) {
                    updated.assignedPlacements = ap.map(a => ({
                      ...a,
                      hours: Math.round((a.hours / oldTotal) * total * 100) / 100,
                    }));
                  } else if (ap.length === 1) {
                    updated.assignedPlacements = [{ ...ap[0], hours: total }];
                  }
                  return updated;
                }));
              }}
              onUpdatePlacements={(newPlacements) => updItem(item.id, { assignedPlacements: newPlacements })}
              employees={activeEmployees}
              placements={allPlacements || []}
              duplicateWarning={getDuplicateWarning(item)}
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
                      <div key={`${g.empId}-${g.month}-${g.year}-${g.placementId || g.placement?.id || "none"}`} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate max-w-[160px]">
                            {g.emp ? `${g.emp.firstName} ${g.emp.lastName}` : "Unassigned"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {MONTHS[g.month]?.slice(0, 3)} {g.year} · {g.items.length} file{g.items.length !== 1 ? "s" : ""}
                          </div>
                          {g.placement && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                              → {g.placement.clientName}
                            </div>
                          )}
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

function PdfIframe({ base64Data, title }: { base64Data: string; title: string }) {
  const blobUrl = useBase64BlobUrl(base64Data);
  if (!blobUrl) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading PDF...
    </div>
  );
  return <iframe src={blobUrl} className="w-full h-full" title={title} data-testid="iframe-pdf-viewer" />;
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
  onAssignEmployee, onAssignMonth, onAssignYear, onAssignPlacement,
  onUpdateHours, onUpdatePlacements,
  employees, placements, duplicateWarning,
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
  onAssignPlacement: (id: string | null) => void;
  onUpdateHours: (total: number, regular: number, overtime: number) => void;
  onUpdatePlacements: (placements: PlacementAllocation[]) => void;
  employees: Employee[];
  placements: PlacementOption[];
  duplicateWarning: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const r = item.result;
  const assignedEmp = employees.find((e) => e.id === item.assignedEmployeeId);
  const confColor = !r ? "text-muted-foreground" : r.confidence >= 90 ? "text-green-600" : r.confidence >= 70 ? "text-amber-600" : "text-red-600";
  const empPlacements = item.assignedEmployeeId
    ? getPlacementsForEmployee(placements, item.assignedEmployeeId, item.assignedMonth, item.assignedYear)
    : [];

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
                    <input
                      type="number"
                      step="0.5"
                      value={r.totalHours}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        onUpdateHours(v, Math.max(0, v - r.overtimeHours), r.overtimeHours);
                      }}
                      className="w-12 font-semibold text-foreground bg-transparent text-center outline-none border-b border-dashed border-muted-foreground/40 hover:border-primary focus:border-primary font-mono"
                      title="Click to edit total hours"
                      data-testid={`input-inline-hours-${item.id}`}
                    />
                    <span className="text-foreground font-semibold">h</span>
                    <span> · {r.period}</span>
                    <span className={confColor}> · {r.confidence}%</span>
                  </>
                )}
                {item.status === "error" && <span className="text-red-600"> · Scan failed</span>}
              </div>

              {r && !item.excluded && item.status === "done" && (
                <>
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
                  {empPlacements.length === 1 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Placement:</span>
                      <span className="text-xs font-medium text-foreground">{empPlacements[0].clientName || "Unknown"} — ${empPlacements[0].chargeOutRate || "?"}/hr</span>
                    </div>
                  )}
                  {empPlacements.length > 1 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Split across placements</span>
                        {r && (() => {
                          const ap = item.assignedPlacements || [];
                          const allocTotal = ap.reduce((s: number, a: PlacementAllocation) => s + a.hours, 0);
                          const diff = Math.abs(allocTotal - r.totalHours);
                          return diff > 0.01 ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">
                              {allocTotal.toFixed(1)}h of {r.totalHours}h allocated
                            </span>
                          ) : (
                            <span className="text-[10px] text-green-600 dark:text-green-400">✓ {allocTotal.toFixed(1)}h allocated</span>
                          );
                        })()}
                      </div>
                      {empPlacements.map(p => {
                        const ap = item.assignedPlacements || [];
                        const alloc = ap.find((a: PlacementAllocation) => a.placementId === p.id);
                        const hours = alloc?.hours ?? 0;
                        return (
                          <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                            <div className="flex-1 min-w-0 text-xs truncate">{p.clientName || "Unknown"} — ${p.chargeOutRate || "?"}/hr</div>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={hours}
                              onChange={(e) => {
                                const newHours = parseFloat(e.target.value) || 0;
                                const updated = ap.filter((a: PlacementAllocation) => a.placementId !== p.id);
                                if (newHours > 0) updated.push({ placementId: p.id, hours: newHours });
                                onUpdatePlacements(updated);
                              }}
                              className="w-16 h-6 text-xs font-mono text-center bg-background border border-border rounded px-1 outline-none focus:border-primary"
                              data-testid={`input-placement-hours-${p.id}-${item.id}`}
                            />
                            <span className="text-[10px] text-muted-foreground">h</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {duplicateWarning && !item.excluded && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-600" data-testid={`text-duplicate-warning-${item.id}`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{duplicateWarning}</span>
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
                {([
                  ["Total", r.totalHours, "text-primary", (v: number) => onUpdateHours(v, v - r.overtimeHours, r.overtimeHours)],
                  ["Regular", r.regularHours, "text-green-600", (v: number) => onUpdateHours(v + r.overtimeHours, v, r.overtimeHours)],
                  ["Overtime", r.overtimeHours, r.overtimeHours > 8 ? "text-red-600" : "text-amber-600", (v: number) => onUpdateHours(r.regularHours + v, r.regularHours, v)],
                ] as [string, number, string, (v: number) => void][]).map(([label, val, color, onChange]) => (
                  <div key={label} className="p-2 rounded-lg bg-card border border-border text-center">
                    <input
                      type="number"
                      step="0.5"
                      value={val}
                      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                      className={`font-mono text-base font-semibold ${color} bg-transparent text-center w-full outline-none border-b border-transparent hover:border-border focus:border-primary`}
                      data-testid={`input-hours-${label.toLowerCase()}-${item.id}`}
                    />
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
  const [sourceFilter, setSourceFilter] = useState<"all" | "mine" | "xero">("all");
  const [periodMonth, setPeriodMonth] = useState<number>(0);
  const [periodYear, setPeriodYear] = useState<number>(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualEmployeeId, setManualEmployeeId] = useState<string | null>(null);
  const [manualPlacementId, setManualPlacementId] = useState<string | null>(null);
  const [manualMonth, setManualMonth] = useState(String(new Date().getMonth() + 1));
  const [manualYear, setManualYear] = useState(String(new Date().getFullYear()));

  const { data: timesheetsList, isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: placements } = useQuery<any[]>({
    queryKey: ["/api/placements"],
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

  const manualPlacements = useMemo(() => {
    if (!manualEmployeeId || !placements) return [];
    const m = parseInt(manualMonth);
    const y = parseInt(manualYear);
    return getPlacementsForEmployee(placements || [], manualEmployeeId, m, y);
  }, [manualEmployeeId, placements, manualMonth, manualYear]);

  useEffect(() => {
    if (manualPlacements.length === 1 && !manualPlacementId) {
      setManualPlacementId(manualPlacements[0].id);
    }
  }, [manualPlacements, manualPlacementId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const raw: Record<string, any> = {};
    formData.forEach((v, k) => { if (v) raw[k] = v as string; });

    const notesObj: Record<string, string> = {};
    if (raw.intakeSource) notesObj.intakeSource = raw.intakeSource;

    const payload: Record<string, any> = {
      employeeId: manualEmployeeId || raw.employeeId,
      year: parseInt(manualYear),
      month: parseInt(manualMonth),
      totalHours: raw.totalHours || "0",
      regularHours: raw.regularHours || "0",
      overtimeHours: raw.overtimeHours || "0",
      grossValue: raw.grossValue || "0",
      status: "DRAFT",
      notes: Object.keys(notesObj).length > 0 ? JSON.stringify(notesObj) : null,
    };

    if (manualPlacementId) {
      const placement = manualPlacements.find(p => p.id === manualPlacementId);
      if (placement) {
        payload.placementId = manualPlacementId;
        payload.clientId = placement.clientId;
      }
    }

    if (selectedFile) {
      payload.fileName = selectedFile.name;
      payload.fileData = await readFileAsBase64(selectedFile);
      payload.fileType = selectedFile.type;
    }

    createMutation.mutate(payload);
    setSelectedFile(null);
    setManualEmployeeId(null);
    setManualPlacementId(null);
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

  const availableYears = useMemo(() => {
    if (!timesheetsList) return [];
    const years = new Set(timesheetsList.map(t => t.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [timesheetsList]);

  const periodFiltered = useMemo(() => {
    if (!timesheetsList) return [];
    return timesheetsList.filter((ts) => {
      if (periodMonth > 0 && ts.month !== periodMonth) return false;
      if (periodYear > 0 && ts.year !== periodYear) return false;
      if (search) {
        const c = employeeMap.get(ts.employeeId);
        const name = c ? `${c.firstName} ${c.lastName}` : "";
        return `${name} ${MONTHS[ts.month]} ${ts.year}`.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [timesheetsList, periodMonth, periodYear, search, employeeMap]);

  const sourceCounts = useMemo(() => {
    return {
      all: periodFiltered.length,
      mine: periodFiltered.filter(t => t.source !== "XERO_SYNC").length,
      xero: periodFiltered.filter(t => t.source === "XERO_SYNC").length,
    };
  }, [periodFiltered]);

  const filtered = periodFiltered.filter((ts) => {
    if (sourceFilter === "mine" && ts.source === "XERO_SYNC") return false;
    if (sourceFilter === "xero" && ts.source !== "XERO_SYNC") return false;
    return true;
  });

  const grouped = {
    pending: filtered?.filter((t) => t.status === "SUBMITTED") || [],
    approved: filtered?.filter((t) => t.status === "APPROVED") || [],
    drafts: filtered?.filter((t) => t.status === "DRAFT") || [],
    rejected: filtered?.filter((t) => t.status === "REJECTED") || [],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5" data-testid="filter-source">
          <button
            onClick={() => setSourceFilter("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sourceFilter === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="filter-source-all"
          >
            All ({sourceCounts.all})
          </button>
          <button
            onClick={() => setSourceFilter("mine")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sourceFilter === "mine" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="filter-source-mine"
          >
            My Uploads ({sourceCounts.mine})
          </button>
          <button
            onClick={() => setSourceFilter("xero")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sourceFilter === "xero" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="filter-source-xero"
          >
            Xero ({sourceCounts.xero})
          </button>
        </div>
        <Select value={String(periodYear)} onValueChange={(v) => setPeriodYear(parseInt(v))}>
          <SelectTrigger className="h-8 w-[90px] text-xs" data-testid="filter-year">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">All Years</SelectItem>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(periodMonth)} onValueChange={(v) => setPeriodMonth(parseInt(v))}>
          <SelectTrigger className="h-8 w-[100px] text-xs" data-testid="filter-month">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">All Months</SelectItem>
            {MONTHS.slice(1).map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m.slice(0, 3)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
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
                <Select name="employeeId" required value={manualEmployeeId || ""} onValueChange={(v) => { setManualEmployeeId(v); setManualPlacementId(null); }}>
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
                  <Input id="year" name="year" type="number" value={manualYear} onChange={(e) => { setManualYear(e.target.value); setManualPlacementId(null); }} required data-testid="input-year" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="month">Month</Label>
                  <Select name="month" value={manualMonth} onValueChange={(v) => { setManualMonth(v); setManualPlacementId(null); }}>
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
              {manualEmployeeId && manualPlacements.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Placement</Label>
                  <Select value={manualPlacementId || ""} onValueChange={setManualPlacementId}>
                    <SelectTrigger data-testid="select-placement-manual">
                      <SelectValue placeholder="Select placement (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {manualPlacements.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.clientName} — ${p.chargeOutRate || "?"}/hr
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                    return (
                      <TimesheetRow
                        key={ts.id}
                        timesheet={ts}
                        employee={c}
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
  onApprove,
  onReject,
  onSubmit,
  onDelete,
}: {
  timesheet: Timesheet;
  employee: Employee | undefined;
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
              <PdfIframe base64Data={selectedDoc.fileUrl} title={selectedDoc.name} />
            
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
                  {ts.source && SOURCE_BADGES[ts.source] && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SOURCE_BADGES[ts.source].cls}`} data-testid={`badge-source-${ts.id}`}>
                      {SOURCE_BADGES[ts.source].label}
                    </span>
                  )}
                  {ts.fileName && (
                    <Paperclip className="w-3 h-3 text-muted-foreground" />
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

function getActiveRate(placement: PlacementOption | null, emp: Employee): { rate: number; source: "placement" | "employee" | "none" } {
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
  const { data: placements } = useQuery<PlacementOption[]>({ queryKey: ["/api/placements"] });
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
    const rows: { employee: Employee; placement: PlacementOption | null; clientName: string; rowKey: string }[] = [];

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

  const timesheetByRow = useMemo(() => {
    const map = new Map<string, Timesheet | null>();
    if (!timesheets) return map;
    const claimed = new Set<string>();
    const periodTs = timesheets.filter(t => t.month === month && t.year === year);

    for (const row of placementRows) {
      const empId = row.employee.id;
      const placementId = row.placement?.id || null;
      const hasMultiple = placementRows.filter(r => r.employee.id === empId && r.placement).length > 1;

      if (placementId) {
        const byPlacement = periodTs.find(t => t.employeeId === empId && t.placementId === placementId);
        if (byPlacement) { map.set(row.rowKey, byPlacement); claimed.add(byPlacement.id); continue; }
        if (!hasMultiple) {
          const byEmp = periodTs.find(t => t.employeeId === empId && !t.placementId);
          if (byEmp) { map.set(row.rowKey, byEmp); claimed.add(byEmp.id); continue; }
        }
        const unlinked = periodTs.find(t => t.employeeId === empId && !t.placementId && !claimed.has(t.id));
        if (unlinked) { map.set(row.rowKey, unlinked); claimed.add(unlinked.id); continue; }
        map.set(row.rowKey, null);
      } else {
        const byEmp = periodTs.find(t => t.employeeId === empId && !t.placementId);
        map.set(row.rowKey, byEmp || null);
      }
    }
    return map;
  }, [timesheets, placementRows, month, year]);

  const getTimesheet = (empId: string, placementId: string | null, hasOtherPlacementRows: boolean, rowKey: string) => {
    return timesheetByRow.get(rowKey) || null;
  };

  const isTimesheetUnlinked = (ts: Timesheet | null) => !!(ts && !ts.placementId);

  const [linkPlacementDialog, setLinkPlacementDialog] = useState<{ tsId: string; empId: string } | null>(null);

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

  const saveEdit = (rowKey: string, emp: Employee, placement: PlacementOption | null, ts: Timesheet | null) => {
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
    <div>
      <PdfViewerDialog
        open={docViewerOpen}
        onOpenChange={setDocViewerOpen}
        pdfData={docViewerData}
        title={docViewerTitle}
      />
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-3 py-2.5 mb-4 -mx-3 -mt-3 sm:-mx-6 sm:-mt-4 rounded-t-lg">
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
                    const timesheet = getTimesheet(employee.id, placement?.id || null, hasOtherPlacementRows, rowKey);
                    const ts = timesheet;
                    const isLocked = !!(ts && ts.lockedByPayRunId);
                    const canUnlock = !!(ts && isLocked);
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
                                  {isTimesheetUnlinked(timesheet) && placement && (
                                    <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">Unlinked</Badge>
                                  )}
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
                                {isTimesheetUnlinked(timesheet) && placement && (
                                  <DropdownMenuItem onClick={() => setLinkPlacementDialog({ tsId: timesheet.id, empId: employee.id })} data-testid={`menu-link-placement-${rowKey}`}>
                                    <LinkIcon className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                    Link to Placement
                                  </DropdownMenuItem>
                                )}
                                {canUnlock && ts && (
                                  <DropdownMenuItem onClick={() => {
                                    const unlockMut = async () => {
                                      try {
                                        await apiRequest("PATCH", `/api/timesheets/${ts.id}`, { lockedByPayRunId: null, changeSource: "UNLOCK" });
                                        queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
                                        toast({ title: "Timesheet unlocked" });
                                      } catch (err: any) {
                                        toast({ title: "Error", description: err.message, variant: "destructive" });
                                      }
                                    };
                                    unlockMut();
                                  }}>
                                    <LockOpen className="w-3.5 h-3.5 mr-2" />
                                    Unlock Timesheet
                                  </DropdownMenuItem>
                                )}
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

      {linkPlacementDialog && (
        <LinkPlacementDialog
          tsId={linkPlacementDialog.tsId}
          empId={linkPlacementDialog.empId}
          month={month}
          year={year}
          placements={placements || []}
          open={true}
          onClose={() => setLinkPlacementDialog(null)}
        />
      )}
    </div>
  );
}

function LinkPlacementDialog({ tsId, empId, month, year, placements, open, onClose }: {
  tsId: string; empId: string; month: number; year: number; placements: PlacementOption[]; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const empPlacements = getPlacementsForEmployee(placements || [], empId, month, year);

  const handleSave = async () => {
    if (!selectedPlacementId) return;
    const placement = empPlacements.find(p => p.id === selectedPlacementId);
    if (!placement) return;
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/timesheets/${tsId}`, {
        placementId: selectedPlacementId,
        clientId: placement.clientId,
        changeSource: "LINK_PLACEMENT",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Timesheet linked to placement" });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm" data-testid="dialog-link-placement">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-amber-500" />
            Link to Placement
          </DialogTitle>
          <DialogDescription>
            Choose which placement this timesheet belongs to for {MONTHS[month]} {year}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {empPlacements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active placements found for this period.</p>
          ) : (
            <div className="space-y-2">
              {empPlacements.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlacementId(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedPlacementId === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                  data-testid={`option-placement-${p.id}`}
                >
                  <div className="text-sm font-medium">{p.clientName || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ${p.chargeOutRate || "?"}/hr charge-out
                    {p.payRate && ` · $${p.payRate}/hr pay`}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {p.startDate ? p.startDate : "No start"} → {p.endDate ? p.endDate : "Ongoing"}
                    {" · "}{p.status}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-link-placement">Cancel</Button>
          <Button
            disabled={!selectedPlacementId || saving}
            onClick={handleSave}
            data-testid="button-confirm-link-placement"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Reconciliation Grid ───────────────────────────────────────────────────────

type InvoiceRow = {
  id: string;
  timesheetId: string | null;
  status: string;
  invoiceNumber: string | null;
  amountDue: string | null;
  invoiceType: string | null;
};

type RctiRow = {
  id: string;
  employeeId: string | null;
  clientId: string | null;
  month: number;
  year: number;
  hours: string | null;
  amountExclGst: string;
  status: string;
  reference: string | null;
  timesheetId: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  isRcti: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  SUBMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  REJECTED:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function RowStatusBadge({ ts, onApprove, onReject, isPending }: {
  ts: Timesheet | null;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  if (!ts) return <span className="text-xs text-muted-foreground">—</span>;
  const status = ts.status as string;
  const cls = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
        {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
        {status}
      </span>
      {status === "SUBMITTED" && (
        <>
          <button title="Approve" onClick={onApprove} disabled={isPending}
            className="h-5 w-5 rounded flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-40">
            <CheckCircle className="w-3.5 h-3.5" />
          </button>
          <button title="Reject" onClick={onReject} disabled={isPending}
            className="h-5 w-5 rounded flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Create Invoice Dialog ─────────────────────────────────────────────────────

function CreateInvoiceDialog({
  employee, placement, ts, month, year, open, onClose,
}: {
  employee: Employee;
  placement: PlacementOption | null;
  ts: Timesheet;
  month: number;
  year: number;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const chargeRate = parseFloat(placement?.chargeOutRate || "0");
  const tsHours = parseFloat(ts.totalHours || "0");

  const [hours, setHours] = useState(String(tsHours));
  const [rate, setRate] = useState(String(chargeRate));
  const [desc, setDesc] = useState(
    `Labour hire services — ${employee.firstName} ${employee.lastName} — ${MONTHS[month]} ${year}`
  );
  const [saving, setSaving] = useState(false);

  const hoursNum = parseFloat(hours) || 0;
  const rateNum  = parseFloat(rate)  || 0;
  const exGST    = +(hoursNum * rateNum).toFixed(2);
  const gst      = +(exGST * 0.1).toFixed(2);
  const inclGST  = +(exGST + gst).toFixed(2);

  const today = new Date();
  const issueDate = today.toISOString().slice(0, 10);
  const dueDate = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  const handleCreate = async () => {
    if (hoursNum <= 0 || rateNum <= 0) {
      toast({ title: "Hours and rate must be > 0", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/invoices", {
        employeeId: employee.id,
        clientId: placement?.clientId || null,
        timesheetId: ts.id,
        year,
        month,
        hours: String(hoursNum),
        hourlyRate: String(rateNum),
        amountExclGst: String(exGST),
        gstAmount: String(gst),
        amountInclGst: String(inclGST),
        description: desc,
        issueDate,
        dueDate,
        status: "DRAFT",
        invoiceType: "SALES",
        linkedEmployeeIds: [employee.id],
        lineItems: [{
          description: desc,
          hours: hoursNum,
          rate: rateNum,
          amount: exGST,
          accountCode: "200",
          taxType: "OUTPUT",
        }],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Draft invoice created" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to create invoice", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Create Invoice
          </DialogTitle>
          <DialogDescription>
            {employee.firstName} {employee.lastName} · {MONTHS[month]} {year}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Hours</Label>
              <Input type="number" value={hours} onChange={e => setHours(e.target.value)}
                step="0.25" min="0" className="text-right" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Charge-out rate (ex GST)</Label>
              <Input type="number" value={rate} onChange={e => setRate(e.target.value)}
                step="0.01" min="0" className="text-right" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} />
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount ex GST</span>
              <span className="font-mono">${exGST.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST (10%)</span>
              <span className="font-mono">${gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1.5 mt-1">
              <span>Total incl GST</span>
              <span className="font-mono">${inclGST.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>Issue: {issueDate}</div>
            <div>Due: {dueDate} (14 days)</div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <FileCheck className="w-3.5 h-3.5 mr-1.5" />}
              Create Draft Invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Link RCTI Dialog ──────────────────────────────────────────────────────────

function LinkRctiDialog({
  employee, clientId, clientName, ts, month, year, rctis, open, onClose,
}: {
  employee: Employee;
  clientId: string | null;
  clientName: string;
  ts: Timesheet;
  month: number;
  year: number;
  rctis: RctiRow[];
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Candidate RCTIs: same employee + client + period, not yet linked to a different timesheet
  const candidates = rctis.filter(r =>
    r.employeeId === employee.id &&
    r.clientId === clientId &&
    r.month === month &&
    r.year === year &&
    (!r.timesheetId || r.timesheetId === ts.id)
  );

  const tsHours = parseFloat(ts.totalHours || "0");

  const handleLink = async () => {
    if (!selectedId) return;
    const rcti = candidates.find(r => r.id === selectedId);
    if (!rcti) return;
    setSaving(true);

    const rctiHours = parseFloat(rcti.hours || "0");
    const delta = Math.abs(tsHours - rctiHours);
    // Threshold hardcoded to 0.5 here; ideally read from settings
    const discrepancyStatus = delta > 0.5 ? "HOURS_MISMATCH" : "NONE";

    try {
      // Link timesheet → rcti
      await apiRequest("PATCH", `/api/timesheets/${ts.id}`, {
        rctiId: selectedId,
        discrepancyStatus,
        changeSource: "RCTI_LINK",
      });
      // Link rcti → timesheet
      await apiRequest("PATCH", `/api/rctis/${selectedId}`, { timesheetId: ts.id });

      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rctis"] });

      if (discrepancyStatus !== "NONE") {
        toast({
          title: "RCTI linked — hours discrepancy detected",
          description: `Timesheet: ${tsHours}h · RCTI: ${rctiHours}h · Delta: ${delta.toFixed(2)}h`,
          variant: "destructive",
        });
      } else {
        toast({ title: "RCTI linked successfully" });
      }
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to link RCTI", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Link RCTI
          </DialogTitle>
          <DialogDescription>
            {employee.firstName} {employee.lastName} · {clientName} · {MONTHS[month]} {year}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="text-xs text-muted-foreground">
            Timesheet: <span className="font-semibold text-foreground">{tsHours}h</span>
          </div>

          {candidates.length === 0 ? (
            <div className="rounded-md bg-muted/40 p-4 text-sm text-center text-muted-foreground">
              No unlinked RCTIs found for this employee, client and period.
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map(r => {
                const rHours = parseFloat(r.hours || "0");
                const delta = Math.abs(tsHours - rHours);
                const hasDiscrepancy = delta > 0.5;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left rounded-md border p-3 text-sm transition-colors
                      ${selectedId === r.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.reference || r.id.slice(0, 8)}</span>
                      <span className={`text-xs font-mono ${hasDiscrepancy ? "text-amber-600" : "text-green-600"}`}>
                        {rHours}h {hasDiscrepancy ? `(Δ${delta.toFixed(2)}h)` : "✓"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      ${parseFloat(r.amountExclGst).toFixed(2)} ex GST · {r.status}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleLink} disabled={saving || !selectedId}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <LinkIcon className="w-3.5 h-3.5 mr-1.5" />}
              Link RCTI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Payroll Lock Dialog ───────────────────────────────────────────────────────

function PayrollLockDialog({
  employee, ts, open, onClose,
}: {
  employee: Employee;
  ts: Timesheet;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const lockRef = `MANUAL-${new Date().toISOString().slice(0, 10)}-${ts.id.slice(0, 6).toUpperCase()}`;

  const handleLock = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/timesheets/${ts.id}`, {
        lockedByPayRunId: lockRef,
        changeSource: "PAYROLL_LOCK",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Timesheet locked for payroll" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to lock timesheet", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Lock for Payroll
          </DialogTitle>
          <DialogDescription>
            This action is permanent and will be audit-logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Employee:</span> {employee.firstName} {employee.lastName}</div>
            <div><span className="text-muted-foreground">Hours:</span> {parseFloat(ts.totalHours || "0").toFixed(2)}h</div>
            <div><span className="text-muted-foreground">Gross:</span> ${parseFloat(ts.grossValue || "0").toFixed(2)}</div>
            <div><span className="text-muted-foreground">Lock ref:</span> <span className="font-mono text-xs">{lockRef}</span></div>
          </div>

          <p className="text-sm text-muted-foreground">
            Once locked, this timesheet cannot be edited without admin intervention. Ensure all values are correct before proceeding.
          </p>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={handleLock} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
              Confirm Lock
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Discrepancy Resolution Dialog ─────────────────────────────────────────────

function DiscrepancyDialog({
  employee, ts, rcti, open, onClose,
}: {
  employee: Employee;
  ts: Timesheet;
  rcti: RctiRow;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const tsHours = parseFloat(ts.totalHours || "0");
  const rctiHours = parseFloat(rcti.hours || "0");
  const delta = tsHours - rctiHours;

  const resolve = async (action: "USE_TIMESHEET" | "USE_RCTI" | "OVERRIDE") => {
    setSaving(true);
    try {
      const patch: Record<string, any> = {
        discrepancyStatus: "RESOLVED",
        changeSource: "DISCREPANCY_RESOLVED",
      };
      if (action === "USE_RCTI") {
        patch.totalHours = rcti.hours;
        patch.regularHours = rcti.hours;
        patch.overtimeHours = "0";
      }
      await apiRequest("PATCH", `/api/timesheets/${ts.id}`, patch);
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Discrepancy resolved" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to resolve", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            RCTI Discrepancy
          </DialogTitle>
          <DialogDescription>
            {employee.firstName} {employee.lastName} — hours differ between timesheet and RCTI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-md border p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Timesheet hours</span>
              <span className="font-mono font-medium">{tsHours.toFixed(2)}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RCTI hours</span>
              <span className="font-mono font-medium">{rctiHours.toFixed(2)}h</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Delta</span>
              <span className={`font-mono font-semibold ${Math.abs(delta) > 0.5 ? "text-amber-600" : "text-muted-foreground"}`}>
                {delta > 0 ? "+" : ""}{delta.toFixed(2)}h
              </span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            RCTI ref: {rcti.reference || rcti.id.slice(0, 8)} · ${parseFloat(rcti.amountExclGst).toFixed(2)} ex GST
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">How would you like to resolve this?</p>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => resolve("USE_TIMESHEET")} disabled={saving}>
              <FileCheck className="w-3.5 h-3.5" />
              Keep timesheet hours ({tsHours}h) — mark resolved
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => resolve("USE_RCTI")} disabled={saving}>
              <Receipt className="w-3.5 h-3.5" />
              Use RCTI hours ({rctiHours}h) — update timesheet
            </Button>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Dismiss</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Reconciliation View ───────────────────────────────────────────────────────

function ReconciliationView() {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "missing" | "needs-action" | "done">("all");

  // Dialog state — track which row has which dialog open
  const [invoiceDialog, setInvoiceDialog] = useState<string | null>(null);
  const [linkRctiDialog, setLinkRctiDialog] = useState<string | null>(null);
  const [lockDialog, setLockDialog] = useState<string | null>(null);
  const [discrepancyDialog, setDiscrepancyDialog] = useState<string | null>(null);
  const [unlockDialog, setUnlockDialog] = useState<string | null>(null);
  const [historyTs, setHistoryTs] = useState<Timesheet | null>(null);

  const { data: employees } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: timesheets, isLoading } = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"] });
  const { data: placements } = useQuery<PlacementOption[]>({ queryKey: ["/api/placements"] });
  const { data: clients } = useQuery<ClientRow[]>({ queryKey: ["/api/clients"] });
  const { data: invoices } = useQuery<InvoiceRow[]>({ queryKey: ["/api/invoices"] });
  const { data: rctis } = useQuery<RctiRow[]>({ queryKey: ["/api/rctis"] });

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 0);
  const activeEmployees = (employees || []).filter(e => e.status === "ACTIVE");

  const rows = useMemo(() => {
    const result: {
      employee: Employee;
      placement: PlacementOption | null;
      clientName: string;
      clientId: string | null;
      isRctiClient: boolean;
      rowKey: string;
    }[] = [];

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
          const client = (clients || []).find(c => c.id === p.clientId);
          result.push({
            employee: emp,
            placement: p,
            clientName: p.clientName || client?.name || "Unknown",
            clientId: p.clientId,
            isRctiClient: client?.isRcti ?? false,
            rowKey: `${emp.id}__${p.id}`,
          });
        }
      } else {
        result.push({
          employee: emp,
          placement: null,
          clientName: "",
          clientId: null,
          isRctiClient: false,
          rowKey: emp.id,
        });
      }
    }

    return result.sort((a, b) => {
      const na = `${a.employee.firstName} ${a.employee.lastName}`;
      const nb = `${b.employee.firstName} ${b.employee.lastName}`;
      return na !== nb ? na.localeCompare(nb) : a.clientName.localeCompare(b.clientName);
    });
  }, [activeEmployees, placements, clients, month, year]);

  const empHasMultiplePlacements = (empId: string) =>
    rows.filter(r => r.employee.id === empId && r.placement).length > 1;

  const timesheetByRow = useMemo(() => {
    const map = new Map<string, Timesheet | null>();
    if (!timesheets) return map;
    const claimed = new Set<string>();
    const periodTs = timesheets.filter(t => t.month === month && t.year === year);

    for (const row of rows) {
      const empId = row.employee.id;
      const placementId = row.placement?.id || null;
      const hasMultiple = rows.filter(r => r.employee.id === empId && r.placement).length > 1;

      if (placementId) {
        const byP = periodTs.find(t => t.employeeId === empId && t.placementId === placementId);
        if (byP) { map.set(row.rowKey, byP); claimed.add(byP.id); continue; }
        if (!hasMultiple) {
          const byEmp = periodTs.find(t => t.employeeId === empId && !t.placementId);
          if (byEmp) { map.set(row.rowKey, byEmp); claimed.add(byEmp.id); continue; }
        }
        const unlinked = periodTs.find(t => t.employeeId === empId && !t.placementId && !claimed.has(t.id));
        if (unlinked) { map.set(row.rowKey, unlinked); claimed.add(unlinked.id); continue; }
        map.set(row.rowKey, null);
      } else {
        const byEmp = periodTs.find(t => t.employeeId === empId && !t.placementId);
        map.set(row.rowKey, byEmp || null);
      }
    }
    return map;
  }, [timesheets, rows, month, year]);

  const getTimesheet = (empId: string, placementId: string | null, hasMultiple: boolean, rowKey: string): Timesheet | null => {
    return timesheetByRow.get(rowKey) || null;
  };

  const isTimesheetUnlinked = (ts: Timesheet | null) => !!(ts && !ts.placementId);

  const [linkPlacementDialog, setLinkPlacementDialog] = useState<{ tsId: string; empId: string } | null>(null);

  const getRcti = (empId: string, clientId: string | null): RctiRow | null => {
    if (!clientId || !rctis) return null;
    return rctis.find(r => r.employeeId === empId && r.clientId === clientId && r.month === month && r.year === year) || null;
  };

  const getInvoice = (tsId: string | undefined): InvoiceRow | null => {
    if (!tsId || !invoices) return null;
    return invoices.find(inv => inv.timesheetId === tsId) || null;
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      setPendingIds(s => new Set(s).add(id));
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, { status, changeSource: "STATUS_CHANGE" });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setPendingIds(s => { const n = new Set(s); n.delete(vars.id); return n; });
    },
    onError: (err: Error, vars) => {
      setPendingIds(s => { const n = new Set(s); n.delete(vars.id); return n; });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const classify = (ts: Timesheet | null, rcti: RctiRow | null, isRctiClient: boolean) => {
    if (!ts && !rcti) return "missing";
    if (ts?.status === "SUBMITTED" || ts?.status === "REJECTED") return "needs-action";
    if (ts?.status === "APPROVED") return "done";
    if (isRctiClient && rcti) return "done";
    return "in-progress";
  };

  const ROW_COLORS: Record<string, string> = {
    missing:        "bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30",
    "needs-action": "bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30",
    "in-progress":  "hover:bg-muted/50",
    done:           "bg-green-50/40 dark:bg-green-950/10 hover:bg-green-50/60 dark:hover:bg-green-950/20",
  };

  const counts = useMemo(() => {
    const c = { missing: 0, "needs-action": 0, done: 0 };
    for (const row of rows) {
      const ts = getTimesheet(row.employee.id, row.placement?.id || null, empHasMultiplePlacements(row.employee.id), row.rowKey);
      const rcti = getRcti(row.employee.id, row.clientId);
      const state = classify(ts, rcti, row.isRctiClient);
      if (state === "missing") c.missing++;
      else if (state === "needs-action") c["needs-action"]++;
      else if (state === "done") c.done++;
    }
    return c;
  }, [rows, timesheetByRow, rctis, month, year]);

  const filteredRows = rows.filter(row => {
    if (filter === "all") return true;
    const ts = getTimesheet(row.employee.id, row.placement?.id || null, empHasMultiplePlacements(row.employee.id), row.rowKey);
    const rcti = getRcti(row.employee.id, row.clientId);
    const state = classify(ts, rcti, row.isRctiClient);
    return state === filter;
  });

  const INVOICE_STATUS_COLORS: Record<string, string> = {
    DRAFT:      "bg-gray-100 text-gray-600",
    SENT:       "bg-blue-100 text-blue-700",
    AUTHORISED: "bg-blue-100 text-blue-700",
    PAID:       "bg-green-100 text-green-700",
    VOIDED:     "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[110px] text-center">{MONTHS[month]} {year}</span>
          <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ["all",          "All",          null,                   ""],
            ["missing",      "Missing",      counts.missing,         "text-red-600"],
            ["needs-action", "Needs Action", counts["needs-action"], "text-amber-600"],
            ["done",         "Done",         counts.done,            "text-green-600"],
          ] as const).map(([val, label, count, cls]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors
                ${filter === val ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:bg-muted"}`}>
              {label}
              {count !== null && count > 0 && (
                <span className={`text-[10px] font-bold ${filter === val ? "" : cls}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b text-xs text-muted-foreground">
                <th className="text-left px-3 py-2.5 font-medium">Employee</th>
                <th className="text-left px-3 py-2.5 font-medium">Client</th>
                <th className="text-left px-3 py-2.5 font-medium">Source</th>
                <th className="text-right px-3 py-2.5 font-medium">Hours</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Invoice / RCTI</th>
                <th className="text-left px-3 py-2.5 font-medium">Flags</th>
                <th className="text-right px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    {filter === "all" ? "No active employees with placements this period." : `No ${filter} rows this period.`}
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  const hasMultiple = empHasMultiplePlacements(row.employee.id);
                  const ts = getTimesheet(row.employee.id, row.placement?.id || null, hasMultiple, row.rowKey);
                  const rcti = getRcti(row.employee.id, row.clientId);
                  const inv = ts ? getInvoice(ts.id) : null;
                  const state = classify(ts, rcti, row.isRctiClient);
                  const src = ts ? (ts.source as string | null) : null;
                  const srcBadge = src ? SOURCE_BADGES[src] : null;
                  const isLocked = !!(ts && ts.lockedByPayRunId);
                  const hasDiscrepancy = !!(ts && ts.discrepancyStatus && ts.discrepancyStatus !== "NONE" && ts.discrepancyStatus !== "RESOLVED");
                  const isPending = !!(ts && pendingIds.has(ts.id));
                  const rk = row.rowKey;

                  // What actions are available for this row?
                  const canCreateInvoice = !!(ts && ts.status === "APPROVED" && !inv && !row.isRctiClient);
                  const canLinkRcti = !!(ts && row.isRctiClient && !ts.rctiId);
                  const canLock = !!(ts && ts.status === "APPROVED" && !isLocked);
                  const canUnlock = !!(ts && isLocked);
                  const canResolveDiscrepancy = !!(hasDiscrepancy && ts && rcti);

                  return (
                    <>
                      <tr key={rk} className={`border-b last:border-b-0 ${ROW_COLORS[state]}`}>
                        {/* Employee */}
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-sm">{row.employee.firstName} {row.employee.lastName}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {row.employee.paymentMethod === "INVOICE" ? "Contractor" : "Payroll"}
                          </div>
                        </td>

                        {/* Client */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{row.clientName || "—"}</span>
                            {row.isRctiClient && (
                              <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                RCTI
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Source */}
                        <td className="px-3 py-2.5">
                          {srcBadge ? (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${srcBadge.cls}`}>
                              {srcBadge.label}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>

                        {/* Hours */}
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {ts ? (
                            <div>
                              <span className="font-medium">{parseFloat(ts.totalHours || "0").toFixed(1)}</span>
                              <span className="text-muted-foreground text-xs">h</span>
                              {parseFloat(ts.overtimeHours || "0") > 0 && (
                                <div className="text-[10px] text-muted-foreground">
                                  +{parseFloat(ts.overtimeHours || "0").toFixed(1)}h OT
                                </div>
                              )}
                            </div>
                          ) : rcti ? (
                            <div>
                              <span className="font-medium">{parseFloat(rcti.hours || "0").toFixed(1)}</span>
                              <span className="text-muted-foreground text-xs">h</span>
                              <div className="text-[10px] text-amber-600">via RCTI</div>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5">
                          <RowStatusBadge
                            ts={ts}
                            isPending={isPending}
                            onApprove={() => ts && statusMutation.mutate({ id: ts.id, status: "APPROVED" })}
                            onReject={() => ts && statusMutation.mutate({ id: ts.id, status: "REJECTED" })}
                          />
                        </td>

                        {/* Invoice / RCTI */}
                        <td className="px-3 py-2.5">
                          {inv ? (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${INVOICE_STATUS_COLORS[inv.status] || "bg-gray-100 text-gray-600"}`}>
                              {inv.invoiceNumber || inv.status}
                            </span>
                          ) : rcti && row.isRctiClient ? (
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              <Receipt className="w-2.5 h-2.5" />
                              {rcti.reference || "RCTI"}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>

                        {/* Flags */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {isLocked && (
                              <span title="Locked for payroll" className="text-muted-foreground">
                                <Lock className="w-3 h-3" />
                              </span>
                            )}
                            {hasDiscrepancy && (
                              <button
                                title="RCTI discrepancy — click to resolve"
                                className="text-amber-500 hover:text-amber-600"
                                onClick={() => setDiscrepancyDialog(rk)}
                              >
                                <AlertCircle className="w-3 h-3" />
                              </button>
                            )}
                            {isTimesheetUnlinked(ts) && row.placement && (
                              <Badge variant="outline" className="text-[8px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">Unlinked</Badge>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5 text-right">
                          {(canCreateInvoice || canLinkRcti || canLock || canUnlock || canResolveDiscrepancy || (isTimesheetUnlinked(ts) && row.placement)) ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-sm">
                                {canCreateInvoice && (
                                  <DropdownMenuItem onClick={() => setInvoiceDialog(rk)}>
                                    <DollarSign className="w-3.5 h-3.5 mr-2" />
                                    Create Invoice
                                  </DropdownMenuItem>
                                )}
                                {canLinkRcti && (
                                  <DropdownMenuItem onClick={() => setLinkRctiDialog(rk)}>
                                    <LinkIcon className="w-3.5 h-3.5 mr-2" />
                                    Link RCTI
                                  </DropdownMenuItem>
                                )}
                                {isTimesheetUnlinked(ts) && row.placement && ts && (
                                  <DropdownMenuItem onClick={() => setLinkPlacementDialog({ tsId: ts.id, empId: row.employee.id })} data-testid={`menu-link-placement-recon-${rk}`}>
                                    <LinkIcon className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                    Link to Placement
                                  </DropdownMenuItem>
                                )}
                                {canLock && (
                                  <DropdownMenuItem onClick={() => setLockDialog(rk)}>
                                    <Lock className="w-3.5 h-3.5 mr-2" />
                                    Lock for Payroll
                                  </DropdownMenuItem>
                                )}
                                {canResolveDiscrepancy && (
                                  <DropdownMenuItem onClick={() => setDiscrepancyDialog(rk)}>
                                    <AlertCircle className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                    Resolve Discrepancy
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </td>
                      </tr>

                      {/* Inline dialogs — rendered as siblings so they don't break table layout */}
                      {ts && invoiceDialog === rk && (
                        <CreateInvoiceDialog
                          key={`inv-${rk}`}
                          employee={row.employee}
                          placement={row.placement}
                          ts={ts}
                          month={month}
                          year={year}
                          open={true}
                          onClose={() => setInvoiceDialog(null)}
                        />
                      )}
                      {ts && linkRctiDialog === rk && (
                        <LinkRctiDialog
                          key={`rcti-${rk}`}
                          employee={row.employee}
                          clientId={row.clientId}
                          clientName={row.clientName}
                          ts={ts}
                          month={month}
                          year={year}
                          rctis={rctis || []}
                          open={true}
                          onClose={() => setLinkRctiDialog(null)}
                        />
                      )}
                      {ts && lockDialog === rk && (
                        <PayrollLockDialog
                          key={`lock-${rk}`}
                          employee={row.employee}
                          ts={ts}
                          open={true}
                          onClose={() => setLockDialog(null)}
                        />
                      )}
                      {ts && rcti && discrepancyDialog === rk && (
                        <DiscrepancyDialog
                          key={`disc-${rk}`}
                          employee={row.employee}
                          ts={ts}
                          rcti={rcti}
                          open={true}
                          onClose={() => setDiscrepancyDialog(null)}
                        />
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {historyTs && (
        <AuditLogSheet
          ts={historyTs}
          open={!!historyTs}
          onClose={() => setHistoryTs(null)}
        />
      )}

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/40" /> Missing timesheet</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-900/40" /> Needs action</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-white border dark:bg-transparent" /> In progress</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/40" /> Approved</div>
        <div className="flex items-center gap-1"><Lock className="w-3 h-3" /> Payroll locked</div>
        <div className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-500" /> RCTI discrepancy</div>
      </div>

      {linkPlacementDialog && (
        <LinkPlacementDialog
          tsId={linkPlacementDialog.tsId}
          empId={linkPlacementDialog.empId}
          month={month}
          year={year}
          placements={placements || []}
          open={true}
          onClose={() => setLinkPlacementDialog(null)}
        />
      )}
    </div>
  );
}

// ── Inbox View ────────────────────────────────────────────────────────────────

function InboxView() {
  const { toast } = useToast();
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const pastFifth = now.getDate() > 5;

  const { data: timesheets } = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"] });
  const { data: employees }  = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: placements } = useQuery<any[]>({ queryKey: ["/api/placements"] });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, { status: "APPROVED", changeSource: "INBOX_APPROVE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Timesheet approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/timesheets/${id}`, { status: "REJECTED", changeSource: "INBOX_REJECT" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Timesheet rejected" });
    },
  });

  const submitted = useMemo(() => {
    if (!timesheets) return [];
    return timesheets.filter(t => t.status === "SUBMITTED");
  }, [timesheets]);

  const discrepancies = useMemo(() => {
    if (!timesheets) return [];
    return timesheets.filter(t => {
      const ds = t.discrepancyStatus;
      return ds && ds !== "NONE" && ds !== "RESOLVED";
    });
  }, [timesheets]);

  const missing = useMemo(() => {
    if (!employees || !timesheets || !placements || !pastFifth) return [];
    const activeEmps = employees.filter(e => e.status === "ACTIVE");
    const result: { employee: Employee; clientName: string }[] = [];
    for (const emp of activeEmps) {
      const hasTs = timesheets.some(t =>
        t.employeeId === emp.id &&
        t.month === prevMonth &&
        t.year === prevYear
      );
      if (!hasTs) {
        const pl = (placements || []).find(p => p.employeeId === emp.id && p.status === "ACTIVE");
        result.push({ employee: emp, clientName: pl?.clientName || "\u2014" });
      }
    }
    return result;
  }, [employees, timesheets, placements, pastFifth, prevMonth, prevYear]);

  const empName = (id: string) => {
    const e = employees?.find(e => e.id === id);
    return e ? `${e.firstName} ${e.lastName}` : id;
  };

  const total = submitted.length + discrepancies.length + missing.length;

  return (
    <div className="space-y-6">
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CheckCircle className="w-10 h-10 mb-3 text-green-500 opacity-60" />
          <p className="text-sm font-medium">All clear \u2014 no items need attention</p>
        </div>
      ) : (
        <>
          {submitted.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold">Awaiting Approval ({submitted.length})</h2>
              </div>
              <div className="border rounded-lg overflow-hidden divide-y">
                {submitted.map(ts => (
                  <div key={ts.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">{empName(ts.employeeId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {MONTHS[ts.month || 0]} {ts.year} \u00b7 {ts.totalHours ?? "\u2014"} hrs
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                        disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(ts.id)}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                        disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(ts.id)}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {discrepancies.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold">RCTI Discrepancies ({discrepancies.length})</h2>
              </div>
              <div className="border rounded-lg overflow-hidden divide-y">
                {discrepancies.map(ts => (
                  <div key={ts.id} className="flex items-center justify-between px-4 py-3 bg-amber-50/50 dark:bg-amber-900/10">
                    <div>
                      <p className="text-sm font-medium">{empName(ts.employeeId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {MONTHS[ts.month || 0]} {ts.year} \u00b7 {ts.discrepancyStatus}
                      </p>
                    </div>
                    <span className="text-xs text-amber-600 font-medium">Resolve in Reconciliation</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {missing.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-semibold">Missing for {MONTHS[prevMonth]} {prevYear} ({missing.length})</h2>
              </div>
              <div className="border rounded-lg overflow-hidden divide-y">
                {missing.map(({ employee, clientName }) => (
                  <div key={employee.id} className="flex items-center justify-between px-4 py-3 bg-red-50/40 dark:bg-red-900/10">
                    <div>
                      <p className="text-sm font-medium">{employee.firstName} {employee.lastName}</p>
                      <p className="text-xs text-muted-foreground">{clientName}</p>
                    </div>
                    <span className="text-xs text-red-500 font-medium">No timesheet submitted</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Documents View ─────────────────────────────────────────────────────────────

function DocumentsView() {
  const [search, setSearch] = useState("");
  const [viewerData, setViewerData] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);

  const { data: timesheets } = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"] });
  const { data: employees }  = useQuery<Employee[]>({ queryKey: ["/api/employees"] });

  const tsIds = useMemo(() => (timesheets || []).map(t => t.id), [timesheets]);

  const { data: allDocs, isLoading } = useQuery<Record<string, DocType[]>>({
    queryKey: ["/api/docs-all-batch", tsIds.length],
    queryFn: async () => {
      if (tsIds.length === 0) return {};
      const results: Record<string, DocType[]> = {};
      await Promise.all(tsIds.map(async id => {
        try {
          const res = await fetch(`/api/timesheets/${id}/documents`, { credentials: "include" });
          if (res.ok) { const docs = await res.json(); if (docs.length > 0) results[id] = docs; }
        } catch {}
      }));
      return results;
    },
    enabled: tsIds.length > 0,
    staleTime: 60_000,
  });

  const empName = (id: string) => {
    const e = employees?.find(e => e.id === id);
    return e ? `${e.firstName} ${e.lastName}` : id;
  };

  const rows = useMemo(() => {
    if (!allDocs || !timesheets) return [];
    const out: { ts: Timesheet; doc: DocType; employee: string; label: string }[] = [];
    for (const [tsId, docs] of Object.entries(allDocs)) {
      const ts = timesheets.find(t => t.id === tsId);
      if (!ts) continue;
      const emp = empName(ts.employeeId);
      const label = `${emp} \u2014 ${MONTHS[ts.month || 0]} ${ts.year}`;
      for (const doc of docs) out.push({ ts, doc, employee: emp, label });
    }
    out.sort((a, b) => {
      const yDiff = (b.ts.year || 0) - (a.ts.year || 0);
      if (yDiff !== 0) return yDiff;
      const mDiff = (b.ts.month || 0) - (a.ts.month || 0);
      if (mDiff !== 0) return mDiff;
      return a.employee.localeCompare(b.employee);
    });
    return out;
  }, [allDocs, timesheets, employees]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.label.toLowerCase().includes(q) || (r.doc.name || "").toLowerCase().includes(q));
  }, [rows, search]);

  const openDoc = (doc: DocType) => {
    setViewerData(doc.fileUrl);
    setViewerTitle(doc.name || "Document");
    setViewerOpen(true);
  };

  const downloadDoc = (doc: DocType) => {
    const href = doc.fileUrl.startsWith("data:") ? doc.fileUrl : `data:application/pdf;base64,${doc.fileUrl}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = doc.name || "document.pdf";
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search by employee or period\u2026"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FolderOpen className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">{search ? "No documents match your search" : "No documents uploaded yet"}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden divide-y">
          {filtered.map(({ ts, doc, label }, idx) => (
            <div key={`${ts.id}-${idx}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-violet-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{doc.name || "Document"}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => openDoc(doc)}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Download" onClick={() => downloadDoc(doc)}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PdfViewerDialog open={viewerOpen} onClose={() => setViewerOpen(false)} pdfData={viewerData} title={viewerTitle} />
    </div>
  );
}

// -- Audit Log Sheet ----------------------------------------------------------

function AuditLogSheet({
  ts, open, onClose,
}: {
  ts: Timesheet;
  open: boolean;
  onClose: () => void;
}) {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/timesheets", ts.id, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${ts.id}/history`);
      return res.json();
    },
    enabled: open,
  });
  const SOURCE_LABELS: Record<string, string> = {
    MANUAL_EDIT: "Manual Edit", PDF_UPLOAD: "PDF Upload", XERO_SYNC: "Xero Sync",
    RCTI_LINK: "RCTI Link", INBOX_APPROVE: "Inbox Approve", INBOX_REJECT: "Inbox Reject",
    PAYROLL_LOCK: "Payroll Lock", PAYROLL_UNLOCK: "Payroll Unlock",
    ADMIN_ENTRY: "Admin Entry", PORTAL: "Portal",
  };
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[440px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Audit History
          </SheetTitle>
          <SheetDescription>
            {ts.employeeId} · {MONTHS[ts.month || 1]} {ts.year}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No history recorded for this timesheet.
            </div>
          ) : (
            logs.map((log: any) => (
              <div key={log.id} className="rounded-md border border-border/60 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{log.field}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="line-through">{log.oldValue ?? "—"}</span>
                  <span>→</span>
                  <span className="text-foreground font-medium">{log.newValue ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {SOURCE_LABELS[log.changeSource] || log.changeSource}
                  </span>
                  {log.changedBy && <span>by {log.changedBy}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Unlock Timesheet Dialog ────────────────────────────────────────────────────

function UnlockTimesheetDialog({
  employee, ts, open, onClose,
}: {
  employee: Employee;
  ts: Timesheet;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleUnlock = async () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for unlocking.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/timesheets/${ts.id}`, {
        lockedByPayRunId: null,
        changeSource: "PAYROLL_UNLOCK",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: "Timesheet unlocked", description: `Reason: ${reason}` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to unlock", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock Timesheet</DialogTitle>
          <DialogDescription>
            {employee.firstName} {employee.lastName} \u2014 {ts.month ? MONTHS[ts.month] : ""} {ts.year}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            This timesheet is locked for payroll. A reason is required before unlocking.
          </p>
          <div className="space-y-1.5">
            <Label>Reason for unlocking <span className="text-red-500">*</span></Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Hours correction required"
              className="text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleUnlock} disabled={saving || !reason.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <LockOpen className="w-3.5 h-3.5 mr-1" />}
            Unlock
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
