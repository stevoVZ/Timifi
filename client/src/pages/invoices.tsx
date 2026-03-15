import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  FileText,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  Send,
  Clock,
  Ban,
  ListFilter,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Building2,
  LinkIcon,
  Unlink,
  Loader2,
  Check,
  X,
  Wand2,
  ChevronRight,
  ChevronLeft,
  Eye,
  Users,
  UserX,
  CircleDollarSign,
  Download,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import type { Invoice, Employee, Timesheet, Placement, InvoiceLineItem, InvoicePayment } from "@shared/schema";

interface GapAnalysisData {
  missing: { employee: { id: string; firstName: string; lastName: string; preferredName?: string | null; clientName?: string | null; chargeOutRate?: string | null; contractCode?: string | null }; placement: { id: string; clientId: string; clientName?: string | null; chargeOutRate?: string | null; payRate?: string | null; roleTitle?: string | null } | null }[];
  unlinked: { id: string; invoiceNumber?: string | null; contactName?: string | null; amountExclGst?: string | null; amountInclGst?: string | null; status: string; issueDate?: string | null; description?: string | null }[];
  unpaid: { id: string; invoiceNumber?: string | null; contactName?: string | null; amountExclGst?: string | null; amountInclGst?: string | null; status: string; issueDate?: string | null; employeeName?: string | null }[];
  month: number;
  year: number;
}

interface InvoiceLine {
  description: string;
  hours: string;
  rate: string;
  amount: string;
  placementId?: string;
}

type ClientRecord = { id: string; name: string };

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

type AlignmentProposal = {
  invoiceId: string;
  invoiceNumber: string | null;
  contactName: string | null;
  clientId: string | null;
  clientName: string | null;
  currentEmployeeId: string | null;
  proposedEmployeeId: string | null;
  proposedEmployeeName: string | null;
  matchMethod: "rate" | "description" | "placement" | "unmatched";
  confidence: "high" | "medium" | "low";
  invoiceRate: number | null;
  placementRate: number | null;
  amountExclGst: string | null;
  amountInclGst: string | null;
  gstAmount: string | null;
  hours: string | null;
  hourlyRate: string | null;
  description: string | null;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
};

