import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, FileText, CreditCard, Clock } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

type SearchResult = {
  employees: { id: string; name: string; jobTitle: string | null; clientName: string | null; status: string }[];
  invoices: { id: string; invoiceNumber: string | null; contactName: string | null; amountExclGst: string; status: string; year: number; month: number }[];
  payRuns: { id: string; year: number; month: number; status: string; totalGross: string }[];
  timesheets: { id: string; employeeName: string; year: number; month: number; totalHours: string; status: string }[];
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      if (!query.trim()) return { employees: [], invoices: [], payRuns: [], timesheets: [] };
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return { employees: [], invoices: [], payRuns: [], timesheets: [] };
      return res.json();
    },
    enabled: open && query.length >= 2,
    staleTime: 5000,
  });

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setQuery("");
    setLocation(href);
  }, [setLocation]);

  const results = data || { employees: [], invoices: [], payRuns: [], timesheets: [] };
  const hasResults = results.employees.length + results.invoices.length + results.payRuns.length + results.timesheets.length > 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 text-muted-foreground h-8 text-xs w-48 justify-between"
        data-testid="button-global-search"
      >
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3" />
          <span>Search...</span>
        </div>
        <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search employees, invoices, pay runs..."
          value={query}
          onValueChange={setQuery}
          data-testid="input-global-search"
        />
        <CommandList>
          {query.length >= 2 && !isLoading && !hasResults && (
            <CommandEmpty>No results for "{query}"</CommandEmpty>
          )}
          {query.length < 2 && (
            <CommandEmpty className="py-6 text-sm text-muted-foreground">
              Type at least 2 characters to search...
            </CommandEmpty>
          )}

          {results.employees.length > 0 && (
            <CommandGroup heading="Employees">
              {results.employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`employee-${e.id}`}
                  onSelect={() => navigate(`/employees/${e.id}`)}
                  data-testid={`search-result-employee-${e.id}`}
                >
                  <Users className="w-4 h-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {[e.jobTitle, e.clientName].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.invoices.length > 0 && (
            <CommandGroup heading="Invoices">
              {results.invoices.map((i) => (
                <CommandItem
                  key={i.id}
                  value={`invoice-${i.id}`}
                  onSelect={() => navigate("/invoices")}
                  data-testid={`search-result-invoice-${i.id}`}
                >
                  <FileText className="w-4 h-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium">{i.invoiceNumber || "Draft"}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {i.contactName} · ${parseFloat(i.amountExclGst).toLocaleString()} · {i.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.payRuns.length > 0 && (
            <CommandGroup heading="Pay Runs">
              {results.payRuns.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`payrun-${p.id}`}
                  onSelect={() => navigate(`/payroll/${p.id}`)}
                  data-testid={`search-result-payrun-${p.id}`}
                >
                  <CreditCard className="w-4 h-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium">{MONTH_NAMES[(p.month - 1)]} {p.year}</span>
                    <span className="text-xs text-muted-foreground">
                      ${parseFloat(p.totalGross).toLocaleString()} gross · {p.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.timesheets.length > 0 && (
            <CommandGroup heading="Timesheets">
              {results.timesheets.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`timesheet-${t.id}`}
                  onSelect={() => navigate("/timesheets")}
                  data-testid={`search-result-timesheet-${t.id}`}
                >
                  <Clock className="w-4 h-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium">{t.employeeName}</span>
                    <span className="text-xs text-muted-foreground">
                      {MONTH_NAMES[(t.month - 1)]} {t.year} · {t.totalHours}h · {t.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
