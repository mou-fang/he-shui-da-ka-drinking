// 系统从睡眠或忙碌中恢复后，允许略晚于计划时刻的提醒补发。
// 最多补发最近一个时段，避免把数小时前的提醒一次性倾倒到通知中心。
function recentDueSlot(times, now = new Date(), graceMinutes = 3) {
  const minute = now.getHours() * 60 + now.getMinutes();
  let result = null, latest = -Infinity;
  for (const time of times) {
    if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
    const [hour, min] = time.split(":").map(Number);
    const target = hour * 60 + min;
    const elapsed = minute - target;
    if (elapsed >= 0 && elapsed < graceMinutes && target > latest) {
      latest = target; result = time;
    }
  }
  return result;
}
module.exports = { recentDueSlot };
