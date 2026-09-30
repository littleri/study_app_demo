import { expect, test } from "playwright/test";

test.use({ storageState: { cookies: [], origins: [] }, locale: "zh-CN", reducedMotion: "reduce" });

async function openActiveSet(page: import("playwright/test").Page) {
  const current = page.locator('.motion-screen-surface[data-motion-surface="current"]');
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "我的" }).click();
  await current.getByRole("button", { name: /查看当前学习集：/ }).click();
  return current;
}

async function openFirstSetDirectory(page: import("playwright/test").Page) {
  await page.goto("/");
  const current = page.locator('.motion-screen-surface[data-motion-surface="current"]');
  await expect(current.getByRole("heading", { name: "我们怎么称呼你" })).toBeVisible();
  await current.getByLabel("你的称呼").fill("小明");
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "备考冲刺" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "30分钟以内" }).click();
  await current.getByRole("button", { name: "开始专属学习之旅" }).click();
  await expect(current.getByRole("button", { name: "创建学习集" })).toBeVisible();
  await expect(current.getByRole("heading", { name: "创建你的学习集" })).toHaveCount(0);
  await expect(current.getByText("专属学习空间")).toHaveCount(0);
  await current.getByRole("button", { name: "创建学习集" }).click();
  await expect(current.getByRole("button", { name: "从设备选择资料" })).toHaveCount(0);
  await expect(current.getByLabel("学习集名称")).toHaveCount(0);
  const uploadAction = current.getByRole("button", { name: "上传并继续" });
  await expect(uploadAction).toBeDisabled();
  await expect(uploadAction).toHaveCSS("background-color", "rgb(238, 241, 245)");
  await current.getByRole("button", { name: "选择学习资料" }).click();
  await expect(uploadAction).toBeEnabled();
  await expect(uploadAction).not.toHaveCSS("background-color", "rgb(238, 241, 245)");
  await uploadAction.click();
  await expect(current.getByRole("button", { name: "开始解析" })).toBeVisible();
  await expect(current.getByRole("heading", { name: "你当前学习的紧迫程度？" })).toHaveCount(0);
  await current.getByRole("button", { name: "开始解析" }).click();
  await expect(current.getByRole("heading", { name: "创建你的学习集" })).toHaveCount(0);
  await expect(current.getByRole("heading", { name: "你当前学习的紧迫程度？" })).toBeVisible({ timeout: 12_000 });
  await expect(current.getByRole("button", { name: "确认生成课程" })).toHaveCount(0);
  const answerNames = [
    "很紧急，短期要学完",
    "碎片化零散时间",
    "应试备考",
    "多做练习",
    "错题智能复盘",
    "定期复盘"
  ];
  for (const [index, answer] of answerNames.entries()) {
    await current.getByRole("button", { name: answer }).click();
    await current.getByRole("button", { name: index === 5 ? "完成问卷，查看课程目录" : "下一页" }).click();
  }
  await expect(current.getByRole("button", { name: "确认生成课程" })).toBeVisible();
  return current;
}

async function createFirstSet(page: import("playwright/test").Page) {
  const current = await openFirstSetDirectory(page);
  await page.goto("/");
  await expect(current.getByRole("heading", { name: "我的学习集" })).toHaveCount(0);
  await expect(current.getByRole("button", { name: "创建学习集" })).toBeVisible();
  return current;
}

test("keeps directory editing as an icon and removes the learning-set selector from generated course completion", async ({ page }) => {
  await page.setViewportSize({ width: 783, height: 1138 });
  const current = await openFirstSetDirectory(page);
  const edit = current.locator(".toc-edit-button").first();
  await expect(edit).toHaveText("");
  await expect(edit.locator("svg")).toBeVisible();
  await expect(edit).toHaveAttribute("aria-label", /^编辑 /);
  await page.screenshot({ path: "output/chapter-confirm-icon-only.png" });
  await current.getByRole("button", { name: "确认生成课程" }).click();
  await expect(current.locator(".course-ready-screen")).toBeVisible({ timeout: 12_000 });
  await expect(current.getByRole("button", { name: "进入学习", exact: true })).toBeEnabled();
  await expect(current.getByRole("button", { name: "查看学习计划", exact: true })).toBeVisible();
  await expect(current.locator(".course-ready-actions .learning-course-join-select")).toHaveCount(0);
  await expect(current.locator(".course-ready-actions select")).toHaveCount(0);
  await page.screenshot({ path: "output/course-ready-without-set-selector.png" });
});

