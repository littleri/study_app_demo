import type { Locator, Page } from "playwright/test";
import { expect, test } from "./fixtures";
import type { BookCourseApiFixture, StageSixFlowOptions } from "./fixtures/bookcourse-api";
import { getResponsiveProject, type CssViewport } from "./fixtures/viewports";
import { installVisualViewportShim, setVisualViewport } from "./fixtures/visual-viewport";

const normalTokens = {
  "--motion-duration-press": "90ms",
  "--motion-duration-fast": "140ms",
  "--motion-duration-base": "180ms",
  "--motion-duration-surface": "240ms",
  "--motion-duration-progress": "320ms",
  "--motion-duration-flip": "340ms",
  "--motion-duration-loading": "1200ms",
  "--motion-ease-standard": "cubic-bezier(.2, .8, .2, 1)",
  "--motion-ease-enter": "cubic-bezier(.16, 1, .3, 1)",
  "--motion-ease-exit": "cubic-bezier(.4, 0, 1, 1)",
  "--motion-distance-small": "6px",
  "--motion-distance-medium": "12px",
  "--motion-distance-panel": "20px"
} as const;

async function installMotionProbe(page: Page) {
  await page.evaluate(() => {
    const existing = document.querySelector("#motion-stage-one-probe");
    if (existing) return;

    const probe = document.createElement("section");
    probe.id = "motion-stage-one-probe";
    probe.setAttribute("aria-label", "Motion stage one probe");
    probe.style.cssText = "position:fixed;top:8px;left:8px;z-index:2147483647;display:flex;gap:8px;pointer-events:auto;";
    probe.innerHTML = `
      <button class="button button-primary" type="button">Probe button</button>
      <button class="icon-button" type="button" aria-label="Probe icon button">+</button>
      <svg class="spin" aria-hidden="true" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>
    `;
    document.body.append(probe);
  });
}

async function readTokens(page: Page) {
  return page.locator(".app-shell").evaluate((root) => {
    const style = getComputedStyle(root);
    const values = [
      "--motion-duration-press",
      "--motion-duration-fast",
      "--motion-duration-base",
      "--motion-duration-surface",
      "--motion-duration-progress",
      "--motion-duration-flip",
      "--motion-duration-loading",
      "--motion-ease-standard",
      "--motion-ease-enter",
      "--motion-ease-exit",
      "--motion-distance-small",
      "--motion-distance-medium",
      "--motion-distance-panel"
    ];
    return Object.fromEntries(values.map((name) => [name, style.getPropertyValue(name).trim()]));
  });
}

type ControlMetrics = {
  active: boolean;
  clientHeight: number;
  clientWidth: number;
  offsetHeight: number;
  offsetLeft: number;
  offsetTop: number;
  offsetWidth: number;
  transform: string;
  transitionDuration: string;
  transitionProperty: string;
};

type MotionTimerAudit = {
  active320: number;
  scheduled320: number;
};

type MotionPresenceHarnessCommand =
  | { type: "replace"; key: string; value: number }
  | { type: "setReducedMotion"; reducedMotion: boolean }
  | { type: "unmount" }
  | { type: "updateSameKey"; value: number };

async function readControlMetrics(page: Page, selector: string): Promise<ControlMetrics> {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      active: element.matches(":active"),
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      offsetHeight: element.offsetHeight,
      offsetLeft: element.offsetLeft,
      offsetTop: element.offsetTop,
      offsetWidth: element.offsetWidth,
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty
    };
  });
}

function expectLayoutFootprintToMatch(before: ControlMetrics, current: ControlMetrics) {
  expect(current.clientHeight).toBe(before.clientHeight);
  expect(current.clientWidth).toBe(before.clientWidth);
  expect(current.offsetHeight).toBe(before.offsetHeight);
  expect(current.offsetLeft).toBe(before.offsetLeft);
  expect(current.offsetTop).toBe(before.offsetTop);
  expect(current.offsetWidth).toBe(before.offsetWidth);
}

async function verifyPhysicalPress(
  page: Page,
  selector: string,
  expectedScale: "0.98" | "0.96"
) {
  const control = page.locator(selector);
  await control.scrollIntoViewIfNeeded();
  const before = await readControlMetrics(page, selector);
  const box = await control.boundingBox();
  if (!box) throw new Error(`Cannot press ${selector}: the control has no bounding box.`);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(() => readControlMetrics(page, selector)).toMatchObject({
      active: true,
      transform: `matrix(${expectedScale}, 0, 0, ${expectedScale}, 0, 0)`,
      transitionDuration: "0.09s",
      transitionProperty: "transform"
    });
    expectLayoutFootprintToMatch(before, await readControlMetrics(page, selector));
  } finally {
    await page.mouse.up();
  }

  await expect.poll(() => readControlMetrics(page, selector)).toMatchObject({
    active: false,
    transform: "none",
    transitionDuration: "0.14s",
    transitionProperty: "transform"
  });
  expectLayoutFootprintToMatch(before, await readControlMetrics(page, selector));
}

async function verifyReducedPhysicalPress(page: Page, selector: string) {
  const control = page.locator(selector);
  await control.scrollIntoViewIfNeeded();
  const before = await readControlMetrics(page, selector);
  const box = await control.boundingBox();
  if (!box) throw new Error(`Cannot press ${selector}: the control has no bounding box.`);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(() => readControlMetrics(page, selector)).toMatchObject({
      active: true,
      transform: "none",
      transitionDuration: "0s",
      transitionProperty: "none"
    });
    expectLayoutFootprintToMatch(before, await readControlMetrics(page, selector));
  } finally {
    await page.mouse.up();
  }

  await expect.poll(() => readControlMetrics(page, selector)).toMatchObject({
    active: false,
    transform: "none",
    transitionDuration: "0s",
    transitionProperty: "none"
  });
  expectLayoutFootprintToMatch(before, await readControlMetrics(page, selector));
}

async function readMotionTimerAudit(page: Page): Promise<MotionTimerAudit> {
  return page.evaluate(() => {
    const audit = (window as Window & { __motionTimerAudit?: MotionTimerAudit }).__motionTimerAudit;
    if (!audit) throw new Error("Motion timer audit is not installed.");
    return { active320: audit.active320, scheduled320: audit.scheduled320 };
  });
}

async function runMotionPresenceHarness(page: Page, command: MotionPresenceHarnessCommand) {
  await page.evaluate((instruction) => {
    const harness = (window as Window & {
      __motionPresenceHarness?: {
        replace: (key: string, value: number) => void;
        setReducedMotion: (reducedMotion: boolean) => void;
        unmount: () => void;
        updateSameKey: (value: number) => void;
      };
    }).__motionPresenceHarness;
    if (!harness) throw new Error("Motion presence harness is not ready.");

    switch (instruction.type) {
      case "replace":
        harness.replace(instruction.key, instruction.value);
        break;
      case "setReducedMotion":
        harness.setReducedMotion(instruction.reducedMotion);
        break;
      case "unmount":
        harness.unmount();
        break;
      case "updateSameKey":
        harness.updateSameKey(instruction.value);
        break;
    }
  }, command);
}

test.describe("Stage 1 motion foundations", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("exposes the locked normal tokens and root preference", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");

    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "false");
    expect(await readTokens(page)).toEqual(normalTokens);
  });

  test("keeps real Button and IconButton press feedback transform-only without changing layout bounds", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");
    await installMotionProbe(page);

    const iconButton = page.locator("#motion-stage-one-probe .icon-button");
    await verifyPhysicalPress(page, "#motion-stage-one-probe .button", "0.98");
    await verifyPhysicalPress(page, "#motion-stage-one-probe .icon-button", "0.96");

    await iconButton.focus();
    const focused = await readControlMetrics(page, "#motion-stage-one-probe .icon-button");
    expect(focused.transitionProperty).toBe("transform");

    const spinner = await page.locator("#motion-stage-one-probe .spin").evaluate((element) => {
      const style = getComputedStyle(element);
      return { duration: style.animationDuration, name: style.animationName };
    });
    expect(spinner).toEqual({ duration: "1.2s", name: "motion-spinner" });
  });

  test("keeps Presence fallback bound to its generation through payload updates, replace, reduce, and unmount", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/e2e/motion-presence-harness.html");

    const state = page.locator("#motion-presence-state");
    await expect(state).toHaveAttribute("data-state", "entering");
    await expect.poll(() => readMotionTimerAudit(page)).toEqual({ active320: 1, scheduled320: 1 });

    await page.clock.fastForward(100);
    await runMotionPresenceHarness(page, { type: "updateSameKey", value: 1 });
    await expect(state).toHaveAttribute("data-rendered-value", "1");
    await expect.poll(() => readMotionTimerAudit(page)).toEqual({ active320: 1, scheduled320: 1 });

    await page.clock.fastForward(100);
    await runMotionPresenceHarness(page, { type: "updateSameKey", value: 2 });
    await expect(state).toHaveAttribute("data-rendered-value", "2");
    await expect.poll(() => readMotionTimerAudit(page)).toEqual({ active320: 1, scheduled320: 1 });

    await page.clock.fastForward(100);
    await runMotionPresenceHarness(page, { type: "updateSameKey", value: 3 });
    await expect(state).toHaveAttribute("data-rendered-value", "3");
    await expect.poll(() => readMotionTimerAudit(page)).toEqual({ active320: 1, scheduled320: 1 });

    await page.clock.fastForward(21);
    await expect(state).toHaveAttribute("data-state", "idle");
    expect(await readMotionTimerAudit(page)).toEqual({ active320: 0, scheduled320: 1 });

    await runMotionPresenceHarness(page, { type: "replace", key: "beta", value: 4 });
    await expect(state).toHaveAttribute("data-state", "entering");
    await expect.poll(() => readMotionTimerAudit(page)).toEqual({ active320: 1, scheduled320: 2 });

    await page.clock.fastForward(160);
    await runMotionPresenceHarness(page, { type: "replace", key: "gamma", value: 5 });
    await expect(state).toHaveAttribute("data-rendered-key", "gamma");
    await expect.poll(() => readMotionTimerAudit(page)).toEqual({ active320: 1, scheduled320: 3 });

    await page.clock.fastForward(160);
    await expect(state).toHaveAttribute("data-state", "entering");
    await page.clock.fastForward(160);
    await expect(state).toHaveAttribute("data-state", "idle");

    await runMotionPresenceHarness(page, { type: "replace", key: "delta", value: 6 });
    await expect(state).toHaveAttribute("data-state", "entering");
    await expect.poll(() => readMotionTimerAudit(page)).toMatchObject({ active320: 1 });
    await page.clock.fastForward(100);
    await runMotionPresenceHarness(page, { type: "setReducedMotion", reducedMotion: true });
    await expect(state).toHaveAttribute("data-state", "idle");
    await expect.poll(() => readMotionTimerAudit(page)).toMatchObject({ active320: 0 });
    await page.clock.fastForward(320);
    await expect(state).toHaveAttribute("data-state", "idle");

    await runMotionPresenceHarness(page, { type: "setReducedMotion", reducedMotion: false });
    await runMotionPresenceHarness(page, { type: "replace", key: "epsilon", value: 7 });
    await expect(state).toHaveAttribute("data-state", "entering");
    await expect.poll(() => readMotionTimerAudit(page)).toMatchObject({ active320: 1 });
    await runMotionPresenceHarness(page, { type: "unmount" });
    await expect(page.locator("#motion-presence-root")).toBeEmpty();
    await expect.poll(() => readMotionTimerAudit(page)).toMatchObject({ active320: 0 });
    await page.clock.fastForward(320);
    expect(await readMotionTimerAudit(page)).toMatchObject({ active320: 0 });
  });

  test("updates the root and Stage 1 controls synchronously for reduced motion", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");
    await installMotionProbe(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(async () => page.locator(".app-shell").getAttribute("data-motion-reduced")).toBe("true");

    const reducedTokens = await readTokens(page);
    expect(reducedTokens).toMatchObject({
      "--motion-duration-press": "1ms",
      "--motion-duration-fast": "1ms",
      "--motion-duration-base": "1ms",
      "--motion-duration-surface": "1ms",
      "--motion-duration-progress": "1ms",
      "--motion-duration-flip": "1ms",
      "--motion-duration-loading": "1200ms",
      "--motion-distance-small": "0px",
      "--motion-distance-medium": "0px",
      "--motion-distance-panel": "0px"
    });

    await verifyReducedPhysicalPress(page, "#motion-stage-one-probe .button");
    await verifyReducedPhysicalPress(page, "#motion-stage-one-probe .icon-button");

    const spinner = await page.locator("#motion-stage-one-probe .spin").evaluate((element) => getComputedStyle(element).animationName);
    expect(spinner).toBe("none");

    await page.reload();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "true");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(async () => page.locator(".app-shell").getAttribute("data-motion-reduced")).toBe("false");
  });
});

type ProcessingMotionFixture = {
  requests: Array<{ method: string; path: string }>;
  useProcessingMotionFlow: (options?: { jobIds?: string[]; progressSequence?: number[] }) => void;
};

type ProcessingProgressMotion = {
  fillClientWidth: number;
  fillOffsetWidth: number;
  inlineTransform: string;
  inlineWidth: string;
  trackClientWidth: number;
  transformOrigin: string;
  transitionDuration: string;
  transitionProperty: string;
  transitionTimingFunction: string;
};

type StageCompletionMotion = {
  animationDuration: string;
  animationName: string;
  animationPlayState: string;
  animationTimingFunction: string;
  opacity: string;
  transform: string;
};

function processingJobReadCount(bookCourseApi: ProcessingMotionFixture, jobId: string) {
  return bookCourseApi.requests.filter((request) => (
    request.method === "GET" && request.path === `/api/jobs/${jobId}`
  )).length;
}

async function settleCurrentScreenTransition(page: Page) {
  const root = page.locator(".motion-screen-transition");
  if (await root.getAttribute("data-motion-state") === "entering") {
    await settleScreenTransition(page);
  }
  await expect(root).toHaveAttribute("data-motion-state", "idle");
}

async function startProcessingMotionJob(page: Page, filename: string) {
  const root = page.locator(".motion-screen-transition");
  if (await root.getAttribute("data-screen") !== "upload") {
    await page.locator(".nav-upload").click();
    await expect(root).toHaveAttribute("data-screen", "upload");
    await settleCurrentScreenTransition(page);
  }

  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from(`Processing motion fixture for ${filename}`)
  });
  await expect(page.locator(".parse-ready-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);

  await page.locator(".parse-flow-actions .button").first().click();
  await expect(page.locator(".processing-flow-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function readProcessingProgressMotion(page: Page): Promise<ProcessingProgressMotion> {
  return page.locator(".processing-card .progress-fill").evaluate((fill) => {
    const track = fill.parentElement;
    if (!track) throw new Error("Processing progress fill is missing its track.");
    const style = getComputedStyle(fill);
    return {
      fillClientWidth: fill.clientWidth,
      fillOffsetWidth: fill.offsetWidth,
      inlineTransform: (fill as HTMLElement).style.transform,
      inlineWidth: (fill as HTMLElement).style.width,
      trackClientWidth: track.clientWidth,
      transformOrigin: style.transformOrigin,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      transitionTimingFunction: style.transitionTimingFunction
    };
  });
}

async function expectProcessingProgress(page: Page, value: number, reducedMotion = false) {
  const expectedScale = value / 100;
  await expect(page.locator(".processing-card strong")).toHaveText(`${value}%`);
  await expect(page.locator(".processing-card .progress-wrap")).toHaveAttribute("aria-label", new RegExp(`${value}%$`));

  const motion = await readProcessingProgressMotion(page);
  expect(motion.inlineTransform).toBe(`scaleX(${expectedScale})`);
  expect(motion.inlineWidth).toBe("");
  expect(motion.fillClientWidth).toBe(motion.trackClientWidth);
  expect(motion.fillOffsetWidth).toBe(motion.trackClientWidth);
  expect(Number.parseFloat(motion.transformOrigin)).toBe(0);

  if (reducedMotion) {
    expect(motion.transitionDuration).toBe("0s");
    expect(motion.transitionProperty).toBe("none");
  } else {
    expect(motion.transitionDuration).toBe("0.32s");
    expect(motion.transitionProperty).toBe("transform");
    expect(normalizeTimingFunction(motion.transitionTimingFunction)).toBe("cubic-bezier(0.2,0.8,0.2,1)");
  }
}

async function readStageCompletionMotion(check: Locator): Promise<StageCompletionMotion> {
  return check.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      animationPlayState: style.animationPlayState,
      animationTimingFunction: style.animationTimingFunction,
      opacity: style.opacity,
      transform: style.transform
    };
  });
}

function expectedStageCompletionDuration(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Stage completion motion needs a configured viewport.");
  return viewport.height < 600 && viewport.width > viewport.height ? "0.14s" : "0.18s";
}

async function expectEnteringStageChecks(page: Page, jobId: string, indexes: number[]) {
  const checks = page.locator(".stage-completion-check");
  await expect(checks).toHaveCount(indexes.length);

  for (const index of indexes) {
    const key = `parse:${jobId}:stage:${index}`;
    const check = page.locator(`[data-motion-stage-key="${key}"]`);
    await expect(check).toHaveAttribute("data-motion-stage-state", "entering");
    const motion = await readStageCompletionMotion(check);
    expect(motion).toMatchObject({
      animationDuration: expectedStageCompletionDuration(page),
      animationName: "motion-stage-check-in",
      animationPlayState: "paused"
    });
    expect(normalizeTimingFunction(motion.animationTimingFunction)).toBe("cubic-bezier(0.16,1,0.3,1)");
    expect(Number(motion.opacity)).toBe(0);
    expect(scaleFromTransform(motion.transform)).toBeCloseTo(0.85, 3);
  }
}

async function settleStageChecks(
  page: Page,
  jobId: string,
  indexes: number[],
  eventType: "animationend" | "animationcancel" = "animationend"
) {
  for (const index of indexes) {
    await page.locator(`[data-motion-stage-key="parse:${jobId}:stage:${index}"]`).evaluate((element, type) => {
      element.dispatchEvent(new AnimationEvent(type, { animationName: "motion-stage-check-in", bubbles: true }));
    }, eventType);
  }
}

async function expectIdleStageChecks(page: Page, jobId: string, indexes: number[], label: string) {
  for (const index of indexes) {
    const check = page.locator(`[data-motion-stage-key="parse:${jobId}:stage:${index}"]`);
    await expect(check, `${label}: stage ${index + 1} settles to idle`).toHaveAttribute("data-motion-stage-state", "idle");
    expect((await readStageCompletionMotion(check)).animationName, `${label}: stage ${index + 1} has no residual animation`).toBe("none");
  }
}

test.describe("Stage 3A Processing progress and first-play motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("uses transform-only continuous progress and one first-play check per stage under the StrictMode app root", async ({ page, bookCourseApi }) => {
    const fixture = bookCourseApi as ProcessingMotionFixture;
    const jobA = "job_processing_motion_a";
    const jobB = "job_processing_motion_b";
    fixture.useProcessingMotionFlow({
      jobIds: [jobA, jobB],
      progressSequence: [0, 1, 50, 50, 99, 100]
    });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/?embedded=device-preview");

    await startProcessingMotionJob(page, "processing-motion-a.pdf");
    await expect(page.locator(".stage-list")).toHaveAttribute("aria-label");
    await expectProcessingProgress(page, 0);
    expect(processingJobReadCount(fixture, jobA)).toBe(1);

    await page.clock.fastForward(2500);
    await expectProcessingProgress(page, 1);
    expect(processingJobReadCount(fixture, jobA)).toBe(2);

    const stagePause = await page.addStyleTag({
      content: ".stage-completion-check[data-motion-stage-state='entering'] { animation-play-state: paused !important; }"
    });
    try {
      await page.clock.fastForward(2500);
      await expectProcessingProgress(page, 50);
      await expectEnteringStageChecks(page, jobA, [0, 1]);
      expect(processingJobReadCount(fixture, jobA)).toBe(3);

      await page.clock.fastForward(2500);
      await expectProcessingProgress(page, 50);
      await expectEnteringStageChecks(page, jobA, [0, 1]);
      expect(processingJobReadCount(fixture, jobA)).toBe(4);

      await page.clock.fastForward(2500);
      await expectProcessingProgress(page, 99);
      await expectEnteringStageChecks(page, jobA, [0, 1, 2, 3]);
      expect(processingJobReadCount(fixture, jobA)).toBe(5);

      await page.clock.fastForward(2500);
      await expectProcessingProgress(page, 100);
      await expectEnteringStageChecks(page, jobA, [0, 1, 2, 3]);
      expect(processingJobReadCount(fixture, jobA)).toBe(6);

      await settleStageChecks(page, jobA, [0], "animationcancel");
      await expectIdleStageChecks(page, jobA, [0], "canceled stage feedback");
      await settleStageChecks(page, jobA, [1, 2, 3]);
      await expectIdleStageChecks(page, jobA, [0, 1, 2, 3], "completed stage feedback");
    } finally {
      await removeStyleTag(stagePause);
    }

    const root = page.locator(".motion-screen-transition");
    await page.locator(".header-bar .icon-button").click();
    await expect(root).toHaveAttribute("data-screen", "parseReady");
    await settleCurrentScreenTransition(page);
    await page.locator(".parse-flow-actions .button").first().click();
    await expect(root).toHaveAttribute("data-screen", "processing");
    await settleCurrentScreenTransition(page);

    const reenteredChecks = page.locator(".stage-completion-check");
    await expect(reenteredChecks).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      const key = `parse:${jobA}:stage:${index}`;
      const check = page.locator(`[data-motion-stage-key="${key}"]`);
      await expect(check).toHaveAttribute("data-motion-stage-state", "idle");
      expect((await readStageCompletionMotion(check)).animationName).toBe("none");
    }
    expect(processingJobReadCount(fixture, jobA)).toBe(6);

    await page.locator(".header-bar .icon-button").click();
    await expect(root).toHaveAttribute("data-screen", "parseReady");
    await settleCurrentScreenTransition(page);
    await page.locator(".parse-flow-actions .button").nth(2).click();
    await expect(root).toHaveAttribute("data-screen", "upload");
    await settleCurrentScreenTransition(page);

    await startProcessingMotionJob(page, "processing-motion-b.pdf");
    await expectProcessingProgress(page, 0);
    await page.clock.fastForward(2500);
    await expectProcessingProgress(page, 1);
    const newJobStagePause = await page.addStyleTag({
      content: ".stage-completion-check[data-motion-stage-state='entering'] { animation-play-state: paused !important; }"
    });
    try {
      await page.clock.fastForward(2500);
      await expectProcessingProgress(page, 50);
      await expectEnteringStageChecks(page, jobB, [0, 1]);
    } finally {
      await removeStyleTag(newJobStagePause);
    }
    expect(processingJobReadCount(fixture, jobA)).toBe(6);
    expect(processingJobReadCount(fixture, jobB)).toBe(3);
  });

  test("applies reduced motion directly while preserving Processing ARIA and polling", async ({ page, bookCourseApi }) => {
    const fixture = bookCourseApi as ProcessingMotionFixture;
    const jobA = "job_processing_motion_a";
    fixture.useProcessingMotionFlow({ jobIds: [jobA], progressSequence: [0, 1, 50] });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?embedded=device-preview");

    await startProcessingMotionJob(page, "processing-motion-reduced.pdf");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "true");
    await expect(page.locator(".stage-list")).toHaveAttribute("aria-label");
    await expectProcessingProgress(page, 0, true);
    await page.clock.fastForward(2500);
    await expectProcessingProgress(page, 1, true);
    await page.clock.fastForward(2500);
    await expectProcessingProgress(page, 50, true);

    const checks = page.locator(".stage-completion-check");
    await expect(checks).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const check = page.locator(`[data-motion-stage-key="parse:${jobA}:stage:${index}"]`);
      await expect(check).toHaveAttribute("data-motion-stage-state", "idle");
      const motion = await readStageCompletionMotion(check);
      expect(motion.animationName).toBe("none");
      expect(Number(motion.opacity)).toBe(1);
      expect(scaleFromTransform(motion.transform)).toBeCloseTo(1, 3);
    }
    expect(processingJobReadCount(fixture, jobA)).toBe(3);
  });

  test("settles active Processing checks on runtime reduced motion without replaying their consumed keys", async ({ page, bookCourseApi }) => {
    const fixture = bookCourseApi as ProcessingMotionFixture;
    const jobA = "job_processing_motion_a";
    fixture.useProcessingMotionFlow({ jobIds: [jobA], progressSequence: [0, 1, 50, 50] });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/?embedded=device-preview");
    await startProcessingMotionJob(page, "processing-motion-runtime-reduce.pdf");
    await page.clock.fastForward(2500);
    const stagePause = await page.addStyleTag({
      content: ".stage-completion-check[data-motion-stage-state='entering'] { animation-play-state: paused !important; }"
    });
    try {
      await page.clock.fastForward(2500);
      await expectEnteringStageChecks(page, jobA, [0, 1]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "true");
      await expectIdleStageChecks(page, jobA, [0, 1], "runtime reduced Processing feedback");

      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "false");
      await expectIdleStageChecks(page, jobA, [0, 1], "restored Processing preference keeps consumed feedback idle");
      await page.clock.fastForward(2500);
      await expectProcessingProgress(page, 50);
      await expectIdleStageChecks(page, jobA, [0, 1], "same-status poll after runtime reduce");
    } finally {
      await removeStyleTag(stagePause);
    }
  });
});

type StageThreeB1Fixture = {
  requests: Array<{ method: string; path: string }>;
  useProcessingMotionFlow: (options?: { jobIds?: string[]; progressSequence?: number[] }) => void;
  useStageFourFlow: (options?: { mode?: "success" | "failed"; progress?: number }) => void;
};

type LocalFeedbackMotion = {
  animationDuration: string;
  animationName: string;
  animationPlayState: string;
  animationTimingFunction: string;
  opacity: string;
  transform: string;
};

const stageThreeB1LongFilename = `${"stage-three-b1-long-source-".repeat(8)}upload.pdf`;
const failedResource500ConsoleError = "Failed to load resource: the server responded with a status of 500 (Internal Server Error)";
const failedResource404ConsoleError = "Failed to load resource: the server responded with a status of 404 (Not Found)";

function unexpectedConsoleErrors(actual: readonly string[], expected: readonly string[]) {
  const remaining = [...actual];
  for (const message of expected) {
    const index = remaining.indexOf(message);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

function assertAndAcknowledgeExactConsoleErrors(
  fixture: { consoleErrors: string[] },
  expected: readonly string[],
  label: string
) {
  expect(fixture.consoleErrors, `${label}: console error count is exact`).toHaveLength(expected.length);
  expect(unexpectedConsoleErrors(fixture.consoleErrors, expected), `${label}: only the explicitly expected console errors are present`).toEqual([]);
  fixture.consoleErrors.splice(0, fixture.consoleErrors.length);
}

function isShortLandscape(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Stage 3B1 feedback motion needs a configured viewport.");
  return viewport.height < 600 && viewport.width > viewport.height;
}

function expectedLocalFeedbackDuration(page: Page) {
  return isShortLandscape(page) ? "0.14s" : "0.18s";
}

function expectedSuccessMarkDuration(page: Page) {
  return isShortLandscape(page) ? "0.18s" : "0.24s";
}

function expectedLocalFeedbackDistance(page: Page) {
  return isShortLandscape(page) ? 4 : 6;
}

function stageThreeB1JobReadCount(fixture: StageThreeB1Fixture, jobId: string) {
  return fixture.requests.filter((request) => request.method === "GET" && request.path === `/api/jobs/${jobId}`).length;
}

async function readLocalFeedbackMotion(locator: Locator): Promise<LocalFeedbackMotion> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      animationPlayState: style.animationPlayState,
      animationTimingFunction: style.animationTimingFunction,
      opacity: style.opacity,
      transform: style.transform
    };
  });
}

function localTransformComponents(transform: string) {
  if (transform === "none") return { scale: 1, y: 0 };
  const matrix = transform.match(/^matrix\((.+)\)$/)?.[1].split(",").map((value) => Number.parseFloat(value.trim()));
  if (matrix?.length === 6 && matrix.every(Number.isFinite)) return { scale: matrix[0], y: matrix[5] };
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)?.[1].split(",").map((value) => Number.parseFloat(value.trim()));
  if (matrix3d?.length === 16 && matrix3d.every(Number.isFinite)) return { scale: matrix3d[0], y: matrix3d[13] };
  throw new Error(`Expected a CSS transform matrix, received ${transform}.`);
}

async function expectPausedLocalFeedback(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: local feedback is rendered`).toBeVisible();
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: feedback uses the local Base/Fast enter mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-local-status-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: feedback uses the locked enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: feedback begins transparent`).toBe(0);
  expect(localTransformComponents(motion.transform).y, `${label}: feedback begins at the locked local distance`).toBeCloseTo(expectedLocalFeedbackDistance(page), 4);
}

async function expectPausedSuccessMark(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: success mark is rendered`).toBeVisible();
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: success mark uses the Surface/Base enter mapping`
  }).toMatchObject({
    animationDuration: expectedSuccessMarkDuration(page),
    animationName: "motion-success-mark-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: success mark uses the locked enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: success mark begins transparent`).toBe(0);
  expect(localTransformComponents(motion.transform).scale, `${label}: success mark begins at the locked local scale`).toBeCloseTo(0.96, 4);
}

async function expectReducedLocalFeedback(locator: Locator, label: string) {
  await expect(locator, `${label}: local feedback is rendered`).toBeVisible();
  const motion = await readLocalFeedbackMotion(locator);
  expect(motion.animationName, `${label}: reduced motion has no local animation`).toBe("none");
  expect(motion.opacity, `${label}: reduced motion renders the final opacity`).toBe("1");
  expect(motion.transform, `${label}: reduced motion renders the final transform`).toBe("none");
}

async function expectSingleParseStatusAccessibility(locator: Locator, label: string) {
  await expect(locator, `${label}: one complete parse status region is rendered`).toBeVisible();
  await expect(locator).toHaveAttribute("role", "status");
  await expect(locator).toHaveAttribute("aria-live", "polite");
  await expect(locator).toHaveAttribute("aria-atomic", "true");
  await expect(locator.locator("[role='alert']"), `${label}: failure detail is not announced a second time`).toHaveCount(0);
  const progressLabel = await locator.locator(".progress-wrap").getAttribute("aria-label");
  expect(progressLabel, `${label}: progress remains named in the accessibility tree`).toMatch(/^解析进度 \d+%$/);
  const snapshot = await locator.ariaSnapshot();
  expect(snapshot, `${label}: status tree includes its visible state label`).toContain(await locator.locator(".pill").innerText());
  expect(snapshot, `${label}: status tree includes the detailed dynamic message`).toContain(await locator.locator("p").innerText());
  expect(snapshot, `${label}: status tree includes current progress`).toContain(progressLabel);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )), { message: `${label}: no horizontal document overflow is introduced` }).toBe(true);
}

async function installStageThreeB1CoverRoute(page: Page) {
  await page.route("**/api/books/*/pages/1/image", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="0 0 2 2"><rect width="2" height="2" fill="#dceafe"/></svg>'
    });
  });
}

async function openStageThreeB1Upload(
  page: Page,
  fixture: StageThreeB1Fixture,
  options?: { mode?: "success" | "failed"; progress?: number }
) {
  fixture.useStageFourFlow(options);
  await installStageThreeB1CoverRoute(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem("bookcourse-active-parse-session");
  });
  await page.goto("/?embedded=device-preview");
  await settleCurrentScreenTransition(page);
  await page.locator(".nav-upload").click();
  await expect(page.locator(".upload-flow-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function uploadStageThreeB1File(page: Page, filename = stageThreeB1LongFilename) {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from(`Stage 3B1 fixture for ${filename}`)
  });
}

async function activateStageThreeB1Control(locator: Locator) {
  await locator.focus();
  await locator.press("Enter");
}

