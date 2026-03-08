import { db } from "./db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import {
  contractors, timesheets, invoices, payRuns, payRunLines, documents,
  notifications, messages, settings, users,
  leaveRequests, payItems, taxDeclarations, bankAccounts, superMemberships,
  type Contractor, type InsertContractor,
  type Timesheet, type InsertTimesheet,
  type Invoice, type InsertInvoice,
  type PayRun, type InsertPayRun,
  type PayRunLine, type InsertPayRunLine,
  type Document, type InsertDocument,
  type Notification, type InsertNotification,
  type Message, type InsertMessage,
  type Setting, type InsertSetting,
  type LeaveRequest, type InsertLeaveRequest,
  type PayItem, type InsertPayItem,
  type TaxDeclaration, type InsertTaxDeclaration,
  type BankAccount, type InsertBankAccount,
  type SuperMembership, type InsertSuperMembership,
  type User, type InsertUser,
} from "@shared/schema";

export interface IStorage {
  getContractors(): Promise<Contractor[]>;
  getContractor(id: string): Promise<Contractor | undefined>;
  getContractorByEmail(email: string): Promise<Contractor | undefined>;
  getContractorByXeroId(xeroEmployeeId: string): Promise<Contractor | undefined>;
  createContractor(data: InsertContractor): Promise<Contractor>;
  updateContractor(id: string, data: Partial<InsertContractor>): Promise<Contractor | undefined>;

  getTimesheets(): Promise<Timesheet[]>;
  getTimesheetsByContractor(contractorId: string): Promise<Timesheet[]>;
  getTimesheet(id: string): Promise<Timesheet | undefined>;
  createTimesheet(data: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: string, data: Partial<InsertTimesheet>): Promise<Timesheet | undefined>;

  getInvoices(): Promise<Invoice[]>;
  getInvoicesByContractor(contractorId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;
  getInvoiceByXeroId(xeroInvoiceId: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  getPayRuns(): Promise<PayRun[]>;
  getPayRun(id: string): Promise<PayRun | undefined>;
  createPayRun(data: InsertPayRun): Promise<PayRun>;
  updatePayRun(id: string, data: Partial<InsertPayRun>): Promise<PayRun | undefined>;

  getPayRunLines(payRunId: string): Promise<PayRunLine[]>;
  getPayRunLinesByContractor(contractorId: string): Promise<PayRunLine[]>;
  getPayRunLine(id: string): Promise<PayRunLine | undefined>;
  createPayRunLine(data: InsertPayRunLine): Promise<PayRunLine>;
  createPayRunLines(data: InsertPayRunLine[]): Promise<PayRunLine[]>;

  getDocuments(contractorId: string): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  deleteDocument(id: string): Promise<void>;

  getDashboardStats(): Promise<{
    activeContractors: number;
    pendingContractors: number;
    totalInvoices: number;
    totalBilled: string;
    totalPaid: string;
    paidInvoiceCount: number;
    outstandingInvoiceAmount: string;
    overdueAmount: string;
    payRunCount: number;
    payRunTotalGross: string;
    latestPayRunDate: string | null;
    submittedTimesheets: number;
    ytdBillings: string;
  }>;

  getNotifications(): Promise<Notification[]>;
  getUnreadNotificationCount(): Promise<number>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(): Promise<void>;
  createNotification(data: InsertNotification): Promise<Notification>;

  getMessages(): Promise<Message[]>;
  getMessagesByContractor(contractorId: string): Promise<Message[]>;
  createMessage(data: InsertMessage): Promise<Message>;
  markMessageRead(id: string): Promise<Message | undefined>;

  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  upsertSetting(key: string, value: string): Promise<Setting>;

  getLeaveRequests(): Promise<LeaveRequest[]>;
  getLeaveRequestsByContractor(contractorId: string): Promise<LeaveRequest[]>;
  createLeaveRequest(data: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, data: Partial<InsertLeaveRequest>): Promise<LeaveRequest | undefined>;

  getPayItems(): Promise<PayItem[]>;
  createPayItem(data: InsertPayItem): Promise<PayItem>;
  updatePayItem(id: string, data: Partial<InsertPayItem>): Promise<PayItem | undefined>;

  getTaxDeclaration(contractorId: string): Promise<TaxDeclaration | undefined>;
  upsertTaxDeclaration(data: InsertTaxDeclaration): Promise<TaxDeclaration>;

  getBankAccount(contractorId: string): Promise<BankAccount | undefined>;
  upsertBankAccount(data: InsertBankAccount): Promise<BankAccount>;

  getSuperMembership(contractorId: string): Promise<SuperMembership | undefined>;
  upsertSuperMembership(data: InsertSuperMembership): Promise<SuperMembership>;

  getOnboardingStatus(contractorId: string): Promise<{
    personal: boolean;
    tax: boolean;
    bank: boolean;
    super: boolean;
  }>;

  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  async getContractors(): Promise<Contractor[]> {
    return db.select().from(contractors).orderBy(desc(contractors.createdAt));
  }

  async getContractor(id: string): Promise<Contractor | undefined> {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.id, id));
    return contractor;
  }

