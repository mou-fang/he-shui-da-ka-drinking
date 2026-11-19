import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshState, normalizeState, todayStr, addDays, bounded, slotTimes, dayTotal,
  dayDrinks, dayGoal, ensureDay, nextOpenSlot, reminderTimes
} from "../src/core.js";

test("初始数据、设置和空天统计", () => {
  const state = freshState();
  assert.equal(state.settings.goal, 2000);
  assert.equal(state.settings.remindersEnabled, false);
  assert.deepEqual(slotTimes(state.settings), ["08:00","10:00","12:00","14:00","16:00","18:00","20:00"]);
  assert.equal(dayTotal(state, "2026-11-19"), 0);
});
test("本地日期加减跨月与夏令时", () => {
  assert.equal(addDays("2026-03-31", 1), "2026-04-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
  assert.equal(todayStr(new Date(2026, 10, 19, 12)), "2026-11-19");
});
test("设置上界、空值和不合法数字", () => {
  assert.equal(bounded("99999", 2000,500,5000,50),5000);
  assert.equal(bounded("NaN",250,10,2000,10),250);
  assert.equal(bounded("",250,10,2000,10),250);
  assert.equal(bounded("125",250,10,2000,10),130);
});
test("允许晚间 21、22 点起始且保留 00 点", () => {
  assert.deepEqual(slotTimes({startHour:0, intervalHours:4,removedSlots:[]}),["00:00","04:00","08:00","12:00","16:00","20:00"]);
  assert.deepEqual(slotTimes({startHour:21,intervalHours:2,removedSlots:[]}),["21:00"]);
  assert.deepEqual(slotTimes({startHour:22,intervalHours:2,removedSlots:[]}),["22:00"]);
});
test("选择最近的已经到达的空时段而不是早晨第一个", () => {
  const state = freshState();
  assert.equal(nextOpenSlot(state,"2026-11-19",new Date(2026,10,19,15,30)),"14:00");
  assert.equal(nextOpenSlot(state,"2026-11-19",new Date(2026,10,19,7,30)),null);
  ensureDay(state,"2026-11-19").slots["14:00"]=250;
  assert.equal(nextOpenSlot(state,"2026-11-19",new Date(2026,10,19,15,30)),"12:00");
});
test("旧数据兼容、实际喝水时间覆盖计划时段", () => {
  const state = normalizeState({settings:{goal:2000, defaultAmount:250, startHour:8,intervalHours:2},days:{
    "2026-11-19":{slots:{"08:00":250,"10:00":250},bonus:[{id:"abc",ml:200,time:"19:30"}],slotMeta:{"08:00":{time:"09:41"}}}
  },celebrated:{}});
  assert.equal(dayTotal(state,"2026-11-19"),700);
  assert.deepEqual(dayDrinks(state,"2026-11-19").map(x=>x.time),["09:41","10:00","19:30"]);
  state.settings.startHour=9;
  assert.equal(dayTotal(state,"2026-11-19"),700);
  assert.equal(state.days["2026-11-19"].slots["08:00"],250);
});
test("损坏状态不会导致原型污染、NaN 或数组崩溃", () => {
  const state=normalizeState(JSON.parse('{"settings":{"goal":null,"defaultAmount":"Infinity","startHour":"", "removedSlots":["__proto__","09:00"]},"days":{"2026-02-30":{"slots":{"08:00":100}},"2026-11-19":{"slots":{"08:00":250,"evil":12},"bonus":[{"id":"good","ml":100,"time":"12:30"},{"id":"bad","ml":"oops","time":"99:99"}]}}}'));
  assert.equal(state.settings.goal,2000);
  assert.equal(state.settings.defaultAmount,250);
  assert.deepEqual(state.settings.removedSlots,["09:00"]);
  assert.equal(dayTotal(state,"2026-02-30"),0);
  assert.equal(dayTotal(state,"2026-11-19"),350);
  assert.equal(state.days["2026-11-19"].bonus.length,1);
});
test("每日提醒时段与显示的打卡时段一致", () => {
  const settings={startHour:8,intervalHours:3,removedSlots:["14:00"]};
  assert.deepEqual(reminderTimes(settings),slotTimes(settings));
});

test("历史日目标独立快照，调整今日目标不应改变昨天的达标情况", () => {
  const state=freshState();
  const d=ensureDay(state,"2026-11-18");
  d.slots["08:00"]=2000;
  assert.equal(dayGoal(state,"2026-11-18"),2000);
  state.settings.goal=3000;
  assert.equal(dayGoal(state,"2026-11-18"),2000);
  assert.equal(dayGoal(state,"2026-11-19"),3000);
  const imported=normalizeState(state);
  assert.equal(dayGoal(imported,"2026-11-18"),2000);
});
test("首个时段之前自动打卡不应提前抢占未来时段", () => {
  const state=freshState();
  assert.equal(nextOpenSlot(state,"2026-11-19",new Date(2026,10,19,7,59)),null);
  assert.equal(nextOpenSlot(state,"2026-11-19",new Date(2026,10,19,8,0)),"08:00");
});
