/* global document, window */
// Deterministic, UI-only recording of BookCourse AI promo sections 14–17.
// The diagnostic state is prepared before the first trim point, so no setup
// clicks, desktop UI, or file chooser is part of the deliverable media.
import { chromium } from "playwright";
import { mkdir, readFile, readdir, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const movies = path.join(root, "movies");
const sourceDir = path.join(root, "output", "recording-source");
const rehearsalDir = path.join(root, "output", "recording-rehearsal", "14-17-diagnosis-plan-outro");
const stagingRoot = path.join(root, "output", "recording-staging");
const ffmpeg = path.join(root, "output", "video-tools", "node_modules", "ffmpeg-static", "ffmpeg.exe");
const url = "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=1";
const viewport = { width: 1440, height: 2880 };
const green = "#00FF00";
// The exterior shell deliberately leaves extra chroma-key/crop safety: the
// probe constrains the complete shell (including buttons) to about 1200×2500
// px, with >=120 px left/right and >=190 px top/bottom green margin.
const compositionScale = 2.72;
const compositionFrame = {
  width: 402,
  height: 874,
  left: (viewport.width - 402 * compositionScale) / 2,
  top: (viewport.height - 874 * compositionScale) / 2
};
const rehearsal = process.argv.includes("--rehearse");
const speed = rehearsal ? 0.12 : 1;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(18, Math.round(ms * speed))));
const now = () => performance.now();
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const sectionDefinitions = [
  { id: "14", slug: "diagnosis", name: "AI 学习诊断", target: [16, 26] },
  { id: "15", slug: "mistake-review", name: "错题复习", target: [18, 24] },
  { id: "16", slug: "plan-community", name: "学习计划与社区资源蒙太奇", target: [18, 28] },
  { id: "17", slug: "brand-outro", name: "品牌收尾", target: [10, 14] }
];

async function run(args, label) {
  console.log(`[ffmpeg] ${label}`);
  await exec(ffmpeg, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase();
}

async function inspect(file) {
  const { stderr = "" } = await exec(ffmpeg, ["-hide_banner", "-i", file, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024
  }).catch((error) => error);
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const stream = /Video:\s*([^,]+).*?,\s*(\d+)x(\d+)[^\r\n]*?(\d+(?:\.\d+)?)\s*fps/.exec(stderr);
  return {
    codec: stream?.[1]?.trim() ?? null,
    width: Number(stream?.[2]), height: Number(stream?.[3]), fps: Number(stream?.[4]),
    durationSeconds: duration ? Number((Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])).toFixed(3)) : null,
    hasAudio: /Audio:/.test(stderr)
  };
}

