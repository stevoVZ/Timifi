import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, User, Briefcase, Shield, Building } from "lucide-react";
import type { Employee } from "@shared/schema";

export default function EmployeeNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    addressLine1: "",
    suburb: "",
    state: "",
    postcode: "",
    jobTitle: "",
    clientName: "",
    status: "ACTIVE",
    employmentType: "LABOURHIRE",
    paymentMethod: "PAYROLL",
    companyName: "",
    abn: "",
    hourlyRate: "",
    chargeOutRate: "",
    contractCode: "",
    roleTitle: "",
    contractHoursPA: "2000",
    payFrequency: "MONTHLY",
    startDate: "",
    endDate: "",
    clearanceLevel: "NONE",
    clearanceExpiry: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/employees", data);
      return res.json() as Promise<Employee>;
    },
    onSuccess: (employee) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Employee created successfully" });
      navigate(`/employees/${employee.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) {
      toast({ title: "Required fields", description: "First name, last name, and email are required", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      ...form,
      hourlyRate: form.hourlyRate || null,
      chargeOutRate: form.chargeOutRate || null,
      companyName: form.companyName || null,
      abn: form.abn || null,
      contractCode: form.contractCode || null,
      roleTitle: form.roleTitle || null,
      contractHoursPA: parseInt(form.contractHoursPA) || 2000,
      clearanceExpiry: form.clearanceExpiry || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      dateOfBirth: form.dateOfBirth || null,
    };
    createMutation.mutate(payload);
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <>
      <TopBar
        title="New Employee"
        subtitle="Add a new employee to the system"
        actions={
          <Button variant="outline" onClick={() => navigate("/employees")} data-testid="button-back-employees">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        }
      />
      <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4" />
              Personal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} data-testid="input-first-name" />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} data-testid="input-last-name" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} data-testid="input-email" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} data-testid="input-phone" />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} data-testid="input-dob" />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
                <SelectTrigger data-testid="select-gender">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Non-binary">Non-binary</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} placeholder="Street address" data-testid="input-address" />
            </div>
            <div>
              <Label>Suburb</Label>
              <Input value={form.suburb} onChange={(e) => update("suburb", e.target.value)} data-testid="input-suburb" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>State</Label>
                <Select value={form.state} onValueChange={(v) => update("state", v)}>
                  <SelectTrigger data-testid="select-state">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={form.postcode} onChange={(e) => update("postcode", e.target.value)} maxLength={4} data-testid="input-postcode" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="w-4 h-4" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Job Title</Label>
              <Input value={form.jobTitle} onChange={(e) => update("jobTitle", e.target.value)} data-testid="input-job-title" />
            </div>
            <div>
              <Label>Contract Code</Label>
              <Input value={form.contractCode} onChange={(e) => update("contractCode", e.target.value)} placeholder="e.g. CD012456" data-testid="input-contract-code" />
            </div>
            <div>
              <Label>Role Title</Label>
              <Input value={form.roleTitle} onChange={(e) => update("roleTitle", e.target.value)} placeholder="e.g. Senior Business Analyst" data-testid="input-role-title" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="OFFBOARDED">Offboarded / Resigned</SelectItem>
                  <SelectItem value="PENDING_SETUP">Pending Setup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employment Type</Label>
              <Select value={form.employmentType} onValueChange={(v) => update("employmentType", v)}>
                <SelectTrigger data-testid="select-employment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULLTIME">Full Time</SelectItem>
                  <SelectItem value="PARTTIME">Part Time</SelectItem>
                  <SelectItem value="CASUAL">Casual</SelectItem>
                  <SelectItem value="LABOURHIRE">Labour Hire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => update("paymentMethod", v)}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAYROLL">Payroll (paid via pay run)</SelectItem>
                  <SelectItem value="INVOICE">Invoice (employee invoices via Pty Ltd)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentMethod === "INVOICE" && (
              <>
                <div>
                  <Label>Company / Trading Name</Label>
                  <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="e.g. Smith Consulting Pty Ltd" data-testid="input-company-name" />
                </div>
                <div>
                  <Label>ABN</Label>
                  <Input value={form.abn} onChange={(e) => update("abn", e.target.value)} placeholder="e.g. 12 345 678 901" data-testid="input-abn" />
                </div>
              </>
            )}
            <div>
              <Label>Charge-Out Rate (Ex GST)</Label>
              <Input type="number" step="0.01" value={form.chargeOutRate} onChange={(e) => update("chargeOutRate", e.target.value)} placeholder="e.g. 180.00" data-testid="input-charge-out-rate" />
            </div>
            <div>
              <Label>Pay Rate / Rate to Them (Ex GST)</Label>
              <Input type="number" step="0.01" value={form.hourlyRate} onChange={(e) => update("hourlyRate", e.target.value)} placeholder="e.g. 160.00" data-testid="input-hourly-rate" />
            </div>
            {(form.chargeOutRate || form.hourlyRate) && (
              <div className="col-span-full grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Rate (Inc GST)</span>
                  <div className="text-sm font-bold text-foreground" data-testid="text-total-rate-inc-gst">
                    ${form.chargeOutRate ? (parseFloat(form.chargeOutRate) * 1.1).toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Billable Rate (Ex GST)</span>
                  <div className="text-sm font-bold text-foreground" data-testid="text-billable-rate-ex-gst">
                    ${form.chargeOutRate ? parseFloat(form.chargeOutRate).toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">GST</span>
                  <div className="text-sm font-bold text-foreground" data-testid="text-gst-amount">
                    ${form.chargeOutRate ? (parseFloat(form.chargeOutRate) * 0.1).toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Margin</span>
                  <div className="text-sm font-bold text-foreground" data-testid="text-margin">
                    {form.chargeOutRate && form.hourlyRate
                      ? `$${(parseFloat(form.chargeOutRate) - parseFloat(form.hourlyRate)).toFixed(2)}/hr`
                      : "—"}
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label>Contract Hours p.a.</Label>
              <Input type="number" value={form.contractHoursPA} onChange={(e) => update("contractHoursPA", e.target.value)} data-testid="input-contract-hours" />
            </div>
            <div>
              <Label>Pay Frequency</Label>
              <Select value={form.payFrequency} onValueChange={(v) => update("payFrequency", v)}>
                <SelectTrigger data-testid="select-pay-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} data-testid="input-start-date" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} data-testid="input-end-date" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building className="w-4 h-4" />
              Client Placement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label>Client Name</Label>
              <Input value={form.clientName} onChange={(e) => update("clientName", e.target.value)} placeholder="e.g. Department of Defence" data-testid="input-client-name" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-4 h-4" />
              Security Clearance
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Clearance Level</Label>
              <Select value={form.clearanceLevel} onValueChange={(v) => update("clearanceLevel", v)}>
                <SelectTrigger data-testid="select-clearance-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="BASELINE">Baseline</SelectItem>
                  <SelectItem value="NV1">NV1</SelectItem>
                  <SelectItem value="NV2">NV2</SelectItem>
                  <SelectItem value="PV">PV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Clearance Expiry</Label>
              <Input type="date" value={form.clearanceExpiry} onChange={(e) => update("clearanceExpiry", e.target.value)} data-testid="input-clearance-expiry" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              data-testid="input-notes"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/employees")} data-testid="button-cancel-new">
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-employee">
            <Save className="w-4 h-4 mr-2" />
            {createMutation.isPending ? "Creating..." : "Create Employee"}
          </Button>
        </div>
      </form>
    </>
  );
}
