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
    receipts: [],
    priceBook: [],
    settings: null,
    refundStubs: [],
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
    apptCalMonth: null
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
      state.receipts = data.receipts || [];
      state.priceBook = data.priceBook || [];
      state.settings = data.settings || null;
      state.refundStubs = data.refundStubs || [];
      if (!state.settings) state.settings = { googleReviewUrl: "", stripePublishableKey: "", stripePaymentLinkBase: "", stripeMode: "test", paymentFeeNote: "", absorbFees: false };
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
      receipts: state.receipts,
      priceBook: state.priceBook,
      settings: state.settings,
      refundStubs: state.refundStubs,
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
  function showView(name) {
    $$(".view").forEach(function (v) { v.classList.remove("active"); });
    $$(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-view") === name);
    });
    var map = {
      hub: "view-hub",
      appointments: "view-appointments",
      estimates: "view-estimates",
      editor: "view-editor",
      jobs: "view-jobs",
      pricebook: "view-pricebook",
      reviews: "view-reviews",
      payments: "view-payments",
      employees: "view-employees",
      timelog: "view-timelog",
      payroll: "view-payroll",
      vendors: "view-vendors",
      receipts: "view-receipts"
    };
    var id = map[name] || "view-hub";
    var el = document.getElementById(id);
    if (el) el.classList.add("active");
    if (name === "hub") renderHub();
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
    if (name === "receipts") { fillReceiptSelects(); renderReceipts(); }
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
      lines: [
        { description: "", qty: 1, unit: "sf", laborRate: 0, materialCost: 0 }
      ],
      depositAmount: 0,
      depositNotes: "",
      paymentTerms: "Balance due upon completion unless otherwise agreed.",
      includeDisclosures: true,
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
    if (form.jobStatus) form.jobStatus.value = est.jobStatus || "";
    if (form.jobScheduledDate) form.jobScheduledDate.value = est.jobScheduledDate || "";
    if (form.jobNotes) form.jobNotes.value = est.jobNotes || "";
    if (form.paymentStatus) form.paymentStatus.value = est.paymentStatus || "Unpaid";
    if (form.amountPaid) form.amountPaid.value = est.amountPaid || "";
    if (form.paymentLink) form.paymentLink.value = est.paymentLink || "";
    renderScopeSections(est.sections || []);
    renderLines(est.lines || []);
    recalcTotals();
    showView("editor");
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
    save();
    alert("Estimate saved.");

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

    showView("hub");
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
      disc =
        "<div class=\"disc\"><h3>Disclosures</h3><ul>" +
        "<li>JNH Masonry Inc. is not responsible for material shipping delays, shortages, or carrier situations outside our control.</li>" +
        "<li>JNH Masonry Inc. is not responsible for manufacturer material performance, color variation, or product defects beyond the manufacturer’s warranty.</li>" +
        "<li>Estimate is valid for 30 days unless otherwise noted. Work begins after signed acceptance and required deposit.</li>" +
        "</ul></div>";
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

  // ========== EXTRA MODULES: jobs, price book, reviews, payments ==========
  var JOB_STATUSES = ["Sold", "Scheduled", "In progress", "Done"];
  var DEFAULT_GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJC1ceBG4y6IkRObpjjofxrpQ";
  var STRIPE_FEE_NOTE = "Card payments typically incur ~2.9% + $0.30 per transaction (Stripe US). Customer or JNH absorbs fees per agreement.";

  function defaultSettings() {
    return {
      googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
      stripePublishableKey: "",
      stripeSecretKeyHint: "", // never store real secret — placeholder only
      stripePaymentLinkBase: "",
      stripeMode: "test",
      paymentFeeNote: STRIPE_FEE_NOTE,
      absorbFees: false
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
            "<button type=\"button\" class=\"btn small\" data-act=\"time\">Time</button>" +
          "</div>";
        card.querySelector("[data-act=status]").addEventListener("change", function (e) {
          est.jobStatus = e.target.value;
          est.updatedAt = new Date().toISOString();
          save();
          renderJobs();
        });
        card.querySelector("[data-act=open]").addEventListener("click", function () { openEditor(est.id); });
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
      laborRate: 0,
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
    var img = $("#reviews-qr-img");
    if (img) img.src = qrImageUrl(url);
    var disp = $("#reviews-link-display");
    if (disp) disp.textContent = url;
    var open = $("#btn-open-review");
    if (open) open.href = url;
  }

  function saveReviewsSettings(e) {
    e.preventDefault();
    if (!state.settings) state.settings = defaultSettings();
    state.settings.googleReviewUrl = $("#google-review-url").value.trim() || DEFAULT_GOOGLE_REVIEW_URL;
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
          // full backup
          if (data.estimates) state.estimates = data.estimates;
          if (data.employees) state.employees = data.employees.map(function (emp) {
            emp.payType = normalizePayType(emp.payType);
            return emp;
          });
          if (data.timeEntries) state.timeEntries = data.timeEntries;
          if (data.vendors) state.vendors = data.vendors;
          if (data.receipts) state.receipts = data.receipts;
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

    var kpis = [
      { label: "Open estimates", value: String(openEst), sub: (state.estimates || []).length + " total", goto: "estimates" },
      { label: "Active jobs", value: String(activeJobs), sub: "Sold → In progress", goto: "jobs" },
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
          if (window.JNHBooking) window.JNHBooking.updateAppointment(id, { status: "confirmed" });
        } else if (act === "done") {
          if (window.JNHBooking) window.JNHBooking.updateAppointment(id, { status: "done" });
        } else if (act === "cancel") {
          if (window.JNHBooking) window.JNHBooking.updateAppointment(id, { status: "cancelled" });
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
        status: "booked",
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
        showView(tab.getAttribute("data-view"));
      });
    });

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
      window.__draftEstimate.lines.push({ description: "", qty: 1, unit: "sf", laborRate: 0, materialCost: 0 });
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

    if ($("#stripe-settings-form")) $("#stripe-settings-form").addEventListener("submit", saveStripeSettings);
    if ($("#btn-payments-refresh")) $("#btn-payments-refresh").addEventListener("click", renderPayments);

    if (!state.settings) state.settings = { googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJC1ceBG4y6IkRObpjjofxrpQ", stripePublishableKey: "", stripePaymentLinkBase: "", stripeMode: "test", paymentFeeNote: "Card payments typically incur ~2.9% + $0.30 per transaction (Stripe US). Customer or JNH absorbs fees per agreement.", absorbFees: false };
    ensurePriceBook();

    showView("estimates");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
