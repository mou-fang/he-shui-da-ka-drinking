// 可独立测试的业务规则。所有日期使用设备当前本地时区。
export const KEY = "hsdq-v1";
export const DEFAULT_SETTINGS = Object.freeze({
  goal: 2000, defaultAmount: 250, startHour: 8, intervalHours: 2,
  removedSlots: [], remindersEnabled: false
});
export const LIMITS = Object.freeze({ goal: [500, 5000], amount: [10, 2000], start: [0, 22], interval: [1, 4] });
export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const slotPattern = /^(?:[01]\d|2[0-3]):00$/;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function todayStr(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
export function addDays(date, offset) {
  const parts = String(date).split("-").map(Number);
  if (parts.length !== 3 || parts.some(x => !Number.isInteger(x))) return todayStr();
  // 本地正午避开跨夏令时切换时的零点歧义
  return todayStr(new Date(parts[0], parts[1] - 1, parts[2] + offset, 12));
}
export function clockStr(d = new Date()) {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
export function validDay(date) {
  if (!datePattern.test(date)) return false;
  const [y,m,d] = date.split("-").map(Number);
  const dt = new Date(y,m-1,d,12);
  return y >= 1970 && y <= 2100 && dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d;
}
export function bounded(value, fallback, lo, hi, step = 1) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? clamp(Math.round(n / step) * step, lo, hi) : fallback;
}
export function freshState() {
  return { settings: { ...DEFAULT_SETTINGS, removedSlots: [] }, days: {}, celebrated: {} };
}
export function normalizeState(input) {
  const state = freshState();
  if (!record(input)) return state;
  const s = record(input.settings) ? input.settings : {};
  state.settings.goal = bounded(s.goal, 2000, 500, 5000, 50);
  state.settings.defaultAmount = bounded(s.defaultAmount, 250, 10, 2000, 10);
  state.settings.startHour = bounded(s.startHour, 8, 0, 22);
  state.settings.intervalHours = bounded(s.intervalHours, 2, 1, 4);
  state.settings.remindersEnabled = s.remindersEnabled === true;
  state.settings.removedSlots = Array.isArray(s.removedSlots)
    ? [...new Set(s.removedSlots.filter(t => typeof t === "string" && slotPattern.test(t)))].slice(0, 24) : [];
  if (record(input.days)) {
    for (const [date, source] of Object.entries(input.days).slice(-10000)) {
      if (!validDay(date) || !record(source)) continue;
      const day = { goal: bounded(source.goal, state.settings.goal, 500, 5000, 50), slots: {}, slotMeta: {}, bonus: [] };
      if (record(source.slots)) for (const [time, ml] of Object.entries(source.slots)) {
        if (!slotPattern.test(time) || !Number.isFinite(ml) || ml < 1 || ml > 100000) continue;
        day.slots[time] = Math.round(ml);
        const stored = source.slotMeta?.[time]?.time;
        if (typeof stored === "string" && timePattern.test(stored)) day.slotMeta[time] = { time: stored };
      }
      if (Array.isArray(source.bonus)) for (const b of source.bonus.slice(0, 10000)) {
        if (!record(b) || !Number.isFinite(b.ml) || b.ml < 1 || b.ml > 100000 || typeof b.id !== "string" || b.id.length > 100 || !timePattern.test(b.time)) continue;
        day.bonus.push({ id: b.id, ml: Math.round(b.ml), time: b.time });
      }
      state.days[date] = day;
    }
  }
  if (record(input.celebrated)) for (const [date, value] of Object.entries(input.celebrated)) {
    if (validDay(date) && value === true) state.celebrated[date] = true;
  }
  return state;
}
export function ensureDay(state, date) {
  if (!state.days[date]) state.days[date] = { goal: state.settings.goal, slots: {}, slotMeta: {}, bonus: [] };
  if (!state.days[date].slotMeta) state.days[date].slotMeta = {};
  if (!Number.isFinite(state.days[date].goal)) state.days[date].goal = state.settings.goal;
  return state.days[date];
}
export function dayData(state, date) {
  return state.days[date] || { goal: state.settings.goal, slots: {}, slotMeta: {}, bonus: [] };
}
export function dayGoal(state, date) { return dayData(state, date).goal; }
export function dayTotal(state, date) {
  const d = dayData(state, date);
  return Object.values(d.slots).reduce((sum, ml) => sum + ml, 0) + d.bonus.reduce((sum, b) => sum + b.ml, 0);
}
export function dayDrinks(state, date) {
  const d = dayData(state, date);
  const list = Object.entries(d.slots).map(([slot, ml]) => ({
    time: d.slotMeta?.[slot]?.time || slot, ml, kind: "slot", slot
  }));
  for (const b of d.bonus) list.push({ time: b.time, ml: b.ml, kind: "bonus", id: b.id });
  return list.sort((a,b) => a.time.localeCompare(b.time));
}
export function slotTimes(settings) {
  const out = [];
  const start = bounded(settings.startHour, 8, 0, 22);
  const interval = bounded(settings.intervalHours, 2, 1, 4);
  const removed = Array.isArray(settings.removedSlots) ? settings.removedSlots : [];
  for (let hour = start; hour <= Math.max(20, start); hour += interval) {
    const time = String(hour).padStart(2, "0") + ":00";
    if (!removed.includes(time)) out.push(time);
  }
  return out;
}
export function nextOpenSlot(state, date, now = new Date()) {
  const slots = dayData(state,date).slots;
  const open = slotTimes(state.settings).filter(time => !Object.hasOwn(slots, time));
  if (!open.length) return null;
  const clock = clockStr(now);
  return open.filter(time => time <= clock).at(-1) || null;
}
export function reminderTimes(settings) { return slotTimes(settings); }


// 载入/导入之前检测可能被规范化过程丢弃的原始喝水记录。
// 一旦发现受损条目，不静默清洗并覆盖，交给用户先导出原始数据恢复。
export function isLosslessRecordState(value) {
  if (!record(value) || !record(value.settings) || !record(value.days)) return false;
  if (value.celebrated !== undefined && !record(value.celebrated)) return false;
  if (Object.keys(value.days).length > 10000) return false;
  for (const [date, day] of Object.entries(value.days)) {
    if (!validDay(date) || !record(day) || !record(day.slots) || !Array.isArray(day.bonus)) return false;
    if (day.goal !== undefined && (!Number.isFinite(day.goal) || day.goal < 500 || day.goal > 5000)) return false;
    if (day.bonus.length > 10000) return false;
    if (day.slotMeta !== undefined && !record(day.slotMeta)) return false;
    if (record(day.slotMeta)) for (const [slot, meta] of Object.entries(day.slotMeta)) {
      if (!slotPattern.test(slot) || !Object.hasOwn(day.slots, slot) ||
          !record(meta) || typeof meta.time !== "string" || !timePattern.test(meta.time)) return false;
    }
    for (const [time, ml] of Object.entries(day.slots)) {
      if (!slotPattern.test(time) || !Number.isInteger(ml) || ml < 1 || ml > 100000) return false;
    }
    for (const entry of day.bonus) {
      if (!record(entry) || typeof entry.id !== "string" || entry.id.length > 100 ||
          !Number.isInteger(entry.ml) || entry.ml < 1 || entry.ml > 100000 ||
          typeof entry.time !== "string" || !timePattern.test(entry.time)) return false;
    }
  }
  return true;
}
