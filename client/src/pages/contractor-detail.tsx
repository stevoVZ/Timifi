import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Shield, MapPin, Briefcase, Mail, Phone, Calendar, DollarSign, Clock } from "lucide-react";
import type { Contractor, Timesheet } from "@shared/schema";

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ContractorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: contractor, isLoading } = useQuery<Contractor>({
    queryKey: ["/api/contractors", id],
  });

  const { data: timesheetsList } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets/contractor", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Loading..." />
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="max-w-4xl mx-auto space-y-4">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-60 w-full rounded-md" />
          </div>
        </main>
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Contractor Not Found" />
        <main className="flex-1 overflow-auto p-6 bg-muted/30 flex items-center justify-center">
          <Card>
            <CardContent className="py-12 px-8 text-center">
              <div className="text-lg font-semibold mb-2">Contractor not found</div>
              <Link href="/contractors">
                <Button variant="secondary">Back to Contractors</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const monthlyAllocation = (contractor.contractHoursPA || 2000) / 12;

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={`${contractor.firstName} ${contractor.lastName}`}
        subtitle={contractor.jobTitle || "Contractor"}
        actions={
          <Link href="/contractors">
            <Button variant="secondary" size="sm" data-testid="button-back-contractors">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
        }
      />
      <main className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-5">
                <div className={`w-14 h-14 rounded-md flex items-center justify-center font-bold text-lg flex-shrink-0 border ${getAvatarColor(contractor.firstName + contractor.lastName)}`}>
                  {getInitials(contractor.firstName, contractor.lastName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h2 className="text-xl font-bold text-foreground" data-testid="text-contractor-full-name">
                      {contractor.firstName} {contractor.lastName}
                    </h2>
                    <StatusBadge status={contractor.status} />
                    {contractor.clearanceLevel && contractor.clearanceLevel !== "NONE" && (
                      <span className="text-xs font-semibold flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Shield className="w-3.5 h-3.5" />
                        {contractor.clearanceLevel}
                        {contractor.clearanceExpiry && (
                          <span className="text-muted-foreground font-normal ml-1">
                            exp. {new Date(contractor.clearanceExpiry).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                    <InfoRow icon={Mail} label="Email" value={contractor.email} testId="text-email" />
                    <InfoRow icon={Phone} label="Phone" value={contractor.phone || "Not provided"} testId="text-phone" />
                    <InfoRow icon={Briefcase} label="Job Title" value={contractor.jobTitle || "Not set"} testId="text-job-title" />
                    <InfoRow icon={MapPin} label="Client" value={contractor.clientName || "Not assigned"} testId="text-client" />
                    <InfoRow icon={DollarSign} label="Rate" value={contractor.hourlyRate ? `$${contractor.hourlyRate}/hr` : "Not set"} testId="text-rate" />
                    <InfoRow icon={Calendar} label="Start Date" value={contractor.startDate ? new Date(contractor.startDate).toLocaleDateString("en-AU") : "Not set"} testId="text-start-date" />
                    <InfoRow icon={Clock} label="Contract Hours" value={`${contractor.contractHoursPA?.toLocaleString()} h/yr (${Math.round(monthlyAllocation)} h/mo)`} testId="text-contract-hours" />
                    <InfoRow icon={MapPin} label="Location" value={[contractor.suburb, contractor.state].filter(Boolean).join(", ") || "Not set"} testId="text-location" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Timesheets</CardTitle>
            </CardHeader>
            <CardContent>
              {!timesheetsList || timesheetsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No timesheets submitted yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {timesheetsList.map((ts) => (
                    <div
                      key={ts.id}
                      className="flex items-center justify-between gap-4 py-3 px-3 rounded-md bg-muted/50"
                      data-testid={`timesheet-row-${ts.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {MONTHS[ts.month]} {ts.year}
                        </div>
                        <StatusBadge status={ts.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span className="font-mono text-muted-foreground">{ts.totalHours}h</span>
                        {ts.regularHours && parseFloat(ts.overtimeHours || "0") > 0 && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            +{ts.overtimeHours}h OT
                          </span>
                        )}
                        <span className="font-mono text-foreground font-medium">
                          ${parseFloat(ts.grossValue || "0").toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, testId }: { icon: any; label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-sm text-foreground truncate" data-testid={testId}>{value}</span>
    </div>
  );
}
