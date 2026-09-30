import { expect, test, type Locator, type Page } from "playwright/test";

test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

async function openLessonSource(page: Page) {
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "继续学习", exact: true }).click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
  await page.locator(".lesson-source-link").first().click();
  const reader = page.locator(".source-reader-screen");
  await expect(reader).toBeVisible();
  await expect(reader.locator(".source-annotation-page > img")).toBeVisible();
  return reader;
}

/** Drags the pen/mouse across the fitted page, leaving a dashed rectangle behind. */
async function circleRegion(page: Page, reader: Locator, onDragging?: () => Promise<void>) {
  const box = await reader.locator(".source-annotation-page").boundingBox();
  if (!box) throw new Error("The textbook page has no measurable box to circle");
  const start = { x: box.x + box.width * .16, y: box.y + box.height * .22 };
  const end = { x: box.x + box.width * .74, y: box.y + box.height * .52 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 6 });
  await onDragging?.();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

test("leads the note band with a purple star and sends the circled page image as the AI reference", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 834, height: 1194 });
  const reader = await openLessonSource(page);

  const star = reader.getByRole("button", { name: "圈选问 AI" });
  await expect(reader.locator(".source-reader-topbar > .source-reader-ai-entry:first-child")).toHaveCount(1);
  await expect(star).toBeVisible();
  await expect(star).toHaveCSS("color", "rgb(124, 58, 237)");
  await expect(star).toHaveAttribute("aria-pressed", "false");

  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(star).toHaveCSS("background-color", "rgb(124, 58, 237)");
  await expect(reader.locator(".source-region-hint")).toContainText("用笔圈出区域");
  // The floating zoom pill would only collide with the voice entry while the
  // pen is circling; pinch still zooms.
  await expect(reader.locator(".source-annotation-zoom")).toBeHidden();

  await circleRegion(page, reader, async () => {
    await expect(reader.locator(".source-region-selection[data-region-state='drawing']")).toBeVisible();
  });

  const panel = reader.getByRole("dialog", { name: "提问" });
  await expect(panel).toBeVisible();
  await expect(panel.locator(".source-region-ai-reference img"))
    .toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  // The panel carries its visible title only: no region label, no caption line.
  await expect(panel.locator(".source-region-ai-head strong")).toHaveText("提问");
  await expect(panel.locator(".source-region-ai-head small")).toHaveCount(0);
  await expect(panel.locator("figcaption")).toHaveCount(0);
  await expect(reader.locator(".source-region-selection[data-region-state='committed']")).toHaveCount(1);
  // Circling selects a reference; it must never land in the handwriting note.
  await expect(reader.getByRole("button", { name: "撤销" })).toBeDisabled();

  await panel.getByLabel("针对圈选区域提问").fill("这一处讲了什么？");
  await panel.getByRole("button", { name: "提问", exact: true }).click();
  await expect(panel.locator(".chat-bubble.user")).toHaveText("这一处讲了什么？");
  await expect(panel.locator(".chat-bubble.ai:not([aria-busy])")).toBeVisible({ timeout: 90_000 });

  await panel.getByRole("button", { name: "关闭提问" }).click();
  await expect(panel).toHaveCount(0);
  await expect(reader).toHaveAttribute("data-note-mode", "read");
  await expect(reader.locator(".source-region-selection")).toHaveCount(0);
});

test("keeps a stray tap and a finger swipe out of the region flow", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const reader = await openLessonSource(page);
  await reader.getByRole("button", { name: "圈选问 AI" }).click();

  const box = await reader.locator(".source-annotation-page").boundingBox();
  if (!box) throw new Error("The textbook page has no measurable box");
  // A tap is smaller than the minimum reference a model should receive.
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .512, box.y + box.height * .506, { steps: 2 });
  await page.mouse.up();
  await expect(reader.getByRole("dialog", { name: "提问" })).toHaveCount(0);

  // A finger still turns the page instead of drawing a reference.
  await reader.locator(".source-page-frame").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const y = bounds.top + bounds.height * .5;
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 41, pointerType: "touch", clientX: bounds.right - 36, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", clientX: bounds.left + 36, clientY: y }));
  });
  await expect(page.locator(".header-title p")).toHaveText("第 17 页");
  await expect(reader.getByRole("dialog", { name: "提问" })).toHaveCount(0);
  await expect(reader.locator(".source-region-selection")).toHaveCount(0);
});

