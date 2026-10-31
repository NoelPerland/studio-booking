import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=(process.argv[2]||'http://127.0.0.1:3120').replace(/\/$/,'');
const db=process.env.SUPABASE_URL+'/rest/v1/';
const key=process.env.SUPABASE_PUBLISHABLE_KEY;
assert(key,'Configured publishable key required');
const owner=randomBytes(32).toString('hex'),foreign=randomBytes(32).toString('hex');
const call=(path,capability,init={})=>fetch(db+path,{...init,headers:{apikey:key,'content-type':'application/json','x-booking-owner':capability,Prefer:'return=representation',...init.headers}});
const initial=await (await fetch(base+'/api/booking')).json();
let slot;
for(let offset=8;offset<14&&!slot;offset++){
 const date=new Date(initial.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);
 const day=date.toISOString().slice(0,10);const r=await (await fetch(base+`/api/booking?date=${day}&staff=sam`)).json();
 const available=r.slots?.find(item=>item.available);if(available)slot={...available,day};
}
assert(slot);
const row={owner_hash:owner,service_id:'consultation',staff_id:'sam',starts_at:slot.start,ends_at:slot.end,customer_name:'RLS acceptance',email:'rls@example.com'};
const rows=[];
try {
 const responses=await Promise.all([call('studio_bookings',owner,{method:'POST',body:JSON.stringify(row)}),call('studio_bookings',owner,{method:'POST',body:JSON.stringify(row)})]);
 const errors=[];
 for(const r of responses){const body=await r.json();if(r.ok)rows.push(...body);else errors.push(body);}
 assert.equal(rows.length,1,'Exactly one concurrent raw REST insert succeeds');
 assert.equal(errors.length,1);
 assert.equal(errors[0].code,'23P01','Database exclusion constraint rejects the overlap independently of API status mapping');
 const id=rows[0].id;
 const hidden=await call('studio_bookings?id=eq.'+id,foreign);assert.deepEqual(await hidden.json(),[]);
 const anonymous=await call('studio_bookings?id=eq.'+id,'');assert.deepEqual(await anonymous.json(),[]);
 const transfer=await call('studio_bookings?id=eq.'+id,owner,{method:'PATCH',body:JSON.stringify({owner_hash:foreign})});assert(transfer.status>=400,'Ownership column must not be mutable');
 const changeTime=await call('studio_bookings?id=eq.'+id,owner,{method:'PATCH',body:JSON.stringify({starts_at:'2000-01-01T10:00:00Z'})});assert(changeTime.status>=400);
 const cancelForeign=await call('studio_bookings?id=eq.'+id,foreign,{method:'PATCH',body:JSON.stringify({status:'cancelled'})});assert.deepEqual(await cancelForeign.json(),[]);
 const busy=await call('rpc/studio_busy','',{method:'POST',body:JSON.stringify({day:slot.day,person:'sam'})});for(const item of await busy.json())assert.deepEqual(Object.keys(item).sort(),['ends_at','starts_at']);
 const exposed=await fetch(process.env.SUPABASE_URL+'/rest/v1/studio_settings',{headers:{apikey:key}});assert(exposed.status>=400);
 console.log('PASS direct REST: exclusion constraint, owner isolation, immutable owner/time, foreign cancellation blocked, availability contains no PII, settings inaccessible.');
} finally {for(const row of rows)await call('studio_bookings?id=eq.'+row.id,owner,{method:'PATCH',body:JSON.stringify({status:'cancelled'})});}
