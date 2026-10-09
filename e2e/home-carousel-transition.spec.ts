import { expect, test } from "playwright/test";

test.use({ locale: "zh-CN", reducedMotion: "no-preference" });

for (const route of ["library", "profile"] as const) {
  test(`keeps the carousel's left edge painted throughout the return from ${route}`, async ({ page }, testInfo) => {
    await page.goto("/?embedded=device-preview");
    const root = page.locator(".motion-screen-transition");
    const options = page.getByRole("listbox", { name: "选择课程" }).getByRole("option");
    await expect(options).toHaveCount(6);
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
    await options.first().press("Home");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
    await options.first().press("ArrowRight");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
    await expect.poll(() => page.locator(".home-book-carousel").evaluate((element) => {
      const selected = element.querySelector<HTMLElement>('[aria-selected="true"]')!;
      return Math.abs(selected.offsetLeft + selected.offsetWidth / 2 - element.scrollLeft - element.clientWidth * .42);
    })).toBeLessThanOrEqual(2);

    if (route === "library") await page.getByRole("button", { name: "全部课程", exact: true }).click();
    else await page.getByRole("button", { name: "我的", exact: true }).click();
    await expect(root).toHaveAttribute("data-screen", route);
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await page.addStyleTag({ content: '.motion-screen-surface { animation-play-state: paused !important; }' });
    if (route === "library") await page.getByRole("button", { name: "返回", exact: true }).press("Enter");
    else await page.getByRole("button", { name: "首页", exact: true }).press("Enter");
    await expect(root).toHaveAttribute("data-motion-state", "transitioning");
    const current = root.locator(':scope > [data-motion-surface="current"]');
    const frames = await current.evaluate((surface) => {
      const wrapper = surface.parentElement!;
      const carousel = surface.querySelector<HTMLElement>(".home-book-carousel")!;
      const main = surface.closest(".screen-content")!;
      const animation = surface.getAnimations()[0];
      return [0, 175, 349].map((time) => {
        animation.currentTime = time;
        const wrapperBounds = wrapper.getBoundingClientRect();
        const railBounds = carousel.getBoundingClientRect();
        const mainBounds = main.getBoundingClientRect();
        const edgeCover = [...carousel.querySelectorAll<HTMLElement>('.home-book-option:not(.is-selected) .home-book-cover')]
          .find((cover) => {
            const bounds = cover.getBoundingClientRect();
            return bounds.left < wrapperBounds.left && bounds.right > Math.max(mainBounds.left, railBounds.left, 0);
          });
        // Wider layouts may leave space before the neighboring book. Probe the
        // selected cover there, while portrait checks the actual overflowing strip.
        const neighbor = edgeCover ?? carousel.querySelector<HTMLElement>('.home-book-option.is-selected .home-book-cover')!;
        const coverBounds = neighbor.getBoundingClientRect();
        const left = Math.max(mainBounds.left, railBounds.left, coverBounds.left, 0);
        const right = Math.min(edgeCover ? wrapperBounds.left : railBounds.right, coverBounds.right);
        const x = (left + right) / 2;
        const y = Math.max(mainBounds.top, railBounds.top, coverBounds.top) + 32;
        return {
          time, overflow: getComputedStyle(wrapper).overflowX,
          edgeTested: Boolean(edgeCover),
          exposedWidth: right - left,
          painted: document.elementsFromPoint(x, y).some((element) => neighbor.contains(element)),
          x, y, railLeft: railBounds.left, clipLeft: wrapperBounds.left
        };
      });
    });
    await page.screenshot({ path: `output/preview-check/carousel-return-${route}-${testInfo.project.name}.png` });
    for (const frame of frames) {
      expect(frame.exposedWidth, JSON.stringify(frames)).toBeGreaterThan(1);
      expect(frame.overflow).toBe("visible");
      expect(frame.painted, JSON.stringify(frames)).toBe(true);
    }
    if (testInfo.project.name === "iphone-17-pro" || testInfo.project.name === "ipad-pro-11") {
      expect(frames.every((frame) => frame.edgeTested), JSON.stringify(frames)).toBe(true);
    }
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expect(root.locator(':scope > [data-motion-surface="previous"]')).toHaveCount(0);
    await expect(current).toHaveCSS("transform", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("button", { name: "首页", exact: true }).click();
    await expect(root).toHaveAttribute("data-motion-state", "idle");
    await expect(current).toHaveCSS("transform", "none");
  });
}
