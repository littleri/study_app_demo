import { expect, test } from "./fixtures";

test.describe("study directory flow", () => {
  test("keeps the current book bar pinned while the directory scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-study").click();

    const bookBar = page.locator(".study-book-bar");
    const scroller = page.locator('.screen-content[data-screen="study"]');
    await expect(bookBar).toBeVisible();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");

    const initialLayout = await scroller.evaluate((element) => {
      const bar = element.querySelector<HTMLElement>(".study-book-bar");
      const intro = element.querySelector<HTMLElement>(".study-intro");
      return {
        barTop: Math.round(bar?.getBoundingClientRect().top ?? -1),
        barBottom: Math.round(bar?.getBoundingClientRect().bottom ?? -1),
        introTop: Math.round(intro?.getBoundingClientRect().top ?? -1)
      };
    });
    expect(initialLayout.barBottom).toBeLessThanOrEqual(initialLayout.introTop);
    await scroller.evaluate((element) => {
      element.scrollTop = Math.min(600, element.scrollHeight - element.clientHeight);
    });

    await expect.poll(async () => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(200);
    await expect.poll(async () => bookBar.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(initialLayout.barTop);
  });

  test("opens a textbook section and reaches each learning tool", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");

    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "学习", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "学习", exact: true }).click();

    await expect(page.getByRole("heading", { name: "学习", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "打开 AI 助手", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "当前教材 人教版高中生物必修二遗传与进化", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加", exact: true })).toBeVisible();
    const firstChapter = page.getByRole("button", { name: "第 1 章 遗传因子的发现 2 个小节 教材第 1-14 页 学习进度 100% 已完成", exact: true });
    await expect(firstChapter).toHaveAttribute("aria-expanded", "true");
    await expect(firstChapter.locator(".study-chapter-progress")).toHaveAttribute("data-progress", "100");
    await expect(firstChapter.locator(".study-chapter-progress")).toHaveClass(/is-complete/);
    await expect(firstChapter.locator(".study-chapter-progress svg.lucide-check")).toBeVisible();
    await expect(page.getByRole("button", { name: "第 1 节 孟德尔的豌豆杂交实验（一） 教材第 2-8 页 已完成", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "第 2 节 孟德尔的豌豆杂交实验（二） 教材第 9-14 页 已完成", exact: true })).toBeVisible();

    const secondChapter = page.getByRole("button", { name: "第 2 章 基因和染色体的关系 3 个小节 教材第 15-40 页 学习进度 17%", exact: true });
    await expect(secondChapter.locator(".study-chapter-progress")).toHaveAttribute("data-progress", "17");
    await secondChapter.click();
    await expect(secondChapter).toHaveAttribute("aria-expanded", "true");
    await expect(firstChapter).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "一 减数分裂 教材第 16-22 页", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "科学家的故事 染色体遗传理论的奠基人——摩尔根 教材第 32 页", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "更多功能 预留新学习工具", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "进入学习", exact: true }).click();
    await expect(page.getByRole("heading", { name: "原文文档", exact: true })).toBeVisible();
    await expect(page.getByText("教材第 16-26 页（PDF 第 11-21 页）", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
    await expect(secondChapter).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: "作业诊断 提交解题过程，定位理解卡点", exact: true }).click();
    await expect(page.getByRole("heading", { name: "作业练习", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");

    await page.getByRole("button", { name: "闪卡复习 用短时回忆巩固本节概念", exact: true }).click();
    await expect(page.getByRole("heading", { name: "知识点闪卡", exact: true })).toBeVisible();
  });

  test("opens the book switcher and preserves semantic actions", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");
    await page.getByRole("button", { name: "学习", exact: true }).click();
    const switcher = page.getByRole("button", { name: "当前教材 人教版高中生物必修二遗传与进化", exact: true });
    await expect(switcher).toBeVisible();
    await switcher.click();

    await expect(page.getByRole("dialog", { name: "切换教材" })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加新教材", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "管理全部教材", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await expect(page.getByRole("heading", { name: "上传书籍", exact: true })).toBeVisible();
  });

  test("uses a master-detail directory layout on iPad without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto("/?embedded=device-preview");
    await page.getByRole("button", { name: "学习", exact: true }).click();
    await expect(page.getByRole("heading", { name: "教材目录", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "第 7 章 现代生物进化理论 2 个小节 教材第 109-130 页 学习进度 0%", exact: true })).toBeVisible();

    const layout = await page.locator(".study-screen").evaluate((element) => {
      const intro = element.querySelector<HTMLElement>(".study-intro");
      const directory = element.querySelector<HTMLElement>(".study-directory");
      return {
        display: getComputedStyle(element).display,
        introLeft: intro?.getBoundingClientRect().left ?? 0,
        directoryLeft: directory?.getBoundingClientRect().left ?? 0,
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      };
    });

    expect(layout.display).toBe("grid");
    expect(layout.directoryLeft).toBeGreaterThan(layout.introLeft);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  });
});
