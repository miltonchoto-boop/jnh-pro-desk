/* JNH Pro Desk — ChatGPT Advisor (client). Uses mock mode or Worker /chat proxy. */
(function () {
  "use strict";

  var chatHistory = [];
  var pendingSuggestions = null;
  var pendingCopy = null;
  var advisorMode = "estimate"; // estimate | marketing | email | sms

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    var v = Number(n) || 0;
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function cfg() {
    return window.JNH_CHAT_CONFIG || { mode: "mock", apiBase: "", model: "gpt-4o-mini", business: "JNH Masonry Inc." };
  }

  function isUnlocked() {
    if (window.JNHProDesk && typeof window.JNHProDesk.isUnlocked === "function") {
      return window.JNHProDesk.isUnlocked();
    }
    try { return sessionStorage.getItem("jnh_pro_desk_unlocked") === "1"; } catch (e) { return false; }
  }

  function setStatus(text, kind) {
    var el = $("#advisor-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "advisor-status" + (kind ? " " + kind : "");
  }

  function updateModeBadge() {
    var badge = $("#advisor-mode-badge");
    var c = cfg();
    var live = c.mode === "api" && c.apiBase;
    if (badge) {
      badge.textContent = live ? "Live OpenAI (via Worker)" : "Demo / mock advice";
      badge.className = "advisor-mode-badge" + (live ? " live" : " mock");
    }
    $$(".advisor-chip").forEach(function (chip) {
      chip.classList.toggle("active", chip.getAttribute("data-mode") === advisorMode);
    });
  }

  function openAdvisor(opts) {
    opts = opts || {};
    if (!isUnlocked()) {
      alert("Unlock Pro Desk first (same password / session). Then open Chat Advisor from the Hub.");
      return;
    }
    if (opts.mode) advisorMode = opts.mode;
    var panel = $("#advisor-panel");
    var backdrop = $("#advisor-backdrop");
    if (panel) {
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
    }
    if (backdrop) {
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("advisor-open");
    updateModeBadge();
    var input = $("#advisor-input");
    if (input) setTimeout(function () { input.focus(); }, 180);
    if (opts.seed && !chatHistory.length) {
      seedWelcome();
    } else if (!chatHistory.length) {
      seedWelcome();
    }
    if (opts.autoReview) {
      runQuickReview();
    }
  }

  function closeAdvisor() {
    var panel = $("#advisor-panel");
    var backdrop = $("#advisor-backdrop");
    if (panel) {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    }
    if (backdrop) {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("advisor-open");
  }

  function seedWelcome() {
    var name = (cfg().business || "JNH Masonry");
    appendMessage("assistant",
      "Hi Jose — I'm the **" + name + " Chat Advisor**.\n\n" +
      "• **Review estimate** — critique line items, scope, deposit, and totals\n" +
      "• **Marketing / Email / Text** — draft customer-facing copy\n\n" +
      "When I suggest estimate changes, tap **Accept** to apply them to the open estimate.\n\n" +
      (cfg().mode === "api" && cfg().apiBase
        ? "Connected to the Worker proxy (OpenAI key stays server-side)."
        : "Running in **demo mode** — advice is local until Milton sets OPENAI_API_KEY on the Worker and points chat-config.js at it."));
  }

  function appendMessage(role, text, meta) {
    var log = $("#advisor-messages");
    if (!log) return;
    var row = document.createElement("div");
    row.className = "advisor-msg " + role;
    var body = formatMessage(text);
    row.innerHTML =
      "<div class=\"advisor-bubble\">" + body + "</div>" +
      (meta ? "<div class=\"advisor-meta\">" + escapeHtml(meta) + "</div>" : "");
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function formatMessage(text) {
    var s = escapeHtml(text || "");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  function setPending(suggestions, copy) {
    pendingSuggestions = suggestions || null;
    pendingCopy = copy || null;
    var accept = $("#advisor-accept");
    var reject = $("#advisor-dismiss-suggest");
    var box = $("#advisor-suggest-box");
    var has = !!(pendingSuggestions || pendingCopy);
    if (box) box.classList.toggle("hidden", !has);
    if (accept) accept.disabled = !has;
    if (reject) reject.disabled = !has;
    var summary = $("#advisor-suggest-summary");
    if (summary) {
      if (!has) summary.textContent = "";
      else if (pendingSuggestions) summary.textContent = "Estimate changes ready — Accept applies them to the open estimate fields.";
      else if (pendingCopy) summary.textContent = "Copy draft ready — Accept fills Marketing / opens email or text.";
    }
  }

  function currentEstimateSnapshot() {
    if (window.JNHProDesk && typeof window.JNHProDesk.getEstimateSnapshot === "function") {
      return window.JNHProDesk.getEstimateSnapshot();
    }
    return null;
  }

  function buildUserPayload(userText) {
    var est = currentEstimateSnapshot();
    return {
      mode: advisorMode,
      message: userText,
      messages: chatHistory.slice(-12),
      estimate: est,
      business: cfg().business || "JNH Masonry Inc."
    };
  }

  function mockAdvice(payload) {
    var est = payload.estimate;
    var mode = payload.mode || "estimate";
    var msg = String(payload.message || "").toLowerCase();

    if (mode === "marketing" || /marketing|blast|promo|newsletter/.test(msg)) {
      var subject = "Spring & summer masonry from JNH Masonry Inc.";
      var body =
        "Hi {{name}},\n\n" +
        "This is Jose at JNH Masonry Inc. We're booking walls, pavers, and repair work in Suffolk County. " +
        "Licensed & insured — mention this note for a free on-site estimate.\n\n" +
        "Call/text 631-965-1754 or book at jnhmas.com.\n\n" +
        "— Jose Hernandez\nJNH Masonry Inc.";
      return {
        reply: "Draft marketing blast (demo). Accept to drop it into the Marketing composer.",
        copy: { kind: "marketing", subject: subject, body: body }
      };
    }

    if (mode === "email" || /^email|e-mail|mailto/.test(msg)) {
      var eSub = est && est.estimateNumber
        ? "JNH Masonry estimate " + est.estimateNumber
        : "Your JNH Masonry estimate";
      var eBody =
        "Hi " + ((est && est.customerName) || "there") + ",\n\n" +
        "Attached / below is your estimate from JNH Masonry Inc." +
        (est ? (" Total: " + money((est.totals && est.totals.grand) || 0) + ".") : "") +
        " Happy to walk through scope, materials, and schedule.\n\n" +
        "Jose Hernandez\nJNH Masonry Inc.\n631-965-1754 · jnhmasonry@gmail.com";
      return {
        reply: "Customer email draft (demo). Accept opens mailto with this copy.",
        copy: { kind: "email", subject: eSub, body: eBody, to: (est && est.customerEmail) || "" }
      };
    }

    if (mode === "sms" || /text|sms|sms:/.test(msg)) {
      var sms =
        "Hi" + (est && est.customerName ? " " + est.customerName.split(" ")[0] : "") +
        ", Jose from JNH Masonry. Your estimate" +
        (est && est.estimateNumber ? " " + est.estimateNumber : "") +
        (est && est.totals ? " totals " + money(est.totals.grand) : "") +
        ". Reply with questions or call 631-965-1754.";
      return {
        reply: "SMS draft (demo). Accept opens your phone's text app with this message.",
        copy: { kind: "sms", body: sms, to: (est && est.customerPhone) || "" }
      };
    }

    // Estimate review
    if (!est) {
      return {
        reply: "Open an estimate (or create one), then ask me to review it — or switch to Marketing / Email / Text for copy drafts.\n\nTip: From Estimates, tap **Review with Chat**."
      };
    }

    var issues = [];
    var suggestions = { lines: null, sections: null };
    var lines = (est.lines || []).filter(function (l) { return (l.description || "").trim() || Number(l.qty) || Number(l.materialCost); });
    if (!lines.length) issues.push("No priced line items yet — add labor/material lines.");
    lines.forEach(function (l, i) {
      if (!(l.description || "").trim()) issues.push("Line " + (i + 1) + " is missing a description.");
      if (!(Number(l.qty) > 0)) issues.push("Line " + (i + 1) + " qty looks empty.");
      if (!(Number(l.laborRate) > 0) && !(Number(l.materialCost) > 0)) {
        issues.push("Line " + (i + 1) + " has no labor rate or material $.");
      }
    });
    var secs = est.sections || [];
    var emptyScope = secs.filter(function (s) { return !(s.body || "").trim(); });
    if (emptyScope.length) issues.push(emptyScope.length + " scope section(s) have empty body text.");
    if (!(Number(est.depositAmount) > 0)) {
      issues.push("No deposit set — for material-heavy jobs, a deposit helps lock materials.");
    }
    if (!(est.paymentTerms || "").trim()) issues.push("Payment terms are blank.");

    var suggestedLines = (est.lines || []).map(function (l) {
      return {
        description: l.description || "Masonry labor",
        qty: Number(l.qty) > 0 ? Number(l.qty) : 1,
        unit: l.unit || "sf",
        laborRate: Number(l.laborRate) > 0 ? Number(l.laborRate) : (Number(est.effectiveLaborRate) || 85),
        materialCost: Number(l.materialCost) || 0
      };
    });
    if (!suggestedLines.length) {
      suggestedLines = [
        { description: "Site prep & demolition", qty: 8, unit: "hours", laborRate: Number(est.effectiveLaborRate) || 85, materialCost: 0 },
        { description: "Masonry labor — walls / repair", qty: 1, unit: "ls", laborRate: Number(est.effectiveLaborRate) || 85, materialCost: 0 },
        { description: "Materials allowance (block/stone/pavers)", qty: 1, unit: "ls", laborRate: 0, materialCost: 2500 }
      ];
    }

    var deposit = Number(est.depositAmount) > 0
      ? Number(est.depositAmount)
      : Math.round(((est.totals && est.totals.grand) || 5000) * 0.3);

    suggestions = {
      lines: suggestedLines,
      depositAmount: deposit,
      depositNotes: est.depositNotes || "Required to order materials",
      paymentTerms: est.paymentTerms || "Deposit due on acceptance. Balance due upon completion unless otherwise agreed.",
      jobNotes: est.jobNotes || "Confirm access, staging, and material delivery before start."
    };

    var reply =
      "**Estimate review (demo)** for " + (est.customerName || "Untitled") +
      " · " + (est.estimateNumber || "no #") + "\n" +
      "Current total: **" + money((est.totals && est.totals.grand) || 0) + "**\n\n";
    if (issues.length) {
      reply += "Notes:\n" + issues.map(function (x) { return "• " + x; }).join("\n") + "\n\n";
    } else {
      reply += "Looks reasonably complete. I still suggest tightening deposit + job notes.\n\n";
    }
    reply +=
      "Suggested updates (Accept to apply):\n" +
      "• Refresh line items / fill blanks\n" +
      "• Deposit ≈ **" + money(deposit) + "** (≈30% if none set)\n" +
      "• Standard payment terms + job notes\n\n" +
      "_Demo mode — connect OPENAI_API_KEY on the Worker for richer ChatGPT reviews._";

    return { reply: reply, suggestions: suggestions };
  }

  function parseModelPayload(data) {
    // Prefer structured fields from Worker; else try to parse JSON fence from reply
    var suggestions = data.suggestions || null;
    var copy = data.copy || null;
    var reply = data.reply || data.message || "";
    if (!suggestions && !copy && typeof reply === "string") {
      var m = reply.match(/```json\s*([\s\S]*?)```/i);
      if (m) {
        try {
          var parsed = JSON.parse(m[1]);
          if (parsed.suggestions) suggestions = parsed.suggestions;
          if (parsed.copy) copy = parsed.copy;
          if (parsed.reply) reply = parsed.reply;
        } catch (e) {}
      }
    }
    return { reply: reply, suggestions: suggestions, copy: copy, source: data.source || "api" };
  }

  function callChatApi(payload) {
    var c = cfg();
    var base = String(c.apiBase || "").replace(/\/$/, "");
    return fetch(base + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.model || "gpt-4o-mini",
        mode: payload.mode,
        message: payload.message,
        messages: payload.messages,
        estimate: payload.estimate,
        business: payload.business
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || ("Chat API HTTP " + res.status));
        return data;
      });
    });
  }

  function sendMessage(text) {
    var userText = String(text || "").trim();
    if (!userText) return;
    appendMessage("user", userText);
    chatHistory.push({ role: "user", content: userText });
    var input = $("#advisor-input");
    if (input) input.value = "";
    setStatus("Thinking…", "busy");
    var sendBtn = $("#advisor-send");
    if (sendBtn) sendBtn.disabled = true;

    var payload = buildUserPayload(userText);
    var c = cfg();
    var useApi = c.mode === "api" && c.apiBase;

    var done = function (result) {
      var reply = result.reply || "(No reply)";
      appendMessage("assistant", reply, result.source === "openai" ? "OpenAI via Worker" : (result.source === "mock-worker" ? "Worker mock" : "Demo"));
      chatHistory.push({ role: "assistant", content: reply });
      setPending(result.suggestions, result.copy);
      setStatus(useApi ? "Live" : "Demo mode", useApi ? "ok" : "mock");
      if (sendBtn) sendBtn.disabled = false;
    };

    var fail = function (err) {
      console.warn("Advisor chat failed", err);
      var fallback = mockAdvice(payload);
      fallback.reply = "_(API unavailable — demo fallback)_\n\n" + fallback.reply +
        "\n\nError: " + (err && err.message ? err.message : String(err));
      fallback.source = "mock-fallback";
      done(fallback);
    };

    if (!useApi) {
      setTimeout(function () {
        var r = mockAdvice(payload);
        r.source = "mock";
        done(r);
      }, 280);
      return;
    }

    callChatApi(payload).then(function (data) {
      done(parseModelPayload(data));
    }).catch(fail);
  }

  function runQuickReview() {
    advisorMode = "estimate";
    updateModeBadge();
    sendMessage("Please review this estimate and suggest improvements to line items, deposit, payment terms, and notes.");
  }

  function acceptPending() {
    if (pendingSuggestions) {
      if (!window.JNHProDesk || typeof window.JNHProDesk.applyEstimateSuggestions !== "function") {
        alert("Estimate helpers not ready.");
        return;
      }
      var ok = window.JNHProDesk.applyEstimateSuggestions(pendingSuggestions);
      if (ok) {
        appendMessage("assistant", "Accepted — suggested changes applied to the open estimate. Review the fields, then **Save Estimate**.");
        setPending(null, pendingCopy);
        pendingSuggestions = null;
        if (!pendingCopy) setPending(null, null);
      }
      return;
    }
    if (pendingCopy) {
      applyCopy(pendingCopy);
      pendingCopy = null;
      setPending(null, null);
    }
  }

  function applyCopy(copy) {
    if (!copy) return;
    var kind = copy.kind || "marketing";
    if (kind === "marketing") {
      if (window.JNHProDesk && typeof window.JNHProDesk.fillMarketingBlast === "function") {
        window.JNHProDesk.fillMarketingBlast(copy.subject || "", copy.body || "");
        appendMessage("assistant", "Marketing draft filled in the **Marketing** blast composer. Open that tab to stub-send.");
        closeAdvisor();
        if (window.JNHProDesk.showView) window.JNHProDesk.showView("marketing");
        return;
      }
    }
    if (kind === "email") {
      var to = copy.to || "";
      var href = "mailto:" + encodeURIComponent(to) +
        "?subject=" + encodeURIComponent(copy.subject || "") +
        "&body=" + encodeURIComponent(copy.body || "");
      window.location.href = href;
      appendMessage("assistant", "Opened email draft" + (to ? " to " + to : "") + ".");
      return;
    }
    if (kind === "sms") {
      var phone = String(copy.to || "").replace(/[^+\d]/g, "");
      window.location.href = "sms:" + encodeURIComponent(phone) + "?body=" + encodeURIComponent(copy.body || "");
      appendMessage("assistant", "Opened text draft" + (phone ? " to " + phone : "") + ".");
      return;
    }
    // fallback: clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText((copy.subject ? copy.subject + "\n\n" : "") + (copy.body || ""));
      appendMessage("assistant", "Copied draft to clipboard.");
    } else {
      prompt("Copy draft:", (copy.subject ? copy.subject + "\n\n" : "") + (copy.body || ""));
    }
  }

  function dismissSuggest() {
    setPending(null, null);
    appendMessage("assistant", "Suggestions dismissed. Ask again anytime.");
  }

  function clearChat() {
    chatHistory = [];
    setPending(null, null);
    var log = $("#advisor-messages");
    if (log) log.innerHTML = "";
    seedWelcome();
    setStatus(cfg().mode === "api" && cfg().apiBase ? "Live" : "Demo mode", cfg().mode === "api" ? "ok" : "mock");
  }

  function bindUI() {
    var openBtns = $$("[data-open-advisor]");
    openBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-advisor-mode") || "estimate";
        var auto = btn.getAttribute("data-advisor-auto") === "1";
        openAdvisor({ mode: mode, autoReview: auto, seed: true });
      });
    });
    if ($("#advisor-close")) $("#advisor-close").addEventListener("click", closeAdvisor);
    if ($("#advisor-backdrop")) $("#advisor-backdrop").addEventListener("click", closeAdvisor);
    if ($("#advisor-send")) $("#advisor-send").addEventListener("click", function () {
      sendMessage(($("#advisor-input") || {}).value);
    });
    if ($("#advisor-input")) $("#advisor-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e.target.value);
      }
    });
    if ($("#advisor-accept")) $("#advisor-accept").addEventListener("click", acceptPending);
    if ($("#advisor-dismiss-suggest")) $("#advisor-dismiss-suggest").addEventListener("click", dismissSuggest);
    if ($("#advisor-clear")) $("#advisor-clear").addEventListener("click", clearChat);
    $$(".advisor-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        advisorMode = chip.getAttribute("data-mode") || "estimate";
        updateModeBadge();
        var hints = {
          estimate: "Ask me to review the open estimate, tighten pricing, or rewrite scope.",
          marketing: "Ask for a promo blast, seasonal offer, or follow-up campaign.",
          email: "Ask for a customer email about the current estimate or a follow-up.",
          sms: "Ask for a short text about the estimate, appointment, or review request."
        };
        appendMessage("assistant", "Switched to **" + advisorMode + "** mode. " + (hints[advisorMode] || ""));
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("advisor-open")) closeAdvisor();
    });
    updateModeBadge();
    setPending(null, null);
  }

  window.JNHAdvisor = {
    open: openAdvisor,
    close: closeAdvisor,
    reviewEstimate: function () { openAdvisor({ mode: "estimate", autoReview: true, seed: true }); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindUI);
  else bindUI();
})();
