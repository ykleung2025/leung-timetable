export const TEACHER_SHORT = "奇";

export const LESSONS = [
  { idx: 0, label: "第1節", time: "08:25-09:00", slotId: "s4" },
  { idx: 1, label: "第2節", time: "09:00-09:35", slotId: "s_1774269821978" },
  { idx: 2, label: "第3節", time: "09:35-10:10", slotId: "s_1774269888106" },
  { idx: 3, label: "第4節", time: "10:25-11:00", slotId: "s_1774269931966" },
  { idx: 4, label: "第5節", time: "11:00-11:35", slotId: "s_1774269954324" },
  { idx: 5, label: "第6節", time: "11:50-12:25", slotId: "s_1774269972712" },
  { idx: 6, label: "第7節", time: "12:25-13:00", slotId: "s_1774270007109" },
  { idx: 7, label: "第8節", time: "14:00-14:35", slotId: "s_1774270020608" },
];

export const P9 = { label: "第9節", time: "14:35-15:20" };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_ZH = ["日", "一", "二", "三", "四", "五", "六"];

export function weekdayIndex(dateKey) {
  const d = new Date(dateKey + "T12:00:00+08:00");
  return d.getUTCDay();
}

export function weekdayKey(dateKey) {
  return WD[weekdayIndex(dateKey)];
}

export function weekdayZh(dateKey) {
  return WD_ZH[weekdayIndex(dateKey)];
}

function span(time) {
  const [a, b] = time.split("-");
  const toMin = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  return { start: toMin(a), end: toMin(b) };
}

export function dayInfo(data, dateKey) {
  const v = data.dayMap[dateKey];
  if (!v) return { type: "unset" };
  if (String(v).indexOf("Day") === 0) return { type: "schoolday", day: v };
  const detail = data.specialDays[dateKey] || null;
  return { type: "special", code: v, detail };
}

export function cycleParity(data, dateKey) {
  const wk = data.cycleWeek[dateKey];
  if (!wk) return null;
  return { week: wk, parity: wk % 2 === 1 ? "odd" : "even" };
}

function pickEntry(list, data, dateKey) {
  if (!list || !list.length) return null;
  const par = cycleParity(data, dateKey);
  return list.find((e) => !e.parity || (par && e.parity === par.parity)) || null;
}

function overrideFor(reschedules, dateKey, slotId) {
  for (const r of reschedules || []) {
    if (r.date !== dateKey || r.slotId !== slotId) continue;
    const entry = (r.entries || []).find((e) => e.teacher === TEACHER_SHORT);
    if (entry) return entry;
  }
  return null;
}

function placeOf(location) {
  if (!location) return "";
  return String(location).replace(/\s+/g, " ").trim();
}

export function lessonsOn(data, dateKey, reschedules) {
  const info = dayInfo(data, dateKey);
  const items = [];
  if (info.type !== "schoolday") return { info, items, parity: cycleParity(data, dateKey) };
  const teacher = data.teacher;
  const dayName = info.day;
  for (const row of LESSONS) {
    const period = teacher.periods[row.idx];
    const original = pickEntry(period && period.byDay[dayName], data, dateKey);
    const swap = overrideFor(reschedules, dateKey, row.slotId);
    const { start, end } = span(row.time);
    if (swap) {
      const cls = swap.class || "";
      const freed = cls === "空堂";
      items.push({
        id: dateKey + "-" + row.label,
        label: row.label,
        time: row.time,
        start,
        end,
        subject: freed ? "空堂" : "調堂",
        place: freed ? "" : cls,
        original: original ? [original.subject, placeOf(original.location)].filter(Boolean).join(" · ") : "",
        swapped: true,
        teach: !freed && cls !== "",
        kind: cls === "進修" ? "study" : "lesson",
      });
      continue;
    }
    if (!original) {
      items.push({
        id: dateKey + "-" + row.label,
        label: row.label,
        time: row.time,
        start,
        end,
        subject: "空堂",
        place: "",
        original: "",
        swapped: false,
        teach: false,
        kind: "free",
      });
      continue;
    }
    items.push({
      id: dateKey + "-" + row.label,
      label: row.label,
      time: row.time,
      start,
      end,
      subject: original.subject,
      place: placeOf(original.location),
      original: "",
      swapped: false,
      teach: true,
      kind: "lesson",
    });
  }
  const wd = weekdayKey(dateKey);
  const p9 = Object.assign({}, (teacher.period9 || {})[wd] || {});
  if (wd === "Mon") p9.location = p9.location || "6C";
  if (wd === "Tue") p9.location = p9.location || "1D";
  if (p9 && p9.subject) {
    const { start, end } = span(P9.time);
    items.push({
      id: dateKey + "-p9",
      label: P9.label,
      time: P9.time,
      start,
      end,
      subject: p9.subject,
      place: placeOf(p9.location),
      original: "",
      swapped: false,
      teach: true,
      kind: "lesson",
    });
  }
  return { info, items, parity: cycleParity(data, dateKey) };
}

export function dutiesOn(data, dateKey) {
  const info = dayInfo(data, dateKey);
  if (info.type !== "schoolday") return [];
  const labels = {
    morningA: "課前值日 07:30-07:45",
    morningB: "課前值日 07:45-08:00",
    recess1: "小息一值日",
    recess2: "小息二值日",
    recess3: "小息三值日",
    lunch: "午膳值日",
  };
  return ((data.duty || {})[info.day] || []).map((d) => ({
    label: labels[d.slot] || d.slot,
    place: d.location || "",
  }));
}

export function addDays(dateKey, n) {
  const d = new Date(dateKey + "T12:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function nextSchoolDay(data, dateKey) {
  for (let i = 1; i <= 21; i++) {
    const k = addDays(dateKey, i);
    if (dayInfo(data, k).type === "schoolday") return k;
  }
  return null;
}

export function describeNow(data, dateKey, minutes, reschedules) {
  const today = lessonsOn(data, dateKey, reschedules);
  const teaching = today.items.filter((x) => x.teach);
  let current = null;
  let next = null;
  for (const item of teaching) {
    if (minutes >= item.start && minutes < item.end) current = item;
    else if (minutes < item.start && !next) next = item;
  }
  let upcomingKey = null;
  let upcoming = null;
  if (!current && !next) {
    upcomingKey = today.info.type === "schoolday" && minutes < 8 * 60
      ? dateKey
      : nextSchoolDay(data, dateKey);
    if (upcomingKey) {
      upcoming = lessonsOn(data, upcomingKey, reschedules).items.find((x) => x.teach) || null;
    }
  }
  return { today, current, next, upcomingKey, upcoming };
}

export function cycleGrid(teacher) {
  const days = ["Day1", "Day2", "Day3", "Day4", "Day5", "Day6"];
  const rows = teacher.periods.map((period) => {
    const cells = {};
    for (const day of days) {
      const list = period.byDay[day] || [];
      cells[day] = list.map((e) => ({
        subject: e.subject,
        place: placeOf(e.location),
        parity: e.parity || "",
      }));
    }
    return { label: period.name, time: period.time, cells };
  });
  const period9 = Object.assign({}, teacher.period9 || {});
  if (period9.Mon) period9.Mon = Object.assign({ place: "6C" }, period9.Mon);
  if (period9.Tue) period9.Tue = Object.assign({ place: "1D" }, period9.Tue);
  return { days, rows, period9 };
}

export function specialText(info) {
  if (!info || info.type !== "special") return "";
  const d = info.detail || {};
  return d.event || d.category || info.code;
}
