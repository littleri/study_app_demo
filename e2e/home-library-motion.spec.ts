import { expect, test, type Page } from "playwright/test";
import { defaultCourseDiagnosis, emptyCourseState } from "../src/features/courses/model";

test.use({ locale: "zh-CN", reducedMotion: "no-preference" });

async function library(page: Page) {
  const state = emptyCourseState();
  state.preferences = { displayName: "动效测试", primaryGoal: "exam", dailyTime: "under30", completedAt: 1 };
  state.courses = ["甲", "乙", "丙"].map((name, index) => ({
    id: `motion-${index}`, name: `${name}课程`, resourceIds: ["local:retained-file"],
    diagnosis: defaultCourseDiagnosis(), createdAt: index + 1, updatedAt: index + 1
  }));
  state.resources = [{ id: "retained-file", name: "保留的原资料.txt", status: "ready", contentType: "text/plain", sizeBytes: 12, addedAt: 1 }];
  state.activeCourseId = "motion-0";
  await page.addInitScript((state) => {
    if (!localStorage.getItem("bookcourse.courses.v2")) localStorage.setItem("bookcourse.courses.v2", JSON.stringify(state));
  }, state);
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "全部课程", exact: true }).click();
  await expect(page.locator('.motion-screen-transition')).toHaveAttribute("data-motion-state", "idle");
  await expect(page.locator('[data-layout-key="motion-0"]')).toBeVisible();
}

test("reveals the live workspace and interrupts loading safely", async ({ page }) => {
  await page.goto("/e2e/home-book-carousel-harness.html");
  const options = page.getByRole("listbox", { name: "选择课程" }).getByRole("option");
  const shell = page.locator(".home-workspace-transition");
  await expect(page.locator('.home-book-workspace[data-book-id="book-a"]')).toHaveAttribute("data-loaded", "true");
  const beforeHeight = (await shell.boundingBox())!.height;
  await options.first().focus();
  await options.first().press("ArrowRight");
  const workspace = page.locator('.home-book-workspace[data-book-id="book-b"]');
  await expect(workspace).toHaveAttribute("aria-busy", "true");
  await expect(workspace.locator("button")).toHaveCount(0);
  expect((await shell.boundingBox())!.height).toBeGreaterThanOrEqual(beforeHeight - 1);
  await expect(workspace).toHaveAttribute("data-loaded", "true");
  const motion = await shell.evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => ({
    duration: animation.effect!.getTiming().duration,
    properties: (animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame))
  })));
  expect(motion.some((animation) => animation.duration === 200 && animation.properties.includes("opacity"))).toBe(true);
  expect(motion.every((animation) => !animation.properties.includes("filter"))).toBe(true);
  await options.nth(1).press("ArrowRight");
  await expect(page.locator('.home-book-workspace[data-book-id="book-c"]')).toHaveClass(/is-processing/);
  await expect(shell).toHaveAttribute("data-workspace-motion", "transitioning");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(shell).toHaveAttribute("data-workspace-motion", "idle");
  expect(await shell.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  await options.nth(2).press("ArrowLeft");
  await options.nth(1).press("ArrowLeft");
  await expect(page.locator('.home-book-workspace[data-book-id="book-a"]')).toHaveAttribute("data-loaded", "true");
  await expect(shell).toHaveAttribute("data-workspace-motion", "idle");
  await expect(page.getByRole("button", { name: "继续学习", exact: true })).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await options.first().press("ArrowRight");
  await expect(workspace).toHaveAttribute("data-loaded", "true");
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await expect(shell).toHaveAttribute("data-workspace-motion", "idle");
  expect(await shell.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test("expands confirmation, commits deletion immediately, and moves surviving cards smoothly", async ({ page }) => {
  await library(page);
  const first = page.locator('[data-layout-key="motion-0"]');
  const second = page.locator('[data-layout-key="motion-1"]');
  const toggle = first.getByRole("button", { name: "删除课程 甲课程", exact: true });
  const region = first.locator(".course-library-confirm-region");
  await expect(region).toHaveAttribute("inert", "");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(region).toHaveCSS("transition-duration", "0.2s");
  await first.getByRole("button", { name: "取消", exact: true }).click();
  await expect(toggle).toBeFocused();
  await expect(region).toHaveAttribute("inert", "");
  await toggle.press("Space");
  await first.getByRole("button", { name: "确认移除课程", exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!));
  expect(stored.courses.some((course: { id: string }) => course.id === "motion-0")).toBe(false);
  expect(stored.resources).toHaveLength(1);
  await expect(first.locator(".course-library-row-content")).toHaveAttribute("inert", "");
  const exitDuration = await first.locator(".course-library-row-content").evaluate((element) => element.getAnimations()[0]?.effect?.getTiming().duration);
  expect(exitDuration).toBe(150);
  await expect(first).toHaveCount(0);
  const reflow = await second.evaluate((element) => element.getAnimations().map((animation) => ({
    duration: animation.effect!.getTiming().duration,
    properties: (animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame))
  })));
  expect(reflow.some((animation) => animation.duration === 350 && animation.properties.includes("transform")), JSON.stringify(reflow)).toBe(true);
  await expect(second.getByRole("button", { name: "删除课程 乙课程" })).toBeFocused();
  await expect(second).toHaveCSS("transform", "none");
  await page.reload();
  await page.getByRole("button", { name: "全部课程", exact: true }).click();
  await expect(page.locator('[data-layout-key="motion-0"]')).toHaveCount(0);
});

test("cleans up continuous removals and reduced motion", async ({ page }) => {
  await library(page);
  const first = page.locator('[data-layout-key="motion-0"]');
  const second = page.locator('[data-layout-key="motion-1"]');
  await first.getByRole("button", { name: "删除课程 甲课程" }).click();
  await first.getByRole("button", { name: "确认移除课程", exact: true }).click();
  // Keyboard activation can interrupt a sibling's reflow without waiting for stable bounds.
  const toggle = second.getByRole("button", { name: "删除课程 乙课程" });
  await toggle.press("Space");
  await second.getByRole("button", { name: "确认移除课程", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);
  const third = page.locator('[data-layout-key="motion-2"]');
  await expect(third).toHaveCSS("transform", "none");
  await third.getByRole("button", { name: "删除课程 丙课程" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await third.getByRole("button", { name: "确认移除课程", exact: true }).click();
  await expect(third).toHaveCount(0);
  expect(await page.locator(".course-library-list").evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!).resources.length)).toBe(1);
  const remaining = page.locator(".course-library-row");
  while (await remaining.count()) {
    await remaining.first().getByRole("button", { name: /^删除课程/ }).click();
    await remaining.first().getByRole("button", { name: "确认移除课程", exact: true }).click();
  }
  await expect(page.locator(".course-library-empty")).toBeVisible();
  await expect(page.locator(".course-library-heading").getByRole("button", { name: "创建课程", exact: true })).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!).resources.length)).toBe(1);
});
