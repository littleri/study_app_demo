/* global document, window */

import { chromium } from "playwright";
import { execFile } from "node:child_process";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const moviesDirectory = path.join(projectRoot, "movies");
const rehearsalDirectory = path.join(projectRoot, "output", "recording-rehearsal", "manual");
const sourceDirectory = path.join(projectRoot, "output", "recording-source");
const statusPath = path.join(projectRoot, "output", "manual-recording-status.json");
const defaultFfmpegPath = path.join(
  projectRoot,
  "output",
  "video-tools",
  "node_modules",
  "ffmpeg-static",
  "ffmpeg.exe"
);

// The visible page is half-size so it remains practical to operate on a 1440p
// monitor. Playwright records only this page viewport; FFmpeg then scales that
// clean page frame to the 2K delivery size. Windows, the taskbar, notifications
// and browser chrome never enter the captured frames.
const operatorViewport = { width: 720, height: 1440 };
const recordingSize = { width: 1440, height: 2880 };
const chromaGreen = "#00FF00";
const defaultBaseUrl =
  "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=fit&chrome=1";

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function createStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureFile(filePath, label) {
  const details = await stat(filePath).catch(() => null);
  if (!details?.isFile()) throw new Error(`${label}不存在：${filePath}`);
}

async function writeStatus(status, details = {}) {
  await mkdir(path.dirname(statusPath), { recursive: true });
  await writeFile(
    statusPath,
    `${JSON.stringify({ status, updatedAt: new Date().toISOString(), ...details }, null, 2)}\n`,
    "utf8"
  );
}

async function runFfmpeg(ffmpegPath, args, label) {
  console.log(`[encode] ${label}`);
  try {
    await execFileAsync(ffmpegPath, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    const diagnostic = [error?.stdout, error?.stderr].filter(Boolean).join("\n");
    throw new Error(`${label}失败\n${diagnostic || error}`);
  }
}

async function inspectVideo(ffmpegPath, videoPath) {
  try {
    const result = await execFileAsync(
      ffmpegPath,
      ["-hide_banner", "-i", videoPath, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true
      }
    );
    const report = result.stderr || "";
    const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
    const stream = /Video:\s*([^,]+).*?,\s*(\d{2,5})x(\d{2,5})[^\r\n]*?(\d+(?:\.\d+)?)\s*fps/.exec(report);
    return {
      codec: stream?.[1]?.trim() || null,
      durationSeconds: duration
        ? Number((Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])).toFixed(3))
        : null,
      fps: stream ? Number(stream[4]) : null,
      height: stream ? Number(stream[3]) : null,
      width: stream ? Number(stream[2]) : null
    };
  } catch (error) {
    throw new Error(`视频校验失败：${videoPath}\n${error?.stderr || error}`);
  }
}

async function newestWebm(directory) {
  const names = await readdir(directory).catch(() => []);
  const candidates = await Promise.all(
    names
      .filter((name) => name.toLowerCase().endsWith(".webm"))
      .map(async (name) => {
        const filePath = path.join(directory, name);
        const details = await stat(filePath);
        return { filePath, modified: details.mtimeMs };
      })
  );
  return candidates.sort((a, b) => b.modified - a.modified)[0]?.filePath || null;
}

