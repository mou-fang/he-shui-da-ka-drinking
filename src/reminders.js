import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { clockStr, reminderTimes, todayStr } from "./core.js";
import { MANAGED_REMINDER_IDS, planAndroidReminders } from "./reminder-plan.js";
let webTimer;
let webSettings;
let lastWebReminder = "";

export function reminderPlatform() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") return "android";
  if (window.hsdq?.setReminders) return "windows";
  return "web";
}
export function reminderDescription() {
  const platform = reminderPlatform();
  if (platform === "android") return "Android 本地通知：关闭应用后仍可提醒；系统省电策略可能使时间略有延迟。";
  if (platform === "windows") return "Windows 原生通知：启用后常驻托盘并开机启动；系统勿扰仍可能拦截通知。";
  return "网页通知仅在网页保持打开时有效，关闭浏览器后无法后台提醒（需要系统允许通知）。";
}
function webTick() {
  if (!webSettings?.remindersEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = new Date();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  // 后台浏览器可能延迟执行 timer，允许在时段开始的 3 分钟内补发，但不补发很久前的通知。
  const due = reminderTimes(webSettings).filter(time => {
    const [hour, minute] = time.split(":").map(Number);
    const elapsed = nowMinute - (hour * 60 + minute);
    return elapsed >= 0 && elapsed < 3;
  }).at(-1);
  if (!due) return;
  const key = todayStr(now) + " " + due;
  if (lastWebReminder === key) return;
  try {
    if (localStorage.getItem("hsdq-last-web-reminder") === key) {
      lastWebReminder = key; return;
    }
  } catch { /* 隐私模式可能禁止存储读取 */ }
  try {
    new Notification("喝水打卡 · 该喝水啦", { body: due + " 喝一杯水，记得回来打卡。" });
    lastWebReminder = key;
    try { localStorage.setItem("hsdq-last-web-reminder", key); } catch { /* 通知成功即可 */ }
  } catch { /* 浏览器可禁用通知 */ }
}
async function syncWeb(settings, request) {
  clearInterval(webTimer);
  webSettings = settings;
  if (!settings.remindersEnabled) return { ok: true };
  if (!("Notification" in window) || !window.isSecureContext) return { ok: false, message: "浏览器不支持通知，或当前地址不是 HTTPS / localhost。" };
  let permission = Notification.permission;
  if (permission !== "granted" && request) permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "通知权限未开启，请在浏览器站点设置中允许通知。" };
  webTimer = setInterval(webTick, 15000);
  webTick();
  return { ok: true };
}
async function syncAndroid(settings, request) {
  // 先读取当前通知，再执行差量变更；禁止每次启动都无条件取消全部提醒。
  const list = (await LocalNotifications.getPending()).notifications || [];
  const managedIds = new Set(MANAGED_REMINDER_IDS.map(n => n.id));
  const pending = list.filter(n => managedIds.has(n.id));
  if (!settings.remindersEnabled) {
    if (pending.length) await LocalNotifications.cancel({
      notifications: pending.map(n => ({id:n.id}))
    });
    return {ok:true};
  }
  const permission = request
    ? await LocalNotifications.requestPermissions()
    : await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return {
    ok:false,message:"Android 通知权限未获得，请在系统设置中允许通知。"
  };
  const plan = planAndroidReminders(settings, pending);
  if (plan.schedule.length) {
    // 先安排新通知，再清除旧时段。失败时至少保留未变更的已安排提醒。
    await LocalNotifications.schedule({notifications:plan.schedule});
  }
  const after = (await LocalNotifications.getPending()).notifications || [];
  const actual = new Set(after.map(n => n.id));
  if (plan.expected.some(n => !actual.has(n.id))) {
    return {ok:false,message:"系统未保存全部喝水提醒；已保留现有提醒，请重新打开设置重试。"};
  }
  if (plan.cancel.length) await LocalNotifications.cancel({notifications:plan.cancel});
  return {ok:true};
}
// 启动恢复和用户点击可能几乎同时执行，串行化原生通知更新防止竞态。
let androidSyncTail = Promise.resolve();
function queueAndroidSync(settings, requestPermission) {
  const job = androidSyncTail.catch(() => {}).then(() => syncAndroid(settings, requestPermission));
  androidSyncTail = job;
  return job;
}

export async function syncReminders(settings, requestPermission = false) {
  try {
    if (reminderPlatform() === "android") return await queueAndroidSync(settings, requestPermission);
    if (reminderPlatform() === "windows") {
      const response = await window.hsdq.setReminders({
        enabled: settings.remindersEnabled, times: reminderTimes(settings)
      });
      return response?.ok ? { ok: true } : { ok: false, message: response?.message || "Windows 通知设置失败。" };
    }
    return await syncWeb(settings, requestPermission);
  } catch (error) {
    return { ok: false, message: "设置提醒失败：" + (error?.message || "未知错误") };
  }
}
