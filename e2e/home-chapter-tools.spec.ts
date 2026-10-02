import { expect, test, type Locator, type Page } from "playwright/test";

test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

async function openToolRail(page: Page) {
  await page.setViewportSize({ width: 637, height: 1138 });
  await page.goto("/?embedded=device-preview");
  const home = page.locator(".home-dashboard");
  const rail = home.locator('.home-book-workspace[data-loaded="true"] .study-tool-grid');
  await expect(rail).toBeVisible();
  await rail.scrollIntoViewIfNeeded();
  await expect.poll(() => rail.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
  return { home, rail };
}

async function dragStart(page: Page, rail: Locator) {
  const box = await rail.locator(".study-tool-card").first().boundingBox();
  if (!box) throw new Error("The tool card has no measurable drag target");
  const x = box.x + box.width * .85;
  const y = box.y + box.height * .45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { x, y };
}

test("follows a mouse drag without snapping under the pointer or opening a tool", async ({ page }) => {
  const { home, rail } = await openToolRail(page);
  const start = await dragStart(page, rail);
  await page.mouse.move(start.x - 145, start.y, { steps: 12 });
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeCloseTo(145, -1);
  await expect(rail).toHaveClass(/is-dragging/);
  await expect(rail).toHaveCSS("scroll-snap-type", "none");
  await expect(rail.locator(".study-tool-card").first()).toHaveCSS("transform", "none");
  await page.mouse.up();
  await expect(rail).not.toHaveClass(/is-dragging|is-settling/);
  await expect(home).toBeVisible();
  const alignment = await rail.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const padding = Number.parseFloat(getComputedStyle(element).scrollPaddingInlineStart);
    const cards = Array.from(element.querySelectorAll<HTMLElement>(".study-tool-card"));
    return Math.min(
      Math.abs(cards[cards.length - 1].getBoundingClientRect().right - bounds.right + padding),
      ...cards.map((card) => Math.abs(card.getBoundingClientRect().left - bounds.left - padding))
    );
  });
  expect(alignment).toBeLessThan(2);
  await page.screenshot({ path: "output/home-chapter-tools-after-drag.png" });
});

test("keeps wheel scrolling and keyboard access native, and a tap still opens the tool", async ({ page }) => {
  const { rail } = await openToolRail(page);
  await rail.hover();
  await page.mouse.wheel(180, 0);
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(80);
  await expect(rail).not.toHaveClass(/is-dragging|is-settling/);
  const notes = rail.locator('[data-tool="notes"]');
  await notes.focus();
  await expect(notes).toBeFocused();
  await expect.poll(() => notes.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const area = element.parentElement!.getBoundingClientRect();
    return { fits: box.left >= area.left && box.right <= area.right + 1, cardLeft: box.left, cardRight: box.right, railLeft: area.left, railRight: area.right, scrollLeft: element.parentElement!.scrollLeft };
  })).toMatchObject({ fits: true });
  await notes.click();
  await expect(page.locator(".notes-screen")).toBeVisible();
});

test("lets a vertical drag on a card scroll the page and clears the rail gesture on release", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 681 });
  await page.goto("/?embedded=device-preview");
  const screen = page.locator('.screen-content[data-screen="home"]');
  const rail = screen.locator('.home-book-workspace[data-loaded="true"] .study-tool-grid');
  await rail.scrollIntoViewIfNeeded();
  const originalTop = await screen.evaluate((element) => element.scrollTop);
  const start = await dragStart(page, rail);
  await page.mouse.move(start.x, start.y + 100, { steps: 10 });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mouse-dragging", "true");
  await expect.poll(() => screen.evaluate((element) => element.scrollTop)).toBeLessThan(originalTop - 60);
  await expect(rail).not.toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-mouse-dragging", "false");
  await rail.scrollIntoViewIfNeeded();
  const card = await rail.locator(".study-tool-card").first().boundingBox();
  if (!card) throw new Error("The card is no longer visible after the vertical gesture");
  await page.mouse.move(card.x + card.width * .7, card.y + card.height * .4);
  await page.mouse.move(card.x + card.width * .2, card.y + card.height * .4, { steps: 8 });
  await expect(rail).not.toHaveClass(/is-dragging/);
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect(screen).toBeVisible();
});

test("cleans up an interrupted drag and respects reduced motion when settling", async ({ page }) => {
  const { home, rail } = await openToolRail(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let start = await dragStart(page, rail);
  await page.mouse.move(start.x - 135, start.y, { steps: 10 });
  await expect(rail).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(rail).not.toHaveClass(/is-dragging|is-settling/);
  await expect(home).toBeVisible();
  await rail.evaluate((element) => element.scrollTo({ left: 0, behavior: "instant" }));
  start = await dragStart(page, rail);
  await page.mouse.move(start.x - 80, start.y, { steps: 8 });
  await expect(rail).toHaveClass(/is-dragging/);
  await rail.evaluate((element) => element.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" })));
  await page.mouse.up();
  await expect(rail).not.toHaveClass(/is-dragging|is-settling/);
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(rail).toHaveCSS("display", "flex");
  await rail.locator('[data-tool="assignment"]').click();
  await expect(page.locator(".assignment-screen")).toBeVisible();
});
