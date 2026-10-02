import { expect, test, type Page } from "playwright/test";
import { defaultCourseDiagnosis, emptyCourseState, type CourseState } from "../src/features/courses/model";

test.use({ reducedMotion: "reduce" });

const courseKey = "bookcourse.courses.v2";
const dataKeys = ["bookcourse.saved-study-notes.v1", "bookcourse.study-locations.v1", "bookcourse.source-plans.v1", "bookcourse.credits.v1"];

async function seedLearner(page: Page) {
  const state: CourseState = {
    ...emptyCourseState(),
    preferences: { displayName: "小明", primaryGoal: "exam", dailyTime: "under30", completedAt: 1 },
    onboardingDraft: { displayName: "小明", primaryGoal: "exam", dailyTime: "under30", step: 2 },
    courses: [{ id: "retained-course", name: "我的生物复习", resourceIds: ["source:book_biology_2"], activeResourceId: "source:book_biology_2", diagnosis: defaultCourseDiagnosis(), createdAt: 1, updatedAt: 2 }],
    activeCourseId: "retained-course",
    draft: { id: "unfinished-course", name: "待完成课程", resourceIds: [], diagnosis: {}, step: -1, editingCourseId: null },
    dismissedSourceIds: ["removed-book"]
  };
  await page.addInitScript(({ state, courseKey }) => {
    if (localStorage.getItem(courseKey)) return;
    localStorage.setItem(courseKey, JSON.stringify(state));
    localStorage.setItem("bookcourse.saved-study-notes.v1", JSON.stringify([{ id: "retained-note", title: "能量守恒笔记", body: "总能量保持不变", createdAt: 1 }]));
    localStorage.setItem("bookcourse.study-locations.v1", JSON.stringify({ "retained-course:book_biology_2": { expandedChapterId: "chapter-2", expandedSectionId: null } }));
    localStorage.setItem("bookcourse.credits.v1", JSON.stringify({ version: 1, balance: 72, transactions: [] }));
  }, { state, courseKey });
  await page.goto("/?embedded=device-preview");
  await page.getByRole("option", { name: /我的生物复习/ }).click();
  await expect(page.locator(".study-book-switch strong")).toHaveText("我的生物复习");
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await expect(page.locator('.home-book-workspace[data-loaded="true"]')).toBeVisible();
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.locator(".settings-screen")).toBeVisible();
}

async function storedState(page: Page): Promise<CourseState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), courseKey);
}

async function learningData(page: Page) {
  return page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), dataKeys);
}

async function requestLogout(page: Page) {
  await page.getByRole("button", { name: "退出账号", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认退出账号？" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("settings shows saved preferences and cancellation preserves the account", async ({ page }, testInfo) => {
  await seedLearner(page);
  await openSettings(page);
  await expect(page.locator(".settings-account-card")).toContainText("小明");
  await expect(page.locator(".settings-preferences")).toContainText("备考冲刺");
  await expect(page.locator(".settings-preferences")).toContainText("30分钟以内");
  await expect(page.locator(".ai-orb")).toHaveCount(0);
  const main = page.locator("main");
  expect(await main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("settings.png") });
  const before = await storedState(page);
  const dialog = await requestLogout(page);
  await expect(dialog).toContainText("已有课程、资料和学习记录会保留在本机");
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: testInfo.outputPath("logout-confirmation.png") });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "退出账号", exact: true })).toBeFocused();
  expect(await storedState(page)).toEqual(before);

  await requestLogout(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await requestLogout(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("bookcourse:native-back", { cancelable: true })));
  await expect(dialog).toHaveCount(0);
  expect(await storedState(page)).toEqual(before);
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(page.locator(".profile-screen")).toBeVisible();
  await page.reload();
  await expect(page.locator(".home-dashboard")).toBeVisible();
});

