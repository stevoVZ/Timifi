import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, date, timestamp, boolean, smallint, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contractorStatusEnum = pgEnum("contractor_status", ["ACTIVE", "PENDING_SETUP", "OFFBOARDED"]);
export const clearanceLevelEnum = pgEnum("clearance_level", ["NONE", "BASELINE", "NV1", "NV2", "PV"]);
export const employmentTypeEnum = pgEnum("employment_type", ["FULLTIME", "PARTTIME", "CASUAL", "LABOURHIRE"]);
export const payCalendarEnum = pgEnum("pay_calendar", ["WEEKLY", "FORTNIGHTLY", "MONTHLY"]);
export const timesheetStatusEnum = pgEnum("timesheet_status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["DRAFT", "AUTHORISED", "SENT", "PAID", "VOIDED", "OVERDUE"]);

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
  contractorId: varchar("contractor_id").notNull().references(() => contractors.id),
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
  totalGross: numeric("total_gross", { precision: 12, scale: 2 }).notNull().default("0"),
  totalPayg: numeric("total_payg", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSuper: numeric("total_super", { precision: 12, scale: 2 }).notNull().default("0"),
  totalNet: numeric("total_net", { precision: 12, scale: 2 }).notNull().default("0"),
  employeeCount: smallint("employee_count").notNull().default(0),
  status: text("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

export type Contractor = typeof contractors.$inferSelect;
export type InsertContractor = z.infer<typeof insertContractorSchema>;
export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type PayRun = typeof payRuns.$inferSelect;
export type InsertPayRun = z.infer<typeof insertPayRunSchema>;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
