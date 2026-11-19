import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 固定本地 15:30，避免测试依赖 GitHub Runner 的实际时区/时刻。
  await page.clock.setFixedTime(new Date("2026-11-19T07:30:00Z"));
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("空状态、打卡、撤销以及目标达成的状态一致", async ({ page }) => {
  await expect(page.locator("#totalNum")).toHaveText("0");
  await page.getByRole("button", { name: "额外加喝" }).click();
  await expect(page.locator("#totalNum")).toHaveText("250", { timeout: 3500 });
  await expect(page.locator("#leftLabel")).toHaveText("还差 1750 ml");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.locator("#totalNum")).toHaveText("0", { timeout: 3500 });
});
test("重复快速打卡再切日期没有旧动画覆盖新数字", async ({ page }) => {
  await page.getByRole("button", { name: "额外加喝" }).click();
  await page.getByRole("button", { name: "额外加喝" }).click();
  await page.locator("#prevDay").click();
  await expect(page.locator("#totalNum")).toHaveText("0");
  await page.locator("#nextDay").click();
  await expect(page.locator("#totalNum")).toHaveText("500");
  await page.waitForTimeout(2100);
  await expect(page.locator("#totalNum")).toHaveText("500");
});
test("已存在的时段修改设置后仍能看到并撤销", async ({ page }) => {
  await page.locator("#slots .slot").first().click();
  await page.locator("#setStart").fill("9");
  await page.locator("#saveSettings").click();
  await expect(page.locator("#slots")).toContainText("旧时段");
  await page.locator("#slots .slot").filter({ hasText: "08:00" }).click();
  await expect(page.locator("#leftLabel")).toHaveText("还差 2000 ml");
});
test("达到目标后再喝超量触发破裂碎片，撤销后平滑恢复", async ({ page }) => {
  await page.emulateMedia({ reducedMotion:"no-preference" });
  await page.locator("#amountInput").fill("1000");
  await page.locator("#amountInput").blur();
  await expect(page.locator("#amountNum")).toHaveText("1000");
  await page.locator("#extraBtn").click();
  await page.locator("#extraBtn").click();
  await expect(page.locator("#leftLabel")).toHaveText("已超 0 ml");
  await page.locator("#extraBtn").click();
  await expect(page.locator("#ballWrap")).toHaveClass(/broken/);
  await expect(page.locator(".shard")).toHaveCount(14);
  await page.getByRole("button", {name:"撤销"}).last().click();
  await expect(page.locator("#ballWrap")).not.toHaveClass(/broken/);
});
test("导出备份提供 JSON 下载", async ({ page }) => {
  await page.locator("#extraBtn").click();
  const [download] = await Promise.all([page.waitForEvent("download"),page.locator("#exportData").click()]);
  expect(download.suggestedFilename()).toMatch(/^he-shui-da-ka-.*\.json$/);
});
test("系统提醒入口说明平台能力且可在获得权限时启用", async ({ page, context }) => {
  await context.grantPermissions(["notifications"], { origin:"http://127.0.0.1:5173" });
  await page.locator("#toggleReminders").click();
  await expect(page.locator("#toggleReminders")).toHaveText("关闭系统提醒");
  await expect(page.locator("#reminderStatus")).toContainText("已启用");
  await page.locator("#toggleReminders").click();
  await expect(page.locator("#toggleReminders")).toHaveText("开启系统提醒");
});
test("移动端预设横向滑动不造成页面整体水平溢出", async ({ page }) => {
  await page.locator("#presetTrack").getByRole("button", {name:"1000",exact:true}).click();
  await expect(page.locator("#amountNum")).toHaveText("1000");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test("入场滑块动画不能覆盖用户刚输入的毫升数", async ({ page }) => {
  await page.locator("#amountInput").fill("750");
  await expect(page.locator("#amountNum")).toHaveText("750");
  await page.waitForTimeout(350);
  await expect(page.locator("#amountNum")).toHaveText("750");
});

test("损坏 JSON 不应被第一次点击覆盖，仍可导出原始恢复文件", async ({page}) => {
  await page.evaluate(() => localStorage.setItem("hsdq-v1","{bad json"));
  await page.reload();
  await page.locator("#extraBtn").click();
  const stored = await page.evaluate(() => localStorage.getItem("hsdq-v1"));
  expect(stored).toBe("{bad json");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportData").click()
  ]);
  expect(download.suggestedFilename()).toContain("raw-recovery");
});
test("初次启动滑块动画不修改真实数值或输入框", async ({page}) => {
  await expect(page.locator("#amountNum")).toHaveText("250");
  await expect(page.locator("#amountInput")).toHaveValue("250");
  await page.waitForTimeout(300);
  await expect(page.locator("#amountNum")).toHaveText("250");
  await expect(page.locator("#amountInput")).toHaveValue("250");
});
test("多个手机宽度下卡片不互相覆盖且页面没有水平溢出",async ({page}) => {
  for (const width of [320,360,375,390,412,480]) {
    await page.setViewportSize({width,height:850});
    const positions = await page.evaluate(() => {
      const hero = document.querySelector(".hero").getBoundingClientRect();
      const amount = document.querySelector("#amountCard").getBoundingClientRect();
      const action = document.querySelector("#actionRow").getBoundingClientRect();
      return {
        heroBottom: hero.bottom, amountTop: amount.top,
        actionLeft: action.left, actionRight: action.right,
        amountLeft: amount.left, amountRight: amount.right,
        overflow:document.documentElement.scrollWidth-window.innerWidth
      };
    });
    expect(positions.overflow).toBeLessThanOrEqual(2);
    expect(positions.heroBottom).toBeLessThanOrEqual(positions.amountTop+2);
    expect(positions.actionLeft).toBeGreaterThanOrEqual(positions.amountLeft);
    expect(positions.actionRight).toBeLessThanOrEqual(positions.amountRight);
  }
});


