import { eggForDate, HIDDEN_EGGS } from "./eggs.js";

// ---------- 存储：localStorage only，初始为空（无演示数据、无真实数据） ----------
const KEY = "hsdq-v1";
const PRESETS = [100, 150, 200, 250, 300, 400, 500, 750, 1000];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (id) => document.getElementById(id);

function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(str, n) {
  const [y, m, d] = str.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.settings && s.days) return s; }
  } catch { /* 损坏则重建 */ }
  return { settings: { goal: 2000, defaultAmount: 250, startHour: 8, intervalHours: 2, removedSlots: [] },
           days: {}, celebrated: {} };
}
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 容量满时静默失败 */ } }

let viewDate = todayStr();          // 正在看的日期（默认今天）
let selected = state.settings.defaultAmount;
let displayedTotal = 0;             // 屏幕上滚动显示的数字
let userTouchedAmount = false;      // 入场滑块动画是否被用户打断

// ---------- 日期 / 时段 ----------
function slotTimes() {
  const { startHour, intervalHours, removedSlots } = state.settings;
  const out = [];
  for (let h = startHour; h <= 20; h += intervalHours) {
    const t = String(h).padStart(2, "0") + ":00";
    if (!removedSlots.includes(t)) out.push(t);
  }
  return out.length ? out : ["08:00"];
}
function dayData(date) { return state.days[date] || { slots: {}, bonus: [] }; }
function ensureDay(date) { if (!state.days[date]) state.days[date] = { slots: {}, bonus: [] }; return state.days[date]; }
function dayTotal(date) {
  const d = dayData(date);
  return Object.values(d.slots).reduce((a, b) => a + b, 0) + d.bonus.reduce((a, b) => a + b.ml, 0);
}
function dayDrinks(date) { // 每杯记录：{ time: "HH:MM", ml }，按时间排
  const d = dayData(date);
  const list = Object.entries(d.slots).map(([time, ml]) => ({ time, ml, kind: "slot" }));
  for (const b of d.bonus) list.push({ time: b.time, ml: b.ml, kind: "bonus" });
  return list.sort((a, b) => a.time.localeCompare(b.time));
}
function isToday() { return viewDate === todayStr(); }
function goalReached(date) { return dayTotal(date) >= state.settings.goal; }

