import { useState } from "react";
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
} from "lucide-react";
import type { Invoice, Contractor, Timesheet } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  const { data: invoicesList, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: contractors } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: timesheets } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const contractorMap = new Map(contractors?.map((c) => [c.id, c]) || []);

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
    const c = inv.contractorId ? contractorMap.get(inv.contractorId) : undefined;
    const name = c ? `${c.firstName} ${c.lastName}` : "";
    const contact = inv.contactName || "";
    return `${name} ${contact} ${inv.invoiceNumber || ""} ${inv.description || ""}`.toLowerCase().includes(search.toLowerCase());
  });

  const outstanding = filtered?.filter((i) => ["AUTHORISED", "SENT", "OVERDUE"].includes(i.status)) || [];
  const overdue = filtered?.filter((i) => i.status === "OVERDUE") || [];
  const paid = filtered?.filter((i) => i.status === "PAID") || [];
  const authorised = filtered?.filter((i) => i.status === "AUTHORISED") || [];
  const sent = filtered?.filter((i) => i.status === "SENT") || [];

  const voided = filtered?.filter((i) => i.status === "VOIDED") || [];
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
      default: return filtered;
    }
  })();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const raw: Record<string, any> = {};
    formData.forEach((v, k) => { if (v) raw[k] = v as string; });
    const amountExcl = parseFloat(raw.amountExclGst || "0");
    createMutation.mutate({
      contractorId: raw.contractorId,
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
    const c = contractorMap.get(ts.contractorId);
    const rate = c?.hourlyRate ? parseFloat(c.hourlyRate) : 0;
    const hours = parseFloat(ts.totalHours || "0");
    const amountExcl = hours * rate;
    createMutation.mutate({
      contractorId: ts.contractorId,
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
                  <Label>Contractor</Label>
                  <Select name="contractorId" required>
                    <SelectTrigger data-testid="select-invoice-contractor">
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
                  const c = contractorMap.get(ts.contractorId);
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
              </TabsList>

              <TabsContent value={activeTab} className="mt-3">
                {tabInvoices.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Ban className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                      <div className="text-sm text-muted-foreground">No {activeTab === "all" ? "" : activeTab} invoices found</div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {tabInvoices.map((inv) => {
                      const c = inv.contractorId ? contractorMap.get(inv.contractorId) : undefined;
                      const displayName = inv.contactName || (c ? `${c.firstName} ${c.lastName}` : "Unknown");
                      const contractorName = c ? `${c.firstName} ${c.lastName}` : null;
                      return (
                        <Card key={inv.id} className="hover-elevate" data-testid={`card-invoice-${inv.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-foreground font-mono" data-testid={`text-invoice-number-${inv.id}`}>
                                      {inv.invoiceNumber || "\u2014"}
                                    </span>
                                    <StatusBadge status={inv.status} />
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {displayName} · {MONTHS[inv.month]} {inv.year}
                                  </div>
                                  {contractorName && inv.contactName && contractorName !== inv.contactName && (
                                    <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                                      Contractor: {contractorName}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="text-right">
                                  <div className="text-sm font-mono font-bold text-foreground" data-testid={`text-invoice-amount-${inv.id}`}>
                                    {formatCurrency(inv.amountInclGst)}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {formatCurrency(inv.amountExclGst)} + GST
                                  </div>
                                </div>
                                {inv.status === "DRAFT" && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "AUTHORISED" } })}
                                    data-testid={`button-authorise-${inv.id}`}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Authorise
                                  </Button>
                                )}
                                {inv.status === "AUTHORISED" && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "SENT" } })}
                                    data-testid={`button-send-${inv.id}`}
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    Send
                                  </Button>
                                )}
                                {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateMutation.mutate({ id: inv.id, data: { status: "PAID", paidDate: new Date().toISOString().split("T")[0] } })}
                                    data-testid={`button-mark-paid-${inv.id}`}
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    Mark Paid
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}
