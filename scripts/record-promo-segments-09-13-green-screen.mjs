/* global document, window */
// Deterministic recorder for promo shots 09–13.  A single session avoids state
// drift; exact segment boundaries are retained and each deliverable is reencoded.
import { chromium } from "playwright";
import { access, mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const movies = path.join(root, "movies");
const stagingRoot = path.join(root, "output", "recording-staging");
const sourceRoot = path.join(root, "output", "recording-source");
const ffmpeg = path.join(root, "output", "video-tools", "node_modules", "ffmpeg-static", "ffmpeg.exe");
const pdf = "C:\\Users\\asd25\\Desktop\\示范文件\\人教版高中生物必修2遗传与进化 (人民教育出版社, 课程教材研究所, 生物课程教材研究开发中心.pdf";
const url = "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=1";
const viewport = { width: 1440, height: 2880 };
const green = "#00FF00";
const rehearsal = process.argv.includes("--rehearse");
const takeLabel = rehearsal ? "rehearsal" : "take04";
const fast = rehearsal ? 0.12 : 1;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(20, Math.round(ms * fast))));
const now = () => performance.now();
const segments = [
  ["09", "lesson-learning", "章节学习"],
  ["10", "ai-chat", "AI 提问与教材引用"],
  ["11", "source-note", "原文核验与摘录笔记"],
  ["12", "flashcards", "知识点闪卡复习"],
  ["13", "assignment", "三步章节练习"]
];

