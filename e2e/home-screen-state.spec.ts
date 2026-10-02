import { expect, test } from "playwright/test";

test.describe("production HomeScreen course states", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/home-screen-state-harness.html");
    await expect(page.locator(".home-dashboard")).toBeVisible();
  });

  test("keeps loading, error and empty course states distinct while allowing course creation", async ({ page }) => {
    const dashboard = page.locator(".home-dashboard");
    await expect(dashboard.locator(".home-book-carousel-skeleton")).toBeVisible();
    await expect(dashboard.locator(".home-book-workspace.is-loading")).toBeVisible();
    await expect(dashboard.getByRole("status").filter({ hasText: "正在加载课程列表" })).toHaveCount(2);
    await expect(dashboard.getByRole("button", { name: "创建课程", exact: true })).toBeEnabled();
    await expect(dashboard.locator("[data-tool], .home-global-section")).toHaveCount(0);

    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("error"));
    const error = dashboard.getByRole("alert");
    await expect(error).toContainText("课程资料暂时无法更新");
    await expect(error.getByRole("button", { name: "重新加载", exact: true })).toBeVisible();
    await expect(dashboard.locator(".home-book-picker, .home-book-workspace, .home-global-section")).toHaveCount(0);
    await expect(dashboard.getByText("还没有课程", { exact: true })).toHaveCount(0);
    await error.getByRole("button", { name: "重新加载", exact: true }).click();
    await expect(dashboard.locator(".home-book-carousel-skeleton")).toBeVisible();
    await page.evaluate(() => window.__homeScreenStateHarness?.releaseRefresh());
    await expect(dashboard.getByText("还没有课程", { exact: true })).toBeVisible();
    await expect(dashboard.getByRole("button", { name: "创建第一门课程", exact: true })).toBeVisible();
    await expect(dashboard.locator(".home-book-workspace.is-empty")).toBeVisible();
    await expect(dashboard.locator("[data-tool], .home-global-section")).toHaveCount(0);
  });

  test("clears a failed course announcement when that course disappears on refresh", async ({ page }) => {
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("selection-failure"));
    const listbox = page.getByRole("listbox", { name: "选择课程" });
    const initial = listbox.locator('[data-book-id="parent:book-a"]');
    const failed = listbox.locator('[data-book-id="parent:book-b"]');
    await expect(initial).toHaveAttribute("aria-selected", "true");
    await failed.click();
    const announcement = page.getByRole("status").filter({ hasText: /未能打开.*已回到/ });
    await expect(announcement).toBeVisible();
    await expect(announcement.getByRole("button", { name: "重试切换", exact: true })).toBeVisible();
    await page.evaluate(() => window.__homeScreenStateHarness?.removeFailedBook());
    await expect(failed).toHaveCount(0);
    await expect(announcement).toHaveCount(0);
  });

  test("creates the first course through the material import flow", async ({ page }) => {
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("empty"));
    await page.getByRole("button", { name: "创建第一门课程", exact: true }).click();
    expect(await page.evaluate(() => window.__homeScreenStateHarness?.getRoutes())).toEqual(["upload"]);
  });

  test("only confirms a source directory after its course loads successfully", async ({ page }) => {
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("review-failure"));
    await page.getByRole("button", { name: "确认课程目录", exact: true }).click();
    expect(await page.evaluate(() => window.__homeScreenStateHarness?.getRoutes())).toEqual([]);
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("review-success"));
    await page.getByRole("button", { name: "确认课程目录", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__homeScreenStateHarness?.getRoutes())).toEqual(["chapterConfirm"]);
  });

  test("routes the course plan, mistakes and material management actions", async ({ page }) => {
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("global-actions"));
    const section = page.getByRole("region", { name: "学习安排" });
    await expect(section.locator("[data-home-global-action]")).toHaveCount(3);
    for (const id of ["plan", "mistakes", "upload"]) await section.locator('[data-home-global-action="' + id + '"]').click();
    expect(await page.evaluate(() => window.__homeScreenStateHarness?.getRoutes())).toEqual(["plan", "mistakes", "courseDetail"]);
    const layout = await section.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });

  test("keeps non-ready courses free of chapter tools and does not invent a plan", async ({ page }) => {
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("global-no-plan"));
    await expect(page.locator('[data-home-global-action="plan"]')).toHaveCount(0);
    await expect(page.locator('[data-home-global-action="mistakes"]')).toBeVisible();
    await page.evaluate(() => window.__homeScreenStateHarness?.setMode("review-failure"));
    await expect(page.locator("[data-home-global-action]")).toHaveCount(1);
    await expect(page.locator('[data-home-global-action="upload"]')).toBeVisible();
    await expect(page.locator(".study-tool-grid, [data-tool]")).toHaveCount(0);
  });
});
