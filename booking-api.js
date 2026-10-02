/* Thin client for the booking Worker / Apps Script. Falls back when mode !== "api". */
(function (global) {
  "use strict";

  function cfg() {
    return global.JNH_BOOKING_CONFIG || { mode: "local", apiBase: "" };
  }

  function apiEnabled() {
    var c = cfg();
    return c.mode === "api" && !!c.apiBase;
  }

  function base() {
    return String(cfg().apiBase || "").replace(/\/$/, "");
  }

  async function request(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, opts.headers || {});
    var res = await fetch(base() + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var err = (data && (data.error || data.message)) || ("HTTP " + res.status);
      throw new Error(err);
    }
    return data;
  }

  async function fetchSlots(fromISO, toISO) {
    if (!apiEnabled()) return null;
    var q = "?from=" + encodeURIComponent(fromISO) + "&to=" + encodeURIComponent(toISO);
    return request("/slots" + q);
  }

  async function requestBooking(payload) {
    if (!apiEnabled()) return null;
    return request("/book", { method: "POST", body: payload });
  }

  async function fetchPending(adminToken) {
    if (!apiEnabled()) return null;
    return request("/pending", { headers: { Authorization: "Bearer " + adminToken } });
  }

  async function confirmBooking(id, adminToken) {
    if (!apiEnabled()) return null;
    return request("/confirm", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      body: { id: id }
    });
  }

  async function declineBooking(id, adminToken) {
    if (!apiEnabled()) return null;
    return request("/decline", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      body: { id: id }
    });
  }

  async function contactsList(adminToken) {
    if (!apiEnabled()) return null;
    return request("/contacts", { headers: { Authorization: "Bearer " + adminToken } });
  }

  async function contactsPush(adminToken, body) {
    if (!apiEnabled()) return null;
    return request("/contacts/push", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      body: body
    });
  }

  async function contactsSync(adminToken, body) {
    if (!apiEnabled()) return null;
    return request("/contacts/sync", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      body: body || {}
    });
  }

  global.JNHBookingAPI = {
    apiEnabled: apiEnabled,
    fetchSlots: fetchSlots,
    requestBooking: requestBooking,
    fetchPending: fetchPending,
    confirmBooking: confirmBooking,
    declineBooking: declineBooking,
    contactsList: contactsList,
    contactsPush: contactsPush,
    contactsSync: contactsSync,
    cfg: cfg
  };
})(typeof window !== "undefined" ? window : this);