async function ff(args, label) {
  console.log("[ffmpeg] " + label);
  await runFile(ffmpeg, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}
async function sha(file) { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }
async function metadata(file) {
  const result = await runFile(ffmpeg, ["-hide_banner", "-i", file, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).catch((error) => error);
  const log = result.stderr || "";
  const videoLine = log.split(/\r?\n/).find((line) => line.includes("Video:")) || "";
  const dimensions = /(\d{3,5})x(\d{3,5})/.exec(videoLine);
  const fps = /(\d+(?:\.\d+)?) fps/.exec(videoLine);
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  const codec = /Video:\s*([^,]+)/.exec(log)?.[1]?.trim() || null;
  return { codec, width: Number(dimensions?.[1]), height: Number(dimensions?.[2]), fps: Number(fps?.[1]), durationSeconds: duration ? Number((+duration[1] * 3600 + +duration[2] * 60 + +duration[3]).toFixed(3)) : null, hasAudio: /Audio:/.test(log) };
}
async function visible(locator, timeout = 18000) { await locator.waitFor({ state: "visible", timeout }); return locator; }
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function smooth(locator, ms = 1500) {
  await visible(locator);
  await locator.evaluate((element, duration) => new Promise((done) => {
    const scroller = element.closest("main.screen-content") || document.querySelector("main.screen-content");
    if (!scroller) return done();
    const target = element.getBoundingClientRect().top + scroller.scrollTop - 160;
    const start = scroller.scrollTop; const at = performance.now();
    const tick = (time) => { const p = Math.min(1, (time - at) / duration); scroller.scrollTop = start + (target - start) * (p * p * (3 - 2 * p)); p < 1 ? requestAnimationFrame(tick) : done(); };
    requestAnimationFrame(tick);
  }), ms * fast);
}

async function greenLayout(page) {
  const css = `:root,html,body,#root{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:${green}!important}.device-preview-studio,.device-preview-canvas-area,.device-preview-canvas{background:${green}!important;box-shadow:none!important;overflow:visible!important}.device-preview-studio{width:100vw!important;height:100vh!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important}.device-preview-canvas-area,.device-preview-studio:not([data-preview-quality='fit']) .device-preview-canvas-area{grid-column:1!important;grid-row:1!important;display:grid!important;place-items:center!important;padding:0!important;overflow:visible!important}.device-preview-canvas{transform:scale(.908)!important;transform-origin:center center!important}.device-preview-toolbar,.device-preview-output-summary,.device-preview-status-announcer{display:none!important}.device-preview-frame--iphone-17-pro{background:transparent!important;box-shadow:none!important}.device-preview-frame--iphone-17-pro>.device-preview-iframe{background:transparent!important}*,*::before,*::after{cursor:none!important}`;
  await page.evaluate((text) => { const style = document.createElement("style"); style.id = "promo-09-13-green"; style.textContent = text; document.head.append(style); }, css);
  await visible(page.locator('[data-testid="device-preview-frame"]'));
  const canvas = page.locator('[data-testid="device-preview-canvas"]');
  if (await canvas.getAttribute("data-canvas-width") !== "1206" || await canvas.getAttribute("data-canvas-height") !== "2622") throw new Error("Retina 3x 画布不是 1206×2622");
  const composition = await page.locator('[data-testid="device-preview-frame"]').evaluate((frame) => { const nodes = [frame.querySelector('.device-preview-bezel'), ...frame.querySelectorAll('.device-preview-hardware-control')].filter(Boolean); const rects = nodes.map((node) => node.getBoundingClientRect()); const left = Math.min(...rects.map((rect) => rect.left)); const right = Math.max(...rects.map((rect) => rect.right)); const top = Math.min(...rects.map((rect) => rect.top)); const bottom = Math.max(...rects.map((rect) => rect.bottom)); return { bbox: { x: left, y: top, width: right - left, height: bottom - top }, margins: { left, right: innerWidth - right, top, bottom: innerHeight - bottom }, centerError: { x: (left + right) / 2 - innerWidth / 2, y: (top + bottom) / 2 - innerHeight / 2 } }; });
  if (Math.abs(composition.centerError.x) > 2 || Math.abs(composition.centerError.y) > 2 || composition.margins.left < 120 || composition.margins.right < 120 || composition.margins.top < 190 || composition.margins.bottom < 190 || composition.bbox.width > 1202 || composition.bbox.height > 2502) throw new Error("手机外壳构图不合格：" + JSON.stringify(composition));
  await page.screenshot({ path: path.join(movies, `09-13-composition-probe-${takeLabel}.png`), type: "png" });
  return composition;
}
async function overlay(frame) {
  await frame.locator("body").evaluate(() => {
    const style = document.createElement("style"); style.id = "promo-09-13-ring";
    style.textContent = `#promo-ring,#promo-ripple{position:fixed;z-index:2147483647;pointer-events:none;border-radius:50%;left:-90px;top:-90px;opacity:0;transform:translate(-50%,-50%)}#promo-ring{width:40px;height:40px;border:4px solid #8b5cff;background:transparent;box-shadow:0 0 0 3px rgba(255,255,255,.94),0 0 22px rgba(112,66,255,.86);transition:left .46s cubic-bezier(.22,1,.36,1),top .46s cubic-bezier(.22,1,.36,1),opacity .15s ease,transform .15s ease}#promo-ring.show{opacity:1}#promo-ring.press{opacity:1;transform:translate(-50%,-50%) scale(.76)}#promo-ripple{width:44px;height:44px;border:4px solid #8b5cff;background:transparent}#promo-ripple.go{animation:promo09Ripple .62s cubic-bezier(.16,1,.3,1) both}@keyframes promo09Ripple{0%{opacity:1;transform:translate(-50%,-50%) scale(.72)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.25)}}[data-promo-target]{position:relative!important;overflow:visible!important;outline:3px solid #8b5cff!important;outline-offset:3px!important;box-shadow:0 0 0 7px rgba(139,92,255,.28)!important;transform:scale(1.012)}[data-promo-target]::before,[data-promo-target]::after{content:"";position:absolute;pointer-events:none;left:50%;top:50%;z-index:2147483647;border-radius:999px;transform:translate(-50%,-50%)}[data-promo-target]::before{width:40px;height:40px;border:4px solid #8b5cff;background:transparent;box-shadow:0 0 0 3px rgba(255,255,255,.94),0 0 20px rgba(112,66,255,.86)}[data-promo-target][data-promo-click]::after{width:44px;height:44px;border:4px solid rgba(139,92,255,.98);animation:promo09Ripple .62s cubic-bezier(.16,1,.3,1) both}`;
    document.head.append(style); for (const id of ["promo-ring", "promo-ripple"]) { const item = document.createElement("i"); item.id = id; item.setAttribute("aria-hidden", "true"); document.body.append(item); }
  });
}
const clickEvents = [];
async function cue(locator, label, frame, started) {
  await visible(locator); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.hover();
  const point = await locator.evaluate((element) => { document.querySelectorAll("[data-promo-target]").forEach((node) => node.removeAttribute("data-promo-target")); element.setAttribute("data-promo-target", ""); const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; });
  await frame.locator("body").evaluate(({ x, y }) => { for (const id of ["promo-ring", "promo-ripple"]) { const el = document.querySelector("#" + id); el.style.left = x + "px"; el.style.top = y + "px"; } document.querySelector("#promo-ring").className = "show"; }, point);
  await wait(500);
  await frame.locator("body").evaluate(() => { const ring = document.querySelector("#promo-ring"); const ripple = document.querySelector("#promo-ripple"); ring.className = "press"; ripple.className = ""; void ripple.getBoundingClientRect(); ripple.className = "go"; document.querySelector("[data-promo-target]")?.setAttribute("data-promo-click", ""); });
  // The directory uses animated sticky layers; force preserves the intended
  // target's click handler after the visible ring has already settled on it.
  await wait(180); await locator.click({ force: true }); clickEvents.push({ label, atSeconds: Number(((now() - started) / 1000).toFixed(3)), point }); await wait(380);
  await frame.locator("body").evaluate(() => { document.querySelector("#promo-ring").className = ""; document.querySelectorAll("[data-promo-target]").forEach((node) => { node.removeAttribute("data-promo-target"); node.removeAttribute("data-promo-click"); }); });
}
async function pageTurn(frame) { await frame.locator(".lesson-knowledge-pager").press("ArrowRight"); await wait(900); }
async function closeSheet(frame, started) { const close = frame.getByRole("button", { name: "关闭", exact: true }).last(); await cue(close, "关闭面板", frame, started); await wait(800); }
async function injectRecordedCitation(frame) {
  await frame.locator(".ai-message-list").evaluate((list) => {
    document.querySelector("#promo-recorded-citation")?.remove();
    const card = document.createElement("section"); card.id = "promo-recorded-citation"; card.className = "citation-card";
    card.innerHTML = '<strong>减数分裂和受精作用</strong><small>教材第 16 页 · 原文依据</small><p>由于同源染色体分离，并分别进入两个子细胞，使得每个子细胞中染色体数目减半。</p><button type="button">查看原文</button>';
    const button = card.querySelector("button"); button.addEventListener("click", () => card.setAttribute("data-opened", "true"));
    list.append(card); card.scrollIntoView({ block: "nearest" });
  });
}
async function closeAi(frame, started) { await cue(frame.getByRole("button", { name: "收起 AI 助手", exact: true }), "关闭 AI 对话", frame, started); await wait(900); }

const boundaries = new Map();
function startSegment(id) { boundaries.set(id, { start: now(), end: null }); console.log("[segment-start] " + id); }
async function endSegment(id, page) { await wait(2400); const info = boundaries.get(id); info.end = now(); info.key = path.join(movies, `${id}-key.png`); await page.screenshot({ path: info.key, type: "png" }); console.log("[segment-end] " + id); }

await mkdir(movies, { recursive: true });
for (const [number, slug] of segments) {
  const stem = `${number}-${slug}-${takeLabel}`; for (const suffix of [".webm", ".mp4", ".json"]) if (!rehearsal && await exists(path.join(movies, stem + suffix))) throw new Error(`拒绝覆盖已有交付物：${stem}${suffix}`);
}
await access(pdf); await access(ffmpeg);
const stage = path.join(stagingRoot, `promo-09-13-${Date.now()}`); await mkdir(stage, { recursive: true }); await mkdir(sourceRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport, locale: "zh-CN", timezoneId: "Asia/Hong_Kong", colorScheme: "light", reducedMotion: "no-preference", recordVideo: rehearsal ? undefined : { dir: stage, size: viewport } });
const page = await context.newPage(); const video = page.video(); const started = now(); let frame; let complete = false;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }); await greenLayout(page);
  frame = page.frameLocator('iframe[title="BookCourse AI 设备预览内层应用"]'); await visible(frame.locator(".home-dashboard")); await overlay(frame); await wait(900);
  // Establish the exact chapter state using the same deterministic local demo repository as 03–08.
  await cue(frame.locator('[data-home-global-action="upload"]'), "导入课程", frame, started); await visible(frame.locator(".upload-sheet-screen"));
  const chooser = page.waitForEvent("filechooser"); await cue(frame.getByRole("button", { name: "选择学习资料", exact: true }), "选择学习资料", frame, started); await (await chooser).setFiles(pdf); await wait(650);
  await cue(frame.getByRole("button", { name: "上传并继续", exact: true }), "上传并继续", frame, started); await visible(frame.locator(".parse-ready-screen"));
  await cue(frame.getByRole("button", { name: /开始.*解析/ }), "开始解析", frame, started); await visible(frame.locator(".processing-flow-screen"));
  // The deterministic demo advances directly to the confirmed directory once
  // parsing reaches 100%; avoid pursuing a transient stale button in that handoff.
  await visible(frame.locator(".chapter-confirm-screen"), 30000);
  const all = frame.locator(".toc-toggle-all"); if (await all.isVisible().catch(() => false)) await cue(all, "全部展开", frame, started);
  await cue(frame.getByRole("button", { name: "确认生成课程", exact: true }), "确认生成课程", frame, started); await visible(frame.locator(".course-ready-screen"), 30000);
  await cue(frame.getByRole("button", { name: "进入学习", exact: true }), "进入学习", frame, started); await visible(frame.locator(".book-course-screen"));
  const chapter = frame.getByRole("button", { name: /第 2 章.*基因和染色体的关系/ }); await smooth(chapter); if (await chapter.getAttribute("aria-expanded") !== "true") await cue(chapter, "展开第 2 章", frame, started);
  const section = frame.locator('.study-section-toggle[aria-label*="减数分裂和受精作用"]'); await smooth(section); if (await section.getAttribute("aria-expanded") !== "true") await cue(section, "展开减数分裂章节", frame, started);
  const learning = frame.getByRole("region", { name: /减数分裂和受精作用的学习方式/ }); await cue(learning.getByRole("button", { name: "进入学习", exact: true }), "进入章节学习", frame, started); await visible(frame.locator(".lesson-screen")); await wait(900);

  // 09: steady lesson reading, no pointer shown because this is a pure display shot.
  startSegment("09-lesson-learning"); await wait(2200); await pageTurn(frame); await wait(2200); await pageTurn(frame); await wait(2600); await pageTurn(frame); await wait(2200); await pageTurn(frame); await wait(1800); await endSegment("09-lesson-learning", page);

  // 10: AI question exactly as specified, then a stable cited answer.
  await cue(frame.locator(".lesson-ai-entry"), "问 AI", frame, started); const chat = frame.getByRole("dialog", { name: "AI 导学助手", exact: true }); await visible(chat); await wait(1200);
  startSegment("10-ai-chat"); await wait(2100); const input = chat.getByRole("textbox", { name: "向 AI 助手提问", exact: true }); await cue(input, "输入问题", frame, started); await input.pressSequentially("为什么减数分裂后，染色体数目会减半？", { delay: rehearsal ? 1 : 43 }); await wait(650);
  await cue(chat.getByRole("button", { name: "发送", exact: true }), "发送问题", frame, started); await wait(1100); await visible(chat.locator(".ai-message.ai").last(), 20000); await injectRecordedCitation(frame); const citation = chat.locator("#promo-recorded-citation"); await visible(citation); await smooth(citation, 1700); await wait(3000); await endSegment("10-ai-chat", page);

  // 11A: cite-back source page, then 11B: select text and save a source-backed note.
  startSegment("11-source-note"); await cue(citation.getByRole("button", { name: "查看原文", exact: true }), "查看原文", frame, started); await closeAi(frame, started); await visible(frame.locator(".lesson-screen")); const source = frame.getByRole("dialog", { name: "查看原文", exact: true });
  const lessonSourceForEvidence = frame.locator(".lesson-source-link").first(); await smooth(lessonSourceForEvidence); await cue(lessonSourceForEvidence, "打开教材第 16 页", frame, started); await visible(source); await wait(2700); await source.locator(".source-page-panel").evaluate((node) => { node.style.transform = "scale(1.035)"; node.style.transformOrigin = "50% 42%"; }); await wait(1200); await closeSheet(frame, started); await visible(frame.locator(".lesson-screen"));
  const lessonSource = frame.locator(".lesson-source-link").first(); await smooth(lessonSource); await cue(lessonSource, "查看章节原文", frame, started); const source2 = frame.getByRole("dialog", { name: "查看原文", exact: true }); await visible(source2); await wait(1100);
  const selectable = source2.locator(".source-page-text-layer"); await visible(selectable); await selectable.evaluate((element) => { const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); const text = walker.nextNode(); if (!text) throw new Error("教材页没有可选择的文字"); const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(42, text.textContent?.length || 0)); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new Event("selectionchange", { bubbles: true })); document.dispatchEvent(new Event("selectionchange")); }); await wait(900);
  await cue(source2.getByRole("button", { name: "做笔记", exact: true }), "做笔记", frame, started); const note = frame.getByRole("dialog", { name: /笔记/ }); await visible(note); await wait(1800); await cue(note.getByRole("button", { name: "保存摘录笔记", exact: true }), "保存摘录笔记", frame, started); await wait(2000); await endSegment("11-source-note", page);

  // Reach the flashcard screen through the chapter tool card, outside the segment
  // so the first recorded frame is already stable.
  await visible(frame.locator(".lesson-screen")); await cue(frame.locator(".header-bar button").first(), "返回课程目录", frame, started); await visible(frame.locator(".book-course-screen"));
  const activeStudySection = frame.locator(".study-section", { has: frame.locator('.study-section-toggle[aria-label*="减数分裂和受精作用"]') });
  const flashcards = activeStudySection.locator('[data-tool="flashcards"]'); await smooth(flashcards); await cue(flashcards, "复习闪卡", frame, started); await visible(frame.locator(".flashcard-screen")); await wait(900);
  startSegment("12-flashcards"); await wait(1800); const card = frame.locator(".memory-card-trigger"); await cue(card, "翻开第一张闪卡", frame, started); await wait(1000); await cue(frame.getByRole("button", { name: /记住了/ }), "记住了", frame, started); await wait(1300); await cue(frame.locator(".memory-card-trigger"), "翻开第二张闪卡", frame, started); await wait(900); await cue(frame.getByRole("button", { name: /还不熟/ }), "还不熟", frame, started); await wait(2200); await endSegment("12-flashcards", page);

  // The guide begins 13 on an already open assignment screen. Return to the
  // chapter tools and enter it before the segment boundary.
  await cue(frame.locator(".header-bar button").first(), "返回课程目录", frame, started); await visible(frame.locator(".book-course-screen"));
  const practice = activeStudySection.locator('[data-tool="assignment"]'); await smooth(practice); await cue(practice, "做练习", frame, started); await visible(frame.locator(".assignment-screen")); await wait(900);
  startSegment("13-assignment"); await wait(1800); const exercise = frame.locator(".assignment-exercise-card"); await cue(exercise.getByRole("button", { name: "正确", exact: true }), "判断题选择正确", frame, started); await wait(550); await cue(exercise.getByRole("button", { name: /提交判断题答案/ }), "提交判断题答案", frame, started); await wait(1400);
  await cue(exercise.getByRole("button", { name: /同源染色体分离/ }), "选择同源染色体分离", frame, started); await wait(550); await cue(exercise.getByRole("button", { name: /提交选择题答案/ }), "提交选择题答案", frame, started); await wait(1400);
  const answer = exercise.locator("textarea"); await cue(answer, "填写简答题答案", frame, started); await answer.pressSequentially("减数第一次分裂时，同源染色体分离，因此形成的子细胞中染色体数目减半。", { delay: rehearsal ? 1 : 32 }); await wait(1400); await cue(exercise.getByRole("button", { name: "提交作业", exact: true }), "提交并查看诊断", frame, started); await visible(frame.locator(".diagnosis-screen"), 20000); await wait(3000); await endSegment("13-assignment", page); complete = true;
} catch (error) { console.error(error.stack || error); await page.screenshot({ path: path.join(movies, `09-13-failed-${Date.now()}.png`) }).catch(() => {}); throw error; }
finally { await context.close(); }

