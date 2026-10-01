/* JNH Masonry Pro Desk v1 — estimates, labor, vendors, receipts */
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
    editingEstimateId: null,
    pendingReceiptDataUrl: null,
    pendingReceiptName: null,
    pendingReceiptMime: null,
    editingTimeId: null,
    editingVendorId: null,
    editingReceiptId: null
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
      if (employeeMigrationNeeded) save();
    } catch (e) {
      console.warn("Pro Desk load failed", e);
    }
  }
  function save() {
    var data = {
      estimates: state.estimates,
      employees: state.employees,
      timeEntries: state.timeEntries,
      vendors: state.vendors,
      receipts: state.receipts,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
      estimates: "view-estimates",
      editor: "view-editor",
      employees: "view-employees",
      timelog: "view-timelog",
      payroll: "view-payroll",
      vendors: "view-vendors",
      receipts: "view-receipts"
    };
    var id = map[name] || "view-estimates";
    var el = document.getElementById(id);
    if (el) el.classList.add("active");
    if (name === "estimates") renderEstimatesList();
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
    showView("estimates");
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
      "<p style=\"margin-top:24px\">We look forward to working with you.<br/>Sincerely,<br/><strong>Jose Hernandez</strong><br/>JNH Masonry Inc.</p>" +
      "</div>";

    var root = $("#print-root");
    root.innerHTML = html;
    root.setAttribute("aria-hidden", "false");
    window.print();
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

    showView("estimates");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
