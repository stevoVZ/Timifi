import { SidebarTrigger } from "@/components/ui/sidebar";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 border-b bg-background sticky top-0 z-50">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-foreground truncate" data-testid="text-page-title">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid="text-page-subtitle">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">{actions}</div>}
    </header>
  );
}
