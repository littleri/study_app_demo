import type { Locator, Page } from "playwright/test";
import type { BookCourseApiFixture } from "./fixtures/bookcourse-api";
import { expect, test } from "./fixtures";
import type { CssViewport } from "./fixtures/viewports";

type Bounds = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

const preparedCourseSession = {
  uploadedFile: {
    bookId: "book_stage3",
    name: "stage3-biology.pdf",
    sizeBytes: 1024,
    contentType: "application/pdf",
    uploadedAt: 1
  },
  parseJobId: "job_stage3",
  parseJobStatus: {
    job_id: "job_stage3",
    book_id: "book_stage3",
    status: "pending",
    stage: "queued",
    progress: 1,
    message: "Stage 7 local fixture prepares the course",
    error: null
  }
};

const sourceReaderBaselineSession = {
  ...preparedCourseSession,
  parseJobStatus: {
    ...preparedCourseSession.parseJobStatus,
    status: "done",
    stage: "complete",
    progress: 100,
    message: "解析完成"
  }
};

const targetViewports: readonly CssViewport[] = [
  { width: 402, height: 681 },
  { width: 402, height: 874 },
  { width: 756, height: 352 },
  { width: 874, height: 402 },
  { width: 834, height: 1194 },
  { width: 834, height: 1210 },
  { width: 1194, height: 834 },
  { width: 1210, height: 834 }
];

const breakpointViewports: readonly CssViewport[] = [
  { width: 599, height: 800 },
  { width: 600, height: 800 },
  { width: 767, height: 800 },
  { width: 768, height: 800 },
  { width: 1023, height: 800 },
  { width: 1024, height: 800 }
];

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixelRatio: 0.001,
  scale: "css" as const
};

function expectedRail(viewport: CssViewport) {
  return viewport.width >= 768 && viewport.height >= 600;
}

function overlaps(first: Bounds, second: Bounds) {
  return Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0
    && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0;
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const widths = await page.evaluate(() => {
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const screenContent = document.querySelector<HTMLElement>(".screen-content");
    if (!appShell || !screenContent) throw new Error("Stage 7 shell elements are missing");
    return {
      appClientWidth: appShell.clientWidth,
      appScrollWidth: appShell.scrollWidth,
      contentClientWidth: screenContent.clientWidth,
      contentScrollWidth: screenContent.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth
    };
  });

  expect(widths.documentScrollWidth, `${label}: document has no horizontal overflow`).toBeLessThanOrEqual(widths.documentClientWidth + 1);
  expect(widths.appScrollWidth, `${label}: app shell has no horizontal overflow`).toBeLessThanOrEqual(widths.appClientWidth + 1);
  expect(widths.contentScrollWidth, `${label}: screen content has no horizontal overflow`).toBeLessThanOrEqual(widths.contentClientWidth + 1);
}

async function expectReachableTouchTarget(locator: Locator, label: string) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator, `${label}: target is visible`).toBeVisible();
  const metrics = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      height: bounds.height,
      top: bounds.top,
      width: bounds.width,
      windowHeight: window.innerHeight
    };
  });
  expect(metrics.width, `${label}: target is at least 44px wide`).toBeGreaterThanOrEqual(44);
  expect(metrics.height, `${label}: target is at least 44px high`).toBeGreaterThanOrEqual(44);
  expect(metrics.top, `${label}: target is inside the visible viewport`).toBeGreaterThanOrEqual(-1);
  expect(metrics.bottom, `${label}: target is inside the visible viewport`).toBeLessThanOrEqual(metrics.windowHeight + 1);
}

