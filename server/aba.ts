export interface ABAHeader {
  bsb: string;
  accountNumber: string;
  accountName: string;
  apcsUserName: string;
  apcsUserId: string;
  description: string;
  processingDate: string;
}

export interface ABAEntry {
  bsb: string;
  accountNumber: string;
  accountName: string;
  transactionCode: "50" | "53";
  amount: number;
  lodgementRef: string;
  traceBsb: string;
  traceAccount: string;
  remitterName: string;
}

function padRight(str: string, len: number): string {
  return str.substring(0, len).padEnd(len, " ");
}

function padLeft(str: string, len: number, char = "0"): string {
  return str.substring(0, len).padStart(len, char);
}

function normaliseBSB(bsb: string): string {
  return bsb.replace(/[^0-9]/g, "").padStart(6, "0");
}

function buildDescriptiveRecord(h: ABAHeader): string {
  const bsb = normaliseBSB(h.bsb);
  let line = "0";
  line += " ".repeat(17);
  line += "01";
  line += padRight(h.apcsUserName, 26);
  line += padLeft(h.apcsUserId, 6);
  line += padRight(h.description, 12);
  line += h.processingDate;
  line += " ".repeat(40);
  return line;
}

function buildDetailRecord(e: ABAEntry): string {
  const bsb = normaliseBSB(e.bsb);
  let line = "1";
  line += bsb.slice(0, 3) + "-" + bsb.slice(3);
  line += padLeft(e.accountNumber.replace(/[^0-9]/g, ""), 9);
  line += " ";
  line += e.transactionCode;
  line += padLeft(Math.round(e.amount * 100).toString(), 10);
  line += padRight(e.accountName, 32);
  line += padRight(e.lodgementRef, 18);
  const traceBsb = normaliseBSB(e.traceBsb);
  line += traceBsb.slice(0, 3) + "-" + traceBsb.slice(3);
  line += padLeft(e.traceAccount.replace(/[^0-9]/g, ""), 9);
  line += padRight(e.remitterName, 16);
  line += padLeft("0", 8);
  return line;
}

function buildTotalRecord(entries: ABAEntry[]): string {
  const totalCredit = entries
    .filter((e) => e.transactionCode === "50")
    .reduce((s, e) => s + Math.round(e.amount * 100), 0);
  const totalDebit = entries
    .filter((e) => e.transactionCode === "53")
    .reduce((s, e) => s + Math.round(e.amount * 100), 0);
  const netTotal = Math.abs(totalCredit - totalDebit);

  let line = "7";
  line += "999-999";
  line += " ".repeat(12);
  line += padLeft(netTotal.toString(), 10);
  line += padLeft(totalCredit.toString(), 10);
  line += padLeft(totalDebit.toString(), 10);
  line += " ".repeat(24);
  line += padLeft(entries.length.toString(), 6);
  line += " ".repeat(40);
  return line;
}

export function buildABAFromPayRun(opts: {
  header: ABAHeader;
  lines: {
    employeeName: string;
    bsb: string;
    accountNumber: string;
    netPay: number;
    payslipNumber: string;
  }[];
  paymentDate?: string;
}): { content: string; totalAmount: number; entryCount: number } {
  const { header, lines } = opts;

  const entries: ABAEntry[] = lines.map((l) => ({
    bsb: l.bsb,
    accountNumber: l.accountNumber,
    accountName: l.employeeName.toUpperCase(),
    transactionCode: "50" as const,
    amount: l.netPay,
    lodgementRef: l.payslipNumber,
    traceBsb: header.bsb,
    traceAccount: header.accountNumber,
    remitterName: header.accountName.toUpperCase(),
  }));

  const recordLines = [
    buildDescriptiveRecord(header),
    ...entries.map(buildDetailRecord),
    buildTotalRecord(entries),
  ];

  const totalAmount = lines.reduce((s, l) => s + l.netPay, 0);

  return {
    content: recordLines.join("\r\n") + "\r\n",
    totalAmount,
    entryCount: entries.length,
  };
}
