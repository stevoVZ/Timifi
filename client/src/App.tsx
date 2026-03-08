import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import ContractorsPage from "@/pages/contractors";
import ContractorDetailPage from "@/pages/contractor-detail";
import TimesheetsPage from "@/pages/timesheets";
import PayrollPage from "@/pages/payroll";
import InvoicesPage from "@/pages/invoices";

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/contractors" component={ContractorsPage} />
      <Route path="/contractors/:id" component={ContractorDetailPage} />
      <Route path="/timesheets" component={TimesheetsPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Router />
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
