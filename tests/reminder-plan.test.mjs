import { test } from "node:test";
import assert from "node:assert/strict";
import {freshState} from "../src/core.js";
import {planAndroidReminders, MANAGED_REMINDER_IDS} from "../src/reminder-plan.js";

test("每天的通知都在指定时段的第 0 秒触发，而不是继承设置时的秒数", () => {
  const plan=planAndroidReminders(freshState().settings, []);
  assert.equal(plan.expected.length,7);
  assert.equal(plan.schedule.length,7);
  assert.equal(plan.cancel.length,0);
  assert.ok(plan.expected.every(n=>n.schedule.on.minute===0 && n.schedule.on.second===0));
});
test("重复打开应用时无需破坏已经正确安排的通知",()=>{
  const settings=freshState().settings;
  const first=planAndroidReminders(settings,[]);
  const next=planAndroidReminders(settings,first.expected);
  assert.equal(next.schedule.length,0);
  assert.equal(next.cancel.length,0);
});
test("修改开始时间时仅更新变化的通知并清理已弃用的时段",()=>{
  const settings=freshState().settings;
  const original=planAndroidReminders(settings,[]).expected;
  const changed={...settings,startHour:9,intervalHours:3};
  const diff=planAndroidReminders(changed,original);
  assert.deepEqual(diff.expected.map(n=>n.schedule.on.hour),[9,12,15,18]);
  assert.equal(diff.schedule.length,4);
  assert.deepEqual(diff.cancel.map(n=>n.id),[7704,7705,7706]);
});
test("升级之前缺失 second=0 的旧通知会自动修复而不是直接清空",()=>{
  const s=freshState().settings;
  const pending=planAndroidReminders(s,[]).expected.map(n=>({
    ...n,schedule:{...n.schedule,on:{hour:n.schedule.on.hour,minute:0}}
  }));
  const p=planAndroidReminders(s,pending);
  assert.equal(p.schedule.length,7);
  assert.equal(p.cancel.length,0);
});
test("不触碰应用之外的通知标识",()=>{
  const s=freshState().settings;
  const p=planAndroidReminders(s,[{id:9999,title:"other",body:"other"}]);
  assert.equal(p.cancel.length,0);
  assert.equal(MANAGED_REMINDER_IDS.length,24);
});

test("开启 Doze 送达能力时会更新此前关闭后台唤醒的旧计划",()=>{
  const settings=freshState().settings;
  const baseline=planAndroidReminders(settings,[]).expected;
  const earlier=baseline.map(n=>({...n,schedule:{...n.schedule,allowWhileIdle:false}}));
  const plan=planAndroidReminders(settings,earlier);
  assert.equal(plan.schedule.length,baseline.length);
  assert.ok(plan.schedule.every(n=>n.schedule.allowWhileIdle===true));
});
