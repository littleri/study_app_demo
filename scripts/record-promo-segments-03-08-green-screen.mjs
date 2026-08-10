/* global document, window */
// Records the remaining BookCourse AI promo shots as a single deterministic demo
// session, then creates independently editable VP9 WebM and H.264 MP4 segments.
import { chromium } from "playwright";
import { mkdir, readdir, rename, rmdir, stat, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const movies = path.join(root, "movies");
const stagingRoot = path.join(root, "output", "recording-staging");
const sourceRoot = path.join(root, "output", "recording-source");
const ffmpeg = path.join(root, "output", "video-tools", "node_modules", "ffmpeg-static", "ffmpeg.exe");
// Playwright sets this file directly; the operating-system picker is never recorded
// and no filesystem path is emitted into the delivery manifests.
const pdf = process.argv.includes("--pdf")
  ? path.resolve(process.argv[process.argv.indexOf("--pdf") + 1])
  : "C:\\Users\\asd25\\Desktop\\示范文件\\人教版高中生物必修2遗传与进化 (人民教育出版社, 课程教材研究所, 生物课程教材研究开发中心.pdf";
const url = "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=1";
const viewport = { width: 1440, height: 2880 };
const green = "#00FF00";
const sections = [
  ["03", "upload-material", "导入教材"], ["04", "parse-ready", "确认文件并开始解析"],
  ["05", "processing", "AI 解析过程"], ["06", "chapter-confirm", "原书目录识别与确认"],
  ["07", "course-ready", "课程生成完成"], ["08", "course-directory", "课程目录与学习路径"]
];
const rehearsal = process.argv.includes("--rehearse");
const fast = rehearsal ? 0.14 : 1;
const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(20, Math.round(ms * fast))));
const now = () => performance.now();
const q = (v) => String(v).padStart(2, "0");
const sleep = (ms) => wait(ms);