test("切换历史日期时水球液面逐帧变化而非闪现", async ({page}) => {
  await page.locator("#amountInput").fill("1000");
  await page.locator("#amountInput").blur();
  await page.locator("#extraBtn").click();
  await page.locator("#extraBtn").click();
  const atCenter = () => page.locator("#ball").evaluate(canvas => {
    const rgba = canvas.getContext("2d").getImageData(320,320,1,1).data;
    return { red: rgba[0], green: rgba[1], blue: rgba[2] };
  });
  await expect.poll(async () => (await atCenter()).red, { timeout: 4000 }).toBeLessThan(200);
  await page.waitForTimeout(1100); // 让水位真正接近满水，再检测切日期首帧
  await page.locator("#prevDay").click();
  await page.waitForTimeout(80);
  // 旧液位需逐步下降；不允许在切日期的第一帧直接清空水球。
  expect((await atCenter()).red).toBeLessThan(220);
  await expect.poll(async () => (await atCenter()).red, { timeout: 4000 }).toBeGreaterThan(220);
});

test("历史目标值不被今天修改目标所覆盖", async ({page}) => {
  const yesterday=await page.evaluate(() => {
    const d=new Date(); d.setDate(d.getDate()-1);
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  });
  await page.evaluate(date => {
    localStorage.setItem("hsdq-v1",JSON.stringify({
      settings:{goal:2000,defaultAmount:250,startHour:8,intervalHours:2,removedSlots:[],remindersEnabled:false},
      days:{[date]:{goal:2000,slots:{"08:00":2000},slotMeta:{},bonus:[]}},celebrated:{}
    }));
  },yesterday);
  await page.reload();
  await page.locator("#setGoal").fill("3000");
  await page.locator("#saveSettings").click();
  await page.locator("#prevDay").click();
  await expect(page.locator("#goalLabel")).toHaveText("目标 2000 ml");
  await expect(page.locator("#leftLabel")).toHaveText("已超 0 ml");
});
test("系统减少动态效果时不生成额外碎片或纸屑", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator("#amountInput").fill("2000");
  await page.locator("#amountInput").blur();
  await page.locator("#extraBtn").click();
  await page.locator("#extraBtn").click();
  await expect(page.locator("#ballWrap")).toHaveClass(/broken/);
  await expect(page.locator(".shard")).toHaveCount(0);
});

test("跨过本地午夜重新聚焦自动切换日期且保留昨天记录", async ({ page }) => {
  await page.locator("#extraBtn").click();
  await expect(page.locator("#totalNum")).toHaveText("250");
  await page.clock.setFixedTime(new Date("2026-11-19T16:01:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#dateLabel")).toHaveText("今天");
  await expect(page.locator("#totalNum")).toHaveText("0");
  await page.locator("#prevDay").click();
  await expect(page.locator("#totalNum")).toHaveText("250");
});

test("历史日期标题与空曲线提示不再误写今天", async ({page}) => {
  await page.locator("#prevDay").click();
  await expect(page.locator("#slotsTitle")).toContainText("2026-11-18");
  await expect(page.locator("#curveTitle")).toContainText("2026-11-18");
  await expect(page.locator("#slotsHint")).toContainText("历史时段不可更改");
  await page.locator("#nextDay").click();
  await expect(page.locator("#slotsTitle")).toHaveText("今天的时段");
  await expect(page.locator("#curveTitle")).toHaveText("今日每杯曲线");
});

