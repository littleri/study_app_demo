import { expect, test, type Page } from "playwright/test";
import { zipSync, strToU8 } from "fflate";
import type { CourseDraft } from "../src/features/courses/model";

test.use({ locale: "zh-CN", reducedMotion: "reduce" });
const diagnosis = { urgency: "steady", timePattern: "block", goals: ["systematic"], contentFoci: ["principles"], aids: ["chat"], reviews: ["periodic"] };
const biology = "book_biology_2";
const math = "book_math_human_a_1";
async function seedLegacy(page: Page, draft: CourseDraft | null = null) {
  await page.addInitScript(({ diagnosis, draft }) => {
    if (localStorage.getItem("bookcourse.courses.v2")) return;
    localStorage.setItem("bookcourse.learning-sets.v1", JSON.stringify({ version: 1, preferences: { displayName: "小明", primaryGoal: "exam", dailyTime: "under30", completedAt: 1 }, onboardingDraft: { displayName: "", primaryGoal: null, dailyTime: null, step: 0 }, sets: [{ id: "legacy-biology", name: "期末生物复习", resourceIds: ["course:book_biology_2"], diagnosis, createdAt: 1, updatedAt: 2 }], resources: [], draft, activeSetId: "legacy-biology" }));
  }, { diagnosis, draft });
  await page.goto("/?embedded=device-preview");
  if (draft) await expect(page.getByRole("listbox", { name: "选择课程" })).toBeVisible();
  else await expect(page.locator('.home-book-workspace[data-loaded="true"]')).toBeVisible();
}
async function study(page: Page) {
  await page.locator(".nav-study").click();
  await expect(page.locator(".study-book-switch strong")).toHaveText("期末生物复习");
}
async function addSheet(page: Page) {
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "添加课程资料" });
  await expect(sheet).toBeVisible();
  return sheet;
}
async function closeSheet(page: Page) { await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click(); }
async function state(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.courses.v2") || "{}")); }
async function details(page: Page) { await page.locator(".course-source-heading").first().getByRole("button", { name: /管理资料/ }).click(); }
async function completeCreationQuestions(page: Page) {
  const answers = ["正常节奏，按计划来", "整块固定时间", "系统学习", "原理和逻辑", "AI 对话讲解", "定期复盘"];
  for (const [index, answer] of answers.entries()) {
    await page.getByRole("button", { name: answer, exact: true }).click();
    await page.getByRole("button", { name: index === 5 ? "完成，开始导入" : "下一页", exact: true }).click();
  }
}

function pdfFile() {
  const stream = "BT /F1 20 Tf 40 160 Td (Energy is conserved.) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let body = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { name: "能量守恒.pdf", mimeType: "application/pdf", buffer: Buffer.from(body) };
}

test("migrates containers into courses, removes the banner and preserves the backup", async ({ page }) => {
  await seedLegacy(page);
  await expect(page.getByRole("heading", { name: "我的课程" })).toBeVisible();
  const migrated = await state(page);
  expect(migrated.version).toBe(2);
  expect(migrated.courses.find((course: { id: string }) => course.id === "legacy-biology")).toMatchObject({ name: "期末生物复习", resourceIds: ["source:book_biology_2"], createdAt: 1 });
  expect(migrated.preferences.displayName).toBe("小明");
  expect(await page.evaluate(() => Boolean(localStorage.getItem("bookcourse.learning-sets.v1")))).toBe(true);
  await study(page);
  await expect(page.locator(".study-active-set-link")).toHaveCount(0);
  await expect(page.getByText("当前教材", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "优先问 AI 讲解" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "课程目录" })).toBeVisible();
  await page.reload(); await study(page);
  expect((await state(page)).courses.filter((course: { id: string }) => course.id === "legacy-biology")).toHaveLength(1);
});

test("adds an existing book to the current course without creating a course or moving the reading position", async ({ page }) => {
  await seedLegacy(page); await study(page);
  const before = await state(page);
  const selectedChapter = await page.locator('.study-section-toggle[aria-expanded="true"]').getAttribute("aria-controls");
  const sheet = await addSheet(page);
  await sheet.getByRole("button", { name: /数学.*可开始学习/ }).click();
  const after = await state(page);
  expect(after.courses).toHaveLength(before.courses.length);
  expect(after.activeCourseId).toBe("legacy-biology");
  expect(after.courses.find((course: { id: string }) => course.id === "legacy-biology").resourceIds).toHaveLength(2);
  await closeSheet(page);
  expect(await page.locator('.study-section-toggle[aria-expanded="true"]').getAttribute("aria-controls")).toBe(selectedChapter);
  await expect(page.locator(".course-source-group")).toHaveCount(1);
  await page.locator(".course-source-group .course-source-chapter").first().click();
  await expect.poll(async () => (await state(page)).courses.find((course: { id: string }) => course.id === "legacy-biology").activeResourceId).toMatch(/math/);
  await page.reload(); await study(page);
  await expect(page.locator(".course-source-heading").first()).toContainText("数学");
});