test("first use creates a set and survives reload", async ({ page }) => {
  const current = await createFirstSet(page);
  await openActiveSet(page);
  await expect(current.getByRole("heading", { name: "今日建议" })).toBeVisible();
  await expect(current.getByText("20 分钟预算")).toBeVisible();
  await expect(current.getByText("建议每 1 天回看一次重点与错题。")).toBeVisible();
  await expect(current.locator(".learning-recommendation").first()).toBeVisible();
  await expect(current.getByText("紧迫学习：先抓练习和薄弱点")).toBeVisible();
  await page.reload();
  await expect(current.getByRole("heading", { name: "我的学习集" })).toHaveCount(0);
  await expect(current.getByRole("heading", { name: "我们怎么称呼你" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "我的" }).click();
  await current.getByRole("button", { name: "编辑学习偏好" }).click();
  await current.getByLabel("称呼", { exact: true }).fill("小明同学");
  await current.getByLabel("每日学习时间").selectOption("1to2h");
  await current.getByRole("button", { name: "保存偏好" }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "首页" }).click();
  await openActiveSet(page);
  await expect(current.getByText("90 分钟预算")).toBeVisible();
});

test("one course can belong to two sets and removal keeps the original course", async ({ page }) => {
  const current = await createFirstSet(page);
  await current.getByRole("button", { name: "创建学习集" }).click();
  await current.getByRole("button", { name: "选择学习资料" }).click();
  await current.getByRole("button", { name: "上传并继续" }).click();
  await current.getByRole("button", { name: "开始解析" }).click();
  await expect(current.getByRole("heading", { name: "你当前学习的紧迫程度？" })).toBeVisible({ timeout: 12_000 });
  for (const [index, answer] of [
    "不着急，慢慢看", "整块固定时间", "兴趣阅读", "原理和逻辑", "导学笔记沉淀", "自由复习"
  ].entries()) {
    await current.getByRole("button", { name: answer }).click();
    await current.getByRole("button", { name: index === 5 ? "完成问卷，查看课程目录" : "下一页" }).click();
  }
  await expect(current.getByRole("button", { name: "确认生成课程" })).toBeVisible();
  await page.goto("/");
  await expect(current.getByRole("heading", { name: "我的学习集" })).toHaveCount(0);
  const beforeRemoval = await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.learning-sets.v1") || "{}"));
  expect(beforeRemoval.sets).toHaveLength(2);
  expect(beforeRemoval.sets[0].resourceIds).toEqual(beforeRemoval.sets[1].resourceIds);
  expect(beforeRemoval.sets[0].diagnosis.urgency).toBe("urgent");
  expect(beforeRemoval.sets[1].diagnosis.urgency).toBe("relaxed");
  expect(beforeRemoval.activeSetId).toBe(beforeRemoval.sets[1].id);

  await openActiveSet(page);
  await expect(current.getByText("按你的自由复习偏好，不安排固定复盘提醒。")).toBeVisible();
  const originalCourse = current.locator(".learning-set-book strong").first();
  const courseTitle = await originalCourse.textContent();
  expect(courseTitle).toBeTruthy();
  await current.getByRole("button", { name: `从学习集移出 ${courseTitle}` }).click();
  await expect(originalCourse).toHaveCount(0);
  const afterRemoval = await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.learning-sets.v1") || "{}"));
  expect(afterRemoval.sets[0].resourceIds).toEqual(beforeRemoval.sets[0].resourceIds);
  expect(afterRemoval.sets[1].resourceIds).toHaveLength(0);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "首页" }).click();
  await expect(current.getByRole("region", { name: "我的教材" }).getByText(courseTitle!)).toBeVisible();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "我的" }).click();
  await current.getByLabel("切换学习集").selectOption(beforeRemoval.sets[0].id);
  await current.getByRole("button", { name: /查看当前学习集：/ }).click();
  await expect(current.getByText("建议每 1 天回看一次重点与错题。")).toBeVisible();
  await expect(current.locator(".learning-set-book strong").filter({ hasText: courseTitle! })).toBeVisible();
});