async function openStageThreeB1Library(page: Page) {
  await activateStageThreeB1Control(page.locator(".parse-flow-actions .button").nth(1));
  await expect(page.locator(".home-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
  await activateStageThreeB1Control(page.locator(".home-screen .section .inline-link"));
  await expect(page.locator(".library-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function prepareStageThreeB2AChapterConfirm(page: Page, fixture: StageThreeB1Fixture) {
  fixture.useStageFourFlow();
  await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
  await page.addInitScript(() => {
    window.localStorage.removeItem("bookcourse-active-parse-session");
  });
  await installStageThreeB1CoverRoute(page);
  await page.goto("/?embedded=device-preview");
  await startProcessingMotionJob(page, "chapter-confirm-motion-fixture.pdf");
  await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(1);
}

async function finishStageThreeB2AChapterConfirm(page: Page) {
  await page.clock.fastForward(2500);
  await expect(page.locator(".chapter-confirm-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
  await expect(page.locator(".toc-directory")).toBeVisible();
}

async function pauseChapterConfirmFeedback(page: Page) {
  return page.addStyleTag({
    content: ".chapter-status-mark[data-motion-chapter-state='entering'], .toc-entry[data-motion-chapter-selection='entering'], .chapter-save-feedback[data-motion-chapter-save='entering'], .toc-directory-feedback[data-motion-chapter-feedback='entering'], .chapter-confirm-action-feedback { animation-play-state: paused !important; }"
  });
}

async function expectPausedChapterStatusMark(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: chapter status mark is rendered`).toBeVisible();
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: chapter status mark uses the Base/Fast enter mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-chapter-check-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: chapter status mark uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: chapter status mark begins transparent`).toBe(0);
  expect(localTransformComponents(motion.transform).scale, `${label}: chapter status mark begins at the locked scale`).toBeCloseTo(0.85, 4);
}

async function expectPausedChapterSelection(locator: Locator, page: Page, label: string) {
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: selected chapter uses the Base/Fast enter mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-chapter-selection-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: selected chapter uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: selected chapter begins at the local opacity`).toBeCloseTo(0.72, 3);
  expect(localTransformComponents(motion.transform).y, `${label}: selected chapter begins at the local distance`).toBeCloseTo(expectedLocalFeedbackDistance(page), 4);
}

async function expectPausedChapterFeedback(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: local chapter feedback is rendered`).toBeVisible();
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: local chapter feedback uses the Base/Fast enter mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-chapter-feedback-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: local chapter feedback uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: local chapter feedback begins transparent`).toBe(0);
  expect(localTransformComponents(motion.transform).y, `${label}: local chapter feedback begins at the local distance`).toBeCloseTo(expectedLocalFeedbackDistance(page), 4);
}

async function settleChapterFeedback(locator: Locator, animationName: string) {
  await locator.evaluate((element, name) => {
    element.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
  }, animationName);
}

function usesTabletChapterWorkspaceForMotion(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("ChapterConfirm feedback needs a configured viewport.");
  return viewport.width >= 768 && viewport.height >= 600;
}

async function savePrimaryChapterForMotion(page: Page) {
  if (usesTabletChapterWorkspaceForMotion(page)) {
    const form = page.locator(".chapter-detail-form");
    const courseTitle = form.locator("input").nth(1);
    await courseTitle.fill(`${await courseTitle.inputValue()} revised`);
    await form.getByRole("button", { name: "保存本章修改", exact: true }).click();
    return;
  }

  await page.locator(".toc-entry-title").first().click();
  const editor = page.locator(".sheet[data-sheet-type='editChapter']");
  await expect(editor).toBeVisible();
  await finishActionSheetAnimation(page);
  const courseTitle = editor.locator("input").nth(1);
  await courseTitle.fill(`${await courseTitle.inputValue()} revised`);
  await editor.getByRole("button", { name: "保存本章修改", exact: true }).click();
  await finishActionSheetAnimation(page);
  await expect(editor).toHaveCount(0);
}

async function savePrimaryChapterUnderReducedMotionForMotion(page: Page) {
  if (usesTabletChapterWorkspaceForMotion(page)) {
    await savePrimaryChapterForMotion(page);
    return;
  }

  await page.locator(".toc-entry-title").first().click();
  const editor = page.locator(".sheet[data-sheet-type='editChapter']");
  await expect(editor).toBeVisible();
  const courseTitle = editor.locator("input").nth(1);
  await courseTitle.fill(`${await courseTitle.inputValue()} revised`);
  await editor.getByRole("button", { name: "保存本章修改", exact: true }).click();
  await expect(editor, "reduced-motion chapter save closes its sheet synchronously").toHaveCount(0);
}

test.describe("Stage 3B1 upload, parse-ready, and library status feedback", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unacknowledged console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("keeps upload success, background progress, and completed-library feedback local across the four viewport mappings", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openStageThreeB1Upload(page, fixture, { progress: 42 });

    let releaseUpload: (() => void) | undefined;
    let resolveUploadIntercepted: (() => void) | undefined;
    const uploadIntercepted = new Promise<void>((resolve) => {
      resolveUploadIntercepted = resolve;
    });
    await page.route("**/api/uploads/init", async (route) => {
      await new Promise<void>((resolve) => {
        releaseUpload = resolve;
        resolveUploadIntercepted?.();
      });
      await route.fallback();
    });
    const feedbackPause = await page.addStyleTag({
      content: ".upload-status-feedback, .parse-status-feedback, .library-status-feedback, .upload-success-mark, .library-status-success-mark { animation-play-state: paused !important; }"
    });

    try {
      await uploadStageThreeB1File(page);
      await uploadIntercepted;
      await expect(page.locator(".upload-add-tile.is-loading")).toBeVisible();
      const uploadFeedback = page.locator(".upload-source-copy .upload-status-feedback");
      await expectPausedLocalFeedback(uploadFeedback, page, `${testInfo.project.name}: uploading`);
      await expect(uploadFeedback).toHaveAttribute("aria-live", "polite");
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: uploading a long filename`);

      releaseUpload?.();
      releaseUpload = undefined;
      await expect(page.locator(".parse-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const uploadSuccessMark = page.locator(".parse-ready-screen .upload-success-mark");
      await expectPausedSuccessMark(uploadSuccessMark, page, `${testInfo.project.name}: upload success`);
      await expect(uploadSuccessMark).toHaveAttribute("aria-hidden", "true");
      const parseFeedback = page.locator(".parse-status-feedback");
      await expectPausedLocalFeedback(parseFeedback, page, `${testInfo.project.name}: background parse status`);
      await expectSingleParseStatusAccessibility(parseFeedback, `${testInfo.project.name}: running parse status`);
      await expect(page.locator(".parse-flow-support [role='status']")).toHaveCount(1);
      await expect(page.locator(".parse-file-card h2")).toContainText(stageThreeB1LongFilename);
      await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(1);

      await openStageThreeB1Library(page);
      const libraryFeedback = page.locator(".library-status-feedback");
      await expectPausedLocalFeedback(libraryFeedback, page, `${testInfo.project.name}: library background status`);
      await expect(libraryFeedback.locator(".library-status-heading")).toHaveAttribute("aria-live", "polite");
      await expect(libraryFeedback.locator(".library-status-heading")).toHaveAttribute("role", "status");
      expect(await libraryFeedback.locator(".progress-fill").evaluate((element) => (element as HTMLElement).style.transform)).toBe("scaleX(0.42)");
      expect(await page.locator(".course-space-card").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

      await page.clock.fastForward(2500);
      await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(2);
      const librarySuccessMark = page.locator(".library-status-success-mark");
      await expectPausedSuccessMark(librarySuccessMark, page, `${testInfo.project.name}: library completion`);
      await expect(page.locator(".library-status-feedback")).toHaveCount(1);
      expect(await page.locator(".course-space-card").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: completed library status`);

      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/uploads/init")).toHaveLength(1);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/files")).toHaveLength(1);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/parse")).toHaveLength(1);
    } finally {
      releaseUpload?.();
      await removeStyleTag(feedbackPause);
    }
  });

  test("makes a failed upload clear, local, and retryable without changing the successful request path", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openStageThreeB1Upload(page, fixture);

    let initAttempts = 0;
    await page.route("**/api/uploads/init", async (route) => {
      initAttempts += 1;
      if (initAttempts === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ code: "upload_bootstrap_failed", message: "Upload bootstrap failed for the local retry fixture." })
        });
        return;
      }
      await route.fallback();
    });
    const feedbackPause = await page.addStyleTag({ content: ".upload-status-feedback { animation-play-state: paused !important; }" });

    try {
      await uploadStageThreeB1File(page, `${"upload-retry-".repeat(10)}fixture.pdf`);
      const uploadError = page.locator(".upload-error");
      await expect(uploadError).toContainText("Upload bootstrap failed");
      await expect(uploadError).toHaveAttribute("role", "alert");
      await expect(uploadError.locator("svg")).toHaveCount(1);
      await expectPausedLocalFeedback(uploadError, page, `${testInfo.project.name}: upload failure`);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: upload failure text`);
      expect(initAttempts, `${testInfo.project.name}: only the explicit /api/uploads/init failure route has run`).toBe(1);
      await expect.poll(() => fixture.consoleErrors).toEqual([failedResource500ConsoleError]);
      assertAndAcknowledgeExactConsoleErrors(
        fixture,
        [failedResource500ConsoleError],
        `${testInfo.project.name}: expected /api/uploads/init 500`
      );

      await uploadStageThreeB1File(page, "upload-retry-success.pdf");
      await expect(page.locator(".parse-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      expect(initAttempts).toBe(2);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/uploads/init")).toHaveLength(1);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/files")).toHaveLength(1);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/parse")).toHaveLength(1);
    } finally {
      await removeStyleTag(feedbackPause);
    }
  });

  test("keeps parse and library failures explicit, local, and connected to the existing retry route", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openStageThreeB1Upload(page, fixture, { mode: "failed" });
    const feedbackPause = await page.addStyleTag({ content: ".parse-status-feedback, .library-status-feedback { animation-play-state: paused !important; }" });

    try {
      await uploadStageThreeB1File(page);
      await expect(page.locator(".parse-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(1);
      const parseFeedback = page.locator(".parse-status-feedback");
      await expect(parseFeedback).toContainText("Retry after");
      await expectPausedLocalFeedback(parseFeedback, page, `${testInfo.project.name}: parse failure`);
      await expectSingleParseStatusAccessibility(parseFeedback, `${testInfo.project.name}: failed parse status`);
      await expect(page.locator(".parse-flow-support [role='status']")).toHaveCount(1);
      await expect(page.locator(".parse-status-heading svg")).toHaveCount(1);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: parse failure text`);

      await activateStageThreeB1Control(page.locator(".parse-flow-actions .button").first());
      await expect(page.locator(".processing-flow-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await activateStageThreeB1Control(page.locator(".processing-flow-actions .button"));
      await expect(page.locator(".parse-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      expect(stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(1);
      await expectSingleParseStatusAccessibility(
        page.locator(".parse-status-feedback"),
        `${testInfo.project.name}: retry returns the original detailed failure status`
      );

      await openStageThreeB1Library(page);
      const libraryFeedback = page.locator(".library-status-feedback");
      await expectPausedLocalFeedback(libraryFeedback, page, `${testInfo.project.name}: library failure`);
      await expect(libraryFeedback.locator(".library-status-heading")).toHaveAttribute("aria-live", "polite");
      await expect(libraryFeedback.locator(".library-status-heading")).toHaveAttribute("role", "status");
      await expect(libraryFeedback.locator(".library-status-heading svg")).toHaveCount(1);
      await expect(libraryFeedback).toContainText("Retry after");
      expect(await page.locator(".course-space-card").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: library failure text`);
    } finally {
      await removeStyleTag(feedbackPause);
    }
  });

  test("does not replay a library processing feedback surface for same-status polling updates", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    fixture.useProcessingMotionFlow({ progressSequence: [0, 1, 50, 50] });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.addInitScript(() => {
      window.localStorage.removeItem("bookcourse-active-parse-session");
    });
    await installStageThreeB1CoverRoute(page);
    await page.goto("/?embedded=device-preview");
    await startProcessingMotionJob(page, "stage-three-b1-same-status.pdf");
    await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_processing_motion_a")).toBe(1);
    const feedbackPause = await page.addStyleTag({ content: ".library-status-feedback { animation-play-state: paused !important; }" });

    try {
      await activateStageThreeB1Control(page.locator(".processing-flow-actions .button"));
      await expect(page.locator(".home-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await activateStageThreeB1Control(page.locator(".home-screen .section .inline-link"));
      await expect(page.locator(".library-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const libraryFeedback = page.locator(".library-status-feedback");
      await expectPausedLocalFeedback(libraryFeedback, page, `${testInfo.project.name}: initial library processing`);
      const initialNode = await libraryFeedback.elementHandle();
      if (!initialNode) throw new Error("Library processing feedback did not expose a DOM node.");
      expect(await libraryFeedback.locator(".progress-fill").evaluate((element) => (element as HTMLElement).style.transform)).toBe("scaleX(0)");

      await page.clock.fastForward(2500);
      await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_processing_motion_a")).toBe(2);
      await expect.poll(() => libraryFeedback.locator(".progress-fill").evaluate((element) => (element as HTMLElement).style.transform)).toBe("scaleX(0.01)");
      expect(await initialNode.evaluate((element) => element.isConnected && element === document.querySelector(".library-status-feedback"))).toBe(true);

      await page.clock.fastForward(2500);
      await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_processing_motion_a")).toBe(3);
      await expect.poll(() => libraryFeedback.locator(".progress-fill").evaluate((element) => (element as HTMLElement).style.transform)).toBe("scaleX(0.5)");
      await page.clock.fastForward(2500);
      await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_processing_motion_a")).toBe(4);
      await expect.poll(() => libraryFeedback.locator(".progress-fill").evaluate((element) => (element as HTMLElement).style.transform)).toBe("scaleX(0.5)");
      expect(await initialNode.evaluate((element) => element.isConnected && element === document.querySelector(".library-status-feedback"))).toBe(true);
      await expect(page.locator(".library-status-feedback")).toHaveCount(1);
      expect(await page.locator(".course-space-card").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: same-status library polling`);
    } finally {
      await removeStyleTag(feedbackPause);
    }
  });

  test("renders Stage 3B1 status feedback at its final state under reduced motion while preserving ARIA", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageThreeB1Upload(page, fixture, { progress: 37 });

    await uploadStageThreeB1File(page);
    await expect(page.locator(".parse-ready-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "true");
    await expectReducedLocalFeedback(page.locator(".parse-ready-screen .upload-success-mark"), `${testInfo.project.name}: reduced upload success`);
    const reducedParseFeedback = page.locator(".parse-status-feedback");
    await expectReducedLocalFeedback(reducedParseFeedback, `${testInfo.project.name}: reduced parse status`);
    await expectSingleParseStatusAccessibility(reducedParseFeedback, `${testInfo.project.name}: reduced parse status`);
    await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(1);

    await openStageThreeB1Library(page);
    await expectReducedLocalFeedback(page.locator(".library-status-feedback"), `${testInfo.project.name}: reduced library background`);
    await expect(page.locator(".library-status-heading")).toHaveAttribute("role", "status");

    await page.clock.fastForward(2500);
    await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_stage4")).toBe(2);
    await expectReducedLocalFeedback(page.locator(".library-status-success-mark"), `${testInfo.project.name}: reduced library completion`);
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: reduced completed library`);
  });
});

test.describe("Stage 3B2A ChapterConfirm feedback", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("consumes each strict chapter-status key once across same-status rerenders, save, and re-entry", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    const feedbackPause = await pauseChapterConfirmFeedback(page);

    try {
      await finishStageThreeB2AChapterConfirm(page);
      const initialKey = "chapter-confirm:book_stage4:chapter_stage4_primary:匹配良好";
      const initialMark = page.locator(`[data-motion-chapter-key="${initialKey}"]`);
      await expectPausedChapterStatusMark(initialMark, page, `${testInfo.project.name}: initial strict status key`);
      await expect(initialMark).toHaveAttribute("aria-hidden", "true");
      await settleChapterFeedback(initialMark, "motion-chapter-check-in");
      await expect(initialMark, `${testInfo.project.name}: initial status feedback is transient after its local entry`).toHaveCount(0);

      await page.locator(".toc-toggle-all").click();
      await expect(initialMark, `${testInfo.project.name}: same status remains settled after a directory rerender`).toHaveCount(0);

      const primaryTitle = page.locator('[data-chapter-id="chapter_stage4_primary"]');
      const primaryTitleText = primaryTitle.locator("strong");
      const readLayoutBounds = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        let x = bounds.x + window.scrollX;
        let y = bounds.y + window.scrollY;
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          x += ancestor.scrollLeft;
          y += ancestor.scrollTop;
        }
        return { height: bounds.height, width: bounds.width, x, y };
      };
      const readPrimaryTitleBounds = async () => ({
        title: await primaryTitle.evaluate(readLayoutBounds),
        text: await primaryTitleText.evaluate(readLayoutBounds)
      });
      const requestCountBeforeSave = fixture.requests.length;
      await savePrimaryChapterForMotion(page);
      const savedKey = "chapter-confirm:book_stage4:chapter_stage4_primary:已人工校对";
      const savedMark = page.locator(`[data-motion-chapter-key="${savedKey}"]`);
      await expectPausedChapterStatusMark(savedMark, page, `${testInfo.project.name}: changed status receives a new strict key`);
      await expect(savedMark.evaluate((element) => getComputedStyle(element).position), `${testInfo.project.name}: transient status mark is out of the title grid flow`).resolves.toBe("absolute");
      const markedPrimaryTitleBounds = await readPrimaryTitleBounds();
      if (usesTabletChapterWorkspaceForMotion(page)) {
        const saveFeedback = page.locator(".chapter-save-feedback");
        await expectPausedChapterFeedback(saveFeedback, page, `${testInfo.project.name}: desktop save feedback stays local`);
        await settleChapterFeedback(saveFeedback, "motion-chapter-feedback-in");
        await expect(saveFeedback).toHaveAttribute("data-motion-chapter-save", "idle");
      }
      await settleChapterFeedback(savedMark, "motion-chapter-check-in");
      await expect(savedMark, `${testInfo.project.name}: changed-status feedback settles without a persistent row adornment`).toHaveCount(0);
      expect(await readPrimaryTitleBounds(), `${testInfo.project.name}: adding then removing the transient status mark keeps the row and long title bounds unchanged`).toEqual(markedPrimaryTitleBounds);
      expect(
        fixture.requests.slice(requestCountBeforeSave).filter((request) => request.method !== "GET"),
        `${testInfo.project.name}: saving a local draft adds no mutation request`
      ).toEqual([]);

      await page.getByRole("button", { name: "上传", exact: true }).click();
      await expect(page.locator(".upload-flow-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.getByRole("button", { name: "返回", exact: true }).click();
      await expect(page.locator(".chapter-confirm-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const reenteredMark = page.locator(`[data-motion-chapter-key="${savedKey}"]`);
      await expect(reenteredMark, `${testInfo.project.name}: leaving and returning does not replay a seen status`).toHaveCount(0);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path.includes("/chapters/confirm")), `${testInfo.project.name}: local status feedback never confirms chapters`).toHaveLength(0);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: long chapter title after local save`);
    } finally {
      await removeStyleTag(feedbackPause);
    }
  });

  test("keeps a dirty chapter draft scoped to its identity and only animates an explicit save once", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    const feedbackPause = await pauseChapterConfirmFeedback(page);

    try {
      await finishStageThreeB2AChapterConfirm(page);
      const saveFeedback = page.locator(".chapter-save-feedback");
      if (!usesTabletChapterWorkspaceForMotion(page)) {
        await expect(saveFeedback, `${testInfo.project.name}: the unselected desktop editor feedback remains directly settled on phone layouts`).toHaveAttribute("data-motion-chapter-save", "idle");
        return;
      }

      const primaryTitle = page.locator(".toc-entry-title").first();
      const cleanSecondaryTitle = page.locator(".toc-entry-title").nth(1);
      const form = page.locator(".chapter-detail-form");
      const sourceTitle = form.locator("input").first();
      const dirtyPrimaryTitle = `${await sourceTitle.inputValue()} retained draft`;
      await sourceTitle.fill(dirtyPrimaryTitle);
      await expect(saveFeedback, `${testInfo.project.name}: dirty primary draft itself does not impersonate a save`).toHaveAttribute("data-motion-chapter-save", "idle");

      await cleanSecondaryTitle.click();
      await expect(cleanSecondaryTitle).toHaveAttribute("aria-current", "true");
      await expect(saveFeedback, `${testInfo.project.name}: selecting clean B after dirty A does not animate a save`).toHaveAttribute("data-motion-chapter-save", "idle");

      await primaryTitle.click();
      await expect(primaryTitle).toHaveAttribute("aria-current", "true");
      await expect(sourceTitle, `${testInfo.project.name}: dirty A draft is retained after selecting B`).toHaveValue(dirtyPrimaryTitle);
      await form.getByRole("button", { name: "保存本章修改", exact: true }).click();
      await expectPausedChapterFeedback(saveFeedback, page, `${testInfo.project.name}: an explicit save of A enters exactly once`);
      await expect(saveFeedback).toHaveAttribute("data-motion-chapter-save-key", "1");
      await settleChapterFeedback(saveFeedback, "motion-chapter-feedback-in");
      await expect(saveFeedback).toHaveAttribute("data-motion-chapter-save", "idle");

      await cleanSecondaryTitle.click();
      await primaryTitle.click();
      await expect(saveFeedback, `${testInfo.project.name}: revisiting saved A does not replay the consumed explicit save feedback`).toHaveAttribute("data-motion-chapter-save", "idle");
    } finally {
      await removeStyleTag(feedbackPause);
    }
  });

  test("consumes a reduced-mode save before restoring normal motion without replaying its sequence", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    await finishStageThreeB2AChapterConfirm(page);

    const saveFeedback = page.locator(".chapter-save-feedback");
    await savePrimaryChapterUnderReducedMotionForMotion(page);

    if (!usesTabletChapterWorkspaceForMotion(page)) {
      await expect(saveFeedback, `${testInfo.project.name}: phone editor keeps its hidden desktop feedback idle under reduced motion`).toHaveAttribute("data-motion-chapter-save", "idle");
      expect((await readLocalFeedbackMotion(saveFeedback)).animationName, `${testInfo.project.name}: phone editor has no reduced-motion save animation`).toBe("none");

      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(saveFeedback, `${testInfo.project.name}: restoring normal motion keeps the phone editor idle`).toHaveAttribute("data-motion-chapter-save", "idle");
      expect((await readLocalFeedbackMotion(saveFeedback)).animationName, `${testInfo.project.name}: restoring normal motion does not introduce a stale phone animation`).toBe("none");
      return;
    }

    await expect(saveFeedback, `${testInfo.project.name}: reduced explicit save is immediately idle`).toHaveAttribute("data-motion-chapter-save", "idle");
    await expect(saveFeedback, `${testInfo.project.name}: reduced explicit save still records its sequence`).toHaveAttribute("data-motion-chapter-save-key", "1");
    await expectReducedLocalFeedback(saveFeedback, `${testInfo.project.name}: reduced explicit save feedback`);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(".app-shell"), `${testInfo.project.name}: normal motion preference is restored`).toHaveAttribute("data-motion-reduced", "false");
    await expect(saveFeedback, `${testInfo.project.name}: restoring normal motion keeps the consumed sequence idle`).toHaveAttribute("data-motion-chapter-save", "idle");
    await expect(saveFeedback, `${testInfo.project.name}: restoring normal motion retains the already consumed sequence`).toHaveAttribute("data-motion-chapter-save-key", "1");
    expect((await readLocalFeedbackMotion(saveFeedback)).animationName, `${testInfo.project.name}: restoring normal motion does not replay the consumed sequence`).toBe("none");
  });

  test("keeps selection, delete feedback, and the sticky confirmation state local without changing request behavior", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    const feedbackPause = await pauseChapterConfirmFeedback(page);
    let releaseConfirmation: (() => void) | undefined;
    let resolveConfirmationStarted: (() => void) | undefined;
    const confirmationStarted = new Promise<void>((resolve) => {
      resolveConfirmationStarted = resolve;
    });

    try {
      await finishStageThreeB2AChapterConfirm(page);
      const targetTitle = page.getByRole("button", { name: "Stage 4 chapter 4", exact: true });
      const targetEntry = targetTitle.locator("xpath=..");
      await targetTitle.click();
      await expect(targetTitle).toHaveAttribute("aria-current", "true");
      await expectPausedChapterSelection(targetEntry, page, `${testInfo.project.name}: explicit chapter selection`);
      await settleChapterFeedback(targetEntry, "motion-chapter-selection-in");
      await expect(targetEntry).toHaveAttribute("data-motion-chapter-selection", "idle");

      const requestCountBeforeDelete = fixture.requests.length;
      if (usesTabletChapterWorkspaceForMotion(page)) {
        const detail = page.locator(".chapter-detail-form");
        await detail.getByRole("button", { name: "移除此章节", exact: true }).click();
        await expect(detail.locator(".chapter-delete-confirm")).toBeVisible();
        await detail.getByRole("button", { name: "确认移除", exact: true }).click();
        const deleteFeedback = page.locator(".toc-directory-feedback");
        await expectPausedChapterFeedback(deleteFeedback, page, `${testInfo.project.name}: desktop delete feedback stays local`);
        await expect(deleteFeedback).toHaveAttribute("role", "status");
        await settleChapterFeedback(deleteFeedback, "motion-chapter-feedback-in");
        await expect(deleteFeedback).toHaveAttribute("data-motion-chapter-feedback", "idle");
      } else {
        const editor = page.locator(".sheet[data-sheet-type='editChapter']");
        await expect(editor).toBeVisible();
        await finishActionSheetAnimation(page);
        const originalTitle = await editor.locator("input").first().inputValue();
        await editor.getByRole("button", { name: "移除此章节", exact: true }).click();
        const closingPause = await pauseActionSheetAnimations(page);
        try {
          await editor.getByRole("button", { name: "确认移除", exact: true }).click();
          await expect(editor).toHaveAttribute("data-motion-state", "closing");
          await expect(editor.locator("input").first()).toHaveValue(originalTitle);
          await finishActionSheetAnimation(page);
        } finally {
          await removeStyleTag(closingPause);
        }
        await expect(editor).toHaveCount(0);
        const chapterConfirmMain = page.locator("main.screen-content[data-screen='chapterConfirm']");
        await expect(chapterConfirmMain, `${testInfo.project.name}: deleting from the frozen Sheet restores main focus`).toBeFocused();
        expect(await page.evaluate(() => document.activeElement?.tagName), `${testInfo.project.name}: delete focus never falls back to body`).not.toBe("BODY");
      }
      await expect(targetTitle).toHaveCount(0);
      expect(
        fixture.requests.slice(requestCountBeforeDelete).filter((request) => request.method !== "GET"),
        `${testInfo.project.name}: deleting a local draft adds no mutation request`
      ).toEqual([]);

      const actionBar = page.locator(".chapter-confirm-actions");
      const actionButton = actionBar.getByRole("button", { name: "确认生成课程", exact: true });
      await actionButton.scrollIntoViewIfNeeded();
      const buttonBox = await actionButton.boundingBox();
      const viewport = page.viewportSize();
      if (!buttonBox || !viewport) throw new Error("ChapterConfirm sticky action needs a visible button and viewport.");
      expect(buttonBox.y, `${testInfo.project.name}: sticky action stays inside the visible viewport`).toBeGreaterThanOrEqual(0);
      expect(buttonBox.y + buttonBox.height, `${testInfo.project.name}: sticky action stays above the viewport edge`).toBeLessThanOrEqual(viewport.height);
      expect(await actionBar.evaluate((element) => getComputedStyle(element).animationName), `${testInfo.project.name}: sticky container itself never animates`).toBe("none");

      await page.route("**/api/books/book_stage4/chapters/confirm", async (route) => {
        resolveConfirmationStarted?.();
        await new Promise<void>((resolve) => {
          releaseConfirmation = resolve;
        });
        await route.fallback();
      });
      await actionButton.click();
      await confirmationStarted;
      const actionFeedback = page.locator(".chapter-confirm-action-feedback");
      await expectPausedChapterFeedback(actionFeedback, page, `${testInfo.project.name}: sticky confirmation feedback stays local`);
      await expect(actionFeedback.getByRole("status")).toContainText("正在确认目录");
      await expect(actionButton).toBeDisabled();
      releaseConfirmation?.();
      releaseConfirmation = undefined;
      await expect(page.locator(".course-ready-screen")).toBeVisible();
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/chapters/confirm"), `${testInfo.project.name}: confirmation keeps its existing request count`).toHaveLength(1);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/lessons/build"), `${testInfo.project.name}: confirmation keeps the existing lesson-build request`).toHaveLength(1);
    } finally {
      releaseConfirmation?.();
      await removeStyleTag(feedbackPause);
    }
  });

  test("renders ChapterConfirm feedback directly at the final state under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    await finishStageThreeB2AChapterConfirm(page);

    const key = "chapter-confirm:book_stage4:chapter_stage4_primary:匹配良好";
    const statusMark = page.locator(`[data-motion-chapter-key="${key}"]`);
    await expect(statusMark, `${testInfo.project.name}: reduced motion omits decorative transient status feedback`).toHaveCount(0);

    const targetTitle = page.getByRole("button", { name: "Stage 4 chapter 4", exact: true });
    const targetEntry = targetTitle.locator("xpath=..");
    await targetTitle.click();
    await expect(targetTitle).toHaveAttribute("aria-current", "true");
    await expect(targetEntry).toHaveAttribute("data-motion-chapter-selection", "idle");
    await expectReducedLocalFeedback(targetEntry, `${testInfo.project.name}: reduced chapter selection`);
    if (!usesTabletChapterWorkspaceForMotion(page)) {
      const editor = page.locator(".sheet[data-sheet-type='editChapter']");
      await expect(editor).toBeVisible();
      await finishActionSheetAnimation(page);
      await editor.getByRole("button", { name: "关闭", exact: true }).click();
      await expect(editor).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: reduced ChapterConfirm long title`);
  });
});

function expectedCourseReadySuccessDuration(page: Page) {
  return isShortLandscape(page) ? "0.18s" : "0.24s";
}

async function pauseCourseReadyFeedback(page: Page) {
  return page.addStyleTag({
    content: ".course-ready-success-mark[data-motion-course-ready-state='entering'], .success-hero-image[data-motion-image-state='entering'] { animation-play-state: paused !important; }"
  });
}

async function expectPausedCourseReadySuccessMark(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: CourseReady success mark is rendered`).toBeVisible();
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: CourseReady success mark uses the Surface/Base enter mapping`
  }).toMatchObject({
    animationDuration: expectedCourseReadySuccessDuration(page),
    animationName: "motion-course-ready-success-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: CourseReady success mark uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: CourseReady success mark begins transparent`).toBe(0);
  expect(localTransformComponents(motion.transform).scale, `${label}: CourseReady success mark begins at the locked scale`).toBeCloseTo(0.96, 4);
}

async function expectPausedStageThreeImage(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: Stage 3 image is rendered`).toBeVisible();
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: Stage 3 image uses the Base/Fast opacity mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-stage3-image-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: Stage 3 image uses Standard easing`).toBe("cubic-bezier(0.2,0.8,0.2,1)");
  expect(Number(motion.opacity), `${label}: Stage 3 image begins transparent`).toBe(0);
  expect(motion.transform, `${label}: Stage 3 image does not translate or scale`).toBe("none");
}

async function settleStageThreeFeedback(locator: Locator, animationName: string) {
  await locator.evaluate((element, name) => {
    element.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
  }, animationName);
}

function courseReadyAction(page: Page) {
  return page.locator(".course-ready-actions .button").first();
}

function chapterConfirmAction(page: Page) {
  return page.locator(".chapter-confirm-actions .button");
}

function headerBackButton(page: Page) {
  return page.locator(".header-bar").getByRole("button", { name: "返回", exact: true });
}

const stageThreeB2BSecondLessonBuild = {
  job_id: "lesson_job_stage4_second",
  book_id: "book_stage4",
  status: "done",
  stage: "complete",
  progress: 100,
  lessons: [{
    book_id: "book_stage4",
    lesson_id: "lesson_stage4_second",
    chapter_id: "chapter_stage4_primary",
    title: "Responsive source review",
    source_title: "Stage 3B2B second build",
    page_start: 1,
    page_end: 1,
    lesson_kind: "lesson",
    status: "ready",
    confidence: 96,
    objectives: [],
    key_concepts: [],
    summary: "",
    blocks: [],
    source_chunk_ids: [],
    asset_ids: [],
    warnings: []
  }],
  chapter_results: [{
    chapter_id: "chapter_stage4_primary",
    chapter_title: "Stage 3B2B second build",
    status: "done",
    lesson_kind: "lesson",
    lesson_id: "lesson_stage4_second"
  }],
  error: null
};

test.describe("Stage 3B2B CourseReady lifecycle", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("consumes each strict CourseReady key once across a parent rerender, leave/re-entry, and a new lesson-build job", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    const feedbackPause = await pauseCourseReadyFeedback(page);

    try {
      await finishStageThreeB2AChapterConfirm(page);
      await chapterConfirmAction(page).click();
      await expect(page.locator(".course-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const initialKey = "course-ready:book_stage4:lesson_job_stage4";
      const initialMark = page.locator(`[data-motion-course-ready-key="${initialKey}"]`);
      const initialHero = page.locator(".success-hero-image");
      await expect(initialMark, `${testInfo.project.name}: StrictMode exposes one CourseReady success mark`).toHaveCount(1);
      await expectPausedCourseReadySuccessMark(initialMark, page, `${testInfo.project.name}: initial strict CourseReady key`);
      await expectPausedStageThreeImage(initialHero, page, `${testInfo.project.name}: initial CourseReady hero`);
      await expect(initialMark).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".course-ready-primary").getByRole("status")).toHaveAttribute("aria-live", "polite");
      const initialHeroBounds = await initialHero.evaluate((element) => element.getBoundingClientRect().toJSON());
      await settleStageThreeFeedback(initialMark, "motion-course-ready-success-in");
      await settleStageThreeFeedback(initialHero, "motion-stage3-image-in");
      await expect(initialMark).toHaveAttribute("data-motion-course-ready-state", "idle");
      await expect(initialHero).toHaveAttribute("data-motion-image-state", "idle");
      expect((await readLocalFeedbackMotion(initialMark)).animationName, `${testInfo.project.name}: settled CourseReady mark has no residual animation`).toBe("none");
      expect((await readLocalFeedbackMotion(initialHero)).animationName, `${testInfo.project.name}: settled CourseReady hero has no residual animation`).toBe("none");
      expect(await initialHero.evaluate((element) => element.getBoundingClientRect().toJSON()), `${testInfo.project.name}: image completion preserves CourseReady hero geometry`).toEqual(initialHeroBounds);

      await initialHero.evaluate((element) => element.dispatchEvent(new Event("load")));
      await expect(initialHero).toHaveAttribute("data-motion-image-state", "idle");
      expect((await readLocalFeedbackMotion(initialHero)).animationName, `${testInfo.project.name}: cached duplicate load does not replay the hero`).toBe("none");

      await page.clock.fastForward(3200);
      await expect(initialMark, `${testInfo.project.name}: toast expiry rerender retains the same strict mark`).toHaveAttribute("data-motion-course-ready-state", "idle");
      expect((await readLocalFeedbackMotion(initialMark)).animationName, `${testInfo.project.name}: same-key parent rerender does not replay`).toBe("none");

      await courseReadyAction(page).click();
      await expect(page.locator(".book-course-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await headerBackButton(page).click();
      await expect(page.locator(".course-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const reenteredMark = page.locator(`[data-motion-course-ready-key="${initialKey}"]`);
      await expect(reenteredMark, `${testInfo.project.name}: returning from learning retains the first key`).toHaveAttribute("data-motion-course-ready-state", "idle");
      expect((await readLocalFeedbackMotion(reenteredMark)).animationName, `${testInfo.project.name}: leaving and returning does not replay a seen CourseReady key`).toBe("none");
      const reenteredHero = page.locator(".success-hero-image");
      await expectPausedStageThreeImage(reenteredHero, page, `${testInfo.project.name}: reconstructed CourseReady hero may enter once for its new DOM node`);
      await settleStageThreeFeedback(reenteredHero, "motion-stage3-image-in");

      await headerBackButton(page).click();
      await expect(page.locator(".chapter-confirm-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await chapterConfirmAction(page).click();
      await expect(page.locator(".course-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      const repeatedJobMark = page.locator(`[data-motion-course-ready-key="${initialKey}"]`);
      await expect(repeatedJobMark, `${testInfo.project.name}: an existing job id retains its strict key`).toHaveAttribute("data-motion-course-ready-state", "idle");
      expect((await readLocalFeedbackMotion(repeatedJobMark)).animationName, `${testInfo.project.name}: an existing lesson-build job never replays success`).toBe("none");

      await headerBackButton(page).click();
      await expect(page.locator(".chapter-confirm-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      let secondBuildRequests = 0;
      await page.route("**/api/books/book_stage4/lessons/build", async (route) => {
        secondBuildRequests += 1;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stageThreeB2BSecondLessonBuild) });
      });
      await chapterConfirmAction(page).click();
      await expect(page.locator(".course-ready-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const secondKey = "course-ready:book_stage4:lesson_job_stage4_second";
      const secondMark = page.locator(`[data-motion-course-ready-key="${secondKey}"]`);
      await expect(secondMark, `${testInfo.project.name}: a new lesson-build job owns one new strict mark`).toHaveCount(1);
      await expectPausedCourseReadySuccessMark(secondMark, page, `${testInfo.project.name}: new CourseReady job key`);
      await settleStageThreeFeedback(secondMark, "motion-course-ready-success-in");
      await expect(secondMark).toHaveAttribute("data-motion-course-ready-state", "idle");

      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/chapters/confirm"), `${testInfo.project.name}: real confirmation endpoint stays on its existing path`).toHaveLength(3);
      expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/lessons/build"), `${testInfo.project.name}: repeated job keeps the existing lesson-build request path`).toHaveLength(2);
      expect(secondBuildRequests, `${testInfo.project.name}: new job is one concrete lesson-build response`).toBe(1);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: CourseReady lifecycle with a long source title`);
    } finally {
      await removeStyleTag(feedbackPause);
    }
  });

  test("keeps ChapterConfirm failure and retry in their existing carrier before CourseReady receives a successful job", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    await finishStageThreeB2AChapterConfirm(page);
    let buildAttempts = 0;
    await page.route("**/api/books/book_stage4/lessons/build", async (route) => {
      buildAttempts += 1;
      if (buildAttempts > 1) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "lesson_job_stage4_failed",
          book_id: "book_stage4",
          status: "failed",
          stage: "generation",
          progress: 51,
          lessons: [],
          chapter_results: [],
          error: "Stage 3B2B lesson build failure"
        })
      });
    });

    const action = chapterConfirmAction(page);
    await action.click();
    await expect(page.locator(".chapter-confirm-screen"), `${testInfo.project.name}: a failed build remains in ChapterConfirm`).toBeVisible();
    await expect(page.locator(".course-ready-screen"), `${testInfo.project.name}: CourseReady is not a generation failure state`).toHaveCount(0);
    await expect(page.locator(".toast"), `${testInfo.project.name}: failure remains in the established toast carrier`).toContainText("Stage 3B2B lesson build failure");
    await expect(action, `${testInfo.project.name}: existing confirmation button becomes retryable after failure`).toBeEnabled();
    await expect(page.locator(".chapter-confirm-action-feedback"), `${testInfo.project.name}: generating feedback is removed after failure`).toHaveCount(0);

    await action.click();
    await expect(page.locator(".course-ready-screen"), `${testInfo.project.name}: retry returns through the real successful CourseReady path`).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expect(page.locator('[data-motion-course-ready-key="course-ready:book_stage4:lesson_job_stage4"]')).toHaveCount(1);
    expect(buildAttempts, `${testInfo.project.name}: failure and retry make exactly two lesson-build attempts`).toBe(2);
    expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/chapters/confirm"), `${testInfo.project.name}: failure and retry preserve confirmation requests`).toHaveLength(2);
    expect(fixture.requests.filter((request) => request.method === "POST" && request.path === "/api/books/book_stage4/lessons/build"), `${testInfo.project.name}: only the fallback retry reaches the original lesson-build fixture`).toHaveLength(1);
  });

  test("renders CourseReady success feedback at its final state under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepareStageThreeB2AChapterConfirm(page, fixture);
    await finishStageThreeB2AChapterConfirm(page);
    await chapterConfirmAction(page).click();
    await expect(page.locator(".course-ready-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);

    const mark = page.locator('[data-motion-course-ready-key="course-ready:book_stage4:lesson_job_stage4"]');
    const hero = page.locator(".success-hero-image");
    await expect(mark).toHaveAttribute("data-motion-course-ready-state", "idle");
    await expectReducedLocalFeedback(mark, `${testInfo.project.name}: reduced CourseReady success mark`);
    await expectReducedLocalFeedback(hero, `${testInfo.project.name}: reduced CourseReady image`);
    await expect(page.locator(".course-ready-primary").getByRole("status")).toHaveAttribute("aria-live", "polite");
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: reduced CourseReady result`);
  });
});

type StageThreeB2BImageFixture = StageThreeB1Fixture & {
  useStageFiveFlow: (options?: { imageMode?: "success" | "failure" | "mixed" }) => void;
};

async function prepareStageThreeB2BLibrary(page: Page, fixture: StageThreeB2BImageFixture, imageMode: "success" | "failure") {
  fixture.useStageFiveFlow({ imageMode });
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true })).toBeVisible();
}

async function enterStageThreeB2BLibrary(page: Page) {
  await page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true }).click();
  await expect(page.locator(".library-course-grid")).toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function pauseStageThreeLibraryImageFeedback(page: Page) {
  return page.addStyleTag({
    content: ".course-cover-image[data-motion-image-state='entering'] { animation-play-state: paused !important; }"
  });
}

test.describe("Stage 3B2B image load feedback", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unacknowledged console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("fades each successful cover once per DOM node while preserving cached and new-URL lifecycles", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB2BImageFixture;
    await prepareStageThreeB2BLibrary(page, fixture, "success");
    const imagePause = await pauseStageThreeLibraryImageFeedback(page);

    try {
      await enterStageThreeB2BLibrary(page);
      const covers = page.locator(".course-cover-image");
      await expect(covers, `${testInfo.project.name}: real Library CourseCover images are rendered`).toHaveCount(3);
      const sources = await covers.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-motion-image-source")));
      expect(sources.every((source): source is string => Boolean(source)), `${testInfo.project.name}: every cover keeps its concrete source URL`).toBe(true);
      expect(new Set(sources).size, `${testInfo.project.name}: each actual Library card uses a new source URL`).toBe(3);

      const initialBounds: Array<{ height: number; width: number }> = [];
      for (let index = 0; index < 3; index += 1) {
        const cover = covers.nth(index);
        await expectPausedStageThreeImage(cover, page, `${testInfo.project.name}: successful cover ${index + 1}`);
        const bounds = await cover.evaluate((element) => element.getBoundingClientRect().toJSON());
        initialBounds.push({ height: bounds.height, width: bounds.width });
        expect(bounds.width, `${testInfo.project.name}: successful cover ${index + 1} keeps a positive width`).toBeGreaterThan(0);
        expect(bounds.height, `${testInfo.project.name}: successful cover ${index + 1} keeps a positive height`).toBeGreaterThan(0);
        expect(bounds.width / bounds.height, `${testInfo.project.name}: successful cover ${index + 1} retains the fixed cover ratio`).toBeCloseTo(0.75, 2);
        await settleStageThreeFeedback(cover, "motion-stage3-image-in");
        await expect(cover).toHaveAttribute("data-motion-image-state", "idle");
        expect((await readLocalFeedbackMotion(cover)).animationName, `${testInfo.project.name}: successful cover ${index + 1} has no residual animation`).toBe("none");
      }

      const firstCover = covers.first();
      await firstCover.evaluate((element) => element.dispatchEvent(new Event("load")));
      await expect(firstCover).toHaveAttribute("data-motion-image-state", "idle");
      expect((await readLocalFeedbackMotion(firstCover)).animationName, `${testInfo.project.name}: cached duplicate cover load does not replay`).toBe("none");

      await page.getByRole("button", { name: "首页", exact: true }).click();
      await expect(page.locator(".home-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await enterStageThreeB2BLibrary(page);

      const reconstructedCover = page.locator(".course-cover-image").first();
      await expect(reconstructedCover).toHaveAttribute("data-motion-image-source", sources[0]);
      await expectPausedStageThreeImage(reconstructedCover, page, `${testInfo.project.name}: cached cover on a reconstructed Library DOM node`);
      const reconstructedBounds = await reconstructedCover.evaluate((element) => element.getBoundingClientRect().toJSON());
      expect({ height: reconstructedBounds.height, width: reconstructedBounds.width }, `${testInfo.project.name}: reconstructed cached cover preserves geometry`).toEqual(initialBounds[0]);
      await settleStageThreeFeedback(reconstructedCover, "motion-stage3-image-in");
      await expect(reconstructedCover).toHaveAttribute("data-motion-image-state", "idle");
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: long Library course title with successful covers`);
    } finally {
      await removeStyleTag(imagePause);
    }
  });

  test("uses stable failed-cover fallbacks without leaving image animation residue", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB2BImageFixture;
    await prepareStageThreeB2BLibrary(page, fixture, "failure");
    await enterStageThreeB2BLibrary(page);

    const fallbacks = page.locator(".course-cover-fallback");
    await expect(fallbacks, `${testInfo.project.name}: each failed actual cover resolves to its fallback`).toHaveCount(3);
    await expect(page.locator(".course-cover-image"), `${testInfo.project.name}: a failed cover no longer keeps an invisible image node`).toHaveCount(0);
    for (let index = 0; index < 3; index += 1) {
      const fallback = fallbacks.nth(index);
      await expect(fallback, `${testInfo.project.name}: failed fallback ${index + 1} is exposed as meaningful imagery`).toHaveAttribute("role", "img");
      await expect(fallback).toHaveAttribute("data-motion-image-state", "failed");
      const bounds = await fallback.evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(bounds.width, `${testInfo.project.name}: failed fallback ${index + 1} keeps a positive width`).toBeGreaterThan(0);
      expect(bounds.height, `${testInfo.project.name}: failed fallback ${index + 1} keeps a positive height`).toBeGreaterThan(0);
      expect(bounds.width / bounds.height, `${testInfo.project.name}: failed fallback ${index + 1} keeps the same cover ratio without a layout jump`).toBeCloseTo(0.75, 2);
      expect((await readLocalFeedbackMotion(fallback)).animationName, `${testInfo.project.name}: failed fallback ${index + 1} has no residual image animation`).toBe("none");
    }
    const failedSources = await fallbacks.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-motion-image-source")));
    const concreteFailedSources = failedSources.filter((source): source is string => Boolean(source));
    expect(concreteFailedSources, `${testInfo.project.name}: every expected failure retains its concrete image source`).toHaveLength(failedSources.length);
    const expectedImagePaths = concreteFailedSources.map((source) => new URL(source, "http://127.0.0.1:4173").pathname).sort();
    await expect.poll(() => fixture.requests
      .filter((request) => request.method === "GET" && expectedImagePaths.includes(request.path))
      .map((request) => request.path)
      .sort()
    ).toEqual(expectedImagePaths);
    await expect.poll(() => fixture.consoleErrors).toEqual(Array.from({ length: expectedImagePaths.length }, () => failedResource404ConsoleError));
    assertAndAcknowledgeExactConsoleErrors(
      fixture,
      Array.from({ length: expectedImagePaths.length }, () => failedResource404ConsoleError),
      `${testInfo.project.name}: expected failed cover image routes`
    );
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: long Library course title with failed cover fallback`);
  });

  test("does not suppress an unrelated matching failed-image console error", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB2BImageFixture;
    let unrelatedRouteHits = 0;
    await page.route("**/stage3-unrelated-console-error.svg", async (route) => {
      unrelatedRouteHits += 1;
      await route.fulfill({ status: 404, contentType: "image/svg+xml", body: "missing" });
    });
    await prepareStageThreeB2BLibrary(page, fixture, "failure");
    await enterStageThreeB2BLibrary(page);
    const fallbacks = page.locator(".course-cover-fallback");
    await expect(fallbacks).toHaveCount(3);
    const failedSources = await fallbacks.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-motion-image-source")));
    const concreteFailedSources = failedSources.filter((source): source is string => Boolean(source));
    expect(concreteFailedSources).toHaveLength(failedSources.length);
    const expectedImagePaths = concreteFailedSources.map((source) => new URL(source, "http://127.0.0.1:4173").pathname).sort();
    await expect.poll(() => fixture.requests
      .filter((request) => request.method === "GET" && expectedImagePaths.includes(request.path))
      .map((request) => request.path)
      .sort()
    ).toEqual(expectedImagePaths);
    await page.evaluate(() => new Promise<void>((resolve) => {
      const image = new Image();
      image.addEventListener("error", () => resolve(), { once: true });
      image.src = "/stage3-unrelated-console-error.svg";
      document.body.append(image);
    }));
    expect(unrelatedRouteHits, `${testInfo.project.name}: the injected unrelated image route is requested exactly once`).toBe(1);
    const expectedConsoleErrors = Array.from({ length: expectedImagePaths.length }, () => failedResource404ConsoleError);
    await expect.poll(() => fixture.consoleErrors).toHaveLength(expectedConsoleErrors.length + 1);
    expect(
      unexpectedConsoleErrors(fixture.consoleErrors, expectedConsoleErrors),
      `${testInfo.project.name}: an unrelated matching 404 remains detectable instead of being filtered away`
    ).toEqual([failedResource404ConsoleError]);
    assertAndAcknowledgeExactConsoleErrors(
      fixture,
      [...expectedConsoleErrors, failedResource404ConsoleError],
      `${testInfo.project.name}: explicit failure routes plus the deliberate unrelated injection`
    );
  });
});

function expectedForwardScreenAnimation(viewport: { width: number; height: number }) {
  if (viewport.height < 600 && viewport.width > viewport.height) return "motion-screen-short-forward-in";
  if (viewport.width >= 768 && viewport.height >= 600) return "motion-screen-tablet-in";
  return "motion-screen-phone-forward-in";
}

type ScreenTransitionExpectation = {
  duration: string;
  name: string;
  translateX: number;
  translateY: number;
};

function expectedScreenTransitionMotion(
  direction: "forward" | "back" | "replace",
  viewport: { width: number; height: number }
): ScreenTransitionExpectation {
  const shortLandscape = viewport.height < 600 && viewport.width > viewport.height;
  const tablet = viewport.width >= 768 && viewport.height >= 600;
  if (direction === "replace") {
    return {
      duration: shortLandscape ? "0.14s" : "0.18s",
      name: tablet ? "motion-screen-tablet-in" : "motion-screen-replace-in",
      translateX: 0,
      translateY: shortLandscape ? 4 : 6
    };
  }
  if (tablet) {
    return { duration: "0.24s", name: "motion-screen-tablet-in", translateX: 0, translateY: 6 };
  }
  if (shortLandscape) {
    return {
      duration: "0.18s",
      name: direction === "forward" ? "motion-screen-short-forward-in" : "motion-screen-short-back-in",
      translateX: direction === "forward" ? 6 : -6,
      translateY: 0
    };
  }
  return {
    duration: "0.24s",
    name: direction === "forward" ? "motion-screen-phone-forward-in" : "motion-screen-phone-back-in",
    translateX: direction === "forward" ? 12 : -12,
    translateY: 0
  };
}

function screenTransformComponents(transform: string) {
  if (transform === "none") return { x: 0, y: 0 };
  const match = transform.match(/^matrix\((.+)\)$/);
  if (!match) throw new Error(`Expected a 2D screen transform matrix, received ${transform}.`);
  const values = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
  if (values.length !== 6 || values.some(Number.isNaN)) throw new Error(`Invalid screen transform matrix: ${transform}.`);
  return { x: values[4], y: values[5] };
}

async function settleScreenTransition(page: Page) {
  await page.locator(".motion-screen-transition").evaluate((element) => {
    const animationName = getComputedStyle(element).animationName;
    element.dispatchEvent(new AnimationEvent("animationend", { animationName, bubbles: true }));
  });
}

async function dispatchScreenTransitionAnimation(
  target: Locator,
  type: "animationend" | "animationcancel",
  animationName: string
) {
  await target.evaluate((element, event) => {
    element.dispatchEvent(new AnimationEvent(event.type, { animationName: event.animationName, bubbles: true }));
  }, { animationName, type });
}

async function readScreenTransitionSurface(root: Locator) {
  return root.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationFillMode: style.animationFillMode,
      animationPlayState: style.animationPlayState,
      animationTimingFunction: style.animationTimingFunction,
      opacity: style.opacity,
      rect: { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top },
      transform: style.transform
    };
  });
}

