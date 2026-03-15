import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Gift, Plus, Pencil, Users, DollarSign, Calendar, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { Employee } from "@shared/schema";

interface ReferralBonusData {
  id: string;
  referringEmployeeId: string;
  referredEmployeeId: string;
  bonusRatePerHour: string;
  startDate: string;
  endDate: string | null;
  status: string;
  notes: string | null;
  referringEmployee: { id: string; firstName: string; lastName: string } | null;
  referredEmployee: { id: string; firstName: string; lastName: string } | null;
}

interface PayoutData {
  id: string;
  totalPayout: number;
  monthlyBreakdown: { month: number; year: number; hours: number; amount: number }[];
}

export default function ReferralBonusesPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ENDED">("ALL");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ bonusRatePerHour: "", startDate: "", endDate: "", notes: "" });
  const [formData, setFormData] = useState({
    referringEmployeeId: "",
    referredEmployeeId: "",
    bonusRatePerHour: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    notes: "",
  });

  const { data: bonuses, isLoading } = useQuery<ReferralBonusData[]>({
    queryKey: ["/api/referral-bonuses"],
  });

  const { data: payouts } = useQuery<PayoutData[]>({
    queryKey: ["/api/referral-bonuses/payouts"],
  });

  const { data: allEmployees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const payoutMap = new Map<string, PayoutData>();
  (payouts || []).forEach(p => payoutMap.set(p.id, p));

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/referral-bonuses"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, string | null>) => {
      const res = await apiRequest("POST", "/api/referral-bonuses", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Created", description: "Referral bonus arrangement created." });
      setShowCreateForm(false);
      setFormData({ referringEmployeeId: "", referredEmployeeId: "", bonusRatePerHour: "", startDate: new Date().toISOString().split("T")[0], endDate: "", notes: "" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string | null> }) => {
      const res = await apiRequest("PATCH", `/api/referral-bonuses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Updated", description: "Referral bonus arrangement updated." });
      setEditingId(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/referral-bonuses/${id}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Ended", description: "Referral bonus arrangement ended." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/referral-bonuses/${id}/reactivate`);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Reactivated", description: "Referral bonus arrangement is active again." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = (bonuses || []).filter(b => statusFilter === "ALL" || b.status === statusFilter);
  const activeCount = (bonuses || []).filter(b => b.status === "ACTIVE").length;
  const endedCount = (bonuses || []).filter(b => b.status === "ENDED").length;
  const totalAccumulatedPayout = (payouts || []).reduce((sum, p) => sum + p.totalPayout, 0);

  const startEditing = (b: ReferralBonusData) => {
    setEditingId(b.id);
    setEditData({
      bonusRatePerHour: b.bonusRatePerHour,
      startDate: b.startDate,
      endDate: b.endDate || "",
      notes: b.notes || "",
    });
  };

  const saveEdit = (id: string) => {
    const payload: Record<string, string | null> = {
      bonusRatePerHour: editData.bonusRatePerHour,
      startDate: editData.startDate,
      notes: editData.notes || null,
      endDate: editData.endDate || null,
    };
    updateMutation.mutate({ id, data: payload });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Referral Bonuses" />
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Referral Bonuses" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="w-4 h-4" />
                Active Arrangements
              </div>
              <div className="text-2xl font-bold" data-testid="kpi-active-count">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                Ended Arrangements
              </div>
              <div className="text-2xl font-bold" data-testid="kpi-ended-count">{endedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="w-4 h-4" />
                Total Accumulated Payouts
              </div>
              <div className="text-2xl font-bold" data-testid="kpi-total-payouts">${totalAccumulatedPayout.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="w-4 h-4" />
                All Referral Arrangements
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "ALL" | "ACTIVE" | "ENDED")}>
                  <SelectTrigger className="h-8 w-32 text-sm" data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ENDED">Ended</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setShowCreateForm(!showCreateForm)} data-testid="button-create-referral">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New Arrangement
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showCreateForm && (
              <div className="border rounded-md p-4 mb-4 space-y-3 bg-muted/30" data-testid="form-create-referral">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Referring Employee</label>
                    <Select value={formData.referringEmployeeId} onValueChange={(v) => setFormData(prev => ({ ...prev, referringEmployeeId: v }))}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-referring-employee">
                        <SelectValue placeholder="Select referrer" />
                      </SelectTrigger>
                      <SelectContent>
                        {(allEmployees || []).map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Referred Employee</label>
                    <Select value={formData.referredEmployeeId} onValueChange={(v) => setFormData(prev => ({ ...prev, referredEmployeeId: v }))}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-referred-employee">
                        <SelectValue placeholder="Select referred" />
                      </SelectTrigger>
                      <SelectContent>
                        {(allEmployees || []).filter(e => e.id !== formData.referringEmployeeId).map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bonus Rate ($/hr)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 5.00"
                      value={formData.bonusRatePerHour}
                      onChange={(e) => setFormData(prev => ({ ...prev, bonusRatePerHour: e.target.value }))}
                      className="h-8"
                      data-testid="input-create-bonus-rate"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1" data-testid="text-bonus-rate-helper">You'll earn this amount for each hour the referred employee works</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                      className="h-8"
                      data-testid="input-create-start-date"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">End Date (optional)</label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                      className="h-8"
                      data-testid="input-create-end-date"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
                    <Input
                      placeholder="e.g. Referred for project X"
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="h-8"
                      data-testid="input-create-notes"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      const payload: Record<string, string | null> = {
                        referringEmployeeId: formData.referringEmployeeId,
                        referredEmployeeId: formData.referredEmployeeId,
                        bonusRatePerHour: formData.bonusRatePerHour,
                        startDate: formData.startDate,
                        endDate: formData.endDate || null,
                        notes: formData.notes || null,
                      };
                      createMutation.mutate(payload);
                    }}
                    disabled={createMutation.isPending || !formData.referringEmployeeId || !formData.referredEmployeeId || !formData.bonusRatePerHour || !formData.startDate}
                    data-testid="button-save-create"
                  >
                    {createMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)} data-testid="button-cancel-create">Cancel</Button>
                </div>
              </div>
            )}

            {filtered.length === 0 && !showCreateForm && (
              <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-arrangements">
                No referral bonus arrangements found.
              </p>
            )}

            <div className="divide-y">
              {filtered.map(b => {
                const isEditing = editingId === b.id;

                if (isEditing) {
                  return (
                    <div key={b.id} className="py-3 space-y-2" data-testid={`edit-form-${b.id}`}>
                      <div className="text-sm font-medium">
                        {b.referringEmployee?.firstName} {b.referringEmployee?.lastName} → {b.referredEmployee?.firstName} {b.referredEmployee?.lastName}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Rate ($/hr)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editData.bonusRatePerHour}
                            onChange={(e) => setEditData(prev => ({ ...prev, bonusRatePerHour: e.target.value }))}
                            className="h-8"
                            data-testid={`input-mgmt-edit-rate-${b.id}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                          <Input
                            type="date"
                            value={editData.startDate}
                            onChange={(e) => setEditData(prev => ({ ...prev, startDate: e.target.value }))}
                            className="h-8"
                            data-testid={`input-mgmt-edit-start-${b.id}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                          <Input
                            type="date"
                            value={editData.endDate}
                            onChange={(e) => setEditData(prev => ({ ...prev, endDate: e.target.value }))}
                            className="h-8"
                            data-testid={`input-mgmt-edit-end-${b.id}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                          <Input
                            value={editData.notes}
                            onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                            className="h-8"
                            data-testid={`input-mgmt-edit-notes-${b.id}`}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(b.id)} disabled={updateMutation.isPending} data-testid={`button-mgmt-save-${b.id}`}>
                          {updateMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} data-testid={`button-mgmt-cancel-${b.id}`}>Cancel</Button>
                      </div>
                    </div>
                  );
                }

                const payout = payoutMap.get(b.id);
                const isExpanded = expandedId === b.id;
                const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

                return (
                  <div key={b.id} data-testid={`referral-row-${b.id}`}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          className="p-0.5 hover:bg-muted rounded"
                          onClick={() => setExpandedId(isExpanded ? null : b.id)}
                          data-testid={`button-expand-${b.id}`}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            b.status === "ACTIVE"
                              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                              : "bg-gray-50 dark:bg-gray-950/30 text-gray-500 border-gray-200 dark:border-gray-700"
                          }`}
                        >
                          {b.status}
                        </Badge>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            <Link href={`/employees/${b.referringEmployee?.id}`} className="hover:underline" data-testid={`link-referrer-${b.id}`}>
                              {b.referringEmployee?.firstName} {b.referringEmployee?.lastName}
                            </Link>
                            <span className="text-muted-foreground"> → </span>
                            <Link href={`/employees/${b.referredEmployee?.id}`} className="hover:underline" data-testid={`link-referred-${b.id}`}>
                              {b.referredEmployee?.firstName} {b.referredEmployee?.lastName}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${parseFloat(b.bonusRatePerHour).toFixed(2)}/hr
                            {" · "}From {new Date(b.startDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            {b.endDate ? ` to ${new Date(b.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : " (indefinite)"}
                            {b.notes && ` · ${b.notes}`}
                            {payout && (
                              <span className="ml-2 font-medium text-foreground" data-testid={`text-formula-${b.id}`}>
                                · ${parseFloat(b.bonusRatePerHour).toFixed(2)}/hr × {payout.monthlyBreakdown.reduce((s, m) => s + m.hours, 0).toFixed(1)} hrs = ${payout.totalPayout.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => startEditing(b)} data-testid={`button-mgmt-edit-${b.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {b.status === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deactivateMutation.mutate(b.id)}
                            disabled={deactivateMutation.isPending}
                            data-testid={`button-mgmt-end-${b.id}`}
                          >
                            End
                          </Button>
                        )}
                        {b.status === "ENDED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => reactivateMutation.mutate(b.id)}
                            disabled={reactivateMutation.isPending}
                            data-testid={`button-mgmt-reactivate-${b.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && payout && payout.monthlyBreakdown.length > 0 && (
                      <div className="ml-12 mb-3 bg-muted/30 rounded-md p-3" data-testid={`payout-breakdown-${b.id}`}>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Monthly Payout Breakdown</div>
                        <div className="grid grid-cols-4 gap-1 text-xs font-medium text-muted-foreground border-b pb-1 mb-1">
                          <div>Month</div>
                          <div className="text-right">Calculation</div>
                          <div></div>
                          <div className="text-right">Amount</div>
                        </div>
                        {payout.monthlyBreakdown.map((mb, idx) => (
                          <div key={idx} className="grid grid-cols-4 gap-1 text-xs py-0.5" data-testid={`breakdown-row-${b.id}-${idx}`}>
                            <div>{monthNames[mb.month - 1]} {mb.year}</div>
                            <div className="text-right text-muted-foreground">${parseFloat(b.bonusRatePerHour).toFixed(2)}/hr × {parseFloat(String(mb.hours)).toFixed(1)} hrs</div>
                            <div className="text-center text-muted-foreground">=</div>
                            <div className="text-right font-medium">${mb.amount.toFixed(2)}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-4 gap-1 text-xs font-medium border-t pt-1 mt-1">
                          <div>Total</div>
                          <div className="text-right text-muted-foreground">{payout.monthlyBreakdown.reduce((s, m) => s + m.hours, 0).toFixed(1)} hrs</div>
                          <div></div>
                          <div className="text-right">${payout.totalPayout.toFixed(2)}</div>
                        </div>
                      </div>
                    )}
                    {isExpanded && (!payout || payout.monthlyBreakdown.length === 0) && (
                      <div className="ml-12 mb-3 text-xs text-muted-foreground">No payout data available yet.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
