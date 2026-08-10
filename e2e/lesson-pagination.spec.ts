import { expect, test } from "playwright/test";

test.describe("lesson knowledge pagination", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", timezoneId: "Asia/Hong_Kong" });

  test("uses the lesson introduction as page one, then shows one knowledge point per page", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");
    await page.getByRole("button", { name: "继续学习", exact: true }).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();

    const lessonHeaderBar = page.locator('.app-shell[data-active-screen="lesson"] .header-bar');
    const lessonHeader = lessonHeaderBar.locator(".header-glass");
    const statusBar = page.getByTestId("ios-status-bar");
    await expect(lessonHeaderBar).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(lessonHeader).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(statusBar).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(lessonHeader).toHaveCSS("backdrop-filter", "none");
    const topChromeBounds = await lessonHeaderBar.boundingBox();
    const statusBounds = await statusBar.boundingBox();
    expect(topChromeBounds?.y).toBe(0);
    expect((topChromeBounds?.y ?? 0) + (topChromeBounds?.height ?? 0)).toBeGreaterThan(
      (statusBounds?.y ?? 0) + (statusBounds?.height ?? 0)
    );

    const pager = page.locator(".lesson-knowledge-pager");
    const progress = pager.getByRole("progressbar", { name: "章节学习进度" });
    const learningPage = pager.locator(".lesson-learning-page");
    const knowledgePage = pager.locator(".lesson-knowledge-section");
    const introductionPage = pager.locator(".lesson-introduction");
    const completionButton = page.getByRole("button", { name: "完成本节", exact: true });

    await expect(pager).toBeVisible();
    await expect(learningPage).toHaveCount(1);
    await expect(introductionPage).toHaveCount(1);
    await expect(knowledgePage).toHaveCount(0);
    await expect(pager.locator(".lesson-page-controls")).toHaveCount(0);
    await expect(page.locator(".lesson-concepts, .concept-card-grid")).toHaveCount(0);
    await expect(completionButton).toHaveCount(0);
    await expect(page.locator(".lesson-article-header")).toHaveCount(0);
    await expect(introductionPage.getByRole("heading", { name: "减数分裂和受精作用", exact: true })).toBeVisible();
    await expect(introductionPage.getByRole("heading", { name: "本节导读", exact: true })).toBeVisible();
    await expect(introductionPage.locator(".lesson-inline-figure img")).toHaveAttribute(
      "src",
      "/assets/lesson/meiosis-fertilization-cycle-v1.webp"
    );
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    const sourceEntry = pager.locator(".lesson-source-link");
    const openAndCloseCurrentSource = async () => {
      await learningPage.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
      });
      await expect(sourceEntry).toHaveCount(1);
      await expect(sourceEntry).toContainText("查看原文");
      await expect(sourceEntry.locator("small")).toHaveCount(0);
      await expect(sourceEntry).toHaveText("查看原文");
      await expect(sourceEntry).toHaveCSS("border-top-style", "none");
      await expect(sourceEntry).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await sourceEntry.click();
      const sourceDialog = page.getByRole("dialog");
      await expect(sourceDialog).toBeVisible();
      await expect(sourceDialog).toContainText("查看原文");
      await expect(sourceDialog.locator(".source-reference-sheet > .pill")).toBeVisible();
      await sourceDialog.getByRole("button", { name: "关闭", exact: true }).click();
      await expect(sourceDialog).toHaveCount(0);
    };
    const pagerBounds = await pager.boundingBox();
    expect(pagerBounds).not.toBeNull();
    expect(pagerBounds?.height ?? 0).toBeGreaterThanOrEqual(500);
    expect(pagerBounds?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(170);
    const pagerEdgeMetrics = await pager.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const homeIndicatorHeight = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ios-home-indicator-height")
      ) || 0;
      return {
        bottomGap: window.innerHeight - bounds.bottom,
        homeIndicatorHeight
      };
    });
    expect(Math.abs(pagerEdgeMetrics.bottomGap - pagerEdgeMetrics.homeIndicatorHeight)).toBeLessThanOrEqual(3);
    await openAndCloseCurrentSource();

    await pager.focus();
    await page.keyboard.press("ArrowRight");
    await expect(progress).toHaveAttribute("aria-valuenow", "2");
    await expect(introductionPage).toHaveCount(0);
    await expect(knowledgePage).toHaveCount(1);
    await expect(learningPage).toHaveAttribute("data-page-direction", "forward");
    await expect(learningPage).toHaveCSS("animation-name", "motion-lesson-page-forward-in");
    await expect(learningPage).toHaveCSS("animation-duration", "0.35s");
    await expect(knowledgePage.locator(":scope > p")).toHaveCount(3);
    await expect(knowledgePage.locator(".lesson-inline-figure")).toHaveCount(2);
    await expect(knowledgePage.locator(".lesson-inline-figure img").nth(0)).toHaveAttribute(
      "src",
      "/assets/lesson/meiosis-dna-replication-v1.webp"
    );
    await expect(knowledgePage.locator(".lesson-inline-figure img").nth(1)).toHaveAttribute(
      "src",
      "/assets/lesson/meiosis-overview-v2.webp"
    );
    const sourcePosition = await sourceEntry.evaluate((element) => {
      const sourceBounds = element.getBoundingClientRect();
      const cardBounds = element.closest(".lesson-learning-page")?.getBoundingClientRect();
      return cardBounds ? {
        rightGap: cardBounds.right - sourceBounds.right,
        bottomGap: cardBounds.bottom - sourceBounds.bottom
      } : null;
    });
    expect(sourcePosition).not.toBeNull();
    expect(sourcePosition?.rightGap ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(20);
    expect(sourcePosition?.bottomGap ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(16);
    await expect(sourceEntry).toHaveCount(1);
    await expect(sourceEntry).toContainText("查看原文");
    await expect(completionButton).toHaveCount(0);
    await openAndCloseCurrentSource();

    await page.keyboard.press("ArrowLeft");
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    await expect(introductionPage).toHaveCount(1);
    await expect(knowledgePage).toHaveCount(0);
    await expect(learningPage).toHaveAttribute("data-page-direction", "back");
    await expect(learningPage).toHaveCSS("animation-name", "motion-lesson-page-back-in");

    await pager.scrollIntoViewIfNeeded();
    const swipeBounds = await pager.boundingBox();
    if (swipeBounds) {
      const gestureY = swipeBounds.y + Math.min(180, swipeBounds.height / 2);
      await page.mouse.move(swipeBounds.x + swipeBounds.width * 0.78, gestureY);
      await page.mouse.down();
      await page.mouse.move(swipeBounds.x + swipeBounds.width * 0.22, gestureY, { steps: 5 });
      await page.mouse.up();
    }
    await expect(progress).toHaveAttribute("aria-valuenow", "2");
    await expect(knowledgePage).toHaveCount(1);

    const pageCount = Number(await progress.getAttribute("aria-valuemax"));
    expect(pageCount).toBeGreaterThan(2);
    for (let pageIndex = 2; pageIndex < pageCount; pageIndex += 1) {
      await pager.focus();
      await page.keyboard.press("ArrowRight");
      await expect(progress).toHaveAttribute("aria-valuenow", String(pageIndex + 1));
      await openAndCloseCurrentSource();
    }
    await expect(progress).toHaveAttribute("aria-valuenow", String(pageCount));
    await expect(learningPage).toHaveCount(1);
    await expect(completionButton).toBeVisible();
  });
});