async function waitForVisualMotionToSettle(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const nonIdleStates = Array.from(document.querySelectorAll<HTMLElement>("[data-motion-state]"))
      .map((element) => `${element.className}:${element.dataset.motionState}`)
      .filter((state) => !state.endsWith(":idle"));
    const unfinishedAnimations = document.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => ({
        name: animation instanceof CSSAnimation ? animation.animationName : animation.constructor.name,
        state: animation.playState
      }))
      .filter(({ state }) => state !== "finished" && state !== "idle");

    return { nonIdleStates, unfinishedAnimations };
  }), {
    message: "visual baseline waits for every finite motion animation and Presence surface to settle"
  }).toEqual({ nonIdleStates: [], unfinishedAnimations: [] });

  await expect.poll(async () => page.evaluate(async () => {
    const readLayoutSignature = () => {
      const appShell = document.querySelector<HTMLElement>(".app-shell");
      const screenContent = document.querySelector<HTMLElement>(".screen-content");
      if (!appShell || !screenContent) throw new Error("Stage 7 visual baseline elements are missing");
      const bounds = appShell.getBoundingClientRect();
      return [
        bounds.bottom,
        bounds.height,
        bounds.left,
        bounds.right,
        bounds.top,
        bounds.width,
        screenContent.scrollHeight,
        screenContent.scrollLeft,
        screenContent.scrollTop,
        screenContent.scrollWidth
      ];
    };
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const firstFrame = readLayoutSignature();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const secondFrame = readLayoutSignature();
    return JSON.stringify(firstFrame) === JSON.stringify(secondFrame);
  }), {
    message: "visual baseline waits for two identical animation frames"
  }).toBe(true);
}

async function beginOverlayScrollAudit(page: Page) {
  await page.evaluate(() => {
    const screenContent = document.querySelector<HTMLElement>(".screen-content");
    if (!screenContent) throw new Error("Stage 7 overlay scroll container is missing");
    const audit = {
      initialScrollHeight: screenContent.scrollHeight,
      maxScrollTop: screenContent.scrollTop
    };
    screenContent.addEventListener("scroll", () => {
      audit.maxScrollTop = Math.max(audit.maxScrollTop, screenContent.scrollTop);
    });
    (window as typeof window & { __stage7OverlayScrollAudit?: typeof audit }).__stage7OverlayScrollAudit = audit;
  });
}

async function expectOverlayScrollToRemainStable(page: Page) {
  const audit = await page.evaluate(() => {
    const screenContent = document.querySelector<HTMLElement>(".screen-content");
    const current = (window as typeof window & {
      __stage7OverlayScrollAudit?: { initialScrollHeight: number; maxScrollTop: number };
    }).__stage7OverlayScrollAudit;
    if (!screenContent || !current) throw new Error("Stage 7 overlay scroll audit is missing");
    return {
      initialScrollHeight: current.initialScrollHeight,
      maxScrollTop: current.maxScrollTop,
      scrollHeight: screenContent.scrollHeight,
      scrollTop: screenContent.scrollTop
    };
  });
  expect(audit.scrollHeight, "ActionSheet overlay does not change the main scroll height").toBe(audit.initialScrollHeight);
  expect(audit.scrollTop, "ActionSheet entry does not roll the main content back after its trigger became visible").toBe(audit.maxScrollTop);
}

async function captureVisualBaseline(page: Page, name: string) {
  // The fixture deliberately has no dynamic remote data, so no visual masks hide layout or content.
  await expect(page.locator(".app-shell")).toHaveScreenshot(name, screenshotOptions);
}

async function expectVisualBaseline(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await waitForVisualMotionToSettle(page);
  await captureVisualBaseline(page, name);
}

async function loadStageFiveCourse(
  page: Page,
  bookCourseApi: BookCourseApiFixture,
  session = preparedCourseSession
) {
  bookCourseApi.useStageFiveFlow();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, session);
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".daily-task-copy .button").first()).toBeVisible();
}

async function loadStageSixCourse(page: Page, bookCourseApi: BookCourseApiFixture) {
  bookCourseApi.useStageSixFlow();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".daily-task-copy .button").first()).toBeVisible();
}

async function openStageFiveLibrary(page: Page, bookCourseApi: BookCourseApiFixture) {
  await loadStageFiveCourse(page, bookCourseApi);
  await page.locator(".daily-task-copy .button").first().click();
  await expect(page.locator(".library-course-grid")).toBeVisible();
  await waitForVisualMotionToSettle(page);
}