async function expectPausedScreenTransition(
  root: Locator,
  direction: "forward" | "back" | "replace",
  viewport: CssViewport,
  label: string
) {
  const expected = expectedScreenTransitionMotion(direction, viewport);
  await expect.poll(() => readScreenTransitionSurface(root), {
    message: `${label}: wrapper exposes the locked paused transition state`
  }).toMatchObject({
    animationDuration: expected.duration,
    animationFillMode: "both",
    animationName: expected.name,
    animationPlayState: "paused"
  });
  const actual = await readScreenTransitionSurface(root);
  expect(normalizeTimingFunction(actual.animationTimingFunction), `${label}: transition uses the locked enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(actual.opacity), `${label}: paused transition begins transparent`).toBe(0);
  const transform = screenTransformComponents(actual.transform);
  expect(transform.x, `${label}: paused transition preserves its locked horizontal from-distance`).toBeCloseTo(expected.translateX, 5);
  expect(transform.y, `${label}: paused transition preserves its locked vertical from-distance`).toBeCloseTo(expected.translateY, 5);
}

async function expectIdleScreenTransitionSurface(root: Locator, label: string) {
  expect(await readScreenTransitionSurface(root), `${label}: idle screen surface clears its keyframe compositor state`).toMatchObject({
    animationName: "none",
    opacity: "1",
    transform: "none"
  });
}

async function openPausedReplaceTransition(page: Page, bookCourseApi: { useStageFourFlow: () => void }) {
  bookCourseApi.useStageFourFlow();
  await page.addInitScript(() => {
    window.localStorage.removeItem("bookcourse-active-parse-session");
  });
  await page.goto("/?embedded=device-preview");
  const pause = await page.addStyleTag({ content: ".motion-screen-transition { animation-play-state: paused !important; }" });
  const root = page.locator(".motion-screen-transition");

  await page.locator(".nav-upload").click();
  await expect(root).toHaveAttribute("data-motion-state", "entering");
  await settleScreenTransition(page);
  await expect(root).toHaveAttribute("data-motion-state", "idle");

  await page.locator('input[type="file"]').setInputFiles({
    name: "motion-replace-fixture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("screen transition replace fixture")
  });
  await expect(page.locator(".parse-ready-screen")).toBeVisible();
  await expect(root).toHaveAttribute("data-motion-state", "entering");
  await settleScreenTransition(page);
  await expect(root).toHaveAttribute("data-motion-state", "idle");

  await page.locator(".parse-flow-actions .button").first().click();
  await expect(page.locator(".processing-flow-screen")).toBeVisible();
  await expect(root).toHaveAttribute("data-motion-state", "entering");
  await settleScreenTransition(page);
  await expect(root).toHaveAttribute("data-motion-state", "idle");

  await page.clock.fastForward(2500);
  await expect(root).toHaveAttribute("data-screen", "chapterConfirm");
  await expect(root).toHaveAttribute("data-motion-direction", "replace");
  await expect(root).toHaveAttribute("data-motion-state", "entering");
  return pause;
}

test.describe("Stage 2A navigation and page roots", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("keeps initial and same-screen navigation static while preserving one page root", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");

    const root = page.locator(".motion-screen-transition");
    const main = page.locator("main.screen-content");
    const homeButton = page.getByRole("button", { name: "首页", exact: true });
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-screen", "home");
    await expect(root).toHaveAttribute("data-motion-direction", "replace");
    await expect(root).toHaveAttribute("data-motion-nonce", "0");
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expect(main).toHaveAttribute("tabindex", "-1");

    await homeButton.click();
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-motion-direction", "replace");
    await expect(root).toHaveAttribute("data-motion-nonce", "0");
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expect.poll(() => page.evaluate(() => document.activeElement !== document.querySelector("main.screen-content"))).toBe(true);
  });

  test("uses a single atomic root for forward and back navigation and focuses the new main", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");

    const root = page.locator(".motion-screen-transition");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Motion navigation test needs a configured viewport.");

    await page.getByRole("button", { name: "上传", exact: true }).click();
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-screen", "upload");
    await expect(root).toHaveAttribute("data-motion-direction", "forward");
    await expect(root).toHaveAttribute("data-motion-nonce", "1");
    await expect(root).toHaveAttribute("data-motion-state", "entering");
    await expect(root).toHaveCSS("animation-name", expectedForwardScreenAnimation(viewport));
    await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector("main.screen-content"))).toBe(true);
    await settleScreenTransition(page);
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expectIdleScreenTransitionSurface(root, `${viewport.width}x${viewport.height}: forward transition`);

    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-screen", "home");
    await expect(root).toHaveAttribute("data-motion-direction", "back");
    await expect(root).toHaveAttribute("data-motion-nonce", "2");
    await expect(root).toHaveAttribute("data-motion-state", "entering");
    await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector("main.screen-content"))).toBe(true);
    await settleScreenTransition(page);
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expectIdleScreenTransitionSurface(root, `${viewport.width}x${viewport.height}: back transition`);
  });

  test("keeps forward and back page-root directions atomic across every paired viewport", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      await page.goto("/?embedded=device-preview");
      const pause = await page.addStyleTag({ content: ".motion-screen-transition { animation-play-state: paused !important; }" });
      const root = page.locator(".motion-screen-transition");

      await page.getByRole("button", { name: "\u4e0a\u4f20", exact: true }).click();
      await expect(root, `${project.name} ${viewport.width}x${viewport.height}: forward navigation retains exactly one root`).toHaveCount(1);
      await expect(root).toHaveAttribute("data-screen", "upload");
      await expect(root).toHaveAttribute("data-motion-direction", "forward");
      await expect(root).toHaveAttribute("data-motion-nonce", "1");
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      await expectPausedScreenTransition(root, "forward", viewport, `${project.name} ${viewport.width}x${viewport.height}: forward`);
      await settleScreenTransition(page);
      await expect(root).toHaveAttribute("data-motion-state", "idle");
      await expectIdleScreenTransitionSurface(root, `${project.name} ${viewport.width}x${viewport.height}: forward transition`);
      await page.getByRole("button", { name: "\u8fd4\u56de", exact: true }).click();
      await expect(root, `${project.name} ${viewport.width}x${viewport.height}: back navigation retains exactly one root`).toHaveCount(1);
      await expect(root).toHaveAttribute("data-screen", "home");
      await expect(root).toHaveAttribute("data-motion-direction", "back");
      await expect(root).toHaveAttribute("data-motion-nonce", "2");
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      await expectPausedScreenTransition(root, "back", viewport, `${project.name} ${viewport.width}x${viewport.height}: back`);
      await settleScreenTransition(page);
      await expect(root).toHaveAttribute("data-motion-state", "idle");
      await expectIdleScreenTransitionSurface(root, `${project.name} ${viewport.width}x${viewport.height}: back transition`);
      await expect(page.locator("main.screen-content > .motion-screen-transition")).toHaveCount(1);
      await removeStyleTag(pause);
    }
  });

  test("maps real automatic replacements to the locked paused screen motion across every paired viewport", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      const pause = await openPausedReplaceTransition(page, bookCourseApi);
      try {
        const root = page.locator(".motion-screen-transition");
        await expectPausedScreenTransition(root, "replace", viewport, `${project.name} ${viewport.width}x${viewport.height}: automatic replace`);
        await settleScreenTransition(page);
        await expect(root).toHaveAttribute("data-motion-state", "idle");
        await expectIdleScreenTransitionSurface(root, `${project.name} ${viewport.width}x${viewport.height}: automatic replace`);
      } finally {
        await removeStyleTag(pause);
      }
    }
  });

  test("settles rapid navigation at the final screen without retaining another content tree", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/?embedded=device-preview");

    const root = page.locator(".motion-screen-transition");
    await page.getByRole("button", { name: "社区", exact: true }).click();
    await page.getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("button", { name: "首页", exact: true }).click();

    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-screen", "home");
    await expect(root).toHaveAttribute("data-motion-direction", "forward");
    await expect(root).toHaveAttribute("data-motion-nonce", "3");
    await settleScreenTransition(page);
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expect(page.locator("main.screen-content > .motion-screen-transition")).toHaveCount(1);
  });

  test("guards ScreenTransition completion by target, name, generation, cancellation, fallback, and runtime reduced motion", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/?embedded=device-preview");
    const pause = await page.addStyleTag({ content: ".motion-screen-transition { animation-play-state: paused !important; }" });
    const root = page.locator(".motion-screen-transition");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("ScreenTransition fault injection needs a configured viewport.");

    try {
      const forward = expectedScreenTransitionMotion("forward", viewport);
      await page.locator(".nav-upload").click();
      await expect(root).toHaveAttribute("data-motion-nonce", "1");
      await expect(root).toHaveAttribute("data-motion-state", "entering");

      await dispatchScreenTransitionAnimation(root.locator(":scope > *"), "animationend", forward.name);
      await expect(root, "child animation events cannot settle the wrapper generation").toHaveAttribute("data-motion-state", "entering");
      await dispatchScreenTransitionAnimation(root, "animationend", "motion-screen-not-allowed");
      await expect(root, "wrong animation names cannot settle the wrapper generation").toHaveAttribute("data-motion-state", "entering");

      const staleRoot = await root.elementHandle();
      if (!staleRoot) throw new Error("ScreenTransition needs an old generation root for fault injection.");
      await page.locator(".header-bar .icon-button").click();
      await expect(root).toHaveAttribute("data-motion-nonce", "2");
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      await staleRoot.evaluate((element, animationName) => {
        element.dispatchEvent(new AnimationEvent("animationend", { animationName, bubbles: true }));
      }, forward.name);
      await expect(root, "a detached stale generation event cannot settle the current generation").toHaveAttribute("data-motion-state", "entering");

      const back = expectedScreenTransitionMotion("back", viewport);
      await dispatchScreenTransitionAnimation(root, "animationcancel", back.name);
      await expect(root, "the current matching animationcancel settles its generation").toHaveAttribute("data-motion-state", "idle");

      await page.locator(".nav-item").nth(1).click();
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      await page.clock.fastForward(319);
      await expect(root, "the active generation stays entering before its 320ms fallback deadline").toHaveAttribute("data-motion-state", "entering");
      await page.clock.fastForward(1);
      await expect(root, "a missing event settles exactly through the 320ms fallback").toHaveAttribute("data-motion-state", "idle");

      await page.locator(".nav-item").nth(3).click();
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      const rapidStaleRoot = await root.elementHandle();
      if (!rapidStaleRoot) throw new Error("ScreenTransition needs the rapid old generation root.");
      await page.locator(".nav-upload").click();
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      await rapidStaleRoot.evaluate((element, animationName) => {
        element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true }));
      }, forward.name);
      await expect(root, "a rapid new generation remains entering until its own completion").toHaveAttribute("data-motion-state", "entering");
      await dispatchScreenTransitionAnimation(root, "animationend", forward.name);
      await expect(root).toHaveAttribute("data-motion-state", "idle");

      await page.locator(".header-bar .icon-button").click();
      await expect(root).toHaveAttribute("data-motion-state", "entering");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(root, "runtime reduced motion immediately clears the active screen generation").toHaveAttribute("data-motion-state", "idle");
      await expect(root).toHaveCSS("animation-name", "none");
    } finally {
      await removeStyleTag(pause);
    }
  });

  test("settles page roots synchronously under reduced motion", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?embedded=device-preview");

    const root = page.locator(".motion-screen-transition");
    await page.getByRole("button", { name: "我的", exact: true }).click();
    await expect(root).toHaveAttribute("data-screen", "profile");
    await expect(root).toHaveAttribute("data-motion-direction", "forward");
    await expect(root).toHaveAttribute("data-motion-nonce", "1");
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expect(root).toHaveCSS("animation-name", "none");
    await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector("main.screen-content"))).toBe(true);
  });
});

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
    message: "阶段 3 fixture 正在准备课程",
    error: null
  }
};

function expectedNavigationPresentation(viewport: CssViewport) {
  return viewport.width >= 768 && viewport.height >= 600 ? "rail" : "bottom";
}

function getShimmedVisualViewportHeight(viewport: CssViewport) {
  if (viewport.width >= 768) return viewport.width > viewport.height ? 680 : 760;
  return viewport.width > viewport.height ? 300 : 430;
}

function getOppositeOrientationViewport(viewport: CssViewport): CssViewport {
  if (viewport.width >= 768) {
    return viewport.width > viewport.height ? { width: 834, height: 1194 } : { width: 1194, height: 834 };
  }
  return viewport.width > viewport.height ? { width: 402, height: 681 } : { width: 756, height: 352 };
}

async function expectElementInsideVisualViewport(page: Page, selector: string, label: string) {
  await expect.poll(async () => page.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    return bounds.left >= -1
      && bounds.right <= window.innerWidth + 1
      && bounds.top >= top - 1
      && bounds.bottom <= bottom + 1;
  }), { message: `${label}: surface remains fully inside the active visual viewport` }).toBe(true);
}

async function expectVisualViewportHeight(page: Page, height: number, label: string) {
  await expect.poll(async () => page.locator(".app-shell").evaluate((shell) => (
    getComputedStyle(shell).getPropertyValue("--overlay-visual-height").trim()
  )), { message: `${label}: visualViewport resize reaches the app shell` }).toBe(`${height}px`);
}

function normalizeTimingFunction(value: string) {
  return value.replaceAll(" ", "");
}

function scaleFromTransform(transform: string) {
  if (transform === "none") return 1;
  const match = transform.match(/^matrix\(([^,]+)/);
  if (!match) throw new Error(`Expected a 2D transform matrix, received ${transform}.`);
  return Number(match[1]);
}

async function readNavFootprint(page: Page) {
  return page.locator(".primary-nav").evaluate((navigation) => ({
    navigation: {
      clientHeight: navigation.clientHeight,
      clientWidth: navigation.clientWidth,
      offsetHeight: navigation.offsetHeight,
      offsetLeft: navigation.offsetLeft,
      offsetTop: navigation.offsetTop,
      offsetWidth: navigation.offsetWidth
    },
    buttons: Array.from(navigation.querySelectorAll<HTMLButtonElement>(".nav-item")).map((button) => ({
      clientHeight: button.clientHeight,
      clientWidth: button.clientWidth,
      offsetHeight: button.offsetHeight,
      offsetLeft: button.offsetLeft,
      offsetTop: button.offsetTop,
      offsetWidth: button.offsetWidth
    }))
  }));
}

async function expectNavPresentation(page: Page, viewport: CssViewport, label: string) {
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation, `${label}: navigation remains visible`).toBeVisible();
  const measurements = await navigation.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>(".nav-item")).map((button) => ({
      height: button.clientHeight,
      width: button.clientWidth
    }));
    return { height: bounds.height, width: bounds.width, buttons };
  });
  expect(measurements.height > measurements.width ? "rail" : "bottom", `${label}: matches the locked device classifier`).toBe(
    expectedNavigationPresentation(viewport)
  );
  for (const [index, button] of measurements.buttons.entries()) {
    expect(button.width, `${label}: item ${index + 1} keeps a 44px touch width`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: item ${index + 1} keeps a 44px touch height`).toBeGreaterThanOrEqual(44);
  }
}

async function pauseNavAnimations(page: Page) {
  return page.addStyleTag({ content: ".nav-icon-motion svg { animation-play-state: paused !important; }" });
}

async function readActiveNavMotion(page: Page) {
  return page.locator(".nav-item.active").evaluate((item) => {
    const icon = item.querySelector<HTMLElement>(".nav-icon");
    const iconMotion = item.querySelector<SVGElement>(".nav-icon-motion svg");
    if (!icon || !iconMotion) throw new Error("Active navigation item is missing its icon layers.");
    const iconStyle = getComputedStyle(icon);
    const motionStyle = getComputedStyle(iconMotion);
    return {
      isPressed: item.matches(":active"),
      animationDuration: motionStyle.animationDuration,
      animationName: motionStyle.animationName,
      animationTimingFunction: motionStyle.animationTimingFunction,
      iconTransform: iconStyle.transform,
      iconTransitionDuration: iconStyle.transitionDuration,
      iconTransitionProperty: iconStyle.transitionProperty,
      iconTransitionTimingFunction: iconStyle.transitionTimingFunction,
      motionTransform: motionStyle.transform
    };
  });
}

async function readUploadNavLayers(page: Page) {
  return page.locator(".nav-upload.active").evaluate((item) => {
    const outer = item.querySelector<HTMLElement>(".nav-icon");
    const inner = item.querySelector<SVGElement>(".nav-icon-motion svg");
    if (!outer || !inner) throw new Error("The active Upload navigation item is missing an icon layer.");
    return {
      isPressed: item.matches(":active"),
      outerTransform: getComputedStyle(outer).transform,
      innerTransform: getComputedStyle(inner).transform,
      item: {
        clientHeight: item.clientHeight,
        clientWidth: item.clientWidth,
        offsetHeight: item.offsetHeight,
        offsetLeft: item.offsetLeft,
        offsetTop: item.offsetTop,
        offsetWidth: item.offsetWidth
      }
    };
  });
}

async function finishActiveNavAnimation(page: Page) {
  await page.locator(".nav-item.active .nav-icon-motion svg").evaluate((icon) => {
    for (const animation of icon.getAnimations()) animation.finish();
  });
}

async function finishActiveNavIconTransition(page: Page) {
  await page.locator(".nav-item.active .nav-icon").evaluate((icon) => {
    for (const animation of icon.getAnimations()) animation.finish();
  });
}

async function openPreparedChapterConfirm(page: Page, bookCourseApi: { usePreparedCourse: () => void }) {
  bookCourseApi.usePreparedCourse();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
  const animationPause = await pauseNavAnimations(page);
  const screen = page.locator(".motion-screen-transition");
  const continueLearning = page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true });
  await expect(screen, "prepared ChapterConfirm flow starts from a settled screen").toHaveAttribute("data-motion-state", "idle");
  await expect(continueLearning, "prepared ChapterConfirm flow exposes its real library entry").toBeVisible();
  await continueLearning.click();
  await expect(page.locator(".library-course-grid"), "prepared ChapterConfirm flow loads the library before editing").toBeVisible();
  await expect(screen, "prepared ChapterConfirm library transition settles before course editing").toHaveAttribute("data-motion-state", "idle");
  const courseEdit = page.getByRole("button", { name: "编辑 阶段 3 测试教材", exact: true }).first();
  await expect(courseEdit, "prepared ChapterConfirm flow exposes the real course edit control").toBeVisible();
  await courseEdit.click();
  const editContent = page.getByRole("button", { name: "编辑内容", exact: true }).first();
  await expect(editContent, "course edit menu opens before its content action is requested").toBeVisible();
  await expect(editContent, "course edit content action remains enabled").toBeEnabled();
  await editContent.click();
  await expect(page.locator(".nav-item.active")).toHaveAttribute("data-motion-nav-kind", "upload");
  return animationPause;
}

test.describe("Stage 2B PrimaryNav motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("uses independent active and press transforms across the locked phone and rail viewports", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      await page.goto("/?embedded=device-preview");
      await expectNavPresentation(page, viewport, `${project.name} ${viewport.width}x${viewport.height} standard navigation`);
      const before = await readNavFootprint(page);
      await pauseNavAnimations(page);
      await page.getByRole("button", { name: "社区", exact: true }).click();

      const active = page.locator(".nav-item.active");
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect(active).toHaveAttribute("data-motion-nav-kind", "standard");
      const motion = await readActiveNavMotion(page);
      expect(motion.animationName).toBe("motion-nav-active-in");
      expect(motion.animationDuration).toBe("0.14s");
      expect(normalizeTimingFunction(motion.animationTimingFunction)).toBe("cubic-bezier(0.2,0.8,0.2,1)");
      expect(scaleFromTransform(motion.motionTransform)).toBeCloseTo(0.94, 4);
      expect(motion.iconTransitionProperty).toBe("transform");
      expect(motion.iconTransitionDuration).toBe("0.14s");
      expect(normalizeTimingFunction(motion.iconTransitionTimingFunction)).toBe("cubic-bezier(0.2,0.8,0.2,1)");
      await finishActiveNavIconTransition(page);
      expect(scaleFromTransform((await readActiveNavMotion(page)).iconTransform)).toBeCloseTo(1.14, 4);
      expect(await readNavFootprint(page)).toEqual(before);

      const iconBox = await active.locator(".nav-icon").boundingBox();
      if (!iconBox) throw new Error("Active navigation icon has no bounding box.");
      const pressFinalizer = await page.addStyleTag({
        content: ".primary-nav .nav-item:active .nav-icon { transition-duration: 0s !important; }"
      });
      await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
      await page.mouse.down();
      try {
        const pressed = await readActiveNavMotion(page);
        expect(pressed.isPressed).toBe(true);
        expect(scaleFromTransform(pressed.iconTransform)).toBeCloseTo(0.96, 4);
        expect(scaleFromTransform(pressed.motionTransform)).toBeCloseTo(0.94, 4);
        expect(await readNavFootprint(page)).toEqual(before);
      } finally {
        await page.mouse.up();
        await pressFinalizer.evaluate((element) => element.remove());
      }

      await finishActiveNavAnimation(page);
      await expect.poll(async () => scaleFromTransform((await readActiveNavMotion(page)).motionTransform)).toBeCloseTo(1, 4);
      await page.keyboard.press("Tab");
      await active.focus();
      const focus = await active.evaluate((button) => ({
        focusVisible: button.matches(":focus-visible"),
        outlineStyle: getComputedStyle(button).outlineStyle
      }));
      expect(focus.focusVisible, `${project.name} ${viewport.width}x${viewport.height}: keyboard focus remains visible`).toBe(true);
      expect(focus.outlineStyle, `${project.name} ${viewport.width}x${viewport.height}: focus outline remains static`).toBe("solid");

      await page.getByRole("button", { name: "我的", exact: true }).click();
      await page.getByRole("button", { name: "首页", exact: true }).click();
      await expect(page.getByRole("button", { name: "首页", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".nav-item.active")).toHaveCount(1);
      await expectNavPresentation(page, viewport, `${project.name} ${viewport.width}x${viewport.height} rapid navigation`);
    }

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      const animationPause = await openPreparedChapterConfirm(page, bookCourseApi);
      await expectNavPresentation(page, viewport, `${project.name} ${viewport.width}x${viewport.height} upload navigation`);
      const before = await readNavFootprint(page);
      const active = page.locator(".nav-item.active");
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect(active).toHaveAttribute("data-motion-nav-kind", "upload");
      const motion = await readActiveNavMotion(page);
      expect(motion.animationName).toBe("motion-nav-active-in");
      expect(motion.animationDuration).toBe("0.14s");
      expect(normalizeTimingFunction(motion.animationTimingFunction)).toBe("cubic-bezier(0.2,0.8,0.2,1)");
      expect(scaleFromTransform(motion.motionTransform)).toBeCloseTo(0.94, 4);
      await finishActiveNavIconTransition(page);
      expect(scaleFromTransform((await readActiveNavMotion(page)).iconTransform)).toBeCloseTo(1.14, 4);
      expect(await readNavFootprint(page)).toEqual(before);
      await finishActiveNavAnimation(page);
      await expect.poll(async () => scaleFromTransform((await readActiveNavMotion(page)).motionTransform)).toBeCloseTo(1, 4);
      expect(scaleFromTransform((await readActiveNavMotion(page)).iconTransform)).toBeCloseTo(1.14, 4);
      await animationPause.evaluate((element) => element.remove());
    }
  });

  test("keeps the active Upload press layered, physical, and layout-neutral across paired viewports", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      const animationPause = await openPreparedChapterConfirm(page, bookCourseApi);
      await finishActiveNavIconTransition(page);
      const upload = page.locator(".nav-upload.active");
      const beforeFootprint = await readNavFootprint(page);
      const before = await readUploadNavLayers(page);
      expect(before.item.clientWidth, `${project.name} ${viewport.width}x${viewport.height}: Upload keeps a 44px client width`).toBeGreaterThanOrEqual(44);
      expect(before.item.clientHeight, `${project.name} ${viewport.width}x${viewport.height}: Upload keeps a 44px client height`).toBeGreaterThanOrEqual(44);
      expect(scaleFromTransform(before.outerTransform), `${project.name} ${viewport.width}x${viewport.height}: Upload active outer layer starts at 1.14`).toBeCloseTo(1.14, 4);
      expect(scaleFromTransform(before.innerTransform), `${project.name} ${viewport.width}x${viewport.height}: Upload inner active layer starts at .94`).toBeCloseTo(0.94, 4);

      const box = await upload.boundingBox();
      if (!box) throw new Error("The active Upload navigation item has no physical pointer target.");
      const pressFinalizer = await page.addStyleTag({
        content: ".primary-nav .nav-item:active .nav-icon { transition-duration: 0s !important; }"
      });
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      try {
        await expect.poll(() => readUploadNavLayers(page), {
          message: `${project.name} ${viewport.width}x${viewport.height}: a held physical pointer keeps Upload active`
        }).toMatchObject({ isPressed: true });
        await expect.poll(async () => scaleFromTransform((await readUploadNavLayers(page)).outerTransform), {
          message: `${project.name} ${viewport.width}x${viewport.height}: Upload outer press layer reaches .96 while physically held`
        }).toBeCloseTo(0.96, 4);
        const pressed = await readUploadNavLayers(page);
        expect(scaleFromTransform(pressed.outerTransform), `${project.name} ${viewport.width}x${viewport.height}: Upload outer press layer is .96`).toBeCloseTo(0.96, 4);
        expect(scaleFromTransform(pressed.innerTransform), `${project.name} ${viewport.width}x${viewport.height}: Upload inner active layer remains .94`).toBeCloseTo(0.94, 4);
        expect(pressed.item, `${project.name} ${viewport.width}x${viewport.height}: Upload client and offset geometry are immutable while pressed`).toEqual(before.item);
        expect(await readNavFootprint(page), `${project.name} ${viewport.width}x${viewport.height}: navigation footprint is immutable while Upload is held`).toEqual(beforeFootprint);
      } finally {
        await page.mouse.move(0, 0);
        await page.mouse.up();
        await pressFinalizer.evaluate((element) => element.remove());
      }

      await expect.poll(async () => scaleFromTransform((await readUploadNavLayers(page)).outerTransform), {
        message: `${project.name} ${viewport.width}x${viewport.height}: Upload outer press layer releases to 1`
      }).toBeCloseTo(1.14, 4);
      await finishActiveNavAnimation(page);
      await expect.poll(async () => scaleFromTransform((await readUploadNavLayers(page)).innerTransform)).toBeCloseTo(1, 4);
      expect(await readNavFootprint(page), `${project.name} ${viewport.width}x${viewport.height}: navigation footprint remains immutable after Upload release`).toEqual(beforeFootprint);
      await animationPause.evaluate((element) => element.remove());
    }
  });

  test("removes active Upload press transforms during a real reduced-motion hold", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      const animationPause = await openPreparedChapterConfirm(page, bookCourseApi);
      const upload = page.locator(".nav-upload.active");
      const beforeFootprint = await readNavFootprint(page);
      const before = await readUploadNavLayers(page);
      expect(before.innerTransform, `${project.name} ${viewport.width}x${viewport.height}: reduced Upload has no inner active transform`).toBe("none");
      expect(scaleFromTransform(before.outerTransform), `${project.name} ${viewport.width}x${viewport.height}: reduced Upload keeps its static selected scale`).toBeCloseTo(1.14, 4);

      const box = await upload.boundingBox();
      if (!box) throw new Error("The reduced active Upload navigation item has no physical pointer target.");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      try {
        await expect.poll(() => readUploadNavLayers(page), {
          message: `${project.name} ${viewport.width}x${viewport.height}: a held reduced-motion Upload pointer is still physically active`
        }).toMatchObject({ isPressed: true });
        const pressed = await readUploadNavLayers(page);
        expect(pressed.outerTransform, `${project.name} ${viewport.width}x${viewport.height}: reduced Upload outer press layer remains static`).toBe("none");
        expect(pressed.innerTransform, `${project.name} ${viewport.width}x${viewport.height}: reduced Upload inner layer remains static`).toBe("none");
        expect(pressed.item, `${project.name} ${viewport.width}x${viewport.height}: reduced Upload geometry is immutable while held`).toEqual(before.item);
        expect(await readNavFootprint(page), `${project.name} ${viewport.width}x${viewport.height}: reduced navigation footprint is immutable while Upload is held`).toEqual(beforeFootprint);
      } finally {
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }

      const released = await readUploadNavLayers(page);
      expect(scaleFromTransform(released.outerTransform), `${project.name} ${viewport.width}x${viewport.height}: reduced Upload keeps its static selected scale after release`).toBeCloseTo(1.14, 4);
      expect(released.innerTransform, `${project.name} ${viewport.width}x${viewport.height}: reduced Upload inner layer is static after release`).toBe("none");
      expect(await readNavFootprint(page), `${project.name} ${viewport.width}x${viewport.height}: reduced navigation footprint remains immutable after release`).toEqual(beforeFootprint);
      await animationPause.evaluate((element) => element.remove());
    }
  });

  test("uses direct final navigation states under reduced motion across the same eight viewports", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      await page.goto("/?embedded=device-preview");
      await expectNavPresentation(page, viewport, `${project.name} ${viewport.width}x${viewport.height} reduced navigation`);
      const before = await readNavFootprint(page);
      await page.getByRole("button", { name: "社区", exact: true }).click();
      const active = page.locator(".nav-item.active");
      await expect(active).toHaveAttribute("aria-current", "page");
      const motion = await readActiveNavMotion(page);
      expect(motion.animationName).toBe("none");
      expect(motion.motionTransform).toBe("none");
      expect(scaleFromTransform(motion.iconTransform)).toBeCloseTo(1.14, 4);
      expect(motion.iconTransitionProperty).toBe("none");
      expect(motion.iconTransitionDuration).toBe("0s");
      expect(await readNavFootprint(page)).toEqual(before);
    }
  });
});

