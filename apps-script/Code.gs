/**
 * JNH Masonry booking — Google Apps Script twin of the Cloudflare Worker.
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me (jnhmasonry@gmail.com)
 *   Who has access: Anyone
 *
 * Script Properties (Project Settings → Script properties):
 *   ADMIN_TOKEN = <long random string>
 *
 * Uses the script owner's CalendarApp (must be jnhmasonry@gmail.com).
 * No OAuth client secrets needed when run as the calendar owner.
 */

var TZ = "America/New_York";
var AVAIL = {
  slotMinutes: 60,
  workDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  lunchStart: 12,
  lunchEnd: 13,
  blockedDates: [],
  maxPerDay: 6,
  leadDays: 1,
  horizonDays: 45
};

function doGet(e) {
  return route_(e, "GET");
}

function doPost(e) {
  return route_(e, "POST");
}

function route_(e, method) {
  var path = (e && e.parameter && e.parameter.path) || "";
  try {
    if (path === "health" || path === "") {
      return json_({ ok: true, configured: true, service: "jnh-booking-apps-script" });
    }
    if (path === "slots" && method === "GET") return json_(handleSlots_(e));
    if (path === "book" && method === "POST") return json_(handleBook_(e));
    if (path === "pending" && method === "GET") {
      requireAdmin_(e);
      return json_(handlePending_());
    }
    if (path === "confirm" && method === "POST") {
      requireAdmin_(e);
      return json_(handleConfirm_(e));
    }
    if (path === "decline" && method === "POST") {
      requireAdmin_(e);
      return json_(handleDecline_(e));
    }
    if (path === "contacts" && method === "GET") {
      requireAdmin_(e);
      return json_(handleContactsList_());
    }
    if ((path === "contacts/push" || path === "contacts_push") && method === "POST") {
      requireAdmin_(e);
      return json_(handleContactsPush_(e));
    }
    return json_({ error: "Not found" }, 404);
  } catch (err) {
    return json_({ error: String(err.message || err) }, 500);
  }
}

function requireAdmin_(e) {
  var token = (e.parameter && e.parameter.token) || "";
  var hdr = "";
  // Apps Script web apps don't expose Authorization easily from browser CORS;
  // also accept ?token= or JSON body.adminToken
  var body = parseBody_(e);
  if (body && body.adminToken) token = body.adminToken;
  var expected = PropertiesService.getScriptProperties().getProperty("ADMIN_TOKEN");
  if (!expected || token !== expected) throw new Error("Unauthorized");
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try { return JSON.parse(e.postData.contents); } catch (err) { return {}; }
}

