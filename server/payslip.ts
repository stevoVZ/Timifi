import { jsPDF } from "jspdf";

export interface PayslipData {
  agencyName: string;
  agencyABN: string;
  agencyAddress?: string;
  contractorName: string;
  contractorAddress: string;
  payPeriodLabel: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  payslipNumber: string;
  earnings: { description: string; units?: number; rate?: number; amount: number }[];
  deductions: { description: string; amount: number }[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  paygWithheld: number;
  superAmount: number;
  superRate: number;
  ytdGross: number;
  ytdPayg: number;
  ytdSuper: number;
  bankName?: string;
  bsb?: string;
  accountSuffix?: string;
}

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

export function generatePayslipHTML(d: PayslipData): string {
  const earningsRows = d.earnings
    .map(
      (e) => `
    <tr>
      <td class="desc">${e.description}</td>
      <td class="num">${e.units != null ? e.units.toFixed(2) : ""}</td>
      <td class="num">${e.rate != null ? fmt(e.rate) : ""}</td>
      <td class="num right">${fmt(e.amount)}</td>
    </tr>`
    )
    .join("");

  const deductionRows = d.deductions
    .map(
      (dd) => `
    <tr>
      <td class="desc">${dd.description}</td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num right neg">(${fmt(dd.amount)})</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Payslip - ${d.contractorName} - ${d.payPeriodLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#111827;background:#fff;padding:36px 48px;max-width:800px;margin:0 auto}
  @media print{body{padding:0} .no-print{display:none}}
  h1{font-size:22px;font-weight:700;color:#111827}
  h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:10px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #111827}
  .badge{display:inline-block;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:700;padding:4px 12px;border-radius:100px;letter-spacing:.05em;text-transform:uppercase;margin-top:8px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .meta-block{padding:14px 16px;background:#f4f5f7;border-radius:10px}
  .meta-block .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af;margin-bottom:4px}
  .meta-block .val{font-size:13px;color:#111827;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#f4f5f7}
  thead th{padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
  thead th.right{text-align:right}
  tbody tr:nth-child(even){background:#f9fafb}
  td{padding:8px 12px;vertical-align:top;font-size:13px;color:#374151}
  td.desc{color:#111827}
  td.num{font-family:'DM Mono',monospace;font-size:12.5px;color:#374151;text-align:right}
  td.right{text-align:right}
  td.neg{color:#dc2626}
  .subtotal td{font-weight:700;color:#111827;border-top:1px solid #e5e7eb;padding-top:10px}
  .net-row td{font-size:16px;font-weight:700;color:#16a34a;padding:14px 12px;background:#f0fdf4;border-radius:8px}
  .ytd{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px}
  .ytd-card{padding:14px 16px;background:#f4f5f7;border-radius:10px;text-align:center}
  .ytd-card .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af;margin-bottom:6px}
  .ytd-card .val{font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:#111827}
  .super-box{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f5f3ff;border-radius:10px;margin-bottom:24px;border:1px solid #ddd6fe}
  .super-box .lbl{font-size:12px;font-weight:600;color:#7c3aed}
  .super-box .val{font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:#7c3aed}
  .bank-box{padding:12px 16px;background:#f4f5f7;border-radius:10px;font-size:12.5px;color:#374151}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11.5px;color:#9ca3af;line-height:1.6;text-align:center}
  .btn-print{display:block;width:100%;margin-bottom:20px;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif}
  .btn-print:hover{background:#1d4ed8}
</style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">Save as PDF</button>

  <div class="header">
    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af;margin-bottom:4px">Pay advice / Payslip</div>
      <h1>${d.agencyName}</h1>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">ABN ${d.agencyABN}${d.agencyAddress ? " &middot; " + d.agencyAddress : ""}</div>
      <div class="badge">${d.payPeriodLabel}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px">${d.contractorName}</div>
      <div style="font-size:12px;color:#6b7280;line-height:1.6">${(d.contractorAddress || "").replace(/,/g, "<br>")}</div>
      <div style="font-size:11px;font-family:'DM Mono',monospace;color:#9ca3af;margin-top:6px">${d.payslipNumber}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <div class="lbl">Pay period</div>
      <div class="val">${d.periodStart} &mdash; ${d.periodEnd}</div>
    </div>
    <div class="meta-block">
      <div class="lbl">Payment date</div>
      <div class="val" style="font-weight:700;color:#2563eb">${d.paymentDate}</div>
    </div>
  </div>

  <h2>Earnings</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right">Units</th>
        <th class="right">Rate</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${earningsRows}
      <tr class="subtotal">
        <td colspan="3">Total earnings</td>
        <td class="num right">${fmt(d.grossEarnings)}</td>
      </tr>
    </tbody>
  </table>

  <h2>Deductions</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right"></th>
        <th class="right"></th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${deductionRows}
      <tr class="subtotal">
        <td colspan="3">Total deductions</td>
        <td class="num right neg">(${fmt(d.totalDeductions)})</td>
      </tr>
    </tbody>
  </table>

  <table>
    <tbody>
      <tr class="net-row">
        <td>Net pay</td>
        <td class="num right">${fmt(d.netPay)}</td>
      </tr>
    </tbody>
  </table>

  <div class="super-box">
    <div>
      <div class="lbl">Superannuation (${(d.superRate * 100).toFixed(1)}% SGC)</div>
      <div style="font-size:12px;color:#7c3aed;margin-top:3px;opacity:.8">Paid directly to your super fund &mdash; not included in net pay</div>
    </div>
    <div class="val">${fmt(d.superAmount)}</div>
  </div>

  <h2>Year to date (FY${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)})</h2>
  <div class="ytd">
    <div class="ytd-card">
      <div class="lbl">Gross earnings</div>
      <div class="val">${fmt(d.ytdGross)}</div>
    </div>
    <div class="ytd-card">
      <div class="lbl">PAYG withheld</div>
      <div class="val" style="color:#dc2626">${fmt(d.ytdPayg)}</div>
    </div>
    <div class="ytd-card">
      <div class="lbl">Super contributions</div>
      <div class="val" style="color:#7c3aed">${fmt(d.ytdSuper)}</div>
    </div>
  </div>

  ${
    d.bsb
      ? `
  <h2>Payment details</h2>
  <div class="bank-box">
    Deposited to: ${d.bankName ? d.bankName + " &middot; " : ""}BSB ${d.bsb.slice(0, 3)}-${d.bsb.slice(3)} &middot; Account ending &middot;&middot;&middot;${d.accountSuffix ?? "???"}
  </div>
  `
      : ""
  }

  <div class="footer">
    This is a computer-generated payslip. Please retain for tax purposes.<br/>
    ${d.agencyName} &middot; ABN ${d.agencyABN} &middot; Labour Hire Arrangement under STP Phase 2<br/>
    Any queries: contact your agency directly.
  </div>
</body>
</html>`;
}

export function generatePayslipPDF(d: PayslipData): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 0;

  const accent = "#2563eb";
  const darkText = "#111827";
  const grayText = "#6b7280";
  const lightGray = "#9ca3af";
  const bgGray = "#f4f5f7";
  const greenText = "#16a34a";
  const greenBg = "#f0fdf4";
  const purpleText = "#7c3aed";
  const purpleBg = "#f5f3ff";
  const redText = "#dc2626";

  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  }

