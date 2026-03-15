import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Users, Clock, CreditCard, FileText, Bell, Settings, DollarSign, ClipboardCheck, Wallet, TrendingUp, BookOpen, Receipt, Search, Gift } from "lucide-react";
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
  { title: "RCTIs", url: "/rctis", icon: Receipt },
  { title: "Reconciliation", url: "/reconciliation", icon: ClipboardCheck },
  { title: "Bank Statements", url: "/bank-statements", icon: Wallet },
  { title: "Cash Position", url: "/cash-position", icon: DollarSign },
  { title: "Profitability", url: "/profitability", icon: TrendingUp },
  { title: "Referral Bonuses", url: "/referral-bonuses", icon: Gift },
  { title: "Client Ledger", url: "/client-ledger", icon: BookOpen },
  { title: "Pay Items", url: "/pay-items", icon: DollarSign },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Settings", url: "/settings", icon: Settings },
];

type CurrentUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
};

export function AppSidebar() {
  const [location] = useLocation();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
  });

  const unreadCount = unreadData?.count || 0;

  const userName = currentUser?.displayName || currentUser?.username || "Admin";
  const userRole = currentUser?.role || "admin";
  const userInitials = currentUser?.displayName
    ? currentUser.displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (currentUser?.username || "A").slice(0, 2).toUpperCase();

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
        <button
          onClick={() => {
            const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
            document.dispatchEvent(event);
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          data-testid="button-search-shortcut"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[9px] bg-sidebar-accent px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary" data-testid="avatar-current-user">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate" data-testid="text-current-user-name">{userName}</div>
            <div className="text-[11px] text-muted-foreground capitalize">{userRole}</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
