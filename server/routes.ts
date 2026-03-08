import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContractorSchema, insertTimesheetSchema, insertInvoiceSchema, insertPayRunSchema, insertNotificationSchema, insertMessageSchema, insertLeaveRequestSchema, insertPayItemSchema, insertTaxDeclarationSchema, insertBankAccountSchema, insertSuperMembershipSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      const contractor = await storage.updateContractor(req.params.id, req.body);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      res.json(contractor);
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
      const parsed = insertTimesheetSchema.parse(req.body);
      const timesheet = await storage.createTimesheet(parsed);
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
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const currentTs = ts.find(t => t.year === currentYear && t.month === currentMonth);
      const pendingTs = ts.filter(t => t.status === "DRAFT" || t.status === "SUBMITTED").length;
      const unreadMsgs = msgs.filter(m => !m.read && m.senderRole === "admin").length;
      res.json({
        contractor,
        hoursThisMonth: currentTs ? parseFloat(currentTs.totalHours) : 0,
        pendingTimesheets: pendingTs,
        unreadMessages: unreadMsgs,
        totalTimesheets: ts.length,
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

  return httpServer;
}
