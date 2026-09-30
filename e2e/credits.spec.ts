import { expect, test } from "./fixtures";

test("AI questions spend persistent credits and block requests when the balance is empty", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?embedded=device-preview");
  await expect(page.getByRole("listbox", { name: "选择教材" })).toBeVisible();
  await page.getByRole("button", { name: "发现", exact: true }).click();
  await page.locator(".ai-orb").click();
  const dialog = page.getByRole("dialog", { name: "AI 导学助手" });
  await expect(dialog.locator(".ai-credit-summary")).toContainText("剩余 100 积分 · 每次提问消耗 1 积分");

  await dialog.getByRole("textbox", { name: "向 AI 助手提问" }).fill("有哪些课程可以学习？");
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect(dialog.locator(".ai-credit-summary")).toContainText("剩余 99 积分");
  await expect(dialog.locator(".ai-message.ai").last()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("listbox", { name: "选择教材" })).toBeVisible();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的积分" })).toBeVisible();
  await expect(page.locator(".profile-credits-card")).toContainText("99积分");
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await page.locator(".ai-orb").click();
  await expect(page.getByRole("dialog", { name: "AI 导学助手" }).locator(".ai-credit-summary"))
    .toContainText("剩余 99 积分");

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bookcourse.credits.v1")!);
    state.balance = 0;
    localStorage.setItem("bookcourse.credits.v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole("listbox", { name: "选择教材" })).toBeVisible();
  await page.locator(".ai-orb").click();
  const emptyDialog = page.getByRole("dialog", { name: "AI 导学助手" });
  await emptyDialog.getByRole("textbox", { name: "向 AI 助手提问" }).fill("再问一个问题");
  await emptyDialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect(emptyDialog.locator(".ai-credit-summary")).toContainText("积分不足");
  await expect(emptyDialog.locator(".ai-message.user")).toHaveCount(0);
});

test("video confirmation shows its cost and keeps an insufficient balance unchanged", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bookcourse.credits.v1", JSON.stringify({ version: 1, balance: 5, transactions: [] }));
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?embedded=device-preview");
  await expect(page.getByRole("listbox", { name: "选择教材" })).toBeVisible();
  await page.getByRole("button", { name: "学习", exact: true }).click();
  const chapter = page.getByRole("button", { name: /第 2 章 基因和染色体的关系/ });
  if (await chapter.getAttribute("aria-expanded") !== "true") await chapter.click();
  const section = page.getByRole("button", { name: /第 1 节 减数分裂和受精作用/ });
  if (await section.getAttribute("aria-expanded") !== "true") await section.click();
  await section.locator("..").getByRole("button", { name: "进入学习", exact: true }).click();
  await page.getByRole("button", { name: "看懂减数分裂", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "是否生成讲解视频？" });
  await expect(dialog).toContainText("本次生成消耗 10 积分");
  await expect(dialog).toContainText("当前剩余 5 积分");
  await dialog.getByRole("button", { name: "是，生成视频" }).click();
  await expect(dialog.getByRole("alert")).toContainText("积分不足");
  await expect(page.locator(".lesson-video-loading-screen")).toHaveCount(0);
  await expect(page.locator("#lesson-animation-dialog")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.credits.v1")!).balance)).toBe(5);
});
