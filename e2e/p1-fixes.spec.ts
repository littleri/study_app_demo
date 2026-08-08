import { expect, test, type Page } from "playwright/test";

async function openLesson(page: Page) {
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "继续学习", exact: true }).click();
  await expect(page.locator(".library-screen")).toBeVisible();
  await page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true }).click();
  await expect(page.locator(".book-course-screen")).toBeVisible();
  await page.locator(".course-action-grid").getByRole("button", { name: /RAG 片段/ }).click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
}

async function readMainScrollTop(page: Page) {
  return page.locator(".screen-content").evaluate((element) => element.scrollTop);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const content = document.querySelector<HTMLElement>(".screen-content");
    if (!shell || !content) throw new Error("P1 layout test requires the app shell and main content");
    return {
      contentClientWidth: content.clientWidth,
      contentScrollWidth: content.scrollWidth,
      shellClientWidth: shell.clientWidth,
      shellScrollWidth: shell.scrollWidth
    };
  });
  expect(widths.contentScrollWidth).toBeLessThanOrEqual(widths.contentClientWidth + 1);
  expect(widths.shellScrollWidth).toBeLessThanOrEqual(widths.shellClientWidth + 1);
}

test.describe("P1 learning flow safeguards", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

  test("starts new screens at the top, restores back destinations, and leaves ActionSheet scroll untouched", async ({ page }) => {
    await openLesson(page);
    await expectNoHorizontalOverflow(page);
    const main = page.locator(".screen-content");
    await main.evaluate((element) => {
      const inlineScrollBehavior = element.style.scrollBehavior;
      element.style.scrollBehavior = "auto";
      element.scrollTop = element.scrollHeight;
      element.style.scrollBehavior = inlineScrollBehavior;
    });
    const lessonScrollTop = await readMainScrollTop(page);
    expect(lessonScrollTop).toBeGreaterThan(100);

    await page.getByRole("button", { name: "完成章节", exact: true }).click();
    await expect(page.locator(".report-screen")).toBeVisible();
    await expect.poll(() => readMainScrollTop(page)).toBe(0);

    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await expect.poll(async () => Math.abs((await readMainScrollTop(page)) - lessonScrollTop)).toBeLessThanOrEqual(24);

    const chatButton = page.getByRole("button", { name: "问 AI", exact: true });
    await chatButton.scrollIntoViewIfNeeded();
    const lessonScrollBeforeSheet = await readMainScrollTop(page);
    await chatButton.click();
    const chatSheet = page.locator(".sheet[data-sheet-type='chat']");
    await expect(chatSheet).toBeVisible();
    await expect.poll(() => readMainScrollTop(page)).toBe(lessonScrollBeforeSheet);
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(chatSheet).toHaveCount(0);

    await page.getByRole("button", { name: "回课程主页", exact: true }).click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await expect.poll(() => readMainScrollTop(page)).toBe(0);
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await expect.poll(async () => Math.abs((await readMainScrollTop(page)) - lessonScrollBeforeSheet)).toBeLessThanOrEqual(24);
  });

  test("keeps choosing local, uploads only after confirmation, and starts parsing only from ParseReady", async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-upload").click();
    await expect(page.locator(".upload-flow-screen")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "biology-confirmation.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 confirmation fixture")
    });
    await expect(page.locator(".upload-selection-summary")).toContainText("biology-confirmation.pdf");
    await expect(page.locator(".upload-selection-summary")).toContainText("PDF 教材");
    await expect(page.locator(".parse-ready-screen")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "取消选择", exact: true }).click();
    await expect(page.locator(".upload-selection-summary")).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles({
      name: "biology-confirmation.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 confirmation fixture")
    });
    await page.getByRole("button", { name: "上传并继续", exact: true }).click();
    await expect(page.locator(".parse-ready-screen")).toBeVisible();
    await expect(page.getByText("点击下方按钮后才会开始后台解析", { exact: false })).toBeVisible();
    await expect(page.locator(".processing-flow-screen")).toHaveCount(0);

    await page.getByRole("button", { name: "开始后台解析", exact: true }).click();
    await expect(page.locator(".processing-flow-screen")).toBeVisible();
  });

  test("collapses deduplicated learner-facing evidence while keeping every source available", async ({ page }) => {
    await openLesson(page);

    const evidenceSummary = page.locator(".lesson-evidence-summary");
    const evidenceToggle = evidenceSummary.getByRole("button", { name: /本节 \d+ 个来源/ });
    await expect(evidenceToggle).toHaveAttribute("aria-expanded", "false");
    await expect(evidenceSummary).not.toContainText("chunk_c2s1_");
    await expect(page.getByRole("button", { name: "来自教材第 18 页", exact: true }).first()).toBeVisible();

    await evidenceToggle.click();
    await expect(evidenceToggle).toHaveAttribute("aria-expanded", "true");
    const sourceButton = evidenceSummary.locator(".lesson-evidence-source").filter({ hasText: "同源染色体先分离" }).first();
    await expect(sourceButton).toContainText("同源染色体先分离");
    await expect(sourceButton).toContainText("教材第 18 页");
    await expectNoHorizontalOverflow(page);
    await sourceButton.click();
    await expect(page.locator(".source-reader-screen")).toBeVisible();
  });
});
