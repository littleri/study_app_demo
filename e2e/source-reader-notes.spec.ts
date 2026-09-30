import { expect, test, type Locator, type Page } from "playwright/test";
import type { RagQuery } from "../src/types/api";
import type { TextNoteMessage, TextNotePosition } from "../src/features/studyNotes/types";

test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

async function readStoredNotes(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("bookcourse-study-notes");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("notes", "readonly");
    const notes = await new Promise<Array<{ id: string; kind: string; body?: string; position?: TextNotePosition; conversation?: TextNoteMessage[]; pages?: Record<string, unknown[]> }>>((resolve, reject) => {
      const result = transaction.objectStore("notes").getAll();
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    });
    database.close();
    return notes;
  });
}

async function openLessonSource(page: Page) {
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "继续学习", exact: true }).click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
  const progress = await page.locator(".lesson-page-progress").getAttribute("aria-valuenow");
  await page.locator(".lesson-source-link").first().click();
  const reader = page.locator(".source-reader-screen");
  await expect(reader).toBeVisible();
  await expect(page.locator(".sheet[data-sheet-type='source']")).toHaveCount(0);
  await expect(reader.locator(".source-annotation-page > img")).toBeVisible();
  return { reader, progress };
}

async function swipeSourcePage(page: Page, direction: "left" | "right") {
  await page.locator(".source-page-frame").evaluate((element, swipeDirection) => {
    const bounds = element.getBoundingClientRect();
    const startX = swipeDirection === "left" ? bounds.right - 36 : bounds.left + 36;
    const endX = swipeDirection === "left" ? bounds.left + 36 : bounds.right - 36;
    const y = bounds.top + bounds.height * .5;
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 41, pointerType: "touch", clientX: startX, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 41, pointerType: "touch", clientX: endX, clientY: y }));
  }, direction);
}

async function placeTextNote(page: Page, reader: Locator, x: number, y: number, body: string) {
  const target = reader.getByRole("button", { name: "点击原文添加文字批注" });
  const box = await target.boundingBox();
  if (!box) throw new Error("Missing textbook annotation target");
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  const editor = reader.getByRole("region", { name: "原文文字笔记" });
  await expect(editor.getByLabel("我的理解")).toBeFocused();
  await editor.getByLabel("我的理解").fill(body);
  return editor;
}

