import type { Day } from "./types";

const MS_DAY = 86_400_000;

export function dateOf(startDate: string, day: Day): Date {
  return new Date(Date.parse(startDate + "T00:00:00Z") + day * MS_DAY);
}

export function isWeekday(startDate: string, day: Day): boolean {
  const wd = dateOf(startDate, day).getUTCDay();
  return wd !== 0 && wd !== 6;
}

export function isMonthStart(startDate: string, day: Day): boolean {
  return dateOf(startDate, day).getUTCDate() === 1;
}

export function isMonday(startDate: string, day: Day): boolean {
  return dateOf(startDate, day).getUTCDay() === 1;
}

export function monthKey(startDate: string, day: Day): string {
  return dateOf(startDate, day).toISOString().slice(0, 7);
}

export function monthIndex(startDate: string, day: Day): number {
  return dateOf(startDate, day).getUTCMonth(); // 0 = Jan
}

export function formatDate(startDate: string, day: Day, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateOf(startDate, day).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

/** Day index of the next date that falls on the given day-of-month and month (0-based), strictly after `from`. */
export function nextDate(startDate: string, from: Day, month: number, dom: number): Day {
  const d = dateOf(startDate, from);
  let year = d.getUTCFullYear();
  let target = Date.UTC(year, month, dom);
  if (target <= d.getTime()) target = Date.UTC(++year, month, dom);
  return Math.round((target - Date.parse(startDate + "T00:00:00Z")) / MS_DAY);
}

/** Add business days (Mon–Fri). */
export function addBusinessDays(startDate: string, from: Day, n: number): Day {
  let d = from;
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    d++;
    if (isWeekday(startDate, d)) left--;
  }
  while (!isWeekday(startDate, d)) d++;
  return d;
}

/** Demand seasonality: Europe goes quiet in August and over Christmas. */
export function seasonality(startDate: string, day: Day): number {
  const d = dateOf(startDate, day);
  const m = d.getUTCMonth();
  if (m === 7) return 0.45;
  if (m === 11 && d.getUTCDate() > 18) return 0.35;
  if (m === 0 && d.getUTCDate() < 7) return 0.5;
  if (m === 6) return 0.8;
  if (m === 11) return 0.8;
  return 1;
}
