import { eggForDate, HIDDEN_EGGS } from "./eggs.js";
import {
  KEY, clamp, freshState, normalizeState, todayStr, addDays, clockStr, bounded,
  slotTimes as slotsFor, dayData as readDay, dayTotal as readTotal,
  dayDrinks as readDrinks, nextOpenSlot as findOpen, dayGoal as readGoal, isLosslessRecordState, ensureDay
} from "./core.js";
import { syncReminders, reminderDescription, reminderPlatform } from "./reminders.js";
import { exportBackup } from "./backup.js";
import { advanceWave } from "./wave.js";

const PRESETS = [100, 150, 200, 250, 300, 400, 500, 750, 1000];
const $ = id => document.getElementById(id);
let startupWarning = "";
let loadError = false;
let rawRecovery = "";
let lastPersistedRaw = null;
function load() {
  loadError = false;
  rawRecovery = "";
  try {
    const raw = localStorage.getItem(KEY);
    lastPersistedRaw = raw;
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        !parsed.settings || typeof parsed.settings !== "object" || Array.isArray(parsed.settings) ||
        !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days) ||
        !isLosslessRecordState(parsed)) {
      throw new Error("Invalid data structure");
    }
    return normalizeState(parsed);
  } catch {
    loadError = true;
    try { rawRecovery = localStorage.getItem(KEY) || ""; } catch { /* 浏览器可能拒绝存储访问 */ }
    startupWarning = "本地记录读取异常，已暂停数据修改。请先导出原始恢复文件，再导入有效备份。";
    return freshState();
  }
}
let state = load();
let viewDate = todayStr();
let lastToday = viewDate;
let selected = state.settings.defaultAmount;
let displayedTotal = 0;
let userTouchedAmount = false;
function slotTimes() { return slotsFor(state.settings); }
function dayData(date) { return readDay(state, date); }
function dayTotal(date) { return readTotal(state, date); }
function dayGoal(date) { return readGoal(state, date); }
function dayDrinks(date) { return readDrinks(state, date); }
function isToday() { return viewDate === todayStr(); }

// 先持久化候选状态，成功后才改变内存状态；配额满也不会假装打卡成功。
function commit(change) {
  if (loadError) { toast("原始数据异常，为防丢失已禁止覆盖。请先导出原始恢复文件。"); return false; }
  try {
    // 防止网页多标签页用过期状态直接覆盖另一标签页更新的记录。
    // 这降低丢失风险，但 localStorage 没有跨进程原子 compare-and-swap。
    if (localStorage.getItem(KEY) !== lastPersistedRaw) {
      state = load();
      showNumber(dayTotal(viewDate));
      renderAll();
      toast("另一窗口已修改记录，已同步最新内容，请重试");
      return false;
    }
    const next = JSON.parse(JSON.stringify(state));
    change(next);
    const serialized = JSON.stringify(next);
    localStorage.setItem(KEY, serialized);
    if (localStorage.getItem(KEY) !== serialized) throw new Error("Storage write verification failed");
    lastPersistedRaw = serialized;
    state = next;
    return true;
  } catch (error) {
    toast("保存失败：请检查设备存储空间或隐私模式");
    console.error("喝水记录保存失败", error);
    return false;
  }
}
function syncDate() {
  const now = todayStr();
  if (now === lastToday) return;
  const wasCurrent = viewDate === lastToday;
  lastToday = now;
  if (wasCurrent) switchDate(now); else renderAll();
  if (state.settings.remindersEnabled) void syncReminders(state.settings);
}


// ---------- 小工具 ----------
let toastTimer = null;
function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// 动画在切日期、连续点击时取消旧帧，避免旧数字覆盖新状态。
let numberFrame = 0;
let numberAnimating = false;
function showNumber(value) {
  cancelAnimationFrame(numberFrame);
  numberAnimating = false;
  displayedTotal = value;
  $("totalNum").textContent = String(value);
}
function animateNumber(to) {
  const startValue = Number($("totalNum").textContent) || 0;
  cancelAnimationFrame(numberFrame);
  displayedTotal = to;
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showNumber(to); return;
  }
  numberAnimating = true;
  const start = performance.now();
  const duration = Math.min(1800, 300 + Math.abs(to - startValue) * 1.3);
  function frame(now) {
    const p = clamp((now - start) / duration, 0, 1);
    $("totalNum").textContent = String(Math.round(startValue + (to - startValue) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) numberFrame = requestAnimationFrame(frame);
    else { numberAnimating = false; $("totalNum").textContent = String(to); }
  }
  numberFrame = requestAnimationFrame(frame);
}


