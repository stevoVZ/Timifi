import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Plus, Search, Users, DollarSign, Clock, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import type { Employee } from "@shared/schema";

type EmployeeWithStats = Employee & {
  ytdHours: number;
  ytdBillings: number;
};

type SortField = "name" | "rate" | "ytdHours" | "startDate";
type SortDir = "asc" | "desc";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatRate(val: string | null) {
  if (!val) return "-";
  return `$${parseFloat(val).toFixed(2)}/hr`;
}

function formatDate(val: string | null) {
  if (!val) return "-";
  return new Date(val).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

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

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1" />
    : <ArrowDown className="w-3 h-3 ml-1" />;
}

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { toast } = useToast();

  const { data: employeesWithStats, isLoading } = useQuery<EmployeeWithStats[]>({
    queryKey: ["/api/employees/stats"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/employees", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDialogOpen(false);
      toast({ title: "Employee created", description: "New employee has been added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const kpis = useMemo(() => {
    if (!employeesWithStats) return { active: 0, pending: 0, ytdBillings: 0, avgRate: 0 };
    const active = employeesWithStats.filter(c => c.status === "ACTIVE").length;
    const pending = employeesWithStats.filter(c => c.status === "PENDING_SETUP").length;
    const ytdBillings = employeesWithStats.reduce((sum, c) => sum + c.ytdBillings, 0);
    const withRate = employeesWithStats.filter(c => c.hourlyRate && parseFloat(c.hourlyRate) > 0);
    const avgRate = withRate.length > 0
      ? withRate.reduce((sum, c) => sum + parseFloat(c.hourlyRate!), 0) / withRate.length
      : 0;
    return { active, pending, ytdBillings, avgRate };
  }, [employeesWithStats]);

  const filtered = useMemo(() => {
    if (!employeesWithStats) return [];
    let list = employeesWithStats.filter((c) => {
      const matchSearch = `${c.firstName} ${c.lastName} ${c.email} ${c.clientName || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchStatus = filterStatus === "ALL" || c.status === filterStatus;
      return matchSearch && matchStatus;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case "rate":
          cmp = (parseFloat(a.hourlyRate || "0")) - (parseFloat(b.hourlyRate || "0"));
          break;
        case "ytdHours":
          cmp = a.ytdHours - b.ytdHours;
          break;
        case "startDate":
          cmp = (a.startDate || "").localeCompare(b.startDate || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [employeesWithStats, search, filterStatus, sortField, sortDir]);

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
        title="Employees"
        subtitle={`${employeesWithStats?.length || 0} total`}
        actions={
          <>
            <Link href="/employees/new">
              <Button data-testid="button-add-employee">
                <Plus className="w-4 h-4" />
                Add Employee
              </Button>
            </Link>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-quick-add-employee">
                  Quick Add
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Employee</DialogTitle>
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
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-employee">
                  {createMutation.isPending ? "Creating..." : "Create Employee"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </>
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card data-testid="kpi-active-count">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-green-100 dark:bg-green-900/30">
                    <Users className="w-4 h-4 text-green-700 dark:text-green-300" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold text-foreground" data-testid="text-kpi-active">{isLoading ? "-" : kpis.active}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-pending-count">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-amber-100 dark:bg-amber-900/30">
                    <Clock className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold text-foreground" data-testid="text-kpi-pending">{isLoading ? "-" : kpis.pending}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-ytd-billings">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-blue-100 dark:bg-blue-900/30">
                    <DollarSign className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">YTD Billings</p>
                    <p className="text-xl font-bold text-foreground" data-testid="text-kpi-billings">{isLoading ? "-" : formatCurrency(kpis.ytdBillings)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-avg-rate">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-purple-100 dark:bg-purple-900/30">
                    <DollarSign className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Rate</p>
                    <p className="text-xl font-bold text-foreground" data-testid="text-kpi-avg-rate">{isLoading ? "-" : `$${kpis.avgRate.toFixed(0)}/hr`}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-employees"
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
            <Card>
              <CardContent className="p-0">
                <div className="space-y-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                      <Skeleton className="w-8 h-8 rounded-md" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <div className="text-lg font-semibold text-foreground mb-1">No employees found</div>
                <div className="text-sm text-muted-foreground">
                  {search ? "Try a different search term" : "Add your first employee to get started"}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          onClick={() => toggleSort("name")}
                          className="flex items-center text-xs font-medium"
                          data-testid="sort-name"
                        >
                          Employee
                          <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">Client</TableHead>
                      <TableHead>
                        <button
                          onClick={() => toggleSort("rate")}
                          className="flex items-center text-xs font-medium"
                          data-testid="sort-rate"
                        >
                          Rate
                          <SortIcon field="rate" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          onClick={() => toggleSort("ytdHours")}
                          className="flex items-center text-xs font-medium"
                          data-testid="sort-ytd-hours"
                        >
                          YTD Hours
                          <SortIcon field="ytdHours" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        <button
                          onClick={() => toggleSort("startDate")}
                          className="flex items-center text-xs font-medium"
                          data-testid="sort-start-date"
                        >
                          Start Date
                          <SortIcon field="startDate" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id} className="hover-elevate cursor-pointer" data-testid={`row-employee-${c.id}`}>
                        <TableCell>
                          <Link href={`/employees/${c.id}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0 ${getAvatarColor(c.firstName + c.lastName)}`}>
                                {getInitials(c.firstName, c.lastName)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-foreground truncate" data-testid={`text-employee-name-${c.id}`}>
                                    {c.firstName} {c.lastName}
                                  </span>
                                  {c.xeroEmployeeId && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 shrink-0" data-testid={`badge-xero-${c.id}`}>
                                      Xero
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{c.jobTitle || c.email}</div>
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">{c.clientName || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono text-foreground" data-testid={`text-rate-${c.id}`}>
                            {formatRate(c.hourlyRate)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div data-testid={`text-ytd-hours-${c.id}`}>
                            <div className="text-sm font-medium text-foreground">{c.ytdHours.toFixed(1)}h</div>
                            <div className="text-xs text-muted-foreground">{formatCurrency(c.ytdBillings)}</div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">{formatDate(c.startDate)}</span>
                        </TableCell>
                        <TableCell>
                          <Link href={`/employees/${c.id}`}>
                            <Button size="icon" variant="ghost" data-testid={`button-view-employee-${c.id}`}>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
