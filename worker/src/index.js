/**
 * JNH Masonry booking Worker
 * - GET  /slots   → freeBusy + availability → open slots
 * - POST /book    → tentative opaque hold (PENDING)
 * - GET  /pending → list pending (admin)
 * - POST /confirm → confirm event (admin)
 * - POST /decline → delete hold (admin)
 * - GET  /health
 *
 * Secrets via wrangler: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * GOOGLE_REFRESH_TOKEN, ADMIN_TOKEN
 */

import { listGoogleContacts, pushContacts } from "./contacts.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseAvail(env) {
  try {
    return JSON.parse(env.AVAILABILITY_JSON || "{}");
  } catch {
    return {};
  }
}

function defaultAvail(env) {
  const a = parseAvail(env);
  return {
    slotMinutes: a.slotMinutes || 60,
    workDays: Array.isArray(a.workDays) ? a.workDays : [1, 2, 3, 4, 5],
    startHour: a.startHour != null ? a.startHour : 9,
    endHour: a.endHour != null ? a.endHour : 17,
    lunchStart: a.lunchStart != null ? a.lunchStart : 12,
    lunchEnd: a.lunchEnd != null ? a.lunchEnd : 13,
    blockedDates: Array.isArray(a.blockedDates) ? a.blockedDates : [],
    maxPerDay: a.maxPerDay || 6,
    leadDays: a.leadDays != null ? a.leadDays : 1,
    horizonDays: a.horizonDays || 45,
    timezone: env.TIMEZONE || "America/New_York",
  };
}

/** YYYY-MM-DD in America/New_York (approx via en-US locale parts). */
function ymdInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysYmd(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dowYmd(ymd) {
  return new Date(ymd + "T12:00:00Z").getUTCDay();
}

function slotLabels(avail) {
  const out = [];
  const start = Number(avail.startHour) || 9;
  const end = Number(avail.endHour) || 17;
  const step = Number(avail.slotMinutes) || 60;
  const lunchS = Number(avail.lunchStart);
  const lunchE = Number(avail.lunchEnd);
  for (let mins = start * 60; mins + step <= end * 60; mins += step) {
    const mid = mins + step / 2;
    if (!isNaN(lunchS) && !isNaN(lunchE) && lunchE > lunchS) {
      if (mid >= lunchS * 60 && mid < lunchE * 60) continue;
    }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(`${pad2(h)}:${pad2(m)}`);
  }
  return out;
}

function toRfc3339(ymd, hhmm, timeZone) {
  // Build as local wall time in Jose's TZ using a fixed offset approximation for ET.
  // DST-safe approach: use Temporal if available; else assume America/New_York offset via format.
  // Scaffold: interpret as America/New_York by appending offset from a probe.
  const probe = new Date(`${ymd}T${hhmm}:00`);
  // Better: construct with Intl — for scaffold we use explicit ET offset helper.
  const offset = etOffsetMinutes(ymd);
  const sign = offset <= 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return `${ymd}T${hhmm}:00${sign}${oh}:${om}`;
}

/** ET offset in minutes east of UTC (negative for US). Rough DST: Mar 2nd Sun–Nov 1st Sun. */
function etOffsetMinutes(ymd) {
  const y = Number(ymd.slice(0, 4));
  const dstStart = nthWeekdayOfMonth(y, 2, 0, 2); // 2nd Sunday March
  const dstEnd = nthWeekdayOfMonth(y, 10, 0, 1); // 1st Sunday November
  if (ymd >= dstStart && ymd < dstEnd) return -240; // EDT
  return -300; // EST
}

function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(year, monthIndex, d));
    if (dt.getUTCMonth() !== monthIndex) break;
    if (dt.getUTCDay() === weekday) {
      count++;
      if (count === n) {
        return `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`;
      }
    }
  }
  return `${year}-${pad2(monthIndex + 1)}-01`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function getAccessToken(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google OAuth secrets not configured (GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN)");
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "token refresh failed");
  }
  return data.access_token;
}

async function freeBusy(env, timeMin, timeMax) {
  const token = await getAccessToken(env);
  const calendarId = env.CALENDAR_ID || "primary";
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: env.TIMEZONE || "America/New_York",
      items: [{ id: calendarId }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "freeBusy failed");
  const cal = data.calendars && data.calendars[calendarId];
  return (cal && cal.busy) || [];
}

async function createEvent(env, event) {
  const token = await getAccessToken(env);
  const calendarId = encodeURIComponent(env.CALENDAR_ID || "primary");
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "create event failed");
  return data;
}

