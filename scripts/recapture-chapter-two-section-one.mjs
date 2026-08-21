import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "output", "frontend-pages-2k-2026-08-10");
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

async function capture(name) {
  await page.screenshot({
    path: path.join(outputDirectory, `${name}-iphone-17-pro-2k.png`),
    type: "png",
    omitBackground: true
  });
}

async function goToScreen(app, screen) {
  await app.evaluate((nextScreen) => {
    const root = document.querySelector("#root");
    const fiberKey = root && Object.keys(root).find((key) => key.startsWith("__reactContainer$") || key.startsWith("__reactFiber$"));
    const rootFiber = fiberKey && root && root[fiberKey];
    const visited = new Set();
    const findApp = (fiber) => {
      if (!fiber || visited.has(fiber)) return null;
      visited.add(fiber);
      if (fiber.type?.name === "App") return fiber;
      return findApp(fiber.child) ?? findApp(fiber.sibling) ?? findApp(fiber.alternate);
    };
    const appFiber = findApp(rootFiber?.current ?? rootFiber);
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
    const navigation = navigationHook?.memoizedState;
    if (!navigation || !navigationHook?.queue?.dispatch) throw new Error("Unable to find navigation state");
    navigationHook.queue.dispatch({ ...navigation, direction: "replace", nonce: navigation.nonce + 1, screen: nextScreen });
  }, screen);
  await app.locator(`.app-shell[data-active-screen="${screen}"]`).waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(900);
}

try {
  await mkdir(outputDirectory, { recursive: true });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("[data-testid='device-preview-frame']").waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate((css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
  }, compositionCss);

  const app = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
  if (!app) throw new Error("The embedded application frame is unavailable");
  await app.locator(".home-dashboard").waitFor({ state: "visible", timeout: 20_000 });
  await app.locator(".home-primary-action").waitFor({ state: "visible", timeout: 20_000 });
  await app.locator(".home-primary-action").click();

  const lessonTitle = app.locator(".lesson-introduction #lesson-article-title");
  await lessonTitle.waitFor({ state: "visible", timeout: 20_000 });
  await lessonTitle.filter({ hasText: /减数分裂和受精作用/ }).waitFor({ state: "visible", timeout: 20_000 });
  await app.locator(".lesson-introduction .lesson-source-link").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(900);
  await capture("17-lesson");

  await goToScreen(app, "assignment");
  await app.locator(".assignment-screen").waitFor({ state: "visible", timeout: 20_000 });
  await capture("18-assignment");

  await goToScreen(app, "flashcards");
  await app.locator(".flashcard-screen").waitFor({ state: "visible", timeout: 20_000 });
  await capture("21-flashcards");

  await goToScreen(app, "mistakes");
  await app.locator(".mistake-book-screen").waitFor({ state: "visible", timeout: 20_000 });
  await capture("20-mistake-book");

  await goToScreen(app, "lesson");
  await app.locator(".lesson-introduction .lesson-source-link").waitFor({ state: "visible", timeout: 20_000 });
  await app.locator(".lesson-introduction .lesson-source-link").click();
  const sourceSheet = app.locator(".sheet[data-sheet-type='source']");
  await sourceSheet.waitFor({ state: "visible", timeout: 20_000 });
  await sourceSheet.locator("button").filter({ hasText: /全屏阅读教材/ }).click();
  const sourceTitle = app.locator(".source-reader-summary h2");
  await sourceTitle.waitFor({ state: "visible", timeout: 20_000 });
  await sourceTitle.filter({ hasText: /减数分裂/ }).waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(900);
  await capture("22-source-reader");
} finally {
  await context.close();
  await browser.close();
}
