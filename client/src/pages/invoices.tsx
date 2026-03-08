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
import { Plus, Search, FileText, DollarSign, CheckCircle, AlertTriangle, Send } from "lucide-react";
import type { Invoice, Contractor } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: invoicesList, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: contractors } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const contractorMap = new Map(contractors?.map((c) => [c.id, c]) || []);

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
    const c = contractorMap.get(inv.contractorId);
    const name = c ? `${c.firstName} ${c.lastName}` : "";
    return `${name} ${inv.invoiceNumber || ""} ${inv.description || ""}`.toLowerCase().includes(search.toLowerCase());
  });

  const grouped = {
    outstanding: filtered?.filter((i) => ["AUTHORISED", "SENT", "OVERDUE"].includes(i.status)) || [],
    paid: filtered?.filter((i) => i.status === "PAID") || [],
    draft: filtered?.filter((i) => i.status === "DRAFT") || [],
    voided: filtered?.filter((i) => i.status === "VOIDED") || [],
  };

  const totalOutstanding = grouped.outstanding.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);

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

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Invoices"
        subtitle={`${formatCurrency(totalOutstanding)} outstanding`}
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
            <Tabs defaultValue="outstanding">
              <TabsList data-testid="tabs-invoice-status">
                <TabsTrigger value="outstanding" className="gap-1.5" data-testid="tab-outstanding">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Outstanding ({grouped.outstanding.length})
                </TabsTrigger>
                <TabsTrigger value="paid" className="gap-1.5" data-testid="tab-paid">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Paid ({grouped.paid.length})
                </TabsTrigger>
                <TabsTrigger value="draft" className="gap-1.5" data-testid="tab-draft">
                  <FileText className="w-3.5 h-3.5" />
                  Draft ({grouped.draft.length})
                </TabsTrigger>
              </TabsList>

              {Object.entries(grouped).filter(([k]) => k !== "voided").map(([key, items]) => (
                <TabsContent key={key} value={key}>
                  {items.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                        <div className="text-sm text-muted-foreground">No {key} invoices</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {items.map((inv) => {
                        const c = contractorMap.get(inv.contractorId);
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
                                        {inv.invoiceNumber || "—"}
                                      </span>
                                      <StatusBadge status={inv.status} />
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {c ? `${c.firstName} ${c.lastName}` : "Unknown"} · {MONTHS[inv.month]} {inv.year}
                                    </div>
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
                                  {inv.status === "SENT" && (
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
                                  {inv.status === "OVERDUE" && (
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
              ))}
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}
