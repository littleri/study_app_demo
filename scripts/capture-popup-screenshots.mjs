import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "output", "frontend-popups-2k-2026-08-10");
const viewport = { width: 1440, height: 2880 };
const phone = { width: 402, height: 874, scale: 2.72 };
const left = (viewport.width - phone.width * phone.scale) / 2;
const top = (viewport.height - phone.height * phone.scale) / 2;
const baseUrl = "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=1";

const compositionCss = [
  ":root,html,body,#root{width:100%!important;height:100%!important;margin:0!important;overflow:hidden!important;background:transparent!important;}",
  ".device-preview-studio{position:fixed!important;inset:0!important;width:1440px!important;height:2880px!important;display:block!important;overflow:hidden!important;background:transparent!important;}",
  ".device-preview-toolbar,.device-preview-output-summary,.device-preview-status-announcer{display:none!important;}",
  ".device-preview-canvas-area{position:absolute!important;inset:0!important;display:block!important;padding:0!important;overflow:visible!important;background:transparent!important;}",
  ".device-preview-canvas{position:absolute!important;inset:0!important;width:1440px!important;height:2880px!important;overflow:visible!important;background:transparent!important;box-shadow:none!important;border:0!important;}",
  `.device-preview-frame--iphone-17-pro{left:${left}px!important;top:${top}px!important;width:${phone.width}px!important;height:${phone.height}px!important;transform:scale(${phone.scale})!important;transform-origin:top left!important;background:transparent!important;box-shadow:none!important;}`,
  ".device-preview-frame--iphone-17-pro > .device-preview-screen-clip{background:#f8fcff!important;}",
  ".device-preview-bezel{box-shadow:0 0 0 2px rgba(246,249,252,.7),inset 0 0 0 2px rgba(30,40,52,.36)!important;}",
  "*,*::before,*::after{cursor:none!important;}"
].join("\n");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport, colorScheme: "light", locale: "zh-CN", timezoneId: "Asia/Hong_Kong" });
const page = await context.newPage();
let app;

async function prepare() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("[data-testid='device-preview-frame']").waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate((css) => {
    const style = document.createElement("style");
    style.id = "popup-2k-composition";
    style.textContent = css;
    document.head.append(style);
  }, compositionCss);
  app = page.frames().find((frame) => frame.url().includes("embedded=device-preview"));
  if (!app) throw new Error("The embedded application frame is unavailable");
  await app.locator(".app-shell").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(800);
}

async function capture(name) {
  await page.screenshot({ path: path.join(outputDirectory, `${name}-iphone-17-pro-2k.png`), type: "png", omitBackground: true });
}

async function waitFor(selector) {
  await app.locator(selector).waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(650);
}

async function setAppState(kind, value) {
  await app.evaluate(({ kind, value }) => {
    const root = document.querySelector("#root");
    const key = root && Object.keys(root).find((candidate) => candidate.startsWith("__reactContainer$") || candidate.startsWith("__reactFiber$"));
    const start = key && root && root[key];
    const visited = new Set();
    const findApp = (fiber) => {
      if (!fiber || visited.has(fiber)) return null;
      visited.add(fiber);
      if (fiber.type?.name === "App") return fiber;
      return findApp(fiber.child) ?? findApp(fiber.sibling) ?? findApp(fiber.alternate);
    };
    const appFiber = findApp(start?.current ?? start);
    const candidates = [appFiber, appFiber?.alternate].filter(Boolean);
    let navigationHook = null;
    for (const candidate of candidates) {
      let hook = candidate.memoizedState;
      while (hook) {
        if (hook.memoizedState && typeof hook.memoizedState.screen === "string" && hook.queue?.dispatch) {
          navigationHook = hook;
          break;
        }
        hook = hook.next;
      }
      if (navigationHook) break;
    }
    if (!navigationHook) throw new Error("Unable to locate the app state for popup capture");
    let hook = navigationHook;
    const offset = kind === "navigation" ? 0 : kind === "sheet" ? 1 : 7;
    for (let index = 0; index < offset; index += 1) hook = hook?.next;
    if (!hook?.queue?.dispatch) throw new Error(`Unable to locate the ${kind} state`);
    const current = hook.memoizedState;
    const next = kind === "navigation" ? { ...current, direction: "replace", nonce: current.nonce + 1, screen: value } : value;
    hook.queue.dispatch(next);
  }, { kind, value });
  await page.waitForTimeout(700);
}

