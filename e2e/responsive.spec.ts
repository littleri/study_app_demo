import { expect, test as base, type Locator, type Page } from "playwright/test";
import { getResponsiveProject, type CssViewport } from "./fixtures/viewports";
import { installVisualViewportShim, setVisualViewport } from "./fixtures/visual-viewport";

type RuntimeAudit = {
  consoleErrors: string[];
  forbiddenRequests: string[];
  pageErrors: string[];
};

const test = base.extend<{ audit: RuntimeAudit }>({
  audit: async ({ page, baseURL }, use) => {
    const audit: RuntimeAudit = { consoleErrors: [], forbiddenRequests: [], pageErrors: [] };
    const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
    page.on("console", (message) => {
      if (message.type() === "error") audit.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => audit.pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if ((url.protocol === "http:" || url.protocol === "https:") && (url.origin !== origin || url.pathname.startsWith("/api/"))) {
        audit.forbiddenRequests.push(`${request.method()} ${request.url()}`);
      }
    });
    await use(audit);
    expect(audit.forbiddenRequests, "responsive flows stay on DemoRepository without HTTP APIs").toEqual([]);
    expect(audit.consoleErrors, "responsive flows emit no console errors").toEqual([]);
    expect(audit.pageErrors, "responsive flows emit no page errors").toEqual([]);
  }
});

test.use({
  colorScheme: "light",
  locale: "zh-CN",
  reducedMotion: "no-preference",
  timezoneId: "Asia/Hong_Kong"
});

function expectedDeviceLayout(viewport: CssViewport) {
  return viewport.width >= 720 && viewport.height >= 600 ? "pad" : "phone";
}

async function dispatchCurrentAnimation(page: Page) {
  const current = page.locator('.motion-screen-surface[data-motion-surface="current"]');
  await current.evaluate((element) => {
    const name = getComputedStyle(element).animationName.split(",")[0].trim();
    element.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
  });
}

async function settleScreen(page: Page) {
  const root = page.locator(".motion-screen-transition");
  if (await root.getAttribute("data-motion-state") === "transitioning") await dispatchCurrentAnimation(page);
  await expect(root).toHaveAttribute("data-motion-state", "idle");
  await expect(root.locator(':scope > [data-motion-surface="previous"]')).toHaveCount(0);
}

async function gotoApp(page: Page) {
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".home-dashboard")).toBeVisible();
  await settleScreen(page);
}

async function openLibrary(page: Page) {
  await page.locator(".home-course-library-action").click();
  await expect(page.locator(".library-screen")).toBeVisible();
  await settleScreen(page);
}

async function advanceAssignmentToShortAnswer(page: Page) {
  await page.locator(".assignment-judgment-options button").first().click();
  await page.locator(".assignment-primary-action .button").click();
  await expect(page.locator('.assignment-exercise-card[data-assignment-type="choice"]')).toBeVisible();
  await page.locator(".assignment-choice-options button").nth(1).click();
  await page.locator(".assignment-primary-action .button").click();
  await expect(page.locator('.assignment-exercise-card[data-assignment-type="short-answer"]')).toBeVisible();
}

async function openStudy(page: Page) {
  await gotoApp(page);
  await openLibrary(page);
  const course = page.locator(".course-library-list .course-library-open").first();
  await expect(course).toBeVisible();
  await course.click();
  await expect(page.locator(".book-course-screen")).toBeVisible({ timeout: 15_000 });
  await settleScreen(page);
}

async function expectNoShellOverflow(page: Page, label: string) {
  const widths = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) throw new Error("app shell is missing");
    return {
      appClient: shell.clientWidth,
      appScroll: shell.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      documentScroll: document.documentElement.scrollWidth
    };
  });
  expect(widths.documentScroll, `${label}: document has no horizontal overflow`).toBeLessThanOrEqual(widths.documentClient + 1);
  expect(widths.appScroll, `${label}: app shell has no horizontal overflow`).toBeLessThanOrEqual(widths.appClient + 1);
}

async function expectShellMode(page: Page, viewport: CssViewport, label: string) {
  const shell = page.locator(".app-shell");
  await expect(shell, `${label}: app shell is visible`).toBeVisible();
  await expect(shell, `${label}: layout media query matches viewport`).toHaveAttribute("data-device-layout", expectedDeviceLayout(viewport));
  const nav = page.locator(".primary-nav");
  await expect(nav, `${label}: primary navigation remains visible`).toBeVisible();
  await expect(nav.locator(".nav-item"), `${label}: four navigation destinations remain present`).toHaveCount(4);
  const bounds = await nav.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(bounds.height > bounds.width ? "pad" : "phone", `${label}: navigation orientation follows the layout mode`).toBe(expectedDeviceLayout(viewport));
  await expectNoShellOverflow(page, label);
}

async function expectInsideShell(page: Page, locator: Locator, label: string) {
  const result = await locator.evaluate((element) => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) return null;
    const outer = shell.getBoundingClientRect();
    const inner = element.getBoundingClientRect();
    return {
      bottom: inner.bottom <= outer.bottom + 1,
      left: inner.left >= outer.left - 1,
      right: inner.right <= outer.right + 1,
      top: inner.top >= outer.top - 1
    };
  });
  expect(result, `${label}: surface is inside app shell`).toEqual({ bottom: true, left: true, right: true, top: true });
}

async function expectHorizontallyInsideShell(locator: Locator, label: string) {
  const result = await locator.evaluate((element) => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) return null;
    const outer = shell.getBoundingClientRect();
    const inner = element.getBoundingClientRect();
    return {
      left: inner.left >= outer.left - 1,
      right: inner.right <= outer.right + 1
    };
  });
  expect(result, `${label}: content stays inside the shell horizontally`).toEqual({ left: true, right: true });
}

async function expectStrictHorizontalBounds(page: Page, selectors: string[], label: string) {
  const shell = page.locator(".app-shell");
  await expect(shell, `${label}: app shell exists`).toBeVisible();
  const shellRect = await shell.boundingBox();
  expect(shellRect, `${label}: app shell has measurable geometry`).not.toBeNull();
  if (!shellRect) return;

  for (const selector of selectors) {
    const matching = page.locator(selector);
    await expect(matching.first(), `${label}: ${selector} has a first attached element`).toBeAttached();
    const elements = await matching.all();
    expect(elements.length, `${label}: ${selector} has at least one element`).toBeGreaterThan(0);
    for (const [index, element] of elements.entries()) {
      await expect(element, `${label}: ${selector}[${index}] is visible`).toBeVisible();
      const rect = await element.boundingBox();
      expect(rect, `${label}: ${selector}[${index}] has measurable geometry`).not.toBeNull();
      if (!rect) continue;
      expect(rect.x, `${label}: ${selector}[${index}] does not overflow left`).toBeGreaterThanOrEqual(shellRect.x - 1);
      expect(rect.x + rect.width, `${label}: ${selector}[${index}] does not overflow right`).toBeLessThanOrEqual(shellRect.x + shellRect.width + 1);
    }
  }
}