// ---------- 选水量：预设滑块 + 直接输入 + ±50 步进 ----------
// 入场：滑块先从一个随机的非 250 选项滑到 250，~120ms 内开始；用户一点就取消。
const track = $("presetTrack"), pill = $("presetPill");
let presetBtns = [];
function buildPresets() {
  track.querySelectorAll("button").forEach(b => b.remove());
  presetBtns = PRESETS.map(v => {
    const b = document.createElement("button");
    b.textContent = v; b.dataset.v = v; b.type = "button";
    b.addEventListener("click", () => { userTouchedAmount = true; setAmount(v, true); });
    track.appendChild(b); return b;
  });
  positionPill(false);
}
function positionPill(animate = true) {
  const btn = presetBtns.find(b => +b.dataset.v === selected);
  if (!btn) { pill.style.opacity = "0"; return; }
  pill.style.opacity = "1";
  pill.style.transition = animate ? "" : "none";
  pill.style.left = btn.offsetLeft + "px"; pill.style.width = btn.offsetWidth + "px";
  presetBtns.forEach(b => b.classList.toggle("sel", +b.dataset.v === selected));
}
function setAmount(v, fromUser = false) {
  selected = bounded(v, selected, 10, 2000, 10);
  $("amountNum").textContent = selected;
  $("amountInput").value = selected;
  positionPill(true);
  if (fromUser) {
    userTouchedAmount = true;
    scrollPresetIntoView(presetBtns.find(b => +b.dataset.v === selected));
  }
}
function scrollPresetIntoView(button) {
  if (!button) return;
  const left = button.offsetLeft - (track.clientWidth - button.offsetWidth) / 2;
  const max = Math.max(0, track.scrollWidth - track.clientWidth);
  const target = clamp(left, 0, max);
  track.scrollTo({ left: target, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
// 入场只移动装饰性 pill，不能改真实 selected 或输入框，避免第一次输入跳值。
function introSlider() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const visible = presetBtns.filter(btn => btn.offsetLeft + btn.offsetWidth <= track.clientWidth);
  const candidates = visible.filter(btn => Number(btn.dataset.v) !== selected);
  const destination = presetBtns.find(btn => Number(btn.dataset.v) === selected);
  if (!candidates.length || !destination) return;
  const start = candidates[Math.floor(Math.random() * candidates.length)];
  pill.style.transition = "none";
  pill.style.left = start.offsetLeft + "px";
  pill.style.width = start.offsetWidth + "px";
  presetBtns.forEach(btn => btn.classList.toggle("sel", btn === start));
  setTimeout(() => {
    if (userTouchedAmount) { positionPill(false); return; }
    requestAnimationFrame(() => { if (!userTouchedAmount) positionPill(true); });
  }, 120);
}
// 长按连续增减
function holdable(btn, fn) {
  let t = null, iv = null;
  const start = (e) => { e.preventDefault(); fn(); t = setTimeout(() => { iv = setInterval(fn, 70); }, 350); };
  const stop = () => { clearTimeout(t); clearInterval(iv); };
  btn.addEventListener("pointerdown", start);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, stop));
}
$("minusBtn").addEventListener("click", () => {});
$("plusBtn").addEventListener("click", () => {});
holdable($("minusBtn"), () => setAmount(selected - 50, true));
holdable($("plusBtn"), () => setAmount(selected + 50, true));
for (const [id, delta] of [["minusBtn", -50], ["plusBtn", 50]]) {
  $(id).addEventListener("click", e => { if (e.detail === 0) setAmount(selected + delta, true); });
}
// input 即时更新选择并阻止入场动画覆盖；change/blur 时才规范输入框数值。
$("amountInput").addEventListener("input", e => {
  userTouchedAmount = true;
  const raw = e.target.value;
  if (raw !== "" && Number.isFinite(Number(raw))) {
    selected = bounded(raw, selected, 10, 2000, 10);
    $("amountNum").textContent = String(selected);
    positionPill(true);
    scrollPresetIntoView(presetBtns.find(b => +b.dataset.v === selected));
  }
});
$("amountInput").addEventListener("change", () => setAmount($("amountInput").value, true));
$("amountInput").addEventListener("blur", () => setAmount($("amountInput").value, true));