test("draft, multiple selection and local file remain after refresh", async ({ page }) => {
  await page.goto("/");
  const current = page.locator('.motion-screen-surface[data-motion-surface="current"]');
  await current.getByLabel("你的称呼").fill("小安");
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "跳过" }).click();
  await current.getByRole("button", { name: "跳过" }).click();
  await expect(current.getByRole("button", { name: "创建学习集" })).toBeVisible();
  await current.getByRole("button", { name: "创建学习集" }).click();
  await current.getByRole("button", { name: "选择学习资料" }).click();
  await expect(current.getByRole("button", { name: "添加更多学习资料" })).toBeVisible();
  await current.locator('input[type="file"]').setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nlearning-set-test")
  });
  await expect(current.locator(".upload-selected-file-item")).toHaveCount(1);
  await current.getByRole("button", { name: "上传并继续" }).click();
  await expect(current.getByRole("heading", { name: "你当前学习的紧迫程度？" })).toBeVisible();
  await current.getByRole("button", { name: "正常节奏，按计划来" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  await page.reload();
  await expect(current.getByRole("heading", { name: "我的学习集" })).toHaveCount(0);
  await expect(current.getByRole("button", { name: "创建学习集" })).toBeVisible();
  await current.getByRole("button", { name: "创建学习集" }).click();
  await expect(current.getByRole("heading", { name: "你的学习时间是哪种类型？" })).toBeVisible();
  await current.getByRole("button", { name: "整块固定时间" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "系统学习" }).click();
  await current.getByRole("button", { name: "查漏补缺" }).click();
  await expect(current.getByRole("button", { name: "系统学习" })).toHaveAttribute("aria-pressed", "true");
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "原理和逻辑" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "AI 自话讲解" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "定期复盘" }).click();
  await current.getByRole("button", { name: "自由复习" }).click();
  await expect(current.getByRole("button", { name: "定期复盘" })).toHaveAttribute("aria-pressed", "false");
  await current.getByRole("button", { name: "完成，进入学习集" }).click();
  await expect(current.getByRole("heading", { name: "notes" })).toBeVisible();
  await expect(current.getByText("notes.pdf")).toBeVisible();
  await expect(current.getByText("待整理 · 原文件已保存在本机")).toBeVisible();
  await expect(current.locator(".learning-recommendation")).toHaveCount(0);
  await page.reload();
  await openActiveSet(page);
  await expect(current.getByText("notes.pdf")).toBeVisible();
  const fileExists = await page.evaluate(async () => {
    const state = JSON.parse(localStorage.getItem("bookcourse.learning-sets.v1") || "{}");
    const id = state.resources?.[0]?.id;
    return new Promise<boolean>((resolve) => {
      const request = indexedDB.open("bookcourse-learning-resources", 1);
      request.onsuccess = () => {
        const read = request.result.transaction("files", "readonly").objectStore("files").get(id);
        read.onsuccess = () => resolve(Boolean(read.result?.bytes?.length));
        read.onerror = () => resolve(false);
      };
      request.onerror = () => resolve(false);
    });
  });
  expect(fileExists).toBe(true);
});

