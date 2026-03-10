import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Notification } from "@shared/schema";
import {
  Bell,
  CheckCheck,
  CreditCard,
  FileText,
  Clock,
  Shield,
  RefreshCw,
  AlertTriangle,
  Info,
  ExternalLink,
  DollarSign,
  Zap,
} from "lucide-react";

const PRIORITY_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  URGENT: { label: "Urgent", variant: "destructive" },
  HIGH: { label: "High", variant: "destructive" },
  MEDIUM: { label: "Medium", variant: "secondary" },
  LOW: { label: "Low", variant: "outline" },
};

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bell }> = {
  PAYRUN: { label: "Pay Run", icon: CreditCard },
  STP: { label: "STP", icon: FileText },
  INVOICE: { label: "Invoice", icon: DollarSign },
  TIMESHEET: { label: "Timesheet", icon: Clock },
  SUPER: { label: "Super", icon: RefreshCw },
  XERO: { label: "Xero", icon: Zap },
  CLEARANCE: { label: "Clearance", icon: Shield },
  SYSTEM: { label: "System", icon: Info },
};

const ALL_TYPES = ["PAYRUN", "STP", "INVOICE", "TIMESHEET", "SUPER", "XERO", "CLEARANCE", "SYSTEM"];
const ALL_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"];

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function NotificationsPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const { toast } = useToast();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const filtered = notifications.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (priorityFilter !== "all" && n.priority !== priorityFilter) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Notifications"
        subtitle={`${unreadCount} unread`}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            Mark all read
          </Button>
        }
      />
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ALL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_CONFIG[t]?.label || t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-priority-filter">
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {ALL_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_CONFIG[p]?.label || p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground" data-testid="text-filter-count">
              {filtered.length} notification{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-72" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground" data-testid="text-empty-state">
                  No notifications
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {typeFilter !== "all" || priorityFilter !== "all"
                    ? "Try adjusting your filters"
                    : "You're all caught up"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((n) => {
                const typeConf = TYPE_CONFIG[n.type] || { label: n.type, icon: Bell };
                const prioConf = PRIORITY_CONFIG[n.priority] || { label: n.priority, variant: "outline" as const };
                const TypeIcon = typeConf.icon;

                return (
                  <Card
                    key={n.id}
                    className={`transition-colors ${!n.read ? "border-l-2 border-l-primary" : "opacity-75"}`}
                    data-testid={`card-notification-${n.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${
                            n.priority === "URGENT"
                              ? "bg-red-50 dark:bg-red-900/20"
                              : n.priority === "HIGH"
                                ? "bg-orange-50 dark:bg-orange-900/20"
                                : "bg-muted"
                          }`}
                        >
                          <TypeIcon
                            className={`w-4 h-4 ${
                              n.priority === "URGENT"
                                ? "text-red-600 dark:text-red-400"
                                : n.priority === "HIGH"
                                  ? "text-orange-600 dark:text-orange-400"
                                  : "text-muted-foreground"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className={`text-sm font-medium ${!n.read ? "text-foreground" : "text-muted-foreground"}`}
                              data-testid={`text-notification-title-${n.id}`}
                            >
                              {n.title}
                            </span>
                            <Badge
                              variant={prioConf.variant}
                              className="text-[10px]"
                              data-testid={`badge-priority-${n.id}`}
                            >
                              {prioConf.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-type-${n.id}`}>
                              {typeConf.label}
                            </Badge>
                          </div>
                          {n.body && (
                            <p className="text-xs text-muted-foreground mb-2" data-testid={`text-notification-body-${n.id}`}>
                              {n.body}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-muted-foreground" data-testid={`text-notification-time-${n.id}`}>
                              {formatTimeAgo(n.createdAt as unknown as string)}
                            </span>
                            {n.actionRoute && n.actionLabel && (
                              <Link href={n.actionRoute}>
                                <Button variant="ghost" size="sm" data-testid={`button-action-${n.id}`}>
                                  {n.actionLabel}
                                  <ExternalLink className="w-3 h-3 ml-1" />
                                </Button>
                              </Link>
                            )}
                            {!n.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markReadMutation.mutate(n.id)}
                                disabled={markReadMutation.isPending}
                                data-testid={`button-mark-read-${n.id}`}
                              >
                                Mark read
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
