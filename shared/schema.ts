import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, date, timestamp, boolean, smallint, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const employeeStatusEnum = pgEnum("employee_status", ["ACTIVE", "PENDING_SETUP", "OFFBOARDED"]);
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
export const documentTypeEnum = pgEnum("document_type", ["PAYSLIP", "CONTRACT", "CLEARANCE", "OTHER", "TIMESHEET"]);

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  clientName: text("client_name"),
  status: employeeStatusEnum("status").notNull().default("PENDING_SETUP"),
  clearanceLevel: clearanceLevelEnum("clearance_level").notNull().default("NONE"),
  clearanceExpiry: date("clearance_expiry"),
  employmentType: employmentTypeEnum("employment_type").notNull().default("LABOURHIRE"),
  payFrequency: payCalendarEnum("pay_frequency").notNull().default("MONTHLY"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  chargeOutRate: numeric("charge_out_rate", { precision: 10, scale: 2 }),
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
  payrollFeePercent: numeric("payroll_fee_percent", { precision: 5, scale: 2 }).default("0"),
  preferredName: text("preferred_name"),
  contractCode: text("contract_code"),
  roleTitle: text("role_title"),
  xeroEmployeeId: text("xero_employee_id"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const timesheets = pgTable("timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  clientId: varchar("client_id").references(() => clients.id),
  placementId: varchar("placement_id").references(() => placements.id),
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
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id),
  clientId: varchar("client_id"),
  contactName: text("contact_name"),
  xeroContactId: text("xero_contact_id"),
  xeroInvoiceId: text("xero_invoice_id"),
  timesheetId: varchar("timesheet_id").references(() => timesheets.id),
  year: smallint("year").notNull(),
  month: smallint("month").notNull(),
  invoiceNumber: text("invoice_number"),
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
  invoiceType: text("invoice_type"),
  category: text("category"),
  reference: text("reference"),
  tenantId: varchar("tenant_id"),
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
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const payRunLines = pgTable("pay_run_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payRunId: varchar("pay_run_id").notNull().references(() => payRuns.id),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  timesheetId: varchar("timesheet_id").references(() => timesheets.id),
  hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }).notNull().default("0"),
  ratePerHour: numeric("rate_per_hour", { precision: 10, scale: 2 }).notNull().default("0"),
  grossEarnings: numeric("gross_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
  paygWithheld: numeric("payg_withheld", { precision: 12, scale: 2 }).notNull().default("0"),
  superAmount: numeric("super_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  status: payRunLineStatusEnum("status").notNull().default("INCLUDED"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  timesheetId: varchar("timesheet_id").references(() => timesheets.id),
  type: documentTypeEnum("type").notNull().default("OTHER"),
  name: text("name").notNull(),
  category: text("category").notNull().default("Other"),
  fileUrl: text("file_url"),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  metadata: text("metadata"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  email: text("email"),
  role: text("role").notNull().default("admin"),
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
  employeeId: varchar("employee_id").references(() => employees.id),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  senderRole: text("sender_role").notNull().default("admin"),
  subject: text("subject"),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  tenantId: varchar("tenant_id"),
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
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  leaveType: leaveTypeEnum("leave_type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalDays: numeric("total_days", { precision: 4, scale: 1 }).notNull(),
  reason: text("reason"),
  status: leaveStatusEnum("status").notNull().default("PENDING"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const payItems = pgTable("pay_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  itemType: text("item_type").notNull().default("EARNINGS"),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).default("1.00"),
  isTaxable: boolean("is_taxable").notNull().default(true),
  isSuperable: boolean("is_superable").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taxDeclarations = pgTable("tax_declarations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  tfn: text("tfn").notNull(),
  residencyStatus: text("residency_status").notNull().default("RESIDENT"),
  claimTaxFreeThreshold: boolean("claim_tax_free_threshold").notNull().default(true),
  helpDebt: boolean("help_debt").notNull().default(false),
  studentLoan: boolean("student_loan").notNull().default(false),
  seniorsOffset: boolean("seniors_offset").notNull().default(false),
  declarationDate: date("declaration_date"),
  isCurrent: boolean("is_current").notNull().default(true),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  bsb: text("bsb").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name"),
  isPrimary: boolean("is_primary").notNull().default(true),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const superMemberships = pgTable("super_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  fundName: text("fund_name").notNull(),
  fundAbn: text("fund_abn"),
  memberNumber: text("member_number"),
  usiNumber: text("usi_number"),
  isDefault: boolean("is_default").notNull().default(true),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payslipLineTypeEnum = pgEnum("payslip_line_type", ["EARNINGS", "DEDUCTION", "SUPER", "REIMBURSEMENT", "TAX", "LEAVE"]);

export const placementStatusEnum = pgEnum("placement_status", ["ACTIVE", "ENDED"]);
export const bankTxnTypeEnum = pgEnum("bank_txn_type", ["RECEIVE", "SPEND"]);

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  xeroContactId: text("xero_contact_id"),
  email: text("email"),
  phone: text("phone"),
  isCustomer: boolean("is_customer").notNull().default(false),
  isSupplier: boolean("is_supplier").notNull().default(false),
  addressLine1: text("address_line1"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country"),
  isRcti: boolean("is_rcti").notNull().default(false),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const placements = pgTable("placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  clientId: varchar("client_id").references(() => clients.id),
  clientName: text("client_name"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  chargeOutRate: numeric("charge_out_rate", { precision: 10, scale: 2 }),
  payRate: numeric("pay_rate", { precision: 10, scale: 2 }),
  payrollFeePercent: numeric("payroll_fee_percent", { precision: 5, scale: 2 }).default("0"),
  status: placementStatusEnum("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bankTransactions = pgTable("bank_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  xeroBankTransactionId: text("xero_bank_transaction_id"),
  bankAccountId: text("bank_account_id"),
  bankAccountName: text("bank_account_name"),
  contactName: text("contact_name"),
  xeroContactId: text("xero_contact_id"),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: bankTxnTypeEnum("type").notNull(),
  reference: text("reference"),
  description: text("description"),
  status: text("status"),
  isReconciled: boolean("is_reconciled").notNull().default(false),
  month: smallint("month").notNull(),
  year: smallint("year").notNull(),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payslipLines = pgTable("payslip_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payRunLineId: varchar("pay_run_line_id").notNull().references(() => payRunLines.id),
  lineType: payslipLineTypeEnum("line_type").notNull(),
  name: text("name"),
  xeroRateId: text("xero_rate_id"),
  units: numeric("units", { precision: 10, scale: 4 }),
  rate: numeric("rate", { precision: 10, scale: 4 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  percentage: numeric("percentage", { precision: 6, scale: 4 }),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rateHistory = pgTable("rate_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  effectiveDate: date("effective_date").notNull(),
  payRate: numeric("pay_rate", { precision: 10, scale: 2 }).notNull(),
  chargeOutRate: numeric("charge_out_rate", { precision: 10, scale: 2 }),
  superPercent: numeric("super_percent", { precision: 5, scale: 2 }),
  source: text("source").notNull().default("PAYROLL_SYNC"),
  payRunId: varchar("pay_run_id").references(() => payRuns.id),
  notes: text("notes"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const timesheetAuditLog = pgTable("timesheet_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId: varchar("timesheet_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  field: varchar("field", { length: 50 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeSource: varchar("change_source", { length: 30 }).notNull().default("MANUAL_EDIT"),
  changedBy: varchar("changed_by", { length: 100 }),
  notes: text("notes"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTimesheetAuditLogSchema = createInsertSchema(timesheetAuditLog).omit({
  id: true,
  createdAt: true,
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
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
  displayName: true,
  email: true,
  role: true,
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

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlacementSchema = createInsertSchema(placements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertPayslipLineSchema = createInsertSchema(payslipLines).omit({
  id: true,
  createdAt: true,
});

export const insertRateHistorySchema = createInsertSchema(rateHistory).omit({
  id: true,
  createdAt: true,
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Placement = typeof placements.$inferSelect;
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
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
export type PayslipLine = typeof payslipLines.$inferSelect;
export type InsertPayslipLine = z.infer<typeof insertPayslipLineSchema>;
export type RateHistory = typeof rateHistory.$inferSelect;
export type InsertRateHistory = z.infer<typeof insertRateHistorySchema>;
export type TimesheetAuditLog = typeof timesheetAuditLog.$inferSelect;
export type InsertTimesheetAuditLog = z.infer<typeof insertTimesheetAuditLogSchema>;

export const monthlyExpectedHours = pgTable("monthly_expected_hours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  month: smallint("month").notNull(),
  year: smallint("year").notNull(),
  expectedDays: numeric("expected_days", { precision: 5, scale: 1 }),
  expectedHours: numeric("expected_hours", { precision: 6, scale: 1 }).notNull(),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMonthlyExpectedHoursSchema = createInsertSchema(monthlyExpectedHours).omit({ id: true, createdAt: true, updatedAt: true });
export type MonthlyExpectedHours = typeof monthlyExpectedHours.$inferSelect;
export type InsertMonthlyExpectedHours = z.infer<typeof insertMonthlyExpectedHoursSchema>;

export const rctiStatusEnum = pgEnum("rcti_status", ["DRAFT", "RECEIVED", "PAID"]);

export const rctis = pgTable("rctis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  month: smallint("month").notNull(),
  year: smallint("year").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  amountExclGst: numeric("amount_excl_gst", { precision: 10, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  amountInclGst: numeric("amount_incl_gst", { precision: 10, scale: 2 }).notNull().default("0"),
  description: text("description"),
  reference: text("reference"),
  receivedDate: date("received_date"),
  bankTransactionId: varchar("bank_transaction_id"),
  status: rctiStatusEnum("status").notNull().default("DRAFT"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRctiSchema = createInsertSchema(rctis).omit({ id: true, createdAt: true, updatedAt: true });
export type Rcti = typeof rctis.$inferSelect;
export type InsertRcti = z.infer<typeof insertRctiSchema>;

export const invoiceEmployees = pgTable("invoice_employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceEmployeeSchema = createInsertSchema(invoiceEmployees).omit({ id: true, createdAt: true });
export type InvoiceEmployee = typeof invoiceEmployees.$inferSelect;
export type InsertInvoiceEmployee = z.infer<typeof insertInvoiceEmployeeSchema>;

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  lineItemId: text("line_item_id"),
  description: text("description"),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unitAmount: numeric("unit_amount", { precision: 10, scale: 4 }),
  lineAmount: numeric("line_amount", { precision: 12, scale: 2 }),
  accountCode: text("account_code"),
  taxType: text("tax_type"),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }),
  tracking: jsonb("tracking"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({ id: true, createdAt: true });
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;

export const invoicePayments = pgTable("invoice_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  xeroPaymentId: text("xero_payment_id"),
  paymentDate: date("payment_date"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currencyCode: text("currency_code"),
  bankAccountId: text("bank_account_id"),
  bankAccountName: text("bank_account_name"),
  reference: text("reference"),
  status: text("status"),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoicePaymentSchema = createInsertSchema(invoicePayments).omit({ id: true, createdAt: true });
export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
