// Electron 主进程：仅加载本地文件，系统提醒运行于后台托盘进程。
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");
const { computeMotion } = require("./window-motion.cjs");
const APP_ID = "com.moufang.heshuidaqia";
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

let mainWindow = null;
let tray = null;
let quitting = false;
let remindersEnabled = false;
let reminderTimes = [];
let lastReminderKey = "";
let reminderTimer = null;

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else { mainWindow.show(); mainWindow.focus(); }
}
function ensureTray() {
  if (tray) return;
  const file = app.isPackaged ? path.join(process.resourcesPath, "icon.ico") : path.join(__dirname, "..", "assets", "icon.ico");
  const icon = nativeImage.createFromPath(file);
  if (icon.isEmpty()) throw new Error("系统托盘图标加载失败");
  tray = new Tray(icon);
  tray.setToolTip("喝水打卡 · 正在后台提醒");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示喝水打卡", click: showWindow },
    { label: "退出应用", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("double-click", showWindow);
}
function tickReminders() {
  if (!remindersEnabled || !Notification.isSupported()) return;
  const now = new Date();
  const clock = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  if (!reminderTimes.includes(clock)) return;
  const key = [now.getFullYear(),now.getMonth(),now.getDate(),clock].join("-");
  if (lastReminderKey === key) return;
  lastReminderKey = key;
  const note = new Notification({ title: "喝水打卡 · 该喝水啦", body: clock + " 记得喝一杯水并打卡。" });
  note.on("click", showWindow);
  note.show();
}
function updateReminders(input) {
  if (!input || typeof input !== "object" || typeof input.enabled !== "boolean" || !Array.isArray(input.times)) {
    return { ok: false, message: "通知参数无效" };
  }
  if (input.times.length > 24 || !input.times.every(t => typeof t === "string" && /^(?:[01]\d|2[0-3]):00$/.test(t))) {
    return { ok: false, message: "通知时段无效" };
  }
  if (input.enabled && !Notification.isSupported()) {
    return { ok: false, message: "该系统当前不支持原生通知" };
  }
  try {
    if (input.enabled) ensureTray();
    remindersEnabled = input.enabled;
    reminderTimes = [...new Set(input.times)];
    clearInterval(reminderTimer);
    if (remindersEnabled) reminderTimer = setInterval(tickReminders, 15000);
    else if (tray) { tray.destroy(); tray = null; }
    if (!remindersEnabled && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) showWindow();
    if (process.platform === "win32" && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: remindersEnabled });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
ipcMain.handle("reminders:set", (_event, input) => updateReminders(input));

function createWindow() {
  const win = new BrowserWindow({
    width: 420, height: 880, minWidth: 360, minHeight: 700,
    resizable: true, useContentSize: true, title: "喝水打卡",
    backgroundColor: "#f4f8fd",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });
  mainWindow = win;
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", event => event.preventDefault());
  // 保持与 v1.0.0 相同的 file:// 页面路径，降低 Windows localStorage 升级迁移风险。
  // 打包后的 Windows smoke test：启动真实 Electron、加载 UI 与 preload 后退出。
  // CI 检查这一结果，避免「exe 打包成功但一运行就空白」。
  if (process.argv.includes("--hsdq-smoke-test")) {
    const watchdog = setTimeout(() => {
      console.error("Smoke test timed out waiting for page load");
      app.exit(3);
    }, 20000);
    win.webContents.once("did-finish-load", async () => {
      try {
        const ready = await win.webContents.executeJavaScript(
          "Boolean(document.querySelector('#ball') && document.querySelector('#totalNum') && document.querySelector('#toggleReminders') && window.hsdq && typeof window.hsdq.setReminders === 'function')"
        );
        clearTimeout(watchdog);
        if (!ready) console.error("Smoke test failed: UI elements or native preload bridge unavailable");
        app.exit(ready ? 0 : 2);
      } catch (error) {
        clearTimeout(watchdog);
        console.error("Smoke test renderer error", error);
        app.exit(4);
      }
    });
    win.webContents.once("did-fail-load", (_event, _code, description) => {
      clearTimeout(watchdog);
      console.error("Smoke test could not load UI:", description);
      app.exit(5);
    });
  }
  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.on("close", e => {
    if (remindersEnabled && !quitting) { e.preventDefault(); win.hide(); }
  });
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });

  let previous = null;
  let lastSent = 0;
  let settleTimer = null;
  win.on("move", () => {
    const now = Date.now();
    const [x,y] = win.getPosition();
    const motion = computeMotion(previous, {x,y,t:now});
    previous = {x,y,t:now,vx:motion.vx,vy:motion.vy};
    if (now - lastSent >= 16 && motion.speed > 1 && !win.isDestroyed()) {
      lastSent = now;
      win.webContents.send("window-motion", {...motion,t:now});
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send("window-motion", {
        vx:0,vy:0,ax:0,ay:0,speed:0,energy:0,t:Date.now(),settled:true
      });
      previous = null;
    }, 120);
  });
  win.on("closed", () => clearTimeout(settleTimer));
}
// 保证同一台电脑只有一个提醒调度器；防止开机启动与手动启动导致重复通知。
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(createWindow);
}
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => {
  if (!remindersEnabled && process.platform !== "darwin") app.quit();
});
app.on("activate", showWindow);
