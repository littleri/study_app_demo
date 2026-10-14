import { expect, test } from "playwright/test";
import { emptyCourseState } from "../src/features/courses/model";

test.use({ locale: "zh-CN", reducedMotion: "reduce" });

test("reuses upload controls and saves materials to the current course", async ({ page }) => {
  const initial = emptyCourseState();
  initial.preferences = { displayName: "小明", primaryGoal: "exam", dailyTime: "under30", completedAt: 1 };
  initial.courses = [{
    id: "materials-course", name: "期末生物复习", resourceIds: ["source:book_biology_2"],
    activeResourceId: "source:book_biology_2", diagnosis: {}, createdAt: 1, updatedAt: 2
  }];
  initial.activeCourseId = "materials-course";
  await page.addInitScript((state) => {
    if (!localStorage.getItem("bookcourse.courses.v2")) localStorage.setItem("bookcourse.courses.v2", JSON.stringify(state));
  }, initial);
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "学习", exact: true }).click();
  await expect(page.locator(".study-book-switch strong")).toHaveText("期末生物复习");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!));
  const chapter = await page.locator('.study-section-toggle[aria-expanded="true"]').getAttribute("aria-controls");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "添加课程资料", exact: true });
  await expect(sheet.getByRole("heading", { name: "添加课程资料", exact: true })).toBeVisible();
  await expect(sheet.getByText("已有资料", { exact: true })).toHaveCount(0);
  await expect(sheet.locator(".learning-resource-option")).toHaveCount(0);
  await expect(sheet.getByText("点击添加示例资料，保存到当前课程后继续学习。", { exact: true })).toHaveCount(0);
  await expect(sheet.locator(".course-upload-files")).toHaveCount(0);
  const save = sheet.getByRole("button", { name: "保存资料并继续", exact: true });
  await expect(save).toBeDisabled();
  await sheet.screenshot({ path: test.info().outputPath("add-materials.png") });
  await sheet.getByRole("button", { name: "选择课程资料", exact: true }).click();
  const tray = sheet.getByRole("group", { name: /已选择.*份学习资料/ });
  await expect(tray.getByRole("img", { name: "资料 1", exact: true })).toBeVisible();
  await expect(tray.locator(".upload-file-number")).toHaveText(["1"]);
  await expect(sheet.getByText("示例课程资料.txt", { exact: true })).toHaveCount(0);
  await expect(save).toBeEnabled();
  await tray.getByRole("button", { name: "继续添加资料", exact: true }).click();
  await expect(tray.locator(".upload-file-number")).toHaveText(["1", "2"]);
  const trayBox = await tray.boundingBox();
  expect(Math.abs(trayBox!.width - trayBox!.height)).toBeLessThanOrEqual(1);
  await expect(tray.locator(".upload-file-number").first()).toHaveCSS("font-size", "10px");
  await sheet.screenshot({ path: test.info().outputPath("add-materials-selected.png") });
  await tray.getByRole("button", { name: "移除资料 1", exact: true }).click();
  await expect(tray.locator(".upload-file-number")).toHaveText(["1"]);
  await tray.getByRole("button", { name: "移除资料 1", exact: true }).click();
  await expect(save).toBeDisabled();
  await sheet.getByRole("button", { name: "选择课程资料", exact: true }).click();
  await tray.getByRole("button", { name: "继续添加资料", exact: true }).click();
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await save.click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('main[data-screen="study"]')).toBeVisible();
  expect(await page.locator('.study-section-toggle[aria-expanded="true"]').getAttribute("aria-controls")).toBe(chapter);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!));
  expect(saved.courses).toHaveLength(before.courses.length);
  expect(saved.activeCourseId).toBe("materials-course");
  expect(saved.courses[0].activeResourceId).toBe("source:book_biology_2");
  expect(saved.courses[0].resourceIds).toHaveLength(3);
  expect(saved.resources).toHaveLength(2);
  expect(saved.resources[0]).toMatchObject({ name: "示例课程资料.txt", status: "ready" });
  expect(saved.draft).toBeNull();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!).resources.length)).toBe(2);
  await page.getByRole("button", { name: "学习", exact: true }).click();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "保存资料并继续", exact: true })).toBeDisabled();
  await sheet.getByRole("button", { name: "选择课程资料", exact: true }).click();
  await sheet.getByRole("button", { name: "保存资料并继续", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2")!).resources.length)).toBe(2);
});