// ---------- 打卡 / 额外加喝 ----------
function checkinSlot(date, time, ml) {
  const before = dayTotal(date);
  if (!commit(next => {
    const d = ensureDay(next, date);
    if (Object.hasOwn(d.slots, time)) {
      delete d.slots[time];
      delete d.slotMeta[time];
    } else {
      d.slots[time] = ml;
      d.slotMeta[time] = { time: clockStr() };
    }
  })) return false;
  afterChange(date, before);
  return true;
}
function addBonus(date, ml) {
  const before = dayTotal(date);
  const time = date === todayStr() ? clockStr() : $("historyTime").value;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) { toast("请选择正确的补记时间"); return false; }
  const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2), ml, time };
  if (!commit(next => { ensureDay(next, date).bonus.push(entry); })) return false;
  afterChange(date, before);
  return true;
}
function removeBonus(date, id) {
  const before = dayTotal(date);
  if (!commit(next => {
    const d = ensureDay(next, date);
    d.bonus = d.bonus.filter(b => b.id !== id);
  })) return;
  afterChange(date, before);
}
$("checkinBtn").addEventListener("click", () => {
  userTouchedAmount = true;
  syncDate();
  if (!isToday()) { toast("只能给今天打卡，请切换到今天"); return; }
  const time = findOpen(state, viewDate);
  if (!time) {
    const pending = slotTimes().some(t => !Object.hasOwn(dayData(viewDate).slots, t));
    toast(pending ? "下一个打卡时段尚未开始；已经喝的水可使用额外加喝" : "今天的时段都已打卡，可额外加喝");
    return;
  }
  if (checkinSlot(viewDate, time, selected)) toast(time + " 打卡 +" + selected + " ml");
});
$("extraBtn").addEventListener("click", () => {
  userTouchedAmount = true;
  syncDate();
  if (addBonus(viewDate, selected)) toast("额外加喝 +" + selected + " ml");
});
$("bonusList").addEventListener("click", e => {
  const btn = e.target.closest("[data-undo]");
  if (btn) removeBonus(viewDate, btn.dataset.undo);
});
function afterChange(date, before) {
  const after = dayTotal(date);
  animateNumber(after);
  renderAll();
  if (date === todayStr()) {
    const goal = dayGoal(date);
    if (before < goal && after >= goal && !state.celebrated[date]) {
      if (commit(next => { next.celebrated[date] = true; })) celebrate();
    }
    if (before <= goal && after > goal) breakBall();
    if (before > goal && after <= goal) healBall();
    splash();
  }
}


// ---------- 庆祝：五彩纸屑 110 片、3 波、约 6.5 秒 + 水球弹性缩放 ----------
let activeConfettiFrame = 0;
let confettiBurstVersion = 0;
let activeSquashTimer = 0;
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // 同一画布只能有一条纸屑 RAF 循环：短时间重复达标时取消上一轮。
  const version = ++confettiBurstVersion;
  cancelAnimationFrame(activeConfettiFrame);
  const wrap = $("ballWrap");
  clearTimeout(activeSquashTimer);
  wrap.classList.remove("squash");
  void wrap.offsetWidth; // 重新触发 CSS 动画，不让上次的 timeout 提前终止新一轮
  wrap.classList.add("squash");
  activeSquashTimer = setTimeout(() => wrap.classList.remove("squash"), 700);
  if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
  const cv = $("confetti"), ctx = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ["#f2b705", "#1e6fd9", "#e85a8a", "#1fae7a", "#8a5cf6", "#ff8a3a"];
  const pieces = [];
  for (let w = 0; w < 3; w++)
    for (let i = 0; i < 37; i++)
      pieces.push({ x: Math.random() * cv.width, y: -20 - w * 90 - Math.random() * 60,
        vx: (Math.random() - .5) * 2.2, vy: 1.6 + Math.random() * 2.4,
        s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .2,
        c: colors[(i + w) % colors.length], delay: w * 900 });
  const t0 = performance.now();
  (function frame(now) {
    if (version !== confettiBurstVersion) return;
    const t = now - t0; ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    for (const p of pieces) {
      if (t < p.delay) { alive = true; continue; }
      p.x += p.vx + Math.sin(t / 300 + p.s) * .4; p.y += p.vy; p.r += p.vr;
      if (p.y < cv.height + 20) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (alive && t < 6500) activeConfettiFrame = requestAnimationFrame(frame);
    else { activeConfettiFrame = 0; ctx.clearRect(0, 0, cv.width, cv.height); }
  })(t0);
}

