import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeaveRequest } from "@shared/schema";
import { CalendarDays, CalendarRange, Plus, Clock, CheckCircle2, XCircle } from "lucide-react";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  LONG_SERVICE: "Long Service",
  PERSONAL: "Personal Leave",
  COMPASSIONATE: "Compassionate",
  UNPAID: "Unpaid Leave",
  PUBLIC_HOLIDAY: "Public Holiday",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "Pending", variant: "outline" },
  APPROVED: { label: "Approved", variant: "default" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function PortalLeavePage() {
  const contractorId = localStorage.getItem("portal_contractor_id") || "";
  const contractorName = localStorage.getItem("portal_contractor_name") || "";
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    leaveType: "ANNUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const { data: leaveRequests, isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave/contractor", contractorId],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/leave", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/contractor", contractorId] });
      toast({ title: "Leave request submitted" });
      setDialogOpen(false);
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
      contractorId,
      leaveType: form.leaveType,
      startDate: form.startDate,
      endDate: form.endDate,
      totalDays: days.toString(),
      reason: form.reason || null,
    });
  };

  const pending = leaveRequests?.filter((l) => l.status === "PENDING") || [];
  const approved = leaveRequests?.filter((l) => l.status === "APPROVED") || [];
  const totalDaysUsed = approved.reduce((sum, l) => sum + parseFloat(l.totalDays), 0);

  return (
    <PortalShell contractorName={contractorName}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-leave-title">Leave</h1>
            <p className="text-sm text-muted-foreground">Request and track your leave</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} data-testid="button-request-leave">
            <Plus className="w-4 h-4 mr-2" />
            Request Leave
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="text-portal-pending">{pending.length}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="text-portal-approved">{approved.length}</div>
                <div className="text-xs text-muted-foreground">Approved</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="text-portal-days-used">{totalDaysUsed}</div>
                <div className="text-xs text-muted-foreground">Days Used</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
            ) : !leaveRequests || leaveRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No leave requests yet</p>
            ) : (
              leaveRequests.map((l) => {
                const config = STATUS_CONFIG[l.status] || STATUS_CONFIG.PENDING;
                return (
                  <div key={l.id} className="flex items-start justify-between p-4 border rounded-lg" data-testid={`card-portal-leave-${l.id}`}>
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}</div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leaveType} onValueChange={(v) => setForm({ ...form, leaveType: v })}>
                <SelectTrigger data-testid="select-leave-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNUAL">Annual Leave</SelectItem>
                  <SelectItem value="SICK">Sick Leave</SelectItem>
                  <SelectItem value="PERSONAL">Personal Leave</SelectItem>
                  <SelectItem value="LONG_SERVICE">Long Service Leave</SelectItem>
                  <SelectItem value="COMPASSIONATE">Compassionate Leave</SelectItem>
                  <SelectItem value="UNPAID">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-leave-start" />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-leave-end" />
              </div>
            </div>
            {form.startDate && form.endDate && (
              <p className="text-sm text-muted-foreground">{calculateDays()} business day{calculateDays() !== 1 ? "s" : ""}</p>
            )}
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Brief reason for leave..."
                data-testid="input-leave-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-leave">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !form.startDate || !form.endDate}
              data-testid="button-submit-leave"
            >
              {createMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}
