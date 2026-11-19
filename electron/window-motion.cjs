// 窗口拖动 → 水面晃动的换算（纯函数，不依赖 Electron，可单测）。
// 物理直觉：窗口被拖着加速向右时，水因惯性滞后、涌向左侧，
// 所以等效倾斜与速度 / 加速度反号；拖得越快，晃得越厉害；
// 停下后渲染进程会让等效倾斜按帧衰减，水面慢慢平复。
//
// 输入：prev { x, y, t, vx, vy }（上一次位置与速度，毫秒时间戳；首次为 null），
//       curr { x, y, t }（本次位置，Electron BrowserWindow.getPosition() 的值）。
// 输出：{ vx, vy, ax, ay, speed, energy }
//   vx/vy：像素/秒；ax/ay：像素/秒²；speed：合速度；
//   energy：0..2 左右的晃动能量，供渲染进程加到 shakeEnergy 上。
function computeMotion(prev, curr) {
  if (!prev) return { vx: 0, vy: 0, ax: 0, ay: 0, speed: 0, energy: 0 };
  const dt = Math.min(0.5, Math.max(0.005, (curr.t - prev.t) / 1000)); // 秒，夹紧防除零与长间隔
  const vx = (curr.x - prev.x) / dt;
  const vy = (curr.y - prev.y) / dt;
  const ax = (vx - (prev.vx || 0)) / dt;
  const ay = (vy - (prev.vy || 0)) / dt;
  const speed = Math.hypot(vx, vy);
  const accel = Math.hypot(ax, ay);
  // 速度主导（持续拖动），加速度加成（突然起步 / 急停时那一下最晃）。
  const energy = Math.min(2, speed / 900 + accel / 30000);
  return { vx, vy, ax, ay, speed, energy };
}

// 等效倾斜：速度 500 px/s 约等于满倾斜；加速度再叠加一点。
// 负号是惯性：窗口向右加速，水涌向左。
function tiltFromMotion(m) {
  const x = Math.max(-1, Math.min(1, -(m.vx / 500) - m.ax / 6000));
  const y = Math.max(-1, Math.min(1, -(m.vy / 500) - m.ay / 6000));
  return { x, y };
}

module.exports = { computeMotion, tiltFromMotion };