async function closeSheet() {
  await setAppState("sheet", null);
  await app.locator(".sheet-overlay").waitFor({ state: "hidden", timeout: 10_000 });
}

try {
  await mkdir(outputDirectory, { recursive: true });
  await prepare();

  await app.locator("[data-home-global-action='upload']").click();
  await waitFor(".upload-sheet-screen");
  await app.locator("input[type=file]").setInputFiles({ name: "popup-capture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 popup capture fixture") });
  await app.getByRole("button", { name: "上传并继续", exact: true }).click();
  await waitFor(".parse-ready-screen");
  await app.getByRole("button", { name: "开始解析", exact: true }).click();
  await waitFor(".processing-flow-screen");
  await waitFor(".chapter-confirm-screen");

  await app.locator(".toc-entry-title").first().click();
  await waitFor(".sheet[data-sheet-type='editChapter']");
  await capture("01-edit-chapter-sheet");
  await closeSheet();

  await setAppState("navigation", "study");
  await waitFor(".study-screen");
  await app.locator(".study-book-switch").click();
  await waitFor(".sheet[data-sheet-type='bookSwitcher']");
  await capture("02-book-switcher-sheet");
  await closeSheet();

  await setAppState("sheet", { type: "chat" });
  await waitFor(".sheet[data-sheet-type='chat']");
  await capture("03-chat-sheet");
  await closeSheet();

  await setAppState("sheet", {
    type: "source",
    title: "减数分裂示意图",
    page: "教材第 16 页",
    image: "/assets/textbook/biology-cover.webp",
    text: "减数分裂包括两次连续分裂。\n\n同源染色体在第一次分裂后期分离。"
  });
  await waitFor(".sheet[data-sheet-type='source']");
  await capture("04-source-sheet");
  await closeSheet();

  await setAppState("sheet", { type: "note", concept: "同源染色体", explanation: "梳理概念定义、配对方式与减数分裂中的关键作用。", sourceLabel: "教材第 16 页" });
  await waitFor(".sheet[data-sheet-type='note']");
  await capture("05-concept-note-sheet");
  await closeSheet();

  await setAppState("sheet", { type: "note", kind: "selection", concept: "减数分裂", quote: "同源染色体在减数第一次分裂后期分离。", sourceLabel: "教材第 16 页" });
  await waitFor(".sheet[data-sheet-type='note']");
  await capture("06-selection-note-sheet");
  await closeSheet();

  await setAppState("navigation", "community");
  await waitFor(".community-screen");
  await app.getByLabel("搜索课程", { exact: true }).click();
  await waitFor(".community-search-keyboard");
  await capture("07-community-search-keyboard");

  await setAppState("navigation", "profile");
  await waitFor(".profile-screen");
  await app.locator("button[aria-label='打开 AI 助手']").click();
  await waitFor("#ai-assistant-dialog");
  await capture("08-ai-assistant-dialog");

  await app.locator(".ai-close").click();
  await app.locator("#ai-assistant-dialog").waitFor({ state: "hidden", timeout: 10_000 });

  await setAppState("toast", { id: 101, text: "已保存到导学笔记", tone: "success" });
  await waitFor(".toast-success");
  await capture("09-success-toast");
  await setAppState("toast", { id: 102, text: "已加入复习队列", tone: "info" });
  await waitFor(".toast-info");
  await capture("10-info-toast");
  await setAppState("toast", { id: 103, text: "当前操作需要先完成教材解析", tone: "warning" });
  await waitFor(".toast-warning");
  await capture("11-warning-toast");
} finally {
  await context.close();
  await browser.close();
}