function opt(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
async function run(args, label) { console.log("[ffmpeg] " + label); await exec(ffmpeg, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }); }
async function hash(file) { return createHash("sha256").update(await readFile(file)).digest("hex").toUpperCase(); }
async function meta(file) {
  const { stderr = "" } = await exec(ffmpeg, ["-hide_banner", "-i", file, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).catch((e) => e);
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const stream = /Video:\s*([^,]+).*?,\s*(\d+)x(\d+)[^\r\n]*?(\d+(?:\.\d+)?)\s*fps/.exec(stderr);
  return { codec: stream?.[1]?.trim() || null, width: Number(stream?.[2]), height: Number(stream?.[3]), fps: Number(stream?.[4]), durationSeconds: dur ? Number((+dur[1] * 3600 + +dur[2] * 60 + +dur[3]).toFixed(3)) : null, hasAudio: /Audio:/.test(stderr) };
}
async function take(stem) {
  const names = await readdir(movies).catch(() => []); const rex = new RegExp("^" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-take(\\d{2})\\.");
  return 1 + names.reduce((m, n) => Math.max(m, +(rex.exec(n)?.[1] || 0)), 0);
}
async function visible(locator, ms = 18000) { await locator.waitFor({ state: "visible", timeout: ms }); return locator; }
async function idle(frame) { await frame.locator(".motion-screen-transition").getAttribute("data-motion-state").catch(() => null); await sleep(850); }

async function greenLayout(page) {
  const css = [`:root,html,body,#root{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:${green}!important}`, `.device-preview-studio,.device-preview-canvas-area,.device-preview-canvas{background:${green}!important;box-shadow:none!important;overflow:visible!important}`, `.device-preview-studio{width:100vw!important;height:100vh!important;display:grid!important;place-items:center!important}`, `.device-preview-toolbar,.device-preview-output-summary,.device-preview-status-announcer{display:none!important}`, `.device-preview-frame--iphone-17-pro{box-shadow:none!important}`, `*,*::before,*::after{cursor:none!important}`].join("\n");
  await page.evaluate((styleText) => { const s = document.createElement("style"); s.id = "promo-segments-green"; s.textContent = styleText; document.head.append(s); }, css);
  await visible(page.locator('[data-testid="device-preview-frame"]'));
}
async function overlay(frame) {
  await frame.locator("body").evaluate(() => {
    const s = document.createElement("style"); s.id = "promo-purple-ring-style"; s.textContent = `#promo-ring,#promo-ripple{position:fixed;z-index:2147483647;pointer-events:none;border-radius:999px;left:0;top:0;opacity:0;transform:translate(-50%,-50%);transition:opacity .16s ease,transform .42s cubic-bezier(.22,1,.36,1)}#promo-ring{width:38px;height:38px;border:4px solid #8B5CFF;background:transparent;box-shadow:0 0 0 3px rgba(255,255,255,.92),0 0 22px rgba(111,66,255,.8)}#promo-ring.on{opacity:1}#promo-ring.press{transform:translate(-50%,-50%) scale(.78)}#promo-ripple{width:42px;height:42px;border:4px solid rgba(139,92,255,.96);background:transparent}#promo-ripple.go{animation:promoRipple .58s cubic-bezier(.16,1,.3,1) both}@keyframes promoRipple{0%{opacity:1;transform:translate(-50%,-50%) scale(.72)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.2)}}[data-promo-target]{outline:3px solid rgba(139,92,255,.94)!important;outline-offset:3px!important;box-shadow:0 0 0 7px rgba(139,92,255,.26)!important}`; document.head.append(s);
    for (const id of ["promo-ring", "promo-ripple"]) { const e = document.createElement("i"); e.id = id; e.setAttribute("aria-hidden", "true"); document.body.append(e); }
  });
}
async function cue(locator, label) {
  await visible(locator); await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.hover();
  const point = await locator.evaluate((el) => { document.querySelectorAll("[data-promo-target]").forEach((x) => x.removeAttribute("data-promo-target")); el.setAttribute("data-promo-target", ""); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await frame.locator("body").evaluate(({ x, y }) => { for (const id of ["promo-ring", "promo-ripple"]) { const e = document.querySelector("#" + id); e.style.left = x + "px"; e.style.top = y + "px"; } document.querySelector("#promo-ring").className = "on"; }, point);
  await sleep(500); await frame.locator("body").evaluate(() => { document.querySelector("#promo-ring").className = "on press"; const r = document.querySelector("#promo-ripple"); r.className = ""; void r.getBoundingClientRect(); r.className = "go"; }); await sleep(160);
  await locator.click(); clicks.push({ label, atSeconds: +((now() - started) / 1000).toFixed(3) }); await sleep(350); await frame.locator("body").evaluate(() => { document.querySelector("#promo-ring").className = ""; document.querySelectorAll("[data-promo-target]").forEach((x) => x.removeAttribute("data-promo-target")); });
}
async function smooth(locator, ms = 1300) { await locator.evaluate((e, duration) => new Promise((done) => { const s = e.closest("main.screen-content") || document.querySelector("main.screen-content"); const target = e.getBoundingClientRect().top + s.scrollTop - 170; const from = s.scrollTop; const started = performance.now(); const tick = (t) => { const p = Math.min(1, (t - started) / duration); const v = p * p * (3 - 2 * p); s.scrollTop = from + (target - from) * v; p < 1 ? requestAnimationFrame(tick) : done(); }; requestAnimationFrame(tick); }), ms * fast); }

const missing = [];
const sectionTimes = new Map();
function start(id) { sectionTimes.set(id, { start: now(), end: null }); console.log("[segment-start] " + id); }
async function finish(id, stillName) { await sleep(2200); const v = sectionTimes.get(id); v.end = now(); const f = path.join(movies, `${id}-${stillName}-key.png`); await page.screenshot({ path: f, type: "png" }); v.keyStill = f; console.log("[segment-end] " + id); }
async function action(id, before, after, task) { await before(); start(id); await sleep(2200); await task(); await after(); await finish(id, "end"); }

const browser = await chromium.launch({ headless: true });
const stage = path.join(stagingRoot, "promo-03-08-" + Date.now()); await mkdir(stage, { recursive: true }); await mkdir(movies, { recursive: true }); await mkdir(sourceRoot, { recursive: true });
const context = await browser.newContext({ viewport, locale: "zh-CN", timezoneId: "Asia/Hong_Kong", colorScheme: "light", reducedMotion: "no-preference", recordVideo: { dir: stage, size: viewport } });
const page = await context.newPage(); const video = page.video(); const clicks = []; let frame; const started = now(); let completed = false;
try {
  await page.goto(opt("--base-url", url), { waitUntil: "domcontentloaded", timeout: 20000 }); await greenLayout(page); frame = page.frameLocator('iframe[title="BookCourse AI 设备预览内层应用"]'); await visible(frame.locator(".home-dashboard")); await overlay(frame); await idle(frame);
  // 03: Home -> upload selection -> parse ready. setFiles keeps the OS dialog out of frames.
  await action("03-upload-material", async () => {}, async () => visible(frame.locator(".parse-ready-screen")), async () => {
    await cue(frame.locator('[data-home-global-action="upload"]'), "导入课程"); await visible(frame.locator(".upload-sheet-screen")); await sleep(1100);
    const fc = page.waitForEvent("filechooser"); await cue(frame.getByRole("button", { name: "选择学习资料", exact: true }), "选择学习资料"); await (await fc).setFiles(pdf); await visible(frame.getByRole("group", { name: /已选择.*学习资料/ })); await sleep(1600);
    await cue(frame.getByRole("button", { name: "上传并继续", exact: true }), "上传并继续");
  });
  await action("04-parse-ready", async () => {}, async () => visible(frame.locator(".processing-flow-screen")), async () => { await smooth(frame.getByRole("button", { name: /开始.*解析/ }), 800); await cue(frame.getByRole("button", { name: /开始.*解析/ }), "开始解析"); });
  await action("05-processing", async () => {}, async () => visible(frame.locator(".chapter-confirm-screen"), 30000), async () => { const p = frame.locator(".progress-wrap"); for (const n of ["18%", "46%", "74%", "100%"]) { await p.getAttribute("aria-label").catch(() => ""); await sleep(1300); } await visible(frame.getByRole("button", { name: "查看目录", exact: true }), 30000); await cue(frame.getByRole("button", { name: "查看目录", exact: true }), "查看目录"); });
  await action("06-chapter-confirm", async () => {}, async () => visible(frame.locator(".course-ready-screen"), 30000), async () => { const all = frame.locator(".toc-toggle-all"); if (await all.isVisible().catch(() => false)) await cue(all, "全部展开"); const dir = frame.locator(".chapter-confirm-directory"); await smooth(dir, 2400); await sleep(1800); await cue(frame.getByRole("button", { name: "确认生成课程", exact: true }), "确认生成课程"); });
  await action("07-course-ready", async () => {}, async () => visible(frame.locator(".book-course-screen")), async () => { await sleep(1800); await cue(frame.getByRole("button", { name: "进入学习", exact: true }), "进入学习"); });
  await action("08-course-directory", async () => {}, async () => visible(frame.locator(".lesson-screen")), async () => { const ch = frame.getByRole("button", { name: /第 2 章 基因和染色体的关系/ }); await smooth(ch); if (await ch.getAttribute("aria-expanded") !== "true") await cue(ch, "展开第 2 章"); const sec = frame.locator('.study-section-toggle[aria-label*="减数分裂和受精作用"]'); await smooth(sec); if (await sec.getAttribute("aria-expanded") !== "true") await cue(sec, "展开减数分裂章节"); const region = frame.getByRole("region", { name: /减数分裂和受精作用的学习方式/ }); await cue(region.getByRole("button", { name: "进入学习", exact: true }), "进入学习"); });
  /* The following workflow belongs to the separately owned 09–17 recorder.
  await action("10-ai-chat", async () => {}, async () => visible(frame.locator(".citation-card"), 20000), async () => { await cue(frame.getByRole("button", { name: "问 AI", exact: true }), "问 AI"); const dialog = frame.getByRole("dialog", { name: "问 AI", exact: true }); await visible(dialog); const input = dialog.getByRole("textbox", { name: "继续提问", exact: true }); await cue(input, "输入问题"); await input.pressSequentially("为什么减数分裂后，染色体数目会减半？", { delay: rehearsal ? 1 : 38 }); await sleep(700); await cue(dialog.getByRole("button", { name: "发送问题", exact: true }), "发送问题"); await sleep(1600); await smooth(dialog.locator(".citation-card"), 1800); });
  await action("11-source-note", async () => {}, async () => {}, async () => { const dialog = frame.getByRole("dialog", { name: "问 AI", exact: true }); const cite = dialog.locator(".citation-card"); await cue(cite.getByRole("button", { name: "查看原文", exact: true }), "查看原文"); const source = frame.getByRole("dialog", { name: "查看原文", exact: true }); await visible(source); await sleep(2600); const close = source.getByRole("button", { name: "关闭", exact: true }); await cue(close, "关闭原文"); await cue(dialog.getByRole("button", { name: "关闭", exact: true }), "关闭 AI 对话"); await visible(frame.locator(".lesson-screen")); const original = frame.getByRole("button", { name: "查看原文", exact: true }).first(); await smooth(original); await cue(original, "查看章节原文"); const source2 = frame.getByRole("dialog", { name: "查看原文", exact: true }); await visible(source2); const selectable = source2.getByRole("button", { name: /可选文字/ }); if (await selectable.isVisible().catch(() => false)) { await cue(selectable, "可选文字"); const note = source2.getByRole("button", { name: /做笔记/ }); if (await note.isVisible().catch(() => false)) { await cue(note, "做笔记"); const save = frame.getByRole("button", { name: /保存摘录笔记/ }); if (await save.isVisible().catch(() => false)) await cue(save, "保存摘录笔记"); } } });
  // Close any source sheet and use lesson action to enter flashcards.
  await visible(frame.locator(".lesson-screen"), 10000).catch(async () => { const close = frame.getByRole("button", { name: "关闭", exact: true }); if (await close.count()) await cue(close.last(), "关闭原文"); });
  await action("12-flashcards", async () => {}, async () => visible(frame.locator(".flashcard-screen")), async () => { const b = frame.getByRole("button", { name: /闪卡|复习/ }).filter({ hasText: /闪卡/ }).first(); await cue(b, "复习闪卡"); });
  await action("13-assignment", async () => {}, async () => visible(frame.locator(".diagnosis-screen"), 25000), async () => { const card = frame.locator(".flashcard-card, .flashcard-content").first(); await cue(card, "翻开闪卡"); const remembered = frame.getByRole("button", { name: "记住了", exact: true }); if (await remembered.isVisible().catch(() => false)) await cue(remembered, "记住了"); const next = frame.locator(".flashcard-card, .flashcard-content").first(); await cue(next, "翻开第二张闪卡"); const unfamiliar = frame.getByRole("button", { name: "还不熟", exact: true }); if (await unfamiliar.isVisible().catch(() => false)) await cue(unfamiliar, "还不熟"); const practice = frame.getByRole("button", { name: /做练习/ }).first(); await cue(practice, "做练习"); const ex = frame.locator(".assignment-exercise-card"); await visible(ex); await cue(ex.getByRole("button", { name: "正确", exact: true }), "正确"); await cue(ex.getByRole("button", { name: /提交.*判断/ }), "提交判断题"); await visible(ex.getByRole("button", { name: /同源染色体分离/ })); await cue(ex.getByRole("button", { name: /同源染色体分离/ }), "选择同源染色体分离"); await cue(ex.getByRole("button", { name: /提交.*选择/ }), "提交选择题"); const answer = ex.locator("textarea"); await cue(answer, "填写简答题"); await answer.pressSequentially("减数第一次分裂时，同源染色体分离，因此形成的子细胞中染色体数目减半。", { delay: rehearsal ? 1 : 28 }); await sleep(1100); await cue(ex.getByRole("button", { name: /提交/ }), "提交并查看诊断"); });
  await action("14-diagnosis", async () => {}, async () => visible(frame.locator(".mistake-book-screen"), 20000), async () => { await sleep(2600); const detail = frame.getByText(/为什么会卡住|诊断解析/).first(); if (await detail.isVisible().catch(() => false)) await smooth(detail, 1800); await sleep(1800); await cue(frame.getByRole("button", { name: "查看错题本", exact: true }), "查看错题本"); });
  await action("15-mistake-review", async () => {}, async () => {}, async () => { await sleep(1600); await cue(frame.getByRole("button", { name: /开始今日复习|再复习一轮/ }), "开始今日复习"); await sleep(1200); const why = frame.getByRole("button", { name: /概念不清|审题|记忆/ }).first(); if (await why.isVisible().catch(() => false)) await cue(why, "选择错因"); const mastery = frame.getByRole("button", { name: "有点模糊", exact: true }); if (await mastery.isVisible().catch(() => false)) await cue(mastery, "标记巩固中"); });
  // 16 uses valid normal navigation, preserving the interaction cue for both taps.
  await action("16-plan-community", async () => {}, async () => {}, async () => { await cue(frame.getByRole("button", { name: "首页", exact: true }), "返回首页"); await visible(frame.locator(".home-dashboard")); const plan = frame.getByRole("button", { name: /学习计划/ }).first(); if (await plan.isVisible().catch(() => false)) { await cue(plan, "查看学习计划"); await visible(frame.locator(".study-plan-screen")); const day = frame.getByRole("button", { name: "第 2 天", exact: true }); if (await day.isVisible().catch(() => false)) await cue(day, "第 2 天"); const task = frame.locator(".timeline-item").filter({ hasText: /待完成|未完成|学习/ }).first(); if (await task.isVisible().catch(() => false)) await cue(task, "完成学习任务"); } await cue(frame.getByRole("button", { name: "社区", exact: true }), "社区"); await visible(frame.locator(".community-screen")); const book = frame.locator(".community-book-card").first(); await cue(book, "打开推荐教材"); await sleep(1700); });
  await action("17-brand-outro", async () => {}, async () => {}, async () => { await cue(frame.getByRole("button", { name: "首页", exact: true }), "回到首页"); await visible(frame.locator(".home-dashboard")); await sleep(3000); }); */
  completed = true;
} catch (error) { console.error(error.stack || error); await page.screenshot({ path: path.join(movies, "promo-03-17-error.png") }).catch(() => {}); }
finally { await context.close(); }

if (completed && !rehearsal && video) {
  const raw = await video.path(); const source = path.join(sourceRoot, "promo-03-08-session-" + Date.now() + ".webm"); await rename(raw, source); await rmdir(stage).catch(() => {});
  const origin = started;
  for (const [num, slug, title] of sections) {
    const id = `${num}-${slug}`; const timing = sectionTimes.get(id); if (!timing?.end) { missing.push(id); continue; }
    const duration = (timing.end - timing.start) / 1000; const startAt = (timing.start - origin) / 1000; const stem = `${id}-take${q(await take(id))}`; const webm = path.join(movies, stem + ".webm"); const mp4 = path.join(movies, stem + ".mp4");
    await run(["-y", "-ss", startAt.toFixed(3), "-i", source, "-t", duration.toFixed(3), "-an", "-vf", "fps=30", "-c:v", "libvpx-vp9", "-crf", "17", "-b:v", "0", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-tile-columns", "2", "-g", "60", webm], id + " VP9");
    await run(["-y", "-ss", startAt.toFixed(3), "-i", source, "-t", duration.toFixed(3), "-an", "-vf", "fps=30,scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-profile:v", "high", "-level", "5.1", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-g", "60", "-movflags", "+faststart", mp4], id + " H.264");
    const wm = await meta(webm); const mm = await meta(mp4); const [ws, ms] = await Promise.all([stat(webm), stat(mp4)]);
    const verification = { dimensions: `${mm.width}×${mm.height}`, fps: mm.fps, h264High: /h264/i.test(mm.codec || ""), noAudio: !mm.hasAudio && !wm.hasAudio, chromaKey: green, interactionClicks: clicks.filter((x) => x.atSeconds >= startAt && x.atSeconds <= startAt + duration) };
    const manifest = { section: { id: num, slug, title, guide: "docs/APP_PROMO_VIDEO_RECORDING_GUIDE_4MIN.md" }, device: "iPhone 17 Pro / Retina 3x", output: viewport, frameRate: 30, noAudio: true, chromaKey: { color: green, outsideShellOnly: true }, files: { vp9Webm: webm, h264Mp4: mp4, keyStill: timing.keyStill }, sourceSession: source, durationSeconds: +duration.toFixed(3), video: { webm: { ...wm, sizeBytes: ws.size, sha256: await hash(webm) }, mp4: { ...mm, sizeBytes: ms.size, sha256: await hash(mp4) } }, verification, postProduction: num === "17" ? ["五个能力标签、BookCourse AI Logo 与云朵吉祥物按录制指南后期合成；本片为干净首页基底。"] : [] };
    await writeFile(path.join(movies, stem + ".json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
}
await browser.close();
console.log(JSON.stringify({ completed, missing, sections: [...sectionTimes.keys()], clicks: clicks.length }, null, 2));