test.describe("region dialog motion", () => {
  test.use({ reducedMotion: "no-preference" });

  /** Records every presence phase the panel passes through, with its keyframe. */
  async function trackPanelMotion(page: Page) {
    await page.evaluate(() => {
      const samples: Array<[string | undefined, string]> = [];
      (window as unknown as { __regionMotion: typeof samples }).__regionMotion = samples;
      const record = () => {
        const panel = document.querySelector<HTMLElement>(".source-region-ai");
        if (!panel) return;
        samples.push([panel.dataset.motionState, getComputedStyle(panel).animationName]);
      };
      new MutationObserver(record).observe(document.body, {
        attributeFilter: ["data-motion-state"],
        attributes: true,
        childList: true,
        subtree: true
      });
    });
  }

  async function readPanelMotion(page: Page) {
    return page.evaluate(() => (
      window as unknown as { __regionMotion: Array<[string, string]> }
    ).__regionMotion);
  }

  /** Layout box of the popup: the morph keyframe is switched off for the read. */
  async function panelInsets(panel: Locator) {
    return panel.evaluate((element) => {
      const previousAnimation = element.style.animation;
      element.style.animation = "none";
      const box = element.getBoundingClientRect();
      element.style.animation = previousAnimation;
      const workspace = element.closest<HTMLElement>(".source-reader-workspace")?.getBoundingClientRect();
      if (!workspace) throw new Error("The dialog is not inside the reader workspace");
      return {
        bottom: workspace.bottom - box.bottom,
        height: box.height,
        left: box.left - workspace.left,
        right: workspace.right - box.right,
        top: box.top - workspace.top,
        width: box.width,
        workspaceHeight: workspace.height,
        workspaceWidth: workspace.width
      };
    });
  }

  test("grows out of the circled selection and settles as a floating card", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 834, height: 1194 });
    const reader = await openLessonSource(page);
    await trackPanelMotion(page);

    await reader.getByRole("button", { name: "圈选问 AI" }).click();
    await circleRegion(page, reader);
    const panel = reader.getByRole("dialog", { name: "提问" });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-motion-state", "idle");

    // The enter keyframe is a shared-element morph: with the animation idle the
    // box plus the recorded morph variables must land exactly on the selection.
    const morph = await panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const number = (name: string) => Number.parseFloat(style.getPropertyValue(name));
      return {
        startHeight: box.height * number("--region-morph-scale-y"),
        startLeft: box.left + number("--region-morph-x"),
        startTop: box.top + number("--region-morph-y"),
        startWidth: box.width * number("--region-morph-scale-x"),
        transformOrigin: style.transformOrigin
      };
    });
    const selection = await reader.locator(".source-region-selection").boundingBox();
    if (!selection) throw new Error("The committed selection has no measurable box");
    expect(morph.transformOrigin).toBe("0px 0px");
    expect(Math.abs(morph.startLeft - selection.x), "the dialog grows out of the selection").toBeLessThan(2);
    expect(Math.abs(morph.startTop - selection.y), "the dialog grows out of the selection").toBeLessThan(2);
    expect(Math.abs(morph.startWidth - selection.width), "the dialog starts at the selection width").toBeLessThan(2);
    expect(Math.abs(morph.startHeight - selection.height), "the dialog starts at the selection height").toBeLessThan(2);

    const wide = await panelInsets(panel);
    expect(wide.left, "the popup keeps a left margin").toBeGreaterThan(4);
    expect(wide.right, "the popup keeps a right margin").toBeGreaterThan(4);
    expect(wide.top, "the popup keeps a top margin").toBeGreaterThan(4);
    expect(wide.bottom, "the popup keeps a bottom margin").toBeGreaterThan(4);
    expect(wide.width).toBeLessThan(wide.workspaceWidth - 8);
    expect(wide.height).toBeLessThan(wide.workspaceHeight - 8);
    // The popup is sized to the reading area, not to a small toast.
    expect(wide.height, "a wide surface still gets a tall conversation").toBeGreaterThan(wide.workspaceHeight * .5);

    await panel.getByRole("button", { name: "关闭提问" }).click();
    // The exit morph collapses back onto the selection, so the dashes stay until
    // the panel is really gone.
    await expect(panel).toHaveAttribute("data-motion-state", "closing");
    await expect(reader.locator(".source-region-selection")).toHaveCount(1);
    await expect(panel).toHaveCount(0);
    await expect(reader.locator(".source-region-selection")).toHaveCount(0);

    const motion = await readPanelMotion(page);
    expect(motion).toContainEqual(["entering", "motion-region-ai-in"]);
    expect(motion).toContainEqual(["idle", "none"]);
    expect(motion).toContainEqual(["closing", "motion-region-ai-out"]);

    // The same popup shape holds on a phone: the page stays visible around it.
    await page.setViewportSize({ width: 390, height: 844 });
    await reader.getByRole("button", { name: "圈选问 AI" }).click();
    await circleRegion(page, reader);
    await expect(panel).toBeVisible();
    const phone = await panelInsets(panel);
    expect(phone.left, "phone popup keeps a left margin").toBeGreaterThan(4);
    expect(phone.right, "phone popup keeps a right margin").toBeGreaterThan(4);
    expect(phone.bottom, "phone popup keeps a bottom margin").toBeGreaterThan(4);
    expect(phone.top, "phone popup keeps a top margin").toBeGreaterThan(4);
    expect(phone.height).toBeLessThan(phone.workspaceHeight * .9);
    expect(phone.width).toBeLessThan(phone.workspaceWidth - 8);
    // On a narrow surface the popup spans the reading area: this is the size the
    // circled-region review asked for.
    expect(phone.width).toBeGreaterThan(phone.workspaceWidth * .8);
    expect(phone.height).toBeGreaterThan(phone.workspaceHeight * .6);
  });
});
