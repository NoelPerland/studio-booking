"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Service = { id: string; name: string; duration: number; price: number };
type Staff = { id: string; name: string };
type Booking = { id: string; service_id: string; staff_id: string; starts_at: string; ends_at: string; customer_name: string; customer_email: string; status: string };
type Availability = { slots: { start: string; end: string; available: boolean }[]; bookings: Booking[]; role: "customer" | "staff"; services: Service[]; staff: Staff[]; today: string };
const clock = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const dayLabel = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/Stockholm" }).format(new Date(value.includes("T") ? value : value + "T12:00:00Z"));
const price = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(value);
const dateAfter = (date: string, offset: number) => { const next = new Date(date + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + offset); return next.toISOString().slice(0, 10); };

export default function BookingPage() {
  const [data, setData] = useState<Availability | null>(null);
  const [serviceId, setServiceId] = useState("consultation");
  const [staffId, setStaffId] = useState("alex");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [staffOpen, setStaffOpen] = useState(false);
  const [password, setPassword] = useState("");
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ staff: staffId, serviceId });
      if (date) query.set("date", date);
      const response = await fetch("/api/booking?" + query, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t load the studio calendar. Please try again.");
      if (id === loadId.current) { setData(result); setError(""); }
      return result as Availability;
    } catch (failure) {
      if (id === loadId.current) { setError(failure instanceof Error ? failure.message : "Calendar unavailable. Please try again."); setData(null); }
      return null;
    } finally { if (id === loadId.current) setLoading(false); }
  }, [date, serviceId, staffId]);

  useEffect(() => { void load(); return () => { loadId.current += 1; }; }, [load]);
  const chosenDate = date || data?.today || "";
  const service = data?.services.find(item => item.id === serviceId);
  const member = data?.staff.find(item => item.id === staffId);

  async function mutate(body: Record<string, string>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (response.status === 409) { setSlot(""); await load(); }
      if (!response.ok) throw new Error(result.error || "Your request couldn’t be completed. Please try again.");
      if (body.action === "book") { setSlot(""); setName(""); setEmail(""); }
      if (body.action === "staff-login") { setPassword(""); setStaffOpen(false); }
      setNotice(success);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Connection lost. Your details are still here. Check your appointments before retrying."); }
    finally { setBusy(false); }
  }

  function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || !service || busy || loading) return;
    void mutate({ action: "book", serviceId, staffId, start: slot, name, email }, "You’re booked. Your appointment is saved below.");
  }

  const bookingList = data?.bookings.filter(item => item.status !== "cancelled") ?? [];
  return <>
    <a className="skip" href="#booking">Skip to booking</a>
    <header className="site-header"><a className="brand" href="/" aria-label="Forma Studio home"><span className="brand-symbol" aria-hidden="true">f.</span>Forma<span className="brand-light">Studio</span></a><nav aria-label="Main navigation"><a href="#booking">Sessions</a><a href="#approach">Our approach</a><a href="#appointments">{data?.role === "staff" ? "Schedule" : "My bookings"}</a><button className="text-button" onClick={() => { if (data?.role === "staff") { void mutate({ action: "staff-logout" }, "Signed out of staff access."); } else { setStaffOpen(!staffOpen); document.getElementById("booking")?.scrollIntoView(); } }} disabled={busy}>{data?.role === "staff" ? "Sign out" : "Staff access"}<span aria-hidden="true"> ↗</span></button><a className="nav-book" href="#booking">Book a session <span aria-hidden="true">↗</span></a></nav></header>
    <main>
      <section className="intro"><div className="intro-content"><p className="eyebrow"><span className="live-dot" /> CREATIVE SESSIONS · STOCKHOLM</p><h1>Ideas need<br /><em>room to</em> move<span className="period">.</span></h1><p className="intro-copy">A focused hour with a creative partner can change the shape of a project. Book a consultation or a hands-on studio session with Alex or Sam.</p><div className="intro-actions"><a className="hero-cta" href="#booking">Find your time <span aria-hidden="true">↗</span></a><span>Weekdays · 09:00–17:00<br />Europe/Stockholm</span></div></div><div className="hero-art" aria-hidden="true"><div className="art-stamp">THE NEXT<br />GOOD IDEA<br />STARTS HERE <span>↘</span></div><div className="art-orbit"><span>✳</span></div><div className="art-ticket"><span>FORMA / STUDIO</span><strong>{service?.name || "Your creative session"}</strong><div><span>{member?.name || "Your studio partner"}</span><span>{slot ? clock(slot) : "Pick your moment ↗"}</span></div></div><span className="art-scribble">↗</span></div></section>
      <div className="hero-band" aria-label="Booking in three steps"><span>01 / Choose a session</span><span>02 / Find a time</span><span>03 / Make something happen</span></div>

      <section className="booking-layout" id="booking" aria-labelledby="booking-title">
        <div className="booking-panel"><div className="panel-heading"><div><p className="eyebrow">Your next appointment</p><h2 id="booking-title">Let’s find your time.</h2></div><span className="step-label">01 — 03</span></div>
          {error && <div className="message error" role="alert"><span>{error}</span>{!data && <button onClick={() => void load()} disabled={loading}>Try again</button>}</div>}
          {notice && <div className="message success" role="status">{notice}</div>}
          {staffOpen && <form className="staff-login" onSubmit={event => { event.preventDefault(); void mutate({ action: "staff-login", password }, "Staff access enabled. You can now review the studio schedule."); }}><div><h3>Studio access</h3><p>Staff can review appointments and manage the schedule.</p></div><label>Staff password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={200} /></label><div className="login-actions"><button type="submit" className="primary" disabled={busy || !password}>Sign in</button><button type="button" className="text-button" onClick={() => { setStaffOpen(false); setPassword(""); }}>Close</button></div></form>}
          <form onSubmit={book}>
            <fieldset disabled={busy}><legend><span>01</span> Choose your session</legend><div className="service-grid">{data?.services.map((item, index) => <label className={"service-card " + (serviceId === item.id ? "selected" : "")} key={item.id}><input type="radio" name="service" value={item.id} checked={serviceId === item.id} onChange={() => { setServiceId(item.id); setSlot(""); }} /><div className="service-top"><span className="service-icon" aria-hidden="true">{index === 0 ? "↗" : "✳"}</span><span className="radio-mark" /></div><h3>{item.name}</h3><p>{item.duration} minutes <span>·</span> {price(item.price)}</p></label>)}</div>{!data && <p className="loading-line">{loading ? "Opening the studio calendar…" : "Sessions appear when the calendar reconnects."}</p>}</fieldset>
            <fieldset disabled={busy}><legend><span>02</span> Pick a day & time</legend><div className="availability-heading"><label className="staff-picker">With<select aria-label="Choose studio staff" value={staffId} onChange={event => { setStaffId(event.target.value); setSlot(""); }}>{data?.staff.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span className="timezone">Europe/Stockholm</span></div><div className="date-strip" role="group" aria-label="Choose appointment date">{data && Array.from({ length: 14 }, (_, index) => { const value = dateAfter(data.today, index); return <button className={"date-choice " + (chosenDate === value ? "selected" : "")} type="button" key={value} aria-pressed={chosenDate === value} aria-label={dayLabel(value, { weekday: "long", day: "numeric", month: "long" })} onClick={() => { setDate(value); setSlot(""); }}><span>{index === 0 ? "Today" : dayLabel(value, { weekday: "short" })}</span><strong>{dayLabel(value, { day: "numeric" })}</strong><span>{dayLabel(value, { month: "short" })}</span></button>; })}</div><div className="slots-heading"><h3>{chosenDate ? dayLabel(chosenDate, { weekday: "long", day: "numeric", month: "long" }) : "Available times"}</h3><span>{service ? service.duration + "-minute sessions" : ""}</span></div><div className="slot-grid" aria-busy={loading} role="group" aria-label="Choose appointment time">{!loading && data?.slots.map(item => <button type="button" className={"slot " + (slot === item.start ? "selected" : "")} disabled={!item.available || busy} aria-pressed={slot === item.start} aria-label={clock(item.start) + (item.available ? " available" : " unavailable")} onClick={() => setSlot(item.start)} key={item.start}>{clock(item.start)}</button>)}</div>{loading && <p className="loading-line" role="status">Finding available times…</p>}{!loading && data && data.slots.length === 0 && <p className="empty-day">A day to recharge. The studio opens Monday to Friday.</p>}{!loading && data && data.slots.length > 0 && data.slots.every(item => !item.available) && <p className="empty-day">This day is fully booked. Try another date or studio member.</p>}</fieldset>
            <fieldset disabled={busy || !data}><legend><span>03</span> Make it yours</legend><div className="contact-grid"><label>Your name<input name="name" autoComplete="name" maxLength={80} required value={name} onChange={event => setName(event.target.value)} placeholder="Alex Morgan" /></label><label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} placeholder="alex@example.com" /></label></div><p className="privacy-note">Use fictional details in this public demo. No confirmation email is sent.</p><button className="primary book-button" type="submit" disabled={busy || loading || !slot || !service}>{busy ? "Saving your appointment…" : "Confirm appointment"}<span aria-hidden="true"> →</span></button></fieldset>
          </form>
        </div>

        <aside className="summary"><div className="summary-art" aria-hidden="true"><span className="summary-monogram">F</span><span className="summary-star">✳</span><span>MORE THAN A MEETING.</span></div><div className="summary-copy"><p className="eyebrow">YOUR SESSION, AT A GLANCE</p><h2>{service?.name || "Your studio session"}</h2><p>One dedicated session. Clear space for a conversation, a plan, or the beginning of something new.</p><dl><div><dt>Duration</dt><dd>{service ? service.duration + " minutes" : "—"}</dd></div><div><dt>Studio member</dt><dd>{member?.name || "—"}</dd></div><div><dt>Date & time</dt><dd>{slot ? <>{dayLabel(slot, { day: "numeric", month: "short" })} · {clock(slot)}</> : "Your choice"}</dd></div><div className="summary-total"><dt>Session price</dt><dd>{service ? price(service.price) : "—"}</dd></div></dl><p className="demo-note">Portfolio demo · Fictional studio<br />No real appointment or payment is made.</p></div></aside>
      </section>

      <section className="studio-story" id="approach"><div className="story-intro"><p className="eyebrow">WHY MAKE THE TIME?</p><h2>Less circling.<br /><em>More making.</em></h2><p>There’s no giant form or endless intake. Pick the kind of conversation you need, choose an open slot, and show up with your idea.</p></div><div className="story-steps"><div><span>01</span><h3>Start with the question.</h3><p>A short consultation to untangle a challenge and find a useful direction.</p></div><div><span>02</span><h3>Make it together.</h3><p>A longer creative session when you want to sketch, test or sharpen the work.</p></div><div><span>03</span><h3>Leave with momentum.</h3><p>Your appointment is easy to find, and you can cancel it from the same browser.</p></div></div></section>
      <section className="appointments" id="appointments" aria-labelledby="appointments-title"><div className="appointments-heading"><div><p className="eyebrow">{data?.role === "staff" ? "Staff workspace" : "YOUR SPACE"}</p><h2 id="appointments-title">{data?.role === "staff" ? "The studio schedule." : "Your upcoming appointments."}</h2></div><button className="text-button" onClick={() => void load()} disabled={loading || busy}>Refresh <span aria-hidden="true">↻</span></button></div><p className="appointments-note">{data?.role === "staff" ? "All appointments for the selected day. Change the date above to review another day." : "Saved for this browser. Keep your cookies to return and manage your appointments."}</p><div className="appointment-list">{bookingList.length === 0 ? <div className="empty-appointments"><span aria-hidden="true">↗</span><p>{loading ? "Loading appointments…" : data ? (data.role === "staff" ? "A clear calendar for this day." : "Your next good idea starts with a booking.") : "Reconnect to see your appointments."}</p></div> : bookingList.map(item => <article className="appointment" key={item.id}><div className="appointment-date"><strong>{dayLabel(item.starts_at, { day: "numeric" })}</strong><span>{dayLabel(item.starts_at, { month: "short" })}</span></div><div className="appointment-details"><h3>{data?.services.find(value => value.id === item.service_id)?.name || "Studio session"}</h3><p>{dayLabel(item.starts_at, { weekday: "long" })} · {clock(item.starts_at)}–{clock(item.ends_at)} · {data?.staff.find(value => value.id === item.staff_id)?.name || item.staff_id}</p>{data?.role === "staff" && <p>{item.customer_name} · {item.customer_email}</p>}</div><span className="confirmed">Confirmed</span><button className="cancel-button" disabled={busy} onClick={() => { if (window.confirm("Cancel this appointment? This time will become available again.")) void mutate({ action: "cancel", id: item.id }, "Appointment cancelled. The time is available again."); }}>Cancel<span className="sr-only"> appointment on {dayLabel(item.starts_at, { day: "numeric", month: "long" })} at {clock(item.starts_at)}</span></button></article>)}</div></section>
    </main>
    <footer><div className="footer-top"><p className="eyebrow">GOOD THINGS HAPPEN WHEN YOU MAKE ROOM</p><a href="#booking">Let’s make<br /><em>something.</em><span aria-hidden="true">↗</span></a></div><div className="footer-bottom"><a className="brand" href="/">Forma<span className="brand-light">Studio</span></a><p>Creative time, thoughtfully booked.<br />Fictional studio · Portfolio demo by Noel Perland.</p><div><a href="#booking">Book a session ↗</a><a href="#appointments">My appointments ↗</a><a href="https://github.com/NoelPerland/studio-booking" target="_blank" rel="noreferrer">Source code ↗</a></div></div></footer>
  </>;
}