const greenScreenCss = [
  `:root { color-scheme: light; background: ${chromaGreen} !important; }`,
  `html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: ${chromaGreen} !important; }`,
  ".device-preview-studio {",
  "  width: 100vw !important;",
  "  height: 100vh !important;",
  "  display: grid !important;",
  "  grid-template-columns: minmax(0, 1fr) !important;",
  "  grid-template-rows: minmax(0, 1fr) !important;",
  "  overflow: hidden !important;",
  `  background: ${chromaGreen} !important;`,
  "}",
  ".device-preview-toolbar,",
  ".device-preview-output-summary,",
  ".device-preview-status-announcer { display: none !important; }",
  ".device-preview-canvas-area,",
  ".device-preview-studio:not([data-preview-quality='fit']) .device-preview-canvas-area {",
  "  grid-column: 1 !important;",
  "  grid-row: 1 !important;",
  "  display: grid !important;",
  "  place-items: center !important;",
  "  padding: 0 !important;",
  "  overflow: visible !important;",
  `  background: ${chromaGreen} !important;`,
  "}",
  ".device-preview-canvas {",
  "  overflow: visible !important;",
  "  border-radius: 0 !important;",
  "  box-shadow: none !important;",
  `  background: ${chromaGreen} !important;`,
  "}",
  ".device-preview-studio .device-preview-frame--iphone-17-pro {",
  "  border-radius: var(--iphone-screen-radius) !important;",
  "  box-shadow: none !important;",
  "}",
  ".device-preview-studio .device-preview-frame--iphone-17-pro > .device-preview-iframe {",
  "  border-radius: var(--iphone-screen-radius) !important;",
  "  clip-path: inset(0 round var(--iphone-screen-radius)) !important;",
  "}",
  ".device-preview-studio .device-preview-bezel {",
  "  box-shadow:",
  "    0 0 0 1px rgba(246, 249, 252, 0.9),",
  "    inset 0 0 0 1px rgba(30, 40, 52, 0.36),",
  "    inset 0 1px 2px rgba(255, 255, 255, 0.72),",
  "    inset 0 -1px 2px rgba(46, 56, 70, 0.52) !important;",
  "}"
].join("\n");

async function installTouchOverlay(appFrame) {
  await appFrame.evaluate(() => {
    if (document.querySelector("#codex-manual-touch-style")) return;

    const touchStyle = document.createElement("style");
    touchStyle.id = "codex-manual-touch-style";
    touchStyle.textContent = [
      "html, body, body * { cursor: none !important; }",
      ".codex-manual-touch-pointer, .codex-manual-touch-ripple {",
      "  position: fixed; z-index: 2147483647; pointer-events: none; border-radius: 999px;",
      "}",
      ".codex-manual-touch-pointer {",
      "  left: -80px; top: -80px; width: 38px; height: 38px; margin: -19px 0 0 -19px;",
      "  border: 3px solid rgba(139,92,246,.98); background: rgba(139,92,246,.10);",
      "  box-shadow: 0 0 0 2px rgba(255,255,255,.96), 0 4px 14px rgba(62,35,140,.32);",
      "  opacity: 0; transform: scale(.88);",
      "  transition: opacity 90ms ease, transform 110ms ease, background-color 110ms ease;",
      "}",
      ".codex-manual-touch-pointer::after {",
      "  content: ''; position: absolute; left: 50%; top: 50%; width: 6px; height: 6px;",
      "  margin: -3px 0 0 -3px; border-radius: 999px; background: rgba(139,92,246,.96);",
      "}",
      ".codex-manual-touch-pointer[data-visible='true'] { opacity: 1; transform: scale(1); }",
      ".codex-manual-touch-pointer[data-pressed='true'] {",
      "  transform: scale(.72); background: rgba(139,92,246,.30);",
      "}",
      ".codex-manual-touch-ripple {",
      "  width: 38px; height: 38px; margin: -19px 0 0 -19px;",
      "  border: 4px solid rgba(139,92,246,.92); background: rgba(139,92,246,.10);",
      "  box-shadow: 0 0 0 2px rgba(255,255,255,.76);",
      "  animation: codex-manual-touch-ripple .62s cubic-bezier(.16,1,.3,1) forwards;",
      "}",
      "@keyframes codex-manual-touch-ripple {",
      "  0% { opacity: .96; transform: scale(.55); }",
      "  42% { opacity: .72; }",
      "  100% { opacity: 0; transform: scale(2.35); }",
      "}"
    ].join("\n");
    document.head.appendChild(touchStyle);

    const pointer = document.createElement("span");
    pointer.className = "codex-manual-touch-pointer";
    pointer.setAttribute("aria-hidden", "true");
    document.body.appendChild(pointer);

    const placePointer = (event) => {
      pointer.style.left = `${event.clientX}px`;
      pointer.style.top = `${event.clientY}px`;
      pointer.dataset.visible = "true";
    };

    window.addEventListener("pointermove", placePointer, true);
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        placePointer(event);
        pointer.dataset.pressed = "true";

        const ripple = document.createElement("span");
        ripple.className = "codex-manual-touch-ripple";
        ripple.setAttribute("aria-hidden", "true");
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        document.body.appendChild(ripple);
        window.setTimeout(() => ripple.remove(), 680);
      },
      true
    );
    const releasePointer = () => {
      pointer.dataset.pressed = "false";
    };
    window.addEventListener("pointerup", releasePointer, true);
    window.addEventListener("pointercancel", releasePointer, true);
    window.addEventListener("blur", () => {
      pointer.dataset.visible = "false";
      releasePointer();
    });
  });
}

