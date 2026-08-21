import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "output", "composition-probe");
const viewport = { width: 1440, height: 2880 };
const green = "#00FF00";
// Deliberately smaller than the former 73/108 px-margin layout so player
// overscan or a conservative post crop retains the entire phone shell.
const scale = 2.72;
const logical = { width: 402, height: 874 };
const left = (viewport.width - logical.width * scale) / 2;
const top = (viewport.height - logical.height * scale) / 2;
const url = "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=1";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport, locale: "zh-CN", timezoneId: "Asia/Hong_Kong", colorScheme: "light" });
const page = await context.newPage();
let report;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator('[data-testid="device-preview-frame"]').waitFor({ state: "visible", timeout: 20_000 });
  const css = [
    `:root,html,body,#root{width:100%!important;height:100%!important;margin:0!important;overflow:hidden!important;background:${green}!important;}`,
    `.device-preview-studio{position:fixed!important;inset:0!important;width:${viewport.width}px!important;height:${viewport.height}px!important;display:block!important;overflow:hidden!important;background:${green}!important;}`,
    `.device-preview-toolbar,.device-preview-output-summary,.device-preview-status-announcer{display:none!important;}`,
    `.device-preview-canvas-area{position:absolute!important;inset:0!important;display:block!important;padding:0!important;overflow:visible!important;background:${green}!important;}`,
    `.device-preview-canvas{position:absolute!important;inset:0!important;width:${viewport.width}px!important;height:${viewport.height}px!important;overflow:visible!important;background:${green}!important;box-shadow:none!important;border:0!important;}`,
    `.device-preview-frame--iphone-17-pro{left:${left}px!important;top:${top}px!important;width:${logical.width}px!important;height:${logical.height}px!important;transform:scale(${scale})!important;transform-origin:top left!important;background:${green}!important;box-shadow:none!important;}`,
    `.device-preview-bezel{box-shadow:0 0 0 2px rgba(246,249,252,.7),inset 0 0 0 2px rgba(30,40,52,.36)!important;}`,
    `*,*::before,*::after{cursor:none!important;}`
  ].join("\n");
  await page.evaluate((styleText) => { const style = document.createElement("style"); style.id = "promo-composition-probe-style"; style.textContent = styleText; document.head.append(style); }, css);
  const frame = page.frameLocator('iframe[title="BookCourse AI 设备预览内层应用"]');
  await frame.locator(".home-dashboard").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(700);
  report = await page.evaluate(({ expected }) => {
    const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const bezel = document.querySelector('[data-testid="device-preview-bezel"]');
    const controls = Array.from(document.querySelectorAll('[data-hardware-control]'));
    const pieces = [bezel, ...controls].filter(Boolean).map(rect);
    const shell = { left: Math.min(...pieces.map((r) => r.left)), right: Math.max(...pieces.map((r) => r.right)), top: Math.min(...pieces.map((r) => r.top)), bottom: Math.max(...pieces.map((r) => r.bottom)) };
    shell.width = shell.right - shell.left; shell.height = shell.bottom - shell.top;
    const canvas = document.querySelector('[data-testid="device-preview-canvas"]');
    const outer = { width: window.innerWidth, height: window.innerHeight };
    const margins = { left: shell.left, right: outer.width - shell.right, top: shell.top, bottom: outer.height - shell.bottom };
    const centers = { x: shell.left + shell.width / 2, y: shell.top + shell.height / 2, targetX: outer.width / 2, targetY: outer.height / 2 };
    return { canvas: { declaredWidth: Number(canvas.getAttribute("data-canvas-width")), declaredHeight: Number(canvas.getAttribute("data-canvas-height")) }, outer, bezel: rect(bezel), hardwareControls: controls.map((node) => ({ id: node.getAttribute("data-hardware-control"), ...rect(node) })), shellBBox: shell, margins, center: { ...centers, errorX: Math.abs(centers.x - centers.targetX), errorY: Math.abs(centers.y - centers.targetY) }, expected };
  }, { expected: { scale, frameLeft: left, frameTop: top, green } });
  const accepted = report.canvas.declaredWidth === 1206 && report.canvas.declaredHeight === 2622 && report.outer.width === 1440 && report.outer.height === 2880 && report.center.errorX <= 2 && report.center.errorY <= 2 && report.shellBBox.width <= 1200 && report.shellBBox.height >= 2440 && report.shellBBox.height <= 2500 && report.margins.left >= 120 && report.margins.right >= 120 && report.margins.top >= 190 && report.margins.bottom >= 190;
  report.accepted = accepted;
  const png = path.join(output, `14-17-composition-probe-${stamp}.png`);
  await mkdir(output, { recursive: true }); await page.screenshot({ path: png, type: "png" });
  report.png = png;
  report.json = path.join(output, `14-17-composition-probe-${stamp}.json`);
  await writeFile(report.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!accepted) throw new Error(`Composition probe rejected: ${JSON.stringify(report)}`);
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); await browser.close(); }
