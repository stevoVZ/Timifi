import { db } from "./db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import {
  employees, timesheets, invoices, payRuns, payRunLines, documents,
  notifications, messages, settings, users,
  leaveRequests, payItems, taxDeclarations, bankAccounts, superMemberships,
  clients, placements, bankTransactions, payslipLines, rateHistory, timesheetAuditLog,
  invoiceEmployees, rctis, invoiceLineItems, invoicePayments,
  type Employee, type InsertEmployee,
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
  type Client, type InsertClient,
  type Placement, type InsertPlacement,
  type BankTransaction, type InsertBankTransaction,
  type PayslipLine, type InsertPayslipLine,
  type RateHistory, type InsertRateHistory,
  type TimesheetAuditLog, type InsertTimesheetAuditLog,
  type InvoiceEmployee,
  type Rcti, type InsertRcti,
  type InvoiceLineItem, type InsertInvoiceLineItem,
  type InvoicePayment, type InsertInvoicePayment,
  type MonthlyExpectedHours, type InsertMonthlyExpectedHours,
  monthlyExpectedHours,
  type PayrollTaxRate, type InsertPayrollTaxRate,
  payrollTaxRates,
} from "@shared/schema";

let _cachedTenantId: string | null = null;

export async function getActiveTenantId(): Promise<string | null> {
  if (_cachedTenantId) return _cachedTenantId;
  const [row] = await db.select().from(settings).where(eq(settings.key, "xero.tenantId"));
  _cachedTenantId = row?.value || null;
  return _cachedTenantId;
}

export function setActiveTenantId(id: string | null) {
  _cachedTenantId = id;
}

export interface IStorage {
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByEmail(email: string): Promise<Employee | undefined>;
  getEmployeeByXeroId(xeroEmployeeId: string): Promise<Employee | undefined>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined>;

  getTimesheets(): Promise<Timesheet[]>;
  getTimesheetsByEmployee(employeeId: string): Promise<Timesheet[]>;
  getTimesheet(id: string): Promise<Timesheet | undefined>;
  createTimesheet(data: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: string, data: Partial<InsertTimesheet>): Promise<Timesheet | undefined>;
  deleteTimesheet(id: string): Promise<void>;

  createTimesheetAuditLogs(entries: InsertTimesheetAuditLog[]): Promise<TimesheetAuditLog[]>;
  getTimesheetAuditLogs(timesheetId: string): Promise<TimesheetAuditLog[]>;
  getTimesheetAuditLogsByEmployee(employeeId: string): Promise<TimesheetAuditLog[]>;

  getInvoices(): Promise<Invoice[]>;
  getInvoicesByEmployee(employeeId: string): Promise<Invoice[]>;
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
  getPayRunLinesByEmployee(employeeId: string): Promise<PayRunLine[]>;
  getPayRunLine(id: string): Promise<PayRunLine | undefined>;
  createPayRunLine(data: InsertPayRunLine): Promise<PayRunLine>;
  createPayRunLines(data: InsertPayRunLine[]): Promise<PayRunLine[]>;
  deletePayRunLines(payRunId: string): Promise<void>;

  getDocuments(employeeId: string): Promise<Document[]>;
  getDocumentsByTimesheetId(timesheetId: string): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  deleteDocument(id: string): Promise<void>;

  getDashboardStats(): Promise<{
    activeEmployees: number;
    pendingEmployees: number;
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
  getMessagesByEmployee(employeeId: string): Promise<Message[]>;
  createMessage(data: InsertMessage): Promise<Message>;
  markMessageRead(id: string): Promise<Message | undefined>;

  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  upsertSetting(key: string, value: string): Promise<Setting>;

  getLeaveRequests(): Promise<LeaveRequest[]>;
  getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]>;
  createLeaveRequest(data: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, data: Partial<InsertLeaveRequest>): Promise<LeaveRequest | undefined>;

  getPayItems(): Promise<PayItem[]>;
  createPayItem(data: InsertPayItem): Promise<PayItem>;
  updatePayItem(id: string, data: Partial<InsertPayItem>): Promise<PayItem | undefined>;

  getTaxDeclaration(employeeId: string): Promise<TaxDeclaration | undefined>;
  upsertTaxDeclaration(data: InsertTaxDeclaration): Promise<TaxDeclaration>;

  getBankAccount(employeeId: string): Promise<BankAccount | undefined>;
  upsertBankAccount(data: InsertBankAccount): Promise<BankAccount>;

  getSuperMembership(employeeId: string): Promise<SuperMembership | undefined>;
  upsertSuperMembership(data: InsertSuperMembership): Promise<SuperMembership>;

  getOnboardingStatus(employeeId: string): Promise<{
    personal: boolean;
    tax: boolean;
    bank: boolean;
    super: boolean;
  }>;

  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  getClientByXeroId(xeroContactId: string): Promise<Client | undefined>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined>;