async function openStageFiveCourse(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openStageFiveLibrary(page, bookCourseApi);
  await page.locator(".library-course-grid .course-space-card .button").first().click();
  await expect(page.locator(".book-course-screen")).toBeVisible();
  await waitForVisualMotionToSettle(page);
}

async function openStageFiveLesson(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openStageFiveCourse(page, bookCourseApi);
  await page.locator(".course-action-grid .quick-action").nth(1).click();
  await expect(page.locator(".lesson-layout")).toBeVisible();
  await waitForVisualMotionToSettle(page);
}

async function openStageFiveSourceReaderForVisualBaseline(page: Page, bookCourseApi: BookCourseApiFixture) {
  await loadStageFiveCourse(page, bookCourseApi, sourceReaderBaselineSession);
  await page.locator(".home-screen .section .inline-link").click();
  await expect(page.locator(".library-course-grid")).toBeVisible();
  await page.locator(".library-course-grid .course-space-card .button").first().click();
  await expect(page.locator(".book-course-screen")).toBeVisible();
  await page.locator(".course-action-grid .quick-action").nth(1).click();
  await expect(page.locator(".lesson-layout")).toBeVisible();
  await page.locator(".lesson-learning-tools > .button").first().click();
  await expect(page.locator(".source-reader-screen")).toBeVisible();
}

async function openStageSixBook(page: Page, bookCourseApi: BookCourseApiFixture) {
  await loadStageSixCourse(page, bookCourseApi);
  await page.locator(".daily-task-copy .button").first().click();
  await expect(page.locator(".library-course-grid")).toBeVisible();
  await waitForVisualMotionToSettle(page);
  await page.locator(".library-course-grid .course-space-card .button").first().click();
  await expect(page.locator(".book-course-screen")).toBeVisible();
  await waitForVisualMotionToSettle(page);
}

async function openStageSixLesson(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openStageSixBook(page, bookCourseApi);
  await page.locator(".course-action-grid .quick-action").nth(1).click();
  await expect(page.locator(".lesson-layout")).toBeVisible();
  await waitForVisualMotionToSettle(page);
}

async function openStageFourUpload(page: Page, bookCourseApi: BookCourseApiFixture) {
  bookCourseApi.useStageFourFlow();
  await page.addInitScript(() => {
    window.localStorage.removeItem("bookcourse-active-parse-session");
  });
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "上传新书，生成 AI 课程", exact: true }).click();
  await expect(page.locator(".upload-flow-screen")).toBeVisible();
  await waitForVisualMotionToSettle(page);
}

async function openStageFourChapterConfirm(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openStageFourUpload(page, bookCourseApi);
  await page.locator('input[type="file"]').setInputFiles({
    name: "stage7-visual-fixture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("stage seven visual fixture")
  });
  await expect(page.locator(".upload-selection-summary")).toBeVisible();
  await page.getByRole("button", { name: "上传并继续", exact: true }).click();
  await expect(page.locator(".parse-ready-screen")).toBeVisible();
  await page.locator(".parse-flow-actions .button").first().click();
  await expect(page.locator(".chapter-confirm-screen")).toBeVisible({ timeout: 10_000 });
  await waitForVisualMotionToSettle(page);
}

async function expectSurfaceContract(page: Page, label: string, primarySelector: string) {
  await expectNoHorizontalOverflow(page, label);
  await expectReachableTouchTarget(page.locator(primarySelector).first(), `${label}: primary action`);
}

