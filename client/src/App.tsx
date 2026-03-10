import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import EmployeesPage from "@/pages/employees";
import EmployeeDetailPage from "@/pages/employee-detail";
import TimesheetsPage from "@/pages/timesheets";
import PayrollPage from "@/pages/payroll";
import PayrollDetailPage from "@/pages/payroll-detail";
import InvoicesPage from "@/pages/invoices";
import NotificationsPage from "@/pages/notifications";
import SettingsPage from "@/pages/settings";
import EmployeeNewPage from "@/pages/employee-new";
import PortalLoginPage from "@/pages/portal/portal-login";
import PortalDashboardPage from "@/pages/portal/portal-dashboard";
import PortalTimesheetsPage from "@/pages/portal/portal-timesheets";
import PortalPayslipsPage from "@/pages/portal/portal-payslips";
import PortalMessagesPage from "@/pages/portal/portal-messages";
import PortalOnboardingPage from "@/pages/portal/portal-onboarding";
import PortalLeavePage from "@/pages/portal/portal-leave";
import PayItemsPage from "@/pages/pay-items";
import ReconciliationPage from "@/pages/reconciliation";
import BankStatementsPage from "@/pages/bank-statements";
import ProfitabilityPage from "@/pages/profitability";
import ProfitabilityDetailPage from "@/pages/profitability-detail";
import ClientLedgerPage from "@/pages/client-ledger";
import RctisPage from "@/pages/rctis";
import CashPositionPage from "@/pages/cash-position";

function useAuth() {
  return useQuery<{ id: string; username: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60000,
    retry: false,
  });
}

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/employees/new" component={EmployeeNewPage} />
      <Route path="/employees" component={EmployeesPage} />
      <Route path="/employees/:id" component={EmployeeDetailPage} />
      <Route path="/timesheets" component={TimesheetsPage} />
      <Route path="/payroll/:id" component={PayrollDetailPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/rctis" component={RctisPage} />
      <Route path="/reconciliation" component={ReconciliationPage} />
      <Route path="/bank-statements" component={BankStatementsPage} />
      <Route path="/cash-position" component={CashPositionPage} />
      <Route path="/profitability/:employeeId/:year/:month" component={ProfitabilityDetailPage} />
      <Route path="/profitability" component={ProfitabilityPage} />
      <Route path="/client-ledger" component={ClientLedgerPage} />
      <Route path="/pay-items" component={PayItemsPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminLayout() {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <AdminRouter />
        </div>
      </div>
    </SidebarProvider>
  );
}

function PortalGuard({ component: Component }: { component: React.ComponentType }) {
  const employeeId = localStorage.getItem("portal_employee_id");
  if (!employeeId) {
    return <Redirect to="/portal/login" />;
  }
  return <Component />;
}

function PortalRouter() {
  return (
    <Switch>
      <Route path="/portal/login" component={PortalLoginPage} />
      <Route path="/portal/dashboard">{() => <PortalGuard component={PortalDashboardPage} />}</Route>
      <Route path="/portal/timesheets">{() => <PortalGuard component={PortalTimesheetsPage} />}</Route>
      <Route path="/portal/payslips">{() => <PortalGuard component={PortalPayslipsPage} />}</Route>
      <Route path="/portal/messages">{() => <PortalGuard component={PortalMessagesPage} />}</Route>
      <Route path="/portal/leave">{() => <PortalGuard component={PortalLeavePage} />}</Route>
      <Route path="/portal/onboarding">{() => <PortalGuard component={PortalOnboardingPage} />}</Route>
      <Route path="/portal">{() => {
        const employeeId = localStorage.getItem("portal_employee_id");
        return <Redirect to={employeeId ? "/portal/dashboard" : "/portal/login"} />;
      }}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const isPortal = location.startsWith("/portal");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {isPortal ? <PortalRouter /> : <AdminLayout />}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