async function nextTake(stem) {
  const names = await readdir(movies).catch(() => []);
  const regex = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-take(\\d{2})\\.`);
  return 1 + names.reduce((highest, name) => Math.max(highest, Number(regex.exec(name)?.[1] ?? 0)), 0);
}

// Every section in one recording pass has one shared take number.  Scan all
// 14–17 artifacts (including stills) so an interrupted pass can never cause
// a later pass to overwrite its diagnostics or key frames.
async function nextGlobalTake() {
  const names = await readdir(movies).catch(() => []);
  const taken = names.map((name) => Number(/^(?:14-diagnosis|15-mistake-review|16-plan-community|17-brand-outro)-take(\d{2})(?:[-.]|$)/.exec(name)?.[1] ?? 0));
  return Math.max(0, ...taken) + 1;
}

async function must(locator, timeout = 18_000) {
  await locator.waitFor({ state: "visible", timeout });
  return locator;
}

async function setGreenLayout(page) {
  const css = [
    `:root,html,body,#root{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:${green}!important;}`,
    `.device-preview-studio{position:fixed!important;inset:0!important;width:${viewport.width}px!important;height:${viewport.height}px!important;display:block!important;overflow:hidden!important;background:${green}!important;}`,
    `.device-preview-toolbar,.device-preview-output-summary,.device-preview-status-announcer{display:none!important;}`,
    `.device-preview-canvas-area{position:absolute!important;inset:0!important;display:block!important;padding:0!important;overflow:visible!important;background:${green}!important;}`,
    `.device-preview-canvas{position:absolute!important;inset:0!important;width:${viewport.width}px!important;height:${viewport.height}px!important;overflow:visible!important;background:${green}!important;box-shadow:none!important;border:0!important;}`,
    // The frame's default black background leaks through the physical-shell
    // corner bleed.  Key it to the exterior green instead; the bezel's own
    // pseudo-element still paints the intentional black inner phone ring.
    `.device-preview-frame--iphone-17-pro{left:${compositionFrame.left}px!important;top:${compositionFrame.top}px!important;width:${compositionFrame.width}px!important;height:${compositionFrame.height}px!important;transform:scale(${compositionScale})!important;transform-origin:top left!important;background:${green}!important;box-shadow:none!important;}`,
    `.device-preview-bezel{box-shadow:0 0 0 2px rgba(246,249,252,.7),inset 0 0 0 2px rgba(30,40,52,.36)!important;}`,
    `*,*::before,*::after{cursor:none!important;}`
  ].join("\n");
  await page.evaluate((styleText) => {
    const old = document.querySelector("#promo-14-17-green-layout");
    old?.remove();
    const style = document.createElement("style"); style.id = "promo-14-17-green-layout"; style.textContent = styleText;
    document.head.append(style);
  }, css);
  await must(page.locator('[data-testid="device-preview-frame"]'));
  const canvas = page.locator('[data-testid="device-preview-canvas"]');
  await must(canvas);
  const dimensions = await canvas.evaluate((element) => {
    const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const bezel = document.querySelector('[data-testid="device-preview-bezel"]');
    const controls = Array.from(document.querySelectorAll('[data-hardware-control]'));
    const pieces = [bezel, ...controls].filter(Boolean).map(rect);
    const shellBBox = { left: Math.min(...pieces.map((r) => r.left)), right: Math.max(...pieces.map((r) => r.right),), top: Math.min(...pieces.map((r) => r.top)), bottom: Math.max(...pieces.map((r) => r.bottom)) };
    shellBBox.width = shellBBox.right - shellBBox.left; shellBBox.height = shellBBox.bottom - shellBBox.top;
    const margins = { left: shellBBox.left, right: window.innerWidth - shellBBox.right, top: shellBBox.top, bottom: window.innerHeight - shellBBox.bottom };
    const center = { x: shellBBox.left + shellBBox.width / 2, y: shellBBox.top + shellBBox.height / 2 };
    return { internalWidth: Number(element.getAttribute("data-canvas-width")), internalHeight: Number(element.getAttribute("data-canvas-height")), outputWidth: window.innerWidth, outputHeight: window.innerHeight, shellBBox, margins, centerErrorX: Math.abs(center.x - window.innerWidth / 2), centerErrorY: Math.abs(center.y - window.innerHeight / 2) };
  });
  const accepted = dimensions.internalWidth === 1206 && dimensions.internalHeight === 2622 && dimensions.outputWidth === 1440 && dimensions.outputHeight === 2880 && dimensions.centerErrorX <= 2 && dimensions.centerErrorY <= 2 && dimensions.shellBBox.width <= 1200 && dimensions.shellBBox.height >= 2440 && dimensions.shellBBox.height <= 2500 && dimensions.margins.left >= 120 && dimensions.margins.right >= 120 && dimensions.margins.top >= 190 && dimensions.margins.bottom >= 190;
  if (!accepted) throw new Error(`iPhone composition mismatch: ${JSON.stringify(dimensions)}`);
  return dimensions;
}

