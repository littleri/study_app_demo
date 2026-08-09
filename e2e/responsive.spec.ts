import type { Locator, Page } from "playwright/test";
import { getResponsiveProject, type CssViewport } from "./fixtures/viewports";
import type { BookCourseApiFixture, StageFiveImageMode, StageSixFlowOptions } from "./fixtures/bookcourse-api";
import { expect, test } from "./fixtures";
import { installVisualViewportShim, setVisualViewport, setVisualViewportHeight } from "./fixtures/visual-viewport";

type NavigationMode = "bottom" | "rail";

const stageSixPlanDayNormalizationCases = [
  { label: "negative finite value", value: -5, expectedDays: 1 },
  { label: "zero", value: 0, expectedDays: 1 },
  { label: "fractional value", value: 7.8, expectedDays: 7 },
  { label: "maximum contract value", value: 90, expectedDays: 90 },
  { label: "large finite value", value: 4_294_967_296, expectedDays: 90 },
  { label: "wrong runtime type", value: "not-a-plan-day-count", expectedDays: 14 }
] as const;

function expectedNavigationMode(viewport: CssViewport): NavigationMode {
  return viewport.width >= 768 && viewport.height >= 600 ? "rail" : "bottom";
}

async function clickHomeUploadAction(page: Page, label: string) {
  const uploadAction = page.locator('[data-home-global-action="upload"]');
  await expect(uploadAction, `${label}: stable home upload action is visible`).toBeVisible();
  await expect(uploadAction, `${label}: upload action exposes the current value`).toHaveAccessibleName("上传新书，添加另一份教材");
  await uploadAction.click();
}

async function expectNavigationMode(page: Page, viewport: CssViewport, label: string) {
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation, `${label}: primary navigation is visible`).toBeVisible();

  const shape = await navigation.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  const actualMode: NavigationMode = shape.height > shape.width ? "rail" : "bottom";

  expect(actualMode, `${label}: navigation uses the expected presentation`).toBe(expectedNavigationMode(viewport));
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const widths = await page.evaluate(() => {
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const screenContent = document.querySelector<HTMLElement>(".screen-content");
    if (!appShell || !screenContent) throw new Error("Responsive shell elements are missing");
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      appScrollWidth: appShell.scrollWidth,
      appClientWidth: appShell.clientWidth,
      contentScrollWidth: screenContent.scrollWidth,
      contentClientWidth: screenContent.clientWidth
    };
  });

  expect(widths.documentScrollWidth, `${label}: document does not overflow horizontally`).toBeLessThanOrEqual(widths.documentClientWidth + 1);
  expect(widths.appScrollWidth, `${label}: app shell does not overflow horizontally`).toBeLessThanOrEqual(widths.appClientWidth + 1);
  expect(widths.contentScrollWidth, `${label}: content does not overflow horizontally`).toBeLessThanOrEqual(widths.contentClientWidth + 1);
}

function stageFiveScenario(options?: { imageMode?: StageFiveImageMode }) {
  if (options?.imageMode === "failure") return "image-failure";
  if (options?.imageMode === "mixed") return "image-mixed";
  return "library";
}

function stageSixScenario(options?: StageSixFlowOptions) {
  if (options?.mistakeMode === "error") return "mistakes-error";
  if (options?.mistakeMode === "loading") return "mistakes-loading";
  if (options && Object.hasOwn(options, "studyPlanDays")) return "plan-custom";
  if (options?.taskMode === "out_of_range") return "plan-out-of-range";
  if (options?.taskMode === "sparse") return "plan-sparse";
  return "default";
}

async function loadProductionCourse(page: Page, scenario = "default", planDays?: unknown) {
  const query = new URLSearchParams({ scenario, embedded: "device-preview" });
  if (planDays !== undefined) query.set("planDays", JSON.stringify(planDays));
  await page.goto(`/e2e/production-repository-harness.html?${query.toString()}`);
  await expect(page.locator(".home-dashboard"), "production repository harness renders the real Home screen").toBeVisible();
  if (scenario !== "empty" && scenario !== "course-error" && scenario !== "course-loading") {
    await expect(page.locator('.home-book-workspace[data-loaded="true"]'), "production repository hydrates the selected course").toBeVisible();
  }
  await expect(page.locator(".motion-screen-transition"), "production Home transition settles").toHaveAttribute("data-motion-state", "idle");
}

async function loadStageFiveCourse(
  page: Page,
  bookCourseApi: BookCourseApiFixture,
  options?: { imageMode?: StageFiveImageMode }
) {
  void bookCourseApi;
  await loadProductionCourse(page, stageFiveScenario(options));
}

async function loadStageSixCourse(
  page: Page,
  bookCourseApi: BookCourseApiFixture,
  options?: StageSixFlowOptions
) {
  void bookCourseApi;
  await loadProductionCourse(page, stageSixScenario(options), options?.studyPlanDays);
}

async function clickSettledScreenTarget(page: Page, target: Locator, label: string) {
  await expect.poll(async () => page.evaluate(() => {
    const nonIdleStates = Array.from(document.querySelectorAll<HTMLElement>("[data-motion-state]"))
      .map((element) => `${element.className}:${element.dataset.motionState}`)
      .filter((state) => !state.endsWith(":idle"));
    const unfinishedAnimations = document.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .filter((animation) => animation.playState !== "finished" && animation.playState !== "idle")
      .length;
    return { nonIdleStates, unfinishedAnimations };
  }), { message: `${label}: all finite motion settles before interaction` }).toEqual({ nonIdleStates: [], unfinishedAnimations: 0 });
  await expect(target, `${label}: action is unique`).toHaveCount(1);
  await expect(target, `${label}: action is visible`).toBeVisible();
  await expect(target, `${label}: action is enabled`).toBeEnabled();
  await target.evaluate(async (element) => {
    const action = element as HTMLElement;
    const scroller = action.closest<HTMLElement>(".screen-content");
    const previousScrollBehavior = scroller?.style.scrollBehavior ?? "";
    if (scroller) scroller.style.scrollBehavior = "auto";
    try {
      action.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      const readBounds = () => {
        const bounds = action.getBoundingClientRect();
        return [bounds.bottom, bounds.left, bounds.right, bounds.top];
      };
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const firstFrame = readBounds();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const secondFrame = readBounds();
      if (firstFrame.some((value, index) => value !== secondFrame[index])) {
        throw new Error("Responsive action did not settle across two animation frames");
      }
    } finally {
      if (scroller) scroller.style.scrollBehavior = previousScrollBehavior;
    }
  });
  // Trial mode applies Playwright's real hit-testing without issuing the
  // business click; the normal click below retains the user interaction path.
  await target.click({ trial: true });
  await expect.poll(
    () => target.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return Boolean(hit && (hit === element || element.contains(hit)));
    }),
    `${label}: target center is not covered by navigation chrome`
  ).toBe(true);
  await target.click();
}

async function openStageSixBook(page: Page, bookCourseApi: BookCourseApiFixture, options?: StageSixFlowOptions) {
  await loadStageSixCourse(page, bookCourseApi, options);
  await clickSettledScreenTarget(
    page,
    page.locator('.home-book-workspace[data-loaded="true"] .home-primary-action'),
    "Stage 6 current-course entry"
  );
  await expect(page.locator(".book-course-screen"), "Stage 6 course overview opens from Home").toBeVisible();
}

async function openStageSixLesson(page: Page, bookCourseApi: BookCourseApiFixture, options?: StageSixFlowOptions) {
  await openStageSixBook(page, bookCourseApi, options);
  await clickSettledScreenTarget(page, page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"), "Stage 6 lesson entry");
  await expect(page.locator(".lesson-layout"), "Stage 6 lesson opens from the course overview").toBeVisible();
}

async function openStageSixPlan(page: Page, label: string) {
  await clickSettledScreenTarget(page, page.locator(".study-plan-summary button"), label);
  await expect(page.locator(".study-plan-screen"), label).toBeVisible();
}

async function openStageFiveLibrary(page: Page, bookCourseApi: BookCourseApiFixture, options?: { imageMode?: StageFiveImageMode }) {
  await loadStageFiveCourse(page, bookCourseApi, options);
  await clickSettledScreenTarget(
    page,
    page.locator(".home-book-picker-heading button"),
    "Stage 5 home course-library entry"
  );
  await expect(page.locator(".library-course-grid"), "Stage 5 library loads the fixture courses").toBeVisible();
}

async function openStageFiveCourse(page: Page, bookCourseApi: BookCourseApiFixture, options?: { imageMode?: StageFiveImageMode }) {
  await loadStageFiveCourse(page, bookCourseApi, options);
  await clickSettledScreenTarget(
    page,
    page.locator('.home-book-workspace[data-loaded="true"] .home-primary-action'),
    "Stage 5 current-course entry"
  );
  await expect(page.locator(".book-course-screen"), "Stage 5 course overview opens from the library").toBeVisible();
}

async function openStageFiveLesson(page: Page, bookCourseApi: BookCourseApiFixture, options?: { imageMode?: StageFiveImageMode }) {
  await openStageFiveCourse(page, bookCourseApi, options);
  await clickSettledScreenTarget(
    page,
    page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"),
    "Stage 5 course lesson entry"
  );
  await expect(page.locator(".lesson-layout"), "Stage 5 lesson opens from the course overview").toBeVisible();
}

async function openStageFiveSourceReader(page: Page, label: string) {
  await clickSettledScreenTarget(page, page.locator(".lesson-learning-tools > .button").first(), label);
  await expect(page.locator(".source-reader-screen"), label).toBeVisible();
}

async function openPreparedLesson(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openStageFiveLesson(page, bookCourseApi);
  await expect(page.getByRole("button", { name: "问 AI", exact: true }), "prepared lesson exposes its real sheet triggers").toBeVisible();
}

async function openPreparedChapterWorkspace(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openStageFiveLibrary(page, bookCourseApi);
  const course = page.locator(".library-course-grid .course-space-card").first();
  await clickSettledScreenTarget(page, course.locator(".course-card-edit"), "prepared chapter course settings");
  await clickSettledScreenTarget(page, course.locator(".course-card-menu button").first(), "prepared chapter content entry");
  await expect(page.locator(".chapter-confirm-screen"), "chapter confirmation loads from the production repository").toBeVisible();
  await expect(page.locator(".toc-edit-button").first(), "chapter confirmation exposes its editor action").toBeVisible();
}

async function openPreparedChapterEditor(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openPreparedChapterWorkspace(page, bookCourseApi);
  const editTrigger = page.locator(".toc-edit-button").first();
  await editTrigger.scrollIntoViewIfNeeded();
  await editTrigger.click();
}

async function expectSheetPresentation(page: Page, sheetType: "chat" | "source" | "note" | "editChapter", viewport: CssViewport, label: string) {
  const dialog = page.locator(`.sheet[data-sheet-type="${sheetType}"]`);
  await expect(dialog, `${label}: ${sheetType} dialog is visible`).toBeVisible();
  await expect(dialog, `${label}: ${sheetType} keeps its type data attribute`).toHaveAttribute("data-sheet-type", sheetType);
  await expect(dialog, `${label}: ${sheetType} is modal`).toHaveAttribute("aria-modal", "true");

  const layout = await page.evaluate((type) => {
    const sheet = document.querySelector<HTMLElement>(`.sheet[data-sheet-type="${type}"]`);
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const navigation = document.querySelector<HTMLElement>(".primary-nav");
    if (!sheet || !shell) throw new Error("Stage 3 overlay elements are missing");
    const sheetBounds = sheet.getBoundingClientRect();
    const shellBounds = shell.getBoundingClientRect();
    return {
      sheet: sheetBounds.toJSON(),
      shell: shellBounds.toJSON(),
      navigation: navigation?.getBoundingClientRect().toJSON() ?? null
    };
  }, sheetType);

  if (expectedNavigationMode(viewport) === "bottom") {
    await expect.poll(async () => page.evaluate((type) => {
      const sheet = document.querySelector<HTMLElement>(`.sheet[data-sheet-type="${type}"]`);
      const shell = document.querySelector<HTMLElement>(".app-shell");
      if (!sheet || !shell) return Number.POSITIVE_INFINITY;
      return Math.abs(sheet.getBoundingClientRect().bottom - shell.getBoundingClientRect().bottom);
    }, sheetType), `${label}: ${sheetType} stays attached to the mobile bottom edge`).toBeLessThanOrEqual(2);
    expect(layout.sheet.width, `${label}: ${sheetType} remains a usable mobile sheet`).toBeGreaterThan(0);
    return;
  }

  const railRight = layout.navigation?.right ?? layout.shell.left + 88;
  expect(layout.sheet.left, `${label}: ${sheetType} avoids the navigation rail`).toBeGreaterThanOrEqual(railRight - 1);
  expect(layout.sheet.right, `${label}: ${sheetType} stays inside the app shell`).toBeLessThanOrEqual(layout.shell.right + 1);
  if (sheetType === "chat") {
    expect(layout.sheet.height, `${label}: tablet chat uses a right-side panel`).toBeGreaterThan(layout.sheet.width);
    return;
  }
  if (sheetType === "source") {
    expect(layout.sheet.width, `${label}: tablet source uses the wide dialog`).toBeGreaterThan(560);
  } else {
    expect(layout.sheet.width, `${label}: tablet ${sheetType} uses a centered dialog width`).toBeLessThanOrEqual(561);
  }
  const sheetCenter = layout.sheet.left + (layout.sheet.width / 2);
  const contentCenter = railRight + ((layout.shell.right - railRight) / 2);
  expect(Math.abs(sheetCenter - contentCenter), `${label}: tablet ${sheetType} is centered in the content area`).toBeLessThanOrEqual(72);
}

async function expectDialogSemanticsAndFocusTrap(page: Page, dialogName: string, restoreTarget: Locator) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog, `${dialogName}: dialog is visible`).toBeVisible();
  await expect(dialog, `${dialogName}: dialog is marked modal`).toHaveAttribute("aria-modal", "true");
  const labelId = await dialog.getAttribute("aria-labelledby");
  if (!labelId) throw new Error(`${dialogName}: dialog needs an aria-labelledby target`);
  await expect(page.locator(`[id="${labelId}"]`), `${dialogName}: dialog title is associated`).toHaveText(dialogName);

  const focusable = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
  const first = focusable.first();
  const last = focusable.last();
  await expect(first, `${dialogName}: dialog has a focusable first control`).toBeVisible();
  await expect(last, `${dialogName}: dialog has a focusable last control`).toBeVisible();
  await expect(first, `${dialogName}: opening focuses the dialog`).toBeFocused();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first, `${dialogName}: Tab wraps inside the dialog`).toBeFocused();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last, `${dialogName}: Shift+Tab wraps inside the dialog`).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog, `${dialogName}: Escape closes the dialog`).toHaveCount(0);
  await expect(restoreTarget, `${dialogName}: focus returns to the trigger`).toBeFocused();
}

async function expectToastPresentation(page: Page, viewport: CssViewport, label: string) {
  const toast = page.getByRole("status");
  await expect(toast, `${label}: toast is visible`).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const toastElement = document.querySelector<HTMLElement>(".toast");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const navigation = document.querySelector<HTMLElement>(".primary-nav");
    if (!toastElement || !shell || !navigation) return false;
    const toastBounds = toastElement.getBoundingClientRect();
    const shellBounds = shell.getBoundingClientRect();
    const navBounds = navigation.getBoundingClientRect();
    return navBounds.height > navBounds.width
      ? toastBounds.left >= navBounds.right - 1 && toastBounds.right <= shellBounds.right + 1 && toastBounds.bottom <= shellBounds.bottom + 1
      : toastBounds.bottom <= navBounds.top + 1;
  }), `${label}: toast avoids the active navigation`).toBeTruthy();
  await expectNoHorizontalOverflow(page, `${label}: toast presentation`);
}