  getAllPlacements(): Promise<Placement[]>;
  getPlacements(employeeId: string): Promise<Placement[]>;
  getPlacement(id: string): Promise<Placement | undefined>;
  createPlacement(data: InsertPlacement): Promise<Placement>;
  updatePlacement(id: string, data: Partial<InsertPlacement>): Promise<Placement | undefined>;

  getBankTransactions(): Promise<BankTransaction[]>;
  getBankTransactionByXeroId(xeroId: string): Promise<BankTransaction | undefined>;
  createBankTransaction(data: InsertBankTransaction): Promise<BankTransaction>;
  updateBankTransaction(id: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction | undefined>;

  getPayslipLines(payRunLineId: string): Promise<PayslipLine[]>;
  createPayslipLines(data: InsertPayslipLine[]): Promise<PayslipLine[]>;
  deletePayslipLinesByPayRunLine(payRunLineId: string): Promise<void>;

  getRateHistory(employeeId: string): Promise<RateHistory[]>;
  getLatestRateHistory(employeeId: string): Promise<RateHistory | undefined>;
  createRateHistory(data: InsertRateHistory): Promise<RateHistory>;

  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  getInvoiceEmployees(invoiceId: string): Promise<InvoiceEmployee[]>;
  getInvoiceEmployeesByInvoice(invoiceIds: string[]): Promise<InvoiceEmployee[]>;
  getAllInvoiceEmployees(): Promise<InvoiceEmployee[]>;
  setInvoiceEmployees(invoiceId: string, employeeIds: string[]): Promise<InvoiceEmployee[]>;
  getInvoiceIdsByEmployee(employeeId: string): Promise<string[]>;

  getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]>;
  setInvoiceLineItems(invoiceId: string, items: InsertInvoiceLineItem[]): Promise<InvoiceLineItem[]>;

  getInvoicePayments(invoiceId: string): Promise<InvoicePayment[]>;
  getAllInvoicePayments(): Promise<InvoicePayment[]>;
  setInvoicePayments(invoiceId: string, payments: InsertInvoicePayment[]): Promise<InvoicePayment[]>;

  getRctis(): Promise<Rcti[]>;
  getRctisByEmployee(employeeId: string): Promise<Rcti[]>;
  getRctisByClient(clientId: string): Promise<Rcti[]>;
  createRcti(data: InsertRcti): Promise<Rcti>;
  updateRcti(id: string, data: Partial<InsertRcti>): Promise<Rcti | undefined>;
  deleteRcti(id: string): Promise<void>;

  getMonthlyExpectedHours(filters?: { employeeId?: string; month?: number; year?: number }): Promise<MonthlyExpectedHours[]>;
  upsertMonthlyExpectedHours(data: InsertMonthlyExpectedHours): Promise<MonthlyExpectedHours>;
  deleteMonthlyExpectedHours(id: string): Promise<void>;

  getPayrollTaxRates(): Promise<PayrollTaxRate[]>;
  getPayrollTaxRate(id: string): Promise<PayrollTaxRate | undefined>;
  createPayrollTaxRate(data: InsertPayrollTaxRate): Promise<PayrollTaxRate>;
  updatePayrollTaxRate(id: string, data: Partial<InsertPayrollTaxRate>): Promise<PayrollTaxRate | undefined>;
  deletePayrollTaxRate(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private async tid() {
    return getActiveTenantId();
  }

  private tenantFilter(table: any) {
    return async () => {
      const t = await this.tid();
      return t ? eq(table.tenantId, t) : undefined;
    };
  }

  async getEmployees(): Promise<Employee[]> {
    const t = await this.tid();
    if (t) return db.select().from(employees).where(eq(employees.tenantId, t)).orderBy(desc(employees.createdAt));
    return db.select().from(employees).orderBy(desc(employees.createdAt));
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const t = await this.tid();
    const conds = [eq(employees.id, id)];
    if (t) conds.push(eq(employees.tenantId, t));
    const [employee] = await db.select().from(employees).where(and(...conds));
    return employee;
  }

  async getEmployeeByEmail(email: string): Promise<Employee | undefined> {
    const t = await this.tid();
    const conds = [eq(employees.email, email)];
    if (t) conds.push(eq(employees.tenantId, t));
    const [employee] = await db.select().from(employees).where(and(...conds));
    return employee;
  }

  async getEmployeeByXeroId(xeroEmployeeId: string): Promise<Employee | undefined> {
    const t = await this.tid();
    const conds = [eq(employees.xeroEmployeeId, xeroEmployeeId)];
    if (t) conds.push(eq(employees.tenantId, t));
    const [employee] = await db.select().from(employees).where(and(...conds));
    return employee;
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const t = await this.tid();
    const [employee] = await db.insert(employees).values({ ...data, tenantId: t }).returning();
    return employee;
  }

  async updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [employee] = await db
      .update(employees)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    return employee;
  }

