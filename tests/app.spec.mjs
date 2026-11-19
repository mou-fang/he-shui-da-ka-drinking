import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
  await page.emulateMedia({ reducedMotion:"reduce" });
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
  await page.locator("#prevDay").click();
  await page.waitForTimeout(80);
  // 旧液位需逐步下降；不允许在切日期的第一帧直接清空水球。
  expect((await atCenter()).red).toBeLessThan(220);
  await expect.poll(async () => (await atCenter()).red, { timeout: 4000 }).toBeGreaterThan(220);
});