function downloadInvoicesCSV(rows: Invoice[]) {
  const headers = ["Invoice Number", "Type", "Contact", "Issue Date", "Due Date", "Amount (Ex GST)", "GST", "Amount (Inc GST)", "Status", "Period"];
  const csvRows = rows.map((inv) => [
    inv.invoiceNumber || "",
    (inv as any).invoiceType || "",
    inv.contactName || "",
    inv.issueDate || "",
    inv.dueDate || "",
    Number(inv.amountExclGst || 0).toFixed(2),
    Number(inv.gstAmount || 0).toFixed(2),
    Number(inv.amountInclGst || 0).toFixed(2),
    inv.status,
    inv.month && inv.year ? `${MONTHS[inv.month]} ${inv.year}` : "",
  ]);
  const csv = [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoices-export-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InvoicesPage() {
  const now = new Date();
  const searchString = useSearch();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "ACCREC" | "ACCPAY">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [gapMonth, setGapMonth] = useState(now.getMonth() + 1);
  const [gapYear, setGapYear] = useState(now.getFullYear());
  const [invForm, setInvForm] = useState({
    clientId: "",
    employeeId: "",
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    issueDate: now.toISOString().split("T")[0],
    dueDate: "",
    hours: "",
    hourlyRate: "",
    amountExclGst: "",
    description: "",
    reference: "",
  });
  const [gstOption, setGstOption] = useState<"GST" | "NO_GST" | "CUSTOM">("GST");
  const [customGstAmount, setCustomGstAmount] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const { toast } = useToast();

  const { data: invoicesList, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: clients } = useQuery<ClientRecord[]>({
    queryKey: ["/api/clients"],
  });

  const { data: allPlacements } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
  });

  const { data: gapData } = useQuery<GapAnalysisData>({
    queryKey: ["/api/invoices/gap-analysis", gapMonth, gapYear],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/gap-analysis?month=${gapMonth}&year=${gapYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (deepLinkHandled || !invoicesList) return;
    const params = new URLSearchParams(searchString);
    const invoiceId = params.get("invoiceId");
    if (invoiceId) {
      const inv = invoicesList.find(i => i.id === invoiceId);
      if (inv) {
        setDetailInvoice(inv);
      }
      setDeepLinkHandled(true);
    }
  }, [invoicesList, searchString, deepLinkHandled]);

  const employeeMap = new Map(employees?.map((c) => [c.id, c]) || []);
  const clientMap = new Map(clients?.map((c) => [c.id, c]) || []);

  const resetForm = () => {
    setInvForm({ clientId: "", employeeId: "", year: String(now.getFullYear()), month: String(now.getMonth() + 1), issueDate: now.toISOString().split("T")[0], dueDate: "", hours: "", hourlyRate: "", amountExclGst: "", description: "", reference: "" });
    setGstOption("GST");
    setCustomGstAmount("");
    setInvoiceLines([]);
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/invoices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/gap-analysis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Invoice created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/invoices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/gap-analysis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Invoice updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = invoicesList?.filter((inv) => {
    if (typeFilter !== "all" && (inv as any).invoiceType !== typeFilter) return false;
    if (categoryFilter !== "all" && ((inv as any).category || "Other") !== categoryFilter) return false;
    const linkedIds: string[] = (inv as any).linkedEmployeeIds || (inv.employeeId ? [inv.employeeId] : []);
    const names = linkedIds.map(id => {
      const emp = employeeMap.get(id);
      return emp ? `${emp.preferredName || emp.firstName} ${emp.lastName}` : "";
    }).join(" ");
    const contact = inv.contactName || "";
    return `${names} ${contact} ${inv.invoiceNumber || ""} ${inv.description || ""}`.toLowerCase().includes(search.toLowerCase());
  });

  const outstanding = filtered?.filter((i) => ["AUTHORISED", "SENT", "OVERDUE"].includes(i.status)) || [];
  const overdue = filtered?.filter((i) => i.status === "OVERDUE") || [];
  const paid = filtered?.filter((i) => i.status === "PAID") || [];
  const authorised = filtered?.filter((i) => i.status === "AUTHORISED") || [];
  const sent = filtered?.filter((i) => i.status === "SENT") || [];
  const voided = filtered?.filter((i) => i.status === "VOIDED") || [];
  const unlinked = filtered?.filter((i) => !i.employeeId && i.status !== "VOIDED" && (!i.invoiceType || i.invoiceType === "ACCREC")) || [];
  const totalBilled = filtered?.filter((i) => i.status !== "VOIDED").reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0) || 0;
  const totalOutstanding = outstanding.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);
  const totalPaid = paid.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);

  const tabInvoices = (() => {
    if (!filtered) return [];
    switch (activeTab) {
      case "authorised": return authorised;
      case "sent": return sent;
      case "overdue": return overdue;
      case "paid": return paid;
      case "voided": return voided;
      case "unlinked": return unlinked;
      default: return filtered;
    }
  })();

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const sortedInvoices = [...tabInvoices].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "number": return (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "") * dir;
      case "type": return ((a as any).invoiceType || "").localeCompare((b as any).invoiceType || "") * dir;
      case "to": return (a.contactName || "").localeCompare(b.contactName || "") * dir;
      case "date": return (a.issueDate || "").localeCompare(b.issueDate || "") * dir;
      case "amount": return (parseFloat(a.amountExclGst || "0") - parseFloat(b.amountExclGst || "0")) * dir;
      case "status": return a.status.localeCompare(b.status) * dir;
      case "period": return (`${a.year}-${String(a.month).padStart(2,"0")}`).localeCompare(`${b.year}-${String(b.month).padStart(2,"0")}`) * dir;
      default: return 0;
    }
  });

  const MONTHS_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const buildAutoFields = (empId: string, clientId: string, month: string, year: string) => {
    const emp = empId ? employeeMap.get(empId) : undefined;
    const result: Partial<typeof invForm> = {};
    const displayFirst = emp?.preferredName || emp?.firstName;
    if (emp?.contractCode) {
      result.description = `${emp.contractCode} - ${displayFirst} ${emp.lastName} - ${emp.roleTitle || ""}`.replace(/ - $/, "");
    } else { result.description = ""; }
    if (emp?.contractCode && clientId) {
      const client = clients?.find(c => c.id === clientId);
      const clientShort = client?.name?.includes("Prime Minister") ? "PM&C" : (client?.name || "");
      const mo = parseInt(month); const yr = year.slice(-2);
      result.reference = `${clientShort} - ${MONTHS_SHORT[mo]} ${yr} - ${emp.contractCode} - ${displayFirst}`;
    } else { result.reference = ""; }
    const placement = emp && clientId ? allPlacements?.find(p => p.employeeId === empId && p.clientId === clientId && p.status === "ACTIVE") : undefined;
    if (placement?.chargeOutRate) result.hourlyRate = placement.chargeOutRate;
    else if (emp?.chargeOutRate) result.hourlyRate = emp.chargeOutRate;
    else result.hourlyRate = "";
    return result;
  };

  const buildLinesForEmployee = (empId: string, month: string, year: string) => {
    if (!empId || !allPlacements) return [];
    const emp = employeeMap.get(empId);
    if (!emp) return [];
    const empActivePlacements = allPlacements.filter(p => p.employeeId === empId && p.status === "ACTIVE");
    const displayFirst = emp.preferredName || emp.firstName;
    const mo = parseInt(month);
    if (empActivePlacements.length <= 1) return [];
    return empActivePlacements.map(p => {
      const clientName = p.clientName || clients?.find(c => c.id === p.clientId)?.name || "";
      const rate = p.chargeOutRate || emp.chargeOutRate || "";
      return {
        description: `${emp.contractCode || ""} - ${displayFirst} ${emp.lastName} - ${MONTHS_SHORT[mo]} ${year.slice(-2)} @ $${parseFloat(rate || "0").toFixed(2)}/hr`.replace(/^ - /, ""),
        hours: "",
        rate: rate || "",
        amount: "",
        placementId: p.id,
      } as InvoiceLine;
    });
  };

  const handleEmployeeSelect = (empId: string) => {
    const autoFields = buildAutoFields(empId, invForm.clientId, invForm.month, invForm.year);
    setInvForm(f => ({ ...f, employeeId: empId, ...autoFields }));
    const lines = buildLinesForEmployee(empId, invForm.month, invForm.year);
    setInvoiceLines(lines);
    if (lines.length > 0 && !invForm.clientId) {
      const firstPlacement = allPlacements?.find(p => p.id === lines[0].placementId);
      if (firstPlacement?.clientId) {
        const cf = buildAutoFields(empId, firstPlacement.clientId, invForm.month, invForm.year);
        setInvForm(f => ({ ...f, employeeId: empId, clientId: firstPlacement.clientId, ...cf }));
      }
    }
  };
  const handleClientSelect = (clientId: string) => {
    setInvForm(f => ({ ...f, clientId, ...buildAutoFields(f.employeeId, clientId, f.month, f.year) }));
  };
  const handleMonthChange = (month: string) => {
    setInvForm(f => {
      const updated = { ...f, month, ...(f.employeeId ? { reference: buildAutoFields(f.employeeId, f.clientId, month, f.year).reference || "" } : {}) };
      return updated;
    });
    if (invForm.employeeId) {
      const lines = buildLinesForEmployee(invForm.employeeId, month, invForm.year);
      if (lines.length > 0) setInvoiceLines(lines);
    }
  };
  const handleYearChange = (year: string) => {
    setInvForm(f => {
      const updated = { ...f, year, ...(f.employeeId ? { reference: buildAutoFields(f.employeeId, f.clientId, f.month, year).reference || "" } : {}) };
      return updated;
    });
    if (invForm.employeeId) {
      const lines = buildLinesForEmployee(invForm.employeeId, invForm.month, year);
      if (lines.length > 0) setInvoiceLines(lines);
    }
  };

  const updateLine = (idx: number, field: keyof InvoiceLine, value: string) => {
    setInvoiceLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "hours" || field === "rate") {
        const h = parseFloat(field === "hours" ? value : l.hours) || 0;
        const r = parseFloat(field === "rate" ? value : l.rate) || 0;
        updated.amount = h && r ? (h * r).toFixed(2) : "";
      }
      return updated;
    }));
  };
  const addLine = () => setInvoiceLines(prev => [...prev, { description: "", hours: "", rate: "", amount: "" }]);
  const removeLine = (idx: number) => setInvoiceLines(prev => prev.filter((_, i) => i !== idx));

  const linesTotalExGst = invoiceLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  const existingInvoiceForPeriod = invForm.employeeId && invoicesList?.find(
    inv => inv.employeeId === invForm.employeeId && inv.month === parseInt(invForm.month) && inv.year === parseInt(invForm.year) && (inv as any).invoiceType === "ACCREC" && inv.status !== "VOIDED"
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (gstOption === "CUSTOM") {
      const gstVal = parseFloat(customGstAmount);
      if (isNaN(gstVal) || gstVal < 0) {
        toast({ title: "Invalid GST amount", description: "Please enter a valid non-negative GST amount", variant: "destructive" });
        return;
      }
    }
    const useLines = invoiceLines.length > 0;
    let amountExcl: number;
    let totalHours: number;
    let lineItemsPayload: any[] | undefined;

    if (useLines) {
      amountExcl = linesTotalExGst;
      totalHours = invoiceLines.reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0);
      lineItemsPayload = invoiceLines.filter(l => parseFloat(l.amount) > 0 || parseFloat(l.hours) > 0).map(l => ({
        description: l.description || invForm.description || undefined,
        hours: parseFloat(l.hours) || 0,
        rate: parseFloat(l.rate) || 0,
        amount: parseFloat(l.amount) || 0,
      }));
    } else {
      const hours = parseFloat(invForm.hours || "0");
      const rate = parseFloat(invForm.hourlyRate || "0");
      amountExcl = hours && rate ? hours * rate : parseFloat(invForm.amountExclGst || "0");
      totalHours = hours;
    }

    createMutation.mutate({
      employeeId: invForm.employeeId || undefined,
      clientId: invForm.clientId || undefined,
      year: parseInt(invForm.year),
      month: parseInt(invForm.month),
      amountExclGst: String(amountExcl.toFixed(2)),
      gstAmount: String((gstOption === "NO_GST" ? 0 : gstOption === "CUSTOM" ? (parseFloat(customGstAmount) || 0) : amountExcl * 0.1).toFixed(2)),
      amountInclGst: String((amountExcl + (gstOption === "NO_GST" ? 0 : gstOption === "CUSTOM" ? (parseFloat(customGstAmount) || 0) : amountExcl * 0.1)).toFixed(2)),
      hours: totalHours ? String(totalHours) : undefined,
      hourlyRate: !useLines && parseFloat(invForm.hourlyRate || "0") ? invForm.hourlyRate : undefined,
      description: invForm.description || undefined,
      issueDate: invForm.issueDate || undefined,
      dueDate: invForm.dueDate || undefined,
      reference: invForm.reference || undefined,
      contactName: invForm.clientId ? clients?.find(c => c.id === invForm.clientId)?.name : undefined,
      status: "DRAFT",
      lineItems: lineItemsPayload,
    });
  };

  const prevGapMonth = () => { if (gapMonth === 1) { setGapMonth(12); setGapYear(gapYear - 1); } else setGapMonth(gapMonth - 1); };
  const nextGapMonth = () => { if (gapMonth === 12) { setGapMonth(1); setGapYear(gapYear + 1); } else setGapMonth(gapMonth + 1); };
  const totalGapIssues = (gapData?.missing.length || 0) + (gapData?.unlinked.length || 0) + (gapData?.unpaid.length || 0);

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Invoices"
        subtitle={`${filtered?.length || 0} invoices · ${formatCurrency(totalBilled)} billed`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadInvoicesCSV(sortedInvoices)} data-testid="button-export-csv">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            {unlinked.length > 0 && (
              <Button variant="outline" onClick={() => setAlignmentOpen(true)} data-testid="button-align-invoices">
                <Wand2 className="w-4 h-4" />
                Align ({unlinked.length})
              </Button>
            )}
          </div>
        }
      />
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
        <div className="max-w-7xl mx-auto space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card data-testid="kpi-total-billed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Billed</p>
                    <p className="text-lg font-bold font-mono" data-testid="text-total-billed">{formatCurrency(totalBilled)}</p>
                    <p className="text-[11px] text-muted-foreground">{(filtered?.length || 0) - voided.length} invoices</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-outstanding">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-orange-500/10 dark:bg-orange-400/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-bold font-mono" data-testid="text-outstanding-total">{formatCurrency(totalOutstanding)}</p>
                    <p className="text-[11px] text-muted-foreground">{outstanding.length} invoices</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-paid">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-emerald-500/10 dark:bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="text-lg font-bold font-mono" data-testid="text-paid-total">{formatCurrency(totalPaid)}</p>
                    <p className="text-[11px] text-muted-foreground">{paid.length} invoices</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1 space-y-4">
              <Card data-testid="section-gap-analysis">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Gap Analysis
                    </CardTitle>
                    {totalGapIssues > 0 && (
                      <Badge variant="destructive" className="text-[10px]" data-testid="badge-gap-count">{totalGapIssues} issue{totalGapIssues !== 1 ? "s" : ""}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevGapMonth} data-testid="button-gap-prev">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs font-medium min-w-[110px] text-center" data-testid="text-gap-period">{MONTHS[gapMonth]} {gapYear}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextGapMonth} data-testid="button-gap-next">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3 max-h-[400px] overflow-y-auto">
                  {gapData?.missing && gapData.missing.length > 0 && (() => {
                    const uniqueEmpIds = [...new Set(gapData.missing.map(m => m.employee.id))];
                    return (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <UserX className="w-3.5 h-3.5 text-red-500" />
                        Missing Invoices ({uniqueEmpIds.length} employee{uniqueEmpIds.length !== 1 ? "s" : ""}, {gapData.missing.length} placement{gapData.missing.length !== 1 ? "s" : ""})
                      </p>
                      <div className="space-y-1">
                        {gapData.missing.map((m, idx) => (
                          <div key={`${m.employee.id}-${m.placement?.id || idx}`} className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-950/20 text-xs" data-testid={`gap-missing-${m.employee.id}-${idx}`}>
                            <div>
                              <span className="font-medium">{m.employee.preferredName || m.employee.firstName} {m.employee.lastName}</span>
                              {m.placement?.clientName && <span className="text-muted-foreground ml-1.5">· {m.placement.clientName}</span>}
                              {m.placement?.chargeOutRate && (
                                <span className="font-mono text-[10px] text-muted-foreground ml-1">@ ${parseFloat(m.placement.chargeOutRate).toFixed(2)}/hr</span>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => {
                              setCreateOpen(true);
                              const clientId = m.placement?.clientId || "";
                              const autoFields = buildAutoFields(m.employee.id, clientId, String(gapMonth), String(gapYear));
                              setInvForm(f => ({ ...f, employeeId: m.employee.id, clientId, month: String(gapMonth), year: String(gapYear), ...autoFields }));
                              const lines = buildLinesForEmployee(m.employee.id, String(gapMonth), String(gapYear));
                              setInvoiceLines(lines);
                            }} data-testid={`button-gap-create-${m.employee.id}-${idx}`}>
                              <Plus className="w-3 h-3" /> Create
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })()}

                  {gapData?.unlinked && gapData.unlinked.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <Unlink className="w-3.5 h-3.5 text-amber-500" />
                        Unlinked Invoices ({gapData.unlinked.length})
                      </p>
                      <div className="space-y-1">
                        {gapData.unlinked.map(u => (
                          <div key={u.id} className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-xs cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/30"
                            onClick={() => { const inv = invoicesList?.find(i => i.id === u.id); if (inv) setDetailInvoice(inv); }}
                            data-testid={`gap-unlinked-${u.id}`}
                          >
                            <div>
                              <span className="font-mono font-medium">{u.invoiceNumber || "—"}</span>
                              <span className="ml-1.5 text-muted-foreground">{u.contactName}</span>
                            </div>
                            <span className="font-mono">{u.amountExclGst ? formatCurrency(u.amountExclGst) : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {gapData?.unpaid && gapData.unpaid.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <CircleDollarSign className="w-3.5 h-3.5 text-orange-500" />
                        Unpaid Invoices ({gapData.unpaid.length})
                      </p>
                      <div className="space-y-1">
                        {gapData.unpaid.map(u => (
                          <div key={u.id} className="flex items-center justify-between p-2 rounded bg-orange-50 dark:bg-orange-950/20 text-xs cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/30"
                            onClick={() => { const inv = invoicesList?.find(i => i.id === u.id); if (inv) setDetailInvoice(inv); }}
                            data-testid={`gap-unpaid-${u.id}`}
                          >
                            <div>
                              <span className="font-mono font-medium">{u.invoiceNumber || "—"}</span>
                              <span className="ml-1.5 text-muted-foreground">{u.employeeName || u.contactName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={u.status} />
                              <span className="font-mono">{u.amountExclGst ? formatCurrency(u.amountExclGst) : "—"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {totalGapIssues === 0 && (
                    <div className="text-center py-6 text-sm text-muted-foreground" data-testid="text-gap-all-clear">
                      <CheckCircle className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                      All invoices accounted for
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="section-create-invoice">
                <CardHeader className="pb-2">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => { setCreateOpen(!createOpen); if (!createOpen) resetForm(); }}
                    data-testid="button-toggle-create"
                  >
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Create Invoice
                    </CardTitle>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${createOpen ? "rotate-90" : ""}`} />
                  </button>
                </CardHeader>
                {createOpen && (
                  <CardContent className="pt-0">
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs">Client (Bill To)</Label>
                          <Select value={invForm.clientId} onValueChange={handleClientSelect}>
                            <SelectTrigger className="h-8 text-xs" data-testid="select-invoice-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                            <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs">Employee</Label>
                          <Select value={invForm.employeeId} onValueChange={handleEmployeeSelect}>
                            <SelectTrigger className="h-8 text-xs" data-testid="select-invoice-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                            <SelectContent>{employees?.map(c => <SelectItem key={c.id} value={c.id}>{c.preferredName || c.firstName} {c.lastName}{c.contractCode ? ` (${c.contractCode})` : ""}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Month</Label>
                          <Select value={invForm.month} onValueChange={handleMonthChange}>
                            <SelectTrigger className="h-8 text-xs" data-testid="select-invoice-month"><SelectValue /></SelectTrigger>
                            <SelectContent>{MONTHS.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Year</Label>
                          <Input type="number" className="h-8 text-xs" value={invForm.year} onChange={e => handleYearChange(e.target.value)} data-testid="input-invoice-year" />
                        </div>
                      </div>

                      {existingInvoiceForPeriod && (
                        <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs" data-testid="warning-duplicate-invoice">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-amber-700 dark:text-amber-400">Invoice already exists for this period</p>
                            <p className="text-muted-foreground mt-0.5">{existingInvoiceForPeriod.invoiceNumber || "Draft"} · {formatCurrency(existingInvoiceForPeriod.amountExclGst || "0")} · {existingInvoiceForPeriod.status}</p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Issue Date</Label>
                          <Input type="date" className="h-8 text-xs" value={invForm.issueDate} onChange={e => setInvForm(f => ({ ...f, issueDate: e.target.value }))} data-testid="input-issue-date" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Due Date</Label>
                          <Input type="date" className="h-8 text-xs" value={invForm.dueDate} onChange={e => setInvForm(f => ({ ...f, dueDate: e.target.value }))} data-testid="input-due-date" />
                        </div>
                      </div>

                      {invoiceLines.length > 0 ? (
                        <div className="space-y-2" data-testid="section-invoice-lines">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">Line Items ({invoiceLines.length})</Label>
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addLine} data-testid="button-add-line">
                              <Plus className="w-3 h-3 mr-1" /> Add Line
                            </Button>
                          </div>
                          {invoiceLines.map((line, idx) => (
                            <div key={idx} className="p-2 rounded border bg-muted/30 space-y-1.5" data-testid={`line-item-${idx}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground font-medium">Line {idx + 1}</span>
                                {invoiceLines.length > 1 && (
                                  <button type="button" className="text-red-400 hover:text-red-600" onClick={() => removeLine(idx)} data-testid={`button-remove-line-${idx}`}>
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              <Input className="h-7 text-xs" placeholder="Description" value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} data-testid={`input-line-desc-${idx}`} />
                              <div className="grid grid-cols-3 gap-1.5">
                                <div>
                                  <span className="text-[10px] text-muted-foreground">Hours</span>
                                  <Input type="number" step="0.01" className="h-7 text-xs font-mono" value={line.hours} onChange={e => updateLine(idx, "hours", e.target.value)} data-testid={`input-line-hours-${idx}`} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground">Rate</span>
                                  <Input type="number" step="0.01" className="h-7 text-xs font-mono" value={line.rate} onChange={e => updateLine(idx, "rate", e.target.value)} data-testid={`input-line-rate-${idx}`} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground">Amount</span>
                                  <Input type="number" step="0.01" className="h-7 text-xs font-mono bg-muted/50" value={line.amount} onChange={e => updateLine(idx, "amount", e.target.value)} data-testid={`input-line-amount-${idx}`} />
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                            <span className="font-medium">Total (excl. GST)</span>
                            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400" data-testid="text-lines-total">{formatCurrency(linesTotalExGst)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">Billing</Label>
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addLine} data-testid="button-add-line">
                              <Plus className="w-3 h-3 mr-1" /> Multi-line
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Hours</Label>
                              <Input type="number" step="0.01" className="h-8 text-xs font-mono" value={invForm.hours} onChange={e => setInvForm(f => ({ ...f, hours: e.target.value }))} data-testid="input-hours" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Hourly Rate</Label>
                              <Input type="number" step="0.01" className="h-8 text-xs font-mono" value={invForm.hourlyRate} onChange={e => setInvForm(f => ({ ...f, hourlyRate: e.target.value }))} data-testid="input-hourly-rate" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Amount (excl. GST)</Label>
                            <Input type="number" step="0.01" className="h-8 text-xs font-mono" value={invForm.amountExclGst} onChange={e => setInvForm(f => ({ ...f, amountExclGst: e.target.value }))} placeholder="Auto from hours x rate" data-testid="input-amount" />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs">GST Treatment</Label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant={gstOption === "GST" ? "default" : "outline"} className="h-7 text-xs flex-1" onClick={() => setGstOption("GST")} data-testid="button-gst-standard">
                            10% GST
                          </Button>
                          <Button type="button" size="sm" variant={gstOption === "NO_GST" ? "default" : "outline"} className="h-7 text-xs flex-1" onClick={() => setGstOption("NO_GST")} data-testid="button-gst-free">
                            GST Free
                          </Button>
                          <Button type="button" size="sm" variant={gstOption === "CUSTOM" ? "default" : "outline"} className="h-7 text-xs flex-1" onClick={() => setGstOption("CUSTOM")} data-testid="button-gst-custom">
                            Custom
                          </Button>
                        </div>
                        {gstOption === "CUSTOM" && (
                          <Input type="number" step="0.01" className="h-8 text-xs font-mono mt-1" value={customGstAmount} onChange={e => setCustomGstAmount(e.target.value)} placeholder="Enter GST amount" data-testid="input-custom-gst" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input className="h-8 text-xs" value={invForm.description} onChange={e => setInvForm(f => ({ ...f, description: e.target.value }))} data-testid="input-description" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reference</Label>
                        <Input className="h-8 text-xs" value={invForm.reference} onChange={e => setInvForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. Contract number" data-testid="input-reference" />
                      </div>
                      <Button type="submit" size="sm" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-invoice">
                        {createMutation.isPending ? "Creating..." : invoiceLines.length > 0 ? `Create Draft (${invoiceLines.length} lines)` : "Create Draft Invoice"}
                      </Button>
                    </form>
                  </CardContent>
                )}
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-search-invoices" />
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5" data-testid="filter-invoice-type">
                  {([
                    { value: "all" as const, label: "All" },
                    { value: "ACCREC" as const, label: "Receivable" },
                    { value: "ACCPAY" as const, label: "Payable" },
                  ]).map(opt => (
                    <button key={opt.value} onClick={() => setTypeFilter(opt.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${typeFilter === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid={`filter-type-${opt.value}`}
                    >{opt.label}</button>
                  ))}
                </div>
                {typeFilter === "ACCPAY" && (
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-40 h-8 text-xs" data-testid="filter-category"><SelectValue placeholder="All Categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {["Software","Insurance","Tax","Office","Vehicle","Professional Services","Subscriptions","Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-3">{[1,2,3].map(i => <Card key={i}><CardContent className="p-5"><Skeleton className="h-4 w-48 mb-2" /><Skeleton className="h-3 w-32" /></CardContent></Card>)}</div>
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="flex-wrap" data-testid="tabs-invoice-status">
                    <TabsTrigger value="all" className="gap-1" data-testid="tab-all">All ({filtered?.length || 0})</TabsTrigger>
                    <TabsTrigger value="authorised" className="gap-1" data-testid="tab-authorised">Auth ({authorised.length})</TabsTrigger>
                    <TabsTrigger value="sent" className="gap-1" data-testid="tab-sent">Sent ({sent.length})</TabsTrigger>
                    <TabsTrigger value="overdue" className="gap-1" data-testid="tab-overdue">Overdue ({overdue.length})</TabsTrigger>
                    <TabsTrigger value="paid" className="gap-1" data-testid="tab-paid">Paid ({paid.length})</TabsTrigger>
                    <TabsTrigger value="voided" className="gap-1" data-testid="tab-voided">Voided ({voided.length})</TabsTrigger>
                    {unlinked.length > 0 && <TabsTrigger value="unlinked" className="gap-1" data-testid="tab-unlinked">Unlinked ({unlinked.length})</TabsTrigger>}
                  </TabsList>

                  <TabsContent value={activeTab} className="mt-3">
                    {sortedInvoices.length === 0 ? (
                      <Card><CardContent className="py-12 text-center"><Ban className="w-8 h-8 mx-auto text-muted-foreground mb-3" /><div className="text-sm text-muted-foreground">No {activeTab === "all" ? "" : activeTab} invoices found</div></CardContent></Card>
                    ) : (
                      <Card>
                        <CardContent className="p-0">
                          <div className="flex items-center justify-end px-4 py-2 border-b text-xs text-muted-foreground">{sortedInvoices.length} item{sortedInvoices.length !== 1 ? "s" : ""}</div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <InvSortHeader field="number" label="Number" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                  <InvSortHeader field="type" label="Type" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                  <InvSortHeader field="to" label="Contact" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                  <InvSortHeader field="period" label="Period" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                  <InvSortHeader field="date" label="Issued" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                  <InvSortHeader field="amount" label="Amount" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                                  <InvSortHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center" />
                                  <TableHead className="text-right w-28">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sortedInvoices.map(inv => {
                                  const linkedIds: string[] = (inv as any).linkedEmployeeIds || (inv.employeeId ? [inv.employeeId] : []);
                                  const linkedNames = linkedIds.map(id => { const emp = employeeMap.get(id); return emp ? `${emp.preferredName || emp.firstName} ${emp.lastName}` : null; }).filter(Boolean);
                                  const displayName = linkedNames.length > 0 ? linkedNames.join(", ") : (inv.contactName || "Unknown");
                                  return (
                                    <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailInvoice(inv)}>
                                      <TableCell><span className="font-mono font-medium text-xs" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber || "—"}</span></TableCell>
                                      <TableCell><InvoiceTypeBadge type={(inv as any).invoiceType} testId={`badge-type-${inv.id}`} /></TableCell>
                                      <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-xs font-medium">{displayName}</span>
                                          {(inv as any).clientId && clientMap.get((inv as any).clientId) && (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3" />{clientMap.get((inv as any).clientId)!.name}</span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs whitespace-nowrap">{MONTHS_SHORT[inv.month]} {inv.year}</TableCell>
                                      <TableCell className="text-xs whitespace-nowrap">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}</TableCell>
                                      <TableCell className="text-right font-mono text-xs" data-testid={`text-invoice-amount-${inv.id}`}>{formatCurrency(inv.amountExclGst || "0")}</TableCell>
                                      <TableCell className="text-center"><StatusBadge status={inv.status} /></TableCell>
                                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                        {inv.status === "DRAFT" && <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "AUTHORISED" } })} data-testid={`button-authorise-${inv.id}`}>Authorise</Button>}
                                        {(inv.status === "AUTHORISED" || inv.status === "SENT" || inv.status === "OVERDUE") && <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "PAID", paidDate: new Date().toISOString().split("T")[0] } })} data-testid={`button-mark-paid-${inv.id}`}>Mark Paid</Button>}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        </div>
      </main>

      {detailInvoice && (
        <InvoiceDetailDialog
          invoice={detailInvoice}
          employees={employees || []}
          placements={allPlacements || []}
          clientMap={clientMap}
          onClose={() => setDetailInvoice(null)}
          onSave={(id, data) => {
            updateMutation.mutate({ id, data }, {
              onSuccess: () => setDetailInvoice(null),
            });
          }}
          isPending={updateMutation.isPending}
        />
      )}

      {alignmentOpen && (
        <AlignmentWizardDialog
          employees={employees || []}
          placements={allPlacements || []}
          onClose={() => setAlignmentOpen(false)}
          onComplete={() => {
            setAlignmentOpen(false);
            queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
            queryClient.invalidateQueries({ queryKey: ["/api/invoices/gap-analysis"] });
            toast({ title: "Alignment complete" });
          }}
        />
      )}
    </div>
  );
}


function AlignmentWizardDialog({
  employees,
  placements,
  onClose,
  onComplete,
}: {
  employees: Employee[];
  placements: Placement[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [proposals, setProposals] = useState<AlignmentProposal[]>([]);
  const [decisions, setDecisions] = useState<Map<string, { action: "accept" | "skip"; employeeIds: string[] }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ accepted: number; skipped: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const { toast } = useToast();

  const fetchPreview = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiRequest("POST", "/api/invoices/alignment-preview");
      const data: AlignmentProposal[] = await res.json();
      setProposals(data);
      const newDecisions = new Map<string, { action: "accept" | "skip"; employeeIds: string[] }>();
      for (const p of data) {
        if (p.proposedEmployeeId && (p.confidence === "high" || p.confidence === "medium")) {
          newDecisions.set(p.invoiceId, { action: "accept", employeeIds: [p.proposedEmployeeId] });
        } else {
          newDecisions.set(p.invoiceId, { action: "skip", employeeIds: p.proposedEmployeeId ? [p.proposedEmployeeId] : [] });
        }
      }
      setDecisions(newDecisions);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load alignment preview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPreview(); }, []);

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const items = Array.from(decisions.entries()).map(([invoiceId, d]) => ({
        invoiceId,
        employeeIds: d.employeeIds,
        action: d.action,
      }));
      const res = await apiRequest("POST", "/api/invoices/alignment-commit", { decisions: items });
      const data = await res.json();
      setResult({ accepted: data.accepted, skipped: data.skipped });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  const toggleDecision = (invoiceId: string) => {
    setDecisions(prev => {
      const next = new Map(prev);
      const current = next.get(invoiceId);
      if (current) {
        next.set(invoiceId, { ...current, action: current.action === "accept" ? "skip" : "accept" });
      }
      return next;
    });
  };

  const toggleEmployeeForProposal = (invoiceId: string, employeeId: string) => {
    setDecisions(prev => {
      const next = new Map(prev);
      const current = next.get(invoiceId);
      const currentIds = current?.employeeIds || [];
      const hasId = currentIds.includes(employeeId);
      const newIds = hasId ? currentIds.filter(id => id !== employeeId) : [...currentIds, employeeId];
      next.set(invoiceId, { action: newIds.length > 0 ? "accept" : "skip", employeeIds: newIds });
      return next;
    });
  };

  const statusCounts = proposals.reduce((acc, p) => {
    const s = (p.status || "UNKNOWN").toUpperCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusTabs = ["ALL", ...Object.keys(statusCounts).sort()];

  const filteredProposals = statusFilter === "ALL"
    ? proposals
    : proposals.filter(p => (p.status || "UNKNOWN").toUpperCase() === statusFilter);

  const matched = filteredProposals.filter(p => p.matchMethod !== "unmatched");
  const unmatched = filteredProposals.filter(p => p.matchMethod === "unmatched");
  const acceptCount = Array.from(decisions.values()).filter(d => d.action === "accept" && d.employeeIds.length > 0).length;
  const skipCount = proposals.length - acceptCount;

  const statusBadgeColor = (status: string) => {
    const s = status.toUpperCase();
    if (s === "PAID") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (s === "AUTHORISED" || s === "AUTHORIZED") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (s === "SENT" || s === "SUBMITTED") return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    if (s === "VOIDED" || s === "DELETED") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (s === "DRAFT") return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  };

  const methodBadge = (method: string, confidence: string) => {
    const colors: Record<string, string> = {
      placement: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      rate: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      description: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      unmatched: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[method] || colors.unmatched}`} data-testid={`badge-method-${method}`}>
        {method === "placement" ? "Placement" : method === "rate" ? "Rate Match" : method === "description" ? "Name Match" : "No Match"}
      </span>
    );
  };

  if (result) {
    return (
      <Dialog open onOpenChange={() => onComplete()}>
        <DialogContent className="max-w-md" data-testid="dialog-alignment-result">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600" />
              Alignment Complete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-center">
                <p className="text-2xl font-bold text-emerald-600" data-testid="text-accepted-count">{result.accepted}</p>
                <p className="text-xs text-muted-foreground">Linked</p>
              </div>
              <div className="p-3 rounded-md bg-muted text-center">
                <p className="text-2xl font-bold text-muted-foreground" data-testid="text-skipped-count">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
            </div>
            <Button className="w-full" onClick={onComplete} data-testid="button-alignment-done">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-alignment-wizard">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            Invoice Alignment
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Analyzing invoices...</span>
          </div>
        ) : loadError ? (
          <div className="text-center py-8 text-sm text-destructive">
            {loadError}
            <div className="mt-4 flex gap-2 justify-center">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="outline" onClick={fetchPreview}>Retry</Button>
            </div>
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            All invoices are already linked to employees.
            <div className="mt-4">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b" data-testid="alignment-status-filter">
              {statusTabs.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground"
                  }`}
                  data-testid={`filter-status-${s.toLowerCase()}`}
                >
                  {s === "ALL" ? `All (${proposals.length})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${statusCounts[s] || 0})`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground pb-2">
              <span>{filteredProposals.length} invoice{filteredProposals.length !== 1 ? "s" : ""}</span>
              <span className="text-emerald-600 font-medium">{matched.length} auto-matched</span>
              <span className="text-red-500 font-medium">{unmatched.length} need review</span>
              <div className="ml-auto flex items-center gap-2 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  disabled={unmatched.length === 0}
                  data-testid="button-auto-align-by-name"
                  onClick={() => {
                    const wordMatch = (text: string, term: string) => {
                      if (term.length < 2) return false;
                      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
                    };
                    const unmatchedProposals = proposals.filter(p => p.matchMethod === "unmatched");
                    const newMatches: Array<{ invoiceId: string; employeeId: string }> = [];
                    for (const p of unmatchedProposals) {
                      const desc = (p.description || "").trim();
                      if (!desc) continue;
                      const matches = employees.filter(e => {
                        const first = (e.firstName || "").trim();
                        const last = (e.lastName || "").trim();
                        if (!first || !last || last.length < 3) return false;
                        return wordMatch(desc, last) && wordMatch(desc, first);
                      });
                      if (matches.length === 1) {
                        newMatches.push({ invoiceId: p.invoiceId, employeeId: matches[0].id });
                      }
                    }
                    if (newMatches.length > 0) {
                      setDecisions(prev => {
                        const next = new Map(prev);
                        for (const m of newMatches) {
                          next.set(m.invoiceId, { action: "accept", employeeIds: [m.employeeId] });
                        }
                        return next;
                      });
                    }
                    toast({
                      title: newMatches.length > 0 ? `Auto-aligned ${newMatches.length} invoice${newMatches.length !== 1 ? "s" : ""} by name` : "No additional name matches found",
                      description: newMatches.length > 0 ? "Review the matches below before applying." : "Try manually selecting employees for remaining invoices.",
                    });
                  }}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Auto-Align by Name
                </Button>
                <span className="text-emerald-600">{acceptCount} to link</span>
                <span className="text-muted-foreground">{skipCount} to skip</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 divide-y" data-testid="alignment-proposals-list">
              {filteredProposals.map((p) => {
                const decision = decisions.get(p.invoiceId);
                const isAccepted = decision?.action === "accept" && decision.employeeIds.length > 0;
                const isExpanded = expandedId === p.invoiceId;

                const relevantEmployees = p.clientId
                  ? placements
                      .filter(pl => pl.clientId === p.clientId)
                      .map(pl => employees.find(e => e.id === pl.employeeId))
                      .filter((e): e is Employee => !!e)
                  : employees;

                const uniqueEmployees = Array.from(new Map(relevantEmployees.map(e => [e.id, e])).values());
                const employeeList = uniqueEmployees.length > 0 ? uniqueEmployees : employees;
                const selectedIds = decision?.employeeIds || [];

                return (
                  <div key={p.invoiceId} className={`${isAccepted ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`} data-testid={`alignment-row-${p.invoiceId}`}>
                    <div className="py-2.5 px-1 flex items-start gap-3 text-sm">
                      <button
                        onClick={() => toggleDecision(p.invoiceId)}
                        className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                          isAccepted
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-border hover:border-foreground"
                        }`}
                        data-testid={`toggle-${p.invoiceId}`}
                      >
                        {isAccepted && <Check className="w-3 h-3" />}
                      </button>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : p.invoiceId)}
                        className="mt-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`expand-${p.invoiceId}`}
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-medium" data-testid={`text-inv-number-${p.invoiceId}`}>{p.invoiceNumber || "—"}</span>
                          {methodBadge(p.matchMethod, p.confidence)}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeColor(p.status)}`} data-testid={`badge-status-${p.invoiceId}`}>
                            {p.status}
                          </span>
                          {p.issueDate && <span className="text-[10px] text-muted-foreground">{new Date(p.issueDate).toLocaleDateString("en-AU")}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.contactName || "Unknown contact"} · {p.amountExclGst ? formatCurrency(p.amountExclGst) : "—"} {p.hours ? `· ${p.hours}h` : ""}
                          {p.hourlyRate ? ` · $${parseFloat(p.hourlyRate).toFixed(0)}/hr` : ""}
                        </div>
                        {!isExpanded && p.description && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-md">{p.description}</div>
                        )}
                      </div>

                      <div className="flex-shrink-0 w-48">
                        {selectedIds.length > 0 ? (
                          <div className="text-xs space-y-0.5">
                            {selectedIds.map(id => {
                              const emp = employees.find(e => e.id === id);
                              return emp ? (
                                <div key={id} className="flex items-center gap-1">
                                  <Users className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-medium">{emp.preferredName || emp.firstName} {emp.lastName}</span>
                                  <button onClick={() => toggleEmployeeForProposal(p.invoiceId, id)} className="ml-auto text-muted-foreground hover:text-destructive">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No employee selected</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pb-3 pl-12 pr-2 space-y-3" data-testid={`detail-panel-${p.invoiceId}`}>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs bg-muted/50 rounded-md p-3">
                          <div>
                            <span className="text-muted-foreground">Amount (excl GST):</span>
                            <span className="ml-2 font-medium">{p.amountExclGst ? formatCurrency(p.amountExclGst) : "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Amount (incl GST):</span>
                            <span className="ml-2 font-medium">{p.amountInclGst ? formatCurrency(p.amountInclGst) : "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">GST:</span>
                            <span className="ml-2 font-medium">{p.gstAmount ? formatCurrency(p.gstAmount) : "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Hourly Rate:</span>
                            <span className="ml-2 font-medium">{p.hourlyRate ? `$${parseFloat(p.hourlyRate).toFixed(2)}/hr` : "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Hours:</span>
                            <span className="ml-2 font-medium">{p.hours || "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <span className={`ml-2 px-1.5 py-0.5 rounded font-medium ${statusBadgeColor(p.status)}`}>{p.status}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Issue Date:</span>
                            <span className="ml-2 font-medium">{p.issueDate ? new Date(p.issueDate).toLocaleDateString("en-AU") : "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Due Date:</span>
                            <span className="ml-2 font-medium">{p.dueDate ? new Date(p.dueDate).toLocaleDateString("en-AU") : "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Client:</span>
                            <span className="ml-2 font-medium">{p.clientName || p.contactName || "—"}</span>
                          </div>
                          {p.placementRate && (
                            <div>
                              <span className="text-muted-foreground">Placement Rate:</span>
                              <span className="ml-2 font-medium">${p.placementRate.toFixed(2)}/hr</span>
                            </div>
                          )}
                        </div>
                        {p.description && (
                          <div className="text-xs">
                            <span className="text-muted-foreground font-medium">Description:</span>
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground bg-muted/50 rounded-md p-2">{p.description}</p>
                          </div>
                        )}
                        <div className="text-xs">
                          <span className="text-muted-foreground font-medium mb-1.5 block">Assign Employees:</span>
                          <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto bg-muted/30 rounded-md p-2">
                            {employeeList.map(e => {
                              const isSelected = selectedIds.includes(e.id);
                              return (
                                <label
                                  key={e.id}
                                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                                    isSelected ? "bg-emerald-100 dark:bg-emerald-900/30" : "hover:bg-muted"
                                  }`}
                                  data-testid={`employee-check-${p.invoiceId}-${e.id}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleEmployeeForProposal(p.invoiceId, e.id)}
                                    className="rounded border-border"
                                  />
                                  <span className={isSelected ? "font-medium" : ""}>{e.preferredName || e.firstName} {e.lastName}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-3 border-t">
              <Button variant="outline" onClick={onClose} data-testid="button-alignment-cancel">Cancel</Button>
              <div className="flex-1" />
              <Button
                onClick={handleCommit}
                disabled={committing || acceptCount === 0}
                data-testid="button-alignment-apply"
              >
                {committing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" />
                    Apply {acceptCount} Link{acceptCount !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailDialog({
  invoice,
  employees,
  placements,
  clientMap,
  onClose,
  onSave,
  isPending,
}: {
  invoice: Invoice & { linkedEmployeeIds?: string[] };
  employees: Employee[];
  placements: Placement[];
  clientMap: Map<string, ClientRecord>;
  onClose: () => void;
  onSave: (id: string, data: Record<string, any>) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const initialIds = (invoice as any).linkedEmployeeIds?.length
    ? (invoice as any).linkedEmployeeIds as string[]
    : invoice.employeeId ? [invoice.employeeId] : [];
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [empSearch, setEmpSearch] = useState("");
  const [editMonth, setEditMonth] = useState<number>(invoice.month);
  const [editYear, setEditYear] = useState<number>(invoice.year);

  const { data: lineItems, isLoading: lineItemsLoading } = useQuery<InvoiceLineItem[]>({
    queryKey: [`/api/invoices/${invoice.id}/line-items`],
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<InvoicePayment[]>({
    queryKey: [`/api/invoices/${invoice.id}/payments`],
  });

  const pushToXeroMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invoices/${invoice.id}/push-to-xero`);
      return res.json();
    },
    onSuccess: (data: { xeroInvoiceId: string; invoiceNumber: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice pushed to Xero", description: `Invoice ${data.invoiceNumber} created as Draft in Xero` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Push to Xero failed", description: err.message, variant: "destructive" });
    },
  });

  const [confirmRePush, setConfirmRePush] = useState(false);
  const isRePush = !!invoice.xeroInvoiceId || invoice.status !== "DRAFT";

  const periodChanged = editMonth !== invoice.month || editYear !== invoice.year;

  const hasChanged = (() => {
    if (periodChanged) return true;
    const origSet = new Set(initialIds);
    const newSet = new Set(selectedIds);
    if (origSet.size !== newSet.size) return true;
    for (const id of origSet) if (!newSet.has(id)) return true;
    return false;
  })();

  const toggleEmployee = (empId: string) => {
    setSelectedIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const invoiceClientId = (invoice as any).clientId as string | null;

  const placementRateMap = new Map<string, string>();
  if (invoiceClientId) {
    const clientPlacements = placements.filter(
      p => p.clientId === invoiceClientId && p.chargeOutRate
    );
    const activePlacements = clientPlacements.filter(p => p.status === "ACTIVE");
    const endedPlacements = clientPlacements.filter(p => p.status !== "ACTIVE");
    for (const p of [...endedPlacements, ...activePlacements]) {
      placementRateMap.set(p.employeeId, p.chargeOutRate!);
    }
  }

  const filteredEmps = employees.filter(e => {
    if (!empSearch) return true;
    return `${e.preferredName || ""} ${e.firstName} ${e.lastName}`.toLowerCase().includes(empSearch.toLowerCase());
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-invoice-detail">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoice {invoice.invoiceNumber || "—"}
              <InvoiceTypeBadge type={(invoice as any).invoiceType} testId={`badge-type-detail-${invoice.id}`} />
            </DialogTitle>
            <div className="flex items-center gap-2">
              {invoice.xeroInvoiceId && (
                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                  Linked to Xero
                </Badge>
              )}
              {confirmRePush ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-amber-600">Re-push?</span>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { pushToXeroMutation.mutate(); setConfirmRePush(false); }} disabled={pushToXeroMutation.isPending} data-testid="button-confirm-repush">
                    Yes
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmRePush(false)} data-testid="button-cancel-repush">
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={isRePush ? "outline" : "default"}
                  onClick={() => isRePush ? setConfirmRePush(true) : pushToXeroMutation.mutate()}
                  disabled={pushToXeroMutation.isPending}
                  data-testid="button-push-to-xero"
                >
                  {pushToXeroMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Pushing...</>
                  ) : (
                    <><Send className="w-4 h-4" /> {isRePush ? "Re-push" : "Push to Xero"}</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Contact Name</span>
              <span className="font-medium" data-testid="text-detail-contact">{invoice.contactName || "—"}</span>
              {(invoice as any).clientId && clientMap.get((invoice as any).clientId) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" data-testid="text-detail-linked-client">
                  <Building2 className="w-3 h-3" />
                  Linked to {clientMap.get((invoice as any).clientId)!.name}
                </span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Status</span>
              <StatusBadge status={invoice.status} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Amount (excl. GST)</span>
              <span className="font-mono font-medium" data-testid="text-detail-amount">{formatCurrency(invoice.amountExclGst || "0")}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Amount (incl. GST)</span>
              <span className="font-mono font-medium">{formatCurrency(invoice.amountInclGst || "0")}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Hours</span>
              <span className="font-mono">{(() => {
                if (lineItems && lineItems.length > 0) {
                  const sum = lineItems.reduce((s, li) => s + (parseFloat(li.quantity || "0") || 0), 0);
                  if (sum > 0) return `${sum}h`;
                }
                return invoice.hours ? `${invoice.hours}h` : "—";
              })()}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Hourly Rate</span>
              <span className="font-mono">{invoice.hourlyRate ? formatCurrency(invoice.hourlyRate) : "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Issue Date</span>
              <span>{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString("en-AU") : "—"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground block">Work Period</span>
              <div className="flex items-center gap-2 mt-1">
                <Select
                  value={String(editMonth)}
                  onValueChange={(val) => setEditMonth(parseInt(val))}
                >
                  <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-period-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.slice(1).map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(editYear)}
                  onValueChange={(val) => setEditYear(parseInt(val))}
                >
                  <SelectTrigger className="h-8 w-24 text-xs" data-testid="select-period-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const now = new Date().getFullYear();
                      const minYear = Math.min(now - 5, invoice.year);
                      const maxYear = Math.max(now + 4, invoice.year);
                      return Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
                {periodChanged && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">Changed</span>
                )}
              </div>
            </div>
            {(invoice as any).reference && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground block">Reference</span>
                <span className="font-medium" data-testid="text-detail-reference">{(invoice as any).reference}</span>
              </div>
            )}
            {(invoice as any).invoiceType === "ACCPAY" && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground block">Category</span>
                <Select
                  value={(invoice as any).category || ""}
                  onValueChange={(val) => onSave(invoice.id, { category: val })}
                >
                  <SelectTrigger className="h-8 w-48 text-xs" data-testid="select-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Software">Software</SelectItem>
                    <SelectItem value="Insurance">Insurance</SelectItem>
                    <SelectItem value="Tax">Tax</SelectItem>
                    <SelectItem value="Office">Office</SelectItem>
                    <SelectItem value="Vehicle">Vehicle</SelectItem>
                    <SelectItem value="Professional Services">Professional Services</SelectItem>
                    <SelectItem value="Subscriptions">Subscriptions</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {invoice.description && (
            <div className="text-sm">
              <span className="text-xs text-muted-foreground block">Description</span>
              <span className="text-foreground">{invoice.description}</span>
            </div>
          )}

          {lineItemsLoading && (
            <div className="border-t pt-3">
              <Label className="text-sm font-semibold mb-2 block">Line Items</Label>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          )}

          {!lineItemsLoading && lineItems && lineItems.length > 0 && (
            <div className="border-t pt-3" data-testid="section-line-items">
              <Label className="text-sm font-semibold mb-2 block">Line Items ({lineItems.length})</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-20">Qty</TableHead>
                      <TableHead className="text-right w-24">Unit Price</TableHead>
                      <TableHead className="text-right w-24">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((li, idx) => (
                      <TableRow key={li.id || idx} className="text-xs" data-testid={`row-line-item-${idx}`}>
                        <TableCell className="py-1.5">
                          <span className="text-foreground">{li.description || "—"}</span>
                          {li.accountCode && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">{li.accountCode}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono py-1.5">{li.quantity ? parseFloat(li.quantity).toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono py-1.5">{li.unitAmount ? formatCurrency(li.unitAmount) : "—"}</TableCell>
                        <TableCell className="text-right font-mono py-1.5">{li.lineAmount ? formatCurrency(li.lineAmount) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {paymentsLoading && (
            <div className="border-t pt-3">
              <Label className="text-sm font-semibold mb-2 block">Payments</Label>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          )}

          {!paymentsLoading && payments && payments.length > 0 && (
            <div className="border-t pt-3" data-testid="section-payments">
              <Label className="text-sm font-semibold mb-2 block">Payments ({payments.length})</Label>
              <div className="space-y-2">
                {payments.map((pmt, idx) => (
                  <div key={pmt.id || idx} className="flex items-center justify-between p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm" data-testid={`payment-${idx}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">{formatCurrency(pmt.amount)}</span>
                      <span className="text-xs text-muted-foreground">
                        {pmt.paymentDate ? new Date(pmt.paymentDate).toLocaleDateString("en-AU") : "—"}
                        {pmt.bankAccountName && ` · ${pmt.bankAccountName}`}
                      </span>
                    </div>
                    {pmt.reference && (
                      <span className="text-xs text-muted-foreground">Ref: {pmt.reference}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <Label className="text-sm font-semibold mb-2 block">Linked Employees</Label>
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2" data-testid="linked-employees-chips">
                {selectedIds.map(id => {
                  const emp = employees.find(e => e.id === id);
                  return emp ? (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium"
                      data-testid={`chip-employee-${id}`}
                    >
                      {emp.preferredName || emp.firstName} {emp.lastName}
                      <button
                        onClick={() => toggleEmployee(id)}
                        className="ml-0.5 hover:text-destructive"
                        data-testid={`button-remove-employee-${id}`}
                      >
                        ×
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {selectedIds.length === 0 && (
              <div className="text-xs text-muted-foreground mb-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                Not linked to any employee. Select employees below to link this invoice.
              </div>
            )}
            <Input
              placeholder="Search employees..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="mb-2 h-8 text-sm"
              data-testid="input-search-link-employee"
            />
            <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
              {filteredEmps.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm"
                  data-testid={`label-employee-${e.id}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(e.id)}
                    onChange={() => toggleEmployee(e.id)}
                    className="rounded border-border"
                    data-testid={`checkbox-employee-${e.id}`}
                  />
                  <span>{e.preferredName || e.firstName} {e.lastName}</span>
                  {(() => {
                    const placementRate = placementRateMap.get(e.id);
                    const rate = placementRate || e.chargeOutRate;
                    if (!rate) return null;
                    return (
                      <span className={`text-xs ml-auto ${placementRate ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        ${parseFloat(rate).toFixed(0)}/hr
                      </span>
                    );
                  })()}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} data-testid="button-detail-cancel">Cancel</Button>
            <Button
              disabled={!hasChanged || isPending}
              onClick={() => onSave(invoice.id, {
                employeeId: selectedIds.length === 1 ? selectedIds[0] : selectedIds.length === 0 ? null : selectedIds[0],
                linkedEmployeeIds: selectedIds,
                month: editMonth,
                year: editYear,
              })}
              data-testid="button-detail-save"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceTypeBadge({ type, testId }: { type?: string | null; testId?: string }) {
  if (!type) return <span className="text-xs text-muted-foreground">—</span>;
  const isReceivable = type === "ACCREC";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
        isReceivable
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      }`}
      data-testid={testId}
    >
      {isReceivable ? "Receivable" : "Payable"}
    </span>
  );
}

function InvSortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  field: string;
  label: string;
  sortField: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = sortField === field;
  const alignClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        {isActive ? (
          sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40" />
        )}
      </div>
    </TableHead>
  );
}