  async getContractorByEmail(email: string): Promise<Contractor | undefined> {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.email, email));
    return contractor;
  }

  async getContractorByXeroId(xeroEmployeeId: string): Promise<Contractor | undefined> {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.xeroEmployeeId, xeroEmployeeId));
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

  async getInvoicesByContractor(contractorId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(eq(invoices.contractorId, contractorId))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber));
    return invoice;
  }

  async getInvoiceByXeroId(xeroInvoiceId: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.xeroInvoiceId, xeroInvoiceId));
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

  async updatePayRun(id: string, data: Partial<InsertPayRun>): Promise<PayRun | undefined> {
    const [payRun] = await db
      .update(payRuns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payRuns.id, id))
      .returning();
    return payRun;
  }

  async getPayRunLines(payRunId: string): Promise<PayRunLine[]> {
    return db.select().from(payRunLines)
      .where(eq(payRunLines.payRunId, payRunId))
      .orderBy(desc(payRunLines.createdAt));
  }

  async getPayRunLinesByContractor(contractorId: string): Promise<PayRunLine[]> {
    return db.select().from(payRunLines)
      .where(eq(payRunLines.contractorId, contractorId))
      .orderBy(desc(payRunLines.createdAt));
  }

  async getPayRunLine(id: string): Promise<PayRunLine | undefined> {
    const [line] = await db.select().from(payRunLines).where(eq(payRunLines.id, id));
    return line;
  }

  async createPayRunLine(data: InsertPayRunLine): Promise<PayRunLine> {
    const [line] = await db.insert(payRunLines).values(data).returning();
    return line;
  }

  async createPayRunLines(data: InsertPayRunLine[]): Promise<PayRunLine[]> {
    if (data.length === 0) return [];
    return db.insert(payRunLines).values(data).returning();
  }

  async getDocuments(contractorId: string): Promise<Document[]> {
    return db.select().from(documents)
      .where(eq(documents.contractorId, contractorId))
      .orderBy(desc(documents.createdAt));
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
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

    const currentYear = new Date().getFullYear();

    const [totalInvoicesResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text`,
      })
      .from(invoices)
      .where(sql`status != 'VOIDED'`);

    const [paidResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text`,
      })
      .from(invoices)
      .where(eq(invoices.status, "PAID"));

    const [outstandingResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(sql`status IN ('AUTHORISED', 'SENT', 'OVERDUE')`);

    const [overdueResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(eq(invoices.status, "OVERDUE"));

    const fyStart = new Date().getMonth() >= 6
      ? new Date(currentYear, 6, 1)
      : new Date(currentYear - 1, 6, 1);

    const [payRunFYResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalGross: sql<string>`COALESCE(SUM(total_gross), 0)::text`,
      })
      .from(payRuns)
      .where(sql`${payRuns.payDate} >= ${fyStart.toISOString().split("T")[0]}`);

    const latestPayRun = await db.select().from(payRuns)
      .orderBy(desc(payRuns.payDate))
      .limit(1);

    const [submittedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timesheets)
      .where(eq(timesheets.status, "SUBMITTED"));

    const [ytdBillingsResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "PAID"),
          sql`${invoices.paidDate} >= ${fyStart.toISOString().split("T")[0]}`
        )
      );

    return {
      activeContractors: activeResult?.count || 0,
      pendingContractors: pendingResult?.count || 0,
      totalInvoices: totalInvoicesResult?.count || 0,
      totalBilled: totalInvoicesResult?.total || "0",
      totalPaid: paidResult?.total || "0",
      paidInvoiceCount: paidResult?.count || 0,
      outstandingInvoiceAmount: outstandingResult?.total || "0",
      overdueAmount: overdueResult?.total || "0",
      payRunCount: payRunFYResult?.count || 0,
      payRunTotalGross: payRunFYResult?.totalGross || "0",
      latestPayRunDate: latestPayRun[0]?.payDate || null,
      submittedTimesheets: submittedResult?.count || 0,
      ytdBillings: ytdBillingsResult?.total || "0",
    };
  }

  async getNotifications(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.read, false));
    return result?.count || 0;
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async markAllNotificationsRead(): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async getMessages(): Promise<Message[]> {
    return db.select().from(messages).orderBy(desc(messages.createdAt));
  }

  async getMessagesByContractor(contractorId: string): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.contractorId, contractorId))
      .orderBy(desc(messages.createdAt));
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async markMessageRead(id: string): Promise<Message | undefined> {
    const [message] = await db
      .update(messages)
      .set({ read: true })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings).orderBy(settings.key);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async upsertSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(settings).values({ key, value }).returning();
    return created;
  }

  async getLeaveRequests(): Promise<LeaveRequest[]> {
    return db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt));
  }

  async getLeaveRequestsByContractor(contractorId: string): Promise<LeaveRequest[]> {
    return db.select().from(leaveRequests)
      .where(eq(leaveRequests.contractorId, contractorId))
      .orderBy(desc(leaveRequests.createdAt));
  }

  async createLeaveRequest(data: InsertLeaveRequest): Promise<LeaveRequest> {
    const [leave] = await db.insert(leaveRequests).values(data).returning();
    return leave;
  }

  async updateLeaveRequest(id: string, data: Partial<InsertLeaveRequest>): Promise<LeaveRequest | undefined> {
    const [leave] = await db
      .update(leaveRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(leaveRequests.id, id))
      .returning();
    return leave;
  }

  async getPayItems(): Promise<PayItem[]> {
    return db.select().from(payItems).orderBy(payItems.code);
  }

  async createPayItem(data: InsertPayItem): Promise<PayItem> {
    const [item] = await db.insert(payItems).values(data).returning();
    return item;
  }

  async updatePayItem(id: string, data: Partial<InsertPayItem>): Promise<PayItem | undefined> {
    const [item] = await db
      .update(payItems)
      .set(data)
      .where(eq(payItems.id, id))
      .returning();
    return item;
  }

  async getTaxDeclaration(contractorId: string): Promise<TaxDeclaration | undefined> {
    const [dec] = await db.select().from(taxDeclarations)
      .where(and(eq(taxDeclarations.contractorId, contractorId), eq(taxDeclarations.isCurrent, true)));
    return dec;
  }

  async upsertTaxDeclaration(data: InsertTaxDeclaration): Promise<TaxDeclaration> {
    const existing = await this.getTaxDeclaration(data.contractorId);
    if (existing) {
      const [updated] = await db
        .update(taxDeclarations)
        .set({ ...data })
        .where(eq(taxDeclarations.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(taxDeclarations).values(data).returning();
    return created;
  }

  async getBankAccount(contractorId: string): Promise<BankAccount | undefined> {
    const [acc] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.contractorId, contractorId), eq(bankAccounts.isPrimary, true)));
    return acc;
  }

  async upsertBankAccount(data: InsertBankAccount): Promise<BankAccount> {
    const existing = await this.getBankAccount(data.contractorId);
    if (existing) {
      const [updated] = await db
        .update(bankAccounts)
        .set({ ...data })
        .where(eq(bankAccounts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(bankAccounts).values(data).returning();
    return created;
  }

  async getSuperMembership(contractorId: string): Promise<SuperMembership | undefined> {
    const [mem] = await db.select().from(superMemberships)
      .where(and(eq(superMemberships.contractorId, contractorId), eq(superMemberships.isDefault, true)));
    return mem;
  }

  async upsertSuperMembership(data: InsertSuperMembership): Promise<SuperMembership> {
    const existing = await this.getSuperMembership(data.contractorId);
    if (existing) {
      const [updated] = await db
        .update(superMemberships)
        .set({ ...data })
        .where(eq(superMemberships.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(superMemberships).values(data).returning();
    return created;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getOnboardingStatus(contractorId: string): Promise<{
    personal: boolean;
    tax: boolean;
    bank: boolean;
    super: boolean;
  }> {
    const contractor = await this.getContractor(contractorId);
    const tax = await this.getTaxDeclaration(contractorId);
    const bank = await this.getBankAccount(contractorId);
    const superMem = await this.getSuperMembership(contractorId);

    return {
      personal: !!(contractor?.dateOfBirth && contractor?.addressLine1),
      tax: !!tax,
      bank: !!bank,
      super: !!superMem,
    };
  }
}

export const storage = new DatabaseStorage();
