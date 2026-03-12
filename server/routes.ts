import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { insertEmployeeSchema, insertTimesheetSchema, insertInvoiceSchema, insertPayRunSchema, insertNotificationSchema, insertMessageSchema, insertLeaveRequestSchema, insertPayItemSchema, insertTaxDeclarationSchema, insertBankAccountSchema, insertSuperMembershipSchema, insertPayRunLineSchema, insertDocumentSchema, insertPlacementSchema, insertRctiSchema, insertMonthlyExpectedHoursSchema, insertPayrollTaxRateSchema, employees, timesheets, invoices, invoiceEmployees, payRunLines, documents, notifications, messages, leaveRequests, taxDeclarations, bankAccounts, superMemberships, placements, rateHistory, timesheetAuditLog, monthlyExpectedHours, rctis, type RateHistory } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { generatePayslipHTML, generatePayslipPDF, buildPayslipData } from "./payslip";
import { buildABAFromPayRun, type ABAHeader } from "./aba";
import { getConsentUrl, handleCallback, isConnected, disconnect, syncEmployees, getCallbackUri, getTenants, selectTenant, syncPayRuns, syncTimesheets, syncPayrollSettings, syncInvoices, syncContacts, syncBankTransactions, syncBankTransactionsAllTenants, syncBankTransactionsForTenant, pushInvoiceToXero } from "./xero";
import { requireAuth, hashPassword, comparePasswords } from "./auth";
import { scanTimesheetPdf, scanRctiPdf } from "./ocr";
import { getSuperRate, calculateChargeOutFromPayRate, calculatePayRate } from "./rates";
import { getACTWorkingDays, getACTExpectedHours } from "./act-working-days";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(pty\.?\s*ltd\.?|limited|ltd\.?|inc\.?|incorporated)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeExGstFromSpend(
  inclGstAmount: number,
  contractorInvoices: { amountExclGst: string | null; amountInclGst: string | null; gstAmount: string | null }[]
): number {
  if (contractorInvoices.length > 0) {
    const totalInclGst = contractorInvoices.reduce((s, inv) => s + parseFloat(inv.amountInclGst || "0"), 0);
    const totalExclGst = contractorInvoices.reduce((s, inv) => s + parseFloat(inv.amountExclGst || "0"), 0);
    if (totalInclGst > 0 && totalExclGst > 0) {
      return inclGstAmount * (totalExclGst / totalInclGst);
    }
  }
  return inclGstAmount / 1.1;
}

function getContractorAccpayInvoices(
  allInvoices: { invoiceType: string | null; xeroContactId: string | null; contactName: string | null; status: string; amountExclGst: string; amountInclGst: string; gstAmount: string; year: number; month: number }[],
  employee: { supplierContactId: string | null; companyName: string | null },
  month: number,
  year: number
) {
  return allInvoices.filter(inv => {
    if (inv.invoiceType !== "ACCPAY") return false;
    if (inv.status === "VOIDED" || inv.status === "DELETED") return false;
    if (inv.year !== year || inv.month !== month) return false;
    if (employee.supplierContactId && inv.xeroContactId === employee.supplierContactId) return true;
    if (employee.companyName && inv.contactName && normalizeCompanyName(inv.contactName) === normalizeCompanyName(employee.companyName)) return true;
    return false;
  });
}

type RateHistoryIndex = Record<string, RateHistory[]>;

function buildRateHistoryIndex(allRates: RateHistory[]): RateHistoryIndex {
  const idx: RateHistoryIndex = {};
  for (const r of allRates) {
    if (!idx[r.employeeId]) idx[r.employeeId] = [];
    idx[r.employeeId].push(r);
  }
  return idx;
}