async function expectReachable(locator: Locator, label: string) {
  await expect(locator, `${label}: control is visible`).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ trial: true });
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width
    };
  });
  expect(result.height + 0.001, `${label}: touch target height`).toBeGreaterThanOrEqual(44);
  expect(result.width + 0.001, `${label}: touch target width`).toBeGreaterThanOrEqual(44);
}

async function readStudyBookBarGeometry(page: Page) {
  return page.locator(".study-book-bar").evaluate((bar) => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const add = bar.querySelector<HTMLElement>(".study-add-button");
    if (!shell || !add) return null;
    const shellRect = shell.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const addRect = add.getBoundingClientRect();
    const hit = document.elementFromPoint(addRect.left + addRect.width / 2, addRect.top + addRect.height / 2);
    return {
      addCenterReachable: Boolean(hit && (hit === add || add.contains(hit))),
      addLeft: addRect.left,
      addOverhang: Math.max(0, addRect.right - shellRect.right),
      addRight: addRect.right,
      barLeft: barRect.left,
      barRight: barRect.right,
      overhang: Math.max(0, barRect.right - shellRect.right),
      shellLeft: shellRect.left,
      shellRight: shellRect.right,
      viewportWidth: window.innerWidth
    };
  });
}

async function expandCurrentStudySection(page: Page) {
  const chapter = page.locator("#study-chapter-c2-toggle");
  if (await chapter.getAttribute("aria-expanded") !== "true") {
    await chapter.focus();
    await chapter.press("Enter");
    await expect(chapter).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.locator("#study-chapter-c2-content")).toBeVisible();
  const section = page.locator("#study-section-c2s1-toggle");
  if (await section.getAttribute("aria-expanded") !== "true") {
    await section.focus();
    await section.press("Enter");
    await expect(section).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.locator("#study-section-c2s1-content")).toBeVisible();
}

async function openSourceReader(page: Page) {
  await expandCurrentStudySection(page);
  const entry = page.locator("#study-section-c2s1-content .study-enter-button");
  await entry.focus();
  await expect(entry).toBeFocused();
  await entry.press("Enter");
  await expect(page.locator(".lesson-screen")).toBeVisible({ timeout: 10_000 });
  await settleScreen(page);
  await page.locator(".lesson-source-link").first().click();
  await expect(page.locator(".source-reader-screen")).toBeVisible({ timeout: 10_000 });
  await settleScreen(page);
}

async function openLesson(page: Page) {
  await expandCurrentStudySection(page);
  const entry = page.locator("#study-section-c2s1-content .study-enter-button");
  await entry.focus();
  await expect(entry).toBeFocused();
  await entry.press("Enter");
  await expect(page.locator(".lesson-screen")).toBeVisible();
  await settleScreen(page);
}

async function expectCurrentScreenGeometry(page: Page, screenSelector: string, keySelectors: string[], label: string) {
  await expectStrictHorizontalBounds(page, [
    ".screen-content",
    ".motion-screen-transition",
    ".motion-screen-surface[data-motion-surface='current']",
    screenSelector,
    ...keySelectors
  ], label);
  await expectNoShellOverflow(page, label);
}

async function activateUnobscuredWithKeyboard(control: Locator, label: string) {
  await expect(control, `${label}: control is visible`).toBeVisible();
  await control.evaluate((element) => {
    const stickySummary = element.closest<HTMLElement>(".study-plan-summary");
    const screen = element.closest<HTMLElement>(".screen-content");
    if (stickySummary && screen && getComputedStyle(stickySummary).position === "sticky") {
      screen.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    element.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await expect.poll(async () => control.evaluate(async (element) => {
    const before = element.getBoundingClientRect();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const after = element.getBoundingClientRect();
    const centerX = after.left + after.width / 2;
    const centerY = after.top + after.height / 2;
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      centerReachable: Boolean(hit && (hit === element || element.contains(hit))),
      scrollStable: Math.abs(after.left - before.left) < 0.01 && Math.abs(after.top - before.top) < 0.01
    };
  }), {
    message: `${label}: scroll settles without sticky or sibling obstruction`
  }).toEqual({ centerReachable: true, scrollStable: true });
  await control.focus();
  await expect(control, `${label}: keyboard focus succeeds`).toBeFocused();
  await control.press("Enter");
}

async function expectAllControlsReachableInVisualViewport(page: Page, selector: string, label: string) {
  const matching = page.locator(selector);
  await expect(matching.first(), `${label}: first real control is attached`).toBeAttached();
  const controls = await matching.all();
  expect(controls.length, `${label}: at least one real control exists`).toBeGreaterThan(0);
  for (const [index, control] of controls.entries()) {
    await control.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await expect(control, `${label}[${index}] remains visible`).toBeVisible();
    await expect.poll(async () => control.evaluate(async (element) => {
      const before = element.getBoundingClientRect();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const rect = element.getBoundingClientRect();
      const visualTop = window.visualViewport?.offsetTop ?? 0;
      const visualBottom = visualTop + (window.visualViewport?.height ?? window.innerHeight);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        bottomInsideVisual: rect.bottom <= visualBottom,
        centerInsideVisual: centerY >= visualTop - 1 && centerY <= visualBottom + 1,
        centerReachable: Boolean(hit && (hit === element || element.contains(hit))),
        scrollStable: Math.abs(rect.left - before.left) < 0.01 && Math.abs(rect.top - before.top) < 0.01,
        topInsideVisual: rect.top >= visualTop
      };
    }), {
      message: `${label}[${index}] smooth scroll settles with its full rectangle reachable in the visual viewport`
    }).toEqual({
      bottomInsideVisual: true,
      centerInsideVisual: true,
      centerReachable: true,
      scrollStable: true,
      topInsideVisual: true
    });
    const result = await control.evaluate((element) => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      if (!shell) return null;
      const rect = element.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const visualTop = window.visualViewport?.offsetTop ?? 0;
      const visualBottom = visualTop + (window.visualViewport?.height ?? window.innerHeight);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        bottomInsideVisual: rect.bottom <= visualBottom,
        centerInsideVisual: centerY >= visualTop - 1 && centerY <= visualBottom + 1,
        centerReachable: Boolean(hit && (hit === element || element.contains(hit))),
        height: rect.height,
        leftInsideShell: rect.left >= shellRect.left - 1,
        rightInsideShell: rect.right <= shellRect.right + 1,
        topInsideVisual: rect.top >= visualTop,
        width: rect.width
      };
    });
    expect(result, `${label}[${index}] has geometry`).not.toBeNull();
    if (!result) continue;
    expect(result.leftInsideShell, `${label}[${index}] stays inside shell left`).toBe(true);
    expect(result.rightInsideShell, `${label}[${index}] stays inside shell right`).toBe(true);
    expect(result.topInsideVisual, `${label}[${index}] full rectangle stays below the visual viewport top`).toBe(true);
    expect(result.bottomInsideVisual, `${label}[${index}] full rectangle stays above the visual viewport bottom`).toBe(true);
    expect(result.centerInsideVisual, `${label}[${index}] actionable center stays inside the visual viewport`).toBe(true);
    expect(result.centerReachable, `${label}[${index}] center is not obscured`).toBe(true);
    expect(result.height, `${label}[${index}] touch target height`).toBeGreaterThanOrEqual(44);
    expect(result.width, `${label}[${index}] touch target width`).toBeGreaterThanOrEqual(44);
  }
}

