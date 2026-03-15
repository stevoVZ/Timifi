import { db } from "./db";
import { users, settings, employees, timesheets, invoices, payRuns, payRunLines, documents, notifications, messages, leaveRequests, payItems, payrollTaxRates } from "@shared/schema";
import { sql, isNull, eq, and } from "drizzle-orm";
import { hashPassword } from "./auth";

export async function seedDatabase() {
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length === 0) {
    console.log("Creating default admin user...");
    const hashedPassword = await hashPassword("admin");
    await db.insert(users).values({
      username: "admin",
      password: hashedPassword,
    });
    console.log("Default admin user created (username: admin, password: admin)");
  }

  const existingSettings = await db.select().from(settings).limit(1);
  if (existingSettings.length === 0) {
    console.log("Seeding default settings...");
    await db.insert(settings).values([
      { key: "company_name", value: "Recruitment Portal" },
      { key: "company_abn", value: "12 345 678 901" },
      { key: "company_email", value: "admin@recruitmentportal.com.au" },
      { key: "company_phone", value: "02 1234 5678" },
      { key: "pay_calendar", value: "MONTHLY" },
      { key: "super_rate", value: "11.5" },
      { key: "default_pay_day", value: "28" },
      { key: "portal_enabled", value: "true" },
      { key: "portal_self_service", value: "true" },
    ]);
  }

  // ── Business rules config keys (upsert — safe to run on every startup) ──────
  // These are additive: only inserted if the key doesn't already exist.
  const businessRulesKeys = [
    { key: "rcti_discrepancy_threshold_hours", value: "0.5",    description: "Hours delta between RCTI and timesheet that triggers a discrepancy notification" },
    { key: "invoice_payment_terms_days",       value: "14",     description: "Default number of days from invoice date to due date" },
    { key: "default_invoice_account_code",     value: "200",    description: "Default Xero account code applied to new invoice line items" },
    { key: "invoice_default_tax_type",         value: "OUTPUT", description: "Default GST tax type on invoice line items (OUTPUT = GST on Income)" },
    { key: "payroll_lock_requires_confirmation", value: "true", description: "Whether admin must confirm before locking a timesheet for payroll" },
  ];

  const existingKeys = await db.select({ key: settings.key }).from(settings);
  const existingKeySet = new Set(existingKeys.map(s => s.key));

  const toInsert = businessRulesKeys.filter(k => !existingKeySet.has(k.key));
  if (toInsert.length > 0) {
    console.log(`Seeding ${toInsert.length} business rules settings key(s):`, toInsert.map(k => k.key));
    await db.insert(settings).values(toInsert.map(({ key, value }) => ({ key, value })));
  }

  await fixActPayrollTaxRate();
}

async function fixActPayrollTaxRate() {
  const incorrectRate = "1.650";
  const correctRate = "6.850";

  const [updated] = await db
    .update(payrollTaxRates)
    .set({ rate: correctRate })
    .where(
      and(
        eq(payrollTaxRates.state, "ACT"),
        eq(payrollTaxRates.financialYearStart, 2025),
        eq(payrollTaxRates.rate, incorrectRate),
      ),
    )
    .returning();

  if (updated) {
    console.log(`Fixed ACT FY2025 payroll tax rate from ${incorrectRate}% to ${correctRate}%`);
  }
}

export async function cleanDemoData() {
  console.log("Cleaning demo data...");

  await db.delete(payRunLines);
  await db.delete(payRuns);
  await db.delete(documents);
  await db.delete(notifications);
  await db.delete(messages);
  await db.delete(leaveRequests);
  await db.delete(payItems);
  await db.delete(invoices);
  await db.delete(timesheets);
  await db.delete(employees).where(isNull(employees.xeroEmployeeId));

  console.log("Demo data cleaned. Xero-synced employees preserved.");
}