async function expectElementInsideAppShell(page: Page, selector: string, label: string) {
  await expect.poll(async () => page.evaluate((targetSelector) => {
    const target = document.querySelector<HTMLElement>(targetSelector);
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!target || !shell) throw new Error("App-shell elements are missing");
    const targetBounds = target.getBoundingClientRect();
    const shellBounds = shell.getBoundingClientRect();
    return {
      bottom: targetBounds.bottom <= shellBounds.bottom,
      left: targetBounds.left >= shellBounds.left,
      right: targetBounds.right <= shellBounds.right,
      top: targetBounds.top >= shellBounds.top
    };
  }, selector), { message: `${label}: target remains inside every app-shell edge after responsive constraint work settles` }).toEqual({
    bottom: true,
    left: true,
    right: true,
    top: true
  });
}

async function expectAiComposeInsideVisualViewport(page: Page, label: string) {
  await expect.poll(async () => page.evaluate(() => {
    const input = document.querySelector<HTMLElement>(".ai-compose input");
    const send = document.querySelector<HTMLElement>(".ai-compose button");
    if (!input || !send) return false;
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
    const inputBounds = input.getBoundingClientRect();
    const sendBounds = send.getBoundingClientRect();
    return inputBounds.top >= viewportTop
      && inputBounds.bottom <= viewportBottom
      && sendBounds.top >= viewportTop
      && sendBounds.bottom <= viewportBottom;
  }), `${label}: AI input and send controls stay inside the visual viewport`).toBeTruthy();
}

async function expectElementsInsideVisualViewport(page: Page, selectors: string[], label: string) {
  for (const selector of selectors) {
    await expect.poll(async () => page.evaluate((targetSelector) => {
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
      const target = document.querySelector<HTMLElement>(targetSelector);
      if (!target) return false;
      const bounds = target.getBoundingClientRect();
      return bounds.top >= viewportTop - 1 && bounds.bottom <= viewportBottom + 1;
    }, selector), `${label}: ${selector} stays inside the visual viewport`).toBeTruthy();
  }
}

async function getRailBounds(page: Page) {
  return page.getByRole("navigation", { name: "主导航" }).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: Math.round(bounds.bottom),
      height: Math.round(bounds.height),
      left: Math.round(bounds.left),
      right: Math.round(bounds.right),
      top: Math.round(bounds.top),
      width: Math.round(bounds.width)
    };
  });
}

async function expectRailUnchanged(page: Page, initialBounds: Awaited<ReturnType<typeof getRailBounds>>, label: string) {
  await expectNavigationMode(page, { width: 834, height: 1194 }, `${label}: rail presentation`);
  expect(await getRailBounds(page), `${label}: rail geometry is unchanged`).toEqual(initialBounds);
}

async function expectOverlayViewportVariables(
  page: Page,
  viewport: { height: number; offsetTop: number },
  label: string
) {
  const bottomGap = 1194 - viewport.offsetTop - viewport.height;
  await expect.poll(async () => page.locator(".app-shell").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      bottom: style.getPropertyValue("--overlay-visual-bottom").trim(),
      height: style.getPropertyValue("--overlay-visual-height").trim(),
      top: style.getPropertyValue("--overlay-visual-top").trim()
    };
  }), `${label}: app shell shares the visual viewport metrics`).toEqual({
    bottom: `${bottomGap}px`,
    height: `${viewport.height}px`,
    top: `${viewport.offsetTop}px`
  });
}

