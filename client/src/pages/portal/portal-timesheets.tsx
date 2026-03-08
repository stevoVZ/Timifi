import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Clock, FileText, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import type { Timesheet } from "@shared/schema";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Contractor";
}

export default function PortalTimesheetsPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: timesheetsList, isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets/contractor", contractorId],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/timesheets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/contractor", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contractor", contractorId, "stats"] });
      setDialogOpen(false);
      toast({ title: "Timesheet submitted", description: "Your timesheet has been submitted for review." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const grouped = {
    submitted: timesheetsList?.filter((t) => t.status === "SUBMITTED") || [],
    approved: timesheetsList?.filter((t) => t.status === "APPROVED") || [],
    drafts: timesheetsList?.filter((t) => t.status === "DRAFT") || [],
    rejected: timesheetsList?.filter((t) => t.status === "REJECTED") || [],
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const raw: Record<string, any> = {};
    formData.forEach((v, k) => { if (v) raw[k] = v as string; });
    createMutation.mutate({
      contractorId,
      year: parseInt(raw.year),
      month: parseInt(raw.month),
      totalHours: raw.totalHours || "0",
      regularHours: raw.regularHours || "0",
      overtimeHours: raw.overtimeHours || "0",
      grossValue: raw.grossValue || "0",
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
    });
  };

  return (
    <PortalShell contractorName={getContractorName()}>
      <div className="p-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold text-foreground" data-testid="text-portal-timesheets-title">
                My Timesheets
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and submit your timesheets
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-portal-new-timesheet">
                  <Plus className="w-4 h-4" />
                  Submit Timesheet
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Submit Timesheet</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-year">Year</Label>
                      <Input id="portal-year" name="year" type="number" defaultValue={new Date().getFullYear()} required data-testid="input-portal-ts-year" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Month</Label>
                      <Select name="month" defaultValue={String(new Date().getMonth() + 1)}>
                        <SelectTrigger data-testid="select-portal-ts-month">
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-totalHours">Total Hours</Label>
                      <Input id="portal-totalHours" name="totalHours" type="number" step="0.5" required data-testid="input-portal-ts-total-hours" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-regularHours">Regular</Label>
                      <Input id="portal-regularHours" name="regularHours" type="number" step="0.5" defaultValue="0" data-testid="input-portal-ts-regular-hours" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-overtimeHours">Overtime</Label>
                      <Input id="portal-overtimeHours" name="overtimeHours" type="number" step="0.5" defaultValue="0" data-testid="input-portal-ts-overtime-hours" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-grossValue">Gross Value ($)</Label>
                    <Input id="portal-grossValue" name="grossValue" type="number" step="0.01" required data-testid="input-portal-ts-gross-value" />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-portal-submit-timesheet">
                    {createMutation.isPending ? "Submitting..." : "Submit Timesheet"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Tabs defaultValue="submitted">
              <TabsList data-testid="tabs-portal-timesheet-status">
                <TabsTrigger value="submitted" className="gap-1.5" data-testid="tab-portal-submitted">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Submitted ({grouped.submitted.length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="gap-1.5" data-testid="tab-portal-approved">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Approved ({grouped.approved.length})
                </TabsTrigger>
                <TabsTrigger value="drafts" className="gap-1.5" data-testid="tab-portal-drafts">
                  <FileText className="w-3.5 h-3.5" />
                  Drafts ({grouped.drafts.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="gap-1.5" data-testid="tab-portal-rejected">
                  <XCircle className="w-3.5 h-3.5" />
                  Rejected ({grouped.rejected.length})
                </TabsTrigger>
              </TabsList>

              {Object.entries(grouped).map(([key, items]) => (
                <TabsContent key={key} value={key}>
                  {items.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                        <div className="text-sm text-muted-foreground">No {key} timesheets</div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {items.map((ts) => (
                        <Card key={ts.id} className="hover-elevate" data-testid={`card-portal-timesheet-${ts.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-foreground" data-testid={`text-portal-ts-period-${ts.id}`}>
                                    {MONTHS[ts.month]} {ts.year}
                                  </span>
                                  <StatusBadge status={ts.status} />
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {ts.fileName && `${ts.fileName} · `}
                                  {ts.submittedAt
                                    ? `Submitted ${new Date(ts.submittedAt).toLocaleDateString("en-AU")}`
                                    : "Not submitted"}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="text-right">
                                  <div className="text-sm font-mono font-medium text-foreground" data-testid={`text-portal-ts-hours-${ts.id}`}>
                                    {ts.totalHours}h
                                  </div>
                                  {parseFloat(ts.overtimeHours || "0") > 0 && (
                                    <div className="text-[11px] text-amber-600 dark:text-amber-400">+{ts.overtimeHours}h OT</div>
                                  )}
                                </div>
                                <div className="text-right min-w-[90px]">
                                  <div className="text-sm font-mono font-semibold text-foreground" data-testid={`text-portal-ts-value-${ts.id}`}>
                                    ${parseFloat(ts.grossValue || "0").toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
