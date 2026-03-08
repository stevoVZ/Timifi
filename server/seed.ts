import { db } from "./db";
import { users, settings, contractors, timesheets, invoices, payRuns, payRunLines, documents, notifications, messages, leaveRequests, payItems } from "@shared/schema";
import { sql, isNull } from "drizzle-orm";
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
  await db.delete(contractors).where(isNull(contractors.xeroEmployeeId));

  console.log("Demo data cleaned. Xero-synced contractors preserved.");
}
