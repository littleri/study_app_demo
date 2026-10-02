import { expect, test } from "playwright/test";

test.describe("Android tablet learning notes", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

  async function openNotesHub(page: import("playwright/test").Page) {
    await page.goto("/?embedded=device-preview");
    await expect(page.locator(".home-dashboard")).toBeVisible();
    await page.getByRole("button", { name: /^学习笔记/u }).click();
    await expect(page.locator(".study-notes-hub")).toBeVisible();
  }

  test("opens an existing handwriting note without starting a new source-page AI flow", async ({ page }) => {
    await openNotesHub(page);

    await expect(page.getByText("字迹需确认 · 减数分裂", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "回到教材批注", exact: true }).click();

    await expect(page.locator('.source-reader-screen[data-annotation-active="true"]')).toBeVisible();
    await expect(page.getByLabel("教材手写批注画布")).toBeVisible();
    await expect(page.locator(".header-title h1")).toHaveText("第 1 节 减数分裂和受精作用");
    await expect(page.getByRole("button", { name: "完成并整理", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "确认并继续整理", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "钢笔", exact: true }).click();
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".study-notes-hub")).toBeVisible();
    await expect(page.locator(".notes-detail-panel")).toContainText("？离");
  });

  test("keeps sample audio, editable transcript, evidence and organized copy separate", async ({ page }) => {
    await openNotesHub(page);
    await page.getByRole("button", { name: "新建笔记", exact: true }).click();

    await expect(page.getByLabel("教材批注页")).toBeVisible();
    await expect(page.getByRole("button", { name: /^手写批注/u })).toBeEnabled();
    await page.getByRole("button", { name: /^语音笔记/u }).click();

    await expect(page.locator(".voice-note-screen")).toBeVisible();
    await page.getByRole("button", { name: "使用示例录音", exact: true }).click();
    await expect(page.getByText("00:08", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "完成并整理", exact: true }).click();

    const transcript = page.getByLabel("语音笔记逐字稿");
    await expect(transcript).toBeVisible({ timeout: 2_000 });
    await expect(transcript).not.toHaveValue("");
    await page.getByRole("button", { name: "确认并继续整理", exact: true }).click();

    await expect(page.getByRole("heading", { name: "独立整理版", exact: true })).toBeVisible({ timeout: 3_500 });
    await expect(page.getByText("教材第 18 页", { exact: true })).toBeVisible();
    await expect(page.getByText("原始录音与确认后的逐字稿均已保留，整理版不会覆盖它们。", { exact: true })).toBeVisible();
  });

  test("opens the original page from the text-note choice and returns to the saved annotation", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await openNotesHub(page);
    await page.getByRole("button", { name: "新建笔记", exact: true }).click();
    await page.getByRole("button", { name: /^文字笔记/u }).click();
    const reader = page.locator(".source-reader-screen");
    await expect(reader).toHaveAttribute("data-note-mode", "text");
    const target = reader.getByRole("button", { name: "点击原文添加批注" });
    await target.click({ position: { x: 100, y: 180 } });
    const editor = reader.getByRole("region", { name: "原文文字笔记" });
    const body = "从学习笔记入口添加的原文批注。";
    await editor.getByLabel("我的理解").fill(body);
    await editor.getByRole("button", { name: "完成", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(reader).toHaveAttribute("data-note-mode", "read");
    await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
    await page.locator(".header-bar .icon-button").click();
    const hub = page.locator(".study-notes-hub");
    await expect(hub).toBeVisible();
    await expect(hub.locator(".study-note-original")).toHaveText(body);
    await hub.getByRole("button", { name: "回到原文批注", exact: true }).click();
    await expect(reader.locator(".source-text-note-body")).toHaveText(body);
    await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
  });
});
