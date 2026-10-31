import { z } from "zod";

export const TIME_ZONE = "Europe/Stockholm";
export const services = [
  { id: "consultation", name: "Studio consultation", duration: 30, price: 350 },
  { id: "session", name: "Creative session", duration: 60, price: 650 },
] as const;
export const staff = [{ id: "alex", name: "Alex" }, { id: "sam", name: "Sam" }] as const;
export const serviceId = z.enum(["consultation", "session"]);
export const staffId = z.enum(["alex", "sam"]);
export const bookInput = z.object({
  action: z.literal("book"), serviceId, staffId,
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
}).strict();
export const mutation = z.discriminatedUnion("action", [
  bookInput,
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("staff-login"), password: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal("staff-logout") }).strict(),
]);
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function validDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(value + "T12:00:00Z");
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) return false;
  const difference = (stamp - Date.parse(today(now) + "T12:00:00Z")) / 86400000;
  return difference >= 0 && difference <= 14;
}
export function instant(date: string, minutes: number) {
  const guess = new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00Z`);
  const parts = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).formatToParts(guess);
  const localMinutes = Number(parts.find(p => p.type === "hour")!.value) * 60 + Number(parts.find(p => p.type === "minute")!.value);
  return new Date(guess.getTime() - (localMinutes - minutes) * 60000).toISOString();
}
export type Busy = { starts_at: string; ends_at: string };
export function slots(date: string, duration: number, busy: Busy[] = [], now = new Date()) {
  if (!validDate(date, now) || [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay())) return [];
  const result: { start: string; end: string; available: boolean }[] = [];
  for (let minute = 9 * 60; minute + duration <= 17 * 60; minute += 30) {
    const start = instant(date, minute), end = new Date(Date.parse(start) + duration * 60000).toISOString();
    result.push({ start, end, available: Date.parse(start) > now.getTime() && !busy.some(b => Date.parse(b.starts_at) < Date.parse(end) && Date.parse(b.ends_at) > Date.parse(start)) });
  }
  return result;
}
