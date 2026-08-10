/* global document, window */

import { chromium } from "playwright";
import {
  mkdir,
  readdir,
  rename,
  rmdir,
  stat,
  writeFile
} from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const moviesDirectory = path.join(projectRoot, "movies");
const rehearsalDirectory = path.join(projectRoot, "output", "recording-rehearsal", "02-home-overview");
const sourceDirectory = path.join(projectRoot, "output", "recording-source");
const defaultBaseUrl = "http://127.0.0.1:5173/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=1";
const defaultFfmpegPath = path.join(
  projectRoot,
  "output",
  "video-tools",
  "node_modules",
  "ffmpeg-static",
  "ffmpeg.exe"
);
const recordingViewport = { height: 2880, width: 1440 };
const chromaGreen = "#00FF00";

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function createStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function nextTakeNumber() {
  const names = await readdir(moviesDirectory).catch(() => []);
  let maximum = 0;
  for (const name of names) {
    const match = /^02-home-overview-take(\d{2})\.(?:webm|mp4|json)$/.exec(name);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum + 1;
}

async function ensureFile(filePath, label) {
  const details = await stat(filePath).catch(() => null);
  if (!details?.isFile()) throw new Error(`${label}不存在：${filePath}`);
}

async function waitForAttribute(page, locator, attribute, expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await locator.getAttribute(attribute).catch(() => null);
    if (actual === expected) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`等待属性失败：${attribute}，期望 ${expected}，实际 ${actual}`);
}

async function waitForText(page, locator, expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let actual = "";
  while (Date.now() < deadline) {
    actual = (await locator.textContent().catch(() => "")) || "";
    if (actual.includes(expected)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`等待文本失败：${expected}，实际 ${actual}`);
}

async function runFfmpeg(ffmpegPath, args, label) {
  console.log(`[encode] ${label}`);
  try {
    const result = await execFileAsync(ffmpegPath, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    });
    if (result.stderr?.trim()) {
      const usefulLines = result.stderr.trim().split(/\r?\n/).slice(-8);
      console.log(usefulLines.join("\n"));
    }
  } catch (error) {
    const diagnostic = [error?.stdout, error?.stderr].filter(Boolean).join("\n");
    throw new Error(`${label}失败\n${diagnostic || error}`);
  }
}

