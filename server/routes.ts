import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContractorSchema, insertTimesheetSchema, insertInvoiceSchema, insertPayRunSchema } from "@shared/schema";

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

  return httpServer;
}
