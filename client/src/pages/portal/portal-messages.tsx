import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, MessageSquare, Send, Mail, MailOpen } from "lucide-react";
import type { Message } from "@shared/schema";

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Contractor";
}

function formatTimestamp(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PortalMessagesPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: messagesList, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages/contractor", contractorId],
  });

  const sendMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/messages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/contractor", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contractor", contractorId, "stats"] });
      setDialogOpen(false);
      toast({ title: "Message sent", description: "Your message has been sent to the admin." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/messages/${id}/read`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/contractor", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contractor", contractorId, "stats"] });
    },
  });

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    sendMutation.mutate({
      contractorId,
      senderRole: "contractor",
      subject: formData.get("subject") as string || undefined,
      body: formData.get("body") as string,
    });
  };

  const unreadCount = messagesList?.filter((m) => !m.read && m.senderRole === "admin").length || 0;

  return (
    <PortalShell contractorName={getContractorName()}>
      <div className="p-6 bg-muted/30 min-h-full">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold text-foreground" data-testid="text-portal-messages-title">
                Messages
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {unreadCount > 0
                  ? `${unreadCount} unread message${unreadCount !== 1 ? "s" : ""}`
                  : "Communicate with your admin"}
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-portal-new-message">
                  <Plus className="w-4 h-4" />
                  New Message
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Send Message</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSend} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="msg-subject">Subject</Label>
                    <Input id="msg-subject" name="subject" placeholder="Optional subject" data-testid="input-portal-msg-subject" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="msg-body">Message</Label>
                    <Textarea
                      id="msg-body"
                      name="body"
                      required
                      placeholder="Type your message..."
                      className="min-h-[120px]"
                      data-testid="input-portal-msg-body"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={sendMutation.isPending} data-testid="button-portal-send-message">
                    <Send className="w-4 h-4" />
                    {sendMutation.isPending ? "Sending..." : "Send Message"}
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
                    <Skeleton className="h-3 w-full mb-1" />
                    <Skeleton className="h-3 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !messagesList || messagesList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <div className="text-sm text-muted-foreground">No messages yet</div>
                <div className="text-xs text-muted-foreground mt-1">Send a message to get started</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {messagesList.map((msg) => {
                const isFromAdmin = msg.senderRole === "admin";
                const isUnread = isFromAdmin && !msg.read;
                return (
                  <Card
                    key={msg.id}
                    className={`hover-elevate ${isUnread ? "border-primary/30" : ""}`}
                    data-testid={`card-portal-message-${msg.id}`}
                    onClick={() => {
                      if (isUnread) markReadMutation.mutate(msg.id);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 bg-muted">
                          {isUnread ? (
                            <Mail className="w-4 h-4 text-primary" />
                          ) : (
                            <MailOpen className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${isUnread ? "text-foreground" : "text-muted-foreground"}`} data-testid={`text-portal-msg-sender-${msg.id}`}>
                              {isFromAdmin ? "Admin" : "You"}
                            </span>
                            {isUnread && <Badge variant="default" className="text-[10px]">New</Badge>}
                            {msg.subject && (
                              <span className="text-sm text-muted-foreground">
                                {msg.subject}
                              </span>
                            )}
                          </div>
                          <p className={`text-sm mt-1 ${isUnread ? "text-foreground" : "text-muted-foreground"}`} data-testid={`text-portal-msg-body-${msg.id}`}>
                            {msg.body}
                          </p>
                          <div className="text-[11px] text-muted-foreground mt-2" data-testid={`text-portal-msg-time-${msg.id}`}>
                            {formatTimestamp(msg.createdAt)}
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
      </div>
    </PortalShell>
  );
}
