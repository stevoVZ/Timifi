import { SidebarTrigger } from "@/components/ui/sidebar";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-background sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <div>
          <h1 className="text-lg font-semibold text-foreground" data-testid="text-page-title">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-page-subtitle">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  );
}
