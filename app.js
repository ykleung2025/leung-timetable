import { describeNow, dutiesOn, cycleGrid, weekdayZh, specialText, addDays, dayInfo } from "./logic.js?v=5";

const SOURCE = "https://raw.githubusercontent.com/wongsir-lwcps/lwcps_timetable/main/index.html";
const FB_CONFIG = {
  apiKey: "AIzaSyBEJyBCb6wOlmTCe_5sga1w5y1bh1HTfyE",
  authDomain: "timetable-baa8f.firebaseapp.com",
  projectId: "timetable-baa8f",
  storageBucket: "timetable-baa8f.firebasestorage.app",
  messagingSenderId: "96682796202",
  appId: "1:96682796202:web:d310d81609f65c58fadcd3",
};

const state = { data: null, reschedules: [], live: false, swapLive: false, notify: false };

function hkNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return {
    key: g("year") + "-" + g("month") + "-" + g("day"),
    minutes: Number(g("hour")) * 60 + Number(g("minute")),
  };
}

function parseAppData(html) {
  const marker = "const APPDATA = ";
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("找不到時間表資料");
  let k = i + marker.length;
  if (html[k] !== "{") throw new Error("時間表資料格式唔啱");
  let depth = 0, inStr = false, esc = false;
  for (let p = k; p < html.length; p++) {
    const c = html[p];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(k, p + 1));
    }
  }
  throw new Error("時間表資料未完");
}

