import { expect, test } from "./fixtures";

test.describe("study directory flow", () => {
  test("keeps the book bar and learning plan pinned while the directory scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-study").click();

    const bookBar = page.locator(".study-book-bar");
    const stickyStack = page.locator(".study-sticky-stack");
    const plan = page.locator(".study-plan-summary");
    const scroller = page.locator('.screen-content[data-screen="study"]');
    await expect(bookBar).toBeVisible();
    await expect(plan).toBeVisible();
    await expect(plan).toHaveAttribute("data-plan-state", "expanded");
    await expect(page.getByRole("heading", { name: "学习计划", exact: true })).toBeVisible();
    await expect(page.getByText("沿着原书目录继续", { exact: true })).toHaveCount(0);
    await expect(page.getByText("从这里继续", { exact: true })).toHaveCount(0);
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");

    const initialLayout = await scroller.evaluate((element) => {
      const bar = element.querySelector<HTMLElement>(".study-book-bar");
      const plan = element.querySelector<HTMLElement>(".study-plan-summary");
      const directory = element.querySelector<HTMLElement>(".study-directory");
      const statusBar = document.querySelector<HTMLElement>(".ios-status-bar");
      return {
        barTop: Math.round(bar?.getBoundingClientRect().top ?? -1),
        barBottom: Math.round(bar?.getBoundingClientRect().bottom ?? -1),
        planTop: Math.round(plan?.getBoundingClientRect().top ?? -1),
        planBottom: Math.round(plan?.getBoundingClientRect().bottom ?? -1),
        planHeight: Math.round(plan?.getBoundingClientRect().height ?? -1),
        directoryTop: Math.round(directory?.getBoundingClientRect().top ?? -1),
        directoryHeadingTop: Math.round(directory?.querySelector<HTMLElement>(".study-directory-heading")?.getBoundingClientRect().top ?? -1),
        stickyBackground: getComputedStyle(element.querySelector<HTMLElement>(".study-sticky-stack")!).backgroundColor,
        statusBarBottom: Math.round(statusBar?.getBoundingClientRect().bottom ?? -1)
      };
    });
    expect(initialLayout.barTop - initialLayout.statusBarBottom).toBeLessThanOrEqual(4);
    expect(initialLayout.barBottom).toBeLessThanOrEqual(initialLayout.planTop);
    expect(initialLayout.planTop - initialLayout.barBottom).toBeLessThanOrEqual(1);
    expect(initialLayout.planHeight).toBeLessThanOrEqual(132);
    expect(initialLayout.planBottom).toBeLessThanOrEqual(initialLayout.directoryTop);
    expect(initialLayout.directoryHeadingTop - initialLayout.planBottom).toBeGreaterThanOrEqual(8);
    expect(initialLayout.directoryHeadingTop - initialLayout.planBottom).toBeLessThanOrEqual(12);
    expect(initialLayout.stickyBackground).toBe("rgba(0, 0, 0, 0)");
    await scroller.evaluate((element) => {
      element.scrollTop = Math.min(600, element.scrollHeight - element.clientHeight);
    });

    await expect.poll(async () => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(200);
    await expect(stickyStack).toHaveClass(/is-plan-compact/);
    await expect(plan).toHaveAttribute("data-plan-state", "compact");
    await expect(page.getByRole("heading", { name: "学习计划", exact: true })).toHaveCount(0);
    await expect.poll(async () => bookBar.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(initialLayout.barTop);
    await expect.poll(async () => plan.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(initialLayout.planTop);
    await expect.poll(async () => plan.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBeLessThanOrEqual(28);
    const compactSurface = await plan.evaluate((element) => ({
      filter: getComputedStyle(element).filter,
      stackBackground: getComputedStyle(element.parentElement as HTMLElement).backgroundColor
    }));
    expect(compactSurface.filter).not.toBe("none");
    expect(compactSurface.stackBackground).toBe("rgba(0, 0, 0, 0)");

    await scroller.evaluate((element) => {
      element.style.scrollBehavior = "auto";
      element.scrollTop = 0;
    });
    await expect.poll(async () => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeLessThanOrEqual(4);
    await expect(stickyStack).not.toHaveClass(/is-plan-compact/);
    await expect(plan).toHaveAttribute("data-plan-state", "expanded");
    await expect(page.getByRole("heading", { name: "学习计划", exact: true })).toBeVisible();
  });

  test("supports mouse drag scrolling without an opaque sticky parent", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 903 });
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-study").click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");

    const scroller = page.locator('.screen-content[data-screen="study"]');
    const directory = page.locator(".study-directory");
    const firstChapterToggle = page.locator(".study-chapter-toggle").first();
    const startBox = await firstChapterToggle.boundingBox();
    expect(startBox).not.toBeNull();
    const startX = startBox!.x + startBox!.width / 2;
    const startY = startBox!.y + startBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 180, { steps: 8 });

    await expect(directory).toHaveClass(/is-mouse-dragging/);
    await expect.poll(async () => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(100);
    await expect(page.locator(".study-plan-summary")).toHaveAttribute("data-plan-state", "compact");
    expect(await page.locator(".study-sticky-stack").evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgba(0, 0, 0, 0)");

    await page.mouse.up();
    await expect(directory).not.toHaveClass(/is-mouse-dragging/);
    await expect(firstChapterToggle).toHaveAttribute("aria-expanded", "true");
    const draggedScrollTop = await scroller.evaluate((element) => element.scrollTop);

    await page.mouse.move(210, 470);
    await page.mouse.down();
    await page.mouse.move(210, 590, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => scroller.evaluate((element) => Math.round(element.scrollTop)))
      .toBeLessThan(Math.round(draggedScrollTop));
  });

  test("positions a newly expanded chapter below the sticky study controls", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 903 });
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-study").click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");

    const fifthChapter = page.locator(".study-chapter").nth(4);
    const fifthChapterToggle = fifthChapter.locator(".study-chapter-toggle");
    await fifthChapterToggle.click();
    await expect(fifthChapterToggle).toHaveAttribute("aria-expanded", "true");
    await expect(fifthChapter.locator(".study-tools-panel").first()).toBeVisible();

    await expect.poll(async () => fifthChapter.evaluate((article) => {
      const scroller = article.closest<HTMLElement>(".screen-content");
      if (!scroller) return Number.POSITIVE_INFINITY;
      const articleRect = article.getBoundingClientRect();
      const stickyBottom = Array.from(
        scroller.querySelectorAll<HTMLElement>(".study-sticky-stack, .study-book-bar, .study-plan-summary")
      ).reduce((bottom, element) => {
        const rect = element.getBoundingClientRect();
        const horizontallyOverlaps = rect.right > articleRect.left && rect.left < articleRect.right;
        return rect.height > 0 && horizontallyOverlaps ? Math.max(bottom, rect.bottom) : bottom;
      }, scroller.getBoundingClientRect().top);
      return Math.round(Math.abs(articleRect.top - stickyBottom - 8));
    })).toBeLessThanOrEqual(1);

    const visibleContent = await fifthChapter.evaluate((article) => {
      const toggleRect = article.querySelector<HTMLElement>(".study-chapter-toggle")?.getBoundingClientRect();
      const toolsRect = article.querySelector<HTMLElement>(".study-tools-panel")?.getBoundingClientRect();
      const navRect = document.querySelector<HTMLElement>(".primary-nav")?.getBoundingClientRect();
      return {
        chapterHeadingHeight: toggleRect?.height ?? 0,
        toolsTop: toolsRect?.top ?? Number.POSITIVE_INFINITY,
        toolsBottom: toolsRect?.bottom ?? Number.NEGATIVE_INFINITY,
        navTop: navRect?.top ?? window.innerHeight
      };
    });
    expect(visibleContent.chapterHeadingHeight).toBeGreaterThanOrEqual(78);
    expect(visibleContent.toolsTop).toBeLessThan(visibleContent.navTop);
    expect(visibleContent.toolsBottom).toBeGreaterThan(0);
  });

  test("opens a textbook section and reaches each learning tool", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");

    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "学习", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "学习", exact: true }).click();

    await expect(page.getByRole("heading", { name: "学习计划", exact: true })).toBeVisible();
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
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await expect(page.locator(".lesson-title-card h2")).toContainText("减数分裂和受精作用");
    await page.getByRole("button", { name: "查看引用", exact: true }).click();
    await expect(page.getByRole("heading", { name: "原文文档", exact: true })).toBeVisible();
    await expect(page.getByText("教材第 16 页（PDF 第 11 页）", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await page.getByRole("button", { name: "返回学习目录", exact: true }).click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
    await expect(page.locator(".book-course-screen")).toBeVisible();
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
      const plan = element.querySelector<HTMLElement>(".study-plan-summary");
      const directory = element.querySelector<HTMLElement>(".study-directory");
      return {
        display: getComputedStyle(element).display,
        planLeft: plan?.getBoundingClientRect().left ?? 0,
        directoryLeft: directory?.getBoundingClientRect().left ?? 0,
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      };
    });

    expect(layout.display).toBe("grid");
    expect(layout.directoryLeft).toBeGreaterThan(layout.planLeft);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  });
});
