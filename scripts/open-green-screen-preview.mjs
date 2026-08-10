/* global document, window */

import { chromium } from "playwright";

const baseUrl = process.argv[2]
  || "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=fit&chrome=1";
const chromaGreen = "#00FF00";
const greenScreenCss = [
  `:root { color-scheme: light; background: ${chromaGreen} !important; }`,
  `html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: ${chromaGreen} !important; }`,
  `.device-preview-studio { width: 100vw !important; height: 100vh !important; display: grid !important; grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: minmax(0, 1fr) !important; overflow: hidden !important; background: ${chromaGreen} !important; }`,
  ".device-preview-toolbar, .device-preview-output-summary, .device-preview-status-announcer { display: none !important; }",
  `.device-preview-canvas-area, .device-preview-studio:not([data-preview-quality='fit']) .device-preview-canvas-area { grid-column: 1 !important; grid-row: 1 !important; display: grid !important; place-items: center !important; padding: 0 !important; overflow: visible !important; background: ${chromaGreen} !important; }`,
  `.device-preview-canvas { overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; background: ${chromaGreen} !important; }`,
  ".device-preview-studio .device-preview-frame--iphone-17-pro { border-radius: var(--iphone-screen-radius) !important; box-shadow: none !important; }",
  ".device-preview-studio .device-preview-frame--iphone-17-pro > .device-preview-iframe { border-radius: var(--iphone-screen-radius) !important; clip-path: inset(0 round var(--iphone-screen-radius)) !important; }"
].join("\n");

const browser = await chromium.launch({
  headless: false,
  args: ["--disable-infobars", "--disable-notifications", "--window-position=920,-36"]
});
const context = await browser.newContext({
  colorScheme: "light",
  locale: "zh-CN",
  timezoneId: "Asia/Hong_Kong",
  viewport: { width: 720, height: 1440 }
});
await context.addInitScript((css) => {
  const install = () => {
    if (window !== window.top) return;
    const style = document.createElement("style");
    style.id = "codex-manual-green-screen";
    style.textContent = css;
    document.head.appendChild(style);
    document.title = "绿幕手机预览｜当前未录制";
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}, greenScreenCss);

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
await page.locator('[data-testid="device-preview-frame"]').waitFor({ state: "visible", timeout: 15_000 });
await page.frameLocator("iframe.device-preview-iframe").locator(".app-shell").waitFor({
  state: "visible",
  timeout: 25_000
});
console.log("[ready] 绿幕手机预览已打开；当前未录制，关闭浏览器窗口即可退出。");

await new Promise((resolve) => browser.on("disconnected", resolve));
