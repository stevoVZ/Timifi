import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  contractors, timesheets, invoices, payRuns,
  type Contractor, type InsertContractor,
  type Timesheet, type InsertTimesheet,
  type Invoice, type InsertInvoice,
  type PayRun, type InsertPayRun,
} from "@shared/schema";

export interface IStorage {
  getContractors(): Promise<Contractor[]>;
  getContractor(id: string): Promise<Contractor | undefined>;
  createContractor(data: InsertContractor): Promise<Contractor>;
  updateContractor(id: string, data: Partial<InsertContractor>): Promise<Contractor | undefined>;

  getTimesheets(): Promise<Timesheet[]>;
  getTimesheetsByContractor(contractorId: string): Promise<Timesheet[]>;
  getTimesheet(id: string): Promise<Timesheet | undefined>;
  createTimesheet(data: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: string, data: Partial<InsertTimesheet>): Promise<Timesheet | undefined>;

  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  getPayRuns(): Promise<PayRun[]>;
  getPayRun(id: string): Promise<PayRun | undefined>;
  createPayRun(data: InsertPayRun): Promise<PayRun>;

  getDashboardStats(): Promise<{
    activeContractors: number;
    pendingContractors: number;
    timesheetsDue: number;
    outstandingInvoiceAmount: string;
    overdueAmount: string;
    nextPayRunDate: string | null;
    nextPayRunCount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getContractors(): Promise<Contractor[]> {
    return db.select().from(contractors).orderBy(desc(contractors.createdAt));
  }

  async getContractor(id: string): Promise<Contractor | undefined> {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.id, id));
    return contractor;
  }

  async createContractor(data: InsertContractor): Promise<Contractor> {
    const [contractor] = await db.insert(contractors).values(data).returning();
    return contractor;
  }

  async updateContractor(id: string, data: Partial<InsertContractor>): Promise<Contractor | undefined> {
    const [contractor] = await db
      .update(contractors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contractors.id, id))
      .returning();
    return contractor;
  }

  async getTimesheets(): Promise<Timesheet[]> {
    return db.select().from(timesheets).orderBy(desc(timesheets.createdAt));
  }

  async getTimesheetsByContractor(contractorId: string): Promise<Timesheet[]> {
    return db.select().from(timesheets)
      .where(eq(timesheets.contractorId, contractorId))
      .orderBy(desc(timesheets.createdAt));
  }

  async getTimesheet(id: string): Promise<Timesheet | undefined> {
    const [timesheet] = await db.select().from(timesheets).where(eq(timesheets.id, id));
    return timesheet;
  }

  async createTimesheet(data: InsertTimesheet): Promise<Timesheet> {
    const [timesheet] = await db.insert(timesheets).values(data).returning();
    return timesheet;
  }

  async updateTimesheet(id: string, data: Partial<InsertTimesheet>): Promise<Timesheet | undefined> {
    const [timesheet] = await db
      .update(timesheets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(timesheets.id, id))
      .returning();
    return timesheet;
  }

  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(data).returning();
    return invoice;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [invoice] = await db
      .update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async getPayRuns(): Promise<PayRun[]> {
    return db.select().from(payRuns).orderBy(desc(payRuns.createdAt));
  }

  async getPayRun(id: string): Promise<PayRun | undefined> {
    const [payRun] = await db.select().from(payRuns).where(eq(payRuns.id, id));
    return payRun;
  }

  async createPayRun(data: InsertPayRun): Promise<PayRun> {
    const [payRun] = await db.insert(payRuns).values(data).returning();
    return payRun;
  }

  async getDashboardStats() {
    const [activeResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contractors)
      .where(eq(contractors.status, "ACTIVE"));

    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contractors)
      .where(eq(contractors.status, "PENDING_SETUP"));

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [timesheetsDueResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timesheets)
      .where(
        and(
          eq(timesheets.year, currentYear),
          eq(timesheets.month, currentMonth),
          eq(timesheets.status, "DRAFT")
        )
      );

    const [outstandingResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(sql`status IN ('AUTHORISED', 'SENT', 'OVERDUE')`);

    const [overdueResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(eq(invoices.status, "OVERDUE"));

    const nextPayRun = await db.select().from(payRuns)
      .where(eq(payRuns.status, "DRAFT"))
      .orderBy(payRuns.payDate)
      .limit(1);

    return {
      activeContractors: activeResult?.count || 0,
      pendingContractors: pendingResult?.count || 0,
      timesheetsDue: timesheetsDueResult?.count || 0,
      outstandingInvoiceAmount: outstandingResult?.total || "0",
      overdueAmount: overdueResult?.total || "0",
      nextPayRunDate: nextPayRun[0]?.payDate || null,
      nextPayRunCount: nextPayRun[0]?.employeeCount || 0,
    };
  }
}

export const storage = new DatabaseStorage();
