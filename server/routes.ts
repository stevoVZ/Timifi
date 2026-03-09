import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { insertEmployeeSchema, insertTimesheetSchema, insertInvoiceSchema, insertPayRunSchema, insertNotificationSchema, insertMessageSchema, insertLeaveRequestSchema, insertPayItemSchema, insertTaxDeclarationSchema, insertBankAccountSchema, insertSuperMembershipSchema, insertPayRunLineSchema, insertDocumentSchema, insertPlacementSchema, insertRctiSchema, insertMonthlyExpectedHoursSchema } from "@shared/schema";
import { generatePayslipHTML, generatePayslipPDF, buildPayslipData } from "./payslip";
import { buildABAFromPayRun, type ABAHeader } from "./aba";
import { getConsentUrl, handleCallback, isConnected, disconnect, syncEmployees, getCallbackUri, getTenants, selectTenant, syncPayRuns, syncTimesheets, syncPayrollSettings, syncInvoices, syncContacts, syncBankTransactions } from "./xero";
import { requireAuth } from "./auth";
import { scanTimesheetPdf } from "./ocr";
import { getSuperRate, calculateChargeOutFromPayRate, calculatePayRate } from "./rates";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(pty\.?\s*ltd\.?|limited|ltd\.?|inc\.?|incorporated)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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

  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
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

      if (existing.xeroEmployeeId) {
        const xeroLockedFields = ["firstName", "lastName", "email", "phone", "jobTitle", "hourlyRate", "startDate", "endDate", "dateOfBirth", "gender", "addressLine1", "suburb", "state", "postcode", "payFrequency"];
        const body = { ...req.body };
        for (const field of xeroLockedFields) {
          delete body[field];
        }
        const employee = await storage.updateEmployee(req.params.id, body);
        res.json(employee);
      } else {
        const employee = await storage.updateEmployee(req.params.id, req.body);
        res.json(employee!);
      }
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
      const timesheet = await storage.createTimesheet(parsed);

      let notesJson: any = {};
      try { notesJson = parsed.notes ? JSON.parse(parsed.notes) : {}; } catch {}
      const source = reqSource || notesJson.intakeSource || "MANUAL_EDIT";

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
            if (parsed.status) updateFields.status = parsed.status;
            timesheet = await storage.updateTimesheet(existingRecord.id, updateFields);
          } else {
            timesheet = await storage.createTimesheet(parsed);
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

      res.json(timesheet);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update timesheet" });
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
      const { linkedEmployeeIds, ...invoiceData } = req.body;
      const parsed = insertInvoiceSchema.parse(invoiceData);
      const invoice = await storage.createInvoice(parsed);
      if (Array.isArray(linkedEmployeeIds) && linkedEmployeeIds.length > 0) {
        await storage.setInvoiceEmployees(invoice.id, linkedEmployeeIds);
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

      const [allEmployees, allTimesheets, allInvoices, allPayRuns, allBankTxns] = await Promise.all([
        storage.getEmployees(),
        storage.getTimesheets(),
        storage.getInvoices(),
        storage.getPayRuns(),
        storage.getBankTransactions(),
      ]);

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
      const spendTxns = periodBankTxns.filter(t => t.type === "SPEND");

      const result = activeEmployees.map((emp) => {
        const ts = allTimesheets.find(
          (t) => t.employeeId === emp.id && t.month === month && t.year === year
        );
        const inv = allInvoices.find(
          (i) => i.employeeId === emp.id && i.month === month && i.year === year
        );
        const empPayLines = allPayRunLines
          .filter((pl) => pl.line.employeeId === emp.id)
          .sort((a, b) => (statusPriority[b.payRun.status] || 0) - (statusPriority[a.payRun.status] || 0));
        const best = empPayLines[0] || null;
        const payLine = best?.line;
        const payRun = best?.payRun;

        let contractorCost: { total: number; transactionCount: number; companyName: string | null } | null = null;
        if (emp.paymentMethod === "INVOICE" && emp.companyName) {
          const companyNorm = normalizeCompanyName(emp.companyName);
          const matchingSpend = spendTxns.filter(t =>
            t.contactName && normalizeCompanyName(t.contactName) === companyNorm
          );
          contractorCost = {
            total: matchingSpend.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0),
            transactionCount: matchingSpend.length,
            companyName: emp.companyName,
          };
        }

        const hours = ts ? parseFloat(ts.totalHours || "0") : 0;
        const chargeOutRate = emp.chargeOutRate ? parseFloat(emp.chargeOutRate) : 0;
        const payRate = emp.hourlyRate ? parseFloat(emp.hourlyRate) : 0;
        const expectedRevenue = hours * chargeOutRate;
        let employeeCost: number;
        if (emp.paymentMethod === "INVOICE" && contractorCost && contractorCost.total > 0) {
          employeeCost = contractorCost.total;
        } else if (payLine) {
          employeeCost = parseFloat(payLine.grossEarnings || "0");
          if (employeeCost === 0) {
            const plNet = parseFloat(payLine.netPay || "0");
            const plSuper = parseFloat(payLine.superAmount || "0");
            if (plNet > 0 && plSuper > 0) {
              employeeCost = plNet + plSuper;
            }
          }
        } else {
          employeeCost = hours * payRate;
        }
        const margin = expectedRevenue - employeeCost;
        const marginPercent = expectedRevenue > 0 ? (margin / expectedRevenue) * 100 : 0;

        const feePercent = parseFloat(emp.payrollFeePercent || "0");
        let grossForFee = payLine ? parseFloat(payLine.grossEarnings || "0") : 0;
        if (payLine && grossForFee === 0) {
          const plNet = parseFloat(payLine.netPay || "0");
          const plSuper = parseFloat(payLine.superAmount || "0");
          if (plNet > 0 && plSuper > 0) {
            grossForFee = plNet + plSuper;
          }
        }
        const payrollFeeRevenue = grossForFee * (feePercent / 100);

        return {
          employee: {
            id: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            clientName: emp.clientName,
            hourlyRate: emp.hourlyRate,
            chargeOutRate: emp.chargeOutRate,
            paymentMethod: emp.paymentMethod,
            payrollFeePercent: emp.payrollFeePercent,
            companyName: emp.companyName,
          },
          timesheet: ts
            ? {
                id: ts.id,
                hours,
                regularHours: parseFloat(ts.regularHours || "0"),
                overtimeHours: parseFloat(ts.overtimeHours || "0"),
                status: ts.status,
                grossValue: parseFloat(ts.grossValue || "0"),
              }
            : null,
          invoice: inv
            ? {
                id: inv.id,
                amount: parseFloat(inv.amountInclGst || "0"),
                amountExGst: parseFloat(inv.amountExclGst || "0"),
                invoiceNumber: inv.invoiceNumber,
                status: inv.status,
                paidDate: inv.paidDate,
              }
            : null,
          payroll: payLine
            ? {
                payRunId: payRun?.id || null,
                grossEarnings: employeeCost,
                netPay: parseFloat(payLine.netPay || "0"),
                hoursWorked: parseFloat(payLine.hoursWorked || "0"),
                payRunStatus: payRun?.status || null,
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

  app.post("/api/portal/login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const allEmployees = await storage.getEmployees();
      const employee = allEmployees.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (!employee) return res.status(401).json({ message: "No employee found with that email" });
      res.json({
        employeeId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
      });
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/portal/employee/:employeeId/stats", async (req, res) => {
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
      const leave = await storage.updateLeaveRequest(req.params.id, req.body);
      if (!leave) return res.status(404).json({ message: "Leave request not found" });
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

  app.get("/api/portal/employee/:employeeId/tax", async (req, res) => {
    try {
      const dec = await storage.getTaxDeclaration(req.params.employeeId);
      res.json(dec || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch tax declaration" });
    }
  });

  app.get("/api/portal/employee/:employeeId/bank", async (req, res) => {
    try {
      const acc = await storage.getBankAccount(req.params.employeeId);
      res.json(acc || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bank account" });
    }
  });

  app.get("/api/portal/employee/:employeeId/super", async (req, res) => {
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
        if (annualGross <= 18200) return 0;
        if (annualGross <= 45000) return (annualGross - 18200) * 0.19;
        if (annualGross <= 120000) return 5092 + (annualGross - 45000) * 0.325;
        if (annualGross <= 180000) return 29467 + (annualGross - 120000) * 0.37;
        return 51667 + (annualGross - 180000) * 0.45;
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
        const superAmt = Math.round(gross * superRate);
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

  app.post("/api/xero/sync-bank-transactions", async (_req, res) => {
    try {
      const result = await syncBankTransactions();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to sync bank transactions from Xero" });
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
      const placement = await storage.updatePlacement(req.params.id, req.body);
      if (!placement) return res.status(404).json({ message: "Placement not found" });
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
      const [allClients, allBankTxns] = await Promise.all([
        storage.getClients(),
        storage.getBankTransactions(),
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
      const eligible = allClients
        .filter(c => {
          if (c.isRcti) return true;
          const stats = receiveByContact.get(c.name.toLowerCase().trim());
          return stats && stats.count > 0;
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

      let created = 0;
      for (const txn of unmatchedTxns) {
        const client = rctiClients.find(c => c.name.toLowerCase().trim() === (txn.contactName || "").toLowerCase().trim());
        if (!client) continue;

        const clientPlacements = allPlacements.filter(p =>
          p.clientId === client.id && (p.status === "ACTIVE" || p.status === "ENDED")
        );

        let employeeId: string | null = null;
        if (clientPlacements.length === 1) {
          employeeId = clientPlacements[0].employeeId;
        } else if (clientPlacements.length > 1) {
          const desc = (txn.description || txn.reference || "").toLowerCase();
          if (desc) {
            const nameMatch = clientPlacements.find(p => {
              const emp = allEmployees.find(e => e.id === p.employeeId);
              if (!emp) return false;
              const first = (emp.firstName || "").toLowerCase().trim();
              const last = (emp.lastName || "").toLowerCase().trim();
              if (!first || !last || last.length < 3) return false;
              const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              return new RegExp(`\\b${escaped(last)}\\b`, "i").test(desc) &&
                     new RegExp(`\\b${escaped(first)}\\b`, "i").test(desc);
            });
            if (nameMatch) employeeId = nameMatch.employeeId;
          }
        }

        const amount = parseFloat(txn.amount || "0");
        const gst = Math.round((amount / 11) * 100) / 100;
        const exGst = Math.round((amount - gst) * 100) / 100;

        let hours: string | null = null;
        let hourlyRate: string | null = null;
        if (employeeId) {
          const placement = clientPlacements.find(p => p.employeeId === employeeId);
          const rate = parseFloat(placement?.chargeOutRate || "0");
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
          description: txn.description || txn.reference || `Bank receipt from ${client.name}`,
          reference: txn.reference,
          receivedDate: txn.date,
          bankTransactionId: txn.id,
          status: "RECEIVED",
        });
        created++;
      }

      res.json({ created, message: `Created ${created} RCTI records from bank transactions` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to auto-match RCTIs" });
    }
  });

  app.get("/api/profitability", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      const [allEmployees, allPlacements, allInvoices, allPayRuns, allBankTxns, allClients, allRctis, allTimesheets, allExpectedHours] = await Promise.all([
        storage.getEmployees(),
        storage.getAllPlacements(),
        storage.getInvoices(),
        storage.getPayRuns(),
        storage.getBankTransactions(),
        storage.getClients(),
        storage.getRctis(),
        storage.getTimesheets(),
        storage.getMonthlyExpectedHours({ month, year }),
      ]);

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

      const rows = relevantPlacements.map(placement => {
        const employee = allEmployees.find(e => e.id === placement.employeeId);
        if (!employee) return null;

        const client = allClients.find(c => c.id === placement.clientId);
        const clientName = placement.clientName || client?.name || "Unknown";

        const chargeOutRate = parseFloat(placement.chargeOutRate || employee.chargeOutRate || "0");

        const empInvoices = periodInvoices.filter(inv => {
          if (claimedInvoiceIds.has(inv.id)) return false;
          const invType = (inv as any).invoiceType;
          if (invType && invType !== "ACCREC") return false;
          if (inv.employeeId === employee.id && inv.contactName === clientName) return true;
          if (!inv.employeeId && inv.contactName === clientName) {
            const invRate = inv.hours && parseFloat(inv.hours) > 0
              ? parseFloat(inv.amountExclGst || "0") / parseFloat(inv.hours)
              : 0;
            return Math.abs(invRate - chargeOutRate) < 0.01;
          }
          return false;
        });
        empInvoices.forEach(inv => claimedInvoiceIds.add(inv.id));

        const invoiceRevenue = empInvoices.reduce((sum, inv) => sum + parseFloat(inv.amountExclGst || "0"), 0);
        const invoiceRevenueInclGst = empInvoices.reduce((sum, inv) => sum + parseFloat(inv.amountInclGst || "0"), 0);
        const invoiceHours = empInvoices.reduce((sum, inv) => sum + parseFloat(inv.hours || "0"), 0);

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

        const empPayLines = allPayRunLines.filter(pl => pl.line.employeeId === employee.id);

        const rawGrossEarnings = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.grossEarnings || "0"), 0);
        const superAmount = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.superAmount || "0"), 0);
        const netPay = empPayLines.reduce((sum, pl) => sum + parseFloat(pl.line.netPay || "0"), 0);
        const usedFallbackGross = rawGrossEarnings === 0 && netPay > 0 && superAmount > 0;
        const grossEarnings = usedFallbackGross ? netPay + superAmount : rawGrossEarnings;

        let totalEmployeeCost = usedFallbackGross ? grossEarnings : grossEarnings + superAmount;
        let costSource: "PAYROLL" | "CONTRACTOR_SPEND" = "PAYROLL";
        let contractorSpend = 0;
        let contractorSpendTxnCount = 0;
        let matchedSpendTxns: typeof periodBankTxns = [];

        if (employee.paymentMethod === "INVOICE" && employee.companyName) {
          const companyNorm = normalizeCompanyName(employee.companyName);
          matchedSpendTxns = periodBankTxns.filter(t =>
            !claimedBankTxnIds.has(t.id) &&
            t.type === "SPEND" &&
            t.contactName &&
            normalizeCompanyName(t.contactName) === companyNorm
          );
          matchedSpendTxns.forEach(t => claimedBankTxnIds.add(t.id));
          contractorSpend = matchedSpendTxns.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
          contractorSpendTxnCount = matchedSpendTxns.length;
          if (contractorSpend > 0) {
            totalEmployeeCost = contractorSpend;
            costSource = "CONTRACTOR_SPEND";
          }
        }

        const feePercent = parseFloat(employee.payrollFeePercent || "0");
        const payrollFeeRevenue = grossEarnings * (feePercent / 100);

        const profit = revenue - totalEmployeeCost;
        const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

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
            invoices: empInvoices.map(inv => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              contactName: inv.contactName,
              hours: inv.hours ? parseFloat(inv.hours) : 0,
              amountExclGst: parseFloat(inv.amountExclGst || "0"),
              amountInclGst: parseFloat(inv.amountInclGst || "0"),
              issueDate: inv.issueDate,
              status: inv.status,
              invoiceType: (inv as any).invoiceType || null,
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
            grossEarnings: Math.round(grossEarnings * 100) / 100,
            superAmount: Math.round(superAmount * 100) / 100,
            netPay: Math.round(netPay * 100) / 100,
            totalCost: Math.round(totalEmployeeCost * 100) / 100,
            costSource,
            contractorSpend: Math.round(contractorSpend * 100) / 100,
            contractorSpendTxnCount,
            payRunLines: empPayLines.map(pl => ({
              payRunId: pl.payRun.id,
              payDate: pl.payRun.payDate || null,
              grossEarnings: parseFloat(pl.line.grossEarnings || "0"),
              superAmount: parseFloat(pl.line.superAmount || "0"),
              netPay: parseFloat(pl.line.netPay || "0"),
            })),
            contractorTxns: matchedSpendTxns.map(t => ({
              id: t.id,
              contactName: t.contactName,
              amount: Math.abs(parseFloat(t.amount)),
              date: t.date,
              description: t.description,
              bankAccountName: t.bankAccountName,
            })),
          },
          payrollFeeRevenue: Math.round(payrollFeeRevenue * 100) / 100,
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
          profit: Math.round(profit * 100) / 100,
          marginPercent: Math.round(marginPercent * 10) / 10,
        };
      }).filter(Boolean);

      const totals = {
        totalRevenue: rows.reduce((s, r: any) => s + r.revenue.amountExGst, 0),
        totalCost: rows.reduce((s, r: any) => s + r.cost.totalCost, 0),
        totalProfit: rows.reduce((s, r: any) => s + r.profit, 0),
        totalCashReceived: rows.reduce((s, r: any) => s + r.cashReceived, 0),
        totalPayrollFees: rows.reduce((s, r: any) => s + r.payrollFeeRevenue, 0),
      };
      const avgMargin = totals.totalRevenue > 0 ? (totals.totalProfit / totals.totalRevenue) * 100 : 0;

      res.json({
        rows,
        totals: { ...totals, avgMargin: Math.round(avgMargin * 10) / 10 },
        period: { month, year },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch profitability data" });
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

      const linkage: Record<string, {
        status: "linked_invoice" | "linked_rcti" | "matched_contact" | "unlinked";
        invoiceId?: string;
        invoiceNumber?: string;
        rctiId?: string;
        contactName?: string;
        isRctiClient?: boolean;
        employees?: { id: string; name: string; placementId: string }[];
      }> = {};

      for (const txn of bankTxns) {
        const txnId = txn.id;

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

  return httpServer;
}
