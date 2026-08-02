import { expect, test } from "playwright/test";

test.describe("device preview studio", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-17-pro", "The device studio matrix runs once in the canonical iPhone project.");
  });

  test("keeps the ordinary and embedded entries free of recursive studio chrome", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".device-preview-studio")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator(".app-shell")).toHaveAttribute("data-device-layout", "phone");
    await expect.poll(() => page.evaluate(() => {
      const mainInteractive = document.querySelector<HTMLElement>("main button:not([disabled]), main a[href], main input:not([disabled])");
      const firstNavigationButton = document.querySelector<HTMLElement>(".primary-nav button");
      if (!mainInteractive || !firstNavigationButton) return false;
      return Boolean(mainInteractive.compareDocumentPosition(firstNavigationButton) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);

    await page.goto("/?embedded=device-preview&preview=devices");
    await expect(page.locator(".device-preview-studio")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator(".app-shell")).toBeVisible();
  });

  test("uses one iframe and preserves inner page, dialog, input, and main identity", async ({ page }) => {
    await page.goto("/?preview=devices&device=iphone-17-pro&orientation=portrait&quality=fit");
    const iframe = page.locator("iframe.device-preview-iframe");
    await expect(iframe).toHaveAttribute("src", "/?embedded=device-preview");
    await expect(iframe).toHaveAttribute("title", "BookCourse AI 设备预览内层应用");
    const iframeHandle = await iframe.elementHandle();
    if (!iframeHandle) throw new Error("The device preview iframe did not mount");
    const embeddedFrame = page.frameLocator("iframe.device-preview-iframe");

    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 874, width: 402 });

    await iframeHandle.evaluate((element) => {
      const iframeElement = element as HTMLIFrameElement;
      iframeElement.dataset.testLoadCount = "0";
      iframeElement.addEventListener("load", () => {
        iframeElement.dataset.testLoadCount = String(Number(iframeElement.dataset.testLoadCount ?? "0") + 1);
      });
    });
    await expect(iframe).toHaveAttribute("data-test-load-count", "0");
    await expect.poll(() => iframeHandle.evaluate((element) => (
      element === element.ownerDocument.querySelector("iframe.device-preview-iframe")
    ))).toBe(true);
    await expect(embeddedFrame.locator("[data-testid='ios-status-bar']")).toBeVisible();
    await expect(embeddedFrame.locator(".ios-status-bar__time")).toHaveText("9:41");
    await expect(embeddedFrame.locator(".ios-status-bar__signal-bar")).toHaveCount(4);
    await expect(embeddedFrame.locator(".ios-status-bar__wifi")).toBeVisible();
    await expect(embeddedFrame.locator(".ios-status-bar__battery")).toBeVisible();
    await expect(embeddedFrame.locator(".home-indicator")).toBeVisible();

    await page.getByTestId("device-preview-orientation-landscape").click();
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 402, width: 874 });
    await page.getByTestId("device-preview-device-ipad-pro-11").click();
    await page.getByTestId("device-preview-orientation-portrait").click();
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 1194, width: 834 });
    await page.getByTestId("device-preview-device-iphone-17-pro").click();
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 874, width: 402 });

    await embeddedFrame.getByRole("button", { name: "继续学习", exact: true }).click();
    await expect(embeddedFrame.locator(".library-screen")).toBeVisible();
    const innerMain = await embeddedFrame.locator("main").elementHandle();
    if (!innerMain) throw new Error("The embedded app main landmark did not mount");

    await embeddedFrame.getByRole("button", { name: "打开 AI 助手" }).click();
    const assistant = embeddedFrame.getByRole("dialog", { name: "AI 导学助手" });
    await expect(assistant).toBeVisible();
    await assistant.getByRole("textbox", { name: "向 AI 助手提问" }).fill("唯一设备状态文本");
    const innerNavigation = await embeddedFrame.locator(".primary-nav").elementHandle();
    if (!innerNavigation) throw new Error("The embedded app primary navigation did not mount");

    await page.getByTestId("device-preview-device-ipad-pro-11").click();
    await page.getByTestId("device-preview-orientation-landscape").click();
    await page.getByTestId("device-preview-quality-retina-3x").click();

    await expect.poll(() => iframeHandle.evaluate((element) => element.isConnected)).toBe(true);
    await expect.poll(() => iframeHandle.evaluate((element) => (
      element === element.ownerDocument.querySelector("iframe.device-preview-iframe")
    ))).toBe(true);
    await expect(iframe).toHaveAttribute("data-test-load-count", "0");
    await expect(iframe).toHaveAttribute("src", "/?embedded=device-preview");
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 834, width: 1194 });
    await expect(embeddedFrame.locator(".library-screen")).toBeVisible();
    await expect(assistant).toBeVisible();
    await expect(assistant.getByRole("textbox", { name: "向 AI 助手提问" })).toHaveValue("唯一设备状态文本");
    await expect.poll(() => innerMain.evaluate((element) => element.isConnected)).toBe(true);
    await expect(embeddedFrame.locator(".app-shell")).toHaveAttribute("data-device-layout", "pad");
    await expect(embeddedFrame.locator("[data-testid='ios-status-bar']")).toBeHidden();
    await expect(embeddedFrame.locator(".home-indicator")).toBeHidden();
    await expect(embeddedFrame.locator(".primary-nav")).toBeVisible();
    await expect(embeddedFrame.locator(".primary-nav .nav-item")).toHaveCount(4);
    await expect.poll(() => innerNavigation.evaluate((element) => element.isConnected)).toBe(true);
    await expect.poll(() => innerNavigation.evaluate((element) => element === element.ownerDocument.querySelector(".primary-nav"))).toBe(true);
  });

  test("uses the Phone chrome for a short landscape viewport and keeps the app inside its width", async ({ page }) => {
    await page.goto("/?preview=devices&device=iphone-17-pro&orientation=landscape");
    const embeddedFrame = page.frameLocator("iframe.device-preview-iframe");

    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 402, width: 874 });
    await expect(embeddedFrame.locator(".app-shell")).toHaveAttribute("data-device-layout", "phone");
    await expect(embeddedFrame.locator("[data-testid='ios-status-bar']")).toBeHidden();
    await expect(embeddedFrame.locator(".home-indicator")).toBeHidden();
    await expect(embeddedFrame.locator(".primary-nav")).toBeVisible();
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth) : false;
    }).toBe(true);
  });

  test("keeps Fit inside the dynamic viewport and announces the final resized geometry", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 903 });
    await page.goto("/?preview=devices&quality=fit");

    await expect.poll(async () => page.evaluate(() => {
      const studio = document.querySelector<HTMLElement>(".device-preview-studio");
      const canvasArea = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas-area']");
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      if (!studio || !canvasArea || !canvas) return false;
      const studioRect = studio.getBoundingClientRect();
      const canvasAreaRect = canvasArea.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const scrollingElement = document.scrollingElement;
      return studioRect.height <= window.innerHeight + 1
        && (scrollingElement?.scrollHeight ?? 0) <= (scrollingElement?.clientHeight ?? window.innerHeight) + 1
        && canvasRect.top >= canvasAreaRect.top - 1
        && canvasRect.left >= canvasAreaRect.left - 1
        && canvasRect.bottom <= canvasAreaRect.bottom + 1
        && canvasRect.right <= canvasAreaRect.right + 1;
    })).toBe(true);

    await expect.poll(async () => page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      const announcer = document.querySelector<HTMLElement>("[data-testid='device-preview-status-announcer']");
      if (!canvas || !announcer) return false;
      const width = canvas.dataset.canvasWidth;
      const height = canvas.dataset.canvasHeight;
      return Boolean(width && height && announcer.textContent?.includes(`输出 ${width} × ${height}`));
    })).toBe(true);

    await page.evaluate(() => {
      const announcer = document.querySelector<HTMLElement>("[data-testid='device-preview-status-announcer']");
      if (!announcer) throw new Error("The device preview live region did not mount");
      announcer.dataset.testMutationCount = "0";
      const observer = new MutationObserver(() => {
        announcer.dataset.testMutationCount = String(Number(announcer.dataset.testMutationCount ?? "0") + 1);
      });
      observer.observe(announcer, { characterData: true, childList: true, subtree: true });
    });

    for (const viewport of [
      { width: 430, height: 880 },
      { width: 440, height: 870 },
      { width: 410, height: 850 },
      { width: 420, height: 860 }
    ]) {
      await page.setViewportSize(viewport);
    }

    await expect.poll(async () => page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      const announcer = document.querySelector<HTMLElement>("[data-testid='device-preview-status-announcer']");
      if (!canvas || !announcer) return null;
      const width = canvas.dataset.canvasWidth;
      const height = canvas.dataset.canvasHeight;
      return {
        matchesFinalGeometry: Boolean(width && height && announcer.textContent?.includes(`输出 ${width} × ${height}`)),
        mutationCount: Number(announcer.dataset.testMutationCount ?? "0")
      };
    }), { timeout: 2_000 }).toEqual({ matchesFinalGeometry: true, mutationCount: 1 });
  });

  test("makes chrome-free HD output an exact viewport canvas and restores chrome with Escape", async ({ page }) => {
    const output = { width: 804, height: 1748 };
    await page.setViewportSize(output);
    await page.goto("/?preview=devices&device=iphone-17-pro&orientation=portrait&quality=hd-2x&chrome=0");
    const iframe = page.locator("iframe.device-preview-iframe");
    const iframeHandle = await iframe.elementHandle();
    if (!iframeHandle) throw new Error("The chrome-free device preview iframe did not mount");
    const embeddedFrame = page.frameLocator("iframe.device-preview-iframe");

    await expect(page.locator(".device-preview-toolbar")).toHaveCount(0);
    await expect(page.getByTestId("device-preview-summary")).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      const scrollingElement = document.scrollingElement;
      if (!canvas || !scrollingElement) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        documentScrollHeight: scrollingElement.scrollHeight,
        documentScrollWidth: scrollingElement.scrollWidth,
        documentClientHeight: scrollingElement.clientHeight,
        documentClientWidth: scrollingElement.clientWidth,
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y
      };
    })).toEqual({
      documentScrollHeight: output.height,
      documentScrollWidth: output.width,
      documentClientHeight: output.height,
      documentClientWidth: output.width,
      height: output.height,
      width: output.width,
      x: 0,
      y: 0
    });

    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 874, width: 402 });

    await embeddedFrame.getByRole("button", { name: "继续学习", exact: true }).click();
    await expect(embeddedFrame.locator(".library-screen")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".device-preview-toolbar")).toBeVisible();
    await expect(page.getByTestId("device-preview-summary")).toBeVisible();
    await expect(page).toHaveURL(/chrome=1/);
    await expect(embeddedFrame.locator(".library-screen")).toBeVisible();
    await expect.poll(() => iframeHandle.evaluate((element) => (
      element === element.ownerDocument.querySelector("iframe.device-preview-iframe")
    ))).toBe(true);
  });

  test("updates output geometry and recording URL without changing the logical viewport", async ({ page }) => {
    await page.goto("/?preview=devices");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", /\d+/);

    await page.getByTestId("device-preview-quality-hd-2x").click();
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", "804");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-height", "1748");
    await expect(page).toHaveURL(/quality=hd-2x/);

    await page.getByTestId("device-preview-orientation-landscape").click();
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", "1748");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-height", "804");
    await expect(page).toHaveURL(/orientation=landscape/);

    await page.getByTestId("device-preview-device-ipad-pro-11").click();
    await page.getByTestId("device-preview-orientation-portrait").click();
    await page.getByTestId("device-preview-quality-retina-3x").click();
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", "2502");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-height", "3582");
    await expect.poll(() => page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      const frame = document.querySelector<HTMLElement>("[data-testid='device-preview-frame']");
      if (!canvas || !frame) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        canvasHeight: Math.round(canvasRect.height),
        canvasWidth: Math.round(canvasRect.width),
        frameHeight: Math.round(frameRect.height),
        frameWidth: Math.round(frameRect.width),
        offsetX: Math.round(frameRect.left - canvasRect.left),
        offsetY: Math.round(frameRect.top - canvasRect.top)
      };
    })).toEqual({
      canvasHeight: 3582,
      canvasWidth: 2502,
      frameHeight: 3582,
      frameWidth: 2502,
      offsetX: 0,
      offsetY: 0
    });
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 1194, width: 834 });

    await page.getByTestId("device-preview-quality-4k").click();
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", "2160");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-height", "3840");
    await expect.poll(() => page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      const frame = document.querySelector<HTMLElement>("[data-testid='device-preview-frame']");
      if (!canvas || !frame) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        bottomGap: Math.round(canvasRect.bottom - frameRect.bottom),
        canvasHeight: Math.round(canvasRect.height),
        canvasWidth: Math.round(canvasRect.width),
        frameHeight: Math.round(frameRect.height),
        frameWidth: Math.round(frameRect.width),
        leftGap: Math.round(frameRect.left - canvasRect.left),
        topGap: Math.round(frameRect.top - canvasRect.top)
      };
    })).toEqual({
      bottomGap: 374,
      canvasHeight: 3840,
      canvasWidth: 2160,
      frameHeight: 3092,
      frameWidth: 2160,
      leftGap: 0,
      topGap: 374
    });
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 1194, width: 834 });

    await page.getByTestId("device-preview-orientation-landscape").click();
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", "3840");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-height", "2160");
    await expect.poll(() => page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-testid='device-preview-canvas']");
      const frame = document.querySelector<HTMLElement>("[data-testid='device-preview-frame']");
      if (!canvas || !frame) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        canvasHeight: Math.round(canvasRect.height),
        canvasWidth: Math.round(canvasRect.width),
        frameHeight: Math.round(frameRect.height),
        frameWidth: Math.round(frameRect.width),
        leftGap: Math.round(frameRect.left - canvasRect.left),
        rightGap: Math.round(canvasRect.right - frameRect.right),
        topGap: Math.round(frameRect.top - canvasRect.top)
      };
    })).toEqual({
      canvasHeight: 2160,
      canvasWidth: 3840,
      frameHeight: 2160,
      frameWidth: 3092,
      leftGap: 374,
      rightGap: 374,
      topGap: 0
    });
    await expect.poll(async () => {
      const frame = page.frames().find((candidate) => candidate.url().includes("embedded=device-preview"));
      return frame ? await frame.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })) : null;
    }).toEqual({ height: 834, width: 1194 });
  });

  test("supports parameterized chrome hiding and Escape recovery", async ({ page }) => {
    await page.goto("/?preview=devices&device=ipad-pro-11&orientation=landscape&quality=retina-3x&chrome=0");
    await expect(page.locator(".device-preview-toolbar")).toHaveCount(0);
    await expect(page.getByTestId("device-preview-summary")).toHaveCount(0);
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-width", "3582");
    await expect(page.getByTestId("device-preview-canvas")).toHaveAttribute("data-canvas-height", "2502");

    await page.keyboard.press("Escape");
    await expect(page.locator(".device-preview-toolbar")).toBeVisible();
    await expect(page).toHaveURL(/chrome=1/);
    await expect(page.getByTestId("device-preview-device-ipad-pro-11")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("device-preview-orientation-landscape")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("device-preview-quality-retina-3x")).toHaveAttribute("aria-pressed", "true");
  });

  test("exposes labeled groups, pressed state, focus rings, and minimum hit targets", async ({ page }) => {
    await page.goto("/?preview=devices");
    await expect(page.getByRole("group", { name: "设备" })).toBeVisible();
    await expect(page.getByRole("group", { name: "方向" })).toBeVisible();
    await expect(page.getByRole("group", { name: "输出清晰度" })).toBeVisible();
    await expect(page.getByTestId("device-preview-device-iphone-17-pro")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("iframe.device-preview-iframe")).toHaveAttribute("title", /设备预览/);

    const iphoneToggle = page.getByTestId("device-preview-device-iphone-17-pro");
    const ipadToggle = page.getByTestId("device-preview-device-ipad-pro-11");
    await page.keyboard.press("Tab");
    await expect(iphoneToggle).toBeFocused();
    const focusOutline = await iphoneToggle.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { style: styles.outlineStyle, width: Number.parseFloat(styles.outlineWidth) };
    });
    expect(focusOutline.style).not.toBe("none");
    expect(focusOutline.width).toBeGreaterThan(0);

    await page.keyboard.press("Tab");
    await expect(ipadToggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(ipadToggle).toHaveAttribute("aria-pressed", "true");

    const undersizedControls = await page.locator(".device-preview-toggle").evaluateAll((elements) => elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).length);
    expect(undersizedControls).toBe(0);
  });
});