test("required answers, keyboard and back navigation keep edits", async ({ page }) => {
  await page.goto("/");
  const current = page.locator('.motion-screen-surface[data-motion-surface="current"]');
  await current.getByRole("button", { name: "下一页" }).click();
  await expect(current.getByRole("alert")).toHaveText("请先填写称呼");
  await current.getByLabel("你的称呼").fill("阿宁");
  const inputBackConsumed = await page.evaluate(() => {
    const event = new CustomEvent("bookcourse:native-back", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(inputBackConsumed).toBe(false);
  await page.keyboard.press("Enter");
  await expect(current.getByRole("heading", { name: "你使用云径的主要目标是" })).toBeVisible();
  await current.getByRole("button", { name: "跳过" }).click();
  await current.getByRole("button", { name: "上一步" }).click();
  await current.getByRole("button", { name: "系统学习" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  await current.getByRole("button", { name: "跳过" }).click();
  await expect(current.getByRole("button", { name: "创建学习集" })).toBeVisible();
  await current.getByRole("button", { name: "创建学习集" }).click();
  await current.getByRole("button", { name: "选择学习资料" }).click();
  await current.getByRole("button", { name: "上传并继续" }).click();
  await expect(current.getByRole("button", { name: "开始解析" })).toBeVisible();
  await page.reload();
  await current.getByRole("button", { name: "创建学习集" }).click();
  await current.getByRole("button", { name: "开始解析" }).click();
  await expect(current.getByRole("heading", { name: "你当前学习的紧迫程度？" })).toBeVisible({ timeout: 12_000 });
  await current.getByRole("button", { name: "上一步" }).click();
  await expect(current.getByRole("button", { name: "填写学习方式问卷" })).toBeVisible();
  await current.getByRole("button", { name: "填写学习方式问卷" }).click();
  await page.reload();
  await current.getByRole("button", { name: "创建学习集" }).click();
  await expect(current.getByRole("heading", { name: "你当前学习的紧迫程度？" })).toBeVisible();
  await expect(current.locator(".learning-diagnosis-option-icon")).toHaveCount(3);
  await current.getByRole("button", { name: "下一页" }).click();
  await expect(current.getByRole("alert")).toHaveText("请至少选择一项再继续");
  await expect(current.getByRole("alert")).toHaveCount(0, { timeout: 2_000 });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  let pausedMotion = await page.addStyleTag({ content: '.learning-flow-page[data-flow-motion]:not([data-flow-motion="idle"]) { animation-play-state: paused !important; }' });
  await current.getByRole("button", { name: "很紧急，短期要学完" }).click();
  await current.getByRole("button", { name: "下一页" }).click();
  const questionPage = current.locator(".learning-flow-page");
  await expect(questionPage).toHaveAttribute("data-flow-motion", "forward");
  expect(await questionPage.evaluate((element) => getComputedStyle(element).animationName)).toMatch(/^motion-screen-(phone-forward|tablet)-in$/);
  await pausedMotion.evaluate((style) => style.remove());
  await expect(questionPage).toHaveAttribute("data-flow-motion", "idle", { timeout: 2_000 });

  pausedMotion = await page.addStyleTag({ content: '.learning-flow-page[data-flow-motion]:not([data-flow-motion="idle"]) { animation-play-state: paused !important; }' });
  await current.getByRole("button", { name: "上一步" }).click();
  await expect(questionPage).toHaveAttribute("data-flow-motion", "back");
  expect(await questionPage.evaluate((element) => getComputedStyle(element).animationName)).toMatch(/^motion-screen-(phone-back|tablet)-in$/);
  await pausedMotion.evaluate((style) => style.remove());
  await expect(questionPage).toHaveAttribute("data-flow-motion", "idle", { timeout: 2_000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await current.getByRole("button", { name: "不着急，慢慢看" }).click();
  await expect(current.getByRole("button", { name: "很紧急，短期要学完" })).toHaveAttribute("aria-pressed", "false");
  await current.getByRole("button", { name: "下一页" }).click();
  await page.reload();
  await expect(current.getByRole("heading", { name: "你使用云径的主要目标是" })).toHaveCount(0);
  await expect(current.getByRole("button", { name: "创建学习集" })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.learning-sets.v1") || "{}"));
  expect(saved.preferences.primaryGoal).toBe("systematic");
  expect(saved.preferences.dailyTime).toBeNull();
  expect(saved.draft.diagnosis.urgency).toBe("relaxed");
  await current.getByRole("button", { name: "创建学习集" }).click();
  for (const [index, answer] of ["整块固定时间", "系统学习", "原理和逻辑", "导学笔记沉淀", "定期复盘"].entries()) {
    await current.getByRole("button", { name: answer }).click();
    await current.getByRole("button", { name: index === 4 ? "完成问卷，查看课程目录" : "下一页" }).click();
  }
  await expect(current.getByRole("button", { name: "确认生成课程" })).toBeVisible();
});