test.describe("current DemoRepository responsive matrix", () => {
  test("uses tablet side navigation on Android portrait viewports and preserves phone fallback at boundaries", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-pro-11", "One viewport sweep covers the Android tablet breakpoint");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoApp(page);

    const shell = page.locator(".app-shell");
    const nav = page.locator(".primary-nav");
    const toggle = page.locator(".nav-expand-toggle");

    for (const viewport of [
      { width: 720, height: 600 },
      { width: 753, height: 1165 },
      { width: 1165, height: 753 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(shell).toHaveAttribute("data-device-layout", "pad");
      await expect(toggle).toBeVisible();
      await expect(nav.locator(".nav-item")).toHaveCount(4);
      const rail = (await nav.boundingBox())!;
      expect(rail.x).toBe(0);
      expect(rail.width).toBeCloseTo(88 * 2 / 3, 0);
      expect(rail.height).toBeGreaterThan(rail.width);
      await expectNoShellOverflow(page, `Android tablet ${viewport.width}x${viewport.height}`);
    }

    for (const viewport of [
      { width: 719, height: 1165 },
      { width: 753, height: 599 },
      { width: 874, height: 402 },
      { width: 402, height: 874 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(shell).toHaveAttribute("data-device-layout", "phone");
      await expect(toggle).toBeHidden();
      await expect(nav.locator(".nav-item")).toHaveCount(4);
      const bottomNav = (await nav.boundingBox())!;
      expect(bottomNav.width).toBeGreaterThan(bottomNav.height);
      await expectNoShellOverflow(page, `Phone fallback ${viewport.width}x${viewport.height}`);
    }
  });

  test("expands the tablet sidebar and switches the current study course", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-pro-11", "The iPad portrait project covers the sidebar interaction");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoApp(page);

    const shell = page.locator(".app-shell");
    const nav = page.locator(".primary-nav");
    const toggle = page.getByRole("button", { name: "展开侧边栏" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const collapsedWidth = (await nav.boundingBox())!.width;
    expect(collapsedWidth).toBeCloseTo(88 * 2 / 3, 0);

    await toggle.click();
    await expect(shell).toHaveAttribute("data-nav-expanded", "true");
    await expect(page.getByRole("button", { name: "收起侧边栏" })).toHaveAttribute("aria-expanded", "true");
    for (const label of ["首页", "学习", "发现", "我的"]) {
      await expect(nav.locator(`.nav-item[aria-label="${label}"] .nav-label`)).toBeVisible();
    }

    for (const viewport of [
      { width: 834, height: 1194 },
      { width: 1194, height: 834 },
      { width: 753, height: 1165 },
      { width: 720, height: 600 },
      { width: 768, height: 600 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(shell).toHaveAttribute("data-device-layout", "pad");
      const geometry = await page.evaluate(() => {
        const rail = document.querySelector<HTMLElement>(".primary-nav")!;
        const main = document.querySelector<HTMLElement>(".screen-content")!;
        const railRect = rail.getBoundingClientRect();
        return {
          railRight: railRect.right,
          railWidth: railRect.width,
          mainLeftInset: Number.parseFloat(getComputedStyle(main).paddingLeft),
          navClientHeight: rail.clientHeight,
          navScrollHeight: rail.scrollHeight
        };
      });
      expect(geometry.railWidth, `${viewport.width}x${viewport.height}: expanded rail is wider`).toBeGreaterThan(200);
      expect(geometry.mainLeftInset, `${viewport.width}x${viewport.height}: content clears the rail`).toBeGreaterThan(geometry.railRight);
      expect(geometry.navScrollHeight, `${viewport.width}x${viewport.height}: controls fit the rail`).toBeLessThanOrEqual(geometry.navClientHeight + 1);
      await expectNoShellOverflow(page, `Expanded sidebar ${viewport.width}x${viewport.height}`);
    }

    await page.setViewportSize({ width: 834, height: 1194 });
    await nav.locator(".nav-study").click();
    await expect(page.locator(".nav-study-context")).toBeVisible();
    await expect.poll(async () => page.locator(".nav-course-title").textContent()).not.toBe("尚未选择教材");
    const previousCourse = await page.locator(".nav-course-title").textContent();
    await expect(page.locator(".nav-context-link")).toHaveCount(5);
    await page.locator(".nav-course-switch").click();
    await expect(page.locator(".book-switcher-sheet")).toBeVisible();
    await expect(page.locator(".book-switcher-row")).toHaveCount(2);
    await page.locator(".book-switcher-row").nth(1).click();
    await expect.poll(async () => page.locator(".nav-course-title").textContent()).not.toBe(previousCourse);

    await page.locator(".nav-context-link").filter({ hasText: "学习计划" }).click();
    await expect(page.locator('.screen-content[data-screen="plan"]')).toBeVisible();
    await expect(nav).toHaveCount(0);
    const hiddenRailWidth = await shell.evaluate((element) => Number.parseFloat(getComputedStyle(element).getPropertyValue("--nav-rail-width")));
    expect(hiddenRailWidth, "hidden navigation does not reserve expanded width").toBeCloseTo(88 * 2 / 3, 0);
    const focusedInsets = await page.locator(".screen-content").evaluate((main) => {
      const style = getComputedStyle(main);
      return [Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)];
    });
    expect(Math.abs(focusedInsets[0] - focusedInsets[1]), "focused pages stay centered after expanding the rail").toBeLessThanOrEqual(1);

    await page.locator('.header-bar .icon-button[aria-label="返回"]').click();
    await expect(nav).toHaveAttribute("data-expanded", "true");
    await page.getByRole("button", { name: "收起侧边栏" }).click();
    await expect(nav).toHaveAttribute("data-expanded", "false");
    expect((await nav.boundingBox())!.width).toBeCloseTo(collapsedWidth, 0);
    await expect(nav.locator(".nav-study-context")).toHaveCount(0);

    await page.setViewportSize({ width: 402, height: 874 });
    await expect(shell).toHaveAttribute("data-device-layout", "phone");
    await expect(page.locator(".nav-expand-toggle")).toBeHidden();
    await expect(nav.locator(".nav-item")).toHaveCount(4);
  });

  test("centers every focused tablet screen and keeps the upload sheet full width", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-pro-11", "One iPad viewport sweep covers focused screen geometry");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoApp(page);

    const focusedScreens = [
      "upload", "parseReady", "processing", "chapterConfirm", "courseReady", "library",
      "communityBook", "communityImport", "plan", "flashcards", "lesson", "assignment",
      "diagnosis", "mistakes", "notes", "source", "export", "report"
    ];

    for (const viewport of [
      { width: 834, height: 1194 },
      { width: 1194, height: 834 },
      { width: 780, height: 876 },
      { width: 1440, height: 900 }
    ]) {
      await page.setViewportSize(viewport);
      const focusedGeometry = await page.evaluate((screens) => {
        const shell = document.querySelector<HTMLElement>(".app-shell")!;
        const shellRect = shell.getBoundingClientRect();
        const shellCenter = (shellRect.left + shellRect.right) / 2;
        const values = screens.map((screen) => {
          const main = document.createElement("main");
          main.className = "screen-content with-header without-nav";
          main.dataset.screen = screen;
          shell.append(main);
          const rect = main.getBoundingClientRect();
          const style = getComputedStyle(main);
          const left = Number.parseFloat(style.paddingLeft);
          const right = Number.parseFloat(style.paddingRight);
          const result = { screen, left, right, contentCenter: (rect.left + left + rect.right - right) / 2, shellCenter };
          main.remove();
          return result;
        });
        return values;
      }, focusedScreens);

      for (const item of focusedGeometry) {
        expect(Math.abs(item.contentCenter - item.shellCenter), `${viewport.width}x${viewport.height}: ${item.screen} content is centered with ${item.left}px/${item.right}px padding`).toBeLessThanOrEqual(1);
        expect(Math.abs(item.left - item.right), `${viewport.width}x${viewport.height}: ${item.screen} has balanced horizontal padding`).toBeLessThanOrEqual(1);
      }
    }

    await page.setViewportSize({ width: 834, height: 1194 });
    await page.locator('[data-home-global-action="upload"]').click();
    await expect(page.locator(".upload-flow-screen")).toBeVisible();
    await settleScreen(page);
    for (const viewport of [
      { width: 834, height: 1194 },
      { width: 1194, height: 834 },
      { width: 780, height: 876 },
      { width: 1440, height: 900 }
    ]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        const shell = rect(".app-shell");
        const sheet = rect(".upload-sheet-card");
        const tile = rect(".upload-add-tile");
        const action = rect(".upload-flow-primary > .button");
        const title = rect(".header-title");
        const center = (item: DOMRect) => (item.left + item.right) / 2;
        return {
          shellCenter: center(shell),
          sheetLeft: sheet.left,
          sheetRight: sheet.right,
          shellLeft: shell.left,
          shellRight: shell.right,
          tileCenter: center(tile),
          actionCenter: center(action),
          titleCenter: center(title)
        };
      });
      expect(Math.abs(geometry.sheetLeft - geometry.shellLeft), `${viewport.width}x${viewport.height}: sheet reaches left edge`).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.sheetRight - geometry.shellRight), `${viewport.width}x${viewport.height}: sheet reaches right edge`).toBeLessThanOrEqual(1);
      for (const key of ["tileCenter", "actionCenter", "titleCenter"] as const) {
        expect(Math.abs(geometry[key] - geometry.shellCenter), `${viewport.width}x${viewport.height}: ${key} is centered`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("centers tablet flashcards and assignment while preserving the phone card proportion", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-pro-11", "One iPad viewport sweep covers the focused tool pages");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 402, height: 874 });
    await gotoApp(page);
    await page.locator('.home-book-workspace .study-tool-card[data-tool="flashcards"]').click();
    await expect(page.locator(".flashcard-screen")).toBeVisible();
    await settleScreen(page);

    const measureFlashcard = () => page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell")!.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>(".flashcard-workspace")!.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>(".memory-card-trigger")!.getBoundingClientRect();
      return {
        centerOffset: (workspace.left + workspace.right - shell.left - shell.right) / 2,
        width: card.width,
        height: card.height
      };
    });
    const phoneCard = await measureFlashcard();
    for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const card = await measureFlashcard();
      expect(Math.abs(card.centerOffset), `${viewport.width}x${viewport.height}: flashcard workspace is centered`).toBeLessThanOrEqual(1);
      expect(card.width, `${viewport.width}x${viewport.height}: flashcard grows for iPad`).toBeGreaterThan(phoneCard.width * 1.5);
      expect(Math.abs(card.height / card.width - phoneCard.height / phoneCard.width), `${viewport.width}x${viewport.height}: phone card proportion`).toBeLessThan(0.12);
      await expectNoShellOverflow(page, `${viewport.width}x${viewport.height}: flashcard`);
    }

    await page.setViewportSize({ width: 834, height: 1194 });
    await gotoApp(page);
    await page.getByRole("button", { name: "作业诊断 提交解题过程，定位理解卡点", exact: true }).click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    await settleScreen(page);
    for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const layout = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>(".app-shell")!.getBoundingClientRect();
        const workspace = document.querySelector<HTMLElement>(".assignment-practice-workspace")!.getBoundingClientRect();
        const progress = document.querySelector<HTMLElement>(".assignment-progress-card")!.getBoundingClientRect();
        const card = document.querySelector<HTMLElement>(".assignment-exercise-card")!.getBoundingClientRect();
        return {
          centerOffset: (workspace.left + workspace.right - shell.left - shell.right) / 2,
          progressCenter: (progress.left + progress.right) / 2,
          cardCenter: (card.left + card.right) / 2
        };
      });
      expect(Math.abs(layout.centerOffset), `${viewport.width}x${viewport.height}: assignment workspace is centered`).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.progressCenter - layout.cardCenter), `${viewport.width}x${viewport.height}: assignment cards align`).toBeLessThanOrEqual(1);
      await expectNoShellOverflow(page, `${viewport.width}x${viewport.height}: assignment`);
    }

    await advanceAssignmentToShortAnswer(page);
    await page.locator(".assignment-card textarea").fill("同源染色体在减数第一次分裂后期分离。");
    await page.locator(".assignment-primary-action .button").click();
    await expect(page.locator(".diagnosis-screen")).toBeVisible();
    await settleScreen(page);
    const diagnosisOffset = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell")!.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>(".diagnosis-workspace")!.getBoundingClientRect();
      return (workspace.left + workspace.right - shell.left - shell.right) / 2;
    });
    expect(Math.abs(diagnosisOffset), "diagnosis result is centered").toBeLessThanOrEqual(1);
  });

  test("docks the pad navigation and stacks home and study sections in phone order", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    test.skip(expectedDeviceLayout(project.initialViewport) !== "pad", "Pad layout only");

    await gotoApp(page);
    await expect(page.locator(".home-book-workspace .study-tool-grid")).toBeVisible();
    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const bounds = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const nav = document.querySelector<HTMLElement>(".primary-nav");
        if (!nav) throw new Error("Missing primary navigation");
        const navStyle = getComputedStyle(nav);
        return {
          nav: bounds(".primary-nav"),
          statusBar: bounds(".ios-status-bar"),
          navBackground: navStyle.backgroundColor,
          navRadius: navStyle.borderRadius,
          navShadow: navStyle.boxShadow,
          picker: bounds(".home-book-picker"),
          workspace: bounds(".home-book-workspace"),
          actions: bounds(".home-global-section"),
          toolDisplay: getComputedStyle(document.querySelector<HTMLElement>(".home-book-workspace .study-tool-grid")!).display
        };
      });
      expect(layout.nav.left).toBe(0);
      expect(layout.nav.right).toBeCloseTo(88 * 2 / 3, 0);
      expect(layout.nav.top).toBeCloseTo(24, 0);
      expect(layout.nav.height).toBeCloseTo(viewport.height - 24, 0);
      expect(layout.statusBar.left).toBe(0);
      expect(layout.statusBar.right).toBeCloseTo(viewport.width, 0);
      expect(layout.statusBar.top).toBe(0);
      expect(layout.statusBar.height).toBeCloseTo(24, 0);
      expect(layout.navBackground).toBe("rgb(25, 25, 27)");
      expect(layout.navRadius).toBe("0px");
      expect(layout.navShadow).toBe("none");
      expect(layout.picker.left).toBeGreaterThanOrEqual(layout.nav.right);
      expect(layout.workspace.top).toBeGreaterThanOrEqual(layout.picker.bottom);
      expect(layout.actions.top).toBeGreaterThanOrEqual(layout.workspace.bottom);
      expect(layout.toolDisplay).toBe("flex");
      await expectNoShellOverflow(page, `${project.name} stacked pad home`);
    }

    await openStudy(page);
    const studyLayout = await page.evaluate(() => {
      const summary = document.querySelector<HTMLElement>(".study-plan-summary")!.getBoundingClientRect();
      const directory = document.querySelector<HTMLElement>(".study-directory")!.getBoundingClientRect();
      return { summaryBottom: summary.bottom, directoryTop: directory.top };
    });
    expect(studyLayout.directoryTop).toBeGreaterThanOrEqual(studyLayout.summaryBottom);

    await page.locator('.primary-nav .nav-item[aria-label="我的"]').click();
    await expect(page.locator(".profile-workspace")).toBeVisible();
    await settleScreen(page);
    const portrait = await page.locator(".profile-portrait-card").boundingBox();
    const dashboard = await page.locator(".profile-dashboard-column").boundingBox();
    expect(portrait).not.toBeNull();
    expect(dashboard).not.toBeNull();
    expect(dashboard!.y).toBeGreaterThanOrEqual(portrait!.y + portrait!.height);

    await page.locator('.primary-nav .nav-item[aria-label="发现"]').click();
    await expect(page.locator(".community-book-card").first()).toBeVisible();
    await settleScreen(page);
    const rail = await page.locator(".community-category-rail").boundingBox();
    const nav = await page.locator(".primary-nav").boundingBox();
    const shell = await page.locator(".app-shell").boundingBox();
    expect(rail).not.toBeNull();
    expect(nav).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(Math.abs(rail!.x - (nav!.x + nav!.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(rail!.x + rail!.width - (shell!.x + shell!.width))).toBeLessThanOrEqual(1);
    const communityCards = page.locator(".community-book-card");
    if (await communityCards.count() > 1) {
      const first = await communityCards.nth(0).boundingBox();
      const second = await communityCards.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(Math.abs(second!.y - first!.y)).toBeLessThanOrEqual(1);
      expect(second!.x).toBeGreaterThanOrEqual(first!.x + first!.width);
    }
    const discoveryHeader = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('.screen-content[data-screen="community"]')!;
      main.style.scrollBehavior = "auto";
      const header = document.querySelector<HTMLElement>(".header-bar")!;
      const controls = document.querySelector<HTMLElement>(".community-discovery-controls")!;
      const card = document.querySelector(".community-book-card")!;
      const titleRect = header.querySelector(".header-title")!.getBoundingClientRect();
      main.scrollTop += card.getBoundingClientRect().top - titleRect.top + 24;
      const headerRect = header.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const headerCover = getComputedStyle(header, "::before");
      const controlsCover = getComputedStyle(controls, "::before");
      return {
        background: headerCover.backgroundColor,
        left: headerRect.left + parseFloat(headerCover.left),
        right: headerRect.right - parseFloat(headerCover.right),
        top: headerRect.top + parseFloat(headerCover.top),
        bottom: headerRect.bottom - parseFloat(headerCover.bottom),
        controlsCoverTop: controls.getBoundingClientRect().top + parseFloat(controlsCover.top),
        titleTop: titleRect.top,
        titleBottom: titleRect.bottom,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
        scrollTop: main.scrollTop,
        maxScroll: main.scrollHeight - main.clientHeight
      };
    });
    expect(discoveryHeader.background).toBe("rgb(246, 248, 251)");
    expect(Math.abs(discoveryHeader.left - (nav!.x + nav!.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(discoveryHeader.right - (shell!.x + shell!.width))).toBeLessThanOrEqual(1);
    expect(discoveryHeader.top).toBeLessThanOrEqual(shell!.y + 1);
    expect(discoveryHeader.bottom).toBeGreaterThanOrEqual(discoveryHeader.controlsCoverTop);
    if (discoveryHeader.cardTop < discoveryHeader.titleBottom) {
      expect(discoveryHeader.cardBottom).toBeGreaterThan(discoveryHeader.titleTop);
    } else {
      expect(discoveryHeader.scrollTop).toBeCloseTo(discoveryHeader.maxScroll, 0);
    }
  });

  test("fits tablet parse confirmation and keeps back and parse actions aligned", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-pro-11-landscape", "One WebKit viewport sweep covers the shared header");
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });

    const expectLeftBack = async (label: string) => {
      const geometry = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>(".app-shell")!.getBoundingClientRect();
        const backControl = document.querySelector<HTMLElement>('.header-bar .icon-button[aria-label="返回"]')!;
        const back = backControl.getBoundingClientRect();
        const title = document.querySelector<HTMLElement>(".header-title")!.getBoundingClientRect();
        const hit = document.elementFromPoint(back.left + back.width / 2, back.top + back.height / 2);
        return {
          backLeftInset: back.left - shell.left,
          backCenter: back.left + back.width / 2,
          backReachable: Boolean(hit && (hit === backControl || backControl.contains(hit))),
          shellCenter: shell.left + shell.width / 2,
          titleCenter: title.left + title.width / 2
        };
      });
      expect(geometry.backLeftInset, `${label}: back control reaches the outer inset`).toBeLessThanOrEqual(33);
      expect(geometry.backCenter, `${label}: back control is on the left`).toBeLessThan(geometry.shellCenter);
      expect(geometry.backReachable, `${label}: back control can be clicked`).toBe(true);
      expect(Math.abs(geometry.titleCenter - geometry.shellCenter), `${label}: title stays centered`).toBeLessThanOrEqual(1);
    };

    await page.setViewportSize({ width: 1194, height: 834 });
    await gotoApp(page);
    await openLibrary(page);
    await expectLeftBack("Library");
    await openStudy(page);
    await openLesson(page);
    await expectLeftBack("Lesson");

    await gotoApp(page);
    await page.locator('.primary-nav .nav-item[aria-label="发现"]').click();
    await expect(page.locator(".community-book-card").first()).toBeVisible();
    await page.locator(".community-book-card").first().click();
    await expect(page.locator(".community-detail-screen")).toBeVisible();
    await settleScreen(page);
    await expectLeftBack("Community course");

    await page.setViewportSize({ width: 780, height: 876 });
    await gotoApp(page);
    await page.locator('[data-home-global-action="upload"]').click();
    await expect(page.locator(".upload-flow-screen")).toBeVisible();
    await settleScreen(page);
    await expectLeftBack("Upload");
    await page.locator('input[type="file"]').setInputFiles({
      name: "人教版高中生物必修2遗传与进化.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 responsive parse layout fixture")
    });
    await page.getByRole("button", { name: "上传并继续", exact: true }).click();
    await expect(page.locator(".parse-ready-screen")).toBeVisible();
    await settleScreen(page);

    for (const viewport of [
      { width: 780, height: 876 },
      { width: 860, height: 1180 },
      { width: 834, height: 1194 },
      { width: 1194, height: 834 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 600 }
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await expectLeftBack(`ParseReady ${viewport.width}x${viewport.height}`);
      const layout = await page.evaluate(() => {
        const bounds = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        const main = document.querySelector<HTMLElement>('.screen-content[data-screen="parseReady"]')!;
        const shell = bounds(".app-shell");
        const button = bounds(".parse-ready-actions .button");
        return {
          scrollHeight: main.scrollHeight,
          clientHeight: main.clientHeight,
          coverBottom: bounds(".parse-ready-visual .community-detail-cover").bottom,
          ownerTop: bounds(".parse-ready-owner").top,
          infoBottom: bounds(".parse-info-grid").bottom,
          actionsTop: bounds(".parse-ready-actions").top,
          buttonCenter: button.left + button.width / 2,
          buttonBottom: button.bottom,
          shellCenter: shell.left + shell.width / 2,
          shellBottom: shell.bottom
        };
      });
      expect(layout.scrollHeight, `${viewport.width}x${viewport.height}: no vertical scrolling`).toBeLessThanOrEqual(layout.clientHeight + 1);
      expect(layout.coverBottom, `${viewport.width}x${viewport.height}: cover clears the status`).toBeLessThan(layout.ownerTop);
      expect(layout.infoBottom + 8, `${viewport.width}x${viewport.height}: metrics clear the action`).toBeLessThanOrEqual(layout.actionsTop);
      expect(Math.abs(layout.buttonCenter - layout.shellCenter), `${viewport.width}x${viewport.height}: action is centered`).toBeLessThanOrEqual(1);
      expect(layout.buttonBottom, `${viewport.width}x${viewport.height}: action is fully visible`).toBeLessThanOrEqual(layout.shellBottom + 1);
      await expectNoShellOverflow(page, `ParseReady ${viewport.width}x${viewport.height}`);
    }

    for (const viewport of [
      { width: 430, height: 590 },
      { width: 402, height: 681 },
      { width: 402, height: 874 },
      { width: 360, height: 640 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.locator(".app-shell")).toHaveAttribute("data-device-layout", "phone");
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await expectLeftBack(`ParseReady phone ${viewport.width}x${viewport.height}`);
      const layout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>('.screen-content[data-screen="parseReady"]')!;
        main.style.scrollBehavior = "auto";
        main.scrollTop = 0;
        const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        const actions = document.querySelector<HTMLElement>(".parse-ready-actions")!;
        const shell = rect(".app-shell");
        const button = rect(".parse-ready-actions .button");
        return {
          position: getComputedStyle(actions).position,
          infoBottom: rect(".parse-info-grid").bottom,
          actionTop: rect(".parse-ready-actions").top,
          buttonCenter: button.left + button.width / 2,
          shellCenter: shell.left + shell.width / 2
        };
      });
      expect(layout.position, `${viewport.width}x${viewport.height}: action follows the information`).toBe("static");
      expect(layout.infoBottom + 8, `${viewport.width}x${viewport.height}: action does not cover the information`).toBeLessThanOrEqual(layout.actionTop);
      expect(Math.abs(layout.buttonCenter - layout.shellCenter), `${viewport.width}x${viewport.height}: action is centered`).toBeLessThanOrEqual(1);
      await expectReachable(page.locator(".parse-ready-actions .button"), `ParseReady phone ${viewport.width}x${viewport.height}`);
    }
  });

  test("keeps home, navigation, safe chrome, and primary actions usable in both mapped viewports", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await gotoApp(page);
    await expectShellMode(page, project.initialViewport, `${project.name} initial`);
    await expectReachable(page.locator(".home-primary-action"), `${project.name} initial primary action`);
    await expectReachable(page.locator(".primary-nav .nav-item").first(), `${project.name} initial navigation`);

    await page.setViewportSize(project.pairedViewport);
    await expectShellMode(page, project.pairedViewport, `${project.name} paired`);
    await expectReachable(page.locator(".home-import-course-action"), `${project.name} paired upload tool`);
    const statusBar = page.locator("[data-testid='ios-status-bar']");
    if (project.pairedViewport.height < 600) {
      await expect(statusBar).toBeHidden();
    } else {
      await expect(statusBar).toBeVisible();
    }
  });

  test("keeps Library cards usable and records the bounded current Study book-bar geometry", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await gotoApp(page);
    await openLibrary(page);
    await expect(page.locator(".primary-nav"), `${project.name} Library removes the primary navigation`).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "返回", exact: true }),
      `${project.name} Library retains an in-app return path`
    ).toBeVisible();
    const card = page.locator(".library-course-grid .course-space-card").first();
    await expect(card).toBeVisible();
    await expectHorizontallyInsideShell(card, `${project.name} library card`);
    await expectReachable(card.locator(".button-row .button"), `${project.name} library entry`);
    await card.locator(".button-row .button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleScreen(page);

    const initialGeometry = await readStudyBookBarGeometry(page);
    if (!initialGeometry) throw new Error("initial Study book-bar geometry is missing");
    await page.setViewportSize(project.pairedViewport);
    const pairedGeometry = await readStudyBookBarGeometry(page);
    if (!pairedGeometry) throw new Error("paired Study book-bar geometry is missing");
    await testInfo.attach("study-book-bar-geometry.json", {
      body: Buffer.from(JSON.stringify({
        project: project.name,
        initial: { viewport: project.initialViewport, ...initialGeometry },
        paired: { viewport: project.pairedViewport, ...pairedGeometry }
      }, null, 2)),
      contentType: "application/json"
    });
    for (const [mapping, viewport, geometry] of [
      ["initial", project.initialViewport, initialGeometry],
      ["paired", project.pairedViewport, pairedGeometry]
    ] as const) {
      testInfo.annotations.push({
        type: "study-book-bar-geometry",
        description: `${mapping} shell=${geometry.shellRight.toFixed(2)} bar=${geometry.barRight.toFixed(2)} add=${geometry.addRight.toFixed(2)} overhang=${geometry.overhang.toFixed(2)} at ${viewport.width}x${viewport.height}`
      });
      if (geometry.overhang > 1) {
        const isKnownIpadStudyBookBar = project.name === "ipad-pro-11"
          && viewport.width === 834
          && (viewport.height === 1194 || viewport.height === 1210);
        expect(isKnownIpadStudyBookBar, `${project.name} ${mapping}: no generic overflow allowance outside the exact iPad Study exception`).toBe(true);
        testInfo.annotations.push({
          type: "known-layout-overhang",
          description: `${mapping} exact iPad-only .study-book-bar/.study-add-button exception: shell=${geometry.shellRight.toFixed(2)} bar=${geometry.barRight.toFixed(2)} add=${geometry.addRight.toFixed(2)} overhang=${geometry.overhang.toFixed(2)} at ${viewport.width}x${viewport.height}`
        });
        expect(geometry.overhang, `${project.name} ${mapping}: known .study-book-bar overhang remains near the audited 9.05px`).toBeGreaterThanOrEqual(8);
        expect(geometry.overhang, `${project.name} ${mapping}: known .study-book-bar overhang remains tightly bounded`).toBeLessThanOrEqual(10);
        expect(geometry.addOverhang, `${project.name} ${mapping}: only the bar's add control shares the exact exception`).toBeGreaterThanOrEqual(8);
        expect(geometry.addOverhang, `${project.name} ${mapping}: add control exception remains tightly bounded`).toBeLessThanOrEqual(10);
      } else {
        expect(geometry.overhang, `${project.name} ${mapping}: Study book bar has strict no-overflow outside the named exception`).toBeLessThanOrEqual(1);
        expect(geometry.addOverhang, `${project.name} ${mapping}: Study add control has strict no-overflow outside the named exception`).toBeLessThanOrEqual(1);
      }
      expect(geometry.barLeft, `${project.name} ${mapping}: Study starts inside the shell`).toBeGreaterThanOrEqual(geometry.shellLeft - 1);
      expect(geometry.addCenterReachable, `${project.name} ${mapping}: edged add control remains center-reachable`).toBe(true);
    }
    await expectStrictHorizontalBounds(page, [
      ".screen-content",
      ".motion-screen-transition",
      ".motion-screen-surface[data-motion-surface='current']",
      ".book-course-screen",
      ".study-book-switch",
      ".study-plan-summary button",
      ".study-section-toggle",
      ".study-tool-card"
    ], `${project.name} paired strict Study surfaces and controls`);
    await expectNoShellOverflow(page, `${project.name} paired Study`);
  });

  test("keeps collapse, c2s1 flashcards, and their touch controls usable after viewport pairing", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openStudy(page);
    const chapter = page.locator("#study-chapter-c2-toggle");
    if (await chapter.getAttribute("aria-expanded") !== "true") {
      await chapter.focus();
      await expect(chapter).toBeFocused();
      await chapter.press("Enter");
      await expect(chapter).toHaveAttribute("aria-expanded", "true");
    }
    const section = page.locator("#study-section-c2s1-toggle");
    if (await section.getAttribute("aria-expanded") !== "true") {
      await section.focus();
      await expect(section).toBeFocused();
      await section.press("Enter");
      await expect(section).toHaveAttribute("aria-expanded", "true");
    }
    await expectReachable(section, `${project.name} chapter section toggle`);
    await page.setViewportSize(project.pairedViewport);
    await expectShellMode(page, project.pairedViewport, `${project.name} paired Study tools`);
    const toolGrid = page.locator("#study-section-c2s1-content .study-tool-grid");
    const toolGridLayout = await toolGrid.evaluate((element) => {
      const cards = Array.from(element.querySelectorAll<HTMLElement>(".study-tool-card"));
      const rows = cards.reduce<number[]>((rowTops, card) => {
        const top = card.offsetTop;
        if (!rowTops.some((rowTop) => Math.abs(rowTop - top) < 1)) rowTops.push(top);
        return rowTops;
      }, []);
      return {
        cardCount: cards.length,
        columnCount: getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
        itemsPerRow: rows.map((rowTop) => (
          cards.filter((card) => Math.abs(card.offsetTop - rowTop) < 1).length
        ))
      };
    });
    expect(toolGridLayout, `${project.name} Study tools retain the desktop-style 2 x 2 arrangement`).toEqual({
      cardCount: 4,
      columnCount: 2,
      itemsPerRow: [2, 2]
    });
    const flashcardTool = page.locator('#study-section-c2s1-content .study-tool-card[data-tool="flashcards"]');
    await expectReachable(flashcardTool, `${project.name} flashcard tool`);
    await flashcardTool.focus();
    await expect(flashcardTool).toBeFocused();
    await flashcardTool.press("Enter");
    await expect(page.locator(".flashcard-screen")).toBeVisible();
    await settleScreen(page);
    await expectHorizontallyInsideShell(page.locator(".memory-card"), `${project.name} flashcard`);
    await expectReachable(page.locator(".memory-reveal"), `${project.name} flashcard reveal`);
    await page.locator(".memory-reveal").click();
    await expect(page.locator(".memory-reveal")).toHaveAttribute("aria-pressed", "true");
    await expectNoShellOverflow(page, `${project.name} paired flashcard`);
  });

  test("keeps AI and ActionSheet surfaces inside the visual app viewport in both orientations", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await gotoApp(page);
    await page.locator(".ai-orb").click();
    const ai = page.locator(".ai-overlay");
    await expect(ai).toHaveAttribute("data-motion-state", "idle");
    await expectInsideShell(page, ai, `${project.name} initial AI`);
    await ai.locator(".ai-close").click();
    await expect(ai).toHaveCount(0);

    await openStudy(page);
    await page.setViewportSize(project.pairedViewport);
    await page.locator(".study-book-switch").click();
    const sheet = page.locator(".sheet");
    await expect(sheet).toHaveAttribute("data-motion-state", "idle");
    await expectInsideShell(page, sheet, `${project.name} paired ActionSheet`);
    await expectReachable(sheet.locator(".sheet-close"), `${project.name} paired sheet close`);
    await sheet.locator(".sheet-close").click();
    await expect(sheet).toHaveCount(0);
    await expectNoShellOverflow(page, `${project.name} overlay cleanup`);
  });

  test("keeps every current learning destination reachable with strict document, shell, screen, content, and control bounds", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const project = getResponsiveProject(testInfo.project.name);
    await openStudy(page);
    await page.setViewportSize(project.pairedViewport);
    await expectShellMode(page, project.pairedViewport, `${project.name} paired current destinations`);

    await openSourceReader(page);
    await expectCurrentScreenGeometry(page, ".source-reader-screen", [
      ".source-reader-note-shortcuts button:not(:disabled)",
      ".source-page-frame"
    ], `${project.name} SourceReader`);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await settleScreen(page);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleScreen(page);

    await page.locator(".screen-content").evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator(".study-plan-summary")).toHaveAttribute("data-plan-state", "expanded");
    const studyPlanEntry = page.locator(".study-plan-summary button");
    await activateUnobscuredWithKeyboard(studyPlanEntry, `${project.name} StudyPlan entry`);
    await expect(page.locator(".study-plan-screen")).toBeVisible();
    await settleScreen(page);
    await expectCurrentScreenGeometry(page, ".study-plan-screen", [
      ".plan-date-row button",
      ".study-plan-tasks",
      ".study-plan-tasks :is(.timeline-item, .study-plan-empty-state)"
    ], `${project.name} StudyPlan`);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleScreen(page);

    await expandCurrentStudySection(page);
    const assignmentTool = page.locator('#study-section-c2s1-content .study-tool-card[data-tool="assignment"]');
    await assignmentTool.focus();
    await expect(assignmentTool).toBeFocused();
    await assignmentTool.press("Enter");
    await expect(page.locator(".assignment-screen")).toBeVisible();
    await settleScreen(page);
    await advanceAssignmentToShortAnswer(page);
    await expectCurrentScreenGeometry(page, ".assignment-screen", [
      ".assignment-workspace",
      ".assignment-card",
      ".assignment-card textarea",
      ".assignment-primary-action .button"
    ], `${project.name} Assignment`);
    await page.locator(".assignment-card textarea").fill("Homologous chromosomes separate during meiosis I.");
    await page.locator(".assignment-primary-action .button").click();
    await expect(page.locator(".diagnosis-screen")).toBeVisible();
    await settleScreen(page);
    await expectCurrentScreenGeometry(page, ".diagnosis-screen", [
      ".diagnosis-workspace",
      ".diagnosis-card",
      ".diagnosis-knowledge-progress",
      ".diagnosis-actions .button"
    ], `${project.name} Diagnosis`);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    await settleScreen(page);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleScreen(page);

    await openLesson(page);
    await expectCurrentScreenGeometry(page, ".lesson-screen", [
      ".lesson-layout",
      ".lesson-reading-column",
      ".lesson-knowledge-pager",
      ".lesson-learning-page",
      ".lesson-source-link"
    ], `${project.name} Lesson article, concepts, and fixed completion action`);
    const lessonPager = page.locator(".lesson-knowledge-pager");
    const lessonProgress = lessonPager.getByRole("progressbar", { name: "章节学习进度" });
    const lessonPageCount = Number(await lessonProgress.getAttribute("aria-valuemax"));
    for (let pageIndex = 1; pageIndex < lessonPageCount; pageIndex += 1) {
      await lessonPager.focus();
      await lessonPager.press("ArrowRight");
    }
    await expect(page.locator(".lesson-floating-complete .button")).toBeVisible();
    await page.locator(".lesson-floating-complete .button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await expect(page.locator(".report-screen")).toHaveCount(0);
    await settleScreen(page);
    await page.locator(".primary-nav .nav-item").nth(3).click();
    await expect(page.locator(".profile-screen")).toBeVisible();
    await settleScreen(page);
    await expectCurrentScreenGeometry(page, ".profile-screen", [
      ".profile-workspace",
      ".profile-card",
      ".profile-today-card",
      ".profile-course-space-picker",
      ".profile-header-settings"
    ], `${project.name} Profile`);
    await page.getByRole("button", { name: "发现", exact: true }).click();
    await expect(page.locator(".community-screen")).toBeVisible();
    await settleScreen(page);
    await expectCurrentScreenGeometry(page, ".community-screen", [
      ".community-discovery-controls",
      ".community-grid",
      ".community-book-card"
    ], `${project.name} Community`);
  });

  test("keeps every Lesson article control and fixed completion action reachable in paired and shrunken visual viewports", async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    const project = getResponsiveProject(testInfo.project.name);
    await installVisualViewportShim(page);
    await openStudy(page);
    await page.setViewportSize(project.pairedViewport);
    await setVisualViewport(page, { height: project.pairedViewport.height, offsetTop: 0 });
    await openLesson(page);
    const lessonPager = page.locator(".lesson-knowledge-pager");
    await expect(lessonPager.locator(".lesson-introduction")).toBeVisible();
    await expect(lessonPager.locator(".lesson-source-link")).toBeVisible();
    await expect(lessonPager.locator(".lesson-page-controls")).toHaveCount(0);
    await expect(page.locator(".lesson-concepts, .concept-card-grid")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "完成本节", exact: true })).toHaveCount(0);
    await lessonPager.focus();
    await page.keyboard.press("ArrowRight");
    const lessonProgress = lessonPager.getByRole("progressbar", { name: "章节学习进度" });
    await expect(lessonProgress).toHaveAttribute("aria-valuenow", "2");
    await expect(lessonPager.locator(".lesson-source-link")).toBeVisible();
    const knowledgePageSelectors = [
      ".lesson-source-link",
      ".lesson-inline-figure"
    ];
    await expectCurrentScreenGeometry(page, ".lesson-screen", [
      ".lesson-layout",
      ".lesson-reading-column",
      ".lesson-knowledge-pager",
      ...knowledgePageSelectors
    ], `${project.name} Lesson paired viewport full-element geometry`);
    await expectAllControlsReachableInVisualViewport(
      page,
      ".lesson-source-link",
      `${project.name} Lesson paired visual viewport controls`
    );

    const lessonPageCount = Number(await lessonProgress.getAttribute("aria-valuemax"));
    for (let pageIndex = 2; pageIndex < lessonPageCount; pageIndex += 1) {
      await lessonPager.focus();
      await page.keyboard.press("ArrowRight");
    }
    await expect(lessonProgress).toHaveAttribute("aria-valuenow", String(lessonPageCount));
    await expect(page.getByRole("button", { name: "完成本节", exact: true })).toBeVisible();
    const finalLessonSelectors = [
      ".lesson-source-link",
      ".lesson-floating-complete .button"
    ];

    const shortLandscape = project.name === "small-phone-short-landscape";
    const offsetTop = Math.min(shortLandscape ? 32 : 24, Math.max(0, project.pairedViewport.height - 1));
    const shrunkenHeight = project.pairedViewport.height - offsetTop;
    await setVisualViewport(page, { height: shrunkenHeight, offsetTop });
    testInfo.annotations.push({
      type: "lesson-visual-viewport",
      description: `${project.name} physical=${project.pairedViewport.width}x${project.pairedViewport.height} visual=${shrunkenHeight}+${offsetTop}; shortLandscape=${shortLandscape}`
    });
    await expectCurrentScreenGeometry(page, ".lesson-screen", [
      ".lesson-layout",
      ".lesson-reading-column",
      ".lesson-knowledge-pager",
      ...finalLessonSelectors
    ], `${project.name} Lesson shrunken visual viewport full-element geometry`);
    await expectAllControlsReachableInVisualViewport(
      page,
      ".lesson-source-link, .lesson-floating-complete .button",
      `${project.name} Lesson shrunken visual viewport controls`
    );
    await expectNoShellOverflow(page, `${project.name} Lesson visual viewport cleanup`);
  });

  test("keeps upload error/selection status readable and direct under runtime reduced motion", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await gotoApp(page);
    await page.locator(".home-import-course-action").click();
    await expect(page.locator(".upload-flow-screen")).toBeVisible();
    await settleScreen(page);
    await page.setViewportSize(project.pairedViewport);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: "responsive.exe", mimeType: "application/octet-stream", buffer: Buffer.from("invalid") });
    await expect(page.locator(".upload-error")).toBeVisible();
    await expectHorizontallyInsideShell(page.locator(".upload-error"), `${project.name} upload validation`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "true");
    await input.setInputFiles({ name: "responsive.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 responsive") });
    const status = page.locator(".upload-status-feedback");
    await expect(status).toBeVisible();
    await expect(status).toHaveCSS("animation-name", "none");
    await expect(page.locator(".upload-add-tile.has-selection")).toContainText("文件一");
    await expect(page.locator(".upload-selection-summary")).toHaveCount(0);
    await expectReachable(page.locator(".upload-flow-primary > .button"), `${project.name} reduced upload action`);
    await expectNoShellOverflow(page, `${project.name} reduced upload`);
  });
});