  async getTimesheets(): Promise<Timesheet[]> {
    const t = await this.tid();
    if (t) return db.select().from(timesheets).where(eq(timesheets.tenantId, t)).orderBy(desc(timesheets.createdAt));
    return db.select().from(timesheets).orderBy(desc(timesheets.createdAt));
  }

  async getTimesheetsByEmployee(employeeId: string): Promise<Timesheet[]> {
    const t = await this.tid();
    const conds = [eq(timesheets.employeeId, employeeId)];
    if (t) conds.push(eq(timesheets.tenantId, t));
    return db.select().from(timesheets).where(and(...conds)).orderBy(desc(timesheets.createdAt));
  }

  async getTimesheet(id: string): Promise<Timesheet | undefined> {
    const t = await this.tid();
    const conds = [eq(timesheets.id, id)];
    if (t) conds.push(eq(timesheets.tenantId, t));
    const [timesheet] = await db.select().from(timesheets).where(and(...conds));
    return timesheet;
  }

  async createTimesheet(data: InsertTimesheet): Promise<Timesheet> {
    const t = await this.tid();
    const [timesheet] = await db.insert(timesheets).values({ ...data, tenantId: t }).returning();
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

  async deleteTimesheet(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.timesheetId, id));
    await db.delete(timesheetAuditLog).where(eq(timesheetAuditLog.timesheetId, id));
    await db.delete(timesheets).where(eq(timesheets.id, id));
  }

  async createTimesheetAuditLogs(entries: InsertTimesheetAuditLog[]): Promise<TimesheetAuditLog[]> {
    if (entries.length === 0) return [];
    const t = await this.tid();
    const stamped = entries.map(e => ({ ...e, tenantId: t }));
    return db.insert(timesheetAuditLog).values(stamped).returning();
  }

  async getTimesheetAuditLogs(timesheetId: string): Promise<TimesheetAuditLog[]> {
    const t = await this.tid();
    const conds = [eq(timesheetAuditLog.timesheetId, timesheetId)];
    if (t) conds.push(eq(timesheetAuditLog.tenantId, t));
    return db.select().from(timesheetAuditLog).where(and(...conds)).orderBy(desc(timesheetAuditLog.createdAt));
  }

  async getTimesheetAuditLogsByEmployee(employeeId: string): Promise<TimesheetAuditLog[]> {
    const t = await this.tid();
    const conds = [eq(timesheetAuditLog.employeeId, employeeId)];
    if (t) conds.push(eq(timesheetAuditLog.tenantId, t));
    return db.select().from(timesheetAuditLog).where(and(...conds)).orderBy(desc(timesheetAuditLog.createdAt));
  }

  async getInvoices(): Promise<Invoice[]> {
    const t = await this.tid();
    if (t) return db.select().from(invoices).where(eq(invoices.tenantId, t)).orderBy(desc(invoices.createdAt));
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByEmployee(employeeId: string): Promise<Invoice[]> {
    const t = await this.tid();
    const conds = [eq(invoices.employeeId, employeeId)];
    if (t) conds.push(eq(invoices.tenantId, t));
    return db.select().from(invoices).where(and(...conds)).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const t = await this.tid();
    const conds = [eq(invoices.id, id)];
    if (t) conds.push(eq(invoices.tenantId, t));
    const [invoice] = await db.select().from(invoices).where(and(...conds));
    return invoice;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    const t = await this.tid();
    const conds = [eq(invoices.invoiceNumber, invoiceNumber)];
    if (t) conds.push(eq(invoices.tenantId, t));
    const [invoice] = await db.select().from(invoices).where(and(...conds));
    return invoice;
  }

  async getInvoiceByXeroId(xeroInvoiceId: string): Promise<Invoice | undefined> {
    const t = await this.tid();
    const conds = [eq(invoices.xeroInvoiceId, xeroInvoiceId)];
    if (t) conds.push(eq(invoices.tenantId, t));
    const [invoice] = await db.select().from(invoices).where(and(...conds));
    return invoice;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const t = await this.tid();
    const [invoice] = await db.insert(invoices).values({ ...data, tenantId: t }).returning();
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
    const t = await this.tid();
    if (t) return db.select().from(payRuns).where(eq(payRuns.tenantId, t)).orderBy(desc(payRuns.createdAt));
    return db.select().from(payRuns).orderBy(desc(payRuns.createdAt));
  }

  async getPayRun(id: string): Promise<PayRun | undefined> {
    const t = await this.tid();
    const conds = [eq(payRuns.id, id)];
    if (t) conds.push(eq(payRuns.tenantId, t));
    const [payRun] = await db.select().from(payRuns).where(and(...conds));
    return payRun;
  }

  async createPayRun(data: InsertPayRun): Promise<PayRun> {
    const t = await this.tid();
    const [payRun] = await db.insert(payRuns).values({ ...data, tenantId: t }).returning();
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
    const t = await this.tid();
    const conds = [eq(payRunLines.payRunId, payRunId)];
    if (t) conds.push(eq(payRunLines.tenantId, t));
    return db.select().from(payRunLines).where(and(...conds)).orderBy(desc(payRunLines.createdAt));
  }

  async getPayRunLinesByEmployee(employeeId: string): Promise<PayRunLine[]> {
    const t = await this.tid();
    const conds = [eq(payRunLines.employeeId, employeeId)];
    if (t) conds.push(eq(payRunLines.tenantId, t));
    return db.select().from(payRunLines).where(and(...conds)).orderBy(desc(payRunLines.createdAt));
  }

  async getPayRunLine(id: string): Promise<PayRunLine | undefined> {
    const t = await this.tid();
    const conds = [eq(payRunLines.id, id)];
    if (t) conds.push(eq(payRunLines.tenantId, t));
    const [line] = await db.select().from(payRunLines).where(and(...conds));
    return line;
  }

  async createPayRunLine(data: InsertPayRunLine): Promise<PayRunLine> {
    const t = await this.tid();
    const [line] = await db.insert(payRunLines).values({ ...data, tenantId: t }).returning();
    return line;
  }

  async createPayRunLines(data: InsertPayRunLine[]): Promise<PayRunLine[]> {
    if (data.length === 0) return [];
    const t = await this.tid();
    const stamped = data.map(d => ({ ...d, tenantId: t }));
    return db.insert(payRunLines).values(stamped).returning();
  }

  async deletePayRunLines(payRunId: string): Promise<void> {
    const lines = await db.select({ id: payRunLines.id }).from(payRunLines).where(eq(payRunLines.payRunId, payRunId));
    if (lines.length > 0) {
      const lineIds = lines.map(l => l.id);
      await db.delete(payslipLines).where(inArray(payslipLines.payRunLineId, lineIds));
    }
    await db.delete(payRunLines).where(eq(payRunLines.payRunId, payRunId));
  }

  async getDocuments(employeeId: string): Promise<Document[]> {
    const t = await this.tid();
    const conds = [eq(documents.employeeId, employeeId)];
    if (t) conds.push(eq(documents.tenantId, t));
    return db.select().from(documents).where(and(...conds)).orderBy(desc(documents.createdAt));
  }

  async getDocumentsByTimesheetId(timesheetId: string): Promise<Document[]> {
    const t = await this.tid();
    const conds = [eq(documents.timesheetId, timesheetId)];
    if (t) conds.push(eq(documents.tenantId, t));
    return db.select().from(documents).where(and(...conds)).orderBy(desc(documents.createdAt));
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const t = await this.tid();
    const [doc] = await db.insert(documents).values({ ...data, tenantId: t }).returning();
    return doc;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getDashboardStats() {
    const t = await this.tid();
    const tCond = (table: any) => t ? eq(table.tenantId, t) : undefined;

    const [activeResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.status, "ACTIVE"), tCond(employees)));

    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.status, "PENDING_SETUP"), tCond(employees)));

    const currentYear = new Date().getFullYear();

    const [totalInvoicesResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text`,
      })
      .from(invoices)
      .where(and(sql`status != 'VOIDED'`, tCond(invoices)));

    const [paidResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text`,
      })
      .from(invoices)
      .where(and(eq(invoices.status, "PAID"), tCond(invoices)));

    const [outstandingResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(and(sql`status IN ('AUTHORISED', 'SENT', 'OVERDUE')`, tCond(invoices)));

    const [overdueResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(and(eq(invoices.status, "OVERDUE"), tCond(invoices)));

    const fyStart = new Date().getMonth() >= 6
      ? new Date(currentYear, 6, 1)
      : new Date(currentYear - 1, 6, 1);

    const [payRunFYResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalGross: sql<string>`COALESCE(SUM(total_gross), 0)::text`,
      })
      .from(payRuns)
      .where(and(sql`${payRuns.payDate} >= ${fyStart.toISOString().split("T")[0]}`, tCond(payRuns)));

    const latestPayRunQuery = t
      ? db.select().from(payRuns).where(eq(payRuns.tenantId, t)).orderBy(desc(payRuns.payDate)).limit(1)
      : db.select().from(payRuns).orderBy(desc(payRuns.payDate)).limit(1);
    const latestPayRun = await latestPayRunQuery;

    const [submittedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timesheets)
      .where(and(eq(timesheets.status, "SUBMITTED"), tCond(timesheets)));

    const [ytdBillingsResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(amount_incl_gst), 0)::text` })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "PAID"),
          sql`${invoices.paidDate} >= ${fyStart.toISOString().split("T")[0]}`,
          tCond(invoices)
        )
      );

    return {
      activeEmployees: activeResult?.count || 0,
      pendingEmployees: pendingResult?.count || 0,
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
    const t = await this.tid();
    if (t) return db.select().from(notifications).where(eq(notifications.tenantId, t)).orderBy(desc(notifications.createdAt));
    return db.select().from(notifications).orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const t = await this.tid();
    const conds = [eq(notifications.read, false)];
    if (t) conds.push(eq(notifications.tenantId, t));
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(...conds));
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
    const t = await this.tid();
    const conds = [eq(notifications.read, false)];
    if (t) conds.push(eq(notifications.tenantId, t));
    await db.update(notifications).set({ read: true }).where(and(...conds));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const t = await this.tid();
    const [notification] = await db.insert(notifications).values({ ...data, tenantId: t }).returning();
    return notification;
  }

  async getMessages(): Promise<Message[]> {
    const t = await this.tid();
    if (t) return db.select().from(messages).where(eq(messages.tenantId, t)).orderBy(desc(messages.createdAt));
    return db.select().from(messages).orderBy(desc(messages.createdAt));
  }

  async getMessagesByEmployee(employeeId: string): Promise<Message[]> {
    const t = await this.tid();
    const conds = [eq(messages.employeeId, employeeId)];
    if (t) conds.push(eq(messages.tenantId, t));
    return db.select().from(messages).where(and(...conds)).orderBy(desc(messages.createdAt));
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const t = await this.tid();
    const [message] = await db.insert(messages).values({ ...data, tenantId: t }).returning();
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
    const t = await this.tid();
    if (t) return db.select().from(leaveRequests).where(eq(leaveRequests.tenantId, t)).orderBy(desc(leaveRequests.createdAt));
    return db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt));
  }

  async getLeaveRequestsByEmployee(employeeId: string): Promise<LeaveRequest[]> {
    const t = await this.tid();
    const conds = [eq(leaveRequests.employeeId, employeeId)];
    if (t) conds.push(eq(leaveRequests.tenantId, t));
    return db.select().from(leaveRequests).where(and(...conds)).orderBy(desc(leaveRequests.createdAt));
  }

  async createLeaveRequest(data: InsertLeaveRequest): Promise<LeaveRequest> {
    const t = await this.tid();
    const [leave] = await db.insert(leaveRequests).values({ ...data, tenantId: t }).returning();
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
    const t = await this.tid();
    if (t) return db.select().from(payItems).where(eq(payItems.tenantId, t)).orderBy(payItems.code);
    return db.select().from(payItems).orderBy(payItems.code);
  }

  async createPayItem(data: InsertPayItem): Promise<PayItem> {
    const t = await this.tid();
    const [item] = await db.insert(payItems).values({ ...data, tenantId: t }).returning();
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

  async getTaxDeclaration(employeeId: string): Promise<TaxDeclaration | undefined> {
    const t = await this.tid();
    const conds = [eq(taxDeclarations.employeeId, employeeId), eq(taxDeclarations.isCurrent, true)];
    if (t) conds.push(eq(taxDeclarations.tenantId, t));
    const [dec] = await db.select().from(taxDeclarations).where(and(...conds));
    return dec;
  }

  async upsertTaxDeclaration(data: InsertTaxDeclaration): Promise<TaxDeclaration> {
    const t = await this.tid();
    const existing = await this.getTaxDeclaration(data.employeeId);
    if (existing) {
      const [updated] = await db
        .update(taxDeclarations)
        .set({ ...data, tenantId: t })
        .where(eq(taxDeclarations.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(taxDeclarations).values({ ...data, tenantId: t }).returning();
    return created;
  }

  async getBankAccount(employeeId: string): Promise<BankAccount | undefined> {
    const t = await this.tid();
    const conds = [eq(bankAccounts.employeeId, employeeId), eq(bankAccounts.isPrimary, true)];
    if (t) conds.push(eq(bankAccounts.tenantId, t));
    const [acc] = await db.select().from(bankAccounts).where(and(...conds));
    return acc;
  }

  async upsertBankAccount(data: InsertBankAccount): Promise<BankAccount> {
    const t = await this.tid();
    const existing = await this.getBankAccount(data.employeeId);
    if (existing) {
      const [updated] = await db
        .update(bankAccounts)
        .set({ ...data, tenantId: t })
        .where(eq(bankAccounts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(bankAccounts).values({ ...data, tenantId: t }).returning();
    return created;
  }

  async getSuperMembership(employeeId: string): Promise<SuperMembership | undefined> {
    const t = await this.tid();
    const conds = [eq(superMemberships.employeeId, employeeId), eq(superMemberships.isDefault, true)];
    if (t) conds.push(eq(superMemberships.tenantId, t));
    const [mem] = await db.select().from(superMemberships).where(and(...conds));
    return mem;
  }

  async upsertSuperMembership(data: InsertSuperMembership): Promise<SuperMembership> {
    const t = await this.tid();
    const existing = await this.getSuperMembership(data.employeeId);
    if (existing) {
      const [updated] = await db
        .update(superMemberships)
        .set({ ...data, tenantId: t })
        .where(eq(superMemberships.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(superMemberships).values({ ...data, tenantId: t }).returning();
    return created;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
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

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getOnboardingStatus(employeeId: string): Promise<{
    personal: boolean;
    tax: boolean;
    bank: boolean;
    super: boolean;
  }> {
    const employee = await this.getEmployee(employeeId);
    const tax = await this.getTaxDeclaration(employeeId);
    const bank = await this.getBankAccount(employeeId);
    const superMem = await this.getSuperMembership(employeeId);

    return {
      personal: !!(employee?.dateOfBirth && employee?.addressLine1),
      tax: !!tax,
      bank: !!bank,
      super: !!superMem,
    };
  }

  async getClients(): Promise<Client[]> {
    const t = await this.tid();
    if (t) return db.select().from(clients).where(eq(clients.tenantId, t)).orderBy(clients.name);
    return db.select().from(clients).orderBy(clients.name);
  }

  async getClient(id: string): Promise<Client | undefined> {
    const t = await this.tid();
    const conds = [eq(clients.id, id)];
    if (t) conds.push(eq(clients.tenantId, t));
    const [client] = await db.select().from(clients).where(and(...conds));
    return client;
  }

  async getClientByXeroId(xeroContactId: string): Promise<Client | undefined> {
    const t = await this.tid();
    const conds = [eq(clients.xeroContactId, xeroContactId)];
    if (t) conds.push(eq(clients.tenantId, t));
    const [client] = await db.select().from(clients).where(and(...conds));
    return client;
  }

  async createClient(data: InsertClient): Promise<Client> {
    const t = await this.tid();
    const [client] = await db.insert(clients).values({ ...data, tenantId: t }).returning();
    return client;
  }

  async updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [client] = await db.update(clients).set({ ...data, updatedAt: new Date() }).where(eq(clients.id, id)).returning();
    return client;
  }

  async getAllPlacements(): Promise<Placement[]> {
    const t = await this.tid();
    if (t) return db.select().from(placements).where(eq(placements.tenantId, t)).orderBy(desc(placements.createdAt));
    return db.select().from(placements).orderBy(desc(placements.createdAt));
  }

  async getPlacements(employeeId: string): Promise<Placement[]> {
    const t = await this.tid();
    const conds = [eq(placements.employeeId, employeeId)];
    if (t) conds.push(eq(placements.tenantId, t));
    return db.select().from(placements).where(and(...conds)).orderBy(desc(placements.createdAt));
  }

  async getPlacement(id: string): Promise<Placement | undefined> {
    const t = await this.tid();
    const conds = [eq(placements.id, id)];
    if (t) conds.push(eq(placements.tenantId, t));
    const [placement] = await db.select().from(placements).where(and(...conds));
    return placement;
  }

  async createPlacement(data: InsertPlacement): Promise<Placement> {
    const t = await this.tid();
    const [placement] = await db.insert(placements).values({ ...data, tenantId: t }).returning();
    return placement;
  }

  async updatePlacement(id: string, data: Partial<InsertPlacement>): Promise<Placement | undefined> {
    const [placement] = await db.update(placements).set({ ...data, updatedAt: new Date() }).where(eq(placements.id, id)).returning();
    return placement;
  }

  async getBankTransactions(): Promise<BankTransaction[]> {
    const t = await this.tid();
    if (t) return db.select().from(bankTransactions).where(eq(bankTransactions.tenantId, t)).orderBy(desc(bankTransactions.date));
    return db.select().from(bankTransactions).orderBy(desc(bankTransactions.date));
  }

  async getBankTransactionByXeroId(xeroId: string): Promise<BankTransaction | undefined> {
    const t = await this.tid();
    const conds = [eq(bankTransactions.xeroBankTransactionId, xeroId)];
    if (t) conds.push(eq(bankTransactions.tenantId, t));
    const [txn] = await db.select().from(bankTransactions).where(and(...conds));
    return txn;
  }

  async createBankTransaction(data: InsertBankTransaction): Promise<BankTransaction> {
    const t = await this.tid();
    const [txn] = await db.insert(bankTransactions).values({ ...data, tenantId: t }).returning();
    return txn;
  }

  async updateBankTransaction(id: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction | undefined> {
    const [txn] = await db.update(bankTransactions).set(data).where(eq(bankTransactions.id, id)).returning();
    return txn;
  }

  async getPayslipLines(payRunLineId: string): Promise<PayslipLine[]> {
    const t = await this.tid();
    const conds = [eq(payslipLines.payRunLineId, payRunLineId)];
    if (t) conds.push(eq(payslipLines.tenantId, t));
    return db.select().from(payslipLines).where(and(...conds)).orderBy(payslipLines.lineType);
  }

  async createPayslipLines(data: InsertPayslipLine[]): Promise<PayslipLine[]> {
    if (data.length === 0) return [];
    const t = await this.tid();
    const stamped = data.map(d => ({ ...d, tenantId: t }));
    return db.insert(payslipLines).values(stamped).returning();
  }

  async deletePayslipLinesByPayRunLine(payRunLineId: string): Promise<void> {
    await db.delete(payslipLines).where(eq(payslipLines.payRunLineId, payRunLineId));
  }

  async getRateHistory(employeeId: string): Promise<RateHistory[]> {
    const t = await this.tid();
    const conds = [eq(rateHistory.employeeId, employeeId)];
    if (t) conds.push(eq(rateHistory.tenantId, t));
    return db.select().from(rateHistory).where(and(...conds)).orderBy(desc(rateHistory.effectiveDate));
  }

  async getLatestRateHistory(employeeId: string): Promise<RateHistory | undefined> {
    const t = await this.tid();
    const conds = [eq(rateHistory.employeeId, employeeId)];
    if (t) conds.push(eq(rateHistory.tenantId, t));
    const [latest] = await db.select().from(rateHistory).where(and(...conds)).orderBy(desc(rateHistory.effectiveDate)).limit(1);
    return latest;
  }

  async createRateHistory(data: InsertRateHistory): Promise<RateHistory> {
    const t = await this.tid();
    const [record] = await db.insert(rateHistory).values({ ...data, tenantId: t }).returning();
    return record;
  }

  async getInvoiceEmployees(invoiceId: string): Promise<InvoiceEmployee[]> {
    const t = await this.tid();
    const conds = [eq(invoiceEmployees.invoiceId, invoiceId)];
    if (t) conds.push(eq(invoiceEmployees.tenantId, t));
    return db.select().from(invoiceEmployees).where(and(...conds));
  }

  async getInvoiceEmployeesByInvoice(invoiceIds: string[]): Promise<InvoiceEmployee[]> {
    if (invoiceIds.length === 0) return [];
    const t = await this.tid();
    const conds = [inArray(invoiceEmployees.invoiceId, invoiceIds)];
    if (t) conds.push(eq(invoiceEmployees.tenantId, t));
    return db.select().from(invoiceEmployees).where(and(...conds));
  }

  async getAllInvoiceEmployees(): Promise<InvoiceEmployee[]> {
    const t = await this.tid();
    if (t) return db.select().from(invoiceEmployees).where(eq(invoiceEmployees.tenantId, t));
    return db.select().from(invoiceEmployees);
  }

  async setInvoiceEmployees(invoiceId: string, employeeIds: string[]): Promise<InvoiceEmployee[]> {
    await db.delete(invoiceEmployees).where(eq(invoiceEmployees.invoiceId, invoiceId));
    if (employeeIds.length === 0) return [];
    const t = await this.tid();
    return db.insert(invoiceEmployees)
      .values(employeeIds.map(employeeId => ({ invoiceId, employeeId, tenantId: t })))
      .returning();
  }

  async getInvoiceIdsByEmployee(employeeId: string): Promise<string[]> {
    const t = await this.tid();
    const conds = [eq(invoiceEmployees.employeeId, employeeId)];
    if (t) conds.push(eq(invoiceEmployees.tenantId, t));
    const rows = await db.select({ invoiceId: invoiceEmployees.invoiceId })
      .from(invoiceEmployees)
      .where(and(...conds));
    return rows.map(r => r.invoiceId);
  }

  async getRctis(): Promise<Rcti[]> {
    const t = await this.tid();
    if (t) return db.select().from(rctis).where(eq(rctis.tenantId, t)).orderBy(desc(rctis.year), desc(rctis.month));
    return db.select().from(rctis).orderBy(desc(rctis.year), desc(rctis.month));
  }

  async getRctisByEmployee(employeeId: string): Promise<Rcti[]> {
    const t = await this.tid();
    const conds = [eq(rctis.employeeId, employeeId)];
    if (t) conds.push(eq(rctis.tenantId, t));
    return db.select().from(rctis).where(and(...conds)).orderBy(desc(rctis.year), desc(rctis.month));
  }

  async getRctisByClient(clientId: string): Promise<Rcti[]> {
    const t = await this.tid();
    const conds = [eq(rctis.clientId, clientId)];
    if (t) conds.push(eq(rctis.tenantId, t));
    return db.select().from(rctis).where(and(...conds)).orderBy(desc(rctis.year), desc(rctis.month));
  }

  async createRcti(data: InsertRcti): Promise<Rcti> {
    const t = await this.tid();
    const [rcti] = await db.insert(rctis).values({ ...data, tenantId: t }).returning();
    return rcti;
  }

  async updateRcti(id: string, data: Partial<InsertRcti>): Promise<Rcti | undefined> {
    const [rcti] = await db.update(rctis).set({ ...data, updatedAt: new Date() }).where(eq(rctis.id, id)).returning();
    return rcti;
  }

  async deleteRcti(id: string): Promise<void> {
    await db.delete(rctis).where(eq(rctis.id, id));
  }

  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    const t = await this.tid();
    const conds = [eq(invoiceLineItems.invoiceId, invoiceId)];
    if (t) conds.push(eq(invoiceLineItems.tenantId, t));
    return db.select().from(invoiceLineItems).where(and(...conds));
  }

  async setInvoiceLineItems(invoiceId: string, items: InsertInvoiceLineItem[]): Promise<InvoiceLineItem[]> {
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
    if (items.length === 0) return [];
    const t = await this.tid();
    const stamped = items.map(i => ({ ...i, tenantId: t }));
    return db.insert(invoiceLineItems).values(stamped).returning();
  }

  async getInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
    const t = await this.tid();
    const conds = [eq(invoicePayments.invoiceId, invoiceId)];
    if (t) conds.push(eq(invoicePayments.tenantId, t));
    return db.select().from(invoicePayments).where(and(...conds));
  }

  async getAllInvoicePayments(): Promise<InvoicePayment[]> {
    const t = await this.tid();
    if (t) return db.select().from(invoicePayments).where(eq(invoicePayments.tenantId, t));
    return db.select().from(invoicePayments);
  }

  async setInvoicePayments(invoiceId: string, payments: InsertInvoicePayment[]): Promise<InvoicePayment[]> {
    await db.delete(invoicePayments).where(eq(invoicePayments.invoiceId, invoiceId));
    if (payments.length === 0) return [];
    const t = await this.tid();
    const stamped = payments.map(p => ({ ...p, tenantId: t }));
    return db.insert(invoicePayments).values(stamped).returning();
  }

  async getMonthlyExpectedHours(filters?: { employeeId?: string; month?: number; year?: number }): Promise<MonthlyExpectedHours[]> {
    const t = await this.tid();
    const conditions = [];
    if (t) conditions.push(eq(monthlyExpectedHours.tenantId, t));
    if (filters?.employeeId) conditions.push(eq(monthlyExpectedHours.employeeId, filters.employeeId));
    if (filters?.month) conditions.push(eq(monthlyExpectedHours.month, filters.month));
    if (filters?.year) conditions.push(eq(monthlyExpectedHours.year, filters.year));
    if (conditions.length > 0) {
      return db.select().from(monthlyExpectedHours).where(and(...conditions));
    }
    return db.select().from(monthlyExpectedHours);
  }

  async upsertMonthlyExpectedHours(data: InsertMonthlyExpectedHours): Promise<MonthlyExpectedHours> {
    const t = await this.tid();
    const lookupConds = [
      eq(monthlyExpectedHours.employeeId, data.employeeId),
      eq(monthlyExpectedHours.month, data.month),
      eq(monthlyExpectedHours.year, data.year),
    ];
    if (t) lookupConds.push(eq(monthlyExpectedHours.tenantId, t));
    const existing = await db.select().from(monthlyExpectedHours).where(and(...lookupConds));
    if (existing.length > 0) {
      const [updated] = await db.update(monthlyExpectedHours)
        .set({ ...data, tenantId: t, updatedAt: new Date() })
        .where(eq(monthlyExpectedHours.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(monthlyExpectedHours).values({ ...data, tenantId: t }).returning();
    return created;
  }

  async deleteMonthlyExpectedHours(id: string): Promise<void> {
    await db.delete(monthlyExpectedHours).where(eq(monthlyExpectedHours.id, id));
  }

  async getPayrollTaxRates(): Promise<PayrollTaxRate[]> {
    const t = await this.tid();
    if (t) return db.select().from(payrollTaxRates).where(eq(payrollTaxRates.tenantId, t)).orderBy(desc(payrollTaxRates.createdAt));
    return db.select().from(payrollTaxRates).orderBy(desc(payrollTaxRates.createdAt));
  }

  async getPayrollTaxRate(id: string): Promise<PayrollTaxRate | undefined> {
    const t = await this.tid();
    const conditions = [eq(payrollTaxRates.id, id)];
    if (t) conditions.push(eq(payrollTaxRates.tenantId, t));
    const [rate] = await db.select().from(payrollTaxRates).where(and(...conditions));
    return rate;
  }

  async createPayrollTaxRate(data: InsertPayrollTaxRate): Promise<PayrollTaxRate> {
    const t = await this.tid();
    const [rate] = await db.insert(payrollTaxRates).values({ ...data, tenantId: t }).returning();
    return rate;
  }

  async updatePayrollTaxRate(id: string, data: Partial<InsertPayrollTaxRate>): Promise<PayrollTaxRate | undefined> {
    const t = await this.tid();
    const conditions = [eq(payrollTaxRates.id, id)];
    if (t) conditions.push(eq(payrollTaxRates.tenantId, t));
    const [rate] = await db.update(payrollTaxRates).set(data).where(and(...conditions)).returning();
    return rate;
  }

  async deletePayrollTaxRate(id: string): Promise<void> {
    const t = await this.tid();
    const conditions = [eq(payrollTaxRates.id, id)];
    if (t) conditions.push(eq(payrollTaxRates.tenantId, t));
    await db.delete(payrollTaxRates).where(and(...conditions));
  }
}

export const storage = new DatabaseStorage();