// ---------- 小工具 ----------
let toastTimer = null;
function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// 数字逐位滚动：先快后慢，最多 2 秒，与水位上升同步。
function animateNumber(from, to, dur = 1400) {
  const start = performance.now(); const el = $("totalNum");
  function frame(now) {
    const p = clamp((now - start) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3); // 先快后慢
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
  selected = clamp(Math.round(v / 10) * 10, 10, 2000);
  $("amountNum").textContent = selected;
  $("amountInput").value = selected;
  positionPill(true);
  if (fromUser) userTouchedAmount = true;
}
function introSlider() {
  const others = PRESETS.filter(v => v !== state.settings.defaultAmount);
  const start = others[Math.floor(Math.random() * others.length)];
  selected = start; $("amountNum").textContent = start; $("amountInput").value = start;
  positionPill(false);
  setTimeout(() => {
    if (userTouchedAmount) return;
    setAmount(state.settings.defaultAmount);
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
$("amountInput").addEventListener("change", () => setAmount(+$("amountInput").value || 250, true));

// ---------- 打卡 / 额外加喝 ----------
function nextOpenSlot(date) {
  const d = dayData(date);
  return slotTimes().find(t => !(t in d.slots)) || null;
}
function checkinSlot(date, time, ml) {
  const d = ensureDay(date);
  const before = dayTotal(date);
  if (time in d.slots) delete d.slots[time]; else d.slots[time] = ml;
  save(); afterChange(date, before);
}
function addBonus(date, ml) {
  const d = ensureDay(date);
  const before = dayTotal(date);
  const now = new Date();
  d.bonus.push({ id: Date.now() + Math.random().toString(36).slice(2, 7),
    ml, time: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") });
  save(); afterChange(date, before);
  return d.bonus[d.bonus.length - 1];
}
function removeBonus(date, id) {
  const d = dayData(date); const before = dayTotal(date);
  d.bonus = d.bonus.filter(b => b.id !== id);
  save(); afterChange(date, before);
}
$("checkinBtn").addEventListener("click", () => {
  if (!isToday()) { toast("只能给今天打卡，看看今天吧"); return; }
  const t = nextOpenSlot(viewDate);
  if (!t) { toast("今天的时段都喝完啦，可以额外加喝"); return; }
  checkinSlot(viewDate, t, selected);
  toast(`${t} 打卡 +${selected}ml`);
});
$("extraBtn").addEventListener("click", () => {
  addBonus(viewDate, selected);
  toast(`额外加喝 +${selected}ml`);
});
$("bonusList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-undo]"); if (!btn) return;
  removeBonus(viewDate, btn.dataset.undo);
});

// 打卡后：数字滚动、水位、达标庆祝、破裂，只在「跨过目标的那一刻」触发一次。
function afterChange(date, before) {
  const after = dayTotal(date);
  const goal = state.settings.goal;
  animateNumber(displayedTotal, after, Math.min(2000, 300 + Math.abs(after - displayedTotal) * 2));
  displayedTotal = after;
  renderAll();
  if (date !== todayStr()) return; // 往日补记不庆祝、不破裂
  if (before < goal && after >= goal && !state.celebrated[date]) {
    state.celebrated[date] = true; save();
    celebrate(); // 只在跨过的一刻
  }
  if (before <= goal && after > goal) breakBall();
  if (before > goal && after <= goal) healBall();
  // 每次打卡水花
  splash();
}

// ---------- 庆祝：五彩纸屑 110 片、3 波、约 6.5 秒 + 水球弹性缩放 ----------
function celebrate() {
  $("ballWrap").classList.add("squash");
  setTimeout(() => $("ballWrap").classList.remove("squash"), 700);
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
    const t = now - t0; ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    for (const p of pieces) {
      if (t < p.delay) { alive = true; continue; }
      p.x += p.vx + Math.sin(t / 300 + p.s) * .4; p.y += p.vy; p.r += p.vr;
      if (p.y < cv.height + 20) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (alive && t < 6500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

// ---------- 破裂 / 溢出 ----------
let broken = false;
function breakBall() {
  if (broken) return; broken = true;
  $("ballWrap").classList.add("broken");
  if (navigator.vibrate) navigator.vibrate(120); // 破开打击感 + 震动
  spawnShards();
  toast("水满出来啦！水球破了个口子");
}
function healBall() {
  if (!broken) return; broken = false;
  $("ballWrap").classList.remove("broken");
}
function spawnShards() {
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
let visualLevel = 0;      // 0..1，画面水位（平滑追赶真实水位）
let tiltX = 0, tiltY = 0; // 设备倾斜（-1..1）
let shakeEnergy = 0;
// Electron 桌面版：拖动窗口产生的等效倾斜（与设备倾斜叠加，停下后按帧衰减）。
let windowTiltX = 0, windowTiltY = 0, lastWindowMotionT = 0;
function effTiltX() { return clamp(tiltX + windowTiltX, -1, 1); }
let lastSplash = 0;

function targetLevel() {
  const t = dayTotal(viewDate) / state.settings.goal;
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
  const rest = 0;
  for (let i = 0; i < N; i++) {
    const left = wave[i - 1] ?? wave[i], right = wave[i + 1] ?? wave[i];
    const acc = (left + right - 2 * wave[i]) * 0.32 + (rest - wave[i]) * 0.02;
    vel[i] = (vel[i] + acc) * 0.985;
    wave[i] += vel[i];
  }
  // 倾斜让水面一侧高一侧低；摇晃注入能量。
  // 拖窗口超过 120ms 没新数据时，等效倾斜按帧衰减，水面慢慢平复。
  if (performance.now() - lastWindowMotionT > 120) { windowTiltX *= 0.92; windowTiltY *= 0.92; }
  const slope = effTiltX() * 14 + (Math.random() - .5) * shakeEnergy;
  for (let i = 0; i < N; i++) wave[i] += slope * (i / N - .5) * 0.02;
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
    const by = H - ((performance.now() / 14 + i * 97) % (H - levelY)) - levelY * 0 + levelY;
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
  if (!broken) return;
  const excess = Math.max(0, dayTotal(viewDate) - state.settings.goal);
  const head = clamp(excess / state.settings.goal, 0, 1);
  const flow = Math.sqrt(head); // Torricelli
  const t = performance.now() / 1000;
  // 沿球面流下的水线（方向随倾斜偏移）
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
}
function loop() { stepWave(); drawBall(); requestAnimationFrame(loop); }

// ---------- 今日曲线（每杯，不累计，06:00–21:00） ----------
function drawCurve() {
  const cv = $("curve"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
  const padL = 44, padR = 16, padT = 18, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const maxMl = Math.max(500, ...dayDrinks(viewDate).map(d => d.ml));
  const xFor = (mins) => x0 + ((mins - 360) / (21 * 60 - 360)) * (x1 - x0);
  const yFor = (ml) => y1 - (ml / maxMl) * (y1 - y0);
  ctx.strokeStyle = "#e3eaf2"; ctx.lineWidth = 1;
  [0, .5, 1].forEach(f => { ctx.beginPath(); ctx.moveTo(x0, y0 + (y1 - y0) * f); ctx.lineTo(x1, y0 + (y1 - y0) * f); ctx.stroke(); });
  ctx.fillStyle = "#6b7a90"; ctx.font = "22px sans-serif"; ctx.textAlign = "center";
  ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"].forEach((t, i) => {
    ctx.fillText(t, xFor(360 + i * 180), H - 4);
  });
  const pts = dayDrinks(viewDate).map(d => {
    const [h, m] = d.time.split(":").map(Number);
    return { x: xFor(h * 60 + m), y: yFor(d.ml), ml: d.ml, inRange: h * 60 + m >= 360 && h * 60 + m <= 1260 };
  }).filter(p => p.inRange);
  if (pts.length) {
    ctx.strokeStyle = "#1e6fd9"; ctx.lineWidth = 3; ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fillStyle = "#1e6fd9"; ctx.fill();
      ctx.fillStyle = "#17233b"; ctx.fillText(p.ml, p.x, p.y - 12);
    });
  } else {
    ctx.fillStyle = "#6b7a90"; ctx.textAlign = "center";
    ctx.fillText("今天还没喝水，喝一杯就会出现在这里", W / 2, H / 2);
  }
}

// ---------- 渲染 ----------
function renderAll() {
  const total = dayTotal(viewDate), goal = state.settings.goal;
  $("goalLabel").textContent = `目标 ${goal} ml`;
  $("leftLabel").textContent = total >= goal ? `已超 ${total - goal} ml` : `还差 ${goal - total} ml`;
  if (document.activeElement !== $("totalNum")) $("totalNum").textContent = displayedTotal;
  const egg = eggTheme();
  $("eggNote").textContent = egg ? `今日饮品：${egg.name} — ${egg.note}` : "";
  // 隐藏彩蛋扩展点：按日期 / 时刻 / 动作触发的非饮品彩蛋在此挂接（原版内容不捏造）
  for (const h of HIDDEN_EGGS) { try { if (h.when(state, new Date())) h.apply(egg); } catch { /* 忽略单个彩蛋错误 */ } }
  // 日期标签与按钮状态
  const label = isToday() ? "今天" : viewDate === addDays(todayStr(), -1) ? "昨天" : viewDate;
  $("dateLabel").textContent = label;
  $("nextDay").disabled = isToday();
  const reached = total >= goal;
  $("checkinBtn").style.display = (reached || !isToday()) ? "none" : "";
  $("extraBtn").style.flex = (reached || !isToday()) ? "1" : "";
  $("actionRow").style.flexDirection = "row";
  $("actionHint").textContent = (reached || !isToday())
    ? "已达标 / 看往日时只有额外加喝，占满整行。"
    : "两个按钮都用上面选好的水量；到点打卡记到最近的未打卡时段。";
  // 时段
  const d = dayData(viewDate);
  $("slots").innerHTML = "";
  slotTimes().forEach(t => {
    const b = document.createElement("button");
    b.className = "slot press" + (t in d.slots ? " done" : ""); b.type = "button";
    b.innerHTML = `<div class="t">${t}</div><div class="v">${t in d.slots ? d.slots[t] + " ml ✓" : "未喝"}</div>`;
    b.addEventListener("click", () => {
      if (!isToday()) { toast("只能改今天的时段"); return; }
      checkinSlot(viewDate, t, selected);
    });
    $("slots").appendChild(b);
  });
  // 额外加喝列表 + 撤销
  $("bonusList").innerHTML = "";
  d.bonus.forEach(b => {
    const li = document.createElement("li");
    li.innerHTML = `<span>额外加喝 ${b.ml} ml · ${b.time}</span><button class="undo" data-undo="${b.id}">撤销</button>`;
    $("bonusList").appendChild(li);
  });
  // 连续达标
  let streak = 0;
  for (let i = 0; ; i++) {
    const ds = addDays(todayStr(), -i);
    if (dayTotal(ds) >= goal) streak++; else break;
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
    const pct = clamp(total / state.settings.goal, 0, 1);
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
    row.innerHTML = `<span class="d">${ds}</span><span class="track"><span class="fill" style="display:block;width:${clamp(total / state.settings.goal * 100, 0, 100)}%"></span></span><span class="v">${total} ml</span>`;
    row.addEventListener("click", () => {
      viewDate = ds; displayedTotal = dayTotal(ds); visualLevel = targetLevel();
      $("historyOverlay").classList.remove("open"); renderAll();
    });
    el.appendChild(row);
  }
}
$("openHistory").addEventListener("click", () => { renderHist90(); $("historyOverlay").classList.add("open"); });
$("closeHistory").addEventListener("click", () => $("historyOverlay").classList.remove("open"));
$("historyOverlay").addEventListener("click", (e) => { if (e.target === $("historyOverlay")) $("historyOverlay").classList.remove("open"); });
$("prevDay").addEventListener("click", () => { viewDate = addDays(viewDate, -1); displayedTotal = dayTotal(viewDate); visualLevel = targetLevel(); renderAll(); });
$("nextDay").addEventListener("click", () => { if (!isToday()) { viewDate = addDays(viewDate, 1); displayedTotal = dayTotal(viewDate); visualLevel = targetLevel(); renderAll(); } });

// ---------- 设置 ----------
function fillSettings() {
  $("setGoal").value = state.settings.goal;
  $("setAmount").value = state.settings.defaultAmount;
  $("setStart").value = state.settings.startHour;
  $("setInterval").value = state.settings.intervalHours;
}
$("saveSettings").addEventListener("click", () => {
  state.settings.goal = clamp(+$("setGoal").value || 2000, 500, 5000);
  state.settings.defaultAmount = clamp(+$("setAmount").value || 250, 10, 2000);
  state.settings.startHour = clamp(+$("setStart").value || 8, 0, 22);
  state.settings.intervalHours = clamp(+$("setInterval").value || 2, 1, 4);
  save(); setAmount(state.settings.defaultAmount, true); fillSettings(); renderAll();
  toast("设置已保存");
});
$("clearToday").addEventListener("click", () => {
  if (!confirm("清空今天的全部打卡记录？")) return;
  state.days[todayStr()] = { slots: {}, bonus: [] };
  delete state.celebrated[todayStr()];
  displayedTotal = 0; visualLevel = 0; save(); renderAll(); toast("今天已清空");
});

// ---------- 晃动 / 倾斜：deviceorientation + devicemotion ----------
// iOS 需要用户手势授权，所以是个按钮；安卓 / 桌面直接监听。
let motionOn = false;
async function enableMotion() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== "granted") { toast("未获得晃动权限"); return; }
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
window.addEventListener("pointerup", () => { dragging = false; tiltX = 0; });
window.addEventListener("resize", () => positionPill(false));

// ---------- 启动 ----------
// 无演示数据：第一次打开是空的，今天 0 ml。
buildPresets();
fillSettings();
setAmount(state.settings.defaultAmount);
displayedTotal = dayTotal(viewDate);
visualLevel = targetLevel();
renderAll();
introSlider(); // 入场滑块从随机非 250 选项滑到 250
requestAnimationFrame(loop);