test("logout restarts onboarding on reopening and retains courses, files and study data", async ({ page, context }) => {
  await seedLearner(page);
  await page.getByRole("button", { name: "学习", exact: true }).click();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const materials = page.getByRole("dialog", { name: "添加课程资料" });
  await materials.locator('input[type="file"]').setInputFiles({ name: "保留的资料.txt", mimeType: "text/plain", buffer: Buffer.from("能量守恒定律\n退出账号后仍然保留的课程资料。") });
  await expect(materials.getByRole("button", { name: "上传文件或教材" })).toBeEnabled({ timeout: 15_000 });
  await expect(materials.getByRole("alert")).toHaveCount(0);
  await materials.getByRole("button", { name: "关闭", exact: true }).click();
  await openSettings(page);
  const before = await storedState(page);
  const dataBefore = await learningData(page);
  expect(before.resources).toHaveLength(1);

  const dialog = await requestLogout(page);
  await dialog.getByRole("button", { name: "确认退出", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我们怎么称呼你", exact: true })).toBeVisible();
  await expect(page.getByLabel("你的称呼")).toHaveValue("");
  await expect(page.locator(".primary-nav")).toHaveCount(0);
  await expect(page.locator(".ai-orb")).toHaveCount(0);
  const after = await storedState(page);
  expect(after.preferences).toBeNull();
  expect(after.onboardingDraft).toEqual(emptyCourseState().onboardingDraft);
  expect({ ...after, preferences: before.preferences, onboardingDraft: before.onboardingDraft }).toEqual(before);
  expect(await learningData(page)).toEqual(dataBefore);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("bookcourse:native-back", { cancelable: true })));
  await expect(page.locator(".onboarding-flow")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("你的称呼")).toHaveValue("");
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto("/?embedded=device-preview");
  await expect(reopened.getByRole("heading", { name: "我们怎么称呼你", exact: true })).toBeVisible();
  await reopened.getByLabel("你的称呼").fill("小红");
  await reopened.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(reopened.getByRole("button", { name: "备考冲刺", exact: true })).toHaveAttribute("aria-pressed", "false");
  await reopened.getByRole("button", { name: "能力提升", exact: true }).click();
  await reopened.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(reopened.getByRole("button", { name: "30分钟以内", exact: true })).toHaveAttribute("aria-pressed", "false");
  await reopened.getByRole("button", { name: "1-2小时", exact: true }).click();
  await reopened.getByRole("button", { name: "开始专属学习之旅", exact: true }).click();
  await expect(reopened.locator(".home-dashboard")).toBeVisible();
  expect((await storedState(reopened)).preferences).toMatchObject({ displayName: "小红", primaryGoal: "growth", dailyTime: "1to2h" });
  expect((await storedState(reopened)).courses).toEqual(before.courses);
  expect((await storedState(reopened)).resources).toEqual(before.resources);
  expect(await learningData(reopened)).toEqual(dataBefore);

  const resource = before.resources[0];
  const fileContent = await reopened.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bookcourse-learning-resources", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const request = database.transaction("files", "readonly").objectStore("files").get(id);
        request.onsuccess = () => resolve(new TextDecoder().decode(request.result.bytes));
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }, resource.id);
  expect(fileContent).toBe("能量守恒定律\n退出账号后仍然保留的课程资料。");

  await reopened.getByRole("option", { name: /我的生物复习/ }).click();
  await expect(reopened.locator(".study-book-switch strong")).toHaveText("我的生物复习");
  await reopened.reload();
  await expect(reopened.locator(".home-dashboard")).toBeVisible();
  await openSettings(reopened);
  await expect(reopened.locator(".settings-account-card")).toContainText("小红");
});

test("logout keeps the account active on a storage failure and succeeds on retry", async ({ page }) => {
  await seedLearner(page);
  await openSettings(page);
  const before = await storedState(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, name, value);
    };
    Reflect.set(window, "restoreSettingsStorage", () => { Storage.prototype.setItem = original; });
  }, courseKey);
  const dialog = await requestLogout(page);
  await dialog.getByRole("button", { name: "确认退出", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("本地存储空间不足");
  await expect(page.locator(".settings-screen")).toBeVisible();
  expect(await storedState(page)).toEqual(before);
  await page.evaluate(() => Reflect.get(window, "restoreSettingsStorage")());
  await dialog.getByRole("button", { name: "确认退出", exact: true }).click();
  await expect(page.locator(".onboarding-flow")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("你的称呼")).toHaveValue("");
  expect((await storedState(page)).preferences).toBeNull();
});

test("logout gives onboarding focus after the animated settings page exits", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seedLearner(page);
  await openSettings(page);
  const dialog = await requestLogout(page);
  await dialog.getByRole("button", { name: "确认退出", exact: true }).click();
  await expect(page.locator(".onboarding-flow")).toBeVisible();
  await expect(page.locator(".settings-screen")).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
  await page.getByLabel("你的称呼").fill("重新开始");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();
  await expect(page.locator(".home-dashboard")).toBeVisible();
  expect((await storedState(page)).preferences).toMatchObject({ displayName: "重新开始", primaryGoal: null, dailyTime: null });
});