test("anchors selected text on the original page and reopens it for reading and editing", async ({ page }) => {
  await page.setViewportSize({ width: 761, height: 1138 });
  const { reader, progress } = await openLessonSource(page);
  await expect(page.locator(".header-title h1")).toHaveText("第 1 节 减数分裂和受精作用");
  await expect(page.locator(".header-title p")).toHaveText("第 16 页");
  await expect(reader).not.toContainText("PDF 第 11 页");
  const selectableText = reader.locator(".source-page-text-layer.is-reader");
  await expect(selectableText).toBeVisible();
  await selectableText.evaluate((element) => {
    const textNode = element.querySelector("p")?.firstChild;
    if (!textNode?.textContent) throw new Error("Missing cited source text");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(24, textNode.textContent.length));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await reader.locator(".source-reader-selection-action").getByRole("button", { name: "记笔记" }).click();
  const editor = reader.getByRole("region", { name: "原文文字笔记" });
  await expect(editor.locator("blockquote")).not.toBeEmpty();
  await expect(reader.locator(".source-annotation-page > img")).toBeVisible();
  await editor.getByLabel("我的理解").fill("减数分裂时，同源染色体的行为决定配子的染色体数目。");
  await expect(editor.getByRole("button", { name: "保存文字笔记" })).toHaveCount(0);
  await expect.poll(async () => (await readStoredNotes(page)).some((note) => note.kind === "text" && note.body === "减数分裂时，同源染色体的行为决定配子的染色体数目。"))
    .toBe(true);
  await editor.getByRole("button", { name: "关闭文字笔记" }).click();
  await reader.getByRole("button", { name: /本页笔记/ }).click();
  await expect(reader.locator(".source-page-notes")).toContainText("文字");
  await reader.locator(".source-page-notes button").filter({ hasText: "教材笔记" }).first().click();
  await expect(reader.locator(".source-text-note-body")).toHaveText("减数分裂时，同源染色体的行为决定配子的染色体数目。");
  await reader.getByRole("button", { name: "编辑批注" }).click();
  await expect(reader.getByLabel("我的理解")).toHaveValue("减数分裂时，同源染色体的行为决定配子的染色体数目。");
  await reader.getByRole("button", { name: "关闭文字笔记" }).click();

  await page.locator(".header-bar .icon-button").click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
  await expect(page.locator(".lesson-page-progress")).toHaveAttribute("aria-valuenow", progress ?? "1");
});

test("places independent text markers, restores them across pages and resizing, and deletes one", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  const textTool = reader.getByRole("button", { name: "文字笔记", exact: true });
  await textTool.click();
  await expect(reader.locator(".source-text-placement-hint")).toBeVisible();
  await expect(reader.getByRole("region", { name: "原文文字笔记" })).toHaveCount(0);

  const first = "同源染色体在减数第一次分裂时分离。";
  const second = "这里需要区分姐妹染色单体和同源染色体。";
  let editor = await placeTextNote(page, reader, .24, .23, "先记录同源染色体分离的疑问。");
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
  await editor.getByLabel("我的理解").fill(first);
  await reader.locator(".source-text-note-marker").click();
  await expect(editor.getByLabel("我的理解")).toHaveValue(first);
  await expect(reader.locator(".source-reader-side-panel")).toHaveCount(0);
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
  editor = await placeTextNote(page, reader, .78, .68, second);
  await page.screenshot({ path: "output/text-notes-ipad-editor.png" });
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(2);
  const saved = (await readStoredNotes(page)).find((note) => note.body === first)!;
  expect(saved.position?.x).toBeCloseTo(.24, 2);
  expect(saved.position?.y).toBeCloseTo(.23, 2);

  await textTool.click();
  await swipeSourcePage(page, "left");
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(0);
  await swipeSourcePage(page, "right");
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(2);
  await page.setViewportSize({ width: 1194, height: 834 });
  const marker = reader.locator(`[data-note-id='${saved.id}']`);
  const geometry = await marker.evaluate((element) => {
    const markerBox = element.getBoundingClientRect();
    const pageBox = element.closest(".source-annotation-page")!.getBoundingClientRect();
    return { x: (markerBox.left + markerBox.width / 2 - pageBox.left) / pageBox.width, y: (markerBox.top + markerBox.height / 2 - pageBox.top) / pageBox.height };
  });
  expect(geometry.x).toBeCloseTo(.24, 2);
  expect(geometry.y).toBeCloseTo(.23, 2);
  await marker.click();
  await expect(reader.locator(".source-text-note-body")).toHaveText(first);
  await reader.getByRole("button", { name: "编辑批注" }).click();
  await reader.getByLabel("我的理解").fill(`${first}\n配子的染色体数目减半。`);
  await reader.getByRole("button", { name: "完成", exact: true }).click();
  await marker.click();
  await expect(reader.locator(".source-text-note-body")).toContainText("配子的染色体数目减半");
  await reader.getByRole("button", { name: "删除批注" }).click();
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
  expect((await readStoredNotes(page)).some((note) => note.id === saved.id)).toBe(false);

  await page.reload();
  await page.getByRole("button", { name: "继续学习", exact: true }).click();
  await page.locator(".lesson-source-link").first().click();
  await expect(reader).toBeVisible();
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
  await expect(reader.locator(".source-text-note-marker")).toHaveAttribute("title", second);
});