test("imports independent files, survives reload, detects duplicates and retains originals on removal", async ({ page }) => {
  await seedLegacy(page); await study(page);
  const sheet = await addSheet(page);
  await sheet.locator('input[type="file"]').setInputFiles([{ name: "能量守恒.txt", mimeType: "text/plain", buffer: Buffer.from("能量守恒定律\n能量不会凭空产生，也不会凭空消失。") }, { name: "遗传复习.txt", mimeType: "text/plain", buffer: Buffer.from("遗传的物质基础\nDNA 是主要的遗传物质。") }]);
  await expect(sheet.getByRole("button", { name: "上传文件或教材" })).toBeEnabled({ timeout: 15_000 });
  await expect(sheet.getByRole("alert")).toHaveCount(0);
  const imported = await state(page);
  expect(imported.resources).toHaveLength(2);
  expect(imported.resources.every((resource: { status: string; bookId: string }) => resource.status === "ready" && resource.bookId.startsWith("book_local_"))).toBe(true);
  expect(imported.resources[0].bookId).not.toBe(imported.resources[1].bookId);
  await sheet.locator('input[type="file"]').setInputFiles({ name: "能量守恒.txt", mimeType: "text/plain", buffer: Buffer.from("能量守恒定律\n能量不会凭空产生，也不会凭空消失。") });
  await expect(sheet.getByRole("button", { name: "上传文件或教材" })).toBeEnabled();
  expect((await state(page)).resources).toHaveLength(2);
  await closeSheet(page); await details(page);
  const card = page.locator(".course-space-book").filter({ hasText: "能量守恒" });
  await card.getByRole("button", { name: /进入/ }).click();
  await expect(page.locator(".course-source-heading").first()).toContainText("能量守恒");
  await page.reload(); await study(page); await details(page);
  await page.getByRole("button", { name: "从课程移出 能量守恒" }).click();
  const after = await state(page);
  expect(after.resources).toHaveLength(2);
  const source = after.resources.find((resource: { name: string }) => resource.name === "能量守恒.txt");
  expect(after.courses.find((course: { id: string }) => course.id === "legacy-biology").resourceIds).not.toContain(`local:${source.id}`);
});

test("renders an uploaded PDF's own page and keeps its filename and content", async ({ page }) => {
  await seedLegacy(page); await study(page);
  const sheet = await addSheet(page);
  await sheet.locator('input[type="file"]').setInputFiles(pdfFile());
  await expect(sheet.getByRole("button", { name: "上传文件或教材" })).toBeEnabled({ timeout: 15_000 });
  await expect(sheet.getByRole("alert")).toHaveCount(0);
  await closeSheet(page); await details(page);
  await page.locator(".course-space-book").filter({ hasText: "能量守恒" }).getByRole("button", { name: /进入/ }).click();
  await page.locator('.study-section-toggle[aria-expanded="true"]').click();
  await page.locator(".study-section-toggle").first().click();
  await page.getByRole("button", { name: /进入学习/ }).click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
  await page.getByRole("button", { name: /回到原书|原文/ }).first().click();
  await expect(page.locator(".source-reader-screen")).toBeVisible();
  await expect(page.locator('.source-reader-screen img[src^="data:image/png"]')).toBeVisible({ timeout: 15_000 });
});