async function openRecordingController(previewPage) {
  const popupPromise = previewPage.waitForEvent("popup", { timeout: 10_000 });
  await previewPage.evaluate(() => {
    window.open(
      "about:blank",
      "codex-recording-controller",
      "popup=yes,width=390,height=360,left=42,top=90,resizable=no,scrollbars=no"
    );
  });
  const controllerPage = await popupPromise;
  await controllerPage.setContent(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>录制控制台｜不会进入成片</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body {
      display: grid; place-items: center; padding: 20px;
      color: #24223a;
      background: radial-gradient(circle at 50% 0%, #f3efff 0, #fbfaff 58%, #f5f7fb 100%);
    }
    .panel {
      width: 100%; padding: 22px; border: 1px solid rgba(105,79,190,.18); border-radius: 22px;
      background: rgba(255,255,255,.94); box-shadow: 0 18px 48px rgba(49,36,94,.16);
    }
    .eyebrow { margin: 0 0 8px; color: #7357da; font-size: 12px; font-weight: 800; letter-spacing: .08em; }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .hint { margin: 9px 0 16px; color: #6a687c; font-size: 13px; line-height: 1.55; }
    .status {
      display: flex; align-items: center; gap: 9px; margin-bottom: 16px; padding: 11px 13px;
      border-radius: 14px; background: #f4f1ff; color: #5f46bd; font-size: 13px; font-weight: 750;
    }
    .dot { width: 9px; height: 9px; border-radius: 99px; background: #8b5cf6; box-shadow: 0 0 0 5px rgba(139,92,246,.14); }
    .status[data-state="recording"] { color: #be263c; background: #fff0f2; }
    .status[data-state="recording"] .dot { background: #ee3954; box-shadow: 0 0 0 5px rgba(238,57,84,.14); animation: pulse 1s ease-in-out infinite; }
    .time { margin-left: auto; font-variant-numeric: tabular-nums; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    button {
      min-height: 50px; border: 0; border-radius: 15px; color: white; font: inherit; font-weight: 800;
      cursor: pointer; transition: transform .14s ease, opacity .14s ease, box-shadow .14s ease;
    }
    button:not(:disabled):hover { transform: translateY(-1px); }
    button:not(:disabled):active { transform: scale(.98); }
    button:disabled { cursor: not-allowed; opacity: .42; box-shadow: none; }
    #start { background: linear-gradient(135deg,#7655e9,#9b52ef); box-shadow: 0 10px 24px rgba(118,85,233,.28); }
    #stop { background: linear-gradient(135deg,#d93652,#f05462); box-shadow: 0 10px 24px rgba(217,54,82,.24); }
    .foot { margin: 13px 0 0; color: #8b8997; text-align: center; font-size: 11px; }
    @keyframes pulse { 50% { opacity: .45; transform: scale(.78); } }
  </style>
</head>
<body>
  <main class="panel">
    <p class="eyebrow">RECORDING CONTROLLER</p>
    <h1>手机演示录制</h1>
    <p class="hint">按钮与本控制台位于独立窗口，不会进入手机绿幕成片。</p>
    <div id="status" class="status" data-state="ready">
      <span class="dot"></span><span id="label">预览已就绪，等待开始</span><span id="time" class="time">00:00</span>
    </div>
    <div class="actions">
      <button id="start" type="button">开始录制</button>
      <button id="stop" type="button" disabled>停止录制</button>
    </div>
    <p class="foot">备用停止方式：在手机预览窗口按 F8</p>
  </main>
  <script>
    const status = document.querySelector('#status');
    const label = document.querySelector('#label');
    const time = document.querySelector('#time');
    const start = document.querySelector('#start');
    const stop = document.querySelector('#stop');
    let startedAt = 0;
    let timer = 0;
    const updateTime = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const minutesPart = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secondsPart = String(seconds % 60).padStart(2, '0');
      time.textContent = minutesPart + ':' + secondsPart;
    };
    start.addEventListener('click', async () => {
      start.disabled = true;
      label.textContent = '正在启动…';
      await window.__codexStartManualRecording();
      startedAt = Date.now();
      status.dataset.state = 'recording';
      label.textContent = '正在录制';
      stop.disabled = false;
      updateTime();
      timer = window.setInterval(updateTime, 250);
    });
    stop.addEventListener('click', async () => {
      stop.disabled = true;
      label.textContent = '正在保存与编码…';
      window.clearInterval(timer);
      await window.__codexStopManualRecording('controller-button');
    });
  </script>
</body>
</html>`);
  return controllerPage;
}

const baseUrl = optionValue("--base-url", defaultBaseUrl);
const ffmpegPath = path.resolve(optionValue("--ffmpeg", defaultFfmpegPath));
const touchIndicator = !process.argv.includes("--no-touch-indicator");
const rehearsal = process.argv.includes("--rehearse");
const headless = process.argv.includes("--headless");
const demoTouch = process.argv.includes("--demo-touch");
const autoStopMs = Number(optionValue("--auto-stop-ms", "0"));
const stamp = createStamp();
const outputDirectory = rehearsal ? rehearsalDirectory : moviesDirectory;
const rawOutputDirectory = rehearsal ? rehearsalDirectory : sourceDirectory;
const outputStem = rehearsal
  ? `manual-green-screen-2k-rehearsal-${stamp}`
  : `manual-green-screen-2k-${stamp}`;
const rawVideoPath = path.join(rawOutputDirectory, `${outputStem}-source.webm`);
const outputWebmPath = path.join(outputDirectory, `${outputStem}.webm`);
const outputMp4Path = path.join(outputDirectory, `${outputStem}.mp4`);
const manifestPath = path.join(outputDirectory, `${outputStem}.json`);
const stagingDirectory = path.join(projectRoot, "output", "recording-staging", outputStem);

await ensureFile(ffmpegPath, "FFmpeg 编码器");
await mkdir(outputDirectory, { recursive: true });
await mkdir(rawOutputDirectory, { recursive: true });
await mkdir(stagingDirectory, { recursive: true });
await writeStatus("starting", { baseUrl, outputStem });

let resolveStart;
const startPromise = new Promise((resolve) => {
  resolveStart = resolve;
});
let startRequested = false;
let startRequestedAt = null;
const requestStart = (reason) => {
  if (startRequested) return;
  startRequested = true;
  startRequestedAt = performance.now();
  resolveStart(reason);
};

let resolveStop;
const stopPromise = new Promise((resolve) => {
  resolveStop = resolve;
});
let stopRequested = false;
const requestStop = (reason) => {
  if (stopRequested) return;
  stopRequested = true;
  resolveStop(reason);
};

const browser = await chromium.launch({
  headless,
  args: [
    "--disable-infobars",
    "--disable-notifications",
    "--window-position=920,-36"
  ]
});
browser.on("disconnected", () => requestStop("browser-closed"));

const context = await browser.newContext({
  colorScheme: "light",
  deviceScaleFactor: 1,
  locale: "zh-CN",
  reducedMotion: "no-preference",
  timezoneId: "Asia/Hong_Kong",
  viewport: operatorViewport,
  recordVideo: {
    dir: stagingDirectory,
    size: operatorViewport
  }
});

await context.exposeBinding("__codexStartManualRecording", () => {
  requestStart("controller-button");
  return true;
});

await context.exposeBinding("__codexStopManualRecording", (_source, reason = "F8") => {
  requestStop(reason);
  return true;
});

await context.addInitScript(
  (css) => {
    const installRecorderHooks = () => {
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "F8") return;
          event.preventDefault();
          event.stopImmediatePropagation();
          window.__codexStopManualRecording?.("F8");
        },
        true
      );

      if (window === window.top) {
        let style = document.querySelector("#codex-manual-green-screen");
        if (!style) {
          style = document.createElement("style");
          style.id = "codex-manual-green-screen";
          document.head.appendChild(style);
        }
        style.textContent = css;
        document.title = "手机录制预览｜等待开始";
      }

    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installRecorderHooks, { once: true });
    } else {
      installRecorderHooks();
    }
  },
  greenScreenCss
);

const rawClockStartedAt = performance.now();
const page = await context.newPage();
const recordedVideo = page.video();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("close", () => requestStop("page-closed"));

let captureStartedAt = null;
let captureEndedAt = null;
let stopReason = null;
let deviceShellMetadata = null;
let controllerPage = null;

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  const studio = page.locator(".device-preview-studio");
  await studio.waitFor({ state: "visible", timeout: 15_000 });
  const frame = page.locator('[data-testid="device-preview-frame"]');
  const iframe = page.locator("iframe.device-preview-iframe");
  await frame.waitFor({ state: "visible", timeout: 15_000 });
  await iframe.waitFor({ state: "visible", timeout: 15_000 });
  await page.frameLocator("iframe.device-preview-iframe").locator(".app-shell").waitFor({
    state: "visible",
    timeout: 25_000
  });
  const iframeElement = await iframe.elementHandle();
  const embeddedAppFrame = await iframeElement?.contentFrame();
  if (!embeddedAppFrame) throw new Error("无法连接手机预览 iframe");
  if (touchIndicator) await installTouchOverlay(embeddedAppFrame);
  await page.waitForTimeout(600);

  deviceShellMetadata = await frame.evaluate((element) => {
    const rounded = (rect) => ({
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      x: Math.round(rect.x),
      y: Math.round(rect.y)
    });
    const bezel = element.querySelector(".device-preview-bezel");
    const island = element.querySelector(".device-preview-dynamic-island");
    return {
      bezel: bezel ? rounded(bezel.getBoundingClientRect()) : null,
      dynamicIsland: island ? rounded(island.getBoundingClientRect()) : null,
      screen: rounded(element.getBoundingClientRect())
    };
  });

  if (headless || rehearsal) {
    requestStart("automatic");
  } else {
    controllerPage = await openRecordingController(page);
    controllerPage.on("close", () => {
      if (!stopRequested) requestStop(startRequested ? "controller-closed" : "controller-closed-before-start");
    });
    await writeStatus("ready", {
      instructions: "在独立录制控制台点击开始录制；完成后点击停止录制。控制台不会进入成片。",
      outputStem,
      resolution: recordingSize,
      touchIndicator
    });
    console.log("[ready] 预览与控制台已就绪。点击控制台中的“开始录制”。");
  }

  const startGate = await Promise.race([
    startPromise.then((reason) => ({ kind: "start", reason })),
    stopPromise.then((reason) => ({ kind: "stop", reason }))
  ]);
  if (startGate.kind !== "start") {
    throw new Error(`录制在开始前被取消：${startGate.reason}`);
  }

  captureStartedAt = startRequestedAt || performance.now();
  await page.evaluate(() => {
    document.title = "● REC｜控制台停止或按 F8";
  });
  await writeStatus("recording", {
    instructions: "在手机预览中操作；点击独立控制台的停止录制，或在预览窗口按 F8。",
    outputStem,
    resolution: recordingSize,
    touchIndicator
  });
  console.log("[recording] 已开始。请在手机预览中操作，通过控制台停止。");

  if (demoTouch) {
    const frameBounds = await frame.boundingBox();
    if (!frameBounds) throw new Error("无法获取手机屏幕坐标以测试触控指针");
    const targetX = frameBounds.x + frameBounds.width * 0.5;
    const targetY = frameBounds.y + frameBounds.height * 0.46;
    await page.mouse.move(targetX - 90, targetY - 55);
    await page.mouse.move(targetX, targetY, { steps: 18 });
    await page.mouse.down();
    await page.waitForTimeout(140);
    const pointerState = await page.frameLocator("iframe.device-preview-iframe")
      .locator(".codex-manual-touch-pointer")
      .evaluate((element) => ({
        left: element.style.left,
        pressed: element.getAttribute("data-pressed"),
        top: element.style.top,
        visible: element.getAttribute("data-visible")
      }));
    const rippleCount = await page.frameLocator("iframe.device-preview-iframe")
      .locator(".codex-manual-touch-ripple")
      .count();
    console.log(`[touch-demo] pointer=${JSON.stringify(pointerState)} ripples=${rippleCount}`);
    await page.mouse.up();
  }

  if (Number.isFinite(autoStopMs) && autoStopMs > 0) {
    setTimeout(() => requestStop("auto-stop"), autoStopMs);
  }

  stopReason = await stopPromise;
  captureEndedAt = performance.now();
  await writeStatus("finalizing", { outputStem, stopReason });
} catch (error) {
  captureEndedAt = performance.now();
  await writeStatus("error", {
    message: error instanceof Error ? error.message : String(error),
    outputStem
  });
  throw error;
} finally {
  if (!stopRequested) requestStop("script-finished");
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

let stagedVideoPath = null;
if (recordedVideo) {
  stagedVideoPath = await recordedVideo.path().catch(() => null);
}
if (!stagedVideoPath) stagedVideoPath = await newestWebm(stagingDirectory);
if (!stagedVideoPath) throw new Error(`没有找到 Playwright 原始视频：${stagingDirectory}`);
await rename(stagedVideoPath, rawVideoPath);
await rm(stagingDirectory, { recursive: true, force: true });

const trimStartSeconds = Math.max(0, (captureStartedAt - rawClockStartedAt) / 1_000);
const contentDurationSeconds = Math.max(0.1, (captureEndedAt - captureStartedAt) / 1_000);

await runFfmpeg(
  ffmpegPath,
  [
    "-y",
    "-ss",
    trimStartSeconds.toFixed(3),
    "-i",
    rawVideoPath,
    "-t",
    contentDurationSeconds.toFixed(3),
    "-an",
    "-vf",
    `fps=30,scale=${recordingSize.width}:${recordingSize.height}:flags=lanczos`,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "17",
    "-b:v",
    "0",
    "-deadline",
    "good",
    "-cpu-used",
    "5",
    "-row-mt",
    "1",
    "-threads",
    "8",
    "-g",
    "60",
    outputWebmPath
  ],
  "生成 30 fps VP9 WebM"
);

await runFfmpeg(
  ffmpegPath,
  [
    "-y",
    "-ss",
    trimStartSeconds.toFixed(3),
    "-i",
    rawVideoPath,
    "-t",
    contentDurationSeconds.toFixed(3),
    "-an",
    "-vf",
    `fps=30,scale=${recordingSize.width}:${recordingSize.height}:flags=lanczos:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv`,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "15",
    "-profile:v",
    "high",
    "-level",
    "5.1",
    "-pix_fmt",
    "yuv420p",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-g",
    "60",
    "-movflags",
    "+faststart",
    outputMp4Path
  ],
  "生成 H.264 MP4"
);

const [rawMetadata, webmMetadata, mp4Metadata] = await Promise.all([
  inspectVideo(ffmpegPath, rawVideoPath),
  inspectVideo(ffmpegPath, outputWebmPath),
  inspectVideo(ffmpegPath, outputMp4Path)
]);

for (const [label, metadata] of [["WebM", webmMetadata], ["MP4", mp4Metadata]]) {
  if (metadata.width !== recordingSize.width || metadata.height !== recordingSize.height) {
    throw new Error(`${label} 尺寸不正确：${metadata.width}×${metadata.height}`);
  }
  if (metadata.fps !== 30) throw new Error(`${label} 帧率不正确：${metadata.fps}`);
}

const manifest = {
  baseUrl,
  chromaKey: {
    color: chromaGreen,
    note: "手机外壳之外为纯绿色；录制源仅包含浏览器页面帧。"
  },
  completed: true,
  device: {
    model: "iPhone 17 Pro",
    orientation: "portrait",
    shellIncluded: true
  },
  deviceShellMetadata,
  files: {
    h264Mp4: outputMp4Path,
    sourceWebm: rawVideoPath,
    vp9Webm: outputWebmPath
  },
  frameRate: 30,
  mode: "manual",
  noAudio: true,
  operatorViewport,
  output: recordingSize,
  pageErrors,
  stopReason,
  touchIndicator,
  videoMetadata: {
    h264Mp4: mp4Metadata,
    sourceWebm: rawMetadata,
    vp9Webm: webmMetadata
  }
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeStatus("completed", {
  manifestPath,
  outputFiles: manifest.files,
  outputStem,
  videoMetadata: manifest.videoMetadata
});

console.log(JSON.stringify({ manifestPath, outputFiles: manifest.files, videoMetadata: manifest.videoMetadata }, null, 2));
