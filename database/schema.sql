-- Additive booking-demo schema. Existing product tables are untouched.
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
create table private.studio_settings (
  singleton boolean primary key default true check (singleton),
  staff_secret_hash text not null check (staff_secret_hash ~ '^[a-f0-9]{64}$')
);
revoke all on private.studio_settings from public, anon, authenticated;

create or replace function private.studio_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.studio_settings
    where staff_secret_hash = (nullif(current_setting('request.headers', true),'')::jsonb ->> 'x-booking-staff'));
$$;
revoke all on function private.studio_staff() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.studio_staff() to anon, authenticated;

create table public.studio_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  service_id text not null check (service_id in ('consultation','session')),
  staff_id text not null check (staff_id in ('alex','sam')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null check (length(trim(customer_name)) between 1 and 80),
  email text not null check (length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'booked' check (status in ('booked','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint studio_no_overlap exclude using gist
    (staff_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'booked')
);
create index studio_owner_start on public.studio_bookings(owner_hash, starts_at);
alter table public.studio_bookings enable row level security;
revoke all on public.studio_bookings from anon, authenticated;
grant select, insert on public.studio_bookings to anon, authenticated;
grant update(status) on public.studio_bookings to anon, authenticated;

create policy studio_read on public.studio_bookings for select to anon, authenticated
using (owner_hash = (nullif(current_setting('request.headers', true),'')::jsonb ->> 'x-booking-owner') or (select private.studio_staff()));
create policy studio_create on public.studio_bookings for insert to anon, authenticated
with check (owner_hash = (nullif(current_setting('request.headers', true),'')::jsonb ->> 'x-booking-owner') and status = 'booked');
create policy studio_cancel on public.studio_bookings for update to anon, authenticated
using ((owner_hash = (nullif(current_setting('request.headers', true),'')::jsonb ->> 'x-booking-owner') or (select private.studio_staff())) and starts_at > now())
with check (status = 'cancelled');

create function private.studio_validate() returns trigger language plpgsql security definer set search_path = '' as $$
declare local_start timestamp := new.starts_at at time zone 'Europe/Stockholm';
begin
  if TG_OP = 'UPDATE' then
    if old.status <> 'booked' or new.status <> 'cancelled' or old.starts_at <= now() then
      raise exception 'Only future active bookings can be cancelled' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.starts_at <= now() or local_start::date > (now() at time zone 'Europe/Stockholm')::date + 14
    or extract(isodow from local_start) > 5
    or local_start::time < time '09:00' or (new.ends_at at time zone 'Europe/Stockholm')::time > time '17:00'
    or local_start::date <> (new.ends_at at time zone 'Europe/Stockholm')::date
    or extract(minute from local_start) not in (0,30) or extract(second from local_start) <> 0
    or new.ends_at <> new.starts_at + (case new.service_id when 'session' then interval '60 minutes' else interval '30 minutes' end) then
    raise exception 'Appointment is outside available hours' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_hash, 0));
  if (select count(*) from public.studio_bookings where owner_hash = new.owner_hash and status = 'booked' and starts_at > now()) >= 5 then
    raise exception 'Maximum five upcoming appointments per browser' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.studio_validate() from public, anon, authenticated;
create trigger studio_validate before insert or update on public.studio_bookings for each row execute function private.studio_validate();

-- Public availability exposes only busy intervals, never contact details or IDs.
create function public.studio_busy(day date, person text)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.starts_at, b.ends_at from public.studio_bookings b
  where b.staff_id = person and person in ('alex','sam') and b.status = 'booked'
    and day between (now() at time zone 'Europe/Stockholm')::date and (now() at time zone 'Europe/Stockholm')::date + 14
    and b.starts_at >= (day::timestamp at time zone 'Europe/Stockholm')
    and b.starts_at < ((day + 1)::timestamp at time zone 'Europe/Stockholm');
$$;
revoke all on function public.studio_busy(date,text) from public;
grant execute on function public.studio_busy(date,text) to anon, authenticated;
