import assert from 'node:assert/strict';
import { request } from 'playwright-core';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const base = (process.argv[2] || 'http://127.0.0.1:3105').replace(/\/$/, '');
const contexts = await Promise.all([0,1,2].map(() => request.newContext({ baseURL: base, extraHTTPHeaders: { Origin: base } })));
const [first, second, staff] = contexts;
const reservations = [];
const post = (context, data) => context.post('/api/booking', { data });
try {
  const initial = await first.get('/api/booking');
  assert.equal(initial.status(), 200, 'Availability must load with configured database');
  assert(initial.headers()['cache-control']?.includes('no-store'), 'Booking data must not be cached');
  const data = await initial.json();
  assert.equal(data.role, 'customer');
  assert(data.services.length >= 2);
  assert(data.staff.length >= 2);
  let chosen;
  for (let offset = 2; offset < 13 && !chosen; offset++) {
    const date = new Date(`${data.today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0,10);
    const response = await first.get(`/api/booking?date=${day}&staff=alex&serviceId=consultation`);
    const result = await response.json();
    const slot = result.slots?.find(item => item.available);
    if (slot) chosen = { day, slot };
  }
  assert(chosen, 'No available weekday slot within booking horizon');
  await second.get('/api/booking');
  const payload = { action:'book', serviceId:'consultation', staffId:'alex', start:chosen.slot.start, name:'Acceptance check', email:'acceptance@example.com' };
  const concurrent = await Promise.all([post(first,payload),post(second,payload)]);
  const results = await Promise.all(concurrent.map(response=>response.json()));
  for (let index=0;index<results.length;index++) {
    if (results[index].booking?.id) reservations.push({owner:contexts[index],id:results[index].booking.id});
  }
  assert.deepEqual(concurrent.map(r=>r.status()).sort(), [201,409], 'Database must allow exactly one overlapping reservation');
  const winnerIndex = concurrent[0].status()===201 ? 0 : 1;
  const owner = contexts[winnerIndex], foreign = contexts[1-winnerIndex];
  const booking = results[winnerIndex].booking;
  assert(booking?.id);
  const own = await (await owner.get('/api/booking')).json();
  assert(own.bookings.some(row=>row.id===booking.id));
  const other = await (await foreign.get('/api/booking')).json();
  assert(!other.bookings.some(row=>row.id===booking.id), 'Foreign browser must not read booking');
  const cancelForeign = await post(foreign,{action:'cancel',id:booking.id});
  assert([403,404].includes(cancelForeign.status()), 'Foreign browser must not cancel booking');
  const unavailable = await (await foreign.get(`/api/booking?date=${chosen.day}&staff=alex&serviceId=consultation`)).json();
  assert.equal(unavailable.slots.find(item=>item.start===chosen.slot.start)?.available,false);
  const wrongPassword = await post(staff,{action:'staff-login',password:'intentionally-invalid-test-password'});
  assert.equal(wrongPassword.status(),401);
  if (process.env.BOOKING_STAFF_PASSWORD) {
    assert.equal((await post(staff,{action:'staff-login',password:process.env.BOOKING_STAFF_PASSWORD})).status(),200);
    const schedule = await (await staff.get(`/api/booking?date=${chosen.day}&staff=alex`)).json();
    assert.equal(schedule.role,'staff');
    assert(schedule.bookings.some(row=>row.id===booking.id));
    assert.equal((await post(staff,{action:'staff-logout'})).status(),200);
    assert.equal((await (await staff.get('/api/booking')).json()).role,'customer');
  }
  assert.equal((await post(owner,{action:'cancel',id:booking.id})).status(),200);
  reservations.length=0;
  const freed = await (await foreign.get(`/api/booking?date=${chosen.day}&staff=alex&serviceId=consultation`)).json();
  assert.equal(freed.slots.find(item=>item.start===chosen.slot.start)?.available,true);
  const bad = await post(first,{...payload,start:'2000-01-01T10:00:00Z'});
  assert.equal(bad.status(),400);
  const crossOrigin = await first.post('/api/booking',{headers:{Origin:'https://foreign.invalid'},data:payload});
  assert.equal(crossOrigin.status(),403);
  console.log('PASS: concurrent booking conflict, ownership isolation, staff role boundary, cancellation releases slot, stale input and foreign-origin rejection.');
  if (!process.env.BOOKING_STAFF_PASSWORD) console.log('Correct-password staff login omitted: BOOKING_STAFF_PASSWORD unavailable to this test process.');
} finally {
  for (const reservation of reservations) await post(reservation.owner,{action:'cancel',id:reservation.id}).catch(()=>{});
  await Promise.all(contexts.map(context=>context.dispose()));
}
