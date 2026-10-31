import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export class BookingError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
export async function session() {
  const jar = await cookies();
  let token = jar.get("forma_guest")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    jar.set("forma_guest", token, { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
  }
  const key = process.env.BOOKING_STAFF_PASSWORD;
  const cookie = jar.get("forma_staff")?.value ?? "";
  const [expiry, nonce, signature] = cookie.split(".");
  const payload = `${expiry}.${nonce}`;
  const isStaff = Boolean(key && /^\d{13}$/.test(expiry ?? "") && /^[a-f0-9]{32}$/.test(nonce ?? "") && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + 8 * 3600000 && equal(signature ?? "", createHmac("sha256", key).update(payload).digest("hex")));
  return { owner: hash(token), isStaff, staffHeader: isStaff && key ? hash(key) : "" };
}
export async function staffLogin(password: string) {
  const key = process.env.BOOKING_STAFF_PASSWORD;
  if (!key) throw new BookingError("Staff access is not configured.");
  if (!equal(hash(password), hash(key))) throw new BookingError("Staff password is incorrect.", 401);
  const payload = `${Date.now() + 8 * 3600000}.${randomBytes(16).toString("hex")}`;
  const signed = `${payload}.${createHmac("sha256", key).update(payload).digest("hex")}`;
  (await cookies()).set("forma_staff", signed, { ...cookieOptions, maxAge: 8 * 3600 });
}
export async function staffLogout() { (await cookies()).delete("forma_staff"); }
export async function database(path: string, owner: string, staffHeader: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new BookingError("Booking is temporarily unavailable. Please try again later.");
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000), headers: { apikey: key, "Content-Type": "application/json", "x-booking-owner": owner, "x-booking-staff": staffHeader, Prefer: "return=representation", ...init.headers } });
  } catch { throw new BookingError("The booking service could not be reached. Please retry."); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === "23P01" || error.code === "23505") throw new BookingError("That time was just booked. Choose another appointment.", 409);
    if (error.code === "23514") throw new BookingError("This appointment cannot be booked or changed. Check opening hours and the five-booking limit.", 400);
    if (error.code === "42501") throw new BookingError("You do not have access to this appointment.", 403);
    throw new BookingError("Appointments could not be loaded or saved. Please retry.");
  }
  return response.status === 204 ? null : response.json();
}
