# Forma Studio booking

A full-stack appointment-booking portfolio project. The studio, team members, services and SEK prices are fictional. No payments or email messages are sent.

## Run

Use Node24, `npm ci`, copy `.env.example` to `.env.local`, supply the three server variables, then `npm run dev`. Run `npm test`, `npm run typecheck`, `npm run build`, then start the server and run `npm run test:acceptance -- http://localhost:3000` and `npm run test:rls -- http://localhost:3000`. These integration checks use fictional appointments and cancel them afterward.

## Booking workflow

Customers choose Alex or Sam, a30-minute consultation or60-minute session, and a free start time. Opening hours are weekdays09:00–17:00 in Europe/Stockholm; appointments must be in the next14days and start on a half hour. Availability uses the whole service duration, not just its start. Customer contact details remain private.

A random256-bit HttpOnly cookie identifies each browser's appointments. A SHA256 digest reaches the database through a capability header; responses omit that digest. Refreshing keeps access, while clearing cookies loses the ability to manage previous guest bookings. Each browser can hold at most five upcoming appointments. Customer cancellations only affect that browser's future active bookings.

Staff access uses a strong server-configured password and signed eight-hour HttpOnly sessions. Staff can view the selected day's bookings and cancel future appointments. This is a small demo staff role, not a multi-employee identity-management product. Keep the staff password out of Git, screenshots and chat.

## Why double booking cannot race

The API validates dates, services and business hours, but the final guard is a PostgreSQL GiST exclusion constraint over `(staff_id, tstzrange(starts_at, ends_at, '[)'))`. Two concurrent overlapping inserts for the same staff member cannot both commit. Adjacent appointments are allowed. Cancellation releases that interval without deleting history. PostgreSQL also enforces duration, hours, horizon and owner quota so direct REST requests cannot bypass API validation.

## Database and deployment

`database/schema.sql` is an additive one-time schema for `public.studio_bookings` and `private.studio_settings`. It has already been applied to the configured shared project; do not apply it twice. Existing portfolio, nutrition and other product tables are unrelated and must not be modified.

All booking rows use RLS. Public availability RPC returns only busy times; customer names, email and booking identifiers are excluded. Owner/staff policies restrict reads and cancellation. Anonymous callers receive only status-column update privilege, preventing ownership transfer. Staff privilege checks use a private settings table, never user-editable metadata.

Use an existing project's Supabase publishable key only on the server and configure the three environment values on the deployment. No service-role key is required. When rotating staff password, update its SHA256 hash in the private settings table and deploy the matching environment value together; old staff sessions become invalid.

## Scope and evidence

Unit tests cover Stockholm daylight-saving conversion, date horizon, overlap boundaries, service duration and strict input validation. Browser/API acceptance should verify actual persistence, simultaneous requests, cross-browser isolation, staff permissions, cancellation and responsive keyboard access. Record live test outcomes separately from mocked UI tests.

No accounts, payments, external calendar sync, outbound notifications, real appointments or real customer information are implied. Prices illustrate service selection. Shared staff credentials and browser-bound customer access are deliberate demo limits; use individual accounts and operational rate limiting before real customer use.
