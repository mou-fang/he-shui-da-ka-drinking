import {test} from "node:test";
import assert from "node:assert/strict";
import {hexRgb,mixRgb,cssRgb,DEFAULT_WATER_COLORS} from "../src/palette.js";
test("主题渐变不在第一帧闪成新颜色，最终平滑收敛",()=>{
  const a=hexRgb("#00ff00"),b=hexRgb("#ff0000");
  const first=mixRgb(a,b,0.1);
  assert.deepEqual(first,[25.5,229.5,0]);
  let p=first;
  for(let i=0;i<100;i++)p=mixRgb(p,b,0.1);
  assert.ok(p[0]>254.99 && p[1]<0.01);
  assert.equal(cssRgb(p),"rgb(255,0,0)");
});
test("静态模式可直接切换到目标颜色并有有效默认色",()=>{
  assert.deepEqual(mixRgb([0,0,0],[255,127,63],1),[255,127,63]);
  assert.deepEqual(hexRgb(DEFAULT_WATER_COLORS.top),[191,232,255]);
  assert.throws(()=>hexRgb("red"));
});
