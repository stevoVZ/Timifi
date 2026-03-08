import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Users, Clock, CreditCard, FileText, Bell, Settings, DollarSign, ClipboardCheck, Wallet, TrendingUp, BookOpen } from "lucide-react";
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
  SidebarMenuBadge,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Timesheets", url: "/timesheets", icon: Clock },
  { title: "Payroll", url: "/payroll", icon: CreditCard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Reconciliation", url: "/reconciliation", icon: ClipboardCheck },
  { title: "Bank Statements", url: "/bank-statements", icon: Wallet },
  { title: "Profitability", url: "/profitability", icon: TrendingUp },
  { title: "Client Ledger", url: "/client-ledger", icon: BookOpen },
  { title: "Pay Items", url: "/pay-items", icon: DollarSign },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center bg-primary text-primary-foreground font-bold text-sm"
            data-testid="logo-icon"
          >
            RP
          </div>
          <div>
            <div className="font-semibold text-sm text-sidebar-foreground" data-testid="text-app-name">
              Recruitment Portal
            </div>
            <div className="text-[11px] text-muted-foreground">
              Labour Hire Management
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive(item.url)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.title === "Notifications" && unreadCount > 0 && (
                    <SidebarMenuBadge
                      className="bg-destructive text-destructive-foreground text-[10px] font-bold"
                      data-testid="badge-notification-count"
                    >
                      {unreadCount}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 py-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
            SC
          </div>
          <div>
            <div className="text-sm font-medium text-sidebar-foreground">Sarah Chen</div>
            <div className="text-[11px] text-muted-foreground">Admin</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