async function expectAiDialogButtonTargets(page: Page, label: string) {
  const buttons = await page.getByRole("dialog", { name: "AI 导学助手" }).locator("button:not([disabled])").evaluateAll((elements) => (
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { height: bounds.height, label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "button", width: bounds.width };
    })
  ));
  expect(buttons.length, `${label}: AI dialog exposes interactive buttons`).toBeGreaterThan(0);
  for (const button of buttons) {
    expect(button.width, `${label}: ${button.label} hit width`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: ${button.label} hit height`).toBeGreaterThanOrEqual(44);
  }
}

const stageFourLongFilename = `${"responsive-source-".repeat(10)}upload.pdf`;
const stageFourDraftTitle = "iPad local chapter draft survives a chapter switch";
const stageFiveLongCourseTitle = `${"用于验证窄屏两行截断与稳定卡片宽度的超长教材标题 ".repeat(3)}结尾`;

function expectedStageFiveLibraryColumns(viewport: CssViewport) {
  if (viewport.width >= 1024 && viewport.height >= 600) return 3;
  return expectedNavigationMode(viewport) === "rail" ? 2 : 1;
}

async function expectStageFiveHomeLayout(page: Page, viewport: CssViewport, label: string) {
  await expect.poll(
    () => page.locator(".home-book-option.is-selected .home-book-cover").evaluate((element) => getComputedStyle(element).filter),
    { message: `${label}: selected-book blur transition settles before geometry audit` }
  ).toBe("none");
  const geometry = await page.evaluate(() => {
    const dashboard = document.querySelector<HTMLElement>(".home-dashboard");
    const carousel = document.querySelector<HTMLElement>(".home-book-carousel");
    const picker = document.querySelector<HTMLElement>(".home-book-picker");
    const workspace = document.querySelector<HTMLElement>(".home-book-workspace");
    const globalActionList = document.querySelector<HTMLElement>(".home-global-action-list");
    const globalActions = [...document.querySelectorAll<HTMLElement>(".home-global-action")];
    const books = [...document.querySelectorAll<HTMLElement>(".home-book-option")];
    const primaryAction = document.querySelector<HTMLElement>(".home-primary-action, .home-status-actions button");
    if (!dashboard || !carousel || !picker || !workspace || !globalActionList || globalActions.length < 1 || books.length !== 3 || !primaryAction) {
      throw new Error("Production home elements are missing");
    }
    return {
      books: books.map((element) => {
        const cover = element.querySelector<HTMLElement>(".home-book-cover");
        const bounds = element.getBoundingClientRect();
        return {
          centerY: bounds.top + bounds.height / 2,
          filter: cover ? getComputedStyle(cover).filter : "missing",
          offsetWidth: element.offsetWidth,
          selected: element.getAttribute("aria-selected") === "true"
        };
      }),
      carousel: {
        clientWidth: carousel.clientWidth,
        display: getComputedStyle(carousel).display,
        flexDirection: getComputedStyle(carousel).flexDirection,
        overflowX: getComputedStyle(carousel).overflowX,
        scrollWidth: carousel.scrollWidth
      },
      dashboard: dashboard.getBoundingClientRect().toJSON(),
      globalActionList: globalActionList.getBoundingClientRect().toJSON(),
      globalActions: globalActions.map((element) => element.getBoundingClientRect().toJSON()),
      picker: picker.getBoundingClientRect().toJSON(),
      primaryAction: primaryAction.getBoundingClientRect().toJSON(),
      workspace: workspace.getBoundingClientRect().toJSON(),
      viewportHeight: window.innerHeight
    };
  });

  expect(geometry.picker.top, `${label}: the horizontal book picker starts in the first viewport`).toBeLessThan(geometry.viewportHeight);
  expect(geometry.primaryAction.height, `${label}: the next-step action remains a touch target`).toBeGreaterThanOrEqual(44);
  const isShortLandscape = viewport.width > viewport.height && viewport.height < 600;
  const expectedBookWidth = isShortLandscape ? 92 : Math.min(108, Math.max(100, viewport.width * .25));
  expect(geometry.books.filter((book) => Math.abs(book.offsetWidth - expectedBookWidth) <= 1).length, `${label}: every book keeps its viewport-specific carousel width`).toBe(3);
  expect(geometry.books.filter((book) => book.selected && book.filter === "none").length, `${label}: exactly one selected book stays sharp`).toBe(1);
  expect(geometry.books.filter((book) => !book.selected && book.filter.includes("blur(1.5px)")).length, `${label}: unselected books retain the required blur`).toBe(2);
  expect(geometry.carousel.display, `${label}: the book picker uses a flex row`).toBe("flex");
  expect(geometry.carousel.flexDirection, `${label}: books are arranged horizontally`).toBe("row");
  expect(geometry.carousel.overflowX, `${label}: the book row supports horizontal scrolling`).toBe("auto");
  expect(geometry.carousel.scrollWidth, `${label}: the horizontal book row has scrollable content`).toBeGreaterThan(geometry.carousel.clientWidth);
  expect(Math.max(...geometry.books.map((book) => book.centerY)) - Math.min(...geometry.books.map((book) => book.centerY)), `${label}: book centers share one horizontal axis`).toBeLessThanOrEqual(1);
  if (geometry.globalActions.length === 1) {
    expect(
      Math.abs(geometry.globalActionList.width - geometry.globalActions[0].width),
      `${label}: a lone upload action spans the entire learning-action row`
    ).toBeLessThanOrEqual(1);
  }
  if (expectedNavigationMode(viewport) === "rail") {
    expect(geometry.workspace.left, `${label}: iPad puts the selected-book workspace beside the book picker`).toBeGreaterThanOrEqual(geometry.picker.right - 1);
    expect(new Set(geometry.globalActions.map((item) => Math.round(item.left))).size, `${label}: iPad keeps available global learning actions in one row`).toBe(geometry.globalActions.length);
  } else {
    expect(geometry.workspace.top, `${label}: phone keeps the selected-book workspace after the book picker`).toBeGreaterThanOrEqual(geometry.picker.bottom - 1);
    expect(new Set(geometry.globalActions.map((item) => Math.round(item.left))).size, `${label}: phone keeps available global learning actions in one row`).toBe(geometry.globalActions.length);
  }
  expect(geometry.dashboard.width, `${label}: dashboard remains measurable inside the app shell`).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page, `${label}: Stage 5 home`);
}

async function expectStageFiveLibraryLayout(page: Page, viewport: CssViewport, label: string) {
  const cards = page.locator(".library-course-grid .course-space-card");
  await expect(cards, `${label}: library renders three fixture courses`).toHaveCount(3);
  const geometry = await cards.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    const title = element.querySelector<HTMLElement>("h2");
    return {
      height: Math.round(bounds.height),
      left: Math.round(bounds.left),
      titleClientHeight: title?.clientHeight ?? 0,
      titleScrollHeight: title?.scrollHeight ?? 0
    };
  }));
  expect(new Set(geometry.map((item) => item.left)).size, `${label}: library column count`).toBe(expectedStageFiveLibraryColumns(viewport));
  expect(Math.max(...geometry.map((item) => item.height)) - Math.min(...geometry.map((item) => item.height)), `${label}: cards keep a stable height within their grid row`).toBeLessThanOrEqual(expectedStageFiveLibraryColumns(viewport) > 1 ? 2 : 18);

  const longTitle = page.locator(".library-course-grid .course-space-card").filter({ hasText: stageFiveLongCourseTitle }).locator("h2");
  await expect(longTitle, `${label}: long fixture title remains visible`).toBeVisible();
  const longTitleMetrics = await longTitle.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(longTitleMetrics.clientHeight, `${label}: long title reserves two lines`).toBeGreaterThan(20);
  expect(longTitleMetrics.clientHeight, `${label}: long title is clipped instead of stretching a card`).toBeLessThan(longTitleMetrics.scrollHeight);
  await expectNoHorizontalOverflow(page, `${label}: Stage 5 library`);
}

async function expectStageFiveLessonLayout(page: Page, viewport: CssViewport, label: string) {
  const geometry = await page.evaluate(() => {
    const reading = document.querySelector<HTMLElement>(".lesson-reading-column");
    const tools = document.querySelector<HTMLElement>(".lesson-learning-tools");
    if (!reading || !tools) throw new Error("Stage 5 lesson elements are missing");
    return {
      reading: reading.getBoundingClientRect().toJSON(),
      readingMeasure: getComputedStyle(reading).getPropertyValue("--lesson-reading-measure").trim(),
      screenScrollBehavior: getComputedStyle(document.querySelector<HTMLElement>(".screen-content")!).scrollBehavior,
      tools: tools.getBoundingClientRect().toJSON(),
      toolsPosition: getComputedStyle(tools).position
    };
  });

  expect(geometry.readingMeasure, `${label}: lesson body keeps the 65-75 character reading measure`).toBe("72ch");
  if (expectedNavigationMode(viewport) === "rail") {
    expect(geometry.tools.left, `${label}: iPad learning toolbar is beside the reading column`).toBeGreaterThanOrEqual(geometry.reading.right - 1);
    expect(geometry.toolsPosition, `${label}: iPad learning toolbar is sticky`).toBe("sticky");
  } else {
    expect(geometry.tools.top, `${label}: phone and short landscape keep tools after sequential reading`).toBeGreaterThanOrEqual(geometry.reading.bottom - 1);
    expect(geometry.toolsPosition, `${label}: phone learning tools are not sticky`).not.toBe("sticky");
  }
  if (viewport.width > viewport.height && viewport.height < 600) {
    expect(geometry.screenScrollBehavior, `${label}: short-landscape lesson tool focus does not animate the scroll container`).toBe("auto");
  }
  await expectNoHorizontalOverflow(page, `${label}: Stage 5 lesson`);
}

async function expectStageFiveSourceReaderLayout(page: Page, viewport: CssViewport, label: string) {
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(".source-page-frame");
    const toolbar = document.querySelector<HTMLElement>(".source-reader-toolbar");
    const actions = document.querySelector<HTMLElement>(".source-reader-actions");
    if (!frame || !toolbar || !actions) throw new Error("Stage 5 source reader elements are missing");
    return {
      actions: actions.getBoundingClientRect().toJSON(),
      frame: frame.getBoundingClientRect().toJSON(),
      toolbar: toolbar.getBoundingClientRect().toJSON()
    };
  });

  if (expectedNavigationMode(viewport) === "rail") {
    expect(geometry.toolbar.left, `${label}: iPad page controls use the operation side area`).toBeGreaterThanOrEqual(geometry.frame.right - 1);
    expect(geometry.actions.left, `${label}: iPad source actions share the operation side area`).toBeGreaterThanOrEqual(geometry.frame.right - 1);
  } else {
    expect(geometry.toolbar.top, `${label}: mobile keeps page controls before the document`).toBeLessThanOrEqual(geometry.frame.top + 1);
    expect(geometry.actions.top, `${label}: mobile keeps return actions after the document`).toBeGreaterThanOrEqual(geometry.frame.bottom - 1);
  }
  await expectNoHorizontalOverflow(page, `${label}: Stage 5 source reader`);
}

async function expectBookCourseTransitionGeometry(page: Page, label: string) {
  await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
  const geometry = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>(".screen-content");
    const wrapper = document.querySelector<HTMLElement>(".motion-screen-transition");
    const root = document.querySelector<HTMLElement>(".book-course-screen");
    if (!screen || !wrapper || !root) throw new Error("BookCourse transition geometry elements are missing");
    const screenBounds = screen.getBoundingClientRect();
    const wrapperBounds = wrapper.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    const screenStyle = getComputedStyle(screen);
    const contentLeft = screenBounds.left + Number.parseFloat(screenStyle.paddingLeft);
    const contentRight = screenBounds.right - Number.parseFloat(screenStyle.paddingRight);
    return {
      contentCenter: (contentLeft + contentRight) / 2,
      contentWidth: contentRight - contentLeft,
      root: { center: rootBounds.left + (rootBounds.width / 2), width: rootBounds.width },
      wrapper: { center: wrapperBounds.left + (wrapperBounds.width / 2), width: wrapperBounds.width }
    };
  });

  expect(geometry.root.width, `${label}: Study keeps its 920px reading root without exceeding available content`).toBeCloseTo(Math.min(920, geometry.contentWidth), 5);
  expect(geometry.root.center, `${label}: BookCourse stays centered in screen-content`).toBeCloseTo(geometry.contentCenter, 5);
  expect(geometry.root.center, `${label}: BookCourse stays centered inside the transition wrapper`).toBeCloseTo(geometry.wrapper.center, 5);
}

async function expectCenteredFlowTransitionGeometry(page: Page, label: string) {
  await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
  const geometry = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>(".screen-content");
    const wrapper = document.querySelector<HTMLElement>(".motion-screen-transition");
    const root = document.querySelector<HTMLElement>(".course-ready-screen.centered-flow");
    if (!screen || !wrapper || !root) throw new Error("Centered-flow transition geometry elements are missing");
    const screenStyle = getComputedStyle(screen);
    const wrapperBounds = wrapper.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    return {
      root: {
        height: rootBounds.height,
        minHeight: getComputedStyle(root).minHeight
      },
      screen: {
        clientHeight: screen.clientHeight,
        paddingBottom: Number.parseFloat(screenStyle.paddingBottom),
        paddingTop: Number.parseFloat(screenStyle.paddingTop),
        scrollHeight: screen.scrollHeight,
        scrollTop: screen.scrollTop
      },
      wrapper: { height: wrapperBounds.height }
    };
  });

  const expectedWrapperHeight = geometry.screen.clientHeight - geometry.screen.paddingTop - geometry.screen.paddingBottom;
  expect(geometry.wrapper.height, `${label}: wrapper preserves the screen-content percentage-height containing block`).toBeCloseTo(expectedWrapperHeight, 5);
  expect(geometry.root.minHeight, `${label}: centered-flow retains its percentage min-height rule`).toBe("calc(100% - 20px)");
  expect(geometry.root.height, `${label}: centered-flow resolves its preserved min-height instead of collapsing to content height`).toBeCloseTo(geometry.wrapper.height - 20, 5);
  expect(geometry.screen.scrollHeight, `${label}: centered-flow does not add artificial main-scroll height`).toBe(geometry.screen.clientHeight);
  expect(geometry.screen.scrollTop, `${label}: centered-flow leaves the main scroll position unchanged`).toBe(0);
}

async function expectStageFourFlowLayout(
  page: Page,
  viewport: CssViewport,
  primarySelector: string,
  supportSelector: string,
  label: string
) {
  const geometry = await page.evaluate(({ primarySelector: primary, supportSelector: support }) => {
    const primaryElement = document.querySelector<HTMLElement>(primary);
    const supportElement = document.querySelector<HTMLElement>(support);
    if (!primaryElement || !supportElement) throw new Error("Stage 4 flow elements are missing");
    return {
      primary: primaryElement.getBoundingClientRect().toJSON(),
      support: supportElement.getBoundingClientRect().toJSON()
    };
  }, { primarySelector, supportSelector });

  if (expectedNavigationMode(viewport) === "rail") {
    expect(geometry.support.left, `${label}: supporting information is beside the primary action`).toBeGreaterThanOrEqual(geometry.primary.right - 1);
    expect(Math.abs(geometry.support.top - geometry.primary.top), `${label}: iPad columns share a starting edge`).toBeLessThanOrEqual(40);
    return;
  }

  expect(Math.abs(geometry.support.left - geometry.primary.left), `${label}: phone flow remains in one column`).toBeLessThanOrEqual(1);
  expect(geometry.support.top, `${label}: phone support follows the primary action`).toBeGreaterThanOrEqual(geometry.primary.bottom - 1);
}

async function expectStageFourChapterWorkspace(page: Page, viewport: CssViewport, label: string) {
  const directory = page.locator(".chapter-confirm-directory");
  const detail = page.locator(".chapter-confirm-detail");
  await expect(directory, `${label}: chapter directory is visible`).toBeVisible();
  if (expectedNavigationMode(viewport) !== "rail") {
    await expect(detail, `${label}: phone keeps editing in the bottom sheet`).toBeHidden();
    return;
  }

  await expect(detail, `${label}: iPad exposes the evidence and editor panel`).toBeVisible();
  const geometry = await page.evaluate(() => {
    const directoryElement = document.querySelector<HTMLElement>(".chapter-confirm-directory");
    const detailElement = document.querySelector<HTMLElement>(".chapter-confirm-detail");
    if (!directoryElement || !detailElement) throw new Error("Stage 4 chapter workspace is missing");
    return {
      directory: directoryElement.getBoundingClientRect().toJSON(),
      detail: detailElement.getBoundingClientRect().toJSON()
    };
  });
  expect(geometry.detail.left, `${label}: iPad editor is to the right of the chapter directory`).toBeGreaterThanOrEqual(geometry.directory.right - 1);
}

async function openProductionUpload(page: Page) {
  await page.goto("/?embedded=device-preview");
  await clickHomeUploadAction(page, "production upload flow");
  await expect(page.locator(".upload-flow-screen")).toBeVisible();
}

async function uploadStageFourFile(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: stageFourLongFilename,
    mimeType: "application/pdf",
    buffer: Buffer.from("stage four responsive fixture")
  });
  await expect(page.locator(".upload-selection-summary")).toBeVisible();
  await page.getByRole("button", { name: "上传并继续", exact: true }).click();
  await expect(page.locator(".parse-ready-screen")).toBeVisible({ timeout: 15_000 });
}

async function expectStageSixTwoColumnLayout(
  page: Page,
  viewport: CssViewport,
  firstSelector: string,
  secondSelector: string,
  label: string,
  options: { phoneFirstBefore?: boolean; tabletFirstLeft?: boolean } = {}
) {
  const geometry = await page.evaluate(({ firstSelector: first, secondSelector: second }) => {
    const firstElement = document.querySelector<HTMLElement>(first);
    const secondElement = document.querySelector<HTMLElement>(second);
    if (!firstElement || !secondElement) throw new Error("Stage 6 responsive columns are missing");
    return {
      first: firstElement.getBoundingClientRect().toJSON(),
      second: secondElement.getBoundingClientRect().toJSON()
    };
  }, { firstSelector, secondSelector });
  const phoneFirstBefore = options.phoneFirstBefore ?? true;
  const tabletFirstLeft = options.tabletFirstLeft ?? true;

  if (expectedNavigationMode(viewport) === "rail") {
    if (tabletFirstLeft) {
      expect(geometry.second.left, `${label}: second panel is to the right on iPad`).toBeGreaterThanOrEqual(geometry.first.right - 1);
    } else {
      expect(geometry.first.left, `${label}: first panel is to the right on iPad`).toBeGreaterThanOrEqual(geometry.second.right - 1);
    }
    return;
  }

  if (phoneFirstBefore) {
    expect(geometry.second.top, `${label}: phone keeps the second panel after the first`).toBeGreaterThanOrEqual(geometry.first.bottom - 1);
  } else {
    expect(geometry.first.top, `${label}: phone keeps the first panel after the second`).toBeGreaterThanOrEqual(geometry.second.bottom - 1);
  }
}

async function expectStageSixPlanLayout(page: Page, viewport: CssViewport, label: string, expectedDayCount = 7) {
  const calendarButtons = page.locator(".study-plan-calendar .plan-date-row button");
  await expect(calendarButtons, `${label}: the exact repository plan-day contract is rendered`).toHaveCount(expectedDayCount);
  const calendar = page.locator(".study-plan-calendar");
  const tasks = page.locator(".study-plan-tasks");
  await expect(calendar, `${label}: date calendar is visible`).toBeVisible();
  await expect(tasks, `${label}: selected-day tasks are visible`).toBeVisible();
  const calendarMetrics = await calendarButtons.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, left: Math.round(bounds.left), width: bounds.width };
  }));
  expect(new Set(calendarMetrics.map((item) => item.left)).size, `${label}: calendar keeps seven readable columns`).toBe(7);
  for (const item of calendarMetrics) {
    expect(item.width, `${label}: calendar day is a full touch target`).toBeGreaterThanOrEqual(44);
    expect(item.height, `${label}: calendar day is a touch target`).toBeGreaterThanOrEqual(44);
  }
  await expectStageSixTwoColumnLayout(page, viewport, ".study-plan-calendar", ".study-plan-tasks", label);
  await expectNoHorizontalOverflow(page, `${label}: study plan`);
}

async function exerciseStageSixSparsePlanDays(page: Page, label: string) {
  const days = page.locator(".study-plan-calendar .plan-date-row button");
  const taskItems = page.locator(".study-plan-tasks .timeline-item");
  const emptyState = page.locator(".study-plan-tasks .study-plan-empty-state");
  await expect(days, `${label}: configured plan duration renders every day`).toHaveCount(7);

  for (let index = 0; index < 7; index += 1) {
    const day = index + 1;
    const control = days.nth(index);
    await expect(control, `${label}: day ${day} is an enabled calendar control`).toBeEnabled();
    await expect(control, `${label}: day ${day} retains its accessible label`).toHaveAttribute("aria-label", `第 ${day} 天`);
    await clickSettledScreenTarget(page, control, `${label}: day ${day} selection`);
    await expect(control, `${label}: day ${day} becomes selected`).toHaveAttribute("aria-pressed", "true");

    if (day <= 2) {
      await expect(taskItems, `${label}: populated day ${day} keeps its server task`).toContainText(`D${day}`);
      await expect(emptyState, `${label}: populated day ${day} does not show an empty state`).toHaveCount(0);
    } else {
      await expect(emptyState, `${label}: sparse day ${day} exposes an explicit empty state`).toBeVisible();
      await expect(emptyState, `${label}: sparse day ${day} identifies the selected day`).toContainText(`第 ${day} 天`);
      await expect(taskItems, `${label}: sparse day ${day} has no task controls`).toHaveCount(0);
    }
  }
}

async function expectStageSixFlashcardLayout(page: Page, viewport: CssViewport, label: string) {
  const memory = page.locator(".flashcard-workspace .memory-card");
  const hero = page.locator(".flashcard-workspace .flashcard-hero");
  const sidebar = page.locator(".flashcard-source-sidebar");
  const sourceRow = page.locator(".memory-card-source-row");
  await expect(memory, `${label}: central learning card is visible`).toBeVisible();
  await expect(hero, `${label}: mastery summary is visible`).toBeVisible();
  await expectStageSixTwoColumnLayout(page, viewport, ".memory-card", ".flashcard-hero", label, { phoneFirstBefore: false });
  if (expectedNavigationMode(viewport) === "rail") {
    await expect(sidebar, `${label}: iPad exposes source information in the sidebar`).toBeVisible();
    await expect(sourceRow, `${label}: iPad avoids duplicating the source row in the central card`).toBeHidden();
  } else {
    await expect(sidebar, `${label}: phone keeps a single source affordance`).toBeHidden();
    await expect(sourceRow, `${label}: phone keeps source information in the card`).toBeVisible();
  }
  const revealBounds = await page.locator(".memory-reveal").evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(revealBounds.height, `${label}: flashcard reveal control is a touch target`).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page, `${label}: flashcard`);
}

async function expectStageSixAssignmentLayout(page: Page, viewport: CssViewport, label: string) {
  const exerciseCard = page.locator(".assignment-exercise-card");
  const judgmentOptions = page.locator(".assignment-judgment-options button");
  const submit = page.locator(".assignment-primary-action .button");
  await expect(exerciseCard, `${label}: current exercise card is visible`).toBeVisible();
  await expect(exerciseCard, `${label}: the automatic flow starts with judgment`).toHaveAttribute("data-assignment-type", "judgment");
  await expect(judgmentOptions, `${label}: judgment exposes two touch choices`).toHaveCount(2);
  await expect(page.locator(".assignment-progress-card"), `${label}: exercise progress is visible`).toBeVisible();
  await expect(page.locator(".assignment-workspace > .card"), `${label}: progress and exercise are the only two primary surfaces`).toHaveCount(2);
  await expect(exerciseCard.locator(".assignment-source-button"), `${label}: source control lives inside the exercise surface`).toHaveCount(1);
  await expect(exerciseCard.locator(".assignment-primary-action"), `${label}: submit control lives inside the exercise surface`).toHaveCount(1);
  await expect(page.locator('[role="tablist"]'), `${label}: no manual type selector is rendered`).toHaveCount(0);
  await expect(submit, `${label}: submit action is visible`).toBeVisible();
  const controls = await Promise.all([judgmentOptions.first().boundingBox(), submit.boundingBox()]);
  if (!controls[0] || !controls[1]) throw new Error(`${label}: assignment controls are not measurable`);
  expect(controls[0].height, `${label}: judgment choice is a generous touch target`).toBeGreaterThanOrEqual(90);
  expect(controls[1].height, `${label}: submit action is a touch target`).toBeGreaterThanOrEqual(44);
  expect(viewport.width, `${label}: viewport remains measurable for the single-column exercise flow`).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page, `${label}: assignment`);
}

async function advanceStageSixAssignmentToShortAnswer(page: Page, label: string) {
  await page.locator(".assignment-judgment-options button").first().click();
  await page.locator(".assignment-primary-action .button").click();
  await expect(page.locator('.assignment-exercise-card[data-assignment-type="choice"]'), `${label}: judgment advances to choice`).toBeVisible();
  await page.locator(".assignment-choice-options button").nth(1).click();
  await page.locator(".assignment-primary-action .button").click();
  await expect(page.locator('.assignment-exercise-card[data-assignment-type="short-answer"]'), `${label}: choice advances to short answer`).toBeVisible();
}

async function expectStageSixDiagnosisLayout(page: Page, viewport: CssViewport, label: string) {
  await expect(page.locator(".diagnosis-workspace"), `${label}: diagnosis workspace is visible`).toBeVisible();
  await expectStageSixTwoColumnLayout(page, viewport, ".diagnosis-results-column", ".diagnosis-next-steps-column", label);
  const actionBounds = await page.locator(".diagnosis-actions .button").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  for (const height of actionBounds) {
    expect(height, `${label}: diagnosis action is a touch target`).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalOverflow(page, `${label}: diagnosis`);
}

async function expectStageSixCommunityGrid(page: Page, viewport: CssViewport, label: string) {
  const books = page.locator(".community-grid .community-book-card");
  await expect(books, `${label}: community books are available`).toHaveCount(10);
  const lefts = await books.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().left)));
  expect(new Set(lefts).size, `${label}: community uses the required two-column grid`).toBe(2);
  await expectNoHorizontalOverflow(page, `${label}: community grid`);
}

async function expectStageSixFocusVisible(locator: Locator, label: string) {
  await locator.focus();
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth)
    };
  });
  expect(focusStyle.outlineStyle, `${label}: focus ring uses a visible outline style`).not.toBe("none");
  expect(focusStyle.outlineWidth, `${label}: focus ring has a visible width`).toBeGreaterThan(0);
}

async function expectStageSixVisibleInlineLinkAudit(page: Page, screenSelector: string, label: string): Promise<Locator> {
  const links = page.locator(`${screenSelector} .inline-link:visible`);
  await expect(links, `${label}: every visible Stage 6 link-style button is audited`).toHaveCount(1);
  const targets = await links.evaluateAll((elements) => elements.map((element) => ({
    height: (element as HTMLElement).offsetHeight,
    width: (element as HTMLElement).offsetWidth
  })));
  for (const [index, target] of targets.entries()) {
    expect(target.width, `${label}: visible link ${index + 1} has a 44px horizontal layout target`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${label}: visible link ${index + 1} has a 44px vertical layout target`).toBeGreaterThanOrEqual(44);
    await expectStageSixFocusVisible(links.nth(index), `${label}: visible link ${index + 1}`);
  }
  return links.first();
}

