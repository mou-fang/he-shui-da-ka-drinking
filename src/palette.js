// 主题颜色插值，负责日期切换时避免整张水球瞬间换色。
export const DEFAULT_WATER_COLORS = Object.freeze({top:"#bfe8ff",deep:"#1e6fd9"});
export function hexRgb(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Expected #RRGGBB");
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
}
export function mixRgb(current,target,amount=0.1) {
  const k=Math.max(0,Math.min(1,amount));
  return current.map((v,i)=>v+(target[i]-v)*k);
}
export function cssRgb(values) { return "rgb("+values.map(v=>Math.round(v)).join(",")+")"; }