async function inspectVideo(ffmpegPath, videoPath) {
  try {
    const result = await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-i",
        videoPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-"
      ],
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

async function applyGreenScreenLayout(page) {
  const studio = page.locator(".device-preview-studio");
  await studio.waitFor({ state: "visible", timeout: 15_000 });
  const layoutCss = [
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
    "    0 0 0 2px rgba(246, 249, 252, 0.9),",
    "    inset 0 0 0 2px rgba(30, 40, 52, 0.36),",
    "    inset 0 2px 3px rgba(255, 255, 255, 0.72),",
    "    inset 0 -2px 4px rgba(46, 56, 70, 0.52) !important;",
    "}",
    "*, *::before, *::after { cursor: none !important; }"
  ].join("\n");

  await page.evaluate((css) => {
    let style = document.querySelector("#promo-green-screen-layout");
    if (!style) {
      style = document.createElement("style");
      style.id = "promo-green-screen-layout";
      document.head.appendChild(style);
    }
    style.textContent = css;
  }, layoutCss);

  const bezel = page.locator('[data-testid="device-preview-bezel"]');
  const island = page.locator('[data-testid="device-preview-dynamic-island"]');
  await bezel.waitFor({ state: "visible", timeout: 12_000 });
  await island.waitFor({ state: "visible", timeout: 12_000 });
  await page.waitForTimeout(250);

  return await page.locator('[data-testid="device-preview-frame"]').evaluate((frame) => {
    const rounded = (rect) => ({
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      x: Math.round(rect.x),
      y: Math.round(rect.y)
    });
    const bezelElement = frame.querySelector(".device-preview-bezel");
    const islandElement = frame.querySelector(".device-preview-dynamic-island");
    return {
      bezel: bezelElement ? rounded(bezelElement.getBoundingClientRect()) : null,
      dynamicIsland: islandElement ? rounded(islandElement.getBoundingClientRect()) : null,
      screen: rounded(frame.getBoundingClientRect())
    };
  });
}

async function prepareHomePage(page, appFrame) {
  const screen = appFrame.locator(".home-dashboard");
  await screen.waitFor({ state: "visible", timeout: 18_000 });
  await waitForAttribute(
    page,
    appFrame.locator(".motion-screen-transition"),
    "data-motion-state",
    "idle",
    18_000
  );

  const workspace = appFrame.locator('.home-book-workspace[data-loaded="true"]');
  await workspace.waitFor({ state: "visible", timeout: 25_000 });
  await waitForText(page, appFrame.locator(".home-book-selection-summary"), "生物 必修 2 遗传与进化");
  await waitForText(page, workspace, "减数分裂和受精作用");
  await workspace.getByRole("button", { name: "继续学习", exact: true }).waitFor({
    state: "visible",
    timeout: 12_000
  });
  await appFrame.getByText("本章工具", { exact: true }).waitFor({ state: "visible", timeout: 12_000 });

  await appFrame.locator("body").evaluate(async (body) => {
    let style = document.querySelector("#promo-home-recording-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "promo-home-recording-style";
      document.head.appendChild(style);
    }
    style.textContent = [
      "*, *::before, *::after { cursor: none !important; }",
      "main.screen-content, .home-book-workspace .study-tool-grid { scroll-behavior: auto !important; }",
      ".home-book-workspace .study-tool-grid { scroll-snap-type: none !important; }"
    ].join("\n");
    const selectedCoverImages = Array.from(
      body.querySelectorAll(".home-book-option.is-selected img")
    );
    const resourceTimeout = new Promise((resolve) => window.setTimeout(resolve, 3_000));
    await Promise.race([
      Promise.all(selectedCoverImages.map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        await image.decode?.().catch(() => {});
      })),
      resourceTimeout
    ]);
    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((resolve) => window.setTimeout(resolve, 3_000))
    ]);

    const scroller = document.querySelector("main.screen-content");
    const tools = document.querySelector(".home-book-workspace .study-tool-grid");
    if (!scroller || !tools) throw new Error("首页滚动容器不存在");
    scroller.scrollTop = 0;
    tools.scrollLeft = 0;
  });
  await page.waitForTimeout(350);

  return workspace;
}

async function homeMetrics(appFrame) {
  return await appFrame.locator(".home-dashboard").evaluate((home) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        bottom: Number(bounds.bottom.toFixed(1)),
        height: Number(bounds.height.toFixed(1)),
        left: Number(bounds.left.toFixed(1)),
        right: Number(bounds.right.toFixed(1)),
        top: Number(bounds.top.toFixed(1)),
        width: Number(bounds.width.toFixed(1))
      };
    };
    const scroller = document.querySelector("main.screen-content");
    const tools = document.querySelector(".home-book-workspace .study-tool-grid");
    return {
      bookCover: rect(".home-book-option.is-selected"),
      chapterTools: rect(".home-chapter-tools"),
      continueButton: rect(".home-primary-action"),
      header: rect(".home-topline"),
      homeHeight: Number(home.getBoundingClientRect().height.toFixed(1)),
      scroller: scroller ? {
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        scrollTop: Number(scroller.scrollTop.toFixed(1))
      } : null,
      toolGrid: tools ? {
        clientWidth: tools.clientWidth,
        scrollLeft: Number(tools.scrollLeft.toFixed(1)),
        scrollWidth: tools.scrollWidth
      } : null,
      viewport: { height: window.innerHeight, width: window.innerWidth }
    };
  });
}