  function setColor(hex: string) {
    const [r, g, b] = hexToRgb(hex);
    doc.setTextColor(r, g, b);
  }

  function setFillColor(hex: string) {
    const [r, g, b] = hexToRgb(hex);
    doc.setFillColor(r, g, b);
  }

  function setDrawColor(hex: string) {
    const [r, g, b] = hexToRgb(hex);
    doc.setDrawColor(r, g, b);
  }

  doc.setFillColor(...hexToRgb(accent));
  doc.rect(0, 0, pageW, 28, "F");

  setColor("#ffffff");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  y = 8;
  doc.text("PAY ADVICE / PAYSLIP", margin, y);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  y = 15;
  doc.text(d.agencyName, margin, y);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  y = 21;
  const abnLine = `ABN ${d.agencyABN}${d.agencyAddress ? " - " + d.agencyAddress : ""}`;
  doc.text(abnLine, margin, y);

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setFillColor("#ffffff");
  const badgeText = d.payPeriodLabel.toUpperCase();
  const badgeW = doc.getTextWidth(badgeText) + 8;
  doc.roundedRect(margin, 23, badgeW, 4, 2, 2, "F");
  setColor(accent);
  doc.text(badgeText, margin + 4, 26);

  setColor(darkText);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  y = 10;
  const nameW = doc.getTextWidth(d.contractorName);
  doc.text(d.contractorName, pageW - margin - nameW, y);

