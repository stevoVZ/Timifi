import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import type { LeaveRequest } from "@shared/schema";
import { CalendarDays, CalendarRange, Palmtree, HeartPulse, Heart, Clock } from "lucide-react";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  LONG_SERVICE: "Long Service",
  PERSONAL: "Personal Leave",
  COMPASSIONATE: "Compassionate",
  UNPAID: "Unpaid Leave",
  PUBLIC_HOLIDAY: "Public Holiday",
};

const LEAVE_TYPE_ICON_COMPONENTS: Record<string, typeof Palmtree> = {
  ANNUAL: Palmtree,
  SICK: HeartPulse,
  LONG_SERVICE: CalendarDays,
  PERSONAL: CalendarDays,
  COMPASSIONATE: Heart,
  UNPAID: Clock,
  PUBLIC_HOLIDAY: CalendarDays,
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "Pending", variant: "outline" },
  APPROVED: { label: "Approved", variant: "default" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

const LEAVE_TYPE_OPTIONS = [
  { value: "ANNUAL", label: "Annual", icon: Palmtree, color: "text-green-600" },
  { value: "SICK", label: "Sick", icon: HeartPulse, color: "text-blue-600" },
  { value: "COMPASSIONATE", label: "Compassionate", icon: Heart, color: "text-purple-600" },
  { value: "UNPAID", label: "Unpaid", icon: Clock, color: "text-amber-600" },
];

const HOURS_PER_DAY = 7.6;
const DEFAULT_ENTITLEMENT: Record<string, number> = { ANNUAL: 20, SICK: 10 };

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function PortalLeavePage() {
  const { employeeId: authEmployeeId, employeeName } = usePortalAuth();
  const employeeId = authEmployeeId || "";
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("history");
  const [form, setForm] = useState({
    leaveType: "ANNUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const { data: leaveRequests, isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave/employee", employeeId],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/leave", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/employee", employeeId] });
      toast({ title: "Leave request submitted" });
      setActiveTab("history");
      setForm({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const calculateDays = () => {
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) days++;
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const handleSubmit = () => {
    const days = calculateDays();
    if (days <= 0) {
      toast({ title: "Invalid dates", description: "End date must be after start date", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      employeeId,
      leaveType: form.leaveType,
      startDate: form.startDate,
      endDate: form.endDate,
      totalDays: days.toString(),
      reason: form.reason || null,
    });
  };

  const currentYear = new Date().getFullYear();
  const approvedThisYear = leaveRequests?.filter(
    (l) => l.status === "APPROVED" && new Date(l.startDate).getFullYear() === currentYear
  ) || [];

  const annualUsed = approvedThisYear
    .filter((l) => l.leaveType === "ANNUAL")
    .reduce((sum, l) => sum + parseFloat(l.totalDays), 0);
  const sickUsed = approvedThisYear
    .filter((l) => l.leaveType === "SICK")
    .reduce((sum, l) => sum + parseFloat(l.totalDays), 0);

  const annualEntitlement = DEFAULT_ENTITLEMENT.ANNUAL;
  const sickEntitlement = DEFAULT_ENTITLEMENT.SICK;
  const annualRemaining = annualEntitlement - annualUsed;
  const sickRemaining = sickEntitlement - sickUsed;

  return (
    <PortalShell employeeName={employeeName}>
      <div className="p-6 space-y-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-leave-title">Leave</h1>
            <p className="text-sm text-muted-foreground">Request and track your leave</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Palmtree className="w-4.5 h-4.5 text-green-600" />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Annual Leave</div>
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-2xl font-bold font-mono text-foreground" data-testid="text-annual-remaining">{annualRemaining}</span>
                  <span className="text-sm text-muted-foreground mb-0.5">/ {annualEntitlement} days</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (annualUsed / annualEntitlement) * 100)}%` }}
                    data-testid="progress-annual"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5">{annualUsed} days used · {(annualUsed * HOURS_PER_DAY).toFixed(1)}h</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <HeartPulse className="w-4.5 h-4.5 text-blue-600" />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sick Leave</div>
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-2xl font-bold font-mono text-foreground" data-testid="text-sick-remaining">{sickRemaining}</span>
                  <span className="text-sm text-muted-foreground mb-0.5">/ {sickEntitlement} days</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (sickUsed / sickEntitlement) * 100)}%` }}
                    data-testid="progress-sick"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5">{sickUsed} days used · {(sickUsed * HOURS_PER_DAY).toFixed(1)}h</div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList data-testid="tabs-leave">
              <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
              <TabsTrigger value="new" data-testid="tab-new-request">New Request</TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="mt-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  {isLoading ? (
                    [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
                  ) : !leaveRequests || leaveRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8" data-testid="text-no-leave">No leave requests yet</p>
                  ) : (
                    leaveRequests.map((l) => {
                      const config = STATUS_CONFIG[l.status] || STATUS_CONFIG.PENDING;
                      const LeaveIcon = LEAVE_TYPE_ICON_COMPONENTS[l.leaveType] || CalendarDays;
                      return (
                        <div key={l.id} className="flex items-start justify-between gap-3 p-4 border rounded-lg" data-testid={`card-portal-leave-${l.id}`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <LeaveIcon className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                              <div className="flex items-center gap-1">
                                <CalendarRange className="w-3.5 h-3.5" />
                                {formatDate(l.startDate)} — {formatDate(l.endDate)}
                              </div>
                              <span>{l.totalDays} day{parseFloat(l.totalDays) !== 1 ? "s" : ""}</span>
                            </div>
                            {l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}
                            {l.reviewNote && <p className="text-xs text-muted-foreground italic">Note: {l.reviewNote}</p>}
                          </div>
                          <Badge variant={config.variant} data-testid={`badge-portal-leave-status-${l.id}`}>{config.label}</Badge>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="new" className="mt-4">
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Leave Type</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {LEAVE_TYPE_OPTIONS.map((opt) => {
                        const isSelected = form.leaveType === opt.value;
                        const OptIcon = opt.icon;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setForm({ ...form, leaveType: opt.value })}
                            className={`flex items-center gap-3 p-4 rounded-md border-2 text-left transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "border-border hover-elevate"
                            }`}
                            data-testid={`button-leave-type-${opt.value.toLowerCase()}`}
                          >
                            <OptIcon className={`w-5 h-5 ${opt.color}`} />
                            <span className="text-sm font-medium">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">Start Date</Label>
                      <Input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        data-testid="input-leave-start"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">End Date</Label>
                      <Input
                        type="date"
                        value={form.endDate}
                        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        data-testid="input-leave-end"
                      />
                    </div>
                  </div>

                  {form.startDate && form.endDate && (
                    <div className="p-3 rounded-md bg-muted text-sm">
                      <span className="font-medium">{calculateDays()}</span> business day{calculateDays() !== 1 ? "s" : ""} · <span className="font-mono">{(calculateDays() * HOURS_PER_DAY).toFixed(1)}h</span>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Reason (optional)</Label>
                    <Textarea
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="Brief reason for leave..."
                      data-testid="input-leave-reason"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setForm({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
                        setActiveTab("history");
                      }}
                      data-testid="button-cancel-leave"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={createMutation.isPending || !form.startDate || !form.endDate}
                      data-testid="button-submit-leave"
                    >
                      {createMutation.isPending ? "Submitting..." : "Submit Request"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PortalShell>
  );
}
