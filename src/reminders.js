import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { clockStr, reminderTimes, todayStr } from "./core.js";

const ANDROID_IDS = Array.from({ length: 24 }, (_, i) => ({ id: 7700 + i }));
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
  const clock = clockStr(now);
  if (!reminderTimes(webSettings).includes(clock)) return;
  const key = todayStr(now) + " " + clock;
  if (lastWebReminder === key) return;
  lastWebReminder = key;
  try { new Notification("喝水打卡 · 该喝水啦", { body: clock + " 喝一杯水，记得回来打卡。" }); } catch { /* 浏览器可禁用通知 */ }
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
  const cancelExisting = async () => {
    try { await LocalNotifications.cancel({ notifications: ANDROID_IDS }); } catch { /* 没有既存任务 */ }
  };
  if (!settings.remindersEnabled) { await cancelExisting(); return { ok: true }; }
  const permission = request ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return { ok: false, message: "Android 通知权限未获得，请在系统设置中允许通知。" };
  const times = reminderTimes(settings);
  // 固定 ID，调整时段时清理之前任务，不会重复推送。
  await cancelExisting();
  const notifications = times.map((time, index) => ({
    id: ANDROID_IDS[index].id,
    title: "喝水打卡 · 该喝水啦",
    body: time + " 喝一杯水，记得打卡。",
    schedule: { on: { hour: Number(time.slice(0, 2)), minute: 0 }, allowWhileIdle: false }
  }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { ok: true };
}
export async function syncReminders(settings, requestPermission = false) {
  try {
    if (reminderPlatform() === "android") return await syncAndroid(settings, requestPermission);
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
