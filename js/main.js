/* Vitalsly — fitness dashboard logic (vanilla JS, localStorage) */
(function () {
  "use strict";

  var KEY = "vitalsly.sessions.v1";
  var DAILY_GOAL_MIN = 60;
  var WEEK_DAY_GOAL = 5;
  var STREAK_GOAL = 10;

  // rough kcal per minute by workout type
  var KCAL_PER_MIN = {
    Strength: 6.5, Run: 11, Cycling: 9, HIIT: 13,
    Yoga: 4, Walk: 4.5, Swim: 9.5
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  var sessions = load();

  function dayKey(d) {
    var x = new Date(d);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function todayKey() { return dayKey(new Date()); }

  function minutesOn(list, key) {
    return list.reduce(function (sum, s) { return dayKey(s.ts) === key ? sum + s.minutes : sum; }, 0);
  }

  function weekKeys() {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      out.push(dayKey(d));
    }
    return out;
  }

  function weekList(list) {
    var keys = weekKeys();
    return list.filter(function (s) { return keys.indexOf(dayKey(s.ts)) !== -1; });
  }

  function streak(list) {
    var set = {};
    list.forEach(function (s) { set[dayKey(s.ts)] = true; });
    var n = 0;
    var d = new Date();
    if (!set[dayKey(d)]) d.setDate(d.getDate() - 1); // today may not be logged yet
    while (set[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function fmtDay(key) {
    var parts = key.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
  }
  function fmtWhen(ts) {
    var d = new Date(ts);
    var t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return dayKey(ts) === todayKey() ? "Today · " + t : d.toLocaleDateString() + " · " + t;
  }

  /* ---------- rendering ---------- */
  function renderStats() {
    var wk = weekList(sessions);
    var wkMin = wk.reduce(function (a, s) { return a + s.minutes; }, 0);
    var wkKcal = Math.round(wk.reduce(function (a, s) { return a + s.kcal; }, 0));
    var tMin = minutesOn(sessions, todayKey());
    var st = streak(sessions);

    setStat("todayMinutes", tMin, "min");
    setStat("weekMinutes", wkMin, "min");
    setStat("sessions", sessions.length, "total");
    setStat("weekKcal", wkKcal, "kcal");
    setStat("streak", st, st === 1 ? "day" : "day");

    // ring
    var pct = Math.min(1, tMin / DAILY_GOAL_MIN);
    var ring = $("[data-ring]");
    if (ring) {
      var r = Number(ring.getAttribute("r"));
      var c = 2 * Math.PI * r;
      ring.style.strokeDasharray = c;
      ring.style.strokeDashoffset = c * (1 - pct);
    }
    var pctEl = $("[data-ring-pct]");
    if (pctEl) pctEl.textContent = Math.round(pct * 100) + "%";

    // goals
    setMeter("today", pct);
    var daysTrained = weekKeys().filter(function (k) { return minutesOn(sessions, k) > 0; }).length;
    setMeter("days", Math.min(1, daysTrained / WEEK_DAY_GOAL));
    setMeter("streak", Math.min(1, st / STREAK_GOAL));
  }

  function setStat(name, value, unit) {
    $$('[data-stat="' + name + '"]').forEach(function (el) {
      el.innerHTML = value + "<span>" + unit + "</span>";
    });
  }

  function setMeter(name, ratio) {
    var bar = $('[data-goal="' + name + '"]');
    if (bar) bar.style.width = Math.round(ratio * 100) + "%";
    var txt = $('[data-goal-text="' + name + '"]');
    if (txt) txt.textContent = Math.round(ratio * 100) + "%";
  }

  function renderBars() {
    var host = $("[data-bars]");
    if (!host) return;
    host.innerHTML = "";
    var keys = weekKeys();
    var tk = todayKey();
    var max = 1;
    keys.forEach(function (k) { max = Math.max(max, minutesOn(sessions, k)); });
    keys.forEach(function (k) {
      var m = minutesOn(sessions, k);
      var col = document.createElement("div");
      col.className = "bar-col";

      var val = document.createElement("span");
      val.className = "bar-val";
      val.textContent = m > 0 ? m + "m" : "—";

      var bar = document.createElement("div");
      bar.className = "bar" + (k === tk ? " is-today" : "");
      bar.style.height = "0px";
      var px = Math.max(6, Math.round((m / max) * 140));
      setTimeout(function () { bar.style.height = px + "px"; }, 60);

      var day = document.createElement("span");
      day.className = "bar-day";
      day.textContent = k === tk ? "Today" : fmtDay(k);

      col.appendChild(val); col.appendChild(bar); col.appendChild(day);
      host.appendChild(col);
    });
  }

  function renderList() {
    var list = $("[data-list]");
    var empty = $("[data-empty]");
    if (!list) return;
    list.innerHTML = "";
    var ordered = sessions.slice().sort(function (a, b) { return b.ts - a.ts; });
    if (empty) empty.hidden = ordered.length > 0;

    ordered.slice(0, 40).forEach(function (s) {
      var li = document.createElement("li");
      li.className = "log-item";
      li.innerHTML =
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="meta"><b>' + esc(s.type) + '</b><small>' + fmtWhen(s.ts) + ' · ' + s.effortLabel + '</small></span>' +
        '<span class="val">' + s.minutes + '<small> min · ' + s.kcal + ' kcal</small></span>';

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-btn";
      btn.setAttribute("aria-label", "Remove " + s.type + " session");
      btn.textContent = "✕";
      btn.addEventListener("click", function () {
        sessions = sessions.filter(function (x) { return x.id !== s.id; });
        save(sessions);
        renderAll();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderAll() { renderStats(); renderBars(); renderList(); }

  /* ---------- form ---------- */
  var form = $("[data-form]");
  var msg = $("[data-msg]");
  var estimate = $("[data-estimate]");

  function currentEstimate() {
    var type = $("#type");
    var minutes = $("#minutes");
    var effort = $("#effort");
    if (!type || !minutes || !effort) return 0;
    var m = Math.max(0, Math.min(600, Number(minutes.value) || 0));
    var rate = KCAL_PER_MIN[type.value] || 6;
    return Math.round(m * rate * Number(effort.value || 1));
  }

  function updateEstimate() {
    if (estimate) estimate.textContent = currentEstimate().toLocaleString() + " kcal";
  }

  ["#type", "#minutes", "#effort"].forEach(function (sel) {
    var el = $(sel);
    if (el) { el.addEventListener("input", updateEstimate); el.addEventListener("change", updateEstimate); }
  });

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var type = $("#type").value;
      var minutes = Math.max(1, Math.min(600, Number($("#minutes").value) || 0));
      var effortSel = $("#effort");
      var effortLabel = effortSel.options[effortSel.selectedIndex].text;
      var kcal = currentEstimate();

      sessions.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        type: type, minutes: minutes, kcal: kcal,
        effort: Number(effortSel.value), effortLabel: effortLabel,
        ts: Date.now()
      });
      save(sessions);
      renderAll();
      if (msg) {
        msg.textContent = "Added " + minutes + " min of " + type + " (" + kcal + " kcal). Keep the streak alive!";
        setTimeout(function () { msg.textContent = ""; }, 3200);
      }
      updateEstimate();
    });
  }

  var clearBtn = $("[data-clear]");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (!sessions.length) return;
      if (window.confirm("Clear all logged sessions?")) {
        sessions = [];
        save(sessions);
        renderAll();
      }
    });
  }

  renderAll();
  updateEstimate();
})();