type ActionSheetType = "chat" | "source" | "note" | "editChapter";

type ActionSheetExpectation = {
  closeDuration: string;
  closeName: string;
  closeTransform: { scale: number; x: number; y: number };
  enterDuration: string;
  enterName: string;
  enterTransform: { scale: number; x: number; y: number };
};

function expectedActionSheetMotion(type: ActionSheetType, viewport: CssViewport): ActionSheetExpectation {
  const shortLandscape = viewport.height < 600 && viewport.width > viewport.height;
  if (shortLandscape) {
    return {
      enterName: "motion-sheet-short-in",
      enterDuration: "0.18s",
      enterTransform: { scale: 1, x: 0, y: 6 },
      closeName: "motion-sheet-short-out",
      closeDuration: "0.14s",
      closeTransform: { scale: 1, x: 0, y: 6 }
    };
  }

  const tablet = viewport.width >= 768 && viewport.height >= 600;
  if (!tablet) {
    return {
      enterName: "motion-sheet-phone-in",
      enterDuration: "0.24s",
      enterTransform: { scale: 1, x: 0, y: 18 },
      closeName: "motion-sheet-phone-out",
      closeDuration: "0.18s",
      closeTransform: { scale: 1, x: 0, y: 12 }
    };
  }

  if (type === "chat") {
    return {
      enterName: "motion-panel-tablet-in",
      enterDuration: "0.24s",
      enterTransform: { scale: 1, x: 20, y: 0 },
      closeName: "motion-panel-tablet-out",
      closeDuration: "0.18s",
      closeTransform: { scale: 1, x: 16, y: 0 }
    };
  }

  if (type === "source") {
    return {
      enterName: "motion-dialog-source-in",
      enterDuration: "0.18s",
      enterTransform: { scale: 1, x: 0, y: 6 },
      closeName: "motion-dialog-source-out",
      closeDuration: "0.14s",
      closeTransform: { scale: 1, x: 0, y: 6 }
    };
  }

  return {
    enterName: "motion-dialog-center-in",
    enterDuration: "0.18s",
    enterTransform: { scale: 0.98, x: 0, y: 0 },
    closeName: "motion-dialog-center-out",
    closeDuration: "0.14s",
    closeTransform: { scale: 0.98, x: 0, y: 0 }
  };
}

function readTransformComponents(transform: string) {
  if (transform === "none") return { scale: 1, x: 0, y: 0 };
  const values = transform.match(/^matrix\((.+)\)$/)?.[1].split(",").map((value) => Number(value.trim()));
  if (!values || values.length !== 6) throw new Error(`Expected a 2D transform matrix, received ${transform}.`);
  return { scale: values[0], x: values[4], y: values[5] };
}

function readTransformTranslation(transform: string) {
  if (transform === "none") return { x: 0, y: 0 };
  const matrix = transform.match(/^matrix\((.+)\)$/)?.[1].split(",").map((value) => Number(value.trim()));
  if (matrix?.length === 6) return { x: matrix[4], y: matrix[5] };
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)?.[1].split(",").map((value) => Number(value.trim()));
  if (matrix3d?.length === 16) return { x: matrix3d[12], y: matrix3d[13] };
  throw new Error(`Expected a CSS transform matrix, received ${transform}.`);
}

function readKeyframeTransformComponents(transform: string) {
  if (transform === "none") return { scale: 1, x: 0, y: 0 };
  const scale = Number(transform.match(/scale\(([-\d.]+)\)/)?.[1] ?? 1);
  const x = Number(transform.match(/translateX\(([-\d.]+)px\)/)?.[1] ?? 0);
  const y = Number(transform.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? 0);
  return { scale, x, y };
}

async function pauseActionSheetAnimations(page: Page) {
  return page.addStyleTag({ content: ".sheet, .sheet-scrim { animation-play-state: paused !important; }" });
}

async function removeStyleTag(styleTag: Awaited<ReturnType<Page["addStyleTag"]>>) {
  await styleTag.evaluate((element) => element.remove());
}

async function finishActionSheetAnimation(page: Page) {
  await page.locator(".sheet").evaluate((sheet) => {
    for (const animation of sheet.getAnimations()) animation.finish();
  });
}

async function readToastMotion(page: Page) {
  return page.locator(".toast").evaluate((toast) => ({
    ariaAtomic: toast.getAttribute("aria-atomic"),
    ariaLive: toast.getAttribute("aria-live"),
    presence: Number(toast.getAttribute("data-motion-presence")),
    role: toast.getAttribute("role"),
    state: toast.getAttribute("data-motion-state"),
    text: toast.textContent?.trim() ?? ""
  }));
}

async function settleToastAnimation(page: Page, animationName: "motion-toast-in" | "motion-toast-out") {
  await page.locator(".toast").evaluate((toast, name) => {
    toast.dispatchEvent(new AnimationEvent("animationcancel", { animationName: name, bubbles: true }));
  }, animationName);
}

async function readActionSheetMotion(page: Page) {
  return page.locator(".sheet").evaluate((sheet) => {
    const scrim = document.querySelector<HTMLElement>(".sheet-scrim");
    if (!scrim) throw new Error("ActionSheet scrim is missing.");
    const keyframeProperties = (element: Element) => {
      const ignored = new Set(["composite", "computedOffset", "easing", "offset"]);
      const properties = new Set<string>();
      for (const animation of element.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes?.() ?? []) {
          for (const property of Object.keys(frame)) {
            if (!ignored.has(property)) properties.add(property);
          }
        }
      }
      return [...properties].sort();
    };
    const keyframeTransforms = (element: Element) => {
      const transforms: string[] = [];
      for (const animation of element.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes?.() ?? []) {
          if (typeof frame.transform === "string") transforms.push(frame.transform);
        }
      }
      return transforms;
    };
    const readLayout = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter,
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        filter: style.filter,
        height: style.height,
        left: style.left,
        offsetHeight: element.offsetHeight,
        offsetLeft: element.offsetLeft,
        offsetTop: element.offsetTop,
        offsetWidth: element.offsetWidth,
        top: style.top,
        width: style.width
      };
    };
    const sheetStyle = getComputedStyle(sheet);
    const scrimStyle = getComputedStyle(scrim);
    return {
      layout: readLayout(sheet),
      scrimAnimationDuration: scrimStyle.animationDuration,
      scrimAnimationName: scrimStyle.animationName,
      scrimAnimationProperties: keyframeProperties(scrim),
      scrimAnimationTimingFunction: scrimStyle.animationTimingFunction,
      scrimTransform: scrimStyle.transform,
      state: sheet.getAttribute("data-motion-state"),
      surfaceAnimationDuration: sheetStyle.animationDuration,
      surfaceAnimationName: sheetStyle.animationName,
      surfaceAnimationProperties: keyframeProperties(sheet),
      surfaceAnimationTimingFunction: sheetStyle.animationTimingFunction,
      surfaceKeyframeTransforms: keyframeTransforms(sheet),
      surfaceOpacity: sheetStyle.opacity,
      surfaceTransform: sheetStyle.transform
    };
  });
}

function expectNoLayoutMotionProperties(properties: string[], label: string) {
  for (const property of ["backdropFilter", "filter", "height", "left", "top", "width"]) {
    expect(properties, `${label}: animation does not touch ${property}`).not.toContain(property);
  }
}

function expectActionSheetState(
  motion: Awaited<ReturnType<typeof readActionSheetMotion>>,
  expected: ActionSheetExpectation,
  phase: "entering" | "closing",
  label: string
) {
  const name = phase === "entering" ? expected.enterName : expected.closeName;
  const duration = phase === "entering" ? expected.enterDuration : expected.closeDuration;
  const transform = phase === "entering" ? expected.enterTransform : { scale: 1, x: 0, y: 0 };
  const timing = phase === "entering" ? "cubic-bezier(0.16,1,0.3,1)" : "cubic-bezier(0.4,0,1,1)";

  expect(motion.state, `${label}: motion phase`).toBe(phase);
  expect(motion.surfaceAnimationName, `${label}: surface animation name`).toBe(name);
  expect(motion.surfaceAnimationDuration, `${label}: surface animation duration`).toBe(duration);
  expect(normalizeTimingFunction(motion.surfaceAnimationTimingFunction), `${label}: surface animation easing`).toBe(timing);
  const surfaceTransform = readTransformComponents(motion.surfaceTransform);
  expect(surfaceTransform.scale, `${label}: surface scale`).toBeCloseTo(transform.scale, 4);
  expect(surfaceTransform.x, `${label}: surface x offset`).toBeCloseTo(transform.x, 4);
  expect(surfaceTransform.y, `${label}: surface y offset`).toBeCloseTo(transform.y, 4);
  if (phase === "closing") {
    const finalTransform = motion.surfaceKeyframeTransforms.at(-1);
    if (!finalTransform) throw new Error(`${label}: closing surface has no terminal transform keyframe.`);
    const terminalTransform = readKeyframeTransformComponents(finalTransform);
    expect(terminalTransform.scale, `${label}: closing terminal scale`).toBeCloseTo(expected.closeTransform.scale, 4);
    expect(terminalTransform.x, `${label}: closing terminal x offset`).toBeCloseTo(expected.closeTransform.x, 4);
    expect(terminalTransform.y, `${label}: closing terminal y offset`).toBeCloseTo(expected.closeTransform.y, 4);
  }
  expect(motion.scrimAnimationName, `${label}: scrim animation name`).toBe(phase === "entering" ? "motion-scrim-in" : "motion-scrim-out");
  expect(motion.scrimAnimationDuration, `${label}: scrim animation duration`).toBe("0.14s");
  expect(normalizeTimingFunction(motion.scrimAnimationTimingFunction), `${label}: scrim animation easing`).toBe(
    phase === "entering" ? "cubic-bezier(0.2,0.8,0.2,1)" : "cubic-bezier(0.4,0,1,1)"
  );
  expect(motion.scrimTransform, `${label}: scrim only animates opacity`).toBe("none");
  expectNoLayoutMotionProperties(motion.surfaceAnimationProperties, label);
  expect(motion.scrimAnimationProperties, `${label}: scrim keyframes only expose opacity`).toEqual(["opacity"]);
}

async function openPreparedLessonForMotion(page: Page, bookCourseApi: { usePreparedCourse: () => void }) {
  bookCourseApi.usePreparedCourse();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true }).click();
  await page.getByRole("button", { name: "进入课程", exact: true }).first().click();
  await page.locator(".course-action-grid").getByRole("button", { name: /RAG 片段/ }).click();
  await expect(page.locator(".lesson-layout")).toBeVisible();
  await expect(page.getByRole("button", { name: "问 AI", exact: true })).toBeVisible();
}

async function openPreparedChapterEditorForMotion(page: Page, bookCourseApi: { usePreparedCourse: () => void }) {
  bookCourseApi.usePreparedCourse();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true }).click();
  await expect(page.locator(".library-course-grid"), "prepared fixture opens its course library before editing a course").toBeVisible();
  await page.getByRole("button", { name: "编辑 阶段 3 测试教材", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "编辑内容", exact: true }), "course edit menu opens before its content action is requested").toBeVisible();
  await page.getByRole("button", { name: "编辑内容", exact: true }).first().click();
  const trigger = page.getByRole("button", { name: "编辑 细胞分裂", exact: true });
  await expect(trigger, "chapter confirmation loads before its edit action is measured").toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  return trigger;
}

async function openPausedActionSheet(page: Page, trigger: { click: () => Promise<void> }) {
  const pause = await pauseActionSheetAnimations(page);
  await trigger.click();
  await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "entering");
  return pause;
}

test.describe("Stage 2C ActionSheet and Toast motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("maps chat, source, and note surfaces to the locked device motion across all eight viewports", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openPreparedLessonForMotion(page, bookCourseApi);
    const chatTrigger = page.getByRole("button", { name: "问 AI", exact: true });

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      const chatPause = await openPausedActionSheet(page, chatTrigger);
      const chatBefore = await readActionSheetMotion(page);
      expectActionSheetState(chatBefore, expectedActionSheetMotion("chat", viewport), "entering", `${project.name} ${viewport.width}x${viewport.height} chat`);
      await finishActionSheetAnimation(page);
      await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "idle");
      const chatAfter = await readActionSheetMotion(page);
      expect(chatAfter.layout, `${project.name} ${viewport.width}x${viewport.height} chat keeps static surface layout`).toEqual(chatBefore.layout);
      await removeStyleTag(chatPause);

      const chatDialog = page.getByRole("dialog", { name: "问 AI" });
      await chatDialog.getByRole("textbox", { name: "继续提问" }).fill("同源染色体会在哪里分离？");
      await chatDialog.getByRole("button", { name: "发送问题", exact: true }).click();
      const sourceTrigger = chatDialog.getByRole("button", { name: "查看原文", exact: true });
      await expect(sourceTrigger).toBeVisible();
      const sourcePause = await openPausedActionSheet(page, sourceTrigger);
      const sourceBefore = await readActionSheetMotion(page);
      expectActionSheetState(sourceBefore, expectedActionSheetMotion("source", viewport), "entering", `${project.name} ${viewport.width}x${viewport.height} source`);
      await expect(page.locator(".sheet")).toHaveCount(1);
      await finishActionSheetAnimation(page);
      await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "idle");
      const sourceAfter = await readActionSheetMotion(page);
      expect(sourceAfter.layout, `${project.name} ${viewport.width}x${viewport.height} source keeps static surface layout`).toEqual(sourceBefore.layout);
      await removeStyleTag(sourcePause);

      const sourceClosePause = await pauseActionSheetAnimations(page);
      await page.keyboard.press("Escape");
      expectActionSheetState(await readActionSheetMotion(page), expectedActionSheetMotion("source", viewport), "closing", `${project.name} ${viewport.width}x${viewport.height} source exit`);
      await finishActionSheetAnimation(page);
      await removeStyleTag(sourceClosePause);
      await expect(page.locator(".sheet")).toHaveCount(0);
      await expect(chatTrigger).toBeFocused();

      const noteTrigger = page.locator(".concept-card-grid").getByRole("button").first();
      const notePause = await openPausedActionSheet(page, noteTrigger);
      const noteBefore = await readActionSheetMotion(page);
      expectActionSheetState(noteBefore, expectedActionSheetMotion("note", viewport), "entering", `${project.name} ${viewport.width}x${viewport.height} note`);
      await finishActionSheetAnimation(page);
      await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "idle");
      const noteAfter = await readActionSheetMotion(page);
      expect(noteAfter.layout, `${project.name} ${viewport.width}x${viewport.height} note keeps static surface layout`).toEqual(noteBefore.layout);
      await removeStyleTag(notePause);

      const noteClosePause = await pauseActionSheetAnimations(page);
      await page.keyboard.press("Escape");
      expectActionSheetState(await readActionSheetMotion(page), expectedActionSheetMotion("note", viewport), "closing", `${project.name} ${viewport.width}x${viewport.height} note exit`);
      await finishActionSheetAnimation(page);
      await removeStyleTag(noteClosePause);
      await expect(page.locator(".sheet")).toHaveCount(0);
    }
  });

  test("replaces a closing Chat with Source as a new Presence generation without letting old Chat events unmount it", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await openPreparedLessonForMotion(page, bookCourseApi);
    // This page has already loaded, so anchor the emulated clock to its own
    // current time and pause slightly ahead of it. A fixed historical date
    // can be in the past by the time Playwright receives pauseAt().
    await page.clock.install();
    const freezeAt = await page.evaluate(() => Date.now() + 1_000);
    await page.clock.pauseAt(freezeAt);
    const chatTrigger = page.getByRole("button", { name: "问 AI", exact: true });
    const entryPause = await openPausedActionSheet(page, chatTrigger);
    await finishActionSheetAnimation(page);
    await removeStyleTag(entryPause);

    const chat = page.locator(".sheet[data-sheet-type='chat']");
    await chat.getByRole("textbox", { name: "继续提问" }).fill("同源染色体会在哪里分离？");
    await chat.getByRole("button", { name: "发送问题", exact: true }).click();
    const sourceTrigger = chat.getByRole("button", { name: "查看原文", exact: true });
    await expect(sourceTrigger).toBeVisible();

    const closePause = await pauseActionSheetAnimations(page);
    await page.keyboard.press("Escape");
    await expect(chat).toHaveAttribute("data-motion-state", "closing");
    const closingPresence = Number(await chat.getAttribute("data-motion-presence"));
    const staleChat = await chat.elementHandle();
    if (!staleChat) throw new Error("Closing Chat panel is missing its generation root.");

    await sourceTrigger.dispatchEvent("click");
    const source = page.locator(".sheet[data-sheet-type='source']");
    await expect(source, `${project.name}: Source replaces the frozen Chat panel`).toHaveAttribute("data-motion-state", "entering");
    const sourcePresence = Number(await source.getAttribute("data-motion-presence"));
    expect(sourcePresence, `${project.name}: Source receives a newer ActionSheet Presence generation`).toBeGreaterThan(closingPresence);
    await expect(page.locator(".sheet"), `${project.name}: A→B replacement keeps one current panel`).toHaveCount(1);
    expect(await staleChat.evaluate((element) => element.isConnected), `${project.name}: closing Chat root is detached before Source entry`).toBe(false);

    await staleChat.evaluate((element, animationName) => {
      element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true }));
    }, expectedActionSheetMotion("chat", project.initialViewport).closeName);
    await expect(source, `${project.name}: an old Chat exit event cannot unmount the Source generation`).toHaveAttribute("data-motion-state", "entering");

    await source.evaluate((element, animationName) => {
      element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true }));
    }, expectedActionSheetMotion("source", project.initialViewport).enterName);
    await expect(source, `${project.name}: Source settles only from its current entry event`).toHaveAttribute("data-motion-state", "idle");
    await source.focus();
    await page.keyboard.press("Escape");
    await expect(source, `${project.name}: focused Source begins its own exit`).toHaveAttribute("data-motion-state", "closing");
    await source.evaluate((element, animationName) => {
      element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true }));
    }, expectedActionSheetMotion("source", project.initialViewport).closeName);
    await removeStyleTag(closePause);
    await expect(source).toHaveCount(0);
  });

  test("keeps closing sheets modal and focus-trapped while blocking frozen work and restoring focus safely", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openPreparedLessonForMotion(page, bookCourseApi);
    const noteTrigger = page.locator(".concept-card-grid").getByRole("button").first();
    const noteEntryPause = await openPausedActionSheet(page, noteTrigger);
    await finishActionSheetAnimation(page);
    await removeStyleTag(noteEntryPause);

    const dialog = page.getByRole("dialog", { name: "导学笔记" });
    await expect(dialog).toHaveAttribute("data-motion-state", "idle");
    const focusable = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    const first = focusable.first();
    const last = focusable.last();
    await first.focus();
    await expect(first).toBeFocused();

    const closingPause = await pauseActionSheetAnimations(page);
    await page.keyboard.press("Escape");
    expectActionSheetState(await readActionSheetMotion(page), expectedActionSheetMotion("note", project.initialViewport), "closing", `${project.name}: note close`);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(dialog).not.toHaveAttribute("aria-hidden");
    await expect(dialog).not.toHaveAttribute("inert");

    await last.focus();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(last).toBeFocused();

    const readToastSnapshot = () => page.locator(".toast").evaluateAll((elements) => elements.map((element) => ({
      presence: element.getAttribute("data-motion-presence"),
      text: element.textContent?.trim() ?? ""
    })));
    const toastBeforeClosingActions = await readToastSnapshot();
    const save = dialog.getByRole("button", { name: "保存到笔记", exact: true });
    await save.focus();
    await page.keyboard.press("Enter");
    expect(await readToastSnapshot(), `${project.name}: closing Enter cannot replace the existing Toast`).toEqual(toastBeforeClosingActions);
    await save.focus();
    await page.keyboard.press("Space");
    expect(await readToastSnapshot(), `${project.name}: closing Space cannot replace the existing Toast`).toEqual(toastBeforeClosingActions);
    await save.click();
    expect(await readToastSnapshot(), `${project.name}: closing pointer activation cannot replace the existing Toast`).toEqual(toastBeforeClosingActions);

    const back = page.getByRole("button", { name: "返回", exact: true });
    const backBox = await back.boundingBox();
    if (!backBox) throw new Error("The covered background back button has no bounding box.");
    await page.mouse.click(backBox.x + backBox.width / 2, backBox.y + backBox.height / 2);
    await expect(page.locator("main.screen-content"), `${project.name}: closing scrim blocks background navigation`).toHaveAttribute("data-screen", "lesson");
    await page.keyboard.press("Escape");
    await expect(dialog, `${project.name}: Escape remains non-destructive while already closing`).toHaveAttribute("data-motion-state", "closing");

    await finishActionSheetAnimation(page);
    await removeStyleTag(closingPause);
    await expect(dialog).toHaveCount(0);
    await expect(noteTrigger, `${project.name}: normal close restores the original trigger`).toBeFocused();

    const navigationEntryPause = await openPausedActionSheet(page, noteTrigger);
    await finishActionSheetAnimation(page);
    await removeStyleTag(navigationEntryPause);
    const navigationClosePause = await pauseActionSheetAnimations(page);
    await page.locator(".sheet").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "closing");
    await back.dispatchEvent("click");
    const destinationMain = page.locator("main.screen-content[data-screen='book']");
    await expect(destinationMain, `${project.name}: navigation replaces the underlying screen while the sheet closes`).toBeVisible();
    await finishActionSheetAnimation(page);
    await removeStyleTag(navigationClosePause);
    await expect(page.locator(".sheet")).toHaveCount(0);
    await expect(destinationMain, `${project.name}: navigation owns the final focus instead of the stale trigger`).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName), `${project.name}: focus never falls back to body`).not.toBe("BODY");

    if (expectedNavigationPresentation(project.initialViewport) !== "bottom") return;

    const editorTrigger = await openPreparedChapterEditorForMotion(page, bookCourseApi);
    const editorEntryPause = await openPausedActionSheet(page, editorTrigger);
    expectActionSheetState(
      await readActionSheetMotion(page),
      expectedActionSheetMotion("editChapter", project.initialViewport),
      "entering",
      `${project.name}: EditChapter surface mapping`
    );
    await finishActionSheetAnimation(page);
    await removeStyleTag(editorEntryPause);
    const editor = page.locator(".sheet[data-sheet-type='editChapter']");
    await expect(editor).toHaveAttribute("data-motion-state", "idle");

    const blockedEditorPause = await pauseActionSheetAnimations(page);
    await editor.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(editor).toHaveAttribute("data-motion-state", "closing");
    const editorToastBeforeBlockedActions = await readToastSnapshot();
    const editorForm = editor.locator("form.chapter-edit-form");
    await editorForm.evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const sourceTitle = editor.locator("input").first();
    await sourceTitle.focus();
    await page.keyboard.press("Enter");
    const deleteButton = editor.locator(".button-danger").first();
    await deleteButton.focus();
    await page.keyboard.press("Space");
    await expect(editor.locator(".chapter-delete-confirm"), `${project.name}: closing Space cannot activate deletion`).toHaveCount(0);
    expect(await readToastSnapshot(), `${project.name}: closing form submit cannot replace the existing Toast`).toEqual(editorToastBeforeBlockedActions);
    await finishActionSheetAnimation(page);
    await removeStyleTag(blockedEditorPause);
    await expect(editor).toHaveCount(0);

    const deleteEntryPause = await openPausedActionSheet(page, editorTrigger);
    await finishActionSheetAnimation(page);
    await removeStyleTag(deleteEntryPause);
    const originalTitle = await editor.locator("input").first().inputValue();
    await editor.locator(".button-danger").first().click();
    const deletionPause = await pauseActionSheetAnimations(page);
    await editor.locator(".chapter-delete-confirm .button-danger").click();
    await expect(editor).toHaveAttribute("data-motion-state", "closing");
    await expect(page.locator(".sheet"), `${project.name}: deletion leaves exactly one frozen panel`).toHaveCount(1);
    await expect(editor.locator("input").first(), `${project.name}: deletion closing view keeps its immutable chapter snapshot`).toHaveValue(originalTitle);
    await finishActionSheetAnimation(page);
    await removeStyleTag(deletionPause);
    await expect(editor).toHaveCount(0);
    await expect(editorTrigger, `${project.name}: deleted chapter has no duplicate final editor trigger`).toHaveCount(0);
    const chapterConfirmMain = page.locator("main.screen-content[data-screen='chapterConfirm']");
    await expect(chapterConfirmMain, `${project.name}: deleting the editor trigger restores focus to the current main landmark`).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName), `${project.name}: deleting the focused editor trigger never falls back to body`).not.toBe("BODY");
  });

  test("settles ActionSheet cancellation, fallback, rapid reopen, and runtime reduced motion deterministically", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openPreparedLessonForMotion(page, bookCourseApi);
    const noteTrigger = page.locator(".concept-card-grid").getByRole("button").first();
    const paused = await openPausedActionSheet(page, noteTrigger);
    const enteringPanel = page.locator(".sheet");
    await expect(enteringPanel).toHaveAttribute("data-motion-state", "entering");
    await page.clock.fastForward(320);
    await expect(enteringPanel, `${project.name}: missing enter event reaches idle through its generation-bound fallback`).toHaveAttribute("data-motion-state", "idle");

    await enteringPanel.focus();
    await page.keyboard.press("Escape");
    await expect(enteringPanel).toHaveAttribute("data-motion-state", "closing");
    const stalePanel = await enteringPanel.elementHandle();
    if (!stalePanel) throw new Error("Closing ActionSheet panel is missing.");
    const closingPresence = Number(await enteringPanel.getAttribute("data-motion-presence"));
    await noteTrigger.dispatchEvent("click");
    await expect(enteringPanel, `${project.name}: rapid reopen begins a new generation`).toHaveAttribute("data-motion-state", "entering");
    const reopenedPresence = Number(await enteringPanel.getAttribute("data-motion-presence"));
    expect(reopenedPresence, `${project.name}: reopening increments the Presence generation`).toBeGreaterThan(closingPresence);
    expect(await stalePanel.evaluate((element) => element.isConnected), `${project.name}: stale generation panel is detached`).toBe(false);
    await stalePanel.evaluate((element) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName: "motion-sheet-phone-out",
      bubbles: true
    })));
    await expect(enteringPanel, `${project.name}: detached stale cancel cannot settle the reopened surface`).toHaveAttribute("data-motion-state", "entering");
    await enteringPanel.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName,
      bubbles: true
    })), expectedActionSheetMotion("note", project.initialViewport).enterName);
    await expect(enteringPanel, `${project.name}: current animationcancel settles entering to idle`).toHaveAttribute("data-motion-state", "idle");

    await enteringPanel.focus();
    await page.keyboard.press("Escape");
    await expect(enteringPanel).toHaveAttribute("data-motion-state", "closing");
    await page.clock.fastForward(320);
    await expect(enteringPanel, `${project.name}: missing exit event unmounts through its generation-bound fallback`).toHaveCount(0);
    await removeStyleTag(paused);

    const reducePause = await openPausedActionSheet(page, noteTrigger);
    await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "entering");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".sheet"), `${project.name}: runtime reduce settles an entering sheet immediately`).toHaveAttribute("data-motion-state", "idle");
    expect((await readActionSheetMotion(page)).surfaceAnimationName, `${project.name}: runtime reduce removes the sheet animation`).toBe("none");
    await page.locator(".sheet").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet"), `${project.name}: runtime reduce unmounts closing sheet immediately`).toHaveCount(0);
    await removeStyleTag(reducePause);

    await noteTrigger.click();
    const reducedDialog = page.getByRole("dialog", { name: "导学笔记" });
    await expect(reducedDialog).toHaveAttribute("data-motion-state", "idle");
    await reducedDialog.getByRole("button", { name: "保存到笔记", exact: true }).click();
    const reducedToast = page.locator(".toast");
    await expect(reducedToast, `${project.name}: reduced mode preserves the Toast business outcome`).toHaveAttribute("data-motion-state", "idle");
    expect(await reducedToast.evaluate((element) => getComputedStyle(element).animationName), `${project.name}: reduced Toast has no animation`).toBe("none");
  });

  test("keeps a Toast visible for its exact 3200ms business lifetime", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openPreparedLessonForMotion(page, bookCourseApi);
    const noteTrigger = page.locator(".concept-card-grid").getByRole("button").first();
    await noteTrigger.click();
    await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "entering");
    await finishActionSheetAnimation(page);
    await expect(page.locator(".sheet")).toHaveAttribute("data-motion-state", "idle");

    await page.locator(".sheet").getByRole("button", { name: "\u4fdd\u5b58\u5230\u7b14\u8bb0", exact: true }).click();
    const toast = page.locator(".toast");
    await expect(toast, `${project.name}: saving a note creates one Toast`).toHaveCount(1);
    await page.clock.fastForward(3199);
    await expect(toast, `${project.name}: Toast remains rendered before 3200ms`).toHaveAttribute("data-motion-state", "idle");
    await page.clock.fastForward(1);
    await expect(toast, `${project.name}: Toast begins its exit at exactly 3200ms`).toHaveAttribute("data-motion-state", "closing");
    await toast.evaluate((element) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName: "motion-toast-out",
      bubbles: true
    })));
    await expect(toast, `${project.name}: Toast Presence unmounts after its deterministic exit cancellation`).toHaveCount(0);
  });

  test("remounts Toast roots for entering replacements and isolates stale entry events", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-item").nth(3).click();
    await settleScreenTransition(page);
    const toastPause = await page.addStyleTag({ content: ".toast { animation-play-state: paused !important; }" });
    const reminder = page.locator(".settings-row").filter({ hasText: "学习提醒" });
    const preferences = page.locator(".settings-row").filter({ hasText: "偏好设置" });
    const toast = page.locator(".toast");

    try {
      await reminder.focus();
      await expect(reminder, `${project.name}: first Toast trigger remains keyboard reachable`).toBeFocused();
      await page.keyboard.press("Enter");
      const first = await readToastMotion(page);
      expect(first.state, `${project.name}: first Toast starts entering`).toBe("entering");
      const oldRoot = await toast.elementHandle();
      if (!oldRoot) throw new Error("First Toast root is missing.");

      await preferences.focus();
      await expect(preferences, `${project.name}: entering replacement trigger remains keyboard reachable`).toBeFocused();
      await page.keyboard.press("Enter");
      const replacement = await readToastMotion(page);
      const newRoot = await toast.elementHandle();
      if (!newRoot) throw new Error("Replacement Toast root is missing.");
      expect(replacement, `${project.name}: replacement preserves the live-region contract`).toMatchObject({
        ariaAtomic: "true",
        ariaLive: "polite",
        role: "status",
        state: "entering"
      });
      expect(replacement.presence, `${project.name}: entering replacement has a monotonic Presence identity`).toBeGreaterThan(first.presence);
      expect(await oldRoot.evaluate((element) => element.isConnected), `${project.name}: superseded Toast root is detached`).toBe(false);
      expect(await oldRoot.evaluate((element) => element === document.querySelector(".toast")), `${project.name}: replacement does not reuse the old Toast DOM root`).toBe(false);
      expect(await newRoot.evaluate((element) => element === document.querySelector(".toast")), `${project.name}: replacement owns the current Toast DOM root`).toBe(true);

      await oldRoot.evaluate((element) => {
        element.dispatchEvent(new AnimationEvent("animationend", { animationName: "motion-toast-in", bubbles: true }));
      });
      await expect(toast, `${project.name}: stale entering animation end cannot settle the replacement`).toHaveAttribute("data-motion-state", "entering");
      await oldRoot.evaluate((element) => {
        element.dispatchEvent(new AnimationEvent("animationcancel", { animationName: "motion-toast-in", bubbles: true }));
      });
      await expect(toast, `${project.name}: stale entering animation cancellation cannot settle the replacement`).toHaveAttribute("data-motion-state", "entering");

      await newRoot.evaluate((element) => {
        element.dispatchEvent(new AnimationEvent("animationend", { animationName: "motion-toast-out", bubbles: true }));
      });
      await expect(toast, `${project.name}: wrong-phase replacement animation remains ignored`).toHaveAttribute("data-motion-state", "entering");
      await newRoot.evaluate((element) => {
        element.dispatchEvent(new AnimationEvent("animationcancel", { animationName: "motion-toast-in", bubbles: true }));
      });
      await expect(toast, `${project.name}: replacement settles from its own current-phase animation`).toHaveAttribute("data-motion-state", "idle");

      await reminder.focus();
      await expect(reminder, `${project.name}: fallback replacement trigger remains keyboard reachable`).toBeFocused();
      await page.keyboard.press("Enter");
      const fallbackReplacement = await readToastMotion(page);
      expect(fallbackReplacement.presence, `${project.name}: fallback generation remains monotonic after an event-settled replacement`).toBeGreaterThan(replacement.presence);
      await expect(toast, `${project.name}: fallback generation begins entering`).toHaveAttribute("data-motion-state", "entering");
      await page.clock.fastForward(319);
      await expect(toast, `${project.name}: fallback does not settle before 320ms`).toHaveAttribute("data-motion-state", "entering");
      await page.clock.fastForward(1);
      await expect(toast, `${project.name}: fallback settles the current generation at 320ms`).toHaveAttribute("data-motion-state", "idle");
    } finally {
      await removeStyleTag(toastPause);
    }
  });

  test("isolates replacement Toast generations and their exact 3200ms timers while closing", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-item").nth(3).click();
    await settleScreenTransition(page);
    const toastPause = await page.addStyleTag({ content: ".toast { animation-play-state: paused !important; }" });
    const reminder = page.locator(".settings-row").filter({ hasText: "学习提醒" });
    const preferences = page.locator(".settings-row").filter({ hasText: "偏好设置" });
    const toast = page.locator(".toast");

    try {
      await reminder.click();
      const first = await readToastMotion(page);
      expect(first, `${project.name}: first Toast exposes the exact live-region contract`).toMatchObject({
        ariaAtomic: "true",
        ariaLive: "polite",
        role: "status",
        state: "entering"
      });
      await settleToastAnimation(page, "motion-toast-in");
      await expect(toast).toHaveAttribute("data-motion-state", "idle");

      await page.clock.fastForward(3199);
      await expect(toast, `${project.name}: first Toast is still present before its deadline`).toHaveAttribute("data-motion-state", "idle");
      await preferences.dispatchEvent("click");
      const second = await readToastMotion(page);
      expect(second.presence, `${project.name}: replacement identity is monotonic before the first timer can fire`).toBeGreaterThan(first.presence);
      await settleToastAnimation(page, "motion-toast-in");
      await expect(toast).toHaveAttribute("data-motion-state", "idle");

      await page.clock.fastForward(1);
      await expect(toast, `${project.name}: clearing the first timer leaves its replacement alive at the old deadline`).toHaveAttribute("data-motion-state", "idle");
      await page.clock.fastForward(3198);
      await expect(toast, `${project.name}: second Toast remains visible through 3199ms of its own lifetime`).toHaveAttribute("data-motion-state", "idle");
      await page.clock.fastForward(1);
      await expect(toast, `${project.name}: second Toast enters closing exactly at its own 3200ms deadline`).toHaveAttribute("data-motion-state", "closing");

      const closingSecond = await readToastMotion(page);
      const staleSecond = await toast.elementHandle();
      if (!staleSecond) throw new Error("Closing Toast is missing its generation root.");
      await reminder.dispatchEvent("click");
      const third = await readToastMotion(page);
      const thirdRoot = await toast.elementHandle();
      if (!thirdRoot) throw new Error("Closing replacement Toast root is missing.");
      expect(third.presence, `${project.name}: closing replacement receives a newer monotonic identity`).toBeGreaterThan(closingSecond.presence);
      expect(third.state, `${project.name}: closing replacement begins a fresh entry generation`).toBe("entering");
      expect(await staleSecond.evaluate((element) => element.isConnected), `${project.name}: closing generation root detaches before its replacement enters`).toBe(false);
      expect(await staleSecond.evaluate((element) => element === document.querySelector(".toast")), `${project.name}: closing replacement does not reuse its predecessor root`).toBe(false);
      expect(await thirdRoot.evaluate((element) => element === document.querySelector(".toast")), `${project.name}: closing replacement owns a fresh root`).toBe(true);
      await staleSecond.evaluate((element) => {
        element.dispatchEvent(new AnimationEvent("animationcancel", { animationName: "motion-toast-out", bubbles: true }));
      });
      await expect(toast, `${project.name}: stale second exit cannot unmount the third Toast generation`).toHaveAttribute("data-motion-state", "entering");
      await settleToastAnimation(page, "motion-toast-in");
      await expect(toast).toHaveAttribute("data-motion-state", "idle");

      await page.clock.fastForward(3199);
      await expect(toast, `${project.name}: third Toast preserves its full isolated dwell`).toHaveAttribute("data-motion-state", "idle");
      await page.clock.fastForward(1);
      await expect(toast, `${project.name}: third Toast closes only at its own exact deadline`).toHaveAttribute("data-motion-state", "closing");
      await settleToastAnimation(page, "motion-toast-out");
      await expect(toast).toHaveCount(0);
    } finally {
      await removeStyleTag(toastPause);
    }
  });

  test("keeps a canceled Sheet inside the shared visualViewport shim through orientation", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await installVisualViewportShim(page);
    await page.setViewportSize(project.initialViewport);
    await openPreparedLessonForMotion(page, bookCourseApi);
    const noteTrigger = page.locator(".concept-card-grid").getByRole("button").first();
    const entryPause = await openPausedActionSheet(page, noteTrigger);
    const sheet = page.locator(".sheet");
    const initialVisualHeight = getShimmedVisualViewportHeight(project.initialViewport);
    await setVisualViewport(page, { height: initialVisualHeight, offsetTop: 0 });
    await expectVisualViewportHeight(page, initialVisualHeight, `${project.name}: deterministic visualViewport shim resize`);
    await sheet.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName,
      bubbles: true
    })), expectedActionSheetMotion("note", project.initialViewport).enterName);
    await expect(sheet, `${project.name}: matching Sheet animationcancel settles entry`).toHaveAttribute("data-motion-state", "idle");
    await removeStyleTag(entryPause);
    await expectElementInsideVisualViewport(page, ".sheet", `${project.name}: Sheet after shim resize and animationcancel`);

    const orientationViewport = getOppositeOrientationViewport(project.initialViewport);
    const orientationVisualHeight = getShimmedVisualViewportHeight(orientationViewport);
    await page.setViewportSize(orientationViewport);
    await setVisualViewport(page, { height: orientationVisualHeight, offsetTop: 0 });
    await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
    await expectVisualViewportHeight(page, orientationVisualHeight, `${project.name}: orientation shim resize`);
    await expectElementInsideVisualViewport(page, ".sheet", `${project.name}: Sheet after orientation`);

    const closePause = await pauseActionSheetAnimations(page);
    await sheet.locator(".sheet-close").click();
    await expect(sheet).toHaveAttribute("data-motion-state", "closing");
    await sheet.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName,
      bubbles: true
    })), expectedActionSheetMotion("note", orientationViewport).closeName);
    await removeStyleTag(closePause);
    await expect(sheet, `${project.name}: canceled Sheet exit unmounts cleanly`).toHaveCount(0);
  });
});