test("keeps touch swipes distinct from taps and fits the editor at a phone page edge", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { reader } = await openLessonSource(page);
  await reader.getByRole("button", { name: "文字笔记", exact: true }).click();
  await reader.getByRole("button", { name: "点击原文添加文字批注" }).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const y = bounds.top + bounds.height * .5;
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 31, pointerType: "touch", button: 0, clientX: bounds.right - 40, clientY: y }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 31, pointerType: "touch", button: 0, clientX: bounds.left + 40, clientY: y }));
  });
  await expect(page.locator(".header-title p")).toHaveText("第 17 页");
  await expect(reader.getByRole("region", { name: "原文文字笔记" })).toHaveCount(0);
  await reader.getByRole("button", { name: "点击原文添加文字批注" }).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const coordinates = { clientX: bounds.right - 8, clientY: bounds.bottom - 8 };
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 32, pointerType: "touch", button: 0, ...coordinates }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 32, pointerType: "touch", button: 0, ...coordinates }));
  });
  const editor = reader.getByRole("region", { name: "原文文字笔记" });
  await expect(editor.getByLabel("我的理解")).toBeFocused();
  const fit = await editor.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const area = element.closest(".source-reader-workspace")!.getBoundingClientRect();
    return box.left >= area.left && box.right <= area.right && box.top >= area.top && box.bottom <= area.bottom;
  });
  expect(fit).toBe(true);
  await page.screenshot({ path: "output/text-notes-phone-editor.png" });
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(0);
  await page.screenshot({ path: "output/text-notes-phone-placement.png" });
});

test("includes the saved annotation in each AI question and restores its own conversation", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  await page.evaluate(async () => {
    const modulePath = "/src/api/bookcourseApi.ts";
    const { bookcourseApi } = await import(modulePath);
    const queries: RagQuery[] = [];
    (window as unknown as { __noteAiQueries: RagQuery[] }).__noteAiQueries = queries;
    bookcourseApi.queryRag = async (query: RagQuery) => {
      queries.push(query);
      return { answer: "你的批注指出了减数第一次分裂中同源染色体的分离。", citations: [], related_assets: [], confidence: "high" };
    };
  });
  await reader.getByRole("button", { name: "文字笔记", exact: true }).click();
  const body = "为什么减数第一次分裂后染色体数目会减半？";
  let editor = await placeTextNote(page, reader, .45, .4, body);
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await reader.getByRole("button", { name: "文字笔记", exact: true }).click();
  await reader.locator(".source-text-note-marker").click();
  editor = reader.getByRole("region", { name: "原文文字笔记" });
  await editor.getByRole("button", { name: "问 AI", exact: true }).click();
  const chat = reader.getByRole("dialog", { name: "批注 AI 对话" });
  await expect(chat.locator(".source-text-ai-reference")).toContainText(body);
  await chat.getByLabel("针对这条批注提问").fill("请解释这条批注中的疑问");
  await chat.getByRole("button", { name: "提问", exact: true }).click();
  await expect(chat.locator(".chat-bubble.ai").last()).toContainText("同源染色体的分离");
  await expect.poll(async () => (await readStoredNotes(page)).find((note) => note.body === body)?.conversation?.length).toBe(2);
  await chat.getByRole("button", { name: "举个例子", exact: true }).click();
  await expect(chat.locator(".chat-bubble.user")).toHaveCount(2);
  const queries = await page.evaluate(() => (window as unknown as { __noteAiQueries: RagQuery[] }).__noteAiQueries);
  expect(queries).toHaveLength(2);
  expect(queries.every((query) => query.question.includes(body))).toBe(true);
  expect(queries[0].context?.page_label).toContain("第 16 页");
  expect(queries[0].reference_image).toBeUndefined();
  expect(queries[1].history).toHaveLength(2);
  await expect.poll(async () => (await readStoredNotes(page)).find((note) => note.body === body)?.conversation?.length).toBe(4);
  await page.screenshot({ path: "output/text-note-ai-conversation.png" });
  await chat.getByRole("button", { name: "关闭批注 AI 对话" }).click();
  await expect(editor.locator(".source-text-note-body")).toHaveText(body);
  await editor.getByRole("button", { name: "关闭文字笔记" }).click();
  await reader.locator(".source-text-note-marker").click();
  await editor.getByRole("button", { name: "问 AI", exact: true }).click();
  await expect(chat.locator(".chat-bubble.user")).toHaveCount(2);
});

