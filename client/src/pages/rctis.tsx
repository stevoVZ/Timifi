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
  Pencil,
  Info,
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
  source: string | null;
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
  const [selectedRctiId, setSelectedRctiId] = useState<string | null>(null);
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
                    <>
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedRctiId(prev => prev === r.id ? null : r.id)}
                        data-testid={`row-rcti-${r.id}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-rcti-period-${r.id}`}>
                          <div className="flex items-center gap-1">
                            {selectedRctiId === r.id
                              ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                              : <ChevronDown className="w-3 h-3 text-muted-foreground opacity-0" />}
                            {MONTHS[r.month]} {r.year}
                          </div>
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
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); setEditingRcti(r); setDialogOpen(true); }}
                              data-testid={`button-edit-rcti-${r.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(r.id); }}
                              data-testid={`button-delete-rcti-${r.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {selectedRctiId === r.id && (
                        <TableRow key={`${r.id}-detail`}>
                          <TableCell colSpan={9} className="p-0 border-b">
                            <RctiProvenancePanel rcti={r} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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

// ─── Data provenance helpers ───────────────────────────────────────────────────

type ProvenanceTag = {
  label: string;
  color: "blue" | "violet" | "purple" | "green" | "teal" | "amber" | "gray";
  tooltip: string;
};

const PROVENANCE_COLORS: Record<ProvenanceTag["color"], string> = {
  blue:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  green:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  teal:   "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  gray:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function getFieldProvenance(field: string, rcti: RctiRecord): ProvenanceTag {
  const src = rcti.source || (rcti.bankTransactionId ? "AUTO_MATCH" : "UNKNOWN");

  const map: Record<string, Record<string, ProvenanceTag>> = {
    AUTO_MATCH: {
      period:         { label: "Bank txn date",   color: "blue",   tooltip: "Month/year of the Xero bank transaction — this is the payment date, not necessarily the work period." },
      receivedDate:   { label: "Bank txn date",   color: "blue",   tooltip: "The date the bank transaction was received, as synced from Xero." },
      amountInclGst:  { label: "Bank txn amount", color: "blue",   tooltip: "The gross amount from the Xero bank transaction — this is the authoritative figure." },
      amountExclGst:  { label: "Calculated",      color: "purple", tooltip: "Derived from the bank amount: inclGST ÷ 11 × 10. Small rounding (±$0.01) is expected." },
      gstAmount:      { label: "Calculated",      color: "purple", tooltip: "Derived from the bank amount: inclGST ÷ 11. ATO standard formula for GST-inclusive receipts." },
      hours:          { label: "Derived",         color: "amber",  tooltip: "Estimated: exGST amount ÷ employee charge-out rate from placement. May be null if no rate was found." },
      hourlyRate:     { label: "Placement rate",  color: "green",  tooltip: "The employee's charge-out rate at this client, taken from their active placement record at the time of auto-match." },
      reference:      { label: "Bank txn",        color: "blue",   tooltip: "The reference field from the Xero bank transaction." },
      description:    { label: "Bank txn",        color: "blue",   tooltip: "The description or reference from the bank transaction. '[UNATTRIBUTED]' suffix added when employee could not be determined." },
      clientId:       { label: "Contact match",   color: "teal",   tooltip: "Matched by normalising the Xero contact name on the bank transaction to an RCTI-flagged client record." },
      employeeId:     { label: "Auto-attributed", color: "teal",   tooltip: "Attribution algorithm: (1) single active placement → direct match; (2) employee name found in description → name match; (3) exGST ÷ rate rounds to quarter-hour → rate check. Null if all three fail." },
      bankTxn:        { label: "Source link",     color: "blue",   tooltip: "The internal ID of the Xero bank transaction this RCTI was created from. Used to prevent duplicate auto-matches." },
    },
    PDF_SCAN: {
      period:         { label: "AI OCR",          color: "violet", tooltip: "Derived from the line item end date (preferred), then start date, then RCTI document date, then current month as fallback." },
      receivedDate:   { label: "AI OCR",          color: "violet", tooltip: "The RCTI document date extracted by GPT-4o Vision. This is the issue date on the document, not the bank receipt date." },
      amountExclGst:  { label: "AI OCR",          color: "violet", tooltip: "Extracted directly from the PDF line item total ex-GST by GPT-4o Vision OCR." },
      amountInclGst:  { label: "Calculated",      color: "purple", tooltip: "Calculated from the AI-extracted ex-GST figure: exGST × 1.10. May differ from printed incl-GST if rounding differs." },
      gstAmount:      { label: "Calculated",      color: "purple", tooltip: "Calculated: exGST × 10%. GST component is always derived, never read directly from the PDF." },
      hours:          { label: "AI OCR",          color: "violet", tooltip: "Hours extracted from the PDF line item by GPT-4o Vision. Verify against the printed document." },
      hourlyRate:     { label: "AI OCR",          color: "violet", tooltip: "Rate per hour extracted from the PDF line item. This is what the client stated on the RCTI, not the system's placement rate." },
      reference:      { label: "AI OCR",          color: "violet", tooltip: "Reference or invoice number extracted from the PDF document." },
      description:    { label: "AI OCR",          color: "violet", tooltip: "Contractor name + line item description from the PDF, joined by ' — '." },
      clientId:       { label: "User selected",   color: "green",  tooltip: "The client was either auto-matched by name during the scan review, or manually selected by the user before saving." },
      employeeId:     { label: "User matched",    color: "green",  tooltip: "The employee was either auto-matched from the contractor name extracted by AI, or manually selected by the user during the review step." },
      bankTxn:        { label: "Not linked",      color: "gray",   tooltip: "PDF-scanned RCTIs are not linked to a bank transaction. If you receive payment later, use the Bank Statements page to link the transaction to this RCTI." },
    },
    MANUAL: {
      period:         { label: "Manual entry",    color: "gray",   tooltip: "Month and year entered manually by admin." },
      receivedDate:   { label: "Manual entry",    color: "gray",   tooltip: "Received date entered manually by admin." },
      amountExclGst:  { label: "Manual entry",    color: "gray",   tooltip: "Amount ex-GST entered manually. Use the auto-calculate button to derive GST from this figure." },
      amountInclGst:  { label: "Manual/Calc",     color: "gray",   tooltip: "Entered manually or auto-calculated from ex-GST. Check both figures are consistent." },
      gstAmount:      { label: "Manual/Calc",     color: "gray",   tooltip: "Entered manually or auto-calculated as ex-GST × 10%." },
      hours:          { label: "Manual entry",    color: "gray",   tooltip: "Hours entered manually by admin." },
      hourlyRate:     { label: "Manual entry",    color: "gray",   tooltip: "Rate entered manually by admin. May differ from the placement charge-out rate." },
      reference:      { label: "Manual entry",    color: "gray",   tooltip: "Reference entered manually." },
      description:    { label: "Manual entry",    color: "gray",   tooltip: "Description entered manually." },
      clientId:       { label: "Manual entry",    color: "gray",   tooltip: "Client selected manually." },
      employeeId:     { label: "Manual entry",    color: "gray",   tooltip: "Employee selected manually (optional)." },
      bankTxn:        { label: "Not linked",      color: "gray",   tooltip: "No bank transaction link. Set one via the Bank Statements page if needed." },
    },
  };

  const fallback: ProvenanceTag = { label: "Unknown", color: "gray", tooltip: "Source of this RCTI is unknown — it predates provenance tracking." };
  const srcMap = map[src] || map["MANUAL"];
  return srcMap[field] || fallback;
}

function PTag({ field, rcti }: { field: string; rcti: RctiRecord }) {
  const p = getFieldProvenance(field, rcti);
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer ${PROVENANCE_COLORS[p.color]}`}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        title={p.tooltip}
      >
        <Info className="w-2.5 h-2.5" />
        {p.label}
      </button>
      {open && (
        <span
          className="absolute z-50 bottom-full left-0 mb-1 w-64 rounded-md border bg-popover text-popover-foreground shadow-md text-xs p-2 leading-relaxed"
          onClick={e => e.stopPropagation()}
        >
          {p.tooltip}
          <button className="block mt-1 text-[10px] text-muted-foreground hover:underline" onClick={() => setOpen(false)}>close</button>
        </span>
      )}
    </span>
  );
}

function RctiProvenancePanel({ rcti }: { rcti: RctiRecord }) {
  const src = rcti.source || (rcti.bankTransactionId ? "AUTO_MATCH" : "UNKNOWN");
  const srcLabel: Record<string, { label: string; color: string }> = {
    AUTO_MATCH: { label: "Auto-matched from bank transaction", color: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-200" },
    PDF_SCAN:   { label: "Created from PDF scan (AI OCR)",     color: "bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-200" },
    MANUAL:     { label: "Manually entered by admin",           color: "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-900/30 dark:border-gray-700 dark:text-gray-300" },
    UNKNOWN:    { label: "Source unknown (predates tracking)",  color: "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-900/30 dark:border-gray-700 dark:text-gray-300" },
  };
  const badge = srcLabel[src] || srcLabel["UNKNOWN"];

  const row = (label: string, value: React.ReactNode, field: string) => (
    <div className="flex items-start justify-between py-2 border-b last:border-b-0 gap-4">
      <div className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5">{label}</div>
      <div className="flex-1 text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</div>
      <div className="flex-shrink-0"><PTag field={field} rcti={rcti} /></div>
    </div>
  );

  return (
    <div className="p-4 bg-muted/30 border-t">
      <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium mb-4 ${badge.color}`}>
        <Info className="w-3 h-3" />
        {badge.label}
      </div>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          {row("Period", `${MONTHS[rcti.month]} ${rcti.year}`, "period")}
          {row("Client", rcti.clientName, "clientId")}
          {row("Employee", rcti.employeeName, "employeeId")}
          {row("Description", rcti.description, "description")}
          {row("Reference", rcti.reference, "reference")}
          {row("Received date", rcti.receivedDate ? new Date(rcti.receivedDate).toLocaleDateString("en-AU") : null, "receivedDate")}
        </div>
        <div>
          {row("Amount ex GST", formatCurrency(rcti.amountExclGst), "amountExclGst")}
          {row("GST", formatCurrency(rcti.gstAmount), "gstAmount")}
          {row("Amount inc GST", formatCurrency(rcti.amountInclGst), "amountInclGst")}
          {row("Hours", rcti.hours ? `${parseFloat(rcti.hours).toFixed(2)} hrs` : null, "hours")}
          {row("Hourly rate", rcti.hourlyRate ? formatCurrency(rcti.hourlyRate) + "/hr" : null, "hourlyRate")}
          {row("Bank txn ID", rcti.bankTransactionId
            ? <span className="font-mono text-xs text-muted-foreground">{rcti.bankTransactionId.slice(0, 16)}…</span>
            : null, "bankTxn")}
        </div>
      </div>
    </div>
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
          source: "PDF_SCAN" as const,
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