type AiDialogExpectation = {
  closeDuration: string;
  closeName: string;
  closeTransform: { scale: number; x: number; y: number };
  enterDuration: string;
  enterName: string;
  enterTransform: { scale: number; x: number; y: number };
};

function expectedAiDialogMotion(viewport: CssViewport): AiDialogExpectation {
  const shortLandscape = viewport.height < 600 && viewport.width > viewport.height;
  if (shortLandscape) {
    return {
      enterName: "motion-dialog-ai-short-in",
      enterDuration: "0.24s",
      enterTransform: { scale: 1, x: 0, y: 0 },
      closeName: "motion-dialog-ai-short-out",
      closeDuration: "0.18s",
      closeTransform: { scale: 1, x: 0, y: 0 }
    };
  }

  if (viewport.width >= 768 && viewport.height >= 600) {
    return {
      enterName: "motion-dialog-ai-tablet-in",
      enterDuration: "0.34s",
      enterTransform: { scale: 1, x: 0, y: 0 },
      closeName: "motion-dialog-ai-tablet-out",
      closeDuration: "0.25s",
      closeTransform: { scale: 1, x: 0, y: 0 }
    };
  }

  return {
    enterName: "motion-dialog-ai-phone-in",
    enterDuration: "0.38s",
    enterTransform: { scale: 1, x: 0, y: 0 },
    closeName: "motion-dialog-ai-phone-out",
    closeDuration: "0.28s",
    closeTransform: { scale: 1, x: 0, y: 0 }
  };
}

async function pauseAiDialogAnimations(page: Page) {
  return page.addStyleTag({ content: ".ai-overlay, .ai-overlay-scrim, .ai-shared-surface, .ai-shared-origin-icon { animation-play-state: paused !important; }" });
}

async function finishAiDialogAnimation(page: Page) {
  await page.locator(".ai-overlay").evaluate((panel) => {
    for (const animation of panel.getAnimations()) animation.finish();
  });
}

async function readAiDialogMotion(page: Page) {
  return page.locator(".ai-overlay").evaluate((panel) => {
    const scrim = document.querySelector<HTMLElement>(".ai-overlay-scrim");
    const sharedSurface = document.querySelector<HTMLElement>(".ai-shared-surface");
    const origin = document.querySelector<HTMLElement>(".ai-orb");
    if (!scrim) throw new Error("AI dialog scrim is missing.");
    if (!sharedSurface || !origin) throw new Error("AI dialog shared surface or origin is missing.");
    const keyframeProperties = (element: Element) => {
      const ignored = new Set(["composite", "computedOffset", "easing", "offset"]);
      const properties = new Set<string>();
      for (const animation of element.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes?.() ?? []) {
          for (const property of Object.keys(frame)) {
            if (!ignored.has(property)) properties.add(property);
          }
        }
      }
      return [...properties].sort();
    };
    const keyframeTransforms = (element: Element) => {
      const transforms: string[] = [];
      for (const animation of element.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes?.() ?? []) {
          if (typeof frame.transform === "string") transforms.push(frame.transform);
        }
      }
      return transforms;
    };
    const keyframeBackgroundColors = (element: Element) => {
      const colors: string[] = [];
      for (const animation of element.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes?.() ?? []) {
          if (typeof frame.backgroundColor === "string") colors.push(frame.backgroundColor);
        }
      }
      return colors;
    };
    const readLayout = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter,
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        filter: style.filter,
        height: style.height,
        left: style.left,
        offsetHeight: element.offsetHeight,
        offsetLeft: element.offsetLeft,
        offsetTop: element.offsetTop,
        offsetWidth: element.offsetWidth,
        top: style.top,
        width: style.width
      };
    };
    const panelStyle = getComputedStyle(panel);
    const scrimStyle = getComputedStyle(scrim);
    const sharedStyle = getComputedStyle(sharedSurface);
    const sharedBounds = sharedSurface.getBoundingClientRect();
    const originBounds = origin.getBoundingClientRect();
    return {
      layout: readLayout(panel),
      originBounds: { height: originBounds.height, left: originBounds.left, top: originBounds.top, width: originBounds.width },
      scrimAnimationDuration: scrimStyle.animationDuration,
      scrimAnimationName: scrimStyle.animationName,
      scrimAnimationProperties: keyframeProperties(scrim),
      scrimAnimationTimingFunction: scrimStyle.animationTimingFunction,
      scrimTransform: scrimStyle.transform,
      state: panel.getAttribute("data-motion-state"),
      surfaceAnimationDuration: panelStyle.animationDuration,
      surfaceAnimationName: panelStyle.animationName,
      surfaceAnimationProperties: keyframeProperties(panel),
      surfaceAnimationTimingFunction: panelStyle.animationTimingFunction,
      surfaceKeyframeTransforms: keyframeTransforms(panel),
      surfaceTransform: panelStyle.transform,
      sharedAnimationDuration: sharedStyle.animationDuration,
      sharedAnimationName: sharedStyle.animationName,
      sharedAnimationProperties: keyframeProperties(sharedSurface),
      sharedBackgroundColor: sharedStyle.backgroundColor,
      sharedKeyframeBackgroundColors: keyframeBackgroundColors(sharedSurface),
      sharedBounds: { height: sharedBounds.height, left: sharedBounds.left, top: sharedBounds.top, width: sharedBounds.width }
    };
  });
}

function expectAiDialogState(
  motion: Awaited<ReturnType<typeof readAiDialogMotion>>,
  expected: AiDialogExpectation,
  phase: "entering" | "closing",
  label: string
) {
  const name = phase === "entering" ? expected.enterName : expected.closeName;
  const duration = phase === "entering" ? expected.enterDuration : expected.closeDuration;
  const transform = phase === "entering" ? expected.enterTransform : { scale: 1, x: 0, y: 0 };
  const timing = phase === "entering" ? "cubic-bezier(0.16,1,0.3,1)" : "cubic-bezier(0.4,0,1,1)";

  expect(motion.state, `${label}: motion phase`).toBe(phase);
  expect(motion.surfaceAnimationName, `${label}: panel animation name`).toBe(name);
  expect(motion.surfaceAnimationDuration, `${label}: panel animation duration`).toBe(duration);
  expect(normalizeTimingFunction(motion.surfaceAnimationTimingFunction), `${label}: panel animation easing`).toBe(timing);
  const panelTransform = readTransformComponents(motion.surfaceTransform);
  expect(panelTransform.scale, `${label}: panel scale`).toBeCloseTo(transform.scale, 4);
  expect(panelTransform.x, `${label}: panel x offset`).toBeCloseTo(transform.x, 4);
  expect(panelTransform.y, `${label}: panel y offset`).toBeCloseTo(transform.y, 4);
  if (phase === "closing") {
    const finalTransform = motion.surfaceKeyframeTransforms.at(-1);
    if (!finalTransform) throw new Error(`${label}: closing AI panel has no terminal transform keyframe.`);
    const terminalTransform = readKeyframeTransformComponents(finalTransform);
    expect(terminalTransform.scale, `${label}: closing terminal scale`).toBeCloseTo(expected.closeTransform.scale, 4);
    expect(terminalTransform.x, `${label}: closing terminal x offset`).toBeCloseTo(expected.closeTransform.x, 4);
    expect(terminalTransform.y, `${label}: closing terminal y offset`).toBeCloseTo(expected.closeTransform.y, 4);
  }
  expect(motion.scrimAnimationName, `${label}: scrim animation name`).toBe(phase === "entering" ? "motion-scrim-in" : "motion-scrim-out");
  expect(motion.scrimAnimationDuration, `${label}: scrim animation duration`).toBe("0.14s");
  expect(normalizeTimingFunction(motion.scrimAnimationTimingFunction), `${label}: scrim animation easing`).toBe(
    phase === "entering" ? "cubic-bezier(0.2,0.8,0.2,1)" : "cubic-bezier(0.4,0,1,1)"
  );
  expect(motion.scrimTransform, `${label}: scrim only animates opacity`).toBe("none");
  expectNoLayoutMotionProperties(motion.surfaceAnimationProperties, label);
  expect(motion.sharedAnimationName, `${label}: shared surface animation name`).toBe(
    phase === "entering" ? "motion-dialog-ai-shared-in" : "motion-dialog-ai-shared-out"
  );
  expect(motion.sharedAnimationDuration, `${label}: shared surface duration follows the dialog`).toBe(duration);
  expectNoLayoutMotionProperties(motion.sharedAnimationProperties, `${label}: shared surface`);
  if (phase === "entering") {
    const expectSharedOriginCoordinate = (actual: number, expectedValue: number, axis: string) => {
      expect(Math.abs(actual - expectedValue), `${label}: shared surface starts at the Orb ${axis}`).toBeLessThan(0.5);
    };
    expect(motion.sharedKeyframeBackgroundColors, `${label}: opening shared surface keyframes are present`).not.toHaveLength(0);
    expect(
      [...new Set(motion.sharedKeyframeBackgroundColors)],
      `${label}: opening shared surface stays white instead of flashing the brand purple`
    ).toEqual([motion.sharedBackgroundColor]);
    expectSharedOriginCoordinate(motion.sharedBounds.left, motion.originBounds.left, "x");
    expectSharedOriginCoordinate(motion.sharedBounds.top, motion.originBounds.top, "y");
    expectSharedOriginCoordinate(motion.sharedBounds.width, motion.originBounds.width, "width");
    expectSharedOriginCoordinate(motion.sharedBounds.height, motion.originBounds.height, "height");
  }
  expect(motion.scrimAnimationProperties, `${label}: scrim keyframes only expose opacity`).toEqual(["opacity"]);
}

async function openPausedAiDialog(page: Page, orb: { click: () => Promise<void> }) {
  const pause = await pauseAiDialogAnimations(page);
  await orb.click();
  await expect(page.locator(".ai-overlay")).toHaveAttribute("data-motion-state", "entering");
  return pause;
}

async function installControllableRaf(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    const controlledWindow = window as typeof window & {
      __motionTestRaf?: { flush: () => number };
    };
    Object.defineProperty(controlledWindow, "__motionTestRaf", {
      configurable: true,
      value: {
        flush: () => {
          const frameCallbacks = [...callbacks.values()];
          callbacks.clear();
          for (const callback of frameCallbacks) callback(performance.now());
          return frameCallbacks.length;
        }
      }
    });
    window.requestAnimationFrame = (callback) => {
      nextFrameId += 1;
      callbacks.set(nextFrameId, callback);
      return nextFrameId;
    };
    window.cancelAnimationFrame = (frameId) => {
      callbacks.delete(frameId);
    };
  });
}

async function flushControllableRaf(page: Page, label: string) {
  const callbacks = await page.evaluate(() => {
    const controlledWindow = window as typeof window & {
      __motionTestRaf?: { flush: () => number };
    };
    return controlledWindow.__motionTestRaf?.flush() ?? 0;
  });
  expect(callbacks, `${label}: a controlled requestAnimationFrame callback is pending`).toBeGreaterThan(0);
}

async function readOrbMotion(page: Page) {
  return page.locator(".ai-orb").evaluate((orb) => {
    const button = orb as HTMLButtonElement;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) throw new Error("AI orb shell is missing.");
    const style = getComputedStyle(button);
    const bounds = button.getBoundingClientRect();
    const shellBounds = shell.getBoundingClientRect();
    const hitTarget = bounds.width > 0 && bounds.height > 0
      ? document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : null;
    return {
      computedDisplay: style.display,
      dragX: style.getPropertyValue("--ai-orb-drag-x").trim(),
      dragY: style.getPropertyValue("--ai-orb-drag-y").trim(),
      dragging: button.classList.contains("dragging"),
      dataHidden: button.getAttribute("data-ai-orb-hidden"),
      disabled: button.disabled,
      hidden: button.hidden,
      hitTestable: hitTarget !== null && button.contains(hitTarget),
      inline: { left: button.style.left, right: button.style.right, top: button.style.top },
      insideShell: bounds.left >= shellBounds.left && bounds.right <= shellBounds.right && bounds.top >= shellBounds.top && bounds.bottom <= shellBounds.bottom,
      rect: { height: bounds.height, width: bounds.width },
      settling: button.getAttribute("data-ai-orb-settling") === "true",
      settleX: style.getPropertyValue("--ai-orb-settle-x").trim(),
      settleY: style.getPropertyValue("--ai-orb-settle-y").trim(),
      tabIndex: button.tabIndex,
      transitionDuration: style.transitionDuration,
      transitionTimingFunction: style.transitionTimingFunction,
      transitionProperty: style.transitionProperty,
      transform: style.transform,
      visibility: style.visibility
    };
  });
}

async function expectAiOrbUnavailableDuringDialog(page: Page, label: string) {
  const orb = page.locator(".ai-orb");
  expect(await readOrbMotion(page), `${label}: visually hidden Orb retains geometry for the shared transition`).toMatchObject({
    computedDisplay: "grid",
    dataHidden: "true",
    disabled: false,
    hidden: false,
    hitTestable: false,
    rect: { height: 58, width: 58 },
    tabIndex: -1,
    visibility: "hidden"
  });
  await expect(orb, `${label}: hidden Orb is not visible or clickable`).toBeHidden();
  expect(await orb.boundingBox(), `${label}: hidden Orb preserves its FLIP geometry`).not.toBeNull();
}

async function expectAiOrbRestoredAfterDialog(page: Page, label: string) {
  const orb = page.locator(".ai-orb");
  await expect(orb, `${label}: completed dialog restores the Orb`).toBeVisible();
  const motion = await readOrbMotion(page);
  expect(motion.hidden, `${label}: restored Orb clears the hidden attribute`).toBe(false);
  expect(motion.dataHidden, `${label}: restored Orb clears the visual hidden state`).toBe("false");
  expect(motion.disabled, `${label}: restored Orb is enabled`).toBe(false);
  expect(motion.computedDisplay, `${label}: restored Orb restores grid display`).toBe("grid");
  expect(motion.visibility, `${label}: restored Orb restores visibility`).toBe("visible");
  expect(motion.rect.width, `${label}: restored Orb restores a rendered box`).toBeGreaterThan(0);
  expect(motion.rect.height, `${label}: restored Orb restores a rendered box`).toBeGreaterThan(0);
  expect(motion.hitTestable, `${label}: restored Orb is hit-testable`).toBe(true);
}

async function expectAiComposeInsideViewport(page: Page, label: string) {
  const controls = await page.locator(".ai-compose input, .ai-compose button").evaluateAll((elements) => {
    const visualViewport = window.visualViewport;
    const top = visualViewport?.offsetTop ?? 0;
    const bottom = top + (visualViewport?.height ?? window.innerHeight);
    return elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        viewportBottom: bottom,
        viewportTop: top
      };
    });
  });
  expect(controls, `${label}: compose exposes both input and send controls`).toHaveLength(2);
  for (const [index, control] of controls.entries()) {
    expect(control.top, `${label}: compose control ${index + 1} stays below visual viewport top`).toBeGreaterThanOrEqual(control.viewportTop);
    expect(control.bottom, `${label}: compose control ${index + 1} stays above visual viewport bottom`).toBeLessThanOrEqual(control.viewportBottom);
    expect(control.left, `${label}: compose control ${index + 1} stays on-screen left`).toBeGreaterThanOrEqual(0);
    expect(control.right, `${label}: compose control ${index + 1} stays on-screen right`).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  }
}

test.describe("Stage 2D Global AI dialog and Orb motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("maps the AI dialog and scrim to the locked device motion across all eight viewports", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);
    await page.goto("/?embedded=device-preview");
    const orb = page.locator(".ai-orb");

    for (const viewport of [project.initialViewport, project.pairedViewport]) {
      await page.setViewportSize(viewport);
      await expect(orb).toBeVisible();
      const entryPause = await openPausedAiDialog(page, orb);
      const dialog = page.locator(".ai-overlay");
      const entryMotion = await readAiDialogMotion(page);
      expectAiDialogState(entryMotion, expectedAiDialogMotion(viewport), "entering", `${project.name} ${viewport.width}x${viewport.height} AI entry`);
      expect(await orb.evaluate((button) => ({
        dataHidden: button.getAttribute("data-ai-orb-hidden"),
        disabled: (button as HTMLButtonElement).disabled,
        expanded: button.getAttribute("aria-expanded"),
        hidden: (button as HTMLButtonElement).hidden,
        tabIndex: (button as HTMLButtonElement).tabIndex
      })), `${project.name} ${viewport.width}x${viewport.height}: Orb is visually hidden for the entire dialog Presence`).toEqual({
        dataHidden: "true",
        disabled: false,
        expanded: "true",
        hidden: false,
        tabIndex: -1
      });
      await expectAiOrbUnavailableDuringDialog(page, `${project.name} ${viewport.width}x${viewport.height}: AI entry`);
      await finishAiDialogAnimation(page);
      await expect(dialog).toHaveAttribute("data-motion-state", "idle");
      expect((await readAiDialogMotion(page)).layout, `${project.name} ${viewport.width}x${viewport.height}: dialog keeps static layout geometry`).toEqual(entryMotion.layout);
      await removeStyleTag(entryPause);

      const exitPause = await pauseAiDialogAnimations(page);
      await dialog.locator(".ai-close").click();
      expectAiDialogState(await readAiDialogMotion(page), expectedAiDialogMotion(viewport), "closing", `${project.name} ${viewport.width}x${viewport.height} AI exit`);
      await expectAiOrbUnavailableDuringDialog(page, `${project.name} ${viewport.width}x${viewport.height}: AI exit`);
      await finishAiDialogAnimation(page);
      await removeStyleTag(exitPause);
      await expect(dialog).toHaveCount(0);
      await expectAiOrbRestoredAfterDialog(page, `${project.name} ${viewport.width}x${viewport.height}: AI exit`);
      await expect(orb, `${project.name} ${viewport.width}x${viewport.height}: completed AI close restores Orb focus`).toBeFocused();
    }
  });

  test("keeps the closing AI dialog modal, blocks work, and isolates rapid Presence generations", async ({ page }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await page.goto("/?embedded=device-preview");
    const orb = page.locator(".ai-orb");
    const entryPause = await openPausedAiDialog(page, orb);
    await finishAiDialogAnimation(page);
    await removeStyleTag(entryPause);

    const dialog = page.locator(".ai-overlay");
    const input = dialog.locator(".ai-compose input");
    const send = dialog.locator(".ai-compose button");
    const form = dialog.locator("form.ai-compose");
    const focusable = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    const first = focusable.first();
    const last = focusable.last();
    await input.fill("closing should not submit");
    await first.focus();

    const closingPause = await pauseAiDialogAnimations(page);
    await page.keyboard.press("Escape");
    expectAiDialogState(await readAiDialogMotion(page), expectedAiDialogMotion(project.initialViewport), "closing", `${project.name}: AI close`);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(dialog).not.toHaveAttribute("aria-hidden");
    await expect(dialog).not.toHaveAttribute("inert");
    expect(await readOrbMotion(page), `${project.name}: Orb remains unavailable while the dialog exits`).toMatchObject({ dataHidden: "true", disabled: false, tabIndex: -1 });

    await last.focus();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(last).toBeFocused();

    const messageCount = await dialog.locator(".ai-message").count();
    await form.evaluate((element) => element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await input.focus();
    await page.keyboard.press("Enter");
    await send.focus();
    await page.keyboard.press("Space");
    await send.click();
    expect(await dialog.locator(".ai-message").count(), `${project.name}: closing AI actions cannot submit a message`).toBe(messageCount);
    await page.locator(".ai-overlay-scrim").dispatchEvent("click");
    await expect(dialog, `${project.name}: repeated close remains non-destructive`).toHaveAttribute("data-motion-state", "closing");

    await finishAiDialogAnimation(page);
    await removeStyleTag(closingPause);
    await expect(dialog).toHaveCount(0);
    await expect(orb, `${project.name}: normal AI close restores focus only after unmount`).toBeFocused();

    const rapidPause = await openPausedAiDialog(page, orb);
    const rapidPanel = page.locator(".ai-overlay");
    await page.clock.fastForward(320);
    await expect(rapidPanel).toHaveAttribute("data-motion-state", "idle");
    await rapidPanel.focus();
    await page.keyboard.press("Escape");
    await expect(rapidPanel).toHaveAttribute("data-motion-state", "closing");
    const stalePanel = await rapidPanel.elementHandle();
    if (!stalePanel) throw new Error("Closing AI dialog panel is missing.");
    const closingPresence = Number(await rapidPanel.getAttribute("data-motion-presence"));
    await orb.dispatchEvent("click");
    await expect(rapidPanel, `${project.name}: fast reopen starts a new AI Presence generation`).toHaveAttribute("data-motion-state", "entering");
    const reopenedPresence = Number(await rapidPanel.getAttribute("data-motion-presence"));
    expect(reopenedPresence, `${project.name}: reopening increments AI Presence generation`).toBeGreaterThan(closingPresence);
    expect(await stalePanel.evaluate((element) => element.isConnected), `${project.name}: stale AI panel is detached`).toBe(false);
    expect(await readOrbMotion(page), `${project.name}: stale close cannot reveal or focus the Orb`).toMatchObject({ dataHidden: "true", disabled: false, tabIndex: -1 });
    await stalePanel.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true })), expectedAiDialogMotion(project.initialViewport).closeName);
    await expect(rapidPanel, `${project.name}: detached stale close event cannot settle reopening`).toHaveAttribute("data-motion-state", "entering");
    await rapidPanel.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true })), expectedAiDialogMotion(project.initialViewport).closeName);
    await expect(rapidPanel, `${project.name}: wrong exit phase cannot settle entering generation`).toHaveAttribute("data-motion-state", "entering");
    await rapidPanel.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true })), expectedAiDialogMotion(project.initialViewport).enterName);
    await expect(rapidPanel, `${project.name}: current enter cancellation reaches idle`).toHaveAttribute("data-motion-state", "idle");
    await rapidPanel.focus();
    await page.keyboard.press("Escape");
    await expect(rapidPanel).toHaveAttribute("data-motion-state", "closing");
    await rapidPanel.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", { animationName, bubbles: true })), expectedAiDialogMotion(project.initialViewport).enterName);
    await expect(rapidPanel, `${project.name}: stale entering cancellation cannot unmount closing generation`).toHaveAttribute("data-motion-state", "closing");
    await page.clock.fastForward(320);
    await expect(rapidPanel, `${project.name}: missing close event falls back to unmount`).toHaveCount(0);
    await removeStyleTag(rapidPause);
    await expect(orb).toBeFocused();

    const reducePause = await openPausedAiDialog(page, orb);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".ai-overlay"), `${project.name}: runtime reduced motion settles AI entry immediately`).toHaveAttribute("data-motion-state", "idle");
    expect((await readAiDialogMotion(page)).surfaceAnimationName, `${project.name}: reduced AI dialog has no animation`).toBe("none");
    await page.locator(".ai-overlay").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".ai-overlay"), `${project.name}: runtime reduced close unmounts AI immediately`).toHaveCount(0);
    await removeStyleTag(reducePause);
    await expect(orb).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName), `${project.name}: AI focus recovery never leaves focus on body`).not.toBe("BODY");
  });

  test("uses real pointer FLIP drag, cancellation, resize, and direct reduced-motion placement for the Orb", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);
    await installControllableRaf(page);
    await page.goto("/?embedded=device-preview");
    await page.setViewportSize(project.initialViewport);
    const orb = page.locator(".ai-orb");
    await expect(orb).toBeVisible();
    const initialMotion = await readOrbMotion(page);
    const [initialBounds, shellBounds] = await Promise.all([orb.boundingBox(), page.locator(".app-shell").boundingBox()]);
    if (!initialBounds || !shellBounds) throw new Error("AI Orb is not measurable for FLIP drag.");
    const startX = initialBounds.x + initialBounds.width / 2;
    const startY = initialBounds.y + initialBounds.height / 2;
    const dragTowardLeft = startX > shellBounds.x + shellBounds.width / 2;
    const endX = dragTowardLeft
      ? shellBounds.x + Math.max(shellBounds.width * 0.3, initialBounds.width / 2 + 24)
      : shellBounds.x + Math.min(shellBounds.width * 0.7, shellBounds.width - initialBounds.width / 2 - 24);
    const endY = Math.max(shellBounds.y + initialBounds.height / 2 + 12, Math.min(shellBounds.y + shellBounds.height * 0.45, shellBounds.y + shellBounds.height - initialBounds.height / 2 - 12));

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await flushControllableRaf(page, `${project.name}: drag write`);
    await expect.poll(async () => (await readOrbMotion(page)).dragX, { message: `${project.name}: pointermove writes only a rAF transform variable` }).not.toBe("0px");
    const draggingMotion = await readOrbMotion(page);
    expect(draggingMotion.dragging, `${project.name}: physical pointer drag is active`).toBe(true);
    expect(draggingMotion.inline, `${project.name}: pointermove does not commit top/left/right`).toEqual(initialMotion.inline);
    expect(draggingMotion.transitionProperty, `${project.name}: Orb only transitions transform`).toBe("transform");
    await page.mouse.up();
    await expect.poll(() => readOrbMotion(page), { message: `${project.name}: pointerup commits one layout destination before its inverse settle frame` }).toMatchObject({
      dragX: "0px",
      dragY: "0px",
      dragging: false,
      insideShell: true,
      settling: true,
      transitionProperty: "transform"
    });
    const inverseSettlingMotion = await readOrbMotion(page);
    expect(inverseSettlingMotion.inline, `${project.name}: pointerup performs the single top/left/right layout commit`).not.toEqual(initialMotion.inline);
    expect(
      inverseSettlingMotion.settleX !== "0px" || inverseSettlingMotion.settleY !== "0px",
      `${project.name}: pointerup exposes a non-zero inverse FLIP transform before its queued frame`
    ).toBe(true);
    const inverseTranslation = readTransformTranslation(inverseSettlingMotion.transform);
    expect(
      Math.abs(inverseTranslation.x) > 0.01 || Math.abs(inverseTranslation.y) > 0.01,
      `${project.name}: computed Orb transform carries the visible inverse translation`
    ).toBe(true);
    expect(inverseSettlingMotion.transitionDuration, `${project.name}: inverse frame disables interpolation until layout has committed`).toBe("0s");

    await flushControllableRaf(page, `${project.name}: inverse settle release`);
    await expect.poll(() => readOrbMotion(page), { message: `${project.name}: queued inverse frame releases into the Base/Standard transform transition` }).toMatchObject({
      dragX: "0px",
      dragY: "0px",
      settling: false,
      settleX: "0px",
      settleY: "0px",
      transitionDuration: "0.18s",
      transitionProperty: "transform"
    });
    const baseStandardSettle = await readOrbMotion(page);
    expect(normalizeTimingFunction(baseStandardSettle.transitionTimingFunction), `${project.name}: Orb settle uses the standard motion easing`).toBe("cubic-bezier(0.2,0.8,0.2,1)");
    await orb.evaluate((element) => {
      for (const animation of element.getAnimations()) animation.finish();
    });
    await expect.poll(async () => {
      const translation = readTransformTranslation((await readOrbMotion(page)).transform);
      return { x: Math.abs(translation.x), y: Math.abs(translation.y) };
    }, { message: `${project.name}: Base/Standard transition reaches a zero inverse transform` }).toEqual({ x: 0, y: 0 });
    await expect(page.locator(".ai-overlay"), `${project.name}: dragging does not activate the assistant`).toHaveCount(0);

    const settledBounds = await orb.boundingBox();
    if (!settledBounds) throw new Error("Settled AI Orb is not measurable.");
    await orb.evaluate((element) => {
      Object.defineProperty(element, "setPointerCapture", { configurable: true, value: () => undefined });
      Object.defineProperty(element, "hasPointerCapture", { configurable: true, value: () => false });
    });
    const cancelPointerId = 902;
    const cancelStartX = settledBounds.x + settledBounds.width / 2;
    const cancelStartY = settledBounds.y + settledBounds.height / 2;
    await orb.dispatchEvent("pointerdown", { button: 0, buttons: 1, clientX: cancelStartX, clientY: cancelStartY, pointerId: cancelPointerId, pointerType: "touch" });
    await orb.dispatchEvent("pointermove", { button: 0, buttons: 1, clientX: cancelStartX + 24, clientY: cancelStartY + 24, pointerId: cancelPointerId, pointerType: "touch" });
    await orb.dispatchEvent("pointercancel", { button: 0, buttons: 0, clientX: cancelStartX + 24, clientY: cancelStartY + 24, pointerId: cancelPointerId, pointerType: "touch" });
    await expect.poll(() => readOrbMotion(page), { message: `${project.name}: pointercancel clears all transient drag state` }).toMatchObject({
      dragX: "0px",
      dragY: "0px",
      dragging: false,
      settleX: "0px",
      settleY: "0px",
      settling: false,
      transitionProperty: "transform"
    });

    await page.setViewportSize({ width: 756, height: 352 });
    await expect.poll(() => readOrbMotion(page), { message: `${project.name}: rotated Orb remains clamped in the app shell` }).toMatchObject({ insideShell: true, dragging: false, settling: false, transitionProperty: "transform" });
    await page.setViewportSize({ width: 402, height: 430 });
    await expect.poll(() => readOrbMotion(page), { message: `${project.name}: viewport-height resize leaves no stale Orb transform` }).toMatchObject({
      dragX: "0px",
      dragY: "0px",
      insideShell: true,
      settleX: "0px",
      settleY: "0px",
      settling: false
    });

    await orb.click();
    await finishAiDialogAnimation(page);
    await expect(page.locator(".ai-overlay")).toHaveAttribute("data-motion-state", "idle");
    const composeInput = page.locator(".ai-compose input");
    await composeInput.fill("resize stays usable");
    await page.locator(".ai-compose button").click();
    await expectAiComposeInsideViewport(page, `${project.name}: short visual viewport after sending`);
    await page.setViewportSize({ width: 402, height: 681 });
    await expectAiComposeInsideViewport(page, `${project.name}: restored real viewport after sending`);
    await page.locator(".ai-close").click();
    await expect(orb).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedBounds = await orb.boundingBox();
    if (!reducedBounds) throw new Error("Reduced-motion AI Orb is not measurable.");
    const reducedStartX = reducedBounds.x + reducedBounds.width / 2;
    const reducedStartY = reducedBounds.y + reducedBounds.height / 2;
    const reducedPointerId = 903;
    const reducedEndX = Math.min(390, reducedStartX + 80);
    const reducedEndY = Math.min(640, reducedStartY + 80);
    await orb.dispatchEvent("pointerdown", { button: 0, buttons: 1, clientX: reducedStartX, clientY: reducedStartY, pointerId: reducedPointerId, pointerType: "touch" });
    await orb.dispatchEvent("pointermove", { button: 0, buttons: 1, clientX: reducedEndX, clientY: reducedEndY, pointerId: reducedPointerId, pointerType: "touch" });
    await orb.dispatchEvent("pointerup", { button: 0, buttons: 0, clientX: reducedEndX, clientY: reducedEndY, pointerId: reducedPointerId, pointerType: "touch" });
    await expect.poll(() => readOrbMotion(page), { message: `${project.name}: reduced-motion drag commits without a FLIP settle` }).toMatchObject({
      dragX: "0px",
      dragY: "0px",
      dragging: false,
      insideShell: true,
      settleX: "0px",
      settleY: "0px",
      settling: false,
      transitionDuration: "0s",
      transitionProperty: "none",
      transform: "none"
    });
  });

  test("keeps AI and Orb inside the shared visualViewport shim after cancellation and orientation", async ({ page, bookCourseApi }, testInfo) => {
    void bookCourseApi;
    const project = getResponsiveProject(testInfo.project.name);
    await installVisualViewportShim(page);
    await page.setViewportSize(project.initialViewport);
    await page.goto("/?embedded=device-preview");
    const orb = page.locator(".ai-orb");
    const entryPause = await openPausedAiDialog(page, orb);
    const dialog = page.locator(".ai-overlay");
    const initialVisualHeight = getShimmedVisualViewportHeight(project.initialViewport);
    await setVisualViewport(page, { height: initialVisualHeight, offsetTop: 0 });
    await expectVisualViewportHeight(page, initialVisualHeight, `${project.name}: AI deterministic visualViewport shim resize`);
    await dialog.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName,
      bubbles: true
    })), expectedAiDialogMotion(project.initialViewport).enterName);
    await expect(dialog, `${project.name}: matching AI animationcancel settles entry`).toHaveAttribute("data-motion-state", "idle");
    await removeStyleTag(entryPause);
    await expectElementInsideVisualViewport(page, ".ai-overlay", `${project.name}: AI panel after shim resize and animationcancel`);
    await expectAiComposeInsideViewport(page, `${project.name}: AI controls after shim resize`);

    const orientationViewport = getOppositeOrientationViewport(project.initialViewport);
    const orientationVisualHeight = getShimmedVisualViewportHeight(orientationViewport);
    await page.setViewportSize(orientationViewport);
    await setVisualViewport(page, { height: orientationVisualHeight, offsetTop: 0 });
    await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
    await expectVisualViewportHeight(page, orientationVisualHeight, `${project.name}: AI orientation shim resize`);
    await expectElementInsideVisualViewport(page, ".ai-overlay", `${project.name}: AI panel after orientation`);
    await expectAiComposeInsideViewport(page, `${project.name}: AI controls after orientation`);

    const closePause = await pauseAiDialogAnimations(page);
    await dialog.locator(".ai-close").click();
    await expect(dialog).toHaveAttribute("data-motion-state", "closing");
    await dialog.evaluate((element, animationName) => element.dispatchEvent(new AnimationEvent("animationcancel", {
      animationName,
      bubbles: true
    })), expectedAiDialogMotion(orientationViewport).closeName);
    await removeStyleTag(closePause);
    await expect(dialog, `${project.name}: canceled AI exit unmounts cleanly`).toHaveCount(0);
    await expect(orb, `${project.name}: Orb returns after the AI closes`).toBeVisible();
    await expectElementInsideVisualViewport(page, ".ai-orb", `${project.name}: Orb after orientation and AI cancellation`);
  });
});

