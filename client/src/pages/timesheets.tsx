import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Clock, FileText, CheckCircle, AlertTriangle, XCircle, Mail, Upload, UserCheck, Monitor, Paperclip } from "lucide-react";
import type { Timesheet, Contractor } from "@shared/schema";

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

export default function TimesheetsPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: timesheetsList, isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: contractors } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const contractorMap = new Map(contractors?.map((c) => [c.id, c]) || []);

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

  const filtered = timesheetsList?.filter((ts) => {
    const c = contractorMap.get(ts.contractorId);
    const name = c ? `${c.firstName} ${c.lastName}` : "";
    const matchSearch = `${name} ${MONTHS[ts.month]} ${ts.year}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "ALL" || ts.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const grouped = {
    pending: filtered?.filter((t) => t.status === "SUBMITTED") || [],
    approved: filtered?.filter((t) => t.status === "APPROVED") || [],
    drafts: filtered?.filter((t) => t.status === "DRAFT") || [],
    rejected: filtered?.filter((t) => t.status === "REJECTED") || [],
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
      contractorId: raw.contractorId,
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

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Timesheets"
        subtitle="Upload, review & approve contractor timesheets"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-timesheet">
                <Plus className="w-4 h-4" />
                New Timesheet
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Timesheet Entry</DialogTitle>
                <DialogDescription>Create a timesheet for a contractor</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Contractor</Label>
                  <Select name="contractorId" required>
                    <SelectTrigger data-testid="select-contractor">
                      <SelectValue placeholder="Select contractor" />
                    </SelectTrigger>
                    <SelectContent>
                      {contractors?.map((c) => (
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
                      <SelectTrigger data-testid="select-intake-source">
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
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-4">
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
                        const c = contractorMap.get(ts.contractorId);
                        const intakeSource = getIntakeSource(ts.notes);
                        return (
                          <TimesheetRow
                            key={ts.id}
                            timesheet={ts}
                            contractor={c}
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
      </main>
    </div>
  );
}

function TimesheetRow({
  timesheet: ts,
  contractor: c,
  intakeSource,
  onApprove,
  onReject,
  onSubmit,
}: {
  timesheet: Timesheet;
  contractor: Contractor | undefined;
  intakeSource: string | null;
  onApprove: () => void;
  onReject: () => void;
  onSubmit: () => void;
}) {
  const overtimeHours = parseFloat(ts.overtimeHours || "0");
  const intakeLabel = intakeSource ? INTAKE_SOURCES.find((s) => s.value === intakeSource)?.label : null;
  const intakeBadgeClass = intakeSource ? INTAKE_BADGE_STYLES[intakeSource] || "" : "";

  return (
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
  );
}
