import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Plus, Search, Shield, MapPin, Briefcase, ArrowRight } from "lucide-react";
import type { Contractor } from "@shared/schema";

const CLEARANCE_COLORS: Record<string, string> = {
  NONE: "text-muted-foreground",
  BASELINE: "text-blue-600 dark:text-blue-400",
  NV1: "text-green-600 dark:text-green-400",
  NV2: "text-amber-600 dark:text-amber-400",
  PV: "text-red-600 dark:text-red-400",
};

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ContractorsPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: contractors, isLoading } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/contractors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDialogOpen(false);
      toast({ title: "Contractor created", description: "New contractor has been added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = contractors?.filter((c) => {
    const matchSearch = `${c.firstName} ${c.lastName} ${c.email} ${c.clientName || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchStatus = filterStatus === "ALL" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    formData.forEach((v, k) => { if (v) data[k] = v as string; });
    createMutation.mutate(data);
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Contractors"
        subtitle={`${contractors?.length || 0} total`}
        actions={
          <>
            <Link href="/contractors/new">
              <Button data-testid="button-add-contractor">
                <Plus className="w-4 h-4" />
                Add Contractor
              </Button>
            </Link>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-quick-add-contractor">
                  Quick Add
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Contractor</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" name="firstName" required data-testid="input-first-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" name="lastName" required data-testid="input-last-name" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required data-testid="input-email" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" data-testid="input-phone" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                    <Input id="hourlyRate" name="hourlyRate" type="number" step="0.01" data-testid="input-hourly-rate" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input id="jobTitle" name="jobTitle" data-testid="input-job-title" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clientName">Client</Label>
                    <Input id="clientName" name="clientName" data-testid="input-client-name" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-contractor">
                  {createMutation.isPending ? "Creating..." : "Create Contractor"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </>
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contractors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-contractors"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PENDING_SETUP">Pending</SelectItem>
                <SelectItem value="OFFBOARDED">Offboarded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-60" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered?.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <div className="text-lg font-semibold text-foreground mb-1">No contractors found</div>
                <div className="text-sm text-muted-foreground">
                  {search ? "Try a different search term" : "Add your first contractor to get started"}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered?.map((c) => (
                <Link key={c.id} href={`/contractors/${c.id}`}>
                  <Card className="hover-elevate cursor-pointer group" data-testid={`card-contractor-${c.id}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0 ${getAvatarColor(c.firstName + c.lastName)}`}>
                        {getInitials(c.firstName, c.lastName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground" data-testid={`text-contractor-name-${c.id}`}>
                            {c.firstName} {c.lastName}
                          </span>
                          <StatusBadge status={c.status} />
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          {c.jobTitle && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              {c.jobTitle}
                            </span>
                          )}
                          {c.clientName && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {c.clientName}
                            </span>
                          )}
                          {c.clearanceLevel && c.clearanceLevel !== "NONE" && (
                            <span className={`text-xs flex items-center gap-1 ${CLEARANCE_COLORS[c.clearanceLevel]}`}>
                              <Shield className="w-3 h-3" />
                              {c.clearanceLevel}
                            </span>
                          )}
                          {c.hourlyRate && (
                            <span className="text-xs font-mono text-muted-foreground">
                              ${c.hourlyRate}/hr
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