test("keeps an unsaved annotation open when storage fails and saves it on retry", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { __restoreNoteWrites: () => void }).__restoreNoteWrites = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "notes" && (value as { kind?: string }).kind === "text") throw new DOMException("Controlled storage failure", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  await reader.getByRole("button", { name: "文字笔记", exact: true }).click();
  const body = "这条批注在保存失败后仍然保留。";
  const editor = await placeTextNote(page, reader, .3, .3, body);
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("保存失败");
  await expect(editor.getByLabel("我的理解")).toHaveValue(body);
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __restoreNoteWrites: () => void }).__restoreNoteWrites());
  await editor.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(reader.locator(".source-text-note-marker")).toHaveCount(1);
  expect((await readStoredNotes(page)).some((note) => note.body === body)).toBe(true);
});

test("preserves a newer edit when a pending annotation AI answer finishes", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  await page.evaluate(async () => {
    const modulePath = "/src/api/bookcourseApi.ts";
    const { bookcourseApi } = await import(modulePath);
    bookcourseApi.queryRag = () => new Promise((resolve) => {
      (window as unknown as { __finishNoteAnswer: () => void }).__finishNoteAnswer = () => resolve({ answer: "同源染色体的分离使染色体数目减半。", citations: [], related_assets: [], confidence: "high" });
    });
  });
  await reader.getByRole("button", { name: "文字笔记", exact: true }).click();
  let editor = await placeTextNote(page, reader, .36, .36, "关于染色体数目减半的疑问。");
  await editor.getByRole("button", { name: "问 AI", exact: true }).click();
  const chat = reader.getByRole("dialog", { name: "批注 AI 对话" });
  await chat.getByRole("button", { name: "检查我的理解", exact: true }).click();
  await expect(chat.locator("[aria-busy='true']")).toBeVisible();
  await chat.getByRole("button", { name: "关闭批注 AI 对话" }).click();
  editor = reader.getByRole("region", { name: "原文文字笔记" });
  await editor.getByRole("button", { name: "编辑批注" }).click();
  const revised = "我现在理解了：同源染色体分离，染色体数目减半。";
  await editor.getByLabel("我的理解").fill(revised);
  await page.evaluate(() => (window as unknown as { __finishNoteAnswer: () => void }).__finishNoteAnswer());
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect.poll(async () => {
    const note = (await readStoredNotes(page)).find((item) => item.body === revised);
    return note?.conversation?.some((message) => message.role === "assistant");
  }).toBe(true);
});

test("draws on the original page and restores the saved stroke", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  await expect(reader.getByRole("button", { name: "钢笔" })).toBeVisible();
  await reader.getByRole("button", { name: "钢笔" }).click();
  await expect(reader).toHaveAttribute("data-annotation-active", "true");
  await expect.poll(() => reader.locator(".source-annotation-page > img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const pageGeometry = await reader.evaluate((element) => {
    const media = element.querySelector(".source-page-media")?.getBoundingClientRect();
    const viewport = element.querySelector(".source-annotation-viewport")?.getBoundingClientRect();
    return { mediaBottom: media?.bottom ?? 0, viewportBottom: viewport?.bottom ?? 0 };
  });
  expect(pageGeometry.viewportBottom).toBeLessThanOrEqual(pageGeometry.mediaBottom + 1);
  const canvas = reader.getByLabel("教材手写批注画布");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Annotation canvas is not visible");
  await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .32);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .35, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await readStoredNotes(page)).some((note) => note.kind === "ink" && Object.values(note.pages ?? {}).some((strokes) => strokes.length > 0)))
    .toBe(true);
  await expect(reader.getByRole("button", { name: "保存草稿" })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "完成并整理" })).toHaveCount(0);
  await reader.getByRole("button", { name: "钢笔" }).click();
  await expect(reader).toHaveAttribute("data-annotation-active", "false");
  await reader.getByRole("button", { name: /本页笔记/ }).click();
  await expect(reader.locator(".source-page-notes")).toContainText("手写");
  await reader.locator(".source-page-notes button").filter({ hasText: "教材批注" }).first().click();
  await expect(reader).toHaveAttribute("data-annotation-active", "true");
  const strokeCount = (await readStoredNotes(page)).filter((note) => note.kind === "ink")
    .reduce((count, note) => count + Object.values(note.pages ?? {}).reduce((sum, strokes) => sum + strokes.length, 0), 0);
  expect(strokeCount).toBeGreaterThan(1);
});