async function expectViewportShellContract(page: Page, viewport: CssViewport, label: string) {
  await page.setViewportSize(viewport);
  const primaryAction = page.locator(".daily-task-copy .button").first();
  await expect(primaryAction, `${label}: home primary action exists`).toBeVisible();
  await primaryAction.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, label);

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const nav = document.querySelector<HTMLElement>(".primary-nav");
    const primary = document.querySelector<HTMLElement>(".daily-task-copy .button");
    if (!shell || !nav || !primary) throw new Error("Stage 7 shell contract elements are missing");
    const serialize = (element: HTMLElement) => element.getBoundingClientRect().toJSON() as Bounds;
    return {
      homeActionButtons: Array.from(document.querySelectorAll<HTMLElement>(
        ".home-screen .hero-actions .button, .daily-task-copy .button, .review-summary .button"
      )).map(serialize),
      nav: serialize(nav),
      navItems: Array.from(nav.querySelectorAll<HTMLElement>("button")).map(serialize),
      primary: serialize(primary),
      shell: serialize(shell)
    };
  });

  expect(metrics.navItems, `${label}: primary navigation retains all four controls`).toHaveLength(4);
  expect(metrics.homeActionButtons.length, `${label}: home retains actionable primary controls`).toBeGreaterThan(0);
  const actualRail = metrics.nav.height > metrics.nav.width;
  expect(actualRail, `${label}: rail only appears at width >= 768 and height >= 600`).toBe(expectedRail(viewport));
  for (const item of metrics.navItems) {
    expect(item.width, `${label}: navigation control is at least 44px wide`).toBeGreaterThanOrEqual(44);
    expect(item.height, `${label}: navigation control is at least 44px high`).toBeGreaterThanOrEqual(44);
  }
  for (const item of metrics.homeActionButtons) {
    expect(item.width, `${label}: home action is at least 44px wide`).toBeGreaterThanOrEqual(44);
    expect(item.height, `${label}: home action is at least 44px high`).toBeGreaterThanOrEqual(44);
  }
  expect(metrics.primary.width, `${label}: primary action is at least 44px wide`).toBeGreaterThanOrEqual(44);
  expect(metrics.primary.height, `${label}: primary action is at least 44px high`).toBeGreaterThanOrEqual(44);
  expect(metrics.primary.top, `${label}: primary action remains within the shell`).toBeGreaterThanOrEqual(metrics.shell.top - 1);
  expect(metrics.primary.bottom, `${label}: primary action remains within the shell`).toBeLessThanOrEqual(metrics.shell.bottom + 1);
  expect(overlaps(metrics.primary, metrics.nav), `${label}: primary action is not obscured by navigation`).toBeFalsy();
}

async function expectElementsInsideVisualViewport(page: Page, selectors: string[], label: string) {
  await expect.poll(async () => page.evaluate((targetSelectors) => {
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
    return targetSelectors.every((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.top >= viewportTop - 1 && bounds.bottom <= viewportBottom + 1;
    });
  }, selectors), label).toBeTruthy();
}

async function applyVisibleTextScale(page: Page, factor: number) {
  return page.evaluate((scale) => {
    const selector = [
      ".screen-content h1",
      ".screen-content h2",
      ".screen-content h3",
      ".screen-content p",
      ".screen-content button",
      ".screen-content a",
      ".screen-content label",
      ".screen-content input",
      ".screen-content select",
      ".screen-content textarea"
    ].join(",");
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => element.getClientRects().length > 0);
    const sizes = elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    for (const element of elements) {
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      if (Number.isFinite(fontSize) && fontSize > 0) {
        element.style.setProperty("font-size", `${fontSize * scale}px`, "important");
      }
      const lineHeight = Number.parseFloat(style.lineHeight);
      if (style.lineHeight.endsWith("px") && Number.isFinite(lineHeight) && lineHeight > 0) {
        element.style.setProperty("line-height", `${lineHeight * scale}px`, "important");
      }
    }
    return { count: elements.length, largestBefore: Math.max(...sizes) };
  }, factor);
}

