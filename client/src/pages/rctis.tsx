import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Link2,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import type { Employee } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(num);
}

type RctiRecord = {
  id: string;
  clientId: string | null;
  employeeId: string | null;
  month: number;
  year: number;
  hours: string | null;
  hourlyRate: string | null;
  amountExclGst: string;
  gstAmount: string;
  amountInclGst: string;
  description: string | null;
  reference: string | null;
  receivedDate: string | null;
  bankTransactionId: string | null;
  status: string;
  clientName: string | null;
  employeeName: string | null;
};

type ClientRecord = {
  id: string;
  name: string;
  isRcti: boolean;
  isCustomer?: boolean;
};

type EligibleClient = {
  id: string;
  name: string;
  isRcti: boolean;
  isCustomer?: boolean;
  receiveCount: number;
  receiveTotal: number;
};

type SortField = "period" | "client" | "employee" | "hours" | "amountExclGst" | "amountInclGst" | "status";
type SortDir = "asc" | "desc";

export default function RctisPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRcti, setEditingRcti] = useState<RctiRecord | null>(null);
  const [sortField, setSortField] = useState<SortField>("period");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAllClients, setShowAllClients] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const { toast } = useToast();

  const { data: rctiList = [], isLoading } = useQuery<RctiRecord[]>({
    queryKey: ["/api/rctis"],
  });

  const { data: clientList = [] } = useQuery<ClientRecord[]>({
    queryKey: ["/api/clients"],
  });

  const { data: eligibleClients = [] } = useQuery<EligibleClient[]>({
    queryKey: ["/api/rctis/eligible-clients"],
  });

  const { data: employeeList = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const rctiClients = clientList.filter(c => c.isRcti);

  const toggleRctiMutation = useMutation({
    mutationFn: async ({ clientId, isRcti }: { clientId: string; isRcti: boolean }) => {
      const res = await apiRequest("PATCH", `/api/clients/${clientId}`, { isRcti });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rctis/eligible-clients"] });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rctis/auto-match");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Auto-Match Complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/rctis"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to auto-match RCTIs", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/rctis/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "RCTI record removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/rctis"] });
    },
  });

  const filtered = rctiList
    .filter(r => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (r.clientName || "").toLowerCase().includes(q) ||
          (r.employeeName || "").toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q) ||
          (r.reference || "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "period": return dir * (a.year * 100 + a.month - (b.year * 100 + b.month));
        case "client": return dir * (a.clientName || "").localeCompare(b.clientName || "");
        case "employee": return dir * (a.employeeName || "").localeCompare(b.employeeName || "");
        case "hours": return dir * (parseFloat(a.hours || "0") - parseFloat(b.hours || "0"));
        case "amountExclGst": return dir * (parseFloat(a.amountExclGst) - parseFloat(b.amountExclGst));
        case "amountInclGst": return dir * (parseFloat(a.amountInclGst) - parseFloat(b.amountInclGst));
        case "status": return dir * a.status.localeCompare(b.status);
        default: return 0;
      }
    });

  const totalRevenue = rctiList.reduce((s, r) => s + parseFloat(r.amountExclGst || "0"), 0);
  const totalRevenueInclGst = rctiList.reduce((s, r) => s + parseFloat(r.amountInclGst || "0"), 0);
  const receivedCount = rctiList.filter(r => r.status === "RECEIVED" || r.status === "PAID").length;
  const unlinkedCount = rctiList.filter(r => !r.employeeId).length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
  };

  return (
    <>
      <TopBar title="RCTIs" subtitle="Recipient Created Tax Invoices" actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            data-testid="button-auto-match-rctis"
          >
            <Link2 className="w-4 h-4 mr-2" />
            {autoMatchMutation.isPending ? "Matching..." : "Auto-Match Bank Txns"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUploadDialogOpen(true)}
            data-testid="button-upload-rcti"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload RCTI PDF
          </Button>
          <Button
            size="sm"
            onClick={() => { setEditingRcti(null); setDialogOpen(true); }}
            data-testid="button-create-rcti"
          >
            <Plus className="w-4 h-4 mr-2" />
            New RCTI
          </Button>
        </div>
      } />

      <main className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue (ex GST)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-rcti-total-revenue">{formatCurrency(totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total (inc GST)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-rcti-total-incl">{formatCurrency(totalRevenueInclGst)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">RCTI Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-rcti-count">{rctiList.length}</div>
              <p className="text-xs text-muted-foreground mt-1">{receivedCount} received/paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unlinked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-rcti-unlinked">{unlinkedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">No employee assigned</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">RCTI Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Toggle clients that pay via RCTI. Clients with bank RECEIVE transactions are shown automatically.</p>
            {eligibleClients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {eligibleClients.map(c => (
                  <Button
                    key={c.id}
                    variant={c.isRcti ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleRctiMutation.mutate({ clientId: c.id, isRcti: !c.isRcti })}
                    data-testid={`button-toggle-rcti-${c.id}`}
                    title={`${c.receiveCount} receipts · ${formatCurrency(c.receiveTotal)}`}
                  >
                    {c.name}
                    {c.receiveCount > 0 && <span className="ml-1 text-[10px] opacity-60">({c.receiveCount})</span>}
                  </Button>
                ))}
              </div>
            )}
            {rctiClients.length === 0 && eligibleClients.length > 0 && (
              <p className="text-xs text-muted-foreground">Click a client above to mark them as RCTI, then use Auto-Match to create records from bank transactions.</p>
            )}

            {(() => {
              const otherCustomers = clientList
                .filter(c => c.isCustomer && !eligibleClients.some(ec => ec.id === c.id));
              if (otherCustomers.length === 0) return null;
              return (
                <>
                  <div className="pt-1">
                    <button
                      onClick={() => setShowAllClients(!showAllClients)}
                      className="text-xs text-primary hover:underline"
                      data-testid="button-show-all-clients"
                    >
                      {showAllClients ? "Hide other customers" : `Show other customers (${otherCustomers.length})`}
                    </button>
                  </div>
                  {showAllClients && (
                    <div className="space-y-2 pt-1">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search customers..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="pl-8 h-8 text-sm"
                          data-testid="input-client-search"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {otherCustomers
                          .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                          .map(c => (
                            <Button
                              key={c.id}
                              variant={c.isRcti ? "default" : "ghost"}
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => toggleRctiMutation.mutate({ clientId: c.id, isRcti: !c.isRcti })}
                              data-testid={`button-toggle-rcti-all-${c.id}`}
                            >
                              {c.name}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by client, employee, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-rctis"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-rcti-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("period")}>
                    <span className="flex items-center">Period <SortIcon field="period" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("client")}>
                    <span className="flex items-center">Client <SortIcon field="client" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("employee")}>
                    <span className="flex items-center">Employee <SortIcon field="employee" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("hours")}>
                    <span className="flex items-center justify-end">Hours <SortIcon field="hours" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("amountExclGst")}>
                    <span className="flex items-center justify-end">Amount ex GST <SortIcon field="amountExclGst" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("amountInclGst")}>
                    <span className="flex items-center justify-end">Amount inc GST <SortIcon field="amountInclGst" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="flex items-center">Status <SortIcon field="status" /></span>
                  </TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No RCTI records found. Mark clients as RCTI and use Auto-Match to import from bank transactions.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(r => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => { setEditingRcti(r); setDialogOpen(true); }}
                      data-testid={`row-rcti-${r.id}`}
                    >
                      <TableCell className="font-medium" data-testid={`text-rcti-period-${r.id}`}>
                        {MONTHS[r.month]} {r.year}
                      </TableCell>
                      <TableCell data-testid={`text-rcti-client-${r.id}`}>{r.clientName || "—"}</TableCell>
                      <TableCell data-testid={`text-rcti-employee-${r.id}`}>{r.employeeName || "—"}</TableCell>
                      <TableCell className="text-right">{r.hours ? parseFloat(r.hours).toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.amountExclGst)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.amountInclGst)}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.receivedDate ? new Date(r.receivedDate).toLocaleDateString("en-AU") : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(r.id); }}
                          data-testid={`button-delete-rcti-${r.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <RctiDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rcti={editingRcti}
        clients={rctiClients.length > 0 ? rctiClients : clientList}
        employees={employeeList}
      />

      <RctiUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        clients={clientList}
        employees={employeeList}
        existingRctis={rctiList}
      />
    </>
  );
}

function RctiDialog({
  open,
  onOpenChange,
  rcti,
  clients,
  employees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rcti: RctiRecord | null;
  clients: ClientRecord[];
  employees: Employee[];
}) {
  const { toast } = useToast();
  const isEdit = !!rcti;

  const now = new Date();
  const [clientId, setClientId] = useState(rcti?.clientId || "");
  const [employeeId, setEmployeeId] = useState(rcti?.employeeId || "");
  const [month, setMonth] = useState(String(rcti?.month || now.getMonth() + 1));
  const [year, setYear] = useState(String(rcti?.year || now.getFullYear()));
  const [hours, setHours] = useState(rcti?.hours || "");
  const [hourlyRate, setHourlyRate] = useState(rcti?.hourlyRate || "");
  const [amountExclGst, setAmountExclGst] = useState(rcti?.amountExclGst || "");
  const [gstAmount, setGstAmount] = useState(rcti?.gstAmount || "");
  const [amountInclGst, setAmountInclGst] = useState(rcti?.amountInclGst || "");
  const [description, setDescription] = useState(rcti?.description || "");
  const [reference, setReference] = useState(rcti?.reference || "");
  const [receivedDate, setReceivedDate] = useState(rcti?.receivedDate || "");
  const [status, setStatus] = useState(rcti?.status || "DRAFT");

  const resetForm = () => {
    setClientId(rcti?.clientId || "");
    setEmployeeId(rcti?.employeeId || "");
    setMonth(String(rcti?.month || now.getMonth() + 1));
    setYear(String(rcti?.year || now.getFullYear()));
    setHours(rcti?.hours || "");
    setHourlyRate(rcti?.hourlyRate || "");
    setAmountExclGst(rcti?.amountExclGst || "");
    setGstAmount(rcti?.gstAmount || "");
    setAmountInclGst(rcti?.amountInclGst || "");
    setDescription(rcti?.description || "");
    setReference(rcti?.reference || "");
    setReceivedDate(rcti?.receivedDate || "");
    setStatus(rcti?.status || "DRAFT");
  };

  const handleOpenChange = (open: boolean) => {
    if (open) resetForm();
    onOpenChange(open);
  };

  const calcFromHoursRate = () => {
    const h = parseFloat(hours);
    const r = parseFloat(hourlyRate);
    if (!isNaN(h) && !isNaN(r) && h > 0 && r > 0) {
      const exGst = h * r;
      const gst = exGst * 0.1;
      setAmountExclGst(exGst.toFixed(2));
      setGstAmount(gst.toFixed(2));
      setAmountInclGst((exGst + gst).toFixed(2));
    }
  };

  const calcGstFromExGst = () => {
    const ex = parseFloat(amountExclGst);
    if (!isNaN(ex)) {
      const gst = ex * 0.1;
      setGstAmount(gst.toFixed(2));
      setAmountInclGst((ex + gst).toFixed(2));
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/rctis/${rcti!.id}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/rctis", data);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Updated" : "Created", description: `RCTI record ${isEdit ? "updated" : "created"} successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/rctis"] });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to ${isEdit ? "update" : "create"} RCTI`, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!clientId) {
      toast({ title: "Missing client", description: "Please select a client", variant: "destructive" });
      return;
    }
    mutation.mutate({
      clientId: clientId || null,
      employeeId: (employeeId && employeeId !== "none") ? employeeId : null,
      month: parseInt(month),
      year: parseInt(year),
      hours: hours || null,
      hourlyRate: hourlyRate || null,
      amountExclGst: amountExclGst || "0",
      gstAmount: gstAmount || "0",
      amountInclGst: amountInclGst || "0",
      description: description || null,
      reference: reference || null,
      receivedDate: receivedDate || null,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-rcti-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit RCTI" : "New RCTI"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this RCTI record" : "Create a new RCTI record for a client payment"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger data-testid="select-rcti-client">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger data-testid="select-rcti-employee">
                <SelectValue placeholder="Select employee (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger data-testid="select-rcti-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.slice(1).map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                data-testid="input-rcti-year"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                onBlur={calcFromHoursRate}
                data-testid="input-rcti-hours"
              />
            </div>
            <div>
              <Label>Hourly Rate</Label>
              <Input
                type="number"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                onBlur={calcFromHoursRate}
                data-testid="input-rcti-rate"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Amount ex GST</Label>
              <Input
                type="number"
                step="0.01"
                value={amountExclGst}
                onChange={(e) => setAmountExclGst(e.target.value)}
                onBlur={calcGstFromExGst}
                data-testid="input-rcti-ex-gst"
              />
            </div>
            <div>
              <Label>GST</Label>
              <Input
                type="number"
                step="0.01"
                value={gstAmount}
                onChange={(e) => setGstAmount(e.target.value)}
                data-testid="input-rcti-gst"
              />
            </div>
            <div>
              <Label>Amount inc GST</Label>
              <Input
                type="number"
                step="0.01"
                value={amountInclGst}
                onChange={(e) => setAmountInclGst(e.target.value)}
                data-testid="input-rcti-incl-gst"
              />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-rcti-description"
            />
          </div>

          <div>
            <Label>Reference</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              data-testid="input-rcti-reference"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Received Date</Label>
              <Input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                data-testid="input-rcti-received-date"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-rcti-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-rcti">Cancel</Button>
            <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="button-save-rcti">
              {mutation.isPending ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type RctiScanLineItem = {
  contractorNo: string | null;
  contractorName: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  hours: number;
  rateExGst: number;
  totalExGst: number;
};

type RctiScanResult = {
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  fileHash: string;
  clientName: string | null;
  clientAbn: string | null;
  reference: string | null;
  date: string | null;
  dueDate: string | null;
  lineItems: RctiScanLineItem[];
  totalHours: number;
  totalExGst: number;
  gstAmount: number;
  totalInclGst: number;
  confidence: number;
  warnings: string[];
};

type ReviewLineItem = RctiScanLineItem & {
  id: string;
  selected: boolean;
  employeeId: string;
  clientId: string;
  month: number;
  year: number;
  isDuplicate: boolean;
  sourceFile: string;
  reference: string | null;
};

function matchEmployeeName(name: string | null, employees: Employee[]): string {
  if (!name) return "";
  const lower = name.toLowerCase().trim();
  for (const emp of employees) {
    const full = `${emp.firstName} ${emp.lastName}`.toLowerCase().trim();
    if (full === lower) return emp.id;
    const reversed = `${emp.lastName} ${emp.firstName}`.toLowerCase().trim();
    if (reversed === lower) return emp.id;
    const last = (emp.lastName || "").toLowerCase().trim();
    const first = (emp.firstName || "").toLowerCase().trim();
    if (last.length >= 3 && lower.includes(last) && first.length >= 2 && lower.includes(first)) {
      return emp.id;
    }
  }
  return "";
}

function matchClientName(name: string | null, clients: ClientRecord[]): string {
  if (!name) return "";
  const lower = name.toLowerCase().trim();
  for (const c of clients) {
    if (c.name.toLowerCase().trim() === lower) return c.id;
  }
  for (const c of clients) {
    if (lower.includes(c.name.toLowerCase().trim()) || c.name.toLowerCase().trim().includes(lower)) {
      return c.id;
    }
  }
  return "";
}

function deriveMonthYear(startDate: string | null, endDate: string | null, rctiDate: string | null): { month: number; year: number } {
  const now = new Date();
  const dateStr = endDate || startDate || rctiDate;
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return { month: d.getMonth() + 1, year: d.getFullYear() };
      }
    } catch {}
  }
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function RctiUploadDialog({
  open,
  onOpenChange,
  clients,
  employees,
  existingRctis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientRecord[];
  employees: Employee[];
  existingRctis: RctiRecord[];
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<RctiScanResult[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewLineItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<{ created: number; updated: number; skipped: number; duplicates: string[]; errors: string[] } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const resetAll = () => {
    setStep("upload");
    setIsScanning(false);
    setScanResults([]);
    setReviewItems([]);
    setIsSubmitting(false);
    setBatchResult(null);
    setSelectedFiles([]);
    setDragActive(false);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetAll();
    onOpenChange(val);
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      toast({ title: "Invalid files", description: "Please upload PDF files only", variant: "destructive" });
      return;
    }
    setSelectedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      const newFiles = pdfFiles.filter(f => !existingNames.has(f.name));
      return [...prev, ...newFiles];
    });
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleScan = async () => {
    if (selectedFiles.length === 0) return;
    setIsScanning(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append("files", f));
      const res = await fetch("/api/rctis/scan", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Scan failed");
      }
      const data = await res.json();
      const results: RctiScanResult[] = data.results;
      setScanResults(results);

      const items: ReviewLineItem[] = [];
      let idx = 0;
      for (const scan of results) {
        const clientId = matchClientName(scan.clientName, clients);
        for (const li of scan.lineItems) {
          const employeeId = matchEmployeeName(li.contractorName, employees);
          const { month, year } = deriveMonthYear(li.startDate, li.endDate, scan.date);
          const isDuplicate = existingRctis.some(r =>
            r.employeeId === employeeId &&
            r.clientId === clientId &&
            r.month === month &&
            r.year === year &&
            employeeId !== "" &&
            clientId !== "" &&
            Math.abs(parseFloat(r.amountExclGst || "0") - li.totalExGst) < 1
          );
          items.push({
            ...li,
            id: `scan-${idx++}`,
            selected: !isDuplicate,
            employeeId,
            clientId,
            month,
            year,
            isDuplicate,
            sourceFile: scan.fileName,
            reference: scan.reference,
          });
        }
      }
      setReviewItems(items);
      setStep("review");
    } catch (err: any) {
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  const handleCreateBatch = async (forceOverwrite = false) => {
    const selected = reviewItems.filter(i => i.selected);
    if (selected.length === 0) {
      toast({ title: "No items selected", description: "Select at least one line item to create", variant: "destructive" });
      return;
    }

    const missingClient = selected.filter(i => !i.clientId);
    if (missingClient.length > 0) {
      toast({ title: "Missing client", description: `${missingClient.length} item(s) have no client assigned`, variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const scanDateMap = new Map<string, string | null>();
      for (const sr of scanResults) {
        for (const li of sr.lineItems) {
          const key = `${sr.fileName}-${li.contractorName}`;
          scanDateMap.set(key, sr.date || null);
        }
      }

      const items = selected.map(i => {
        const exGst = i.totalExGst;
        const gst = Math.round(exGst * 0.1 * 100) / 100;
        const inclGst = Math.round((exGst + gst) * 100) / 100;
        const scanDate = scanDateMap.get(`${i.sourceFile}-${i.contractorName}`);
        return {
          clientId: i.clientId,
          employeeId: i.employeeId || null,
          month: i.month,
          year: i.year,
          hours: i.hours > 0 ? i.hours.toFixed(2) : null,
          hourlyRate: i.rateExGst > 0 ? i.rateExGst.toFixed(2) : null,
          amountExclGst: exGst.toFixed(2),
          gstAmount: gst.toFixed(2),
          amountInclGst: inclGst.toFixed(2),
          description: [i.contractorName, i.description].filter(Boolean).join(" — ") || null,
          reference: i.reference,
          receivedDate: scanDate || null,
          status: "RECEIVED" as const,
        };
      });

      const res = await apiRequest("POST", "/api/rctis/batch", { items, forceOverwrite });
      const result = await res.json();
      setBatchResult(result);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/rctis"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create RCTIs", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleItem = (id: string) => {
    setReviewItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));
  };

  const toggleAll = (checked: boolean) => {
    setReviewItems(prev => prev.map(i => ({ ...i, selected: checked })));
  };

  const recomputeDuplicates = useCallback((items: ReviewLineItem[]): ReviewLineItem[] => {
    return items.map(item => {
      const isDuplicate = item.employeeId && item.clientId
        ? existingRctis.some(r =>
            r.employeeId === item.employeeId &&
            r.clientId === item.clientId &&
            r.month === item.month &&
            r.year === item.year &&
            Math.abs(parseFloat(r.amountExclGst || "0") - item.totalExGst) < 1
          )
        : false;
      return { ...item, isDuplicate };
    });
  }, [existingRctis]);

  const updateItemField = (id: string, field: keyof ReviewLineItem, value: any) => {
    setReviewItems(prev => recomputeDuplicates(prev.map(i => i.id === id ? { ...i, [field]: value } : i)));
  };

  const selectedCount = reviewItems.filter(i => i.selected).length;
  const totalWarnings = scanResults.reduce((s, r) => s + r.warnings.length, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-rcti-upload">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Upload RCTI PDFs"}
            {step === "review" && "Review Extracted Line Items"}
            {step === "done" && "Upload Complete"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload one or more RCTI PDF files for automatic data extraction"}
            {step === "review" && `${reviewItems.length} line item(s) extracted from ${scanResults.length} file(s). Review and confirm before creating records.`}
            {step === "done" && (batchResult?.message || "RCTI records processed")}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-rcti-upload"
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drop RCTI PDF files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports multiple files. PDF format only.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
                data-testid="input-rcti-file"
              />
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{selectedFiles.length} file(s) selected</Label>
                <div className="space-y-1">
                  {selectedFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-muted/50 rounded px-3 py-1.5 text-sm">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {f.name}
                        <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, i) => i !== idx)); }}
                        data-testid={`button-remove-file-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)} data-testid="button-cancel-upload">Cancel</Button>
              <Button
                onClick={handleScan}
                disabled={selectedFiles.length === 0 || isScanning}
                data-testid="button-scan-rctis"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scanning {selectedFiles.length} file(s)...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Scan & Extract
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {totalWarnings > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">Scan Warnings</p>
                    {scanResults.map((sr, fi) =>
                      sr.warnings.map((w, wi) => (
                        <p key={`${fi}-${wi}`} className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">{sr.fileName}: {w}</p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {scanResults.map((sr, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="font-medium">{sr.fileName}</span>
                <span>{sr.clientName || "Unknown client"}</span>
                {sr.reference && <span>Ref: {sr.reference}</span>}
                <span>{sr.lineItems.length} line item(s)</span>
                <Badge variant={sr.confidence >= 80 ? "default" : sr.confidence >= 60 ? "secondary" : "destructive"} className="text-[10px]">
                  {sr.confidence}% confidence
                </Badge>
              </div>
            ))}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={reviewItems.length > 0 && reviewItems.every(i => i.selected)}
                        onCheckedChange={(c) => toggleAll(!!c)}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Total ex GST</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                        No line items extracted from the uploaded PDFs
                      </TableCell>
                    </TableRow>
                  ) : (
                    reviewItems.map(item => (
                      <TableRow
                        key={item.id}
                        className={item.isDuplicate ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""}
                        data-testid={`row-review-${item.id}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={item.selected}
                            onCheckedChange={() => toggleItem(item.id)}
                            data-testid={`checkbox-item-${item.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{item.contractorName || "—"}</div>
                          {item.contractorNo && <div className="text-xs text-muted-foreground">{item.contractorNo}</div>}
                        </TableCell>
                        <TableCell>
                          <Select value={item.employeeId || "none"} onValueChange={(v) => updateItemField(item.id, "employeeId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-xs w-40" data-testid={`select-employee-${item.id}`}>
                              <SelectValue placeholder="Match employee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Unassigned —</SelectItem>
                              {employees.map(e => (
                                <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={item.clientId || "none"} onValueChange={(v) => updateItemField(item.id, "clientId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-xs w-36" data-testid={`select-client-${item.id}`}>
                              <SelectValue placeholder="Match client" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— None —</SelectItem>
                              {clients.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm">
                          {MONTHS[item.month]} {item.year}
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.hours > 0 ? item.hours.toFixed(1) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{item.rateExGst > 0 ? `$${item.rateExGst.toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(item.totalExGst)}</TableCell>
                        <TableCell>
                          {item.isDuplicate && (
                            <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300">
                              Duplicate
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedCount} of {reviewItems.length} selected
                {reviewItems.some(i => i.isDuplicate) && (
                  <span className="ml-2 text-yellow-600">
                    ({reviewItems.filter(i => i.isDuplicate).length} potential duplicate(s))
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep("upload"); setReviewItems([]); setScanResults([]); }} data-testid="button-back-to-upload">
                  Back
                </Button>
                <Button
                  onClick={() => handleCreateBatch(false)}
                  disabled={isSubmitting || selectedCount === 0}
                  data-testid="button-create-rctis"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Create {selectedCount} RCTI(s)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && batchResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{batchResult.created}</div>
                  <p className="text-xs text-muted-foreground">Created</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{batchResult.updated}</div>
                  <p className="text-xs text-muted-foreground">Updated</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{batchResult.skipped}</div>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </CardContent>
              </Card>
            </div>

            {batchResult.duplicates.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">Duplicate Records Skipped</p>
                {batchResult.duplicates.map((d, i) => (
                  <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300">{d}</p>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => handleCreateBatch(true)}
                  disabled={isSubmitting}
                  data-testid="button-force-overwrite"
                >
                  {isSubmitting ? "Overwriting..." : "Force Overwrite Duplicates"}
                </Button>
              </div>
            )}

            {batchResult.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">Errors</p>
                {batchResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 dark:text-red-300">{e}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => handleOpenChange(false)} data-testid="button-close-upload">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
