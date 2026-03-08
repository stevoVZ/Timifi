import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeaveRequest, Contractor } from "@shared/schema";
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarRange,
  Palmtree,
  HeartPulse,
} from "lucide-react";

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
  COMPASSIONATE: HeartPulse,
  UNPAID: Clock,
  PUBLIC_HOLIDAY: CalendarDays,
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "Pending", variant: "outline" },
  APPROVED: { label: "Approved", variant: "default" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

const ANNUAL_ENTITLEMENT = 20;
const SICK_ENTITLEMENT = 10;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function LeavePage() {
  const { toast } = useToast();
  const [reviewDialog, setReviewDialog] = useState<{ leave: LeaveRequest; action: "APPROVED" | "REJECTED" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: leaveRequests, isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave"],
  });

  const { data: contractors } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/leave/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave"] });
      toast({ title: "Leave request updated" });
      setReviewDialog(null);
      setReviewNote("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getContractorName = (id: string) => {
    const c = contractors?.find((c) => c.id === id);
    return c ? `${c.firstName} ${c.lastName}` : "Unknown";
  };

  const getContractorInitials = (id: string) => {
    const c = contractors?.find((c) => c.id === id);
    return c ? `${c.firstName[0]}${c.lastName[0]}` : "??";
  };

  const getContractorColor = (id: string) => {
    const c = contractors?.find((c) => c.id === id);
    return c?.accentColour || "#2563eb";
  };

  const pending = leaveRequests?.filter((l) => l.status === "PENDING") || [];
  const approved = leaveRequests?.filter((l) => l.status === "APPROVED") || [];
  const rejected = leaveRequests?.filter((l) => l.status === "REJECTED" || l.status === "CANCELLED") || [];

  const handleReview = () => {
    if (!reviewDialog) return;
    updateMutation.mutate({
      id: reviewDialog.leave.id,
      data: {
        status: reviewDialog.action,
        reviewedBy: "Sarah Chen",
        reviewNote: reviewNote || undefined,
      },
    });
  };

  const currentYear = new Date().getFullYear();
  const approvedThisYear = leaveRequests?.filter(
    (l) => l.status === "APPROVED" && new Date(l.startDate).getFullYear() === currentYear
  ) || [];

  const activeContractors = contractors?.filter((c) => c.status === "ACTIVE") || [];

  const contractorBalances = activeContractors.map((c) => {
    const cLeave = approvedThisYear.filter((l) => l.contractorId === c.id);
    const annualUsed = cLeave.filter((l) => l.leaveType === "ANNUAL").reduce((s, l) => s + parseFloat(l.totalDays), 0);
    const sickUsed = cLeave.filter((l) => l.leaveType === "SICK").reduce((s, l) => s + parseFloat(l.totalDays), 0);
    return {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      initials: `${c.firstName[0]}${c.lastName[0]}`,
      color: c.accentColour || "#2563eb",
      annualUsed,
      annualRemaining: ANNUAL_ENTITLEMENT - annualUsed,
      sickUsed,
      sickRemaining: SICK_ENTITLEMENT - sickUsed,
    };
  });

  function LeaveCard({ leave }: { leave: LeaveRequest }) {
    const config = STATUS_CONFIG[leave.status] || STATUS_CONFIG.PENDING;
    const LeaveIcon = LEAVE_TYPE_ICON_COMPONENTS[leave.leaveType] || CalendarDays;
    const color = getContractorColor(leave.contractorId);
    return (
      <Card data-testid={`card-leave-${leave.id}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: `${color}15`, color }}
                >
                  {getContractorInitials(leave.contractorId)}
                </div>
                <span className="font-medium text-sm" data-testid={`text-leave-contractor-${leave.id}`}>
                  {getContractorName(leave.contractorId)}
                </span>
                <LeaveIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>{LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarRange className="w-3.5 h-3.5" />
                  <span>{formatDate(leave.startDate)} — {formatDate(leave.endDate)}</span>
                </div>
                <span className="font-mono">{leave.totalDays} day{parseFloat(leave.totalDays) !== 1 ? "s" : ""}</span>
              </div>
              {leave.reason && (
                <p className="text-sm text-muted-foreground mt-1">{leave.reason}</p>
              )}
              {leave.reviewNote && (
                <p className="text-xs text-muted-foreground italic mt-1">Review: {leave.reviewNote}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={config.variant} data-testid={`badge-leave-status-${leave.id}`}>
                {config.label}
              </Badge>
              {leave.status === "PENDING" && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    data-testid={`button-approve-leave-${leave.id}`}
                    onClick={() => setReviewDialog({ leave, action: "APPROVED" })}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs text-destructive"
                    data-testid={`button-reject-leave-${leave.id}`}
                    onClick={() => setReviewDialog({ leave, action: "REJECTED" })}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Leave Management" subtitle="Review and manage leave requests" />
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Leave Management" subtitle="Review and manage leave requests" />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold" data-testid="text-pending-count">{pending.length}</div>
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
                  <div className="text-2xl font-bold" data-testid="text-approved-count">{approved.length}</div>
                  <div className="text-xs text-muted-foreground">Approved</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold" data-testid="text-rejected-count">{rejected.length}</div>
                  <div className="text-xs text-muted-foreground">Rejected / Cancelled</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Tabs defaultValue="pending" data-testid="tabs-leave">
                <TabsList>
                  <TabsTrigger value="pending" data-testid="tab-pending">Pending ({pending.length})</TabsTrigger>
                  <TabsTrigger value="approved" data-testid="tab-approved">Approved ({approved.length})</TabsTrigger>
                  <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected ({rejected.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="space-y-3 mt-4">
                  {pending.length === 0 ? (
                    <Card><CardContent className="p-8 text-center text-muted-foreground">No pending leave requests</CardContent></Card>
                  ) : (
                    pending.map((l) => <LeaveCard key={l.id} leave={l} />)
                  )}
                </TabsContent>
                <TabsContent value="approved" className="space-y-3 mt-4">
                  {approved.length === 0 ? (
                    <Card><CardContent className="p-8 text-center text-muted-foreground">No approved leave requests</CardContent></Card>
                  ) : (
                    approved.map((l) => <LeaveCard key={l.id} leave={l} />)
                  )}
                </TabsContent>
                <TabsContent value="rejected" className="space-y-3 mt-4">
                  {rejected.length === 0 ? (
                    <Card><CardContent className="p-8 text-center text-muted-foreground">No rejected leave requests</CardContent></Card>
                  ) : (
                    rejected.map((l) => <LeaveCard key={l.id} leave={l} />)
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Leave Balances — {currentYear}
              </h3>
              {contractorBalances.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No active contractors
                  </CardContent>
                </Card>
              ) : (
                contractorBalances.map((cb) => {
                  const annualPercent = Math.min((cb.annualUsed / ANNUAL_ENTITLEMENT) * 100, 100);
                  const sickPercent = Math.min((cb.sickUsed / SICK_ENTITLEMENT) * 100, 100);
                  return (
                    <Card key={cb.id} data-testid={`card-balance-${cb.id}`}>
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                            style={{ backgroundColor: `${cb.color}15`, color: cb.color }}
                          >
                            {cb.initials}
                          </div>
                          <span className="text-sm font-semibold" data-testid={`text-balance-name-${cb.id}`}>
                            {cb.name}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Palmtree className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Annual</span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">
                              {cb.annualUsed} / {ANNUAL_ENTITLEMENT} days
                            </span>
                          </div>
                          <Progress
                            value={annualPercent}
                            className="h-2"
                            data-testid={`progress-annual-${cb.id}`}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">Used: {cb.annualUsed}</span>
                            <span className={`text-[11px] font-semibold ${cb.annualRemaining <= 3 ? "text-amber-600" : "text-green-600"}`}>
                              {cb.annualRemaining} remaining
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <HeartPulse className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Sick</span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">
                              {cb.sickUsed} / {SICK_ENTITLEMENT} days
                            </span>
                          </div>
                          <Progress
                            value={sickPercent}
                            className="h-2"
                            data-testid={`progress-sick-${cb.id}`}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">Used: {cb.sickUsed}</span>
                            <span className={`text-[11px] font-semibold ${cb.sickRemaining <= 2 ? "text-amber-600" : "text-green-600"}`}>
                              {cb.sickRemaining} remaining
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setReviewNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "APPROVED" ? "Approve" : "Reject"} Leave Request
            </DialogTitle>
            <DialogDescription>Review the leave request details below</DialogDescription>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><strong>Contractor:</strong> {getContractorName(reviewDialog.leave.contractorId)}</p>
                <p><strong>Type:</strong> {LEAVE_TYPE_LABELS[reviewDialog.leave.leaveType]}</p>
                <p><strong>Dates:</strong> {formatDate(reviewDialog.leave.startDate)} — {formatDate(reviewDialog.leave.endDate)}</p>
                <p><strong>Days:</strong> {reviewDialog.leave.totalDays}</p>
                {reviewDialog.leave.reason && <p><strong>Reason:</strong> {reviewDialog.leave.reason}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Review Note (optional)</label>
                <Textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a note..."
                  className="mt-1"
                  data-testid="input-review-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewDialog(null); setReviewNote(""); }} data-testid="button-cancel-review">
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={updateMutation.isPending}
              variant={reviewDialog?.action === "APPROVED" ? "default" : "destructive"}
              data-testid="button-confirm-review"
            >
              {updateMutation.isPending ? "Saving..." : reviewDialog?.action === "APPROVED" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