test("reads Office file text and keeps a failed import available for retry and download", async ({ page }) => {
  await seedLegacy(page); await study(page); const sheet = await addSheet(page);
  const docx = zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>课程资料中的能量守恒定律</w:t></w:r></w:p></w:body></w:document>') });
  await sheet.locator('input[type="file"]').setInputFiles([{ name: "补充材料.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(docx) }, { name: "损坏的扫描.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") }]);
  await expect(sheet.getByRole("button", { name: "上传文件或教材" })).toBeEnabled({ timeout: 15_000 });
  await expect(sheet.getByRole("alert")).toContainText("损坏的扫描.pdf");
  const saved = await state(page);
  expect(saved.resources.find((resource: { name: string }) => resource.name === "补充材料.docx").status).toBe("ready");
  expect(saved.resources.find((resource: { name: string }) => resource.name === "损坏的扫描.pdf").status).toBe("error");
  await closeSheet(page); await details(page);
  const failed = page.locator(".course-space-book").filter({ hasText: "损坏的扫描.pdf" });
  await expect(failed.getByRole("button", { name: "重新整理" })).toBeVisible();
  await expect(failed.getByRole("button", { name: /下载/ })).toBeVisible();
});

test("creates a course from mock materials and restores its separate identity", async ({ page }) => {
  await seedLegacy(page);
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  const importer = page.locator(".upload-flow-screen");
  await expect(importer.getByRole("heading", { name: "添加课程资料", exact: true })).toBeVisible();
  await expect(page.getByLabel("课程名称", { exact: true })).toHaveCount(0);
  const continueButton = importer.getByRole("button", { name: "保存资料并继续", exact: true });
  await expect(continueButton).toBeDisabled();
  await importer.getByRole("button", { name: "选择课程资料", exact: true }).click();
  await expect(importer.locator('.upload-add-icon [data-sticker-icon="FileText"]')).toBeVisible();
  await expect(importer.locator(".course-upload-files")).toHaveText("示例课程资料.txt");
  await expect(continueButton).toBeEnabled();
  await importer.getByRole("button", { name: "已添加示例课程资料", exact: true }).click();
  await expect(importer.locator(".course-upload-files > div")).toHaveCount(1);
  await importer.getByRole("button", { name: "移除 示例课程资料.txt", exact: true }).click();
  await expect(continueButton).toBeDisabled();
  await expect(importer.locator(".course-upload-files > div")).toHaveCount(0);
  await importer.getByRole("button", { name: "选择课程资料", exact: true }).click();
  await importer.getByRole("button", { name: "保存资料并继续", exact: true }).click();
  await expect(page.getByRole("heading", { name: "你当前学习的紧迫程度？", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".course-space-details")).toHaveCount(0);
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(importer).toBeVisible();
  await importer.getByRole("button", { name: "继续设置课程", exact: true }).click();
  await expect(page.getByRole("heading", { name: "你当前学习的紧迫程度？", exact: true })).toBeVisible();
  await completeCreationQuestions(page);
  await expect(page.locator('main[data-screen="courseImportProcessing"]')).toBeVisible();
  await expect(page.locator(".processing-sprite-strip")).toHaveAttribute("src", "/assets/brand/loading/cloud-course-loading-strip-v1.png");
  await expect(page.locator(".course-space-detail-hero")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "课程导入完成", exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".course-ready-focus")).toHaveAttribute("data-course-ready-phase", "settled");
  await expect(page.locator(".course-space-detail-hero")).toHaveCount(0);
  const saved = await state(page); const course = saved.courses.find((course: { name: string }) => course.name === "示例课程资料");
  expect(course.id).not.toBe(math); expect(course.id).not.toBe(biology); expect(saved.activeCourseId).toBe(course.id);
  const resource = saved.resources.find((resource: { name: string }) => resource.name === "示例课程资料.txt");
  expect(resource.status).toBe("ready");
  expect(course.resourceIds).toEqual([`local:${resource.id}`]);
  await page.getByRole("button", { name: "进入学习", exact: true }).click();
  await expect(page.locator(".study-book-switch strong")).toHaveText("示例课程资料");
  await page.reload(); await page.locator(".nav-study").click();
  await expect(page.locator(".study-book-switch strong")).toHaveText("示例课程资料");
});

test("plays the parsing and import-completion animations before opening the learning plan", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seedLegacy(page);
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  await page.getByRole("button", { name: "选择课程资料", exact: true }).click();
  await page.getByRole("button", { name: "保存资料并继续", exact: true }).click();
  await completeCreationQuestions(page);
  const loadingSprite = page.locator(".processing-sprite-strip");
  await expect(loadingSprite).toBeVisible();
  await expect(loadingSprite).toHaveCSS("animation-name", "processing-cloud-sprite-loading");
  await expect(page.locator('.stage-row[data-stage-status="done"]')).not.toHaveCount(0);
  const completion = page.locator(".course-ready-focus");
  await expect(completion).toBeVisible({ timeout: 8_000 });
  await expect(completion).toHaveAttribute("data-course-ready-phase", "celebrating");
  await expect(page.locator(".course-ready-success-sprite-strip")).toHaveAttribute("src", "/assets/brand/success/cloud-mascot-success-strip-v1.png");
  await expect(page.locator(".course-ready-success-sprite-strip")).toHaveCSS("animation-name", "course-ready-success-sprite");
  await expect(completion).toHaveAttribute("data-course-ready-phase", "settled", { timeout: 6_000 });
  await expect(page.getByRole("heading", { name: "课程导入完成", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看学习计划", exact: true }).click();
  await expect(page.locator('main[data-screen="plan"]')).toBeVisible();
  await expect(page.locator(".course-ready-focus")).toHaveCount(0);
});

test("resumes a legacy creation draft without reopening the removed basics page", async ({ page }) => {
  await seedLegacy(page, { id: "legacy-draft", name: "", resourceIds: [`course:${biology}`], diagnosis: {}, step: -1, editingCourseId: null });
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  await expect(page.locator(".upload-flow-screen")).toBeVisible();
  await page.getByRole("button", { name: "继续设置课程", exact: true }).click();
  await expect(page.getByRole("heading", { name: "你当前学习的紧迫程度？", exact: true })).toBeVisible();
  await expect(page.getByLabel("课程名称", { exact: true })).toHaveCount(0);
  const resumed = (await state(page)).draft;
  expect(resumed.id).toBe("legacy-draft");
  expect(resumed.name.trim()).not.toBe("");
  expect(resumed.resourceIds).toEqual([`source:${biology}`]);
  expect(resumed.step).toBe(0);
});

test("retrieves two course files on the same page and opens the cited file", async ({ page }) => {
  test.slow();
  await seedLegacy(page); await study(page);
  const sheet = await addSheet(page);
  await sheet.locator('input[type="file"]').setInputFiles([
    { name: "能量甲.txt", mimeType: "text/plain", buffer: Buffer.from("能量守恒定律\n能量守恒表示总能量保持不变，能量不会凭空产生。") },
    { name: "能量乙.txt", mimeType: "text/plain", buffer: Buffer.from("能量守恒的应用\n能量守恒可以用于分析机械能与内能的相互转化。") }
  ]);
  await expect(sheet.getByRole("button", { name: "上传文件或教材" })).toBeEnabled();
  await closeSheet(page);
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await page.getByRole("button", { name: "打开 AI 助手", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator(".ai-compose input").fill("能量守恒");
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  const first = dialog.locator(".ai-message-citation-item").filter({ hasText: "能量甲.txt" });
  const second = dialog.locator(".ai-message-citation-item").filter({ hasText: "能量乙.txt" });
  await expect(first).toContainText("总能量保持不变", { timeout: 30_000 });
  await expect(second).toContainText("机械能与内能");
  await expect(first).toContainText("原文第 1 页");
  await expect(second).toContainText("原文第 1 页");
  await second.getByRole("button", { name: /查看/ }).click();
  await expect(page.locator(".source-reader-screen")).toBeVisible();
  await expect(page.locator(".source-reader-screen")).toContainText("机械能与内能");
  const saved = await state(page);
  const cited = saved.resources.find((resource: { name: string }) => resource.name === "能量乙.txt");
  expect(saved.courses.find((course: { id: string }) => course.id === "legacy-biology").activeResourceId).toBe(`local:${cited.id}`);
});

test("aggregates source tasks and persists local completion in the course plan", async ({ page }) => {
  await seedLegacy(page); await study(page);
  const sheet = await addSheet(page);
  await sheet.locator('input[type="file"]').setInputFiles({ name: "独立阅读任务.txt", mimeType: "text/plain", buffer: Buffer.from("独立阅读任务\n课程中的补充阅读内容。") });
  await expect(sheet.getByRole("button", { name: "上传文件或教材" })).toBeEnabled();
  await closeSheet(page); await page.getByRole("button", { name: "首页", exact: true }).click();
  await page.locator('[data-home-global-action="plan"]').click();
  await expect(page.locator(".plan-hero-card h2")).toHaveText("期末生物复习");
  const task = page.locator(".timeline-item").filter({ hasText: "独立阅读任务" });
  await expect(task).toBeVisible();
  const progress = page.locator(".plan-hero-card").getByRole("progressbar");
  const before = Number(await progress.getAttribute("aria-valuenow"));
  await task.click();
  await expect(task).toHaveClass(/done/);
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  await page.reload();
  await expect(page.locator('.home-book-workspace[data-loaded="true"]')).toBeVisible();
  await page.locator('[data-home-global-action="plan"]').click();
  await expect(page.locator(".timeline-item").filter({ hasText: "独立阅读任务" })).toHaveClass(/done/);
});
