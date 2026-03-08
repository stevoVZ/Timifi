import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import ContractorsPage from "@/pages/contractors";
import ContractorDetailPage from "@/pages/contractor-detail";
import TimesheetsPage from "@/pages/timesheets";
import PayrollPage from "@/pages/payroll";
import InvoicesPage from "@/pages/invoices";
import NotificationsPage from "@/pages/notifications";
import SettingsPage from "@/pages/settings";
import PortalLoginPage from "@/pages/portal/portal-login";
import PortalDashboardPage from "@/pages/portal/portal-dashboard";
import PortalTimesheetsPage from "@/pages/portal/portal-timesheets";
import PortalPayslipsPage from "@/pages/portal/portal-payslips";
import PortalMessagesPage from "@/pages/portal/portal-messages";

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/contractors" component={ContractorsPage} />
      <Route path="/contractors/:id" component={ContractorDetailPage} />
      <Route path="/timesheets" component={TimesheetsPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminLayout() {
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
  const contractorId = localStorage.getItem("portal_contractor_id");
  if (!contractorId) {
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
      <Route path="/portal">{() => {
        const contractorId = localStorage.getItem("portal_contractor_id");
        return <Redirect to={contractorId ? "/portal/dashboard" : "/portal/login"} />;
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