test("可解析但包含损坏记录时只读保护原始数据", async ({ page }) => {
  const payload = JSON.stringify({
    settings:{goal:2000,defaultAmount:250,startHour:8,intervalHours:2},
    days:{"2026-11-19":{slots:{"08:00":250},bonus:[{id:"bad",ml:"250",time:"12:30"}]}}
  });
  await page.evaluate(p => localStorage.setItem("hsdq-v1",p),payload);
  await page.reload();
  await page.locator("#extraBtn").click();
  expect(await page.evaluate(() => localStorage.getItem("hsdq-v1"))).toBe(payload);
  const [download] = await Promise.all([page.waitForEvent("download"),page.locator("#exportData").click()]);
  expect(download.suggestedFilename()).toContain("raw-recovery");
});
test("发现另一个窗口更新时不覆盖对方刚写入的记录", async ({ page }) => {
  const other = await page.evaluate(() => {
    const now=new Date();
    const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
    const value={
      settings:{goal:2000,defaultAmount:250,startHour:8,intervalHours:2},
      days:{[date]:{slots:{"08:00":500},bonus:[]}}
    };
    const raw=JSON.stringify(value);
    localStorage.setItem("hsdq-v1",raw);
    return raw;
  });
  await page.locator("#extraBtn").click();
  expect(await page.evaluate(() => localStorage.getItem("hsdq-v1"))).toBe(other);
  await expect(page.locator("#leftLabel")).toHaveText("还差 1500 ml");
});

test("夜间 23:45 的饮水记录也显示在全天曲线中", async ({ page }) => {
  await page.evaluate(() => {
    const d=new Date();
    const day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
    const state={
      settings:{goal:2000,defaultAmount:250,startHour:8,intervalHours:2},
      days:{[day]:{goal:2000,slots:{},bonus:[{id:"late",ml:350,time:"23:45"}]}},
      celebrated:{}
    };
    localStorage.setItem("hsdq-v1",JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator("#curve")).toHaveAttribute("aria-label",/23:45 350 毫升/);
  await expect(page.locator(".axis-note")).toContainText("00:00–24:00");
  await expect(page.locator("#totalNum")).toHaveText("350");
});


test("存储空间失败不能把未保存的喝水量显示为成功", async ({ page }) => {
  await page.evaluate(() => {
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key, value) {
      if (key==="hsdq-v1") throw new DOMException("Simulated quota failure", "QuotaExceededError");
      return original.call(this,key,value);
    };
  });
  await page.locator("#extraBtn").click();
  await expect(page.locator("#totalNum")).toHaveText("0");
  await expect(page.locator("#leftLabel")).toHaveText("还差 2000 ml");
  await expect(page.locator("#toast")).toContainText("保存失败");
});
test("JSON 备份导出与导入可恢复全部已记录的饮水量", async ({ page }) => {
  await page.locator("#extraBtn").click();
  await expect(page.locator("#leftLabel")).toHaveText("还差 1750 ml");
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportData").click()
  ]);
  page.once("dialog",dialog => dialog.accept());
  await page.locator("#clearToday").click();
  await expect(page.locator("#totalNum")).toHaveText("0");
  page.once("dialog",dialog => dialog.accept());
  await page.locator("#importFile").setInputFiles(await download.path());
  await expect(page.locator("#totalNum")).toHaveText("250");
  await expect(page.locator("#leftLabel")).toHaveText("还差 1750 ml");
});


test("时段按钮点击前后保留同一个 DOM 节点与键盘焦点，颜色支持平滑过渡", async ({ page }) => {
  const first = page.locator("#slots .slot").first();
  await first.focus();
  const before = await first.evaluate(node => { window.__slotBefore = node; return node.classList.contains("done"); });
  expect(before).toBe(false);
  await first.press("Enter");
  await expect(first).toHaveClass(/done/);
  expect(await first.evaluate(node => node === window.__slotBefore && document.activeElement === node)).toBe(true);
  expect(await first.getAttribute("aria-pressed")).toBe("true");
  await first.press("Enter");
  await expect(first).not.toHaveClass(/done/);
  expect(await first.evaluate(node => node === window.__slotBefore && document.activeElement === node)).toBe(true);
});
test("短时间再次达标不会被上次的定时器提前取消新水球弹性动画", async ({ page }) => {
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.locator("#setGoal").fill("500");
  await page.locator("#saveSettings").click();
  await page.locator("#amountInput").fill("500");
  await page.locator("#amountInput").blur();
  await page.locator("#extraBtn").click();
  await expect(page.locator("#ballWrap")).toHaveClass(/squash/);
  await page.waitForTimeout(300);
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#clearToday").click();
  await page.locator("#extraBtn").click();
  await expect(page.locator("#ballWrap")).toHaveClass(/squash/);
  await page.waitForTimeout(420);
  await expect(page.locator("#ballWrap")).toHaveClass(/squash/);
});


test("90 天历史弹窗支持键盘浏览、Escape 关闭并恢复原有焦点", async ({ page }) => {
  const opener = page.locator("#openHistory");
  await opener.focus();
  await opener.press("Enter");
  await expect(page.locator("#historyOverlay")).toHaveClass(/open/);
  await expect(page.locator("#closeHistory")).toBeFocused();
  await expect(page.locator("#hist90")).toHaveCount(1);
  await expect(page.locator(".hist90-row")).toHaveCount(90);
  await page.keyboard.press("Escape");
  await expect(page.locator("#historyOverlay")).not.toHaveClass(/open/);
  await expect(opener).toBeFocused();
  await opener.press("Enter");
  await page.locator(".hist90-row").nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#dateLabel")).toHaveText("昨天");
  await expect(opener).toBeFocused();
});
