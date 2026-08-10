import { expect, test } from "playwright/test";

test.describe("lesson AI chat entry", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", timezoneId: "Asia/Hong_Kong" });

  test("switches mascot states, docks across edges, and opens the shared course-aware AI dialog", async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    const globalEntry = page.locator(".ai-orb");
    await expect(globalEntry).toBeVisible();
    await expect(globalEntry).toHaveClass(/ai-orb-mascot/);
    await expect(globalEntry.locator(":scope > img")).toHaveCount(1);
    await expect(globalEntry.locator(":scope > img")).toHaveAttribute(
      "src",
      /cloud-mascot-ai-chat-edge(?:-left)?-ui\.webp/
    );
    await expect(globalEntry.locator(":scope > svg")).toHaveCount(0);
    const globalEntryBounds = await globalEntry.boundingBox();
    expect(globalEntryBounds).not.toBeNull();
    if (!globalEntryBounds) return;
    const globalPointerX = globalEntryBounds.x + globalEntryBounds.width / 2;
    const globalPointerY = globalEntryBounds.y + globalEntryBounds.height / 2;
    await page.mouse.move(globalPointerX, globalPointerY);
    await page.mouse.down();
    await expect(globalEntry).toHaveAttribute("data-interaction", "pressed");
    await expect(globalEntry.locator(":scope > img")).toHaveAttribute(
      "src",
      "/assets/brand/cloud-mascot-ai-chat-edge-pressed-ui.webp"
    );
    await page.mouse.move(globalPointerX, globalPointerY - 48, { steps: 5 });
    await expect(globalEntry).toHaveAttribute("data-interaction", "dragging");
    await expect(globalEntry.locator(":scope > img")).toHaveAttribute(
      "src",
      "/assets/brand/cloud-mascot-ai-chat-airborne-ui.webp"
    );
    await page.mouse.up();
    await expect(globalEntry).toHaveAttribute("data-interaction", "idle");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "继续学习", exact: true }).click();
    await expect(page.locator(".lesson-screen")).toBeVisible();
    await expect(globalEntry).toBeHidden();

    const shell = page.locator(".app-shell");
    const entry = page.locator(".lesson-ai-entry");
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAccessibleName("打开当前章节 AI 助手");
    await expect(entry).toHaveAttribute("data-positioned", "true");
    await expect(entry).toHaveAttribute("data-interaction", "idle");
    await expect(entry.locator("img")).toHaveAttribute(
      "src",
      "/assets/brand/cloud-mascot-ai-chat-edge-ui.webp"
    );

    const initialEntryBounds = await entry.boundingBox();
    const shellBounds = await shell.boundingBox();
    expect(initialEntryBounds).not.toBeNull();
    expect(shellBounds).not.toBeNull();
    if (!initialEntryBounds || !shellBounds) return;
    expect(initialEntryBounds.width).toBeLessThanOrEqual(69);
    expect(initialEntryBounds.width).toBeGreaterThanOrEqual(52);
    expect(Math.abs(
      initialEntryBounds.x + initialEntryBounds.width - (shellBounds.x + shellBounds.width)
    )).toBeLessThanOrEqual(2);

    const pointerX = initialEntryBounds.x + initialEntryBounds.width * 0.52;
    const pointerY = initialEntryBounds.y + initialEntryBounds.height * 0.5;
    await page.mouse.move(pointerX, pointerY);
    await page.mouse.down();
    await expect(entry).toHaveAttribute("data-interaction", "pressed");
    await expect(entry.locator("img")).toHaveAttribute(
      "src",
      "/assets/brand/cloud-mascot-ai-chat-edge-pressed-ui.webp"
    );

    const leftDockX = shellBounds.x + initialEntryBounds.width * 0.5;
    await page.mouse.move(leftDockX, pointerY + 84, { steps: 8 });
    await expect(page.getByRole("button", { name: "正在拖动当前章节 AI 助手入口", exact: true }))
      .toHaveAttribute("data-interaction", "dragging");
    await expect(entry).toHaveAttribute("data-side", "left");
    await expect(entry.locator("img")).toHaveAttribute(
      "src",
      "/assets/brand/cloud-mascot-ai-chat-airborne-ui.webp"
    );
    await page.mouse.up();

    await expect(entry).toHaveAttribute("data-interaction", "idle");
    await expect(entry).toHaveAttribute("data-side", "left");
    await expect(entry.locator("img")).toHaveAttribute(
      "src",
      "/assets/brand/cloud-mascot-ai-chat-edge-left-ui.webp"
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const draggedEntryBounds = await entry.boundingBox();
    expect(draggedEntryBounds).not.toBeNull();
    expect(draggedEntryBounds?.y ?? 0).toBeGreaterThan(initialEntryBounds.y + 40);
    expect(Math.abs((draggedEntryBounds?.x ?? 0) - shellBounds.x)).toBeLessThanOrEqual(4);

    await entry.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/ai-overlay/);
    await expect(dialog.getByRole("heading", { name: "AI 导学助手", exact: true })).toBeVisible();
    await expect(dialog).toContainText("当前课程");
    await expect(dialog).toContainText("当前章节原文回答，并标注教材位置");
    await expect(dialog.locator(".ai-suggest-list button").first()).not.toContainText("长时间学习如何避免疲惫");

    const compactContext = dialog.locator(".ai-current-book");
    const compactContextBody = dialog.locator(".ai-current-book-body");
    const headerCapsule = dialog.locator(".ai-overlay-head > div");
    const topicShortcut = dialog.locator(".ai-topic-row button").first();
    await expect(compactContext).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(compactContext).toHaveCSS("border-top-width", "0px");
    await expect(compactContextBody).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(compactContextBody).toHaveCSS("border-top-width", "0px");
    await expect(headerCapsule).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(topicShortcut).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(topicShortcut).toHaveCSS("border-top-width", "0px");
    const compactContextBounds = await compactContext.boundingBox();
    expect(compactContextBounds).not.toBeNull();
    expect(compactContextBounds?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(132);

    const question = dialog.getByRole("textbox", { name: "向 AI 助手提问" });
    await question.fill("请结合原文举一个受精作用的例子");
    await dialog.getByRole("button", { name: "发送", exact: true }).click();
    await expect(dialog).toContainText("如果体细胞里有一对 1 号同源染色体");
    await expect(dialog.locator(".ai-message.ai small")).toBeVisible();

    await dialog.locator(".ai-close").click();
    await expect(dialog).toHaveCount(0);
    const pager = page.locator(".lesson-knowledge-pager");
    const progress = pager.getByRole("progressbar", { name: "章节学习进度" });
    const pageCount = Number(await progress.getAttribute("aria-valuemax"));
    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
      await pager.focus();
      await page.keyboard.press("ArrowRight");
    }
    const completionAction = page.locator(".lesson-floating-complete");
    await expect(completionAction).toBeVisible();
    await expect(entry).toBeVisible();
    const finalEntryBounds = await entry.boundingBox();
    const completionBounds = await completionAction.boundingBox();
    expect(finalEntryBounds).not.toBeNull();
    expect(completionBounds).not.toBeNull();
    expect(finalEntryBounds?.y ?? Number.POSITIVE_INFINITY)
      .toBeLessThanOrEqual((completionBounds?.y ?? 0) - (finalEntryBounds?.height ?? 0) - 10);
  });
});