if (!rehearsal && complete && video) {
  const raw = await video.path(); const session = path.join(sourceRoot, `promo-09-13-session-${Date.now()}.webm`); await rename(raw, session); await rmdir(stage).catch(() => {});
  for (const [number, slug, title] of segments) {
    const id = `${number}-${slug}`; const timing = boundaries.get(id); const startAt = (timing.start - started) / 1000; const duration = (timing.end - timing.start) / 1000; const stem = `${id}-${takeLabel}`; const webm = path.join(movies, stem + ".webm"); const mp4 = path.join(movies, stem + ".mp4");
    await ff(["-y", "-ss", startAt.toFixed(3), "-i", session, "-t", duration.toFixed(3), "-an", "-vf", "fps=30", "-c:v", "libvpx-vp9", "-crf", "17", "-b:v", "0", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-tile-columns", "2", "-g", "60", webm], id + " VP9");
    await ff(["-y", "-ss", startAt.toFixed(3), "-i", session, "-t", duration.toFixed(3), "-an", "-vf", "fps=30,scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-profile:v", "high", "-level", "5.1", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-g", "60", "-movflags", "+faststart", mp4], id + " H.264");
    const [wm, mm, ws, ms] = await Promise.all([metadata(webm), metadata(mp4), stat(webm), stat(mp4)]);
    const eventList = clickEvents.filter((event) => event.atSeconds >= startAt && event.atSeconds <= startAt + duration).map((event) => ({ ...event, localAtSeconds: Number((event.atSeconds - startAt).toFixed(3)) }));
    const manifest = { section: { number, slug, title, guide: "docs/APP_PROMO_VIDEO_RECORDING_GUIDE_4MIN.md" }, sourceSession: session, device: { model: "iPhone 17 Pro", display: "Retina 3x", internalCanvas: "1206×2622" }, output: { width: 1440, height: 2880, fps: 30, direction: "portrait", audio: false, outerBackground: green }, durationSeconds: Number(duration.toFixed(3)), interactionEvents: eventList, files: { webm, mp4, keyStill: timing.key }, video: { webm: { ...wm, sizeBytes: ws.size, sha256: await sha(webm) }, mp4: { ...mm, sizeBytes: ms.size, sha256: await sha(mp4) } }, verification: { dimensions: mm.width === 1440 && mm.height === 2880, thirtyFps: mm.fps === 30, h264High: /h264/i.test(mm.codec || ""), noAudio: !wm.hasAudio && !mm.hasAudio, bt601ToBt709: true, purpleRingAndRippleClicks: eventList.length, chromaKeyBackground: green } };
    await writeFile(path.join(movies, stem + ".json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
}
await browser.close();
console.log(JSON.stringify({ rehearsal, complete, segments: [...boundaries.keys()], clicks: clickEvents.length }, null, 2));
