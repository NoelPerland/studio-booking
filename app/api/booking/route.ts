import { NextRequest, NextResponse } from "next/server";
import { bookInput, mutation, services, staff, serviceId, staffId, slots, today, validDate, instant } from "../../../lib/booking";
import { BookingError, database, session, staffLogin, staffLogout } from "../../../lib/server";

export const dynamic = "force-dynamic";
const select = "id,service_id,staff_id,starts_at,ends_at,customer_name,customer_email:email,status,created_at";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  return error instanceof BookingError ? json({ error: error.message }, error.status) : json({ error: "Something went wrong. Your booking has not been confirmed. Please refresh before retrying." }, 503);
}
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") || today();
    const person = staffId.safeParse(request.nextUrl.searchParams.get("staff") || "alex");
    const service = serviceId.safeParse(request.nextUrl.searchParams.get("serviceId") || "consultation");
    if (!validDate(date) || !person.success || !service.success) return json({ error: "Choose a valid date, service and team member within the next 14 days." }, 400);
    const who = await session();
    const busy = await database("rpc/studio_busy", who.owner, who.staffHeader, { method: "POST", body: JSON.stringify({ day: date, person: person.data }) });
    // Staff see selected-day appointments; customers only see their own rows through RLS.
    const nextDay = new Date(Date.parse(date + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    const range = who.isStaff ? `&starts_at=gte.${instant(date, 0)}&starts_at=lt.${instant(nextDay, 0)}` : `&starts_at=gte.${new Date().toISOString()}`;
    const bookings = await database(`studio_bookings?select=${select}&order=starts_at.asc${range}&limit=100`, who.owner, who.staffHeader);
    return json({ slots: slots(date, services.find(s => s.id === service.data)!.duration, busy), bookings, role: who.isStaff ? "staff" : "customer", services, staff, today: today(), timeZone: "Europe/Stockholm" });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    let sameOrigin = false;
    try {
      const source = new URL(origin || "");
      // Next development normalizes nextUrl.hostname; Host retains the browser's actual origin.
      sameOrigin = source.host === request.headers.get("host") && source.protocol === request.nextUrl.protocol;
    } catch { /* Missing and malformed origins are rejected. */ }
    if (!sameOrigin) return json({ error: "Request origin is not allowed." }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16000) { await reader.cancel(); return json({ error: "Request is too large." }, 413); }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
    const parsed = mutation.safeParse(body);
    if (!parsed.success) return json({ error: "Check the appointment details and try again." }, 400);
    const input = parsed.data;
    if (input.action === "staff-login") { await staffLogin(input.password); return json({ ok: true }); }
    if (input.action === "staff-logout") { await staffLogout(); return json({ ok: true }); }
    const who = await session();
    if (input.action === "cancel") {
      const rows = await database(`studio_bookings?id=eq.${input.id}&status=eq.booked&select=${select}`, who.owner, who.staffHeader, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      if (!rows?.length) return json({ error: "This appointment is unavailable or already cancelled." }, 404);
      return json({ booking: rows[0] });
    }
    const value = bookInput.parse(input), service = services.find(s => s.id === value.serviceId)!;
    const start = new Date(value.start).toISOString();
    const day = today(new Date(start));
    if (!slots(day, service.duration).some(s => s.start === start && s.available)) return json({ error: "Choose an available half-hour start during weekday opening hours." }, 400);
    const rows = await database(`studio_bookings?select=${select}`, who.owner, who.staffHeader, { method: "POST", body: JSON.stringify({ owner_hash: who.owner, service_id: value.serviceId, staff_id: value.staffId, starts_at: start, ends_at: new Date(Date.parse(start) + service.duration * 60000).toISOString(), customer_name: value.name, email: value.email }) });
    return json({ booking: rows[0] }, 201);
  } catch (error) { return failure(error); }
}
