import { useLocation, Link } from "wouter";
import type { ReactNode } from "react";
import { LayoutDashboard, Clock, Receipt, MessageSquare, LogOut, CalendarDays, ClipboardCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const portalNavItems = [
  { title: "Dashboard", url: "/portal/dashboard", icon: LayoutDashboard },
  { title: "Timesheets", url: "/portal/timesheets", icon: Clock },
  { title: "Leave", url: "/portal/leave", icon: CalendarDays },
  { title: "Payslips", url: "/portal/payslips", icon: Receipt },
  { title: "Messages", url: "/portal/messages", icon: MessageSquare },
  { title: "Onboarding", url: "/portal/onboarding", icon: ClipboardCheck },
];

interface PortalShellProps {
  children: React.ReactNode;
  contractorName?: string;
}

function PortalSidebar({ contractorName }: { contractorName?: string }) {
  const [location] = useLocation();

  const isActive = (url: string) => location === url || location.startsWith(url + "/");

  const initials = contractorName
    ? contractorName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "CP";

  return (
    <Sidebar>
      <SidebarHeader className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center bg-primary text-primary-foreground font-bold text-sm"
            data-testid="portal-logo-icon"
          >
            CP
          </div>
          <div>
            <div className="font-semibold text-sm text-sidebar-foreground" data-testid="text-portal-name">
              Contractor Portal
            </div>
            <div className="text-[11px] text-muted-foreground">
              Self-Service
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {portalNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive(item.url)}
                    data-testid={`portal-nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 py-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate" data-testid="text-portal-user">
              {contractorName || "Contractor"}
            </div>
            <div className="text-[11px] text-muted-foreground">Contractor</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 mt-2"
          data-testid="button-portal-logout"
          onClick={() => {
            localStorage.removeItem("portal_contractor_id");
            localStorage.removeItem("portal_contractor_name");
            window.location.href = "/portal/login";
          }}
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export function PortalShell({ children, contractorName }: PortalShellProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PortalSidebar contractorName={contractorName} />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-3 px-6 py-4 border-b bg-background sticky top-0 z-50">
            <SidebarTrigger data-testid="button-portal-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