test.describe("responsive smoke", () => {
  test("keeps local API fixtures inside the application origin", async ({ page, bookCourseApi }) => {
    const blockedProbeUrls = [
      "https://example.invalid/api/probe",
      "http://127.0.0.1:8000/api/probe",
      "http://localhost:8000/api/probe"
    ];

    await page.goto("/?embedded=device-preview");
    const fixtureResponse = await page.evaluate(async () => {
      const response = await fetch("/api/books");
      return { status: response.status, body: await response.json() };
    });
    expect(fixtureResponse, "the application API is fulfilled by the local fixture").toEqual({ status: 200, body: [] });

    const probesWereBlocked = await page.evaluate(async (urls) => Promise.all(
      urls.map(async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      })
    ), blockedProbeUrls);

    expect(probesWereBlocked, "every non-application origin is aborted").toEqual([true, true, true]);
    expect(bookCourseApi.externalRequests, "blocked probes are recorded").toEqual(expect.arrayContaining(blockedProbeUrls));
    expect(
      bookCourseApi.requests.some((request) => request.method === "GET" && request.path === "/api/books"),
      "the application API request reaches the fixture"
    ).toBeTruthy();
    expect(bookCourseApi.unhandledRequests, "blocked probes never reach the API fixture").toEqual([]);
  });

  test("keeps community discovery on a two-column grid across paired viewports", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);

    await page.goto("/?embedded=device-preview");
    await page.getByRole("button", { name: "社区", exact: true }).click();
    await expect(page.getByRole("region", { name: "社区课程", exact: true }), `${project.name}: community opens`).toBeVisible();
    await page.getByLabel("搜索课程", { exact: true }).fill("课");
    await expectStageSixCommunityGrid(page, project.initialViewport, `${project.name}: initial community viewport`);

    await page.setViewportSize(project.pairedViewport);
    await expect(page.getByRole("region", { name: "社区课程", exact: true }), `${project.name}: community remains open after resize`).toBeVisible();
    await expectStageSixCommunityGrid(page, project.pairedViewport, `${project.name}: paired community viewport`);
  });

  test("loads paired viewports and remains interactive after resize", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    const app = page.getByRole("application", { name: "BookCourse AI 应用" });
    const homeHeading = page.getByRole("heading", { name: "Hi，小明同学", exact: true });
    const uploadHeading = page.getByRole("heading", { name: "上传一本书", exact: true });

    expect(page.viewportSize(), `${project.name}: initial CSS viewport is configured`).toEqual(project.initialViewport);
    await page.goto("/?embedded=device-preview");
    await expect(app, `${project.name}: app loads at the initial viewport`).toBeVisible();
    await expect(homeHeading, `${project.name}: home loads at the initial viewport`).toBeVisible();
    await expectNavigationMode(page, project.initialViewport, `${project.name}: initial viewport`);
    await expectNoHorizontalOverflow(page, `${project.name}: initial viewport`);

    await page.setViewportSize(project.pairedViewport);
    expect(page.viewportSize(), `${project.name}: paired CSS viewport is configured`).toEqual(project.pairedViewport);
    await expect(app, `${project.name}: app remains loaded after resize`).toBeVisible();
    await expect(homeHeading, `${project.name}: home remains available after resize`).toBeVisible();
    await expectNavigationMode(page, project.pairedViewport, `${project.name}: paired viewport`);
    await expectNoHorizontalOverflow(page, `${project.name}: paired viewport`);

    if (project.pairedViewport.width === 1210) {
      const shellBounds = await page.locator(".app-shell").evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(Math.round(shellBounds.width), "1210px touch viewport uses the full app width").toBe(1210);
      expect(Math.round(shellBounds.left), "1210px touch viewport is flush with the viewport edge").toBe(0);
    }

    await clickHomeUploadAction(page, `${project.name}: paired viewport upload`);
    await expect(uploadHeading, `${project.name}: app remains interactive after resize`).toBeVisible();

    await page.setViewportSize(project.initialViewport);
    expect(page.viewportSize(), `${project.name}: initial CSS viewport is restored`).toEqual(project.initialViewport);
    await expect(uploadHeading, `${project.name}: app remains loaded after resizing back`).toBeVisible();
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(homeHeading, `${project.name}: interaction remains available after resizing back`).toBeVisible();

    await page.setViewportSize(project.pairedViewport);
    await page.reload();
    await expect(app, `${project.name}: app loads directly at the paired viewport`).toBeVisible();
    await expect(homeHeading, `${project.name}: home loads directly at the paired viewport`).toBeVisible();

    expect(
      bookCourseApi.requests,
      `${project.name}: the in-memory demo repository does not issue browser API requests`
    ).toEqual([]);
    expect(bookCourseApi.unhandledRequests, `${project.name}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: no external network requests are allowed`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${project.name}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${project.name}: no page errors are emitted`).toEqual([]);
  });

  test("uses the navigation rule at width and height boundaries", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    const widthCases: CssViewport[] = [
      { width: 599, height: 800 },
      { width: 600, height: 800 },
      { width: 767, height: 800 },
      { width: 768, height: 800 },
      { width: 1023, height: 800 },
      { width: 1024, height: 800 }
    ];
    const heightCases: CssViewport[] = [
      { width: 768, height: 599 },
      { width: 768, height: 600 },
      { width: 1024, height: 599 },
      { width: 1024, height: 600 }
    ];

    await page.goto("/?embedded=device-preview");
    for (const viewport of [...widthCases, ...heightCases]) {
      await page.setViewportSize(viewport);
      await expectNavigationMode(page, viewport, `${project.name}: ${viewport.width}x${viewport.height}`);
    }
  });

  test("respects injected non-zero safe areas and preserves hideNav", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);

    await page.goto("/?embedded=device-preview");
    await page.addStyleTag({
      content: `:root {
        --safe-area-top: 47px !important;
        --safe-area-right: 13px !important;
        --safe-area-bottom: 34px !important;
        --safe-area-left: 11px !important;
      }`
    });

    await page.setViewportSize({ width: 402, height: 681 });
    await expectNavigationMode(page, { width: 402, height: 681 }, `${project.name}: mobile safe-area viewport`);
    const mobileSafeArea = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const navigation = document.querySelector<HTMLElement>(".primary-nav");
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!shell || !navigation || !content) throw new Error("Responsive shell elements are missing");
      const shellBounds = shell.getBoundingClientRect();
      const navBounds = navigation.getBoundingClientRect();
      const contentStyle = getComputedStyle(content);
      return {
        navLeft: navBounds.left - shellBounds.left,
        navRight: shellBounds.right - navBounds.right,
        navBottom: shellBounds.bottom - navBounds.bottom,
        contentPaddingLeft: Number.parseFloat(contentStyle.paddingLeft),
        contentPaddingRight: Number.parseFloat(contentStyle.paddingRight)
      };
    });
    expect(mobileSafeArea.navLeft, "mobile navigation avoids the left safe area").toBeGreaterThanOrEqual(11);
    expect(mobileSafeArea.navRight, "mobile navigation avoids the right safe area").toBeGreaterThanOrEqual(13);
    expect(mobileSafeArea.navBottom, "mobile navigation avoids the bottom safe area").toBeGreaterThanOrEqual(34);
    expect(mobileSafeArea.contentPaddingLeft, "mobile content avoids the left safe area").toBeGreaterThanOrEqual(11);
    expect(mobileSafeArea.contentPaddingRight, "mobile content avoids the right safe area").toBeGreaterThanOrEqual(13);

    await page.setViewportSize({ width: 834, height: 1194 });
    await expectNavigationMode(page, { width: 834, height: 1194 }, `${project.name}: tablet safe-area viewport`);
    await page.getByRole("button", { name: "社区", exact: true }).click();
    await expect(page.locator(".header-bar")).toBeVisible();
    const railSafeArea = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const navigation = document.querySelector<HTMLElement>(".primary-nav");
      const header = document.querySelector<HTMLElement>(".header-bar");
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!shell || !navigation || !header || !content) throw new Error("Responsive shell elements are missing");
      const shellBounds = shell.getBoundingClientRect();
      const navBounds = navigation.getBoundingClientRect();
      const headerBounds = header.getBoundingClientRect();
      const contentStyle = getComputedStyle(content);
      return {
        navLeft: navBounds.left - shellBounds.left,
        navTop: navBounds.top - shellBounds.top,
        navBottom: shellBounds.bottom - navBounds.bottom,
        headerTop: headerBounds.top - shellBounds.top,
        contentPaddingLeft: Number.parseFloat(contentStyle.paddingLeft),
        contentPaddingRight: Number.parseFloat(contentStyle.paddingRight)
      };
    });
    expect(railSafeArea.navLeft, "rail avoids the left safe area").toBeGreaterThanOrEqual(11);
    expect(railSafeArea.navTop, "rail avoids the top safe area").toBeGreaterThanOrEqual(47);
    expect(railSafeArea.navBottom, "rail avoids the bottom safe area").toBeGreaterThanOrEqual(34);
    expect(railSafeArea.headerTop, "header avoids the top safe area").toBeGreaterThanOrEqual(47);
    expect(railSafeArea.contentPaddingLeft, "tablet content reserves the rail and left safe area").toBeGreaterThanOrEqual(99);
    expect(railSafeArea.contentPaddingRight, "tablet content avoids the right safe area").toBeGreaterThanOrEqual(13);

    await page.getByRole("button", { name: "首页", exact: true }).click();
    await clickHomeUploadAction(page, `${project.name}: safe-area upload`);
    await expect(page.getByRole("navigation", { name: "主导航" }), "hideNav removes primary navigation").toHaveCount(0);
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expectNavigationMode(page, { width: 834, height: 1194 }, `${project.name}: navigation returns after hideNav`);
  });

  test("rejects Stage 4 chapters outside their parent page range", async ({ page, bookCourseApi }) => {
    bookCourseApi.useStageFourFlow();
    await page.goto("/?embedded=device-preview");

    const rejection = await page.evaluate(async () => {
      const response = await fetch("/api/books/book_stage4/chapters/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: [
            {
              chapter_id: "parent_chapter",
              level: 1,
              source_title: "Parent chapter",
              ai_title: "Parent chapter",
              page_start: 2,
              page_end: 2,
              confidence: 96,
              status: "匹配良好",
              source: "stage-four-range-probe",
              parent_id: null
            },
            {
              chapter_id: "child_chapter",
              level: 2,
              source_title: "Child chapter outside parent",
              ai_title: "Child chapter outside parent",
              page_start: 3,
              page_end: 3,
              confidence: 95,
              status: "匹配良好",
              source: "stage-four-range-probe",
              parent_id: "parent_chapter"
            }
          ]
        })
      });

      return { status: response.status, body: await response.json() };
    });

    expect(rejection.status, "child pages beyond their parent range are rejected").toBe(400);
    expect(rejection.body, "range rejection keeps the backend contract error code and identifiers").toMatchObject({
      code: "child_chapter_out_of_parent",
      details: { chapter_id: "child_chapter", parent_id: "parent_chapter" }
    });
    expect(bookCourseApi.lastStageFourConfirmationResponse, "invalid confirmation does not create a confirmed response").toBeNull();
    expect(bookCourseApi.unhandledRequests, "range probe has complete local API coverage").toEqual([]);
    expect(bookCourseApi.externalRequests, "range probe has no external API dependency").toEqual([]);
  });

  test("accepts Stage 4 chapters with an empty parent ID as top-level", async ({ page, bookCourseApi }) => {
    bookCourseApi.useStageFourFlow();
    await page.goto("/?embedded=device-preview");

    const result = await page.evaluate(async () => {
      type ConfirmedChapter = { chapter_id: string; parent_id: string | null; status: string };
      const confirmationResponse = await fetch("/api/books/book_stage4/chapters/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: [
            {
              chapter_id: "top_level_empty_parent_id",
              level: 1,
              source_title: "Top-level chapter with empty parent ID",
              ai_title: "Top-level chapter with empty parent ID",
              page_start: 4,
              page_end: 4,
              confidence: 96,
              status: "匹配良好",
              source: "stage-four-empty-parent-probe",
              parent_id: ""
            }
          ]
        })
      });
      const persistedResponse = await fetch("/api/books/book_stage4/chapters");

      return {
        confirmation: {
          status: confirmationResponse.status,
          chapters: (await confirmationResponse.json()) as ConfirmedChapter[]
        },
        persisted: {
          status: persistedResponse.status,
          chapters: (await persistedResponse.json()) as ConfirmedChapter[]
        }
      };
    });

    expect(result.confirmation.status, "empty parent ID confirms as a top-level chapter").toBe(200);
    expect(result.confirmation.chapters, "confirmation preserves the empty parent ID chapter").toHaveLength(1);
    expect(result.confirmation.chapters[0]).toMatchObject({
      chapter_id: "top_level_empty_parent_id",
      parent_id: "",
      status: "已确认"
    });
    expect(result.persisted.status, "confirmed empty-parent chapter remains available from GET /chapters").toBe(200);
    expect(result.persisted.chapters, "GET /chapters persists the empty parent ID chapter").toHaveLength(1);
    expect(result.persisted.chapters[0]).toMatchObject({
      chapter_id: "top_level_empty_parent_id",
      parent_id: "",
      status: "已确认"
    });
    expect(bookCourseApi.lastStageFourConfirmationResponse?.every((chapter) => chapter.status === "已确认"), "fixture stores the normalized confirmed status").toBeTruthy();
    expect(bookCourseApi.unhandledRequests, "empty parent ID probe has complete local API coverage").toEqual([]);
    expect(bookCourseApi.externalRequests, "empty parent ID probe has no external API dependency").toEqual([]);
  });

  test("completes the production repository upload-to-course flow with responsive editing", async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    const project = getResponsiveProject(testInfo.project.name);
    const observedRequests: string[] = [];
    page.on("request", (request) => observedRequests.push(request.url()));
    await openProductionUpload(page);
    await expectStageFourFlowLayout(
      page,
      project.initialViewport,
      ".upload-flow-primary",
      ".upload-flow-support .upload-mini-actions",
      `${project.name}: upload`
    );
    await expectNoHorizontalOverflow(page, `${project.name}: empty upload state`);

    await uploadStageFourFile(page);
    await expect(page.locator(".parse-file-card")).toContainText(stageFourLongFilename);
    await expectStageFourFlowLayout(
      page,
      project.initialViewport,
      ".parse-flow-primary .parse-file-card",
      ".parse-flow-support .parse-info-grid",
      `${project.name}: parse ready`
    );
    await expectNoHorizontalOverflow(page, `${project.name}: long filename parse ready state`);

    await page.locator(".parse-flow-actions .button").first().click();
    await expect(page.locator(".processing-flow-screen")).toBeVisible();
    await expect(page.locator(".processing-card strong")).toHaveText("18%");
    await expectStageFourFlowLayout(
      page,
      project.initialViewport,
      ".processing-flow-primary .processing-card",
      ".processing-flow-support .stage-list",
      `${project.name}: processing`
    );
    await expectNoHorizontalOverflow(page, `${project.name}: first production processing state`);

    await expect(page.locator(".chapter-confirm-screen"), `${project.name}: completed parsing opens chapter confirmation`).toBeVisible({ timeout: 10_000 });
    await expectStageFourChapterWorkspace(page, project.initialViewport, `${project.name}: chapter confirmation`);
    await expectNoHorizontalOverflow(page, `${project.name}: long chapter title confirmation state`);
    await expect(page.locator(".toc-directory-helper"), `${project.name}: chapter directory explains the distinct row actions`).toContainText("点击章名选择");

    const expandButton = page.locator(".chapter-confirm-directory .toc-expand-button").first();
    await expect(expandButton, `${project.name}: nested chapter has an explicit expand control`).toHaveAttribute("aria-expanded", "false");
    await expandButton.click();
    await expect(expandButton, `${project.name}: expand control announces the expanded state`).toHaveAttribute("aria-expanded", "true");
    const nestedChapterTitle = page.locator(".chapter-confirm-directory .toc-children .toc-entry-title").first();
    await expect(nestedChapterTitle, `${project.name}: expand control reveals the nested chapter`).toBeVisible();
    await expandButton.click();
    await expect(expandButton, `${project.name}: expand control announces the collapsed state`).toHaveAttribute("aria-expanded", "false");
    await expandButton.click();
    await expect(expandButton, `${project.name}: expand control can be toggled open again`).toHaveAttribute("aria-expanded", "true");

    const lastDirectoryNode = page.locator(".chapter-confirm-directory .toc-node").last();
    await lastDirectoryNode.scrollIntoViewIfNeeded();
    await expect(lastDirectoryNode, `${project.name}: last chapter remains reachable`).toBeVisible();
    await page.evaluate(() => {
      const directory = document.querySelector<HTMLElement>(".chapter-confirm-directory");
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!directory || !content) throw new Error("Stage 4 scroll containers are missing");
      directory.style.scrollBehavior = "auto";
      content.style.scrollBehavior = "auto";
      directory.scrollTop = directory.scrollHeight;
      content.scrollTop = content.scrollHeight;
    });
    const stickyGeometry = await page.evaluate(() => {
      const directoryNodes = [...document.querySelectorAll<HTMLElement>(".chapter-confirm-directory .toc-node")];
      const lastNode = directoryNodes.at(-1);
      const actions = document.querySelector<HTMLElement>(".chapter-confirm-actions");
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!lastNode || !actions || !content) throw new Error("Stage 4 sticky action elements are missing");
      const last = lastNode.getBoundingClientRect();
      const action = actions.getBoundingClientRect();
      return {
        action: action.toJSON(),
        content: { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, scrollTop: content.scrollTop },
        last: last.toJSON()
      };
    });
    expect(stickyGeometry.last.top, `${project.name}: last chapter remains inside the viewport at the end of its scroll range`).toBeGreaterThanOrEqual(0);
    expect(stickyGeometry.last.bottom, `${project.name}: sticky confirmation action does not cover the last chapter at the end of its scroll range`).toBeLessThanOrEqual(stickyGeometry.action.top + 1);

    const chapterTitles = page.locator(".chapter-confirm-directory .toc-entry-title");
    const topLevelChapterTitles = page.locator(".chapter-confirm-directory .toc-directory > .toc-node > .toc-entry > .toc-entry-title");
    const nestedChapterTitleText = (await nestedChapterTitle.locator("strong").textContent())?.trim() ?? "";
    const primaryChapterTitleText = (await chapterTitles.first().locator("strong").textContent())?.trim() ?? "";
    const deletedChapterTitleText = (await topLevelChapterTitles.last().locator("strong").textContent())?.trim() ?? "";
    expect(nestedChapterTitleText, `${project.name}: nested chapter has a semantic title`).not.toBe("");
    expect(primaryChapterTitleText, `${project.name}: primary chapter has a semantic title`).not.toBe("");
    expect(deletedChapterTitleText, `${project.name}: deletion target has a semantic title`).not.toBe("");

    if (expectedNavigationMode(project.initialViewport) === "rail") {
      await nestedChapterTitle.click();
      await expect(nestedChapterTitle, `${project.name}: iPad chapter title selects the detail target`).toHaveAttribute("aria-current", "true");
      await expect(page.locator(".chapter-detail-heading h3"), `${project.name}: iPad detail panel follows title selection`).toHaveText(nestedChapterTitleText);
      await chapterTitles.first().click();
      const sourceTitleInput = page.locator(".chapter-detail-form input").first();
      await sourceTitleInput.fill(stageFourDraftTitle);
      await chapterTitles.nth(1).click();
      await chapterTitles.first().click();
      await expect(sourceTitleInput, `${project.name}: iPad preserves the local chapter draft after switching`).toHaveValue(stageFourDraftTitle);
      await page.locator(".chapter-detail-form button[type='submit']").click();

      const deleteChapterTitle = topLevelChapterTitles.last();
      await expect(deleteChapterTitle.locator("strong")).toHaveText(deletedChapterTitleText);
      await deleteChapterTitle.click();
      await expect(deleteChapterTitle, `${project.name}: iPad title selection remains separate from the edit form action`).toHaveAttribute("aria-current", "true");
      await page.locator(".chapter-detail-form > .button-danger").click();
      await page.locator(".chapter-detail-form .chapter-delete-confirm .button-danger").click();
    } else {
      const editorSheet = page.locator(".sheet[data-sheet-type='editChapter']");
      await nestedChapterTitle.click();
      await expect(editorSheet, `${project.name}: phone chapter title selects a chapter and opens its editor`).toBeVisible();
      await expect(editorSheet.locator("input").first(), `${project.name}: phone title selection opens the selected chapter`).toHaveValue(nestedChapterTitleText);
      await page.keyboard.press("Escape");
      await expect(editorSheet, `${project.name}: phone title selection can return to the directory`).toHaveCount(0);

      const primaryEditButton = page.getByRole("button", { name: `编辑 ${primaryChapterTitleText}`, exact: true });
      await primaryEditButton.click();
      await expect(editorSheet, `${project.name}: phone keeps the chapter editor in a bottom sheet`).toBeVisible();
      await editorSheet.locator("input").first().fill(stageFourDraftTitle);
      await editorSheet.locator("button[type='submit']").click();
      await expect(editorSheet, `${project.name}: saved phone editor exits before the next directory action`).toHaveCount(0);

      const deleteEditButton = page.locator(".chapter-confirm-directory .toc-directory > .toc-node > .toc-entry > .toc-edit-button").last();
      await expect(deleteEditButton).toHaveAccessibleName(`编辑 ${deletedChapterTitleText}`);
      await deleteEditButton.click();
      await editorSheet.locator(".button-danger").click();
      await editorSheet.locator(".chapter-delete-confirm .button-danger").click();
    }

    const remainingChapterCount = await page.locator(".chapter-confirm-directory .toc-entry-title").count();
    await page.locator(".chapter-confirm-actions .button").click();
    await expect(page.locator(".course-ready-screen")).toBeVisible();
    await expect(page.locator(".course-ready-screen h1")).toHaveText("生成成功");
    if (project.name === "ipad-pro-11-landscape") {
      for (const viewport of [project.initialViewport, project.pairedViewport]) {
        await page.setViewportSize(viewport);
        await expectCenteredFlowTransitionGeometry(page, `${project.name} ${viewport.width}x${viewport.height}: CourseReady`);
      }
    }
    await expect(page.locator(".course-ready-support .metric-card").first(), `${project.name}: course ready state reflects the confirmed chapter count`).toContainText(`${remainingChapterCount} 个目录项完成编排`);
    await expectNoHorizontalOverflow(page, `${project.name}: course ready state`);

    const appOrigin = new URL(page.url()).origin;
    const forbiddenRequests = observedRequests.filter((requestUrl) => {
      const url = new URL(requestUrl);
      return url.origin !== appOrigin || url.pathname.startsWith("/api/");
    });
    expect(forbiddenRequests, `${project.name}: production repository flow has no HTTP API dependency`).toEqual([]);
  });

  test("lays out the Stage 5 home and library grid while loading, truncating, and deleting real courses", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await loadProductionCourse(page, "course-loading");
    await expect(page.locator(".home-book-carousel-skeleton"), `${project.name}: production Home exposes its course-loading skeleton`).toBeVisible();
    await expect(page.locator(".home-book-carousel-skeleton"), `${project.name}: course-loading skeleton remains busy`).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".home-book-workspace.is-loading"), `${project.name}: selected-book workspace preserves loading geometry`).toBeVisible();
    await expectNoHorizontalOverflow(page, `${project.name}: production Home loading state`);

    await loadStageFiveCourse(page, bookCourseApi);
    await expectStageFiveHomeLayout(page, project.initialViewport, `${project.name}: Stage 5 home`);

    await clickSettledScreenTarget(page, page.locator(".home-book-picker-heading button"), `${project.name}: open production library`);
    await expectStageFiveLibraryLayout(page, project.initialViewport, `${project.name}: Stage 5 library`);

    const longCourseCard = page.locator(".library-course-grid .course-space-card").filter({ hasText: stageFiveLongCourseTitle });
    await clickSettledScreenTarget(page, longCourseCard.locator(".course-card-edit"), `${project.name}: long-course edit`);
    const deleteButton = longCourseCard.locator(".course-card-menu .danger");
    await expect(deleteButton, `${project.name}: course edit action opens its menu`).toBeVisible();
    await deleteButton.click();
    await expect(deleteButton, `${project.name}: delete requires explicit confirmation`).toHaveClass(/confirm/);
    await deleteButton.click();
    await expect(longCourseCard, `${project.name}: confirmed deletion removes the long-title course`).toHaveCount(0);
    await expect(page.locator(".library-course-grid .course-space-card"), `${project.name}: library remains loaded after deletion`).toHaveCount(2);

    await page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true }).click();
    await expect(page.locator(".book-course-screen"), `${project.name}: library entry loads the course overview`).toBeVisible();
    expect(bookCourseApi.unhandledRequests, `${project.name}: Stage 5 home and library calls stay locally covered`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: Stage 5 home and library use no external network`).toEqual([]);
  });

  test("presents the Stage 5 course overview and every lesson learning entry", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStageFiveCourse(page, bookCourseApi);

    if (project.name === "ipad-pro-11-landscape") {
      for (const viewport of [project.initialViewport, project.pairedViewport]) {
        await page.setViewportSize(viewport);
        await expectBookCourseTransitionGeometry(page, `${project.name} ${viewport.width}x${viewport.height}: BookCourse`);
      }
      await page.setViewportSize(project.initialViewport);
    }

    const overview = await page.evaluate(() => {
      const bookBar = document.querySelector<HTMLElement>(".study-book-bar");
      const plan = document.querySelector<HTMLElement>(".study-plan-summary");
      const directory = document.querySelector<HTMLElement>(".study-directory");
      if (!bookBar || !plan || !directory) throw new Error("Production Study overview elements are missing");
      return {
        bookBarPosition: getComputedStyle(bookBar).position,
        directory: directory.getBoundingClientRect().toJSON(),
        plan: plan.getBoundingClientRect().toJSON(),
        planPosition: getComputedStyle(plan).position
      };
    });
    if (expectedNavigationMode(project.initialViewport) === "rail") {
      expect(overview.directory.left, `${project.name}: iPad keeps the original-book directory beside today's plan`).toBeGreaterThanOrEqual(overview.plan.right - 1);
      expect(overview.planPosition, `${project.name}: iPad keeps today's plan available while the directory scrolls`).toBe("sticky");
    } else {
      expect(overview.directory.top, `${project.name}: phone keeps the original-book directory after today's plan`).toBeGreaterThanOrEqual(overview.plan.bottom - 1);
      expect(overview.planPosition, `${project.name}: phone keeps today's plan in the normal reading flow`).not.toBe("sticky");
    }
    expect(overview.bookBarPosition, `${project.name}: current-book switcher remains sticky`).toBe("sticky");
    await expect(page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"), `${project.name}: expanded section exposes its primary learning entry`).toBeVisible();
    await expect(page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-tool-card"), `${project.name}: expanded section exposes assignment, flashcard, and future tools`).toHaveCount(3);

    await clickSettledScreenTarget(page, page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"), `${project.name}: course lesson entry`);
    await expectStageFiveLessonLayout(page, project.initialViewport, `${project.name}: Stage 5 lesson`);
    await expect(page.locator(".citation-card"), `${project.name}: lesson presents the source illustration`).toBeVisible();
    await expect(page.locator(".lesson-learning-tools > .button").first(), `${project.name}: lesson exposes a citation tool`).toBeVisible();
    await expect(page.locator(".lesson-action-grid .button"), `${project.name}: lesson exposes AI, flashcard, and exercise tools`).toHaveCount(3);
    await expect(page.locator(".lesson-bottom-actions .button"), `${project.name}: lesson exposes its course and completion actions`).toHaveCount(2);
    await expect(page.locator(".ai-explain-card").last().getByRole("button"), `${project.name}: lesson keeps its AI illustration entry available`).toBeVisible();

    const chatTrigger = page.locator(".lesson-action-grid .button").first();
    await chatTrigger.focus();
    await chatTrigger.click();
    await expectDialogSemanticsAndFocusTrap(page, "问 AI", chatTrigger);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 5 course and lesson`);
  });

  test("keeps Stage 5 source page switching and back navigation on the source-reader path", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStageFiveLesson(page, bookCourseApi);
    await openStageFiveSourceReader(page, `${project.name}: lesson citation opens the source reader`);
    await expectStageFiveSourceReaderLayout(page, project.initialViewport, `${project.name}: Stage 5 source reader`);

    const pageLabel = page.locator(".source-reader-toolbar strong");
    await expect(pageLabel, `${project.name}: source reader starts at the cited page`).toContainText("1");
    await clickSettledScreenTarget(page, page.locator(".source-reader-toolbar button").last(), `${project.name}: source reader next-page action`);
    await expect(pageLabel, `${project.name}: next-page action changes the displayed page`).toContainText("2");
    await clickSettledScreenTarget(page, page.locator(".source-reader-actions .button").first(), `${project.name}: source reader citation return`);
    await expect(pageLabel, `${project.name}: citation return action restores the cited page`).toContainText("1");
    await clickSettledScreenTarget(page, page.locator(".source-reader-actions .button").nth(1), `${project.name}: source reader lesson return`);
    await expect(page.locator(".lesson-layout"), `${project.name}: source-reader back returns to the lesson`).toBeVisible();
    expect(bookCourseApi.unhandledRequests, `${project.name}: source reader page actions stay locally covered`).toEqual([]);
  });

  test("recovers Stage 5 source-reader media from a failed cited page to the next successful page", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStageFiveLesson(page, bookCourseApi, { imageMode: "mixed" });
    await clickSettledScreenTarget(
      page,
      page.locator(".citation-card .inline-link"),
      `${project.name}: mixed repository citation opens its exact source page`
    );
    await expect(page.locator(".source-reader-screen"), `${project.name}: mixed repository opens the production source reader`).toBeVisible();

    const pageLabel = page.locator(".source-reader-toolbar strong");
    const fallback = page.locator(".source-page-fallback");
    await expect(pageLabel, `${project.name}: mixed repository starts from the failed cited page`).toContainText("11");
    await expect(fallback, `${project.name}: failed first source page renders its stable fallback`).toBeVisible();
    await expect(fallback, `${project.name}: failed page exposes the exact repository page-image source`).toHaveAttribute("data-motion-image-source", "/assets/textbook/__missing-production-1.webp");
    const fallbackBounds = await fallback.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(fallbackBounds.width / fallbackBounds.height, `${project.name}: failed first page preserves the document ratio`).toBeCloseTo(0.75, 1);

    await clickSettledScreenTarget(page, page.locator(".source-reader-toolbar button").last(), `${project.name}: mixed source reader next-page action`);
    await expect(pageLabel, `${project.name}: next page updates the source-reader page label`).toContainText("12");
    const pageImage = page.locator(".source-page-media img");
    await expect(pageImage, `${project.name}: successful second source page replaces the first-page fallback`).toBeVisible();
    await expect(pageImage, `${project.name}: successful second page uses its own repository source URL`).toHaveAttribute("src", "/assets/textbook/biology-lesson-meiosis-2.webp");
    await expect.poll(() => pageImage.evaluate((image) => image.naturalWidth), `${project.name}: successful second source page decodes its image`).toBeGreaterThan(0);
    await expect(fallback, `${project.name}: failed first-page state does not leak into page two`).toHaveCount(0);

    await page.setViewportSize(project.pairedViewport);
    await expectStageFiveSourceReaderLayout(page, project.pairedViewport, `${project.name}: mixed source reader paired viewport`);
    await expect(pageLabel, `${project.name}: paired viewport preserves the current successful page`).toContainText("12");
    await expect(pageImage, `${project.name}: paired viewport retains the successful page image`).toBeVisible();

    await clickSettledScreenTarget(page, page.locator(".source-reader-actions .button").nth(1), `${project.name}: mixed source reader lesson return`);
    await expect(page.locator(".lesson-layout"), `${project.name}: source-reader return path remains connected after mixed page recovery`).toBeVisible();
    expect(bookCourseApi.unhandledRequests, `${project.name}: mixed source pages have no legacy HTTP fixture dependency`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: mixed source pages use no external network`).toEqual([]);
  });

  test("keeps Stage 5 image fallback geometry stable when covers and source images fail", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.route("**/assets/textbook/biology-chapter-2-open.webp", (route) => route.abort("failed"));
    await openStageFiveLibrary(page, bookCourseApi, { imageMode: "failure" });
    const courseFallback = page.locator(".course-cover-fallback").first();
    await expect(courseFallback, `${project.name}: failed course cover uses a stable fallback`).toBeVisible();
    const courseFallbackBounds = await courseFallback.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(courseFallbackBounds.width / courseFallbackBounds.height, `${project.name}: course fallback keeps its cover aspect ratio`).toBeCloseTo(0.75, 1);

    await clickSettledScreenTarget(
      page,
      page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true }),
      `${project.name}: failed-cover course entry`
    );
    await expect(page.locator(".study-screen"), `${project.name}: failed-cover course still opens its production Study page`).toBeVisible();
    const chapterToggles = page.locator(".study-chapter-toggle");
    await expect(chapterToggles, `${project.name}: production Study exposes the repository chapter tree`).toHaveCount(7);
    await clickSettledScreenTarget(page, chapterToggles.nth(1), `${project.name}: open the chapter that owns extracted assets`);
    await clickSettledScreenTarget(
      page,
      page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"),
      `${project.name}: failed-cover lesson entry`
    );
    const citationFallback = page.locator(".citation-media-fallback");
    await expect(citationFallback, `${project.name}: failed lesson illustration keeps its fallback`).toBeVisible();
    const citationFallbackBounds = await citationFallback.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(citationFallbackBounds.width / citationFallbackBounds.height, `${project.name}: illustration fallback keeps its aspect ratio`).toBeCloseTo(0.75, 1);

    await clickSettledScreenTarget(page, page.locator(".citation-card .inline-link"), `${project.name}: failed-cover exact source-page entry`);
    await expect(page.locator(".source-reader-screen"), `${project.name}: failed-cover source reader entry`).toBeVisible();
    const sourceFallback = page.locator(".source-page-fallback");
    await expect(sourceFallback, `${project.name}: failed source page keeps its canvas fallback`).toBeVisible();
    const sourceFallbackBounds = await sourceFallback.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(sourceFallbackBounds.width / sourceFallbackBounds.height, `${project.name}: source fallback keeps its document aspect ratio`).toBeCloseTo(0.75, 1);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 5 image fallbacks`);
    expect(bookCourseApi.unhandledRequests, `${project.name}: image failures still use local fixture responses`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: image failures use no external network`).toEqual([]);
  });

  test("keeps the Stage 5 lesson toolbar reachable without covering content across short landscape and visual viewports", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    if (project.name === "ipad-pro-11") await installVisualViewportShim(page);
    await openStageFiveLesson(page, bookCourseApi);
    const tools = page.locator(".lesson-learning-tools");
    await tools.scrollIntoViewIfNeeded();
    await expect(tools, `${project.name}: learning tools remain reachable`).toBeVisible();

    if (expectedNavigationMode(project.initialViewport) !== "rail") {
      await expectStageFiveLessonLayout(page, project.initialViewport, `${project.name}: sequential short/mobile lesson`);
      return;
    }

    const lastReadingCard = page.locator(".lesson-reading-column > *").last();
    await lastReadingCard.scrollIntoViewIfNeeded();
    await expect(lastReadingCard, `${project.name}: sticky tools do not prevent reaching the last lesson content`).toBeVisible();

    if (project.name === "ipad-pro-11") {
      const headerBounds = await page.locator(".header-bar").evaluate((element) => element.getBoundingClientRect().toJSON());
      await expect(page.getByRole("navigation", { name: "主导航" }), `${project.name}: lesson retains the established hideNav behavior`).toHaveCount(0);
      await setVisualViewport(page, { height: 760, offsetTop: 0 });
      await expectElementsInsideVisualViewport(page, [".lesson-learning-tools"], `${project.name}: Stage 5 sticky learning tools`);
      expect(await page.locator(".header-bar").evaluate((element) => element.getBoundingClientRect().toJSON()), `${project.name}: visualViewport keeps the lesson header stable`).toEqual(headerBounds);
      await setVisualViewport(page, { height: 1194, offsetTop: 0 });
      await expectElementsInsideVisualViewport(page, [".lesson-learning-tools"], `${project.name}: Stage 5 restored sticky learning tools`);
      await expect(page.getByRole("navigation", { name: "主导航" }), `${project.name}: restored lesson still retains hideNav behavior`).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 5 sticky lesson tools`);
  });

  test("keeps the Stage 5 lesson flashcard, exercise, and completion destinations connected", async ({ page, bookCourseApi }) => {
    await openStageFiveLesson(page, bookCourseApi);
    await clickSettledScreenTarget(page, page.locator(".lesson-action-grid .button").nth(1), "Stage 5 flashcard action");
    await expect(page.locator(".flashcard-screen"), "Stage 5 flashcard tool retains its existing destination").toBeVisible();

    await openStageFiveLesson(page, bookCourseApi);
    await clickSettledScreenTarget(page, page.locator(".lesson-action-grid .button").nth(2), "Stage 5 exercise action");
    await expect(page.getByRole("heading", { name: "本节理解诊断", exact: true }), "Stage 5 exercise tool retains its existing destination").toBeVisible();

    await openStageFiveLesson(page, bookCourseApi);
    await clickSettledScreenTarget(page, page.locator(".lesson-bottom-actions .button").nth(1), "Stage 5 completion action");
    await expect(page.locator(".report-screen"), "Stage 5 completion tool retains its existing destination").toBeVisible();
    expect(bookCourseApi.unhandledRequests, "Stage 5 retained destinations remain locally covered before their existing screens render").toEqual([]);
  });

  test("lays out Stage 6 study plans and flashcards while preserving day selection, task updates, and card flips", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStageSixBook(page, bookCourseApi, { taskMode: "sparse" });

    await openStageSixPlan(page, `${project.name}: Stage 6 study plan opens from the real course action`);
    await expectStageSixPlanLayout(page, project.initialViewport, `${project.name}: Stage 6 initial study plan`);

    const days = page.locator(".study-plan-calendar .plan-date-row button");
    await expectStageSixFocusVisible(days.first(), `${project.name}: Stage 6 calendar control`);
    await exerciseStageSixSparsePlanDays(page, `${project.name}: Stage 6 initial sparse plan`);

    await clickSettledScreenTarget(page, days.first(), `${project.name}: Stage 6 first sparse-plan day selection`);
    await expect(days.first(), `${project.name}: Stage 6 first sparse-plan day becomes selected`).toHaveAttribute("aria-pressed", "true");
    const task = page.locator(".study-plan-tasks .timeline-item").first();
    await task.click();
    await expect(task, `${project.name}: plan task retains its completed state after the existing PATCH action`).toHaveClass(/done/);
    await expect.poll(
      () => page.evaluate(() => window.__productionRepositoryHarness?.getCallCount("patchStudyTask:task_01") ?? 0),
      `${project.name}: plan update crosses the production repository boundary`
    ).toBeGreaterThan(0);

    await page.setViewportSize(project.pairedViewport);
    await expectStageSixPlanLayout(page, project.pairedViewport, `${project.name}: Stage 6 paired study plan`);
    await exerciseStageSixSparsePlanDays(page, `${project.name}: Stage 6 paired sparse plan`);

    await clickSettledScreenTarget(
      page,
      page.locator(".header-bar .icon-button"),
      `${project.name}: plan back action remains actionable after the paired viewport change`
    );
    const returnedCourse = page.locator(".book-course-screen");
    await expect(returnedCourse, `${project.name}: plan back path returns to one current course root`).toHaveCount(1);
    await expect(returnedCourse, `${project.name}: plan back path returns to the course`).toBeVisible();
    await clickSettledScreenTarget(
      page,
      returnedCourse.locator(".study-chapter-toggle").nth(1),
      `${project.name}: returned Study opens the chapter that owns generated flashcards`
    );
    await clickSettledScreenTarget(
      page,
      returnedCourse.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"),
      `${project.name}: returned course lesson action remains current, uncovered, and actionable`
    );
    await expect(page.locator(".lesson-layout"), `${project.name}: lesson remains reachable after plan update`).toBeVisible();
    await clickSettledScreenTarget(
      page,
      page.locator(".lesson-layout .lesson-action-grid .button").nth(1),
      `${project.name}: returned lesson flashcard action remains current, uncovered, and actionable`
    );
    await expect(page.locator(".flashcard-screen"), `${project.name}: flashcard destination remains connected`).toBeVisible();
    await expectStageSixFlashcardLayout(page, project.pairedViewport, `${project.name}: Stage 6 paired flashcard`);
    const flashcardSourceLink = await expectStageSixVisibleInlineLinkAudit(page, ".flashcard-screen", `${project.name}: Stage 6 flashcard source`);
    await flashcardSourceLink.press("Enter");
    await expect(page.locator(".source-reader-screen"), `${project.name}: flashcard source link keeps its source-reader destination`).toBeVisible();
    await page.locator(".source-reader-actions .button").nth(1).click();
    await expect(page.locator(".flashcard-screen"), `${project.name}: flashcard source back path returns to the card`).toBeVisible();

    const card = page.locator(".memory-card");
    const visibleFace = card.locator(".memory-card-answer-face[aria-hidden='false']");
    const front = await visibleFace.locator("h2").textContent();
    await page.locator(".memory-reveal").click();
    await expect(card, `${project.name}: flashcard reveal keeps the existing flip state`).toHaveClass(/revealed/);
    await expect(card.locator(".memory-card-answer-face[aria-hidden='false'] h2"), `${project.name}: flip replaces the card face rather than navigating away`).not.toHaveText(front ?? "");

    expect(bookCourseApi.unhandledRequests, `${project.name}: Stage 6 plan and flashcard calls are locally covered`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: Stage 6 plan and flashcard actions use no external network`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${project.name}: Stage 6 plan and flashcard actions emit no console errors`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${project.name}: Stage 6 plan and flashcard actions emit no page errors`).toEqual([]);
  });

  test("normalizes malformed Stage 6 plan day counts without unbounded calendars or broken task updates", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);

    for (const scenario of stageSixPlanDayNormalizationCases) {
      await openStageSixBook(page, bookCourseApi, { studyPlanDays: scenario.value, taskMode: "out_of_range" });
      await openStageSixPlan(page, `${project.name}: ${scenario.label} plan opens without an error boundary`);

      const days = page.locator(".study-plan-calendar .plan-date-row button");
      const emptyState = page.locator(".study-plan-tasks .study-plan-empty-state");
      await expect(days, `${project.name}: ${scenario.label} is normalized to its bounded calendar length`).toHaveCount(scenario.expectedDays);
      await expect(days.first(), `${project.name}: out-of-range fixture task cannot select a non-renderable initial day`).toHaveAttribute("aria-pressed", "true");
      await expect(days.last(), `${project.name}: normalized final day remains enabled`).toBeEnabled();
      await clickSettledScreenTarget(page, days.last(), `${project.name}: normalized final day selection`);
      await expect(days.last(), `${project.name}: normalized final day remains selectable`).toHaveAttribute("aria-pressed", "true");
      await expect(emptyState, `${project.name}: normalized final day exposes the empty task state`).toBeVisible();
      await expect(emptyState, `${project.name}: empty task state identifies the selected normalized day`).toContainText(`第 ${scenario.expectedDays} 天`);
      await expect(page.locator(".error-boundary"), `${project.name}: malformed runtime data never reaches the page error boundary`).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `${project.name}: ${scenario.label} plan remains bounded without horizontal overflow`);
    }

    await openStageSixBook(page, bookCourseApi, { taskMode: "sparse" });
    await openStageSixPlan(page, `${project.name}: normal plan opens after malformed-plan cases`);
    const normalTask = page.locator(".study-plan-tasks .timeline-item").first();
    await normalTask.click();
    await expect(normalTask, `${project.name}: normal sparse-plan task PATCH remains connected after malformed-plan cases`).toHaveClass(/done/);
    await expect.poll(
      () => page.evaluate(() => window.__productionRepositoryHarness?.getCallCount("patchStudyTask:task_01") ?? 0),
      `${project.name}: normal task update still crosses the production repository boundary`
    ).toBeGreaterThan(0);

    expect(bookCourseApi.unhandledRequests, `${project.name}: malformed plan cases remain fully covered by local fixtures`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: malformed plan cases make no external requests`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${project.name}: malformed plan cases emit no console errors`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${project.name}: malformed plan cases emit no page errors`).toEqual([]);
  });

  test("keeps the Stage 6 assignment input and diagnosis path usable through short keyboards and responsive columns", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    if (project.name === "ipad-pro-11") await installVisualViewportShim(page);
    await openStageSixLesson(page, bookCourseApi);

    await page.locator(".lesson-action-grid .button").nth(2).click();
    await expect(page.locator(".assignment-screen"), `${project.name}: assignment opens from the lesson tool`).toBeVisible();
    await expectStageSixAssignmentLayout(page, project.initialViewport, `${project.name}: Stage 6 initial assignment`);
    const assignmentCitationLink = page.locator(".assignment-source-button");
    await expect(assignmentCitationLink, `${project.name}: Stage 6 assignment citation is visible`).toBeVisible();
    await assignmentCitationLink.press("Enter");
    await expect(page.locator(".source-reader-screen"), `${project.name}: assignment citation keeps its source-reader destination`).toBeVisible();
    await clickSettledScreenTarget(page, page.locator(".source-reader-actions .button").nth(1), `${project.name}: assignment citation back action`);
    await expect(page.locator(".assignment-screen"), `${project.name}: assignment citation back path returns to the answer`).toBeVisible();
    await advanceStageSixAssignmentToShortAnswer(page, `${project.name}: Stage 6 automatic exercise order`);

    const textarea = page.locator(".assignment-card textarea");
    const submit = page.locator(".assignment-primary-action .button");
    await textarea.fill("Stage 6 fixture answer explains the cited evidence before reaching a conclusion.");
    await expect(textarea, `${project.name}: typed assignment content remains in the input`).toHaveValue(/Stage 6 fixture answer/);
    await expectStageSixFocusVisible(textarea, `${project.name}: Stage 6 assignment input`);
    if (project.name === "iphone-17-pro") {
      await page.setViewportSize({ width: 402, height: 430 });
      await textarea.focus();
      await textarea.scrollIntoViewIfNeeded();
      await expectElementsInsideVisualViewport(page, [".assignment-card textarea", ".assignment-primary-action .button"], `${project.name}: iPhone keyboard assignment controls`);
      await expectNoHorizontalOverflow(page, `${project.name}: iPhone keyboard assignment`);
      await page.setViewportSize(project.initialViewport);
    } else if (project.name === "ipad-pro-11") {
      await setVisualViewport(page, { height: 760, offsetTop: 0 });
      await textarea.focus();
      await textarea.scrollIntoViewIfNeeded();
      await expectElementsInsideVisualViewport(page, [".assignment-card textarea", ".assignment-primary-action .button"], `${project.name}: iPad keyboard assignment controls`);
      await setVisualViewport(page, { height: 1194, offsetTop: 0 });
    } else {
      await textarea.focus();
      await textarea.scrollIntoViewIfNeeded();
      await expectElementsInsideVisualViewport(page, [".assignment-card textarea", ".assignment-primary-action .button"], `${project.name}: short/mobile assignment controls`);
    }

    await submit.click();
    await expect(page.locator(".diagnosis-screen"), `${project.name}: existing assignment submission opens diagnosis`).toBeVisible();
    await expectStageSixDiagnosisLayout(page, project.initialViewport, `${project.name}: Stage 6 diagnosis`);
    const diagnosisCitationLink = await expectStageSixVisibleInlineLinkAudit(page, ".diagnosis-screen", `${project.name}: Stage 6 diagnosis citation`);
    await diagnosisCitationLink.press("Enter");
    await expect(page.locator(".source-reader-screen"), `${project.name}: diagnosis citation keeps its source-reader destination`).toBeVisible();
    await clickSettledScreenTarget(page, page.locator(".source-reader-actions .button").nth(1), `${project.name}: diagnosis citation back action`);
    await expect(page.locator(".diagnosis-screen"), `${project.name}: diagnosis citation back path returns to the result`).toBeVisible();
    await expect.poll(
      () => page.evaluate(() => ({
        diagnose: window.__productionRepositoryHarness?.getCallCount("diagnoseAssignment:assignment_c2s1") ?? 0,
        submit: window.__productionRepositoryHarness?.getCallCount("submitAssignment:assignment_c2s1") ?? 0
      })),
      `${project.name}: submit and diagnose cross the production repository boundary once each`
    ).toEqual({ diagnose: 1, submit: 1 });

    await page.setViewportSize(project.pairedViewport);
    await expectStageSixDiagnosisLayout(page, project.pairedViewport, `${project.name}: Stage 6 paired diagnosis`);
    await page.locator(".diagnosis-actions .button").nth(2).click();
    await expect(page.locator(".mistake-book-screen"), `${project.name}: diagnosis keeps its mistake-book destination`).toBeVisible();
    await expect(page.locator(".mistake-detail-card"), `${project.name}: submitted diagnosis displays the fixture mistake detail`).toBeVisible();
    await page.locator(".filter-pill").nth(1).click();
    await expect(page.locator(".filter-pill").nth(1), `${project.name}: mistake filter retains its active interaction`).toHaveClass(/active/);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 mistake detail`);

    expect(bookCourseApi.unhandledRequests, `${project.name}: Stage 6 assignment, diagnosis, and mistake calls are locally covered`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: Stage 6 assignment, diagnosis, and mistake flow uses no external network`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${project.name}: Stage 6 assignment path emits no console errors`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${project.name}: Stage 6 assignment path emits no page errors`).toEqual([]);
  });

  test("lays out Stage 6 notes, report, profile, community, and export surfaces without stretching", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStageSixBook(page, bookCourseApi);

    await clickSettledScreenTarget(
      page,
      page.locator(".primary-nav .nav-item").nth(3),
      `${project.name}: production primary navigation opens Profile`
    );
    await expect(page.locator(".profile-screen"), `${project.name}: profile remains reachable through primary navigation`).toBeVisible();
    await clickSettledScreenTarget(
      page,
      page.locator(".profile-settings-list .settings-row").nth(2),
      `${project.name}: profile export record opens the production Notes surface`
    );
    await expect(page.locator(".notes-screen"), `${project.name}: notes opens from the course tool`).toBeVisible();
    await expectStageSixTwoColumnLayout(page, project.initialViewport, ".notes-list", ".notes-detail-panel", `${project.name}: Stage 6 notes`, { phoneFirstBefore: false });
    await expect(page.locator(".notes-list .note-card"), `${project.name}: notes retain every production chunk-derived entry`).toHaveCount(6);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 notes`);

    await clickSettledScreenTarget(
      page,
      page.locator(".notes-actions .button").nth(1),
      `${project.name}: Notes export action`
    );
    await expect(page.locator(".export-preview-screen"), `${project.name}: export remains available from notes`).toBeVisible();
    await expectStageSixTwoColumnLayout(page, project.initialViewport, ".export-module-list", ".export-intro-card", `${project.name}: Stage 6 export`, { phoneFirstBefore: false });
    const exportChecks = page.locator(".export-module-list input[type=checkbox]");
    await expect(exportChecks, `${project.name}: export modules retain their existing selectable controls`).toHaveCount(7);
    await clickSettledScreenTarget(
      page,
      page.locator(".export-actions .button"),
      `${project.name}: export confirmation action`
    );
    await expect(page.getByRole("status"), `${project.name}: export preserves its mock confirmation toast`).toBeVisible();
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 export`);

    await clickSettledScreenTarget(page, page.locator(".header-bar .icon-button"), `${project.name}: export back to Notes`);
    await clickSettledScreenTarget(page, page.locator(".header-bar .icon-button"), `${project.name}: Notes back to Profile`);
    await expect(page.locator(".profile-screen"), `${project.name}: export and notes back paths return to Profile`).toBeVisible();
    await clickSettledScreenTarget(
      page,
      page.locator(".primary-nav .nav-item").nth(2),
      `${project.name}: production primary navigation returns to Study`
    );
    await expect(page.locator(".book-course-screen"), `${project.name}: Study remains reachable after Notes and export`).toBeVisible();
    await clickSettledScreenTarget(
      page,
      page.locator(".study-chapter.is-expanded .study-section.is-expanded .study-enter-button"),
      `${project.name}: Study lesson entry remains actionable after Notes and export`
    );
    await clickSettledScreenTarget(
      page,
      page.locator(".lesson-bottom-actions .button").nth(1),
      `${project.name}: lesson completion opens its report`
    );
    await expect(page.locator(".report-screen"), `${project.name}: lesson completion opens its report`).toBeVisible();
    await expectStageSixTwoColumnLayout(page, project.initialViewport, ".report-summary-column", ".report-guidance-column", `${project.name}: Stage 6 report`);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 report`);
    const reportDetailLink = await expectStageSixVisibleInlineLinkAudit(page, ".report-screen", `${project.name}: Stage 6 report detail`);
    await reportDetailLink.press("Enter");
    await expect(page.locator(".notes-screen"), `${project.name}: report detail link keeps its notes destination`).toBeVisible();
    await clickSettledScreenTarget(page, page.locator(".header-bar .icon-button"), `${project.name}: report detail back to report`);
    await expect(page.locator(".report-screen"), `${project.name}: report detail back path returns to the report`).toBeVisible();

    await clickSettledScreenTarget(page, page.locator(".header-bar .icon-button"), `${project.name}: report back to lesson`);
    await clickSettledScreenTarget(page, page.locator(".header-bar .icon-button"), `${project.name}: lesson back to Study`);
    await expect(page.locator(".book-course-screen"), `${project.name}: report back path returns to the course`).toBeVisible();
    await clickSettledScreenTarget(page, page.locator(".primary-nav .nav-item").nth(3), `${project.name}: Study navigation opens Profile`);
    await expect(page.locator(".profile-screen"), `${project.name}: profile remains reachable through primary navigation`).toBeVisible();
    await expectStageSixTwoColumnLayout(page, project.initialViewport, ".profile-summary-column", ".profile-settings-list", `${project.name}: Stage 6 profile`);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 profile`);

    await clickSettledScreenTarget(page, page.locator(".primary-nav .nav-item").nth(1), `${project.name}: Profile navigation opens Community`);
    await expect(page.locator(".community-screen"), `${project.name}: community remains reachable through primary navigation`).toBeVisible();
    await page.getByLabel("搜索课程", { exact: true }).fill("课");
    await expectStageSixCommunityGrid(page, project.initialViewport, `${project.name}: Stage 6 community`);
    await clickSettledScreenTarget(page, page.locator(".community-book-card").first(), `${project.name}: first community book card`);
    await expect(page.locator(".community-detail-screen"), `${project.name}: community book opens from its card`).toBeVisible();
    await expectStageSixTwoColumnLayout(page, project.initialViewport, ".community-detail-card", ".community-detail-workspace .section", `${project.name}: Stage 6 community detail`);
    await clickSettledScreenTarget(page, page.locator(".community-detail-actions .button").first(), `${project.name}: community import action`);
    await expect(page.locator(".community-import-screen"), `${project.name}: community import retains its mock success path`).toBeVisible();
    await expectStageSixTwoColumnLayout(page, project.initialViewport, ".community-import-success", ".import-progress-card", `${project.name}: Stage 6 community import`);
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 community detail and import`);

    await page.setViewportSize(project.pairedViewport);
    await expectStageSixTwoColumnLayout(page, project.pairedViewport, ".community-import-success", ".import-progress-card", `${project.name}: Stage 6 paired community import`);
    expect(bookCourseApi.unhandledRequests, `${project.name}: Stage 6 remaining-page calls are locally covered`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: Stage 6 remaining pages use no external network`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${project.name}: Stage 6 remaining pages emit no console errors`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${project.name}: Stage 6 remaining pages emit no page errors`).toEqual([]);
  });

  test("checks Stage 6 empty, loading, and error states with local fixtures", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await loadProductionCourse(page, "empty");
    await clickSettledScreenTarget(page, page.locator(".primary-nav .nav-item").nth(3), `${project.name}: empty repository opens Profile`);
    await clickSettledScreenTarget(
      page,
      page.locator(".profile-settings-list .settings-row").nth(2),
      `${project.name}: empty repository opens Notes`
    );
    await expect(page.locator(".notes-screen .parse-empty-card"), `${project.name}: notes keeps its no-course empty state`).toBeVisible();
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 empty state`);

    await loadStageSixCourse(page, bookCourseApi, { mistakeMode: "loading" });
    await clickSettledScreenTarget(
      page,
      page.locator('[data-home-global-action="mistakes"]'),
      `${project.name}: Home opens the loading MistakeBook scenario`
    );
    await expect(page.locator(".mistake-state-card h3"), `${project.name}: mistake loading state remains visible while its fixture is pending`).toContainText("正在读取");
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 loading state`);
    await page.evaluate(() => window.__productionRepositoryHarness?.releaseMistakes());
    await expect(page.locator(".mistake-detail-card"), `${project.name}: released mistake fixture renders its detail state`).toBeVisible();

    await loadStageSixCourse(page, bookCourseApi, { mistakeMode: "error" });
    await clickSettledScreenTarget(
      page,
      page.locator('[data-home-global-action="mistakes"]'),
      `${project.name}: Home opens the failing MistakeBook scenario`
    );
    await expect(page.locator(".mistake-state-card h3"), `${project.name}: mistake error state renders its existing error heading`).toContainText("加载失败");
    await expectNoHorizontalOverflow(page, `${project.name}: Stage 6 error state`);

    expect(bookCourseApi.unhandledRequests, `${project.name}: Stage 6 state fixtures cover every local API call`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: Stage 6 state fixtures use no external network`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${project.name}: Stage 6 state fixtures emit no console errors`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${project.name}: Stage 6 state fixtures emit no page errors`).toEqual([]);
  });

  test("keeps Stage 6 calendar and community layouts stable at breakpoint boundaries and short landscape", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStageSixBook(page, bookCourseApi);
    await openStageSixPlan(page, `${project.name}: production Study plan detail entry`);
    for (const viewport of [
      { width: 767, height: 800 },
      { width: 768, height: 800 },
      { width: 1023, height: 800 },
      { width: 1024, height: 800 }
    ]) {
      await page.setViewportSize(viewport);
      await expectStageSixPlanLayout(page, viewport, `${project.name}: Stage 6 ${viewport.width}x${viewport.height} plan boundary`, 14);
    }

    await clickSettledScreenTarget(page, page.locator(".header-bar .icon-button"), `${project.name}: plan boundary back action`);
    await expect(page.locator(".book-course-screen"), `${project.name}: boundary test returns to the course`).toBeVisible();
    await clickSettledScreenTarget(page, page.locator(".primary-nav .nav-item").nth(1), `${project.name}: Study navigation opens Community`);
    await expect(page.locator(".community-screen"), `${project.name}: boundary test opens community`).toBeVisible();
    await page.getByLabel("搜索课程", { exact: true }).fill("课");
    for (const viewport of [
      { width: 767, height: 800 },
      { width: 768, height: 800 },
      { width: 1023, height: 800 },
      { width: 1024, height: 800 },
      { width: 756, height: 352 }
    ]) {
      await page.setViewportSize(viewport);
      await expectNavigationMode(page, viewport, `${project.name}: Stage 6 ${viewport.width}x${viewport.height} community navigation`);
      await expectStageSixCommunityGrid(page, viewport, `${project.name}: Stage 6 ${viewport.width}x${viewport.height} community boundary`);
    }

    expect(bookCourseApi.unhandledRequests, `${project.name}: Stage 6 boundary checks stay within local fixtures`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${project.name}: Stage 6 boundary checks use no external network`).toEqual([]);
  });

  test("keeps the AI orb draggable and snapped to its app-shell edge", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    const viewport = { width: 834, height: 1194 };

    await page.goto("/?embedded=device-preview");
    await page.setViewportSize(viewport);
    const orb = page.getByRole("button", { name: "打开 AI 助手" });
    await expect(orb, `${project.name}: AI orb is available before the drag`).toBeVisible();

    const [orbBounds, shellBounds] = await Promise.all([
      orb.boundingBox(),
      page.locator(".app-shell").boundingBox()
    ]);
    if (!orbBounds || !shellBounds) throw new Error("AI orb or app shell is not measurable");

    // Dispatch the component's pointer sequence directly. WebKit can lose a raw
    // mouse capture when all projects run concurrently, which makes this contract
    // test intermittent without exercising a different product code path.
    await orb.evaluate((element) => {
      Object.defineProperty(element, "setPointerCapture", {
        configurable: true,
        value: () => undefined
      });
      Object.defineProperty(element, "hasPointerCapture", {
        configurable: true,
        value: () => false
      });
    });
    const pointerId = 701;
    const startX = orbBounds.x + (orbBounds.width / 2);
    const startY = orbBounds.y + (orbBounds.height / 2);
    const endX = shellBounds.x + 28;
    const endY = shellBounds.y + 360;
    await orb.dispatchEvent("pointerdown", {
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY,
      pointerId,
      pointerType: "touch"
    });
    await orb.dispatchEvent("pointermove", {
      button: 0,
      buttons: 1,
      clientX: endX,
      clientY: endY,
      pointerId,
      pointerType: "touch"
    });
    await orb.dispatchEvent("pointerup", {
      button: 0,
      buttons: 0,
      clientX: endX,
      clientY: endY,
      pointerId,
      pointerType: "touch"
    });

    await expect(orb, `${project.name}: AI orb snaps to the left app-shell edge`).toHaveCSS("left", "12px");
    await expect(orb, `${project.name}: AI orb remains closed after a drag`).toBeVisible();
    await expectElementInsideAppShell(page, ".ai-orb", `${project.name}: AI orb`);
  });

  test("presents chat, source, and note sheets with focus and toast safety", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openPreparedLesson(page, bookCourseApi);
    const chatTrigger = page.getByRole("button", { name: "问 AI", exact: true });

    await chatTrigger.focus();
    await chatTrigger.click();
    await expectSheetPresentation(page, "chat", project.initialViewport, `${project.name}: chat`);
    await expectDialogSemanticsAndFocusTrap(page, "问 AI", chatTrigger);

    await chatTrigger.click();
    const chatDialog = page.getByRole("dialog", { name: "问 AI" });
    await chatDialog.getByRole("textbox", { name: "继续提问" }).fill("同源染色体会在哪里分离？");
    await chatDialog.getByRole("button", { name: "发送问题", exact: true }).click();
    const sourceTrigger = chatDialog.getByRole("button", { name: "查看原文", exact: true });
    await expect(sourceTrigger, `${project.name}: chat response exposes its source action`).toBeVisible();
    await sourceTrigger.click();
    await expectSheetPresentation(page, "source", project.initialViewport, `${project.name}: source`);
    const sourceDialog = page.locator(".sheet[data-sheet-type='source']");
    await expect(sourceDialog.locator(".sheet-close"), `${project.name}: source entry receives its initial dialog focus`).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sourceDialog, `${project.name}: Escape unmounts the source Sheet before focus restoration`).toHaveCount(0);
    await expect(chatTrigger, `${project.name}: source close restores the original trigger`).toBeFocused();

    const noteTrigger = page.locator(".concept-card-grid").getByRole("button", { name: /同源染色体/ });
    await noteTrigger.click();
    await expectSheetPresentation(page, "note", project.initialViewport, `${project.name}: note`);
    await page.getByRole("dialog", { name: "导学笔记" }).getByRole("button", { name: "保存到笔记", exact: true }).click();
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expectNavigationMode(page, project.initialViewport, `${project.name}: toast return screen`);
    await expectToastPresentation(page, project.initialViewport, `${project.name}: note save`);
  });

  test("presents mobile chapter sheets and iPad chapter master-detail editing", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    if (expectedNavigationMode(project.initialViewport) === "rail") {
      await openPreparedChapterWorkspace(page, bookCourseApi);
      await expect(page.locator(".chapter-confirm-detail")).toBeVisible();
      await expect(page.locator(".chapter-detail-form")).toBeVisible();
      await expect(page.locator(".sheet[data-sheet-type='editChapter']")).toHaveCount(0);
      const masterDetail = await page.evaluate(() => {
        const directory = document.querySelector<HTMLElement>(".chapter-confirm-directory");
        const detail = document.querySelector<HTMLElement>(".chapter-confirm-detail");
        if (!directory || !detail) throw new Error("Chapter master-detail surfaces are missing");
        return {
          detail: detail.getBoundingClientRect().toJSON(),
          directory: directory.getBoundingClientRect().toJSON()
        };
      });
      expect(masterDetail.detail.left, `${project.name}: iPad chapter detail is positioned to the right of its directory`).toBeGreaterThanOrEqual(masterDetail.directory.right - 1);
      expect(masterDetail.detail.top, `${project.name}: iPad chapter master and detail columns share their top edge`).toBeCloseTo(masterDetail.directory.top, 1);
      await expectNoHorizontalOverflow(page, `${project.name}: iPad chapter editor`);
      return;
    }
    await openPreparedChapterEditor(page, bookCourseApi);
    await expectSheetPresentation(page, "editChapter", project.initialViewport, `${project.name}: mobile edit chapter`);
    await expectNoHorizontalOverflow(page, `${project.name}: mobile edit chapter dialog`);
  });

  test("keeps the AI dialog accessible across drag, rotation, and iPhone keyboard height", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.goto("/?embedded=device-preview");
    await page.setViewportSize({ width: 402, height: 681 });
    const orb = page.getByRole("button", { name: "打开 AI 助手" });
    await orb.click();
    const dialog = page.getByRole("dialog", { name: "AI 导学助手" });
    const input = dialog.getByRole("textbox", { name: "向 AI 助手提问" });
    await expect(dialog, `${project.name}: AI overlay exposes dialog semantics`).toHaveAttribute("aria-modal", "true");
    await expect(input, `${project.name}: AI input receives initial focus`).toBeFocused();

    const focusable = dialog.locator("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    const first = focusable.first();
    const last = focusable.last();
    await last.focus();
    await page.keyboard.press("Tab");
    await expect(first, `${project.name}: AI Tab focus wraps inside its dialog`).toBeFocused();
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(last, `${project.name}: AI Shift+Tab focus wraps inside its dialog`).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog, `${project.name}: AI Escape closes the dialog`).toHaveCount(0);
    await expect(orb, `${project.name}: AI close restores focus to its orb`).toBeFocused();

    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(orb, `${project.name}: AI orb remains available before rotation drag`).toBeVisible();
    const [orbBounds, shellBounds] = await Promise.all([orb.boundingBox(), page.locator(".app-shell").boundingBox()]);
    if (!orbBounds || !shellBounds) throw new Error("AI orb or app shell is not measurable");
    await page.mouse.move(orbBounds.x + (orbBounds.width / 2), orbBounds.y + (orbBounds.height / 2));
    await page.mouse.down();
    await page.mouse.move(shellBounds.x + 28, shellBounds.y + 360, { steps: 5 });
    await page.mouse.up();
    await expect(orb, `${project.name}: AI orb snaps before rotation`).toHaveCSS("left", "12px");
    await page.setViewportSize({ width: 1194, height: 834 });
    await expectElementInsideAppShell(page, ".ai-orb", `${project.name}: rotated AI orb`);

    await page.setViewportSize({ width: 402, height: 681 });
    await orb.click();
    await page.setViewportSize({ width: 402, height: 430 });
    await expectNavigationMode(page, { width: 402, height: 430 }, `${project.name}: iPhone keyboard viewport`);
    await expectAiComposeInsideVisualViewport(page, `${project.name}: iPhone keyboard viewport`);
    await expectNoHorizontalOverflow(page, `${project.name}: iPhone keyboard viewport`);
  });

  test("keeps the iPad rail and AI controls stable through the visualViewport keyboard shim", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await installVisualViewportShim(page);
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto("/?embedded=device-preview");
    await expectNavigationMode(page, { width: 834, height: 1194 }, `${project.name}: iPad layout viewport`);
    const orb = page.getByRole("button", { name: "打开 AI 助手" });
    await orb.click();
    await expect(page.getByRole("dialog", { name: "AI 导学助手" })).toBeVisible();

    await setVisualViewportHeight(page, 760);
    await expect.poll(async () => page.locator(".app-shell").evaluate((element) => getComputedStyle(element).getPropertyValue("--overlay-visual-height").trim()), `${project.name}: visual viewport shrink reaches the app shell`).toBe("760px");
    await expectNavigationMode(page, { width: 834, height: 1194 }, `${project.name}: iPad rail remains a rail while the keyboard is visible`);
    await expectAiComposeInsideVisualViewport(page, `${project.name}: iPad visualViewport keyboard`);
    await expectNoHorizontalOverflow(page, `${project.name}: iPad visualViewport keyboard`);

    await setVisualViewportHeight(page, 1194);
    await expect.poll(async () => page.locator(".app-shell").evaluate((element) => getComputedStyle(element).getPropertyValue("--overlay-visual-height").trim()), `${project.name}: visual viewport restore reaches the app shell`).toBe("1194px");
    await expectAiComposeInsideVisualViewport(page, `${project.name}: iPad restored visual viewport`);
    await page.getByRole("button", { name: "收起 AI 助手", exact: true }).click();
    await expectElementInsideAppShell(page, ".ai-orb", `${project.name}: iPad restored AI orb`);
  });

  test("keeps every sheet and toast within the iPad visual viewport", async ({ page, bookCourseApi }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-pro-11", "This regression targets the 834x1194 iPad visual viewport.");
    const layoutViewport = { width: 834, height: 1194 };
    const shrunkViewport = { height: 760, offsetTop: 24 };
    const restoredViewport = { height: 1194, offsetTop: 0 };

    await installVisualViewportShim(page);
    await page.setViewportSize(layoutViewport);
    await page.goto("/?embedded=device-preview");
    const homeRailBounds = await getRailBounds(page);
    await setVisualViewport(page, shrunkViewport);
    await expectOverlayViewportVariables(page, shrunkViewport, "iPad home shrunk viewport");
    await expectRailUnchanged(page, homeRailBounds, "iPad home shrunk viewport");

    await openPreparedLesson(page, bookCourseApi);
    await setVisualViewport(page, shrunkViewport);
    await expectOverlayViewportVariables(page, shrunkViewport, "iPad shrunk viewport");

    const chatTrigger = page.locator(".lesson-action-grid .button").first();
    await chatTrigger.click();
    await expectSheetPresentation(page, "chat", layoutViewport, "iPad shrunk chat");
    await expectElementsInsideVisualViewport(page, [
      ".sheet[data-sheet-type='chat']",
      ".chat-sheet input",
      ".chat-sheet-composer > .button"
    ], "iPad shrunk chat sheet, input, and send button");

    const chatDialog = page.locator(".sheet[data-sheet-type='chat']");
    await chatDialog.locator(".chat-input input").fill("同源染色体会在哪里分离？");
    await chatDialog.locator(".chat-sheet-composer > .button").click();
    await chatDialog.locator(".citation-card .inline-link").click();
    await expectSheetPresentation(page, "source", layoutViewport, "iPad shrunk source");
    await expectElementsInsideVisualViewport(page, [".sheet[data-sheet-type='source']"], "iPad shrunk source sheet");
    await page.keyboard.press("Escape");

    await page.locator(".concept-card-grid button").first().click();
    await expectSheetPresentation(page, "note", layoutViewport, "iPad shrunk note");
    await expectElementsInsideVisualViewport(page, [".sheet[data-sheet-type='note']"], "iPad shrunk note sheet");
    await page.keyboard.press("Escape");

    await openPreparedChapterWorkspace(page, bookCourseApi);
    const editorNavigation = page.locator(".primary-nav");
    await expect(editorNavigation, "iPad ChapterConfirm intentionally hides primary navigation").toHaveCount(0);
    await setVisualViewport(page, shrunkViewport);
    await expectOverlayViewportVariables(page, shrunkViewport, "iPad editor shrunk viewport");
    await expect(page.locator(".chapter-confirm-detail")).toBeVisible();
    await page.locator(".chapter-confirm-workspace").evaluate((element) => {
      const content = document.querySelector<HTMLElement>(".screen-content");
      if (!content) throw new Error("Stage 4 chapter workspace has no scroll container");
      content.style.scrollBehavior = "auto";
      const visualTop = window.visualViewport?.offsetTop ?? 0;
      content.scrollTop += element.getBoundingClientRect().top - (visualTop + 64);
    });
    await expectElementsInsideVisualViewport(page, [".chapter-confirm-detail"], "iPad shrunk chapter master-detail editor");
    const chapterSave = page.locator(".chapter-detail-form button[type='submit']");
    await chapterSave.scrollIntoViewIfNeeded();
    await expectElementsInsideVisualViewport(page, [".chapter-detail-form button[type='submit']"], "iPad shrunk chapter save action");
    await expect(editorNavigation, "iPad shrunk edit chapter remains a focused flow without primary navigation").toHaveCount(0);

    await setVisualViewport(page, restoredViewport);
    await expectOverlayViewportVariables(page, restoredViewport, "iPad restored edit viewport");
    await expectElementsInsideVisualViewport(page, [".chapter-confirm-detail"], "iPad restored chapter master-detail editor");
    await expect(editorNavigation, "iPad restored edit chapter remains a focused flow without primary navigation").toHaveCount(0);

    await setVisualViewport(page, shrunkViewport);
    await page.locator(".chapter-detail-form button[type='submit']").click();
    await expect(page.locator(".toast")).toBeVisible();
    await expectElementsInsideVisualViewport(page, [".toast"], "iPad shrunk toast");
    await expect(editorNavigation, "iPad shrunk toast does not reintroduce primary navigation").toHaveCount(0);

    await setVisualViewport(page, restoredViewport);
    await expectOverlayViewportVariables(page, restoredViewport, "iPad restored toast viewport");
    await expectElementsInsideVisualViewport(page, [".toast"], "iPad restored toast");
    await expect(editorNavigation, "iPad restored toast does not reintroduce primary navigation").toHaveCount(0);
  });

  test("gives every AI dialog action a 44px hit target across responsive viewports", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    const viewports = [project.initialViewport, project.pairedViewport, { width: 402, height: 430 }];

    await page.goto("/?embedded=device-preview");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const orb = page.locator(".ai-orb");
      await expect(orb, `${project.name}: ${viewport.width}x${viewport.height} orb is available`).toBeVisible();
      await orb.click();
      await expectAiDialogButtonTargets(page, `${project.name}: ${viewport.width}x${viewport.height}`);
      if (viewport.width < 768 && viewport.height >= 600 && viewport.height > viewport.width) {
        const geometry = await page.locator(".ai-overlay").evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const scrollRegion = element.querySelector<HTMLElement>(".ai-dialog-scroll");
          if (!scrollRegion) throw new Error("The AI dialog scroll region is missing.");
          const scrollStyle = getComputedStyle(scrollRegion);
          const webkitScrollbarStyle = getComputedStyle(scrollRegion, "::-webkit-scrollbar");
          return {
            bottomGap: window.innerHeight - bounds.bottom,
            height: bounds.height,
            left: bounds.left,
            overflowY: scrollStyle.overflowY,
            rightGap: window.innerWidth - bounds.right,
            scrollbarWidth: scrollStyle.scrollbarWidth,
            webkitScrollbarDisplay: webkitScrollbarStyle.display,
            webkitScrollbarWidth: webkitScrollbarStyle.width
          };
        });
        expect(geometry.left, `${project.name}: phone AI sheet keeps the compact left gutter`).toBeCloseTo(8, 1);
        expect(geometry.rightGap, `${project.name}: phone AI sheet keeps the compact right gutter`).toBeCloseTo(8, 1);
        expect(geometry.bottomGap, `${project.name}: phone AI sheet reaches the viewport bottom`).toBeCloseTo(0, 1);
        expect(geometry.height, `${project.name}: phone AI sheet uses the expanded 80vh proportion`).toBeCloseTo(
          Math.min(viewport.height * 0.8, 700),
          1
        );
        expect(geometry.overflowY, `${project.name}: AI content remains vertically scrollable`).toBe("auto");
        expect(geometry.scrollbarWidth, `${project.name}: Firefox-style scrollbar chrome is hidden`).toBe("none");
        expect(geometry.webkitScrollbarDisplay, `${project.name}: WebKit scrollbar chrome is hidden`).toBe("none");
        expect(geometry.webkitScrollbarWidth, `${project.name}: hidden WebKit scrollbar consumes no width`).toBe("0px");
        const scrollState = await page.locator(".ai-dialog-scroll").evaluate((scrollRegion) => {
          const maxScrollTop = scrollRegion.scrollHeight - scrollRegion.clientHeight;
          scrollRegion.scrollTop = Math.min(40, maxScrollTop);
          return {
            clientHeight: scrollRegion.clientHeight,
            scrollHeight: scrollRegion.scrollHeight,
            scrollTop: scrollRegion.scrollTop
          };
        });
        expect(scrollState.scrollHeight, `${project.name}: AI content still has a real scroll range`).toBeGreaterThan(scrollState.clientHeight);
        expect(scrollState.scrollTop, `${project.name}: hidden scrollbar does not disable scrolling`).toBeGreaterThan(0);
      }
      await page.locator(".ai-close").click();
      await expect(orb, `${project.name}: ${viewport.width}x${viewport.height} orb returns after close`).toBeVisible();
    }
  });

  test("opens the AI assistant after a cancelled drag and one keyboard activation", async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    await page.setViewportSize({ width: 402, height: 430 });
    const orb = page.locator(".ai-orb");
    const screen = page.locator(".motion-screen-transition");
    const focusSettledOrb = async (label: string) => {
      await expect(screen, `${label}: screen transition is settled before keyboard activation`).toHaveAttribute("data-motion-state", "idle");
      await expect(orb, `${label}: Orb is visible before keyboard activation`).toBeVisible();
      await expect(orb, `${label}: Orb is enabled before keyboard activation`).toBeEnabled();
      await orb.focus();
      await expect(orb, `${label}: Orb receives real keyboard focus`).toBeFocused();
    };
    await focusSettledOrb("initial cancelled-drag regression");
    const bounds = await orb.boundingBox();
    if (!bounds) throw new Error("AI orb is not measurable for the pointercancel regression");
    const startX = Math.round(bounds.x + (bounds.width / 2));
    const startY = Math.round(bounds.y + (bounds.height / 2));

    await orb.evaluate((element) => {
      Object.defineProperty(element, "setPointerCapture", { configurable: true, value: () => undefined });
      Object.defineProperty(element, "hasPointerCapture", { configurable: true, value: () => false });
    });

    async function dispatchCancelledDrag(pointerId: number) {
      await orb.dispatchEvent("pointerdown", { button: 0, buttons: 1, clientX: startX, clientY: startY, pointerId, pointerType: "touch" });
      await orb.dispatchEvent("pointermove", { button: 0, buttons: 1, clientX: startX + 20, clientY: startY + 20, pointerId, pointerType: "touch" });
      await orb.dispatchEvent("pointercancel", { button: 0, buttons: 0, clientX: startX + 20, clientY: startY + 20, pointerId, pointerType: "touch" });
    }

    await dispatchCancelledDrag(41);
    await focusSettledOrb("Enter after cancelled drag");
    await page.keyboard.press("Enter");
    await expect(page.locator(".ai-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".ai-overlay"), "AI dialog exits before the next keyboard activation").toHaveCount(0);

    await dispatchCancelledDrag(42);
    await focusSettledOrb("Space after cancelled drag");
    await page.keyboard.press("Space");
    await expect(page.locator(".ai-overlay")).toBeVisible();
  });

  test("honors reduced motion for global overlays", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?embedded=device-preview");
    await page.getByRole("button", { name: "打开 AI 助手" }).click();
    const motion = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".ai-overlay");
      const orb = document.querySelector<HTMLElement>(".ai-orb");
      if (!panel || !orb) throw new Error("Stage 3 overlay elements are missing");
      const panelStyle = getComputedStyle(panel);
      const orbStyle = getComputedStyle(orb);
      return {
        panelAnimation: panelStyle.animationName,
        panelTransition: panelStyle.transitionDuration,
        orbTransition: orbStyle.transitionDuration
      };
    });
    expect(motion.panelAnimation, `${project.name}: reduced motion removes AI entrance animation`).toBe("none");
    expect(motion.panelTransition, `${project.name}: reduced motion removes AI panel transitions`).toBe("0s");
    expect(motion.orbTransition, `${project.name}: reduced motion removes AI orb transitions`).toBe("0s");
  });
});
