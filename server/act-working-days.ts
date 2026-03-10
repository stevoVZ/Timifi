function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  let day = first.getDay();
  let diff = (weekday - day + 7) % 7;
  const firstOccurrence = new Date(year, month, 1 + diff);
  return addDays(firstOccurrence, (n - 1) * 7);
}

function lastMonday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const day = lastDay.getDay();
  const diff = (day - 1 + 7) % 7;
  return addDays(lastDay, -diff);
}

function substituteHoliday(date: Date): Date {
  const day = date.getDay();
  if (day === 0) return addDays(date, 1);
  if (day === 6) return addDays(date, 2);
  return date;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function reconciliationDay(year: number): Date {
  const may27 = new Date(year, 4, 27);
  const day = may27.getDay();
  if (day === 1) return may27;
  if (day === 0) return addDays(may27, 1);
  if (day === 6) return addDays(may27, 2);
  if (day >= 2 && day <= 5) return addDays(may27, (8 - day) % 7);
  return may27;
}

export function getACTPublicHolidays(year: number): Date[] {
  const holidays: Date[] = [];

  holidays.push(substituteHoliday(new Date(year, 0, 1)));
  holidays.push(substituteHoliday(new Date(year, 0, 26)));
  holidays.push(nthWeekday(year, 2, 1, 2));

  const easter = easterSunday(year);
  holidays.push(addDays(easter, -2));
  holidays.push(addDays(easter, -1));
  holidays.push(addDays(easter, 1));

  holidays.push(substituteHoliday(new Date(year, 3, 25)));
  holidays.push(reconciliationDay(year));
  holidays.push(nthWeekday(year, 5, 1, 2));

  if (year <= 2017) {
    const lastMondaySep = lastMonday(year, 8);
    holidays.push(lastMondaySep);
  } else {
    const lastMondaySep = lastMonday(year, 8);
    const sep30 = new Date(year, 8, 30);
    if (lastMondaySep <= sep30) {
      holidays.push(lastMondaySep);
    } else {
      holidays.push(addDays(lastMondaySep, -7));
    }
  }

  holidays.push(substituteHoliday(new Date(year, 11, 25)));
  holidays.push(substituteHoliday(new Date(year, 11, 26)));

  return holidays;
}

export function getShutdownDates(year: number): Date[] {
  const dates: Date[] = [];
  const startDate = new Date(year, 11, 20);
  const endDate = new Date(year + 1, 0, 3);

  let current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(current));
    }
    current = addDays(current, 1);
  }
  return dates;
}

export function getACTWorkingDays(year: number, month: number): { workingDays: number; totalWeekdays: number; holidays: number; shutdownDays: number } {
  const holidayKeys = new Set<string>();
  getACTPublicHolidays(year).forEach(h => holidayKeys.add(dateKey(h)));

  const shutdownKeys = new Set<string>();
  getShutdownDates(year - 1).forEach(d => shutdownKeys.add(dateKey(d)));
  getShutdownDates(year).forEach(d => shutdownKeys.add(dateKey(d)));

  const daysInMonth = new Date(year, month, 0).getDate();

  let totalWeekdays = 0;
  let holidays = 0;
  let shutdownDays = 0;
  let workingDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    if (day === 0 || day === 6) continue;

    totalWeekdays++;
    const key = dateKey(date);

    if (holidayKeys.has(key)) {
      holidays++;
    } else if (shutdownKeys.has(key)) {
      shutdownDays++;
    } else {
      workingDays++;
    }
  }

  return { workingDays, totalWeekdays, holidays, shutdownDays };
}

export function getACTExpectedHours(year: number, month: number, hoursPerDay: number = 7.5): number {
  const { workingDays } = getACTWorkingDays(year, month);
  return parseFloat((workingDays * hoursPerDay).toFixed(2));
}
