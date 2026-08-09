import { expect, test } from "playwright/test";

async function advanceAssignmentToShortAnswer(page: import("playwright/test").Page) {
  await page.locator(".assignment-judgment-options button").first().click();
  await page.locator(".assignment-primary-action .button").click();
  await expect(page.locator('.assignment-exercise-card[data-assignment-type="choice"]')).toBeVisible();
  await page.locator(".assignment-choice-options button").nth(1).click();
  await page.locator(".assignment-primary-action .button").click();
  await expect(page.locator('.assignment-exercise-card[data-assignment-type="short-answer"]')).toBeVisible();
}

test.describe("local DemoRepository P0 flow", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

  test("opens the grounded meiosis lesson and blocks an empty diagnosis submission", async ({ page }) => {
    await page.goto("/?embedded=device-preview");

    await expect(page.getByRole("button", { name: "继续学习", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "继续学习", exact: true }).click();

    await expect(page.locator(".library-screen")).toBeVisible();
    await page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true }).click();

    await expect(page.locator(".book-course-screen")).toBeVisible();
    await page.locator(".course-action-grid").getByRole("button", { name: /RAG 片段/ }).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await expect(page.getByRole("heading", { name: "同源染色体先分离", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "来自教材第 18 页", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "做练习", exact: true }).click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    await advanceAssignmentToShortAnswer(page);
    await page.getByRole("button", { name: "提交作业", exact: true }).click();
    await expect(page.locator("#assignment-answer-error")).toHaveText("请先填写答案，再提交作业诊断。");
    await expect(page.locator(".assignment-card textarea")).toBeFocused();
  });

  test("replays upload through report with deterministic local data only", async ({ page }) => {
    test.setTimeout(75_000);

    const observedRequests: string[] = [];
    let appOrigin = "";
    page.on("request", (request) => {
      observedRequests.push(request.url());
    });

    await page.goto("/?embedded=device-preview");
    appOrigin = new URL(page.url()).origin;
    await page.locator(".nav-upload").click();
    await expect(page.locator(".upload-sheet-screen")).toBeVisible();

    await page.locator("input[type=file]").setInputFiles({
      name: "biology-demo.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 local demo fixture")
    });
    await expect(page.locator(".upload-selection-summary")).toBeVisible();
    await page.getByRole("button", { name: "上传并继续", exact: true }).click();
    await expect(page.locator(".parse-ready-screen")).toBeVisible();

    await page.locator(".parse-actions .button").first().click();
    await expect(page.locator(".processing-flow-screen")).toBeVisible();
    for (const progress of [18, 46, 74]) {
      await expect.poll(
        async () => page.locator(".processing-card .progress-wrap").getAttribute("aria-label"),
        { timeout: 8_000 }
      ).toBe(`解析进度 ${progress}%`);
    }

    await expect(page.locator(".chapter-confirm-screen")).toBeVisible({ timeout: 15_000 });
    const confirmCourseButton = page.locator(".chapter-confirm-actions .button");
    await expect(confirmCourseButton).toBeEnabled();
    await confirmCourseButton.click();

    await expect(page.locator(".course-ready-screen")).toBeVisible({ timeout: 10_000 });
    await page.locator(".course-ready-actions .button").first().click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await page.locator(".chapter-row").first().click();
    await expect(page.locator(".lesson-screen")).toBeVisible();

    await page.locator(".lesson-action-grid button").last().click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    await advanceAssignmentToShortAnswer(page);
    await page.locator(".assignment-card textarea").fill("同源染色体在减数第一次分裂后期分离，姐妹染色单体在第二次分裂后期分离。");
    await page.locator(".assignment-primary-action .button").click();
    await expect(page.locator(".diagnosis-screen")).toBeVisible();
    await expect(page.locator(".diagnosis-card")).toContainText("卡点");

    await page.locator(".diagnosis-actions .button").last().click();
    await expect(page.locator(".mistake-book-screen")).toBeVisible();
    await expect(page.locator(".mistake-list-item")).toHaveCount(1);
    await expect(page.locator(".mistake-detail-card")).toBeVisible();
    await expect(page.locator(".mistake-detail-card")).toContainText("1 条引用来源已记录");

    await page.locator(".mistake-actions > .button").click();
    await expect(page.locator(".flashcard-screen")).toBeVisible();
    await page.locator(".memory-reveal").click();
    await expect(page.locator(".memory-reveal")).toHaveAttribute("aria-pressed", "true");
    await page.locator(".flashcard-context-card .button-row .button").first().click();
    await expect(page.locator(".lesson-screen")).toBeVisible();

    await page.locator(".lesson-bottom-actions .button").last().click();
    await expect(page.locator(".report-screen")).toBeVisible();
    await expect(page.locator(".report-score-ring")).toContainText("82%");

    await page.reload();
    await expect(page.locator(".home-dashboard")).toBeVisible();
    const forbiddenRequests = observedRequests.filter((requestUrl) => {
      try {
        const url = new URL(requestUrl);
        return url.origin !== appOrigin || url.pathname.startsWith("/api");
      } catch {
        return false;
      }
    });
    expect(forbiddenRequests).toEqual([]);
  });
});
