// Electron 主进程：把同一套网页代码装进桌面窗口。
// 数据仍存在应用内的 localStorage，与网页版互不相通。
//
// 窗口是竖版小弹窗：默认 420×880，约手机竖屏比例（390×844 ≈ 0.46，
// 这里 420/880 ≈ 0.48），像手机一样窄窄地立在桌面上，不是铺满桌面的大窗口。
// 用户用鼠标拖动窗口移动时，主进程监听 'move' 事件，用前后两次位置
// 算出速度 / 加速度（见 window-motion.cjs），通过 IPC 发给渲染进程，
// 渲染进程再换算成水面物理的倾斜 / 晃动输入：拖得越快晃得越厉害，
// 停下后水面慢慢平复。网页版里没有这条通道，不影响。
const { app, BrowserWindow } = require("electron");
const path = require("path");
const { computeMotion } = require("./window-motion.cjs");

const WIN_WIDTH = 420, WIN_HEIGHT = 880; // 竖版小弹窗，手机竖屏比例

function createWindow() {
  const win = new BrowserWindow({
    width: WIN_WIDTH, height: WIN_HEIGHT,
    minWidth: 360, minHeight: 700,
    resizable: true, useContentSize: true,
    title: "喝水打卡",
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "preload.cjs") },
  });
  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.setMenuBarVisibility(false);

  // ---- 窗口拖动 → 晃动 ----
  // 'move' 在拖动中高频触发；按 16ms 节流后发一次，避免 IPC 刷屏。
  let last = null;       // { x, y, t, vx, vy }
  let lastSent = 0;
  win.on("move", () => {
    const now = Date.now();
    const [x, y] = win.getPosition();
    const m = computeMotion(last, { x, y, t: now });
    last = { x, y, t: now, vx: m.vx, vy: m.vy };
    if (now - lastSent < 16) return; // 节流到约 60Hz
    lastSent = now;
    if (!win.isDestroyed() && m.speed > 1) {
      win.webContents.send("window-motion", { ...m, t: now });
    }
  });
  // 停下时补发一次零速度，让渲染进程的水面开始平复（而不是停在最后的倾斜上）。
  let settleTimer = null;
  win.on("move", () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send("window-motion", { vx: 0, vy: 0, ax: 0, ay: 0, speed: 0, energy: 0, t: Date.now(), settled: true });
      last = null;
    }, 120);
  });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