type StageFourAFixture = {
  appendPreparedCourse: () => { book_id: string };
  consoleErrors: string[];
  externalRequests: string[];
  pageErrors: string[];
  requests: Array<{ method: string; path: string }>;
  unhandledRequests: Array<{ method: string; path: string }>;
  useStageFiveFlow: (options?: { imageMode?: "success" | "failure" | "mixed" }) => void;
};

type CourseCardFeedbackMotion = LocalFeedbackMotion & {
  animationDelay: string;
};

async function installStageFourACourseCardPause(page: Page) {
  const css = "[data-motion-course-card-state='entering'] { animation-play-state: paused !important; }";
  await page.addInitScript((content) => {
    const styleId = "stage-four-a-course-card-pause";
    const install = () => {
      if (document.getElementById(styleId)) return true;
      const target = document.head ?? document.documentElement;
      if (!target) return false;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = content;
      target.append(style);
      return true;
    };

    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, css);
}

async function readCourseCardFeedbackMotion(locator: Locator): Promise<CourseCardFeedbackMotion> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDelay: style.animationDelay,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      animationPlayState: style.animationPlayState,
      animationTimingFunction: style.animationTimingFunction,
      opacity: style.opacity,
      transform: style.transform
    };
  });
}

function courseCardDelayMs(delay: string) {
  return Math.round(Number.parseFloat(delay) * 1000);
}

async function expectPausedStageFourACourseCard(locator: Locator, page: Page, index: number, label: string) {
  await expect(locator, `${label}: course card is rendered`).toBeVisible();
  await expect(locator, `${label}: course card owns a local Stage 4A state`).toHaveAttribute("data-motion-course-card-state", "entering");
  await expect.poll(() => readCourseCardFeedbackMotion(locator), {
    message: `${label}: course card uses its finite entry mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-course-card-in",
    animationPlayState: "paused"
  });
  const motion = await readCourseCardFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: course card uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(courseCardDelayMs(motion.animationDelay), `${label}: course card delay follows its finite index`).toBe(isShortLandscape(page) ? 0 : index * 30);
  expect(Number(motion.opacity), `${label}: course card begins transparent`).toBe(0);
  expect(localTransformComponents(motion.transform).y, `${label}: course card uses the locked entry distance`).toBeCloseTo(6, 4);
}

async function settleStageFourACourseCard(locator: Locator) {
  await locator.evaluate((element) => {
    element.dispatchEvent(new AnimationEvent("animationend", { animationName: "motion-course-card-in", bubbles: true }));
  });
}

async function expectDirectStageFourACourseCard(locator: Locator, label: string) {
  await expect(locator, `${label}: course card settles directly`).toHaveAttribute("data-motion-course-card-state", "idle");
  expect(await readCourseCardFeedbackMotion(locator), `${label}: course card keeps no residual animation`).toMatchObject({
    animationName: "none",
    opacity: "1",
    transform: "none"
  });
}

test.describe("Stage 4A Home and Library course-card lifecycle", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("plays at most six first course cards once across Home, Library, rerenders, re-entry, and a newly refreshed book", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAFixture;
    fixture.useStageFiveFlow();
    const arrivingBooks = Array.from({ length: 4 }, () => fixture.appendPreparedCourse());
    await installStageFourACourseCardPause(page);
    await page.goto("/?embedded=device-preview");

    const newestBookId = arrivingBooks.at(-1)?.book_id;
    if (!newestBookId) throw new Error("Stage 4A needs an arriving course id.");
    const homeCard = page.locator(`.home-screen .book-mini[data-motion-course-card-key="course-card:${newestBookId}"]`);
    await expectPausedStageFourACourseCard(homeCard, page, 0, `${testInfo.project.name}: first Home course`);
    expect(await page.locator(".home-screen").evaluate((element) => getComputedStyle(element).animationName), `${testInfo.project.name}: Home page root has no local Stage 4A animation`).toBe("none");
    await settleStageFourACourseCard(homeCard);
    await expectDirectStageFourACourseCard(homeCard, `${testInfo.project.name}: settled Home course`);

    await homeCard.click();
    await expect(page.locator(".library-course-grid")).toBeVisible();
    await settleCurrentScreenTransition(page);

    const libraryCards = page.locator(".library-course-grid .course-space-card");
    await expect(libraryCards, `${testInfo.project.name}: fixture has seven concrete course cards`).toHaveCount(7);
    const orderedBookIds = await libraryCards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-motion-course-card-key")));
    expect(orderedBookIds, `${testInfo.project.name}: card order reflects the real refreshed backend list`).toEqual([
      `course-card:${arrivingBooks[3].book_id}`,
      `course-card:${arrivingBooks[2].book_id}`,
      `course-card:${arrivingBooks[1].book_id}`,
      `course-card:${arrivingBooks[0].book_id}`,
      "course-card:book_stage3",
      "course-card:book_stage5_long_title",
      "course-card:book_stage5_cover"
    ]);

    await expectDirectStageFourACourseCard(libraryCards.nth(0), `${testInfo.project.name}: Home-seen book does not replay in Library`);
    for (let index = 1; index <= 5; index += 1) {
      await expectPausedStageFourACourseCard(libraryCards.nth(index), page, index, `${testInfo.project.name}: first Library book ${index + 1}`);
    }
    await expectDirectStageFourACourseCard(libraryCards.nth(6), `${testInfo.project.name}: seventh book is outside the finite six-card budget`);

    const rerenderCard = libraryCards.nth(1);
    await rerenderCard.locator(".course-card-edit").click();
    await expectPausedStageFourACourseCard(rerenderCard, page, 1, `${testInfo.project.name}: editing rerender does not restart a seen card`);

    for (let index = 1; index <= 5; index += 1) {
      await settleStageFourACourseCard(libraryCards.nth(index));
      await expectDirectStageFourACourseCard(libraryCards.nth(index), `${testInfo.project.name}: settled Library book ${index + 1}`);
    }

    await page.locator(".primary-nav .nav-item").first().click();
    await expect(page.locator(".home-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    const reenteredHomeCard = page.locator(`.home-screen .book-mini[data-motion-course-card-key="course-card:${newestBookId}"]`);
    await expectDirectStageFourACourseCard(reenteredHomeCard, `${testInfo.project.name}: Home re-entry retains its consumed card`);
    await reenteredHomeCard.click();
    await expect(page.locator(".library-course-grid")).toBeVisible();
    await settleCurrentScreenTransition(page);
    for (let index = 0; index < 7; index += 1) {
      await expectDirectStageFourACourseCard(libraryCards.nth(index), `${testInfo.project.name}: Library re-entry card ${index + 1}`);
    }

    const refreshedBook = fixture.appendPreparedCourse();
    const deleteTarget = libraryCards.nth(1);
    await deleteTarget.locator(".course-card-edit").click();
    const deleteButton = deleteTarget.locator(".course-card-menu .danger");
    await deleteButton.click();
    await expect(deleteButton).toHaveClass(/confirm/);
    await deleteButton.click();

    const refreshedCard = page.locator(`.library-course-grid .course-space-card[data-motion-course-card-key="course-card:${refreshedBook.book_id}"]`);
    await expectPausedStageFourACourseCard(refreshedCard, page, 0, `${testInfo.project.name}: newly refreshed book receives one entry`);
    await expect(page.locator(".course-space-card[data-motion-course-card-state='entering']"), `${testInfo.project.name}: only the new backend book enters after refresh`).toHaveCount(1);
    await settleStageFourACourseCard(refreshedCard);
    await expectDirectStageFourACourseCard(refreshedCard, `${testInfo.project.name}: refreshed book settles without replay residue`);
    expect(fixture.requests.filter((request) => request.method === "GET" && request.path === "/api/books"), `${testInfo.project.name}: StrictMode bootstrap and delete refresh preserve the real list request count`).toHaveLength(3);
  });

  test("uses direct final card states under reduced motion and consumes their session keys", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAFixture;
    fixture.useStageFiveFlow();
    const arrivingBook = fixture.appendPreparedCourse();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?embedded=device-preview");

    const homeCard = page.locator(`.home-screen .book-mini[data-motion-course-card-key="course-card:${arrivingBook.book_id}"]`);
    await expectDirectStageFourACourseCard(homeCard, `${testInfo.project.name}: reduced Home course`);
    await homeCard.click();
    await expect(page.locator(".library-course-grid")).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "true");
    const libraryCards = page.locator(".library-course-grid .course-space-card");
    await expect(libraryCards).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expectDirectStageFourACourseCard(libraryCards.nth(index), `${testInfo.project.name}: reduced Library card ${index + 1}`);
    }

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(".app-shell")).toHaveAttribute("data-motion-reduced", "false");
    await page.locator(".primary-nav .nav-item").first().click();
    await expect(page.locator(".home-screen")).toBeVisible();
    const restoredHomeCard = page.locator(`.home-screen .book-mini[data-motion-course-card-key="course-card:${arrivingBook.book_id}"]`);
    await expectDirectStageFourACourseCard(restoredHomeCard, `${testInfo.project.name}: restoring preference does not replay a reduced-consumed Home card`);
  });
});

type StageFourAImageFixture = StageFourAFixture & {
  setPreparedImageMode: (mode: "success" | "failure" | "mixed") => void;
};

function expectedStageFourALocalVector(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Stage 4A local motion needs a configured viewport.");
  if (viewport.width >= 768 && viewport.height >= 600) return { x: 6, y: 0 };
  return { x: 0, y: isShortLandscape(page) ? 4 : 6 };
}

function stageFourATransformComponents(transform: string) {
  if (transform === "none") return { x: 0, y: 0 };
  const values = transform.match(/^matrix\((.+)\)$/)?.[1].split(",").map((value) => Number.parseFloat(value.trim()));
  if (!values || values.length !== 6 || values.some(Number.isNaN)) {
    throw new Error(`Expected a 2D local motion matrix, received ${transform}.`);
  }
  return { x: values[4], y: values[5] };
}

async function expectPausedStageFourALocalItem(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: explicit local node is rendered`).toHaveAttribute("data-motion-item", "content");
  await expect(locator, `${label}: explicit local node enters`).toHaveAttribute("data-motion-item-state", "entering");
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: explicit local node uses Base/Fast entry mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-local-item-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: explicit local node uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: explicit local node starts transparent`).toBe(0);
  const expected = expectedStageFourALocalVector(page);
  const transform = stageFourATransformComponents(motion.transform);
  expect(transform.x, `${label}: explicit local node uses the scoped horizontal vector`).toBeCloseTo(expected.x, 4);
  expect(transform.y, `${label}: explicit local node uses the scoped vertical vector`).toBeCloseTo(expected.y, 4);
}

async function settleStageFourALocalItem(locator: Locator, animationName = "motion-local-item-in") {
  await locator.evaluate((element, name) => {
    element.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
  }, animationName);
}

async function expectDirectStageFourALocalItem(locator: Locator, label: string) {
  await expect(locator, `${label}: local node is in its direct final state`).toHaveAttribute("data-motion-item-state", "idle");
  expect(await readLocalFeedbackMotion(locator), `${label}: local node clears its animation layer`).toMatchObject({
    animationName: "none",
    opacity: "1",
    transform: "none"
  });
}

async function pauseStageFourADetailMotion(page: Page) {
  return page.addStyleTag({
    content: "[data-motion-item-state='entering'], .citation-media-image[data-motion-image-state='entering'], .source-page-image[data-motion-image-state='entering'] { animation-play-state: paused !important; }"
  });
}

async function openStageFourAReadyBookCourse(page: Page, fixture: StageFourAImageFixture, imageMode: "success" | "failure" | "mixed" = "success") {
  await prepareStageThreeB2BLibrary(page, fixture, imageMode);
  await enterStageThreeB2BLibrary(page);
  const courseCard = page.locator('[data-motion-course-card-key="course-card:book_stage3"]');
  await courseCard.locator(".button-row .button").click();
  await expect(page.locator(".book-course-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourAReadyLesson(page: Page) {
  await page.locator(".book-course-screen .chapter-row").first().click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
  await settleCurrentScreenTransition(page);
}

test.describe("Stage 4A BookCourse and Lesson local motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("limits detail entry to named local nodes and fades the Lesson citation image once per rebuilt DOM", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAImageFixture;
    await prepareStageThreeB2BLibrary(page, fixture, "success");
    await enterStageThreeB2BLibrary(page);
    const detailPause = await pauseStageFourADetailMotion(page);

    try {
      await page.locator('[data-motion-course-card-key="course-card:book_stage3"] .button-row .button').click();
      await expect(page.locator(".book-course-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const bookHero = page.locator(".book-course-screen .course-hero");
      const bookActions = page.locator(".book-course-screen .course-action-grid");
      for (const [node, label] of [
        [bookHero, "BookCourse hero"],
        [bookActions, "BookCourse actions"]
      ] as const) {
        await expectPausedStageFourALocalItem(node, page, `${testInfo.project.name}: ${label}`);
        await settleStageFourALocalItem(node);
        await expectDirectStageFourALocalItem(node, `${testInfo.project.name}: settled ${label}`);
      }
      await expect(page.locator(".book-course-screen")).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".book-course-screen .chapter-row[data-motion-item]")).toHaveCount(0);

      await openStageFourAReadyLesson(page);

      const lessonTitle = page.locator(".lesson-title-card");
      const lessonPrimary = page.locator(".lesson-objectives-card");
      const lessonConcepts = page.locator(".concept-flash-card");
      for (const [node, label] of [
        [lessonTitle, "Lesson title"],
        [lessonPrimary, "Lesson primary explanation"],
        [lessonConcepts, "Lesson concepts"]
      ] as const) {
        await expectPausedStageFourALocalItem(node, page, `${testInfo.project.name}: ${label}`);
        await settleStageFourALocalItem(node);
        await expectDirectStageFourALocalItem(node, `${testInfo.project.name}: settled ${label}`);
      }

      await expect(page.locator(".lesson-screen")).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".lesson-reading-column")).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".lesson-reading-column .ai-explain-card").nth(1)).not.toHaveAttribute("data-motion-item", /.+/);

      const citationImage = page.locator(".lesson-screen .citation-media-image");
      const citationMedia = page.locator(".lesson-screen .citation-media");
      await expectPausedStageThreeImage(citationImage, page, `${testInfo.project.name}: Lesson citation image`);
      const initialMediaBounds = await citationMedia.evaluate((element) => element.getBoundingClientRect().toJSON());
      await settleStageThreeFeedback(citationImage, "motion-stage3-image-in");
      await expect(citationImage).toHaveAttribute("data-motion-image-state", "idle");
      expect(await citationMedia.evaluate((element) => element.getBoundingClientRect().toJSON()), `${testInfo.project.name}: successful citation image preserves media geometry`).toEqual(initialMediaBounds);

      await page.locator(".lesson-bottom-actions .button").first().click();
      await expect(page.locator(".book-course-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await openStageFourAReadyLesson(page);
      const rebuiltCitationImage = page.locator(".lesson-screen .citation-media-image");
      await expectPausedStageThreeImage(rebuiltCitationImage, page, `${testInfo.project.name}: cached citation image on rebuilt Lesson DOM`);
      await settleStageThreeFeedback(rebuiltCitationImage, "motion-stage3-image-in");
      await expect(rebuiltCitationImage).toHaveAttribute("data-motion-image-state", "idle");
      expect(await page.locator(".lesson-screen .citation-media").evaluate((element) => element.getBoundingClientRect().toJSON()), `${testInfo.project.name}: cached citation image preserves stable media geometry`).toEqual(initialMediaBounds);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: local BookCourse and Lesson detail nodes`);
    } finally {
      await removeStyleTag(detailPause);
    }
  });

  test("uses direct final local states under reduced motion without adding long-list entry motion", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAImageFixture;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageFourAReadyBookCourse(page, fixture);

    const bookHero = page.locator(".book-course-screen .course-hero");
    const bookActions = page.locator(".book-course-screen .course-action-grid");
    await expectDirectStageFourALocalItem(bookHero, `${testInfo.project.name}: reduced BookCourse hero`);
    await expectDirectStageFourALocalItem(bookActions, `${testInfo.project.name}: reduced BookCourse actions`);
    await expect(page.locator(".book-course-screen .chapter-row[data-motion-item]")).toHaveCount(0);

    await openStageFourAReadyLesson(page);
    for (const [node, label] of [
      [page.locator(".lesson-title-card"), "Lesson title"],
      [page.locator(".lesson-objectives-card"), "Lesson primary explanation"],
      [page.locator(".concept-flash-card"), "Lesson concepts"]
    ] as const) {
      await expectDirectStageFourALocalItem(node, `${testInfo.project.name}: reduced ${label}`);
    }
    await expect(page.locator(".lesson-reading-column .ai-explain-card").nth(1)).not.toHaveAttribute("data-motion-item", /.+/);
  });

  test("keeps a failed Lesson citation image in the same stable media fallback", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAImageFixture;
    await prepareStageThreeB2BLibrary(page, fixture, "success");
    await enterStageThreeB2BLibrary(page);
    const covers = page.locator(".course-cover-image");
    await expect(covers).toHaveCount(3);
    await expect.poll(() => covers.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-motion-image-state")))).toEqual(["idle", "idle", "idle"]);
    fixture.setPreparedImageMode("failure");

    await page.locator('[data-motion-course-card-key="course-card:book_stage3"] .button-row .button').click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await openStageFourAReadyLesson(page);

    const fallback = page.locator(".lesson-screen .citation-media-fallback");
    const media = page.locator(".lesson-screen .citation-media");
    await expect(fallback, `${testInfo.project.name}: failed citation resolves to its stable fallback`).toBeVisible();
    await expect(fallback).toHaveAttribute("data-motion-image-state", "failed");
    await expect(fallback).toHaveAttribute("data-motion-image-source", /\/api\/books\/book_stage3\/pages\/3\/image$/);
    await expect(page.locator(".lesson-screen .citation-media-image")).toHaveCount(0);
    const bounds = await media.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(bounds.width, `${testInfo.project.name}: failed citation media keeps a positive width`).toBeGreaterThan(0);
    expect(bounds.height, `${testInfo.project.name}: failed citation media keeps a positive height`).toBeGreaterThan(0);
    expect(bounds.width / bounds.height, `${testInfo.project.name}: failed citation fallback keeps the image aspect ratio without a layout jump`).toBeCloseTo(0.75, 2);
    expect((await readLocalFeedbackMotion(fallback)).animationName, `${testInfo.project.name}: failed citation fallback has no image animation residue`).toBe("none");
    await expect.poll(() => fixture.consoleErrors).toEqual([failedResource404ConsoleError]);
    assertAndAcknowledgeExactConsoleErrors(fixture, [failedResource404ConsoleError], `${testInfo.project.name}: only the requested failed citation image emits a console error`);
  });
});

async function expectPausedStageFourASourcePage(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: page content is the explicit local switch layer`).toHaveAttribute("data-motion-item", "source-page-content");
  await expect(locator, `${label}: page content enters after replacement`).toHaveAttribute("data-motion-item-state", "entering");
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: page content uses opacity-only Base/Fast mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-source-page-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: page content uses Standard easing`).toBe("cubic-bezier(0.2,0.8,0.2,1)");
  expect(Number(motion.opacity), `${label}: page content starts transparent`).toBe(0);
  expect(motion.transform, `${label}: page content never slides the document`).toBe("none");
}

test.describe("Stage 4A SourceReader page-content motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unacknowledged console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("replaces only source-page content across failure, page changes, rapid switches, and back restoration", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAImageFixture;
    await openStageFourAReadyBookCourse(page, fixture, "success");
    await openStageFourAReadyLesson(page);
    const detailPause = await pauseStageFourADetailMotion(page);

    try {
      await page.locator(".lesson-learning-tools .button").first().click();
      await expect(page.locator(".source-reader-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);

      const readerRoot = page.locator(".source-reader-screen");
      const firstPage = page.locator(".source-page-frame");
      await expectPausedStageFourASourcePage(firstPage, page, `${testInfo.project.name}: initial source page`);
      expect(await readerRoot.evaluate((element) => getComputedStyle(element).animationName), `${testInfo.project.name}: reader root receives no Stage 4A document animation`).toBe("none");
      await expect(readerRoot).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".source-reader-toolbar")).not.toHaveAttribute("data-motion-item", /.+/);
      const firstPageKey = await firstPage.getAttribute("data-motion-item-key");
      const firstImage = page.locator(".source-page-image");
      await expectPausedStageThreeImage(firstImage, page, `${testInfo.project.name}: initial source image`);
      const stableMediaBounds = await page.locator(".source-page-media").evaluate((element) => element.getBoundingClientRect().toJSON());
      await settleStageFourALocalItem(firstPage, "motion-source-page-in");
      await settleStageThreeFeedback(firstImage, "motion-stage3-image-in");
      await expectDirectStageFourALocalItem(firstPage, `${testInfo.project.name}: settled initial source page content`);

      const nextPage = page.locator(".source-reader-toolbar button").last();
      await nextPage.click();
      await nextPage.click();
      await expect(page.locator(".source-reader-toolbar strong")).toContainText("3");
      const rapidPage = page.locator(".source-page-frame");
      await expectPausedStageFourASourcePage(rapidPage, page, `${testInfo.project.name}: rapid successful source page replacement`);
      const rapidPageKey = await rapidPage.getAttribute("data-motion-item-key");
      expect(rapidPageKey, `${testInfo.project.name}: rapid change replaces rather than reuses the page content node`).not.toBe(firstPageKey);
      const sourceImage = page.locator(".source-page-image");
      await expectPausedStageThreeImage(sourceImage, page, `${testInfo.project.name}: successful source image inside the stable page media`);
      expect(await page.locator(".source-page-media").evaluate((element) => element.getBoundingClientRect().toJSON()), `${testInfo.project.name}: image success preserves the first page media geometry`).toEqual(stableMediaBounds);
      expect(await rapidPage.evaluate((frame) => {
        const image = frame.querySelector(".source-page-image");
        return Boolean(image) && image !== frame && frame.contains(image);
      }), `${testInfo.project.name}: page-content fade and image fade use distinct DOM nodes`).toBe(true);
      await settleStageFourALocalItem(rapidPage, "motion-source-page-in");
      await settleStageThreeFeedback(sourceImage, "motion-stage3-image-in");

      fixture.setPreparedImageMode("failure");
      await nextPage.click();
      await expect(page.locator(".source-reader-toolbar strong")).toContainText("4");
      const failedPage = page.locator(".source-page-frame");
      await expectPausedStageFourASourcePage(failedPage, page, `${testInfo.project.name}: fresh failed source page replacement`);
      await expect(page.locator(".source-page-frame")).toHaveCount(1);
      await expect(page.locator("[data-motion-item='source-page-content']")).toHaveCount(1);
      await expect(page.locator(".source-page-fallback")).toBeVisible();
      expect(await page.locator(".source-page-media").evaluate((element) => element.getBoundingClientRect().toJSON()), `${testInfo.project.name}: failed page fallback preserves stable media geometry`).toEqual(stableMediaBounds);
      await settleStageFourALocalItem(failedPage, "motion-source-page-in");

      fixture.setPreparedImageMode("success");
      await page.locator(".source-reader-actions .button").nth(1).click();
      await expect(page.locator(".lesson-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".lesson-learning-tools .button").first().click();
      await expect(page.locator(".source-reader-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await expect(page.locator(".source-reader-toolbar strong")).toContainText("1");
      const restoredPage = page.locator(".source-page-frame");
      await expectPausedStageFourASourcePage(restoredPage, page, `${testInfo.project.name}: back restores the referenced page content only`);
      const restoredImage = page.locator(".source-page-image");
      await expectPausedStageThreeImage(restoredImage, page, `${testInfo.project.name}: restored source image`);
      expect(await page.locator(".source-page-media").evaluate((element) => element.getBoundingClientRect().toJSON()), `${testInfo.project.name}: restored source page keeps stable media geometry`).toEqual(stableMediaBounds);
      await settleStageFourALocalItem(restoredPage, "motion-source-page-in");
      await settleStageThreeFeedback(restoredImage, "motion-stage3-image-in");

      await expect.poll(() => fixture.consoleErrors).toEqual([failedResource404ConsoleError]);
      assertAndAcknowledgeExactConsoleErrors(fixture, [failedResource404ConsoleError], `${testInfo.project.name}: only the requested fresh failed source page emits a console error`);
      expect(fixture.requests.some((request) => request.method === "GET" && request.path === "/api/books/book_stage3/pages/4/image"), `${testInfo.project.name}: fresh failed next-page request remains unchanged`).toBe(true);
    } finally {
      await removeStyleTag(detailPause);
    }
  });

  test("renders source-page content and image directly at their final state under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageFourAImageFixture;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageFourAReadyBookCourse(page, fixture, "success");
    await openStageFourAReadyLesson(page);
    await page.locator(".lesson-learning-tools .button").first().click();
    await expect(page.locator(".source-reader-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);

    const pageContent = page.locator(".source-page-frame");
    await expect(pageContent).toHaveAttribute("data-motion-item", "source-page-content");
    await expectDirectStageFourALocalItem(pageContent, `${testInfo.project.name}: reduced source-page content`);
    const sourceImage = page.locator(".source-page-image");
    await expect(sourceImage).toHaveAttribute("data-motion-image-state", "idle");
    expect(await readLocalFeedbackMotion(sourceImage), `${testInfo.project.name}: reduced source image keeps no animation`).toMatchObject({
      animationName: "none",
      opacity: "1",
      transform: "none"
    });
  });
});

const stageFourBPreparedCourseSession = {
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
    message: "Stage 4B fixture prepares the real course.",
    error: null
  }
};

async function loadStageFourBCourse(page: Page, fixture: BookCourseApiFixture) {
  fixture.useStageSixFlow();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, stageFourBPreparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".daily-task-copy .button"), "Stage 4B fixture reaches the existing real-home action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourBBook(page: Page, fixture: BookCourseApiFixture) {
  await loadStageFourBCourse(page, fixture);
  await page.locator(".daily-task-copy .button").click();
  await expect(page.locator(".library-course-grid"), "Stage 4B course library is visible").toBeVisible();
  await settleCurrentScreenTransition(page);
  await page.locator(".library-course-grid .course-space-card .button").first().click();
  await expect(page.locator(".book-course-screen"), "Stage 4B course overview is visible").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourBPlan(page: Page, fixture: BookCourseApiFixture) {
  await openStageFourBBook(page, fixture);
  await page.locator(".course-action-grid .quick-action").first().click();
  await expect(page.locator(".study-plan-screen"), "Stage 4B study plan opens through its existing action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourBAssignment(page: Page, fixture: BookCourseApiFixture) {
  await openStageFourBBook(page, fixture);
  await page.locator(".course-action-grid .quick-action").nth(1).click();
  await expect(page.locator(".lesson-screen"), "Stage 4B lesson opens through its existing action").toBeVisible();
  await settleCurrentScreenTransition(page);
  await page.locator(".lesson-action-grid .button").nth(2).click();
  await expect(page.locator(".assignment-screen"), "Stage 4B assignment opens through its existing lesson action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function readStageFourBMotion(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      animationPlayState: style.animationPlayState,
      animationTimingFunction: style.animationTimingFunction,
      opacity: style.opacity,
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty
    };
  });
}

function expectedStageFourBCheckDuration(page: Page) {
  return isShortLandscape(page) ? "0.14s" : "0.18s";
}

async function pauseStageFourBStudyAndAssignmentMotion(page: Page) {
  return page.addStyleTag({
    content: ".plan-date-selection-check[data-motion-plan-date-state='entering'], .timeline-task-completion[data-motion-plan-task-state='entering'], .assignment-answer-check[data-motion-assignment-answer-state='entering'], [data-motion-item='content'][data-motion-item-state='entering'] { animation-play-state: paused !important; }"
  });
}

async function settleStageFourBAnimation(locator: Locator, animationName: string) {
  await locator.evaluate((element, name) => {
    element.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
  }, animationName);
}