async function animateHomeOverview(appFrame, durationMs) {
  return await appFrame.locator(".home-dashboard").evaluate(async (_home, duration) => {
    const scroller = document.querySelector("main.screen-content");
    const tools = document.querySelector(".home-book-workspace .study-tool-grid");
    if (!scroller || !tools) throw new Error("首页滚动容器不存在");

    const startTop = scroller.scrollTop;
    const targetTop = Math.min(170, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    const startLeft = tools.scrollLeft;
    const targetLeft = Math.min(132, Math.max(0, tools.scrollWidth - tools.clientWidth));
    const start = performance.now();
    const smoothstep = (value) => value * value * (3 - 2 * value);

    await new Promise((resolve) => {
      const tick = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const vertical = smoothstep(progress);
        const horizontalRaw = Math.max(0, Math.min(1, (progress - 0.46) / 0.54));
        const horizontal = smoothstep(horizontalRaw);
        scroller.scrollTop = startTop + (targetTop - startTop) * vertical;
        tools.scrollLeft = startLeft + (targetLeft - startLeft) * horizontal;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });

    return {
      scrollLeft: Number(tools.scrollLeft.toFixed(1)),
      scrollTop: Number(scroller.scrollTop.toFixed(1)),
      targetLeft,
      targetTop
    };
  }, durationMs);
}

const rehearsal = process.argv.includes("--rehearse");
const baseUrl = optionValue("--base-url", defaultBaseUrl);
const ffmpegPath = path.resolve(optionValue("--ffmpeg", defaultFfmpegPath));
const takeNumber = rehearsal ? null : await nextTakeNumber();
const stamp = createStamp();
const outputDirectory = rehearsal ? rehearsalDirectory : moviesDirectory;
const outputStem = rehearsal
  ? `02-home-overview-green-screen-rehearsal-${stamp}`
  : `02-home-overview-take${String(takeNumber).padStart(2, "0")}`;
const outputWebmPath = path.join(outputDirectory, `${outputStem}.webm`);
const outputMp4Path = path.join(outputDirectory, `${outputStem}.mp4`);
const manifestPath = path.join(outputDirectory, `${outputStem}.json`);
const initialStillPath = path.join(outputDirectory, `${outputStem}-start.png`);
const finalStillPath = path.join(outputDirectory, `${outputStem}-tools.png`);
const errorStillPath = path.join(outputDirectory, `${outputStem}-error.png`);
const sourceVideoPath = path.join(sourceDirectory, `${outputStem}-source.webm`);
const videoStagingDirectory = path.join(projectRoot, "output", "recording-staging", outputStem);
const timing = rehearsal
  ? { endHoldMs: 180, initialHoldMs: 120, movementMs: 520, preRollMs: 80 }
  : { endHoldMs: 5_000, initialHoldMs: 2_500, movementMs: 12_000, preRollMs: 900 };

await mkdir(outputDirectory, { recursive: true });
if (!rehearsal) {
  await ensureFile(ffmpegPath, "FFmpeg 编码器");
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(videoStagingDirectory, { recursive: true });
}

const browser = await chromium.launch({ headless: true });
const contextOptions = {
  colorScheme: "light",
  deviceScaleFactor: 1,
  locale: "zh-CN",
  reducedMotion: "no-preference",
  timezoneId: "Asia/Hong_Kong",
  viewport: recordingViewport
};
if (!rehearsal) {
  contextOptions.recordVideo = {
    dir: videoStagingDirectory,
    size: recordingViewport
  };
}

const context = await browser.newContext(contextOptions);
const rawClockStartedAt = performance.now();
const activePage = await context.newPage();
const recordedVideo = activePage.video();
let appFrame;
let captureStartedAt = null;
let captureEndedAt = null;
let canvasMetadata = null;
let deviceShellMetadata = null;
let initialMetrics = null;
let finalMetrics = null;
let overviewMotion = null;
let routeCompleted = false;
const pageErrors = [];

activePage.on("pageerror", (error) => {
  pageErrors.push(error.message);
  console.warn(`[pageerror] ${error.message}`);
});

try {
  await activePage.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20_000
  });

  deviceShellMetadata = await applyGreenScreenLayout(activePage);
  const canvas = activePage.locator('[data-testid="device-preview-canvas"]');
  await canvas.waitFor({ state: "visible", timeout: 15_000 });
  await waitForAttribute(activePage, canvas, "data-canvas-width", "1206");
  await waitForAttribute(activePage, canvas, "data-canvas-height", "2622");
  canvasMetadata = await canvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      canvasHeight: Number(element.getAttribute("data-canvas-height")),
      canvasWidth: Number(element.getAttribute("data-canvas-width")),
      outputHeight: window.innerHeight,
      outputWidth: window.innerWidth,
      renderedHeight: Math.round(bounds.height),
      renderedWidth: Math.round(bounds.width),
      x: Math.round(bounds.x),
      y: Math.round(bounds.y)
    };
  });

  appFrame = activePage.frameLocator('iframe[title="BookCourse AI 设备预览内层应用"]');
  await prepareHomePage(activePage, appFrame);
  initialMetrics = await homeMetrics(appFrame);
  await activePage.screenshot({ path: initialStillPath, type: "png" });
  console.log(`[still] 首页起始画面 -> ${initialStillPath}`);

  await activePage.waitForTimeout(timing.preRollMs);
  captureStartedAt = performance.now();

  // 02｜产品登场与首页概览：无点击，先静止，再用一次连续平稳的纵向/工具横向联动滚动。
  await activePage.waitForTimeout(timing.initialHoldMs);
  overviewMotion = await animateHomeOverview(appFrame, timing.movementMs);
  await activePage.waitForTimeout(timing.endHoldMs);
  captureEndedAt = performance.now();

  finalMetrics = await homeMetrics(appFrame);
  await activePage.screenshot({ path: finalStillPath, type: "png" });
  console.log(`[still] 本章工具结束画面 -> ${finalStillPath}`);

  if (finalMetrics.scroller?.scrollTop < 150) {
    throw new Error(`首页纵向滚动不足：${finalMetrics.scroller?.scrollTop}`);
  }
  if (finalMetrics.toolGrid?.scrollLeft < 110) {
    throw new Error(`本章工具横向展示不足：${finalMetrics.toolGrid?.scrollLeft}`);
  }
  if (pageErrors.length > 0) {
    throw new Error(`页面出现运行错误：${pageErrors.join(" | ")}`);
  }

  routeCompleted = true;
} catch (error) {
  await activePage.screenshot({ path: errorStillPath, type: "png" }).catch(() => {});
  console.error(`[recording-error] ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  await context.close();
}

let rawVideoMetadata = null;
let webmMetadata = null;
let mp4Metadata = null;
let outputFiles = null;

if (!rehearsal && routeCompleted && recordedVideo && captureStartedAt && captureEndedAt) {
  const stagedVideoPath = await recordedVideo.path();
  await rename(stagedVideoPath, sourceVideoPath);
  await rmdir(videoStagingDirectory).catch(() => {});

  const trimStartSeconds = (captureStartedAt - rawClockStartedAt) / 1_000;
  const contentDurationSeconds = (captureEndedAt - captureStartedAt) / 1_000;

  await runFfmpeg(
    ffmpegPath,
    [
      "-y",
      "-ss",
      trimStartSeconds.toFixed(3),
      "-i",
      sourceVideoPath,
      "-t",
      contentDurationSeconds.toFixed(3),
      "-an",
      "-vf",
      "fps=30",
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
      "-tile-columns",
      "2",
      "-threads",
      "8",
      "-g",
      "60",
      outputWebmPath
    ],
    "生成 30 fps VP9 WebM 原片"
  );

  await runFfmpeg(
    ffmpegPath,
    [
      "-y",
      "-ss",
      trimStartSeconds.toFixed(3),
      "-i",
      sourceVideoPath,
      "-t",
      contentDurationSeconds.toFixed(3),
      "-an",
      "-vf",
      "fps=30,scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv",
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
    "生成 H.264 MP4 交付片"
  );

  rawVideoMetadata = await inspectVideo(ffmpegPath, sourceVideoPath);
  webmMetadata = await inspectVideo(ffmpegPath, outputWebmPath);
  mp4Metadata = await inspectVideo(ffmpegPath, outputMp4Path);

  for (const [label, metadata] of [["WebM", webmMetadata], ["MP4", mp4Metadata]]) {
    if (metadata.width !== recordingViewport.width || metadata.height !== recordingViewport.height) {
      throw new Error(`${label} 尺寸不正确：${metadata.width}×${metadata.height}`);
    }
    if (metadata.fps !== 30) throw new Error(`${label} 帧率不正确：${metadata.fps}`);
    if (!metadata.durationSeconds || metadata.durationSeconds < 18 || metadata.durationSeconds > 22) {
      throw new Error(`${label} 时长超出 18–22 秒：${metadata.durationSeconds}`);
    }
  }
  if (!mp4Metadata.codec?.toLowerCase().includes("h264")) {
    throw new Error(`MP4 编码不是 H.264：${mp4Metadata.codec}`);
  }

  outputFiles = {
    h264Mp4: outputMp4Path,
    sourceWebm: sourceVideoPath,
    vp9Webm: outputWebmPath
  };
}

const manifest = {
  baseUrl,
  chromaKey: {
    color: chromaGreen,
    note: "手机外壳之外使用纯色绿幕；录制布局已移除工作台渐变和手机投影。"
  },
  completed: routeCompleted,
  device: {
    model: "iPhone 17 Pro",
    orientation: "portrait",
    quality: "retina-3x",
    shellIncluded: true
  },
  deviceShellMetadata,
  files: outputFiles,
  frameRate: 30,
  initialMetrics,
  finalMetrics,
  mode: rehearsal ? "rehearsal" : "recording",
  noAudio: true,
  output: {
    height: recordingViewport.height,
    width: recordingViewport.width
  },
  overviewMotion,
  pageErrors,
  section: {
    id: "02",
    name: "产品登场与首页概览",
    page: "首页",
    sourceGuide: "docs/APP_PROMO_VIDEO_RECORDING_GUIDE_4MIN.md",
    targetDurationSeconds: [18, 22]
  },
  timeline: [
    { atSeconds: 0, action: "首页完整静止；展示问候语和导入课程" },
    { atSeconds: Number((timing.initialHoldMs / 1000).toFixed(1)), action: "开始连续平稳滚动；教材书架进入视觉中心" },
    { atSeconds: Number(((timing.initialHoldMs + timing.movementMs * 0.54) / 1000).toFixed(1)), action: "这本书的下一步与继续学习保持可读" },
    { atSeconds: Number(((timing.initialHoldMs + timing.movementMs) / 1000).toFixed(1)), action: "本章工具完整进入画面；不点击继续学习" },
    { atSeconds: Number(((timing.initialHoldMs + timing.movementMs + timing.endHoldMs) / 1000).toFixed(1)), action: "结束" }
  ],
  videoMetadata: {
    h264Mp4: mp4Metadata,
    sourceWebm: rawVideoMetadata,
    vp9Webm: webmMetadata
  }
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await browser.close();

console.log(JSON.stringify({
  completed: routeCompleted,
  manifestPath,
  mode: manifest.mode,
  outputFiles,
  stills: {
    final: finalStillPath,
    initial: initialStillPath
  },
  videoMetadata: manifest.videoMetadata
}, null, 2));

if (!routeCompleted) process.exitCode = 1;