test.describe("Stage 7 final responsive acceptance", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("records the Home visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");
    await expect(page.locator(".home-screen")).toBeVisible();
    await expectVisualBaseline(page, "home.png");
    await expectSurfaceContract(page, "Home", ".daily-task-copy .button");
  });

  test("records the Library visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    await openStageFiveLibrary(page, bookCourseApi);
    await expectVisualBaseline(page, "library.png");
    await expectSurfaceContract(page, "Library", ".library-course-grid .course-space-card .button");
  });

  test("records the Upload visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    await openStageFourUpload(page, bookCourseApi);
    await expectVisualBaseline(page, "upload.png");
    await expectSurfaceContract(page, "Upload", ".upload-flow-primary .button");
  });

  test("records the ChapterConfirm visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    await openStageFourChapterConfirm(page, bookCourseApi);
    await expectVisualBaseline(page, "chapter-confirm.png");
    await expectSurfaceContract(page, "Chapter confirmation", ".chapter-confirm-actions .button");
  });

  test("records the Lesson visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    await openStageFiveLesson(page, bookCourseApi);
    await expectVisualBaseline(page, "lesson.png");
    await expectSurfaceContract(page, "Lesson", ".lesson-learning-tools > .button");
  });

  test("records the SourceReader visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    let releaseParseCompletion: () => void = () => {};
    const parseCompletionRelease = new Promise<void>((resolve) => {
      releaseParseCompletion = resolve;
    });
    let markParseRequestHeld: () => void = () => {};
    const parseRequestHeld = new Promise<void>((resolve) => {
      markParseRequestHeld = resolve;
    });
    await page.route("**/api/jobs/job_stage3", async (route) => {
      markParseRequestHeld();
      await parseCompletionRelease;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "job_stage3",
          book_id: "book_stage3",
          status: "done",
          stage: "complete",
          progress: 100,
          message: "解析完成",
          error: null
        })
      });
    });
    await openStageFiveSourceReaderForVisualBaseline(page, bookCourseApi);
    const sourceImage = page.locator(".source-page-media img");
    const sourceMediaReady = Promise.all([
      expect(sourceImage).toBeVisible(),
      expect.poll(() => sourceImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0)
    ]);
    const fontsReady = page.evaluate(async () => {
      await document.fonts.ready;
    });
    await Promise.all([sourceMediaReady, fontsReady, parseRequestHeld]);
    // The app has reached the real SourceReader through its normal controls.
    // Complete the held local parse response only now so this baseline captures
    // the real, fresh 3200ms completion Toast rather than extending its timer.
    releaseParseCompletion();
    await expect(page.locator(".toast"), "fixture completion Toast remains visible for its approved SourceReader baseline").toBeVisible();
    await waitForVisualMotionToSettle(page);
    await captureVisualBaseline(page, "source-reader.png");
    await expectSurfaceContract(page, "Source reader", ".source-reader-toolbar button");
  });

  test("records the StudyPlan visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    await openStageSixBook(page, bookCourseApi);
    await page.locator(".course-action-grid .quick-action").first().click();
    await expect(page.locator(".study-plan-screen")).toBeVisible();
    await expectVisualBaseline(page, "study-plan.png");
    await expectSurfaceContract(page, "Study plan", ".study-plan-calendar .plan-date-row button");
  });

  test("records the Assignment visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    // The approved baseline includes the fixture's normal parse-completion
    // Toast. Keep only its business timer alive while this concurrent visual
    // test reaches the Assignment screen; all motion timers remain real.
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window) as (...args: unknown[]) => number;
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args) => (
        nativeSetTimeout(handler, Number(timeout) === 3200 ? 60_000 : timeout ?? 0, ...args)
      )) as typeof window.setTimeout;
    });
    await openStageSixLesson(page, bookCourseApi);
    await page.locator(".lesson-action-grid .button").nth(2).click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    await expectVisualBaseline(page, "assignment.png");
    await expectSurfaceContract(page, "Assignment", ".assignment-primary-action .button");
  });

  test("records the ActionSheet visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    await openStageFiveLesson(page, bookCourseApi);
    await beginOverlayScrollAudit(page);
    await page.locator(".lesson-action-grid .button").first().click();
    await expect(page.locator(".sheet[data-sheet-type='chat']")).toBeVisible();
    await waitForVisualMotionToSettle(page);
    await expectOverlayScrollToRemainStable(page);
    await expectVisualBaseline(page, "action-sheet-chat.png");
    await expectSurfaceContract(page, "Chat action sheet", ".sheet[data-sheet-type='chat'] .icon-button");
  });

  test("records the AI chat visual baseline from deterministic local resources", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");
    const orb = page.locator(".ai-orb");
    await expect(orb).toBeVisible();
    await orb.click();
    await expect(page.locator(".ai-overlay")).toBeVisible();
    await expectVisualBaseline(page, "ai-chat.png");
    await expectSurfaceContract(page, "AI chat", ".ai-overlay .ai-close");
  });

  test("enforces shell, navigation, overflow, visibility, and touch contracts at exact breakpoint and paired sizes", async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    for (const viewport of [...breakpointViewports, ...targetViewports]) {
      await expectViewportShellContract(page, viewport, `Stage 7 ${viewport.width}x${viewport.height}`);
    }
  });

  test("audits viewport-fit and safe-area layout rules without pretending desktop WebKit has a hardware inset", async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit\s*=\s*cover/);

    const desktopWebKitSafeAreas = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;
      return {
        bottom: read("--safe-area-bottom"),
        left: read("--safe-area-left"),
        right: read("--safe-area-right"),
        top: read("--safe-area-top")
      };
    });
    expect(desktopWebKitSafeAreas, "desktop WebKit env() values are audited as zero, not claimed as device insets").toEqual({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0
    });

    await page.addStyleTag({
      content: `:root {
        --safe-area-top: 47px !important;
        --safe-area-right: 13px !important;
        --safe-area-bottom: 34px !important;
        --safe-area-left: 11px !important;
      }`
    });

    await page.setViewportSize({ width: 402, height: 681 });
    const phone = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const nav = document.querySelector<HTMLElement>(".primary-nav");
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!shell || !nav || !content) throw new Error("Stage 7 phone safe-area elements are missing");
      const shellBounds = shell.getBoundingClientRect();
      const navBounds = nav.getBoundingClientRect();
      const style = getComputedStyle(content);
      return {
        contentPaddingLeft: Number.parseFloat(style.paddingLeft),
        contentPaddingRight: Number.parseFloat(style.paddingRight),
        navBottom: shellBounds.bottom - navBounds.bottom,
        navLeft: navBounds.left - shellBounds.left,
        navRight: shellBounds.right - navBounds.right
      };
    });
    expect(phone.navLeft, "phone navigation respects the injected left safe area").toBeGreaterThanOrEqual(11);
    expect(phone.navRight, "phone navigation respects the injected right safe area").toBeGreaterThanOrEqual(13);
    expect(phone.navBottom, "phone navigation respects the injected bottom safe area").toBeGreaterThanOrEqual(34);
    expect(phone.contentPaddingLeft, "phone content reserves the injected left safe area").toBeGreaterThanOrEqual(11);
    expect(phone.contentPaddingRight, "phone content reserves the injected right safe area").toBeGreaterThanOrEqual(13);
    await expectNoHorizontalOverflow(page, "Stage 7 injected phone safe area");

    await page.setViewportSize({ width: 834, height: 1194 });
    const tablet = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const nav = document.querySelector<HTMLElement>(".primary-nav");
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!shell || !nav || !content) throw new Error("Stage 7 tablet safe-area elements are missing");
      const shellBounds = shell.getBoundingClientRect();
      const navBounds = nav.getBoundingClientRect();
      const style = getComputedStyle(content);
      return {
        contentPaddingLeft: Number.parseFloat(style.paddingLeft),
        navBottom: shellBounds.bottom - navBounds.bottom,
        navLeft: navBounds.left - shellBounds.left,
        navTop: navBounds.top - shellBounds.top
      };
    });
    expect(tablet.navLeft, "tablet rail respects the injected left safe area").toBeGreaterThanOrEqual(11);
    expect(tablet.navTop, "tablet rail respects the injected top safe area").toBeGreaterThanOrEqual(47);
    expect(tablet.navBottom, "tablet rail respects the injected bottom safe area").toBeGreaterThanOrEqual(34);
    expect(tablet.contentPaddingLeft, "tablet content reserves the rail and injected safe area").toBeGreaterThanOrEqual(99);
    await expectNoHorizontalOverflow(page, "Stage 7 injected tablet safe area");
  });

  test("keeps critical home and assignment flows usable under an effective 150 percent text scale", async ({ page, bookCourseApi }) => {
    const scale = 1.5;
    await page.setViewportSize({ width: 402, height: 681 });
    await page.goto("/?embedded=device-preview");
    const homeAction = page.locator(".daily-task-copy .button").first();
    const homeBefore = await homeAction.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const homeScale = await applyVisibleTextScale(page, scale);
    const homeAfter = await homeAction.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(homeScale.count, "text-scale harness changes visible semantic text rather than only the viewport").toBeGreaterThan(0);
    expect(homeScale.largestBefore, "text-scale harness has a measurable baseline").toBeGreaterThan(0);
    expect(homeAfter, "home action text is effectively magnified by 150 percent").toBeGreaterThanOrEqual(homeBefore * 1.49);
    await expectSurfaceContract(page, "150 percent Home", ".daily-task-copy .button");

    await openStageSixLesson(page, bookCourseApi);
    await page.locator(".lesson-action-grid .button").nth(2).click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    const assignmentAction = page.locator(".assignment-primary-action .button");
    const assignmentBefore = await assignmentAction.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    await applyVisibleTextScale(page, scale);
    const assignmentAfter = await assignmentAction.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(assignmentAfter, "assignment action text is effectively magnified by 150 percent").toBeGreaterThanOrEqual(assignmentBefore * 1.49);
    await expectSurfaceContract(page, "150 percent Assignment", ".assignment-primary-action .button");
  });

  test("keeps keyboard focus, reduced motion, rotations, and visualViewport AI controls stable", async ({ page, bookCourseApi }) => {
    await openStageFiveLesson(page, bookCourseApi);
    const sheetTrigger = page.locator(".lesson-action-grid .button").first();
    await sheetTrigger.focus();
    await sheetTrigger.click();
    const sheet = page.locator(".sheet[data-sheet-type='chat']");
    await expect(sheet).toBeVisible();
    const sheetControls = sheet.locator("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    const firstSheetControl = sheetControls.first();
    const lastSheetControl = sheetControls.last();
    await expect(firstSheetControl, "chat ActionSheet receives initial focus").toBeFocused();
    await lastSheetControl.focus();
    await page.keyboard.press("Tab");
    await expect(firstSheetControl, "chat ActionSheet traps forward Tab focus").toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(sheetTrigger, "closing the chat ActionSheet restores trigger focus").toBeFocused();

    await page.setViewportSize({ width: 402, height: 681 });
    await page.goto("/?embedded=device-preview");
    const orb = page.locator(".ai-orb");
    await orb.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator(".ai-overlay");
    const composeInput = page.locator(".ai-compose input");
    await expect(dialog).toBeVisible();
    await expect(composeInput, "AI dialog receives initial keyboard focus").toBeFocused();

    await page.setViewportSize({ width: 834, height: 1194 });
    await expectElementsInsideVisualViewport(page, [".ai-compose input", ".ai-compose button"], "portrait tablet AI controls remain in the visual viewport");
    await page.setViewportSize({ width: 756, height: 352 });
    await expectElementsInsideVisualViewport(page, [".ai-compose input", ".ai-compose button"], "short landscape AI controls remain in the visual viewport");
    await page.setViewportSize({ width: 402, height: 430 });
    await expectElementsInsideVisualViewport(page, [".ai-compose input", ".ai-compose button"], "keyboard-height mobile AI controls remain in the visual viewport");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotion = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      const orbStyle = getComputedStyle(document.querySelector<HTMLElement>(".ai-orb")!);
      return {
        dialogAnimation: style.animationName,
        dialogTransition: style.transitionDuration,
        orbTransition: orbStyle.transitionDuration
      };
    });
    expect(reducedMotion.dialogAnimation, "reduced motion removes the AI entrance animation").toBe("none");
    expect(reducedMotion.dialogTransition, "reduced motion removes the AI dialog transition").toBe("0s");
    expect(reducedMotion.orbTransition, "reduced motion removes the AI orb transition").toBe("0s");
    await page.keyboard.press("Escape");
    await expect(orb, "closing AI restores keyboard focus to the orb").toBeFocused();
  });
});
