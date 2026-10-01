/* Shared appointment + availability store (Pro Desk + public booker). Same-origin localStorage. */
(function (global) {
  "use strict";

  var STORAGE_KEY = "jnh_pro_desk_v1";
  var BOOK_KEY = "jnh_bookings_v1"; // also mirrored into pro desk blob

  var DEFAULT_AVAIL = {
    slotMinutes: 60,
    workDays: [1, 2, 3, 4, 5], // Mon–Fri
    startHour: 9,
    endHour: 17,
    lunchStart: 12,
    lunchEnd: 13,
    blockedDates: [],
    maxPerDay: 6,
    leadDays: 1,
    horizonDays: 45,
    timezoneNote: "America/New_York"
  };

  function uid() {
    return "ap_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDaysISO(iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function dow(iso) {
    return new Date(iso + "T12:00:00").getDay();
  }

  function readBlob() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeBlob(data) {
    data.savedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Mirror bookings for booker-only readers / older caches
    try {
      localStorage.setItem(BOOK_KEY, JSON.stringify({
        appointments: data.appointments || [],
        availability: data.availability || DEFAULT_AVAIL,
        savedAt: data.savedAt
      }));
    } catch (e) {}
  }

  function getAvailability() {
    var b = readBlob();
    var a = Object.assign({}, DEFAULT_AVAIL, b.availability || {});
    if (!Array.isArray(a.workDays)) a.workDays = DEFAULT_AVAIL.workDays.slice();
    if (!Array.isArray(a.blockedDates)) a.blockedDates = [];
    return a;
  }

  function setAvailability(avail) {
    var b = readBlob();
    b.availability = Object.assign({}, DEFAULT_AVAIL, avail);
    writeBlob(b);
  }

  function getAppointments() {
    var b = readBlob();
    var list = b.appointments || [];
    // Merge BOOK_KEY if pro desk blob missing appointments
    if (!list.length) {
      try {
        var m = localStorage.getItem(BOOK_KEY);
        if (m) {
          var j = JSON.parse(m);
          if (j.appointments && j.appointments.length) list = j.appointments;
        }
      } catch (e) {}
    }
    return list.slice().sort(function (x, y) {
      var kx = (x.date || "") + "T" + (x.time || "");
      var ky = (y.date || "") + "T" + (y.time || "");
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
  }

  function saveAppointments(list) {
    var b = readBlob();
    b.appointments = list;
    if (!b.availability) b.availability = getAvailability();
    writeBlob(b);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function slotLabels(avail) {
    var out = [];
    var start = Number(avail.startHour) || 9;
    var end = Number(avail.endHour) || 17;
    var step = Number(avail.slotMinutes) || 60;
    var lunchS = Number(avail.lunchStart);
    var lunchE = Number(avail.lunchEnd);
    for (var mins = start * 60; mins + step <= end * 60; mins += step) {
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      // skip lunch window
      if (!isNaN(lunchS) && !isNaN(lunchE) && lunchE > lunchS) {
        var mid = mins + step / 2;
        if (mid >= lunchS * 60 && mid < lunchE * 60) continue;
      }
      out.push(pad2(h) + ":" + pad2(m));
    }
    return out;
  }

  function formatTimeLabel(hhmm) {
    var p = String(hhmm || "").split(":");
    var h = parseInt(p[0], 10);
    var m = p[1] || "00";
    if (isNaN(h)) return hhmm;
    var ap = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + ap;
  }

  function isDateOpen(iso, avail) {
    avail = avail || getAvailability();
    if ((avail.blockedDates || []).indexOf(iso) >= 0) return false;
    var day = dow(iso);
    return (avail.workDays || []).indexOf(day) >= 0;
  }

  function takenTimes(iso) {
    return getAppointments()
      .filter(function (a) {
        return a.date === iso && a.status !== "cancelled" && a.status !== "no-show";
      })
      .map(function (a) { return a.time; });
  }

  function openSlotsForDate(iso, avail) {
    avail = avail || getAvailability();
    if (!isDateOpen(iso, avail)) return [];
    var taken = takenTimes(iso);
    var max = Number(avail.maxPerDay) || 99;
    if (taken.length >= max) return [];
    return slotLabels(avail).filter(function (t) { return taken.indexOf(t) < 0; });
  }

  function bookableDates(avail) {
    avail = avail || getAvailability();
    var lead = Number(avail.leadDays) || 0;
    var horizon = Number(avail.horizonDays) || 45;
    var start = addDaysISO(todayISO(), lead);
    var out = [];
    for (var i = 0; i <= horizon; i++) {
      var d = addDaysISO(start, i);
      if (openSlotsForDate(d, avail).length) out.push(d);
    }
    return out;
  }

  function bookAppointment(payload) {
    var name = String(payload.name || "").trim();
    var phone = String(payload.phone || "").trim();
    var address = String(payload.address || "").trim();
    var date = String(payload.date || "").trim();
    var time = String(payload.time || "").trim();
    if (!name || !phone || !address || !date || !time) {
      return { ok: false, error: "Name, phone, address, date, and time are required." };
    }
    var avail = getAvailability();
    if (!isDateOpen(date, avail)) return { ok: false, error: "That date is not available." };
    var open = openSlotsForDate(date, avail);
    if (open.indexOf(time) < 0) return { ok: false, error: "That time slot is no longer open." };
    var list = getAppointments();
    var ap = {
      id: uid(),
      date: date,
      time: time,
      name: name,
      phone: phone,
      address: address,
      notes: String(payload.notes || "").trim(),
      status: "booked",
      source: payload.source || "public",
      createdAt: new Date().toISOString()
    };
    list.push(ap);
    saveAppointments(list);
    return { ok: true, appointment: ap };
  }

  function updateAppointment(id, patch) {
    var list = getAppointments();
    var found = null;
    list = list.map(function (a) {
      if (a.id !== id) return a;
      found = Object.assign({}, a, patch);
      return found;
    });
    if (!found) return { ok: false, error: "Not found" };
    saveAppointments(list);
    return { ok: true, appointment: found };
  }

  function deleteAppointment(id) {
    saveAppointments(getAppointments().filter(function (a) { return a.id !== id; }));
    return { ok: true };
  }

  global.JNHBooking = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_AVAIL: DEFAULT_AVAIL,
    getAvailability: getAvailability,
    setAvailability: setAvailability,
    getAppointments: getAppointments,
    saveAppointments: saveAppointments,
    bookAppointment: bookAppointment,
    updateAppointment: updateAppointment,
    deleteAppointment: deleteAppointment,
    openSlotsForDate: openSlotsForDate,
    bookableDates: bookableDates,
    isDateOpen: isDateOpen,
    slotLabels: slotLabels,
    formatTimeLabel: formatTimeLabel,
    todayISO: todayISO,
    addDaysISO: addDaysISO,
    dow: dow,
    readBlob: readBlob,
    writeBlob: writeBlob
  };
})(typeof window !== "undefined" ? window : this);
