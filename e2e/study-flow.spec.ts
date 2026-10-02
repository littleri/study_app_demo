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
    await expect(plan.locator(".study-plan-copy small")).toHaveText("今日建议 · 30 分钟");
    await expect(plan.locator(".study-plan-copy strong")).toHaveText("减数分裂和受精作用");
    await expect(plan.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
    await expect(page.locator("#study-chapter-frontmatter-toggle")).toHaveCount(0);
    await expect(page.locator(".study-chapter-progress").nth(0)).toHaveAttribute("data-progress", "100");
    await expect(page.locator(".study-chapter-progress").nth(0)).toHaveClass(/is-complete/);
    await expect(page.locator(".study-chapter-progress").nth(1)).toHaveAttribute("data-progress", "17");
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
    expect(initialLayout.planHeight).toBeLessThanOrEqual(176);
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
      boxShadow: getComputedStyle(element).boxShadow,
      stackBackground: getComputedStyle(element.parentElement as HTMLElement).backgroundColor
    }));
    expect(compactSurface.filter).toBe("none");
    expect(compactSurface.boxShadow).not.toBe("none");
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
    const shell = page.locator(".app-shell");
    const firstChapterToggle = page.locator(".study-chapter-toggle").first();
    await expect(page.locator(".study-tools-panel")).toHaveCount(1);
    const startBox = await firstChapterToggle.boundingBox();
    expect(startBox).not.toBeNull();
    const startX = startBox!.x + startBox!.width / 2;
    const startY = startBox!.y + startBox!.height / 2;
    const initialScrollTop = await scroller.evaluate((element) => element.scrollTop);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 80);

    await expect(shell).toHaveAttribute("data-mouse-dragging", "true");
    const firstDragFrame = await scroller.evaluate((element) => ({
      behavior: getComputedStyle(element).scrollBehavior,
      scrollTop: element.scrollTop
    }));
    expect(firstDragFrame.behavior).toBe("auto");
    expect(firstDragFrame.scrollTop - initialScrollTop).toBeGreaterThanOrEqual(70);

    await page.mouse.move(startX, startY - 180, { steps: 5 });
    await expect.poll(async () => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(100);
    await expect(page.locator(".study-plan-summary")).toHaveAttribute("data-plan-state", "compact");
    expect(await page.locator(".study-sticky-stack").evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgba(0, 0, 0, 0)");

    await page.mouse.up();
    await expect(shell).toHaveAttribute("data-mouse-dragging", "false");
    await expect(firstChapterToggle).toHaveAttribute("aria-expanded", "true");
    const releasedScrollTop = await scroller.evaluate((element) => element.scrollTop);
    await expect.poll(
      () => scroller.evaluate((element) => Math.round(element.scrollTop)),
      { message: "the study page keeps moving after release" }
    ).toBeGreaterThan(Math.round(releasedScrollTop) + 20);
    await expect.poll(
      () => scroller.evaluate((element) => getComputedStyle(element).scrollBehavior),
      { message: "smooth scrolling is restored after momentum settles", timeout: 2_500 }
    ).toBe("smooth");
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
    await expect(page.locator(".study-tools-panel")).toHaveCount(1);

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

  test("opens a textbook section, reads the illustrated lesson, and returns to the pre-lesson tools", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?embedded=device-preview");

    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "学习", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "学习", exact: true }).click();

    await expect(page.getByRole("heading", { name: "学习计划", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "打开 AI 助手", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "当前课程 生物 必修 2 遗传与进化", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加资料", exact: true })).toBeVisible();
    const expandedChapterCandidate = page.locator(".study-chapter-toggle[aria-expanded='true']").first();
    await expect(expandedChapterCandidate).toBeVisible();
    const expandedChapterId = await expandedChapterCandidate.getAttribute("id");
    expect(expandedChapterId).toBeTruthy();
    const initiallyExpandedChapter = page.locator(`#${expandedChapterId}`);
    const expandedChapterSurfaces = await initiallyExpandedChapter.locator("..").evaluate((chapter) => {
      const chapterToggle = chapter.querySelector<HTMLElement>(".study-chapter-toggle")!;
      const sectionList = chapter.querySelector<HTMLElement>(".study-section-list")!;
      const screen = chapter.closest<HTMLElement>('.screen-content[data-screen="study"]')!;
      const lightness = (value: string) => {
        const channels = value.match(/\d*\.?\d+/g)?.slice(0, 3).map(Number) ?? [];
        if (channels.length !== 3) return 0;
        const normalized = channels.some((channel) => channel > 1)
          ? channels.map((channel) => channel / 255)
          : channels;
        return normalized.reduce((sum, channel) => sum + channel, 0) / 3;
      };
      const chapterBackground = getComputedStyle(chapterToggle).backgroundColor;
      const sectionBackground = getComputedStyle(sectionList).backgroundColor;
      const pageBackground = getComputedStyle(screen).backgroundColor;
      return {
        chapter: chapterBackground,
        chapterLightness: lightness(chapterBackground),
        pageLightness: lightness(pageBackground),
        sections: sectionBackground,
        sectionsLightness: lightness(sectionBackground)
      };
    });
    expect(expandedChapterSurfaces.sections).not.toBe("rgba(0, 0, 0, 0)");
    expect(expandedChapterSurfaces.sections).not.toBe(expandedChapterSurfaces.chapter);
    expect(expandedChapterSurfaces.sectionsLightness).toBeGreaterThan(expandedChapterSurfaces.pageLightness);
    expect(expandedChapterSurfaces.sectionsLightness).toBeLessThan(expandedChapterSurfaces.chapterLightness);
    await expect(initiallyExpandedChapter.locator("..").locator(".study-section-toggle").first()).toBeVisible();

    const secondChapter = page.getByRole("button", { name: "第 2 章 基因和染色体的关系 3 个小节 教材第 15-40 页 学习进度 17%", exact: true });
    await expect(secondChapter.locator(".study-chapter-progress")).toHaveAttribute("data-progress", "17");
    if (await secondChapter.getAttribute("aria-expanded") !== "true") await secondChapter.click();
    await expect(secondChapter).toHaveAttribute("aria-expanded", "true");
    if (expandedChapterId !== await secondChapter.getAttribute("id")) {
      await expect(initiallyExpandedChapter).toHaveAttribute("aria-expanded", "false");
    }
    await expect(page.getByRole("button", { name: "第 1 节 减数分裂和受精作用 教材第 16-26 页", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "第 3 节 伴性遗传 教材第 33-40 页", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: /学习笔记/u }).first()).toBeEnabled();
    await page.getByRole("button", { name: "进入学习", exact: true }).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    const lessonPager = page.locator(".lesson-knowledge-pager");
    await expect(lessonPager.locator(".lesson-introduction")).toBeVisible();
    await expect(lessonPager.getByRole("heading", { name: "减数分裂和受精作用", exact: true })).toBeVisible();
    await lessonPager.focus();
    await page.keyboard.press("ArrowRight");
    await expect(lessonPager.getByRole("progressbar", { name: "章节学习进度" })).toHaveAttribute("aria-valuenow", "2");
    await expect(page.getByText("已生成", { exact: true })).toHaveCount(0);
    await expect(page.getByText("全文依据状态", { exact: true })).toHaveCount(0);
    await expect(page.getByText("本节来源", { exact: true })).toHaveCount(0);
    await expect(page.getByText("学习工具", { exact: true })).toHaveCount(0);
    const lessonFigures = page.locator(".lesson-inline-figure img");
    await expect.poll(() => lessonFigures.count()).toBeGreaterThan(0);
    const lessonFigureSources = await lessonFigures.evaluateAll((images) => (
      images.map((image) => image.getAttribute("src") ?? "")
    ));
    expect(lessonFigureSources.every((source) => (
      source.startsWith("/assets/textbook/figures/")
      || source.startsWith("/assets/lesson/")
    ))).toBe(true);
    expect(lessonFigureSources.every((source) => !source.includes("/assets/textbook/pages/"))).toBe(true);
    if (lessonFigureSources.some((source) => source.startsWith("/assets/textbook/figures/"))) {
      await expect(page.getByText("教材原图", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /查看教材原图/ }).first()).toBeVisible();
    } else {
      await expect(page.getByText("AI 辅助示意", { exact: true }).first()).toBeVisible();
    }
    const compactReadingMetrics = await page.locator(".lesson-reading-column").evaluate((article) => {
      const body = article.querySelector<HTMLElement>(".lesson-knowledge-section > p")!;
      const heading = article.querySelector<HTMLElement>(".lesson-knowledge-section > h3")!;
      const section = article.querySelector<HTMLElement>(".lesson-knowledge-section")!;
      const figure = article.querySelector<HTMLElement>(".lesson-inline-figure")!;
      const bodyStyle = getComputedStyle(body);
      const headingStyle = getComputedStyle(heading);
      const sectionStyle = getComputedStyle(section);
      return {
        bodyFontSize: Number.parseFloat(bodyStyle.fontSize),
        bodyLineHeight: Number.parseFloat(bodyStyle.lineHeight),
        figureRatio: figure.getBoundingClientRect().width / article.getBoundingClientRect().width,
        headingFontSize: Number.parseFloat(headingStyle.fontSize),
        sectionPaddingTop: Number.parseFloat(sectionStyle.paddingTop)
      };
    });
    expect(compactReadingMetrics.bodyFontSize).toBe(20);
    expect(compactReadingMetrics.bodyLineHeight).toBeGreaterThanOrEqual(24);
    expect(compactReadingMetrics.bodyLineHeight).toBeLessThanOrEqual(30);
    expect(compactReadingMetrics.headingFontSize).toBe(20);
    expect(compactReadingMetrics.sectionPaddingTop).toBe(22);
    expect(compactReadingMetrics.figureRatio).toBeLessThanOrEqual(0.93);

    await page.locator(".lesson-source-link").click();
    const sourceReader = page.locator(".source-reader-screen");
    await expect(sourceReader).toBeVisible();
    await expect(page.locator(".sheet[data-sheet-type='source']")).toHaveCount(0);
    await expect(sourceReader.locator(".source-annotation-page > img")).toBeVisible();
    const selectableSource = sourceReader.locator(".source-page-text-layer.is-reader");
    await expect(selectableSource).toBeVisible();
    await expect(selectableSource).not.toBeEmpty();
    const sourceLayerPlacement = await sourceReader.evaluate((element) => {
      const image = element.querySelector<HTMLImageElement>(".source-annotation-page > img")!;
      const layer = element.querySelector<HTMLElement>(".source-page-text-layer")!;
      const imageBounds = image.getBoundingClientRect();
      const layerBounds = layer.getBoundingClientRect();
      return {
        insideImage:
          layerBounds.left >= imageBounds.left &&
          layerBounds.top >= imageBounds.top &&
          layerBounds.right <= imageBounds.right &&
          layerBounds.bottom <= imageBounds.bottom
      };
    });
    expect(sourceLayerPlacement.insideImage).toBe(true);
    await selectableSource.evaluate((element) => {
      const paragraph = element.querySelector("p");
      const textNode = paragraph?.firstChild;
      if (!textNode?.textContent) throw new Error("Selectable source text is missing");
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(24, textNode.textContent.length));
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await sourceReader.locator(".source-reader-selection-action").getByRole("button", { name: "记笔记" }).click();
    const notePanel = sourceReader.getByRole("region", { name: "原文文字笔记" });
    await expect(notePanel.locator("blockquote")).not.toBeEmpty();
    await notePanel.getByLabel("我的理解").fill("摘录说明：这是我对选中文字的理解。");
    await page.locator(".header-bar .icon-button").click();
    await expect(notePanel).toHaveCount(0);
    await sourceReader.getByRole("button", { name: /本页笔记/ }).click();
    await expect(sourceReader.locator(".source-page-notes")).toContainText("文字");
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".lesson-ai-entry")).toBeVisible();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    const lessonProgress = lessonPager.getByRole("progressbar", { name: "章节学习进度" });
    const lessonPageCount = Number(await lessonProgress.getAttribute("aria-valuemax"));
    for (let pageIndex = 2; pageIndex < lessonPageCount; pageIndex += 1) {
      await lessonPager.focus();
      await page.keyboard.press("ArrowRight");
    }
    await expect(lessonProgress).toHaveAttribute("aria-valuenow", String(lessonPageCount));
    const lessonScroller = page.locator('.screen-content[data-screen="lesson"]');
    const floatingCompletion = page.locator(".lesson-floating-complete");
    const completionBeforeScroll = await floatingCompletion.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { position: getComputedStyle(element).position, top: bounds.top, left: bounds.left, width: bounds.width };
    });
    expect(completionBeforeScroll.position).toBe("fixed");
    await lessonScroller.hover();
    await page.mouse.wheel(0, 700);
    await expect.poll(() => lessonScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(50);
    const completionAfterScroll = await floatingCompletion.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, left: bounds.left, width: bounds.width };
    });
    expect(Math.abs(completionAfterScroll.top - completionBeforeScroll.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(completionAfterScroll.left - completionBeforeScroll.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(completionAfterScroll.width - completionBeforeScroll.width)).toBeLessThanOrEqual(1);
    const pausedCompletionTransition = await page.addStyleTag({
      content: '.motion-screen-transition[data-motion-state="transitioning"] > .motion-screen-surface { animation-play-state: paused !important; }'
    });
    await page.getByRole("button", { name: "完成本节", exact: true }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-active-screen", "study");
    await expect(page.locator(".lesson-floating-complete")).toBeHidden();
    await pausedCompletionTransition.evaluate((style) => style.remove());
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await expect(page.locator(".report-screen")).toHaveCount(0);
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
    const switcher = page.getByRole("button", { name: "当前课程 生物 必修 2 遗传与进化", exact: true });
    await expect(switcher).toBeVisible();
    await switcher.click();

    const dialog = page.getByRole("dialog", { name: "切换课程" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-motion-state", "idle");
    await expect(page.getByRole("button", { name: "创建新课程", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "管理全部课程", exact: true })).toBeVisible();
    const mathBook = dialog.getByRole("button", { name: "数学 必修 第二册 1 份资料", exact: true });
    await expect(mathBook).toBeVisible();
    await expect(mathBook.locator("img")).toHaveAttribute("src", "/assets/book-covers/high-school-math-required-2.webp");

    const sheetGeometry = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const overlay = element.closest<HTMLElement>(".sheet-overlay")?.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        bottomGap: overlay ? Math.round(overlay.bottom - bounds.bottom) : null,
        bottomLeftRadius: Number.parseFloat(style.borderBottomLeftRadius),
        bottomRightRadius: Number.parseFloat(style.borderBottomRightRadius),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    });
    expect(Math.abs(sheetGeometry.bottomGap ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
    expect(sheetGeometry.bottomLeftRadius).toBe(0);
    expect(sheetGeometry.bottomRightRadius).toBe(0);
    expect(sheetGeometry.documentWidth).toBeLessThanOrEqual(sheetGeometry.viewportWidth);

    await mathBook.click();
    await expect(page.getByRole("button", { name: "当前课程 数学 必修 第二册", exact: true })).toBeVisible();
    await expect(page.getByRole("button", {
      name: "第六章 平面向量及其应用 4 个小节 教材第 1-66 页 学习进度 0%",
      exact: true
    })).toBeVisible();
    await expect(page.getByRole("button", { name: "6.1 平面向量的概念 教材第 2-6 页", exact: true })).toBeVisible();
    await expect(page.getByRole("button", {
      name: "第十章 概率 3 个小节 教材第 225-264 页 学习进度 0%",
      exact: true
    })).toBeVisible();

    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    await expect(page.getByRole("heading", { name: "添加课程资料", exact: true })).toBeVisible();
  });

  test("keeps the course directory in the tablet reading flow without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto("/?embedded=device-preview");
    await page.getByRole("button", { name: "学习", exact: true }).click();
    await expect(page.getByRole("heading", { name: "课程目录", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "第 7 章 现代生物进化理论 2 个小节 教材第 109-130 页 学习进度 0%", exact: true })).toBeVisible();

    const layout = await page.locator(".study-screen").evaluate((element) => {
      const plan = element.querySelector<HTMLElement>(".study-plan-summary");
      const directory = element.querySelector<HTMLElement>(".study-directory");
      return {
        display: getComputedStyle(element).display,
        planLeft: plan?.getBoundingClientRect().left ?? 0,
        planBottom: plan?.getBoundingClientRect().bottom ?? 0,
        directoryLeft: directory?.getBoundingClientRect().left ?? 0,
        directoryTop: directory?.getBoundingClientRect().top ?? 0,
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      };
    });

    expect(layout.display).toBe("block");
    expect(Math.abs(layout.directoryLeft - layout.planLeft)).toBeLessThanOrEqual(1);
    expect(layout.directoryTop).toBeGreaterThanOrEqual(layout.planBottom);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  });
});
