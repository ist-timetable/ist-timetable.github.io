// IST Timetable app. Loads timetable.json (network first, cache when offline).
const PX_PER_MIN = 1.4;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const $ = (s) => document.querySelector(s);
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const to12 = (t) => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${ap}`; };
const plural = (n, word) => `${n} ${n === 1 ? word.slice(0, -1) : word}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let data = null;
const state = {
  view: "classes",
  section: localStorage.getItem("section") || "",
  classDay: null,
  freeMode: "now",
  freeDay: null,
  freeKind: "rooms",
};

function nowInfo() {
  const d = new Date();
  const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return { day, min: d.getHours() * 60 + d.getMinutes() };
}
function defaultDay() {
  const { day } = nowInfo();
  return WEEKDAYS.includes(day) ? day : "Monday";
}

// ---------- data loading ----------
async function load(force = false) {
  const status = $("#status");
  try {
    const res = await fetch("timetable.json", { cache: force ? "reload" : "no-cache" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    status.className = "status";
    status.textContent = `Timetable updated ${new Date(data.meta.generatedAt).toLocaleString()}`;
  } catch (e) {
    // The service worker serves the cached copy when offline, so reaching here
    // means there is no copy at all yet.
    status.className = "status offline";
    status.textContent = "No internet and no saved timetable yet. Open the app once while online.";
    return;
  }
  if (!navigator.onLine) {
    status.className = "status offline";
    status.textContent = `Offline. Showing saved timetable from ${new Date(data.meta.generatedAt).toLocaleString()}`;
  }
  setup();
}

function setup() {
  const sel = $("#section");
  const names = Object.keys(data.sections).sort();
  sel.innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join("");
  if (!names.includes(state.section)) state.section = names[0];
  sel.value = state.section;
  state.classDay ??= defaultDay();
  state.freeDay ??= defaultDay();
  render();
}

// ---------- rendering ----------
function dayButtons(el, current, onPick) {
  const today = nowInfo().day;
  el.innerHTML = WEEKDAYS.map((d) =>
    `<button data-day="${d}" aria-pressed="${d === current}" class="${d === today ? "today" : ""}">${d.slice(0, 3)}</button>`).join("");
  el.onclick = (e) => { const b = e.target.closest("button"); if (b) onPick(b.dataset.day); };
}

function renderClasses() {
  dayButtons($("#days-classes"), state.classDay, (d) => { state.classDay = d; render(); });
  const items = data.sections[state.section][state.classDay] || [];
  const box = $("#timeline");
  if (!items.length) { box.innerHTML = `<p class="empty">No classes on ${state.classDay}.</p>`; return; }

  const start = toMin(data.meta.dayStart), end = toMin(data.meta.dayEnd);
  const y = (m) => (m - start) * PX_PER_MIN;
  let html = `<div class="tl" style="height:${y(end)}px">`;
  for (let m = start; m <= end; m += 60) {
    const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    html += `<div class="grid" style="top:${y(m)}px"></div><div class="hour" style="top:${y(m)}px">${to12(t).replace(" ", "")}</div>`;
  }
  const now = nowInfo();
  const isToday = now.day === state.classDay;
  for (const c of items) {
    const s = toMin(c.start), e = toMin(c.end);
    const past = isToday && e <= now.min;
    html += `<div class="blk ${c.type}${past ? " past" : ""}" style="top:${y(s) + 2}px;height:${y(e) - y(s) - 4}px">
      <h3>${esc(c.subject)}</h3>
      <p>${to12(c.start)} to ${to12(c.end)}${c.room ? ` · <span class="room">${esc(c.room)}</span>` : ""}</p></div>`;
  }
  if (isToday && now.min >= start && now.min <= end) html += `<div class="nowline" style="top:${y(now.min)}px"></div>`;
  box.innerHTML = html + "</div>";
}

// Busy intervals for every room or lab on a given day
function busyMap(kind, day) {
  const out = {};
  for (const [name, days] of Object.entries(data[kind])) out[name] = (days[day] || []).map((o) => [toMin(o.start), toMin(o.end)]);
  return out;
}
const sortNames = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function renderFree() {
  const list = $("#free-list");
  $("#days-free").hidden = state.freeMode !== "slots";
  const label = state.freeKind === "rooms" ? "rooms" : "labs";
  const dayStart = toMin(data.meta.dayStart), dayEnd = toMin(data.meta.dayEnd);

  if (state.freeMode === "now") {
    const { day, min } = nowInfo();
    if (!WEEKDAYS.includes(day)) { list.innerHTML = `<p class="empty">No classes today, so every ${label.slice(0, -1)} is free.</p>`; return; }
    if (min < dayStart || min >= dayEnd) { list.innerHTML = `<p class="empty">Classes run from ${to12(data.meta.dayStart)} to ${to12(data.meta.dayEnd)}. Outside those hours every ${label.slice(0, -1)} is free.</p>`; return; }
    const busy = busyMap(state.freeKind, day);
    const free = Object.keys(busy).sort(sortNames).filter((r) => !busy[r].some(([s, e]) => s <= min && min < e))
      .map((r) => {
        const next = busy[r].map(([s]) => s).filter((s) => s > min).sort((a, b) => a - b)[0] ?? dayEnd;
        const t = `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
        return `<span class="chip">${esc(r)} <small>until ${to12(t)}</small></span>`;
      });
    list.innerHTML = `<div class="slot"><h3>Free now</h3><p class="count">${plural(free.length, label)}</p>
      <div class="chips">${free.join("") || `<span class="count">All ${label} are in use.</span>`}</div></div>`;
    return;
  }

  // By time: split the day at every start/end time, so each window has a fixed free set
  dayButtons($("#days-free"), state.freeDay, (d) => { state.freeDay = d; render(); });
  const busy = busyMap(state.freeKind, state.freeDay);
  const cuts = new Set([dayStart, dayEnd]);
  Object.values(busy).flat().forEach(([s, e]) => { cuts.add(s); cuts.add(e); });
  const pts = [...cuts].filter((m) => m >= dayStart && m <= dayEnd).sort((a, b) => a - b);
  const windows = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const free = Object.keys(busy).sort(sortNames).filter((r) => !busy[r].some(([s, e]) => s < b && a < e));
    const prev = windows[windows.length - 1];
    if (prev && prev.free.join() === free.join()) prev.b = b; else windows.push({ a, b, free });
  }
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  list.innerHTML = windows.map((w) => `<div class="slot">
    <h3>${to12(hhmm(w.a))} to ${to12(hhmm(w.b))}</h3>
    <p class="count">${w.free.length} free ${w.free.length === 1 ? label.slice(0, -1) : label}</p>
    <div class="chips">${w.free.map((r) => `<span class="chip">${esc(r)}</span>`).join("") || `<span class="count">All ${label} are in use.</span>`}</div>
  </div>`).join("");
}

function render() {
  if (!data) return;
  $("#view-classes").hidden = state.view !== "classes";
  $("#view-free").hidden = state.view !== "free";
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === state.view));
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === state.freeMode));
  document.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.kind === state.freeKind));
  state.view === "classes" ? renderClasses() : renderFree();
}

// ---------- events ----------
document.querySelector(".tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { state.view = b.dataset.view; render(); } };
document.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { state.freeMode = b.dataset.mode; render(); }));
document.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => { state.freeKind = b.dataset.kind; render(); }));
$("#section").onchange = (e) => { state.section = e.target.value; localStorage.setItem("section", state.section); render(); };
$("#refresh").onclick = () => load(true);
window.addEventListener("online", () => load(true));
setInterval(render, 60 * 1000); // keep the "now" line and "Right now" list fresh

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
load();