// ---------- 破裂 / 溢出 ----------
let broken = false;
function breakBall() {
  broken = true;
  $("ballWrap").classList.add("broken");
  if (navigator.vibrate) navigator.vibrate(120); // 破开打击感 + 震动
  spawnShards();
  toast("水满出来啦！水球破了个口子");
}
function healBall() {
  broken = false;
  $("ballWrap").classList.remove("broken");
}
function spawnShards() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = $("ballWrap").getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("div"); s.className = "shard";
    s.style.left = r.left + r.width * (0.25 + Math.random() * 0.5) + "px";
    s.style.top = r.top + r.height * 0.15 + "px";
    document.body.appendChild(s);
    const dx = (Math.random() - .5) * 260, dy = 120 + Math.random() * 160, rot = (Math.random() - .5) * 540;
    s.animate([
      { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 1, offset: .5 },
      { transform: `translate(${dx}px, ${dy + 40}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 3200, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    setTimeout(() => s.remove(), 3400); // 碎片约 1.6 秒保持不透明、再约 1.6 秒淡出
  }
}

// ---------- 水球：heightfield 波浪模拟 ----------
// 一维高度场：每点有高度与速度，弹簧拉回静水位，相邻点互相拉动；
// 倾斜 / 摇晃给水面一个横向力；水位按真实总量平滑上升，不跳变。
const ballCv = $("ball"), bctx = ballCv.getContext("2d");
const N = 110;
let wave = new Float32Array(N), vel = new Float32Array(N);
const waveScratch = new Float32Array(N);
let visualLevel = 0;      // 0..1，画面水位（平滑追赶真实水位）
let spillVisual = 0;
let tiltX = 0, tiltY = 0; // 设备倾斜（-1..1）
let shakeEnergy = 0;
// Electron 桌面版：拖动窗口产生的等效倾斜（与设备倾斜叠加，停下后按帧衰减）。
let windowTiltX = 0, windowTiltY = 0, lastWindowMotionT = 0;
function effTiltX() { return clamp(tiltX + windowTiltX, -1, 1); }
let lastSplash = 0;

function targetLevel() {
  const t = dayTotal(viewDate) / dayGoal(viewDate);
  return clamp(t, 0, 1); // 超量时水面停在裂口高度，多余的水走溢流
}
function splash(strength = 1) {
  const now = performance.now(); if (now - lastSplash < 120) return; lastSplash = now;
  for (let i = 0; i < N; i++) vel[i] += (Math.random() - .5) * 2.4 * strength;
  shakeEnergy = Math.min(3, shakeEnergy + 1.2 * strength);
}
function stepWave() {
  const target = targetLevel();
  visualLevel += (target - visualLevel) * 0.045; // 平滑上升，不跳变
  spillVisual += ((broken ? 1 : 0) - spillVisual) * 0.085;
  // 使用上一帧采样快照积分，避免原位更新相邻点导致能量指数发散。
  if (performance.now() - lastWindowMotionT > 120) {
    windowTiltX *= 0.92;
    windowTiltY *= 0.92;
  }
  const slope = effTiltX() * 14 + (Math.random() - .5) * shakeEnergy;
  advanceWave(wave, vel, waveScratch, slope);
  shakeEnergy *= 0.94;
}
function eggTheme() { return eggForDate(viewDate); }
function drawBall() {
  const W = ballCv.width, H = ballCv.height, cx = W / 2, cy = H / 2, R = W / 2 - 6;
  bctx.clearRect(0, 0, W, H);
  const theme = eggTheme();
  const top = theme ? theme.top : "#bfe8ff", deep = theme ? theme.deep : "#1e6fd9";
  // 玻璃球底
  bctx.save();
  bctx.beginPath(); bctx.arc(cx, cy, R, 0, Math.PI * 2); bctx.clip();
  bctx.fillStyle = "#f2f8ff"; bctx.fillRect(0, 0, W, H);
  // 水体
  const levelY = cy + R - visualLevel * 2 * R;
  const grad = bctx.createLinearGradient(0, levelY - 30, 0, H);
  grad.addColorStop(0, top); grad.addColorStop(1, deep);
  bctx.beginPath(); bctx.moveTo(cx - R, H);
  for (let i = 0; i < N; i++) {
    const x = cx - R + (2 * R * i) / (N - 1);
    bctx.lineTo(x, levelY + wave[i]);
  }
  bctx.lineTo(cx + R, H); bctx.closePath();
  bctx.fillStyle = grad; bctx.fill();
  // 气泡
  bctx.fillStyle = "rgba(255,255,255,.5)";
  for (let i = 0; i < 8; i++) {
    const bx = cx + Math.sin(performance.now() / 900 + i * 2.1) * R * .6;
    const depth = Math.max(0, cy + R - levelY);
    if (depth < 8) continue;
    const by = levelY + depth - ((performance.now() / 14 + i * 97) % depth);
    if (by > levelY + 6) { bctx.beginPath(); bctx.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2); bctx.fill(); }
  }
  // 高光
  bctx.strokeStyle = "rgba(255,255,255,.55)"; bctx.lineWidth = 10; bctx.lineCap = "round";
  bctx.beginPath(); bctx.arc(cx, cy, R - 18, Math.PI * 1.15, Math.PI * 1.45); bctx.stroke();
  bctx.restore();
  // 球框
  bctx.beginPath(); bctx.arc(cx, cy, R, 0, Math.PI * 2);
  bctx.strokeStyle = "rgba(30,111,217,.35)"; bctx.lineWidth = 4; bctx.stroke();
  drawPuddle();
}
// 溢流：只有水面盖到裂口（即满了）才出水，遵循真实重力方向；
// 流速按 Torricelli：v ∝ sqrt(超量水头)，超得越多流得越快。
function drawPuddle() {
  const cv = $("puddle"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
  if (spillVisual < 0.005) return;
  const excess = Math.max(0, dayTotal(viewDate) - dayGoal(viewDate));
  const head = clamp(excess / dayGoal(viewDate), 0, 1);
  const flow = Math.sqrt(head) * spillVisual; // 破裂 / 愈合都有平滑过渡
  const t = performance.now() / 1000;
  // 沿球面流下的水线（方向随倾斜偏移）
  ctx.globalAlpha = spillVisual;
  ctx.strokeStyle = "rgba(30,111,217,.55)"; ctx.lineWidth = 2 + flow * 7; ctx.lineCap = "round";
  ctx.beginPath();
  const tx = effTiltX();
  const sx = W / 2 + tx * 60;
  ctx.moveTo(sx, 0);
  ctx.quadraticCurveTo(sx + Math.sin(t * 3) * 14, H * .5, sx + tx * 90, H);
  ctx.stroke();
  // 下方卡片上的涟漪水洼
  const pw = W * (0.25 + flow * 0.55);
  ctx.fillStyle = "rgba(30,111,217,.16)";
  ctx.beginPath(); ctx.ellipse(W / 2 + tx * 90, H - 12, pw / 2, 12 + Math.sin(t * 2) * 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(30,111,217,.35)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(W / 2 + tx * 90, H - 12, pw / 2 * (0.6 + 0.2 * Math.sin(t * 2.4)), 8, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}
// 固定步长模拟，避免高刷新率屏幕出现波浪速度翻倍/跳帧。
let previousFrame = 0, accumulator = 0;
function loop(now) {
  const elapsed = previousFrame ? Math.min(50, now - previousFrame) : 16.67;
  previousFrame = now;
  if (!document.hidden) {
    accumulator = Math.min(50, accumulator + elapsed);
    while (accumulator >= 16.67) { stepWave(); accumulator -= 16.67; }
    drawBall();
  } else accumulator = 0;
  requestAnimationFrame(loop);
}

// ---------- 每日完整 24 小时的饮水曲线（每杯，不累计） ----------
function drawCurve() {
  const cv = $("curve"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
  const padL = 44, padR = 36, padT = 18, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const drinks = dayDrinks(viewDate);
  cv.setAttribute("role", "img");
  cv.setAttribute("aria-label", drinks.length
    ? `${viewDate} 共 ${drinks.length} 次饮水：${drinks.slice(0, 24).map(d => `${d.time} ${d.ml} 毫升`).join("；")}${drinks.length > 24 ? "等" : ""}`
    : `${viewDate} 暂无饮水记录`);
  const maxMl = Math.max(500, ...drinks.map(d => d.ml));
  const xFor = mins => x0 + (mins / 1440) * (x1 - x0);
  const yFor = (ml) => y1 - (ml / maxMl) * (y1 - y0);
  ctx.strokeStyle = "#e3eaf2"; ctx.lineWidth = 1;
  [0, .5, 1].forEach(f => { ctx.beginPath(); ctx.moveTo(x0, y0 + (y1 - y0) * f); ctx.lineTo(x1, y0 + (y1 - y0) * f); ctx.stroke(); });
  ctx.fillStyle = "#6b7a90"; ctx.font = "22px sans-serif"; ctx.textAlign = "center";
  ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"].forEach((t, i) => {
    ctx.fillText(t, xFor(i * 240), H - 4);
  });
  const pts = drinks.map(d => {
    const [hour, minute] = d.time.split(":").map(Number);
    return { x: xFor(hour * 60 + minute), y: yFor(d.ml), ml: d.ml };
  });
  if (pts.length) {
    ctx.strokeStyle = "#1e6fd9"; ctx.lineWidth = 3; ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fillStyle = "#1e6fd9"; ctx.fill();
      ctx.fillStyle = "#17233b"; ctx.fillText(p.ml, p.x, p.y - 12);
    });
  } else {
    ctx.fillStyle = "#6b7a90"; ctx.textAlign = "center";
    ctx.fillText(isToday() ? "今天还没喝水，喝一杯就会出现在这里" : "这一天没有饮水记录", W / 2, H / 2);
  }
}

// ---------- 渲染 ----------
function renderAll() {
  const total = dayTotal(viewDate), goal = dayGoal(viewDate);
  $("goalLabel").textContent = `目标 ${goal} ml`;
  $("leftLabel").textContent = total >= goal ? `已超 ${total - goal} ml` : `还差 ${goal - total} ml`;
  if (!numberAnimating) $("totalNum").textContent = String(displayedTotal);
  const egg = eggTheme();
  $("eggNote").textContent = egg ? `今日饮品：${egg.name} — ${egg.note}` : "";
  // 隐藏彩蛋扩展点：按日期 / 时刻 / 动作触发的非饮品彩蛋在此挂接（原版内容不捏造）
  for (const h of HIDDEN_EGGS) { try { if (h.when(state, new Date())) h.apply(egg); } catch { /* 忽略单个彩蛋错误 */ } }
  // 日期标签与按钮状态
  const label = isToday() ? "今天" : viewDate === addDays(todayStr(), -1) ? "昨天" : viewDate;
  $("dateLabel").textContent = label;
  $("slotsTitle").textContent = isToday() ? "今天的时段" : viewDate + " 的时段";
  $("curveTitle").textContent = isToday() ? "今日每杯曲线" : viewDate + " 每杯曲线";
  $("slotsHint").textContent = isToday() ? "点一下已经开始的时段进行打卡，再点一次撤销。" : "历史时段不可更改，若需补记可使用额外加喝并选择饮水时间。";
  $("nextDay").disabled = viewDate >= todayStr();
  const reached = total >= goal;
  $("checkinBtn").style.display = (reached || !isToday()) ? "none" : "";
  $("extraBtn").style.flex = (reached || !isToday()) ? "1" : "";
  $("actionRow").style.flexDirection = "row";
  $("actionHint").textContent = (reached || !isToday())
    ? "已达标或查看历史时仍可额外加喝。"
    : "自动打卡仅占用已经到达的空时段。按默认时段合计 " + (slotTimes().length * state.settings.defaultAmount) + " ml；不够目标的部分可用额外加喝。";
  // 时段按钮按日期/时段复用，保持焦点与背景过渡，避免每次打卡闪白或丢键盘焦点。
  const d = dayData(viewDate);
  const slotsHost = $("slots");
  const configured = slotTimes();
  const activeTimes = [...new Set([...configured, ...Object.keys(d.slots)])].sort();
  const existing = new Map([...slotsHost.children].map(button => [button.dataset.slotKey, button]));
  const expected = new Set();
  for (const [index, t] of activeTimes.entries()) {
    const key = viewDate + "|" + t;
    expected.add(key);
    let button = existing.get(key);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset.slotKey = key;
      button.className = "slot press";
      const title = document.createElement("div"); title.className = "t"; title.textContent = t;
      const value = document.createElement("div"); value.className = "v";
      button.append(title, value);
      const selectedDate = viewDate;
      button.addEventListener("click", () => {
        userTouchedAmount = true;
        if (selectedDate !== viewDate || !isToday()) { toast("只能改今天的时段"); return; }
        if (!Object.hasOwn(dayData(selectedDate).slots, t) && t > clockStr()) {
          toast("该时段还未到；已经喝的水请使用额外加喝"); return;
        }
        checkinSlot(selectedDate, t, selected);
      });
    }
    const completed = Object.hasOwn(d.slots, t);
    button.classList.toggle("done", completed);
    button.setAttribute("aria-pressed", String(completed));
    button.querySelector(".v").textContent = completed
      ? d.slots[t] + " ml ✓" + (configured.includes(t) ? "" : " · 旧时段")
      : "未喝";
    // 同一列表再次渲染时，不对原节点做 remove/insert，CSS transition 能连续运行。
    if (slotsHost.children[index] !== button) {
      slotsHost.insertBefore(button, slotsHost.children[index] || null);
    }
  }
  for (const button of [...slotsHost.children]) {
    if (!expected.has(button.dataset.slotKey)) button.remove();
  }
  // 额外加喝列表 + 撤销
  $("bonusList").innerHTML = "";
  d.bonus.forEach(b => {
    const li = document.createElement("li");
    const description = document.createElement("span"); description.textContent = "额外加喝 " + b.ml + " ml · " + b.time;
    const undo = document.createElement("button"); undo.className = "undo"; undo.dataset.undo = b.id; undo.textContent = "撤销";
    li.append(description, undo); $("bonusList").appendChild(li);
  });
  $("historyTimeRow").hidden = isToday();
  if (!$("historyTime").value) $("historyTime").value = "12:00";
  $("toggleReminders").textContent = state.settings.remindersEnabled ? "关闭系统提醒" : "开启系统提醒";
  $("toggleReminders").setAttribute("aria-pressed", String(state.settings.remindersEnabled));
  $("reminderStatus").textContent = (state.settings.remindersEnabled ? "已启用 · " : "未启用 · ") + reminderDescription();
  // 连续达标
  let streak = 0;
  for (let i = 0; ; i++) {
    const ds = addDays(todayStr(), -i);
    if (dayTotal(ds) >= dayGoal(ds)) streak++; else break;
  }
  $("streak").textContent = `连续达标 ${streak} 天`;
  drawCurve(); renderHist7();
  broken = total > goal;
  $("ballWrap").classList.toggle("broken", broken);
}
function renderHist7() {
  const el = $("hist7"); el.innerHTML = "";
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(todayStr(), -i), total = dayTotal(ds);
    const pct = clamp(total / dayGoal(ds), 0, 1);
    const col = document.createElement("div");
    col.className = "hist-bar" + (i === 0 ? " today" : "");
    col.innerHTML = `<div class="bar" style="height:${Math.max(4, pct * 82)}px"></div><div class="d">${ds.slice(5)}</div>`;
    col.title = `${ds}：${total} ml`;
    el.appendChild(col);
  }
}
function renderHist90() {
  const el = $("hist90"); el.innerHTML = "";
  for (let i = 0; i < 90; i++) {
    const ds = addDays(todayStr(), -i), total = dayTotal(ds);
    const row = document.createElement("div"); row.className = "hist90-row";
    row.innerHTML = `<span class="d">${ds}</span><span class="track"><span class="fill" style="display:block;width:${clamp(total / dayGoal(ds) * 100, 0, 100)}%"></span></span><span class="v">${total} ml</span>`;
    row.addEventListener("click", () => {
      switchDate(ds);
      $("historyOverlay").classList.remove("open");
    });
    el.appendChild(row);
  }
}
$("openHistory").addEventListener("click", () => { renderHist90(); $("historyOverlay").classList.add("open"); });
$("closeHistory").addEventListener("click", () => $("historyOverlay").classList.remove("open"));
$("historyOverlay").addEventListener("click", (e) => { if (e.target === $("historyOverlay")) $("historyOverlay").classList.remove("open"); });
function switchDate(date) {
  viewDate = date;
  // 保留上一天的可视水位，固定步长物理循环会把水面平滑过渡至新日期。
  // 此处不能同步重设 visualLevel，否则切换时会出现一帧瞬移。
  showNumber(dayTotal(viewDate)); renderAll();
}
$("prevDay").addEventListener("click", () => { syncDate(); switchDate(addDays(viewDate, -1)); });
$("nextDay").addEventListener("click", () => { syncDate(); if (viewDate < todayStr()) switchDate(addDays(viewDate, 1)); });

// ---------- 设置 ----------
function fillSettings() {
  $("setGoal").value = state.settings.goal;
  $("setAmount").value = state.settings.defaultAmount;
  $("setStart").value = state.settings.startHour;
  $("setInterval").value = state.settings.intervalHours;
}
$("saveSettings").addEventListener("click", async () => {
  const updated = {
    goal: bounded($("setGoal").value, state.settings.goal, 500, 5000, 50),
    defaultAmount: bounded($("setAmount").value, state.settings.defaultAmount, 10, 2000, 10),
    startHour: bounded($("setStart").value, state.settings.startHour, 0, 22),
    intervalHours: bounded($("setInterval").value, state.settings.intervalHours, 1, 4)
  };
  if (!commit(next => {
    Object.assign(next.settings, updated);
    if (next.days[todayStr()]) next.days[todayStr()].goal = updated.goal;
  })) return;
  setAmount(state.settings.defaultAmount, true); fillSettings(); renderAll();
  const result = await syncReminders(state.settings);
  toast(result.ok ? "设置已保存" : "设置已保存，但提醒更新失败：" + result.message);
});
$("clearToday").addEventListener("click", () => {
  if (!confirm("清空今天的全部打卡记录？此操作无法撤销，建议先导出备份。")) return;
  if (!commit(next => {
    next.days[todayStr()] = { goal: next.settings.goal, slots: {}, slotMeta: {}, bonus: [] };
    delete next.celebrated[todayStr()];
  })) return;
  showNumber(dayTotal(viewDate)); renderAll(); toast("今天已清空");
});
$("toggleReminders").addEventListener("click", async () => {
  const button = $("toggleReminders"); button.disabled = true;
  const proposed = { ...state.settings, remindersEnabled: !state.settings.remindersEnabled };
  const result = await syncReminders(proposed, proposed.remindersEnabled);
  if (!result.ok) { toast(result.message); button.disabled = false; return; }
  if (!commit(next => { next.settings.remindersEnabled = proposed.remindersEnabled; })) {
    await syncReminders(state.settings); button.disabled = false; return;
  }
  button.disabled = false; renderAll();
  toast(proposed.remindersEnabled ? "已开启系统提醒" : "已关闭系统提醒");
});
$("exportData").addEventListener("click", async () => {
  const button = $("exportData");
  button.disabled = true;
  try {
    const payload = loadError
      ? { format: "hsdq-raw-recovery-v1", exportedAt: new Date().toISOString(), raw: rawRecovery }
      : { format: "hsdq-backup-v1", exportedAt: new Date().toISOString(), state };
    const name = loadError ? "he-shui-da-ka-raw-recovery-" : "he-shui-da-ka-";
    await exportBackup(JSON.stringify(payload, null, 2), name + todayStr() + ".json");
    toast(loadError ? "已导出原始恢复文件，请妥善保管" : "请选择保存位置并保留备份文件");
  } catch (error) {
    toast("导出失败：" + (error?.message || "请重试"));
  } finally {
    button.disabled = false;
  }
});
$("importData").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async e => {
  const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB");
    const backup = JSON.parse(await file.text());
    if (backup?.format !== "hsdq-backup-v1" || !backup.state?.settings || !backup.state?.days) throw new Error("备份结构或版本不匹配");
    if (!isLosslessRecordState(backup.state)) throw new Error("备份存在格式损坏的记录，已拒绝导入以防丢失数据");
    const incoming = normalizeState(backup.state);
    const count = Object.keys(incoming.days).length;
    if (!confirm("将用备份中的 " + count + " 天记录和设置替换本机全部数据。建议先导出旧数据。确定导入吗？")) return;
    const serialized = JSON.stringify(incoming);
    localStorage.setItem(KEY, serialized);
    lastPersistedRaw = serialized;
    state = incoming; loadError = false; rawRecovery = ""; startupWarning = "";
    lastToday = todayStr(); switchDate(lastToday);
    fillSettings(); setAmount(state.settings.defaultAmount);
    const result = await syncReminders(state.settings);
    toast(result.ok ? "备份导入成功" : "备份已导入，提醒同步失败：" + result.message);
  } catch (error) { toast("导入失败：" + error.message); }
});


// ---------- 晃动 / 倾斜：deviceorientation + devicemotion ----------
// iOS 需要用户手势授权，所以是个按钮；安卓 / 桌面直接监听。
let motionOn = false;
async function enableMotion() {
  try {
    const permissions = [];
    // iOS 需要在同一次用户点击中发起方向与加速度的权限请求。
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      permissions.push(DeviceOrientationEvent.requestPermission());
    }
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      permissions.push(DeviceMotionEvent.requestPermission());
    }
    if ((await Promise.all(permissions)).some(result => result !== "granted")) {
      toast("未获得全部运动传感器权限"); return;
    }
    motionOn = true; $("shakeBtn").textContent = "晃动已开"; $("shakeBtn").classList.add("on");
    toast("晃动已开：倾斜手机，水面会跟着晃");
  } catch { toast("这台设备不支持晃动"); }
}
$("shakeBtn").addEventListener("click", enableMotion);
window.addEventListener("deviceorientation", (e) => {
  if (!motionOn || e.gamma == null) return;
  tiltX = clamp(e.gamma / 45, -1, 1);
  tiltY = clamp((e.beta ?? 0) / 45, -1, 1);
});
window.addEventListener("devicemotion", (e) => {
  if (!motionOn) return;
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0);
  if (mag > 32) { shakeEnergy = Math.min(3, shakeEnergy + 1); if (broken) splash(0.6); }
});
// Electron 桌面版：拖动窗口 → 水面晃动。
// 主进程把窗口移动算出的速度 / 加速度经 IPC 发过来（window.hsdq，见 preload.cjs）；
// 网页版没有这个对象，直接跳过。负号是惯性：窗口向右加速，水涌向左。
// 拖得越快 energy 越大、晃得越厉害；停下后主进程补发 settled，叠加 stepWave 里的
// 衰减，水面慢慢平复。破了口时拖得猛了也会把水晃出来（splash）。
if (window.hsdq && typeof window.hsdq.onWindowMotion === "function") {
  window.hsdq.onWindowMotion((m) => {
    lastWindowMotionT = performance.now();
    if (m.settled) { windowTiltX = 0; windowTiltY = 0; return; }
    windowTiltX = clamp(-(m.vx / 500) - (m.ax || 0) / 6000, -1, 1);
    windowTiltY = clamp(-(m.vy / 500) - (m.ay || 0) / 6000, -1, 1);
    shakeEnergy = Math.min(3, shakeEnergy + (m.energy || 0) * 0.6);
    if (broken && (m.energy || 0) > 0.8) splash(0.6);
  });
}
// 桌面：鼠标拖动水球也能晃一下（方便测试）
let dragging = false;
ballCv.addEventListener("pointerdown", () => { dragging = true; });
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  tiltX = clamp((e.clientX / innerWidth - .5) * 2, -1, 1);
});
function endDrag() { dragging = false; tiltX = 0; }
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
window.addEventListener("blur", endDrag);
window.addEventListener("resize", () => positionPill(false));

// ---------- 启动 ----------
buildPresets();
fillSettings();
setAmount(state.settings.defaultAmount);
showNumber(dayTotal(viewDate));
visualLevel = targetLevel();
renderAll();
introSlider();
window.addEventListener("storage", e => {
  if (e.key !== KEY) return;
  state = load(); showNumber(dayTotal(viewDate));
  fillSettings(); renderAll(); void syncReminders(state.settings);
});
window.addEventListener("focus", syncDate);
document.addEventListener("visibilitychange", () => {
  previousFrame = 0; accumulator = 0;
  if (!document.hidden) syncDate();
});
setInterval(syncDate, 30000);
void syncReminders(state.settings).then(result => {
  if (!result.ok && state.settings.remindersEnabled) toast(result.message);
});
if (startupWarning) toast(startupWarning);


requestAnimationFrame(loop);
