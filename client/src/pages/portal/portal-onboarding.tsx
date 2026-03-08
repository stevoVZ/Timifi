import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@shared/schema";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronLeft,
  User,
  MapPin,
  FileText,
  Landmark,
  Shield,
  PartyPopper,
  Loader2,
} from "lucide-react";

const STEPS = [
  { key: "welcome", label: "Welcome", icon: PartyPopper },
  { key: "personal", label: "Personal", icon: User },
  { key: "address", label: "Address", icon: MapPin },
  { key: "tax", label: "Tax", icon: FileText },
  { key: "bank", label: "Bank", icon: Landmark },
  { key: "super", label: "Super", icon: Shield },
  { key: "done", label: "Complete", icon: CheckCircle2 },
];

export default function PortalOnboardingPage() {
  const employeeId = localStorage.getItem("portal_employee_id") || "";
  const employeeName = localStorage.getItem("portal_employee_name") || "";
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  const { data: onboardingStatus, isLoading: statusLoading } = useQuery<{
    personal: boolean;
    tax: boolean;
    bank: boolean;
    super: boolean;
  }>({
    queryKey: ["/api/onboarding", employeeId],
  });

  const { data: employee } = useQuery<Employee>({
    queryKey: ["/api/employees", employeeId],
  });

  const [personalForm, setPersonalForm] = useState({
    dateOfBirth: "",
    gender: "",
    phone: "",
  });

  const [addressForm, setAddressForm] = useState({
    addressLine1: "",
    suburb: "",
    state: "",
    postcode: "",
  });

  const [taxForm, setTaxForm] = useState({
    tfn: "",
    residencyStatus: "RESIDENT",
    claimTaxFreeThreshold: true,
    helpDebt: false,
    studentLoan: false,
  });

  const [bankForm, setBankForm] = useState({
    bsb: "",
    accountNumber: "",
    accountName: "",
    bankName: "",
  });

  const [superForm, setSuperForm] = useState({
    fundName: "",
    fundAbn: "",
    memberNumber: "",
    usiNumber: "",
  });

  useEffect(() => {
    if (employee) {
      setPersonalForm({
        dateOfBirth: employee.dateOfBirth || "",
        gender: employee.gender || "",
        phone: employee.phone || "",
      });
      setAddressForm({
        addressLine1: employee.addressLine1 || "",
        suburb: employee.suburb || "",
        state: employee.state || "",
        postcode: employee.postcode || "",
      });
    }
  }, [employee]);

  const personalMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/onboarding/personal", {
        employeeId,
        ...personalForm,
        ...addressForm,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", employeeId] });
      toast({ title: "Personal details saved" });
      setStep(3);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const taxMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/onboarding/tax", { employeeId, ...taxForm });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", employeeId] });
      toast({ title: "Tax declaration saved" });
      setStep(4);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bankMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/onboarding/bank", { employeeId, ...bankForm });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", employeeId] });
      toast({ title: "Bank details saved" });
      setStep(5);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const superMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/onboarding/super", { employeeId, ...superForm });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", employeeId] });
      toast({ title: "Super details saved" });
      setStep(6);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const completedSteps = onboardingStatus
    ? [true, onboardingStatus.personal, onboardingStatus.personal, onboardingStatus.tax, onboardingStatus.bank, onboardingStatus.super]
    : [];
  const allComplete = onboardingStatus && onboardingStatus.personal && onboardingStatus.tax && onboardingStatus.bank && onboardingStatus.super;

  if (statusLoading) {
    return (
      <PortalShell employeeName={employeeName}>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell employeeName={employeeName}>
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-onboarding-title">Onboarding</h1>
          <p className="text-sm text-muted-foreground">Complete your profile setup</p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const isComplete = i < completedSteps.length && completedSteps[i];
            const isCurrent = i === step;
            return (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-${s.key}`}
              >
                {isComplete && !isCurrent ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <s.icon className="w-3.5 h-3.5" />
                )}
                {s.label}
              </button>
            );
          })}
        </div>

        {step === 0 && (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <PartyPopper className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-lg font-semibold">Welcome, {employeeName}!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Let's get you set up. We'll need your personal details, tax file number,
                bank account, and superannuation information. This should take about 5 minutes.
              </p>
              <Button onClick={() => setStep(1)} data-testid="button-start-onboarding">
                Get Started <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" /> Personal Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={personalForm.dateOfBirth}
                    onChange={(e) => setPersonalForm({ ...personalForm, dateOfBirth: e.target.value })}
                    data-testid="input-onboard-dob"
                  />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={personalForm.gender} onValueChange={(v) => setPersonalForm({ ...personalForm, gender: v })}>
                    <SelectTrigger data-testid="select-onboard-gender">
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
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={personalForm.phone}
                    onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                    placeholder="0412 345 678"
                    data-testid="input-onboard-phone"
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)} data-testid="button-back-welcome">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => {
                    if (!personalForm.dateOfBirth) {
                      toast({ title: "Date of birth is required", variant: "destructive" });
                      return;
                    }
                    setStep(2);
                  }}
                  data-testid="button-next-address"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Street Address</Label>
                <Input
                  value={addressForm.addressLine1}
                  onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                  placeholder="123 Main Street"
                  data-testid="input-onboard-address"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Suburb</Label>
                  <Input
                    value={addressForm.suburb}
                    onChange={(e) => setAddressForm({ ...addressForm, suburb: e.target.value })}
                    data-testid="input-onboard-suburb"
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Select value={addressForm.state} onValueChange={(v) => setAddressForm({ ...addressForm, state: v })}>
                    <SelectTrigger data-testid="select-onboard-state">
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
                  <Input
                    value={addressForm.postcode}
                    onChange={(e) => setAddressForm({ ...addressForm, postcode: e.target.value })}
                    maxLength={4}
                    data-testid="input-onboard-postcode"
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-personal">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => personalMutation.mutate()}
                  disabled={personalMutation.isPending}
                  data-testid="button-save-personal"
                >
                  {personalMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Save & Continue <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" /> Tax File Declaration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tax File Number (TFN)</Label>
                <Input
                  value={taxForm.tfn}
                  onChange={(e) => setTaxForm({ ...taxForm, tfn: e.target.value })}
                  placeholder="123 456 789"
                  maxLength={11}
                  data-testid="input-onboard-tfn"
                />
              </div>
              <div>
                <Label>Residency Status</Label>
                <Select value={taxForm.residencyStatus} onValueChange={(v) => setTaxForm({ ...taxForm, residencyStatus: v })}>
                  <SelectTrigger data-testid="select-onboard-residency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RESIDENT">Australian Resident</SelectItem>
                    <SelectItem value="FOREIGN_RESIDENT">Foreign Resident</SelectItem>
                    <SelectItem value="WORKING_HOLIDAY">Working Holiday Maker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Claim tax-free threshold</Label>
                  <Switch
                    checked={taxForm.claimTaxFreeThreshold}
                    onCheckedChange={(v) => setTaxForm({ ...taxForm, claimTaxFreeThreshold: v })}
                    data-testid="switch-tax-free"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">HELP / HECS debt</Label>
                  <Switch
                    checked={taxForm.helpDebt}
                    onCheckedChange={(v) => setTaxForm({ ...taxForm, helpDebt: v })}
                    data-testid="switch-help-debt"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Student loan (SFSS)</Label>
                  <Switch
                    checked={taxForm.studentLoan}
                    onCheckedChange={(v) => setTaxForm({ ...taxForm, studentLoan: v })}
                    data-testid="switch-student-loan"
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-address">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => taxMutation.mutate()}
                  disabled={taxMutation.isPending || !taxForm.tfn}
                  data-testid="button-save-tax"
                >
                  {taxMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Save & Continue <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="w-4 h-4" /> Bank Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>BSB</Label>
                  <Input
                    value={bankForm.bsb}
                    onChange={(e) => setBankForm({ ...bankForm, bsb: e.target.value })}
                    placeholder="000-000"
                    maxLength={7}
                    data-testid="input-onboard-bsb"
                  />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input
                    value={bankForm.accountNumber}
                    onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                    data-testid="input-onboard-account"
                  />
                </div>
              </div>
              <div>
                <Label>Account Name</Label>
                <Input
                  value={bankForm.accountName}
                  onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                  placeholder="Full name on account"
                  data-testid="input-onboard-account-name"
                />
              </div>
              <div>
                <Label>Bank Name (optional)</Label>
                <Input
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  placeholder="e.g. Commonwealth Bank"
                  data-testid="input-onboard-bank-name"
                />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)} data-testid="button-back-tax">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => bankMutation.mutate()}
                  disabled={bankMutation.isPending || !bankForm.bsb || !bankForm.accountNumber || !bankForm.accountName}
                  data-testid="button-save-bank"
                >
                  {bankMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Save & Continue <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" /> Superannuation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Fund Name</Label>
                <Input
                  value={superForm.fundName}
                  onChange={(e) => setSuperForm({ ...superForm, fundName: e.target.value })}
                  placeholder="e.g. AustralianSuper"
                  data-testid="input-onboard-fund-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fund ABN</Label>
                  <Input
                    value={superForm.fundAbn}
                    onChange={(e) => setSuperForm({ ...superForm, fundAbn: e.target.value })}
                    data-testid="input-onboard-fund-abn"
                  />
                </div>
                <div>
                  <Label>USI Number</Label>
                  <Input
                    value={superForm.usiNumber}
                    onChange={(e) => setSuperForm({ ...superForm, usiNumber: e.target.value })}
                    data-testid="input-onboard-usi"
                  />
                </div>
              </div>
              <div>
                <Label>Member Number</Label>
                <Input
                  value={superForm.memberNumber}
                  onChange={(e) => setSuperForm({ ...superForm, memberNumber: e.target.value })}
                  data-testid="input-onboard-member"
                />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(4)} data-testid="button-back-bank">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => superMutation.mutate()}
                  disabled={superMutation.isPending || !superForm.fundName}
                  data-testid="button-save-super"
                >
                  {superMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Save & Complete <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 6 && (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <h2 className="text-lg font-semibold">Onboarding Complete!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {allComplete
                  ? "All your details have been submitted. Your administrator will review them shortly."
                  : "Some steps are still incomplete. You can revisit them anytime by clicking the steps above."}
              </p>
              <Button onClick={() => window.location.href = "/portal/dashboard"} data-testid="button-go-dashboard">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
