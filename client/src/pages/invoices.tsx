import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
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
} from "lucide-react";
import { Link } from "wouter";
import type { Invoice, Employee, Timesheet, Placement } from "@shared/schema";

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
  hours: string | null;
  description: string | null;
  issueDate: string | null;
};

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [sortField, setSortField] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const { toast } = useToast();

  const { data: invoicesList, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: timesheets } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: clients } = useQuery<ClientRecord[]>({
    queryKey: ["/api/clients"],
  });

  const { data: allPlacements } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
  });

  const employeeMap = new Map(employees?.map((c) => [c.id, c]) || []);
  const clientMap = new Map(clients?.map((c) => [c.id, c]) || []);

  const approvedTimesheetsNotInvoiced = timesheets?.filter((ts) => {
    if (ts.status !== "APPROVED") return false;
    const hasInvoice = invoicesList?.some(
      (inv) => inv.timesheetId === ts.id
    );
    return !hasInvoice;
  }) || [];

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/invoices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDialogOpen(false);
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Invoice updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = invoicesList?.filter((inv) => {
    const linkedIds: string[] = (inv as any).linkedEmployeeIds || (inv.employeeId ? [inv.employeeId] : []);
    const names = linkedIds.map(id => {
      const emp = employeeMap.get(id);
      return emp ? `${emp.firstName} ${emp.lastName}` : "";
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
  const unlinked = filtered?.filter((i) => !i.employeeId && i.status !== "VOIDED") || [];
  const totalBilled = filtered?.filter((i) => i.status !== "VOIDED").reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0) || 0;
  const totalOutstanding = outstanding.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);
  const totalOverdue = overdue.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);
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
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedInvoices = [...tabInvoices].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "number": return (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "") * dir;
      case "to": {
        const cA = a.employeeId ? employeeMap.get(a.employeeId) : undefined;
        const cB = b.employeeId ? employeeMap.get(b.employeeId) : undefined;
        const nameA = a.contactName || (cA ? `${cA.firstName} ${cA.lastName}` : "");
        const nameB = b.contactName || (cB ? `${cB.firstName} ${cB.lastName}` : "");
        return nameA.localeCompare(nameB) * dir;
      }
      case "date": return (a.issueDate || "").localeCompare(b.issueDate || "") * dir;
      case "dueDate": return (a.dueDate || "").localeCompare(b.dueDate || "") * dir;
      case "paid": return (parseFloat(a.status === "PAID" ? a.amountInclGst || "0" : "0") - parseFloat(b.status === "PAID" ? b.amountInclGst || "0" : "0")) * dir;
      case "due": return (parseFloat(["AUTHORISED", "SENT", "OVERDUE"].includes(a.status) ? a.amountInclGst || "0" : "0") - parseFloat(["AUTHORISED", "SENT", "OVERDUE"].includes(b.status) ? b.amountInclGst || "0" : "0")) * dir;
      case "status": return a.status.localeCompare(b.status) * dir;
      case "amount": return (parseFloat(a.amountInclGst || "0") - parseFloat(b.amountInclGst || "0")) * dir;
      default: return 0;
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const raw: Record<string, any> = {};
    formData.forEach((v, k) => { if (v) raw[k] = v as string; });
    const amountExcl = parseFloat(raw.amountExclGst || "0");
    createMutation.mutate({
      employeeId: raw.employeeId,
      year: parseInt(raw.year),
      month: parseInt(raw.month),
      amountExclGst: String(amountExcl.toFixed(2)),
      gstAmount: String((amountExcl * 0.1).toFixed(2)),
      amountInclGst: String((amountExcl * 1.1).toFixed(2)),
      description: raw.description || undefined,
      status: "DRAFT",
    });
  };

  const handleCreateFromTimesheet = (ts: Timesheet) => {
    const c = employeeMap.get(ts.employeeId);
    const rate = c?.hourlyRate ? parseFloat(c.hourlyRate) : 0;
    const hours = parseFloat(ts.totalHours || "0");
    const amountExcl = hours * rate;
    createMutation.mutate({
      employeeId: ts.employeeId,
      timesheetId: ts.id,
      year: ts.year,
      month: ts.month,
      amountExclGst: String(amountExcl.toFixed(2)),
      gstAmount: String((amountExcl * 0.1).toFixed(2)),
      amountInclGst: String((amountExcl * 1.1).toFixed(2)),
      hours: ts.totalHours,
      hourlyRate: c?.hourlyRate || "0",
      description: `${MONTHS[ts.month]} ${ts.year} - ${c ? `${c.firstName} ${c.lastName}` : "Unknown"}`,
      status: "AUTHORISED",
    });
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Invoices"
        subtitle={`${filtered?.length || 0} invoices · ${formatCurrency(totalBilled)} billed`}
        actions={
          <div className="flex gap-2">
            {unlinked.length > 0 && (
              <Button variant="outline" onClick={() => setAlignmentOpen(true)} data-testid="button-align-invoices">
                <Wand2 className="w-4 h-4" />
                Align ({unlinked.length})
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-invoice">
                  <Plus className="w-4 h-4" />
                  New Invoice
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Invoice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Employee</Label>
                  <Select name="employeeId" required>
                    <SelectTrigger data-testid="select-invoice-employee">
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
                    <Label htmlFor="inv-year">Year</Label>
                    <Input id="inv-year" name="year" type="number" defaultValue={new Date().getFullYear()} required data-testid="input-invoice-year" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Month</Label>
                    <Select name="month" defaultValue={String(new Date().getMonth() + 1)}>
                      <SelectTrigger data-testid="select-invoice-month">
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
                <div className="space-y-1.5">
                  <Label htmlFor="amountExclGst">Amount (excl. GST)</Label>
                  <Input id="amountExclGst" name="amountExclGst" type="number" step="0.01" required data-testid="input-amount" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" data-testid="input-description" />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-invoice">
                  {createMutation.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card data-testid="kpi-total-billed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total billed</p>
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-total-billed">{formatCurrency(totalBilled)}</p>
                    <p className="text-[11px] text-muted-foreground">{(filtered?.length || 0) - voided.length} invoice{(filtered?.length || 0) - voided.length !== 1 ? "s" : ""}</p>
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
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-outstanding-total">{formatCurrency(totalOutstanding)}</p>
                    <p className="text-[11px] text-muted-foreground">{outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""}</p>
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
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-paid-total">{formatCurrency(totalPaid)}</p>
                    <p className="text-[11px] text-muted-foreground">{paid.length} invoice{paid.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-voided">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Ban className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Voided</p>
                    <p className="text-lg font-bold font-mono text-foreground" data-testid="text-voided-count">{voided.length}</p>
                    <p className="text-[11px] text-muted-foreground">cancelled invoices</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {approvedTimesheetsNotInvoiced.length > 0 && (
            <Card data-testid="section-pending-invoices">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Pending Invoices
                </CardTitle>
                <span className="text-xs text-muted-foreground">{approvedTimesheetsNotInvoiced.length} approved timesheet{approvedTimesheetsNotInvoiced.length !== 1 ? "s" : ""} without invoices</span>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {approvedTimesheetsNotInvoiced.map((ts) => {
                  const c = employeeMap.get(ts.employeeId);
                  return (
                    <div key={ts.id} className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50 flex-wrap" data-testid={`pending-invoice-${ts.id}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {c ? `${c.firstName} ${c.lastName}` : "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {MONTHS[ts.month]} {ts.year} · {ts.totalHours}h · {formatCurrency(ts.grossValue)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleCreateFromTimesheet(ts)}
                        disabled={createMutation.isPending}
                        data-testid={`button-create-invoice-from-ts-${ts.id}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create Invoice
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-invoices"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-5"><Skeleton className="h-4 w-48 mb-2" /><Skeleton className="h-3 w-32" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList data-testid="tabs-invoice-status">
                <TabsTrigger value="all" className="gap-1.5" data-testid="tab-all">
                  <ListFilter className="w-3.5 h-3.5" />
                  All ({filtered?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="authorised" className="gap-1.5" data-testid="tab-authorised">
                  <FileText className="w-3.5 h-3.5" />
                  Authorised ({authorised.length})
                </TabsTrigger>
                <TabsTrigger value="sent" className="gap-1.5" data-testid="tab-sent">
                  <Send className="w-3.5 h-3.5" />
                  Sent ({sent.length})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="gap-1.5" data-testid="tab-overdue">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Overdue ({overdue.length})
                </TabsTrigger>
                <TabsTrigger value="paid" className="gap-1.5" data-testid="tab-paid">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Paid ({paid.length})
                </TabsTrigger>
                <TabsTrigger value="voided" className="gap-1.5" data-testid="tab-voided">
                  <Ban className="w-3.5 h-3.5" />
                  Voided ({voided.length})
                </TabsTrigger>
                {unlinked.length > 0 && (
                  <TabsTrigger value="unlinked" className="gap-1.5" data-testid="tab-unlinked">
                    <Unlink className="w-3.5 h-3.5" />
                    Unlinked ({unlinked.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value={activeTab} className="mt-3">
                {sortedInvoices.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Ban className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                      <div className="text-sm text-muted-foreground">No {activeTab === "all" ? "" : activeTab} invoices found</div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-end px-4 py-2 border-b text-xs text-muted-foreground">
                        {sortedInvoices.length} item{sortedInvoices.length !== 1 ? "s" : ""}
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <InvSortHeader field="number" label="Number" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                              <InvSortHeader field="to" label="To" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                              <InvSortHeader field="date" label="Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                              <InvSortHeader field="dueDate" label="Due Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                              <InvSortHeader field="paid" label="Paid" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                              <InvSortHeader field="due" label="Due" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                              <InvSortHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center" />
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedInvoices.map((inv) => {
                              const linkedIds: string[] = (inv as any).linkedEmployeeIds || (inv.employeeId ? [inv.employeeId] : []);
                              const linkedNames = linkedIds.map(id => {
                                const emp = employeeMap.get(id);
                                return emp ? `${emp.firstName} ${emp.lastName}` : null;
                              }).filter(Boolean);
                              const displayName = inv.contactName || linkedNames.join(", ") || "Unknown";
                              const isPaid = inv.status === "PAID";
                              const isOutstanding = ["AUTHORISED", "SENT", "OVERDUE"].includes(inv.status);
                              return (
                                <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailInvoice(inv)}>
                                  <TableCell>
                                    <span className="font-mono font-medium text-foreground" data-testid={`text-invoice-number-${inv.id}`}>
                                      {inv.invoiceNumber || "—"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-sm text-foreground">{displayName}</span>
                                      {(inv as any).clientId && clientMap.get((inv as any).clientId) && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-invoice-client-${inv.id}`}>
                                          <Building2 className="w-3 h-3" />
                                          {clientMap.get((inv as any).clientId)!.name}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm whitespace-nowrap">
                                    {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : `${MONTHS[inv.month]} ${inv.year}`}
                                  </TableCell>
                                  <TableCell className="text-sm whitespace-nowrap">
                                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {isPaid ? formatCurrency(inv.amountInclGst) : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono" data-testid={`text-invoice-amount-${inv.id}`}>
                                    {isOutstanding ? formatCurrency(inv.amountInclGst) : formatCurrency(0)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <StatusBadge status={inv.status} />
                                  </TableCell>
                                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                    {inv.status === "DRAFT" && (
                                      <Button size="sm" variant="secondary" onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "AUTHORISED" } })} data-testid={`button-authorise-${inv.id}`}>
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Authorise
                                      </Button>
                                    )}
                                    {inv.status === "AUTHORISED" && (
                                      <Button size="sm" onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "SENT" } })} data-testid={`button-send-${inv.id}`}>
                                        <Send className="w-3.5 h-3.5" />
                                        Send
                                      </Button>
                                    )}
                                    {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                                      <Button size="sm" variant="secondary" onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "PAID", paidDate: new Date().toISOString().split("T")[0] } })} data-testid={`button-mark-paid-${inv.id}`}>
                                        <DollarSign className="w-3.5 h-3.5" />
                                        Mark Paid
                                      </Button>
                                    )}
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
  const [decisions, setDecisions] = useState<Map<string, { action: "accept" | "skip"; employeeId: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ accepted: number; skipped: number } | null>(null);
  const { toast } = useToast();

  const fetchPreview = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiRequest("POST", "/api/invoices/alignment-preview");
      const data: AlignmentProposal[] = await res.json();
      setProposals(data);
      const newDecisions = new Map<string, { action: "accept" | "skip"; employeeId: string | null }>();
      for (const p of data) {
        if (p.proposedEmployeeId && (p.confidence === "high" || p.confidence === "medium")) {
          newDecisions.set(p.invoiceId, { action: "accept", employeeId: p.proposedEmployeeId });
        } else {
          newDecisions.set(p.invoiceId, { action: "skip", employeeId: p.proposedEmployeeId });
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
        employeeId: d.employeeId,
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

  const setEmployeeForProposal = (invoiceId: string, employeeId: string) => {
    setDecisions(prev => {
      const next = new Map(prev);
      next.set(invoiceId, { action: "accept", employeeId });
      return next;
    });
  };

  const matched = proposals.filter(p => p.matchMethod !== "unmatched");
  const unmatched = proposals.filter(p => p.matchMethod === "unmatched");
  const acceptCount = Array.from(decisions.values()).filter(d => d.action === "accept" && d.employeeId).length;
  const skipCount = proposals.length - acceptCount;

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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-alignment-wizard">
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
            <div className="flex items-center gap-3 text-xs text-muted-foreground border-b pb-3">
              <span>{proposals.length} unlinked invoice{proposals.length !== 1 ? "s" : ""}</span>
              <span className="text-emerald-600 font-medium">{matched.length} auto-matched</span>
              <span className="text-red-500 font-medium">{unmatched.length} need review</span>
              <div className="ml-auto flex gap-2 text-xs">
                <span className="text-emerald-600">{acceptCount} to link</span>
                <span className="text-muted-foreground">{skipCount} to skip</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 divide-y" data-testid="alignment-proposals-list">
              {proposals.map((p) => {
                const decision = decisions.get(p.invoiceId);
                const isAccepted = decision?.action === "accept" && decision.employeeId;

                const relevantEmployees = p.clientId
                  ? placements
                      .filter(pl => pl.clientId === p.clientId)
                      .map(pl => employees.find(e => e.id === pl.employeeId))
                      .filter((e): e is Employee => !!e)
                  : employees;

                const uniqueEmployees = Array.from(new Map(relevantEmployees.map(e => [e.id, e])).values());

                return (
                  <div key={p.invoiceId} className={`py-2.5 px-1 flex items-start gap-3 text-sm ${isAccepted ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`} data-testid={`alignment-row-${p.invoiceId}`}>
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

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-medium" data-testid={`text-inv-number-${p.invoiceId}`}>{p.invoiceNumber || "—"}</span>
                        {methodBadge(p.matchMethod, p.confidence)}
                        {p.issueDate && <span className="text-[10px] text-muted-foreground">{new Date(p.issueDate).toLocaleDateString("en-AU")}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.contactName || "Unknown contact"} · {p.amountExclGst ? formatCurrency(p.amountExclGst) : "—"} {p.hours ? `· ${p.hours}h` : ""}
                      </div>
                      {p.description && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-md">{p.description}</div>
                      )}
                    </div>

                    <div className="flex-shrink-0 w-44">
                      {p.matchMethod !== "unmatched" && isAccepted ? (
                        <div className="text-xs">
                          <span className="font-medium">{p.proposedEmployeeName}</span>
                          {p.placementRate && <span className="text-muted-foreground ml-1">${p.placementRate.toFixed(0)}/hr</span>}
                        </div>
                      ) : (
                        <select
                          className="w-full text-xs border rounded px-2 py-1 bg-background"
                          value={decision?.employeeId || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              setEmployeeForProposal(p.invoiceId, e.target.value);
                            }
                          }}
                          data-testid={`select-employee-${p.invoiceId}`}
                        >
                          <option value="">Select employee...</option>
                          {(uniqueEmployees.length > 0 ? uniqueEmployees : employees).map(e => (
                            <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                          ))}
                        </select>
                      )}
                    </div>
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
  const initialIds = (invoice as any).linkedEmployeeIds?.length
    ? (invoice as any).linkedEmployeeIds as string[]
    : invoice.employeeId ? [invoice.employeeId] : [];
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [empSearch, setEmpSearch] = useState("");

  const hasChanged = (() => {
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
    return `${e.firstName} ${e.lastName}`.toLowerCase().includes(empSearch.toLowerCase());
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-invoice-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Invoice {invoice.invoiceNumber || "—"}
          </DialogTitle>
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
              <span className="font-mono">{invoice.hours ? `${invoice.hours}h` : "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Hourly Rate</span>
              <span className="font-mono">{invoice.hourlyRate ? formatCurrency(invoice.hourlyRate) : "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Issue Date</span>
              <span>{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString("en-AU") : "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Period</span>
              <span>{MONTHS[invoice.month]} {invoice.year}</span>
            </div>
          </div>

          {invoice.description && (
            <div className="text-sm">
              <span className="text-xs text-muted-foreground block">Description</span>
              <span className="text-foreground">{invoice.description}</span>
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
                      {emp.firstName} {emp.lastName}
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
                  <span>{e.firstName} {e.lastName}</span>
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
