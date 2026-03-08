import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "Active", variant: "default" },
  PENDING_SETUP: { label: "Pending", variant: "secondary" },
  OFFBOARDED: { label: "Offboarded", variant: "outline" },
  DRAFT: { label: "Draft", variant: "secondary" },
  SUBMITTED: { label: "Submitted", variant: "default" },
  APPROVED: { label: "Approved", variant: "default" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  AUTHORISED: { label: "Authorised", variant: "secondary" },
  SENT: { label: "Sent", variant: "default" },
  PAID: { label: "Paid", variant: "default" },
  VOIDED: { label: "Voided", variant: "outline" },
  OVERDUE: { label: "Overdue", variant: "destructive" },
  PROCESSING: { label: "Processing", variant: "secondary" },
  REVIEW: { label: "Review", variant: "secondary" },
  FILED: { label: "Filed", variant: "default" },
  INCLUDED: { label: "Included", variant: "default" },
  EXCLUDED: { label: "Excluded", variant: "outline" },
  ERROR: { label: "Error", variant: "destructive" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, variant: "outline" as const };
  return (
    <Badge variant={config.variant} className={className} data-testid={`badge-status-${status.toLowerCase()}`}>
      {config.label}
    </Badge>
  );
}
