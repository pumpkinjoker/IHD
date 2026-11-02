import { bangkokDate } from "@/lib/line/intake";

export function previousExpenseMonth(now = new Date()) {
  const month = bangkokDate(now).slice(0, 7);
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export function isAvailableExpenseMonth(month: string, now = new Date()) {
  return month === bangkokDate(now).slice(0, 7) || month === previousExpenseMonth(now);
}
