import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {recentDueSlot}=require("../electron/reminder-clock.cjs");
test("桌面端恢复后 3 分钟内可以补发最近一次提醒",()=>{
  const times=["08:00","10:00","12:00"];
  assert.equal(recentDueSlot(times,new Date(2026,10,19,8,0,0)),"08:00");
  assert.equal(recentDueSlot(times,new Date(2026,10,19,8,2,59)),"08:00");
  assert.equal(recentDueSlot(times,new Date(2026,10,19,8,3,0)),null);
  assert.equal(recentDueSlot(times,new Date(2026,10,19,11,0,0)),null);
});
test("桌面端重叠时段只补发最近的计划时间",()=>{
  assert.equal(recentDueSlot(["08:00","08:01"],new Date(2026,10,19,8,2)),"08:01");
  assert.equal(recentDueSlot(["23:00"],new Date(2026,10,20,0,0)),null);
});
