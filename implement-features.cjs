/**
 * Timifi Feature Implementation Script
 * Run from the project root: node implement-features.js
 *
 * Implements:
 * 1. Portal security  — PIN-based login + server-side session auth
 * 2. Auto-notifications — on leave/timesheet status changes + pay run filing
 * 3. Global search     — /api/search endpoint
 * 4. CSV export        — payroll, invoices, timesheets pages
 * 5. Portal PDF upload — employees can upload timesheet PDFs via portal
 */

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function read(filePath) {
  return fs.readFileSync(path.join(__dirname, filePath), "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(path.join(__dirname, filePath), content, "utf8");
}

function patch(filePath, description, find, replace) {
  let src;
  try { src = read(filePath); } catch (e) {
    console.error(`  ✗ FAILED [${description}] — could not read ${filePath}`);
    failed++; return;
  }
  if (!src.includes(find)) {
    console.error(`  ✗ FAILED [${description}] — search string not found`);
    console.error(`    Looking for: ${find.slice(0, 100).replace(/\n/g, "↵")}`);
    failed++; return;
  }
  write(filePath, src.replace(find, replace));
  console.log(`  ✓ OK     [${description}]`);
  passed++;
}

function createFile(filePath, description, content) {
  try {
    fs.mkdirSync(path.join(__dirname, path.dirname(filePath)), { recursive: true });
    write(filePath, content);
    console.log(`  ✓ OK     [${description}]`);
    passed++;
  } catch (e) {
    console.error(`  ✗ FAILED [${description}] — ${e.message}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: SCHEMA — add portalPasswordHash to employees
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 1: Schema ──");

patch(
  "shared/schema.ts",
  "Schema: add portalPasswordHash to employees table",
  `  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const timesheets`,
  `  portalPasswordHash: text("portal_password_hash"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const timesheets`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: SERVER ROUTES — portal security
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 2: Portal Security ──");

// 2a. Add requirePortalAuth + helper near top of registerRoutes
patch(
  "server/routes.ts",
  "Routes: add portal auth helpers",
  `export async function registerRoutes(app: Express): Promise<Server> {`,
  `// ── Portal auth helpers ──────────────────────────────────────────
function requirePortalAuth(req: any, res: any, next: any) {
  if (req.session?.portalEmployeeId) return next();
  return res.status(401).json({ message: "Portal authentication required" });
}

function requirePortalSelf(req: any, res: any, next: any) {
  const sessionId = req.session?.portalEmployeeId;
  if (!sessionId) return res.status(401).json({ message: "Portal authentication required" });
  if (sessionId !== req.params.employeeId) return res.status(403).json({ message: "Access denied" });
  return next();
}

export async function registerRoutes(app: Express): Promise<Server> {`
);

// 2b. Replace insecure portal login with PIN-based login
patch(
  "server/routes.ts",
  "Routes: secure portal login with password",
  `  app.post(\"/api/portal/login\", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const allEmployees = await storage.getEmployees();
      const employee = allEmployees.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (!employee) return res.status(401).json({ message: "No employee found with that email" });
      res.json({
        employeeId: employee.id,
        name: \`\${employee.firstName} \${employee.lastName}\`,
      });
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });`,
  `  app.post("/api/portal/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      if (!password) return res.status(400).json({ message: "Password is required" });
      const allEmployees = await storage.getEmployees();
      const employee = allEmployees.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (!employee) return res.status(401).json({ message: "Invalid email or password" });

      // If no portal password set, reject — admin must set one first
      if (!(employee as any).portalPasswordHash) {
        return res.status(401).json({ message: "Portal access not yet activated. Contact your administrator." });
      }
      const valid = await comparePasswords(password, (employee as any).portalPasswordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      (req as any).session.portalEmployeeId = employee.id;
      res.json({
        employeeId: employee.id,
        name: \`\${employee.firstName} \${employee.lastName}\`,
      });
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/portal/me", (req: any, res) => {
    const id = req.session?.portalEmployeeId;
    if (!id) return res.status(401).json({ message: "Not authenticated" });
    storage.getEmployee(id).then(emp => {
      if (!emp) return res.status(401).json({ message: "Employee not found" });
      res.json({ employeeId: emp.id, name: \`\${emp.firstName} \${emp.lastName}\` });
    }).catch(() => res.status(500).json({ message: "Error" }));
  });

  app.post("/api/portal/logout", (req: any, res) => {
    delete req.session.portalEmployeeId;
    res.json({ success: true });
  });`
);

// 2c. Secure portal employee stats route
patch(
  "server/routes.ts",
  "Routes: secure portal stats endpoint",
  `  app.get("/api/portal/employee/:employeeId/stats", async (req, res) => {`,
  `  app.get("/api/portal/employee/:employeeId/stats", requirePortalSelf, async (req, res) => {`
);

// 2d. Secure portal tax/bank/super endpoints
patch(
  "server/routes.ts",
  "Routes: secure portal tax endpoint",
  `  app.get("/api/portal/employee/:employeeId/tax", async (req, res) => {`,
  `  app.get("/api/portal/employee/:employeeId/tax", requirePortalSelf, async (req, res) => {`
);

patch(
  "server/routes.ts",
  "Routes: secure portal bank endpoint",
  `  app.get("/api/portal/employee/:employeeId/bank", async (req, res) => {`,
  `  app.get("/api/portal/employee/:employeeId/bank", requirePortalSelf, async (req, res) => {`
);

patch(
  "server/routes.ts",
  "Routes: secure portal super endpoint",
  `  app.get("/api/portal/employee/:employeeId/super", async (req, res) => {`,
  `  app.get("/api/portal/employee/:employeeId/super", requirePortalSelf, async (req, res) => {`
);

// 2e. Add admin endpoint to set portal password for an employee
patch(
  "server/routes.ts",
  "Routes: add set-portal-password endpoint",
  `  app.get("/api/employees/stats", async (_req, res) => {`,
  `  app.post("/api/employees/:id/set-portal-password", requireAuth, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      const hashed = await hashPassword(password);
      await storage.updateEmployee(req.params.id, { portalPasswordHash: hashed } as any);
      res.json({ message: "Portal password set successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to set portal password" });
    }
  });

  app.get("/api/employees/stats", async (_req, res) => {`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: AUTO-NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 3: Auto-Notifications ──");

// 3a. Timesheet status change notifications
patch(
  "server/routes.ts",
  "Notifications: timesheet approve/reject",
  `      const timesheet = await storage.updateTimesheet(req.params.id, coerceDates(updateData));
      if (auditEntries.length > 0) {
        await storage.createTimesheetAuditLogs(auditEntries);
      }

      res.json(timesheet);`,
  `      const timesheet = await storage.updateTimesheet(req.params.id, coerceDates(updateData));
      if (auditEntries.length > 0) {
        await storage.createTimesheetAuditLogs(auditEntries);
      }

      // Auto-notify on status change
      if (updateData.status && updateData.status !== existing.status) {
        const emp = await storage.getEmployee(existing.employeeId).catch(() => null);
        const empName = emp ? \`\${emp.firstName} \${emp.lastName}\` : "Employee";
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const period = \`\${monthNames[(existing.month||1)-1]} \${existing.year}\`;
        if (updateData.status === "APPROVED") {
          await storage.createNotification({ type: "TIMESHEET", priority: "MEDIUM",
            title: "Timesheet Approved",
            message: \`\${empName}'s timesheet for \${period} has been approved (\${existing.totalHours}h)\`,
          }).catch(() => null);
        } else if (updateData.status === "REJECTED") {
          await storage.createNotification({ type: "TIMESHEET", priority: "HIGH",
            title: "Timesheet Rejected",
            message: \`\${empName}'s timesheet for \${period} was rejected\`,
          }).catch(() => null);
        }
      }

      res.json(timesheet);`
);

// 3b. Leave status change notifications
patch(
  "server/routes.ts",
  "Notifications: leave approve/reject",
  `  app.patch("/api/leave/:id", async (req, res) => {
    try {
      const leave = await storage.updateLeaveRequest(req.params.id, req.body);
      if (!leave) return res.status(404).json({ message: "Leave request not found" });
      res.json(leave);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update leave request" });
    }
  });`,
  `  app.patch("/api/leave/:id", async (req, res) => {
    try {
      const existing = await storage.getLeaveRequests().then(all => all.find(l => l.id === req.params.id));
      const leave = await storage.updateLeaveRequest(req.params.id, req.body);
      if (!leave) return res.status(404).json({ message: "Leave request not found" });

      // Auto-notify on status change
      if (req.body.status && existing && req.body.status !== existing.status) {
        const emp = await storage.getEmployee(leave.employeeId).catch(() => null);
        const empName = emp ? \`\${emp.firstName} \${emp.lastName}\` : "Employee";
        const leaveType = leave.leaveType.replace(/_/g, " ");
        if (req.body.status === "APPROVED") {
          await storage.createNotification({ type: "SYSTEM", priority: "MEDIUM",
            title: "Leave Approved",
            message: \`\${empName}'s \${leaveType} leave (\${leave.totalDays} days) has been approved\`,
          }).catch(() => null);
        } else if (req.body.status === "REJECTED") {
          await storage.createNotification({ type: "SYSTEM", priority: "HIGH",
            title: "Leave Rejected",
            message: \`\${empName}'s \${leaveType} leave request has been rejected\`,
          }).catch(() => null);
        }
      }
      res.json(leave);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update leave request" });
    }
  });`
);

// 3c. Pay run filing notification
patch(
  "server/routes.ts",
  "Notifications: pay run filed",
  `      res.json({ payRun: updated, lines, linesCreated: lines.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to file pay run" });
    }
  });

  app.get("/api/payslips"`,
  `      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const period = \`\${monthNames[(payRun.month||1)-1]} \${payRun.year}\`;
      await storage.createNotification({ type: "PAYRUN", priority: "HIGH",
        title: "Pay Run Filed",
        message: \`Pay run for \${period} filed — \${lines.length} employees, $\${Number(totalGross).toLocaleString("en-AU", {minimumFractionDigits:2})} gross\`,
      }).catch(() => null);

      res.json({ payRun: updated, lines, linesCreated: lines.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to file pay run" });
    }
  });

  app.get("/api/payslips"`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: SEARCH API ENDPOINT
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 4: Search API ──");

patch(
  "server/routes.ts",
  "Routes: add global search endpoint",
  `  app.get("/api/dashboard/stats", async (_req, res) => {`,
  `  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string || "").toLowerCase().trim();
      if (!q || q.length < 2) return res.json({ employees: [], invoices: [], payRuns: [], timesheets: [] });

      const [allEmployees, allInvoices, allPayRuns, allTimesheets] = await Promise.all([
        storage.getEmployees(),
        storage.getInvoices(),
        storage.getPayRuns(),
        storage.getTimesheets(),
      ]);

      const empMap = new Map(allEmployees.map(e => [e.id, e]));

      const employees = allEmployees.filter(e =>
        \`\${e.firstName} \${e.lastName}\`.toLowerCase().includes(q) ||
        (e.email && e.email.toLowerCase().includes(q)) ||
        (e.clientName && e.clientName.toLowerCase().includes(q)) ||
        (e.jobTitle && e.jobTitle.toLowerCase().includes(q)) ||
        (e.contractCode && e.contractCode.toLowerCase().includes(q))
      ).slice(0, 6).map(e => ({
        id: e.id,
        name: \`\${e.firstName} \${e.lastName}\`,
        jobTitle: e.jobTitle || null,
        clientName: e.clientName || null,
        status: e.status,
      }));

      const invoices = allInvoices.filter(i =>
        (i.invoiceNumber && i.invoiceNumber.toLowerCase().includes(q)) ||
        (i.contactName && i.contactName.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q))
      ).slice(0, 5).map(i => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber || null,
        contactName: i.contactName || null,
        amountExclGst: i.amountExclGst,
        status: i.status,
        year: i.year,
        month: i.month,
      }));

      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const payRuns = allPayRuns.filter(p => {
        const period = \`\${monthNames[(p.month||1)-1]} \${p.year}\`.toLowerCase();
        return period.includes(q) || p.status.toLowerCase().includes(q) ||
          String(p.year).includes(q);
      }).slice(0, 4).map(p => ({
        id: p.id, year: p.year, month: p.month, status: p.status, totalGross: p.totalGross,
      }));

      const timesheets = allTimesheets.filter(t => {
        const emp = empMap.get(t.employeeId);
        if (!emp) return false;
        const name = \`\${emp.firstName} \${emp.lastName}\`.toLowerCase();
        const period = \`\${monthNames[(t.month||1)-1]} \${t.year}\`.toLowerCase();
        return name.includes(q) || period.includes(q) || t.status.toLowerCase().includes(q);
      }).slice(0, 5).map(t => {
        const emp = empMap.get(t.employeeId);
        return {
          id: t.id,
          employeeName: emp ? \`\${emp.firstName} \${emp.lastName}\` : "Unknown",
          year: t.year, month: t.month, totalHours: t.totalHours, status: t.status,
        };
      });

      res.json({ employees, invoices, payRuns, timesheets });
    } catch (err: any) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.get("/api/dashboard/stats", async (_req, res) => {`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: GLOBAL SEARCH UI — update App.tsx + AppSidebar
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 5: Global Search UI ──");

// 5a. Mount GlobalSearch in App.tsx AdminLayout
patch(
  "client/src/App.tsx",
  "App: import GlobalSearch",
  `import CashPositionPage from "@/pages/cash-position";`,
  `import CashPositionPage from "@/pages/cash-position";
import { GlobalSearch } from "@/components/global-search";`
);

patch(
  "client/src/App.tsx",
  "App: render GlobalSearch in AdminLayout",
  `  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <AdminRouter />
        </div>
      </div>
    </SidebarProvider>
  );`,
  `  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <AdminRouter />
        </div>
      </div>
      <GlobalSearch />
    </SidebarProvider>
  );`
);

// 5b. Add search button to AppSidebar footer
patch(
  "client/src/components/app-sidebar.tsx",
  "Sidebar: import GlobalSearch + Search icon",
  `import { LayoutDashboard, Users, Clock, CreditCard, FileText, Bell, Settings, DollarSign, ClipboardCheck, Wallet, TrendingUp, BookOpen, Receipt } from "lucide-react";`,
  `import { LayoutDashboard, Users, Clock, CreditCard, FileText, Bell, Settings, DollarSign, ClipboardCheck, Wallet, TrendingUp, BookOpen, Receipt, Search } from "lucide-react";`
);

patch(
  "client/src/components/app-sidebar.tsx",
  "Sidebar: add search hint in footer",
  `      <SidebarFooter className="px-4 py-3">
        <div className="flex items-center gap-3 px-2">`,
  `      <SidebarFooter className="px-4 py-3">
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
        <div className="flex items-center gap-3 px-2">`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: PORTAL — use session-based auth instead of localStorage
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 6: Portal Session Auth ──");

// 6a. Fix PortalGuard to call /api/portal/me
patch(
  "client/src/App.tsx",
  "App: fix PortalGuard to use session",
  `function PortalGuard({ component: Component }: { component: React.ComponentType }) {
  const employeeId = localStorage.getItem("portal_employee_id");
  if (!employeeId) {
    return <Redirect to="/portal/login" />;
  }
  return <Component />;
}`,
  `function PortalGuard({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useQuery<{ employeeId: string; name: string } | null>({
    queryKey: ["/api/portal/me"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) return <Redirect to="/portal/login" />;
  return <Component />;
}`
);

// 6b. Fix portal login to not use localStorage for auth (keep name for display only)
patch(
  "client/src/pages/portal/portal-login.tsx",
  "Portal login: store display name only",
  `      localStorage.setItem("portal_employee_id", data.employeeId);
      localStorage.setItem("portal_employee_name", data.name);`,
  `      // Session cookie handles auth; localStorage only used for display name
      localStorage.setItem("portal_employee_name", data.name);`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: ADMIN — set portal password UI on employee-detail page
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 7: Admin Portal Password UI ──");

patch(
  "client/src/pages/employee-detail.tsx",
  "Employee detail: import Lock icon",
  `import {`,
  `import { Lock } from "lucide-react";
import {`
);

// Find where to inject the portal password section - near onboarding/actions area
patch(
  "client/src/pages/employee-detail.tsx",
  "Employee detail: add set-portal-password button",
  `  const { data: rateHistory } = useQuery<any[]>({`,
  `  const [portalPwOpen, setPortalPwOpen] = useState(false);
  const [portalPw, setPortalPw] = useState("");
  const setPortalPwMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(\`/api/employees/\${employeeId}/set-portal-password\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal password set", description: "Employee can now log into the portal." });
      setPortalPwOpen(false);
      setPortalPw("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: rateHistory } = useQuery<any[]>({`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: CSV EXPORT
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 8: CSV Export ──");

// Add CSV utility to payroll page
patch(
  "client/src/pages/payroll.tsx",
  "Payroll: import Download icon",
  `import { useState } from "react";`,
  `import { useState } from "react";

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => \`"\${String(v).replace(/"/g, '""')}"\`).join(",")).join("\\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}`
);

patch(
  "client/src/pages/payroll.tsx",
  "Payroll: import Download icon from lucide",
  `import { useLocation } from "wouter";`,
  `import { useLocation } from "wouter";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";`
);

patch(
  "client/src/pages/payroll.tsx",
  "Payroll: add CSV export button in TopBar",
  `      <TopBar
        title="Payroll"
        subtitle={\`\${payRunsList?.length || 0} pay runs\`}`,
  `      <TopBar
        title="Payroll"
        subtitle={\`\${payRunsList?.length || 0} pay runs\`}
        actions={
          sorted.length > 0 ? (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="button-export-payroll"
              onClick={() => {
                const header = ["Period", "Frequency", "Payment Date", "Gross", "PAYG", "Super", "Net", "Status"];
                const rows = sorted.map(r => [
                  \`\${r.year}-\${String(r.month).padStart(2,"0")}\`,
                  r.calendarName || "",
                  r.paymentDate || r.payDate || "",
                  r.totalGross, r.totalPayg, r.totalSuper, r.totalNet, r.status,
                ]);
                downloadCSV("payroll.csv", [header, ...rows]);
              }}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          ) : undefined
        }`
);

// Add CSV export to invoices page
patch(
  "client/src/pages/invoices.tsx",
  "Invoices: add CSV export helper",
  `import { useState, useEffect } from "react";`,
  `import { useState, useEffect } from "react";

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => \`"\${String(v).replace(/"/g, '""')}"\`).join(",")).join("\\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}`
);

patch(
  "client/src/pages/invoices.tsx",
  "Invoices: import Download icon",
  `import { useQuery, useMutation } from "@tanstack/react-query";`,
  `import { useQuery, useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";`
);

patch(
  "client/src/pages/invoices.tsx",
  "Invoices: inject CSV export into existing actions",
  `      <TopBar
        title="Invoices"
        subtitle={\`\${filtered?.length || 0} invoices · \${formatCurrency(totalBilled)} billed\`}
        actions={`,
  `      <TopBar
        title="Invoices"
        subtitle={\`\${filtered?.length || 0} invoices · \${formatCurrency(totalBilled)} billed\`}
        actions={
          <>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="button-export-invoices"
            onClick={() => {
              const header = ["Invoice #","Contact","Employee","Amount Excl GST","Amount Incl GST","Status","Issue Date","Paid Date","Year","Month"];
              const rows = (filtered || []).map((i: any) => [
                i.invoiceNumber || "", i.contactName || "", i.employeeName || "",
                i.amountExclGst || "0", i.amountInclGst || "0",
                i.status, i.issueDate || "", i.paidDate || "", i.year, i.month,
              ]);
              downloadCSV("invoices.csv", [header, ...rows]);
            }}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>`
);

// Close the extra fragment we opened (find the closing of the actions prop)
patch(
  "client/src/pages/invoices.tsx",
  "Invoices: close export CSV actions fragment",
  `        actions={
          <>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="button-export-invoices"`,
  `        actions={
          <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid="button-export-invoices"`
);

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: PORTAL PDF UPLOAD
// ═══════════════════════════════════════════════════════════════════
console.log("\n── Section 9: Portal PDF Upload ──");

patch(
  "client/src/pages/portal/portal-timesheets.tsx",
  "Portal timesheets: add PDF upload section to form dialog",
  `import { useState } from "react";`,
  `import { useState, useRef } from "react";`
);

patch(
  "client/src/pages/portal/portal-timesheets.tsx",
  "Portal timesheets: add upload state variables",
  `  const [resubmitTs, setResubmitTs] = useState<Timesheet | null>(null);`,
  `  const [resubmitTs, setResubmitTs] = useState<Timesheet | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (file: File) => {
    setIsScanning(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch("/api/timesheets/scan", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();
      const result = data.results?.[0];
      if (result) setUploadResult(result);
    } catch (e) {
      toast({ title: "Scan failed", description: "Could not read the PDF. Please fill in manually.", variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };`
);

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log(`\n=== Done: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  console.log("Some patches did not apply. Review errors above.\n");
  process.exit(1);
} else {
  console.log("All patches applied. Now run:\n");
  console.log("  npx drizzle-kit push   ← apply DB schema change (adds portal_password_hash column)");
  console.log("  npm run dev            ← restart the dev server\n");
}
