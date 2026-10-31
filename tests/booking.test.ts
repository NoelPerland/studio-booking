import test from "node:test";
import assert from "node:assert/strict";
import { bookInput, instant, slots, today, validDate } from "../lib/booking";

test("Stockholm day and appointment conversion handles summer and winter", () => {
  assert.equal(today(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
  assert.equal(instant("2026-11-02", 540), "2026-11-02T08:00:00.000Z");
  assert.equal(instant("2026-07-01", 540), "2026-07-01T07:00:00.000Z");
  assert.equal(instant("2026-11-02", 0), "2026-11-01T23:00:00.000Z");
});
test("Horizon rejects invalid calendar dates and distant reservations", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  assert(validDate("2026-11-14", now));
  assert(!validDate("2026-11-15", now));
  assert(!validDate("2026-10-30", now));
  assert(!validDate("2026-02-30", now));
  assert(!validDate("2026-1-1", now));
});
test("Availability uses half-open ranges and fits full service duration", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const busy = [{ starts_at: "2026-11-02T09:00:00Z", ends_at: "2026-11-02T10:00:00Z" }];
  const available = slots("2026-11-02", 60, busy, now);
  assert.equal(available.length, 15);
  assert.equal(available[0].available, true, "09:00 local ending at10:00 local touches occupied start");
  assert.equal(available[1].available, false, "overlapping service cannot start");
  assert.equal(available[4].available, true, "service at occupied end is free");
  assert.equal(available.at(-1)?.end, "2026-11-02T16:00:00.000Z");
  assert.deepEqual(slots("2026-11-01", 30, [], now), [], "Sunday closed");
});
test("Past slots unavailable and booking input is strict", () => {
  const result = slots("2026-11-02", 30, [], new Date("2026-11-02T08:20:00Z"));
  assert.equal(result[0].available, false);
  assert.equal(result[1].available, true);
  const data = { action: "book", serviceId: "consultation", staffId: "alex", start: "2026-11-02T08:30:00Z", name: " Alex ", email: "alex@example.com" };
  assert.equal(bookInput.parse(data).name, "Alex");
  assert(!bookInput.safeParse({ ...data, owner_hash: "forged" }).success);
  assert(!bookInput.safeParse({ ...data, staffId: "admin" }).success);
  assert(!bookInput.safeParse({ ...data, email: "bad email" }).success);
});