test("does not create an empty handwriting note when the pen is opened and closed", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  const before = (await readStoredNotes(page)).filter((note) => note.kind === "ink").length;
  await reader.getByRole("button", { name: "钢笔" }).click();
  await reader.getByRole("button", { name: "钢笔" }).click();
  await expect(reader).toHaveAttribute("data-annotation-active", "false");
  const after = (await readStoredNotes(page)).filter((note) => note.kind === "ink").length;
  expect(after).toBe(before);
});

test("opens the independent voice workflow with the current textbook anchor", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  await reader.getByRole("button", { name: "语音笔记" }).click();
  const voicePage = page.locator(".voice-note-screen");
  await expect(voicePage).toBeVisible();
  await expect(voicePage).toContainText("教材第 16 页");
  await voicePage.getByRole("button", { name: "使用示例录音" }).click();
  await expect(voicePage.getByText("00:08", { exact: true })).toBeVisible();
  await voicePage.getByRole("button", { name: "完成并整理" }).click();
  const transcript = voicePage.getByLabel("语音笔记逐字稿");
  await expect(transcript).toBeVisible({ timeout: 3_000 });
  await transcript.fill("我想确认减数分裂中同源染色体分离发生的时期。");
  await voicePage.getByRole("button", { name: "确认并继续整理" }).click();
  await expect(voicePage.getByRole("heading", { name: "独立整理版" })).toBeVisible({ timeout: 4_000 });
  await page.locator(".header-bar .icon-button").click();
  await expect(reader).toBeVisible();
  await reader.getByRole("button", { name: /本页笔记/ }).click();
  await expect(reader.locator(".source-page-notes")).toContainText("语音");
});

test("keeps the full-page reader and saved ink usable in landscape", async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  const { reader } = await openLessonSource(page);
  await expect(reader.locator(".source-annotation-page > img")).toBeVisible();
  await reader.getByRole("button", { name: "钢笔" }).click();
  const canvas = reader.getByLabel("教材手写批注画布");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Annotation canvas is not visible in landscape");
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .35);
  await page.mouse.up();
  await reader.getByRole("button", { name: "钢笔" }).click();
  await swipeSourcePage(page, "left");
  await expect(page.locator(".header-title p")).toHaveText("第 17 页");
  await swipeSourcePage(page, "right");
  await expect(page.locator(".header-title p")).toHaveText("第 16 页");
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
});

test("fits one source page without vertical scrolling and keeps note controls on one row", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const { reader } = await openLessonSource(page);
  await expect(reader.locator(".source-annotation-page > img")).toHaveAttribute("data-motion-image-state", "idle");
  await expect(reader.getByRole("button", { name: "上一页" })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "下一页" })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "批注本页" })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "文字笔记" })).toBeVisible();
  await expect(reader.getByRole("button", { name: "语音笔记" })).toBeVisible();
  const geometry = await reader.evaluate((element) => {
    const content = element.closest<HTMLElement>(".screen-content")!;
    const toolbar = element.querySelector<HTMLElement>(".source-reader-topbar")!;
    const pen = element.querySelector<HTMLElement>('button[aria-label="钢笔"]')!;
    const text = element.querySelector<HTMLElement>('button[aria-label="文字笔记"]')!;
    const pageFrame = element.querySelector<HTMLElement>(".source-page-frame")!;
    return {
      scrollable: content.scrollHeight > content.clientHeight + 1,
      toolbarTop: toolbar.getBoundingClientRect().top,
      penTop: pen.getBoundingClientRect().top,
      textTop: text.getBoundingClientRect().top,
      pageBottom: pageFrame.getBoundingClientRect().bottom,
      contentBottom: content.getBoundingClientRect().bottom
    };
  });
  expect(geometry.scrollable).toBe(false);
  expect(Math.abs(geometry.penTop - geometry.textTop)).toBeLessThan(8);
  expect(geometry.pageBottom).toBeLessThanOrEqual(geometry.contentBottom + 1);
  await swipeSourcePage(page, "left");
  await expect(page.locator(".header-title p")).toHaveText("第 17 页");
});
