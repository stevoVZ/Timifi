import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useRef, useCallback } from "react";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Shield, MapPin, Briefcase, Mail, Phone, Calendar,
  DollarSign, Clock, Pencil, Check, X, AlertTriangle, FileText,
  Receipt, User, Upload, CloudUpload, Trash2, Eye, FileBadge,
  Landmark, CreditCard, IdCard, Search, ShieldCheck, GraduationCap, File
} from "lucide-react";
import type { Contractor, Timesheet, Invoice, Document } from "@shared/schema";

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isClearanceExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const expiryDate = new Date(expiry);
  const now = new Date();
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);
  return expiryDate > now && expiryDate <= threeMonths;
}

function isClearanceExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  return new Date(expiry) <= new Date();
}

export default function ContractorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const { data: contractor, isLoading } = useQuery<Contractor>({
    queryKey: ["/api/contractors", id],
  });

  const { data: timesheetsList } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets/contractor", id],
    enabled: !!id,
  });

  const { data: invoicesList } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices/contractor", id],
    enabled: !!id,
  });

  const { data: documentsList } = useQuery<Document[]>({
    queryKey: ["/api/documents", id],
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("PATCH", `/api/contractors/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", id] });
      toast({ title: "Updated", description: "Contractor details saved." });
      setEditingField(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function startEdit(field: string, currentValue: string) {
    setEditingField(field);
    setEditValues({ ...editValues, [field]: currentValue || "" });
  }

  function cancelEdit() {
    setEditingField(null);
  }

  function saveEdit(field: string) {
    updateMutation.mutate({ [field]: editValues[field] });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Loading..." />
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="max-w-4xl mx-auto space-y-4">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-60 w-full rounded-md" />
          </div>
        </main>
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Contractor Not Found" />
        <main className="flex-1 overflow-auto p-6 bg-muted/30 flex items-center justify-center">
          <Card>
            <CardContent className="py-12 px-8 text-center">
              <div className="text-lg font-semibold mb-2">Contractor not found</div>
              <Link href="/contractors">
                <Button variant="secondary">Back to Contractors</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const monthlyAllocation = (contractor.contractHoursPA || 2000) / 12;
  const clearanceExpiring = isClearanceExpiringSoon(contractor.clearanceExpiry);
  const clearanceExpired = isClearanceExpired(contractor.clearanceExpiry);

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={`${contractor.firstName} ${contractor.lastName}`}
        subtitle={contractor.jobTitle || "Contractor"}
        actions={
          <Link href="/contractors">
            <Button variant="secondary" size="sm" data-testid="button-back-contractors">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-5">
                <div className={`w-14 h-14 rounded-md flex items-center justify-center font-bold text-lg flex-shrink-0 border ${getAvatarColor(contractor.firstName + contractor.lastName)}`}>
                  {getInitials(contractor.firstName, contractor.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h2 className="text-xl font-bold text-foreground" data-testid="text-contractor-full-name">
                      {contractor.firstName} {contractor.lastName}
                    </h2>
                    <StatusBadge status={contractor.status} />
                    {contractor.clearanceLevel && contractor.clearanceLevel !== "NONE" && (
                      <span className="text-xs font-semibold flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-600 dark:text-amber-400">{contractor.clearanceLevel}</span>
                        {contractor.clearanceExpiry && (
                          <span className={`font-normal ml-1 ${
                            clearanceExpired
                              ? "text-destructive"
                              : clearanceExpiring
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }`}>
                            exp. {new Date(contractor.clearanceExpiry).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
                          </span>
                        )}
                        {clearanceExpired && (
                          <Badge variant="destructive" className="ml-1" data-testid="badge-clearance-expired">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Expired
                          </Badge>
                        )}
                        {clearanceExpiring && !clearanceExpired && (
                          <Badge variant="secondary" className="ml-1" data-testid="badge-clearance-expiring">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Expiring Soon
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="w-full justify-start flex-wrap gap-1" data-testid="tabs-contractor-detail">
              <TabsTrigger value="profile" data-testid="tab-profile">
                <User className="w-4 h-4 mr-1.5" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="timesheets" data-testid="tab-timesheets">
                <Clock className="w-4 h-4 mr-1.5" />
                Timesheets
              </TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-invoices">
                <Receipt className="w-4 h-4 mr-1.5" />
                Invoices
              </TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents">
                <FileText className="w-4 h-4 mr-1.5" />
                Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Contact & Employment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    <EditableField
                      icon={Mail}
                      label="Email"
                      field="email"
                      value={contractor.email}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-email"
                    />
                    <EditableField
                      icon={Phone}
                      label="Phone"
                      field="phone"
                      value={contractor.phone || "Not provided"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-phone"
                    />
                    <EditableField
                      icon={Briefcase}
                      label="Job Title"
                      field="jobTitle"
                      value={contractor.jobTitle || "Not set"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-job-title"
                    />
                    <EditableField
                      icon={MapPin}
                      label="Client"
                      field="clientName"
                      value={contractor.clientName || "Not assigned"}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-client"
                    />
                    <EditableField
                      icon={DollarSign}
                      label="Rate ($/hr)"
                      field="hourlyRate"
                      value={contractor.hourlyRate ? `$${contractor.hourlyRate}/hr` : "Not set"}
                      rawValue={contractor.hourlyRate || ""}
                      editingField={editingField}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      onStartEdit={startEdit}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      isPending={updateMutation.isPending}
                      testId="text-rate"
                    />
                    <InfoRow icon={Calendar} label="Start Date" value={contractor.startDate ? new Date(contractor.startDate).toLocaleDateString("en-AU") : "Not set"} testId="text-start-date" />
                    <InfoRow icon={Clock} label="Contract Hours" value={`${contractor.contractHoursPA?.toLocaleString()} h/yr (${Math.round(monthlyAllocation)} h/mo)`} testId="text-contract-hours" />
                    <InfoRow icon={MapPin} label="Location" value={[contractor.suburb, contractor.state].filter(Boolean).join(", ") || "Not set"} testId="text-location" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
                  <CardTitle className="text-base">Notes</CardTitle>
                  {editingField !== "notes" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit("notes", contractor.notes || "")}
                      data-testid="button-edit-notes"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {editingField === "notes" ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValues["notes"] || ""}
                        onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                        className="min-h-[100px]"
                        data-testid="input-notes"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit("notes")}
                          disabled={updateMutation.isPending}
                          data-testid="button-save-notes"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          data-testid="button-cancel-notes"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-notes">
                      {contractor.notes || "No notes added."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timesheets" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Timesheets</CardTitle>
                </CardHeader>
                <CardContent>
                  {!timesheetsList || timesheetsList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-timesheets">
                      No timesheets submitted yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {timesheetsList.map((ts) => (
                        <div
                          key={ts.id}
                          className="flex items-center justify-between gap-4 py-3 px-3 rounded-md bg-muted/50"
                          data-testid={`timesheet-row-${ts.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {MONTHS[ts.month]} {ts.year}
                            </div>
                            <StatusBadge status={ts.status} />
                          </div>
                          <div className="flex items-center gap-4 text-sm flex-wrap">
                            <span className="font-mono text-muted-foreground">{ts.totalHours}h</span>
                            {ts.regularHours && parseFloat(ts.overtimeHours || "0") > 0 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                +{ts.overtimeHours}h OT
                              </span>
                            )}
                            <span className="font-mono text-foreground font-medium">
                              ${parseFloat(ts.grossValue || "0").toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoices" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Invoices</CardTitle>
                </CardHeader>
                <CardContent>
                  {!invoicesList || invoicesList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-invoices">
                      No invoices found.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invoicesList.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between gap-4 py-3 px-3 rounded-md bg-muted/50"
                          data-testid={`invoice-row-${inv.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {inv.invoiceNumber || `${MONTHS[inv.month]} ${inv.year}`}
                            </div>
                            <StatusBadge status={inv.status} />
                          </div>
                          <div className="flex items-center gap-4 text-sm flex-wrap">
                            {inv.hours && (
                              <span className="font-mono text-muted-foreground">{inv.hours}h</span>
                            )}
                            <span className="font-mono text-foreground font-medium">
                              ${parseFloat(inv.amountInclGst).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            {inv.dueDate && (
                              <span className="text-xs text-muted-foreground">
                                Due {new Date(inv.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <DocumentsTab contractorId={id!} documents={documentsList || []} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

const DOC_CATEGORIES = [
  "Contract",
  "Tax File Number Declaration",
  "Super Choice Form",
  "ID Verification",
  "Police Check",
  "Working With Vulnerable People",
  "Qualification / Certification",
  "Other",
] as const;

const CATEGORY_ICONS: Record<string, any> = {
  "Contract": FileBadge,
  "Tax File Number Declaration": Landmark,
  "Super Choice Form": CreditCard,
  "ID Verification": IdCard,
  "Police Check": Search,
  "Working With Vulnerable People": ShieldCheck,
  "Qualification / Certification": GraduationCap,
  "Other": File,
};

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab({ contractorId, documents }: { contractorId: string; documents: Document[] }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [category, setCategory] = useState<string>(DOC_CATEGORIES[0]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (payload: { name: string; category: string; fileType: string; fileUrl: string; fileSize: number }) => {
      const res = await apiRequest("POST", `/api/documents/${contractorId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", contractorId] });
      toast({ title: "Uploaded", description: "Document uploaded successfully." });
      setFile(null);
      setCustomName("");
      setCategory(DOC_CATEGORIES[0]);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      setDeletingId(docId);
      const res = await apiRequest("DELETE", `/api/documents/doc/${docId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", contractorId] });
      toast({ title: "Deleted", description: "Document removed." });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setDeletingId(null);
    },
  });

  const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const validateFile = (f: File): boolean => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast({ title: "Invalid file", description: "Please upload PDF, image, or Word document.", variant: "destructive" });
      return false;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "File must be under 10 MB.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleFile = useCallback((f: File) => {
    if (validateFile(f)) {
      setFile(f);
      if (!customName) setCustomName(f.name.replace(/\.[^.]+$/, ""));
    }
  }, [customName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uploadMutation.mutate({
        name: customName || file.name,
        category,
        fileType: file.type,
        fileUrl: reader.result as string,
        fileSize: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-lg" data-testid="text-no-documents">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <div className="text-sm text-muted-foreground">No documents uploaded yet.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const IconComp = CATEGORY_ICONS[doc.category || "Other"] || File;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 py-3 px-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                    data-testid={`document-row-${doc.id}`}
                  >
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <IconComp className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate" data-testid={`text-doc-name-${doc.id}`}>
                        {doc.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {doc.category || doc.type}
                        {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ""}
                        {" · "}
                        {new Date(doc.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {doc.fileUrl && (
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-view-doc-${doc.id}`}>
                          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deletingId === doc.id}
                        data-testid={`button-delete-doc-${doc.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {deletingId === doc.id ? "..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-primary bg-primary/5"
                : file
                  ? "border-green-500 bg-green-50 dark:bg-green-900/10"
                  : "border-border hover:border-primary/50"
            }`}
            data-testid="dropzone-document"
          >
            {file ? (
              <>
                <FileText className="w-6 h-6 mx-auto text-green-600 dark:text-green-400 mb-1.5" />
                <div className="text-xs font-semibold text-green-700 dark:text-green-300 truncate">{file.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{formatFileSize(file.size)}</div>
              </>
            ) : (
              <>
                <CloudUpload className="w-7 h-7 mx-auto text-muted-foreground mb-1.5" />
                <div className="text-xs text-muted-foreground">
                  Drag & drop or <span className="text-primary font-semibold">browse</span>
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">PDF, Word, images — max 10 MB</div>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
            data-testid="input-document-file"
          />

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Document Name</label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Employment Contract 2024"
              className="h-8 text-sm"
              data-testid="input-document-name"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-document-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploadMutation.isPending || !file}
            className="w-full"
            data-testid="button-upload-document"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, testId }: { icon: any; label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-sm text-foreground truncate" data-testid={testId}>{value}</span>
    </div>
  );
}

interface EditableFieldProps {
  icon: any;
  label: string;
  field: string;
  value: string;
  rawValue?: string;
  editingField: string | null;
  editValues: Record<string, string>;
  setEditValues: (v: Record<string, string>) => void;
  onStartEdit: (field: string, value: string) => void;
  onSave: (field: string) => void;
  onCancel: () => void;
  isPending: boolean;
  testId: string;
}

function EditableField({
  icon: Icon, label, field, value, rawValue, editingField, editValues,
  setEditValues, onStartEdit, onSave, onCancel, isPending, testId
}: EditableFieldProps) {
  const isEditing = editingField === field;

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">{label}:</span>
        <Input
          value={editValues[field] || ""}
          onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
          className="h-7 text-sm flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(field);
            if (e.key === "Escape") onCancel();
          }}
          data-testid={`input-edit-${field}`}
        />
        <Button variant="ghost" size="icon" onClick={() => onSave(field)} disabled={isPending} data-testid={`button-save-${field}`}>
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onCancel} data-testid={`button-cancel-${field}`}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-sm text-foreground truncate" data-testid={testId}>{value}</span>
      <Button
        variant="ghost"
        size="icon"
        className="invisible group-hover:visible"
        onClick={() => onStartEdit(field, rawValue !== undefined ? rawValue : value)}
        data-testid={`button-edit-${field}`}
      >
        <Pencil className="w-3 h-3" />
      </Button>
    </div>
  );
}
