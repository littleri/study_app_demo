import { expect, test } from "./fixtures";
import { writeFile } from "node:fs/promises";

const viewports = [
  { name: "phone", width: 402, height: 874 },
  { name: "Android tablet portrait", width: 753, height: 1165 },
  { name: "Android tablet landscape", width: 1165, height: 753 },
  { name: "short landscape", width: 874, height: 402 },
  { name: "reduced motion tablet", width: 753, height: 1165, reducedMotion: true }
];

for (const viewport of viewports) {
  test(`keeps the study directory stationary within the document during ${viewport.name} scrolling`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    if ("reducedMotion" in viewport) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?embedded=device-preview");
    await page.locator(".nav-study").click();
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
    const plan = page.locator(".study-plan-summary");
    await expect(plan).toHaveAttribute("data-plan-state", "expanded");

    const samples = await page.locator('.screen-content[data-screen="study"]').evaluate(async (scroller: HTMLElement) => {
      const directory = scroller.querySelector<HTMLElement>(".study-directory")!;
      const plan = scroller.querySelector<HTMLElement>(".study-plan-summary")!;
      const previousBehavior = scroller.style.scrollBehavior;
      scroller.style.scrollBehavior = "auto";
      const samples: { scrollTop: number; scrollHeight: number; directoryDocumentTop: number; planHeight: number; state: string | null }[] = [];
      const sample = () => samples.push({
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        directoryDocumentTop: directory.getBoundingClientRect().top + scroller.scrollTop,
        planHeight: plan.getBoundingClientRect().height,
        state: plan.getAttribute("data-plan-state")
      });
      for (const top of [0, 24, 48, 72, 96, 128, 160, 192, 224, 192, 160, 128, 96, 48, 24, 0]) {
        scroller.scrollTop = top;
        for (let frame = 0; frame < 3; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          sample();
        }
      }
      for (let frame = 0; frame < 20; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        sample();
      }
      scroller.style.scrollBehavior = previousBehavior;
      return samples;
    });
    const range = (values: number[]) => Math.max(...values) - Math.min(...values);
    const directoryShift = range(samples.map((sample) => sample.directoryDocumentTop));
    const scrollHeightChange = range(samples.map((sample) => sample.scrollHeight));
    const geometryPath = testInfo.outputPath("study-scroll-geometry.json");
    await writeFile(geometryPath, JSON.stringify({ viewport, directoryShift, scrollHeightChange, samples }, null, 2));
    await testInfo.attach("study-scroll-geometry", { path: geometryPath, contentType: "application/json" });
    expect(samples.some((sample) => sample.state === "compact")).toBe(true);
    expect(samples.at(-1)?.state).toBe("expanded");
    expect(directoryShift, "header compaction must not move directory content independently of the user's scroll").toBeLessThanOrEqual(1);
    expect(scrollHeightChange, "scroll bounds must stay stable throughout header compaction").toBeLessThanOrEqual(1);
  });
}

test("keeps chapters clickable through the reserved space after resizing a compact plan", async ({ page }) => {
  await page.setViewportSize({ width: 753, height: 1165 });
  await page.goto("/?embedded=device-preview");
  await page.locator(".nav-study").click();
  await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
  const scroller = page.locator('.screen-content[data-screen="study"]');
  const plan = page.locator(".study-plan-summary");
  await scroller.evaluate((element) => {
    element.style.scrollBehavior = "auto";
    element.scrollTop = 180;
  });
  await expect(plan).toHaveAttribute("data-plan-state", "compact");
  await expect.poll(() => plan.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(28);

  for (const viewport of [{ width: 1165, height: 753 }, { width: 402, height: 874 }]) {
    await page.setViewportSize(viewport);
    await expect(plan).toHaveAttribute("data-plan-state", "compact");
    await expect.poll(() => page.locator(".study-sticky-stack").evaluate((element) => element.clientHeight)).toBeGreaterThan(200);
  }

  const toggle = page.locator(".study-chapter-toggle").first();
  const initiallyExpanded = await toggle.getAttribute("aria-expanded") === "true";
  const point = await toggle.evaluate((element) => {
    const scroller = element.closest<HTMLElement>(".screen-content")!;
    const stack = scroller.querySelector<HTMLElement>(".study-sticky-stack")!;
    const plan = scroller.querySelector<HTMLElement>(".study-plan-summary")!;
    const targetY = (plan.getBoundingClientRect().bottom + stack.getBoundingClientRect().bottom) / 2;
    const rect = element.getBoundingClientRect();
    scroller.scrollTop += rect.top + rect.height / 2 - targetY;
    return { x: rect.left + rect.width / 2, y: targetY };
  });
  await expect.poll(() => toggle.evaluate((element, point) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return hit === element || (hit !== null && element.contains(hit));
  }, point)).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(toggle).toHaveAttribute("aria-expanded", String(!initiallyExpanded));
});