async function installTouchCue(frame) {
  await frame.locator("body").evaluate(() => {
    const previous = document.querySelector("#promo-14-17-touch-style"); previous?.remove();
    document.querySelectorAll("#promo-touch-ring,#promo-touch-ripple").forEach((node) => node.remove());
    const style = document.createElement("style"); style.id = "promo-14-17-touch-style";
    style.textContent = `
      #promo-touch-ring,#promo-touch-ripple{position:fixed;z-index:2147483647;left:0;top:0;border-radius:999px;pointer-events:none;opacity:0;transform:translate(-50%,-50%)}
      #promo-touch-ring{width:40px;height:40px;border:4px solid #8B5CFF;background:transparent;box-shadow:0 0 0 3px rgba(255,255,255,.94),0 0 20px rgba(130,76,255,.85);transition:opacity .14s ease,transform .42s cubic-bezier(.22,1,.36,1)}
      #promo-touch-ring.is-visible{opacity:1}.#promo-touch-ring{}
      #promo-touch-ring.is-pressed{transform:translate(-50%,-50%) scale(.78)}
      #promo-touch-ripple{width:42px;height:42px;border:4px solid rgba(139,92,255,.98);background:transparent}
      #promo-touch-ripple.is-rippling{animation:promoTouchRipple .62s cubic-bezier(.16,1,.3,1) both}
      @keyframes promoTouchRipple{0%{opacity:1;transform:translate(-50%,-50%) scale(.72)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.35)}}
      [data-promo-touch-target]{position:relative!important;overflow:visible!important;outline:3px solid rgba(139,92,255,.96)!important;outline-offset:3px!important;box-shadow:0 0 0 7px rgba(139,92,255,.24)!important;transition:outline-color .12s ease,box-shadow .12s ease!important}
      [data-promo-touch-target]::before,[data-promo-touch-target]::after{content:"";position:absolute;pointer-events:none;left:50%;top:50%;border-radius:999px;transform:translate(-50%,-50%);z-index:20}
      [data-promo-touch-target]::before{width:38px;height:38px;border:4px solid #8B5CFF;background:transparent;box-shadow:0 0 0 3px rgba(255,255,255,.94),0 0 20px rgba(130,76,255,.85)}
      [data-promo-touch-target][data-promo-touch-click]::after{width:42px;height:42px;border:4px solid rgba(139,92,255,.98);animation:promoTouchRipple .62s cubic-bezier(.16,1,.3,1) both}
    `;
    document.head.append(style);
    for (const id of ["promo-touch-ring", "promo-touch-ripple"]) { const node = document.createElement("i"); node.id = id; node.setAttribute("aria-hidden", "true"); document.body.append(node); }
  });
}