test.describe("Stage 4B StudyPlan and Assignment motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("keeps StudyPlan feedback scoped to real date, empty-state, and task transitions without replay", async ({ page, bookCourseApi }, testInfo) => {
    await openStageFourBPlan(page, bookCourseApi);
    const pause = await pauseStageFourBStudyAndAssignmentMotion(page);

    try {
      const root = page.locator(".study-plan-screen");
      const days = page.locator(".study-plan-calendar .plan-date-row button");
      await expect(days, `${testInfo.project.name}: fixture exposes all seven study days`).toHaveCount(7);
      await expect(root, `${testInfo.project.name}: page root remains outside local motion ownership`).not.toHaveAttribute("data-motion-item", /.+/);

      await days.nth(2).click();
      const dateCheck = page.locator(".plan-date-selection-check");
      await expect(dateCheck, `${testInfo.project.name}: selected day owns one Check/Pill feedback node`).toHaveAttribute("data-motion-plan-date-key", "study-plan:day:3");
      await expect(dateCheck).toHaveAttribute("data-motion-plan-date-state", "entering");
      expect(await readStageFourBMotion(dateCheck), `${testInfo.project.name}: date Check uses the Fast Standard mapping`).toMatchObject({
        animationDuration: "0.14s",
        animationName: "motion-plan-date-check-in",
        animationPlayState: "paused"
      });
      expect(normalizeTimingFunction((await readStageFourBMotion(dateCheck)).animationTimingFunction)).toBe("cubic-bezier(0.2,0.8,0.2,1)");
      expect(scaleFromTransform((await readStageFourBMotion(dateCheck)).transform)).toBeCloseTo(.9, 3);

      const empty = page.locator(".study-plan-empty-state");
      await expect(empty, `${testInfo.project.name}: changing to a sparse day replaces only the explicit empty state`).toHaveAttribute("data-motion-item", "content");
      await expect(empty).toHaveAttribute("data-motion-item-state", "entering");
      expect(await readStageFourBMotion(empty), `${testInfo.project.name}: empty state keeps the generic local Base/Fast mapping`).toMatchObject({
        animationDuration: expectedLocalFeedbackDuration(page),
        animationName: "motion-local-item-in",
        animationPlayState: "paused"
      });
      await settleStageFourBAnimation(dateCheck, "motion-plan-date-check-in");
      await settleStageFourBAnimation(empty, "motion-local-item-in");
      await expect(dateCheck).toHaveAttribute("data-motion-plan-date-state", "idle");
      await expect(empty).toHaveAttribute("data-motion-item-state", "idle");

      await days.first().click();
      const returnedDateCheck = page.locator(".plan-date-selection-check");
      await settleStageFourBAnimation(returnedDateCheck, "motion-plan-date-check-in");
      const task = page.locator(".study-plan-tasks .timeline-item").first();
      await task.click();
      await expect(task, `${testInfo.project.name}: existing PATCH completion still updates the original task`).toHaveClass(/done/);
      const taskCheck = task.locator(".timeline-task-completion");
      await expect(taskCheck).toHaveAttribute("data-motion-plan-task-key", "study-plan:task:task_stage6_1:done");
      await expect(taskCheck).toHaveAttribute("data-motion-plan-task-state", "entering");
      expect(await readStageFourBMotion(taskCheck), `${testInfo.project.name}: task completion uses the stage Check Base/Fast mapping`).toMatchObject({
        animationDuration: expectedStageFourBCheckDuration(page),
        animationName: "motion-stage-check-in",
        animationPlayState: "paused"
      });
      await settleStageFourBAnimation(taskCheck, "motion-stage-check-in");
      await expect(taskCheck).toHaveAttribute("data-motion-plan-task-state", "idle");

      await days.first().click();
      expect(await readStageFourBMotion(page.locator(".plan-date-selection-check")), `${testInfo.project.name}: same-date rerender does not restart feedback`).toMatchObject({ animationName: "none" });
      expect(bookCourseApi.requests.some((request) => request.method === "PATCH" && request.path === "/api/study-tasks/task_stage6_1"), `${testInfo.project.name}: task completion preserves the existing PATCH endpoint`).toBe(true);
    } finally {
      await removeStyleTag(pause);
    }
  });

  test("keeps Assignment selection and existing submission behavior keyboard-safe", async ({ page, bookCourseApi }, testInfo) => {
    await openStageFourBAssignment(page, bookCourseApi);
    const pause = await pauseStageFourBStudyAndAssignmentMotion(page);

    try {
      const card = page.locator(".assignment-card");
      const textarea = card.locator("textarea");
      const submit = page.locator(".assignment-primary-action .button");
      await textarea.focus();
      await expect(textarea, `${testInfo.project.name}: keyboard focus remains on the existing answer field`).toBeFocused();
      await expect(card).toHaveAttribute("data-motion-assignment-selection", "selected");
      expect(await readStageFourBMotion(card), `${testInfo.project.name}: selected answer uses only a Fast border/background transition`).toMatchObject({
        transitionDuration: "0.14s",
        transitionProperty: "border-color, background-color"
      });

      await textarea.fill("Stage 4B answer keeps the original submission payload.");
      const answerCheck = card.locator(".assignment-answer-check");
      await expect(answerCheck, `${testInfo.project.name}: a non-empty existing answer receives the local Check feedback`).toHaveAttribute("data-motion-assignment-answer-state", "entering");
      expect(await readStageFourBMotion(answerCheck), `${testInfo.project.name}: answer Check uses Base/Fast stage completion feedback`).toMatchObject({
        animationDuration: expectedStageFourBCheckDuration(page),
        animationName: "motion-stage-check-in",
        animationPlayState: "paused"
      });
      await settleStageFourBAnimation(answerCheck, "motion-stage-check-in");
      await expect(answerCheck).toHaveAttribute("data-motion-assignment-answer-state", "idle");

      await textarea.fill("");
      await expect(card.locator(".assignment-answer-check"), `${testInfo.project.name}: clearing the answer removes its existing-selection Check`).toHaveCount(0);
      await textarea.fill("Stage 4B answer keeps the original submission payload.");
      await expect(card.locator(".assignment-answer-check")).toHaveAttribute("data-motion-assignment-answer-state", "entering");
      await textarea.blur();
      await expect(card).toHaveAttribute("data-motion-assignment-selection", "idle");
      await textarea.focus();
      await textarea.scrollIntoViewIfNeeded();
      await expect(submit, `${testInfo.project.name}: focused answer keeps the existing submit action available`).toBeVisible();
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: assignment feedback does not create overflow`);

      await submit.click();
      await expect(page.locator(".diagnosis-screen"), `${testInfo.project.name}: existing submit → diagnose navigation remains intact`).toBeVisible();
      await expect.poll(
        () => bookCourseApi.requests.filter((request) => request.method === "POST" && request.path.includes("/api/assignments/assignment_chapter_stage3/")).length,
        `${testInfo.project.name}: submission and diagnosis still use the original local API chain`
      ).toBe(2);
    } finally {
      await removeStyleTag(pause);
    }
  });

  test("renders StudyPlan and Assignment directly under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageFourBPlan(page, bookCourseApi);
    const days = page.locator(".study-plan-calendar .plan-date-row button");
    await days.nth(2).click();
    const dateCheck = page.locator(".plan-date-selection-check");
    await expect(dateCheck).toHaveAttribute("data-motion-plan-date-state", "idle");
    expect(await readStageFourBMotion(dateCheck), `${testInfo.project.name}: reduced date Check has no animation`).toMatchObject({
      animationName: "none",
      opacity: "1",
      transform: "none"
    });
    const empty = page.locator(".study-plan-empty-state");
    await expect(empty).toHaveAttribute("data-motion-item-state", "idle");
    expect(await readStageFourBMotion(empty), `${testInfo.project.name}: reduced empty state is direct`).toMatchObject({ animationName: "none", transform: "none" });

    await openStageFourBAssignment(page, bookCourseApi);
    const textarea = page.locator(".assignment-card textarea");
    await textarea.fill("Reduced motion answer.");
    const answerCheck = page.locator(".assignment-answer-check");
    await expect(answerCheck).toHaveAttribute("data-motion-assignment-answer-state", "idle");
    expect(await readStageFourBMotion(answerCheck), `${testInfo.project.name}: reduced answer Check has no animation`).toMatchObject({ animationName: "none", transform: "none" });
  });
});

function stageFourBFlashcardIsTablet(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Stage 4B Flashcard test requires a viewport.");
  return viewport.width >= 768 && viewport.height >= 600;
}

function expectedStageFourBFlashcardNext(page: Page) {
  if (isShortLandscape(page)) return { duration: "0.14s", name: "motion-flashcard-next-short-in", x: 4, y: 0 };
  if (stageFourBFlashcardIsTablet(page)) return { duration: "0.18s", name: "motion-flashcard-next-tablet-in", x: 0, y: 6 };
  return { duration: "0.18s", name: "motion-flashcard-next-in", x: 8, y: 0 };
}

function expectedStageFourBFlipAnimation(page: Page, direction: "back" | "front") {
  if (isShortLandscape(page)) {
    return { duration: "0.18s", name: "motion-flashcard-crossfade-in", target: ".memory-card-answer-face[aria-hidden='false']" };
  }
  return {
    duration: "0.34s",
    name: direction === "back" ? "motion-flashcard-flip-to-back" : "motion-flashcard-flip-to-front",
    target: ".memory-card-answer-3d"
  };
}

async function openStageFourBFlashcards(page: Page, fixture: BookCourseApiFixture) {
  await openStageFourBBook(page, fixture);
  await page.locator(".course-action-grid .quick-action").nth(1).click();
  await expect(page.locator(".lesson-screen"), "Stage 4B lesson opens before Flashcards").toBeVisible();
  await settleCurrentScreenTransition(page);
  await page.locator(".lesson-action-grid .button").nth(1).click();
  await expect(page.locator(".flashcard-screen"), "Stage 4B Flashcard screen opens through its existing lesson action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function pauseStageFourBFlashcardAndDiagnosisMotion(page: Page) {
  return page.addStyleTag({
    content: ".memory-card-answer-motion[data-motion-flash-next-state='entering'], .memory-card-answer-motion[data-motion-flash-state='flipping'] .memory-card-answer-3d, .memory-card-answer-motion[data-motion-flash-state='flipping'] .memory-card-answer-face, .diagnosis-knowledge-progress-fill[data-motion-diagnosis-progress-state='entering'], .diagnosis-card[data-motion-item-state='entering'] { animation-play-state: paused !important; }"
  });
}

async function settleStageFourBFlashcardFlip(page: Page, root: Locator, direction: "back" | "front") {
  const expected = expectedStageFourBFlipAnimation(page, direction);
  await root.locator(expected.target).evaluate((element, animationName) => {
    element.dispatchEvent(new AnimationEvent("animationend", { animationName, bubbles: true }));
  }, expected.name);
}

async function flashcardSourceLink(page: Page) {
  return stageFourBFlashcardIsTablet(page)
    ? page.locator(".flashcard-source-sidebar .inline-link")
    : page.locator(".memory-card-source-row .inline-link");
}

test.describe("Stage 4B Flashcard and Diagnosis motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("keeps Flashcard 3D geometry and interaction lock inside the core answer region", async ({ page, bookCourseApi }, testInfo) => {
    await openStageFourBFlashcards(page, bookCourseApi);
    const pause = await pauseStageFourBFlashcardAndDiagnosisMotion(page);

    try {
      const card = page.locator(".memory-card");
      const answer = page.locator(".memory-card-answer-motion");
      const frontFace = answer.locator(".memory-card-answer-face-front");
      const backFace = answer.locator(".memory-card-answer-face-back");
      const reveal = page.locator(".memory-reveal");
      await expect(answer, `${testInfo.project.name}: Flashcard isolates an explicit core answer region`).toHaveAttribute("data-motion-flash-side", "front");
      await expect(frontFace).toHaveAttribute("aria-hidden", "false");
      await expect(backFace).toHaveAttribute("aria-hidden", "true");
      await expect(answer.locator("button, a, input, textarea, select"), `${testInfo.project.name}: answer faces contain no duplicate interactive controls`).toHaveCount(0);
      await expect(card.locator(".memory-card-source-row"), `${testInfo.project.name}: source affordance stays outside the answer region`).toBeAttached();
      expect(await answer.evaluate((element) => ({
        cardTransform: getComputedStyle(element.closest(".memory-card")!).transform,
        perspective: getComputedStyle(element).perspective,
        sourceInside: Boolean(element.querySelector(".memory-card-source-row, .inline-link"))
      })), `${testInfo.project.name}: only the answer region can own Flashcard geometry`).toMatchObject({
        cardTransform: "none",
        sourceInside: false,
        perspective: isShortLandscape(page) ? "none" : "1000px"
      });

      await reveal.click();
      await expect(reveal, `${testInfo.project.name}: repeated flips are locked during the current motion`).toBeDisabled();
      await expect(answer).toHaveAttribute("data-motion-flash-side", "back");
      await expect(frontFace).toHaveAttribute("aria-hidden", "true");
      await expect(backFace).toHaveAttribute("aria-hidden", "false");
      const flipBack = expectedStageFourBFlipAnimation(page, "back");
      const flipTarget = answer.locator(flipBack.target);
      expect(await readStageFourBMotion(flipTarget), `${testInfo.project.name}: flip uses the required device mapping`).toMatchObject({
        animationDuration: flipBack.duration,
        animationName: flipBack.name,
        animationPlayState: "paused"
      });
      if (isShortLandscape(page)) {
        expect(await answer.locator(".memory-card-answer-3d").evaluate((element) => ({
          transform: getComputedStyle(element).transform,
          transformStyle: getComputedStyle(element).transformStyle
        })), `${testInfo.project.name}: short landscape removes 3D geometry`).toEqual({ transform: "none", transformStyle: "flat" });
      }

      await reveal.dispatchEvent("click");
      await expect(answer, `${testInfo.project.name}: a rapid second click cannot reverse the in-flight flip`).toHaveAttribute("data-motion-flash-side", "back");
      await expect(page.locator(".flashcard-actions .button").last(), `${testInfo.project.name}: next-card action remains available during a flip`).toBeEnabled();
      await settleStageFourBFlashcardFlip(page, answer, "back");
      await expect(reveal).toBeEnabled();
      await expect(answer).toHaveAttribute("data-motion-flash-state", "idle");

      await reveal.click();
      const flipFront = expectedStageFourBFlipAnimation(page, "front");
      expect(await readStageFourBMotion(answer.locator(flipFront.target)), `${testInfo.project.name}: reverse uses the matching flip direction`).toMatchObject({
        animationDuration: flipFront.duration,
        animationName: flipFront.name,
        animationPlayState: "paused"
      });
      await settleStageFourBFlashcardFlip(page, answer, "front");
      await expect(answer).toHaveAttribute("data-motion-flash-side", "front");

      await reveal.click();
      await expect(answer).toHaveAttribute("data-motion-flash-state", "flipping");
      const known = page.locator(".flashcard-actions .button").last();
      await known.click();
      await expect(answer, `${testInfo.project.name}: moving next cancels the transient flip but preserves the operation`).toHaveAttribute("data-motion-flash-state", "idle");
      await expect(answer).toHaveAttribute("data-motion-flash-card", "card_stage6_2");
      const next = expectedStageFourBFlashcardNext(page);
      expect(await readStageFourBMotion(answer), `${testInfo.project.name}: next card uses the locked phone/iPad/short entry mapping`).toMatchObject({
        animationDuration: next.duration,
        animationName: next.name,
        animationPlayState: "paused"
      });
      const nextTransform = stageFourATransformComponents((await readStageFourBMotion(answer)).transform);
      expect(nextTransform.x, `${testInfo.project.name}: next card has the expected horizontal offset`).toBeCloseTo(next.x, 3);
      expect(nextTransform.y, `${testInfo.project.name}: next card has the expected vertical offset`).toBeCloseTo(next.y, 3);
      await settleStageFourBAnimation(answer, next.name);
      await expect(answer).toHaveAttribute("data-motion-flash-next-state", "idle");
      await expect(page.locator(".toast"), `${testInfo.project.name}: existing mastery feedback remains a Toast`).toBeVisible();

      const source = await flashcardSourceLink(page);
      await source.click();
      await expect(page.locator(".source-reader-screen"), `${testInfo.project.name}: source action keeps its existing reader destination`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".source-reader-actions .button").nth(1).click();
      await expect(page.locator(".flashcard-screen"), `${testInfo.project.name}: source-reader return keeps the Flashcard destination`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await expect(page.locator(".memory-card-answer-motion")).toHaveAttribute("data-motion-flash-side", "front");
    } finally {
      await removeStyleTag(pause);
    }
  });

  test("uses no Flashcard 3D geometry under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageFourBFlashcards(page, bookCourseApi);
    const answer = page.locator(".memory-card-answer-motion");
    const inner = answer.locator(".memory-card-answer-3d");
    const reveal = page.locator(".memory-reveal");
    expect(await answer.evaluate((element) => ({
      perspective: getComputedStyle(element).perspective,
      transform: getComputedStyle(element).transform
    })), `${testInfo.project.name}: reduced Flashcard root has no perspective or transform`).toEqual({ perspective: "none", transform: "none" });
    expect(await inner.evaluate((element) => ({
      animationName: getComputedStyle(element).animationName,
      transform: getComputedStyle(element).transform,
      transformStyle: getComputedStyle(element).transformStyle
    })), `${testInfo.project.name}: reduced Flashcard inner is flat and direct`).toEqual({ animationName: "none", transform: "none", transformStyle: "flat" });
    await reveal.click();
    await expect(reveal).toBeEnabled();
    await expect(answer).toHaveAttribute("data-motion-flash-state", "idle");
    await expect(answer).toHaveAttribute("data-motion-flash-side", "back");
    await expect(answer.locator(".memory-card-answer-face-front")).toHaveAttribute("aria-hidden", "true");
    await expect(answer.locator(".memory-card-answer-face-back")).toHaveAttribute("aria-hidden", "false");
    await page.locator(".flashcard-actions .button").last().click();
    await expect(answer).toHaveAttribute("data-motion-flash-next-state", "idle");
    expect(await readStageFourBMotion(answer), `${testInfo.project.name}: reduced next card has no animation`).toMatchObject({ animationName: "none", transform: "none" });
  });

  test("uses a submission-scoped diagnosis key and grows only its result bar", async ({ page, bookCourseApi }, testInfo) => {
    await openStageFourBAssignment(page, bookCourseApi);
    const pause = await pauseStageFourBFlashcardAndDiagnosisMotion(page);

    try {
      const textarea = page.locator(".assignment-card textarea");
      await textarea.fill("Stage 4B diagnosis answer.");
      await page.locator(".assignment-primary-action .button").click();
      await expect(page.locator(".diagnosis-screen"), `${testInfo.project.name}: existing submission opens diagnosis`).toBeVisible();
      await settleCurrentScreenTransition(page);

      const result = page.locator(".diagnosis-card");
      const progress = page.locator(".diagnosis-knowledge-progress-fill");
      await expect(result).toHaveAttribute("data-motion-diagnosis-key", "diagnosis:submission_stage6");
      await expect(result).toHaveAttribute("data-motion-diagnosis-state", "entering");
      await expect(result).toHaveAttribute("data-motion-item", "content");
      expect(await readStageFourBMotion(result), `${testInfo.project.name}: diagnosis result uses one scoped local entry`).toMatchObject({
        animationDuration: expectedLocalFeedbackDuration(page),
        animationName: "motion-local-item-in",
        animationPlayState: "paused"
      });
      await expect(progress).toHaveAttribute("data-motion-diagnosis-progress-key", "diagnosis:submission_stage6:knowledge-points");
      await expect(progress).toHaveAttribute("data-motion-diagnosis-progress-state", "entering");
      expect(await readStageFourBMotion(progress), `${testInfo.project.name}: knowledge-point bar uses only Progress scaleX`).toMatchObject({
        animationDuration: "0.32s",
        animationName: "motion-diagnosis-progress-in",
        animationPlayState: "paused"
      });
      expect((await readStageFourBMotion(progress)).transform, `${testInfo.project.name}: diagnosis bar starts from scaleX zero`).toBe("matrix(0, 0, 0, 1, 0, 0)");
      await settleStageFourBAnimation(progress, "motion-diagnosis-progress-in");
      await expect(result).toHaveAttribute("data-motion-diagnosis-state", "idle");
      await expect(progress).toHaveAttribute("data-motion-diagnosis-progress-state", "idle");
      expect(await readStageFourBMotion(progress), `${testInfo.project.name}: settled diagnosis bar retains a scaleX result without a transition`).toMatchObject({ animationName: "none", transform: "matrix(1, 0, 0, 1, 0, 0)" });

      await page.locator(".diagnosis-analysis-card .inline-link").click();
      await expect(page.locator(".source-reader-screen"), `${testInfo.project.name}: diagnosis citation keeps SourceReader navigation`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".source-reader-actions .button").nth(1).click();
      await expect(page.locator(".diagnosis-screen"), `${testInfo.project.name}: SourceReader return restores diagnosis`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const returnedResult = page.locator(".diagnosis-card");
      await expect(returnedResult, `${testInfo.project.name}: same submission does not replay after leaving and returning`).toHaveAttribute("data-motion-diagnosis-state", "idle");
      expect(await readStageFourBMotion(returnedResult), `${testInfo.project.name}: returned result has no residual entry animation`).toMatchObject({ animationName: "none" });

      await page.locator(".diagnosis-actions .button").first().click();
      await expect(page.locator(".assignment-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".assignment-primary-action .button").click();
      await expect(page.locator(".diagnosis-screen")).toBeVisible();
      await settleCurrentScreenTransition(page);
      const nextResult = page.locator(".diagnosis-card");
      await expect(nextResult, `${testInfo.project.name}: a new backend submission receives a new motion key`).toHaveAttribute("data-motion-diagnosis-key", "diagnosis:submission_stage6_2");
      await expect(nextResult).toHaveAttribute("data-motion-diagnosis-state", "entering");
      expect(bookCourseApi.requests.filter((request) => request.method === "POST" && request.path.includes("/api/assignments/assignment_chapter_stage3/")).length, `${testInfo.project.name}: two real submit/diagnose chains were preserved`).toBe(4);
    } finally {
      await removeStyleTag(pause);
    }
  });

  test("renders diagnosis results and scaleX bars directly under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageFourBAssignment(page, bookCourseApi);
    await page.locator(".assignment-card textarea").fill("Reduced diagnosis answer.");
    await page.locator(".assignment-primary-action .button").click();
    await expect(page.locator(".diagnosis-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    const result = page.locator(".diagnosis-card");
    const progress = page.locator(".diagnosis-knowledge-progress-fill");
    await expect(result).toHaveAttribute("data-motion-diagnosis-state", "idle");
    await expect(progress).toHaveAttribute("data-motion-diagnosis-progress-state", "idle");
    expect(await readStageFourBMotion(result), `${testInfo.project.name}: reduced diagnosis result is direct`).toMatchObject({ animationName: "none", transform: "none" });
    expect(await readStageFourBMotion(progress), `${testInfo.project.name}: reduced diagnosis bar is direct at its target scale`).toMatchObject({
      animationName: "none",
      transform: "matrix(1, 0, 0, 1, 0, 0)"
    });
  });
});

async function loadStageFourCCourse(
  page: Page,
  fixture: BookCourseApiFixture,
  options?: StageSixFlowOptions
) {
  fixture.useStageSixFlow(options);
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, stageFourBPreparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".daily-task-copy .button"), "Stage 4C fixture reaches the existing home action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourCBook(page: Page, fixture: BookCourseApiFixture, options?: StageSixFlowOptions) {
  await loadStageFourCCourse(page, fixture, options);
  await page.locator(".daily-task-copy .button").click();
  await expect(page.locator(".library-course-grid"), "Stage 4C course library is visible").toBeVisible();
  await settleCurrentScreenTransition(page);
  await page.locator(".library-course-grid .course-space-card .button").first().click();
  await expect(page.locator(".book-course-screen"), "Stage 4C course overview is visible").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourCMistakes(page: Page, fixture: BookCourseApiFixture, options?: StageSixFlowOptions) {
  await openStageFourCBook(page, fixture, options);
  await page.locator(".course-action-grid .quick-action").nth(2).click();
  await expect(page.locator(".mistake-book-screen"), "Stage 4C mistake book opens through its existing course action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourCNotes(page: Page, fixture: BookCourseApiFixture, options?: StageSixFlowOptions) {
  await openStageFourCBook(page, fixture, options);
  await page.locator(".course-action-grid .quick-action").nth(3).click();
  await expect(page.locator(".notes-screen"), "Stage 4C notes opens through its existing course action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function openStageFourCLesson(page: Page, fixture: BookCourseApiFixture, options?: StageSixFlowOptions) {
  await openStageFourCBook(page, fixture, options);
  await page.locator(".course-action-grid .quick-action").nth(1).click();
  await expect(page.locator(".lesson-screen"), "Stage 4C lesson opens through its existing course action").toBeVisible();
  await settleCurrentScreenTransition(page);
}

async function pauseStageFourCLocalMotion(page: Page) {
  return page.addStyleTag({
    content: "[data-motion-item='content'][data-motion-item-state='entering'], .community-cover-image[data-motion-image-state='entering'] { animation-play-state: paused !important; }"
  });
}

async function installStageFourCLocalMotionPauseProbe(page: Page) {
  await page.addInitScript(() => {
    const probeId = "stage4c-local-motion-pause-probe";
    const install = () => {
      if (!document.documentElement || document.getElementById(probeId)) return false;
      const style = document.createElement("style");
      style.id = probeId;
      style.textContent = "[data-motion-item='content'][data-motion-item-state='entering'], .community-cover-image[data-motion-image-state='entering'] { animation-play-state: paused !important; }";
      document.documentElement.append(style);
      return true;
    };
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  });
}

async function waitForStageFourCLocalIdle(locator: Locator, label: string) {
  await expect.poll(() => locator.getAttribute("data-motion-item-state"), {
    message: `${label}: local node settles its one entry`
  }).toBe("idle");
  await expectDirectStageFourALocalItem(locator, label);
}

async function expectPausedStageFourCGenericLocalItem(locator: Locator, page: Page, label: string) {
  await expect(locator, `${label}: explicit local node is rendered`).toHaveAttribute("data-motion-item", "content");
  await expect(locator, `${label}: explicit local node enters`).toHaveAttribute("data-motion-item-state", "entering");
  await expect.poll(() => readLocalFeedbackMotion(locator), {
    message: `${label}: generic local node uses the Base/Fast entry mapping`
  }).toMatchObject({
    animationDuration: expectedLocalFeedbackDuration(page),
    animationName: "motion-local-item-in",
    animationPlayState: "paused"
  });
  const motion = await readLocalFeedbackMotion(locator);
  expect(normalizeTimingFunction(motion.animationTimingFunction), `${label}: generic local node uses enter easing`).toBe("cubic-bezier(0.16,1,0.3,1)");
  expect(Number(motion.opacity), `${label}: generic local node starts transparent`).toBe(0);
  const transform = stageFourATransformComponents(motion.transform);
  expect(transform.x, `${label}: generic local node does not use the MistakeBook/Notes iPad vector`).toBeCloseTo(0, 4);
  expect(transform.y, `${label}: generic local node uses the standard local vertical distance`).toBeCloseTo(expectedLocalFeedbackDistance(page), 4);
}

async function expectStageFourCTabletMasterDetail(page: Page, list: Locator, detail: Locator, label: string) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < 768 || viewport.height < 600) return;
  const [listBounds, detailBounds] = await Promise.all([
    list.evaluate((element) => element.getBoundingClientRect().toJSON()),
    detail.evaluate((element) => element.getBoundingClientRect().toJSON())
  ]);
  expect(listBounds.right, `${label}: list stays left of the selected detail on iPad`).toBeLessThanOrEqual(detailBounds.left + 1);
}

type StageFourCBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

async function readStageFourCBox(locator: Locator): Promise<StageFourCBox> {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y };
  });
}

function expectStageFourCStableBox(before: StageFourCBox, after: StageFourCBox, label: string) {
  expect(after.width, `${label}: width stays stable`).toBeCloseTo(before.width, 3);
  expect(after.height, `${label}: height stays stable`).toBeCloseTo(before.height, 3);
  expect(after.x, `${label}: horizontal position stays stable`).toBeCloseTo(before.x, 3);
  expect(after.y, `${label}: vertical position stays stable`).toBeCloseTo(before.y, 3);
}

async function expectStageFourCImageIdle(locator: Locator, label: string) {
  await expect.poll(() => locator.getAttribute("data-motion-image-state"), {
    message: `${label}: actual image reaches its settled lifecycle state`
  }).toBe("idle");
  expect(await readLocalFeedbackMotion(locator), `${label}: settled image clears its animation layer`).toMatchObject({
    animationName: "none",
    opacity: "1",
    transform: "none"
  });
}

async function openStageFourCCommunity(page: Page) {
  await page.goto("/?embedded=device-preview");
  await settleCurrentScreenTransition(page);
  await page.locator(".primary-nav .nav-item").nth(1).click();
  await expect(page.locator(".community-screen"), "Stage 4C Community opens through its existing primary navigation").toBeVisible();
  await settleCurrentScreenTransition(page);
  await page.getByLabel("搜索课程", { exact: true }).fill("课");
}

test.describe("Stage 4C remaining local motion", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unexpected console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("replaces only the selected MistakeBook and Notes detail while their master lists keep identity", async ({ page, bookCourseApi }, testInfo) => {
    await installStageFourCLocalMotionPauseProbe(page);
    await openStageFourCMistakes(page, bookCourseApi, { mistakeSet: "detail_pair" });

      const mistakeRoot = page.locator(".mistake-book-screen");
      const mistakeList = page.locator(".mistake-list");
      const mistakeRows = page.locator(".mistake-list-item");
      await expect(mistakeRows, `${testInfo.project.name}: test-only second real mistake exposes a master list`).toHaveCount(2);
      const initialMistake = page.locator(".mistake-detail-card");
      await expect(initialMistake, `${testInfo.project.name}: the first real mistake detail is rendered after the fixture resolves`).toHaveCount(1);
      await expectDirectStageFourALocalItem(initialMistake, `${testInfo.project.name}: initial asynchronous mistake detail stays direct despite the pre-navigation pause probe`);
      await expect(mistakeRoot, `${testInfo.project.name}: mistake page root never owns local detail motion`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(mistakeList, `${testInfo.project.name}: mistake master list remains static`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(mistakeList.locator("[data-motion-item]"), `${testInfo.project.name}: mistake rows never replay individually`).toHaveCount(0);
      await mistakeRows.first().evaluate((element) => element.setAttribute("data-stage4c-master-identity", "preserved"));

      await mistakeRows.nth(1).click();
      const selectedMistake = page.locator(".mistake-detail-card");
      await expect(selectedMistake, `${testInfo.project.name}: old mistake detail is replaced immediately`).toHaveCount(1);
      await expect(selectedMistake).toHaveAttribute("data-motion-item-key", /mistake_stage6_2/);
      await expect(mistakeRows.first(), `${testInfo.project.name}: selecting another detail preserves the first master-row DOM identity`).toHaveAttribute("data-stage4c-master-identity", "preserved");
      await expectPausedStageFourALocalItem(selectedMistake, page, `${testInfo.project.name}: selected mistake detail`);
      await expectStageFourCTabletMasterDetail(page, mistakeList, selectedMistake, `${testInfo.project.name}: MistakeBook`);
      await settleStageFourALocalItem(selectedMistake);
      await waitForStageFourCLocalIdle(selectedMistake, `${testInfo.project.name}: settled selected mistake detail`);

      await mistakeRows.nth(1).click();
      await expectDirectStageFourALocalItem(selectedMistake, `${testInfo.project.name}: selecting the already active mistake does not replay`);

      await page.locator(".filter-pill").nth(1).click();
      await expect(page.locator(".filter-pill").nth(1), `${testInfo.project.name}: the existing filter pill remains active`).toHaveClass(/active/);
      await expect(mistakeRows, `${testInfo.project.name}: changing a pill filters by the real knowledge_points field`).toHaveCount(1);
      await expect(mistakeRows.first(), `${testInfo.project.name}: changing a pill preserves the original master-row DOM`).toHaveAttribute("data-stage4c-master-identity", "preserved");
      await expect(page.locator(".mistake-state-card"), `${testInfo.project.name}: changing a pill does not synthesize a filtered empty state`).toHaveCount(0);
      await expect(selectedMistake, `${testInfo.project.name}: an invalid selected mistake resets to the first matching real record`).toHaveAttribute("data-motion-item-key", /mistake_stage6_1/);
      await settleStageFourALocalItem(selectedMistake);
      await expectDirectStageFourALocalItem(selectedMistake, `${testInfo.project.name}: changing a pill settles the reset detail without replay`);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: MistakeBook master-detail`);

      await page.locator(".header-bar .icon-button").click();
      await expect(page.locator(".book-course-screen"), `${testInfo.project.name}: existing MistakeBook back path returns to the course`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".course-action-grid .quick-action").nth(3).click();
      await expect(page.locator(".notes-screen"), `${testInfo.project.name}: existing Notes route opens from the course`).toBeVisible();
      await settleCurrentScreenTransition(page);

      const notesRoot = page.locator(".notes-screen");
      const notesList = page.locator(".notes-list");
      const noteRows = page.locator(".notes-list button");
      await expect(noteRows, `${testInfo.project.name}: Notes keeps its existing chunk and asset records`).toHaveCount(2);
      await expect(notesRoot, `${testInfo.project.name}: Notes page root never owns local detail motion`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(notesList, `${testInfo.project.name}: Notes master list remains static`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(notesList.locator("[data-motion-item]"), `${testInfo.project.name}: note rows never replay individually`).toHaveCount(0);
      await noteRows.first().evaluate((element) => element.setAttribute("data-stage4c-master-identity", "preserved"));

      await noteRows.nth(1).click();
      const selectedNote = page.locator(".notes-detail-panel");
      await expect(selectedNote, `${testInfo.project.name}: old note detail is replaced immediately`).toHaveCount(1);
      await expect(selectedNote).toHaveAttribute("data-motion-item-key", /asset:asset_stage3/);
      await expect(noteRows.first(), `${testInfo.project.name}: selecting another note preserves the first master-row DOM identity`).toHaveAttribute("data-stage4c-master-identity", "preserved");
      await expectPausedStageFourALocalItem(selectedNote, page, `${testInfo.project.name}: selected note detail`);
      await expectStageFourCTabletMasterDetail(page, notesList, selectedNote, `${testInfo.project.name}: Notes`);
      await settleStageFourALocalItem(selectedNote);
      await waitForStageFourCLocalIdle(selectedNote, `${testInfo.project.name}: settled selected note detail`);
      await noteRows.nth(1).click();
      await expectDirectStageFourALocalItem(selectedNote, `${testInfo.project.name}: selecting the already active note does not replay`);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: Notes master-detail`);
  });

  test("keeps Notes to existing records and preserves the existing Lesson note ActionSheet focus flow", async ({ page, bookCourseApi }, testInfo) => {
    await openStageFourCNotes(page, bookCourseApi);
    const notesList = page.locator(".notes-list");
    await expect(notesList.locator("button"), `${testInfo.project.name}: Notes exposes only its existing real items`).toHaveCount(2);
    await expect(page.locator(".notes-list [data-motion-item]"), `${testInfo.project.name}: Notes list has no edit/save/delete motion controls`).toHaveCount(0);

    await openStageFourCLesson(page, bookCourseApi);

    const noteTrigger = page.locator(".concept-card-grid button").first();
    await noteTrigger.click();
    const noteSheet = page.locator(".sheet[data-sheet-type='note']");
    await expect(noteSheet, `${testInfo.project.name}: existing Lesson note ActionSheet remains reachable`).toBeVisible();
    await expect(noteSheet.locator(".sheet-close"), `${testInfo.project.name}: existing Note ActionSheet keeps its initial focus behavior`).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(noteSheet, `${testInfo.project.name}: Escape closes the unchanged Note ActionSheet`).toHaveCount(0);
    await expect(noteTrigger, `${testInfo.project.name}: closing the Note ActionSheet restores its existing trigger focus`).toBeFocused();
  });

  test("uses direct final MistakeBook and Notes states under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?embedded=device-preview");
    await page.locator(".primary-nav .nav-item").nth(3).click();
    await expect(page.locator(".profile-screen")).toBeVisible();
    await page.locator(".profile-settings-list .settings-row").nth(2).click();
    const emptyNotes = page.locator(".notes-screen .parse-empty-card");
    await expect(emptyNotes, `${testInfo.project.name}: existing no-course Notes state remains available`).toBeVisible();
    await expectDirectStageFourALocalItem(emptyNotes, `${testInfo.project.name}: reduced no-course Notes state`);

    await openStageFourCMistakes(page, bookCourseApi, { mistakeSet: "detail_pair" });
    const firstMistake = page.locator(".mistake-detail-card");
    await expectDirectStageFourALocalItem(firstMistake, `${testInfo.project.name}: reduced initial mistake detail`);
    await page.locator(".mistake-list-item").nth(1).click();
    const secondMistake = page.locator(".mistake-detail-card");
    await expect(secondMistake).toHaveAttribute("data-motion-item-key", /mistake_stage6_2/);
    await expectDirectStageFourALocalItem(secondMistake, `${testInfo.project.name}: reduced selected mistake detail`);
    await page.locator(".filter-pill").nth(1).click();
    await expect(page.locator(".filter-pill").nth(1), `${testInfo.project.name}: reduced MistakeBook filter remains active`).toHaveClass(/active/);
    await expect(page.locator(".mistake-list-item"), `${testInfo.project.name}: reduced MistakeBook filter uses real knowledge_points`).toHaveCount(1);
    await expect(secondMistake, `${testInfo.project.name}: reduced filter resets an invalid selected mistake`).toHaveAttribute("data-motion-item-key", /mistake_stage6_1/);
    await expectDirectStageFourALocalItem(secondMistake, `${testInfo.project.name}: reduced MistakeBook filter settles the reset detail directly`);

    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".course-action-grid .quick-action").nth(3).click();
    await expect(page.locator(".notes-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expect(page.locator(".notes-list button"), `${testInfo.project.name}: reduced Notes waits for its existing real records`).toHaveCount(2);
    const firstNote = page.locator(".notes-detail-panel");
    await expectDirectStageFourALocalItem(firstNote, `${testInfo.project.name}: reduced initial Notes detail`);
    await page.locator(".notes-list button").nth(1).click();
    const secondNote = page.locator(".notes-detail-panel");
    await expect(secondNote).toHaveAttribute("data-motion-item-key", /asset:asset_stage3/);
    await expectDirectStageFourALocalItem(secondNote, `${testInfo.project.name}: reduced selected Notes detail`);
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: reduced MistakeBook and Notes`);
  });

  test("reuses actual Community cover images through success and a rebuilt DOM without geometry shift", async ({ page }, testInfo) => {
    await openStageFourCCommunity(page);
    const cards = page.locator(".community-grid .community-book-card");
    const tileCovers = page.locator(".community-grid .community-cover-image");
    await expect(cards, `${testInfo.project.name}: Community keeps its existing shared-book cards`).toHaveCount(10);
    await expect(tileCovers, `${testInfo.project.name}: Community keeps its existing real cover images`).toHaveCount(10);
    for (let index = 0; index < 10; index += 1) {
      await expectStageFourCImageIdle(tileCovers.nth(index), `${testInfo.project.name}: initial Community cover ${index + 1}`);
    }
    const initialTileBounds = await readStageFourCBox(tileCovers.first());
    const pause = await pauseStageFourCLocalMotion(page);

    try {
      await cards.first().click();
      await expect(page.locator(".community-detail-screen"), `${testInfo.project.name}: selected Community card opens its existing detail`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const detailCover = page.locator(".community-detail-cover");
      await expectPausedStageThreeImage(detailCover, page, `${testInfo.project.name}: cached Community detail cover`);
      const detailBeforeSettle = await readStageFourCBox(detailCover);
      await settleStageThreeFeedback(detailCover, "motion-stage3-image-in");
      await expectStageFourCImageIdle(detailCover, `${testInfo.project.name}: settled Community detail cover`);
      expectStageFourCStableBox(detailBeforeSettle, await readStageFourCBox(detailCover), `${testInfo.project.name}: Community detail cover`);

      await page.locator(".community-detail-actions .button").last().click();
      await expect(page.locator(".community-screen"), `${testInfo.project.name}: existing Community return action rebuilds the grid`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const rebuiltTile = page.locator(".community-grid .community-cover-image").first();
      await expectPausedStageThreeImage(rebuiltTile, page, `${testInfo.project.name}: cached Community tile cover on rebuilt DOM`);
      const rebuiltBeforeSettle = await readStageFourCBox(rebuiltTile);
      await settleStageThreeFeedback(rebuiltTile, "motion-stage3-image-in");
      await expectStageFourCImageIdle(rebuiltTile, `${testInfo.project.name}: settled rebuilt Community tile cover`);
      expectStageFourCStableBox(rebuiltBeforeSettle, await readStageFourCBox(rebuiltTile), `${testInfo.project.name}: rebuilt Community tile cover`);
      expect(rebuiltBeforeSettle.width, `${testInfo.project.name}: rebuilt Community tile retains its original width`).toBeCloseTo(initialTileBounds.width, 3);
      expect(rebuiltBeforeSettle.height, `${testInfo.project.name}: rebuilt Community tile retains its original height`).toBeCloseTo(initialTileBounds.height, 3);
      await expect(page.locator(".community-grid [data-motion-item]"), `${testInfo.project.name}: Community grid itself never receives local-content motion`).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: Community cover success and rebuild`);
    } finally {
      await removeStyleTag(pause);
    }
  });

  test("keeps a failed actual Community cover in its stable fallback with no residual animation", async ({ page, bookCourseApi }, testInfo) => {
    await page.route("**/assets/textbook/biology-cover-thumb.webp", async (route) => {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Community cover unavailable." });
    });
    await openStageFourCCommunity(page);
    const failedCard = page.locator(".community-grid .community-book-card").first();
    const fallback = failedCard.locator(".community-book-cover-fallback");
    await expect(fallback, `${testInfo.project.name}: failed actual cover resolves to its existing fallback`).toBeVisible();
    await expect(fallback).toHaveAttribute("data-motion-image-state", "failed");
    await expect(fallback).toHaveAttribute("data-motion-image-source", /biology-cover-thumb\.webp$/);
    await expect(failedCard.locator(".community-cover-image"), `${testInfo.project.name}: failed cover removes only the image element`).toHaveCount(0);
    await expect.poll(() => bookCourseApi.consoleErrors).toEqual([failedResource404ConsoleError]);
    assertAndAcknowledgeExactConsoleErrors(bookCourseApi, [failedResource404ConsoleError], `${testInfo.project.name}: only the explicitly failed Community cover logs an error`);
    const successfulSibling = page.locator(".community-grid .community-book-card").nth(1).locator(".community-cover-image");
    await expectStageFourCImageIdle(successfulSibling, `${testInfo.project.name}: unaffected sibling Community cover`);
    const [fallbackBounds, successfulBounds] = await Promise.all([
      readStageFourCBox(fallback),
      readStageFourCBox(successfulSibling)
    ]);
    expect(fallbackBounds.width, `${testInfo.project.name}: failed Community cover keeps positive width`).toBeGreaterThan(0);
    expect(fallbackBounds.height, `${testInfo.project.name}: failed Community cover keeps positive height`).toBeGreaterThan(0);
    expect(fallbackBounds.width, `${testInfo.project.name}: failed fallback retains the tile cover width within CSS-grid rounding`).toBeCloseTo(successfulBounds.width, 1);
    expect(fallbackBounds.height, `${testInfo.project.name}: failed fallback retains the tile cover height within CSS-grid rounding`).toBeCloseTo(successfulBounds.height, 1);
    expect((await readLocalFeedbackMotion(fallback)).animationName, `${testInfo.project.name}: failed Community fallback has no image animation residue`).toBe("none");
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: failed Community cover fallback`);
  });

  test("renders the remaining Stage 4C local surfaces and Community covers directly under reduced motion", async ({ page, bookCourseApi }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStageFourCNotes(page, bookCourseApi);
    await page.locator(".notes-actions .button").nth(1).click();
    await expect(page.locator(".export-preview-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expectDirectStageFourALocalItem(page.locator(".export-intro-card"), `${testInfo.project.name}: reduced Export introduction`);

    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".notes-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".course-action-grid .quick-action").nth(1).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".lesson-bottom-actions .button").nth(1).click();
    await expect(page.locator(".report-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expectDirectStageFourALocalItem(page.locator(".report-card"), `${testInfo.project.name}: reduced Report summary`);

    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".primary-nav .nav-item").nth(3).click();
    await expect(page.locator(".profile-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    const profileCard = page.locator(".profile-card");
    await expect(profileCard, `${testInfo.project.name}: reduced Profile receives its existing loaded key`).toHaveAttribute("data-motion-item-key", /profile:book_stage3:loaded/);
    await expectDirectStageFourALocalItem(profileCard, `${testInfo.project.name}: reduced Profile summary`);

    await page.locator(".primary-nav .nav-item").nth(1).click();
    await expect(page.locator(".community-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expect(page.locator(".community-search-panel"), `${testInfo.project.name}: reduced Community search remains visible`).toBeVisible();
    await expect(page.locator(".community-screen"), `${testInfo.project.name}: reduced Community root remains free of local-content motion`).not.toHaveAttribute("data-motion-item", /.+/);
    const firstCommunityCover = page.locator(".community-grid .community-cover-image").first();
    await expectStageFourCImageIdle(firstCommunityCover, `${testInfo.project.name}: reduced Community tile cover`);
    await page.locator(".community-book-card").first().click();
    await expect(page.locator(".community-detail-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expectDirectStageFourALocalItem(page.locator(".community-detail-card"), `${testInfo.project.name}: reduced Community detail`);
    await expectStageFourCImageIdle(page.locator(".community-detail-cover"), `${testInfo.project.name}: reduced Community detail cover`);
    await page.locator(".community-detail-actions .button").first().click();
    await expect(page.locator(".community-import-screen")).toBeVisible();
    await settleCurrentScreenTransition(page);
    await expectDirectStageFourALocalItem(page.locator(".community-import-success"), `${testInfo.project.name}: reduced Community import success`);
    await expectNoHorizontalOverflow(page, `${testInfo.project.name}: reduced remaining Stage 4C surfaces`);
  });

  test("keeps Report, Profile, Community, Import, and Export reachability scoped to one local surface", async ({ page, bookCourseApi }, testInfo) => {
    await openStageFourCNotes(page, bookCourseApi);
    const pause = await pauseStageFourCLocalMotion(page);

    try {
      await page.locator(".notes-actions .button").nth(1).click();
      await expect(page.locator(".export-preview-screen"), `${testInfo.project.name}: existing Notes export action remains reachable`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const exportIntro = page.locator(".export-intro-card");
      await expectPausedStageFourCGenericLocalItem(exportIntro, page, `${testInfo.project.name}: Export introduction`);
      await expect(page.locator(".export-preview-screen"), `${testInfo.project.name}: Export page root stays static`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".export-module-list [data-motion-item]"), `${testInfo.project.name}: Export module list stays static`).toHaveCount(0);
      await settleStageFourALocalItem(exportIntro);
      await waitForStageFourCLocalIdle(exportIntro, `${testInfo.project.name}: settled Export introduction`);
      await page.locator(".export-actions .button").click();
      await expect(page.locator(".toast"), `${testInfo.project.name}: existing Export confirmation remains a Toast`).toBeVisible();
      await expectDirectStageFourALocalItem(exportIntro, `${testInfo.project.name}: Export toast does not replay the introduction`);

      await page.locator(".header-bar .icon-button").click();
      await expect(page.locator(".notes-screen"), `${testInfo.project.name}: Export back path returns to Notes`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".header-bar .icon-button").click();
      await expect(page.locator(".book-course-screen"), `${testInfo.project.name}: Notes back path returns to the course`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".course-action-grid .quick-action").nth(1).click();
      await expect(page.locator(".lesson-screen"), `${testInfo.project.name}: existing lesson action remains reachable for report`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".lesson-bottom-actions .button").nth(1).click();
      await expect(page.locator(".report-screen"), `${testInfo.project.name}: existing completion action opens the report`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const reportCard = page.locator(".report-card");
      await expectPausedStageFourCGenericLocalItem(reportCard, page, `${testInfo.project.name}: Report summary`);
      await expect(page.locator(".report-screen"), `${testInfo.project.name}: Report page root stays static`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".report-screen .metric-grid [data-motion-item]"), `${testInfo.project.name}: Report metrics stay static`).toHaveCount(0);
      await settleStageFourALocalItem(reportCard);
      await waitForStageFourCLocalIdle(reportCard, `${testInfo.project.name}: settled Report summary`);
      await page.locator(".report-screen .inline-link").click();
      await expect(page.locator(".notes-screen"), `${testInfo.project.name}: existing Report detail link keeps its Notes destination`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".header-bar .icon-button").click();
      await expect(page.locator(".report-screen"), `${testInfo.project.name}: Notes back path restores the report`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".header-bar .icon-button").click();
      await expect(page.locator(".lesson-screen"), `${testInfo.project.name}: Report back path restores the lesson`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await page.locator(".header-bar .icon-button").click();
      await expect(page.locator(".book-course-screen"), `${testInfo.project.name}: lesson back path restores the course`).toBeVisible();
      await settleCurrentScreenTransition(page);

      await page.locator(".primary-nav .nav-item").nth(3).click();
      await expect(page.locator(".profile-screen"), `${testInfo.project.name}: existing Profile primary navigation remains reachable`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const profileCard = page.locator(".profile-card");
      await expect(profileCard, `${testInfo.project.name}: Profile loads its existing learning-state summary`).toHaveAttribute("data-motion-item-key", /profile:book_stage3:loaded/);
      await expectPausedStageFourCGenericLocalItem(profileCard, page, `${testInfo.project.name}: Profile learning-state summary`);
      await expect(page.locator(".profile-screen"), `${testInfo.project.name}: Profile page root stays static`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".profile-screen .metric-grid [data-motion-item], .profile-settings-list [data-motion-item]"), `${testInfo.project.name}: Profile metrics and settings stay static`).toHaveCount(0);
      await settleStageFourALocalItem(profileCard);
      await waitForStageFourCLocalIdle(profileCard, `${testInfo.project.name}: settled Profile learning-state summary`);
      await page.locator(".profile-settings-list .settings-row").last().click();
      await expect(page.locator(".toast"), `${testInfo.project.name}: existing Profile preference feedback remains a Toast`).toBeVisible();
      await expectDirectStageFourALocalItem(profileCard, `${testInfo.project.name}: Profile toast does not replay the loaded summary`);

      await page.locator(".primary-nav .nav-item").nth(1).click();
      await expect(page.locator(".community-screen"), `${testInfo.project.name}: existing Community primary navigation remains reachable`).toBeVisible();
      await settleCurrentScreenTransition(page);
      await expect(page.locator(".community-search-panel"), `${testInfo.project.name}: Community search replaces the removed hero`).toBeVisible();
      await expect(page.locator(".community-screen"), `${testInfo.project.name}: Community page root stays static`).not.toHaveAttribute("data-motion-item", /.+/);
      await expect(page.locator(".community-grid [data-motion-item]"), `${testInfo.project.name}: Community grid and book cards stay static`).toHaveCount(0);
      await page.locator(".community-book-card").first().click();
      await expect(page.locator(".community-detail-screen"), `${testInfo.project.name}: existing Community book route remains reachable`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const communityDetail = page.locator(".community-detail-card");
      await expectPausedStageFourCGenericLocalItem(communityDetail, page, `${testInfo.project.name}: Community book detail`);
      await expect(page.locator(".community-detail-workspace .chapter-list [data-motion-item], .community-detail-workspace .capability-grid [data-motion-item]"), `${testInfo.project.name}: Community chapters and metrics stay static`).toHaveCount(0);
      await settleStageFourALocalItem(communityDetail);
      await waitForStageFourCLocalIdle(communityDetail, `${testInfo.project.name}: settled Community book detail`);
      await page.locator(".community-detail-actions .button").first().click();
      await expect(page.locator(".community-import-screen"), `${testInfo.project.name}: existing Community import path remains reachable`).toBeVisible();
      await settleCurrentScreenTransition(page);
      const importSuccess = page.locator(".community-import-success");
      await expectPausedStageFourCGenericLocalItem(importSuccess, page, `${testInfo.project.name}: Community import success`);
      await expect(page.locator(".community-import-workspace .import-progress-card [data-motion-item], .community-import-workspace .capability-grid [data-motion-item]"), `${testInfo.project.name}: Community import progress and metrics stay static`).toHaveCount(0);
      await settleStageFourALocalItem(importSuccess);
      await waitForStageFourCLocalIdle(importSuccess, `${testInfo.project.name}: settled Community import success`);
      await expectNoHorizontalOverflow(page, `${testInfo.project.name}: remaining Stage 4C local surfaces`);
    } finally {
      await removeStyleTag(pause);
    }
  });
});

const stageFiveLifecycleAttributes = [
  "data-motion-state",
  "data-motion-stage-state",
  "data-motion-item-state",
  "data-motion-image-state",
  "data-motion-course-card-state",
  "data-motion-course-ready-state",
  "data-motion-chapter-state",
  "data-motion-chapter-selection",
  "data-motion-chapter-save",
  "data-motion-chapter-feedback",
  "data-motion-plan-date-state",
  "data-motion-plan-task-state",
  "data-motion-assignment-answer-state",
  "data-motion-assignment-submit",
  "data-motion-diagnosis-state",
  "data-motion-diagnosis-progress-state",
  "data-motion-flash-state",
  "data-motion-flash-next-state"
] as const;

type StageFiveMotionState = {
  attribute: string;
  className: string;
  state: string;
  tagName: string;
};

async function readStageFiveActiveMotionStates(page: Page): Promise<StageFiveMotionState[]> {
  return page.evaluate((attributes) => attributes.flatMap((attribute) => (
    Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`))
      .map((element) => ({
        attribute,
        className: element.className,
        state: element.getAttribute(attribute) ?? "",
        tagName: element.tagName.toLowerCase()
      }))
      .filter((entry) => entry.state !== "idle")
  )), [...stageFiveLifecycleAttributes]);
}

async function finishStageFiveVisibleMotion(page: Page) {
  await page.evaluate((attributes) => {
    const selector = attributes.map((attribute) => `[${attribute}]`).join(",");
    for (const lifecycleRoot of document.querySelectorAll<HTMLElement>(selector)) {
      if (!attributes.some((attribute) => {
        const state = lifecycleRoot.getAttribute(attribute);
        return state !== null && state !== "idle";
      })) continue;

      const animationNodes = [
        lifecycleRoot,
        ...lifecycleRoot.querySelectorAll<HTMLElement>("*")
      ];
      for (const node of animationNodes) {
        const names = new Set([
          ...Array.from(node.getAnimations()).map((animation) => animation.animationName),
          ...getComputedStyle(node).animationName.split(",").map((name) => name.trim())
        ]);
        for (const name of names) {
          if (!name || name === "none") continue;
          node.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
        }
      }
    }
  }, [...stageFiveLifecycleAttributes]);
}

async function expectStageFiveSettled(page: Page, label: string) {
  await finishStageFiveVisibleMotion(page);
  await expect.poll(() => readStageFiveActiveMotionStates(page), {
    message: `${label}: every visible lifecycle and feedback surface settles to idle or exits`
  }).toEqual([]);

  const root = page.locator("main.screen-content > .motion-screen-transition");
  await expect(root, `${label}: there is one current screen transition root`).toHaveCount(1);
  await expect(root, `${label}: the current screen root is idle`).toHaveAttribute("data-motion-state", "idle");
  await expect(page.locator(".sheet-overlay, .ai-overlay-layer"), `${label}: no modal overlay remains over navigation or content`).toHaveCount(0);
  await expectNoHorizontalOverflow(page, label);

  const settledResidue = await page.evaluate(() => {
    const selectors = [
      ".motion-screen-transition",
      ".primary-nav",
      ".primary-nav .nav-item",
      ".ai-orb",
      ".sheet",
      ".ai-overlay",
      ".toast",
      "[data-motion-item-state]",
      "[data-motion-image-state]",
      "[data-motion-stage-state]"
    ];
    return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
      .map((element) => ({
        className: element.className,
        willChange: getComputedStyle(element).willChange
      }))
      .filter((entry) => entry.willChange !== "auto" && entry.willChange !== "");
  });
  expect(settledResidue, `${label}: settled surfaces retain no permanent compositor hint`).toEqual([]);

  const navigationHitTarget = await page.evaluate(() => {
    const activeNavigation = document.querySelector<HTMLElement>(".primary-nav .nav-item.active");
    if (!activeNavigation) return true;
    const bounds = activeNavigation.getBoundingClientRect();
    const top = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return Boolean(top && (top === activeNavigation || activeNavigation.contains(top)));
  });
  expect(navigationHitTarget, `${label}: the settled navigation hit target is not obscured`).toBe(true);
}

type StageFiveCssAudit = {
  keyframeProperties: Array<{ name: string; properties: string[]; source: string }>;
  transitionAll: string[];
  willChange: string[];
};

async function auditStageFiveCssPerformance(page: Page): Promise<StageFiveCssAudit> {
  return page.evaluate(() => {
    const audit: StageFiveCssAudit = {
      keyframeProperties: [],
      transitionAll: [],
      willChange: []
    };
    const scanRules = (rules: CSSRuleList, source: string) => {
      Array.from(rules).forEach((rule, index) => {
        const location = `${source}:${index}`;
        if (rule.type === CSSRule.KEYFRAMES_RULE) {
          const keyframes = rule as CSSKeyframesRule;
          const properties = new Set<string>();
          for (const frame of Array.from(keyframes.cssRules)) {
            for (let propertyIndex = 0; propertyIndex < frame.style.length; propertyIndex += 1) {
              properties.add(frame.style.item(propertyIndex));
            }
          }
          audit.keyframeProperties.push({
            name: keyframes.name,
            properties: [...properties].sort(),
            source: location
          });
        }
        if (rule.type === CSSRule.STYLE_RULE) {
          const style = (rule as CSSStyleRule).style;
          const transitionProperty = style.getPropertyValue("transition-property");
          const transitionShorthand = style.getPropertyValue("transition");
          if (/(^|,)\s*all\s*(,|$)/.test(transitionProperty) || /(^|\s)all(\s|,|$)/.test(transitionShorthand)) {
            audit.transitionAll.push(location);
          }
          const willChange = style.getPropertyValue("will-change").trim();
          if (willChange && willChange !== "auto") audit.willChange.push(`${location}:${willChange}`);
        }
        const nestedRules = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
        if (nestedRules) scanRules(nestedRules, location);
      });
    };

    Array.from(document.styleSheets).forEach((styleSheet, index) => {
      try {
        scanRules(styleSheet.cssRules, styleSheet.href ?? `inline-${index}`);
      } catch {
        // All app sheets are local in this suite. Keep the audit safe if a
        // browser injects an unreadable user-agent or extension stylesheet.
      }
    });
    return audit;
  });
}

type StageFiveNotesSnapshot = {
  detailKey: string | null;
  detailText: string;
  requests: Array<{ method: string; path: string }>;
  screen: string | null;
};

async function runStageFiveNotesKeyboardScenario(
  page: Page,
  fixture: BookCourseApiFixture,
  reducedMotion: boolean,
  label: string
): Promise<StageFiveNotesSnapshot> {
  const requestStart = fixture.requests.length;
  await openStageFourCNotes(page, fixture, { mistakeSet: "detail_pair" });
  const note = page.locator(".notes-list button").nth(1);
  await note.focus();
  await expect(note, `${label}: the real second note stays keyboard reachable`).toBeFocused();
  await note.press("Enter");
  const detail = page.locator(".notes-detail-panel");
  await expect(detail, `${label}: keyboard selection keeps the existing note-detail destination`).toHaveAttribute("data-motion-item-key", /asset:asset_stage3/);

  if (reducedMotion) {
    await expect(detail, `${label}: reduced motion renders the selected detail directly`).toHaveAttribute("data-motion-item-state", "idle");
  } else {
    await expect(detail, `${label}: normal motion starts one local detail entry`).toHaveAttribute("data-motion-item-state", "entering");
    await settleStageFourALocalItem(detail);
    await expect(detail, `${label}: normal local detail settles from its real animation event`).toHaveAttribute("data-motion-item-state", "idle");
  }
  await expect(note, `${label}: keyboard focus remains on the selected real control`).toBeFocused();

  return {
    detailKey: await detail.getAttribute("data-motion-item-key"),
    detailText: (await detail.innerText()).replaceAll(/\s+/g, " ").trim(),
    requests: fixture.requests.slice(requestStart).map(({ method, path }) => ({ method, path })),
    screen: await page.locator(".motion-screen-transition").getAttribute("data-screen")
  };
}

async function advanceStageFiveProcessingToRead(
  page: Page,
  fixture: StageThreeB1Fixture,
  jobId: string,
  minimumReads: number,
  label: string
) {
  // A fetch response schedules the following poll after its promise chain
  // commits. Under parallel WebKit workers that registration can occur just
  // after a clock advance, so advance deterministic fake time in bounded
  // steps and flush only microtasks rather than relying on real-time waits.
  for (let attempt = 0; attempt < 4 && stageThreeB1JobReadCount(fixture, jobId) < minimumReads; attempt += 1) {
    await page.clock.fastForward(2600);
    await page.evaluate(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  await expect.poll(() => stageThreeB1JobReadCount(fixture, jobId), {
    message: `${label}: reaches the requested deterministic processing poll count`
  }).toBeGreaterThanOrEqual(minimumReads);
}

test.describe("Stage 5 stress, performance, and final acceptance", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no unacknowledged console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("settles rapid navigation, all ActionSheet variants, Toast replacement, and the AI Orb", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    bookCourseApi.useStageSixFlow();
    await page.goto("/?embedded=device-preview");
    await settleCurrentScreenTransition(page);
    await expectNavPresentation(page, project.initialViewport, `${project.name}: Stage 5 initial navigation`);

    await page.locator(".primary-nav .nav-item").nth(1).click();
    await page.locator(".primary-nav .nav-item").nth(3).click();
    await expect(page.locator(".profile-screen"), `${project.name}: rapid primary navigation reaches Profile`).toBeVisible();
    await page.locator(".nav-upload").click();
    await expect(page.locator(".upload-flow-screen"), `${project.name}: rapid replace reaches Upload`).toBeVisible();
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".profile-screen"), `${project.name}: real back navigation restores Profile`).toBeVisible();
    await settleCurrentScreenTransition(page);

    await openPreparedLessonForMotion(page, bookCourseApi);
    await settleCurrentScreenTransition(page);
    const chatTrigger = page.locator(".lesson-action-grid .button").first();
    await chatTrigger.click();
    const chat = page.locator(".sheet[data-sheet-type='chat']");
    await expect(chat, `${project.name}: Chat ActionSheet opens from the real lesson action`).toBeVisible();
    await finishActionSheetAnimation(page);
    await chat.locator("input").fill("Stage 5 asks a real fixture-backed question.");
    await chat.locator(".button").click();
    const sourceTrigger = chat.locator("[data-sheet-replacement='source']");
    await expect(sourceTrigger, `${project.name}: Chat returns a source replacement control`).toBeVisible();
    await sourceTrigger.click();
    const source = page.locator(".sheet[data-sheet-type='source']");
    await expect(source, `${project.name}: Source replaces Chat as one current sheet`).toBeVisible();
    await finishActionSheetAnimation(page);
    await expect(source, `${project.name}: Source entry settles before keyboard dismissal`).toHaveAttribute("data-motion-state", "idle");
    const sourceClose = source.locator(".sheet-close");
    await expect(sourceClose, `${project.name}: Source completes its real entry autofocus`).toBeFocused();
    await sourceClose.focus();
    await expect(sourceClose, `${project.name}: Source close control remains keyboard focused`).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(source, `${project.name}: keyboard Escape starts the current Source exit`).toHaveAttribute("data-motion-state", "closing");
    await finishActionSheetAnimation(page);
    await expect(page.locator(".sheet"), `${project.name}: keyboard Escape closes the source sheet`).toHaveCount(0);
    await expect(chatTrigger, `${project.name}: Chat close restores its original trigger focus`).toBeFocused();

    const noteTrigger = page.locator(".concept-card-grid button").first();
    await noteTrigger.click();
    const note = page.locator(".sheet[data-sheet-type='note']");
    await expect(note, `${project.name}: Note ActionSheet opens from the real concept`).toBeVisible();
    await finishActionSheetAnimation(page);
    await expect(note, `${project.name}: Note entry settles before focus-trap checks`).toHaveAttribute("data-motion-state", "idle");
    const firstNoteFocusable = note.locator(".sheet-close");
    const lastNoteFocusable = note.locator(".sheet-body .button");
    await expect(firstNoteFocusable, `${project.name}: Note completes its real entry autofocus`).toBeFocused();
    await lastNoteFocusable.focus();
    await expect(lastNoteFocusable, `${project.name}: Note Save remains keyboard focused before forward Tab`).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(firstNoteFocusable, `${project.name}: Note keeps its forward focus trap`).toBeFocused();
    await firstNoteFocusable.focus();
    await expect(firstNoteFocusable, `${project.name}: Note close remains keyboard focused before reverse Tab`).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(lastNoteFocusable, `${project.name}: Note keeps its reverse focus trap`).toBeFocused();
    await firstNoteFocusable.focus();
    await expect(firstNoteFocusable, `${project.name}: Note close receives keyboard dismissal focus`).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(note, `${project.name}: keyboard Escape starts the current Note exit`).toHaveAttribute("data-motion-state", "closing");
    await finishActionSheetAnimation(page);
    await expect(noteTrigger, `${project.name}: Note close restores the concept trigger focus`).toBeFocused();

    const viewportBeforeChapterSheet = page.viewportSize();
    if (!viewportBeforeChapterSheet) throw new Error("Stage 5 needs a configured viewport before opening the chapter sheet.");
    await page.setViewportSize({ width: 402, height: 681 });
    try {
      const editorTrigger = await openPreparedChapterEditorForMotion(page, bookCourseApi);
      await editorTrigger.click();
      const editor = page.locator(".sheet[data-sheet-type='editChapter']");
      await expect(editor, `${project.name}: phone presentation reaches the fourth real ActionSheet type`).toBeVisible();
      await finishActionSheetAnimation(page);
      await editor.locator(".sheet-close").click();
      await finishActionSheetAnimation(page);
      await expect(editor, `${project.name}: EditChapter exits as one unmounted sheet`).toHaveCount(0);
    } finally {
      await page.setViewportSize(viewportBeforeChapterSheet);
    }

    bookCourseApi.useStageSixFlow();
    await page.goto("/?embedded=device-preview");
    await settleCurrentScreenTransition(page);
    await page.locator(".primary-nav .nav-item").nth(3).click();
    await expect(page.locator(".profile-screen"), `${project.name}: Profile remains reachable for the Toast flow`).toBeVisible();
    await settleCurrentScreenTransition(page);
    const reminder = page.locator(".settings-row").filter({ hasText: "学习提醒" });
    const preferences = page.locator(".settings-row").filter({ hasText: "偏好设置" });
    await reminder.focus();
    await page.keyboard.press("Enter");
    const firstToast = await readToastMotion(page);
    await preferences.focus();
    await page.keyboard.press("Enter");
    const replacementToast = await readToastMotion(page);
    expect(replacementToast.presence, `${project.name}: Toast A→B creates a newer Presence generation`).toBeGreaterThan(firstToast.presence);
    if (replacementToast.state === "entering") await settleToastAnimation(page, "motion-toast-in");

    const orb = page.locator(".ai-orb");
    await orb.click();
    const aiDialog = page.locator(".ai-overlay");
    await expect(aiDialog, `${project.name}: the global AI Orb opens its dialog`).toBeVisible();
    await finishAiDialogAnimation(page);
    await expect(aiDialog, `${project.name}: AI entry has settled before keyboard dismissal`).toHaveAttribute("data-motion-state", "idle");
    await aiDialog.locator("input").focus();
    await page.keyboard.press("Escape");
    await expect(aiDialog, `${project.name}: Escape begins the current AI exit`).toHaveAttribute("data-motion-state", "closing");
    await finishAiDialogAnimation(page);
    await expect(page.locator(".ai-overlay"), `${project.name}: Escape exits the AI dialog`).toHaveCount(0);
    await expect(orb, `${project.name}: AI dialog restores focus to the Orb`).toBeFocused();
    await expectStageFiveSettled(page, `${project.name}: navigation, sheets, Toast, and AI stress flow`);
  });

  test("keeps retry, same-status polling, completion, and study surfaces independently settled", async ({ page, bookCourseApi }, testInfo) => {
    const fixture = bookCourseApi as StageThreeB1Fixture & BookCourseApiFixture;
    await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:00.000Z"));
    await openStageThreeB1Upload(page, fixture);

    let uploadInitAttempts = 0;
    await page.route("**/api/uploads/init", async (route) => {
      uploadInitAttempts += 1;
      if (uploadInitAttempts === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ code: "stage5_retry", message: "Stage 5 local retry fixture failed once." })
        });
        return;
      }
      await route.fallback();
    });

    await uploadStageThreeB1File(page, "stage-five-retry.pdf");
    await expect(page.locator(".upload-error"), `${testInfo.project.name}: the real upload error is exposed before retry`).toBeVisible();
    await expect.poll(() => fixture.consoleErrors).toEqual([failedResource500ConsoleError]);
    assertAndAcknowledgeExactConsoleErrors(fixture, [failedResource500ConsoleError], `${testInfo.project.name}: explicit retry failure`);
    await uploadStageThreeB1File(page, "stage-five-retry-success.pdf");
    await expect(page.locator(".parse-ready-screen"), `${testInfo.project.name}: retry preserves the successful upload flow`).toBeVisible();
    await settleCurrentScreenTransition(page);
    await openStageThreeB1Library(page);
    await page.clock.fastForward(2500);
    await expect(page.locator(".library-status-success-mark"), `${testInfo.project.name}: real polling completion reaches the Library`).toBeVisible();

    fixture.useProcessingMotionFlow({ progressSequence: [0, 1, 50, 50] });
    await page.addInitScript(() => {
      window.localStorage.removeItem("bookcourse-active-parse-session");
    });
    await installStageThreeB1CoverRoute(page);
    await page.goto("/?embedded=device-preview");
    await startProcessingMotionJob(page, "stage-five-same-status.pdf");
    await expect.poll(() => stageThreeB1JobReadCount(fixture, "job_processing_motion_a")).toBe(1);
    await activateStageThreeB1Control(page.locator(".processing-flow-actions .button"));
    await expect(page.locator(".home-screen"), `${testInfo.project.name}: processing return reaches Home`).toBeVisible();
    await settleCurrentScreenTransition(page);
    await activateStageThreeB1Control(page.locator(".home-screen .section .inline-link"));
    await expect(page.locator(".library-screen"), `${testInfo.project.name}: real Home link reaches Library`).toBeVisible();
    await settleCurrentScreenTransition(page);
    const libraryFeedback = page.locator(".library-status-feedback");
    const originalLibraryFeedback = await libraryFeedback.elementHandle();
    if (!originalLibraryFeedback) throw new Error("Stage 5 same-status flow has no Library feedback root.");
    await advanceStageFiveProcessingToRead(page, fixture, "job_processing_motion_a", 2, `${testInfo.project.name}: first same-status update`);
    await advanceStageFiveProcessingToRead(page, fixture, "job_processing_motion_a", 3, `${testInfo.project.name}: changed-progress update`);
    await advanceStageFiveProcessingToRead(page, fixture, "job_processing_motion_a", 4, `${testInfo.project.name}: repeated same-status update`);
    expect(await originalLibraryFeedback.evaluate((node) => node.isConnected && node === document.querySelector(".library-status-feedback")), `${testInfo.project.name}: same-status polling retains its local feedback root`).toBe(true);

    await openStageFourBFlashcards(page, fixture);
    const answer = page.locator(".memory-card-answer-motion");
    const reveal = page.locator(".memory-reveal");
    await reveal.click();
    await expect(answer, `${testInfo.project.name}: rapid Flashcard flip starts locally`).toHaveAttribute("data-motion-flash-state", "flipping");
    await reveal.dispatchEvent("click");
    await settleStageFourBFlashcardFlip(page, answer, "back");
    await page.locator(".flashcard-actions .button").last().click();
    const nextCard = expectedStageFourBFlashcardNext(page);
    await expect(answer, `${testInfo.project.name}: next Flashcard starts one replacement entry`).toHaveAttribute("data-motion-flash-next-state", "entering");
    await settleStageFourBAnimation(answer, nextCard.name);

    await openStageFourBPlan(page, fixture);
    const days = page.locator(".study-plan-calendar .plan-date-row button");
    await days.nth(2).click();
    await settleStageFourBAnimation(page.locator(".plan-date-selection-check"), "motion-plan-date-check-in");
    await days.first().click();
    await settleStageFourBAnimation(page.locator(".plan-date-selection-check"), "motion-plan-date-check-in");
    const task = page.locator(".study-plan-tasks .timeline-item").first();
    await task.click();
    await expect(task, `${testInfo.project.name}: real plan completion remains in the existing task`).toHaveClass(/done/);
    await settleStageFourBAnimation(task.locator(".timeline-task-completion"), "motion-stage-check-in");

    await openStageFourBAssignment(page, fixture);
    const textarea = page.locator(".assignment-card textarea");
    await textarea.fill("Stage 5 preserves the actual assignment submission path.");
    await settleStageFourBAnimation(page.locator(".assignment-answer-check"), "motion-stage-check-in");
    await page.locator(".assignment-primary-action .button").click();
    await expect(page.locator(".diagnosis-screen"), `${testInfo.project.name}: assignment still reaches Diagnosis`).toBeVisible();
    await settleCurrentScreenTransition(page);
    await settleStageFourBAnimation(page.locator(".diagnosis-knowledge-progress-fill"), "motion-diagnosis-progress-in");
    await expect(page.locator(".diagnosis-card"), `${testInfo.project.name}: diagnosis feedback settles at its real result`).toHaveAttribute("data-motion-diagnosis-state", "idle");

    await openStageFourCMistakes(page, fixture, { mistakeSet: "detail_pair" });
    await page.locator(".mistake-list-item").nth(1).click();
    await settleStageFourALocalItem(page.locator(".mistake-detail-card"));
    await page.locator(".header-bar .icon-button").click();
    await expect(page.locator(".book-course-screen"), `${testInfo.project.name}: MistakeBook back path reaches the course`).toBeVisible();
    await settleCurrentScreenTransition(page);
    await page.locator(".course-action-grid .quick-action").nth(3).click();
    await expect(page.locator(".notes-screen"), `${testInfo.project.name}: Notes remains reachable from the real course`).toBeVisible();
    await settleCurrentScreenTransition(page);
    const note = page.locator(".notes-list button").nth(1);
    await note.focus();
    await note.press("Enter");
    await settleStageFourALocalItem(page.locator(".notes-detail-panel"));
    await expectStageFiveSettled(page, `${testInfo.project.name}: upload and study lifecycle stress flow`);
  });

  test("keeps viewport proxy, contrast audit, keyboard flow, and reduced-motion feature equivalence", async ({ page, bookCourseApi }, testInfo) => {
    const project = getResponsiveProject(testInfo.project.name);
    await installVisualViewportShim(page);
    const originalViewport = page.viewportSize();
    if (!originalViewport) throw new Error("Stage 5 needs a configured viewport for the visualViewport proxy.");
    await page.setViewportSize(project.initialViewport);
    try {
      await openPreparedLessonForMotion(page, bookCourseApi);
      const noteTrigger = page.locator(".concept-card-grid button").first();
      await noteTrigger.click();
      await expect(page.locator(".sheet"), `${project.name}: visualViewport proxy opens a real Sheet`).toBeVisible();
      await finishActionSheetAnimation(page);
      const initialVisualHeight = getShimmedVisualViewportHeight(project.initialViewport);
      await setVisualViewport(page, { height: initialVisualHeight, offsetTop: 0 });
      await expectVisualViewportHeight(page, initialVisualHeight, `${project.name}: initial visualViewport proxy`);
      await expectElementInsideVisualViewport(page, ".sheet", `${project.name}: initial Sheet proxy geometry`);

      const shortLandscape: CssViewport = { width: 756, height: 352 };
      await page.setViewportSize(shortLandscape);
      await setVisualViewport(page, { height: getShimmedVisualViewportHeight(shortLandscape), offsetTop: 0 });
      await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
      await expectElementInsideVisualViewport(page, ".sheet", `${project.name}: short-landscape Sheet proxy geometry`);
      await page.keyboard.press("Escape");
      await finishActionSheetAnimation(page);
    } finally {
      await page.setViewportSize(originalViewport);
    }

    await page.emulateMedia({ contrast: "more", reducedMotion: "no-preference" });
    await expect.poll(() => page.evaluate(() => window.matchMedia("(prefers-contrast: more)").matches), {
      message: `${project.name}: contrast preference is observable for the static readability audit`
    }).toBe(true);
    await page.goto("/?embedded=device-preview");
    await settleCurrentScreenTransition(page);
    const contrastNav = page.locator(".primary-nav .nav-item").first();
    await expect(contrastNav, `${project.name}: existing navigation remains readable and keyboard reachable under contrast preference`).toBeVisible();
    await contrastNav.focus();
    await expect(contrastNav).toBeFocused();

    await page.emulateMedia({ contrast: "no-preference", reducedMotion: "no-preference" });
    const normal = await runStageFiveNotesKeyboardScenario(page, bookCourseApi, false, `${project.name}: normal notes scenario`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await runStageFiveNotesKeyboardScenario(page, bookCourseApi, true, `${project.name}: reduced notes scenario`);
    expect(reduced, `${project.name}: normal and reduced preserve the same real navigation, DOM content, and API path`).toEqual(normal);

    await openPreparedLessonForMotion(page, bookCourseApi);
    const reducedNoteTrigger = page.locator(".concept-card-grid button").first();
    await reducedNoteTrigger.click();
    const reducedSheet = page.locator(".sheet");
    await expect(reducedSheet, `${project.name}: reduced mode keeps the same Note interaction available`).toHaveAttribute("data-motion-state", "idle");
    expect(await reducedSheet.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty
      };
    }), `${project.name}: reduced Sheet is direct with no event wait`).toEqual({
      animationName: "none",
      transitionDuration: "0s",
      transitionProperty: "none"
    });
    await reducedSheet.locator(".sheet-close").focus();
    await page.keyboard.press("Escape");
    await expect(reducedSheet, `${project.name}: reduced Sheet closes synchronously`).toHaveCount(0);
    await expect(reducedNoteTrigger, `${project.name}: reduced Sheet restores the same trigger focus`).toBeFocused();
    await expectStageFiveSettled(page, `${project.name}: viewport, contrast, and reduced-motion final state`);
  });

  test("audits CSS keyframes, transition scope, and settled compositor residue", async ({ page, bookCourseApi }, testInfo) => {
    await page.goto("/?embedded=device-preview");
    await settleCurrentScreenTransition(page);
    const audit = await auditStageFiveCssPerformance(page);
    const allowedPathKeyframeProperties = new Set(["motion-course-ready-check-path", "motion-checkbox-check-in"]);
    const unsupportedKeyframeProperties = audit.keyframeProperties.filter((entry) => (
      entry.properties.some((property) => (
        property !== "opacity"
        && property !== "transform"
        && !(property === "stroke-dashoffset" && allowedPathKeyframeProperties.has(entry.name))
      ))
    ));
    expect(unsupportedKeyframeProperties, `${testInfo.project.name}: every app keyframe is limited to approved compositor-safe properties`).toEqual([]);
    expect(audit.transitionAll, `${testInfo.project.name}: no stylesheet rule uses global transition: all`).toEqual([]);
    expect(audit.willChange, `${testInfo.project.name}: no stylesheet keeps a permanent will-change hint`).toEqual([]);

    await openPreparedLessonForMotion(page, bookCourseApi);
    const chatTrigger = page.locator(".lesson-action-grid .button").first();
    await chatTrigger.click();
    await finishActionSheetAnimation(page);
    await expect(page.locator(".sheet"), `${testInfo.project.name}: the audited Sheet settles before computed-style inspection`).toHaveAttribute("data-motion-state", "idle");
    const surfaceAudit = await page.locator(".sheet").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        transitionProperty: style.transitionProperty,
        willChange: style.willChange
      };
    });
    expect(surfaceAudit, `${testInfo.project.name}: a settled integrated surface leaves no animation or compositor residue`).toEqual({
      animationName: "none",
      transitionProperty: "all",
      willChange: "auto"
    });
    await page.keyboard.press("Escape");
    await finishActionSheetAnimation(page);
    await expectStageFiveSettled(page, `${testInfo.project.name}: CSS performance audit final state`);
  });
});
