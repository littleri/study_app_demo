import { expect, test } from "playwright/test";

test.describe("iPad sidebar motion", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("ipad-pro-11"), "Sidebar motion is specific to tablet layout");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?embedded=device-preview");
    await expect(page.locator(".home-dashboard")).toBeVisible();
  });

  test("coordinates a 450ms expansion, preserves navigation, and reverses from the painted position", async ({ page }) => {
    const shell = page.locator(".app-shell");
    const toggle = page.locator(".nav-expand-toggle");
    const rail = page.locator(".nav-rail-surface");
    const collapsed = (await rail.boundingBox())!.width;
    await toggle.click();
    await expect(shell).toHaveAttribute("data-sidebar-motion", "expanding");
    const motion = await page.evaluate(() => {
      const main = document.querySelector(".screen-content")!.firstElementChild!;
      const animations = document.querySelector(".primary-nav")!.getAnimations({ subtree: true });
      return {
        contentDuration: main.getAnimations()[0]?.effect?.getTiming().duration,
        durations: animations.map((animation) => animation.effect?.getTiming().duration),
        properties: animations.flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame)))
      };
    });
    expect(motion.contentDuration).toBe(450);
    expect(motion.durations).toContain(450);
    expect(motion.durations).toContain(180);
    expect(motion.properties).not.toContain("width");
    expect(motion.properties).not.toContain("paddingLeft");
    // Keyboard toggles bypass actionability's animation wait and exercise a real interruption.
    await toggle.focus();
    await page.waitForTimeout(120);
    const beforeReverse = (await rail.boundingBox())!.width;
    expect(beforeReverse).toBeGreaterThan(collapsed + 2);
    await page.keyboard.press("Space");
    await expect(shell).toHaveAttribute("data-sidebar-motion", "collapsing");
    const afterReverse = (await rail.boundingBox())!.width;
    expect(Math.abs(beforeReverse - afterReverse)).toBeLessThan(30);
    for (let index = 0; index < 3; index += 1) {
      await page.waitForTimeout(60);
      await page.keyboard.press("Space");
    }
    await expect(shell).toHaveAttribute("data-nav-expanded", "true");
    await expect(shell).toHaveAttribute("data-sidebar-motion", "idle");
    await expect(rail).toHaveCSS("transform", "none");
    await expect(page.locator(".nav-label").first()).toBeVisible();
    const selection = await page.locator(".primary-nav").evaluate((nav) => {
      const current = nav.querySelector('[aria-current="page"]')!.getBoundingClientRect();
      const highlight = nav.querySelector(".nav-selection")!.getBoundingClientRect();
      return Math.max(Math.abs(current.x - highlight.x), Math.abs(current.y - highlight.y), Math.abs(current.width - highlight.width));
    });
    expect(selection).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "学习", exact: true }).click();
    await expect(page.locator(".nav-study-context")).toBeVisible();
    await page.getByRole("button", { name: "收起侧边栏" }).click();
    await expect(shell).toHaveAttribute("data-sidebar-motion", "idle");
    await expect(page.locator(".nav-study-context")).toBeHidden();
    await expect(rail).toHaveCSS("transform", "none");
    expect((await rail.boundingBox())!.width).toBeCloseTo(collapsed, 0);
  });

  test("settles immediately for reduced motion and clears an active animation on rotation", async ({ page }) => {
    const shell = page.locator(".app-shell");
    await page.getByRole("button", { name: "展开侧边栏" }).click();
    await expect(shell).toHaveAttribute("data-sidebar-motion", "expanding");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(shell).toHaveAttribute("data-sidebar-motion", "idle");
    await page.getByRole("button", { name: "收起侧边栏" }).click();
    await expect(page.locator(".nav-rail-surface")).toHaveCSS("transform", "none");
    await expect(page.locator(".nav-label").first()).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "展开侧边栏" }).click();
    await expect(shell).toHaveAttribute("data-sidebar-motion", "expanding");
    await page.setViewportSize({ width: 402, height: 874 });
    await expect(shell).toHaveAttribute("data-device-layout", "phone");
    await expect(shell).toHaveAttribute("data-sidebar-motion", "idle");
    await expect(page.locator(".nav-expand-toggle")).toBeHidden();
    await expect(page.locator(".primary-nav .nav-item")).toHaveCount(4);
    await expect(page.locator(".screen-content > :first-child")).toHaveCSS("transform", "none");
  });
});
