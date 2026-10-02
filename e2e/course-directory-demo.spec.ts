import { expect, test, type Page } from "playwright/test";

async function openHome(page: Page) {
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".home-dashboard")).toBeVisible();
  await expect(page.getByRole("listbox", { name: "选择课程" }).getByRole("option")).toHaveCount(6);
  await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
}

async function selectPhysics(page: Page) {
  const options = page.getByRole("listbox", { name: "选择课程" }).getByRole("option");
  await options.nth(0).press("Home");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await options.nth(0).press("ArrowRight");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
  await options.nth(1).press("ArrowRight");
  await expect(options.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-directory-only", "true");
}

test.describe("textbook covers and directory demonstration", () => {
  test.use({ locale: "zh-CN", reducedMotion: "reduce" });

  test("shows real covers and browses the physics directory without learning tools", async ({ page }) => {
    await openHome(page);
    const covers = page.locator(".home-book-cover img");
    await expect(covers).toHaveCount(6);
    await expect(covers.nth(0)).toHaveAttribute("src", "/assets/book-covers/high-school-math-required-2.webp");
    await expect(covers.nth(1)).toHaveAttribute("src", "/assets/book-covers/biology-required-2.webp");
    await expect(covers.nth(2)).toHaveAttribute("src", "/assets/book-covers/physics-required-3.webp");
    await expect(page.locator(".home-book-cover-kicker")).toHaveCount(0);
    await selectPhysics(page);
    await expect.poll(() => covers.nth(2).evaluate((image) => (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(page.getByRole("button", { name: "继续学习", exact: true })).toHaveCount(0);
    await expect(page.locator(".home-chapter-tools")).toHaveCount(0);
    await page.getByRole("button", { name: "查看课程目录", exact: true }).click();
    await expect(page.locator('.study-screen[data-directory-only="true"]')).toBeVisible();
    await expect(page.locator(".study-book-switch img")).toHaveAttribute("src", "/assets/book-covers/physics-required-3.webp");
    await expect(page.locator(".study-directory-heading")).toContainText("5 章 · 23 节");
    await expect(page.locator(".study-chapter")).toHaveCount(5);
    await expect(page.locator(".study-directory-reference")).toHaveCount(2);
    await expect(page.locator(".study-directory-reference").last()).toContainText("教材第 135 页");
    await expect(page.locator(".study-chapter-toggle").first()).not.toHaveAccessibleName(/学习进度/);
    await expect(page.locator(".study-plan-summary, .study-tools-panel, .study-enter-button")).toHaveCount(0);
    await page.locator("#study-chapter-physics-c10-toggle").click();
    await expect(page.locator("#study-section-physics-c10-s1-toggle")).toBeVisible();
    await expect(page.locator("#study-section-physics-c10-s1-content")).toContainText("教材第 26-30 页");
    await expect(page.locator(".study-tools-panel, .study-enter-button")).toHaveCount(0);

    await page.getByRole("button", { name: "首页", exact: true }).click();
    const selected = page.locator('.home-book-option[aria-selected="true"]');
    await selected.press("ArrowLeft");
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-book-id", "book_biology_2");
    await selected.press("ArrowLeft");
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-book-id", "catalog_high_school_math_required_2");
    await expect(page.getByRole("button", { name: "继续学习", exact: true })).toBeEnabled();
  });

  test("browses chemistry, English and calculus using their own covers and original directories", async ({ page }) => {
    await openHome(page);
    const courses = [
      { title: "化学 必修 第二册", cover: "chemistry-required-2", count: "4 章 · 22 个目录项", chapters: 4, references: 4,
        chapterId: "chemistry-c1", sectionId: "chemistry-c1-s5", sectionTitle: "实验活动 4 用化学沉淀法去除粗盐中的杂质离子", pages: "教材第 29 页" },
      { title: "英语 必修 第三册", cover: "english-required-3", count: "5 单元 · 40 个目录项", chapters: 5, references: 10,
        chapterId: "english-c5", sectionId: "english-c5-s4", sectionTitle: "Viewing and Talking", pages: "教材第 55 页" },
      { title: "高等数学 上册（第七版）", cover: "advanced-mathematics-1", count: "7 章 · 46 个目录项", chapters: 7, references: 5,
        chapterId: "calculus-c1", sectionId: "calculus-c1-s1", sectionTitle: "第一节 映射与函数", pages: "教材第 1-17 页" }
    ];
    for (const course of courses) {
      await page.getByRole("button", { name: "全部课程", exact: false }).click();
      await expect(page.locator(".course-library-card")).toHaveCount(6);
      const card = page.locator(".course-library-card").filter({ hasText: course.title });
      await expect(card).toContainText("演示课程 · 目录预览");
      await expect(card.locator("img")).toHaveAttribute("src", `/assets/book-covers/${course.cover}.webp`);
      await card.locator(".course-library-open").click();
      await expect(page.locator('.study-screen[data-directory-only="true"]')).toBeVisible();
      await expect(page.locator(".study-book-switch")).toContainText(course.title);
      await expect(page.locator(".study-book-switch img")).toHaveAttribute("src", `/assets/book-covers/${course.cover}.webp`);
      await expect.poll(() => page.locator(".study-book-switch img").evaluate((image) => (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await expect(page.locator(".study-directory-heading")).toContainText(course.count);
      await expect(page.locator(".study-chapter")).toHaveCount(course.chapters);
      await expect(page.locator(".study-directory-reference")).toHaveCount(course.references);
      const chapterToggle = page.locator(`#study-chapter-${course.chapterId}-toggle`);
      if (await chapterToggle.getAttribute("aria-expanded") !== "true") await chapterToggle.click();
      const sectionToggle = page.locator(`#study-section-${course.sectionId}-toggle`);
      await expect(sectionToggle).toContainText(course.sectionTitle);
      if (await sectionToggle.getAttribute("aria-expanded") !== "true") await sectionToggle.click();
      await expect(page.locator(`#study-section-${course.sectionId}-content`)).toContainText(course.pages);
      await expect(page.locator(".study-plan-summary, .study-tools-panel, .study-enter-button")).toHaveCount(0);
      await page.getByRole("button", { name: "首页", exact: true }).click();
      await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-directory-only", "true");
      await expect(page.locator('.home-book-option[aria-selected="true"]')).toHaveAccessibleName(new RegExp(course.title));
    }
  });

  test("adds demos to existing courses, persists selection and respects removal", async ({ page }) => {
    await openHome(page);
    await selectPhysics(page);
    await page.reload();
    await expect(page.locator('.home-book-option[aria-selected="true"]')).toHaveAccessibleName(/物理 必修 第三册/);
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-directory-only", "true");
    await page.getByRole("button", { name: "全部课程", exact: false }).click();
    await expect(page.locator(".course-library-card")).toHaveCount(6);
    const physics = page.locator(".course-library-card").filter({ hasText: "物理 必修 第三册" });
    await expect(physics).toContainText("演示课程 · 目录预览");
    await expect(physics.locator(".progress-wrap")).toHaveCount(0);
    await physics.getByRole("button", { name: "删除课程 物理 必修 第三册", exact: true }).click();
    await physics.getByRole("button", { name: "确认移除课程", exact: true }).click();
    await expect(page.locator(".course-library-card")).toHaveCount(5);
    await page.reload();
    await expect(page.getByRole("listbox", { name: "选择课程" }).getByRole("option")).toHaveCount(5);
    await expect(page.getByRole("option", { name: /物理 必修 第三册/ })).toHaveCount(0);
  });
});
