import { expect, test } from "./fixtures";

test.describe("global mouse drag scrolling", () => {
  test("drags a whole screen from an interactive surface without firing its click", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-17-pro", "The gesture is covered once at the phone viewport.");
    await page.setViewportSize({ width: 402, height: 681 });
    await page.goto("/?embedded=device-preview");

    const shell = page.locator(".app-shell");
    const scroller = page.locator('.screen-content[data-screen="home"]');
    const libraryAction = page.locator(".home-book-picker-heading button");
    await expect(libraryAction).toBeVisible();
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(120);

    const actionBox = await libraryAction.boundingBox();
    expect(actionBox).not.toBeNull();
    const startX = actionBox!.x + actionBox!.width / 2;
    const startY = actionBox!.y + actionBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 140, { steps: 8 });

    await expect(shell).toHaveAttribute("data-mouse-dragging", "true");
    await expect.poll(() => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(100);

    await page.mouse.up();
    await expect(shell).toHaveAttribute("data-mouse-dragging", "false");
    await expect(scroller).toBeVisible();
    await expect(page.locator('.screen-content[data-screen="library"]')).toHaveCount(0);

    await scroller.evaluate((element) => { element.scrollTop = 0; });
    await libraryAction.click();
    await expect(page.locator('.screen-content[data-screen="library"]')).toBeVisible();
  });

  test("automatically drags horizontal overflow that has no bespoke gesture", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-17-pro", "The gesture is covered once at the phone viewport.");
    await page.setViewportSize({ width: 402, height: 681 });
    await page.goto("/?embedded=device-preview");

    const toolGrid = page.locator(".home-book-workspace .study-tool-grid");
    await expect(toolGrid).toBeVisible();
    await toolGrid.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect.poll(() => toolGrid.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(40);

    const gridBox = await toolGrid.boundingBox();
    expect(gridBox).not.toBeNull();
    const startX = gridBox!.x + gridBox!.width - 30;
    const startY = gridBox!.y + Math.min(40, gridBox!.height / 3);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 90, startY, { steps: 8 });
    await expect(page.locator(".app-shell")).toHaveAttribute("data-mouse-dragging", "true");
    await expect.poll(() => toolGrid.evaluate((element) => Math.round(element.scrollLeft))).toBeGreaterThan(40);
    await page.mouse.up();

    await expect(page.locator('.screen-content[data-screen="home"]')).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-mouse-dragging", "false");
  });
});
