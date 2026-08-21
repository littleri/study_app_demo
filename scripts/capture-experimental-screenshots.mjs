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
const context = await browser.newContext({
  viewport,
  colorScheme: "light",
  locale: "zh-CN",
  timezoneId: "Asia/Hong_Kong"
});
const page = await context.newPage();
let appPage;

async function prepare() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator("[data-testid='device-preview-frame']").waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate((css) => {
    const style = document.createElement("style");
    style.id = "experimental-2k-composition";
    style.textContent = css;
    document.head.append(style);
  }, compositionCss);
  const frame = page.frameLocator("iframe.device-preview-iframe");
  await frame.locator(".app-shell").waitFor({ state: "visible", timeout: 20_000 });
  appPage = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
  if (!appPage) throw new Error("The embedded application frame is unavailable");
  await page.waitForTimeout(1_000);
  return frame;
}

async function capture(name) {
  await page.screenshot({
    path: path.join(outputDirectory, `${name}-iphone-17-pro-2k.png`),
    type: "png",
    omitBackground: true
  });
}

async function waitForScreen(selector) {
  await appPage.locator(selector).waitFor({ state: "visible", timeout: 20_000 });
  await appPage.locator(".motion-screen-transition").waitFor({ state: "visible", timeout: 20_000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await appPage.locator(".motion-screen-transition").getAttribute("data-motion-state");
    if (state === "idle") break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(700);
}

async function goToScreen(screen) {
  await appPage.evaluate((nextScreen) => {
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
    if (!navigation || !navigationHook?.queue?.dispatch || typeof navigation.screen !== "string") {
      throw new Error("Unable to locate the app navigation state for static page capture");
    }
    navigationHook.queue.dispatch({
      ...navigation,
      direction: "replace",
      nonce: navigation.nonce + 1,
      screen: nextScreen
    });
  }, screen);
  await appPage.locator(`.app-shell[data-active-screen="${screen}"]`).waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(500);
}

async function advanceAssignmentToDiagnosis(app) {
  await app.locator(".assignment-judgment-options button").first().click();
  await app.locator(".assignment-primary-action .button").click();
  await app.locator(".assignment-choice-options button").nth(1).click();
  await app.locator(".assignment-primary-action .button").click();
  await app.locator(".assignment-exercise-card[data-assignment-type='short-answer']").waitFor({ state: "visible", timeout: 10_000 });
  await app.locator(".assignment-card textarea").fill("同源染色体在减数第一次分裂后期分离，姐妹染色单体在第二次分裂后期分离。");
  await app.getByRole("button", { name: "提交作业", exact: true }).click();
  await waitForScreen(".diagnosis-screen");
}

try {
  await mkdir(outputDirectory, { recursive: true });

  let app = await prepare();
  await capture("01-home");

  await app.locator("[data-home-global-action='upload']").click();
  await waitForScreen(".upload-sheet-screen");
  await capture("02-upload");

  await app.locator("input[type=file]").setInputFiles({
    name: "biology-full-page-capture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 full page screenshot fixture")
  });
  await app.getByRole("button", { name: "上传并继续", exact: true }).click();
  await waitForScreen(".parse-ready-screen");
  await capture("03-parse-ready");

  await app.getByRole("button", { name: "开始解析", exact: true }).click();
  await waitForScreen(".processing-flow-screen");
  await capture("04-processing");

  await waitForScreen(".chapter-confirm-screen");
  await capture("05-chapter-confirm");

  await app.getByRole("button", { name: "确认生成课程", exact: true }).click();
  await waitForScreen(".course-ready-screen");
  await capture("06-course-ready");

  await app.getByRole("button", { name: "进入学习", exact: true }).click();
  await waitForScreen(".book-course-screen");
  await capture("07-study");

  await goToScreen("book");
  await capture("08-book");

  await goToScreen("library");
  await waitForScreen(".library-screen");
  await capture("09-library");

  await goToScreen("profile");
  await waitForScreen(".profile-screen");
  await capture("10-profile");

  await goToScreen("plan");
  await waitForScreen(".study-plan-screen");
  await capture("11-study-plan");

  await goToScreen("notes");
  await waitForScreen(".notes-screen");
  await capture("12-notes");
  await app.getByRole("button", { name: "导出 PDF", exact: true }).click();
  await waitForScreen(".export-preview-screen");
  await capture("13-export-preview");

  await goToScreen("community");
  await waitForScreen(".community-screen");
  await capture("14-community");
  await app.locator(".community-book-card").first().click();
  await waitForScreen(".community-detail-screen");
  await capture("15-community-book");
  await app.getByRole("button", { name: "导入到我的课程", exact: true }).click();
  await waitForScreen(".community-import-screen");
  await capture("16-community-import");

  app = await prepare();
  await app.getByRole("button", { name: "继续学习", exact: true }).click();
  await waitForScreen(".lesson-screen");
  await capture("17-lesson");

  await goToScreen("assignment");
  await waitForScreen(".assignment-screen");
  await capture("18-assignment");
  await goToScreen("diagnosis");
  await waitForScreen(".diagnosis-screen");
  await capture("19-diagnosis");
  await goToScreen("mistakes");
  await waitForScreen(".mistake-book-screen");
  await capture("20-mistake-book");
  await goToScreen("flashcards");
  await waitForScreen(".flashcard-screen");
  await capture("21-flashcards");

  await goToScreen("source");
  await waitForScreen(".source-reader-screen");
  await capture("22-source-reader");

  await goToScreen("report");
  await waitForScreen(".report-screen");
  await capture("23-lesson-report");
} finally {
  await context.close();
  await browser.close();
}
