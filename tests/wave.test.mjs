import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceWave } from "../src/wave.js";

test("wave field remains finite and bounded over thousands of frames", () => {
  const n = 110;
  const wave = new Float32Array(n), velocity = new Float32Array(n), scratch = new Float32Array(n);
  for (let i = 0; i < n; i++) velocity[i] = (Math.sin(i * 1.37) * 1.2);
  for (let frame = 0; frame < 2400; frame++) {
    const slope = frame < 200 ? Math.sin(frame / 10) * 15 : 0;
    advanceWave(wave, velocity, scratch, slope);
    for (const h of wave) assert.ok(Number.isFinite(h) && Math.abs(h) <= 32);
    for (const v of velocity) assert.ok(Number.isFinite(v) && Math.abs(v) <= 16);
  }
  assert.ok(Math.max(...Array.from(wave, Math.abs)) < 0.1, "waves should settle near rest");
});
test("wave update is symmetrical when starting from mirrored impulses", () => {
  const n = 110;
  const wave = new Float32Array(n), velocity = new Float32Array(n), scratch = new Float32Array(n);
  velocity[30] = 3; velocity[n - 31] = 3;
  for (let k = 0; k < 40; k++) advanceWave(wave, velocity, scratch);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(wave[i] - wave[n - 1 - i]) < 1e-4);
});
test("corrupt inputs recover instead of painting the whole ball", () => {
  const wave = new Float32Array(110), velocity = new Float32Array(110), scratch = new Float32Array(110);
  wave[11] = Infinity; wave[12] = NaN; velocity[13] = NaN;
  for (let k = 0; k < 300; k++) advanceWave(wave, velocity, scratch);
  assert.ok(wave.every(Number.isFinite));
  assert.ok(velocity.every(Number.isFinite));
});
