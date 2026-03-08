import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContractorSchema, insertTimesheetSchema, insertInvoiceSchema, insertPayRunSchema, insertNotificationSchema, insertMessageSchema, insertLeaveRequestSchema, insertPayItemSchema, insertTaxDeclarationSchema, insertBankAccountSchema, insertSuperMembershipSchema, insertPayRunLineSchema, insertDocumentSchema } from "@shared/schema";
import { generatePayslipHTML, generatePayslipPDF, buildPayslipData } from "./payslip";
import { buildABAFromPayRun, type ABAHeader } from "./aba";
import { getConsentUrl, handleCallback, isConnected, disconnect, syncEmployees, getCallbackUri, getTenants, selectTenant, syncPayRuns, syncTimesheets, syncPayrollSettings, syncInvoices } from "./xero";
import { requireAuth } from "./auth";

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

  app.get("/api/contractors", async (_req, res) => {
    try {
      const data = await storage.getContractors();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch contractors" });
    }
  });

  app.get("/api/contractors/stats", async (_req, res) => {
    try {
      const allContractors = await storage.getContractors();
      const allTimesheets = await storage.getTimesheets();
      const currentYear = new Date().getFullYear();
      const approvedTs = allTimesheets.filter(t => t.status === "APPROVED" && t.year === currentYear);
      const ytdByContractor: Record<string, number> = {};
      for (const t of approvedTs) {
        ytdByContractor[t.contractorId] = (ytdByContractor[t.contractorId] || 0) + parseFloat(t.totalHours);
      }
      const stats = allContractors.map(c => ({
        ...c,
        ytdHours: ytdByContractor[c.id] || 0,
        ytdBillings: (ytdByContractor[c.id] || 0) * (c.hourlyRate ? parseFloat(c.hourlyRate) : 0),
      }));
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch contractor stats" });
    }
  });

  app.get("/api/contractors/:id", async (req, res) => {
    try {
      const contractor = await storage.getContractor(req.params.id);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      res.json(contractor);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch contractor" });
    }
  });

  app.post("/api/contractors", async (req, res) => {
    try {
      const parsed = insertContractorSchema.parse(req.body);
      const contractor = await storage.createContractor(parsed);
      res.status(201).json(contractor);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid contractor data" });
    }
  });

  app.patch("/api/contractors/:id", async (req, res) => {
    try {
      const existing = await storage.getContractor(req.params.id);
      if (!existing) return res.status(404).json({ message: "Contractor not found" });

      if (existing.xeroEmployeeId) {
        const xeroLockedFields = ["firstName", "lastName", "email", "phone", "jobTitle", "hourlyRate", "startDate", "endDate", "dateOfBirth", "gender", "addressLine1", "suburb", "state", "postcode", "payFrequency"];
        const body = { ...req.body };
        for (const field of xeroLockedFields) {
          delete body[field];
        }
        const contractor = await storage.updateContractor(req.params.id, body);
        res.json(contractor);
      } else {
        const contractor = await storage.updateContractor(req.params.id, req.body);
        res.json(contractor!);
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update contractor" });
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

  app.get("/api/timesheets/contractor/:contractorId", async (req, res) => {
    try {
      const data = await storage.getTimesheetsByContractor(req.params.contractorId);
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

  app.post("/api/timesheets", async (req, res) => {
    try {
      const { fileData, fileType: uploadedFileType, ...timesheetData } = req.body;
      const parsed = insertTimesheetSchema.parse(timesheetData);
      const timesheet = await storage.createTimesheet(parsed);

      if (fileData && parsed.fileName && parsed.contractorId) {
        await storage.createDocument({
          contractorId: parsed.contractorId,
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

  app.patch("/api/timesheets/:id", async (req, res) => {
    try {
      const timesheet = await storage.updateTimesheet(req.params.id, req.body);
      if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });
      res.json(timesheet);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update timesheet" });
    }
  });

  app.get("/api/invoices", async (_req, res) => {
    try {
      const data = await storage.getInvoices();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const parsed = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(parsed);
      res.status(201).json(invoice);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid invoice data" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.updateInvoice(req.params.id, req.body);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update invoice" });
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

  app.get("/api/messages/contractor/:contractorId", async (req, res) => {
    try {
      const data = await storage.getMessagesByContractor(req.params.contractorId);
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

  app.get("/api/invoices/contractor/:contractorId", async (req, res) => {
    try {
      const data = await storage.getInvoicesByContractor(req.params.contractorId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/portal/login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const allContractors = await storage.getContractors();
      const contractor = allContractors.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (!contractor) return res.status(401).json({ message: "No contractor found with that email" });
      res.json({
        contractorId: contractor.id,
        name: `${contractor.firstName} ${contractor.lastName}`,
      });
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/portal/contractor/:contractorId/stats", async (req, res) => {
    try {
      const contractor = await storage.getContractor(req.params.contractorId);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      const ts = await storage.getTimesheetsByContractor(req.params.contractorId);
      const msgs = await storage.getMessagesByContractor(req.params.contractorId);
      const payRunLines = await storage.getPayRunLinesByContractor(req.params.contractorId);
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const currentTs = ts.find(t => t.year === currentYear && t.month === currentMonth);
      const pendingTs = ts.filter(t => t.status === "DRAFT" || t.status === "SUBMITTED").length;
      const unreadMsgs = msgs.filter(m => !m.read && m.senderRole === "admin").length;
      const approvedTs = ts.filter(t => t.status === "APPROVED" && t.year === currentYear);
      const ytdHours = approvedTs.reduce((s, t) => s + parseFloat(t.totalHours), 0);
      const rate = contractor.hourlyRate ? parseFloat(contractor.hourlyRate) : 0;
      const ytdGross = ytdHours * rate;
      const contractHoursPA = contractor.contractHoursPA ? parseFloat(contractor.contractHoursPA as string) : 2000;

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
        contractor,
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

  app.get("/api/leave/contractor/:contractorId", async (req, res) => {
    try {
      const data = await storage.getLeaveRequestsByContractor(req.params.contractorId);
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

  app.get("/api/onboarding/:contractorId", async (req, res) => {
    try {
      const status = await storage.getOnboardingStatus(req.params.contractorId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  app.post("/api/onboarding/personal", async (req, res) => {
    try {
      const { contractorId, ...data } = req.body;
      if (!contractorId) return res.status(400).json({ message: "contractorId is required" });
      const contractor = await storage.updateContractor(contractorId, data);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      res.json(contractor);
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

  app.get("/api/portal/contractor/:contractorId/tax", async (req, res) => {
    try {
      const dec = await storage.getTaxDeclaration(req.params.contractorId);
      res.json(dec || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch tax declaration" });
    }
  });

  app.get("/api/portal/contractor/:contractorId/bank", async (req, res) => {
    try {
      const acc = await storage.getBankAccount(req.params.contractorId);
      res.json(acc || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bank account" });
    }
  });

  app.get("/api/portal/contractor/:contractorId/super", async (req, res) => {
    try {
      const mem = await storage.getSuperMembership(req.params.contractorId);
      res.json(mem || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch super membership" });
    }
  });

  app.get("/api/pay-runs/:id/lines", async (req, res) => {
    try {
      const lines = await storage.getPayRunLines(req.params.id);
      const contractorIds = [...new Set(lines.map((l) => l.contractorId))];
      const allContractors = await storage.getContractors();
      const contractorMap = new Map(allContractors.map((c) => [c.id, c]));
      const enriched = lines.map((l) => ({
        ...l,
        contractor: contractorMap.get(l.contractorId) || null,
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
        const contractor = await storage.getContractor(ts.contractorId);
        if (!contractor) continue;
        const hours = parseFloat(ts.totalHours);
        const rate = parseFloat(contractor.hourlyRate || "0");
        const gross = hours * rate;
        const annualised = gross * 12;
        const paygAnnual = estimatePayg(annualised);
        const payg = Math.round(paygAnnual / 12);
        const superAmt = Math.round(gross * superRate);
        const net = gross - payg;

        lineData.push({
          payRunId: payRun.id,
          contractorId: ts.contractorId,
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
      const contractorId = req.query.contractorId as string | undefined;
      let lines;
      if (contractorId) {
        lines = await storage.getPayRunLinesByContractor(contractorId);
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

      if (contractorId) {
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

      const contractor = await storage.getContractor(line.contractorId);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });

      const bank = await storage.getBankAccount(line.contractorId);

      const allSettings = await storage.getSettings();
      const settingsMap: Record<string, string> = {};
      for (const s of allSettings) {
        settingsMap[s.key] = s.value;
      }

      const allLines = await storage.getPayRunLinesByContractor(line.contractorId);
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
        contractor,
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
        const contractor = await storage.getContractor(line.contractorId);
        if (!contractor) continue;
        const bank = await storage.getBankAccount(line.contractorId);
        if (!bank) {
          missing.push(`${contractor.firstName} ${contractor.lastName}`);
          continue;
        }

        const payslipNum = `PS-${payRun.year}-${String(payRun.month).padStart(2, "0")}-${String(lineIdx++).padStart(3, "0")}`;
        abaLines.push({
          contractorName: `${contractor.firstName} ${contractor.lastName}`,
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

  app.get("/api/documents/:contractorId", async (req, res) => {
    try {
      const docs = await storage.getDocuments(req.params.contractorId);
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents/:contractorId", async (req, res) => {
    try {
      const parsed = insertDocumentSchema.safeParse({
        ...req.body,
        contractorId: req.params.contractorId,
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

  return httpServer;
}
