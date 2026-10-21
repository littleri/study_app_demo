import { expect, test, type Page } from "playwright/test";
import { readFileSync } from "node:fs";
import { emptyCourseState } from "../src/features/courses/model";

// Exercise the complete CSS contract, including legacy screen-specific rules.
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const metadata = appSource.slice(appSource.indexOf("const titles:"), appSource.indexOf("const toastQuietScreens"));
const pageHeaders = [...metadata.matchAll(/^ {2}(\w+): \{(.*)\},?$/gm)].map((match) => ({
  screen: match[1],
  title: match[2].match(/title: "([^"]+)"/)?.[1] ?? "教材原文",
  hideNav: match[2].includes("hideNav: true")
}));

test.use({ locale: "zh-CN", reducedMotion: "reduce" });

async function expectPageTitle(page: Page, name?: string) {
  const title = page.locator(".header-title h1");
  if (name) await expect(title).toHaveText(name);
  await expect(title).toBeVisible();
  await expect(page.locator(".header-title p")).toHaveCount(0);
  await expect.poll(async () => title.evaluate((element) => element.getBoundingClientRect().top)).toBe(66);
  expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
  const layout = await page.evaluate(() => {
    const header = document.querySelector(".header-bar")!.getBoundingClientRect();
    const main = document.querySelector("main")!;
    return { headerBottom: header.bottom, contentTop: parseFloat(getComputedStyle(main).paddingTop) };
  });
  expect(layout.contentTop).toBeGreaterThanOrEqual(layout.headerBottom);
}

test("study and discovery start with sticky controls; other tabs retain their title", async ({ page }, testInfo) => {
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".home-dashboard")).toBeVisible();
  await expectPageTitle(page);
  for (const [label, selector] of [["学习", ".study-sticky-controls"], ["发现", ".community-discovery-controls"]]) {
    await page.locator(`.primary-nav .nav-item[aria-label="${label}"]`).click();
    await expect(page.locator(".header-bar")).toHaveCount(0);
    await expect(page.locator(".header-title h1")).toHaveCount(0);
    const controls = page.locator(selector);
    await expect(controls).toBeVisible();
    const statusBottom = await page.locator(".app-shell").evaluate((element) => element.querySelector(".ios-status-bar")?.getBoundingClientRect().bottom ?? 0);
    await expect.poll(async () => (await controls.boundingBox())!.y).toBeCloseTo(statusBottom + 4, 0);
    const initial = await controls.boundingBox();
    await page.locator("main").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => (await controls.boundingBox())!.y).toBeCloseTo(initial!.y, 0);
    await expect.poll(async () => controls.evaluate((element) => {
      const blur = element.querySelector(".sticky-controls-background")!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return Math.abs(blur.bottom - bounds.bottom);
    })).toBeLessThan(1);
    const blur = controls.locator(".sticky-controls-background");
    await expect.poll(async () => (await blur.boundingBox())!.y).toBeCloseTo(0, 0);
    const railRight = await page.locator(".primary-nav").evaluate((element) => {
      return element.closest(".app-shell")?.getAttribute("data-device-layout") === "pad" ? element.getBoundingClientRect().right : 0;
    });
    await expect.poll(async () => (await blur.boundingBox())!.x).toBeCloseTo(railRight, 0);
    await page.screenshot({ path: testInfo.outputPath(`${label === "学习" ? "study" : "discovery"}-sticky-controls.png`) });
  }
  await page.locator('.primary-nav .nav-item[aria-label="我的"]').click();
  await expectPageTitle(page, "我的");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expectPageTitle(page, "设置");
});

test("the 26 shared page headers use the same title and content offsets", async ({ page }) => {
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".home-dashboard")).toBeVisible();
  await page.locator('.primary-nav .nav-item[aria-label="我的"]').click();
  await expectPageTitle(page, "我的");
  expect(pageHeaders).toHaveLength(28);
  const sharedHeaders = pageHeaders.filter(({ screen }) => screen !== "study" && screen !== "community");
  expect(sharedHeaders).toHaveLength(26);
  const layouts = await page.evaluate((headers) => {
    const shell = document.querySelector<HTMLElement>(".app-shell")!;
    const main = document.querySelector<HTMLElement>("main")!;
    const header = document.querySelector<HTMLElement>(".header-bar")!;
    const title = header.querySelector<HTMLElement>("h1")!;
    return headers.map((item) => {
      shell.dataset.activeScreen = item.screen;
      main.dataset.screen = item.screen;
      main.classList.toggle("without-nav", item.hideNav);
      title.textContent = item.title;
      return {
        screen: item.screen,
        titleTop: title.getBoundingClientRect().top,
        headerHeight: header.getBoundingClientRect().height,
        headerBottom: header.getBoundingClientRect().bottom,
        contentTop: parseFloat(getComputedStyle(main).paddingTop)
      };
    });
  }, sharedHeaders);
  for (const layout of layouts) {
    expect(layout.titleTop, layout.screen).toBe(66);
    expect(layout.headerHeight, layout.screen).toBe(44);
    expect(layout.contentTop, layout.screen).toBeGreaterThanOrEqual(layout.headerBottom);
  }
});

test("onboarding questions update the shared title and still complete normally", async ({ page }, testInfo) => {
  await page.addInitScript((state) => localStorage.setItem("bookcourse.courses.v2", JSON.stringify(state)), emptyCourseState());
  await page.goto("/?embedded=device-preview");
  await expectPageTitle(page, "我们怎么称呼你");
  await page.getByLabel("你的称呼", { exact: true }).fill("小明");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expectPageTitle(page, "你使用云径的主要目标是");
  await expect(page.getByText("选择此刻最重要的一项，之后可以修改。", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "系统学习", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expectPageTitle(page, "你每天能投入多少学习时间");
  expect(await page.locator(".header-title h1").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("onboarding-title.png") });
  await page.getByRole("button", { name: "30分钟以内", exact: true }).click();
  await page.getByRole("button", { name: "开始专属学习之旅", exact: true }).click();
  await expectPageTitle(page, "Hi，小明");
});

test("lesson and source reader keep the title above usable reading controls", async ({ page }, testInfo) => {
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "继续学习", exact: true }).click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
  await expectPageTitle(page, "章节学习");
  await page.locator(".lesson-source-link").first().click();
  const reader = page.locator(".source-reader-screen");
  await expect(reader).toBeVisible();
  await expectPageTitle(page);
  const image = reader.locator(".source-annotation-page > img");
  await expect(image).toBeVisible();
  expect((await image.boundingBox())!.y).toBeGreaterThanOrEqual(110);
  await page.screenshot({ path: testInfo.outputPath("source-title.png") });
});
