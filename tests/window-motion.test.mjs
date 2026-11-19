// 窗口拖动 → 晃动换算的单测。不依赖 Electron，直接跑：npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { computeMotion, tiltFromMotion } = require("../electron/window-motion.cjs");

test("首次移动没有速度", () => {
  const m = computeMotion(null, { x: 100, y: 100, t: 1000 });
  assert.equal(m.speed, 0);
  assert.equal(m.energy, 0);
});

test("匀速拖动：100px / 100ms = 1000px/s，能量约 1.1", () => {
  const prev = { x: 0, y: 0, t: 1000, vx: 1000, vy: 0 };
  const m = computeMotion(prev, { x: 100, y: 0, t: 1100 });
  assert.equal(m.vx, 1000);
  assert.equal(m.vy, 0);
  assert.ok(Math.abs(m.energy - 1000 / 900) < 0.01, `energy=${m.energy}`);
});

test("急停：加速度会额外加能量", () => {
  const prev = { x: 0, y: 0, t: 1000, vx: 1000, vy: 0 };
  const m = computeMotion(prev, { x: 100, y: 0, t: 1100 });
  // 速度不变时加速度为 0；下一帧突然停住：
  const stop = computeMotion({ ...prev, x: 100, t: 1100, vx: 1000 }, { x: 100, y: 0, t: 1200 });
  assert.equal(stop.vx, 0);
  assert.ok(stop.energy > 0.3, `stop energy=${stop.energy}`); // 急停那一下最晃
});

test("等效倾斜与速度反号（惯性），且夹在 -1..1", () => {
  const t = tiltFromMotion({ vx: 1000, vy: 0, ax: 0, ay: 0 });
  assert.ok(t.x < 0, "窗口向右拖，水涌向左");
  assert.ok(t.x >= -1 && t.x <= 1);
  const wild = tiltFromMotion({ vx: 100000, vy: 0, ax: 1e9, ay: 0 });
  assert.equal(wild.x, -1);
});
