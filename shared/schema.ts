import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, date, timestamp, boolean, smallint, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contractorStatusEnum = pgEnum("contractor_status", ["ACTIVE", "PENDING_SETUP", "OFFBOARDED"]);
export const clearanceLevelEnum = pgEnum("clearance_level", ["NONE", "BASELINE", "NV1", "NV2", "PV"]);
export const employmentTypeEnum = pgEnum("employment_type", ["FULLTIME", "PARTTIME", "CASUAL", "LABOURHIRE"]);
export const paymentMethodEnum = pgEnum("payment_method", ["PAYROLL", "INVOICE"]);
export const payCalendarEnum = pgEnum("pay_calendar", ["WEEKLY", "FORTNIGHTLY", "MONTHLY"]);
export const timesheetStatusEnum = pgEnum("timesheet_status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["DRAFT", "AUTHORISED", "SENT", "PAID", "VOIDED", "OVERDUE"]);
export const notificationTypeEnum = pgEnum("notification_type", ["PAYRUN", "STP", "INVOICE", "TIMESHEET", "SUPER", "XERO", "CLEARANCE", "SYSTEM"]);
export const notificationPriorityEnum = pgEnum("notification_priority", ["URGENT", "HIGH", "MEDIUM", "LOW"]);
export const leaveTypeEnum = pgEnum("leave_type", ["ANNUAL", "SICK", "LONG_SERVICE", "PERSONAL", "COMPASSIONATE", "UNPAID", "PUBLIC_HOLIDAY"]);
export const leaveStatusEnum = pgEnum("leave_status", ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export const payRunLineStatusEnum = pgEnum("pay_run_line_status", ["INCLUDED", "EXCLUDED"]);
export const documentTypeEnum = pgEnum("document_type", ["PAYSLIP", "CONTRACT", "CLEARANCE", "OTHER"]);

export const contractors = pgTable("contractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  clientName: text("client_name"),
  status: contractorStatusEnum("status").notNull().default("PENDING_SETUP"),
  clearanceLevel: clearanceLevelEnum("clearance_level").notNull().default("NONE"),
  clearanceExpiry: date("clearance_expiry"),
  employmentType: employmentTypeEnum("employment_type").notNull().default("LABOURHIRE"),
  payFrequency: payCalendarEnum("pay_frequency").notNull().default("MONTHLY"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  contractHoursPA: integer("contract_hours_pa").notNull().default(2000),
  startDate: date("start_date"),
  endDate: date("end_date"),
  state: varchar("state", { length: 3 }),
  suburb: text("suburb"),
  accentColour: text("accent_colour").default("#2563eb"),
  notes: text("notes"),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  addressLine1: text("address_line1"),
  postcode: text("postcode"),
  companyName: text("company_name"),
  abn: text("abn"),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("PAYROLL"),
  xeroEmployeeId: text("xero_employee_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const timesheets = pgTable("timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  year: smallint("year").notNull(),
  month: smallint("month").notNull(),
  totalHours: numeric("total_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  regularHours: numeric("regular_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  grossValue: numeric("gross_value", { precision: 10, scale: 2 }).notNull().default("0"),
  status: timesheetStatusEnum("status").notNull().default("DRAFT"),
  notes: text("notes"),
  fileName: text("file_name"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  contactName: text("contact_name"),
  xeroInvoiceId: text("xero_invoice_id").unique(),
  timesheetId: varchar("timesheet_id").references(() => timesheets.id),
  year: smallint("year").notNull(),
  month: smallint("month").notNull(),
  invoiceNumber: text("invoice_number").unique(),
  amountExclGst: numeric("amount_excl_gst", { precision: 10, scale: 2 }).notNull(),
  gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  amountInclGst: numeric("amount_incl_gst", { precision: 10, scale: 2 }).notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  description: text("description"),
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),
  status: invoiceStatusEnum("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const payRuns = pgTable("pay_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payRunRef: text("pay_run_ref").notNull(),
  year: smallint("year").notNull(),
  month: smallint("month").notNull(),
  payDate: date("pay_date"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  paymentDate: date("payment_date"),
  superRate: numeric("super_rate", { precision: 5, scale: 4 }).default("0.1150"),
  totalGross: numeric("total_gross", { precision: 12, scale: 2 }).notNull().default("0"),
  totalPayg: numeric("total_payg", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSuper: numeric("total_super", { precision: 12, scale: 2 }).notNull().default("0"),
  totalNet: numeric("total_net", { precision: 12, scale: 2 }).notNull().default("0"),
  employeeCount: smallint("employee_count").notNull().default(0),
  calendarName: text("calendar_name"),
  status: text("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const payRunLines = pgTable("pay_run_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payRunId: varchar("pay_run_id").notNull().references(() => payRuns.id),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  timesheetId: varchar("timesheet_id").references(() => timesheets.id),
  hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }).notNull().default("0"),
  ratePerHour: numeric("rate_per_hour", { precision: 10, scale: 2 }).notNull().default("0"),
  grossEarnings: numeric("gross_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
  paygWithheld: numeric("payg_withheld", { precision: 12, scale: 2 }).notNull().default("0"),
  superAmount: numeric("super_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  status: payRunLineStatusEnum("status").notNull().default("INCLUDED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  type: documentTypeEnum("type").notNull().default("OTHER"),
  name: text("name").notNull(),
  category: text("category").notNull().default("Other"),
  fileUrl: text("file_url"),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: notificationTypeEnum("type").notNull().default("SYSTEM"),
  priority: notificationPriorityEnum("priority").notNull().default("MEDIUM"),
  title: text("title").notNull(),
  body: text("body"),
  actionLabel: text("action_label"),
  actionRoute: text("action_route"),
  read: boolean("read").notNull().default(false),
  contractorId: varchar("contractor_id").references(() => contractors.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  senderRole: text("sender_role").notNull().default("admin"),
  subject: text("subject"),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  leaveType: leaveTypeEnum("leave_type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalDays: numeric("total_days", { precision: 4, scale: 1 }).notNull(),
  reason: text("reason"),
  status: leaveStatusEnum("status").notNull().default("PENDING"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const payItems = pgTable("pay_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  itemType: text("item_type").notNull().default("EARNINGS"),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).default("1.00"),
  isTaxable: boolean("is_taxable").notNull().default(true),
  isSuperable: boolean("is_superable").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taxDeclarations = pgTable("tax_declarations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  tfn: text("tfn").notNull(),
  residencyStatus: text("residency_status").notNull().default("RESIDENT"),
  claimTaxFreeThreshold: boolean("claim_tax_free_threshold").notNull().default(true),
  helpDebt: boolean("help_debt").notNull().default(false),
  studentLoan: boolean("student_loan").notNull().default(false),
  seniorsOffset: boolean("seniors_offset").notNull().default(false),
  declarationDate: date("declaration_date"),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  bsb: text("bsb").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name"),
  isPrimary: boolean("is_primary").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const superMemberships = pgTable("super_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
  fundName: text("fund_name").notNull(),
  fundAbn: text("fund_abn"),
  memberNumber: text("member_number"),
  usiNumber: text("usi_number"),
  isDefault: boolean("is_default").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractorSchema = createInsertSchema(contractors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTimesheetSchema = createInsertSchema(timesheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPayRunSchema = createInsertSchema(payRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPayItemSchema = createInsertSchema(payItems).omit({
  id: true,
  createdAt: true,
});

export const insertTaxDeclarationSchema = createInsertSchema(taxDeclarations).omit({
  id: true,
  createdAt: true,
});

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({
  id: true,
  createdAt: true,
});

export const insertSuperMembershipSchema = createInsertSchema(superMemberships).omit({
  id: true,
  createdAt: true,
});

export const insertPayRunLineSchema = createInsertSchema(payRunLines).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
});

export type Contractor = typeof contractors.$inferSelect;
export type InsertContractor = z.infer<typeof insertContractorSchema>;
export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type PayRun = typeof payRuns.$inferSelect;
export type InsertPayRun = z.infer<typeof insertPayRunSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type PayItem = typeof payItems.$inferSelect;
export type InsertPayItem = z.infer<typeof insertPayItemSchema>;
export type TaxDeclaration = typeof taxDeclarations.$inferSelect;
export type InsertTaxDeclaration = z.infer<typeof insertTaxDeclarationSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type SuperMembership = typeof superMemberships.$inferSelect;
export type InsertSuperMembership = z.infer<typeof insertSuperMembershipSchema>;
export type PayRunLine = typeof payRunLines.$inferSelect;
export type InsertPayRunLine = z.infer<typeof insertPayRunLineSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