async function patchEvent(env, eventId, patch) {
  const token = await getAccessToken(env);
  const calendarId = encodeURIComponent(env.CALENDAR_ID || "primary");
  const id = encodeURIComponent(eventId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "patch event failed");
  return data;
}

async function deleteEvent(env, eventId) {
  const token = await getAccessToken(env);
  const calendarId = encodeURIComponent(env.CALENDAR_ID || "primary");
  const id = encodeURIComponent(eventId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || "delete event failed");
  }
  return { ok: true };
}

async function listPendingEvents(env) {
  const token = await getAccessToken(env);
  const calendarId = encodeURIComponent(env.CALENDAR_ID || "primary");
  const timeMin = new Date().toISOString();
  const q = new URLSearchParams({
    q: "[PENDING]",
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    maxResults: "50",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${q}`,
    { headers: { Authorization: "Bearer " + token } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "list events failed");
  return (data.items || []).filter((e) => (e.summary || "").includes("[PENDING]"));
}

function requireAdmin(request, env) {
  const hdr = request.headers.get("Authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

function buildOpenSlots(avail, busy, fromYmd, toYmd) {
  const slotsByDate = {};
  const step = Number(avail.slotMinutes) || 60;
  let cursor = fromYmd;
  while (cursor <= toYmd) {
    if (avail.blockedDates.indexOf(cursor) < 0 && avail.workDays.indexOf(dowYmd(cursor)) >= 0) {
      const daySlots = [];
      for (const t of slotLabels(avail)) {
        const startIso = toRfc3339(cursor, t, avail.timezone);
        const [hh, mm] = t.split(":").map(Number);
        const endMins = hh * 60 + mm + step;
        const endH = pad2(Math.floor(endMins / 60));
        const endM = pad2(endMins % 60);
        const endIso = toRfc3339(cursor, `${endH}:${endM}`, avail.timezone);
        const startMs = Date.parse(startIso);
        const endMs = Date.parse(endIso);
        const hit = busy.some((b) => overlaps(startMs, endMs, Date.parse(b.start), Date.parse(b.end)));
        if (!hit) daySlots.push(t);
      }
      if (daySlots.length && daySlots.length <= (avail.maxPerDay || 99)) {
        // Cap by maxPerDay relative to remaining free slots only (busy already removed).
        slotsByDate[cursor] = daySlots.slice(0, avail.maxPerDay || 99);
      } else if (daySlots.length) {
        slotsByDate[cursor] = daySlots.slice(0, avail.maxPerDay || 99);
      }
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return slotsByDate;
}

async function handleSlots(request, env) {
  const url = new URL(request.url);
  const avail = defaultAvail(env);
  const tz = avail.timezone;
  const today = ymdInTz(new Date(), tz);
  const from = url.searchParams.get("from") || addDaysYmd(today, avail.leadDays);
  const to = url.searchParams.get("to") || addDaysYmd(today, avail.leadDays + avail.horizonDays);
  const timeMin = toRfc3339(from, "00:00", tz);
  const timeMax = toRfc3339(to, "23:59", tz);
  const busy = await freeBusy(env, new Date(Date.parse(timeMin)).toISOString(), new Date(Date.parse(timeMax)).toISOString());
  const slots = buildOpenSlots(avail, busy, from, to);
  return json({ ok: true, timezone: tz, from, to, slots, mode: "google-freebusy" });
}

async function handleBook(request, env) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const notes = String(body.notes || "").trim();
  const date = String(body.date || "").trim();
  const time = String(body.time || "").trim();
  if (!name || !phone || !address || !date || !time) {
    return json({ error: "Name, phone, address, date, and time are required." }, 400);
  }

  const avail = defaultAvail(env);
  const step = Number(avail.slotMinutes) || 60;
  const [hh, mm] = time.split(":").map(Number);
  const endMins = hh * 60 + mm + step;
  const endTime = `${pad2(Math.floor(endMins / 60))}:${pad2(endMins % 60)}`;

  // Re-check freeBusy for this slot
  const startRfc = toRfc3339(date, time, avail.timezone);
  const endRfc = toRfc3339(date, endTime, avail.timezone);
  const busy = await freeBusy(
    env,
    new Date(Date.parse(startRfc)).toISOString(),
    new Date(Date.parse(endRfc)).toISOString()
  );
  const startMs = Date.parse(startRfc);
  const endMs = Date.parse(endRfc);
  if (busy.some((b) => overlaps(startMs, endMs, Date.parse(b.start), Date.parse(b.end)))) {
    return json({ error: "That time slot is no longer open." }, 409);
  }

  const event = await createEvent(env, {
    summary: `[PENDING] Estimate · ${name}`,
    description: [
      "Status: PENDING — Jose must confirm",
      `Phone: ${phone}`,
      `Address: ${address}`,
      notes ? `Notes: ${notes}` : "",
      "Source: Pro Desk public booker",
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: startRfc, timeZone: avail.timezone },
    end: { dateTime: endRfc, timeZone: avail.timezone },
    status: "tentative",
    transparency: "opaque", // blocks freeBusy for other bookers
    extendedProperties: {
      private: {
        jnhStatus: "pending",
        jnhPhone: phone,
        jnhAddress: address,
      },
    },
  });

  return json({
    ok: true,
    appointment: {
      id: event.id,
      date,
      time,
      name,
      phone,
      address,
      notes,
      status: "pending",
      source: body.source || "public",
      calendarEventId: event.id,
      htmlLink: event.htmlLink || null,
      createdAt: new Date().toISOString(),
    },
  });
}

async function handlePending(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const items = await listPendingEvents(env);
  const appointments = items.map((e) => {
    const start = e.start?.dateTime || e.start?.date || "";
    const date = start.slice(0, 10);
    const time = start.includes("T") ? start.slice(11, 16) : "";
    return {
      id: e.id,
      date,
      time,
      name: (e.summary || "").replace(/^\[PENDING\]\s*Estimate\s*·\s*/i, "").trim(),
      phone: e.extendedProperties?.private?.jnhPhone || "",
      address: e.extendedProperties?.private?.jnhAddress || "",
      notes: e.description || "",
      status: "pending",
      htmlLink: e.htmlLink || null,
    };
  });
  return json({ ok: true, appointments });
}

async function handleConfirm(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return json({ error: "id required" }, 400);
  const items = await listPendingEvents(env);
  const existing = items.find((e) => e.id === id);
  const name = existing
    ? (existing.summary || "").replace(/^\[PENDING\]\s*Estimate\s*·\s*/i, "").trim()
    : "Customer";
  const event = await patchEvent(env, id, {
    summary: `Estimate · ${name}`,
    status: "confirmed",
    transparency: "opaque",
    extendedProperties: {
      private: {
        ...(existing?.extendedProperties?.private || {}),
        jnhStatus: "confirmed",
      },
    },
  });
  return json({ ok: true, appointment: { id: event.id, status: "confirmed", htmlLink: event.htmlLink } });
}

async function handleDecline(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return json({ error: "id required" }, 400);
  await deleteEvent(env, id);
  return json({ ok: true, appointment: { id, status: "cancelled" } });
}


async function handleContactsList(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const token = await getAccessToken(env);
  const contacts = await listGoogleContacts(token);
  return json({ ok: true, contacts, source: "google-people" });
}

async function handleContactsPush(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const token = await getAccessToken(env);
  const results = await pushContacts(token, body.contacts || []);
  return json({ ok: true, results });
}

async function handleContactsSync(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const token = await getAccessToken(env);
  // Pull first, then push local Rolodex (client usually merges; server push upserts by resourceName)
  const remote = await listGoogleContacts(token);
  const results = await pushContacts(token, body.contacts || []);
  return json({ ok: true, contacts: remote, results, note: "Client should merge remote into Rolodex then keep resourceNames from results" });
}


const SYSTEM_PROMPT = `You are the in-house advisor for JNH Masonry Inc. only (Jose Hernandez). Do not mention or mix in other businesses.
Help with: reviewing masonry estimates (scope, line items, labor vs materials, deposit, payment terms, job notes) and drafting marketing, email, and SMS copy.
Tone: practical, Suffolk County NY home-improvement contractor, licensed & insured. Not legal advice.
When suggesting estimate edits, include a JSON object on its own fenced block with keys:
{"reply":"short summary","suggestions":{"lines":[{"description","qty","unit","laborRate","materialCost"}],"sections":[{"title","body"}],"depositAmount":number,"depositNotes":"","paymentTerms":"","jobNotes":""}}
Only include suggestion keys you actually want applied. units: sf, lf, ea, hours, ton, bag, pallet, ls.
When drafting copy, include:
{"reply":"short summary","copy":{"kind":"marketing|email|sms","subject":"","body":"","to":""}}
Also write the human-readable reply outside the JSON so the UI can show it. Keep SMS under 320 characters.`;

function mockWorkerChat(body) {
  const mode = body.mode || "estimate";
  const est = body.estimate;
  if (mode === "marketing") {
    return {
      source: "mock-worker",
      reply: "Marketing draft (Worker mock — set OPENAI_API_KEY for live ChatGPT).",
      copy: {
        kind: "marketing",
        subject: "JNH Masonry — book your estimate",
        body: "Hi {{name}}, Jose at JNH Masonry Inc. We're scheduling walls, pavers, and repairs. Licensed & insured. Call 631-965-1754 or visit jnhmas.com.",
      },
    };
  }
  if (mode === "email") {
    return {
      source: "mock-worker",
      reply: "Email draft (Worker mock).",
      copy: {
        kind: "email",
        subject: est && est.estimateNumber ? "JNH Masonry estimate " + est.estimateNumber : "Your JNH Masonry estimate",
        body: "Hi " + ((est && est.customerName) || "there") + ",\n\nPlease review your estimate from JNH Masonry Inc. Happy to walk the scope.\n\nJose Hernandez\n631-965-1754",
        to: (est && est.customerEmail) || "",
      },
    };
  }
  if (mode === "sms") {
    return {
      source: "mock-worker",
      reply: "Text draft (Worker mock).",
      copy: {
        kind: "sms",
        body: "Jose at JNH Masonry — your estimate is ready. Questions? Call/text 631-965-1754.",
        to: (est && est.customerPhone) || "",
      },
    };
  }
  return {
    source: "mock-worker",
    reply: "Estimate review (Worker mock — no OPENAI_API_KEY yet). Accept to apply a deposit + notes refresh if an estimate is open.",
    suggestions: est
      ? {
          depositAmount: est.depositAmount > 0 ? est.depositAmount : Math.round(((est.totals && est.totals.grand) || 0) * 0.3) || 1500,
          depositNotes: est.depositNotes || "Required to order materials",
          paymentTerms: est.paymentTerms || "Deposit due on acceptance. Balance due upon completion.",
          jobNotes: est.jobNotes || "Confirm site access and material staging.",
        }
      : null,
  };
}

async function handleChat(request, env) {
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const message = String(body.message || "").trim();
  if (!message) return json({ error: "message required" }, 400);

  if (!env.OPENAI_API_KEY) {
    return json(mockWorkerChat(body));
  }

  const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const estText = body.estimate ? JSON.stringify(body.estimate).slice(0, 12000) : "(no estimate open)";
  const userContent =
    "Mode: " + (body.mode || "estimate") +
    "\nBusiness: " + (body.business || "JNH Masonry Inc.") +
    "\nCurrent estimate JSON:\n" + estText +
    "\n\nJose says:\n" + message;

  const messages = [{ role: "system", content: SYSTEM_PROMPT }]
    .concat(history.filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content).map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 4000),
    })))
    .concat([{ role: "user", content: userContent }]);

  const model = env.OPENAI_MODEL || body.model || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: data.error?.message || "OpenAI request failed", source: "openai" }, res.status);
  }
  const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    ? data.choices[0].message.content
    : "";

  let suggestions = null;
  let copy = null;
  let cleanReply = reply;
  const fence = reply.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1]);
      if (parsed.suggestions) suggestions = parsed.suggestions;
      if (parsed.copy) copy = parsed.copy;
      if (parsed.reply) cleanReply = parsed.reply;
      else cleanReply = reply.replace(fence[0], "").trim();
    } catch { /* keep raw reply */ }
  }
  return json({
    ok: true,
    source: "openai",
    model,
    reply: cleanReply || reply,
    suggestions,
    copy,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    try {
      if (path === "/health" && request.method === "GET") {
        const configured = !!(env.GOOGLE_REFRESH_TOKEN && env.ADMIN_TOKEN);
        return json({ ok: true, configured, service: "jnh-booking" });
      }
      if (path === "/slots" && request.method === "GET") return await handleSlots(request, env);
      if (path === "/book" && request.method === "POST") return await handleBook(request, env);
      if (path === "/pending" && request.method === "GET") return await handlePending(request, env);
      if (path === "/confirm" && request.method === "POST") return await handleConfirm(request, env);
      if (path === "/decline" && request.method === "POST") return await handleDecline(request, env);
      if (path === "/contacts" && request.method === "GET") return await handleContactsList(request, env);
      if (path === "/contacts/push" && request.method === "POST") return await handleContactsPush(request, env);
      if (path === "/contacts/sync" && request.method === "POST") return await handleContactsSync(request, env);
      if (path === "/chat" && request.method === "POST") return await handleChat(request, env);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
  },
};