function pack(raw) {
  const teacher = (raw.teachers || []).find((t) => t.id === "奇" || (t.name || "").includes("梁恩奇"));
  if (!teacher) throw new Error("搵唔到梁恩奇老師");
  return {
    dayMap: raw.dayMap,
    cycleWeek: raw.cycleWeek,
    specialDays: raw.specialDays,
    specialLabels: raw.specialLabels,
    teacher,
    duty: (raw.dutyIndex || {})["梁恩奇"] || {},
  };
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(key) {
  const [y, m, d] = key.split("-");
  return Number(m) + "月" + Number(d) + "日（" + weekdayZh(key) + "）";
}

function minsLeft(now, item) {
  const n = item.start - now;
  if (n <= 0) return "";
  if (n < 60) return "仲有 " + n + " 分鐘";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return "仲有 " + h + " 小時" + (m ? m + " 分鐘" : "");
}

function lessonLine(item) {
  const place = item.place ? " · " + item.place : "";
  return item.subject + place;
}

function render() {
  const now = hkNow();
  const view = describeNow(state.data, now.key, now.minutes, state.reschedules);
  const hero = document.querySelector("#hero");
  const todayBox = document.querySelector("#today");
  const dutyBox = document.querySelector("#duty");
  const status = document.querySelector("#status");
  hero.className = "card hero";
  let title = "";
  let meta = "";
  let sub = "";
  let when = "";
  if (view.current) {
    hero.classList.add("now");
    when = "而家上緊";
    title = view.current.label + " " + lessonLine(view.current);
    meta = view.current.time;
    sub = view.next ? "下一堂 " + view.next.label + " " + lessonLine(view.next) + "（" + minsLeft(now.minutes, view.next) + "）" : "今日之後冇堂";
    if (view.current.swapped && view.current.original) sub = "原定 " + view.current.original + (sub ? "。" + sub : "");
  } else if (view.next) {
    hero.classList.add("next");
    when = "下一堂";
    title = view.next.label + " " + lessonLine(view.next);
    meta = fmtDate(now.key) + " " + view.next.time + " · " + minsLeft(now.minutes, view.next);
    if (view.next.swapped && view.next.original) sub = "原定 " + view.next.original;
  } else if (view.upcoming) {
    hero.classList.add("wait");
    when = view.today.info.type === "schoolday" ? "今日課堂完咗" : "今日冇堂";
    title = "下一堂 " + view.upcoming.label + " " + lessonLine(view.upcoming);
    meta = fmtDate(view.upcomingKey) + " " + view.upcoming.time;
    const info = dayInfo(state.data, view.upcomingKey);
    sub = info.type === "schoolday" ? info.day.replace("Day", "Day ") : "";
  } else {
    when = "暫時冇課堂";
    title = "搵唔到之後嘅堂";
  }
  if (view.today.info.type === "special" && !view.current && !view.next) {
    when = "今日唔係正常上課日";
    title = specialText(view.today.info);
    meta = fmtDate(now.key);
    sub = view.upcoming ? "下一個上課日 " + fmtDate(view.upcomingKey) : "";
    hero.className = "card hero wait";
  }
  hero.innerHTML =
    '<p class="when">' + esc(when) + "</p>" +
    "<h2>" + esc(title) + "</h2>" +
    (meta ? '<p class="meta">' + esc(meta) + "</p>" : "") +
    (sub ? '<p class="sub">' + esc(sub) + "</p>" : "");

  const cycle = view.today.info.type === "schoolday" ? view.today.info.day.replace("Day", "Day ") : "";
  const head = cycle ? fmtDate(now.key) + " · " + cycle : fmtDate(now.key);
  const rows = view.today.items.length
    ? view.today.items.map((item) => {
        const cur = view.current && view.current.id === item.id;
        return '<div class="row' + (cur ? " current" : "") + '"><div class="t">' + esc(item.label) + "<br>" + esc(item.time) + "</div><div><strong>" + esc(item.teach ? lessonLine(item) : "空堂") + "</strong>" + (item.original ? '<div class="place">原定 ' + esc(item.original) + "</div>" : "") + "</div></div>";
      }).join("")
    : '<p class="note">' + esc(view.today.info.type === "special" ? specialText(view.today.info) : "今日冇你嘅堂。") + "</p>";
  todayBox.innerHTML = '<p class="kicker">今日</p><h3 style="margin:0 0 10px">' + esc(head) + "</h3><div class=\"list\">" + rows + "</div>";

  const duties = dutiesOn(state.data, now.key);
  dutyBox.innerHTML = duties.length
    ? '<p class="kicker">今日值日</p><div class="chips">' + duties.map((d) => '<span class="chip">' + esc(d.label + (d.place ? " · " + d.place : "")) + "</span>").join("") + "</div>"
    : "";

  const bits = [];
  bits.push(state.live ? "時間表已跟學校原站" : "時間表用緊備份");
  bits.push(state.swapLive ? "調堂即時更新" : "調堂暫時讀唔到");
  status.textContent = bits.join(" · ");
  maybeNotify(now, view);
}

function maybeNotify(now, view) {
  if (!state.notify || Notification.permission !== "granted") return;
  const item = view.current ? null : view.next;
  if (!item) return;
  const left = item.start - now.minutes;
  if (left <= 0 || left > 5) return;
  const key = item.id;
  if (sessionStorage.getItem("notified") === key) return;
  sessionStorage.setItem("notified", key);
  new Notification("下一堂快到", { body: item.label + " " + lessonLine(item) + " " + item.time });
}

function renderGrid() {
  const grid = cycleGrid(state.data.teacher);
  const today = dayInfo(state.data, hkNow().key);
  const head = "<tr><th></th>" + grid.days.map((d) => "<th>" + d.replace("Day", "D") + "</th>").join("") + "</tr>";
  const body = grid.rows.map((row) => {
    const cells = grid.days.map((d) => {
      const list = row.cells[d];
      if (!list.length) return "<td></td>";
      const html = list.map((e) => {
        const tag = e.parity === "even" ? '<span class="tag">雙週</span>' : e.parity === "odd" ? '<span class="tag">單週</span>' : "";
        return esc(e.subject) + (e.place ? " " + esc(e.place) : "") + tag;
      }).join("<br>");
      return "<td>" + html + "</td>";
    }).join("");
    return "<tr><th>" + esc(row.label) + "<br><span class=\"note\">" + esc(row.time) + "</span></th>" + cells + "</tr>";
  }).join("");
  const p9names = {Mon:"一",Tue:"二",Wed:"三",Thu:"四",Fri:"五"};
  const p9cells = ["Mon","Tue","Wed","Thu","Fri"].map((wd) => {
    const e = grid.period9[wd] || {};
    const place = e.place ? " " + esc(e.place) : "";
    return "<td>" + esc(e.subject || "") + place + "</td>";
  }).join("") + "<td></td>";
  const p9 = "<tr><th>第9節<br><span class=\"note\">14:35-15:20</span></th>" + p9cells + "</tr>";
  document.querySelector("#grid").innerHTML = "<table>" + head + body + p9 + "</table>" + (today.type === "schoolday" ? '<p class="note">今日係 ' + esc(today.day.replace("Day", "Day ")) + "。單週雙週跟循環週，雙數週先有「雙週」堂。</p>" : "");
}

async function loadFallback() {
  const res = await fetch("./fallback.json");
  state.data = await res.json();
}

async function loadLive() {
  const res = await fetch(SOURCE + "?t=" + Date.now());
  if (!res.ok) throw new Error("原站讀唔到");
  state.data = pack(parseAppData(await res.text()));
  state.live = true;
}

async function loadSwaps() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, orderBy } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
  const db = getFirestore(initializeApp(FB_CONFIG));
  const q = query(collection(db, "reschedules"), orderBy("date", "desc"));
  onSnapshot(q, (snap) => {
    const records = [];
    snap.forEach((d) => records.push(Object.assign({ id: d.id }, d.data())));
    state.reschedules = records;
    state.swapLive = true;
    render();
  }, () => {
    state.swapLive = false;
    render();
  });
}

function bind() {
  const btn = document.querySelector("#notify");
  state.notify = localStorage.getItem("lesson-notify") === "1";
  btn.classList.toggle("on", state.notify);
  btn.textContent = state.notify ? "上課前提醒：開" : "上課前提醒：關";
  btn.addEventListener("click", async () => {
    if (!state.notify) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      state.notify = true;
      localStorage.setItem("lesson-notify", "1");
    } else {
      state.notify = false;
      localStorage.setItem("lesson-notify", "0");
    }
    btn.classList.toggle("on", state.notify);
    btn.textContent = state.notify ? "上課前提醒：開" : "上課前提醒：關";
  });
  document.querySelector("#refresh").addEventListener("click", async () => {
    try { await loadLive(); } catch (e) { /* keep current */ }
    render();
    renderGrid();
  });
}

await loadFallback();
render();
renderGrid();
bind();
loadLive().then(() => { render(); renderGrid(); }).catch(() => render());
loadSwaps().catch(() => render());
setInterval(render, 20000);