  setColor(grayText);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  y = 15;
  const addrParts = (d.contractorAddress || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const part of addrParts) {
    const w = doc.getTextWidth(part);
    doc.text(part, pageW - margin - w, y);
    y += 3.5;
  }

  setColor(lightGray);
  doc.setFontSize(7);
  const psNumW = doc.getTextWidth(d.payslipNumber);
  doc.text(d.payslipNumber, pageW - margin - psNumW, y + 1);

  y = 34;

  const halfW = (contentW - 4) / 2;
  setFillColor(bgGray);
  doc.roundedRect(margin, y, halfW, 14, 2, 2, "F");
  doc.roundedRect(margin + halfW + 4, y, halfW, 14, 2, 2, "F");

  setColor(lightGray);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("PAY PERIOD", margin + 4, y + 5);
  doc.text("PAYMENT DATE", margin + halfW + 8, y + 5);

  setColor(darkText);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${d.periodStart} - ${d.periodEnd}`, margin + 4, y + 11);
  setColor(accent);
  doc.setFont("helvetica", "bold");
  doc.text(d.paymentDate, margin + halfW + 8, y + 11);

  y += 20;

  function drawSectionHeader(title: string, yPos: number): number {
    setColor(grayText);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), margin, yPos);
    return yPos + 5;
  }

  function drawTableHeader(cols: { label: string; x: number; align?: string }[], yPos: number): number {
    setFillColor(bgGray);
    doc.roundedRect(margin, yPos - 3, contentW, 6, 1, 1, "F");
    setColor(grayText);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    for (const col of cols) {
      if (col.align === "right") {
        const w = doc.getTextWidth(col.label);
        doc.text(col.label, col.x - w, yPos);
      } else {
        doc.text(col.label, col.x, yPos);
      }
    }
    return yPos + 6;
  }

  const earningsCols = [
    { label: "DESCRIPTION", x: margin + 3 },
    { label: "UNITS", x: margin + contentW * 0.55, align: "right" },
    { label: "RATE", x: margin + contentW * 0.75, align: "right" },
    { label: "AMOUNT", x: margin + contentW - 3, align: "right" },
  ];

  y = drawSectionHeader("Earnings", y);
  y = drawTableHeader(earningsCols, y);

  doc.setFontSize(8);
  for (const e of d.earnings) {
    setColor(darkText);
    doc.setFont("helvetica", "normal");
    doc.text(e.description, margin + 3, y);

    setColor(grayText);
    if (e.units != null) {
      const unitsStr = e.units.toFixed(2);
      const uw = doc.getTextWidth(unitsStr);
      doc.text(unitsStr, margin + contentW * 0.55 - uw, y);
    }
    if (e.rate != null) {
      const rateStr = fmt(e.rate);
      const rw = doc.getTextWidth(rateStr);
      doc.text(rateStr, margin + contentW * 0.75 - rw, y);
    }
    const amtStr = fmt(e.amount);
    const aw = doc.getTextWidth(amtStr);
    doc.text(amtStr, margin + contentW - 3 - aw, y);
    y += 5;
  }

  setDrawColor("#e5e7eb");
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentW, y);
  y += 4;

  setColor(darkText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total earnings", margin + 3, y);
  const totalEarnStr = fmt(d.grossEarnings);
  const teW = doc.getTextWidth(totalEarnStr);
  doc.text(totalEarnStr, margin + contentW - 3 - teW, y);
  y += 8;

  const deductionsCols = [
    { label: "DESCRIPTION", x: margin + 3 },
    { label: "AMOUNT", x: margin + contentW - 3, align: "right" },
  ];

  y = drawSectionHeader("Deductions", y);
  y = drawTableHeader([
    { label: "DESCRIPTION", x: margin + 3 },
    { label: "", x: margin + contentW * 0.55, align: "right" },
    { label: "", x: margin + contentW * 0.75, align: "right" },
    { label: "AMOUNT", x: margin + contentW - 3, align: "right" },
  ], y);

  doc.setFontSize(8);
  for (const dd of d.deductions) {
    setColor(darkText);
    doc.setFont("helvetica", "normal");
    doc.text(dd.description, margin + 3, y);

    setColor(redText);
    const dedStr = `(${fmt(dd.amount)})`;
    const dw = doc.getTextWidth(dedStr);
    doc.text(dedStr, margin + contentW - 3 - dw, y);
    y += 5;
  }

  setDrawColor("#e5e7eb");
  doc.line(margin, y, margin + contentW, y);
  y += 4;

  setColor(darkText);
  doc.setFont("helvetica", "bold");
  doc.text("Total deductions", margin + 3, y);
  setColor(redText);
  const totalDedStr = `(${fmt(d.totalDeductions)})`;
  const tdW = doc.getTextWidth(totalDedStr);
  doc.text(totalDedStr, margin + contentW - 3 - tdW, y);
  y += 8;

  setFillColor(greenBg);
  doc.roundedRect(margin, y - 3, contentW, 10, 2, 2, "F");
  setColor(greenText);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Net pay", margin + 4, y + 3);
  const netStr = fmt(d.netPay);
  const nw = doc.getTextWidth(netStr);
  doc.text(netStr, margin + contentW - 4 - nw, y + 3);
  y += 14;

  setFillColor(purpleBg);
  setDrawColor("#ddd6fe");
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y - 3, contentW, 12, 2, 2, "FD");
  setColor(purpleText);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`Superannuation (${(d.superRate * 100).toFixed(1)}% SGC)`, margin + 4, y + 1);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Paid directly to your super fund - not included in net pay", margin + 4, y + 5.5);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const superStr = fmt(d.superAmount);
  const sw = doc.getTextWidth(superStr);
  doc.text(superStr, margin + contentW - 4 - sw, y + 3);
  y += 16;

  const fyYear = new Date().getFullYear();
  y = drawSectionHeader(`Year to date (FY${fyYear}-${String(fyYear + 1).slice(2)})`, y);

  const ytdCardW = (contentW - 8) / 3;
  const ytdCards = [
    { label: "GROSS EARNINGS", value: fmt(d.ytdGross), color: darkText },
    { label: "PAYG WITHHELD", value: fmt(d.ytdPayg), color: redText },
    { label: "SUPER CONTRIBUTIONS", value: fmt(d.ytdSuper), color: purpleText },
  ];

  for (let i = 0; i < ytdCards.length; i++) {
    const card = ytdCards[i];
    const cx = margin + i * (ytdCardW + 4);
    setFillColor(bgGray);
    doc.roundedRect(cx, y, ytdCardW, 14, 2, 2, "F");

    setColor(lightGray);
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    const lblW = doc.getTextWidth(card.label);
    doc.text(card.label, cx + (ytdCardW - lblW) / 2, y + 5);

    setColor(card.color);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const vW = doc.getTextWidth(card.value);
    doc.text(card.value, cx + (ytdCardW - vW) / 2, y + 11);
  }
  y += 20;

  if (d.bsb) {
    y = drawSectionHeader("Payment details", y);
    setFillColor(bgGray);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, "F");
    setColor(grayText);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const bankInfo = `Deposited to: ${d.bankName ? d.bankName + " - " : ""}BSB ${d.bsb.slice(0, 3)}-${d.bsb.slice(3)} - Account ending ...${d.accountSuffix ?? "???"}`;
    doc.text(bankInfo, margin + 4, y + 5);
    y += 14;
  }

  setDrawColor("#e5e7eb");
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + contentW, y);
  y += 4;

  setColor(lightGray);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  const footerLines = [
    "This is a computer-generated payslip. Please retain for tax purposes.",
    `${d.agencyName} - ABN ${d.agencyABN} - Labour Hire Arrangement under STP Phase 2`,
    "Any queries: contact your agency directly.",
  ];
  for (const line of footerLines) {
    const lw = doc.getTextWidth(line);
    doc.text(line, (pageW - lw) / 2, y);
    y += 3.5;
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function buildPayslipData(opts: {
  line: Record<string, any>;
  contractor: Record<string, any>;
  bank?: Record<string, any>;
  settings: Record<string, string>;
  ytd: { gross: number; payg: number; super: number };
  payRun: Record<string, any>;
  payslipNum: string;
}): PayslipData {
  const { line, contractor, bank, settings, ytd, payRun, payslipNum } = opts;

  const hours = Number(line.hoursWorked ?? line.hours_worked ?? 0);
  const rate = Number(line.ratePerHour ?? line.rate_per_hour ?? 0);
  const gross = Number(line.grossEarnings ?? line.gross_earnings ?? 0);
  const payg = Number(line.paygWithheld ?? line.payg_withheld ?? 0);
  const sup = Number(line.superAmount ?? line.super_amount ?? 0);
  const net = Number(line.netPay ?? line.net_pay ?? 0);

  const monthIdx = Number(payRun.month) - 1;
  const periodLabel = `${MONTHS[monthIdx]} ${payRun.year}`;

  const fmtDate = (d: unknown) => {
    if (!d) return "";
    return new Date(d as string).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return {
    agencyName: settings.company_name ?? "Recruitment Agency",
    agencyABN: settings.company_abn ?? "00 000 000 000",
    agencyAddress: [settings.company_suburb, settings.company_state].filter(Boolean).join(", "),
    contractorName: `${contractor.firstName ?? contractor.first_name} ${contractor.lastName ?? contractor.last_name}`,
    contractorAddress: [
      contractor.addressLine1 ?? contractor.address_line1,
      contractor.suburb,
      contractor.state,
      contractor.postcode,
    ]
      .filter(Boolean)
      .join(", "),
    payPeriodLabel: periodLabel,
    periodStart: fmtDate(payRun.periodStart ?? payRun.period_start),
    periodEnd: fmtDate(payRun.periodEnd ?? payRun.period_end),
    paymentDate: fmtDate(payRun.paymentDate ?? payRun.payment_date ?? payRun.payDate ?? payRun.pay_date),
    payslipNumber: payslipNum,
    earnings: [{ description: "Ordinary time earnings", units: hours, rate, amount: gross }],
    deductions: [{ description: "PAYG income tax withheld", amount: payg }],
    grossEarnings: gross,
    totalDeductions: payg,
    netPay: net,
    paygWithheld: payg,
    superAmount: sup,
    superRate: Number(payRun.superRate ?? payRun.super_rate ?? 0.115),
    ytdGross: ytd.gross,
    ytdPayg: ytd.payg,
    ytdSuper: ytd.super,
    bankName: bank?.bankName ?? bank?.bank_name,
    bsb: bank?.bsb,
    accountSuffix: bank ? String(bank.accountNumber ?? bank.account_number).slice(-3) : undefined,
  };
}
