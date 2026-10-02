/* JNH Masonry Pro Desk v1 — estimates, jobs, price book, reviews, payments, labor */
(function () {
  "use strict";

  var STORAGE_KEY = "jnh_pro_desk_v1";
  var UNITS = ["sf", "lf", "ea", "hours", "ton", "bag", "pallet", "ls"];
  var PAY_TYPES = { ON_BOOKS: "On books", CASH: "Cash" };

  function normalizePayType(value) {
    return value === PAY_TYPES.CASH ? PAY_TYPES.CASH : PAY_TYPES.ON_BOOKS;
  }

  var state = {
    estimates: [],
    employees: [],
    timeEntries: [],
    vendors: [],
    rolodexContacts: [],
    receipts: [],
    priceBook: [],
    settings: null,
    refundStubs: [],
    insuranceDocs: [],
    fleetAssets: [],
    fleetMaintLogs: [],
    marketingClients: [],
    marketingBlasts: [],
    clientFlows: [],
    appointments: [],
    availability: null,
    editingEstimateId: null,
    pendingReceiptDataUrl: null,
    pendingReceiptName: null,
    pendingReceiptMime: null,
    editingTimeId: null,
    editingVendorId: null,
    editingReceiptId: null,
    apptCalYear: null,
    apptCalMonth: null,
    weatherData: null
  };

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function uid() { return "id_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }
  function money(n) {
    var v = Number(n) || 0;
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function startOfWeek(dateStr) {
    var d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
    var day = d.getDay(); // 0 Sun
    d.setDate(d.getDate() - day);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + dd;
  }
  function endOfWeek(weekStart) {
    var d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + 6);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + dd;
  }
  function inWeek(dateStr, weekStart) {
    return dateStr >= weekStart && dateStr <= endOfWeek(weekStart);
  }
  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  // ---------- storage ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      state.estimates = data.estimates || [];
      var employeeMigrationNeeded = false;
      state.employees = (data.employees || []).map(function (emp) {
        var payType = normalizePayType(emp.payType);
        if (emp.payType !== payType) employeeMigrationNeeded = true;
        emp.payType = payType;
        return emp;
      });
      state.timeEntries = data.timeEntries || [];
      state.vendors = data.vendors || [];
      state.rolodexContacts = (data.rolodexContacts || []).map(function (c) {
        c.capabilities = Array.isArray(c.capabilities) ? c.capabilities : String(c.capabilities || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
        return c;
      });
      state.receipts = data.receipts || [];
      state.priceBook = data.priceBook || [];
      state.settings = data.settings || null;
      state.refundStubs = data.refundStubs || [];
      state.insuranceDocs = data.insuranceDocs || [];
      state.fleetAssets = data.fleetAssets || [];
      state.fleetMaintLogs = data.fleetMaintLogs || [];
      state.marketingClients = data.marketingClients || [];
      state.marketingBlasts = data.marketingBlasts || [];
      state.clientFlows = data.clientFlows || [];
      if (!state.settings) state.settings = { googleReviewUrl: "", stripePublishableKey: "", stripePaymentLinkBase: "", stripeMode: "test", paymentFeeNote: "", absorbFees: false, deskPassword: "jnh2026", standardLaborRate: 0, defaultLaborHours: 0 };
      if (state.settings && !state.settings.deskPassword) state.settings.deskPassword = "jnh2026";
      if (state.settings && (state.settings.standardLaborRate == null || state.settings.standardLaborRate === "")) state.settings.standardLaborRate = 0;
      if (state.settings && (state.settings.defaultLaborHours == null || state.settings.defaultLaborHours === "")) state.settings.defaultLaborHours = 0;
      syncAppointmentsFromStore();
      if (employeeMigrationNeeded) save();
    } catch (e) {
      console.warn("Pro Desk load failed", e);
    }
  }
  function syncAppointmentsFromStore() {
    if (window.JNHBooking) {
      state.appointments = window.JNHBooking.getAppointments();
      state.availability = window.JNHBooking.getAvailability();
    } else {
      state.appointments = state.appointments || [];
      state.availability = state.availability || null;
    }
  }

  function save() {
    var data = {
      estimates: state.estimates,
      employees: state.employees,
      timeEntries: state.timeEntries,
      vendors: state.vendors,
      rolodexContacts: state.rolodexContacts || [],
      receipts: state.receipts,
      priceBook: state.priceBook,
      settings: state.settings,
      refundStubs: state.refundStubs,
      insuranceDocs: state.insuranceDocs || [],
      fleetAssets: state.fleetAssets || [],
      fleetMaintLogs: state.fleetMaintLogs || [],
      marketingClients: state.marketingClients || [],
      marketingBlasts: state.marketingBlasts || [],
      clientFlows: state.clientFlows || [],
      appointments: state.appointments || (window.JNHBooking ? window.JNHBooking.getAppointments() : []),
      availability: state.availability || (window.JNHBooking ? window.JNHBooking.getAvailability() : null),
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (window.JNHBooking) {
        // keep mirror in sync
        try {
          localStorage.setItem("jnh_bookings_v1", JSON.stringify({
            appointments: data.appointments,
            availability: data.availability,
            savedAt: data.savedAt
          }));
        } catch (e2) {}
      }
    } catch (e) {
      alert("Could not save (storage full?). Try removing large receipt images.");
      console.error(e);
    }
  }

  // ---------- navigation ----------
  var NAV_GROUPS = {
    "work-nav": ["estimates", "pricebook", "jobs", "insurance", "fleet"],
    "growth-contacts-nav": ["marketing", "reviews", "rolodex", "vendors"],
    "employees-nav": ["employees", "timelog", "payroll"]
  };

  function setNavMenuOpen(menuId, open) {
    var menu = document.getElementById(menuId);
    var toggle = menu && menu.querySelector(".nav-menu-toggle");
    if (!menu) return;
    menu.classList.toggle("open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeNavMenus(exceptId) {
    Object.keys(NAV_GROUPS).forEach(function (menuId) {
      if (menuId !== exceptId) setNavMenuOpen(menuId, false);
    });
  }

  function showView(name) {
    $$(".view").forEach(function (v) { v.classList.remove("active"); });
    $$(".tab").forEach(function (t) {
      var menu = t.closest(".nav-menu");
      var groupViews = menu ? NAV_GROUPS[menu.id] || [] : [];
      var isGroupMenu = t.classList.contains("nav-menu-toggle") && groupViews.indexOf(name) !== -1;
      t.classList.toggle("active", t.getAttribute("data-view") === name || isGroupMenu);
    });
    Object.keys(NAV_GROUPS).forEach(function (menuId) {
      if (NAV_GROUPS[menuId].indexOf(name) === -1) setNavMenuOpen(menuId, false);
    });
    var map = {
      hub: "view-hub",
      weather: "view-weather",
      appointments: "view-appointments",
      estimates: "view-estimates",
      editor: "view-editor",
      jobs: "view-jobs",
      pricebook: "view-pricebook",
      insurance: "view-insurance",
      fleet: "view-fleet",
      marketing: "view-marketing",
      flow: "view-flow",
      reviews: "view-reviews",
      payments: "view-payments",
      employees: "view-employees",
      timelog: "view-timelog",
      payroll: "view-payroll",
      vendors: "view-vendors",
      rolodex: "view-rolodex",
      receipts: "view-receipts",
      settings: "view-settings"
    };
    var id = map[name] || "view-hub";
    var el = document.getElementById(id);
    if (el) el.classList.add("active");
    /* Estimates workspace: hide topbar, full viewport (list + editor) */
    var estFs = (name === "estimates" || name === "editor");
    document.body.classList.toggle("estimates-fullscreen", estFs);
    var backBtn = document.getElementById("btn-back-pro-desk");
    if (backBtn) backBtn.hidden = !estFs;
    if (name === "hub") renderHub();
    if (name === "weather") { renderWeather(); if (!state.weatherData) loadWeatherPlan(); }
    if (name === "appointments") renderAppointments();
    if (name === "estimates") renderEstimatesList();
    if (name === "jobs") renderJobs();
    if (name === "pricebook") renderPriceBook();
    if (name === "reviews") renderReviews();
    if (name === "payments") renderPayments();
    if (name === "employees") renderEmployees();
    if (name === "timelog") { fillTimeFormSelects(); renderTimeLog(); }
    if (name === "payroll") renderPayroll();
    if (name === "vendors") renderVendors();
    if (name === "rolodex") renderRolodex();
    if (name === "receipts") { fillReceiptSelects(); renderReceipts(); }
    if (name === "insurance") renderInsurance();
    if (name === "fleet") renderFleet();
    if (name === "marketing") renderMarketing();
    if (name === "flow") renderFlow();
    if (name === "editor") renderEstimateInsuranceAttach();
    if (name === "settings") fillLaborSettingsForm();
    if (name === "estimates") syncLaborPricingUI(null);
    updateEstimateToolbar();
  }

  // ---------- estimates ----------
  function lineLabor(line) {
    return (Number(line.qty) || 0) * (Number(line.laborRate) || 0);
  }
  function lineTotal(line) {
    return lineLabor(line) + (Number(line.materialCost) || 0);
  }
  function estimateTotals(est) {
    var labor = 0, mats = 0;
    (est.lines || []).forEach(function (l) {
      labor += lineLabor(l);
      mats += Number(l.materialCost) || 0;
    });
    return { labor: labor, materials: mats, grand: labor + mats };
  }

  function getStandardLaborRate() {
    ensureSettingsShape();
    var n = Number(state.settings.standardLaborRate);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function getDefaultLaborHours() {
    ensureSettingsShape();
    var n = Number(state.settings.defaultLaborHours);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function hasLaborRateOverride(est) {
    if (!est) return false;
    var v = est.laborRateOverride;
    return v !== null && v !== undefined && v !== "";
  }

  function effectiveJobLaborRate(est) {
    if (hasLaborRateOverride(est)) {
      var n = Number(est.laborRateOverride);
      return isFinite(n) && n >= 0 ? n : 0;
    }
    return getStandardLaborRate();
  }

  function formatLaborRateLabel(rate) {
    return money(rate) + "/hr";
  }

  function syncLaborPricingUI(est) {
    var draft = est || window.__draftEstimate;
    var std = getStandardLaborRate();
    var stdLabel = formatLaborRateLabel(std);
    var listLabel = $("#estimates-standard-rate-label");
    if (listLabel) listLabel.textContent = stdLabel;
    var stdEl = $("#est-standard-labor-rate");
    if (stdEl) stdEl.textContent = stdLabel;
    var note = $("#est-labor-effective-note");
    if (!note) return;
    if (!draft) {
      note.textContent = "Open or create an estimate to set a job override.";
      note.classList.remove("is-override");
      return;
    }
    var eff = effectiveJobLaborRate(draft);
    if (hasLaborRateOverride(draft)) {
      note.textContent = "This job overrides the standard — new lines use " + formatLaborRateLabel(eff) + " (standard stays " + stdLabel + ").";
      note.classList.add("is-override");
    } else {
      note.textContent = "Using standard rate " + stdLabel + " for new lines. Enter a job rate above to override this estimate only.";
      note.classList.remove("is-override");
    }
  }

  function readLaborFieldsFromForm(draft) {
    var form = $("#estimate-form");
    if (!form || !draft) return;
    var overrideInput = form.laborRateOverride;
    var hoursInput = form.laborHours;
    if (overrideInput) {
      var raw = String(overrideInput.value || "").trim();
      draft.laborRateOverride = raw === "" ? null : (parseFloat(raw) || 0);
    }
    if (hoursInput) {
      var hrsRaw = String(hoursInput.value || "").trim();
      draft.laborHours = hrsRaw === "" ? null : (parseFloat(hrsRaw) || 0);
    }
  }

  function blankEstimate() {
    return {
      id: uid(),
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      projectAddress: "",
      estimateDate: todayISO(),
      estimateNumber: "",
      sections: [
        { title: "Demolition & Preparation", body: "" },
        { title: "Walls", body: "" },
        { title: "Pavers", body: "" }
      ],
      laborRateOverride: null,
      laborHours: (function () { var h = getDefaultLaborHours(); return h > 0 ? h : null; })(),
      lines: [
        { description: "", qty: 1, unit: "sf", laborRate: getStandardLaborRate(), materialCost: 0 }
      ],
      depositAmount: 0,
      depositNotes: "",
      paymentTerms: "Balance due upon completion unless otherwise agreed.",
      includeDisclosures: true,
      insuranceDocIds: [],
      jobStatus: "",
      jobScheduledDate: "",
      jobNotes: "",
      paymentStatus: "Unpaid",
      amountPaid: 0,
      paymentLink: "",
      paymentLinkKind: "",
      paymentLinkMemo: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function renderEstimatesList() {
    syncLaborPricingUI(null);
    var list = $("#estimates-list");
    var empty = $("#estimates-empty");
    list.innerHTML = "";
    if (!state.estimates.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    var sorted = state.estimates.slice().sort(function (a, b) {
      return (b.estimateDate || "").localeCompare(a.estimateDate || "");
    });
    sorted.forEach(function (est) {
      var tot = estimateTotals(est);
      var card = document.createElement("div");
      card.className = "est-card";
      card.innerHTML =
        "<h3>" + escapeHtml(est.customerName || "Untitled") + "</h3>" +
        "<div class=\"meta\">" + escapeHtml(est.estimateNumber || "—") + " · " + escapeHtml(est.estimateDate || "") + "</div>" +
        "<div class=\"meta\">" + escapeHtml(est.projectAddress || "No address") + "</div>" +
        "<div class=\"meta\">" +
          (est.jobStatus ? "<span class=\"badge\">" + escapeHtml(est.jobStatus) + "</span> " : "") +
          "<span class=\"pay-pill pay-" + escapeHtml((est.paymentStatus || "Unpaid").replace(/\s+/g, "-").toLowerCase()) + "\">" + escapeHtml(est.paymentStatus || "Unpaid") + "</span>" +
        "</div>" +
        "<div class=\"meta labor-meta\">Labor: <strong>" + escapeHtml(formatLaborRateLabel(effectiveJobLaborRate(est))) + "</strong>" +
          (hasLaborRateOverride(est) ? " <span class=\"badge\">job override</span>" : " <span class=\"muted\">(standard)</span>") +
          (est.laborHours != null && est.laborHours !== "" ? " · " + escapeHtml(String(est.laborHours)) + " hrs planned" : "") +
        "</div>" +
        "<div class=\"price\">" + money(tot.grand) + "</div>" +
        "<div class=\"card-actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"print\">Print</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">Delete</button>" +
        "</div>";
      card.querySelector("[data-act=edit]").addEventListener("click", function (e) {
        e.stopPropagation(); openEditor(est.id);
      });
      card.querySelector("[data-act=print]").addEventListener("click", function (e) {
        e.stopPropagation(); printEstimate(est);
      });
      card.querySelector("[data-act=del]").addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm("Delete estimate for " + (est.customerName || "this customer") + "?")) {
          state.estimates = state.estimates.filter(function (x) { return x.id !== est.id; });
          removeFlowForEstimate(est.id);
          save();
          renderEstimatesList();
        }
      });
      card.addEventListener("click", function () { openEditor(est.id); });
      list.appendChild(card);
    });
  }

  function openEditor(id) {
    var est = id ? state.estimates.find(function (e) { return e.id === id; }) : null;
    if (!est) {
      est = blankEstimate();
      state.editingEstimateId = est.id;
      // keep in memory only until save — stash draft on form via editing id
      window.__draftEstimate = est;
    } else {
      state.editingEstimateId = est.id;
      window.__draftEstimate = JSON.parse(JSON.stringify(est));
    }
    $("#editor-title").textContent = est.customerName ? "Edit: " + est.customerName : "New Estimate";
    var form = $("#estimate-form");
    form.customerName.value = est.customerName || "";
    form.customerPhone.value = est.customerPhone || "";
    form.customerEmail.value = est.customerEmail || "";
    form.projectAddress.value = est.projectAddress || "";
    form.estimateDate.value = est.estimateDate || todayISO();
    form.estimateNumber.value = est.estimateNumber || "";
    form.depositAmount.value = est.depositAmount || "";
    form.depositNotes.value = est.depositNotes || "";
    form.paymentTerms.value = est.paymentTerms || "";
    form.includeDisclosures.checked = est.includeDisclosures !== false;
    if (!Array.isArray(est.insuranceDocIds)) est.insuranceDocIds = [];
    if (typeof est.locked !== "boolean") est.locked = false;
    if (window.__draftEstimate && typeof window.__draftEstimate.locked !== "boolean") window.__draftEstimate.locked = est.locked;
    if (window.__draftEstimate && !Array.isArray(window.__draftEstimate.insuranceDocIds)) window.__draftEstimate.insuranceDocIds = est.insuranceDocIds.slice();
    if (form.jobStatus) form.jobStatus.value = est.jobStatus || "";
    if (form.jobScheduledDate) form.jobScheduledDate.value = est.jobScheduledDate || "";
    if (form.jobNotes) form.jobNotes.value = est.jobNotes || "";
    if (form.paymentStatus) form.paymentStatus.value = est.paymentStatus || "Unpaid";
    if (form.amountPaid) form.amountPaid.value = est.amountPaid || "";
    if (form.paymentLink) form.paymentLink.value = est.paymentLink || "";
    if (form.laborRateOverride) {
      form.laborRateOverride.value = hasLaborRateOverride(est) ? est.laborRateOverride : "";
    }
    if (form.laborHours) {
      form.laborHours.value = (est.laborHours != null && est.laborHours !== "") ? est.laborHours : "";
    }
    if (window.__draftEstimate) {
      if (!hasLaborRateOverride(window.__draftEstimate) && window.__draftEstimate.laborRateOverride !== null) {
        window.__draftEstimate.laborRateOverride = null;
      }
      if (window.__draftEstimate.laborHours === undefined) window.__draftEstimate.laborHours = null;
    }
    renderScopeSections(est.sections || []);
    renderLines(est.lines || []);
    recalcTotals();
    syncLaborPricingUI(window.__draftEstimate);
    showView("editor");
    applyEstimateLockState();
    renderEstimateInsuranceAttach();
  }

  function renderScopeSections(sections) {
    var wrap = $("#scope-sections");
    wrap.innerHTML = "";
    sections.forEach(function (sec, idx) {
      var block = document.createElement("div");
      block.className = "scope-block";
      block.innerHTML =
        "<div class=\"scope-head\">" +
          "<span class=\"muted\">" + (idx + 1) + ".</span>" +
          "<input type=\"text\" data-k=\"title\" value=\"" + escapeHtml(sec.title) + "\" placeholder=\"Section title\" />" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"rm\">Remove</button>" +
        "</div>" +
        "<textarea data-k=\"body\" placeholder=\"Bullet points / description (one item per line)\">" + escapeHtml(sec.body) + "</textarea>";
      block.querySelector("[data-act=rm]").addEventListener("click", function () {
        var draft = window.__draftEstimate;
        draft.sections.splice(idx, 1);
        renderScopeSections(draft.sections);
      });
      block.querySelector("[data-k=title]").addEventListener("input", function (e) {
        window.__draftEstimate.sections[idx].title = e.target.value;
      });
      block.querySelector("[data-k=body]").addEventListener("input", function (e) {
        window.__draftEstimate.sections[idx].body = e.target.value;
      });
      wrap.appendChild(block);
    });
  }

  function unitOptions(selected) {
    return UNITS.map(function (u) {
      return "<option value=\"" + u + "\"" + (u === selected ? " selected" : "") + ">" + u + "</option>";
    }).join("");
  }

  function renderLines(lines) {
    var body = $("#lines-body");
    body.innerHTML = "";
    lines.forEach(function (line, idx) {
      var tr = document.createElement("tr");
      var lt = lineLabor(line);
      var tot = lineTotal(line);
      tr.innerHTML =
        "<td><input data-k=\"description\" value=\"" + escapeHtml(line.description) + "\" placeholder=\"Work / material\" /></td>" +
        "<td style=\"width:70px\"><input data-k=\"qty\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + (line.qty || 0) + "\" /></td>" +
        "<td style=\"width:80px\"><select data-k=\"unit\">" + unitOptions(line.unit || "sf") + "</select></td>" +
        "<td style=\"width:100px\"><input data-k=\"laborRate\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + (line.laborRate || 0) + "\" /></td>" +
        "<td style=\"width:100px\"><input data-k=\"materialCost\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + (line.materialCost || 0) + "\" /></td>" +
        "<td class=\"muted\" data-lab>" + money(lt) + "</td>" +
        "<td data-tot>" + money(tot) + "</td>" +
        "<td><button type=\"button\" class=\"btn small danger\" data-act=\"rm\">×</button></td>";
      function sync() {
        var draft = window.__draftEstimate;
        draft.lines[idx].description = tr.querySelector("[data-k=description]").value;
        draft.lines[idx].qty = parseFloat(tr.querySelector("[data-k=qty]").value) || 0;
        draft.lines[idx].unit = tr.querySelector("[data-k=unit]").value;
        draft.lines[idx].laborRate = parseFloat(tr.querySelector("[data-k=laborRate]").value) || 0;
        draft.lines[idx].materialCost = parseFloat(tr.querySelector("[data-k=materialCost]").value) || 0;
        tr.querySelector("[data-lab]").textContent = money(lineLabor(draft.lines[idx]));
        tr.querySelector("[data-tot]").textContent = money(lineTotal(draft.lines[idx]));
        recalcTotals();
      }
      $$("input,select", tr).forEach(function (inp) { inp.addEventListener("input", sync); inp.addEventListener("change", sync); });
      tr.querySelector("[data-act=rm]").addEventListener("click", function () {
        window.__draftEstimate.lines.splice(idx, 1);
        renderLines(window.__draftEstimate.lines);
        recalcTotals();
      });
      body.appendChild(tr);
    });
  }

  function recalcTotals() {
    var draft = window.__draftEstimate || { lines: [] };
    var t = estimateTotals(draft);
    $("#tot-labor").textContent = money(t.labor);
    $("#tot-materials").textContent = money(t.materials);
    $("#tot-grand").textContent = money(t.grand);
  }

  /* ---- Chat Advisor hooks (JNH only; no API key here) ---- */
  function lineLaborLocal(l) {
    return (Number(l.qty) || 0) * (Number(l.laborRate) || 0);
  }
  function estimateSnapshotForAdvisor() {
    var est = null;
    if (window.__draftEstimate && $("#view-editor") && $("#view-editor").classList.contains("active")) {
      try { est = collectEstimateFromForm(); } catch (e) { est = window.__draftEstimate; }
    } else if (window.__draftEstimate) {
      est = window.__draftEstimate;
    } else if (state.editingEstimateId) {
      est = state.estimates.find(function (e) { return e.id === state.editingEstimateId; }) || null;
    }
    if (!est) return null;
    var totals = estimateTotals(est);
    return {
      id: est.id,
      customerName: est.customerName || "",
      customerPhone: est.customerPhone || "",
      customerEmail: est.customerEmail || "",
      projectAddress: est.projectAddress || "",
      estimateDate: est.estimateDate || "",
      estimateNumber: est.estimateNumber || "",
      jobNotes: est.jobNotes || "",
      paymentTerms: est.paymentTerms || "",
      depositAmount: Number(est.depositAmount) || 0,
      depositNotes: est.depositNotes || "",
      laborHours: est.laborHours,
      laborRateOverride: est.laborRateOverride,
      effectiveLaborRate: effectiveJobLaborRate(est),
      locked: !!est.locked,
      sections: (est.sections || []).map(function (s) { return { title: s.title || "", body: s.body || "" }; }),
      lines: (est.lines || []).map(function (l) {
        return {
          description: l.description || "",
          qty: Number(l.qty) || 0,
          unit: l.unit || "sf",
          laborRate: Number(l.laborRate) || 0,
          materialCost: Number(l.materialCost) || 0,
          laborTotal: lineLaborLocal(l)
        };
      }),
      totals: totals
    };
  }

  function ensureDraftOpenForAdvisor() {
    if (window.__draftEstimate && $("#estimate-form")) return window.__draftEstimate;
    if (state.estimates && state.estimates.length) {
      var sorted = state.estimates.slice().sort(function (a, b) {
        return (b.updatedAt || b.estimateDate || "").localeCompare(a.updatedAt || a.estimateDate || "");
      });
      openEditor(sorted[0].id);
      return window.__draftEstimate;
    }
    openEditor(null);
    return window.__draftEstimate;
  }

  function applyEstimateSuggestions(sugg) {
    if (!sugg || typeof sugg !== "object") return false;
    var draft = ensureDraftOpenForAdvisor();
    if (!draft) {
      alert("Could not open an estimate to apply suggestions.");
      return false;
    }
    if (draft.locked) {
      alert("This estimate is locked. Unlock it before accepting Chat suggestions.");
      return false;
    }
    var form = $("#estimate-form");
    if (Array.isArray(sugg.lines) && sugg.lines.length) {
      draft.lines = sugg.lines.map(function (l) {
        return {
          description: String(l.description || "").slice(0, 240),
          qty: Number(l.qty) || 0,
          unit: UNITS.indexOf(l.unit) >= 0 ? l.unit : (l.unit || "sf"),
          laborRate: Number(l.laborRate) || 0,
          materialCost: Number(l.materialCost) || 0
        };
      });
      renderLines(draft.lines);
    }
    if (Array.isArray(sugg.sections) && sugg.sections.length) {
      draft.sections = sugg.sections.map(function (sec) {
        return { title: String(sec.title || "Section").slice(0, 120), body: String(sec.body || "").slice(0, 4000) };
      });
      renderScopeSections(draft.sections);
    }
    if (sugg.depositAmount != null && form && form.depositAmount) {
      draft.depositAmount = Number(sugg.depositAmount) || 0;
      form.depositAmount.value = draft.depositAmount;
    }
    if (sugg.depositNotes != null && form && form.depositNotes) {
      draft.depositNotes = String(sugg.depositNotes);
      form.depositNotes.value = draft.depositNotes;
    }
    if (sugg.paymentTerms != null && form && form.paymentTerms) {
      draft.paymentTerms = String(sugg.paymentTerms);
      form.paymentTerms.value = draft.paymentTerms;
    }
    if (sugg.jobNotes != null && form && form.jobNotes) {
      draft.jobNotes = String(sugg.jobNotes);
      form.jobNotes.value = draft.jobNotes;
    }
    if (sugg.laborHours != null && form && form.laborHours) {
      draft.laborHours = sugg.laborHours === "" ? null : (Number(sugg.laborHours) || 0);
      form.laborHours.value = draft.laborHours == null ? "" : draft.laborHours;
    }
    if (sugg.laborRateOverride != null && form && form.laborRateOverride) {
      if (sugg.laborRateOverride === "" || sugg.laborRateOverride === null) draft.laborRateOverride = null;
      else draft.laborRateOverride = Number(sugg.laborRateOverride) || 0;
      form.laborRateOverride.value = draft.laborRateOverride == null ? "" : draft.laborRateOverride;
    }
    recalcTotals();
    syncLaborPricingUI(draft);
    draft.updatedAt = new Date().toISOString();
    return true;
  }

  function fillMarketingBlast(subject, body) {
    var form = $("#blast-form");
    if (!form) return false;
    if (form.subject) form.subject.value = subject || "";
    if (form.body) form.body.value = body || "";
    if (form.channel) form.channel.value = "email";
    return true;
  }

  function updateEstimateToolbar() {
    var editor = $("#view-editor");
    var active = !!(editor && editor.classList.contains("active") && window.__draftEstimate);
    ["delete", "lock", "print", "email", "text"].forEach(function (action) {
      var button = $("#btn-estimates-" + action);
      if (button) button.disabled = !active;
    });
    var lock = $("#btn-estimates-lock");
    if (lock) lock.textContent = active && window.__draftEstimate.locked ? "Unlock Estimate" : "Lock Estimate";
  }

  function applyEstimateLockState() {
    var draft = window.__draftEstimate;
    var form = $("#estimate-form");
    var locked = !!(draft && draft.locked);
    if (form) {
      $$("input, select, textarea", form).forEach(function (control) { control.disabled = locked; });
      $$("button", form).forEach(function (button) { button.disabled = locked; });
    }
    var saveButton = $("#btn-save-estimate");
    if (saveButton) saveButton.disabled = locked;
    updateEstimateToolbar();
  }

  function currentEstimateForToolbar() {
    if (!window.__draftEstimate) {
      alert("Open an estimate first.");
      return null;
    }
    return collectEstimateFromForm();
  }

  function estimateShareSummary(est) {
    var totals = estimateTotals(est);
    return [
      "JNH Masonry Inc. estimate " + (est.estimateNumber || ""),
      "Customer: " + (est.customerName || ""),
      "Project: " + (est.projectAddress || ""),
      "Total: " + money(totals.grand),
      "Date: " + (est.estimateDate || ""),
      "\nEstimate summary — please reply to discuss details."
    ].join("\n");
  }

  function deleteCurrentEstimate() {
    var draft = window.__draftEstimate;
    if (!draft) return;
    if (!confirm("Delete this estimate for " + (draft.customerName || "this customer") + "?")) return;
    state.estimates = state.estimates.filter(function (est) { return est.id !== draft.id; });
    removeFlowForEstimate(draft.id);
    save();
    window.__draftEstimate = null;
    state.editingEstimateId = null;
    showView("estimates");
  }

  function toggleCurrentEstimateLock() {
    var draft = window.__draftEstimate;
    if (!draft) return;
    draft.locked = !draft.locked;
    var idx = state.estimates.findIndex(function (est) { return est.id === draft.id; });
    if (idx >= 0) {
      state.estimates[idx].locked = draft.locked;
      save();
    }
    applyEstimateLockState();
  }

  function createProductFromToolbar() {
    if (window.__draftEstimate && window.__draftEstimate.locked) {
      alert("Unlock the estimate before adding a product.");
      return;
    }
    ensurePriceBook();
    var name = prompt("Product name / SKU:");
    if (!name || !name.trim()) return;
    var cost = prompt("Last cost per unit (optional):", "0");
    if (cost === null) return;
    var item = {
      id: uid(),
      name: name.trim(),
      category: "Other",
      unit: "ea",
      lastCost: parseFloat(cost) || 0,
      vendor: "",
      lastPurchased: "",
      notes: "",
      updatedAt: new Date().toISOString()
    };
    state.priceBook.push(item);
    save();
    if (window.__draftEstimate) addLineFromPriceItem(item);
    else alert("Product added to Price Book.");
  }

  function printCurrentEstimate() {
    var est = currentEstimateForToolbar();
    if (est) printEstimate(est);
  }

  function emailCurrentEstimate() {
    var est = currentEstimateForToolbar();
    if (!est) return;
    var subject = "JNH Masonry estimate " + (est.estimateNumber || "");
    window.location.href = "mailto:" + encodeURIComponent(est.customerEmail || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(estimateShareSummary(est));
  }

  function textCurrentEstimate() {
    var est = currentEstimateForToolbar();
    if (!est) return;
    var phone = (est.customerPhone || "").replace(/[^+\d]/g, "");
    window.location.href = "sms:" + encodeURIComponent(phone) + "?body=" + encodeURIComponent(estimateShareSummary(est));
  }

  function collectEstimateFromForm() {
    var form = $("#estimate-form");
    var draft = window.__draftEstimate;
    draft.customerName = form.customerName.value.trim();
    draft.customerPhone = form.customerPhone.value.trim();
    draft.customerEmail = form.customerEmail.value.trim();
    draft.projectAddress = form.projectAddress.value.trim();
    draft.estimateDate = form.estimateDate.value;
    draft.estimateNumber = form.estimateNumber.value.trim() || ("EST-" + draft.estimateDate.replace(/-/g, ""));
    draft.depositAmount = parseFloat(form.depositAmount.value) || 0;
    draft.depositNotes = form.depositNotes.value.trim();
    draft.paymentTerms = form.paymentTerms.value.trim();
    draft.includeDisclosures = form.includeDisclosures.checked;
    readLaborFieldsFromForm(draft);
    if (window.__draftEstimate && Array.isArray(window.__draftEstimate.insuranceDocIds)) {
      draft.insuranceDocIds = window.__draftEstimate.insuranceDocIds.slice();
    } else if (!Array.isArray(draft.insuranceDocIds)) {
      draft.insuranceDocIds = [];
    }
    if (form.jobStatus) draft.jobStatus = form.jobStatus.value;
    if (form.jobScheduledDate) draft.jobScheduledDate = form.jobScheduledDate.value;
    if (form.jobNotes) draft.jobNotes = form.jobNotes.value.trim();
    if (form.paymentStatus) draft.paymentStatus = form.paymentStatus.value;
    if (form.amountPaid) draft.amountPaid = parseFloat(form.amountPaid.value) || 0;
    if (form.paymentLink) draft.paymentLink = form.paymentLink.value.trim();
    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  function saveCurrentEstimate() {
    var est = collectEstimateFromForm();
    if (!est.customerName) {
      alert("Customer name is required.");
      return;
    }
    var idx = state.estimates.findIndex(function (e) { return e.id === est.id; });
    if (idx >= 0) state.estimates[idx] = est;
    else state.estimates.push(est);
    syncFlowFromJobStatus(est);
    syncMarketingClientsFromEstimates();
    save();
    alert("Estimate saved.");
    renderEstimatesList();
  }

  function printEstimate(est) {
    var t = estimateTotals(est);
    var sectionsHtml = (est.sections || []).map(function (s, i) {
      return "<li><strong>" + escapeHtml(s.title) + "</strong><div class=\"scope-body\">" + escapeHtml(s.body) + "</div></li>";
    }).join("");
    var linesHtml = (est.lines || []).map(function (l) {
      return "<tr>" +
        "<td>" + escapeHtml(l.description) + "</td>" +
        "<td>" + l.qty + " " + escapeHtml(l.unit) + "</td>" +
        "<td>" + money(lineLabor(l)) + "</td>" +
        "<td>" + money(l.materialCost) + "</td>" +
        "<td>" + money(lineTotal(l)) + "</td></tr>";
    }).join("");
    var disc = "";
    if (est.includeDisclosures !== false) {
      disc = disclosureHtml();
      var attached = (est.insuranceDocIds || []).map(function (id) {
        return (state.insuranceDocs || []).find(function (d) { return d.id === id; });
      }).filter(Boolean);
      if (attached.length) {
        disc += "<div class=\"disc\"><h3>Insurance on file</h3><ul>" +
          attached.map(function (d) {
            return "<li>" + escapeHtml(d.label || d.docType) + " — expires " + escapeHtml(d.expiryDate || "?") +
              (d.carrier ? " (" + escapeHtml(d.carrier) + ")" : "") + "</li>";
          }).join("") + "</ul></div>";
      }
    }
    var pay =
      "<h3>Payment Schedule</h3>" +
      (est.depositAmount ? "<p><strong>Deposit:</strong> " + money(est.depositAmount) +
        (est.depositNotes ? " — " + escapeHtml(est.depositNotes) : "") + "</p>" : "") +
      (est.paymentTerms ? "<p>" + escapeHtml(est.paymentTerms) + "</p>" : "") +
      "<p><em>Payment terms placeholders — update as agreed with customer.</em></p>";

    var html =
      "<div class=\"print-doc\">" +
      "<div class=\"ph\">" +
        "<div class=\"co\">JNH Masonry Inc.</div>" +
        "<div class=\"contact\">631-965-1754 · jnhmasonry@gmail.com · jnhmas.com<br/>Licensed &amp; Insured</div>" +
      "</div>" +
      "<div class=\"title\">ESTIMATE</div>" +
      "<div class=\"meta-grid\">" +
        "<div><strong>Estimate #:</strong> " + escapeHtml(est.estimateNumber || "—") + "</div>" +
        "<div><strong>Date:</strong> " + escapeHtml(est.estimateDate || "") + "</div>" +
        "<div><strong>Customer:</strong> " + escapeHtml(est.customerName || "") + "</div>" +
        "<div><strong>Phone:</strong> " + escapeHtml(est.customerPhone || "") + "</div>" +
        "<div><strong>Email:</strong> " + escapeHtml(est.customerEmail || "") + "</div>" +
        "<div><strong>Project address:</strong> " + escapeHtml(est.projectAddress || "") + "</div>" +
      "</div>" +
      "<h3>Scope of Work</h3><ol class=\"scope\">" + sectionsHtml + "</ol>" +
      "<h3>Labor &amp; Materials</h3>" +
      "<table class=\"lines\"><thead><tr><th>Description</th><th>Qty</th><th>Labor</th><th>Materials</th><th>Total</th></tr></thead>" +
      "<tbody>" + linesHtml + "</tbody></table>" +
      "<div class=\"totals\">" +
        "<div>Labor subtotal: " + money(t.labor) + "</div>" +
        "<div>Materials subtotal: " + money(t.materials) + "</div>" +
        "<div class=\"big\">Total Project Price: " + money(t.grand) + "</div>" +
      "</div>" +
      pay + disc +
      "<h3>Acceptance of Agreement</h3>" +
      "<p>By signing below, the Customer acknowledges they have reviewed and accepted the scope of work, pricing, and terms, and authorizes JNH Masonry Inc. to perform the work described herein.</p>" +
      "<div class=\"sign\">" +
        "<div><div class=\"line\">Customer Signature / Printed Name / Date</div></div>" +
        "<div><div class=\"line\">Jose Hernandez — JNH Masonry Inc. / Date</div></div>" +
      "</div>" +
      "<div class=\"print-review\">" +
        "<div><strong>Happy with our work?</strong><br/>Scan to leave a Google review for JNH Masonry.<br/>" +
        "<a href=\"" + escapeHtml(effectiveReviewUrl()) + "\">" + escapeHtml(effectiveReviewUrl()) + "</a></div>" +
        "<img class=\"print-qr\" src=\"" + qrImageUrl(effectiveReviewUrl()) + "\" width=\"120\" height=\"120\" alt=\"Google review QR\" />" +
      "</div>" +
      (est.paymentLink ? "<p><strong>Pay online:</strong> <a href=\"" + escapeHtml(est.paymentLink) + "\">" + escapeHtml(est.paymentLink) + "</a></p>" : "") +
      "<p class=\"muted\" style=\"font-size:11px\">" + escapeHtml((state.settings && state.settings.paymentFeeNote) || "Card payments typically incur processing fees (e.g. Stripe ~2.9% + $0.30).") + "</p>" +
      "<p style=\"margin-top:24px\">We look forward to working with you.<br/>Sincerely,<br/><strong>Jose Hernandez</strong><br/>JNH Masonry Inc.</p>" +
      "</div>";

    var root = $("#print-root");
    root.innerHTML = html;
    root.setAttribute("aria-hidden", "false");
    window.print();
  }

/* ===== PRO DESK ADDONS: auth, insurance, fleet, marketing ===== */
  var DEFAULT_DESK_PASSWORD = "jnh2026";
  var AUTH_SESSION_KEY = "jnh_pro_desk_unlocked";

  function ensureSettingsShape() {
    if (!state.settings) state.settings = defaultSettings();
    if (!state.settings.deskPassword) state.settings.deskPassword = DEFAULT_DESK_PASSWORD;
    if (state.settings.standardLaborRate == null || state.settings.standardLaborRate === "") state.settings.standardLaborRate = 0;
    if (state.settings.defaultLaborHours == null || state.settings.defaultLaborHours === "") state.settings.defaultLaborHours = 0;
    if (!Array.isArray(state.insuranceDocs)) state.insuranceDocs = [];
    if (!Array.isArray(state.fleetAssets)) state.fleetAssets = [];
    if (!Array.isArray(state.fleetMaintLogs)) state.fleetMaintLogs = [];
    if (!Array.isArray(state.marketingClients)) state.marketingClients = [];
    if (!Array.isArray(state.marketingBlasts)) state.marketingBlasts = [];
    if (!Array.isArray(state.clientFlows)) state.clientFlows = [];
  }

  function isDeskUnlocked() {
    try { return sessionStorage.getItem(AUTH_SESSION_KEY) === "1"; } catch (e) { return false; }
  }
  function setDeskUnlocked(on) {
    try {
      if (on) sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      else sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch (e) {}
  }
  function getDeskPassword() {
    ensureSettingsShape();
    return state.settings.deskPassword || DEFAULT_DESK_PASSWORD;
  }
  function applyGateUI() {
    var gate = $("#gate");
    var app = $("#app");
    if (!gate || !app) return;
    if (isDeskUnlocked()) {
      gate.classList.add("hidden");
      gate.setAttribute("hidden", "");
      app.hidden = false;
      app.classList.remove("app-locked");
      app.removeAttribute("hidden");
    } else {
      gate.classList.remove("hidden");
      gate.removeAttribute("hidden");
      app.hidden = true;
      app.classList.add("app-locked");
      app.setAttribute("hidden", "");
    }
  }
  function lockDesk() {
    setDeskUnlocked(false);
    applyGateUI();
    var inp = $("#gate-password");
    if (inp) { inp.value = ""; setTimeout(function () { inp.focus(); }, 50); }
  }
  function tryUnlock(pw) {
    if (String(pw || "") === getDeskPassword()) {
      setDeskUnlocked(true);
      applyGateUI();
      var err = $("#gate-error");
      if (err) err.classList.add("hidden");
      return true;
    }
    var err2 = $("#gate-error");
    if (err2) err2.classList.remove("hidden");
    return false;
  }
  function bindAuthUI() {
    var form = $("#gate-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      tryUnlock(($("#gate-password") || {}).value);
    });
    if ($("#btn-lock-desk")) $("#btn-lock-desk").addEventListener("click", lockDesk);
    if ($("#btn-lock-from-settings")) $("#btn-lock-from-settings").addEventListener("click", lockDesk);
    if ($("#password-settings-form")) $("#password-settings-form").addEventListener("submit", function (e) {
      e.preventDefault();
      ensureSettingsShape();
      var cur = ($("#settings-current-password") || {}).value || "";
      var neu = ($("#settings-new-password") || {}).value || "";
      var conf = ($("#settings-confirm-password") || {}).value || "";
      var msg = $("#password-settings-msg");
      if (cur !== getDeskPassword()) {
        if (msg) msg.textContent = "Current password is incorrect.";
        return;
      }
      if (neu.length < 4) {
        if (msg) msg.textContent = "New password must be at least 4 characters.";
        return;
      }
      if (neu !== conf) {
        if (msg) msg.textContent = "New password and confirmation do not match.";
        return;
      }
      state.settings.deskPassword = neu;
      save();
      if (msg) msg.textContent = "Password updated. Use the new password next time you unlock.";
      e.target.reset();
    });
  }

  function disclosureHtml() {
    return (
      "<div class=\"disc\"><h3>Disclosures (NYS / Suffolk County–oriented)</h3>" +
      "<p style=\"font-size:8.5pt;color:#666\"><strong>Informational only — not legal advice.</strong> Contractor-style notices for home-improvement estimates in New York / Suffolk County. Confirm license numbers and required contract language with counsel or local requirements.</p>" +
      "<ul>" +
      "<li><strong>License &amp; insurance:</strong> JNH Masonry Inc. represents that it is licensed and insured for home-improvement / masonry work as applicable in New York State and Suffolk County. Ask for current license ID and Certificate of Insurance (COI) before work begins.</li>" +
      "<li><strong>Payment terms:</strong> Deposit and progress / final payments are as stated in this estimate. Work generally begins after signed acceptance and any required deposit. Card / online payments may incur processing fees as noted.</li>" +
      "<li><strong>Cancellation rights (if applicable):</strong> Certain New York home-improvement contracts may give the customer a limited right to cancel within a stated period (often three business days) after signing, and/or other statutory notices. If that law applies to your project, the customer’s cancellation rights are in addition to any terms here. This estimate does not waive rights the law requires.</li>" +
      "<li><strong>Material shipping:</strong> JNH Masonry Inc. is not responsible for material shipping delays, shortages, or carrier situations outside our control.</li>" +
      "<li><strong>Material / manufacturer performance:</strong> JNH Masonry Inc. is not responsible for manufacturer material performance, color variation, or product defects beyond the manufacturer’s warranty.</li>" +
      "<li><strong>Validity:</strong> Estimate is valid for 30 days unless otherwise noted.</li>" +
      "</ul></div>"
    );
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + "T12:00:00");
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    return Math.round((d - now) / 86400000);
  }
  function expiryBadge(dateStr) {
    var d = daysUntil(dateStr);
    if (d == null) return "";
    if (d < 0) return "<span class=\"ins-badge expired\">Expired</span>";
    if (d <= 30) return "<span class=\"ins-badge soon\">Expires in " + d + "d</span>";
    return "<span class=\"ins-badge ok\">OK</span>";
  }
  function fillInsuranceEstimateSelect() {
    var sel = $("#insurance-estimate-select");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = "<option value=\"\">— None / company-wide —</option>";
    (state.estimates || []).slice().sort(function (a, b) {
      return (b.estimateDate || "").localeCompare(a.estimateDate || "");
    }).forEach(function (e) {
      var o = document.createElement("option");
      o.value = e.id;
      o.textContent = (e.customerName || "Untitled") + " · " + (e.estimateNumber || e.id.slice(-6));
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }
  function renderInsurance() {
    ensureSettingsShape();
    fillInsuranceEstimateSelect();
    var list = $("#insurance-list");
    var empty = $("#insurance-empty");
    if (!list) return;
    list.innerHTML = "";
    var docs = state.insuranceDocs || [];
    if (!docs.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    docs.slice().sort(function (a, b) {
      return (a.expiryDate || "").localeCompare(b.expiryDate || "");
    }).forEach(function (doc) {
      var est = (state.estimates || []).find(function (e) { return e.id === doc.estimateId; });
      var row = document.createElement("div");
      row.className = "ins-row";
      row.innerHTML =
        "<div class=\"ins-main\">" +
          "<strong>" + escapeHtml(doc.label || doc.docType) + "</strong> " + expiryBadge(doc.expiryDate) +
          "<div class=\"meta\">" + escapeHtml(doc.docType || "") +
            (doc.carrier ? " · " + escapeHtml(doc.carrier) : "") +
            (doc.policyNumber ? " · #" + escapeHtml(doc.policyNumber) : "") +
          "</div>" +
          "<div class=\"meta\">Expires " + escapeHtml(doc.expiryDate || "—") +
            (est ? " · Job: " + escapeHtml(est.customerName || "") : " · Company-wide") +
          "</div>" +
          (doc.fileName ? "<div class=\"meta\">File: " + escapeHtml(doc.fileName) + "</div>" : "") +
        "</div>" +
        "<div class=\"card-actions\">" +
          (doc.dataUrl ? "<a class=\"btn small ghost\" href=\"" + doc.dataUrl + "\" download=\"" + escapeHtml(doc.fileName || "coi") + "\" target=\"_blank\" rel=\"noopener\">Open</a>" : "") +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">Delete</button>" +
        "</div>";
      row.querySelector("[data-act=edit]").addEventListener("click", function () { openInsuranceEditor(doc.id); });
      row.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Delete insurance document “" + (doc.label || "") + "”?")) return;
        state.insuranceDocs = state.insuranceDocs.filter(function (d) { return d.id !== doc.id; });
        (state.estimates || []).forEach(function (e) {
          if (Array.isArray(e.insuranceDocIds)) e.insuranceDocIds = e.insuranceDocIds.filter(function (id) { return id !== doc.id; });
        });
        save();
        renderInsurance();
        renderEstimateInsuranceAttach();
      });
      list.appendChild(row);
    });
  }
  var pendingInsFile = null;
  function openInsuranceEditor(id) {
    ensureSettingsShape();
    fillInsuranceEstimateSelect();
    var form = $("#insurance-form");
    if (!form) return;
    var doc = id ? state.insuranceDocs.find(function (d) { return d.id === id; }) : null;
    form.reset();
    pendingInsFile = null;
    $("#insurance-file-preview").textContent = "";
    if (doc) {
      form.docId.value = doc.id;
      form.label.value = doc.label || "";
      form.docType.value = doc.docType || "COI";
      form.carrier.value = doc.carrier || "";
      form.policyNumber.value = doc.policyNumber || "";
      form.effectiveDate.value = doc.effectiveDate || "";
      form.expiryDate.value = doc.expiryDate || "";
      form.estimateId.value = doc.estimateId || "";
      form.notes.value = doc.notes || "";
      if (doc.fileName) $("#insurance-file-preview").textContent = "Current file: " + doc.fileName + " (choose a new file to replace)";
      $("#insurance-form-title").textContent = "Edit insurance document";
      $("#btn-cancel-insurance-edit").hidden = false;
      pendingInsFile = doc.dataUrl ? { dataUrl: doc.dataUrl, fileName: doc.fileName, mime: doc.mime } : null;
    } else {
      form.docId.value = "";
      $("#insurance-form-title").textContent = "Add insurance document";
      $("#btn-cancel-insurance-edit").hidden = true;
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function saveInsuranceDoc(e) {
    e.preventDefault();
    ensureSettingsShape();
    var form = e.target;
    var id = form.docId.value || uid();
    var existing = state.insuranceDocs.find(function (d) { return d.id === id; });
    var fileMeta = pendingInsFile || (existing ? { dataUrl: existing.dataUrl, fileName: existing.fileName, mime: existing.mime } : null);
    var doc = {
      id: id,
      label: form.label.value.trim(),
      docType: form.docType.value,
      carrier: form.carrier.value.trim(),
      policyNumber: form.policyNumber.value.trim(),
      effectiveDate: form.effectiveDate.value,
      expiryDate: form.expiryDate.value,
      estimateId: form.estimateId.value || "",
      notes: form.notes.value.trim(),
      fileName: fileMeta ? fileMeta.fileName : "",
      mime: fileMeta ? fileMeta.mime : "",
      dataUrl: fileMeta ? fileMeta.dataUrl : "",
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      var idx = state.insuranceDocs.indexOf(existing);
      state.insuranceDocs[idx] = doc;
    } else {
      doc.createdAt = new Date().toISOString();
      state.insuranceDocs.push(doc);
    }
    // sync attachment onto estimate
    (state.estimates || []).forEach(function (est) {
      if (!Array.isArray(est.insuranceDocIds)) est.insuranceDocIds = [];
      var has = est.insuranceDocIds.indexOf(doc.id) >= 0;
      if (doc.estimateId === est.id && !has) est.insuranceDocIds.push(doc.id);
      if (doc.estimateId !== est.id && has && existing && existing.estimateId === est.id) {
        est.insuranceDocIds = est.insuranceDocIds.filter(function (x) { return x !== doc.id; });
      }
    });
    save();
    form.reset();
    form.docId.value = "";
    pendingInsFile = null;
    $("#insurance-file-preview").textContent = "";
    $("#btn-cancel-insurance-edit").hidden = true;
    $("#insurance-form-title").textContent = "Add insurance document";
    renderInsurance();
    renderEstimateInsuranceAttach();
    alert("Insurance document saved.");
  }
  function renderEstimateInsuranceAttach() {
    var wrap = $("#estimate-insurance-attach");
    if (!wrap) return;
    ensureSettingsShape();
    var draft = window.__draftEstimate;
    if (!draft) { wrap.innerHTML = "<p class=\"muted\">Open or create an estimate to attach docs.</p>"; return; }
    if (!Array.isArray(draft.insuranceDocIds)) draft.insuranceDocIds = [];
    var html = "";
    (state.insuranceDocs || []).forEach(function (doc) {
      var checked = draft.insuranceDocIds.indexOf(doc.id) >= 0 || doc.estimateId === draft.id;
      html += "<label class=\"check ins-check\">" +
        "<input type=\"checkbox\" data-ins-id=\"" + escapeHtml(doc.id) + "\" " + (checked ? "checked" : "") + " /> " +
        escapeHtml(doc.label || doc.docType) + " <span class=\"muted\">(exp " + escapeHtml(doc.expiryDate || "?") + ")</span>" +
        "</label>";
    });
    if (!html) html = "<p class=\"muted\">No insurance docs uploaded yet. Add them under the Insurance tab.</p>";
    wrap.innerHTML = html;
    $$("input[data-ins-id]", wrap).forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-ins-id");
        if (!Array.isArray(draft.insuranceDocIds)) draft.insuranceDocIds = [];
        if (cb.checked) {
          if (draft.insuranceDocIds.indexOf(id) < 0) draft.insuranceDocIds.push(id);
        } else {
          draft.insuranceDocIds = draft.insuranceDocIds.filter(function (x) { return x !== id; });
        }
      });
    });
  }

  // ----- Fleet / Equipment -----
  function renderFleet() {
    ensureSettingsShape();
    var list = $("#fleet-list");
    var empty = $("#fleet-empty");
    if (!list) return;
    list.innerHTML = "";
    var assets = state.fleetAssets || [];
    if (!assets.length) {
      if (empty) empty.classList.remove("hidden");
    } else {
      if (empty) empty.classList.add("hidden");
    }
    assets.slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    }).forEach(function (a) {
      var logs = (state.fleetMaintLogs || []).filter(function (l) { return l.assetId === a.id; })
        .sort(function (x, y) { return (y.date || "").localeCompare(x.date || ""); });
      var last = logs[0];
      var row = document.createElement("div");
      row.className = "fleet-row";
      row.innerHTML =
        "<div class=\"fleet-main\">" +
          "<strong>" + escapeHtml(a.name) + "</strong> <span class=\"status-pill\">" + escapeHtml(a.kind || "Equipment") + "</span>" +
          "<div class=\"meta\">" +
            (a.year ? escapeHtml(String(a.year)) + " " : "") +
            escapeHtml(a.make || "") + " " + escapeHtml(a.model || "") +
            (a.plateOrSerial ? " · " + escapeHtml(a.plateOrSerial) : "") +
          "</div>" +
          "<div class=\"meta\">Purchased " + escapeHtml(a.purchaseDate || "—") +
            " · Cost " + money(a.purchaseCost) +
            (last ? " · Last service " + escapeHtml(last.date) + " (" + escapeHtml(last.kind) + ")" : "") +
          "</div>" +
        "</div>" +
        "<div class=\"card-actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"maint\">Log service</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">Delete</button>" +
        "</div>" +
        "<div class=\"fleet-logs\" data-logs></div>";
      var logsEl = row.querySelector("[data-logs]");
      if (logs.length) {
        logsEl.innerHTML = "<h4>Maintenance &amp; repairs</h4>" + logs.slice(0, 8).map(function (l) {
          return "<div class=\"fleet-log\">" + escapeHtml(l.date) + " · <strong>" + escapeHtml(l.kind) + "</strong> · " +
            money(l.cost) + (l.vendor ? " · " + escapeHtml(l.vendor) : "") +
            (l.notes ? "<div class=\"meta\">" + escapeHtml(l.notes) + "</div>" : "") +
            " <button type=\"button\" class=\"btn small danger\" data-log-del=\"" + escapeHtml(l.id) + "\">×</button></div>";
        }).join("");
        $$("[data-log-del]", logsEl).forEach(function (btn) {
          btn.addEventListener("click", function () {
            var lid = btn.getAttribute("data-log-del");
            state.fleetMaintLogs = state.fleetMaintLogs.filter(function (x) { return x.id !== lid; });
            save();
            renderFleet();
          });
        });
      }
      row.querySelector("[data-act=edit]").addEventListener("click", function () { openFleetEditor(a.id); });
      row.querySelector("[data-act=maint]").addEventListener("click", function () { openMaintForm(a.id); });
      row.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Delete “" + a.name + "” and its maintenance logs?")) return;
        state.fleetAssets = state.fleetAssets.filter(function (x) { return x.id !== a.id; });
        state.fleetMaintLogs = state.fleetMaintLogs.filter(function (x) { return x.assetId !== a.id; });
        save();
        renderFleet();
      });
      list.appendChild(row);
    });
    fillFleetAssetSelect();
  }
  function fillFleetAssetSelect() {
    var sel = $("#maint-asset-select");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = "";
    (state.fleetAssets || []).forEach(function (a) {
      var o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.name + " (" + (a.kind || "") + ")";
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }
  function openFleetEditor(id) {
    var form = $("#fleet-form");
    if (!form) return;
    var a = id ? state.fleetAssets.find(function (x) { return x.id === id; }) : null;
    form.reset();
    if (a) {
      form.assetId.value = a.id;
      form.kind.value = a.kind || "Vehicle";
      form.name.value = a.name || "";
      form.year.value = a.year || "";
      form.make.value = a.make || "";
      form.model.value = a.model || "";
      form.plateOrSerial.value = a.plateOrSerial || "";
      form.purchaseDate.value = a.purchaseDate || "";
      form.purchaseCost.value = a.purchaseCost || "";
      form.notes.value = a.notes || "";
      $("#fleet-form-title").textContent = "Edit asset";
      $("#btn-cancel-fleet-edit").hidden = false;
    } else {
      form.assetId.value = "";
      $("#fleet-form-title").textContent = "Add vehicle / equipment";
      $("#btn-cancel-fleet-edit").hidden = true;
    }
  }
  function saveFleetAsset(e) {
    e.preventDefault();
    ensureSettingsShape();
    var form = e.target;
    var id = form.assetId.value || uid();
    var existing = state.fleetAssets.find(function (x) { return x.id === id; });
    var asset = {
      id: id,
      kind: form.kind.value,
      name: form.name.value.trim(),
      year: form.year.value.trim(),
      make: form.make.value.trim(),
      model: form.model.value.trim(),
      plateOrSerial: form.plateOrSerial.value.trim(),
      purchaseDate: form.purchaseDate.value,
      purchaseCost: Number(form.purchaseCost.value) || 0,
      notes: form.notes.value.trim(),
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      state.fleetAssets[state.fleetAssets.indexOf(existing)] = Object.assign({}, existing, asset);
    } else {
      asset.createdAt = new Date().toISOString();
      state.fleetAssets.push(asset);
    }
    save();
    form.reset();
    form.assetId.value = "";
    $("#btn-cancel-fleet-edit").hidden = true;
    $("#fleet-form-title").textContent = "Add vehicle / equipment";
    renderFleet();
  }
  function openMaintForm(assetId) {
    var card = $("#maint-form-card");
    var form = $("#maint-form");
    if (!card || !form) return;
    fillFleetAssetSelect();
    card.classList.remove("hidden");
    form.reset();
    if (assetId) form.assetId.value = assetId;
    form.date.value = todayISO();
    form.scrollIntoView({ behavior: "smooth" });
  }
  function saveMaintLog(e) {
    e.preventDefault();
    ensureSettingsShape();
    var form = e.target;
    if (!form.assetId.value) { alert("Select an asset."); return; }
    state.fleetMaintLogs.push({
      id: uid(),
      assetId: form.assetId.value,
      date: form.date.value || todayISO(),
      kind: form.kind.value,
      cost: Number(form.cost.value) || 0,
      vendor: form.vendor.value.trim(),
      odometer: form.odometer.value.trim(),
      notes: form.notes.value.trim(),
      createdAt: new Date().toISOString()
    });
    save();
    form.reset();
    $("#maint-form-card").classList.add("hidden");
    renderFleet();
  }

  // ----- Mass marketing -----
  function syncMarketingClientsFromEstimates() {
    ensureSettingsShape();
    var byKey = {};
    (state.marketingClients || []).forEach(function (c) { byKey[(c.email || "") + "|" + (c.phone || "")] = c; });
    (state.estimates || []).forEach(function (e) {
      var email = (e.customerEmail || "").trim();
      var phone = (e.customerPhone || "").trim();
      if (!email && !phone) return;
      var key = email + "|" + phone;
      if (!byKey[key]) {
        var c = {
          id: uid(),
          name: e.customerName || "",
          email: email,
          phone: phone,
          source: "estimate",
          optInEmail: !!email,
          optInSms: !!phone,
          notes: "",
          createdAt: new Date().toISOString()
        };
        state.marketingClients.push(c);
        byKey[key] = c;
      }
    });
  }
  function renderMarketing() {
    ensureSettingsShape();
    syncMarketingClientsFromEstimates();
    var list = $("#marketing-clients");
    var empty = $("#marketing-clients-empty");
    if (!list) return;
    list.innerHTML = "";
    var clients = state.marketingClients || [];
    if (!clients.length) {
      if (empty) empty.classList.remove("hidden");
    } else if (empty) empty.classList.add("hidden");
    clients.slice().sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); }).forEach(function (c) {
      var row = document.createElement("div");
      row.className = "mkt-row";
      row.innerHTML =
        "<label class=\"check\"><input type=\"checkbox\" data-mkt-id=\"" + escapeHtml(c.id) + "\" class=\"mkt-pick\" /></label>" +
        "<div class=\"mkt-main\">" +
          "<strong>" + escapeHtml(c.name || "—") + "</strong>" +
          "<div class=\"meta\">" + escapeHtml(c.email || "no email") + " · " + escapeHtml(c.phone || "no phone") +
            " · " + escapeHtml(c.source || "") + "</div>" +
          "<div class=\"meta\">Email " + (c.optInEmail ? "✓" : "✗") + " · SMS " + (c.optInSms ? "✓" : "✗") + "</div>" +
        "</div>" +
        "<div class=\"card-actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">Delete</button>" +
        "</div>";
      row.querySelector("[data-act=edit]").addEventListener("click", function () { openMarketingClient(c.id); });
      row.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Remove " + (c.name || "client") + " from marketing list?")) return;
        state.marketingClients = state.marketingClients.filter(function (x) { return x.id !== c.id; });
        save();
        renderMarketing();
      });
      list.appendChild(row);
    });
    renderBlastHistory();
  }
  function openMarketingClient(id) {
    var form = $("#mkt-client-form");
    if (!form) return;
    var c = id ? state.marketingClients.find(function (x) { return x.id === id; }) : null;
    form.reset();
    if (c) {
      form.clientId.value = c.id;
      form.name.value = c.name || "";
      form.email.value = c.email || "";
      form.phone.value = c.phone || "";
      form.optInEmail.checked = !!c.optInEmail;
      form.optInSms.checked = !!c.optInSms;
      form.notes.value = c.notes || "";
      $("#btn-cancel-mkt-client").hidden = false;
    } else {
      form.clientId.value = "";
      form.optInEmail.checked = true;
      form.optInSms.checked = true;
      $("#btn-cancel-mkt-client").hidden = true;
    }
  }
  function saveMarketingClient(e) {
    e.preventDefault();
    ensureSettingsShape();
    var form = e.target;
    var id = form.clientId.value || uid();
    var existing = state.marketingClients.find(function (x) { return x.id === id; });
    var c = {
      id: id,
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      optInEmail: !!form.optInEmail.checked,
      optInSms: !!form.optInSms.checked,
      notes: form.notes.value.trim(),
      source: existing ? (existing.source || "manual") : "manual",
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      state.marketingClients[state.marketingClients.indexOf(existing)] = Object.assign({}, existing, c);
    } else {
      c.createdAt = new Date().toISOString();
      state.marketingClients.push(c);
    }
    save();
    form.reset();
    form.clientId.value = "";
    $("#btn-cancel-mkt-client").hidden = true;
    renderMarketing();
  }
  function selectedMarketingIds() {
    return $$(".mkt-pick:checked").map(function (cb) { return cb.getAttribute("data-mkt-id"); });
  }
  function stubSendBlast(e) {
    e.preventDefault();
    ensureSettingsShape();
    var form = e.target;
    var channel = form.channel.value;
    var subject = (form.subject && form.subject.value || "").trim();
    var body = form.body.value.trim();
    if (!body) { alert("Message body required."); return; }
    var ids = selectedMarketingIds();
    var targets = (state.marketingClients || []).filter(function (c) {
      if (ids.length && ids.indexOf(c.id) < 0) return false;
      if (channel === "email") return c.optInEmail && c.email;
      if (channel === "sms") return c.optInSms && c.phone;
      return (c.optInEmail && c.email) || (c.optInSms && c.phone);
    });
    if (!targets.length) {
      alert("No matching opted-in clients. Select clients or add contacts with email/phone.");
      return;
    }
    var blast = {
      id: uid(),
      channel: channel,
      subject: subject,
      body: body,
      recipientCount: targets.length,
      recipients: targets.map(function (t) { return { id: t.id, name: t.name, email: t.email, phone: t.phone }; }),
      status: "stubbed",
      createdAt: new Date().toISOString(),
      note: "Stub only — wire Twilio / email API later. Nothing was sent."
    };
    state.marketingBlasts.unshift(blast);
    if (state.marketingBlasts.length > 50) state.marketingBlasts.length = 50;
    save();
    alert("Blast stubbed for " + targets.length + " recipient(s) via " + channel + ".\n\nNothing was actually sent (Twilio / email API not connected yet).\n\nPreview saved under Blast history.");
    renderBlastHistory();
  }
  function renderBlastHistory() {
    var el = $("#blast-history");
    if (!el) return;
    var blasts = state.marketingBlasts || [];
    if (!blasts.length) {
      el.innerHTML = "<p class=\"muted\">No blast stubs yet.</p>";
      return;
    }
    el.innerHTML = blasts.slice(0, 20).map(function (b) {
      return "<div class=\"blast-row\"><strong>" + escapeHtml(b.channel.toUpperCase()) + "</strong> · " +
        escapeHtml((b.createdAt || "").slice(0, 16).replace("T", " ")) +
        " · " + b.recipientCount + " recipients · <span class=\"status-pill\">" + escapeHtml(b.status) + "</span>" +
        (b.subject ? "<div class=\"meta\">Subject: " + escapeHtml(b.subject) + "</div>" : "") +
        "<div class=\"meta\">" + escapeHtml((b.body || "").slice(0, 160)) + ((b.body || "").length > 160 ? "…" : "") + "</div>" +
        "<div class=\"meta\">" + escapeHtml(b.note || "") + "</div></div>";
    }).join("");
  }

  // ----- Client flow / pipeline / Gantt -----
  var FLOW_STAGES = [
    { id: "lead", label: "Lead", group: "sales" },
    { id: "estimate", label: "Estimate", group: "sales" },
    { id: "sale", label: "Sale", group: "sales" },
    { id: "design", label: "Design", group: "job" },
    { id: "materials", label: "Material purchase", group: "job" },
    { id: "delivery", label: "Delivery arrival", group: "job" },
    { id: "job", label: "Job / install", group: "job" },
    { id: "done", label: "Complete", group: "job" },
    { id: "claim", label: "Claim (ins/warranty)", group: "claim" }
  ];

  function blankFlow(estimateId) {
    var stages = {};
    FLOW_STAGES.forEach(function (s) {
      stages[s.id] = { status: "pending", startDate: "", endDate: "", notes: "" };
    });
    stages.lead.status = "done";
    stages.lead.startDate = todayISO();
    stages.estimate.status = "active";
    stages.estimate.startDate = todayISO();
    return {
      estimateId: estimateId || "",
      stages: stages,
      jobDaysPlanned: 0,
      jobDaysActual: 0,
      claimEnabled: false,
      claimType: "",
      issues: [],
      updatedAt: new Date().toISOString()
    };
  }

  /** Promote Client Flow stages from Jobs/estimate jobStatus (lead→…→complete). */
  function applyJobStatusToFlow(est, flow) {
    if (!est || !flow || !flow.stages) return flow;
    var js = est.jobStatus || "";
    var date0 = est.estimateDate || todayISO();
    function mark(id, status, start) {
      if (!flow.stages[id]) flow.stages[id] = { status: "pending", startDate: "", endDate: "", notes: "" };
      flow.stages[id].status = status;
      if (start && !flow.stages[id].startDate) flow.stages[id].startDate = start;
    }
    if (!js) {
      mark("lead", "done", date0);
      if (flow.stages.estimate.status === "pending") mark("estimate", "active", date0);
      flow.updatedAt = new Date().toISOString();
      return flow;
    }
    mark("lead", "done", date0);
    mark("estimate", "done", date0);
    mark("sale", "done", date0);
    if (js === "Sold") {
      // sale complete; leave design+ unless already further
      if (flow.stages.design.status === "pending") {
        /* stay pending until Scheduled */
      }
    } else if (js === "Scheduled") {
      if (flow.stages.design.status === "pending" || flow.stages.design.status === "active") {
        mark("design", "active", est.jobScheduledDate || date0);
      }
    } else if (js === "In progress") {
      ["design", "materials", "delivery"].forEach(function (id) { mark(id, "done", date0); });
      if (flow.stages.job.status !== "done") {
        mark("job", "active", est.jobScheduledDate || todayISO());
      }
    } else if (js === "Done") {
      FLOW_STAGES.forEach(function (s) {
        if (s.id !== "claim") mark(s.id, "done", date0);
      });
    }
    flow.updatedAt = new Date().toISOString();
    return flow;
  }

  function ensureFlowForEstimate(est) {
    ensureSettingsShape();
    if (!Array.isArray(state.clientFlows)) state.clientFlows = [];
    var flow = state.clientFlows.find(function (f) { return f.estimateId === est.id; });
    if (!flow) {
      flow = blankFlow(est.id);
      if (est.estimateDate) {
        flow.stages.estimate.startDate = est.estimateDate;
        flow.stages.lead.startDate = est.estimateDate;
      }
      applyJobStatusToFlow(est, flow);
      state.clientFlows.push(flow);
    }
    return flow;
  }

  /** When Jobs / estimate jobStatus changes, keep Client Flow stages aligned. */
  function syncFlowFromJobStatus(est) {
    if (!est) return null;
    var flow = ensureFlowForEstimate(est);
    applyJobStatusToFlow(est, flow);
    return flow;
  }

  function removeFlowForEstimate(estimateId) {
    if (!Array.isArray(state.clientFlows)) return;
    state.clientFlows = state.clientFlows.filter(function (f) { return f.estimateId !== estimateId; });
  }

  function activeFlowStage(flow) {
    var stages = FLOW_STAGES.filter(function (s) {
      return s.id !== "claim" || (flow && flow.claimEnabled);
    });
    var active = null;
    stages.forEach(function (s) {
      var st = (flow.stages[s.id] && flow.stages[s.id].status) || "pending";
      if (st === "active" || st === "blocked") active = s;
    });
    if (active) return active;
    for (var i = stages.length - 1; i >= 0; i--) {
      var st2 = (flow.stages[stages[i].id] && flow.stages[stages[i].id].status) || "pending";
      if (st2 === "done") return stages[i];
    }
    return stages[0] || null;
  }

  function flowProgress(flow) {
    var stages = FLOW_STAGES.filter(function (s) {
      return s.id !== "claim" || flow.claimEnabled;
    });
    var done = 0;
    stages.forEach(function (s) {
      var st = (flow.stages[s.id] && flow.stages[s.id].status) || "pending";
      if (st === "done") done += 1;
      else if (st === "active") done += 0.5;
    });
    return { done: done, total: stages.length, pct: stages.length ? Math.round((done / stages.length) * 100) : 0 };
  }

  function renderFlow() {
    ensureSettingsShape();
    if (!Array.isArray(state.clientFlows)) state.clientFlows = [];
    var list = $("#flow-clients");
    var gantt = $("#flow-gantt");
    var empty = $("#flow-empty");
    if (!list) return;

    var estimates = (state.estimates || []).slice().sort(function (a, b) {
      return (b.estimateDate || "").localeCompare(a.estimateDate || "");
    });
    var flowsBefore = (state.clientFlows || []).length;
    estimates.forEach(ensureFlowForEstimate);
    if ((state.clientFlows || []).length !== flowsBefore) {
      try { save(); } catch (eFlowSave) {}
    }

    list.innerHTML = "";
    if (!estimates.length) {
      if (empty) empty.classList.remove("hidden");
      if (gantt) gantt.innerHTML = "";
      return;
    }
    if (empty) empty.classList.add("hidden");

    // Gantt overview
    if (gantt) {
      var header = "<div class=\"gantt-header\"><span class=\"gantt-name\">Client</span><div class=\"gantt-tracks\">" +
        FLOW_STAGES.map(function (s) { return "<span class=\"gantt-col\" title=\"" + escapeHtml(s.label) + "\">" + escapeHtml(s.label.split(" ")[0]) + "</span>"; }).join("") +
        "</div></div>";
      var rows = estimates.map(function (est) {
        var flow = ensureFlowForEstimate(est);
        var prog = flowProgress(flow);
        var cells = FLOW_STAGES.map(function (s) {
          if (s.id === "claim" && !flow.claimEnabled) return "<span class=\"gantt-cell skip\" title=\"Claim off\">—</span>";
          var st = (flow.stages[s.id] && flow.stages[s.id].status) || "pending";
          return "<span class=\"gantt-cell " + st + "\" title=\"" + escapeHtml(s.label) + ": " + st + "\"></span>";
        }).join("");
        return "<div class=\"gantt-row\" data-est=\"" + escapeHtml(est.id) + "\">" +
          "<span class=\"gantt-name\">" + escapeHtml(est.customerName || "Untitled") +
          " <span class=\"muted\">" + prog.pct + "%</span></span>" +
          "<div class=\"gantt-tracks\">" + cells + "</div></div>";
      }).join("");
      gantt.innerHTML = header + rows;
      $$(".gantt-row", gantt).forEach(function (row) {
        row.addEventListener("click", function () {
          openFlowEditor(row.getAttribute("data-est"));
        });
      });
    }

    estimates.forEach(function (est) {
      var flow = ensureFlowForEstimate(est);
      var prog = flowProgress(flow);
      var openIssues = (flow.issues || []).filter(function (i) { return i.status !== "resolved"; }).length;
      var card = document.createElement("div");
      card.className = "flow-card";
      var barSegs = FLOW_STAGES.filter(function (s) { return s.id !== "claim" || flow.claimEnabled; }).map(function (s) {
        var st = (flow.stages[s.id] && flow.stages[s.id].status) || "pending";
        return "<div class=\"flow-seg " + st + "\" title=\"" + escapeHtml(s.label) + "\"><span>" + escapeHtml(s.label) + "</span></div>";
      }).join("");
      card.innerHTML =
        "<div class=\"row-between\">" +
          "<div><strong>" + escapeHtml(est.customerName || "Untitled") + "</strong>" +
          "<div class=\"meta\">" + escapeHtml(est.estimateNumber || "") + " · " + escapeHtml(est.projectAddress || "") +
          (est.jobStatus ? " · " + escapeHtml(est.jobStatus) : "") + "</div></div>" +
          "<div class=\"flow-pct\">" + prog.pct + "%" +
          (openIssues ? " <span class=\"ins-badge soon\">" + openIssues + " issue(s)</span>" : "") +
          (flow.claimEnabled ? " <span class=\"ins-badge ok\">Claim</span>" : "") +
          "</div>" +
        "</div>" +
        "<div class=\"flow-bar\">" + barSegs + "</div>" +
        "<div class=\"meta\">Job days planned: " + (flow.jobDaysPlanned || "—") +
          " · Actual: " + (flow.jobDaysActual || "—") + "</div>" +
        "<div class=\"card-actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit flow</button>" +
          "<button type=\"button\" class=\"btn small ghost\" data-act=\"est\">Open estimate</button>" +
        "</div>";
      card.querySelector("[data-act=edit]").addEventListener("click", function () { openFlowEditor(est.id); });
      card.querySelector("[data-act=est]").addEventListener("click", function () { openEditor(est.id); });
      list.appendChild(card);
    });
  }

  function openFlowEditor(estimateId) {
    var est = (state.estimates || []).find(function (e) { return e.id === estimateId; });
    if (!est) return;
    var flow = ensureFlowForEstimate(est);
    var card = $("#flow-editor-card");
    var form = $("#flow-form");
    if (!card || !form) return;
    card.classList.remove("hidden");
    $("#flow-editor-title").textContent = "Flow — " + (est.customerName || "Client");
    form.estimateId.value = est.id;
    form.jobDaysPlanned.value = flow.jobDaysPlanned || "";
    form.jobDaysActual.value = flow.jobDaysActual || "";
    form.claimEnabled.checked = !!flow.claimEnabled;
    form.claimType.value = flow.claimType || "";
    var stagesWrap = $("#flow-stages-editor");
    stagesWrap.innerHTML = FLOW_STAGES.map(function (s) {
      var st = flow.stages[s.id] || { status: "pending", startDate: "", endDate: "", notes: "" };
      var disabled = (s.id === "claim" && !flow.claimEnabled) ? " opacity:.45" : "";
      return "<div class=\"flow-stage-edit" + disabled + "\" data-stage=\"" + s.id + "\">" +
        "<div class=\"row-between\"><strong>" + escapeHtml(s.label) + "</strong>" +
        "<span class=\"muted\">" + escapeHtml(s.group) + "</span></div>" +
        "<div class=\"grid-2\">" +
          "<label>Status<select data-k=\"status\">" +
            ["pending", "active", "done", "blocked"].map(function (o) {
              return "<option value=\"" + o + "\"" + (st.status === o ? " selected" : "") + ">" + o + "</option>";
            }).join("") +
          "</select></label>" +
          "<label>Start<input type=\"date\" data-k=\"startDate\" value=\"" + escapeHtml(st.startDate || "") + "\" /></label>" +
          "<label>End<input type=\"date\" data-k=\"endDate\" value=\"" + escapeHtml(st.endDate || "") + "\" /></label>" +
          "<label>Notes<input type=\"text\" data-k=\"notes\" value=\"" + escapeHtml(st.notes || "") + "\" /></label>" +
        "</div></div>";
    }).join("");
    renderFlowIssues(flow);
    card.scrollIntoView({ behavior: "smooth" });
  }

  function renderFlowIssues(flow) {
    var wrap = $("#flow-issues-list");
    if (!wrap) return;
    var issues = flow.issues || [];
    if (!issues.length) {
      wrap.innerHTML = "<p class=\"muted\">No issues logged.</p>";
      return;
    }
    wrap.innerHTML = issues.slice().reverse().map(function (iss) {
      return "<div class=\"flow-issue " + escapeHtml(iss.status || "") + "\">" +
        "<div class=\"row-between\"><strong>" + escapeHtml(iss.title) + "</strong>" +
        "<span class=\"status-pill\">" + escapeHtml(iss.status) + "</span></div>" +
        "<div class=\"meta\">" + escapeHtml(iss.date || "") +
          (iss.stage ? " · " + escapeHtml(iss.stage) : "") + "</div>" +
        (iss.detail ? "<div class=\"meta\">" + escapeHtml(iss.detail) + "</div>" : "") +
        "<div class=\"card-actions\">" +
          (iss.status !== "resolved" ? "<button type=\"button\" class=\"btn small\" data-resolve=\"" + escapeHtml(iss.id) + "\">Resolve</button>" : "") +
          "<button type=\"button\" class=\"btn small danger\" data-del-issue=\"" + escapeHtml(iss.id) + "\">Delete</button>" +
        "</div></div>";
    }).join("");
    $$("[data-resolve]", wrap).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-resolve");
        var iss = flow.issues.find(function (x) { return x.id === id; });
        if (iss) { iss.status = "resolved"; iss.resolvedAt = new Date().toISOString(); save(); renderFlowIssues(flow); renderFlow(); }
      });
    });
    $$("[data-del-issue]", wrap).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-del-issue");
        flow.issues = flow.issues.filter(function (x) { return x.id !== id; });
        save(); renderFlowIssues(flow); renderFlow();
      });
    });
  }

  function saveFlowForm(e) {
    e.preventDefault();
    ensureSettingsShape();
    var form = e.target;
    var estId = form.estimateId.value;
    var est = state.estimates.find(function (x) { return x.id === estId; });
    if (!est) return;
    var flow = ensureFlowForEstimate(est);
    flow.jobDaysPlanned = Number(form.jobDaysPlanned.value) || 0;
    flow.jobDaysActual = Number(form.jobDaysActual.value) || 0;
    flow.claimEnabled = !!form.claimEnabled.checked;
    flow.claimType = form.claimType.value.trim();
    $$(".flow-stage-edit", $("#flow-stages-editor")).forEach(function (el) {
      var sid = el.getAttribute("data-stage");
      if (!flow.stages[sid]) flow.stages[sid] = {};
      flow.stages[sid].status = el.querySelector("[data-k=status]").value;
      flow.stages[sid].startDate = el.querySelector("[data-k=startDate]").value;
      flow.stages[sid].endDate = el.querySelector("[data-k=endDate]").value;
      flow.stages[sid].notes = el.querySelector("[data-k=notes]").value.trim();
    });
    // sync jobStatus lightly from flow → Jobs board / Hub
    if (flow.stages.job.status === "done" || flow.stages.done.status === "done") est.jobStatus = "Done";
    else if (flow.stages.job.status === "active") est.jobStatus = "In progress";
    else if (flow.stages.sale.status === "done" && flow.stages.design.status === "active") est.jobStatus = "Scheduled";
    else if (flow.stages.sale.status === "done") est.jobStatus = "Sold";
    else if (flow.stages.estimate.status === "active" || flow.stages.estimate.status === "done") est.jobStatus = est.jobStatus || "";
    est.updatedAt = new Date().toISOString();
    flow.updatedAt = new Date().toISOString();
    save();
    renderFlow();
    alert("Client flow saved.");
  }

  function addFlowIssue(e) {
    e.preventDefault();
    var form = e.target;
    var estId = ($("#flow-form") || {}).estimateId && $("#flow-form").estimateId.value;
    if (!estId) { alert("Open a client flow first."); return; }
    var est = state.estimates.find(function (x) { return x.id === estId; });
    if (!est) return;
    var flow = ensureFlowForEstimate(est);
    if (!Array.isArray(flow.issues)) flow.issues = [];
    flow.issues.push({
      id: uid(),
      title: form.title.value.trim(),
      detail: form.detail.value.trim(),
      stage: form.stage.value,
      date: form.date.value || todayISO(),
      status: "open",
      createdAt: new Date().toISOString()
    });
    save();
    form.reset();
    form.date.value = todayISO();
    renderFlowIssues(flow);
    renderFlow();
  }

  function bindFlowUI() {
    if ($("#flow-form")) $("#flow-form").addEventListener("submit", saveFlowForm);
    if ($("#flow-issue-form")) $("#flow-issue-form").addEventListener("submit", addFlowIssue);
    if ($("#btn-flow-refresh")) $("#btn-flow-refresh").addEventListener("click", renderFlow);
    if ($("#btn-cancel-flow-edit")) $("#btn-cancel-flow-edit").addEventListener("click", function () {
      $("#flow-editor-card").classList.add("hidden");
    });
    if ($("#flow-form") && $("#flow-form").claimEnabled) {
      $("#flow-form").claimEnabled.addEventListener("change", function () {
        // re-open to refresh claim stage enablement if editing
        var id = $("#flow-form").estimateId.value;
        if (id) {
          var est = state.estimates.find(function (x) { return x.id === id; });
          if (est) {
            var flow = ensureFlowForEstimate(est);
            flow.claimEnabled = !!$("#flow-form").claimEnabled.checked;
            openFlowEditor(id);
          }
        }
      });
    }
  }



  function wireHubAndAppointments() {
    if ($("#btn-hub-refresh")) $("#btn-hub-refresh").addEventListener("click", renderHub);
    if ($("#avail-form")) $("#avail-form").addEventListener("submit", saveAvailForm);
    if ($("#appt-filter")) $("#appt-filter").addEventListener("change", renderAppointments);
    if ($("#appt-cal-prev")) $("#appt-cal-prev").addEventListener("click", function () {
      if (state.apptCalMonth == null) { var n = new Date(); state.apptCalYear = n.getFullYear(); state.apptCalMonth = n.getMonth(); }
      state.apptCalMonth--;
      if (state.apptCalMonth < 0) { state.apptCalMonth = 11; state.apptCalYear--; }
      renderApptAdminCal();
    });
    if ($("#appt-cal-next")) $("#appt-cal-next").addEventListener("click", function () {
      if (state.apptCalMonth == null) { var n = new Date(); state.apptCalYear = n.getFullYear(); state.apptCalMonth = n.getMonth(); }
      state.apptCalMonth++;
      if (state.apptCalMonth > 11) { state.apptCalMonth = 0; state.apptCalYear++; }
      renderApptAdminCal();
    });
    if ($("#btn-add-appointment")) $("#btn-add-appointment").addEventListener("click", function () {
      $("#manual-appt-card").classList.remove("hidden");
      var f = $("#manual-appt-form");
      f.reset(); f.id.value = "";
      f.date.value = todayISO();
      f.scrollIntoView({ behavior: "smooth" });
    });
    if ($("#btn-cancel-manual-appt")) $("#btn-cancel-manual-appt").addEventListener("click", function () {
      $("#manual-appt-card").classList.add("hidden");
    });
    if ($("#manual-appt-form")) $("#manual-appt-form").addEventListener("submit", saveManualAppointment);
    if ($("#btn-copy-book-url")) $("#btn-copy-book-url").addEventListener("click", function () {
      var url = location.origin + location.pathname.replace(/index\.html?$/i, "") + "book.html";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { alert("Copied: " + url); });
      else prompt("Booker URL", url);
    });
  }

  function bindAddonUI() {
    bindAuthUI();
    if ($("#insurance-form")) $("#insurance-form").addEventListener("submit", saveInsuranceDoc);
    if ($("#btn-add-insurance")) $("#btn-add-insurance").addEventListener("click", function () { openInsuranceEditor(null); });
    if ($("#btn-cancel-insurance-edit")) $("#btn-cancel-insurance-edit").addEventListener("click", function () { openInsuranceEditor(null); this.hidden = true; });
    if ($("#btn-insurance-refresh")) $("#btn-insurance-refresh").addEventListener("click", renderInsurance);
    if ($("#insurance-file")) $("#insurance-file").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) { pendingInsFile = null; return; }
      if (f.size > 4.5 * 1024 * 1024) {
        alert("File too large for localStorage (max ~4.5 MB). Compress or use a smaller PDF/image.");
        e.target.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        pendingInsFile = { dataUrl: reader.result, fileName: f.name, mime: f.type || "application/octet-stream" };
        $("#insurance-file-preview").textContent = "Ready: " + f.name + " (" + Math.round(f.size / 1024) + " KB)";
      };
      reader.readAsDataURL(f);
    });

    if ($("#fleet-form")) $("#fleet-form").addEventListener("submit", saveFleetAsset);
    if ($("#btn-add-fleet")) $("#btn-add-fleet").addEventListener("click", function () { openFleetEditor(null); });
    if ($("#btn-cancel-fleet-edit")) $("#btn-cancel-fleet-edit").addEventListener("click", function () { openFleetEditor(null); this.hidden = true; });
    if ($("#maint-form")) $("#maint-form").addEventListener("submit", saveMaintLog);
    if ($("#btn-cancel-maint")) $("#btn-cancel-maint").addEventListener("click", function () { $("#maint-form-card").classList.add("hidden"); });
    if ($("#btn-fleet-refresh")) $("#btn-fleet-refresh").addEventListener("click", renderFleet);

    if ($("#mkt-client-form")) $("#mkt-client-form").addEventListener("submit", saveMarketingClient);
    if ($("#btn-add-mkt-client")) $("#btn-add-mkt-client").addEventListener("click", function () { openMarketingClient(null); });
    if ($("#btn-cancel-mkt-client")) $("#btn-cancel-mkt-client").addEventListener("click", function () { openMarketingClient(null); this.hidden = true; });
    if ($("#btn-mkt-sync")) $("#btn-mkt-sync").addEventListener("click", function () { syncMarketingClientsFromEstimates(); save(); renderMarketing(); alert("Synced clients from estimates."); });
    if ($("#btn-mkt-select-all")) $("#btn-mkt-select-all").addEventListener("click", function () { $$(".mkt-pick").forEach(function (c) { c.checked = true; }); });
    if ($("#btn-mkt-select-none")) $("#btn-mkt-select-none").addEventListener("click", function () { $$(".mkt-pick").forEach(function (c) { c.checked = false; }); });
    if ($("#blast-form")) $("#blast-form").addEventListener("submit", stubSendBlast);

    // Critical: Client Flow + Project Hub + Appointments were defined but never bound
    bindFlowUI();
    wireHubAndAppointments();

    // Cross-department nav (Jobs ↔ Flow ↔ Hub, etc.) — bind once for all static data-goto
    $$("[data-goto]").forEach(function (btn) {
      if (btn._deskGotoBound) return;
      btn._deskGotoBound = true;
      btn.addEventListener("click", function () {
        var g = btn.getAttribute("data-goto");
        if (g) showView(g);
      });
    });
  }


  // ========== EXTRA MODULES: jobs, price book, reviews, payments ==========
  var JOB_STATUSES = ["Sold", "Scheduled", "In progress", "Done"];
  var DEFAULT_GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJC1ceBG4y6IkRObpjjofxrpQ";
  var DEFAULT_REVIEW_MESSAGE = "Hey, how are you doing? It was great working on your project. If you could kindly leave me a Google review, it would help me out tremendously. Again, thank you for your support.";
  var STRIPE_FEE_NOTE = "Card payments typically incur ~2.9% + $0.30 per transaction (Stripe US). Customer or JNH absorbs fees per agreement.";

  function defaultSettings() {
    return {
      googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
      stripePublishableKey: "",
      stripeSecretKeyHint: "", // never store real secret — placeholder only
      stripePaymentLinkBase: "",
      stripeMode: "test",
      paymentFeeNote: STRIPE_FEE_NOTE,
      absorbFees: false,
      deskPassword: "jnh2026",
      standardLaborRate: 0,
      defaultLaborHours: 0,
      weatherLocationName: "Suffolk County, NY",
      weatherLatitude: 40.7891,
      weatherLongitude: -73.1350
    };
  }

  function seedPriceBook() {
    return [
      { id: uid(), name: "Cambridge Ledgestone — Basque Blend", category: "Cambridge Pavers", unit: "sf", lastCost: 4.85, vendor: "Cambridge dealer", lastPurchased: "", notes: "Typical coverage ~100 sf/pallet", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Cambridge Cobble — Nickel", category: "Cambridge Pavers", unit: "sf", lastCost: 3.95, vendor: "Cambridge dealer", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Cambridge ArmorTec Hollandstone", category: "Cambridge Pavers", unit: "sf", lastCost: 3.45, vendor: "Cambridge dealer", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Bluestone patio — thermal", category: "Natural Stone", unit: "sf", lastCost: 12.50, vendor: "Stone yard", lastPurchased: "", notes: "1–1.5\"", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Belgian block — granite", category: "Natural Stone", unit: "ea", lastCost: 4.25, vendor: "Stone yard", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Cultured stone veneer", category: "Veneer / Cultured Stone", unit: "sf", lastCost: 7.80, vendor: "", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "CMU block 8\"", category: "Block / Concrete", unit: "ea", lastCost: 2.35, vendor: "Building supply", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Concrete sand", category: "Sand / Base", unit: "ton", lastCost: 48.00, vendor: "Yard", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "3/4\" clean stone (RCA/gravel)", category: "Sand / Base", unit: "ton", lastCost: 42.00, vendor: "Yard", lastPurchased: "", notes: "", updatedAt: new Date().toISOString() },
      { id: uid(), name: "Polymeric sand — joint", category: "Sand / Base", unit: "bag", lastCost: 28.00, vendor: "", lastPurchased: "", notes: "50 lb", updatedAt: new Date().toISOString() }
    ];
  }

  function hoursForEstimate(estimateId) {
    var h = 0;
    (state.timeEntries || []).forEach(function (t) {
      if (t.estimateId === estimateId) h += Number(t.hours) || 0;
    });
    return h;
  }

  function effectiveReviewUrl() {
    var u = (state.settings && state.settings.googleReviewUrl) || "";
    u = String(u).trim();
    return u || DEFAULT_GOOGLE_REVIEW_URL;
  }

  function qrImageUrl(data) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=" + encodeURIComponent(data);
  }

  // ----- Jobs -----
  function renderJobs() {
    var board = $("#job-board");
    var empty = $("#jobs-empty");
    if (!board) return;
    board.innerHTML = "";
    var jobs = (state.estimates || []).filter(function (e) {
      return e.jobStatus && JOB_STATUSES.indexOf(e.jobStatus) >= 0;
    });
    if (!jobs.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    JOB_STATUSES.forEach(function (status) {
      var col = document.createElement("div");
      col.className = "job-col";
      var items = jobs.filter(function (j) { return j.jobStatus === status; });
      col.innerHTML = "<h3>" + escapeHtml(status) + " <span class=\"muted\">(" + items.length + ")</span></h3>";
      var list = document.createElement("div");
      list.className = "job-col-list";
      items.forEach(function (est) {
        var tot = estimateTotals(est);
        var hrs = hoursForEstimate(est.id);
        var card = document.createElement("div");
        card.className = "job-card";
        card.innerHTML =
          "<h4>" + escapeHtml(est.customerName || "Untitled") + "</h4>" +
          "<div class=\"meta\">" + escapeHtml(est.estimateNumber || "") + " · " + money(tot.grand) + "</div>" +
          "<div class=\"meta\">" + escapeHtml(est.projectAddress || "") + "</div>" +
          "<div class=\"meta\">Hours logged: <strong>" + hrs.toFixed(2) + "</strong></div>" +
          (est.jobScheduledDate ? "<div class=\"meta\">Scheduled: " + escapeHtml(est.jobScheduledDate) + "</div>" : "") +
          (est.paymentStatus ? "<div class=\"meta\">Pay: " + escapeHtml(est.paymentStatus) + "</div>" : "") +
          "<div class=\"card-actions\">" +
            "<select data-act=\"status\">" + JOB_STATUSES.map(function (s) {
              return "<option value=\"" + s + "\"" + (s === status ? " selected" : "") + ">" + s + "</option>";
            }).join("") + "</select>" +
            "<button type=\"button\" class=\"btn small\" data-act=\"open\">Estimate</button>" +
            "<button type=\"button\" class=\"btn small\" data-act=\"flow\">Flow</button>" +
            "<button type=\"button\" class=\"btn small\" data-act=\"time\">Time</button>" +
          "</div>";
        card.querySelector("[data-act=status]").addEventListener("change", function (e) {
          est.jobStatus = e.target.value;
          est.updatedAt = new Date().toISOString();
          syncFlowFromJobStatus(est);
          save();
          renderJobs();
        });
        card.querySelector("[data-act=open]").addEventListener("click", function () { openEditor(est.id); });
        card.querySelector("[data-act=flow]").addEventListener("click", function () {
          showView("flow");
          setTimeout(function () { openFlowEditor(est.id); }, 50);
        });
        card.querySelector("[data-act=time]").addEventListener("click", function () {
          showView("timelog");
          setTimeout(function () {
            var form = $("#time-form");
            if (form && form.estimateId) form.estimateId.value = est.id;
          }, 100);
        });
        list.appendChild(card);
      });
      col.appendChild(list);
      board.appendChild(col);
    });
  }

  // ----- Price book -----
  function ensurePriceBook() {
    if (!state.priceBook || !state.priceBook.length) {
      state.priceBook = seedPriceBook();
      save();
    }
  }

  function renderPriceBook() {
    ensurePriceBook();
    var body = $("#pricebook-body");
    var empty = $("#pricebook-empty");
    if (!body) return;
    body.innerHTML = "";
    var filter = ($("#pricebook-filter") && $("#pricebook-filter").value) || "";
    var rows = state.priceBook.slice().sort(function (a, b) {
      return (a.category + a.name).localeCompare(b.category + b.name);
    });
    if (filter) rows = rows.filter(function (r) { return r.category === filter; });
    if (!rows.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    rows.forEach(function (item) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(item.name) + "</td>" +
        "<td>" + escapeHtml(item.category) + "</td>" +
        "<td>" + escapeHtml(item.unit) + "</td>" +
        "<td>" + money(item.lastCost) + "</td>" +
        "<td>" + escapeHtml(item.vendor || "—") + "</td>" +
        "<td class=\"muted\">" + escapeHtml((item.lastPurchased || item.updatedAt || "").slice(0, 10)) + "</td>" +
        "<td class=\"card-actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"use\">Use</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">×</button>" +
        "</td>";
      tr.querySelector("[data-act=use]").addEventListener("click", function () { addLineFromPriceItem(item); });
      tr.querySelector("[data-act=edit]").addEventListener("click", function () {
        var form = $("#pricebook-form");
        form.itemId.value = item.id;
        form.name.value = item.name;
        form.category.value = item.category;
        form.unit.value = item.unit;
        form.lastCost.value = item.lastCost;
        form.vendor.value = item.vendor || "";
        form.lastPurchased.value = item.lastPurchased || "";
        form.notes.value = item.notes || "";
        $("#btn-cancel-price-edit").hidden = false;
        form.scrollIntoView({ behavior: "smooth" });
      });
      tr.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Remove " + item.name + " from price book?")) return;
        state.priceBook = state.priceBook.filter(function (x) { return x.id !== item.id; });
        save();
        renderPriceBook();
      });
      body.appendChild(tr);
    });
  }

  function addLineFromPriceItem(item) {
    if (!window.__draftEstimate) {
      alert("Open an estimate first, then use Price Book → Use (or + From Price Book).");
      showView("estimates");
      return;
    }
    window.__draftEstimate.lines.push({
      description: item.name,
      qty: 1,
      unit: item.unit || "sf",
      laborRate: effectiveJobLaborRate(window.__draftEstimate),
      materialCost: Number(item.lastCost) || 0,
      priceBookId: item.id
    });
    renderLines(window.__draftEstimate.lines);
    recalcTotals();
    showView("editor");
  }

  function savePriceItem(e) {
    e.preventDefault();
    var form = $("#pricebook-form");
    var id = form.itemId.value;
    var item = {
      id: id || uid(),
      name: form.name.value.trim(),
      category: form.category.value,
      unit: form.unit.value,
      lastCost: parseFloat(form.lastCost.value) || 0,
      vendor: form.vendor.value.trim(),
      lastPurchased: form.lastPurchased.value,
      notes: form.notes.value.trim(),
      updatedAt: new Date().toISOString()
    };
    if (!item.name) return;
    ensurePriceBook();
    var idx = state.priceBook.findIndex(function (x) { return x.id === item.id; });
    if (idx >= 0) state.priceBook[idx] = item;
    else state.priceBook.push(item);
    save();
    form.reset();
    form.itemId.value = "";
    $("#btn-cancel-price-edit").hidden = true;
    renderPriceBook();
  }

  function pickFromPriceBook() {
    ensurePriceBook();
    if (!window.__draftEstimate) {
      alert("Open or create an estimate first.");
      return;
    }
    var names = state.priceBook.map(function (p, i) { return (i + 1) + ". " + p.name + " — " + money(p.lastCost) + "/" + p.unit; }).join("\n");
    var pick = prompt("Enter number to add to estimate:\n\n" + names);
    var n = parseInt(pick, 10);
    if (!n || n < 1 || n > state.priceBook.length) return;
    addLineFromPriceItem(state.priceBook[n - 1]);
  }

  // ----- Reviews -----
  function renderReviews() {
    var url = effectiveReviewUrl();
    var input = $("#google-review-url");
    if (input && document.activeElement !== input) input.value = (state.settings && state.settings.googleReviewUrl) || DEFAULT_GOOGLE_REVIEW_URL;
    var message = $("#review-message");
    if (message && document.activeElement !== message) message.value = (state.settings && state.settings.reviewMessage) || DEFAULT_REVIEW_MESSAGE;
    var img = $("#reviews-qr-img");
    if (img) img.src = qrImageUrl(url);
    var disp = $("#reviews-link-display");
    if (disp) disp.textContent = url;
    var open = $("#btn-open-review");
    if (open) open.href = url;
  }

  function reviewShareBody(includeQr) {
    var url = effectiveReviewUrl();
    var message = $("#review-message");
    var body = (message && message.value.trim()) || (state.settings && state.settings.reviewMessage) || DEFAULT_REVIEW_MESSAGE;
    body += "\n\nGoogle review link: " + url;
    if (includeQr) {
      body += "\nQR code image: " + qrImageUrl(url);
      body += "\n(If your app does not show the image, the QR is on screen — attach it from print.)";
    }
    return body;
  }

  function openReviewEmail(includeQr) {
    var subject = "A quick favor — Google review for JNH Masonry";
    window.location.href = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(reviewShareBody(includeQr));
  }

  function openReviewText(includeQr) {
    window.location.href = "sms:?body=" + encodeURIComponent(reviewShareBody(includeQr));
  }

  function saveReviewsSettings(e) {
    e.preventDefault();
    if (!state.settings) state.settings = defaultSettings();
    state.settings.googleReviewUrl = $("#google-review-url").value.trim() || DEFAULT_GOOGLE_REVIEW_URL;
    var message = $("#review-message");
    state.settings.reviewMessage = (message && message.value.trim()) || DEFAULT_REVIEW_MESSAGE;
    save();
    renderReviews();
    alert("Review link saved. Printed estimates will use this QR/link.");
  }

  // ----- Payments (Stripe — locked processor) -----
  function renderPayments() {
    if (!state.settings) state.settings = defaultSettings();
    var pk = $("#stripe-pk");
    var base = $("#stripe-link-base");
    if (pk && document.activeElement !== pk) pk.value = state.settings.stripePublishableKey || "";
    if (base && document.activeElement !== base) base.value = state.settings.stripePaymentLinkBase || "";
    var mode = $("#stripe-mode");
    if (mode) mode.value = state.settings.stripeMode || "test";
    var fee = $("#stripe-fee-note");
    if (fee) fee.value = state.settings.paymentFeeNote || STRIPE_FEE_NOTE;
    var absorb = $("#stripe-absorb-fees");
    if (absorb) absorb.checked = !!state.settings.absorbFees;

    var body = $("#payments-body");
    var empty = $("#payments-empty");
    if (!body) return;
    body.innerHTML = "";
    if (!state.estimates.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    var sorted = state.estimates.slice().sort(function (a, b) {
      return (b.estimateDate || "").localeCompare(a.estimateDate || "");
    });
    sorted.forEach(function (est) {
      var tot = estimateTotals(est);
      var tr = document.createElement("tr");
      var link = est.paymentLink || "";
      tr.innerHTML =
        "<td>" + escapeHtml(est.customerName || "") + "</td>" +
        "<td>" + escapeHtml(est.estimateNumber || "") + "</td>" +
        "<td>" + money(tot.grand) + "</td>" +
        "<td>" + money(est.depositAmount || 0) + "</td>" +
        "<td><span class=\"pay-pill pay-" + escapeHtml((est.paymentStatus || "Unpaid").replace(/\s+/g, "-").toLowerCase()) + "\">" + escapeHtml(est.paymentStatus || "Unpaid") + "</span></td>" +
        "<td>" + money(est.amountPaid || 0) + "</td>" +
        "<td class=\"muted\" style=\"max-width:140px;overflow:hidden;text-overflow:ellipsis\">" + (link ? "<a href=\"" + escapeHtml(link) + "\" target=\"_blank\" rel=\"noopener\">Open</a>" : "—") + "</td>" +
        "<td class=\"card-actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"deposit\">Deposit link</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"invoice\">Invoice link</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"mark-dep\">Mark deposit</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"mark-full\">Mark paid</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"refund\">Refund stub</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
        "</td>";
      tr.querySelector("[data-act=deposit]").addEventListener("click", function () { generatePayLink(est, "deposit"); });
      tr.querySelector("[data-act=invoice]").addEventListener("click", function () { generatePayLink(est, "invoice"); });
      tr.querySelector("[data-act=mark-dep]").addEventListener("click", function () {
        est.paymentStatus = "Deposit paid";
        est.amountPaid = Number(est.depositAmount) || est.amountPaid || 0;
        est.updatedAt = new Date().toISOString();
        save(); renderPayments();
      });
      tr.querySelector("[data-act=mark-full]").addEventListener("click", function () {
        est.paymentStatus = "Paid in full";
        est.amountPaid = tot.grand;
        est.updatedAt = new Date().toISOString();
        save(); renderPayments();
      });
      tr.querySelector("[data-act=refund]").addEventListener("click", function () { stubRefund(est); });
      tr.querySelector("[data-act=edit]").addEventListener("click", function () { openEditor(est.id); });
      body.appendChild(tr);
    });
    var path = $("#payments-integration-path");
    if (path) {
      path.innerHTML =
        "<ol>" +
        "<li>Create a Stripe account and Product/Price (or Payment Link) for deposits &amp; balances.</li>" +
        "<li>Paste <strong>publishable key</strong> above (pk_test / pk_live). Never store secret keys in this browser app.</li>" +
        "<li>Optional: paste a Payment Link base URL — Pro Desk stamps estimate # &amp; amount into notes for Jose.</li>" +
        "<li>Later: add a tiny server (Dockerfile-ready) that creates Checkout Sessions / PaymentIntents with the secret key, then webhooks to mark paid.</li>" +
        "<li>Refunds: use Stripe Dashboard today; Refund stub logs intent locally until API is wired.</li>" +
        "</ol>" +
        "<p class=\"muted\"><strong>Fee note:</strong> " + escapeHtml(state.settings.paymentFeeNote || STRIPE_FEE_NOTE) + "</p>";
    }
  }

  function generatePayLink(est, kind) {
    if (!state.settings) state.settings = defaultSettings();
    var tot = estimateTotals(est);
    var amount = kind === "deposit" ? (Number(est.depositAmount) || 0) : tot.grand;
    if (kind === "deposit" && !amount) {
      amount = Math.round(tot.grand * 0.3 * 100) / 100;
      if (!confirm("No deposit set. Use 30% stub (" + money(amount) + ") for link notes?")) return;
    }
    var base = (state.settings.stripePaymentLinkBase || "").trim();
    var pk = (state.settings.stripePublishableKey || "").trim();
    var memo = "JNH " + (kind === "deposit" ? "DEPOSIT" : "INVOICE") + " · " + (est.estimateNumber || est.id) +
      " · " + (est.customerName || "") + " · " + money(amount) +
      " · mode=" + (state.settings.stripeMode || "test");
    var link;
    if (base) {
      var sep = base.indexOf("?") >= 0 ? "&" : "?";
      link = base + sep + "client_reference_id=" + encodeURIComponent(est.estimateNumber || est.id) +
        "&prefilled_amount_hint=" + encodeURIComponent(String(amount));
    } else {
      // Stub path — no live charge without Stripe Payment Link / Checkout API
      link = "https://dashboard.stripe.com/payment-links" +
        (pk ? "?notice=configure-link-for-" + encodeURIComponent(est.estimateNumber || "est") : "");
      alert(
        "Stripe Payment Link stub\n\n" + memo + "\n\n" +
        (pk ? "Publishable key on file: " + pk.slice(0, 12) + "…\n" : "No publishable key saved yet — add it under Payments settings.\n") +
        "\n" + (state.settings.paymentFeeNote || STRIPE_FEE_NOTE) + "\n\n" +
        "Open Stripe → Payment Links (or Checkout) to create a real link, then paste it on the estimate’s Payment link field.\n\n" +
        "Stub dashboard URL will be saved on this estimate for reference."
      );
    }
    est.paymentLink = link;
    est.paymentLinkKind = kind;
    est.paymentLinkMemo = memo;
    est.updatedAt = new Date().toISOString();
    save();
    renderPayments();
    if (base) {
      try { window.open(link, "_blank", "noopener"); } catch (err) {}
      alert("Pay link saved on estimate.\n\n" + memo + "\n\n" + (state.settings.paymentFeeNote || STRIPE_FEE_NOTE));
    }
  }

  function stubRefund(est) {
    var amt = prompt("Refund stub — amount to record (does not charge Stripe yet):", String(est.amountPaid || 0));
    if (amt == null) return;
    var n = parseFloat(amt);
    if (isNaN(n) || n < 0) { alert("Invalid amount"); return; }
    if (!state.refundStubs) state.refundStubs = [];
    state.refundStubs.push({
      id: uid(),
      estimateId: est.id,
      estimateNumber: est.estimateNumber,
      customerName: est.customerName,
      amount: n,
      createdAt: new Date().toISOString(),
      status: "stub-pending-api",
      note: "Process in Stripe Dashboard or wire Refunds API on server"
    });
    if (n >= (Number(est.amountPaid) || 0)) {
      est.paymentStatus = "Unpaid";
      est.amountPaid = 0;
    } else {
      est.paymentStatus = "Partial";
      est.amountPaid = Math.max(0, (Number(est.amountPaid) || 0) - n);
    }
    est.updatedAt = new Date().toISOString();
    save();
    renderPayments();
    alert("Refund stub recorded locally ($" + n.toFixed(2) + "). Complete the refund in Stripe Dashboard until the OCR/API server handles Refunds.");
  }


  function fillLaborSettingsForm() {
    ensureSettingsShape();
    var rate = $("#settings-standard-labor-rate");
    var hours = $("#settings-default-labor-hours");
    if (rate && document.activeElement !== rate) rate.value = state.settings.standardLaborRate != null ? state.settings.standardLaborRate : 0;
    if (hours && document.activeElement !== hours) hours.value = state.settings.defaultLaborHours != null ? state.settings.defaultLaborHours : "";
    syncLaborPricingUI(window.__draftEstimate || null);
  }

  function saveLaborSettings(e) {
    e.preventDefault();
    ensureSettingsShape();
    var rateEl = $("#settings-standard-labor-rate");
    var hoursEl = $("#settings-default-labor-hours");
    var rate = parseFloat(rateEl && rateEl.value);
    var hoursRaw = hoursEl ? String(hoursEl.value || "").trim() : "";
    var hours = hoursRaw === "" ? 0 : (parseFloat(hoursRaw) || 0);
    if (!isFinite(rate) || rate < 0) {
      var bad = $("#labor-settings-msg");
      if (bad) bad.textContent = "Enter a valid standard labor rate ($/hour).";
      return;
    }
    state.settings.standardLaborRate = rate;
    state.settings.defaultLaborHours = hours >= 0 ? hours : 0;
    save();
    fillLaborSettingsForm();
    var msg = $("#labor-settings-msg");
    if (msg) msg.textContent = "Labor settings saved. New estimates use " + formatLaborRateLabel(rate) + (hours > 0 ? (" · default " + hours + " hrs") : "") + ".";
    syncLaborPricingUI(window.__draftEstimate || null);
  }

  function saveStripeSettings(e) {
    e.preventDefault();
    if (!state.settings) state.settings = defaultSettings();
    state.settings.stripePublishableKey = ($("#stripe-pk") && $("#stripe-pk").value.trim()) || "";
    state.settings.stripePaymentLinkBase = ($("#stripe-link-base") && $("#stripe-link-base").value.trim()) || "";
    var mode = $("#stripe-mode");
    if (mode) state.settings.stripeMode = mode.value || "test";
    var fee = $("#stripe-fee-note");
    if (fee) state.settings.paymentFeeNote = fee.value.trim() || STRIPE_FEE_NOTE;
    var absorb = $("#stripe-absorb-fees");
    if (absorb) state.settings.absorbFees = !!absorb.checked;
    if (/sk_(test|live)_/i.test(state.settings.stripePublishableKey)) {
      alert("That looks like a secret key. Only publishable keys (pk_…) belong in Pro Desk.");
      state.settings.stripePublishableKey = "";
      if ($("#stripe-pk")) $("#stripe-pk").value = "";
    }
    save();
    renderPayments();
    alert("Stripe settings saved. Processor: Stripe only. Publishable key + Payment Link base stored locally (never paste sk_ secret keys).");
  }


    // ---------- employees ----------
  function renderEmployees() {
    var body = $("#employees-body");
    var empty = $("#employees-empty");
    body.innerHTML = "";
    if (!state.employees.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    state.employees.forEach(function (emp) {
      var tr = document.createElement("tr");
      emp.payType = normalizePayType(emp.payType);
      tr.innerHTML =
        "<td><input data-k=\"name\" value=\"" + escapeHtml(emp.name) + "\" /></td>" +
        "<td><input data-k=\"role\" value=\"" + escapeHtml(emp.role || "") + "\" /></td>" +
        "<td style=\"width:155px\"><select data-k=\"payType\"><option value=\"On books\"" + (emp.payType === PAY_TYPES.ON_BOOKS ? " selected" : "") + ">On books (NY payroll)</option><option value=\"Cash\"" + (emp.payType === PAY_TYPES.CASH ? " selected" : "") + ">Cash</option></select></td>" +
        "<td style=\"width:110px\"><input data-k=\"payRate\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + (emp.payRate || 0) + "\" /></td>" +
        "<td style=\"width:70px\"><input data-k=\"active\" type=\"checkbox\" " + (emp.active !== false ? "checked" : "") + " /></td>" +
        "<td><button type=\"button\" class=\"btn small danger\" data-act=\"del\">Delete</button></td>";
      function sync() {
        emp.name = tr.querySelector("[data-k=name]").value.trim();
        emp.role = tr.querySelector("[data-k=role]").value.trim();
        emp.payType = normalizePayType(tr.querySelector("[data-k=payType]").value);
        emp.payRate = parseFloat(tr.querySelector("[data-k=payRate]").value) || 0;
        emp.active = tr.querySelector("[data-k=active]").checked;
        save();
      }
      $$("input, select", tr).forEach(function (inp) {
        inp.addEventListener("change", sync);
        inp.addEventListener("blur", sync);
      });
      tr.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Remove " + emp.name + "?")) return;
        state.employees = state.employees.filter(function (e) { return e.id !== emp.id; });
        save();
        renderEmployees();
      });
      body.appendChild(tr);
    });
  }

  function addEmployee() {
    state.employees.push({
      id: uid(),
      name: "New worker",
      role: "Mason",
      payType: PAY_TYPES.ON_BOOKS,
      payRate: 0,
      active: true
    });
    save();
    renderEmployees();
  }

  // ---------- time log ----------
  function fillTimeFormSelects() {
    var form = $("#time-form");
    var empSel = form.employeeId;
    var estSel = form.estimateId;
    var empVal = empSel.value;
    var estVal = estSel.value;
    empSel.innerHTML = state.employees.filter(function (e) { return e.active !== false; })
      .map(function (e) { return "<option value=\"" + e.id + "\">" + escapeHtml(e.name) + " ($" + (e.payRate || 0) + "/hr)</option>"; })
      .join("") || "<option value=\"\">— Add employees first —</option>";
    estSel.innerHTML = "<option value=\"\">— General / no estimate —</option>" +
      state.estimates.map(function (e) {
        return "<option value=\"" + e.id + "\">" + escapeHtml(e.customerName || e.estimateNumber) + "</option>";
      }).join("");
    if (empVal) empSel.value = empVal;
    if (estVal) estSel.value = estVal;
    if (!form.workDate.value) form.workDate.value = todayISO();
  }

  function renderTimeLog() {
    var week = $("#timelog-week").value || startOfWeek(todayISO());
    $("#timelog-week").value = week;
    var body = $("#timelog-body");
    var empty = $("#timelog-empty");
    var rows = state.timeEntries.filter(function (t) { return inWeek(t.workDate, week); })
      .sort(function (a, b) { return b.workDate.localeCompare(a.workDate); });
    body.innerHTML = "";
    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    rows.forEach(function (entry) {
      var emp = state.employees.find(function (e) { return e.id === entry.employeeId; });
      var est = state.estimates.find(function (e) { return e.id === entry.estimateId; });
      var rate = entry.payRateSnapshot != null ? entry.payRateSnapshot : (emp ? emp.payRate : 0);
      var pay = (Number(entry.hours) || 0) * (Number(rate) || 0);
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(entry.workDate) + "</td>" +
        "<td>" + escapeHtml(emp ? emp.name : "?") + "</td>" +
        "<td>" + escapeHtml(est ? (est.customerName || est.estimateNumber) : "General") + "</td>" +
        "<td>" + entry.hours + "</td>" +
        "<td>" + money(rate) + "</td>" +
        "<td>" + money(pay) + "</td>" +
        "<td>" + escapeHtml(entry.notes || "") + "</td>" +
        "<td>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button> " +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">×</button>" +
        "</td>";
      tr.querySelector("[data-act=edit]").addEventListener("click", function () {
        var form = $("#time-form");
        fillTimeFormSelects();
        form.entryId.value = entry.id;
        form.employeeId.value = entry.employeeId;
        form.workDate.value = entry.workDate;
        form.estimateId.value = entry.estimateId || "";
        form.hours.value = entry.hours;
        form.notes.value = entry.notes || "";
        state.editingTimeId = entry.id;
        $("#btn-cancel-time-edit").hidden = false;
        form.scrollIntoView({ behavior: "smooth" });
      });
      tr.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Delete this time entry?")) return;
        state.timeEntries = state.timeEntries.filter(function (t) { return t.id !== entry.id; });
        save();
        renderTimeLog();
        renderPayroll();
      });
      body.appendChild(tr);
    });
  }

  function saveTimeEntry(ev) {
    ev.preventDefault();
    var form = $("#time-form");
    var empId = form.employeeId.value;
    if (!empId) { alert("Select an employee."); return; }
    var emp = state.employees.find(function (e) { return e.id === empId; });
    var id = form.entryId.value || uid();
    var existing = state.timeEntries.find(function (t) { return t.id === id; });
    var entry = {
      id: id,
      employeeId: empId,
      estimateId: form.estimateId.value || "",
      workDate: form.workDate.value,
      hours: parseFloat(form.hours.value) || 0,
      notes: form.notes.value.trim(),
      payRateSnapshot: existing && existing.payRateSnapshot != null ? existing.payRateSnapshot : (emp ? (emp.payRate || 0) : 0),
      payTypeSnapshot: existing && existing.payTypeSnapshot != null ? normalizePayType(existing.payTypeSnapshot) : (emp ? normalizePayType(emp.payType) : PAY_TYPES.ON_BOOKS)
    };
    var idx = state.timeEntries.findIndex(function (t) { return t.id === id; });
    if (idx >= 0) state.timeEntries[idx] = entry;
    else state.timeEntries.push(entry);
    save();
    form.reset();
    form.entryId.value = "";
    form.workDate.value = todayISO();
    state.editingTimeId = null;
    $("#btn-cancel-time-edit").hidden = true;
    fillTimeFormSelects();
    renderTimeLog();
  }

  // ---------- payroll ----------
  function renderPayroll() {
    var week = $("#payroll-week").value || startOfWeek(todayISO());
    $("#payroll-week").value = week;
    var body = $("#payroll-body");
    var empty = $("#payroll-empty");
    var entries = state.timeEntries.filter(function (t) { return inWeek(t.workDate, week); });
    var byEmp = {};
    entries.forEach(function (t) {
      var emp = state.employees.find(function (e) { return e.id === t.employeeId; });
      var payType = emp ? normalizePayType(emp.payType) : normalizePayType(t.payTypeSnapshot);
      var key = t.employeeId + "::" + payType;
      if (!byEmp[key]) byEmp[key] = { employeeId: t.employeeId, payType: payType, hours: 0, owed: 0, jobs: {}, rate: t.payRateSnapshot != null ? t.payRateSnapshot : (emp ? emp.payRate : 0) };
      var rate = t.payRateSnapshot != null ? t.payRateSnapshot : (emp ? emp.payRate : 0);
      byEmp[key].hours += Number(t.hours) || 0;
      byEmp[key].owed += (Number(t.hours) || 0) * (Number(rate) || 0);
      byEmp[key].rate = rate;
      if (t.estimateId) {
        var est = state.estimates.find(function (e) { return e.id === t.estimateId; });
        byEmp[key].jobs[t.estimateId] = est ? (est.customerName || est.estimateNumber) : t.estimateId;
      } else {
        byEmp[key].jobs["__gen"] = "General";
      }
    });
    body.innerHTML = "";
    var ids = Object.keys(byEmp);
    var totalH = 0, totalO = 0, booksH = 0, booksO = 0, cashH = 0, cashO = 0;
    if (!ids.length) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      ids.forEach(function (key) {
        var row = byEmp[key];
        var emp = state.employees.find(function (e) { return e.id === row.employeeId; });
        totalH += row.hours;
        totalO += row.owed;
        if (row.payType === PAY_TYPES.CASH) { cashH += row.hours; cashO += row.owed; }
        else { booksH += row.hours; booksO += row.owed; }
        var jobs = Object.keys(row.jobs).map(function (k) { return row.jobs[k]; }).join(", ");
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + escapeHtml(emp ? emp.name : "?") + "</td>" +
          "<td>" + escapeHtml(row.payType) + "</td>" +
          "<td>" + row.hours.toFixed(2) + "</td>" +
          "<td>" + money(row.rate) + "</td>" +
          "<td><strong>" + money(row.owed) + "</strong></td>" +
          "<td>" + escapeHtml(jobs) + "</td>";
        body.appendChild(tr);
      });
    }
    $("#payroll-hours").textContent = totalH.toFixed(2);
    $("#payroll-owed").innerHTML = "<strong>" + money(totalO) + "</strong>";
    $("#payroll-on-books").textContent = money(booksO);
    $("#payroll-on-books-hours").textContent = booksH.toFixed(2) + " hours";
    $("#payroll-cash").textContent = money(cashO);
    $("#payroll-cash-hours").textContent = cashH.toFixed(2) + " hours";
  }

  function printPayroll() {
    var week = $("#payroll-week").value || startOfWeek(todayISO());
    var end = endOfWeek(week);
    var rows = $$("#payroll-body tr").map(function (tr) { return tr.innerHTML; }).join("</tr><tr>");
    var html =
      "<div class=\"print-doc payroll\">" +
      "<div class=\"ph\"><div class=\"co\">JNH Masonry Inc.</div>" +
      "<div class=\"contact\">Weekly Payroll Summary</div></div>" +
      "<p><strong>Week:</strong> " + escapeHtml(week) + " → " + escapeHtml(end) + "</p>" +
      "<p><strong>On books (NY payroll):</strong> " + escapeHtml($("#payroll-on-books").textContent) + " (" + escapeHtml($("#payroll-on-books-hours").textContent) + ") &nbsp; <strong>Cash:</strong> " + escapeHtml($("#payroll-cash").textContent) + " (" + escapeHtml($("#payroll-cash-hours").textContent) + ")</p>" +
      "<table class=\"lines\"><thead><tr><th>Employee</th><th>Pay type</th><th>Hours</th><th>Rate</th><th>Owed</th><th>Jobs</th></tr></thead>" +
      "<tbody><tr>" + rows + "</tr></tbody>" +
      "<tfoot><tr><td><strong>Total</strong></td><td></td><td>" + $("#payroll-hours").textContent +
      "</td><td></td><td>" + $("#payroll-owed").textContent + "</td><td></td></tr></tfoot></table>" +
      "<p style=\"margin-top:16px;font-size:9pt;color:#555\">Generated from Pro Desk · " + escapeHtml(todayISO()) + "</p></div>";
    var root = $("#print-root");
    root.innerHTML = html;
    window.print();
  }

  // ---------- Rolodex: capability-first contacts ----------
  function normalizedCapabilities(value) {
    var list = Array.isArray(value) ? value : String(value || "").split(",");
    return list.map(function (x) { return String(x).trim().replace(/\s+/g, " "); }).filter(Boolean).filter(function (x, i, a) {
      return a.map(function (v) { return v.toLowerCase(); }).indexOf(x.toLowerCase()) === i;
    });
  }

  function renderRolodex() {
    var root = $("#rolodex-groups");
    var empty = $("#rolodex-empty");
    if (!root || !empty) return;
    var q = String(( $("#rolodex-search") || {} ).value || "").trim().toLowerCase();
    var groups = {};
    (state.rolodexContacts || []).forEach(function (contact) {
      var caps = normalizedCapabilities(contact.capabilities);
      var haystack = [contact.name, contact.company, contact.area, contact.phone, contact.email, contact.notes].concat(caps).join(" ").toLowerCase();
      if (q && haystack.indexOf(q) < 0) return;
      if (!caps.length) caps = ["Uncategorized"];
      caps.forEach(function (cap) {
        var key = cap.toLowerCase();
        if (!groups[key]) groups[key] = { label: cap, contacts: [] };
        groups[key].contacts.push(contact);
      });
    });
    var keys = Object.keys(groups).sort(function (a, b) { return groups[a].label.localeCompare(groups[b].label); });
    if (!keys.length) {
      root.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    root.innerHTML = keys.map(function (key) {
      var group = groups[key];
      group.contacts.sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });
      return '<section class="rolodex-group"><div class="rolodex-group-head"><h3>' + escapeHtml(group.label) + '</h3><span>' + group.contacts.length + ' contact' + (group.contacts.length === 1 ? '' : 's') + '</span></div><div class="rolodex-contact-grid">' +
        group.contacts.map(function (c) {
          var phoneHref = String(c.phone || "").replace(/[^+\d]/g, "");
          var email = String(c.email || "");
          return '<article class="rolodex-contact"><div class="rolodex-contact-main"><h4>' + escapeHtml(c.name || "Unnamed") + '</h4>' +
            (c.company ? '<div class="meta">' + escapeHtml(c.company) + '</div>' : '') +
            (c.area ? '<div class="meta">Area: ' + escapeHtml(c.area) + '</div>' : '') +
            (c.notes ? '<p>' + escapeHtml(c.notes) + '</p>' : '') +
            '<div class="rolodex-contact-links">' + (c.phone ? '<a href="tel:' + escapeHtml(phoneHref) + '">' + escapeHtml(c.phone) + '</a>' : '') + (email ? '<a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a>' : '') + '</div></div>' +
            '<div class="actions"><button type="button" class="btn small" data-rolodex-act="edit" data-id="' + escapeHtml(c.id) + '">Edit</button><button type="button" class="btn small danger" data-rolodex-act="del" data-id="' + escapeHtml(c.id) + '">×</button></div></article>';
        }).join("") + '</div></section>';
    }).join("");
    $$("[data-rolodex-act=edit]").forEach(function (button) { button.addEventListener("click", function () { editRolodexContact(button.getAttribute("data-id")); }); });
    $$("[data-rolodex-act=del]").forEach(function (button) { button.addEventListener("click", function () { deleteRolodexContact(button.getAttribute("data-id")); }); });
  }

  function saveRolodexContact(ev) {
    ev.preventDefault();
    var form = $("#rolodex-form");
    var caps = normalizedCapabilities(form.capabilities.value);
    if (!form.name.value.trim() || !caps.length) { alert("Name and at least one capability are required."); return; }
    var id = form.contactId.value || uid();
    var prev = (state.rolodexContacts || []).find(function (x) { return x.id === id; }) || {};
    var contact = {
      id: id,
      name: form.name.value.trim(),
      capabilities: caps,
      company: form.company.value.trim(),
      area: form.area.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      notes: form.notes.value.trim(),
      googleContactResourceName: prev.googleContactResourceName || "",
      googleEtag: prev.googleEtag || "",
      syncedAt: prev.syncedAt || ""
    };
    var idx = (state.rolodexContacts || []).findIndex(function (x) { return x.id === id; });
    if (idx >= 0) state.rolodexContacts[idx] = contact; else state.rolodexContacts.push(contact);
    save();
    form.reset(); form.contactId.value = "";
    $("#btn-cancel-rolodex-edit").hidden = true;
    renderRolodex();
  }

  function editRolodexContact(id) {
    var c = (state.rolodexContacts || []).find(function (x) { return x.id === id; });
    if (!c) return;
    var f = $("#rolodex-form");
    f.contactId.value = c.id; f.name.value = c.name || ""; f.capabilities.value = normalizedCapabilities(c.capabilities).join(", "); f.company.value = c.company || ""; f.area.value = c.area || ""; f.phone.value = c.phone || ""; f.email.value = c.email || ""; f.notes.value = c.notes || "";
    $("#btn-cancel-rolodex-edit").hidden = false;
    f.scrollIntoView({ behavior: "smooth" });
  }

  function deleteRolodexContact(id) {
    var c = (state.rolodexContacts || []).find(function (x) { return x.id === id; });
    if (!c || !confirm("Delete " + (c.name || "this contact") + " from the Rolodex?")) return;
    state.rolodexContacts = state.rolodexContacts.filter(function (x) { return x.id !== id; });
    save(); renderRolodex();
  }


  function rolodexAdminToken() {
    var el = $("#rolodex-admin-token");
    var v = el && el.value ? el.value.trim() : "";
    if (!v) {
      var card = $("#rolodex-admin-token-card");
      if (card) card.classList.remove("hidden");
      v = (window.prompt("Admin token (same as Worker ADMIN_TOKEN):") || "").trim();
      if (el && v) el.value = v;
    }
    return v;
  }

  function setRolodexSyncStatus(msg) {
    var el = $("#rolodex-sync-status");
    if (el) el.textContent = msg;
  }

  function mergeRolodexFromGoogle(remoteList) {
    remoteList = remoteList || [];
    var byGoogle = {};
    var byEmail = {};
    var byPhone = {};
    (state.rolodexContacts || []).forEach(function (c) {
      if (c.googleContactResourceName) byGoogle[c.googleContactResourceName] = c;
      if (c.email) byEmail[String(c.email).toLowerCase()] = c;
      var ph = String(c.phone || "").replace(/\D/g, "");
      if (ph.length >= 7) byPhone[ph] = c;
    });
    var merged = (state.rolodexContacts || []).slice();
    var added = 0, updated = 0;
    remoteList.forEach(function (r) {
      var match = (r.resourceName && byGoogle[r.resourceName]) ||
        (r.email && byEmail[String(r.email).toLowerCase()]) ||
        (r.phone && byPhone[String(r.phone).replace(/\D/g, "")]);
      if (match) {
        match.name = r.name || match.name;
        match.phone = r.phone || match.phone;
        match.email = r.email || match.email;
        match.company = r.company || match.company;
        match.notes = r.notes || match.notes;
        if (r.capabilities && r.capabilities.length) match.capabilities = r.capabilities;
        match.googleContactResourceName = r.resourceName || match.googleContactResourceName;
        match.googleEtag = r.etag || match.googleEtag;
        match.syncedAt = new Date().toISOString();
        updated++;
      } else {
        var caps = r.capabilities && r.capabilities.length ? r.capabilities : ["Gmail"];
        merged.push({
          id: uid(),
          name: r.name || "Unnamed",
          capabilities: caps,
          company: r.company || "",
          area: r.area || "",
          phone: r.phone || "",
          email: r.email || "",
          notes: r.notes || "",
          googleContactResourceName: r.resourceName || "",
          googleEtag: r.etag || "",
          syncedAt: new Date().toISOString()
        });
        added++;
      }
    });
    state.rolodexContacts = merged;
    save();
    renderRolodex();
    return { added: added, updated: updated, total: merged.length };
  }

  async function rolodexPullFromGmail() {
    if (!window.JNHBookingAPI || !window.JNHBookingAPI.apiEnabled()) {
      setRolodexSyncStatus("Contacts API not live yet — set booking-config.js mode to \"api\" after Worker + OAuth (People API).");
      alert("Gmail Contacts sync needs the Worker deployed with People API scopes. See BOOKING-SYNC.md.");
      return;
    }
    var tok = rolodexAdminToken();
    if (!tok) return;
    setRolodexSyncStatus("Pulling from Gmail Contacts…");
    try {
      var data = await window.JNHBookingAPI.contactsList(tok);
      var stats = mergeRolodexFromGoogle((data && data.contacts) || []);
      setRolodexSyncStatus("Pull done · added " + stats.added + ", updated " + stats.updated + " · " + stats.total + " in Rolodex. " + new Date().toLocaleString());
    } catch (err) {
      setRolodexSyncStatus("Pull failed: " + (err.message || err));
      alert("Pull failed: " + (err.message || err));
    }
  }

  async function rolodexPushToGmail() {
    if (!window.JNHBookingAPI || !window.JNHBookingAPI.apiEnabled()) {
      setRolodexSyncStatus("Contacts API not live yet — see BOOKING-SYNC.md.");
      alert("Gmail Contacts sync needs the Worker deployed. See BOOKING-SYNC.md.");
      return;
    }
    var tok = rolodexAdminToken();
    if (!tok) return;
    setRolodexSyncStatus("Pushing Rolodex → Gmail Contacts…");
    try {
      var payload = (state.rolodexContacts || []).map(function (c) {
        return {
          id: c.id,
          resourceName: c.googleContactResourceName || "",
          etag: c.googleEtag || "",
          name: c.name,
          phone: c.phone,
          email: c.email,
          company: c.company,
          area: c.area,
          notes: c.notes,
          capabilities: c.capabilities || []
        };
      });
      var data = await window.JNHBookingAPI.contactsPush(tok, { contacts: payload });
      var results = (data && data.results) || [];
      results.forEach(function (r) {
        var local = (state.rolodexContacts || []).find(function (c) { return c.id === r.id; });
        if (local && r.resourceName) {
          local.googleContactResourceName = r.resourceName;
          local.googleEtag = r.etag || local.googleEtag;
          local.syncedAt = new Date().toISOString();
        }
      });
      save();
      renderRolodex();
      setRolodexSyncStatus("Push done · " + results.length + " contact(s) upserted to Gmail. " + new Date().toLocaleString());
    } catch (err) {
      setRolodexSyncStatus("Push failed: " + (err.message || err));
      alert("Push failed: " + (err.message || err));
    }
  }

  async function rolodexSyncBothWays() {
    await rolodexPullFromGmail();
    await rolodexPushToGmail();
  }

  // ---------- weather planning (NOAA / NWS + CPC) ----------
  var DEFAULT_WEATHER_LOCATION = { name: "Suffolk County, NY", lat: 40.7891, lon: -73.1350 };
  var NWS_API = "https://api.weather.gov";
  var CPC_API = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/";

  function weatherLocation() {
    ensureSettingsShape();
    var lat = Number(state.settings.weatherLatitude);
    var lon = Number(state.settings.weatherLongitude);
    return {
      name: String(state.settings.weatherLocationName || DEFAULT_WEATHER_LOCATION.name),
      lat: isFinite(lat) && lat >= -90 && lat <= 90 ? lat : DEFAULT_WEATHER_LOCATION.lat,
      lon: isFinite(lon) && lon >= -180 && lon <= 180 ? lon : DEFAULT_WEATHER_LOCATION.lon
    };
  }

  function weatherJson(url) {
    return fetch(url, { headers: { "Accept": "application/geo+json, application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("NOAA request failed (" + res.status + ")");
      return res.json();
    });
  }

  function weatherDateLabel(date) {
    return new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function weatherNumber(value, fallback) {
    return value == null || !isFinite(Number(value)) ? fallback : Number(value);
  }

  function weatherCategory(code) {
    return code === "A" ? "Above normal" : code === "B" ? "Below normal" : code === "EC" ? "Equal chances" : (code || "Unavailable");
  }

  function weatherPlanningClass(precip, humidity) {
    if (precip >= 60 || humidity >= 85) return "hold";
    if (precip >= 35 || humidity >= 75) return "caution";
    return "good";
  }

  function weatherPlanningText(precip, humidity) {
    if (precip >= 60 || humidity >= 85) return "Hold / protect: wet conditions are likely or humidity is high. Confirm cure, cover, drainage, and manufacturer limits before starting.";
    if (precip >= 35 || humidity >= 75) return "Caution: keep a rain plan and verify substrate/product requirements. Prioritize protected prep or flexible tasks.";
    return "Better field window: precipitation and humidity are comparatively favorable, but monitor the hourly forecast and actual site conditions.";
  }

  function renderWeather() {
    var loc = weatherLocation();
    var form = $("#weather-settings-form");
    if (form) {
      if (document.activeElement !== form.locationName) form.locationName.value = loc.name;
      if (document.activeElement !== form.latitude) form.latitude.value = loc.lat;
      if (document.activeElement !== form.longitude) form.longitude.value = loc.lon;
    }
    var status = $("#weather-status");
    if (status && !state.weatherData) status.textContent = "Ready to load NOAA data for " + loc.name + ".";
    if (!state.weatherData) {
      $("#weather-5day").innerHTML = '<p class="empty-state">Click <strong>Refresh NOAA data</strong> to load the five-day field window.</p>';
      $("#weather-month").innerHTML = '<p class="empty-state">The CPC monthly outlook will appear here after refresh.</p>';
      $("#weather-guidance").innerHTML = '<p class="muted">No forecast loaded yet. Set the job-site location, then refresh.</p>';
      return;
    }
    var data = state.weatherData;
    var days = data.days || [];
    $("#weather-5day").innerHTML = days.length ? days.map(function (d) {
      var p = Math.round(weatherNumber(d.precip, 0));
      var h = Math.round(weatherNumber(d.humidity, 0));
      var cls = weatherPlanningClass(p, h);
      return '<article class="weather-day ' + cls + '">' +
        '<div class="weather-day-head"><strong>' + escapeHtml(weatherDateLabel(d.date)) + '</strong><span class="weather-window ' + cls + '">' + (cls === "good" ? "Better window" : cls === "caution" ? "Caution" : "Protect / hold") + '</span></div>' +
        '<div class="weather-primary"><div><span>Rain chance</span><strong>' + p + '%</strong></div><div><span>Humidity</span><strong>' + h + '%</strong></div></div>' +
        '<div class="weather-detail"><span>' + escapeHtml(d.low == null ? "—" : Math.round(d.low) + "°" ) + ' low / ' + escapeHtml(d.high == null ? "—" : Math.round(d.high) + "°" ) + ' high</span><span>' + escapeHtml(d.wind || "Wind —") + '</span></div>' +
        '<p>' + escapeHtml(d.forecast || "Forecast unavailable") + '</p>' +
      '</article>';
    }).join("") : '<p class="empty-state">NWS did not return a five-day forecast.</p>';

    var monthly = data.monthly || {};
    var temp = monthly.temp;
    var precip = monthly.precip;
    $("#weather-month").innerHTML =
      '<div class="month-location"><strong>' + escapeHtml(data.locationName || loc.name) + '</strong><span class="muted">Next calendar month · CPC point lookup</span></div>' +
      '<div class="month-outlook-grid">' +
        '<div class="month-outlook"><span class="muted">Temperature</span><strong>' + escapeHtml(temp ? weatherCategory(temp.cat) : "Unavailable") + '</strong><span>' + (temp ? escapeHtml(Math.round(weatherNumber(temp.prob, 0)) + "% probability") : "Try refresh") + '</span></div>' +
        '<div class="month-outlook"><span class="muted">Precipitation</span><strong>' + escapeHtml(precip ? weatherCategory(precip.cat) : "Unavailable") + '</strong><span>' + (precip ? escapeHtml(Math.round(weatherNumber(precip.prob, 0)) + "% probability") : "Try refresh") + '</span></div>' +
      '</div>' +
      '<p class="muted">' + escapeHtml((temp && temp.season) || (precip && precip.season) || "CPC outlook") + '. Equal chances means no dominant category; it does not mean no rain.</p>';

    var alerts = data.alerts || [];
    var alertsCard = $("#weather-alerts-card");
    if (alerts.length) {
      alertsCard.classList.remove("hidden");
      $("#weather-alerts").innerHTML = alerts.map(function (a) {
        return '<div class="weather-alert"><strong>' + escapeHtml(a.event || "NWS alert") + '</strong><span class="weather-alert-severity">' + escapeHtml(a.severity || "") + '</span><p>' + escapeHtml(a.headline || a.description || "Check weather.gov for details.") + '</p></div>';
      }).join("");
    } else {
      alertsCard.classList.add("hidden");
      $("#weather-alerts").innerHTML = "";
    }

    var best = days.slice().sort(function (a, b) {
      return (weatherNumber(a.precip, 100) + weatherNumber(a.humidity, 100)) - (weatherNumber(b.precip, 100) + weatherNumber(b.humidity, 100));
    })[0];
    var guidance = $("#weather-guidance");
    if (!best) {
      guidance.innerHTML = '<p class="muted">No planning guidance available yet.</p>';
    } else {
      var bp = Math.round(weatherNumber(best.precip, 0));
      var bh = Math.round(weatherNumber(best.humidity, 0));
      var bc = weatherPlanningClass(bp, bh);
      guidance.innerHTML = '<div class="weather-recommendation ' + bc + '"><div><span class="muted">Best relative window in the next five days</span><strong>' + escapeHtml(weatherDateLabel(best.date)) + '</strong></div><div class="weather-rec-metrics"><span>Rain ' + bp + '%</span><span>Humidity ' + bh + '%</span></div><p>' + escapeHtml(weatherPlanningText(bp, bh)) + '</p></div>' +
        '<div class="weather-rules"><span><strong>Better:</strong> under 35% rain and under 75% humidity</span><span><strong>Caution:</strong> 35–59% rain or 75–84% humidity</span><span><strong>Protect / hold:</strong> 60%+ rain or 85%+ humidity</span></div>';
    }
  }

  function saveWeatherSettings(ev) {
    ev.preventDefault();
    var form = $("#weather-settings-form");
    var lat = Number(form.latitude.value), lon = Number(form.longitude.value);
    if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lon) || lon < -180 || lon > 180) {
      alert("Enter a valid latitude and longitude."); return;
    }
    state.settings.weatherLocationName = form.locationName.value.trim() || DEFAULT_WEATHER_LOCATION.name;
    state.settings.weatherLatitude = lat;
    state.settings.weatherLongitude = lon;
    state.weatherData = null;
    save();
    renderWeather();
    loadWeatherPlan();
  }

  function cpcPointUrl(service, lat, lon) {
    var query = "f=json&geometry=" + encodeURIComponent(lon + "," + lat) +
      "&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects" +
      "&outFields=fcst_date,valid_seas,prob,cat&returnGeometry=false&orderByFields=fcst_date%20DESC";
    return CPC_API + service + "/MapServer/0/query?" + query;
  }

  function loadCpcPoint(service, lat, lon) {
    return weatherJson(cpcPointUrl(service, lat, lon)).then(function (json) {
      var feature = json && json.features && json.features[0];
      if (!feature) return null;
      var a = feature.attributes || {};
      return { season: a.valid_seas || "Next month", prob: a.prob, cat: a.cat };
    }).catch(function () { return null; });
  }

  function loadWeatherPlan() {
    var loc = weatherLocation();
    var status = $("#weather-status");
    if (status) status.textContent = "Loading NOAA / NWS data for " + loc.name + "…";
    var pointUrl = NWS_API + "/points/" + loc.lat.toFixed(4) + "," + loc.lon.toFixed(4);
    weatherJson(pointUrl).then(function (point) {
      var props = point.properties || {};
      return Promise.all([
        weatherJson(props.forecastHourly),
        props.forecast ? weatherJson(props.forecast) : Promise.resolve({ properties: { periods: [] } }),
        weatherJson(NWS_API + "/alerts/active?point=" + loc.lat.toFixed(4) + "," + loc.lon.toFixed(4)).catch(function () { return { features: [] }; }),
        loadCpcPoint("cpc_mthly_temp_outlk", loc.lat, loc.lon),
        loadCpcPoint("cpc_mthly_precip_outlk", loc.lat, loc.lon)
      ]);
    }).then(function (results) {
      var hourly = results[0] && results[0].properties && results[0].properties.periods || [];
      var daily = {};
      hourly.forEach(function (period) {
        var date = String(period.startTime || "").slice(0, 10);
        if (!date) return;
        if (!daily[date]) daily[date] = { date: date, temps: [], precip: [], humidity: [], winds: [], forecasts: [] };
        var d = daily[date];
        if (period.temperature != null) d.temps.push(Number(period.temperature));
        if (period.probabilityOfPrecipitation && period.probabilityOfPrecipitation.value != null) d.precip.push(Number(period.probabilityOfPrecipitation.value));
        if (period.relativeHumidity && period.relativeHumidity.value != null) d.humidity.push(Number(period.relativeHumidity.value));
        if (period.windSpeed) d.winds.push(period.windSpeed);
        if (period.shortForecast) d.forecasts.push(period.shortForecast);
      });
      var days = Object.keys(daily).sort().slice(0, 5).map(function (date) {
        var d = daily[date];
        var tally = {};
        d.forecasts.forEach(function (f) { tally[f] = (tally[f] || 0) + 1; });
        var common = d.forecasts.sort(function (a, b) { return (tally[b] || 0) - (tally[a] || 0); })[0] || "";
        return { date: date, low: d.temps.length ? Math.min.apply(null, d.temps) : null, high: d.temps.length ? Math.max.apply(null, d.temps) : null,
          precip: d.precip.length ? Math.max.apply(null, d.precip) : 0, humidity: d.humidity.length ? Math.round(d.humidity.reduce(function (a, b) { return a + b; }, 0) / d.humidity.length) : null,
          wind: d.winds[0] || "", forecast: common };
      });
      var alertFeatures = results[2] && results[2].features || [];
      state.weatherData = {
        locationName: loc.name, days: days,
        alerts: alertFeatures.slice(0, 6).map(function (f) { return f.properties || {}; }),
        monthly: { temp: results[3], precip: results[4] },
        fetchedAt: new Date().toISOString()
      };
      renderWeather();
      if (status) status.textContent = "Updated " + new Date().toLocaleString() + " · NOAA/NWS source";
    }).catch(function (err) {
      if (status) status.textContent = "Could not load NOAA data: " + (err && err.message ? err.message : "network error") + ". Check the location and try again.";
      if (!state.weatherData) renderWeather();
    });
  }

  // ---------- vendors ----------
  function renderVendors() {
    var body = $("#vendors-body");
    var empty = $("#vendors-empty");
    body.innerHTML = "";
    if (!state.vendors.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    state.vendors.forEach(function (v) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(v.name) + "</td>" +
        "<td>" + escapeHtml(v.category || "") + "</td>" +
        "<td>" + escapeHtml(v.phone || "") + "</td>" +
        "<td>" + escapeHtml(v.contact || "") + "</td>" +
        "<td>" + escapeHtml(v.notes || "") + "</td>" +
        "<td>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button> " +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">×</button>" +
        "</td>";
      tr.querySelector("[data-act=edit]").addEventListener("click", function () {
        var form = $("#vendor-form");
        form.vendorId.value = v.id;
        form.name.value = v.name;
        form.category.value = v.category || "Other";
        form.phone.value = v.phone || "";
        form.contact.value = v.contact || "";
        form.notes.value = v.notes || "";
        state.editingVendorId = v.id;
        $("#btn-cancel-vendor-edit").hidden = false;
        form.scrollIntoView({ behavior: "smooth" });
      });
      tr.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Delete vendor " + v.name + "?")) return;
        state.vendors = state.vendors.filter(function (x) { return x.id !== v.id; });
        save();
        renderVendors();
      });
      body.appendChild(tr);
    });
  }

  function saveVendor(ev) {
    ev.preventDefault();
    var form = $("#vendor-form");
    var id = form.vendorId.value || uid();
    var v = {
      id: id,
      name: form.name.value.trim(),
      category: form.category.value,
      phone: form.phone.value.trim(),
      contact: form.contact.value.trim(),
      notes: form.notes.value.trim()
    };
    if (!v.name) { alert("Vendor name required."); return; }
    var idx = state.vendors.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) state.vendors[idx] = v;
    else state.vendors.push(v);
    save();
    form.reset();
    form.vendorId.value = "";
    state.editingVendorId = null;
    $("#btn-cancel-vendor-edit").hidden = true;
    renderVendors();
  }

  // ---------- receipts + OCR stub ----------
  /**
   * OCR integration hook.
   * Replace `runOcrStub` with a real pipeline later, e.g.:
   *   async function runOcr(fileOrDataUrl) {
   *     const res = await fetch('/api/ocr/receipt', { method:'POST', body: formData });
   *     return await res.json(); // { vendor, amount, date, category, confidence, rawText }
   *   }
   * Design contract: returns { vendorName, amount, date, category, confidence, rawText, engine }
   */
  function runOcrStub(fileName, mime, dataUrl) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var hintVendor = "";
        var lower = (fileName || "").toLowerCase();
        if (lower.indexOf("home") >= 0) hintVendor = "Home Depot";
        else if (lower.indexOf("lowes") >= 0 || lower.indexOf("lowe") >= 0) hintVendor = "Lowe's";
        else if (lower.indexOf("cambridge") >= 0) hintVendor = "Cambridge Pavers";
        resolve({
          vendorName: hintVendor,
          amount: null,
          date: todayISO(),
          category: "Materials — Other",
          confidence: 0,
          rawText: "",
          engine: "stub-v1",
          note: "OCR not connected yet. Confirm/edit fields manually. Wire API in runOcrStub / runOcr."
        });
      }, 400);
    });
  }

  function fillReceiptSelects() {
    var form = $("#receipt-form");
    var vSel = form.vendorId;
    var eSel = form.estimateId;
    var fSel = $("#receipts-job-filter");
    var vVal = vSel.value, eVal = eSel.value, fVal = fSel.value;
    vSel.innerHTML = "<option value=\"\">— Select or add later —</option>" +
      state.vendors.map(function (v) {
        return "<option value=\"" + v.id + "\">" + escapeHtml(v.name) + "</option>";
      }).join("");
    var estOpts = "<option value=\"\">— No job —</option>" +
      state.estimates.map(function (e) {
        return "<option value=\"" + e.id + "\">" + escapeHtml(e.customerName || e.estimateNumber) + "</option>";
      }).join("");
    eSel.innerHTML = estOpts;
    fSel.innerHTML = "<option value=\"\">All jobs</option>" +
      state.estimates.map(function (e) {
        return "<option value=\"" + e.id + "\">" + escapeHtml(e.customerName || e.estimateNumber) + "</option>";
      }).join("");
    if (vVal) vSel.value = vVal;
    if (eVal) eSel.value = eVal;
    if (fVal) fSel.value = fVal;
    if (!form.receiptDate.value) form.receiptDate.value = todayISO();
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showReceiptPreview(dataUrl, mime, name) {
    var prev = $("#receipt-preview");
    prev.classList.remove("hidden");
    if (mime && mime.indexOf("pdf") >= 0) {
      prev.innerHTML = "<embed src=\"" + dataUrl + "\" type=\"application/pdf\" width=\"100%\" height=\"200\" />";
    } else {
      prev.innerHTML = "<img alt=\"Receipt preview\" src=\"" + dataUrl + "\" />";
    }
    state.pendingReceiptDataUrl = dataUrl;
    state.pendingReceiptName = name;
    state.pendingReceiptMime = mime;
    $("#btn-run-ocr").disabled = false;
    $("#ocr-status").textContent = "File ready: " + name + " — click Run OCR (stub) or fill fields manually.";
  }

  async function onReceiptFile(file) {
    if (!file) return;
    var dataUrl = await readFileAsDataUrl(file);
    showReceiptPreview(dataUrl, file.type, file.name);
  }

  async function onRunOcr() {
    if (!state.pendingReceiptDataUrl) {
      alert("Choose a receipt file first.");
      return;
    }
    $("#ocr-status").textContent = "Running OCR stub…";
    $("#btn-run-ocr").disabled = true;
    try {
      var result = await runOcrStub(state.pendingReceiptName, state.pendingReceiptMime, state.pendingReceiptDataUrl);
      var form = $("#receipt-form");
      if (result.vendorName) {
        form.vendorNameHint.value = result.vendorName;
        var match = state.vendors.find(function (v) {
          return v.name.toLowerCase() === result.vendorName.toLowerCase();
        });
        if (match) form.vendorId.value = match.id;
      }
      if (result.amount != null) form.amount.value = result.amount;
      if (result.date) form.receiptDate.value = result.date;
      if (result.category) form.category.value = result.category;
      $("#ocr-status").textContent = (result.note || "OCR complete.") + " Confidence: " + (result.confidence || 0) + " (" + result.engine + ")";
      form.__lastOcr = result;
    } catch (e) {
      $("#ocr-status").textContent = "OCR failed: " + e.message;
    }
    $("#btn-run-ocr").disabled = false;
  }

  function saveReceipt(ev) {
    ev.preventDefault();
    var form = $("#receipt-form");
    var id = form.receiptId.value || uid();
    var existing = state.receipts.find(function (r) { return r.id === id; });
    var vendorId = form.vendorId.value;
    var vendorHint = form.vendorNameHint.value.trim();
    // auto-create vendor from hint if needed
    if (!vendorId && vendorHint) {
      var found = state.vendors.find(function (v) { return v.name.toLowerCase() === vendorHint.toLowerCase(); });
      if (found) vendorId = found.id;
      else {
        var nv = { id: uid(), name: vendorHint, category: form.category.value, phone: "", contact: "", notes: "Created from receipt" };
        state.vendors.push(nv);
        vendorId = nv.id;
      }
    }
    var receipt = {
      id: id,
      vendorId: vendorId || "",
      vendorNameHint: vendorHint,
      amount: parseFloat(form.amount.value) || 0,
      receiptDate: form.receiptDate.value || todayISO(),
      category: form.category.value,
      estimateId: form.estimateId.value || "",
      notes: form.notes.value.trim(),
      fileName: state.pendingReceiptName || (existing && existing.fileName) || "",
      fileMime: state.pendingReceiptMime || (existing && existing.fileMime) || "",
      fileDataUrl: state.pendingReceiptDataUrl || (existing && existing.fileDataUrl) || "",
      ocrStatus: form.__lastOcr ? "stub-filled" : (existing && existing.ocrStatus) || "manual",
      ocrRaw: form.__lastOcr || (existing && existing.ocrRaw) || null,
      createdAt: (existing && existing.createdAt) || new Date().toISOString()
    };
    var idx = state.receipts.findIndex(function (r) { return r.id === id; });
    if (idx >= 0) state.receipts[idx] = receipt;
    else state.receipts.push(receipt);
    save();
    form.reset();
    form.receiptId.value = "";
    form.__lastOcr = null;
    state.pendingReceiptDataUrl = null;
    state.pendingReceiptName = null;
    state.pendingReceiptMime = null;
    $("#receipt-preview").classList.add("hidden");
    $("#receipt-preview").innerHTML = "";
    $("#btn-run-ocr").disabled = true;
    $("#btn-cancel-receipt-edit").hidden = true;
    $("#ocr-status").textContent = "Saved. Ready for next receipt.";
    fillReceiptSelects();
    renderReceipts();
    renderVendors();
  }

  function renderReceipts() {
    var list = $("#receipts-list");
    var empty = $("#receipts-empty");
    var filter = $("#receipts-job-filter").value;
    var rows = state.receipts.slice().sort(function (a, b) {
      return (b.receiptDate || "").localeCompare(a.receiptDate || "");
    });
    if (filter) rows = rows.filter(function (r) { return r.estimateId === filter; });
    list.innerHTML = "";
    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    rows.forEach(function (r) {
      var vendor = state.vendors.find(function (v) { return v.id === r.vendorId; });
      var est = state.estimates.find(function (e) { return e.id === r.estimateId; });
      var item = document.createElement("div");
      item.className = "receipt-item";
      var thumb;
      if (r.fileDataUrl && r.fileMime && r.fileMime.indexOf("image") >= 0) {
        thumb = "<img class=\"thumb\" src=\"" + r.fileDataUrl + "\" alt=\"\" />";
      } else if (r.fileDataUrl) {
        thumb = "<div class=\"thumb placeholder\">PDF / file</div>";
      } else {
        thumb = "<div class=\"thumb placeholder\">No file</div>";
      }
      item.innerHTML =
        thumb +
        "<div>" +
          "<h4>" + escapeHtml((vendor && vendor.name) || r.vendorNameHint || "Unknown vendor") + "</h4>" +
          "<div class=\"meta\">" + money(r.amount) + " · " + escapeHtml(r.receiptDate) + " · " + escapeHtml(r.category) + "</div>" +
          "<div class=\"meta\">Job: " + escapeHtml(est ? (est.customerName || est.estimateNumber) : "—") +
            (r.notes ? " · " + escapeHtml(r.notes) : "") +
            " · OCR: " + escapeHtml(r.ocrStatus || "—") + "</div>" +
        "</div>" +
        "<div class=\"actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"edit\">Edit</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"del\">Delete</button>" +
        "</div>";
      item.querySelector("[data-act=edit]").addEventListener("click", function () {
        fillReceiptSelects();
        var form = $("#receipt-form");
        form.receiptId.value = r.id;
        form.vendorId.value = r.vendorId || "";
        form.vendorNameHint.value = r.vendorNameHint || "";
        form.amount.value = r.amount || "";
        form.receiptDate.value = r.receiptDate || "";
        form.category.value = r.category || "Other";
        form.estimateId.value = r.estimateId || "";
        form.notes.value = r.notes || "";
        if (r.fileDataUrl) showReceiptPreview(r.fileDataUrl, r.fileMime, r.fileName);
        $("#btn-cancel-receipt-edit").hidden = false;
        form.scrollIntoView({ behavior: "smooth" });
      });
      item.querySelector("[data-act=del]").addEventListener("click", function () {
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(function (x) { return x.id !== r.id; });
        save();
        renderReceipts();
      });
      list.appendChild(item);
    });
  }

  // ---------- import / export ----------
  function exportCurrentEstimate() {
    var est = collectEstimateFromForm();
    downloadText(
      (est.estimateNumber || "estimate") + ".json",
      JSON.stringify(est, null, 2)
    );
  }

  function importJsonFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data.estimates || data.employees) {
          // full backup — restore shared project/job model fields
          if (data.estimates) state.estimates = data.estimates;
          if (data.employees) state.employees = data.employees.map(function (emp) {
            emp.payType = normalizePayType(emp.payType);
            return emp;
          });
          if (data.timeEntries) state.timeEntries = data.timeEntries;
          if (data.vendors) state.vendors = data.vendors;
          if (data.rolodexContacts) state.rolodexContacts = data.rolodexContacts;
          if (data.receipts) state.receipts = data.receipts;
          if (data.priceBook) state.priceBook = data.priceBook;
          if (data.settings) state.settings = data.settings;
          if (data.refundStubs) state.refundStubs = data.refundStubs;
          if (data.insuranceDocs) state.insuranceDocs = data.insuranceDocs;
          if (data.fleetAssets) state.fleetAssets = data.fleetAssets;
          if (data.fleetMaintLogs) state.fleetMaintLogs = data.fleetMaintLogs;
          if (data.marketingClients) state.marketingClients = data.marketingClients;
          if (data.marketingBlasts) state.marketingBlasts = data.marketingBlasts;
          if (data.clientFlows) state.clientFlows = data.clientFlows;
          if (data.appointments && window.JNHBooking) {
            window.JNHBooking.saveAppointments(data.appointments);
          }
          if (data.availability && window.JNHBooking) {
            window.JNHBooking.setAvailability(data.availability);
          }
          syncAppointmentsFromStore();
          (state.estimates || []).forEach(function (e) { ensureFlowForEstimate(e); });
          save();
          alert("Imported Pro Desk backup.");
          showView("estimates");
        } else if (data.customerName || data.lines) {
          data.id = data.id || uid();
          data.createdAt = data.createdAt || new Date().toISOString();
          data.updatedAt = new Date().toISOString();
          var idx = state.estimates.findIndex(function (e) { return e.id === data.id; });
          if (idx >= 0) state.estimates[idx] = data;
          else state.estimates.push(data);
          save();
          alert("Imported estimate.");
          showView("estimates");
        } else {
          alert("Unrecognized JSON.");
        }
      } catch (e) {
        alert("Invalid JSON: " + e.message);
      }
    };
    reader.readAsText(file);
  }


  // ========== HUB + APPOINTMENTS ==========
  function payrollWeekTotals(weekStart) {
    var onBooks = 0, cash = 0, hoursOn = 0, hoursCash = 0;
    (state.timeEntries || []).forEach(function (t) {
      if (!inWeek(t.workDate, weekStart)) return;
      var amt = (Number(t.hours) || 0) * (Number(t.rate) || 0);
      var emp = (state.employees || []).find(function (e) { return e.id === t.employeeId; });
      var payType = emp ? normalizePayType(emp.payType) : PAY_TYPES.ON_BOOKS;
      if (t.payType) payType = normalizePayType(t.payType);
      if (payType === PAY_TYPES.CASH) { cash += amt; hoursCash += Number(t.hours) || 0; }
      else { onBooks += amt; hoursOn += Number(t.hours) || 0; }
    });
    return { onBooks: onBooks, cash: cash, hoursOn: hoursOn, hoursCash: hoursCash, total: onBooks + cash };
  }

  function renderHub() {
    syncAppointmentsFromStore();
    var today = todayISO();
    var weekStart = startOfWeek(today);
    var openEst = (state.estimates || []).filter(function (e) {
      return !e.jobStatus || e.jobStatus === "";
    }).length;
    var activeJobs = (state.estimates || []).filter(function (e) {
      return e.jobStatus && e.jobStatus !== "Done";
    }).length;
    var upcomingAppt = (state.appointments || []).filter(function (a) {
      return a.status !== "cancelled" && a.status !== "no-show" && a.status !== "done" && a.date >= today;
    }).length;
    var pay = payrollWeekTotals(weekStart);
    var receiptWeek = (state.receipts || []).filter(function (r) {
      return r.date && inWeek(r.date, weekStart);
    });
    var receiptSum = receiptWeek.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    var vendorCount = (state.vendors || []).length;

    // Client Flow monitoring (real estimates only — no invented projects)
    var flowOpenIssues = 0;
    var flowInPipeline = 0;
    var stageCounts = {};
    FLOW_STAGES.forEach(function (s) { stageCounts[s.id] = 0; });
    var flowsBeforeHub = (state.clientFlows || []).length;
    (state.estimates || []).forEach(function (e) {
      var flow = ensureFlowForEstimate(e);
      var prog = flowProgress(flow);
      if (prog.pct < 100 || (e.jobStatus && e.jobStatus !== "Done")) flowInPipeline += 1;
      flowOpenIssues += (flow.issues || []).filter(function (i) { return i.status !== "resolved"; }).length;
      var cur = activeFlowStage(flow);
      if (cur) stageCounts[cur.id] = (stageCounts[cur.id] || 0) + 1;
    });
    if ((state.clientFlows || []).length !== flowsBeforeHub) {
      try { save(); } catch (eHubSave) {}
    }

    var kpis = [
      { label: "Open estimates", value: String(openEst), sub: (state.estimates || []).length + " total", goto: "estimates" },
      { label: "Active jobs", value: String(activeJobs), sub: "Sold → In progress", goto: "jobs" },
      { label: "Pipeline", value: String(flowInPipeline), sub: flowOpenIssues ? (flowOpenIssues + " open issue(s)") : "Client Flow", goto: "flow" },
      { label: "Upcoming appts", value: String(upcomingAppt), sub: "Estimate visits", goto: "appointments" },
      { label: "Payroll owed", value: money(pay.total), sub: "This week", goto: "payroll" },
      { label: "Vendors", value: String(vendorCount), sub: "Suppliers", goto: "vendors" },
      { label: "Receipts / wk", value: money(receiptSum), sub: receiptWeek.length + " this week", goto: "receipts" }
    ];
    var kpiEl = $("#hub-kpis");
    if (kpiEl) {
      kpiEl.innerHTML = kpis.map(function (k) {
        return '<div class="hub-kpi clickable" data-goto="' + k.goto + '">' +
          '<div class="label">' + escapeHtml(k.label) + '</div>' +
          '<div class="value">' + k.value + '</div>' +
          '<div class="sub">' + escapeHtml(k.sub) + '</div></div>';
      }).join("");
      $$(".hub-kpi[data-goto]", kpiEl).forEach(function (el) {
        el.addEventListener("click", function () { showView(el.getAttribute("data-goto")); });
      });
    }

    // Pipeline strip (Lead → … → Complete) — status across departments
    var pipeEl = $("#hub-pipeline");
    if (pipeEl) {
      var pipeStages = FLOW_STAGES.filter(function (s) { return s.id !== "claim"; });
      pipeEl.innerHTML = '<div class="hub-pipe-head"><strong>Client pipeline</strong>' +
        '<button type="button" class="btn small ghost" data-goto="flow">Open Client Flow →</button></div>' +
        '<div class="hub-pipe-stages">' + pipeStages.map(function (s) {
          var n = stageCounts[s.id] || 0;
          return '<div class="hub-pipe-stage" data-goto="flow"><span class="n">' + n +
            '</span><span class="lbl">' + escapeHtml(s.label) + '</span></div>';
        }).join("") + '</div>' +
        (flowOpenIssues
          ? '<p class="hub-pipe-note"><span class="ins-badge soon">' + flowOpenIssues +
            ' open issue(s)</span> across Client Flow — click a stage or Open Client Flow.</p>'
          : '<p class="hub-pipe-note muted">Same path as Jobs stages + Client Flow (Lead → Estimate → Sale → Design → Materials → Delivery → Job → Complete).</p>');
      $$("[data-goto=flow]", pipeEl).forEach(function (el) {
        el.addEventListener("click", function () { showView("flow"); });
      });
    }

    // Mini kanban
    var stages = ["Sold", "Scheduled", "In progress", "Done"];
    var kan = $("#hub-kanban");
    if (kan) {
      kan.innerHTML = stages.map(function (st) {
        var jobs = (state.estimates || []).filter(function (e) { return e.jobStatus === st; });
        var chips = jobs.slice(0, 4).map(function (e) {
          var tot = estimateTotals(e);
          return '<div class="hub-chip" data-id="' + escapeHtml(e.id) + '"><strong>' +
            escapeHtml(e.customerName || "Untitled") + '</strong><span>' +
            escapeHtml(e.estimateNumber || "") + " · " + money(tot.grand) + "</span></div>";
        }).join("") || '<p class="muted" style="font-size:.78rem;margin:.35rem 0">—</p>';
        if (jobs.length > 4) chips += '<p class="muted" style="font-size:.72rem">+' + (jobs.length - 4) + " more</p>";
        return '<div class="hub-col"><h3>' + escapeHtml(st) + '<span class="count">' + jobs.length +
          "</span></h3>" + chips + "</div>";
      }).join("");
      $$(".hub-chip[data-id]", kan).forEach(function (el) {
        el.addEventListener("click", function () {
          var est = state.estimates.find(function (x) { return x.id === el.getAttribute("data-id"); });
          if (est) openEditor(est.id);
        });
      });
    }

    // Timeline next 14 days
    var end = (window.JNHBooking ? window.JNHBooking.addDaysISO(today, 14) : today);
    var items = [];
    (state.appointments || []).forEach(function (a) {
      if (a.status === "cancelled" || a.status === "no-show") return;
      if (a.date < today || a.date > end) return;
      items.push({
        kind: "appt",
        date: a.date,
        time: a.time || "09:00",
        title: a.name,
        meta: (a.address || "") + (a.phone ? " · " + a.phone : ""),
        tag: "Estimate appt",
        id: a.id
      });
    });
    (state.estimates || []).forEach(function (e) {
      if (!e.jobScheduledDate) return;
      if (e.jobScheduledDate < today || e.jobScheduledDate > end) return;
      if (!e.jobStatus || e.jobStatus === "") return;
      items.push({
        kind: "job",
        date: e.jobScheduledDate,
        time: "08:00",
        title: e.customerName || "Job",
        meta: (e.jobStatus || "") + (e.projectAddress ? " · " + e.projectAddress : ""),
        tag: e.jobStatus || "Job",
        id: e.id
      });
    });
    items.sort(function (a, b) {
      var ka = a.date + "T" + a.time;
      var kb = b.date + "T" + b.time;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    var tl = $("#hub-timeline");
    var tlEmpty = $("#hub-timeline-empty");
    if (tl) {
      if (!items.length) {
        tl.innerHTML = "";
        if (tlEmpty) tlEmpty.classList.remove("hidden");
      } else {
        if (tlEmpty) tlEmpty.classList.add("hidden");
        tl.innerHTML = items.map(function (it) {
          var d = new Date(it.date + "T12:00:00");
          var when = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
            "<br>" + (window.JNHBooking ? window.JNHBooking.formatTimeLabel(it.time) : it.time);
          return '<div class="hub-tl-item" data-kind="' + it.kind + '" data-id="' + escapeHtml(it.id) + '">' +
            '<div class="when">' + when + '</div>' +
            '<div class="dot ' + (it.kind === "job" ? "job" : "") + '"></div>' +
            '<div class="body"><strong>' + escapeHtml(it.title) + '</strong>' +
            '<span class="tag ' + (it.kind === "job" ? "job-tag" : "") + '">' + escapeHtml(it.tag) + "</span>" +
            '<div class="meta">' + escapeHtml(it.meta) + "</div></div></div>";
        }).join("");
        $$(".hub-tl-item", tl).forEach(function (el) {
          el.addEventListener("click", function () {
            var kind = el.getAttribute("data-kind");
            var id = el.getAttribute("data-id");
            if (kind === "job") openEditor(id);
            else showView("appointments");
          });
        });
      }
    }

    // Recent estimates
    var he = $("#hub-estimates");
    if (he) {
      var recent = (state.estimates || []).slice().sort(function (a, b) {
        return (b.estimateDate || "") < (a.estimateDate || "") ? -1 : 1;
      }).slice(0, 5);
      he.innerHTML = recent.length ? recent.map(function (e) {
        var tot = estimateTotals(e);
        return '<div class="hub-list-row" data-id="' + escapeHtml(e.id) + '"><span>' +
          escapeHtml(e.customerName || "Untitled") + "<br><small class=\"muted\">" +
          escapeHtml(e.estimateDate || "") + "</small></span><span class=\"amt\">" + money(tot.grand) + "</span></div>";
      }).join("") : '<p class="muted">No estimates yet.</p>';
      $$(".hub-list-row[data-id]", he).forEach(function (el) {
        el.addEventListener("click", function () { openEditor(el.getAttribute("data-id")); });
      });
    }

    // Payroll block
    var hp = $("#hub-payroll");
    if (hp) {
      hp.innerHTML = '<div class="big">' + money(pay.total) + '</div>' +
        '<div class="muted">Week of ' + escapeHtml(weekStart) + "</div>" +
        '<div class="split"><div>On books<strong>' + money(pay.onBooks) + "</strong>" +
        (pay.hoursOn.toFixed(1)) + " hrs</div><div>Cash<strong>" + money(pay.cash) + "</strong>" +
        (pay.hoursCash.toFixed(1)) + " hrs</div></div>";
    }

    // Spend
    var hs = $("#hub-spend");
    if (hs) {
      var rows = receiptWeek.slice().sort(function (a, b) { return (b.date || "") < (a.date || "") ? -1 : 1; }).slice(0, 5);
      var vendorBits = (state.vendors || []).slice(0, 3).map(function (v) {
        return escapeHtml(v.name);
      }).join(", ");
      hs.innerHTML = '<p class="muted" style="margin:0 0 .5rem">Vendors: ' + (vendorBits || "none yet") +
        (vendorCount > 3 ? " +" + (vendorCount - 3) : "") + "</p>" +
        (rows.length ? rows.map(function (r) {
          return '<div class="hub-list-row"><span>' + escapeHtml(r.vendorName || "Receipt") +
            "<br><small class=\"muted\">" + escapeHtml(r.date || "") + "</small></span>" +
            '<span class="amt">' + money(r.amount) + "</span></div>";
        }).join("") : '<p class="muted">No receipts this week.</p>');
    }

    $$("[data-goto]").forEach(function (btn) {
      if (btn.classList.contains("hub-kpi")) return;
      if (btn._hubBound) return;
      btn._hubBound = true;
      btn.addEventListener("click", function () {
        var g = btn.getAttribute("data-goto");
        if (g) showView(g);
      });
    });
  }

  function fillAvailForm() {
    syncAppointmentsFromStore();
    var a = state.availability || (window.JNHBooking && window.JNHBooking.getAvailability()) || {};
    var form = $("#avail-form");
    if (!form) return;
    form.slotMinutes.value = String(a.slotMinutes || 60);
    form.maxPerDay.value = a.maxPerDay != null ? a.maxPerDay : 6;
    form.startHour.value = a.startHour != null ? a.startHour : 9;
    form.endHour.value = a.endHour != null ? a.endHour : 17;
    form.lunchStart.value = a.lunchStart != null ? a.lunchStart : 12;
    form.lunchEnd.value = a.lunchEnd != null ? a.lunchEnd : 13;
    form.leadDays.value = a.leadDays != null ? a.leadDays : 1;
    form.horizonDays.value = a.horizonDays != null ? a.horizonDays : 45;
    form.blockedDates.value = (a.blockedDates || []).join(", ");
    var days = a.workDays || [1, 2, 3, 4, 5];
    $$('input[name="dow"]', form).forEach(function (cb) {
      cb.checked = days.indexOf(Number(cb.value)) >= 0;
    });
    var url = location.origin + location.pathname.replace(/index\.html?$/i, "") + "book.html";
    var hint = $("#booker-url-hint");
    if (hint) hint.textContent = "Public booker: " + url;
  }

  function saveAvailForm(e) {
    e.preventDefault();
    var form = e.target;
    var workDays = $$('input[name="dow"]:checked', form).map(function (cb) { return Number(cb.value); });
    var blocked = String(form.blockedDates.value || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var avail = {
      slotMinutes: Number(form.slotMinutes.value) || 60,
      maxPerDay: Number(form.maxPerDay.value) || 6,
      startHour: Number(form.startHour.value),
      endHour: Number(form.endHour.value),
      lunchStart: Number(form.lunchStart.value),
      lunchEnd: Number(form.lunchEnd.value),
      leadDays: Number(form.leadDays.value) || 0,
      horizonDays: Number(form.horizonDays.value) || 45,
      workDays: workDays,
      blockedDates: blocked,
      timezoneNote: "America/New_York"
    };
    if (window.JNHBooking) window.JNHBooking.setAvailability(avail);
    state.availability = avail;
    save();
    renderAppointments();
    alert("Availability saved. Public booker will use these hours.");
  }

  function renderApptAdminCal() {
    if (!window.JNHBooking) return;
    var B = window.JNHBooking;
    if (state.apptCalYear == null) {
      var n = new Date();
      state.apptCalYear = n.getFullYear();
      state.apptCalMonth = n.getMonth();
    }
    var y = state.apptCalYear, m = state.apptCalMonth;
    var label = $("#appt-cal-label");
    if (label) label.textContent = new Date(y, m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
    var avail = B.getAvailability();
    var bookable = {};
    B.bookableDates(avail).forEach(function (d) { bookable[d] = true; });
    var counts = {};
    (state.appointments || []).forEach(function (a) {
      if (a.status === "cancelled") return;
      counts[a.date] = (counts[a.date] || 0) + 1;
    });
    var grid = $("#appt-cal-grid");
    if (!grid) return;
    grid.innerHTML = "";
    ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(function (d) {
      var el = document.createElement("div");
      el.className = "dow";
      el.textContent = d;
      grid.appendChild(el);
    });
    var first = new Date(y, m, 1);
    var pad = first.getDay();
    var dim = new Date(y, m + 1, 0).getDate();
    for (var i = 0; i < pad; i++) {
      var e = document.createElement("div");
      e.className = "appt-cal-day muted";
      grid.appendChild(e);
    }
    for (var day = 1; day <= dim; day++) {
      var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var cell = document.createElement("div");
      cell.className = "appt-cal-day" + (bookable[iso] ? " open" : " muted");
      cell.innerHTML = "<span>" + day + "</span>" + (counts[iso] ? '<span class="dot-book" title="' + counts[iso] + ' booked"></span>' : "");
      grid.appendChild(cell);
    }
  }

  function renderAppointments() {
    syncAppointmentsFromStore();
    fillAvailForm();
    renderApptAdminCal();
    var filter = ($("#appt-filter") && $("#appt-filter").value) || "upcoming";
    var today = todayISO();
    var list = (state.appointments || []).slice().filter(function (a) {
      if (filter === "upcoming") return a.date >= today && a.status !== "cancelled" && a.status !== "done";
      if (filter === "all") return true;
      return a.status === filter;
    });
    var body = $("#appointments-body");
    var empty = $("#appointments-empty");
    if (!body) return;
    if (!list.length) {
      body.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    var B = window.JNHBooking;
    body.innerHTML = list.map(function (a) {
      var when = a.date + " · " + (B ? B.formatTimeLabel(a.time) : a.time);
      return "<tr>" +
        "<td>" + escapeHtml(when) + "</td>" +
        "<td>" + escapeHtml(a.name) + (a.notes ? "<br><small class=\"muted\">" + escapeHtml(a.notes) + "</small>" : "") + "</td>" +
        "<td><a href=\"tel:" + escapeHtml(a.phone) + "\">" + escapeHtml(a.phone) + "</a></td>" +
        "<td>" + escapeHtml(a.address) + "</td>" +
        "<td><span class=\"status-pill " + escapeHtml(a.status || "booked") + "\">" + escapeHtml(a.status || "booked") + "</span></td>" +
        "<td class=\"actions\">" +
          "<button type=\"button\" class=\"btn small\" data-act=\"confirm\" data-id=\"" + a.id + "\">Confirm</button>" +
          "<button type=\"button\" class=\"btn small\" data-act=\"done\" data-id=\"" + a.id + "\">Done</button>" +
          "<button type=\"button\" class=\"btn small danger\" data-act=\"cancel\" data-id=\"" + a.id + "\">Cancel</button>" +
          "<button type=\"button\" class=\"btn small ghost\" data-act=\"del\" data-id=\"" + a.id + "\">Delete</button>" +
        "</td></tr>";
    }).join("");
    $$("button[data-act]", body).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var act = btn.getAttribute("data-act");
        if (act === "del") {
          if (!confirm("Delete this appointment?")) return;
          if (window.JNHBooking) window.JNHBooking.deleteAppointment(id);
        } else if (act === "confirm") {
          (async function () {
            try {
              if (window.JNHBookingAPI && window.JNHBookingAPI.apiEnabled()) {
                var tok = window.prompt("Admin token (Worker ADMIN_TOKEN) to confirm on Google Calendar:");
                if (tok) await window.JNHBookingAPI.confirmBooking(id, tok.trim());
              }
            } catch (err) { console.warn(err); alert("Calendar confirm failed: " + (err.message || err)); }
            if (window.JNHBooking) window.JNHBooking.updateAppointment(id, { status: "confirmed" });
            syncAppointmentsFromStore(); save(); renderAppointments();
          })();
          return;
        } else if (act === "done") {
          if (window.JNHBooking) window.JNHBooking.updateAppointment(id, { status: "done" });
        } else if (act === "cancel") {
          (async function () {
            try {
              if (window.JNHBookingAPI && window.JNHBookingAPI.apiEnabled()) {
                var tok2 = window.prompt("Admin token to decline/free slot on Google Calendar (optional Cancel):");
                if (tok2) await window.JNHBookingAPI.declineBooking(id, tok2.trim());
              }
            } catch (err) { console.warn(err); }
            if (window.JNHBooking) window.JNHBooking.updateAppointment(id, { status: "cancelled" });
            syncAppointmentsFromStore(); save(); renderAppointments();
          })();
          return;
        }
        syncAppointmentsFromStore();
        save();
        renderAppointments();
      });
    });
  }

  function saveManualAppointment(e) {
    e.preventDefault();
    var form = e.target;
    var time = form.time.value; // HH:MM
    if (time && time.length === 5) { /* ok */ }
    var payload = {
      name: form.name.value,
      phone: form.phone.value,
      address: form.address.value,
      notes: form.notes.value,
      date: form.date.value,
      time: time,
      source: "manual"
    };
    var existingId = form.id.value;
    if (existingId && window.JNHBooking) {
      window.JNHBooking.updateAppointment(existingId, payload);
    } else if (window.JNHBooking) {
      // force book even if slot conflicts for manual
      var list = window.JNHBooking.getAppointments();
      var ap = {
        id: "ap_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
        date: payload.date,
        time: payload.time,
        name: payload.name,
        phone: payload.phone,
        address: payload.address,
        notes: payload.notes || "",
        status: "confirmed", // manual entries Jose creates himself are already confirmed
        source: "manual",
        createdAt: new Date().toISOString()
      };
      list.push(ap);
      window.JNHBooking.saveAppointments(list);
    }
    syncAppointmentsFromStore();
    save();
    form.reset();
    form.id.value = "";
    $("#manual-appt-card").classList.add("hidden");
    renderAppointments();
  }


  // ---------- wire up ----------
  function init() {
    load();

    $$(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var menu = tab.closest(".nav-menu");
        if (tab.classList.contains("nav-menu-toggle") && menu) {
          var isOpen = menu.classList.contains("open");
          closeNavMenus(menu.id);
          setNavMenuOpen(menu.id, !isOpen);
          return;
        }
        showView(tab.getAttribute("data-view"));
        if (tab.classList.contains("nav-menu-item")) closeNavMenus();
      });
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".nav-menu")) closeNavMenus();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNavMenus();
    });

    var backPro = $("#btn-back-pro-desk");
    if (backPro) {
      backPro.addEventListener("click", function () {
        showView("hub");
      });
    }

    $("#btn-estimates-new-product").addEventListener("click", createProductFromToolbar);
    $("#btn-estimates-new").addEventListener("click", function () { openEditor(null); });
    $("#btn-estimates-delete").addEventListener("click", deleteCurrentEstimate);
    $("#btn-estimates-lock").addEventListener("click", toggleCurrentEstimateLock);
    $("#btn-estimates-print").addEventListener("click", printCurrentEstimate);
    $("#btn-estimates-email").addEventListener("click", emailCurrentEstimate);
    $("#btn-estimates-text").addEventListener("click", textCurrentEstimate);

    $("#btn-new-estimate").addEventListener("click", function () { openEditor(null); });
    $("#btn-back-estimates").addEventListener("click", function () { showView("estimates"); });
    $("#btn-save-estimate").addEventListener("click", saveCurrentEstimate);
    $("#btn-export-estimate").addEventListener("click", exportCurrentEstimate);
    $("#btn-preview-print").addEventListener("click", function () {
      printEstimate(collectEstimateFromForm());
    });
    $("#btn-add-section").addEventListener("click", function () {
      window.__draftEstimate.sections.push({ title: "New section", body: "" });
      renderScopeSections(window.__draftEstimate.sections);
    });
    $("#btn-add-line").addEventListener("click", function () {
      readLaborFieldsFromForm(window.__draftEstimate);
      var rate = effectiveJobLaborRate(window.__draftEstimate);
      var hrs = Number(window.__draftEstimate.laborHours);
      var useHours = isFinite(hrs) && hrs > 0;
      window.__draftEstimate.lines.push({
        description: "",
        qty: useHours ? hrs : 1,
        unit: useHours ? "hours" : "sf",
        laborRate: rate,
        materialCost: 0
      });
      renderLines(window.__draftEstimate.lines);
      recalcTotals();
    });
    $("#btn-import-json").addEventListener("click", function () { $("#import-file").click(); });
    $("#import-file").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importJsonFile(f);
      e.target.value = "";
    });

    $("#btn-add-employee").addEventListener("click", addEmployee);

    $("#time-form").addEventListener("submit", saveTimeEntry);
    $("#btn-add-time").addEventListener("click", function () {
      $("#time-form").scrollIntoView({ behavior: "smooth" });
      fillTimeFormSelects();
    });
    $("#btn-cancel-time-edit").addEventListener("click", function () {
      var form = $("#time-form");
      form.reset();
      form.entryId.value = "";
      form.workDate.value = todayISO();
      state.editingTimeId = null;
      $("#btn-cancel-time-edit").hidden = true;
      fillTimeFormSelects();
    });
    $("#timelog-week").addEventListener("change", renderTimeLog);

    $("#payroll-week").value = startOfWeek(todayISO());
    $("#timelog-week").value = startOfWeek(todayISO());
    $("#payroll-week").addEventListener("change", renderPayroll);
    $("#btn-print-payroll").addEventListener("click", printPayroll);

    if ($("#rolodex-form")) $("#rolodex-form").addEventListener("submit", saveRolodexContact);
    if ($("#rolodex-search")) $("#rolodex-search").addEventListener("input", renderRolodex);
    if ($("#btn-add-rolodex")) $("#btn-add-rolodex").addEventListener("click", function () { var f = $("#rolodex-form"); f.reset(); f.contactId.value = ""; $("#btn-cancel-rolodex-edit").hidden = true; f.scrollIntoView({ behavior: "smooth" }); f.name.focus(); });
    if ($("#btn-cancel-rolodex-edit")) $("#btn-cancel-rolodex-edit").addEventListener("click", function () { var f = $("#rolodex-form"); f.reset(); f.contactId.value = ""; this.hidden = true; });
    if ($("#btn-rolodex-pull")) $("#btn-rolodex-pull").addEventListener("click", rolodexPullFromGmail);
    if ($("#btn-rolodex-push")) $("#btn-rolodex-push").addEventListener("click", rolodexPushToGmail);
    if ($("#btn-rolodex-sync")) $("#btn-rolodex-sync").addEventListener("click", rolodexSyncBothWays);

    if ($("#weather-settings-form")) $("#weather-settings-form").addEventListener("submit", saveWeatherSettings);
    if ($("#btn-weather-refresh")) $("#btn-weather-refresh").addEventListener("click", loadWeatherPlan);

    $("#vendor-form").addEventListener("submit", saveVendor);
    $("#btn-add-vendor").addEventListener("click", function () {
      $("#vendor-form").scrollIntoView({ behavior: "smooth" });
      $("#vendor-form").name.focus();
    });
    $("#btn-cancel-vendor-edit").addEventListener("click", function () {
      $("#vendor-form").reset();
      $("#vendor-form").vendorId.value = "";
      $("#btn-cancel-vendor-edit").hidden = true;
    });

    $("#receipt-form").addEventListener("submit", saveReceipt);
    $("#receipt-file").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) onReceiptFile(f);
    });
    $("#btn-run-ocr").addEventListener("click", onRunOcr);
    $("#btn-cancel-receipt-edit").addEventListener("click", function () {
      var form = $("#receipt-form");
      form.reset();
      form.receiptId.value = "";
      state.pendingReceiptDataUrl = null;
      $("#receipt-preview").classList.add("hidden");
      $("#btn-cancel-receipt-edit").hidden = true;
      $("#btn-run-ocr").disabled = true;
    });
    $("#receipts-job-filter").addEventListener("change", renderReceipts);

    if ($("#btn-jobs-refresh")) $("#btn-jobs-refresh").addEventListener("click", renderJobs);
    if ($("#pricebook-form")) $("#pricebook-form").addEventListener("submit", savePriceItem);
    if ($("#btn-add-price-item")) $("#btn-add-price-item").addEventListener("click", function () {
      var f = $("#pricebook-form"); if (f) { f.reset(); f.itemId.value = ""; $("#btn-cancel-price-edit").hidden = true; f.name.focus(); }
    });
    if ($("#btn-cancel-price-edit")) $("#btn-cancel-price-edit").addEventListener("click", function () {
      var f = $("#pricebook-form"); f.reset(); f.itemId.value = ""; this.hidden = true;
    });
    if ($("#pricebook-filter")) $("#pricebook-filter").addEventListener("change", renderPriceBook);
    if ($("#btn-add-from-book")) $("#btn-add-from-book").addEventListener("click", pickFromPriceBook);

    if ($("#reviews-form")) $("#reviews-form").addEventListener("submit", saveReviewsSettings);
    if ($("#btn-copy-review-link")) $("#btn-copy-review-link").addEventListener("click", function () {
      var u = effectiveReviewUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(function () { alert("Copied review link"); });
      else prompt("Copy review link:", u);
    });
    if ($("#btn-review-text-link")) $("#btn-review-text-link").addEventListener("click", function () { openReviewText(false); });
    if ($("#btn-review-email-link")) $("#btn-review-email-link").addEventListener("click", function () { openReviewEmail(false); });
    if ($("#btn-review-text-qr")) $("#btn-review-text-qr").addEventListener("click", function () { openReviewText(true); });
    if ($("#btn-review-email-qr")) $("#btn-review-email-qr").addEventListener("click", function () { openReviewEmail(true); });

    if ($("#stripe-settings-form")) $("#stripe-settings-form").addEventListener("submit", saveStripeSettings);
    if ($("#labor-settings-form")) $("#labor-settings-form").addEventListener("submit", saveLaborSettings);
    var laborOverrideInput = $("#est-labor-rate-override");
    var laborHoursInput = $("#est-labor-hours");
    function onEstimateLaborFieldChange() {
      if (!window.__draftEstimate) return;
      readLaborFieldsFromForm(window.__draftEstimate);
      syncLaborPricingUI(window.__draftEstimate);
    }
    if (laborOverrideInput) {
      laborOverrideInput.addEventListener("input", onEstimateLaborFieldChange);
      laborOverrideInput.addEventListener("change", onEstimateLaborFieldChange);
    }
    if (laborHoursInput) {
      laborHoursInput.addEventListener("input", onEstimateLaborFieldChange);
      laborHoursInput.addEventListener("change", onEstimateLaborFieldChange);
    }
    if ($("#btn-payments-refresh")) $("#btn-payments-refresh").addEventListener("click", renderPayments);

    if (!state.settings) state.settings = defaultSettings();
    if (!state.settings.deskPassword) state.settings.deskPassword = "jnh2026";
    ensureSettingsShape();
    fillLaborSettingsForm();
    ensurePriceBook();
    bindAddonUI();
    applyGateUI();
    if (isDeskUnlocked()) showView("hub");
    refreshHubChatHint();
  }

  function refreshHubChatHint() {
    var hint = $("#hub-chat-hint");
    if (!hint) return;
    var c = window.JNH_CHAT_CONFIG || {};
    if (c.mode === "api" && c.apiBase) {
      hint.innerHTML = "Live ChatGPT via Worker <code>" + escapeHtml(c.apiBase) + "</code>. OpenAI key stays on the Worker — not in this page.";
    } else {
      hint.innerHTML = "Demo / mock advice until Milton sets Worker secret <code>OPENAI_API_KEY</code> and points <code>chat-config.js</code> mode to <code>api</code>.";
    }
  }

  window.JNHProDesk = {
    isUnlocked: isDeskUnlocked,
    showView: showView,
    getEstimateSnapshot: estimateSnapshotForAdvisor,
    applyEstimateSuggestions: applyEstimateSuggestions,
    fillMarketingBlast: fillMarketingBlast
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
