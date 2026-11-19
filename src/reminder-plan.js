// Android 系统通知的纯函数差分计划，可由 Node 单测直接验证。
// 先补齐或更新所需通知，再取消过期通知，避免保存设置失败时先清空全部提醒。
import { reminderTimes } from "./core.js";
export const MANAGED_REMINDER_IDS = Array.from({length:24}, (_,i)=>({id:7700+i}));
const managed = id => Number.isInteger(id) && id >= 7700 && id < 7724;
export function planAndroidReminders(settings, pending = []) {
  const current = new Map(pending.filter(n => managed(n.id)).map(n => [n.id,n]));
  const expected = reminderTimes(settings).map((time,index)=>({
    id:7700+index,
    title:"喝水打卡 · 该喝水啦",
    body:time+" 喝一杯水，记得打卡。",
    // 明确设秒为 0，避免插件 DateMatch 继承当前秒数，导致每次提醒晚数十秒。
    schedule:{on:{hour:Number(time.slice(0,2)),minute:0,second:0},allowWhileIdle:false}
  }));
  const expectedIds = new Set(expected.map(n=>n.id));
  const schedule = expected.filter(n => {
    const p=current.get(n.id);
    return !p || p.body!==n.body || p.title!==n.title ||
      p.schedule?.on?.hour !== n.schedule.on.hour ||
      p.schedule?.on?.minute !== 0 || p.schedule?.on?.second !== 0;
  });
  const cancel = [...current.values()].filter(n=>!expectedIds.has(n.id)).map(n=>({id:n.id}));
  return {expected,schedule,cancel};
}
