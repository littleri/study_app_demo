import { expect, test } from "playwright/test";

test.describe("lesson AI chat entry", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", timezoneId: "Asia/Hong_Kong" });

  test("switches mascot states, docks across edges, and opens the shared course-aware AI dialog", async ({ page }) => {
    test.slow();
    let directDeepSeekRequests = 0;
    let unexpectedRemoteModelRequests = 0;
    let publishedCitationPageRequests = 0;
    await page.route("https://api.deepseek.com/chat/completions", async (route) => {
      directDeepSeekRequests += 1;
      await route.abort("blockedbyclient");
    });
    for (const remotePattern of ["**://huggingface.co/**", "**://cdn.jsdelivr.net/**"]) {
      await page.route(remotePattern, async (route) => {
        unexpectedRemoteModelRequests += 1;
        await route.abort("blockedbyclient");
      });
    }
    await page.route("**/assets/textbook/pages/**", async (route) => {
      publishedCitationPageRequests += 1;
      await route.continue();
    });
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
    await expect(dialog.locator(".ai-current-book-body > p")).toHaveCount(0);
    await expect(dialog.locator(".ai-suggest-list button").first()).not.toContainText("长时间学习如何避免疲惫");

    const compactContext = dialog.locator(".ai-current-book");
    const compactContextBody = dialog.locator(".ai-current-book-body");
    const headerCapsule = dialog.locator(".ai-overlay-head > div");
    await expect(dialog.locator(".ai-topic-row")).toHaveCount(0);
    await expect(compactContext).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(compactContext).toHaveCSS("border-top-width", "0px");
    await expect(compactContextBody).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(compactContextBody).toHaveCSS("border-top-width", "0px");
    await expect(headerCapsule).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const compactContextBounds = await compactContext.boundingBox();
    expect(compactContextBounds).not.toBeNull();
    expect(compactContextBounds?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(132);

    const question = dialog.getByRole("textbox", { name: "向 AI 助手提问" });
    // A concept cameo must not revive the removed fixture evidence-card.
    await question.fill("请说明抗生素使用过程，顺便写上受精作用");
    await dialog.getByRole("button", { name: "发送", exact: true }).click();
    await expect(dialog).toContainText("没有找到足够可靠", { timeout: 60_000 });
    await expect(dialog.locator(".ai-message-citations")).toHaveCount(0);
    await expect(dialog.locator(".ai-message.ai").last()).toContainText("当前教材未检索到可靠原文");
    await expect(dialog.locator(".ai-message.ai").last().getByRole("button", { name: /查看.*教材原文/ }))
      .toHaveCount(0);

    // This textbook query has a calibrated full-corpus lexical/hybrid hit.
    // The source action uses the hash-registered page bundled with the demo.
    await question.fill("噬菌体侵染细菌实验证明了什么？");
    await dialog.getByRole("button", { name: "发送", exact: true }).click();
    const citationList = dialog.locator(".ai-message-citations").last();
    await expect(citationList).toContainText("教材原文依据", { timeout: 60_000 });
    const textbookReply = dialog.locator(".ai-message.ai").last();
    await expect(textbookReply).toContainText(/DNA|噬菌体|遗传/);
    await expect(textbookReply).not.toContainText("这一结果说明了什么");
    const citedPageLabel = await citationList.locator(".ai-message-citation-item > span").first().innerText();
    const citationPageButton = citationList.getByRole("button", { name: /查看教材第.*页/ }).first();
    await expect(citationPageButton).toContainText("查看教材原文");
    await citationPageButton.click();
    const sourceSheet = page.locator(".sheet[data-sheet-type='source']");
    await expect(sourceSheet).toBeVisible();
    await expect(sourceSheet.getByRole("heading", { name: "查看原文", exact: true })).toBeVisible();
    await expect(sourceSheet).toContainText(citedPageLabel);
    await expect(sourceSheet.locator(".source-reference-sheet")).toBeVisible();
    await expect(sourceSheet.locator(".source-page-preview img")).toBeVisible();
    await expect(sourceSheet.locator(".source-page-preview img"))
      .toHaveAttribute("src", /\/assets\/textbook\/pages\/page_\d{3}\.jpeg/);
    await expect(sourceSheet.getByRole("button", { name: "全屏阅读教材", exact: true })).toBeVisible();
    await expect(page.locator(".source-reader-screen")).toHaveCount(0);
    await expect(page.locator(".source-page-text-document")).toHaveCount(0);
    expect(directDeepSeekRequests).toBe(0);
    expect(unexpectedRemoteModelRequests).toBe(0);
    expect(publishedCitationPageRequests).toBeGreaterThan(0);

    await sourceSheet.locator(".sheet-close").click();
    await expect(sourceSheet).toHaveCount(0);
    await expect(page.locator(".lesson-screen")).toBeVisible();
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