function json_(obj, status) {
  // Apps Script ContentService cannot set HTTP status easily on web apps; embed status.
  if (status && status !== 200) obj._httpStatus = status;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pad2_(n) { return ("0" + n).slice(-2); }

function slotLabels_() {
  var out = [];
  var start = AVAIL.startHour, end = AVAIL.endHour, step = AVAIL.slotMinutes;
  for (var mins = start * 60; mins + step <= end * 60; mins += step) {
    var mid = mins + step / 2;
    if (mid >= AVAIL.lunchStart * 60 && mid < AVAIL.lunchEnd * 60) continue;
    out.push(pad2_(Math.floor(mins / 60)) + ":" + pad2_(mins % 60));
  }
  return out;
}

function ymd_(d) {
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd");
}

function handleSlots_(e) {
  var today = ymd_(new Date());
  var from = (e.parameter && e.parameter.from) || addDaysYmd_(today, AVAIL.leadDays);
  var to = (e.parameter && e.parameter.to) || addDaysYmd_(today, AVAIL.leadDays + AVAIL.horizonDays);
  var cal = CalendarApp.getDefaultCalendar();
  var slots = {};
  var cursor = from;
  while (cursor <= to) {
    var d = parseYmd_(cursor);
    var dow = d.getDay();
    if (AVAIL.blockedDates.indexOf(cursor) < 0 && AVAIL.workDays.indexOf(dow) >= 0) {
      var daySlots = [];
      var labels = slotLabels_();
      for (var i = 0; i < labels.length; i++) {
        var t = labels[i];
        var start = wallTime_(cursor, t);
        var end = new Date(start.getTime() + AVAIL.slotMinutes * 60000);
        var events = cal.getEvents(start, end);
        if (!events || events.length === 0) daySlots.push(t);
      }
      if (daySlots.length) slots[cursor] = daySlots.slice(0, AVAIL.maxPerDay);
    }
    cursor = addDaysYmd_(cursor, 1);
  }
  return { ok: true, timezone: TZ, from: from, to: to, slots: slots, mode: "apps-script" };
}

function handleBook_(e) {
  var body = parseBody_(e);
  var name = String(body.name || "").trim();
  var phone = String(body.phone || "").trim();
  var address = String(body.address || "").trim();
  var notes = String(body.notes || "").trim();
  var date = String(body.date || "").trim();
  var time = String(body.time || "").trim();
  if (!name || !phone || !address || !date || !time) {
    throw new Error("Name, phone, address, date, and time are required.");
  }
  var start = wallTime_(date, time);
  var end = new Date(start.getTime() + AVAIL.slotMinutes * 60000);
  var cal = CalendarApp.getDefaultCalendar();
  if (cal.getEvents(start, end).length) throw new Error("That time slot is no longer open.");
  var title = "[PENDING] Estimate · " + name;
  var desc = "Status: PENDING — Jose must confirm\nPhone: " + phone + "\nAddress: " + address +
    (notes ? "\nNotes: " + notes : "") + "\nSource: Pro Desk public booker";
  var ev = cal.createEvent(title, start, end, { description: desc });
  // Tentative / opaque: CalendarApp createEvent is busy by default.
  return {
    ok: true,
    appointment: {
      id: ev.getId(),
      date: date,
      time: time,
      name: name,
      phone: phone,
      address: address,
      notes: notes,
      status: "pending",
      source: body.source || "public",
      calendarEventId: ev.getId(),
      createdAt: new Date().toISOString()
    }
  };
}

function handlePending_() {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();
  var horizon = new Date(now.getTime() + AVAIL.horizonDays * 86400000);
  var events = cal.getEvents(now, horizon);
  var appointments = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var title = ev.getTitle() || "";
    if (title.indexOf("[PENDING]") < 0) continue;
    var start = ev.getStartTime();
    appointments.push({
      id: ev.getId(),
      date: ymd_(start),
      time: Utilities.formatDate(start, TZ, "HH:mm"),
      name: title.replace(/^\[PENDING\]\s*Estimate\s*·\s*/i, "").trim(),
      notes: ev.getDescription() || "",
      status: "pending"
    });
  }
  return { ok: true, appointments: appointments };
}

function handleConfirm_(e) {
  var body = parseBody_(e);
  var id = String(body.id || "").trim();
  if (!id) throw new Error("id required");
  var ev = CalendarApp.getEventById(id);
  if (!ev) throw new Error("Not found");
  var name = (ev.getTitle() || "").replace(/^\[PENDING\]\s*Estimate\s*·\s*/i, "").trim();
  ev.setTitle("Estimate · " + name);
  return { ok: true, appointment: { id: id, status: "confirmed" } };
}

function handleDecline_(e) {
  var body = parseBody_(e);
  var id = String(body.id || "").trim();
  if (!id) throw new Error("id required");
  var ev = CalendarApp.getEventById(id);
  if (ev) ev.deleteEvent();
  return { ok: true, appointment: { id: id, status: "cancelled" } };
}

function addDaysYmd_(ymd, n) {
  var d = parseYmd_(ymd);
  d.setDate(d.getDate() + n);
  return ymd_(d);
}

function parseYmd_(ymd) {
  var p = ymd.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

function wallTime_(ymd, hhmm) {
  var p = ymd.split("-");
  var t = hhmm.split(":");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), Number(t[0]), Number(t[1]), 0);
}

/**
 * Contacts stubs — enable Advanced Google Service "People API" in Apps Script
 * (Services → People API) when using this path instead of Cloudflare.
 * For production prefer the Worker (cleaner CORS + /contacts routes).
 */
function handleContactsList_() {
  // Placeholder: return empty until People advanced service is enabled.
  // With People.People.Connections.list('people/me', {personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies,userDefined'})
  return { ok: true, contacts: [], note: "Enable People API advanced service or use Cloudflare Worker" };
}

function handleContactsPush_(e) {
  var body = parseBody_(e);
  return { ok: true, results: [], received: (body.contacts || []).length, note: "Stub — use Worker for People upserts" };
}
