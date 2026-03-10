/**
 * Timifi Bug Fix Script
 * Run from the project root: node apply-fixes.js
 * Applies 6 fixes across server/routes.ts and client/src/pages/leave.tsx
 */

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function patch(filePath, description, find, replace) {
  const full = path.join(__dirname, filePath);
  let src;
  try {
    src = fs.readFileSync(full, "utf8");
  } catch (e) {
    console.error(`  ✗ FAILED [${description}] — could not read ${filePath}`);
    failed++;
    return;
  }
  if (!src.includes(find)) {
    console.error(`  ✗ FAILED [${description}] — search string not found in ${filePath}`);
    console.error(`    Looking for: ${find.slice(0, 80).replace(/\n/g, "↵")}...`);
    failed++;
    return;
  }
  const updated = src.replace(find, replace);
  fs.writeFileSync(full, updated, "utf8");
  console.log(`  ✓ OK     [${description}]`);
  passed++;
}

console.log("\n=== Timifi Fix Script ===\n");

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Amex outstanding debt ignores repayments
// ─────────────────────────────────────────────────────────────────────────────
patch(
  "server/routes.ts",
  "Fix 1: Amex debt formula",
  `      const amexDebt = amexTotalSpend - amexTotalCredits;

      const amexTotalCharged = amexTotalSpend + amexRepayments;
      const amexTotalPaidOff = amexRepayments + amexTotalCredits;`,
  `      const amexDebt = amexTotalSpend - amexTotalCredits - amexRepayments;

      const amexTotalCharged = amexTotalSpend;
      const amexTotalPaidOff = amexRepayments + amexTotalCredits;`
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2: Reconciliation includes VOIDED invoices in expected revenue
// ─────────────────────────────────────────────────────────────────────────────
patch(
  "server/routes.ts",
  "Fix 2: Reconciliation - exclude VOIDED invoices",
  `        const empInvoices = allInvoices.filter((i) => {
          if (i.month !== month || i.year !== year) return false;
          if (i.invoiceType === "ACCPAY") return false;
          if (i.employeeId === emp.id) return true;
          const linked = invEmpMap[i.id];
          if (linked && linked.includes(emp.id)) return true;
          return false;
        });`,
  `        const empInvoices = allInvoices.filter((i) => {
          if (i.month !== month || i.year !== year) return false;
          if (i.invoiceType === "ACCPAY") return false;
          if (i.status === "VOIDED" || i.status === "DELETED") return false;
          if (i.employeeId === emp.id) return true;
          const linked = invEmpMap[i.id];
          if (linked && linked.includes(emp.id)) return true;
          return false;
        });`
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3: Super double-counted in Cash Position total costs
// ─────────────────────────────────────────────────────────────────────────────
patch(
  "server/routes.ts",
  "Fix 3: Super double-count in cash position",
  `        payrollTotal += gross + superAmt;`,
  `        payrollTotal += gross; // super tracked separately via bank txns to avoid double-count`
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4: PAYG missing Medicare Levy and LITO
// ─────────────────────────────────────────────────────────────────────────────
patch(
  "server/routes.ts",
  "Fix 4: PAYG - add Medicare Levy + LITO",
  `      function estimatePayg(annualGross: number): number {
        if (annualGross <= 18200) return 0;
        if (annualGross <= 45000) return (annualGross - 18200) * 0.19;
        if (annualGross <= 120000) return 5092 + (annualGross - 45000) * 0.325;
        if (annualGross <= 180000) return 29467 + (annualGross - 120000) * 0.37;
        return 51667 + (annualGross - 180000) * 0.45;
      }`,
  `      function estimatePayg(annualGross: number): number {
        // Base income tax (AUS FY2024-25 brackets)
        let tax = 0;
        if (annualGross <= 18200) tax = 0;
        else if (annualGross <= 45000) tax = (annualGross - 18200) * 0.19;
        else if (annualGross <= 120000) tax = 5092 + (annualGross - 45000) * 0.325;
        else if (annualGross <= 180000) tax = 29467 + (annualGross - 120000) * 0.37;
        else tax = 51667 + (annualGross - 180000) * 0.45;

        // Low Income Tax Offset (LITO)
        let lito = 0;
        if (annualGross <= 37500) lito = 700;
        else if (annualGross <= 45000) lito = 700 - (annualGross - 37500) * 0.05;
        else if (annualGross <= 66667) lito = 325 - (annualGross - 45000) * 0.015;
        tax = Math.max(0, tax - lito);

        // Medicare Levy 2% (above low-income threshold)
        if (annualGross > 26000) tax += annualGross * 0.02;

        return Math.round(tax / 12);
      }`
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5: Super rounding to whole dollars instead of cents
// ─────────────────────────────────────────────────────────────────────────────
patch(
  "server/routes.ts",
  "Fix 5: Super rounding to cents",
  `        const superAmt = Math.round(gross * superRate);`,
  `        const superAmt = Math.round(gross * superRate * 100) / 100;`
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 6: Leave balances use calendar year, not financial year
// ─────────────────────────────────────────────────────────────────────────────
patch(
  "client/src/pages/leave.tsx",
  "Fix 6a: Leave - switch to financial year filter",
  `  const currentYear = new Date().getFullYear();
  const approvedThisYear = leaveRequests?.filter(
    (l) => l.status === "APPROVED" && new Date(l.startDate).getFullYear() === currentYear
  ) || [];`,
  `  const now = new Date();
  const currentYear = now.getFullYear();
  const fyStart = now.getMonth() >= 6
    ? new Date(currentYear, 6, 1)
    : new Date(currentYear - 1, 6, 1);
  const fyLabel = \`FY\${fyStart.getFullYear()}-\${String(fyStart.getFullYear() + 1).slice(-2)}\`;
  const approvedThisYear = leaveRequests?.filter(
    (l) => l.status === "APPROVED" && new Date(l.startDate) >= fyStart
  ) || [];`
);

patch(
  "client/src/pages/leave.tsx",
  "Fix 6b: Leave - update balance heading label",
  `                Leave Balances — {currentYear}`,
  `                Leave Balances — {fyLabel}`
);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n=== Done: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  console.log("Some patches did not apply. This usually means the file was already patched,");
  console.log("or the code differs slightly from what was analysed. Apply those manually.\n");
}
