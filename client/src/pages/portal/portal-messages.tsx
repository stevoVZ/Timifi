import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PortalShell } from "@/components/portal-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Mail, MailOpen, MessageSquare, Plus, ArrowLeft } from "lucide-react";
import type { Message } from "@shared/schema";

function getContractorId(): string | null {
  return localStorage.getItem("portal_contractor_id");
}

function getContractorName(): string {
  return localStorage.getItem("portal_contractor_name") || "Employee";
}

function formatTimestamp(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShortTime(dateStr: string | Date) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-AU", { weekday: "short" });
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

type ConversationThread = {
  subject: string;
  messages: Message[];
  lastMessage: Message;
  hasUnread: boolean;
};

function groupIntoThreads(messages: Message[]): ConversationThread[] {
  const threadMap: Record<string, Message[]> = {};

  for (const msg of messages) {
    const key = msg.subject || `thread-${msg.id}`;
    if (!threadMap[key]) {
      threadMap[key] = [];
    }
    threadMap[key].push(msg);
  }

  const threads: ConversationThread[] = [];
  for (const subject of Object.keys(threadMap)) {
    const msgs = threadMap[subject];
    const sorted = msgs.sort((a: Message, b: Message) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    threads.push({
      subject,
      messages: sorted,
      lastMessage: sorted[sorted.length - 1],
      hasUnread: sorted.some((m: Message) => m.senderRole === "admin" && !m.read),
    });
  }

  threads.sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  return threads;
}

export default function PortalMessagesPage() {
  const [, setLocation] = useLocation();
  const contractorId = getContractorId();
  const [selectedThreadSubject, setSelectedThreadSubject] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const { toast } = useToast();

  if (!contractorId) {
    setLocation("/portal/login");
    return null;
  }

  const { data: messagesList, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages/employee", contractorId],
  });

  const sendMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/messages", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/employee", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/employee", contractorId, "stats"] });
      if (composing) {
        setComposing(false);
        setNewSubject("");
        setNewBody("");
        setSelectedThreadSubject(variables.subject || null);
      }
      setReplyBody("");
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
      queryClient.invalidateQueries({ queryKey: ["/api/messages/employee", contractorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/employee", contractorId, "stats"] });
    },
  });

  const threads = messagesList ? groupIntoThreads(messagesList) : [];
  const selectedThread = selectedThreadSubject !== null
    ? threads.find((t) => t.subject === selectedThreadSubject) || null
    : null;

  const unreadCount = messagesList?.filter((m) => !m.read && m.senderRole === "admin").length || 0;

  const handleSelectThread = (thread: ConversationThread) => {
    setComposing(false);
    setSelectedThreadSubject(thread.subject);
    for (const msg of thread.messages) {
      if (msg.senderRole === "admin" && !msg.read) {
        markReadMutation.mutate(msg.id);
      }
    }
  };

  const handleNewMessage = () => {
    setComposing(true);
    setSelectedThreadSubject(null);
    setNewSubject("");
    setNewBody("");
  };

  const handleSendNew = () => {
    if (!newBody.trim()) return;
    sendMutation.mutate({
      contractorId,
      senderRole: "contractor",
      subject: newSubject || undefined,
      body: newBody,
    });
  };

  const handleReply = () => {
    if (!replyBody.trim() || !selectedThread) return;
    sendMutation.mutate({
      contractorId,
      senderRole: "contractor",
      subject: selectedThread.subject,
      body: replyBody,
    });
  };

  return (
    <PortalShell contractorName={getContractorName()}>
      <div className="flex h-full">
        <div className="w-[300px] flex-shrink-0 border-r flex flex-col bg-background">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="text-sm font-semibold text-foreground" data-testid="text-portal-messages-title">
                  Inbox
                </h1>
                {unreadCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {unreadCount} unread
                  </p>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={handleNewMessage} data-testid="button-portal-new-message">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-3">
                    <Skeleton className="h-3 w-24 mb-2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : threads.length === 0 && !composing ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No messages yet</p>
              </div>
            ) : (
              <div>
                {threads.map((thread) => {
                  const isSelected = selectedThreadSubject === thread.subject;
                  const preview = thread.lastMessage.body.length > 60
                    ? thread.lastMessage.body.slice(0, 60) + "..."
                    : thread.lastMessage.body;
                  return (
                    <button
                      key={thread.subject}
                      className={`w-full text-left px-4 py-3 border-b transition-colors hover-elevate ${
                        isSelected ? "bg-muted" : ""
                      }`}
                      onClick={() => handleSelectThread(thread)}
                      data-testid={`button-thread-${thread.subject}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {thread.hasUnread ? (
                            <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          ) : (
                            <MailOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className={`text-sm truncate ${thread.hasUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {thread.subject.startsWith("thread-") ? "No subject" : thread.subject}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatShortTime(thread.lastMessage.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground truncate flex-1">{preview}</p>
                        {thread.hasUnread && (
                          <Badge variant="default" className="text-[9px] px-1.5 py-0">
                            New
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
          {composing ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b bg-background flex items-center gap-3">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setComposing(false)}
                  data-testid="button-back-from-compose"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-sm font-semibold text-foreground">New Message</h2>
              </div>
              <div className="flex-1 p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Subject</label>
                  <Input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Optional subject"
                    data-testid="input-portal-msg-subject"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Message</label>
                  <Textarea
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    placeholder="Type your message..."
                    className="min-h-[180px]"
                    data-testid="input-portal-msg-body"
                  />
                </div>
                <Button
                  onClick={handleSendNew}
                  disabled={sendMutation.isPending || !newBody.trim()}
                  data-testid="button-portal-send-message"
                >
                  <Send className="w-4 h-4" />
                  {sendMutation.isPending ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </div>
          ) : selectedThread ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b bg-background">
                <h2 className="text-sm font-semibold text-foreground" data-testid="text-thread-subject">
                  {selectedThread.subject.startsWith("thread-") ? "No subject" : selectedThread.subject}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedThread.messages.length} message{selectedThread.messages.length !== 1 ? "s" : ""}
                </p>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {selectedThread.messages.map((msg) => {
                    const isFromAdmin = msg.senderRole === "admin";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isFromAdmin ? "justify-start" : "justify-end"}`}
                        data-testid={`card-portal-message-${msg.id}`}
                      >
                        <Card className={`max-w-[80%] ${isFromAdmin ? "" : "bg-primary text-primary-foreground border-primary"}`}>
                          <div className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold ${isFromAdmin ? "text-muted-foreground" : "text-primary-foreground/80"}`} data-testid={`text-portal-msg-sender-${msg.id}`}>
                                {isFromAdmin ? "Admin" : "You"}
                              </span>
                              <span className={`text-[10px] ${isFromAdmin ? "text-muted-foreground" : "text-primary-foreground/60"}`} data-testid={`text-portal-msg-time-${msg.id}`}>
                                {formatTimestamp(msg.createdAt)}
                              </span>
                            </div>
                            <p className={`text-sm ${isFromAdmin ? "text-foreground" : "text-primary-foreground"}`} data-testid={`text-portal-msg-body-${msg.id}`}>
                              {msg.body}
                            </p>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <Separator />
              <div className="p-4 bg-background">
                <div className="flex gap-2">
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type a reply..."
                    className="min-h-[60px] flex-1"
                    data-testid="input-portal-reply-body"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleReply}
                    disabled={sendMutation.isPending || !replyBody.trim()}
                    data-testid="button-portal-send-reply"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Select a conversation</p>
                <p className="text-xs text-muted-foreground mt-1">or start a new message</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
