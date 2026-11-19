// 稳定的高度场：从上一帧快照读取相邻采样，避免原位更新造成数值正反馈。
// 传入预分配 scratch，动画循环不产生额外垃圾分配。
export function advanceWave(wave, velocity, scratch, slope = 0) {
  const n = wave.length;
  if (n < 2 || velocity.length !== n || scratch.length !== n) throw new Error("Wave buffers must have equal length >= 2");
  scratch.set(wave);
  for (let i = 0; i < n; i++) {
    const center = Number.isFinite(scratch[i]) ? scratch[i] : 0;
    const left = Number.isFinite(scratch[i - 1]) ? scratch[i - 1] : center;
    const right = Number.isFinite(scratch[i + 1]) ? scratch[i + 1] : center;
    const acceleration = (left + right - 2 * center) * 0.32 - center * 0.02;
    const oldV = Number.isFinite(velocity[i]) ? velocity[i] : 0;
    const newV = (oldV + acceleration) * 0.985;
    velocity[i] = Math.max(-16, Math.min(16, newV));
    const next = center + velocity[i] + slope * (i / (n - 1) - 0.5) * 0.02;
    wave[i] = Math.max(-32, Math.min(32, next));
  }
}