async function cueClick(frame, locator, label, clicks, startedAt) {
  await must(locator); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.hover();
  const point = await locator.evaluate((element) => {
    document.querySelectorAll("[data-promo-touch-target]").forEach((node) => { node.removeAttribute("data-promo-touch-target"); node.removeAttribute("data-promo-touch-click"); });
    element.setAttribute("data-promo-touch-target", "");
    const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await frame.locator("body").evaluate(({ x, y }) => {
    for (const id of ["promo-touch-ring", "promo-touch-ripple"]) { const node = document.querySelector(`#${id}`); node.style.left = `${x}px`; node.style.top = `${y}px`; }
    document.querySelector("#promo-touch-ring").className = "is-visible";
  }, point);
  await sleep(520);
  await frame.locator("body").evaluate(() => {
    const ring = document.querySelector("#promo-touch-ring"); ring.className = "is-visible is-pressed";
    const ripple = document.querySelector("#promo-touch-ripple"); ripple.className = ""; void ripple.getBoundingClientRect(); ripple.className = "is-rippling";
    document.querySelector("[data-promo-touch-target]")?.setAttribute("data-promo-touch-click", "");
  });
  await sleep(140);
  await locator.click();
  clicks.push({ label, atSeconds: Number(((now() - startedAt) / 1000).toFixed(3)), visual: "purple hollow ring + expanding purple ripple" });
  await sleep(360);
  await frame.locator("body").evaluate(() => {
    document.querySelector("#promo-touch-ring").className = "";
    document.querySelectorAll("[data-promo-touch-target]").forEach((node) => { node.removeAttribute("data-promo-touch-target"); node.removeAttribute("data-promo-touch-click"); });
  });
}

async function smoothTo(locator, duration = 1400) {
  await must(locator); await locator.evaluate((element, milliseconds) => new Promise((resolve) => {
    const scroller = element.closest("main.screen-content") || document.querySelector("main.screen-content");
    const rect = element.getBoundingClientRect(); const from = scroller.scrollTop;
    const target = Math.max(0, rect.top + scroller.scrollTop - 180);
    const start = performance.now();
    const frame = (time) => { const p = Math.min(1, (time - start) / milliseconds); const eased = p * p * (3 - 2 * p); scroller.scrollTop = from + (target - from) * eased; p < 1 ? requestAnimationFrame(frame) : resolve(); };
    requestAnimationFrame(frame);
  }), duration * speed);
}

async function normalClick(locator) { await must(locator); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.click(); }

async function createDiagnosisState(frame) {
  // This is deliberately before the first delivery trim point.
  await normalClick(frame.getByRole("button", { name: "继续学习", exact: true }));
  await must(frame.locator(".lesson-screen")); await sleep(500);
  // The chapter tool card is the deterministic entry to its three-question
  // exercise; returning here is setup only and is trimmed out of every take.
  await normalClick(frame.getByRole("button", { name: "返回", exact: true }));
  await must(frame.locator(".home-dashboard"));
  await normalClick(frame.locator('[data-tool="assignment"]'));
  const exercise = frame.locator(".assignment-exercise-card"); await must(exercise);
  await normalClick(exercise.getByRole("button", { name: "正确", exact: true }));
  await normalClick(exercise.getByRole("button", { name: /提交判断题答案并进入下一题/ }));
  await must(exercise.getByRole("button", { name: /同源染色体分离/ }));
  await normalClick(exercise.getByRole("button", { name: /同源染色体分离/ }));
  await normalClick(exercise.getByRole("button", { name: /提交选择题答案并进入下一题/ }));
  const answer = exercise.locator("textarea"); await must(answer); await answer.fill("减数第一次分裂时，同源染色体分离，因此形成的子细胞中染色体数目减半。");
  await normalClick(exercise.getByRole("button", { name: "提交作业", exact: true }));
  await must(frame.locator(".diagnosis-screen"), 25_000); await sleep(1_000);
}

async function brandOverlay(frame) {
  await frame.locator("body").evaluate(() => {
    const existing = document.querySelector("#promo-brand-outro-overlay"); existing?.remove();
    const style = document.createElement("style"); style.id = "promo-brand-outro-overlay-style";
    style.textContent = `#promo-brand-outro-overlay{position:fixed;inset:0;z-index:2000000000;display:flex;align-items:center;justify-content:center;background:rgba(246,248,255,.955);opacity:0;transition:opacity .7s ease}#promo-brand-outro-overlay.is-visible{opacity:1}#promo-brand-outro-card{width:min(84%,680px);text-align:center;color:#18223b}#promo-brand-outro-mark{margin:0 auto 22px;width:110px;height:110px;border-radius:34px;background:linear-gradient(145deg,#8b5cff,#5c3dd9);display:grid;place-items:center;color:white;font:800 54px/1 system-ui;box-shadow:0 18px 40px rgba(108,68,230,.32)}#promo-brand-outro-card h2{margin:0;font:800 43px/1.2 system-ui;letter-spacing:-1px}#promo-brand-outro-card p{margin:16px auto 28px;max-width:580px;font:600 22px/1.55 system-ui;color:#59637a}.promo-brand-tags{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}.promo-brand-tags span{padding:10px 14px;border-radius:999px;background:#f0eaff;color:#6741d3;border:1px solid #d8caff;font:700 16px/1.2 system-ui}`;
    document.head.append(style);
    const overlay = document.createElement("section"); overlay.id = "promo-brand-outro-overlay"; overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `<div id="promo-brand-outro-card"><div id="promo-brand-outro-mark">B</div><h2>BookCourse AI</h2><p>让每一本教材，都成为真正属于你的课程</p><div class="promo-brand-tags"><span>AI 课程</span><span>原文溯源</span><span>知识闪卡</span><span>章节练习</span><span>学习诊断</span></div></div>`;
    document.body.append(overlay); requestAnimationFrame(() => overlay.classList.add("is-visible"));
  });
}

const sectionTimes = new Map();
const clickEvents = [];
const keyStills = {};
function startSection(id, origin) { sectionTimes.set(id, { start: now(), origin }); }
function endSection(id) { sectionTimes.get(id).end = now(); }

const browser = await chromium.launch({ headless: true });
const runStamp = stamp();
const stage = path.join(stagingRoot, `promo-14-17-${runStamp}`);
const outputDir = rehearsal ? rehearsalDir : movies;
await mkdir(outputDir, { recursive: true });
if (!rehearsal) { await mkdir(stage, { recursive: true }); await mkdir(sourceDir, { recursive: true }); }
const formalTake = rehearsal ? null : await nextGlobalTake();
const takeLabel = rehearsal ? `rehearsal-${runStamp}` : `take${String(formalTake).padStart(2, "0")}`;
const context = await browser.newContext({ viewport, locale: "zh-CN", timezoneId: "Asia/Hong_Kong", colorScheme: "light", reducedMotion: "no-preference", recordVideo: rehearsal ? undefined : { dir: stage, size: viewport } });
// Playwright begins its recorded page timeline while the preview loads. Keep
// this monotonic origin so every later section is trimmed against the actual
// WebM timeline, not against the post-setup editorial origin.
const videoClockStarted = now();
const page = await context.newPage(); const recordedVideo = page.video();
let frame; let completed = false; let origin = null; let canvas = null; const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  canvas = await setGreenLayout(page);
  frame = page.frameLocator('iframe[title="BookCourse AI 设备预览内层应用"]');
  await must(frame.locator(".home-dashboard")); await installTouchCue(frame); await createDiagnosisState(frame);
  origin = now();

  // 14｜AI 学习诊断
  startSection("14", origin); await sleep(2_600);
  const diagnosticDetail = frame.getByText(/为什么会卡住|诊断解析/).first(); await smoothTo(diagnosticDetail, 1_700); await sleep(2_300);
  const mistakesButton = frame.getByRole("button", { name: "查看错题本", exact: true }); await smoothTo(mistakesButton, 900); await sleep(650);
  await cueClick(frame, mistakesButton, "查看错题本", clickEvents, origin); await must(frame.locator(".mistake-book-screen")); await sleep(2_500);
  await page.screenshot({ path: path.join(outputDir, `14-diagnosis-${takeLabel}-key.png`), type: "png" });
  keyStills["14"] = path.join(outputDir, `14-diagnosis-${takeLabel}-key.png`); endSection("14");

  // 15｜错题复习
  startSection("15", origin); await sleep(2_400);
  await cueClick(frame, frame.getByRole("button", { name: /开始今日复习|再复习一轮/ }), "开始今日复习", clickEvents, origin); await must(frame.locator(".mistake-review-screen")); await sleep(1_600);
  const fillLast = frame.getByRole("button", { name: "填入上次答案", exact: true }); await cueClick(frame, fillLast, "填入上次答案", clickEvents, origin); await sleep(700);
  await cueClick(frame, frame.getByRole("button", { name: "提交并对照", exact: true }), "提交并对照", clickEvents, origin); await sleep(1_400);
  await cueClick(frame, frame.getByRole("button", { name: "概念混淆", exact: true }), "选择错因：概念混淆", clickEvents, origin); await sleep(1_400);
  const learningRating = frame.locator('.mistake-mastery-rating button[data-tone="warning"]');
  await learningRating.scrollIntoViewIfNeeded(); await sleep(900);
  await cueClick(frame, learningRating, "标记巩固中", clickEvents, origin); await sleep(2_500);
  await page.screenshot({ path: path.join(outputDir, `15-mistake-review-${takeLabel}-key.png`), type: "png" });
  keyStills["15"] = path.join(outputDir, `15-mistake-review-${takeLabel}-key.png`); endSection("15");

  // Navigate to plan outside the 16 trim point; these three back transitions
  // unwind mistakes → diagnosis → assignment → home and are not delivered.
  await normalClick(frame.getByRole("button", { name: "返回", exact: true })); await must(frame.locator(".diagnosis-screen"));
  await normalClick(frame.getByRole("button", { name: "返回", exact: true })); await must(frame.locator(".assignment-screen"));
  await normalClick(frame.getByRole("button", { name: "返回", exact: true })); await must(frame.locator(".home-dashboard"));
  await normalClick(frame.locator('[data-home-global-action="plan"]')); await must(frame.locator(".study-plan-screen")); await sleep(1_300);

  // 16｜学习计划与社区资源蒙太奇
  startSection("16", origin); await sleep(2_000);
  // DemoRepository's deterministic plan has its chapter-2 weak-point task on Day 6.
  const daySix = frame.getByRole("button", { name: "第 6 天", exact: true }); await cueClick(frame, daySix, "第 6 天", clickEvents, origin); await sleep(1_600);
  const task = frame.locator(".timeline-item").first(); await cueClick(frame, task, "完成第 6 天任务", clickEvents, origin); await sleep(2_000);
  // The navigation itself is a visible, cued interaction and acts as the montage cut point.
  await cueClick(frame, frame.getByRole("button", { name: "返回", exact: true }), "返回首页", clickEvents, origin); await must(frame.locator(".home-dashboard")); await sleep(900);
  await cueClick(frame, frame.getByRole("button", { name: "社区", exact: true }), "社区", clickEvents, origin); await must(frame.locator(".community-screen")); await sleep(1_900);
  const recommended = frame.locator(".community-book-card").first(); await cueClick(frame, recommended, "打开推荐教材", clickEvents, origin); await must(frame.locator(".community-detail-screen")); await sleep(2_500);
  await page.screenshot({ path: path.join(outputDir, `16-plan-community-${takeLabel}-key.png`), type: "png" });
  keyStills["16"] = path.join(outputDir, `16-plan-community-${takeLabel}-key.png`); endSection("16");

  // Set up the clean Home base outside the final segment.
  await normalClick(frame.getByRole("button", { name: "返回", exact: true })); await must(frame.locator(".community-screen"));
  await normalClick(frame.getByRole("button", { name: "首页", exact: true })); await must(frame.locator(".home-dashboard"));

  // 17｜干净首页基底 + 可交付的程序化品牌合成预览。
  startSection("17", origin); await sleep(3_000); await page.screenshot({ path: path.join(outputDir, `17-brand-outro-${takeLabel}-home.png`), type: "png" });
  await brandOverlay(frame); await sleep(3_000); await page.screenshot({ path: path.join(outputDir, `17-brand-outro-${takeLabel}-brand.png`), type: "png" });
  await sleep(3_200); keyStills["17"] = path.join(outputDir, `17-brand-outro-${takeLabel}-brand.png`); endSection("17");
  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  completed = true;
} catch (error) {
  console.error(error.stack || error);
  await page.screenshot({ path: path.join(outputDir, `promo-14-17-${runStamp}-error.png`), type: "png" }).catch(() => {});
} finally { await context.close(); }

const manifest = {
  completed, mode: rehearsal ? "rehearsal" : "formal", sourceGuide: "docs/APP_PROMO_VIDEO_RECORDING_GUIDE_4MIN.md",
  format: { width: 1440, height: 2880, orientation: "portrait", frameRate: 30, raw: "VP9 WebM", delivery: "H.264 High MP4", audio: false },
  device: { model: "iPhone 17 Pro", shellIncluded: true, internalCanvas: "1206×2622 Retina 3x", canvas },
  chromaKey: { color: green, exteriorOnly: true, workbenchGradientRemoved: true, phoneShadowRemoved: true },
  touchVisual: { color: "#8B5CFF", ring: "40px hollow purple ring", preClickHoldSeconds: 0.52, ripple: "0.62s expanding purple ripple", targetOutline: true },
  clickEvents, keyStills,
  postProduction: { section17: { inRecordingPreview: ["BookCourse AI wordmark", "five capability labels"], separatePostLayersStillRequired: ["final approved Logo/mascot artwork", "voice-over", "music and brand sound effect", "final master title treatment"] } },
  sections: Object.fromEntries(sectionDefinitions.map((section) => [section.id, { ...section, keyStill: keyStills[section.id] ?? null, timing: sectionTimes.get(section.id) ? { startSeconds: Number(((sectionTimes.get(section.id).start - origin) / 1000).toFixed(3)), endSeconds: Number(((sectionTimes.get(section.id).end - origin) / 1000).toFixed(3)) } : null }]))
};

if (completed && !rehearsal && recordedVideo && origin) {
  const raw = await recordedVideo.path(); const source = path.join(sourceDir, `promo-14-17-session-${runStamp}.webm`); await rename(raw, source); await rmdir(stage).catch(() => {});
  manifest.sourceSession = source; manifest.outputs = {};
  for (const definition of sectionDefinitions) {
    const timing = sectionTimes.get(definition.id); const stemBase = `${definition.id}-${definition.slug}`; const stem = `${stemBase}-${takeLabel}`;
    const webm = path.join(movies, `${stem}.webm`); const mp4 = path.join(movies, `${stem}.mp4`); const json = path.join(movies, `${stem}.json`);
    const startSeconds = (timing.start - origin) / 1000;
    const sourceStartSeconds = (timing.start - videoClockStarted) / 1000;
    const durationSeconds = (timing.end - timing.start) / 1000;
    // Place -ss after the WebM input: Playwright's VP9 file is sparse-keyframe,
    // so input seeking can otherwise start an exported section at an earlier UI state.
    await run(["-y", "-i", source, "-ss", sourceStartSeconds.toFixed(3), "-t", durationSeconds.toFixed(3), "-an", "-vf", "fps=30", "-c:v", "libvpx-vp9", "-crf", "17", "-b:v", "0", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-tile-columns", "2", "-threads", "8", "-g", "60", webm], `${definition.id} VP9 WebM`);
    await run(["-y", "-i", source, "-ss", sourceStartSeconds.toFixed(3), "-t", durationSeconds.toFixed(3), "-an", "-vf", "fps=30,scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-profile:v", "high", "-level", "5.1", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-g", "60", "-movflags", "+faststart", mp4], `${definition.id} H.264 MP4`);
    const [webmMeta, mp4Meta, webmStat, mp4Stat] = await Promise.all([inspect(webm), inspect(mp4), stat(webm), stat(mp4)]);
    for (const [kind, meta] of [["WebM", webmMeta], ["MP4", mp4Meta]]) { if (meta.width !== 1440 || meta.height !== 2880 || meta.fps !== 30 || meta.hasAudio) throw new Error(`${definition.id} ${kind} validation failed: ${JSON.stringify(meta)}`); }
    if (!mp4Meta.codec.toLowerCase().includes("h264")) throw new Error(`${definition.id} MP4 is not H.264: ${mp4Meta.codec}`);
    const segmentManifest = { ...manifest, section: definition, sectionTiming: { startSeconds, sourceStartSeconds, durationSeconds }, files: { vp9Webm: webm, h264Mp4: mp4 }, fileBytes: { vp9Webm: webmStat.size, h264Mp4: mp4Stat.size }, sha256: { vp9Webm: await sha256(webm), h264Mp4: await sha256(mp4) }, metadata: { vp9Webm: webmMeta, h264Mp4: mp4Meta }, verification: { sampledKeyStill: keyStills[definition.id], clickCueEvents: clickEvents.filter((event) => event.atSeconds >= startSeconds && event.atSeconds <= startSeconds + durationSeconds), noAudio: true, h264Bt601ToBt709Conversion: true } };
    await writeFile(json, `${JSON.stringify(segmentManifest, null, 2)}\n`, "utf8"); manifest.outputs[definition.id] = { webm, mp4, json, metadata: { webm: webmMeta, mp4: mp4Meta } };
  }
}
if (rehearsal) await writeFile(path.join(rehearsalDir, `14-17-rehearsal-${runStamp}.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await browser.close();
console.log(JSON.stringify(manifest, null, 2));
if (!completed) process.exitCode = 1;