function getEffectiveRate(
  rateIndex: RateHistoryIndex,
  employeeId: string,
  month: number,
  year: number,
  fallbackPayRate: string | null,
  fallbackChargeOutRate: string | null,
): { payRate: number; chargeOutRate: number } {
  const periodEnd = new Date(year, month, 0);
  const rates = rateIndex[employeeId];
  if (rates && rates.length > 0) {
    for (const r of rates) {
      const effDate = new Date(r.effectiveDate);
      if (effDate <= periodEnd) {
        return {
          payRate: parseFloat(r.payRate || "0"),
          chargeOutRate: r.chargeOutRate ? parseFloat(r.chargeOutRate) : (fallbackChargeOutRate ? parseFloat(fallbackChargeOutRate) : 0),
        };
      }
    }
  }
  return {
    payRate: fallbackPayRate ? parseFloat(fallbackPayRate) : 0,
    chargeOutRate: fallbackChargeOutRate ? parseFloat(fallbackChargeOutRate) : 0,
  };
}

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    if (req.path.startsWith("/portal/")) return next();
    if (req.path === "/xero/callback") return next();
    requireAuth(req, res, next);
  });

  app.get("/api/search", requireAuth, async (req, res) => {
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
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

      const employees = allEmployees.filter(e =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        (e.email && e.email.toLowerCase().includes(q)) ||
        (e.clientName && e.clientName.toLowerCase().includes(q)) ||
        (e.jobTitle && e.jobTitle.toLowerCase().includes(q)) ||
        (e.contractCode && e.contractCode.toLowerCase().includes(q))
      ).slice(0, 6).map(e => ({
        id: e.id, name: `${e.firstName} ${e.lastName}`,
        jobTitle: e.jobTitle || null, clientName: e.clientName || null, status: e.status,
      }));

      const invoices = allInvoices.filter(i =>
        (i.invoiceNumber && i.invoiceNumber.toLowerCase().includes(q)) ||
        (i.contactName && i.contactName.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q))
      ).slice(0, 5).map(i => ({
        id: i.id, invoiceNumber: i.invoiceNumber || null, contactName: i.contactName || null,
        amountExclGst: i.amountExclGst, status: i.status, year: i.year, month: i.month,
      }));

      const payRuns = allPayRuns.filter(p => {
        const period = `${monthNames[(p.month||1)-1]} ${p.year}`.toLowerCase();
        return period.includes(q) || p.status.toLowerCase().includes(q) || String(p.year).includes(q);
      }).slice(0, 4).map(p => ({
        id: p.id, year: p.year, month: p.month, status: p.status, totalGross: p.totalGross,
      }));

      const timesheets = allTimesheets.filter(t => {
        const emp = empMap.get(t.employeeId);
        if (!emp) return false;
        const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        const period = `${monthNames[(t.month||1)-1]} ${t.year}`.toLowerCase();
        return name.includes(q) || period.includes(q) || t.status.toLowerCase().includes(q);
      }).slice(0, 5).map(t => {
        const emp = empMap.get(t.employeeId);
        return {
          id: t.id, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          year: t.year, month: t.month, totalHours: t.totalHours, status: t.status,
        };
      });

      res.json({ employees, invoices, payRuns, timesheets });
    } catch (err: any) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/users", async (_req, res) => {
    try {
      const allUsers = await storage.getUsers();
      const sanitized = allUsers.map(({ password, ...rest }) => rest);
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { username, password, displayName, email } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username already exists" });
      }
      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashed,
        displayName: displayName || null,
        email: email || null,
      });
      const { password: _, ...sanitized } = user;
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const existing = await storage.getUser(req.params.id);
      if (!existing) return res.status(404).json({ message: "User not found" });

      const updates: Record<string, any> = {};
      if (req.body.displayName !== undefined) updates.displayName = req.body.displayName;
      if (req.body.email !== undefined) updates.email = req.body.email;
      if (req.body.username) {
        const dup = await storage.getUserByUsername(req.body.username);
        if (dup && dup.id !== req.params.id) {
          return res.status(409).json({ message: "Username already taken" });
        }
        updates.username = req.body.username;
      }
      if (req.body.password) {
        updates.password = await hashPassword(req.body.password);
      }

      const updated = await storage.updateUser(req.params.id, updates);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, ...sanitized } = updated;
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const currentUser = (req as any).user;
      if (currentUser && currentUser.id === req.params.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      const existing = await storage.getUser(req.params.id);
      if (!existing) return res.status(404).json({ message: "User not found" });
      await storage.deleteUser(req.params.id);
      res.json({ message: "User deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete user" });
    }
  });

  app.get("/api/employees", async (_req, res) => {
    try {
      const data = await storage.getEmployees();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.post("/api/employees/:id/set-portal-password", requireAuth, async (req, res) => {
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

  app.get("/api/employees/stats", async (_req, res) => {
    try {
      const allEmployees = await storage.getEmployees();
      const allTimesheets = await storage.getTimesheets();
      const currentYear = new Date().getFullYear();
      const approvedTs = allTimesheets.filter(t => t.status === "APPROVED" && t.year === currentYear);
      const ytdByEmployee: Record<string, number> = {};
      for (const t of approvedTs) {
        ytdByEmployee[t.employeeId] = (ytdByEmployee[t.employeeId] || 0) + parseFloat(t.totalHours);
      }
      const stats = allEmployees.map(c => ({
        ...c,
        ytdHours: ytdByEmployee[c.id] || 0,
        ytdBillings: (ytdByEmployee[c.id] || 0) * (c.chargeOutRate ? parseFloat(c.chargeOutRate) : c.hourlyRate ? parseFloat(c.hourlyRate) : 0),
      }));
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch employee stats" });
    }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      res.json(employee);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      const parsed = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(parsed);
      res.status(201).json(employee);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid employee data" });
    }
  });

  app.patch("/api/employees/:id", async (req, res) => {
    try {
      const existing = await storage.getEmployee(req.params.id);
      if (!existing) return res.status(404).json({ message: "Employee not found" });

      let body = { ...req.body };
      if (existing.xeroEmployeeId) {
        const xeroLockedFields = ["firstName", "lastName", "email", "phone", "jobTitle", "startDate", "endDate", "dateOfBirth", "gender", "addressLine1", "suburb", "state", "postcode", "payFrequency"];
        for (const field of xeroLockedFields) {
          delete body[field];
        }
      }

      const newChargeOut = body.chargeOutRate !== undefined ? body.chargeOutRate : existing.chargeOutRate;
      const newPayRate = body.hourlyRate !== undefined ? body.hourlyRate : existing.hourlyRate;
      const rateChanged = (body.chargeOutRate !== undefined && body.chargeOutRate !== existing.chargeOutRate) ||
                           (body.hourlyRate !== undefined && body.hourlyRate !== existing.hourlyRate);
      if (rateChanged) {
        await storage.createRateHistory({
          employeeId: req.params.id,
          effectiveDate: new Date().toISOString().split("T")[0],
          chargeOutRate: newChargeOut || "0",
          payRate: newPayRate || "0",
          source: "MANUAL",
          notes: `Employee rate updated: charge-out $${newChargeOut || "0"}, pay $${newPayRate || "0"}`,
        });
      }

      const employee = await storage.updateEmployee(req.params.id, body);
      res.json(employee!);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update employee" });
    }
  });

  app.get("/api/timesheets", async (_req, res) => {
    try {
      const data = await storage.getTimesheets();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch timesheets" });
    }
  });

  app.get("/api/timesheets/employee/:employeeId", async (req, res) => {
    try {
      const data = await storage.getTimesheetsByEmployee(req.params.employeeId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch timesheets" });
    }
  });

  app.get("/api/timesheets/:id", async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });
      res.json(timesheet);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch timesheet" });
    }
  });

  app.get("/api/timesheets/:id/documents", async (req, res) => {
    try {
      const docs = await storage.getDocumentsByTimesheetId(req.params.id);
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch timesheet documents" });
    }
  });

  const coerceDates = (data: Record<string, any>) => {
    const copy = { ...data };
    for (const key of ["submittedAt", "reviewedAt", "createdAt", "updatedAt"]) {
      if (typeof copy[key] === "string") copy[key] = new Date(copy[key]);
    }
    return copy;
  };

  app.post("/api/timesheets", async (req, res) => {
    try {
      const { fileData, fileType: uploadedFileType, files: filesList, changeSource: reqSource, ...timesheetData } = req.body;
      const parsed = insertTimesheetSchema.parse(coerceDates(timesheetData));
      let notesJson: any = {};
      try { notesJson = parsed.notes ? JSON.parse(parsed.notes) : {}; } catch {}
      const source = reqSource || notesJson.intakeSource || "MANUAL_EDIT";
      const tsSource = parsed.fileName ? "PDF_UPLOAD" : (source === "ADMIN_ENTRY" ? "ADMIN_ENTRY" : "MANUAL_ENTRY");
      const timesheet = await storage.createTimesheet({ ...parsed, source: tsSource });

      await storage.createTimesheetAuditLogs([{
        timesheetId: timesheet.id,
        employeeId: parsed.employeeId,
        field: "created",
        oldValue: null,
        newValue: `${parsed.totalHours || 0}h (regular: ${parsed.regularHours || 0}, OT: ${parsed.overtimeHours || 0})`,
        changeSource: source,
        changedBy: (req as any).user?.username || "admin",
        notes: parsed.fileName || null,
      }]);

      if (filesList && Array.isArray(filesList) && parsed.employeeId) {
        for (const f of filesList) {
          if (f.data && f.name) {
            await storage.createDocument({
              employeeId: parsed.employeeId,
              timesheetId: timesheet.id,
              type: "TIMESHEET",
              name: f.name,
              fileUrl: f.data,
              fileType: f.type || "application/pdf",
              fileSize: f.size || null,
            });
          }
        }
      } else if (fileData && parsed.fileName && parsed.employeeId) {
        await storage.createDocument({
          employeeId: parsed.employeeId,
          timesheetId: timesheet.id,
          type: "TIMESHEET",
          name: parsed.fileName,
          fileUrl: fileData,
          fileType: uploadedFileType || "application/pdf",
        });
      }

      res.status(201).json(timesheet);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid timesheet data" });
    }
  });

  app.post("/api/timesheets/batch", async (req, res) => {
    try {
      const { items, forceOverwrite } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No timesheet items provided" });
      }

      const allTimesheets = await storage.getTimesheets();
      const warnings: { index: number; employeeName: string; month: number; year: number; existingStatus: string }[] = [];
      const parsedItems: { index: number; parsed: any; filesList: any; existing: any[] }[] = [];

      for (let i = 0; i < items.length; i++) {
        const { files: filesList, ...timesheetData } = items[i];
        const parsed = insertTimesheetSchema.parse(coerceDates(timesheetData));
        const existing = allTimesheets.filter(
          (ts) => ts.employeeId === parsed.employeeId && ts.month === parsed.month && ts.year === parsed.year
        );
        const approvedTs = existing.find((ts) => ts.status === "APPROVED");
        if (approvedTs && !forceOverwrite) {
          warnings.push({
            index: i,
            employeeName: timesheetData.employeeName || `Employee ${parsed.employeeId}`,
            month: parsed.month!,
            year: parsed.year!,
            existingStatus: "APPROVED",
          });
        }
        parsedItems.push({ index: i, parsed, filesList, existing });
      }

      if (warnings.length > 0 && !forceOverwrite) {
        return res.status(409).json({ message: "Some timesheets would overwrite approved records", warnings });
      }

      const results: { index: number; success: boolean; timesheet?: any; error?: string }[] = [];
      for (const { index: i, parsed, filesList, existing } of parsedItems) {
        try {
          const existingRecord = existing.find((ts) => ts.status === "APPROVED") || existing.find((ts) => ts.status !== "APPROVED");
          let timesheet;

          if (existingRecord) {
            const auditEntries: any[] = [];
            const trackedFields = ["totalHours", "regularHours", "overtimeHours", "grossValue"] as const;
            for (const field of trackedFields) {
              const oldVal = existingRecord[field];
              const newVal = parsed[field];
              if (oldVal !== undefined && newVal !== undefined && String(oldVal) !== String(newVal)) {
                auditEntries.push({
                  timesheetId: existingRecord.id,
                  employeeId: parsed.employeeId,
                  field,
                  oldValue: String(oldVal),
                  newValue: String(newVal),
                  changeSource: "PDF_UPLOAD",
                  changedBy: (req as any).user?.username || "admin",
                  notes: parsed.fileName || "Batch upload overwrite",
                });
              }
            }
            if (auditEntries.length > 0) {
              await storage.createTimesheetAuditLogs(auditEntries);
            }

            const updateFields: any = {};
            for (const field of trackedFields) {
              if (parsed[field] !== undefined) updateFields[field] = parsed[field];
            }
            if (parsed.fileName) updateFields.fileName = parsed.fileName;
            if (parsed.fileHash) updateFields.fileHash = parsed.fileHash;
            if (parsed.fileSizeBytes) updateFields.fileSizeBytes = parsed.fileSizeBytes;
            if (parsed.status) updateFields.status = parsed.status;
            timesheet = await storage.updateTimesheet(existingRecord.id, updateFields);
          } else {
            timesheet = await storage.createTimesheet({ ...parsed, source: "PDF_UPLOAD" });
            await storage.createTimesheetAuditLogs([{
              timesheetId: timesheet.id,
              employeeId: parsed.employeeId,
              field: "created",
              oldValue: null,
              newValue: `${parsed.totalHours || 0}h (regular: ${parsed.regularHours || 0}, OT: ${parsed.overtimeHours || 0})`,
              changeSource: "PDF_UPLOAD",
              changedBy: (req as any).user?.username || "admin",
              notes: parsed.fileName || null,
            }]);
          }

          if (filesList && Array.isArray(filesList) && parsed.employeeId) {
            for (const f of filesList) {
              if (f.data && f.name) {
                await storage.createDocument({
                  employeeId: parsed.employeeId,
                  timesheetId: timesheet.id,
                  type: "TIMESHEET",
                  name: f.name,
                  fileUrl: f.data,
                  fileType: f.type || "application/pdf",
                  fileSize: f.size || null,
                });
              }
            }
          }

          results.push({ index: i, success: true, timesheet });
        } catch (itemErr: any) {
          results.push({ index: i, success: false, error: itemErr.message || "Validation failed" });
        }
      }

      const created = results.filter((r) => r.success).map((r) => r.timesheet);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0 && created.length === 0) {
        return res.status(400).json({ message: failed.map((f) => f.error).join("; "), results });
      }

      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid batch data" });
    }
  });

  app.post("/api/timesheets/scan", upload.array("files", 20), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No PDF files uploaded" });
      }
      const month = parseInt(req.body.month) || (new Date().getMonth() + 1);
      const year = parseInt(req.body.year) || new Date().getFullYear();

      const results = await Promise.all(
        files.map((file) => scanTimesheetPdf(file.buffer, file.originalname, month, year))
      );

      res.json({ results });
    } catch (err: any) {
      console.error("Timesheet scan error:", err);
      res.status(500).json({ message: err.message || "Failed to scan timesheets" });
    }
  });

  app.patch("/api/timesheets/:id", async (req, res) => {
    try {
      const existing = await storage.getTimesheet(req.params.id);
      if (!existing) return res.status(404).json({ message: "Timesheet not found" });

      const { changeSource: reqSource, ...updateData } = req.body;
      const source = reqSource || "MANUAL_EDIT";

      const trackedFields = ["totalHours", "regularHours", "overtimeHours", "grossValue", "status"] as const;
      const auditEntries: any[] = [];
      for (const field of trackedFields) {
        if (updateData[field] !== undefined && String(existing[field]) !== String(updateData[field])) {
          auditEntries.push({
            timesheetId: existing.id,
            employeeId: existing.employeeId,
            field,
            oldValue: String(existing[field]),
            newValue: String(updateData[field]),
            changeSource: source,
            changedBy: (req as any).user?.username || "admin",
          });
        }
      }

      const timesheet = await storage.updateTimesheet(req.params.id, coerceDates(updateData));
      if (auditEntries.length > 0) {
        await storage.createTimesheetAuditLogs(auditEntries);
      }

      const newStatus = updateData.status;
      if (newStatus && (newStatus === "APPROVED" || newStatus === "REJECTED") && newStatus !== existing.status) {
        const employee = await storage.getEmployee(existing.employeeId);
        const empName = employee ? `${employee.firstName} ${employee.lastName}` : existing.employeeId;
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const periodLabel = `${monthNames[(existing.month || 1) - 1]} ${existing.year || ""}`.trim();
        await storage.createNotification({
          type: "TIMESHEET",
          priority: newStatus === "REJECTED" ? "HIGH" : "MEDIUM",
          title: `Timesheet ${newStatus.toLowerCase()}`,
          body: `${empName}'s timesheet for ${periodLabel} has been ${newStatus.toLowerCase()}.`,
          actionLabel: "View Timesheet",
          actionRoute: `/timesheets`,
          employeeId: existing.employeeId,
        });
      }

      res.json(timesheet);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update timesheet" });
    }
  });

  app.delete("/api/timesheets/:id", async (req, res) => {
    try {
      const existing = await storage.getTimesheet(req.params.id);
      if (!existing) return res.status(404).json({ message: "Timesheet not found" });
      
      await storage.deleteTimesheet(req.params.id);
      res.json({ message: "Timesheet deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete timesheet" });
    }
  });

  app.get("/api/timesheets/:id/history", async (req, res) => {
    try {
      const logs = await storage.getTimesheetAuditLogs(req.params.id);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get audit logs" });
    }
  });

  app.get("/api/invoices", async (_req, res) => {
    try {
      const data = await storage.getInvoices();
      const allLinks = await storage.getInvoiceEmployeesByInvoice(data.map(i => i.id));
      const linkMap: Record<string, string[]> = {};
      for (const link of allLinks) {
        if (!linkMap[link.invoiceId]) linkMap[link.invoiceId] = [];
        linkMap[link.invoiceId].push(link.employeeId);
      }
      const enriched = data.map(inv => ({
        ...inv,
        linkedEmployeeIds: linkMap[inv.id] || (inv.employeeId ? [inv.employeeId] : []),
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const { linkedEmployeeIds, lineItems, ...invoiceData } = req.body;
      const parsed = insertInvoiceSchema.parse(invoiceData);
      const invoice = await storage.createInvoice(parsed);
      if (Array.isArray(linkedEmployeeIds) && linkedEmployeeIds.length > 0) {
        await storage.setInvoiceEmployees(invoice.id, linkedEmployeeIds);
      }
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        const liData = lineItems.map((li: any) => ({
          invoiceId: invoice.id,
          description: li.description || null,
          quantity: li.hours ? String(li.hours) : (li.quantity ? String(li.quantity) : null),
          unitAmount: li.rate ? String(li.rate) : (li.unitAmount ? String(li.unitAmount) : null),
          lineAmount: li.amount ? String(li.amount) : (li.lineAmount ? String(li.lineAmount) : null),
          accountCode: li.accountCode || "200",
          taxType: li.taxType || "OUTPUT",
        }));
        await storage.setInvoiceLineItems(invoice.id, liData);
      }
      res.status(201).json({ ...invoice, linkedEmployeeIds: linkedEmployeeIds || [] });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid invoice data" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const { linkedEmployeeIds, ...updateData } = req.body;
      const invoice = await storage.updateInvoice(req.params.id, updateData);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (Array.isArray(linkedEmployeeIds)) {
        await storage.setInvoiceEmployees(invoice.id, linkedEmployeeIds);
      }
      const links = await storage.getInvoiceEmployees(invoice.id);
      res.json({ ...invoice, linkedEmployeeIds: links.map(l => l.employeeId) });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update invoice" });
    }
  });

  app.post("/api/invoices/:id/push-to-xero", async (req, res) => {
    try {
      const result = await pushInvoiceToXero(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to push invoice to Xero" });
    }
  });

  app.get("/api/invoices/:id/line-items", async (req, res) => {
    try {
      const items = await storage.getInvoiceLineItems(req.params.id);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch line items" });
    }
  });

  app.get("/api/invoices/:id/payments", async (req, res) => {
    try {
      const payments = await storage.getInvoicePayments(req.params.id);
      res.json(payments);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch payments" });
    }
  });

  app.get("/api/pay-runs", async (_req, res) => {
    try {
      const data = await storage.getPayRuns();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pay runs" });
    }
  });

  app.post("/api/pay-runs", async (req, res) => {
    try {
      const parsed = insertPayRunSchema.parse(req.body);
      const payRun = await storage.createPayRun(parsed);
      res.status(201).json(payRun);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid pay run data" });
    }
  });

  app.get("/api/notifications", async (_req, res) => {
    try {
      const data = await storage.getNotifications();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", async (_req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount();
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await storage.markNotificationRead(req.params.id);
      if (!notification) return res.status(404).json({ message: "Notification not found" });
      res.json(notification);
    } catch (err) {
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/mark-all-read", async (_req, res) => {
    try {
      await storage.markAllNotificationsRead();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const parsed = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(parsed);
      res.status(201).json(notification);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid notification data" });
    }
  });

  app.get("/api/messages", async (_req, res) => {
    try {
      const data = await storage.getMessages();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/messages/employee/:employeeId", async (req, res) => {
    try {
      const data = await storage.getMessagesByEmployee(req.params.employeeId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const parsed = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(parsed);
      res.status(201).json(message);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid message data" });
    }
  });

  app.patch("/api/messages/:id/read", async (req, res) => {
    try {
      const message = await storage.markMessageRead(req.params.id);
      if (!message) return res.status(404).json({ message: "Message not found" });
      res.json(message);
    } catch (err) {
      res.status(500).json({ message: "Failed to mark message read" });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    try {
      const data = await storage.getSettings();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) return res.status(404).json({ message: "Setting not found" });
      res.json(setting);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  app.put("/api/settings/:key", async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string") return res.status(400).json({ message: "Value must be a string" });
      const setting = await storage.upsertSetting(req.params.key, value);
      res.json(setting);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update setting" });
    }
  });

  app.get("/api/payroll-tax-rates", async (_req, res) => {
    try {
      const rates = await storage.getPayrollTaxRates();
      res.json(rates);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch payroll tax rates" });
    }
  });

  app.post("/api/payroll-tax-rates", async (req, res) => {
    try {
      const parsed = insertPayrollTaxRateSchema.parse(req.body);
      const rate = await storage.createPayrollTaxRate(parsed);
      res.status(201).json(rate);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid payroll tax rate data" });
    }
  });

  app.put("/api/payroll-tax-rates/:id", async (req, res) => {
    try {
      const existing = await storage.getPayrollTaxRate(req.params.id);
      if (!existing) return res.status(404).json({ message: "Payroll tax rate not found" });
      const rate = await storage.updatePayrollTaxRate(req.params.id, req.body);
      res.json(rate);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update payroll tax rate" });
    }
  });

  app.delete("/api/payroll-tax-rates/:id", async (req, res) => {
    try {
      const existing = await storage.getPayrollTaxRate(req.params.id);
      if (!existing) return res.status(404).json({ message: "Payroll tax rate not found" });
      await storage.deletePayrollTaxRate(req.params.id);
      res.json({ message: "Payroll tax rate deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete payroll tax rate" });
    }
  });

  app.get("/api/invoices/employee/:employeeId", async (req, res) => {
    try {
      const employeeId = req.params.employeeId;
      const [directInvoices, junctionInvoiceIds] = await Promise.all([
        storage.getInvoicesByEmployee(employeeId),
        storage.getInvoiceIdsByEmployee(employeeId),
      ]);
      const directIds = new Set(directInvoices.map(i => i.id));
      const extraIds = junctionInvoiceIds.filter(id => !directIds.has(id));
      let allInvoices = [...directInvoices];
      if (extraIds.length > 0) {
        const allStoredInvoices = await storage.getInvoices();
        const extraInvoices = allStoredInvoices.filter(i => extraIds.includes(i.id));
        allInvoices = [...allInvoices, ...extraInvoices];
      }
      res.json(allInvoices);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/employees/:id/reconciliation", async (req, res) => {
    try {
      const employeeId = req.params.id;
      const [tsList, directInvList, junctionInvIds, rctiList] = await Promise.all([
        storage.getTimesheetsByEmployee(employeeId),
        storage.getInvoicesByEmployee(employeeId),
        storage.getInvoiceIdsByEmployee(employeeId),
        storage.getRctisByEmployee(employeeId),
      ]);
      const directIds = new Set(directInvList.map(i => i.id));
      const extraIds = junctionInvIds.filter(id => !directIds.has(id));
      let invList = directInvList;
      if (extraIds.length > 0) {
        const allInvoices = await storage.getInvoices();
        invList = [...directInvList, ...allInvoices.filter(i => extraIds.includes(i.id))];
      }

      const periodMap: Record<string, {
        month: number;
        year: number;
        timesheetHours: number;
        timesheetStatus: string | null;
        timesheetGross: number;
        invoicedHours: number;
        invoicedAmount: number;
        invoicedAmountExGst: number;
        rctiAmount: number;
        rctiAmountExGst: number;
        paymentStatus: string | null;
        paidAmount: number;
        paidDate: string | null;
        invoiceNumber: string | null;
        invoiceStatus: string | null;
      }> = {};

      for (const ts of tsList) {
        const key = `${ts.year}-${String(ts.month).padStart(2, "0")}`;
        if (!periodMap[key]) {
          periodMap[key] = {
            month: ts.month, year: ts.year,
            timesheetHours: 0, timesheetStatus: null, timesheetGross: 0,
            invoicedHours: 0, invoicedAmount: 0, invoicedAmountExGst: 0,
            rctiAmount: 0, rctiAmountExGst: 0,
            paymentStatus: null, paidAmount: 0, paidDate: null,
            invoiceNumber: null, invoiceStatus: null,
          };
        }
        periodMap[key].timesheetHours += parseFloat(ts.totalHours || "0");
        periodMap[key].timesheetGross += parseFloat(ts.grossValue || "0");
        periodMap[key].timesheetStatus = ts.status;
      }

      for (const inv of invList) {
        const key = `${inv.year}-${String(inv.month).padStart(2, "0")}`;
        if (!periodMap[key]) {
          periodMap[key] = {
            month: inv.month, year: inv.year,
            timesheetHours: 0, timesheetStatus: null, timesheetGross: 0,
            invoicedHours: 0, invoicedAmount: 0, invoicedAmountExGst: 0,
            rctiAmount: 0, rctiAmountExGst: 0,
            paymentStatus: null, paidAmount: 0, paidDate: null,
            invoiceNumber: null, invoiceStatus: null,
          };
        }
        periodMap[key].invoicedHours += parseFloat(inv.hours || "0");
        periodMap[key].invoicedAmount += parseFloat(inv.amountInclGst || "0");
        periodMap[key].invoicedAmountExGst += parseFloat(inv.amountExclGst || "0");
        periodMap[key].invoiceNumber = inv.invoiceNumber;
        periodMap[key].invoiceStatus = inv.status;
        if (inv.status === "PAID") {
          periodMap[key].paymentStatus = "PAID";
          periodMap[key].paidAmount += parseFloat(inv.amountInclGst || "0");
          periodMap[key].paidDate = inv.paidDate ? new Date(inv.paidDate).toISOString() : null;
        } else if (!periodMap[key].paymentStatus) {
          periodMap[key].paymentStatus = inv.status;
        }
      }

      for (const rcti of rctiList) {
        const key = `${rcti.year}-${String(rcti.month).padStart(2, "0")}`;
        if (!periodMap[key]) {
          periodMap[key] = {
            month: rcti.month, year: rcti.year,
            timesheetHours: 0, timesheetStatus: null, timesheetGross: 0,
            invoicedHours: 0, invoicedAmount: 0, invoicedAmountExGst: 0,
            rctiAmount: 0, rctiAmountExGst: 0,
            paymentStatus: null, paidAmount: 0, paidDate: null,
            invoiceNumber: null, invoiceStatus: null,
          };
        }
        periodMap[key].rctiAmount += parseFloat(rcti.amountInclGst || "0");
        periodMap[key].rctiAmountExGst += parseFloat(rcti.amountExclGst || "0");
      }

      const periods = Object.values(periodMap).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });

      res.json(periods);
    } catch (err) {
      res.status(500).json({ message: "Failed to build reconciliation data" });
    }
  });

  app.get("/api/reconciliation", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      if (month < 1 || month > 12 || year < 2000 || year > 2100) {
        return res.status(400).json({ message: "Invalid month or year" });
      }

      const [allEmployees, allTimesheets, allInvoices, allPayRuns, allBankTxns, allInvEmpLinks, allRateHistory] = await Promise.all([
        storage.getEmployees(),
        storage.getTimesheets(),
        storage.getInvoices(),
        storage.getPayRuns(),
        storage.getBankTransactions(),
        storage.getAllInvoiceEmployees(),
        storage.getAllRateHistory(),
      ]);

      const rateIndex = buildRateHistoryIndex(allRateHistory);

      const invEmpMap: Record<string, string[]> = {};
      for (const link of allInvEmpLinks) {
        if (!invEmpMap[link.invoiceId]) invEmpMap[link.invoiceId] = [];
        invEmpMap[link.invoiceId].push(link.employeeId);
      }

      const activeEmployees = allEmployees.filter((e) => e.status === "ACTIVE");

      const periodPayRuns = allPayRuns.filter((pr) => pr.month === month && pr.year === year);

      let allPayRunLines: { line: any; payRun: typeof periodPayRuns[0] }[] = [];
      for (const pr of periodPayRuns) {
        const lines = await storage.getPayRunLines(pr.id);
        for (const line of lines) {
          allPayRunLines.push({ line, payRun: pr });
        }
      }

      const periodBankTxns = allBankTxns.filter(t => t.month === month && t.year === year);
      const cashIn = periodBankTxns.filter(t => t.type === "RECEIVE").reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const cashOut = periodBankTxns.filter(t => t.type === "SPEND").reduce((sum, t) => sum + parseFloat(t.amount), 0);

      const statusPriority: Record<string, number> = { FILED: 3, REVIEW: 2, DRAFT: 1 };
      const tsPriority: Record<string, number> = { APPROVED: 3, SUBMITTED: 2, DRAFT: 1 };
      const spendTxns = periodBankTxns.filter(t => t.type === "SPEND");

      const result = activeEmployees.map((emp) => {
        const empTimesheets = allTimesheets.filter(
          (t) => t.employeeId === emp.id && t.month === month && t.year === year
        );

        const empInvoices = allInvoices.filter((i) => {
          if (i.month !== month || i.year !== year) return false;
          if (i.invoiceType === "ACCPAY") return false;
          if (i.status === "VOIDED" || i.status === "DELETED") return false;
          if (i.employeeId === emp.id) return true;
          const linked = invEmpMap[i.id];
          if (linked && linked.includes(emp.id)) return true;
          return false;
        });

        const empPayLines = allPayRunLines
          .filter((pl) => pl.line.employeeId === emp.id)
          .sort((a, b) => (statusPriority[b.payRun.status] || 0) - (statusPriority[a.payRun.status] || 0));
        const best = empPayLines[0] || null;
        const payLine = best?.line;
        const payRun = best?.payRun;

        let contractorCost: { total: number; transactionCount: number; companyName: string | null } | null = null;
        if (emp.paymentMethod === "INVOICE" && (emp.supplierContactId || emp.companyName)) {
          const matchingSpend = emp.supplierContactId
            ? spendTxns.filter(t => t.xeroContactId && t.xeroContactId === emp.supplierContactId)
            : spendTxns.filter(t => {
                const companyNorm = normalizeCompanyName(emp.companyName!);
                return t.contactName && normalizeCompanyName(t.contactName) === companyNorm;
              });
          contractorCost = {
            total: matchingSpend.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0),
            transactionCount: matchingSpend.length,
            companyName: emp.companyName,
          };
        }

        const totalHours = empTimesheets.reduce((sum, t) => sum + parseFloat(t.totalHours || "0"), 0);
        const bestTsStatus = empTimesheets.length > 0
          ? empTimesheets.reduce((best, t) => (tsPriority[t.status] || 0) > (tsPriority[best] || 0) ? t.status : best, empTimesheets[0].status)
          : null;

        const effRates = getEffectiveRate(rateIndex, emp.id, month, year, emp.hourlyRate, emp.chargeOutRate);
        const chargeOutRate = effRates.chargeOutRate;
        const payRate = effRates.payRate;

        const invoiceTotalExGst = empInvoices.reduce((sum, i) => sum + parseFloat(i.amountExclGst || "0"), 0);
        const invoiceTotalInclGst = empInvoices.reduce((sum, i) => sum + parseFloat(i.amountInclGst || "0"), 0);

        const expectedRevenue = empInvoices.length > 0 ? invoiceTotalExGst : totalHours * chargeOutRate;

        let employeeCost: number;
        if (emp.paymentMethod === "INVOICE" && contractorCost && contractorCost.total > 0) {
          const accpayInvs = getContractorAccpayInvoices(allInvoices as any, emp, month, year);
          employeeCost = computeExGstFromSpend(contractorCost.total, accpayInvs);
        } else if (payLine) {
          const plGross = parseFloat(payLine.grossEarnings || "0");
          const plSuper = parseFloat(payLine.superAmount || "0");
          if (plGross > 0) {
            employeeCost = plGross + plSuper;
          } else {
            const plNet = parseFloat(payLine.netPay || "0");
            const plPayg = parseFloat(payLine.paygWithheld || "0");
            if (plNet > 0 || plPayg > 0) {
              const reconstructedGross = plPayg > 0 ? plNet + plPayg : plNet;
              employeeCost = reconstructedGross + plSuper;
            } else {
              employeeCost = 0;
            }
          }
        } else {
          employeeCost = totalHours * payRate;
        }
        const margin = expectedRevenue - employeeCost;
        const marginPercent = expectedRevenue > 0 ? (margin / expectedRevenue) * 100 : 0;

        const feePercent = parseFloat(emp.payrollFeePercent || "0");
        let grossForFee = payLine ? parseFloat(payLine.grossEarnings || "0") : 0;
        if (payLine && grossForFee === 0) {
          const plNet = parseFloat(payLine.netPay || "0");
          const plPayg = parseFloat(payLine.paygWithheld || "0");
          if (plNet > 0 || plPayg > 0) {
            grossForFee = plPayg > 0 ? plNet + plPayg : plNet;
          }
        }
        const payrollFeeRevenue = grossForFee * (feePercent / 100);

        const ts = empTimesheets[0] || null;
        const inv = empInvoices[0] || null;

        return {
          employee: {
            id: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            clientName: emp.clientName,
            hourlyRate: String(payRate),
            chargeOutRate: String(chargeOutRate),
            paymentMethod: emp.paymentMethod,
            payrollFeePercent: emp.payrollFeePercent,
            companyName: emp.companyName,
          },
          timesheet: ts
            ? {
                id: ts.id,
                hours: parseFloat(ts.totalHours || "0"),
                regularHours: parseFloat(ts.regularHours || "0"),
                overtimeHours: parseFloat(ts.overtimeHours || "0"),
                status: ts.status,
                grossValue: parseFloat(ts.grossValue || "0"),
              }
            : null,
          timesheets: empTimesheets.map(t => ({
            id: t.id,
            hours: parseFloat(t.totalHours || "0"),
            regularHours: parseFloat(t.regularHours || "0"),
            overtimeHours: parseFloat(t.overtimeHours || "0"),
            status: t.status,
            grossValue: parseFloat(t.grossValue || "0"),
            clientId: t.clientId || null,
            placementId: t.placementId || null,
            fileName: t.fileName || null,
            fileHash: t.fileHash || null,
            fileSizeBytes: t.fileSizeBytes || null,
            source: t.source || null,
          })),
          timesheetSummary: {
            totalHours,
            status: bestTsStatus,
            count: empTimesheets.length,
          },
          invoice: inv
            ? {
                id: inv.id,
                amount: parseFloat(inv.amountInclGst || "0"),
                amountExGst: parseFloat(inv.amountExclGst || "0"),
                invoiceNumber: inv.invoiceNumber,
                status: inv.status,
                paidDate: inv.paidDate,
                issueDate: inv.issueDate || null,
                month: inv.month || null,
                year: inv.year || null,
                description: inv.description || null,
              }
            : null,
          invoices: empInvoices.map(i => ({
            id: i.id,
            amount: parseFloat(i.amountInclGst || "0"),
            amountExGst: parseFloat(i.amountExclGst || "0"),
            invoiceNumber: i.invoiceNumber,
            status: i.status,
            paidDate: i.paidDate,
            issueDate: i.issueDate || null,
            month: i.month || null,
            year: i.year || null,
            description: i.description || null,
          })),
          invoiceSummary: {
            totalExGst: invoiceTotalExGst,
            totalInclGst: invoiceTotalInclGst,
            count: empInvoices.length,
            allPaid: empInvoices.length > 0 && empInvoices.every(i => i.status === "PAID"),
          },
          payroll: payLine
            ? {
                payRunId: payRun?.id || null,
                grossEarnings: employeeCost,
                netPay: parseFloat(payLine.netPay || "0"),
                hoursWorked: parseFloat(payLine.hoursWorked || "0"),
                payRunStatus: payRun?.status || null,
                paygWithheld: parseFloat(payLine.paygWithheld || "0"),
                superAmount: parseFloat(payLine.superAmount || "0"),
              }
            : null,
          contractorCost,
          financials: {
            expectedRevenue,
            employeeCost,
            margin,
            marginPercent: Math.round(marginPercent * 10) / 10,
            payrollFeeRevenue: Math.round(payrollFeeRevenue * 100) / 100,
          },
        };
      });

      result.sort((a, b) =>
        `${a.employee.firstName} ${a.employee.lastName}`.localeCompare(
          `${b.employee.firstName} ${b.employee.lastName}`
        )
      );

      const totalPayrollFeeRevenue = result.reduce((s, r) => s + r.financials.payrollFeeRevenue, 0);

      res.json({
        employees: result,
        cashFlow: {
          cashIn,
          cashOut,
          netCashFlow: cashIn - cashOut,
        },
        totals: {
          totalRevenue: result.reduce((s, r) => s + r.financials.expectedRevenue, 0),
          totalCost: result.reduce((s, r) => s + r.financials.employeeCost, 0),
          totalMargin: result.reduce((s, r) => s + r.financials.margin, 0),
          totalPayrollFeeRevenue: Math.round(totalPayrollFeeRevenue * 100) / 100,
        },
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to build reconciliation data" });
    }
  });

  app.get("/api/invoices/gap-analysis", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      const [allEmployees, allInvoices, allPlacements] = await Promise.all([
        storage.getEmployees(),
        storage.getInvoices(),
        storage.getPlacements(),
      ]);

      const activeEmployees = allEmployees.filter(e => e.status === "ACTIVE");
      const activePlacements = allPlacements.filter(p => p.status === "ACTIVE");

      const acrecInvoices = allInvoices.filter(
        i => (i as any).invoiceType === "ACCREC" && i.month === month && i.year === year && i.status !== "VOIDED"
      );

      const missing: { employee: any; placement: any }[] = [];

      const empPlacementMap = new Map<string, typeof activePlacements>();
      for (const p of activePlacements) {
        const existing = empPlacementMap.get(p.employeeId) || [];
        existing.push(p);
        empPlacementMap.set(p.employeeId, existing);
      }

      for (const emp of activeEmployees) {
        const empPlacements = empPlacementMap.get(emp.id);
        if (!empPlacements || empPlacements.length === 0) continue;
        const hasInvoice = acrecInvoices.some(inv => {
          const linkedIds: string[] = (inv as any).linkedEmployeeIds || [];
          return inv.employeeId === emp.id || linkedIds.includes(emp.id);
        });
        if (!hasInvoice) {
          for (const placement of empPlacements) {
            missing.push({
              employee: {
                id: emp.id,
                firstName: emp.firstName,
                lastName: emp.lastName,
                preferredName: emp.preferredName,
                clientName: placement.clientName || emp.clientName,
                chargeOutRate: placement.chargeOutRate || emp.chargeOutRate,
                contractCode: emp.contractCode,
              },
              placement: {
                id: placement.id,
                clientId: placement.clientId,
                clientName: placement.clientName,
                chargeOutRate: placement.chargeOutRate,
                payRate: placement.payRate,
                roleTitle: placement.roleTitle,
              },
            });
          }
        }
      }

      const unlinked = acrecInvoices.filter(inv => {
        const linkedIds: string[] = (inv as any).linkedEmployeeIds || [];
        return !inv.employeeId && linkedIds.length === 0;
      }).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contactName: inv.contactName,
        amountExclGst: inv.amountExclGst,
        amountInclGst: inv.amountInclGst,
        status: inv.status,
        issueDate: inv.issueDate,
        description: inv.description,
      }));

      const unpaid = acrecInvoices.filter(inv => {
        return inv.status !== "PAID" && inv.status !== "VOIDED";
      }).map(inv => {
        const linkedIds: string[] = (inv as any).linkedEmployeeIds || [];
        const empId = inv.employeeId || linkedIds[0];
        const emp = empId ? allEmployees.find(e => e.id === empId) : null;
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          contactName: inv.contactName,
          amountExclGst: inv.amountExclGst,
          amountInclGst: inv.amountInclGst,
          status: inv.status,
          issueDate: inv.issueDate,
          employeeName: emp ? `${emp.preferredName || emp.firstName} ${emp.lastName}` : null,
        };
      });

      res.json({ missing, unlinked, unpaid, month, year });
    } catch (err) {
      res.status(500).json({ message: "Failed to build gap analysis" });
    }
  });

  app.post("/api/portal/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      if (!password) return res.status(400).json({ message: "Password is required" });
      const allEmployees = await storage.getEmployees();
      const employee = allEmployees.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (!employee) return res.status(401).json({ message: "Invalid email or password" });

      if (!(employee as any).portalPasswordHash) {
        return res.status(401).json({ message: "Portal access not yet activated. Contact your administrator." });
      }
      const valid = await comparePasswords(password, (employee as any).portalPasswordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      (req as any).session.portalEmployeeId = employee.id;
      res.json({
        employeeId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
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
      res.json({ employeeId: emp.id, name: `${emp.firstName} ${emp.lastName}` });
    }).catch(() => res.status(500).json({ message: "Error" }));
  });

  app.post("/api/portal/logout", (req: any, res) => {
    delete req.session.portalEmployeeId;
    res.json({ success: true });
  });

  app.get("/api/portal/employee/:employeeId/stats", requirePortalSelf, async (req, res) => {
    try {
      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      const ts = await storage.getTimesheetsByEmployee(req.params.employeeId);
      const msgs = await storage.getMessagesByEmployee(req.params.employeeId);
      const payRunLines = await storage.getPayRunLinesByEmployee(req.params.employeeId);
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const currentTs = ts.find(t => t.year === currentYear && t.month === currentMonth);
      const pendingTs = ts.filter(t => t.status === "DRAFT" || t.status === "SUBMITTED").length;
      const unreadMsgs = msgs.filter(m => !m.read && m.senderRole === "admin").length;
      const approvedTs = ts.filter(t => t.status === "APPROVED" && t.year === currentYear);
      const ytdHours = approvedTs.reduce((s, t) => s + parseFloat(t.totalHours), 0);
      const rate = employee.hourlyRate ? parseFloat(employee.hourlyRate) : 0;
      const ytdGross = ytdHours * rate;
      const contractHoursPA = employee.contractHoursPA ? parseFloat(employee.contractHoursPA as string) : 2000;

      const recentTimesheets = ts
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return b.month - a.month;
        })
        .slice(0, 3)
        .map(t => ({
          id: t.id,
          period: t.year + "-" + t.month,
          hours: parseFloat(t.totalHours),
          status: t.status,
          gross: parseFloat(t.totalHours) * rate,
          year: t.year,
          month: t.month,
        }));

      const payRuns = await storage.getPayRuns();
      const payRunMap = new Map(payRuns.map(pr => [pr.id, pr]));
      const recentPayslips = payRunLines
        .map(pl => {
          const pr = payRunMap.get(pl.payRunId);
          return { ...pl, payRun: pr };
        })
        .filter(pl => pl.payRun)
        .sort((a, b) => {
          if (!a.payRun || !b.payRun) return 0;
          if (b.payRun.year !== a.payRun.year) return b.payRun.year - a.payRun.year;
          return b.payRun.month - a.payRun.month;
        })
        .slice(0, 2)
        .map(pl => ({
          id: pl.id,
          period: pl.payRun!.year + "-" + pl.payRun!.month,
          gross: parseFloat(pl.grossEarnings),
          net: parseFloat(pl.netPay),
          payDate: pl.payRun!.paymentDate || pl.payRun!.payDate,
          year: pl.payRun!.year,
          month: pl.payRun!.month,
        }));

      res.json({
        employee,
        hoursThisMonth: currentTs ? parseFloat(currentTs.totalHours) : 0,
        pendingTimesheets: pendingTs,
        unreadMessages: unreadMsgs,
        totalTimesheets: ts.length,
        ytdHours,
        ytdGross,
        contractHoursPA,
        rate,
        recentTimesheets,
        recentPayslips,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch portal stats" });
    }
  });

  app.get("/api/leave", async (_req, res) => {
    try {
      const data = await storage.getLeaveRequests();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch leave requests" });
    }
  });

  app.get("/api/leave/employee/:employeeId", async (req, res) => {
    try {
      const data = await storage.getLeaveRequestsByEmployee(req.params.employeeId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch leave requests" });
    }
  });

  app.post("/api/leave", async (req, res) => {
    try {
      const parsed = insertLeaveRequestSchema.parse(req.body);
      const leave = await storage.createLeaveRequest(parsed);
      res.status(201).json(leave);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid leave request data" });
    }
  });

  app.patch("/api/leave/:id", async (req, res) => {
    try {
      const [existingLeave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, req.params.id));
      const leave = await storage.updateLeaveRequest(req.params.id, req.body);
      if (!leave) return res.status(404).json({ message: "Leave request not found" });

      const newStatus = req.body.status;
      if (existingLeave && newStatus && (newStatus === "APPROVED" || newStatus === "REJECTED") && newStatus !== existingLeave.status) {
        const employee = await storage.getEmployee(leave.employeeId);
        const empName = employee ? `${employee.firstName} ${employee.lastName}` : leave.employeeId;
        await storage.createNotification({
          type: "SYSTEM",
          priority: newStatus === "REJECTED" ? "HIGH" : "MEDIUM",
          title: `Leave request ${newStatus.toLowerCase()}`,
          body: `${empName}'s ${leave.leaveType || "leave"} request (${leave.startDate} to ${leave.endDate}) has been ${newStatus.toLowerCase()}.`,
          actionLabel: "View Leave",
          actionRoute: `/leave`,
          employeeId: leave.employeeId,
        });
      }

      res.json(leave);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update leave request" });
    }
  });

  app.get("/api/pay-items", async (_req, res) => {
    try {
      const data = await storage.getPayItems();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pay items" });
    }
  });

  app.post("/api/pay-items", async (req, res) => {
    try {
      const parsed = insertPayItemSchema.parse(req.body);
      const item = await storage.createPayItem(parsed);
      res.status(201).json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid pay item data" });
    }
  });

  app.patch("/api/pay-items/:id", async (req, res) => {
    try {
      const item = await storage.updatePayItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ message: "Pay item not found" });
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update pay item" });
    }
  });

  app.get("/api/onboarding/:employeeId", async (req, res) => {
    try {
      const status = await storage.getOnboardingStatus(req.params.employeeId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  app.post("/api/onboarding/personal", async (req, res) => {
    try {
      const { employeeId, ...data } = req.body;
      if (!employeeId) return res.status(400).json({ message: "employeeId is required" });
      const employee = await storage.updateEmployee(employeeId, data);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      res.json(employee);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save personal details" });
    }
  });

  app.post("/api/onboarding/tax", async (req, res) => {
    try {
      const parsed = insertTaxDeclarationSchema.parse(req.body);
      const dec = await storage.upsertTaxDeclaration(parsed);
      res.json(dec);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save tax declaration" });
    }
  });

  app.post("/api/onboarding/bank", async (req, res) => {
    try {
      const parsed = insertBankAccountSchema.parse(req.body);
      const acc = await storage.upsertBankAccount(parsed);
      res.json(acc);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save bank account" });
    }
  });

  app.post("/api/onboarding/super", async (req, res) => {
    try {
      const parsed = insertSuperMembershipSchema.parse(req.body);
      const mem = await storage.upsertSuperMembership(parsed);
      res.json(mem);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to save super membership" });
    }
  });

  app.get("/api/portal/employee/:employeeId/tax", requirePortalSelf, async (req, res) => {
    try {
      const dec = await storage.getTaxDeclaration(req.params.employeeId);
      res.json(dec || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch tax declaration" });
    }
  });

  app.get("/api/portal/employee/:employeeId/bank", requirePortalSelf, async (req, res) => {
    try {
      const acc = await storage.getBankAccount(req.params.employeeId);
      res.json(acc || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bank account" });
    }
  });

  app.get("/api/portal/employee/:employeeId/super", requirePortalSelf, async (req, res) => {
    try {
      const mem = await storage.getSuperMembership(req.params.employeeId);
      res.json(mem || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch super membership" });
    }
  });

  app.get("/api/pay-runs/:id/lines", async (req, res) => {
    try {
      const lines = await storage.getPayRunLines(req.params.id);
      const allEmployees = await storage.getEmployees();
      const employeeMap = new Map(allEmployees.map((c) => [c.id, c]));
      const enriched = lines.map((l) => ({
        ...l,
        employee: employeeMap.get(l.employeeId) || null,
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pay run lines" });
    }
  });

  app.patch("/api/pay-runs/:id", async (req, res) => {
    try {
      const allowedFields = ["status", "payDate", "periodStart", "periodEnd", "paymentDate", "superRate", "totalGross", "totalPayg", "totalSuper", "totalNet", "employeeCount"];
      const updates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }
      if (updates.status && !["DRAFT", "REVIEW", "FILED"].includes(updates.status)) {
        return res.status(400).json({ message: "Invalid status. Must be DRAFT, REVIEW, or FILED." });
      }
      const payRun = await storage.updatePayRun(req.params.id, updates);
      if (!payRun) return res.status(404).json({ message: "Pay run not found" });
      res.json(payRun);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update pay run" });
    }
  });

  app.post("/api/pay-runs/:id/file", async (req, res) => {
    try {
      const payRun = await storage.getPayRun(req.params.id);
      if (!payRun) return res.status(404).json({ message: "Pay run not found" });

      const allTimesheets = await storage.getTimesheets();
      const approved = allTimesheets.filter(
        (t) => t.status === "APPROVED" && t.year === payRun.year && t.month === payRun.month
      );

      const superRate = Number(payRun.superRate || "0.115");

      function estimatePayg(annualGross: number): number {
        let tax = 0;
        if (annualGross <= 18200) tax = 0;
        else if (annualGross <= 45000) tax = (annualGross - 18200) * 0.19;
        else if (annualGross <= 120000) tax = 5092 + (annualGross - 45000) * 0.325;
        else if (annualGross <= 180000) tax = 29467 + (annualGross - 120000) * 0.37;
        else tax = 51667 + (annualGross - 180000) * 0.45;

        let lito = 0;
        if (annualGross <= 37500) lito = 700;
        else if (annualGross <= 45000) lito = 700 - (annualGross - 37500) * 0.05;
        else if (annualGross <= 66667) lito = 325 - (annualGross - 45000) * 0.015;
        tax = Math.max(0, tax - lito);

        if (annualGross > 26000) tax += annualGross * 0.02;

        return tax;
      }

      const lineData = [];
      for (const ts of approved) {
        const employee = await storage.getEmployee(ts.employeeId);
        if (!employee) continue;
        const hours = parseFloat(ts.totalHours);
        const rate = parseFloat(employee.hourlyRate || "0");
        const gross = hours * rate;
        const annualised = gross * 12;
        const paygAnnual = estimatePayg(annualised);
        const payg = Math.round(paygAnnual / 12);
        const superAmt = Math.round(gross * superRate * 100) / 100;
        const net = gross - payg;

        lineData.push({
          payRunId: payRun.id,
          employeeId: ts.employeeId,
          timesheetId: ts.id,
          hoursWorked: String(hours.toFixed(2)),
          ratePerHour: String(rate.toFixed(2)),
          grossEarnings: String(gross.toFixed(2)),
          paygWithheld: String(payg.toFixed(2)),
          superAmount: String(superAmt.toFixed(2)),
          netPay: String(net.toFixed(2)),
          status: "INCLUDED" as const,
        });
      }

      const lines = await storage.createPayRunLines(lineData);

      const totalGross = lineData.reduce((s, l) => s + parseFloat(l.grossEarnings), 0);
      const totalPayg = lineData.reduce((s, l) => s + parseFloat(l.paygWithheld), 0);
      const totalSuper = lineData.reduce((s, l) => s + parseFloat(l.superAmount), 0);
      const totalNet = lineData.reduce((s, l) => s + parseFloat(l.netPay), 0);

      const updated = await storage.updatePayRun(payRun.id, {
        status: "FILED",
        totalGross: String(totalGross.toFixed(2)),
        totalPayg: String(totalPayg.toFixed(2)),
        totalSuper: String(totalSuper.toFixed(2)),
        totalNet: String(totalNet.toFixed(2)),
        employeeCount: lines.length,
      });

      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const periodLabel = `${monthNames[(payRun.month || 1) - 1]} ${payRun.year || ""}`.trim();
      await storage.createNotification({
        type: "PAYRUN",
        priority: "HIGH",
        title: "Pay run filed",
        body: `Pay run for ${periodLabel} has been filed with ${lines.length} employee(s). Total gross: $${totalGross.toFixed(2)}.`,
        actionLabel: "View Pay Run",
        actionRoute: `/payroll/${payRun.id}`,
      });

      res.json({ payRun: updated, lines, linesCreated: lines.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to file pay run" });
    }
  });

  app.get("/api/payslips", async (req, res) => {
    try {
      const employeeId = req.query.employeeId as string | undefined;
      let lines;
      if (employeeId) {
        lines = await storage.getPayRunLinesByEmployee(employeeId);
      } else {
        const allPayRuns = await storage.getPayRuns();
        const filedRuns = allPayRuns.filter((r) => r.status === "FILED");
        const allLines = [];
        for (const run of filedRuns) {
          const runLines = await storage.getPayRunLines(run.id);
          allLines.push(...runLines.map((l) => ({ ...l, payRun: run })));
        }
        lines = allLines;
      }

      if (employeeId) {
        const allPayRuns = await storage.getPayRuns();
        const payRunMap = new Map(allPayRuns.map((r) => [r.id, r]));
        lines = lines
          .filter((l: any) => {
            const run = payRunMap.get(l.payRunId);
            return run && run.status === "FILED";
          })
          .map((l: any) => ({
            ...l,
            payRun: payRunMap.get(l.payRunId),
          }));
      }

      res.json({ payslips: lines });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch payslips" });
    }
  });

  app.get("/api/payslips/:lineId", async (req, res) => {
    try {
      const line = await storage.getPayRunLine(req.params.lineId);
      if (!line) return res.status(404).json({ message: "Payslip not found" });

      const payRun = await storage.getPayRun(line.payRunId);
      if (!payRun) return res.status(404).json({ message: "Pay run not found" });

      const employee = await storage.getEmployee(line.employeeId);
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      const bank = await storage.getBankAccount(line.employeeId);

      const allSettings = await storage.getSettings();
      const settingsMap: Record<string, string> = {};
      for (const s of allSettings) {
        settingsMap[s.key] = s.value;
      }

      const allLines = await storage.getPayRunLinesByEmployee(line.employeeId);
      const allPayRuns = await storage.getPayRuns();
      const payRunMap = new Map(allPayRuns.map((r) => [r.id, r]));
      const ytd = allLines.reduce(
        (acc, l) => {
          const run = payRunMap.get(l.payRunId);
          if (run && run.status === "FILED" && run.year === payRun.year) {
            return {
              gross: acc.gross + Number(l.grossEarnings),
              payg: acc.payg + Number(l.paygWithheld),
              super: acc.super + Number(l.superAmount),
            };
          }
          return acc;
        },
        { gross: 0, payg: 0, super: 0 }
      );

      const payslipNum = `PS-${payRun.year}-${String(payRun.month).padStart(2, "0")}-${String(req.params.lineId).slice(-4)}`;

      const payslipData = buildPayslipData({
        line,
        employee,
        bank: bank || undefined,
        settings: settingsMap,
        ytd,
        payRun,
        payslipNum,
      });

      const pdfBuffer = generatePayslipPDF(payslipData);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${payslipNum}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ message: "Failed to generate payslip" });
    }
  });

  app.post("/api/payroll/aba", async (req, res) => {
    try {
      const { payRunId } = req.body;
      if (!payRunId) return res.status(400).json({ message: "payRunId required" });

      const payRun = await storage.getPayRun(payRunId);
      if (!payRun) return res.status(404).json({ message: "Pay run not found" });

      const lines = await storage.getPayRunLines(payRunId);
      const includedLines = lines.filter((l) => l.status === "INCLUDED");

      const allSettings = await storage.getSettings();
      const settingsMap: Record<string, string> = {};
      for (const s of allSettings) {
        settingsMap[s.key] = s.value;
      }

      const abaLines = [];
      const missing: string[] = [];
      let lineIdx = 1;

      for (const line of includedLines) {
        const employee = await storage.getEmployee(line.employeeId);
        if (!employee) continue;
        const bank = await storage.getBankAccount(line.employeeId);
        if (!bank) {
          missing.push(`${employee.firstName} ${employee.lastName}`);
          continue;
        }

        const payslipNum = `PS-${payRun.year}-${String(payRun.month).padStart(2, "0")}-${String(lineIdx++).padStart(3, "0")}`;
        abaLines.push({
          employeeName: `${employee.firstName} ${employee.lastName}`,
          bsb: bank.bsb,
          accountNumber: bank.accountNumber,
          netPay: Number(line.netPay),
          payslipNumber: payslipNum,
        });
      }

      if (missing.length > 0) {
        return res.status(422).json({
          message: `Missing bank details for: ${missing.join(", ")}. Add bank accounts before generating ABA file.`,
        });
      }

      if (abaLines.length === 0) {
        return res.status(422).json({ message: "No pay run lines to include" });
      }

      const pd = new Date(payRun.paymentDate || payRun.payDate || new Date());
      const processingDate = `${String(pd.getDate()).padStart(2, "0")}${String(pd.getMonth() + 1).padStart(2, "0")}${String(pd.getFullYear()).slice(-2)}`;

      const header: ABAHeader = {
        bsb: "000-000",
        accountNumber: "000000000",
        accountName: settingsMap.company_name || "Agency",
        apcsUserName: settingsMap.company_name || "Agency",
        apcsUserId: "000000",
        description: "PAYROLL",
        processingDate,
      };

      const { content, totalAmount, entryCount } = buildABAFromPayRun({
        header,
        lines: abaLines,
        paymentDate: payRun.paymentDate || payRun.payDate || undefined,
      });

      const fileName = `payroll-${payRun.year}-${String(payRun.month).padStart(2, "0")}-${Date.now()}.aba`;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-ABA-Total", String(totalAmount));
      res.setHeader("X-ABA-Entries", String(entryCount));
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate ABA file" });
    }
  });

  app.get("/api/documents/:employeeId", async (req, res) => {
    try {
      const docs = await storage.getDocuments(req.params.employeeId);
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents/:employeeId", async (req, res) => {
    try {
      const parsed = insertDocumentSchema.safeParse({
        ...req.body,
        employeeId: req.params.employeeId,
        type: "OTHER",
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid document data", errors: parsed.error.flatten().fieldErrors });
      }
      const doc = await storage.createDocument(parsed.data);
      res.status(201).json(doc);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to upload document" });
    }
  });

  app.delete("/api/documents/doc/:docId", async (req, res) => {
    try {
      await storage.deleteDocument(req.params.docId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete document" });
    }
  });

  app.get("/api/xero/connect", async (_req, res) => {
    try {
      const url = await getConsentUrl();
      res.json({ url });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to build Xero consent URL" });
    }
  });

  app.get("/api/xero/callback", async (req, res) => {
    try {
      const proto = req.get("x-forwarded-proto") || req.protocol;
      const fullUrl = `${proto}://${req.get("host")}${req.originalUrl}`;
      await handleCallback(fullUrl);
      res.send(`<!DOCTYPE html><html><head><title>Xero Connected</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8faf8;color:#1a1a1a}.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:400px}.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#666;font-size:.875rem;margin:0}</style></head><body><div class="card"><div class="icon">&#10004;</div><h1>Connected to Xero</h1><p>You can close this tab and return to the portal.</p></div></body></html>`);
    } catch (err: any) {
      console.error("Xero callback error:", err);
      const errorMsg = err.message || "Connection failed";
      res.send(`<!DOCTYPE html><html><head><title>Xero Connection Failed</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2;color:#1a1a1a}.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:400px}.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.25rem;margin:0 0 .5rem;color:#dc2626}p{color:#666;font-size:.875rem;margin:0}</style></head><body><div class="card"><div class="icon">&#10060;</div><h1>Connection Failed</h1><p>${errorMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p></div></body></html>`);
    }
  });

  app.get("/api/xero/status", async (_req, res) => {
    try {
      const status = await isConnected();
      const callbackUri = getCallbackUri();
      res.json({ ...status, callbackUri });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to check Xero status" });
    }
  });

  app.post("/api/xero/sync", async (_req, res) => {
    try {
      const result = await syncEmployees();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync employees from Xero" });
    }
  });

  app.post("/api/xero/disconnect", async (_req, res) => {
    try {
      await disconnect();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to disconnect Xero" });
    }
  });

  app.get("/api/xero/tenants", async (_req, res) => {
    try {
      const tenants = await getTenants();
      res.json(tenants);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch Xero tenants" });
    }
  });

  app.post("/api/xero/tenants/select", async (req, res) => {
    try {
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ message: "tenantId is required" });
      await selectTenant(tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to select tenant" });
    }
  });

  app.post("/api/xero/sync-payruns", async (_req, res) => {
    try {
      const result = await syncPayRuns();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync pay runs from Xero" });
    }
  });

  app.post("/api/xero/sync-timesheets", async (_req, res) => {
    try {
      const result = await syncTimesheets();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync timesheets from Xero" });
    }
  });

  app.post("/api/xero/sync-invoices", async (_req, res) => {
    try {
      const result = await syncInvoices();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync invoices from Xero" });
    }
  });

  app.get("/api/xero/payroll-settings", async (_req, res) => {
    try {
      const result = await syncPayrollSettings();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch payroll settings from Xero" });
    }
  });

  app.post("/api/xero/sync-contacts", async (_req, res) => {
    try {
      const result = await syncContacts();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync contacts from Xero" });
    }
  });

  app.post("/api/xero/sync-bank-transactions", async (req, res) => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      if (tenantId) {
        const result = await syncBankTransactionsForTenant(tenantId);
        res.json(result);
      } else {
        const result = await syncBankTransactions();
        res.json(result);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync bank transactions from Xero" });
    }
  });

  app.post("/api/xero/sync-bank-transactions-all", async (_req, res) => {
    try {
      const result = await syncBankTransactionsAllTenants();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync bank transactions from Xero" });
    }
  });

  app.get("/api/bank-transactions/coverage", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          bt.tenant_id,
          bt.bank_account_id,
          bt.bank_account_name,
          MIN(bt.date)::text as earliest_date,
          MAX(bt.date)::text as latest_date,
          COUNT(*)::int as total_transactions,
          COUNT(DISTINCT (bt.year * 100 + bt.month))::int as months_with_data
        FROM bank_transactions bt
        GROUP BY bt.tenant_id, bt.bank_account_id, bt.bank_account_name
        ORDER BY bt.tenant_id, bt.bank_account_name
      `);

      const accounts: Array<{
        tenantId: string;
        tenantName: string;
        bankAccountId: string;
        bankAccountName: string;
        earliestDate: string;
        latestDate: string;
        totalTransactions: number;
        monthsWithData: number;
        expectedMonths: number;
        gapMonths: string[];
        daysSinceLatest: number;
      }> = [];

      const tenantsSetting = await storage.getSetting("xero.tenants");
      const tenantsJson = tenantsSetting?.value || "[]";
      let tenantList: Array<{ tenantId: string; tenantName: string }> = [];
      try { tenantList = JSON.parse(tenantsJson); } catch {}
      const tenantNameMap = new Map(tenantList.map(t => [t.tenantId, t.tenantName]));

      const lastSyncByTenant: Record<string, string | null> = {};
      for (const t of tenantList) {
        const setting = await storage.getSetting(`xero.lastBankTxnSyncAt.${t.tenantId}`);
        lastSyncByTenant[t.tenantName || t.tenantId] = setting?.value || null;
      }
      if (Object.keys(lastSyncByTenant).length === 0) {
        const fallback = await storage.getSetting("xero.lastBankTxnSyncAt");
        lastSyncByTenant["default"] = fallback?.value || null;
      }

      for (const row of result.rows as any[]) {
        const monthsResult = await db.execute(sql`
          SELECT DISTINCT year * 100 + month as ym
          FROM bank_transactions
          WHERE bank_account_id = ${row.bank_account_id} AND tenant_id = ${row.tenant_id}
          ORDER BY ym
        `);
        const presentMonths = new Set((monthsResult.rows as any[]).map(r => r.ym));
        const ymValues = [...presentMonths];
        const minYM = Math.min(...ymValues);
        const maxYM = Math.max(...ymValues);

        const gapMonths: string[] = [];
        let yr = Math.floor(minYM / 100);
        let mo = minYM % 100;
        let expectedMonths = 0;
        while (yr * 100 + mo <= maxYM) {
          expectedMonths++;
          if (!presentMonths.has(yr * 100 + mo)) {
            gapMonths.push(`${yr}-${String(mo).padStart(2, '0')}`);
          }
          mo++;
          if (mo > 12) { mo = 1; yr++; }
        }

        const latestDate = new Date(row.latest_date);
        const daysSinceLatest = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

        accounts.push({
          tenantId: row.tenant_id,
          tenantName: tenantNameMap.get(row.tenant_id) || row.tenant_id,
          bankAccountId: row.bank_account_id,
          bankAccountName: row.bank_account_name,
          earliestDate: row.earliest_date,
          latestDate: row.latest_date,
          totalTransactions: row.total_transactions,
          monthsWithData: row.months_with_data,
          expectedMonths,
          gapMonths,
          daysSinceLatest,
        });
      }

      res.json({
        accounts,
        lastSync: lastSyncByTenant,
        summary: {
          totalAccounts: accounts.length,
          accountsWithGaps: accounts.filter(a => a.gapMonths.length > 0).length,
          totalGapMonths: accounts.reduce((sum, a) => sum + a.gapMonths.length, 0),
          oldestLatestDate: accounts.length > 0 ? accounts.reduce((oldest, a) => a.latestDate < oldest ? a.latestDate : oldest, accounts[0].latestDate) : null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get bank transaction coverage" });
    }
  });

  app.get("/api/clients/invoice-contacts", async (_req, res) => {
    try {
      const invoices = await storage.getInvoices();
      const accrecInvoices = invoices.filter(inv => inv.invoiceType === "ACCREC" && inv.contactName);
      const contactMap = new Map<string, { name: string; xeroContactId: string | null }>();
      for (const inv of accrecInvoices) {
        if (inv.contactName && !contactMap.has(inv.contactName)) {
          contactMap.set(inv.contactName, { name: inv.contactName, xeroContactId: inv.xeroContactId });
        }
      }
      const contacts = Array.from(contactMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      res.json(contacts);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch invoice contacts" });
    }
  });

  app.get("/api/clients", async (_req, res) => {
    try {
      const data = await storage.getClients();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.updateClient(req.params.id, req.body);
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update client" });
    }
  });

  app.get("/api/placements", async (_req, res) => {
    try {
      const data = await storage.getAllPlacements();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch placements" });
    }
  });

  app.get("/api/employees/:id/placements", async (req, res) => {
    try {
      const data = await storage.getPlacements(req.params.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch placements" });
    }
  });

  app.post("/api/employees/:id/placements", async (req, res) => {
    try {
      const parsed = insertPlacementSchema.safeParse({
        ...req.body,
        employeeId: req.params.id,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid placement data", errors: parsed.error.flatten().fieldErrors });
      }
      const placement = await storage.createPlacement(parsed.data);
      if (parsed.data.status === "ACTIVE") {
        const updateData: any = {};
        if (parsed.data.clientName) updateData.clientName = parsed.data.clientName;
        if (parsed.data.chargeOutRate) updateData.chargeOutRate = parsed.data.chargeOutRate;
        if (parsed.data.payRate) updateData.hourlyRate = parsed.data.payRate;
        updateData.payrollFeePercent = parsed.data.payrollFeePercent || "0";
        if (Object.keys(updateData).length > 0) {
          await storage.updateEmployee(req.params.id, updateData);
        }
      }
      res.status(201).json(placement);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create placement" });
    }
  });

  app.patch("/api/placements/:id", async (req, res) => {
    try {
      const existing = await storage.getPlacement(req.params.id);
      if (!existing) return res.status(404).json({ message: "Placement not found" });

      const newChargeOut = req.body.chargeOutRate !== undefined ? req.body.chargeOutRate : existing.chargeOutRate;
      const newPayRate = req.body.payRate !== undefined ? req.body.payRate : existing.payRate;
      const rateChanged = (req.body.chargeOutRate !== undefined && req.body.chargeOutRate !== existing.chargeOutRate) ||
                           (req.body.payRate !== undefined && req.body.payRate !== existing.payRate);
      if (rateChanged && existing.employeeId) {
        const effectiveDate = req.body.rateEffectiveDate || new Date().toISOString().split("T")[0];
        const clientLabel = existing.clientName || "client";
        await storage.createRateHistory({
          employeeId: existing.employeeId,
          effectiveDate,
          chargeOutRate: newChargeOut || "0",
          payRate: newPayRate || "0",
          source: "PLACEMENT_UPDATE",
          placementId: req.params.id,
          clientName: existing.clientName || null,
          notes: `Rate change on ${clientLabel} placement: charge-out $${newChargeOut || "0"}, pay $${newPayRate || "0"}`,
        });
      }

      const { rateEffectiveDate, ...updateData } = req.body;
      const placement = await storage.updatePlacement(req.params.id, updateData);

      const updatedStatus = req.body.status !== undefined ? req.body.status : existing.status;
      if (updatedStatus === "ACTIVE" && existing.employeeId) {
        const finalChargeOut = req.body.chargeOutRate !== undefined ? req.body.chargeOutRate : existing.chargeOutRate;
        const finalPayRate = req.body.payRate !== undefined ? req.body.payRate : existing.payRate;
        const finalFee = req.body.payrollFeePercent !== undefined ? req.body.payrollFeePercent : existing.payrollFeePercent;
        const finalClientName = req.body.clientName !== undefined ? req.body.clientName : existing.clientName;
        const empUpdate: any = {
          chargeOutRate: finalChargeOut || null,
          hourlyRate: finalPayRate || null,
          payrollFeePercent: finalFee || "0",
        };
        if (finalClientName) empUpdate.clientName = finalClientName;
        await storage.updateEmployee(existing.employeeId, empUpdate);
      }

      res.json(placement);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update placement" });
    }
  });

  app.get("/api/employees/:id/rate-history", async (req, res) => {
    try {
      const history = await storage.getRateHistory(req.params.id);
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch rate history" });
    }
  });

  app.get("/api/pay-run-lines/:lineId/detail", async (req, res) => {
    try {
      const detail = await storage.getPayslipLines(req.params.lineId);
      res.json(detail);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch payslip detail" });
    }
  });

  app.get("/api/super-rate", async (req, res) => {
    try {
      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();
      const rate = getSuperRate(date);
      res.json({ rate, date: date.toISOString().split("T")[0] });
    } catch (err) {
      res.status(500).json({ message: "Failed to get super rate" });
    }
  });

  app.get("/api/supplier-contacts", async (_req, res) => {
    try {
      const data = await storage.getBankTransactions();
      const spendTxns = data.filter(t => t.type === "SPEND" && t.contactName && t.xeroContactId);
      const contactMap = new Map<string, { contactName: string; xeroContactId: string }>();
      for (const txn of spendTxns) {
        if (!contactMap.has(txn.xeroContactId!)) {
          contactMap.set(txn.xeroContactId!, {
            contactName: txn.contactName!,
            xeroContactId: txn.xeroContactId!,
          });
        }
      }
      const contacts = Array.from(contactMap.values()).sort((a, b) => a.contactName.localeCompare(b.contactName));
      res.json(contacts);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch supplier contacts" });
    }
  });

  app.get("/api/bank-transactions/latest-period", async (_req, res) => {
    try {
      const data = await storage.getBankTransactions();
      if (data.length === 0) {
        const now = new Date();
        res.json({ month: now.getMonth() + 1, year: now.getFullYear() });
        return;
      }
      let latestYear = 0;
      let latestMonth = 0;
      for (const t of data) {
        if (t.year > latestYear || (t.year === latestYear && t.month > latestMonth)) {
          latestYear = t.year;
          latestMonth = t.month;
        }
      }
      res.json({ month: latestMonth, year: latestYear });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch latest period" });
    }
  });

  app.get("/api/cash-position", async (_req, res) => {
    try {
      const [allTxns, allInvoices, employees, allPayRuns] = await Promise.all([
        storage.getBankTransactions(),
        storage.getInvoices(),
        storage.getEmployees(),
        storage.getPayRuns(),
      ]);

      const isTransfer = (t: any) =>
        (!t.contactName || t.contactName === "") &&
        (t.description || "").startsWith("Bank Transfer");

      const isIncomingTransfer = (t: any) =>
        isTransfer(t) && (t.description || "").includes("Bank Transfer from");

      const isOutgoingTransfer = (t: any) =>
        isTransfer(t) && (t.description || "").includes("Bank Transfer to");

      const accounts: Record<string, { name: string; totalIn: number; totalOut: number; net: number; txnCount: number; earliest: string | null; latest: string | null }> = {};
      let totalTransferAmount = 0;
      const monthlyFlow: Record<string, { month: string; cashIn: number; cashOut: number; net: number }> = {};
      let linkedCount = 0;
      let unlinkedCount = 0;
      let linkedRevenue = 0;
      let linkedCost = 0;
      let atoSpend = 0;
      let superSpend = 0;
      let businessExpenses = 0;
      let amexTotalSpend = 0;
      let amexTotalCredits = 0;
      let amexRepayments = 0;

      const employeeCashFlow: Record<string, { name: string; revenue: number; cost: number; txns: number }> = {};

      const empMap: Record<string, string> = {};
      for (const e of employees) {
        empMap[e.id] = `${e.firstName} ${e.lastName}`;
      }

      for (const t of allTxns) {
        const amt = parseFloat(t.amount);
        const acctName = t.bankAccountName || "Unknown";
        const monthKey = `${t.year}-${String(t.month).padStart(2, "0")}`;

        if (!accounts[acctName]) {
          accounts[acctName] = { name: acctName, totalIn: 0, totalOut: 0, net: 0, txnCount: 0, earliest: null, latest: null };
        }
        const acct = accounts[acctName];
        acct.txnCount++;
        if (!acct.earliest || t.date < acct.earliest) acct.earliest = t.date;
        if (!acct.latest || t.date > acct.latest) acct.latest = t.date;

        if (isTransfer(t)) {
          totalTransferAmount += amt;
          if (isIncomingTransfer(t)) {
            acct.totalIn += amt;
            acct.net += amt;
          } else if (isOutgoingTransfer(t)) {
            acct.totalOut += amt;
            acct.net -= amt;
          }
        } else {
          if (t.type === "RECEIVE") {
            acct.totalIn += amt;
            acct.net += amt;
          } else {
            acct.totalOut += amt;
            acct.net -= amt;
          }
        }

        if (!monthlyFlow[monthKey]) {
          monthlyFlow[monthKey] = { month: monthKey, cashIn: 0, cashOut: 0, net: 0 };
        }
        if (!isTransfer(t)) {
          if (t.type === "RECEIVE") {
            monthlyFlow[monthKey].cashIn += amt;
          } else {
            monthlyFlow[monthKey].cashOut += amt;
          }
          monthlyFlow[monthKey].net = monthlyFlow[monthKey].cashIn - monthlyFlow[monthKey].cashOut;
        }

        if (t.linkedEmployeeId) {
          linkedCount++;
          const empName = empMap[t.linkedEmployeeId] || "Unknown";
          if (!employeeCashFlow[t.linkedEmployeeId]) {
            employeeCashFlow[t.linkedEmployeeId] = { name: empName, revenue: 0, cost: 0, txns: 0 };
          }
          employeeCashFlow[t.linkedEmployeeId].txns++;
          if (t.type === "RECEIVE") {
            linkedRevenue += amt;
            employeeCashFlow[t.linkedEmployeeId].revenue += amt;
          } else {
            linkedCost += amt;
            employeeCashFlow[t.linkedEmployeeId].cost += amt;
          }
        } else if (!isTransfer(t)) {
          unlinkedCount++;
          const cn = (t.contactName || "").toLowerCase();
          if (cn.includes("ato")) atoSpend += (t.type === "SPEND" ? amt : 0);
          else if (cn.includes("super choice")) superSpend += (t.type === "SPEND" ? amt : 0);
          else if (acctName.includes("American Express") && t.type === "SPEND") businessExpenses += amt;
        }

        if (acctName.includes("American Express")) {
          if (t.type === "SPEND") {
            if (isTransfer(t)) {
              amexRepayments += amt;
            } else {
              amexTotalSpend += amt;
            }
          }
          if (t.type === "RECEIVE") amexTotalCredits += amt;
        }
      }

      const openingBalances: Record<string, number> = {};
      for (const acctName of Object.keys(accounts)) {
        const setting = await storage.getSetting(`bank.opening_balance.${acctName}`);
        openingBalances[acctName] = setting?.value ? parseFloat(setting.value) : 0;
      }

      const accountList = Object.values(accounts).map(a => ({
        ...a,
        openingBalance: openingBalances[a.name] || 0,
        currentBalance: (openingBalances[a.name] || 0) + a.net,
      })).sort((a, b) => {
        const order: Record<string, number> = { "MSG RECRUITMENT": 0, "Tax Account": 1, "Macquarie Platinum Transaction Account": 2 };
        return (order[a.name] ?? 3) - (order[b.name] ?? 3);
      });

      const monthlyFlowSorted = Object.values(monthlyFlow).sort((a, b) => a.month.localeCompare(b.month));

      const bankCashFlow = accountList.filter(a => !a.name.includes("American Express")).reduce((sum, a) => sum + a.net, 0);
      const amexDebt = amexTotalSpend - amexTotalCredits - amexRepayments;

      const amexTotalCharged = amexTotalSpend;
      const amexTotalPaidOff = amexRepayments + amexTotalCredits;

      const invoiceRevenue = {
        paidAccrec: 0,
        paidAccrecCount: 0,
        outstandingAccrec: 0,
        outstandingAccrecCount: 0,
        paidAccpay: 0,
        paidAccpayCount: 0,
        byClient: {} as Record<string, { name: string; paid: number; outstanding: number; count: number }>,
      };

      for (const inv of allInvoices) {
        if (inv.invoiceType === "ACCREC") {
          const clientName = (inv as any).contactName || "Unknown";
          if (!invoiceRevenue.byClient[clientName]) {
            invoiceRevenue.byClient[clientName] = { name: clientName, paid: 0, outstanding: 0, count: 0 };
          }
          invoiceRevenue.byClient[clientName].count++;

          if (inv.status === "PAID") {
            invoiceRevenue.paidAccrec += parseFloat(String(inv.amountInclGst));
            invoiceRevenue.paidAccrecCount++;
            invoiceRevenue.byClient[clientName].paid += parseFloat(String(inv.amountInclGst));
          } else if (inv.status === "AUTHORISED" || inv.status === "OVERDUE") {
            invoiceRevenue.outstandingAccrec += parseFloat(String(inv.amountInclGst));
            invoiceRevenue.outstandingAccrecCount++;
            invoiceRevenue.byClient[clientName].outstanding += parseFloat(String(inv.amountInclGst));
          }
        } else if (inv.invoiceType === "ACCPAY" && inv.status === "PAID") {
          invoiceRevenue.paidAccpay += parseFloat(String(inv.amountInclGst));
          invoiceRevenue.paidAccpayCount++;
        }
      }

      const clientList = Object.values(invoiceRevenue.byClient)
        .sort((a, b) => (b.paid + b.outstanding) - (a.paid + a.outstanding));

      let payrollTotal = 0;
      let payrollCount = 0;
      for (const pr of allPayRuns) {
        const gross = parseFloat(String(pr.totalGross || 0));
        const superAmt = parseFloat(String(pr.totalSuper || 0));
        payrollTotal += gross;
        payrollCount++;
      }

      const employeeList = Object.entries(employeeCashFlow)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.revenue + b.cost) - (a.revenue + a.cost));

      let bankReceiveRevenue = 0;
      const incomeByContact: Record<string, { name: string; total: number; count: number }> = {};
      for (const t of allTxns) {
        const acctName = t.bankAccountName || "";
        if (!acctName.includes("American Express") && t.type === "RECEIVE" && !isTransfer(t)) {
          const amt = parseFloat(t.amount);
          bankReceiveRevenue += amt;
          const contactName = t.contactName || "Unknown";
          if (!incomeByContact[contactName]) {
            incomeByContact[contactName] = { name: contactName, total: 0, count: 0 };
          }
          incomeByContact[contactName].total += amt;
          incomeByContact[contactName].count++;
        }
      }
      const incomeByContactList = Object.values(incomeByContact)
        .sort((a, b) => b.total - a.total);

      res.json({
        accounts: accountList,
        bankCashFlow,
        invoiceRevenue: {
          totalPaidInclGst: invoiceRevenue.paidAccrec,
          totalPaidCount: invoiceRevenue.paidAccrecCount,
          totalOutstandingInclGst: invoiceRevenue.outstandingAccrec,
          totalOutstandingCount: invoiceRevenue.outstandingAccrecCount,
          suppliersPaid: invoiceRevenue.paidAccpay,
          suppliersPaidCount: invoiceRevenue.paidAccpayCount,
          byClient: clientList,
        },
        payroll: {
          totalGrossCost: payrollTotal,
          payRunCount: payrollCount,
        },
        amex: {
          totalCharged: amexTotalCharged,
          cardPurchases: amexTotalSpend,
          totalCredits: amexTotalCredits,
          repaymentsFromBank: amexRepayments,
          totalPaidOff: amexTotalPaidOff,
          outstandingDebt: amexDebt,
        },
        summary: {
          bankReceiveRevenue,
          incomeByContact: incomeByContactList,
          totalExpenses: accountList.reduce((s, a) => s + a.totalOut, 0),
          linkedRevenue,
          linkedCost,
          atoSpend,
          superSpend,
          businessExpenses,
          interAccountTransfers: totalTransferAmount,
          linkedTxns: linkedCount,
          unlinkedTxns: unlinkedCount,
        },
        employees: employeeList,
        monthlyFlow: monthlyFlowSorted,
      });
    } catch (err) {
      console.error("Cash position error:", err);
      res.status(500).json({ message: "Failed to calculate cash position" });
    }
  });

  app.get("/api/bank-transactions", async (req, res) => {
    try {
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      let data = await storage.getBankTransactions();
      if (month && year) {
        data = data.filter(t => t.month === month && t.year === year);
      } else if (year) {
        data = data.filter(t => t.year === year);
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bank transactions" });
    }
  });

  function buildAlignmentPreview(
    allInvoices: any[],
    allPlacements: any[],
    allEmployees: any[],
    clients: any[],
  ) {
    const linkablePlacements = allPlacements.filter((p: any) => p.status === "ACTIVE" || p.status === "ENDED");

    type PlacementEntry = { employeeId: string; rate: number; employee: any; placement: any };
    const placementsByClientId = new Map<string, PlacementEntry[]>();
    const placementsByClientName = new Map<string, PlacementEntry[]>();
    for (const placement of linkablePlacements) {
      const employee = allEmployees.find((e: any) => e.id === placement.employeeId);
      if (!employee) continue;
      const client = clients.find((c: any) => c.id === placement.clientId);
      if (!client) continue;
      const rate = parseFloat(placement.chargeOutRate || employee.chargeOutRate || "0");
      const entry: PlacementEntry = { employeeId: employee.id, rate, employee, placement };
      if (!placementsByClientId.has(client.id)) placementsByClientId.set(client.id, []);
      placementsByClientId.get(client.id)!.push(entry);
      const normalName = client.name.toLowerCase().trim();
      if (!placementsByClientName.has(normalName)) placementsByClientName.set(normalName, []);
      placementsByClientName.get(normalName)!.push(entry);
    }

    const wordBoundaryMatch = (text: string, term: string) => {
      if (term.length < 2) return false;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    };

    const proposals: Array<{
      invoiceId: string;
      invoiceNumber: string | null;
      contactName: string | null;
      clientId: string | null;
      clientName: string | null;
      currentEmployeeId: string | null;
      proposedEmployeeId: string | null;
      proposedEmployeeName: string | null;
      matchMethod: "rate" | "description" | "placement" | "unmatched";
      confidence: "high" | "medium" | "low";
      invoiceRate: number | null;
      placementRate: number | null;
      amountExclGst: string | null;
      amountInclGst: string | null;
      gstAmount: string | null;
      hours: string | null;
      hourlyRate: string | null;
      description: string | null;
      issueDate: string | null;
      dueDate: string | null;
      status: string;
    }> = [];

    const clientByName = new Map(clients.map((c: any) => [c.name.toLowerCase().trim(), c]));

    for (const inv of allInvoices) {
      if (inv.employeeId) continue;
      if ((inv as any).invoiceType && (inv as any).invoiceType !== "ACCREC") continue;

      const clientRecord = inv.clientId
        ? clients.find((c: any) => c.id === inv.clientId)
        : inv.contactName
          ? clientByName.get(inv.contactName.toLowerCase().trim())
          : undefined;

      const clientPlacements = (inv.clientId ? placementsByClientId.get(inv.clientId) : undefined)
        || placementsByClientName.get((inv.contactName || "").toLowerCase().trim())
        || [];

      const derivedRate = inv.hours && parseFloat(inv.hours) > 0
        ? parseFloat(inv.amountExclGst || "0") / parseFloat(inv.hours)
        : 0;
      const storedRate = inv.hourlyRate ? parseFloat(inv.hourlyRate) : 0;
      const invRate = derivedRate > 0 ? derivedRate : storedRate;

      const invHourlyRate = invRate > 0 ? invRate.toFixed(2) : null;

      const baseProposal = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contactName: inv.contactName,
        clientId: clientRecord?.id || inv.clientId || null,
        clientName: clientRecord?.name || inv.contactName || null,
        currentEmployeeId: null,
        amountExclGst: inv.amountExclGst,
        amountInclGst: inv.amountInclGst || null,
        gstAmount: inv.gstAmount || null,
        hours: inv.hours,
        hourlyRate: invHourlyRate,
        description: inv.description,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate || null,
        status: inv.status || "UNKNOWN",
      };

      if (clientPlacements.length === 1) {
        proposals.push({
          ...baseProposal,
          proposedEmployeeId: clientPlacements[0].employeeId,
          proposedEmployeeName: `${clientPlacements[0].employee.firstName} ${clientPlacements[0].employee.lastName}`,
          matchMethod: "placement",
          confidence: "high",
          invoiceRate: invRate || null,
          placementRate: clientPlacements[0].rate || null,
        });
        continue;
      }

      if (invRate > 0 && clientPlacements.length > 0) {
        const rateMatches = clientPlacements.filter(p => p.rate > 0 && Math.abs(invRate - p.rate) < 0.01);
        if (rateMatches.length === 1) {
          proposals.push({
            ...baseProposal,
            proposedEmployeeId: rateMatches[0].employeeId,
            proposedEmployeeName: `${rateMatches[0].employee.firstName} ${rateMatches[0].employee.lastName}`,
            matchMethod: "rate",
            confidence: "high",
            invoiceRate: invRate,
            placementRate: rateMatches[0].rate,
          });
          continue;
        }
      }

      const desc = (inv.description || "").toLowerCase();
      if (desc && clientPlacements.length > 0) {
        const nameMatches = clientPlacements.filter(p => {
          const first = (p.employee.firstName || "").toLowerCase().trim();
          const last = (p.employee.lastName || "").toLowerCase().trim();
          if (!first || !last || last.length < 3) return false;
          return wordBoundaryMatch(desc, last) && wordBoundaryMatch(desc, first);
        });
        if (nameMatches.length === 1) {
          proposals.push({
            ...baseProposal,
            proposedEmployeeId: nameMatches[0].employeeId,
            proposedEmployeeName: `${nameMatches[0].employee.firstName} ${nameMatches[0].employee.lastName}`,
            matchMethod: "description",
            confidence: "medium",
            invoiceRate: invRate || null,
            placementRate: nameMatches[0].rate || null,
          });
          continue;
        }
      }

      if (desc) {
        const globalNameMatches = allEmployees.filter((e: any) => {
          const first = (e.firstName || "").toLowerCase().trim();
          const last = (e.lastName || "").toLowerCase().trim();
          if (!first || !last || last.length < 3) return false;
          return wordBoundaryMatch(desc, last) && wordBoundaryMatch(desc, first);
        });
        if (globalNameMatches.length === 1) {
          const emp = globalNameMatches[0];
          proposals.push({
            ...baseProposal,
            proposedEmployeeId: emp.id,
            proposedEmployeeName: `${emp.firstName} ${emp.lastName}`,
            matchMethod: "description",
            confidence: "medium",
            invoiceRate: invRate || null,
            placementRate: null,
          });
          continue;
        }
      }

      proposals.push({
        ...baseProposal,
        proposedEmployeeId: null,
        proposedEmployeeName: null,
        matchMethod: "unmatched",
        confidence: "low",
        invoiceRate: invRate || null,
        placementRate: null,
      });
    }

    return proposals;
  }

  app.post("/api/invoices/alignment-preview", async (_req, res) => {
    try {
      const [allPlacements, allInvoices, allEmployees, clients] = await Promise.all([
        storage.getAllPlacements(),
        storage.getInvoices(),
        storage.getEmployees(),
        storage.getClients(),
      ]);
      const proposals = buildAlignmentPreview(allInvoices, allPlacements, allEmployees, clients);
      res.json(proposals);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate alignment preview" });
    }
  });

  app.post("/api/invoices/alignment-commit", async (req, res) => {
    try {
      const decisions: Array<{ invoiceId: string; employeeId?: string | null; employeeIds?: string[]; action: "accept" | "skip" }> = req.body.decisions || [];
      if (!Array.isArray(decisions)) {
        return res.status(400).json({ message: "decisions must be an array" });
      }
      const allEmployees = await storage.getEmployees();
      const validEmployeeIds = new Set(allEmployees.map(e => e.id));

      let accepted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const d of decisions) {
        if (!d.invoiceId || typeof d.invoiceId !== "string") continue;
        const rawIds: string[] = d.employeeIds?.length ? d.employeeIds : (d.employeeId ? [d.employeeId] : []);
        const resolvedIds = Array.from(new Set(rawIds));
        if (d.action !== "accept" || resolvedIds.length === 0) {
          skipped++;
          continue;
        }
        const validIds = resolvedIds.filter(id => validEmployeeIds.has(id));
        if (validIds.length === 0) {
          errors.push(`No valid employees for invoice ${d.invoiceId}`);
          skipped++;
          continue;
        }
        const invoice = await storage.getInvoice(d.invoiceId);
        if (!invoice) {
          errors.push(`Invoice ${d.invoiceId} not found`);
          skipped++;
          continue;
        }
        if (invoice.employeeId) {
          skipped++;
          continue;
        }
        const updated = await storage.updateInvoice(d.invoiceId, { employeeId: validIds[0] });
        if (updated) {
          await storage.setInvoiceEmployees(d.invoiceId, validIds);
          accepted++;
        } else {
          skipped++;
        }
      }
      res.json({ accepted, skipped, errors, message: `Applied ${accepted} links, skipped ${skipped}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to commit alignment" });
    }
  });

  app.post("/api/invoices/auto-link", async (_req, res) => {
    try {
      const [allPlacements, allInvoices, allEmployees, clients] = await Promise.all([
        storage.getAllPlacements(),
        storage.getInvoices(),
        storage.getEmployees(),
        storage.getClients(),
      ]);

      const proposals = buildAlignmentPreview(allInvoices, allPlacements, allEmployees, clients);
      let linkedByRate = 0;
      let linkedByName = 0;
      let linkedByPlacement = 0;

      for (const p of proposals) {
        if (!p.proposedEmployeeId || p.matchMethod === "unmatched") continue;
        await storage.updateInvoice(p.invoiceId, { employeeId: p.proposedEmployeeId });
        await storage.setInvoiceEmployees(p.invoiceId, [p.proposedEmployeeId]);
        if (p.matchMethod === "rate") linkedByRate++;
        else if (p.matchMethod === "description") linkedByName++;
        else if (p.matchMethod === "placement") linkedByPlacement++;
      }

      const total = linkedByRate + linkedByName + linkedByPlacement;
      res.json({
        linked: total,
        linkedByRate,
        linkedByName,
        linkedByPlacement,
        message: `Auto-linked ${total} invoices (${linkedByRate} by rate, ${linkedByName} by name, ${linkedByPlacement} by placement)`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to auto-link invoices" });
    }
  });

  app.post("/api/invoices/link-clients", async (_req, res) => {
    try {
      const [allInvoices, allClients] = await Promise.all([
        storage.getInvoices(),
        storage.getClients(),
      ]);
      const clientByXeroContactId = new Map<string, typeof allClients[0]>();
      const clientByName = new Map<string, typeof allClients[0]>();
      for (const c of allClients) {
        if (c.xeroContactId) clientByXeroContactId.set(c.xeroContactId, c);
        clientByName.set(c.name.toLowerCase().trim(), c);
      }
      let linked = 0;
      for (const inv of allInvoices) {
        if (inv.clientId) continue;
        let client: typeof allClients[0] | undefined;
        if (inv.xeroContactId) {
          client = clientByXeroContactId.get(inv.xeroContactId);
        }
        if (!client && inv.contactName) {
          client = clientByName.get(inv.contactName.toLowerCase().trim());
        }
        if (client) {
          await storage.updateInvoice(inv.id, { clientId: client.id });
          linked++;
        }
      }
      res.json({ linked, message: `Linked ${linked} invoices to clients` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to link invoices to clients" });
    }
  });

  app.get("/api/rctis/eligible-clients", async (_req, res) => {
    try {
      const [allClients, allBankTxns, allInvoices] = await Promise.all([
        storage.getClients(),
        storage.getBankTransactions(),
        storage.getInvoices(),
      ]);
      const receiveTxns = allBankTxns.filter(t => t.type === "RECEIVE" && t.contactName);
      const receiveByContact = new Map<string, { count: number; total: number }>();
      for (const txn of receiveTxns) {
        const key = (txn.contactName || "").toLowerCase().trim();
        const existing = receiveByContact.get(key) || { count: 0, total: 0 };
        existing.count++;
        existing.total += parseFloat(txn.amount || "0");
        receiveByContact.set(key, existing);
      }
      const acrecClientIds = new Set(
        allInvoices
          .filter(inv => inv.invoiceType === "ACCREC" && inv.status !== "VOIDED" && inv.clientId)
          .map(inv => inv.clientId!)
      );
      const eligible = allClients
        .filter(c => {
          if (c.isRcti) return true;
          return acrecClientIds.has(c.id);
        })
        .map(c => {
          const stats = receiveByContact.get(c.name.toLowerCase().trim()) || { count: 0, total: 0 };
          return {
            id: c.id,
            name: c.name,
            isRcti: c.isRcti,
            isCustomer: c.isCustomer,
            receiveCount: stats.count,
            receiveTotal: Math.round(stats.total * 100) / 100,
          };
        })
        .sort((a, b) => b.receiveTotal - a.receiveTotal);
      res.json(eligible);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch eligible clients" });
    }
  });

  app.get("/api/rctis", async (_req, res) => {
    try {
      const [allRctis, allClients, allEmployees] = await Promise.all([
        storage.getRctis(),
        storage.getClients(),
        storage.getEmployees(),
      ]);
      const enriched = allRctis.map(r => ({
        ...r,
        clientName: allClients.find(c => c.id === r.clientId)?.name || null,
        employeeName: (() => {
          const emp = allEmployees.find(e => e.id === r.employeeId);
          return emp ? `${emp.firstName} ${emp.lastName}` : null;
        })(),
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch RCTIs" });
    }
  });

  app.get("/api/rctis/employee/:employeeId", async (req, res) => {
    try {
      const rctis = await storage.getRctisByEmployee(req.params.employeeId);
      res.json(rctis);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch employee RCTIs" });
    }
  });

  app.post("/api/rctis", async (req, res) => {
    try {
      const parsed = insertRctiSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid RCTI data", errors: parsed.error.issues });
      const rcti = await storage.createRcti(parsed.data);
      res.status(201).json(rcti);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create RCTI" });
    }
  });

  app.patch("/api/rctis/:id", async (req, res) => {
    try {
      const parsed = insertRctiSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid RCTI data", errors: parsed.error.issues });
      const rcti = await storage.updateRcti(req.params.id, parsed.data);
      if (!rcti) return res.status(404).json({ message: "RCTI not found" });
      res.json(rcti);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update RCTI" });
    }
  });

  app.delete("/api/rctis/:id", async (req, res) => {
    try {
      await storage.deleteRcti(req.params.id);
      res.json({ message: "RCTI deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete RCTI" });
    }
  });

  app.post("/api/rctis/auto-match", async (_req, res) => {
    try {
      const [allBankTxns, allClients, allPlacements, allEmployees, existingRctis] = await Promise.all([
        storage.getBankTransactions(),
        storage.getClients(),
        storage.getAllPlacements(),
        storage.getEmployees(),
        storage.getRctis(),
      ]);

      const rctiClients = allClients.filter(c => c.isRcti);
      if (rctiClients.length === 0) {
        return res.json({ created: 0, message: "No RCTI clients configured. Mark clients as RCTI first." });
      }

      const rctiClientNames = new Set(rctiClients.map(c => c.name.toLowerCase().trim()));
      const receiveTxns = allBankTxns.filter(t =>
        t.type === "RECEIVE" &&
        t.contactName &&
        rctiClientNames.has(t.contactName.toLowerCase().trim())
      );

      const matchedTxnIds = new Set(existingRctis.map(r => r.bankTransactionId).filter(Boolean));
      const unmatchedTxns = receiveTxns.filter(t => !matchedTxnIds.has(t.id));

      const getChargeOutRate = (employeeId: string, placements: typeof allPlacements): number => {
        const placement = placements.find(p => p.employeeId === employeeId);
        const placementRate = parseFloat(placement?.chargeOutRate || "0");
        if (placementRate > 0) return placementRate;
        const emp = allEmployees.find(e => e.id === employeeId);
        const empRate = parseFloat(emp?.chargeOutRate || "0");
        if (empRate > 0) return empRate;
        return 0;
      };

      const wasPlacementActiveOnDate = (placement: typeof allPlacements[0], dateStr: string | null): boolean => {
        if (!dateStr) return true;
        const txnDate = new Date(dateStr);
        const start = placement.startDate ? new Date(placement.startDate) : null;
        const end = placement.endDate ? new Date(placement.endDate) : null;
        if (start && txnDate < start) return false;
        if (end && txnDate > new Date(end.getTime() + 30 * 24 * 60 * 60 * 1000)) return false;
        return true;
      };

      let created = 0;
      const skipped: string[] = [];
      for (const txn of unmatchedTxns) {
        const client = rctiClients.find(c => c.name.toLowerCase().trim() === (txn.contactName || "").toLowerCase().trim());
        if (!client) continue;

        const clientPlacements = allPlacements.filter(p =>
          p.clientId === client.id && (p.status === "ACTIVE" || p.status === "ENDED")
        );

        const uniqueEmployeeIds = [...new Set(clientPlacements.map(p => p.employeeId))];

        const activePlacements = clientPlacements.filter(p => wasPlacementActiveOnDate(p, txn.date));
        const activeUniqueEmployeeIds = [...new Set(activePlacements.map(p => p.employeeId))];

        const amount = parseFloat(txn.amount || "0");
        const gst = Math.round((amount / 11) * 100) / 100;
        const exGst = Math.round((amount - gst) * 100) / 100;
        const desc = txn.description || txn.reference || `Bank receipt from ${client.name}`;

        let employeeId: string | null = null;

        if (activeUniqueEmployeeIds.length === 1) {
          employeeId = activeUniqueEmployeeIds[0];
        } else if (uniqueEmployeeIds.length === 1) {
          employeeId = uniqueEmployeeIds[0];
        } else if (activeUniqueEmployeeIds.length > 1) {
          const descLower = (txn.description || txn.reference || "").toLowerCase();
          if (descLower) {
            const nameMatch = activePlacements.find(p => {
              const emp = allEmployees.find(e => e.id === p.employeeId);
              if (!emp) return false;
              const first = (emp.firstName || "").toLowerCase().trim();
              const last = (emp.lastName || "").toLowerCase().trim();
              if (!first || !last || last.length < 3) return false;
              const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              return new RegExp(`\\b${escaped(last)}\\b`, "i").test(descLower) &&
                     new RegExp(`\\b${escaped(first)}\\b`, "i").test(descLower);
            });
            if (nameMatch) employeeId = nameMatch.employeeId;
          }

          if (!employeeId) {
            const allRates = activeUniqueEmployeeIds.map(eid => ({
              employeeId: eid,
              rate: getChargeOutRate(eid, activePlacements),
            })).filter(r => r.rate > 0);

            if (allRates.length > 0) {
              for (const r of allRates) {
                const candidateHours = exGst / r.rate;
                const roundedHours = Math.round(candidateHours * 4) / 4;
                if (Math.abs(candidateHours - roundedHours) < 0.02) {
                  employeeId = r.employeeId;
                  break;
                }
              }
            }
          }

          if (!employeeId) {
            skipped.push(`${desc} $${amount} on ${txn.date} - multiple employees, could not determine attribution`);
            await storage.createRcti({
              clientId: client.id,
              employeeId: null,
              month: txn.month,
              year: txn.year,
              hours: null,
              hourlyRate: null,
              amountExclGst: exGst.toFixed(2),
              gstAmount: gst.toFixed(2),
              amountInclGst: amount.toFixed(2),
              description: `${desc} [UNATTRIBUTED - manual review needed]`,
              reference: txn.reference,
              receivedDate: txn.date,
              bankTransactionId: txn.id,
              status: "RECEIVED",
            });
            created++;
            continue;
          }
        }

        let hours: string | null = null;
        let hourlyRate: string | null = null;
        if (employeeId) {
          const rate = getChargeOutRate(employeeId, clientPlacements);
          if (rate > 0) {
            hours = (exGst / rate).toFixed(2);
            hourlyRate = rate.toFixed(2);
          }
        }

        await storage.createRcti({
          clientId: client.id,
          employeeId,
          month: txn.month,
          year: txn.year,
          hours,
          hourlyRate,
          amountExclGst: exGst.toFixed(2),
          gstAmount: gst.toFixed(2),
          amountInclGst: amount.toFixed(2),
          description: desc,
          reference: txn.reference,
          receivedDate: txn.date,
          bankTransactionId: txn.id,
          status: "RECEIVED",
        });
        created++;
      }

      res.json({
        created,
        skipped: skipped.length,
        skippedDetails: skipped,
        message: `Created ${created} RCTI records from bank transactions${skipped.length > 0 ? ` (${skipped.length} unattributed - need manual review)` : ""}`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to auto-match RCTIs" });
    }
  });

  app.post("/api/rctis/scan", upload.array("files", 20), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No PDF files uploaded" });
      }

      const results = await Promise.all(
        files.map((file) => scanRctiPdf(file.buffer, file.originalname))
      );

      res.json({ results });
    } catch (err: any) {
      console.error("RCTI scan error:", err);
      res.status(500).json({ message: err.message || "Failed to scan RCTI PDFs" });
    }
  });

  app.post("/api/rctis/batch", async (req, res) => {
    try {
      const { items, forceOverwrite } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No RCTI items provided" });
      }

      const existingRctis = await storage.getRctis();
      const dedupeIndex = existingRctis.map(r => ({
        id: r.id,
        employeeId: r.employeeId,
        clientId: r.clientId,
        month: r.month,
        year: r.year,
        amountExclGst: r.amountExclGst,
      }));

      const results: { created: number; skipped: number; updated: number; errors: string[]; duplicates: string[] } = {
        created: 0,
        skipped: 0,
        updated: 0,
        errors: [],
        duplicates: [],
      };

      for (const item of items) {
        try {
          const parsed = insertRctiSchema.safeParse(item);
          if (!parsed.success) {
            results.errors.push(`Invalid data for ${item.description || "unknown"}: ${parsed.error.issues.map(i => i.message).join(", ")}`);
            results.skipped++;
            continue;
          }

          const duplicate = dedupeIndex.find(r =>
            r.employeeId === parsed.data.employeeId &&
            r.clientId === parsed.data.clientId &&
            r.month === parsed.data.month &&
            r.year === parsed.data.year &&
            Math.abs(parseFloat(r.amountExclGst || "0") - parseFloat(parsed.data.amountExclGst || "0")) < 1
          );

          if (duplicate) {
            if (forceOverwrite) {
              await storage.updateRcti(duplicate.id, parsed.data);
              results.updated++;
            } else {
              results.duplicates.push(`Duplicate: ${item.description || ""} - ${parsed.data.month}/${parsed.data.year} $${parsed.data.amountExclGst}`);
              results.skipped++;
            }
            continue;
          }

          const created = await storage.createRcti(parsed.data);
          dedupeIndex.push({
            id: created.id,
            employeeId: created.employeeId,
            clientId: created.clientId,
            month: created.month,
            year: created.year,
            amountExclGst: created.amountExclGst,
          });
          results.created++;
        } catch (err: any) {
          results.errors.push(`Error creating RCTI: ${err.message}`);
          results.skipped++;
        }
      }

      res.json({
        ...results,
        message: `Created ${results.created}, updated ${results.updated}, skipped ${results.skipped} RCTI records`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to batch create RCTIs" });
    }
  });

  app.get("/api/profitability", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      const [allEmployees, allPlacements, allInvoices, allPayRuns, allBankTxns, allClients, allRctis, allTimesheets, allExpectedHours, allPayrollTaxRates, allRateHistory] = await Promise.all([
        storage.getEmployees(),
        storage.getAllPlacements(),
        storage.getInvoices(),
        storage.getPayRuns(),
        storage.getBankTransactions(),
        storage.getClients(),
        storage.getRctis(),
        storage.getTimesheets(),
        storage.getMonthlyExpectedHours({ month, year }),
        storage.getPayrollTaxRates(),
        storage.getAllRateHistory(),
      ]);

      const rateIndex = buildRateHistoryIndex(allRateHistory);

      const financialYear = month >= 7 ? year : year - 1;
      const ptRatesByState: Record<string, number> = {};
      for (const ptr of allPayrollTaxRates) {
        if (ptr.financialYearStart === financialYear && !(ptr.state in ptRatesByState)) {
          ptRatesByState[ptr.state] = parseFloat(ptr.rate);
        }
      }

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      const relevantPlacements = allPlacements.filter(p => {
        if (p.startDate) {
          const start = new Date(p.startDate);
          if (start > periodEnd) return false;
        }
        if (p.endDate) {
          const end = new Date(p.endDate);
          if (end < periodStart) {
            if (p.status === "ACTIVE") return false;
            const graceEnd = new Date(end.getFullYear(), end.getMonth() + 2, 0);
            if (periodStart > graceEnd) return false;
          }
        }
        if (p.status === "ACTIVE") return true;
        if (p.status !== "ENDED") return false;
        return true;
      });

      const periodPayRuns = allPayRuns.filter(pr => pr.month === month && pr.year === year);
      const allPayRunLines: { line: any; payRun: typeof periodPayRuns[0] }[] = [];
      for (const pr of periodPayRuns) {
        const lines = await storage.getPayRunLines(pr.id);
        for (const line of lines) {
          allPayRunLines.push({ line, payRun: pr });
        }
      }

      const periodInvoices = allInvoices.filter(i => i.month === month && i.year === year);
      const periodBankTxns = allBankTxns.filter(t => t.month === month && t.year === year);
      const periodRctis = allRctis.filter(r => r.month === month && r.year === year);
      const claimedInvoiceIds = new Set<string>();
      const claimedBankTxnIds = new Set<string>();
      const claimedEmployeeCostIds = new Set<string>();

      const allLineItems = await storage.getInvoiceLineItemsByInvoiceIds(periodInvoices.map(i => i.id));
      const lineItemsByInvoice: Record<string, typeof allLineItems> = {};
      for (const li of allLineItems) {
        if (!lineItemsByInvoice[li.invoiceId]) lineItemsByInvoice[li.invoiceId] = [];
        lineItemsByInvoice[li.invoiceId].push(li);
      }

      const claimedLineItemIds = new Set<string>();

      const rows = relevantPlacements.map(placement => {
        const employee = allEmployees.find(e => e.id === placement.employeeId);
        if (!employee) return null;

        const client = allClients.find(c => c.id === placement.clientId);
        const clientName = placement.clientName || client?.name || "Unknown";

        const effectiveRates = getEffectiveRate(rateIndex, employee.id, month, year, employee.hourlyRate, placement.chargeOutRate || employee.chargeOutRate);

        const empPayLinesForRate = allPayRunLines.filter(pl => pl.line.employeeId === employee.id);
        const payrollDerivedRate = empPayLinesForRate.reduce((best, pl) => {
          const r = parseFloat(pl.line.ratePerHour || "0");
          return r > 0 ? r : best;
        }, 0);

        let chargeOutRate = parseFloat(placement.chargeOutRate || "0");
        let chargeOutRateSource: "PLACEMENT" | "RATE_HISTORY" | "INVOICE_DERIVED" | "EMPLOYEE_DEFAULT" = "PLACEMENT";
        if (chargeOutRate > 0) {
          chargeOutRateSource = "PLACEMENT";
        } else if (effectiveRates.chargeOutRate > 0 && rateIndex[employee.id]?.some(r => r.chargeOutRate && parseFloat(r.chargeOutRate) > 0)) {
          chargeOutRate = effectiveRates.chargeOutRate;
          chargeOutRateSource = "RATE_HISTORY";
        } else {
          const invForRate = periodInvoices.find(inv => {
            if (inv.status === "VOIDED" || inv.status === "DELETED") return false;
            const invType = (inv as any).invoiceType;
            if (invType && invType !== "ACCREC") return false;
            return (inv.employeeId === employee.id && inv.contactName === clientName) ||
                   (!inv.employeeId && inv.contactName === clientName);
          });
          if (invForRate) {
            const invLines = lineItemsByInvoice[invForRate.id] || [];
            const lineRate = invLines.length > 0 ? parseFloat(invLines[0].unitAmount || "0") : 0;
            const invHrs = parseFloat(invForRate.hours || "0");
            const invAmt = parseFloat(invForRate.amountExclGst || "0");
            const derivedRate = lineRate > 0 ? lineRate : (invHrs > 0 ? invAmt / invHrs : parseFloat(invForRate.hourlyRate || "0"));
            if (derivedRate > 0) {
              chargeOutRate = derivedRate;
              chargeOutRateSource = "INVOICE_DERIVED";
            }
          }
          if (chargeOutRate === 0 && parseFloat(employee.chargeOutRate || "0") > 0) {
            chargeOutRate = parseFloat(employee.chargeOutRate || "0");
            chargeOutRateSource = "EMPLOYEE_DEFAULT";
          }
        }

        let payRate = parseFloat(placement.payRate || "0");
        let payRateSource: "PLACEMENT" | "RATE_HISTORY" | "PAYROLL_DERIVED" | "EMPLOYEE_DEFAULT" = "PLACEMENT";
        if (payRate > 0) {
          payRateSource = "PLACEMENT";
        } else if (effectiveRates.payRate > 0 && rateIndex[employee.id]?.length > 0) {
          payRate = effectiveRates.payRate;
          payRateSource = "RATE_HISTORY";
        } else if (payrollDerivedRate > 0) {
          payRate = payrollDerivedRate;
          payRateSource = "PAYROLL_DERIVED";
        } else if (parseFloat(employee.hourlyRate || "0") > 0) {
          payRate = parseFloat(employee.hourlyRate || "0");
          payRateSource = "EMPLOYEE_DEFAULT";
        }

        const rateSpread = chargeOutRate - payRate;

        let invoiceRevenue = 0;
        let invoiceRevenueInclGst = 0;
        let invoiceHours = 0;
        const empInvoices: typeof periodInvoices = [];

        for (const inv of periodInvoices) {
          if (inv.status === "VOIDED" || inv.status === "DELETED") continue;
          const invType = (inv as any).invoiceType;
          if (invType && invType !== "ACCREC") continue;
          const matchesEmployee = inv.employeeId === employee.id && inv.contactName === clientName;
          const matchesClientOnly = !inv.employeeId && inv.contactName === clientName;
          if (!matchesEmployee && !matchesClientOnly) continue;

          const lineItems = lineItemsByInvoice[inv.id] || [];
          const unclaimedLines = lineItems.filter(li => !claimedLineItemIds.has(li.id));
          const rateMatchedLines = unclaimedLines.filter(li => {
            const liRate = parseFloat(li.unitAmount || "0");
            return Math.abs(liRate - chargeOutRate) < 0.02;
          });

          if (rateMatchedLines.length > 0) {
            rateMatchedLines.forEach(li => claimedLineItemIds.add(li.id));
            const liRevenue = rateMatchedLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0);
            const liTax = rateMatchedLines.reduce((s, li) => s + parseFloat(li.taxAmount || "0"), 0);
            const liHours = rateMatchedLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0);
            invoiceRevenue += liRevenue;
            invoiceRevenueInclGst += liRevenue + liTax;
            invoiceHours += liHours;
            if (!empInvoices.includes(inv)) empInvoices.push(inv);
            const allLinesClaimed = lineItems.every(li => claimedLineItemIds.has(li.id));
            if (allLinesClaimed) claimedInvoiceIds.add(inv.id);
          } else if (unclaimedLines.length > 0 && !claimedInvoiceIds.has(inv.id)) {
            if (matchesEmployee) {
              unclaimedLines.forEach(li => claimedLineItemIds.add(li.id));
              const liRevenue = unclaimedLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0);
              const liTax = unclaimedLines.reduce((s, li) => s + parseFloat(li.taxAmount || "0"), 0);
              const liHours = unclaimedLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0);
              invoiceRevenue += liRevenue;
              invoiceRevenueInclGst += liRevenue + liTax;
              invoiceHours += liHours;
              if (!empInvoices.includes(inv)) empInvoices.push(inv);
              const allLinesClaimed = lineItems.every(li => claimedLineItemIds.has(li.id));
              if (allLinesClaimed) claimedInvoiceIds.add(inv.id);
            } else if (matchesClientOnly) {
              const invRate = inv.hours && parseFloat(inv.hours) > 0
                ? parseFloat(inv.amountExclGst || "0") / parseFloat(inv.hours)
                : 0;
              if (Math.abs(invRate - chargeOutRate) >= 0.01) continue;
            }
          } else if (!claimedInvoiceIds.has(inv.id) && lineItems.length === 0) {
            if (matchesClientOnly) {
              const invRate = inv.hours && parseFloat(inv.hours) > 0
                ? parseFloat(inv.amountExclGst || "0") / parseFloat(inv.hours)
                : 0;
              if (Math.abs(invRate - chargeOutRate) >= 0.01) continue;
            }
            claimedInvoiceIds.add(inv.id);
            invoiceRevenue += parseFloat(inv.amountExclGst || "0");
            invoiceRevenueInclGst += parseFloat(inv.amountInclGst || "0");
            invoiceHours += parseFloat(inv.hours || "0");
            empInvoices.push(inv);
          }
        }

        const empRctis = periodRctis.filter(r => r.employeeId === employee.id && r.clientId === placement.clientId);
        const rctiRevenue = empRctis.reduce((sum, r) => sum + parseFloat(r.amountExclGst || "0"), 0);
        const rctiRevenueInclGst = empRctis.reduce((sum, r) => sum + parseFloat(r.amountInclGst || "0"), 0);
        const rctiHours = empRctis.reduce((sum, r) => sum + parseFloat(r.hours || "0"), 0);

        const revenue = invoiceRevenue + rctiRevenue;
        const revenueInclGst = invoiceRevenueInclGst + rctiRevenueInclGst;

        const invoicedHours = invoiceHours + rctiHours;

        const empTimesheets = allTimesheets.filter(t => {
          if (t.employeeId !== employee.id || t.month !== month || t.year !== year) return false;
          if (t.placementId) return t.placementId === placement.id;
          if (t.clientId && placement.clientId) return t.clientId === placement.clientId;
          return true;
        });
        const timesheetHours = empTimesheets.reduce((sum, t) => sum + parseFloat(t.totalHours || "0"), 0);

        const empExpected = allExpectedHours.filter(e => e.employeeId === employee.id);
        const estimatedHours = empExpected.reduce((sum, e) => sum + parseFloat(e.expectedHours || "0"), 0);

        let hoursSource: "INVOICED" | "TIMESHEET" | "ESTIMATED" = "ESTIMATED";
        let bestAvailableHours = estimatedHours;
        if (invoicedHours > 0) {
          hoursSource = "INVOICED";
          bestAvailableHours = invoicedHours;
        } else if (timesheetHours > 0) {
          hoursSource = "TIMESHEET";
          bestAvailableHours = timesheetHours;
        }

        const utilisation = estimatedHours > 0 ? Math.round((bestAvailableHours / estimatedHours) * 1000) / 10 : 0;

        const costAlreadyClaimed = claimedEmployeeCostIds.has(employee.id);

        const empPayLines = costAlreadyClaimed ? [] : allPayRunLines.filter(pl => pl.line.employeeId === employee.id);

        const rawGrossEarnings = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.grossEarnings || "0"), 0);
        const superAmount = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.superAmount || "0"), 0);
        const netPay = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.netPay || "0"), 0);
        const paygWithheld = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.paygWithheld || "0"), 0);
        const usedFallbackGross = rawGrossEarnings === 0 && (netPay > 0 || paygWithheld > 0);
        const grossEarnings = usedFallbackGross
          ? (paygWithheld > 0 ? netPay + paygWithheld : netPay)
          : rawGrossEarnings;

        let totalEmployeeCost = grossEarnings + superAmount;
        let costSource: "PAYROLL" | "CONTRACTOR_SPEND" | "ESTIMATED" | "SHARED" = costAlreadyClaimed ? "SHARED" : "PAYROLL";
        let contractorSpend = 0;
        let contractorSpendTxnCount = 0;
        let matchedSpendTxns: typeof periodBankTxns = [];
        let accpayInvs: ReturnType<typeof getContractorAccpayInvoices> = [];

        if (!costAlreadyClaimed && employee.paymentMethod === "INVOICE" && (employee.supplierContactId || employee.companyName)) {
          matchedSpendTxns = employee.supplierContactId
            ? periodBankTxns.filter(t =>
                !claimedBankTxnIds.has(t.id) &&
                t.type === "SPEND" &&
                t.xeroContactId && t.xeroContactId === employee.supplierContactId
              )
            : periodBankTxns.filter(t =>
                !claimedBankTxnIds.has(t.id) &&
                t.type === "SPEND" &&
                t.contactName &&
                normalizeCompanyName(t.contactName) === normalizeCompanyName(employee.companyName!)
              );
          matchedSpendTxns.forEach(t => claimedBankTxnIds.add(t.id));
          accpayInvs = getContractorAccpayInvoices(allInvoices as any, employee, month, year);
          contractorSpend = matchedSpendTxns.reduce((sum, t) => sum + computeExGstFromSpend(Math.abs(parseFloat(t.amount)), accpayInvs), 0);
          contractorSpendTxnCount = matchedSpendTxns.length;
          if (contractorSpend > 0) {
            totalEmployeeCost = contractorSpend;
            costSource = "CONTRACTOR_SPEND";
          }
        }

        let estimatedGrossEarnings = 0;
        let estimatedSuperAmount = 0;
        if (!costAlreadyClaimed && totalEmployeeCost === 0 && costSource !== "CONTRACTOR_SPEND") {
          const periodDate = new Date(year, month - 1, 15);
          const superRateDecimal = getSuperRate(periodDate) / 100;
          const placementPayRate = parseFloat(placement.payRate || "0") || payRate;
          if (placementPayRate > 0 && bestAvailableHours > 0) {
            const rateIsSuperInclusive = payRateSource === "PLACEMENT" || payRateSource === "EMPLOYEE_DEFAULT";
            if (rateIsSuperInclusive) {
              estimatedGrossEarnings = (placementPayRate / (1 + superRateDecimal)) * bestAvailableHours;
              estimatedSuperAmount = estimatedGrossEarnings * superRateDecimal;
              totalEmployeeCost = estimatedGrossEarnings + estimatedSuperAmount;
            } else {
              estimatedGrossEarnings = placementPayRate * bestAvailableHours;
              estimatedSuperAmount = estimatedGrossEarnings * superRateDecimal;
              totalEmployeeCost = estimatedGrossEarnings + estimatedSuperAmount;
            }
            costSource = "ESTIMATED";
          }
        }

        if (!costAlreadyClaimed && (totalEmployeeCost > 0 || costSource === "CONTRACTOR_SPEND")) {
          claimedEmployeeCostIds.add(employee.id);
        }

        const effectiveGrossEarnings = costSource === "ESTIMATED" ? estimatedGrossEarnings : grossEarnings;
        const effectiveSuperAmount = costSource === "ESTIMATED" ? estimatedSuperAmount : superAmount;

        const feePercent = parseFloat(placement.payrollFeePercent || employee.payrollFeePercent || "0");
        const payrollFeeRevenue = effectiveGrossEarnings * (feePercent / 100);

        let payrollTaxRate = 0;
        let payrollTaxAmount = 0;
        if (employee.payrollTaxApplicable && employee.state && ptRatesByState[employee.state] !== undefined) {
          payrollTaxRate = ptRatesByState[employee.state];
          const taxableBase = costSource === "CONTRACTOR_SPEND" ? contractorSpend : effectiveGrossEarnings;
          payrollTaxAmount = taxableBase * (payrollTaxRate / 100);
        }

        const costExPayrollTax = totalEmployeeCost;
        const costIncPayrollTax = totalEmployeeCost + payrollTaxAmount;

        const profitExPayrollTax = revenue - costExPayrollTax;
        const profitIncPayrollTax = revenue - costIncPayrollTax;
        const marginExPT = revenue > 0 ? (profitExPayrollTax / revenue) * 100 : 0;
        const marginIncPT = revenue > 0 ? (profitIncPayrollTax / revenue) * 100 : 0;

        const clientBankTxns = periodBankTxns.filter(t =>
          !claimedBankTxnIds.has(t.id) &&
          t.type === "RECEIVE" && (
            t.contactName === clientName ||
            (client?.xeroContactId && t.xeroContactId === client.xeroContactId)
          )
        );
        clientBankTxns.forEach(t => claimedBankTxnIds.add(t.id));
        const cashReceived = clientBankTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        return {
          placementId: placement.id,
          placementStatus: placement.status,
          placementEndDate: placement.endDate || null,
          chargeOutRate: Math.round(chargeOutRate * 100) / 100,
          payRate: Math.round(payRate * 100) / 100,
          rateSpread: Math.round(rateSpread * 100) / 100,
          payRateSource,
          chargeOutRateSource,
          expectedHours: Math.round(estimatedHours * 10) / 10,
          utilisation,
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            chargeOutRate: employee.chargeOutRate,
            hourlyRate: employee.hourlyRate,
            payrollFeePercent: placement.payrollFeePercent || employee.payrollFeePercent,
            paymentMethod: employee.paymentMethod,
            companyName: employee.companyName,
          },
          client: {
            id: client?.id || null,
            name: clientName,
          },
          revenue: {
            invoiceCount: empInvoices.length,
            rctiCount: empRctis.length,
            hours: invoiceHours + rctiHours,
            invoicedHours: Math.round(invoicedHours * 10) / 10,
            timesheetHours: Math.round(timesheetHours * 10) / 10,
            estimatedHours: Math.round(estimatedHours * 10) / 10,
            bestAvailableHours: Math.round(bestAvailableHours * 10) / 10,
            hoursSource,
            amountExGst: Math.round(revenue * 100) / 100,
            amountInclGst: Math.round(revenueInclGst * 100) / 100,
            rctiAmountExGst: Math.round(rctiRevenue * 100) / 100,
            invoices: empInvoices.map(inv => {
              const invLines = (lineItemsByInvoice[inv.id] || []).filter(li => claimedLineItemIds.has(li.id));
              const matchedLines = invLines.filter(li => Math.abs(parseFloat(li.unitAmount || "0") - chargeOutRate) < 0.02);
              const hasLineItemMatch = matchedLines.length > 0;
              const attrRevenue = hasLineItemMatch
                ? matchedLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0)
                : parseFloat(inv.amountExclGst || "0");
              const attrTax = hasLineItemMatch
                ? matchedLines.reduce((s, li) => s + parseFloat(li.taxAmount || "0"), 0)
                : parseFloat(inv.gstAmount || "0");
              const attrHours = hasLineItemMatch
                ? matchedLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0)
                : (inv.hours ? parseFloat(inv.hours) : 0);
              const bankLinked = inv.status === "PAID" || allBankTxns.some(bt => bt.linkedInvoiceId === inv.id);
              return {
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                contactName: inv.contactName,
                hours: attrHours,
                amountExclGst: Math.round(attrRevenue * 100) / 100,
                amountInclGst: Math.round((attrRevenue + attrTax) * 100) / 100,
                issueDate: inv.issueDate,
                status: inv.status,
                invoiceType: (inv as any).invoiceType || null,
                bankLinked,
              };
            }),
            timesheets: empTimesheets.map(t => ({
              id: t.id,
              totalHours: parseFloat(t.totalHours || "0"),
              regularHours: parseFloat(t.regularHours || "0"),
              overtimeHours: parseFloat(t.overtimeHours || "0"),
              status: t.status,
              fileName: t.fileName || null,
              source: t.source || null,
              clientName: (() => {
                if (t.clientId) {
                  const tsClient = allClients.find(c => c.id === t.clientId);
                  return tsClient?.name || null;
                }
                return clientName;
              })(),
            })),
            rctis: empRctis.map(r => {
              const rctiClient = allClients.find(c => c.id === r.clientId);
              return {
                id: r.id,
                clientName: rctiClient?.name || clientName,
                hours: r.hours ? parseFloat(r.hours) : 0,
                amountExclGst: parseFloat(r.amountExclGst || "0"),
                amountInclGst: parseFloat(r.amountInclGst || "0"),
                month: r.month,
                year: r.year,
              };
            }),
          },
          cost: {
            grossEarnings: Math.round(effectiveGrossEarnings * 100) / 100,
            superAmount: Math.round(effectiveSuperAmount * 100) / 100,
            netPay: Math.round(netPay * 100) / 100,
            paygWithheld: Math.round(paygWithheld * 100) / 100,
            totalCost: Math.round(costExPayrollTax * 100) / 100,
            totalCostIncPT: Math.round(costIncPayrollTax * 100) / 100,
            payrollTaxRate,
            payrollTaxAmount: Math.round(payrollTaxAmount * 100) / 100,
            payrollTaxApplicable: employee.payrollTaxApplicable,
            costSource,
            contractorSpend: Math.round(contractorSpend * 100) / 100,
            contractorSpendTxnCount,
            payRunLines: empPayLines.map(pl => ({
              payRunId: pl.payRun.id,
              payDate: pl.payRun.payDate || null,
              grossEarnings: parseFloat(pl.line.grossEarnings || "0"),
              superAmount: parseFloat(pl.line.superAmount || "0"),
              netPay: parseFloat(pl.line.netPay || "0"),
              paygWithheld: parseFloat(pl.line.paygWithheld || "0"),
            })),
            contractorTxns: matchedSpendTxns.map(t => ({
              id: t.id,
              contactName: t.contactName,
              amount: Math.round(computeExGstFromSpend(Math.abs(parseFloat(t.amount)), accpayInvs) * 100) / 100,
              amountInclGst: Math.abs(parseFloat(t.amount)),
              date: t.date,
              description: t.description,
              bankAccountName: t.bankAccountName,
            })),
          },
          payrollFeeRevenue: Math.round(payrollFeeRevenue * 100) / 100,
          profitExPayrollTax: Math.round(profitExPayrollTax * 100) / 100,
          profitIncPayrollTax: Math.round(profitIncPayrollTax * 100) / 100,
          marginExPT: Math.round(marginExPT * 10) / 10,
          marginIncPT: Math.round(marginIncPT * 10) / 10,
          cashReceived: Math.round(cashReceived * 100) / 100,
          cashReceivedTxns: clientBankTxns.map(t => ({
            id: t.id,
            contactName: t.contactName,
            amount: parseFloat(t.amount),
            date: t.date,
            bankAccountName: t.bankAccountName,
            reference: t.reference,
            description: t.description,
          })),
          profit: Math.round(profitIncPayrollTax * 100) / 100,
          marginPercent: Math.round(marginIncPT * 10) / 10,
        };
      }).filter(Boolean);

      const placementEmployeeIds = new Set(relevantPlacements.map(p => p.employeeId));
      const employeesWithPayroll = new Map<string, typeof allPayRunLines>();
      for (const pl of allPayRunLines) {
        if (!placementEmployeeIds.has(pl.line.employeeId)) {
          if (!employeesWithPayroll.has(pl.line.employeeId)) {
            employeesWithPayroll.set(pl.line.employeeId, []);
          }
          employeesWithPayroll.get(pl.line.employeeId)!.push(pl);
        }
      }

      for (const [empId, empPayLines] of employeesWithPayroll) {
        const employee = allEmployees.find(e => e.id === empId);
        if (!employee) continue;
        if (employee.paymentMethod === "INVOICE") continue;

        const payrollRate = empPayLines.reduce((best, pl) => {
          const r = parseFloat(pl.line.ratePerHour || "0");
          return r > 0 ? r : best;
        }, 0);

        const effectiveRates2 = getEffectiveRate(rateIndex, employee.id, month, year, employee.hourlyRate, employee.chargeOutRate);
        let payRate: number;
        let payRateSource: "PLACEMENT" | "RATE_HISTORY" | "PAYROLL_DERIVED" | "EMPLOYEE_DEFAULT";
        if (effectiveRates2.payRate > 0 && rateIndex[employee.id]?.length > 0) {
          payRate = effectiveRates2.payRate;
          payRateSource = "RATE_HISTORY";
        } else if (payrollRate > 0) {
          payRate = payrollRate;
          payRateSource = "PAYROLL_DERIVED";
        } else if (parseFloat(employee.hourlyRate || "0") > 0) {
          payRate = parseFloat(employee.hourlyRate || "0");
          payRateSource = "EMPLOYEE_DEFAULT";
        } else {
          payRate = 0;
          payRateSource = "EMPLOYEE_DEFAULT";
        }

        const empFullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
        const empFirstLower = employee.firstName.toLowerCase();
        const empLastLower = employee.lastName.toLowerCase();

        const payRunPeriodStart = empPayLines.reduce((earliest: Date | null, pl) => {
          const d = pl.payRun.periodStart ? new Date(pl.payRun.periodStart) : null;
          return d && (!earliest || d < earliest) ? d : earliest;
        }, null);
        const payRunPeriodEnd = empPayLines.reduce((latest: Date | null, pl) => {
          const d = pl.payRun.periodEnd ? new Date(pl.payRun.periodEnd) : (pl.payRun.payDate ? new Date(pl.payRun.payDate) : null);
          return d && (!latest || d > latest) ? d : latest;
        }, null);

        const empInvoices = periodInvoices.filter(inv => {
          if (inv.status === "VOIDED" || inv.status === "DELETED") return false;
          const invType = (inv as any).invoiceType;
          if (invType && invType !== "ACCREC") return false;

          if (payRunPeriodStart && payRunPeriodEnd && inv.issueDate) {
            const invDate = new Date(inv.issueDate);
            const overlapStart = new Date(payRunPeriodStart);
            overlapStart.setDate(overlapStart.getDate() - 14);
            const overlapEnd = new Date(payRunPeriodEnd);
            overlapEnd.setDate(overlapEnd.getDate() + 14);
            if (invDate < overlapStart || invDate > overlapEnd) return false;
          }

          if (inv.employeeId === employee.id) return true;

          if (inv.contactName) {
            const cn = inv.contactName.toLowerCase();
            if (cn === empFullName) return true;
            const parts = cn.split(" ");
            if (parts.length >= 2 && parts[0] === empFirstLower && parts[parts.length - 1] === empLastLower) return true;
          }

          const invLineItems = lineItemsByInvoice[inv.id] || [];
          for (const li of invLineItems) {
            const desc = (li.description || "").toLowerCase();
            if (desc.includes(empFullName) || (desc.includes(empFirstLower) && desc.includes(empLastLower))) {
              return true;
            }
          }

          return false;
        });

        let invoiceChargeOutRate = 0;
        let invoiceRevenue = 0;
        let invoiceRevenueInclGst = 0;
        let invoiceHours = 0;
        let clientName = "Unknown";
        let clientId: string | null = null;
        let chargeOutRateSource: "PLACEMENT" | "RATE_HISTORY" | "INVOICE_DERIVED" | "EMPLOYEE_DEFAULT" = "EMPLOYEE_DEFAULT";
        const matchedInvoices: typeof periodInvoices = [];

        for (const inv of empInvoices) {
          if (claimedInvoiceIds.has(inv.id)) continue;

          const lineItems = lineItemsByInvoice[inv.id] || [];
          const unclaimedLines = lineItems.filter(li => !claimedLineItemIds.has(li.id));

          if (unclaimedLines.length > 0) {
            for (const li of unclaimedLines) {
              const liRate = parseFloat(li.unitAmount || "0");
              const liHours = parseFloat(li.quantity || "0");
              const liAmount = parseFloat(li.lineAmount || "0");
              const liTax = parseFloat(li.taxAmount || "0");
              if (liRate > 0 && invoiceChargeOutRate === 0) invoiceChargeOutRate = liRate;
              invoiceRevenue += liAmount;
              invoiceRevenueInclGst += liAmount + liTax;
              invoiceHours += liHours;
              claimedLineItemIds.add(li.id);
            }
            const allLinesClaimed = lineItems.every(li => claimedLineItemIds.has(li.id));
            if (allLinesClaimed) claimedInvoiceIds.add(inv.id);
          } else if (lineItems.length === 0) {
            claimedInvoiceIds.add(inv.id);
            invoiceRevenue += parseFloat(inv.amountExclGst || "0");
            invoiceRevenueInclGst += parseFloat(inv.amountInclGst || "0");
            invoiceHours += parseFloat(inv.hours || "0");
            if (parseFloat(inv.hourlyRate || "0") > 0 && invoiceChargeOutRate === 0) {
              invoiceChargeOutRate = parseFloat(inv.hourlyRate || "0");
            } else if (invoiceChargeOutRate === 0 && parseFloat(inv.hours || "0") > 0) {
              invoiceChargeOutRate = parseFloat(inv.amountExclGst || "0") / parseFloat(inv.hours || "1");
            }
          }

          if (inv.contactName && clientName === "Unknown") clientName = inv.contactName;
          if (inv.clientId && !clientId) clientId = inv.clientId;
          if (!matchedInvoices.includes(inv)) matchedInvoices.push(inv);
        }

        let chargeOutRate = 0;
        const rateHistoryChargeOut = rateIndex[employee.id]?.some(r => r.chargeOutRate && parseFloat(r.chargeOutRate) > 0)
          ? effectiveRates2.chargeOutRate : 0;
        if (rateHistoryChargeOut > 0) {
          chargeOutRate = rateHistoryChargeOut;
          chargeOutRateSource = "RATE_HISTORY";
        } else if (invoiceChargeOutRate > 0) {
          chargeOutRate = invoiceChargeOutRate;
          chargeOutRateSource = "INVOICE_DERIVED";
        } else if (parseFloat(employee.chargeOutRate || "0") > 0) {
          chargeOutRate = parseFloat(employee.chargeOutRate || "0");
          chargeOutRateSource = "EMPLOYEE_DEFAULT";
        }

        if (invoiceRevenue === 0 && chargeOutRate === 0 && payRate === 0) continue;

        const empRctis = periodRctis.filter(r => r.employeeId === employee.id);
        const rctiRevenue = empRctis.reduce((sum, r) => sum + parseFloat(r.amountExclGst || "0"), 0);
        const rctiRevenueInclGst = empRctis.reduce((sum, r) => sum + parseFloat(r.amountInclGst || "0"), 0);
        const rctiHours = empRctis.reduce((sum, r) => sum + parseFloat(r.hours || "0"), 0);

        const revenue = invoiceRevenue + rctiRevenue;
        const revenueInclGst = invoiceRevenueInclGst + rctiRevenueInclGst;
        const invoicedHours = invoiceHours + rctiHours;

        const empTimesheets = allTimesheets.filter(t => t.employeeId === employee.id && t.month === month && t.year === year);
        const timesheetHours = empTimesheets.reduce((sum, t) => sum + parseFloat(t.totalHours || "0"), 0);

        const empExpected = allExpectedHours.filter(e => e.employeeId === employee.id);
        const estimatedHours = empExpected.reduce((sum, e) => sum + parseFloat(e.expectedHours || "0"), 0);

        let hoursSource: "INVOICED" | "TIMESHEET" | "ESTIMATED" = "ESTIMATED";
        let bestAvailableHours = estimatedHours;
        if (invoicedHours > 0) {
          hoursSource = "INVOICED";
          bestAvailableHours = invoicedHours;
        } else if (timesheetHours > 0) {
          hoursSource = "TIMESHEET";
          bestAvailableHours = timesheetHours;
        }

        const utilisation = estimatedHours > 0 ? Math.round((bestAvailableHours / estimatedHours) * 1000) / 10 : 0;

        const costAlreadyClaimed = claimedEmployeeCostIds.has(employee.id);
        const payLines = costAlreadyClaimed ? [] : empPayLines;

        const rawGrossEarnings = payLines.reduce((sum, pl) => sum + parseFloat(pl.line.grossEarnings || "0"), 0);
        const superAmount = payLines.reduce((sum, pl) => sum + parseFloat(pl.line.superAmount || "0"), 0);
        const netPay = payLines.reduce((sum, pl) => sum + parseFloat(pl.line.netPay || "0"), 0);
        const paygWithheld = payLines.reduce((sum, pl) => sum + parseFloat(pl.line.paygWithheld || "0"), 0);
        const usedFallbackGross = rawGrossEarnings === 0 && (netPay > 0 || paygWithheld > 0);
        const grossEarnings = usedFallbackGross
          ? (paygWithheld > 0 ? netPay + paygWithheld : netPay)
          : rawGrossEarnings;

        let totalEmployeeCost = grossEarnings + superAmount;
        let costSource: "PAYROLL" | "CONTRACTOR_SPEND" | "ESTIMATED" | "SHARED" = costAlreadyClaimed ? "SHARED" : "PAYROLL";

        let estimatedGrossEarnings = 0;
        let estimatedSuperAmount = 0;
        if (!costAlreadyClaimed && totalEmployeeCost === 0) {
          const periodDate = new Date(year, month - 1, 15);
          const superRateDecimal = getSuperRate(periodDate) / 100;
          if (payRate > 0 && bestAvailableHours > 0) {
            const rateIsSuperInclusive = payRateSource === "PLACEMENT" || payRateSource === "EMPLOYEE_DEFAULT";
            if (rateIsSuperInclusive) {
              estimatedGrossEarnings = (payRate / (1 + superRateDecimal)) * bestAvailableHours;
              estimatedSuperAmount = estimatedGrossEarnings * superRateDecimal;
              totalEmployeeCost = estimatedGrossEarnings + estimatedSuperAmount;
            } else {
              estimatedGrossEarnings = payRate * bestAvailableHours;
              estimatedSuperAmount = estimatedGrossEarnings * superRateDecimal;
              totalEmployeeCost = estimatedGrossEarnings + estimatedSuperAmount;
            }
            costSource = "ESTIMATED";
          }
        }

        if (!costAlreadyClaimed && totalEmployeeCost > 0) {
          claimedEmployeeCostIds.add(employee.id);
        }

        const effectiveGrossEarnings = costSource === "ESTIMATED" ? estimatedGrossEarnings : grossEarnings;
        const effectiveSuperAmount = costSource === "ESTIMATED" ? estimatedSuperAmount : superAmount;

        const rateSpread = chargeOutRate - payRate;
        const feePercent = parseFloat(employee.payrollFeePercent || "0");
        const payrollFeeRevenue = effectiveGrossEarnings * (feePercent / 100);

        let payrollTaxRate = 0;
        let payrollTaxAmount = 0;
        if (employee.payrollTaxApplicable && employee.state && ptRatesByState[employee.state] !== undefined) {
          payrollTaxRate = ptRatesByState[employee.state];
          payrollTaxAmount = effectiveGrossEarnings * (payrollTaxRate / 100);
        }

        const costExPayrollTax = totalEmployeeCost;
        const costIncPayrollTax = totalEmployeeCost + payrollTaxAmount;
        const profitExPayrollTax = revenue - costExPayrollTax;
        const profitIncPayrollTax = revenue - costIncPayrollTax;
        const marginExPT = revenue > 0 ? (profitExPayrollTax / revenue) * 100 : 0;
        const marginIncPT = revenue > 0 ? (profitIncPayrollTax / revenue) * 100 : 0;

        const client = clientId ? allClients.find(c => c.id === clientId) : null;
        const clientBankTxns = periodBankTxns.filter(t =>
          !claimedBankTxnIds.has(t.id) &&
          t.type === "RECEIVE" && (
            t.contactName === clientName ||
            (client?.xeroContactId && t.xeroContactId === client.xeroContactId)
          )
        );
        clientBankTxns.forEach(t => claimedBankTxnIds.add(t.id));
        const cashReceived = clientBankTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        rows.push({
          placementId: null,
          placementStatus: null,
          placementEndDate: null,
          chargeOutRate: Math.round(chargeOutRate * 100) / 100,
          payRate: Math.round(payRate * 100) / 100,
          rateSpread: Math.round(rateSpread * 100) / 100,
          payRateSource,
          chargeOutRateSource,
          expectedHours: Math.round(estimatedHours * 10) / 10,
          utilisation,
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            chargeOutRate: employee.chargeOutRate,
            hourlyRate: employee.hourlyRate,
            payrollFeePercent: employee.payrollFeePercent,
            paymentMethod: employee.paymentMethod,
            companyName: employee.companyName,
          },
          client: {
            id: clientId,
            name: clientName,
          },
          revenue: {
            invoiceCount: matchedInvoices.length,
            rctiCount: empRctis.length,
            hours: invoiceHours + rctiHours,
            invoicedHours: Math.round(invoicedHours * 10) / 10,
            timesheetHours: Math.round(timesheetHours * 10) / 10,
            estimatedHours: Math.round(estimatedHours * 10) / 10,
            bestAvailableHours: Math.round(bestAvailableHours * 10) / 10,
            hoursSource,
            amountExGst: Math.round(revenue * 100) / 100,
            amountInclGst: Math.round(revenueInclGst * 100) / 100,
            rctiAmountExGst: Math.round(rctiRevenue * 100) / 100,
            invoices: matchedInvoices.map(inv => {
              const invLines = (lineItemsByInvoice[inv.id] || []).filter(li => claimedLineItemIds.has(li.id));
              const attrRevenue = invLines.length > 0
                ? invLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0)
                : parseFloat(inv.amountExclGst || "0");
              const attrTax = invLines.length > 0
                ? invLines.reduce((s, li) => s + parseFloat(li.taxAmount || "0"), 0)
                : parseFloat(inv.gstAmount || "0");
              const attrHours = invLines.length > 0
                ? invLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0)
                : (inv.hours ? parseFloat(inv.hours) : 0);
              const bankLinked = inv.status === "PAID" || allBankTxns.some(bt => bt.linkedInvoiceId === inv.id);
              return {
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                contactName: inv.contactName,
                hours: attrHours,
                amountExclGst: Math.round(attrRevenue * 100) / 100,
                amountInclGst: Math.round((attrRevenue + attrTax) * 100) / 100,
                issueDate: inv.issueDate,
                status: inv.status,
                invoiceType: (inv as any).invoiceType || null,
                bankLinked,
              };
            }),
            timesheets: empTimesheets.map(t => ({
              id: t.id,
              totalHours: parseFloat(t.totalHours || "0"),
              regularHours: parseFloat(t.regularHours || "0"),
              overtimeHours: parseFloat(t.overtimeHours || "0"),
              status: t.status,
              fileName: t.fileName || null,
              source: t.source || null,
              clientName: (() => {
                if (t.clientId) {
                  const tsClient = allClients.find(c => c.id === t.clientId);
                  return tsClient?.name || null;
                }
                return clientName;
              })(),
            })),
            rctis: empRctis.map(r => {
              const rctiClient = allClients.find(c => c.id === r.clientId);
              return {
                id: r.id,
                clientName: rctiClient?.name || clientName,
                hours: r.hours ? parseFloat(r.hours) : 0,
                amountExclGst: parseFloat(r.amountExclGst || "0"),
                amountInclGst: parseFloat(r.amountInclGst || "0"),
                month: r.month,
                year: r.year,
              };
            }),
          },
          cost: {
            grossEarnings: Math.round(effectiveGrossEarnings * 100) / 100,
            superAmount: Math.round(effectiveSuperAmount * 100) / 100,
            netPay: Math.round(netPay * 100) / 100,
            paygWithheld: Math.round(paygWithheld * 100) / 100,
            totalCost: Math.round(costExPayrollTax * 100) / 100,
            totalCostIncPT: Math.round(costIncPayrollTax * 100) / 100,
            payrollTaxRate,
            payrollTaxAmount: Math.round(payrollTaxAmount * 100) / 100,
            payrollTaxApplicable: employee.payrollTaxApplicable,
            costSource,
            contractorSpend: 0,
            contractorSpendTxnCount: 0,
            payRunLines: payLines.map(pl => ({
              payRunId: pl.payRun.id,
              payDate: pl.payRun.payDate || null,
              grossEarnings: parseFloat(pl.line.grossEarnings || "0"),
              superAmount: parseFloat(pl.line.superAmount || "0"),
              netPay: parseFloat(pl.line.netPay || "0"),
              paygWithheld: parseFloat(pl.line.paygWithheld || "0"),
            })),
            contractorTxns: [],
          },
          payrollFeeRevenue: Math.round(payrollFeeRevenue * 100) / 100,
          profitExPayrollTax: Math.round(profitExPayrollTax * 100) / 100,
          profitIncPayrollTax: Math.round(profitIncPayrollTax * 100) / 100,
          marginExPT: Math.round(marginExPT * 10) / 10,
          marginIncPT: Math.round(marginIncPT * 10) / 10,
          cashReceived: Math.round(cashReceived * 100) / 100,
          cashReceivedTxns: clientBankTxns.map(t => ({
            id: t.id,
            contactName: t.contactName,
            amount: parseFloat(t.amount),
            date: t.date,
            bankAccountName: t.bankAccountName,
            reference: t.reference,
            description: t.description,
          })),
          profit: Math.round(profitIncPayrollTax * 100) / 100,
          marginPercent: Math.round(marginIncPT * 10) / 10,
        });
      }

      const totals = {
        totalRevenue: rows.reduce((s, r: any) => s + r.revenue.amountExGst, 0),
        totalCost: rows.reduce((s, r: any) => s + r.cost.totalCost, 0),
        totalCostIncPT: rows.reduce((s, r: any) => s + r.cost.totalCostIncPT, 0),
        totalPayrollTax: rows.reduce((s, r: any) => s + r.cost.payrollTaxAmount, 0),
        totalProfitExPT: rows.reduce((s, r: any) => s + r.profitExPayrollTax, 0),
        totalProfitIncPT: rows.reduce((s, r: any) => s + r.profitIncPayrollTax, 0),
        totalProfit: rows.reduce((s, r: any) => s + r.profit, 0),
        totalCashReceived: rows.reduce((s, r: any) => s + r.cashReceived, 0),
        totalPayrollFees: rows.reduce((s, r: any) => s + r.payrollFeeRevenue, 0),
      };
      const avgMarginExPT = totals.totalRevenue > 0 ? (totals.totalProfitExPT / totals.totalRevenue) * 100 : 0;
      const avgMarginIncPT = totals.totalRevenue > 0 ? (totals.totalProfitIncPT / totals.totalRevenue) * 100 : 0;
      const avgMargin = avgMarginIncPT;

      const totalActualHours = rows.reduce((s, r: any) => s + r.revenue.bestAvailableHours, 0);
      const totalExpectedHours = rows.reduce((s, r: any) => s + r.expectedHours, 0);
      const avgUtilisation = totalExpectedHours > 0 ? Math.round((totalActualHours / totalExpectedHours) * 1000) / 10 : 0;

      res.json({
        rows,
        totals: {
          ...totals,
          avgMargin: Math.round(avgMargin * 10) / 10,
          avgMarginExPT: Math.round(avgMarginExPT * 10) / 10,
          avgMarginIncPT: Math.round(avgMarginIncPT * 10) / 10,
          avgUtilisation,
          totalActualHours: Math.round(totalActualHours * 10) / 10,
          totalExpectedHours: Math.round(totalExpectedHours * 10) / 10,
        },
        period: { month, year },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch profitability data" });
    }
  });

  app.get("/api/profitability/:employeeId/:year/:month", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      if (!employeeId || isNaN(month) || isNaN(year)) {
        return res.status(400).json({ message: "Invalid parameters" });
      }

      const [allEmployees, allPlacements, allInvoices, allPayRuns, allBankTxns, allClients, allRctis, allTimesheets, allExpectedHours, allPayrollTaxRates, allRateHistory] = await Promise.all([
        storage.getEmployees(),
        storage.getAllPlacements(),
        storage.getInvoices(),
        storage.getPayRuns(),
        storage.getBankTransactions(),
        storage.getClients(),
        storage.getRctis(),
        storage.getTimesheets(),
        storage.getMonthlyExpectedHours({ month, year }),
        storage.getPayrollTaxRates(),
        storage.getAllRateHistory(),
      ]);

      const rateIndex = buildRateHistoryIndex(allRateHistory);

      const employee = allEmployees.find(e => e.id === employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const financialYear = month >= 7 ? year : year - 1;
      const ptRatesByState: Record<string, number> = {};
      for (const ptr of allPayrollTaxRates) {
        if (ptr.financialYearStart === financialYear && !(ptr.state in ptRatesByState)) {
          ptRatesByState[ptr.state] = parseFloat(ptr.rate);
        }
      }

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      const empPlacements = allPlacements.filter(p => {
        if (p.employeeId !== employeeId) return false;
        if (p.startDate) {
          const start = new Date(p.startDate);
          if (start > periodEnd) return false;
        }
        if (p.endDate) {
          const end = new Date(p.endDate);
          if (end < periodStart) {
            if (p.status === "ACTIVE") return false;
            const graceEnd = new Date(end.getFullYear(), end.getMonth() + 2, 0);
            if (periodStart > graceEnd) return false;
          }
        }
        return p.status === "ACTIVE" || p.status === "ENDED";
      });

      const periodPayRuns = allPayRuns.filter(pr => pr.month === month && pr.year === year);
      const empPayRunLines: { line: any; payRun: typeof periodPayRuns[0] }[] = [];
      for (const pr of periodPayRuns) {
        const lines = await storage.getPayRunLines(pr.id);
        for (const line of lines) {
          if (line.employeeId === employeeId) {
            empPayRunLines.push({ line, payRun: pr });
          }
        }
      }

      const payslipLinesByPayRun: any[] = [];
      for (const pl of empPayRunLines) {
        const payslipLines = await storage.getPayslipLines(pl.line.id);
        payslipLinesByPayRun.push({
          payRunLineId: pl.line.id,
          payDate: pl.payRun.payDate,
          grossEarnings: parseFloat(pl.line.grossEarnings || "0"),
          superAmount: parseFloat(pl.line.superAmount || "0"),
          netPay: parseFloat(pl.line.netPay || "0"),
          paygWithheld: parseFloat(pl.line.paygWithheld || "0"),
          payslipLines: payslipLines.map(psl => ({
            id: psl.id,
            lineType: psl.lineType,
            name: psl.name,
            units: psl.units ? parseFloat(psl.units) : null,
            rate: psl.rate ? parseFloat(psl.rate) : null,
            amount: parseFloat(psl.amount),
            percentage: psl.percentage ? parseFloat(psl.percentage) : null,
          })),
        });
      }

      const periodInvoices = allInvoices.filter(i => i.month === month && i.year === year);
      const periodBankTxns = allBankTxns.filter(t => t.month === month && t.year === year);
      const periodRctis = allRctis.filter(r => r.month === month && r.year === year);
      const claimedInvoiceIds = new Set<string>();

      const detailLineItems = await storage.getInvoiceLineItemsByInvoiceIds(periodInvoices.map(i => i.id));
      const detailLineItemsByInvoice: Record<string, typeof detailLineItems> = {};
      for (const li of detailLineItems) {
        if (!detailLineItemsByInvoice[li.invoiceId]) detailLineItemsByInvoice[li.invoiceId] = [];
        detailLineItemsByInvoice[li.invoiceId].push(li);
      }
      const detailClaimedLineItemIds = new Set<string>();
      let costAlreadyAssigned = false;

      const effectiveRates = getEffectiveRate(rateIndex, employee.id, month, year, employee.hourlyRate, employee.chargeOutRate);
      const hasRateHistory = rateIndex[employee.id]?.length > 0;
      const fallbackPayRateSource: "RATE_HISTORY" | "EMPLOYEE_DEFAULT" =
        (effectiveRates.payRate > 0 && hasRateHistory) ? "RATE_HISTORY" : "EMPLOYEE_DEFAULT";

      const placementResults = empPlacements.map(placement => {
        const client = allClients.find(c => c.id === placement.clientId);
        const clientName = placement.clientName || client?.name || "Unknown";
        const chargeOutRate = parseFloat(placement.chargeOutRate || "0") || effectiveRates.chargeOutRate;
        const rawPlacementPayRate = parseFloat(placement.payRate || "0");
        const payRate = rawPlacementPayRate || effectiveRates.payRate;
        const placementPayRateSource = rawPlacementPayRate > 0 ? "PLACEMENT" as const : fallbackPayRateSource;

        let invoiceRevenue = 0;
        let invoiceHours = 0;
        const empInvoices: typeof periodInvoices = [];

        for (const inv of periodInvoices) {
          if (inv.status === "VOIDED" || inv.status === "DELETED") continue;
          const invType = (inv as any).invoiceType;
          if (invType && invType !== "ACCREC") continue;
          const matchesEmployee = inv.employeeId === employee.id && inv.contactName === clientName;
          const matchesClientOnly = !inv.employeeId && inv.contactName === clientName;
          if (!matchesEmployee && !matchesClientOnly) continue;

          const lineItems = detailLineItemsByInvoice[inv.id] || [];
          const unclaimedLines = lineItems.filter(li => !detailClaimedLineItemIds.has(li.id));
          const rateMatchedLines = unclaimedLines.filter(li => {
            const liRate = parseFloat(li.unitAmount || "0");
            return Math.abs(liRate - chargeOutRate) < 0.02;
          });

          if (rateMatchedLines.length > 0) {
            rateMatchedLines.forEach(li => detailClaimedLineItemIds.add(li.id));
            const liRevenue = rateMatchedLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0);
            const liHours = rateMatchedLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0);
            invoiceRevenue += liRevenue;
            invoiceHours += liHours;
            if (!empInvoices.includes(inv)) empInvoices.push(inv);
            const allLinesClaimed = lineItems.every(li => detailClaimedLineItemIds.has(li.id));
            if (allLinesClaimed) claimedInvoiceIds.add(inv.id);
          } else if (unclaimedLines.length > 0 && !claimedInvoiceIds.has(inv.id) && matchesEmployee) {
            unclaimedLines.forEach(li => detailClaimedLineItemIds.add(li.id));
            const liRevenue = unclaimedLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0);
            const liHours = unclaimedLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0);
            invoiceRevenue += liRevenue;
            invoiceHours += liHours;
            if (!empInvoices.includes(inv)) empInvoices.push(inv);
            const allLinesClaimed = lineItems.every(li => detailClaimedLineItemIds.has(li.id));
            if (allLinesClaimed) claimedInvoiceIds.add(inv.id);
          } else if (!claimedInvoiceIds.has(inv.id) && lineItems.length === 0) {
            if (matchesClientOnly) {
              const invRate = inv.hours && parseFloat(inv.hours) > 0
                ? parseFloat(inv.amountExclGst || "0") / parseFloat(inv.hours)
                : 0;
              if (Math.abs(invRate - chargeOutRate) >= 0.01) continue;
            }
            claimedInvoiceIds.add(inv.id);
            invoiceRevenue += parseFloat(inv.amountExclGst || "0");
            invoiceHours += parseFloat(inv.hours || "0");
            empInvoices.push(inv);
          }
        }

        const empRctis = periodRctis.filter(r => r.employeeId === employee.id && r.clientId === placement.clientId);
        const rctiRevenue = empRctis.reduce((sum, r) => sum + parseFloat(r.amountExclGst || "0"), 0);
        const rctiHours = empRctis.reduce((sum, r) => sum + parseFloat(r.hours || "0"), 0);

        return {
          placement: {
            id: placement.id,
            clientName,
            clientId: client?.id || null,
            chargeOutRate,
            payRate,
            status: placement.status,
            startDate: placement.startDate,
            endDate: placement.endDate,
          },
          invoices: empInvoices.map(inv => {
            const invLines = (detailLineItemsByInvoice[inv.id] || []).filter(li => detailClaimedLineItemIds.has(li.id));
            const matchedLines = invLines.filter(li => Math.abs(parseFloat(li.unitAmount || "0") - chargeOutRate) < 0.02);
            const hasLineItemMatch = matchedLines.length > 0;
            const attrRevenue = hasLineItemMatch
              ? matchedLines.reduce((s, li) => s + parseFloat(li.lineAmount || "0"), 0)
              : parseFloat(inv.amountExclGst || "0");
            const attrTax = hasLineItemMatch
              ? matchedLines.reduce((s, li) => s + parseFloat(li.taxAmount || "0"), 0)
              : parseFloat(inv.gstAmount || "0");
            const attrHours = hasLineItemMatch
              ? matchedLines.reduce((s, li) => s + parseFloat(li.quantity || "0"), 0)
              : (inv.hours ? parseFloat(inv.hours) : 0);
            return {
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              contactName: inv.contactName,
              hours: attrHours,
              amountExclGst: Math.round(attrRevenue * 100) / 100,
              amountInclGst: Math.round((attrRevenue + attrTax) * 100) / 100,
              issueDate: inv.issueDate,
              status: inv.status,
            };
          }),
          rctis: empRctis.map(r => ({
            id: r.id,
            clientName: client?.name || clientName,
            hours: r.hours ? parseFloat(r.hours) : 0,
            amountExclGst: parseFloat(r.amountExclGst || "0"),
            amountInclGst: parseFloat(r.amountInclGst || "0"),
          })),
          invoiceRevenue,
          rctiRevenue,
          totalRevenue: invoiceRevenue + rctiRevenue,
          invoiceHours,
          rctiHours,
          totalHours: invoiceHours + rctiHours,
        };
      });

      const totalRevenue = placementResults.reduce((s, p) => s + p.totalRevenue, 0);
      const totalInvoicedHours = placementResults.reduce((s, p) => s + p.totalHours, 0);

      const empTimesheets = allTimesheets.filter(t => t.employeeId === employeeId && t.month === month && t.year === year);
      const timesheetHours = empTimesheets.reduce((sum, t) => sum + parseFloat(t.totalHours || "0"), 0);
      const empExpected = allExpectedHours.filter(e => e.employeeId === employeeId);
      const estimatedHours = empExpected.reduce((sum, e) => sum + parseFloat(e.expectedHours || "0"), 0);

      let hoursSource: "INVOICED" | "TIMESHEET" | "ESTIMATED" = "ESTIMATED";
      let bestAvailableHours = estimatedHours;
      if (totalInvoicedHours > 0) {
        hoursSource = "INVOICED";
        bestAvailableHours = totalInvoicedHours;
      } else if (timesheetHours > 0) {
        hoursSource = "TIMESHEET";
        bestAvailableHours = timesheetHours;
      }
      const utilisation = estimatedHours > 0 ? Math.round((bestAvailableHours / estimatedHours) * 1000) / 10 : 0;

      const rawGrossEarnings = empPayRunLines.reduce((sum, pl) => sum + parseFloat(pl.line.grossEarnings || "0"), 0);
      const superAmount = empPayRunLines.reduce((sum, pl) => sum + parseFloat(pl.line.superAmount || "0"), 0);
      const netPay = empPayRunLines.reduce((sum, pl) => sum + parseFloat(pl.line.netPay || "0"), 0);
      const paygWithheld = empPayRunLines.reduce((sum, pl) => sum + parseFloat(pl.line.paygWithheld || "0"), 0);
      const usedFallbackGross = rawGrossEarnings === 0 && (netPay > 0 || paygWithheld > 0);
      const grossEarnings = usedFallbackGross
        ? (paygWithheld > 0 ? netPay + paygWithheld : netPay)
        : rawGrossEarnings;

      let totalEmployeeCost = grossEarnings + superAmount;
      let costSource: "PAYROLL" | "CONTRACTOR_SPEND" | "ESTIMATED" = "PAYROLL";
      let contractorSpend = 0;
      let matchedSpendTxns: typeof periodBankTxns = [];
      let accpayInvs: ReturnType<typeof getContractorAccpayInvoices> = [];

      if (employee.paymentMethod === "INVOICE" && (employee.supplierContactId || employee.companyName)) {
        matchedSpendTxns = employee.supplierContactId
          ? periodBankTxns.filter(t => t.type === "SPEND" && t.xeroContactId && t.xeroContactId === employee.supplierContactId)
          : periodBankTxns.filter(t => t.type === "SPEND" && t.contactName && normalizeCompanyName(t.contactName) === normalizeCompanyName(employee.companyName!));
        accpayInvs = getContractorAccpayInvoices(allInvoices as any, employee, month, year);
        contractorSpend = matchedSpendTxns.reduce((sum, t) => sum + computeExGstFromSpend(Math.abs(parseFloat(t.amount)), accpayInvs), 0);
        if (contractorSpend > 0) {
          totalEmployeeCost = contractorSpend;
          costSource = "CONTRACTOR_SPEND";
        }
      }

      let estimatedGrossEarnings = 0;
      let estimatedSuperAmount = 0;
      if (totalEmployeeCost === 0 && costSource !== "CONTRACTOR_SPEND") {
        const periodDate = new Date(year, month - 1, 15);
        const superRate = getSuperRate(periodDate) / 100;
        for (const pr of placementResults) {
          const placementPayRate = parseFloat(pr.placement.payRate || "0") || effectiveRates.payRate;
          const source = parseFloat(pr.placement.payRate || "0") > 0 ? "PLACEMENT" : fallbackPayRateSource;
          const rateIsSuperInclusive = source === "PLACEMENT" || source === "EMPLOYEE_DEFAULT";
          if (placementPayRate > 0 && pr.totalHours > 0) {
            if (rateIsSuperInclusive) {
              const ge = (placementPayRate / (1 + superRate)) * pr.totalHours;
              const sa = ge * superRate;
              estimatedGrossEarnings += ge;
              estimatedSuperAmount += sa;
            } else {
              const ge = placementPayRate * pr.totalHours;
              const sa = ge * superRate;
              estimatedGrossEarnings += ge;
              estimatedSuperAmount += sa;
            }
          }
        }
        if (estimatedGrossEarnings === 0 && bestAvailableHours > 0 && effectiveRates.payRate > 0) {
          const rateIsSuperInclusive = fallbackPayRateSource === "EMPLOYEE_DEFAULT";
          if (rateIsSuperInclusive) {
            estimatedGrossEarnings = (effectiveRates.payRate / (1 + superRate)) * bestAvailableHours;
            estimatedSuperAmount = estimatedGrossEarnings * superRate;
          } else {
            estimatedGrossEarnings = effectiveRates.payRate * bestAvailableHours;
            estimatedSuperAmount = estimatedGrossEarnings * superRate;
          }
        }
        if (estimatedGrossEarnings > 0) {
          totalEmployeeCost = estimatedGrossEarnings + estimatedSuperAmount;
          costSource = "ESTIMATED";
        }
      }

      const effectiveGrossEarnings = costSource === "ESTIMATED" ? estimatedGrossEarnings : grossEarnings;
      const effectiveSuperAmount = costSource === "ESTIMATED" ? estimatedSuperAmount : superAmount;

      const bestPlacementFee = empPlacements.find(p => parseFloat(p.payrollFeePercent || "0") > 0)?.payrollFeePercent;
      const feePercent = parseFloat(bestPlacementFee || employee.payrollFeePercent || "0");
      const payrollFeeAmount = effectiveGrossEarnings * (feePercent / 100);

      let payrollTaxRate = 0;
      let payrollTaxAmount = 0;
      if (employee.payrollTaxApplicable && employee.state && ptRatesByState[employee.state] !== undefined) {
        payrollTaxRate = ptRatesByState[employee.state];
        const taxableBase = costSource === "CONTRACTOR_SPEND" ? contractorSpend : effectiveGrossEarnings;
        payrollTaxAmount = taxableBase * (payrollTaxRate / 100);
      }

      const costExPayrollTax = totalEmployeeCost;
      const costIncPayrollTax = totalEmployeeCost + payrollTaxAmount;
      const profitExPayrollTax = totalRevenue - costExPayrollTax;
      const profitIncPayrollTax = totalRevenue - costIncPayrollTax;
      const marginExPT = totalRevenue > 0 ? (profitExPayrollTax / totalRevenue) * 100 : 0;
      const marginIncPT = totalRevenue > 0 ? (profitIncPayrollTax / totalRevenue) * 100 : 0;

      const primaryPlacement = empPlacements[0];
      const primaryClient = primaryPlacement ? allClients.find(c => c.id === primaryPlacement.clientId) : null;
      const chargeOutRate = primaryPlacement ? (parseFloat(primaryPlacement.chargeOutRate || "0") || effectiveRates.chargeOutRate) : effectiveRates.chargeOutRate;
      const payRate = effectiveRates.payRate;

      res.json({
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          paymentMethod: employee.paymentMethod,
          companyName: employee.companyName,
          state: employee.state,
          hourlyRate: employee.hourlyRate,
          chargeOutRate: employee.chargeOutRate,
          payrollFeePercent: bestPlacementFee || employee.payrollFeePercent,
          payrollTaxApplicable: employee.payrollTaxApplicable,
          employmentType: employee.employmentType,
        },
        period: { month, year, financialYear },
        placements: placementResults,
        hours: {
          invoicedHours: Math.round(totalInvoicedHours * 10) / 10,
          timesheetHours: Math.round(timesheetHours * 10) / 10,
          estimatedHours: Math.round(estimatedHours * 10) / 10,
          bestAvailableHours: Math.round(bestAvailableHours * 10) / 10,
          hoursSource,
          utilisation,
        },
        rateEconomics: {
          chargeOutRate: Math.round(chargeOutRate * 100) / 100,
          payRate: Math.round(payRate * 100) / 100,
          spread: Math.round((chargeOutRate - payRate) * 100) / 100,
          marginPerHour: bestAvailableHours > 0 ? Math.round((profitIncPayrollTax / bestAvailableHours) * 100) / 100 : 0,
        },
        revenue: {
          total: Math.round(totalRevenue * 100) / 100,
          byPlacement: placementResults.map(p => ({
            placementId: p.placement.id,
            clientName: p.placement.clientName,
            invoiceRevenue: Math.round(p.invoiceRevenue * 100) / 100,
            rctiRevenue: Math.round(p.rctiRevenue * 100) / 100,
            total: Math.round(p.totalRevenue * 100) / 100,
            hours: Math.round(p.totalHours * 10) / 10,
          })),
        },
        cost: {
          costSource,
          grossEarnings: Math.round(effectiveGrossEarnings * 100) / 100,
          superAmount: Math.round(effectiveSuperAmount * 100) / 100,
          netPay: Math.round(netPay * 100) / 100,
          paygWithheld: Math.round(paygWithheld * 100) / 100,
          contractorSpend: Math.round(contractorSpend * 100) / 100,
          contractorTxns: matchedSpendTxns.map(t => ({
            id: t.id,
            contactName: t.contactName,
            amount: Math.round(computeExGstFromSpend(Math.abs(parseFloat(t.amount)), accpayInvs) * 100) / 100,
            amountInclGst: Math.abs(parseFloat(t.amount)),
            date: t.date,
            description: t.description,
          })),
          payrollFeePercent: feePercent,
          payrollFeeAmount: Math.round(payrollFeeAmount * 100) / 100,
          payrollTaxApplicable: employee.payrollTaxApplicable,
          payrollTaxRate,
          payrollTaxAmount: Math.round(payrollTaxAmount * 100) / 100,
          totalCostExPT: Math.round(costExPayrollTax * 100) / 100,
          totalCostIncPT: Math.round(costIncPayrollTax * 100) / 100,
          payRunDetails: payslipLinesByPayRun,
        },
        profit: {
          profitExPayrollTax: Math.round(profitExPayrollTax * 100) / 100,
          profitIncPayrollTax: Math.round(profitIncPayrollTax * 100) / 100,
          marginExPT: Math.round(marginExPT * 10) / 10,
          marginIncPT: Math.round(marginIncPT * 10) / 10,
        },
        allInvoices: placementResults.flatMap(p => p.invoices),
        allRctis: placementResults.flatMap(p => p.rctis),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch profitability detail" });
    }
  });

  app.get("/api/client-ledger", async (req, res) => {
    try {
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const from = req.query.from ? new Date(req.query.from as string) : defaultFrom;
      const to = req.query.to ? new Date(req.query.to as string) : now;

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ message: "Invalid date range. Use YYYY-MM-DD format." });
      }

      const [allPlacements, allEmployees, allBankTxns, allPayRuns, allClients, allInvoices, allRctis, allTimesheets, allExpectedHours] = await Promise.all([
        storage.getAllPlacements(),
        storage.getEmployees(),
        storage.getBankTransactions(),
        storage.getPayRuns(),
        storage.getClients(),
        storage.getInvoices(),
        storage.getRctis(),
        storage.getTimesheets(),
        storage.getMonthlyExpectedHours(),
      ]);

      const receiptTxns = allBankTxns.filter(t => {
        if (t.type !== "RECEIVE") return false;
        const d = new Date(t.date);
        return d >= from && d <= to;
      });

      const rangePayRuns = allPayRuns.filter(pr => {
        if (!pr.periodStart || !pr.periodEnd) return false;
        const pStart = new Date(pr.periodStart);
        const pEnd = new Date(pr.periodEnd);
        return pEnd >= from && pStart <= to;
      });
      const allPayRunLines: { line: any; payRun: typeof rangePayRuns[0] }[] = [];
      for (const pr of rangePayRuns) {
        const lines = await storage.getPayRunLines(pr.id);
        for (const line of lines) {
          allPayRunLines.push({ line, payRun: pr });
        }
      }

      const activePlacements = allPlacements.filter(p => {
        if (p.status !== "ACTIVE" && p.status !== "ENDED") return false;
        const pStart = p.startDate ? new Date(p.startDate) : new Date("2000-01-01");
        const pEnd = p.endDate ? new Date(p.endDate) : new Date("2099-12-31");
        return pEnd >= from && pStart <= to;
      });

      const employeeToClient = new Map<string, string>();
      for (const p of activePlacements) {
        if (p.clientId) employeeToClient.set(p.employeeId, p.clientId);
      }

      const fromMonth = from.getMonth() + 1;
      const fromYear = from.getFullYear();
      const toMonth = to.getMonth() + 1;
      const toYear = to.getFullYear();

      const isMonthInRange = (m: number, y: number): boolean => {
        const v = y * 12 + m;
        return v >= fromYear * 12 + fromMonth && v <= toYear * 12 + toMonth;
      };

      const getThreeTierHours = (employeeId: string, clientId: string | null, isRctiClient: boolean, placementId?: string) => {
        let invoicedHours = 0;
        let timesheetHours = 0;
        let estimatedHours = 0;

        if (isRctiClient) {
          const empRctis = allRctis.filter(r =>
            r.employeeId === employeeId &&
            r.clientId === clientId &&
            isMonthInRange(r.month, r.year)
          );
          invoicedHours = empRctis.reduce((s, r) => s + parseFloat(r.hours || "0"), 0);
        } else {
          const empInvoices = allInvoices.filter(inv =>
            (inv.employeeId === employeeId || (inv.clientId && inv.clientId === clientId)) &&
            isMonthInRange(inv.month, inv.year) &&
            inv.status !== "VOIDED"
          );
          const directInvoices = empInvoices.filter(inv => inv.employeeId === employeeId);
          invoicedHours = directInvoices.reduce((s, inv) => s + parseFloat(inv.hours || "0"), 0);
        }

        const empTimesheets = allTimesheets.filter(ts => {
          if (ts.employeeId !== employeeId || !isMonthInRange(ts.month, ts.year)) return false;
          if (ts.placementId && placementId) return ts.placementId === placementId;
          return true;
        });
        timesheetHours = empTimesheets.reduce((s, ts) => s + parseFloat(ts.totalHours || "0"), 0);

        const empExpected = allExpectedHours.filter(eh =>
          eh.employeeId === employeeId &&
          isMonthInRange(eh.month, eh.year)
        );
        estimatedHours = empExpected.reduce((s, eh) => s + parseFloat(eh.expectedHours || "0"), 0);

        let hours = 0;
        let source: "INVOICED" | "RCTI" | "TIMESHEET" | "ESTIMATED" = "ESTIMATED";
        if (invoicedHours > 0) {
          hours = invoicedHours;
          source = isRctiClient ? "RCTI" : "INVOICED";
        } else if (timesheetHours > 0) {
          hours = timesheetHours;
          source = "TIMESHEET";
        } else if (estimatedHours > 0) {
          hours = estimatedHours;
          source = "ESTIMATED";
        }

        return { hours, source, invoicedHours, timesheetHours, estimatedHours };
      };

      const clientMap = new Map<string, {
        clientId: string;
        clientName: string;
        hasPlacement: boolean;
        isRcti: boolean;
        employees: { id: string; firstName: string; lastName: string; chargeOutRate: string | null; placementChargeOutRate: string | null; placementId: string }[];
        payments: { date: string; amount: number; reference: string | null; bankAccount: string | null }[];
        payrollEntries: { employeeName: string; periodStart: string; periodEnd: string; gross: number; super_: number; net: number }[];
        totalPaid: number;
        totalCost: number;
      }>();

      for (const placement of activePlacements) {
        const client = allClients.find(c => c.id === placement.clientId);
        if (!client) continue;
        const employee = allEmployees.find(e => e.id === placement.employeeId);
        if (!employee) continue;

        const key = client.id;
        if (!clientMap.has(key)) {
          clientMap.set(key, {
            clientId: client.id,
            clientName: client.name,
            hasPlacement: true,
            isRcti: client.isRcti,
            employees: [],
            payments: [],
            payrollEntries: [],
            totalPaid: 0,
            totalCost: 0,
          });
        }
        const entry = clientMap.get(key)!;
        if (!entry.employees.find(e => e.id === employee.id && e.placementId === placement.id)) {
          entry.employees.push({
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            chargeOutRate: employee.chargeOutRate,
            placementChargeOutRate: placement.chargeOutRate,
            placementId: placement.id,
          });
        }
      }

      const usedTxnIds = new Set<string>();
      for (const entry of Array.from(clientMap.values())) {
        const client = allClients.find(c => c.id === entry.clientId);
        const clientTxns = receiptTxns.filter(t =>
          t.contactName === entry.clientName ||
          (client?.xeroContactId && t.xeroContactId === client.xeroContactId)
        );
        entry.payments = clientTxns.map(t => ({
          date: t.date,
          amount: parseFloat(t.amount),
          reference: t.reference,
          bankAccount: t.bankAccountName,
        }));
        entry.totalPaid = entry.payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
        clientTxns.forEach(t => usedTxnIds.add(t.id));

        const assignedLineIds = new Set<string>();
        for (const emp of entry.employees) {
          const empClientId = employeeToClient.get(emp.id);
          if (empClientId !== entry.clientId) continue;
          const empLines = allPayRunLines.filter(pl =>
            pl.line.employeeId === emp.id && !assignedLineIds.has(`${pl.payRun.id}-${pl.line.employeeId}`)
          );
          for (const { line, payRun } of empLines) {
            const lineKey = `${payRun.id}-${line.employeeId}`;
            assignedLineIds.add(lineKey);
            const gross = parseFloat(line.grossEarnings || "0");
            const super_ = parseFloat(line.superAmount || "0");
            const net = parseFloat(line.netPay || "0");
            entry.payrollEntries.push({
              employeeName: `${emp.firstName} ${emp.lastName}`,
              periodStart: payRun.periodStart || "",
              periodEnd: payRun.periodEnd || "",
              gross,
              super_,
              net,
            });
            entry.totalCost += gross + super_;
          }
        }
      }

      const unmatchedTxns = receiptTxns.filter(t => !usedTxnIds.has(t.id));
      const unmatchedByContact = new Map<string, typeof unmatchedTxns>();
      for (const t of unmatchedTxns) {
        const key = t.contactName || "Unknown";
        if (!unmatchedByContact.has(key)) unmatchedByContact.set(key, []);
        unmatchedByContact.get(key)!.push(t);
      }

      const unmatchedClients = Array.from(unmatchedByContact.entries())
        .map(([name, txns]) => ({
          clientName: name,
          hasPlacement: false,
          payments: txns.map(t => ({
            date: t.date,
            amount: parseFloat(t.amount),
            reference: t.reference,
            bankAccount: t.bankAccountName,
          })),
          totalPaid: txns.reduce((s, t) => s + parseFloat(t.amount), 0),
        }))
        .filter(c => c.totalPaid > 0)
        .sort((a, b) => b.totalPaid - a.totalPaid);

      const matchedClients = Array.from(clientMap.values())
        .map(entry => {
          let totalEstimatedRevenue = 0;
          const employeesWithRevenue = entry.employees.map(e => {
            const rate = parseFloat(e.placementChargeOutRate || e.chargeOutRate || "0");
            const tierData = getThreeTierHours(e.id, entry.clientId, entry.isRcti, e.placementId);
            const estimatedRevenue = Math.round(tierData.hours * rate * 100) / 100;
            totalEstimatedRevenue += estimatedRevenue;
            return {
              name: `${e.firstName} ${e.lastName}`,
              chargeOutRate: e.chargeOutRate,
              placementChargeOutRate: e.placementChargeOutRate,
              estimatedRevenue,
              hoursSource: tierData.source,
              hours: tierData.hours,
              invoicedHours: tierData.invoicedHours,
              timesheetHours: tierData.timesheetHours,
              estimatedHours: tierData.estimatedHours,
            };
          });
          return {
            clientId: entry.clientId,
            clientName: entry.clientName,
            hasPlacement: true,
            isRcti: entry.isRcti,
            employeeCount: entry.employees.length,
            employees: employeesWithRevenue,
            paymentCount: entry.payments.length,
            totalPaid: Math.round(entry.totalPaid * 100) / 100,
            totalCost: Math.round(entry.totalCost * 100) / 100,
            net: Math.round((entry.totalPaid - entry.totalCost) * 100) / 100,
            estimatedRevenue: Math.round(totalEstimatedRevenue * 100) / 100,
            payments: entry.payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            payrollEntries: entry.payrollEntries.sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime()),
          };
        })
        .sort((a, b) => b.totalPaid - a.totalPaid);

      const totalClientPaid = matchedClients.reduce((s, c) => s + c.totalPaid, 0) + unmatchedClients.reduce((s, c) => s + c.totalPaid, 0);
      const totalEmployeeCost = matchedClients.reduce((s, c) => s + c.totalCost, 0);
      const totalEstimatedRevenue = matchedClients.reduce((s, c) => s + c.estimatedRevenue, 0);

      res.json({
        matched: matchedClients,
        unmatched: unmatchedClients,
        totals: {
          totalClientPaid: Math.round(totalClientPaid * 100) / 100,
          totalEmployeeCost: Math.round(totalEmployeeCost * 100) / 100,
          netPosition: Math.round((totalClientPaid - totalEmployeeCost) * 100) / 100,
          totalEstimatedRevenue: Math.round(totalEstimatedRevenue * 100) / 100,
        },
        dateRange: { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch client ledger" });
    }
  });

  app.get("/api/expected-hours", async (req, res) => {
    try {
      const filters: { employeeId?: string; month?: number; year?: number } = {};
      if (req.query.employeeId) filters.employeeId = req.query.employeeId as string;
      if (req.query.month) filters.month = parseInt(req.query.month as string);
      if (req.query.year) filters.year = parseInt(req.query.year as string);
      const data = await storage.getMonthlyExpectedHours(filters);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch expected hours" });
    }
  });

  app.post("/api/expected-hours", async (req, res) => {
    try {
      const parsed = insertMonthlyExpectedHoursSchema.parse(req.body);
      if (parsed.month < 1 || parsed.month > 12) return res.status(400).json({ message: "Invalid month" });
      if (parsed.year < 2020 || parsed.year > 2030) return res.status(400).json({ message: "Invalid year" });
      const result = await storage.upsertMonthlyExpectedHours(parsed);
      res.status(201).json(result);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: err.errors });
      res.status(500).json({ message: err.message || "Failed to save expected hours" });
    }
  });

  app.delete("/api/expected-hours/:id", async (req, res) => {
    try {
      await storage.deleteMonthlyExpectedHours(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete expected hours" });
    }
  });

  app.get("/api/act-working-days", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const info = getACTWorkingDays(year, m);
        months.push({
          month: m,
          year,
          ...info,
          expectedHours: parseFloat((info.workingDays * 7.5).toFixed(2)),
        });
      }
      res.json(months);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to calculate working days" });
    }
  });

  app.post("/api/generate-expected-hours", async (req, res) => {
    try {
      const { startYear, endYear, tenantId: bodyTenantId } = req.body;
      if (!startYear || !endYear || startYear > endYear) {
        return res.status(400).json({ message: "Provide valid startYear and endYear" });
      }

      let tenantId = bodyTenantId;
      if (!tenantId) {
        const setting = await storage.getSetting("xero.tenantId");
        tenantId = setting?.value;
      }
      if (!tenantId) {
        return res.status(400).json({ message: "No tenant selected. Switch to an organisation first or provide tenantId." });
      }

      const { db } = await import("./db");
      const { employees: empTable, placements: plTable, monthlyExpectedHours: mehTable } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const allEmployees = await db.select().from(empTable).where(eq(empTable.tenantId, tenantId));

      let created = 0;
      let updated = 0;

      for (const emp of allEmployees) {
        const empPlacements = await db.select().from(plTable).where(eq(plTable.employeeId, emp.id));
        if (empPlacements.length === 0) continue;

        let earliestStart: Date | null = null;
        let latestEnd: Date | null = null;
        let hasActive = false;

        for (const p of empPlacements) {
          const start = p.startDate ? new Date(p.startDate) : null;
          if (start && (!earliestStart || start < earliestStart)) earliestStart = start;
          if (p.status === "ACTIVE") {
            hasActive = true;
          } else if (p.endDate) {
            const end = new Date(p.endDate);
            if (!latestEnd || end > latestEnd) latestEnd = end;
          }
        }

        for (let year = startYear; year <= endYear; year++) {
          for (let month = 1; month <= 12; month++) {
            const monthStart = new Date(year, month - 1, 1);
            const monthEnd = new Date(year, month, 0);

            if (earliestStart && monthEnd < earliestStart) continue;
            if (!hasActive && latestEnd && monthStart > latestEnd) continue;

            const hours = getACTExpectedHours(year, month);
            const { workingDays } = getACTWorkingDays(year, month);

            const existing = await db.select().from(mehTable).where(
              and(
                eq(mehTable.employeeId, emp.id),
                eq(mehTable.month, month),
                eq(mehTable.year, year),
              )
            );

            if (existing.length > 0) {
              await db.update(mehTable)
                .set({ expectedDays: workingDays.toString(), expectedHours: hours.toString(), tenantId, updatedAt: new Date() })
                .where(eq(mehTable.id, existing[0].id));
              updated++;
            } else {
              await db.insert(mehTable).values({
                employeeId: emp.id,
                month,
                year,
                expectedDays: workingDays.toString(),
                expectedHours: hours.toString(),
                tenantId,
              });
              created++;
            }
          }
        }
      }

      res.json({ created, updated, totalEmployees: allEmployees.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate expected hours" });
    }
  });

  app.post("/api/placements/auto-populate", async (req, res) => {
    try {
      const { db } = await import("./db");
      const {
        invoices: invTable,
        employees: empTable,
        clients: clientsTable,
        placements: placementsTable,
        invoiceLineItems: lineItemsTable,
      } = await import("@shared/schema");
      const { eq, and, sql, isNotNull, inArray } = await import("drizzle-orm");
      const { getActiveTenantId } = await import("./storage");

      const tenantId = await getActiveTenantId();
      const conds: any[] = [isNotNull(invTable.employeeId), eq(invTable.invoiceType, "ACCREC")];
      if (tenantId) conds.push(eq(invTable.tenantId, tenantId));

      const invoiceRows = await db.select({
        employeeId: invTable.employeeId,
        contactName: invTable.contactName,
        issueDate: invTable.issueDate,
        invoiceId: invTable.id,
        clientId: invTable.clientId,
      }).from(invTable).where(and(...conds));

      const grouped: Record<string, {
        employeeId: string;
        contactName: string;
        clientId: string | null;
        invoiceDates: string[];
        invoiceIds: string[];
      }> = {};

      for (const inv of invoiceRows) {
        if (!inv.employeeId || !inv.contactName) continue;
        const key = `${inv.employeeId}::${inv.contactName}`;
        if (!grouped[key]) {
          grouped[key] = {
            employeeId: inv.employeeId,
            contactName: inv.contactName,
            clientId: inv.clientId,
            invoiceDates: [],
            invoiceIds: [],
          };
        }
        if (inv.issueDate) grouped[key].invoiceDates.push(inv.issueDate);
        if (inv.invoiceId) grouped[key].invoiceIds.push(inv.invoiceId);
      }

      const existingPlacements = await db.select({
        employeeId: placementsTable.employeeId,
        clientName: placementsTable.clientName,
      }).from(placementsTable).where(
        tenantId ? eq(placementsTable.tenantId, tenantId) : sql`1=1`
      );

      const existingSet = new Set(
        existingPlacements.map((p) => `${p.employeeId}::${(p.clientName || "").toLowerCase().trim()}`)
      );

      const allClients = await storage.getClients();
      const clientsByName: Record<string, string> = {};
      for (const c of allClients) {
        if (c.name) clientsByName[c.name.toLowerCase()] = c.id;
      }

      let created = 0;
      for (const g of Object.values(grouped)) {
        const key = `${g.employeeId}::${g.contactName.toLowerCase().trim()}`;
        if (existingSet.has(key)) continue;

        const resolvedClientId = g.clientId || clientsByName[g.contactName.toLowerCase()] || null;

        const sortedDates = g.invoiceDates.filter(Boolean).sort();
        const startDate = sortedDates.length > 0 ? sortedDates[0] : null;
        const latestDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const isActive = latestDate ? new Date(latestDate) >= threeMonthsAgo : false;

        let chargeOutRate: string | null = null;
        const invoiceLineRows = g.invoiceIds.length > 0 ? await db.select({
          unitAmount: lineItemsTable.unitAmount,
        }).from(lineItemsTable).where(
          and(
            inArray(lineItemsTable.invoiceId, g.invoiceIds),
            isNotNull(lineItemsTable.unitAmount)
          )
        ) : [];
        if (invoiceLineRows.length > 0) {
          const rates: Record<string, number> = {};
          for (const row of invoiceLineRows) {
            if (row.unitAmount) {
              const r = parseFloat(row.unitAmount).toFixed(2);
              rates[r] = (rates[r] || 0) + 1;
            }
          }
          const sorted = Object.entries(rates).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) chargeOutRate = sorted[0][0];
        }

        if (!chargeOutRate) {
          const totalAmount = invoiceLineRows.reduce((s, r) => s + (r.unitAmount ? parseFloat(r.unitAmount) : 0), 0);
          if (totalAmount > 0 && invoiceLineRows.length > 0) {
            chargeOutRate = (totalAmount / invoiceLineRows.length).toFixed(2);
          }
        }

        await storage.createPlacement({
          employeeId: g.employeeId,
          clientId: resolvedClientId,
          clientName: g.contactName,
          startDate: startDate || null,
          endDate: !isActive && latestDate ? latestDate : null,
          chargeOutRate: chargeOutRate,
          status: isActive ? "ACTIVE" : "ENDED",
        });
        created++;
      }

      res.json({ created, message: `Created ${created} new placements from invoice data` });
    } catch (err: any) {
      console.error("Auto-populate placements error:", err);
      res.status(500).json({ message: err.message || "Failed to auto-populate placements" });
    }
  });

  app.post("/api/employees/derive-pay-rates", async (req, res) => {
    try {
      const { db } = await import("./db");
      const {
        employees: empTable,
        payRunLines: prlTable,
        payRuns: prTable,
        timesheets: tsTable,
        invoices: invTable,
        rateHistory: rhTable,
      } = await import("@shared/schema");
      const { eq, and, desc } = await import("drizzle-orm");

      const setting = await storage.getSetting("xero.tenantId");
      const tenantId = setting?.value;
      if (!tenantId) {
        return res.status(400).json({ message: "No tenant selected. Switch to an organisation first." });
      }

      const allEmployees = await db.select().from(empTable).where(eq(empTable.tenantId, tenantId));
      const allPayRuns = await db.select().from(prTable).where(eq(prTable.tenantId, tenantId));
      const allTimesheets = await db.select().from(tsTable).where(eq(tsTable.tenantId, tenantId));
      const allInvoices = await db.select().from(invTable).where(eq(invTable.tenantId, tenantId));

      let ratesCreated = 0;
      let employeesUpdated = 0;
      let processed = 0;

      for (const emp of allEmployees) {
        const empPayRunLines = await db.select().from(prlTable).where(eq(prlTable.employeeId, emp.id));
        if (empPayRunLines.length === 0) continue;

        const existingRates = await db.select().from(rhTable)
          .where(and(eq(rhTable.employeeId, emp.id)))
          .orderBy(desc(rhTable.effectiveDate));

        let latestDerivedRate: number | null = null;
        let latestDerivedDate: string | null = null;

        const payRunMap = new Map(allPayRuns.map(pr => [pr.id, pr]));

        const linesByPeriod: Map<string, { lines: typeof empPayRunLines; payRun: typeof allPayRuns[0] }> = new Map();
        for (const line of empPayRunLines) {
          const pr = payRunMap.get(line.payRunId);
          if (!pr) continue;
          const key = `${pr.year}-${pr.month}`;
          if (!linesByPeriod.has(key)) {
            linesByPeriod.set(key, { lines: [], payRun: pr });
          }
          linesByPeriod.get(key)!.lines.push(line);
        }

        for (const [, { lines, payRun }] of linesByPeriod) {
          const month = payRun.month;
          const year = payRun.year;
          if (!month || !year) continue;

          let totalNetPay = 0;
          let totalSuper = 0;
          let totalGross = 0;
          let totalPayg = 0;
          for (const line of lines) {
            const net = parseFloat(line.netPay || "0");
            const sup = parseFloat(line.superAmount || "0");
            const gross = parseFloat(line.grossEarnings || "0");
            const payg = parseFloat(line.paygWithheld || "0");
            totalNetPay += net;
            totalSuper += sup;
            totalGross += gross;
            totalPayg += payg;
          }

          let totalEmployerCost = 0;
          if (totalGross > 0) {
            totalEmployerCost = totalGross + totalSuper;
          } else if (totalNetPay > 0 || totalPayg > 0) {
            const reconstructedGross = totalPayg > 0 ? totalNetPay + totalPayg : totalNetPay;
            totalEmployerCost = reconstructedGross + totalSuper;
          }
          if (totalEmployerCost <= 0) continue;

          let hours = 0;
          const empTs = allTimesheets.filter(t =>
            t.employeeId === emp.id && t.month === month && t.year === year
          );
          if (empTs.length > 0) {
            hours = empTs.reduce((s, t) => s + parseFloat(t.totalHours || "0"), 0);
          }

          if (hours <= 0) {
            const empInv = allInvoices.filter(i =>
              i.employeeId === emp.id && i.month === month && i.year === year
            );
            if (empInv.length > 0) {
              hours = empInv.reduce((s, i) => s + parseFloat(i.hours || "0"), 0);
            }
          }

          if (hours <= 0) continue;

          const payRate = Math.round((totalEmployerCost / hours) * 100) / 100;
          if (payRate <= 0 || payRate > 1000) continue;

          processed++;

          const effectiveDate = payRun.periodStart || `${year}-${String(month).padStart(2, "0")}-01`;
          const lastRate = existingRates.length > 0 ? parseFloat(existingRates[0].payRate) : null;
          const alreadyRecorded = existingRates.some(r => {
            const rPay = parseFloat(r.payRate);
            return r.effectiveDate === effectiveDate && Math.abs(rPay - payRate) < 0.01;
          });

          if (!alreadyRecorded) {
            const dateObj = new Date(effectiveDate);
            const superPercent = getSuperRate(dateObj);
            const chargeOut = emp.chargeOutRate
              ? parseFloat(emp.chargeOutRate)
              : calculateChargeOutFromPayRate(payRate, superPercent);

            const shouldCreate = lastRate === null || Math.abs(payRate - lastRate) >= 0.01;
            if (shouldCreate) {
              await db.insert(rhTable).values({
                employeeId: emp.id,
                effectiveDate,
                payRate: String(payRate),
                chargeOutRate: String(Math.round(chargeOut * 100) / 100),
                superPercent: String(superPercent),
                source: "PAYROLL_SYNC",
                payRunId: payRun.id,
                tenantId,
              });
              ratesCreated++;
              existingRates.unshift({
                id: "",
                employeeId: emp.id,
                effectiveDate,
                payRate: String(payRate),
                chargeOutRate: String(chargeOut),
                superPercent: String(superPercent),
                source: "PAYROLL_SYNC",
                payRunId: payRun.id,
                notes: null,
                tenantId,
                createdAt: new Date(),
              });
            }
          }

          if (!latestDerivedDate || effectiveDate > latestDerivedDate) {
            latestDerivedRate = payRate;
            latestDerivedDate = effectiveDate;
          }
        }

        if (latestDerivedRate !== null && latestDerivedRate > 0) {
          const currentRate = emp.hourlyRate ? parseFloat(emp.hourlyRate) : null;
          if (currentRate === null || Math.abs(currentRate - latestDerivedRate) >= 0.01) {
            await db.update(empTable)
              .set({ hourlyRate: String(latestDerivedRate) })
              .where(eq(empTable.id, emp.id));
            employeesUpdated++;
          }
        }
      }

      res.json({
        message: `Derived pay rates: ${ratesCreated} rate history records created, ${employeesUpdated} employees updated.`,
        processed,
        ratesCreated,
        employeesUpdated,
        totalEmployees: allEmployees.length,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to derive pay rates" });
    }
  });

  app.get("/api/bank-transactions/linkage", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);
      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      const allBankTxns = await storage.getBankTransactions();
      const bankTxns = allBankTxns.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });
      const allInvoices = await storage.getInvoices();
      const allRctis = await storage.getRctis();
      const allClients = await storage.getClients();
      const allInvoicePayments = await storage.getAllInvoicePayments();
      const allPlacements = await storage.getAllPlacements();

      const rctiClientIds = new Set(allClients.filter(c => c.isRcti).map(c => c.id));
      const rctiClientNames = new Set(allClients.filter(c => c.isRcti).map(c => c.name.toLowerCase().trim()));

      const rctiBankTxnIds = new Set(allRctis.filter(r => r.bankTransactionId).map(r => r.bankTransactionId!));

      const invoicePaymentsByKey = new Map<string, { invoiceId: string; invoiceNumber: string | null; contactName: string | null }>();
      for (const ip of allInvoicePayments) {
        const inv = allInvoices.find(i => i.id === ip.invoiceId);
        if (!inv) continue;
        const key = `${ip.bankAccountId || ""}__${ip.paymentDate || ""}__${parseFloat(String(ip.amount)).toFixed(2)}`;
        invoicePaymentsByKey.set(key, {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          contactName: inv.contactName,
        });
      }

      const invoicesByContact = new Map<string, typeof allInvoices>();
      for (const inv of allInvoices) {
        if (!inv.contactName) continue;
        if (inv.invoiceType && inv.invoiceType !== "ACCREC") continue;
        if (inv.status === "VOIDED") continue;
        const key = inv.contactName.toLowerCase().trim();
        if (!invoicesByContact.has(key)) invoicesByContact.set(key, []);
        invoicesByContact.get(key)!.push(inv);
      }

      const invoicesByNumber = new Map<string, typeof allInvoices[0]>();
      for (const inv of allInvoices) {
        if (inv.invoiceNumber && inv.invoiceType === "ACCREC" && inv.status !== "VOIDED") {
          invoicesByNumber.set(inv.invoiceNumber, inv);
        }
      }

      const linkage: Record<string, {
        status: "linked_invoice" | "linked_rcti" | "matched_contact" | "confirmed" | "manual" | "suggested" | "rejected" | "unlinked";
        invoiceId?: string;
        invoiceNumber?: string;
        rctiId?: string;
        contactName?: string;
        isRctiClient?: boolean;
        employeeId?: string;
        employeeName?: string;
        category?: string;
        notes?: string;
        employees?: { id: string; name: string; placementId: string }[];
      }> = {};

      const allEmployees = await storage.getEmployees();
      const employeeMap = new Map(allEmployees.map(e => [e.id, e]));

      for (const txn of bankTxns) {
        const txnId = txn.id;

        if (txn.linkStatus === "confirmed" || txn.linkStatus === "manual") {
          const inv = txn.linkedInvoiceId ? allInvoices.find(i => i.id === txn.linkedInvoiceId) : null;
          const emp = txn.linkedEmployeeId ? employeeMap.get(txn.linkedEmployeeId) : null;
          linkage[txnId] = {
            status: txn.linkStatus as "confirmed" | "manual",
            invoiceId: txn.linkedInvoiceId || undefined,
            invoiceNumber: inv?.invoiceNumber || undefined,
            employeeId: txn.linkedEmployeeId || undefined,
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : undefined,
            category: txn.linkedCategory || undefined,
            notes: txn.linkedNotes || undefined,
          };
          continue;
        }

        if (txn.linkStatus === "suggested") {
          const inv = txn.suggestedInvoiceId ? allInvoices.find(i => i.id === txn.suggestedInvoiceId) : null;
          const emp = txn.suggestedEmployeeId ? employeeMap.get(txn.suggestedEmployeeId) : null;
          linkage[txnId] = {
            status: "suggested",
            invoiceId: txn.suggestedInvoiceId || undefined,
            invoiceNumber: inv?.invoiceNumber || undefined,
            employeeId: txn.suggestedEmployeeId || undefined,
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : undefined,
          };
          continue;
        }

        if (txn.linkStatus === "rejected") {
          linkage[txnId] = { status: "rejected", isRctiClient: false };
          continue;
        }

        if (rctiBankTxnIds.has(txnId)) {
          const rcti = allRctis.find(r => r.bankTransactionId === txnId);
          linkage[txnId] = { status: "linked_rcti", rctiId: rcti?.id };
          continue;
        }

        const paymentKey = `${txn.bankAccountId || ""}__${txn.date || ""}__${Math.abs(parseFloat(String(txn.amount))).toFixed(2)}`;
        const paymentMatch = invoicePaymentsByKey.get(paymentKey);
        if (paymentMatch) {
          linkage[txnId] = {
            status: "linked_invoice",
            invoiceId: paymentMatch.invoiceId,
            invoiceNumber: paymentMatch.invoiceNumber,
          };
          continue;
        }

        if (txn.reference && txn.type === "RECEIVE" && invoicesByNumber.has(txn.reference)) {
          const refInv = invoicesByNumber.get(txn.reference)!;
          linkage[txnId] = {
            status: "linked_invoice",
            invoiceId: refInv.id,
            invoiceNumber: refInv.invoiceNumber,
          };
          continue;
        }

        const contactNorm = (txn.contactName || "").toLowerCase().trim();
        const isRctiClient = rctiClientNames.has(contactNorm);
        const contactInvoices = invoicesByContact.get(contactNorm) || [];
        const amountMatch = contactInvoices.find(inv => {
          const invAmt = Math.abs(parseFloat(inv.amountInclGst || "0"));
          const txnAmt = Math.abs(parseFloat(String(txn.amount)));
          return Math.abs(invAmt - txnAmt) < 0.02;
        });

        if (amountMatch) {
          linkage[txnId] = {
            status: "matched_contact",
            invoiceId: amountMatch.id,
            invoiceNumber: amountMatch.invoiceNumber,
            contactName: txn.contactName,
            isRctiClient,
          };
          continue;
        }

        if (isRctiClient && txn.type === "RECEIVE") {
          const client = allClients.find(c => c.name.toLowerCase().trim() === contactNorm);
          const clientPlacements = client ? allPlacements.filter(p => p.clientId === client.id) : [];

          const empDetails = await Promise.all(clientPlacements.map(async p => {
            const emp = await storage.getEmployee(p.employeeId);
            return emp ? { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, placementId: p.id } : null;
          }));

          linkage[txnId] = {
            status: "unlinked",
            isRctiClient: true,
            contactName: txn.contactName,
            employees: empDetails.filter(Boolean) as { id: string; name: string; placementId: string }[],
          };
          continue;
        }

        linkage[txnId] = { status: "unlinked", isRctiClient: false };
      }

      res.json(linkage);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute linkage" });
    }
  });

  // ─── Auto-Suggest Bank Transaction Links ──────────────────────────
  app.post("/api/bank-transactions/auto-suggest", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string || req.body.month);
      const year = parseInt(req.query.year as string || req.body.year);
      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      const allBankTxns = await storage.getBankTransactions();
      const bankTxns = allBankTxns.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });

      const allInvoices = await storage.getInvoices();
      const allRctis = await storage.getRctis();
      const allClients = await storage.getClients();
      const allInvoicePayments = await storage.getAllInvoicePayments();
      const allPlacements = await storage.getAllPlacements();
      const allEmployees = await storage.getEmployees();

      const rctiClientNames = new Set(allClients.filter(c => c.isRcti).map(c => c.name.toLowerCase().trim()));
      const rctiBankTxnIds = new Set(allRctis.filter(r => r.bankTransactionId).map(r => r.bankTransactionId!));

      const invoicePaymentsByKey = new Map<string, { invoiceId: string }>();
      for (const ip of allInvoicePayments) {
        const inv = allInvoices.find(i => i.id === ip.invoiceId);
        if (!inv) continue;
        const key = `${ip.bankAccountId || ""}__${ip.paymentDate || ""}__${parseFloat(String(ip.amount)).toFixed(2)}`;
        invoicePaymentsByKey.set(key, { invoiceId: inv.id });
      }

      const invoicesByContact = new Map<string, typeof allInvoices>();
      for (const inv of allInvoices) {
        if (!inv.contactName) continue;
        if (inv.invoiceType && inv.invoiceType !== "ACCREC") continue;
        if (inv.status === "VOIDED") continue;
        const key = inv.contactName.toLowerCase().trim();
        if (!invoicesByContact.has(key)) invoicesByContact.set(key, []);
        invoicesByContact.get(key)!.push(inv);
      }

      let suggestedCount = 0;
      let autoLinkedCount = 0;

      const invoicesByNumber2 = new Map<string, typeof allInvoices[0]>();
      for (const inv of allInvoices) {
        if (inv.invoiceNumber && inv.invoiceType === "ACCREC" && inv.status !== "VOIDED") {
          invoicesByNumber2.set(inv.invoiceNumber, inv);
        }
      }

      for (const txn of bankTxns) {
        if (txn.linkStatus === "confirmed" || txn.linkStatus === "manual" || txn.linkStatus === "rejected" || txn.linkStatus === "suggested") {
          continue;
        }

        if (rctiBankTxnIds.has(txn.id)) continue;

        if (txn.reference && txn.type === "RECEIVE" && invoicesByNumber2.has(txn.reference)) {
          const refInv = invoicesByNumber2.get(txn.reference)!;
          await storage.updateBankTransactionLink(txn.id, {
            linkedInvoiceId: refInv.id,
            linkStatus: "confirmed",
          });
          autoLinkedCount++;
          continue;
        }

        const paymentKey = `${txn.bankAccountId || ""}__${txn.date || ""}__${Math.abs(parseFloat(String(txn.amount))).toFixed(2)}`;
        const paymentMatch = invoicePaymentsByKey.get(paymentKey);
        if (paymentMatch) {
          await storage.updateBankTransactionLink(txn.id, {
            suggestedInvoiceId: paymentMatch.invoiceId,
            linkStatus: "suggested",
          });
          suggestedCount++;
          continue;
        }

        const contactNorm = (txn.contactName || "").toLowerCase().trim();
        const contactInvoices = invoicesByContact.get(contactNorm) || [];
        const amountMatch = contactInvoices.find(inv => {
          const invAmt = Math.abs(parseFloat(inv.amountInclGst || "0"));
          const txnAmt = Math.abs(parseFloat(String(txn.amount)));
          return Math.abs(invAmt - txnAmt) < 0.02;
        });

        if (amountMatch) {
          await storage.updateBankTransactionLink(txn.id, {
            suggestedInvoiceId: amountMatch.id,
            linkStatus: "suggested",
          });
          suggestedCount++;
          continue;
        }

        if (txn.type === "SPEND" && contactNorm) {
          const matchedEmp = allEmployees.find(e => {
            const empName = `${e.firstName} ${e.lastName}`.toLowerCase().trim();
            return contactNorm.includes(empName) || empName.includes(contactNorm);
          });
          if (matchedEmp) {
            await storage.updateBankTransactionLink(txn.id, {
              suggestedEmployeeId: matchedEmp.id,
              linkStatus: "suggested",
            });
            suggestedCount++;
            continue;
          }
        }
      }

      res.json({ suggestedCount, autoLinkedCount, totalTransactions: bankTxns.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to auto-suggest links" });
    }
  });

  // ─── Manual Link / Confirm / Reject Bank Transaction ─────────────
  app.patch("/api/bank-transactions/:id/link", async (req, res) => {
    try {
      const { id } = req.params;
      const { action, invoiceId, employeeId, category, notes } = req.body;

      if (!action || !["confirm", "manual", "reject"].includes(action)) {
        return res.status(400).json({ message: "action must be 'confirm', 'manual', or 'reject'" });
      }

      const allBankTxns = await storage.getBankTransactions();
      const txn = allBankTxns.find(t => t.id === id);
      if (!txn) return res.status(404).json({ message: "Bank transaction not found" });

      if (action === "confirm") {
        if (!txn.suggestedInvoiceId && !txn.suggestedEmployeeId) {
          return res.status(400).json({ message: "No suggestion to confirm" });
        }
        await storage.updateBankTransactionLink(id, {
          linkedInvoiceId: txn.suggestedInvoiceId || null,
          linkedEmployeeId: txn.suggestedEmployeeId || null,
          linkedNotes: notes || null,
          linkStatus: "confirmed",
        });
      } else if (action === "manual") {
        if (!invoiceId && !employeeId && !category) {
          return res.status(400).json({ message: "invoiceId, employeeId, or category required for manual link" });
        }
        if (invoiceId) {
          const allInvoices = await storage.getInvoices();
          if (!allInvoices.find(i => i.id === invoiceId)) {
            return res.status(404).json({ message: "Invoice not found" });
          }
        }
        if (employeeId) {
          const emp = await storage.getEmployee(employeeId);
          if (!emp) {
            return res.status(404).json({ message: "Employee not found" });
          }
        }
        await storage.updateBankTransactionLink(id, {
          linkedInvoiceId: invoiceId || null,
          linkedEmployeeId: employeeId || null,
          linkedCategory: category || null,
          linkedNotes: notes || null,
          linkStatus: "manual",
          suggestedInvoiceId: null,
          suggestedEmployeeId: null,
        });
      } else if (action === "reject") {
        await storage.updateBankTransactionLink(id, {
          linkStatus: "rejected",
          suggestedInvoiceId: null,
          suggestedEmployeeId: null,
          linkedInvoiceId: null,
          linkedEmployeeId: null,
          linkedCategory: null,
          linkedNotes: null,
        });
      }

      const updated = await storage.getBankTransactions();
      const result = updated.find(t => t.id === id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update link" });
    }
  });

  // ─── Unlink (Reset) Bank Transaction ──────────────────────────────
  app.delete("/api/bank-transactions/:id/link", async (req, res) => {
    try {
      const { id } = req.params;
      const allBankTxns = await storage.getBankTransactions();
      const txn = allBankTxns.find(t => t.id === id);
      if (!txn) return res.status(404).json({ message: "Bank transaction not found" });
      const result = await storage.clearBankTransactionLink(id);
      if (!result) return res.status(404).json({ message: "Bank transaction not found" });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to unlink" });
    }
  });

  // ─── Employee Merge ───────────────────────────────────────────────
  const mergeTables = [
    { table: timesheets, name: "timesheets" },
    { table: invoices, name: "invoices" },
    { table: invoiceEmployees, name: "invoiceEmployees" },
    { table: payRunLines, name: "payRunLines" },
    { table: documents, name: "documents" },
    { table: notifications, name: "notifications" },
    { table: messages, name: "messages" },
    { table: leaveRequests, name: "leaveRequests" },
    { table: taxDeclarations, name: "taxDeclarations" },
    { table: bankAccounts, name: "bankAccounts" },
    { table: superMemberships, name: "superMemberships" },
    { table: placements, name: "placements" },
    { table: rateHistory, name: "rateHistory" },
    { table: timesheetAuditLog, name: "timesheetAuditLog" },
    { table: monthlyExpectedHours, name: "monthlyExpectedHours" },
    { table: rctis, name: "rctis" },
  ];

  app.get("/api/employees/:id/merge-preview", requireAuth, async (req, res) => {
    try {
      const empId = req.params.id;
      const emp = await storage.getEmployee(empId);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const counts: Record<string, number> = {};
      for (const { table, name } of mergeTables) {
        const col = (table as any).employeeId;
        if (!col) continue;
        const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(eq(col, empId));
        counts[name] = row?.count || 0;
      }
      res.json({ employeeId: empId, name: `${emp.firstName} ${emp.lastName}`, counts });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate merge preview" });
    }
  });

  app.post("/api/employees/merge", requireAuth, async (req, res) => {
    try {
      const { sourceEmployeeId, targetEmployeeId } = req.body;
      const deleteSource = req.body.deleteSource === true;
      if (!sourceEmployeeId || !targetEmployeeId || typeof sourceEmployeeId !== "string" || typeof targetEmployeeId !== "string") {
        return res.status(400).json({ message: "sourceEmployeeId and targetEmployeeId are required strings" });
      }
      if (sourceEmployeeId === targetEmployeeId) {
        return res.status(400).json({ message: "Source and target must be different employees" });
      }

      const source = await storage.getEmployee(sourceEmployeeId);
      const target = await storage.getEmployee(targetEmployeeId);
      if (!source) return res.status(404).json({ message: "Source employee not found" });
      if (!target) return res.status(404).json({ message: "Target employee not found" });

      const transferred: Record<string, number> = {};

      await db.transaction(async (tx) => {
        for (const { table, name } of mergeTables) {
          const col = (table as any).employeeId;
          if (!col) continue;

          if (name === "invoiceEmployees") {
            const existingTarget = await tx.select().from(invoiceEmployees).where(eq(col, targetEmployeeId));
            const targetInvoiceIds = new Set(existingTarget.map((r: any) => r.invoiceId));
            const sourceRows = await tx.select().from(invoiceEmployees).where(eq(col, sourceEmployeeId));
            let moved = 0;
            for (const row of sourceRows) {
              if (targetInvoiceIds.has((row as any).invoiceId)) {
                await tx.delete(invoiceEmployees).where(eq((invoiceEmployees as any).id, (row as any).id));
              } else {
                await tx.update(invoiceEmployees).set({ employeeId: targetEmployeeId }).where(eq((invoiceEmployees as any).id, (row as any).id));
                moved++;
              }
            }
            transferred[name] = moved;
            continue;
          }

          const result = await tx.update(table)
            .set({ employeeId: targetEmployeeId })
            .where(eq(col, sourceEmployeeId));
          transferred[name] = (result as any).rowCount || 0;
        }

        if (deleteSource) {
          await tx.delete(employees).where(eq(employees.id, sourceEmployeeId));
        } else {
          await tx.update(employees).set({ status: "OFFBOARDED" }).where(eq(employees.id, sourceEmployeeId));
        }
      });

      const totalMoved = Object.values(transferred).reduce((a, b) => a + b, 0);
      res.json({
        message: `Merged ${source.firstName} ${source.lastName} → ${target.firstName} ${target.lastName}. ${totalMoved} records transferred.${deleteSource ? " Source deleted." : " Source offboarded."}`,
        transferred,
        sourceDeleted: deleteSource,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to merge employees" });
    }
  });

  // ── Xero Payrun Push ─────────────────────────────────────────────────────
  app.get("/api/payroll/prepare", requireAuth, async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);
      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      const allEmployees = await storage.getEmployees();
      const activePayroll = allEmployees.filter(
        e => e.status === "ACTIVE" && e.paymentMethod === "PAYROLL"
      );

      const { getSuperRate } = await import("./rates");
      const superRate = getSuperRate(new Date(year, month - 1, 1));
      const superFraction = superRate / 100;

      const result = [];
      for (const emp of activePayroll) {
        const timesheets = await storage.getTimesheetsByEmployee(emp.id);
        const ts = timesheets.find(t => t.year === year && t.month === month);
        const hours = ts ? parseFloat(ts.totalHours) : 0;
        const rate = emp.hourlyRate ? parseFloat(emp.hourlyRate) : 0;
        const gross = Math.round(hours * rate * 100) / 100;
        const payg = ts ? Math.round(gross * 0.19 * 100) / 100 : 0;
        const superAmt = Math.round(gross * superFraction * 100) / 100;
        const net = Math.round((gross - payg) * 100) / 100;

        result.push({
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          xeroEmployeeId: emp.xeroEmployeeId || null,
          hourlyRate: rate,
          timesheet: ts ? {
            id: ts.id,
            totalHours: parseFloat(ts.totalHours),
            status: ts.status,
          } : null,
          calculated: { hours, rate, gross, payg, super: superAmt, net },
          included: hours > 0 && !!emp.xeroEmployeeId,
        });
      }

      // Fetch Xero calendars
      let calendars: any[] = [];
      try {
        const { getXeroPayrollCalendars } = await import("./xero-payrun");
        calendars = await getXeroPayrollCalendars();
      } catch {}

      res.json({ employees: result, superRate, calendars });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to prepare payroll" });
    }
  });

  app.post("/api/payroll/push-to-xero", requireAuth, async (req, res) => {
    try {
      const { calendarId, periodStart, periodEnd, paymentDate, employees } = req.body;
      if (!calendarId || !periodStart || !periodEnd || !paymentDate) {
        return res.status(400).json({ message: "calendarId, periodStart, periodEnd, paymentDate required" });
      }
      const { pushPayRunToXero } = await import("./xero-payrun");
      const result = await pushPayRunToXero({ calendarId, periodStart, periodEnd, paymentDate, employees });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to push pay run to Xero" });
    }
  });


  return httpServer;
}
