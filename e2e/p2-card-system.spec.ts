import { expect, test, type Page } from "./fixtures";
import type { BookCourseApiFixture } from "./fixtures/bookcourse-api";

const preparedCourseSession = {
  uploadedFile: {
    bookId: "book_stage3",
    name: "stage3-biology.pdf",
    sizeBytes: 1024,
    contentType: "application/pdf",
    uploadedAt: 1
  },
  parseJobId: "job_stage3",
  parseJobStatus: {
    job_id: "job_stage3",
    book_id: "book_stage3",
    status: "pending",
    stage: "queued",
    progress: 1,
    message: "P2 fixture prepares a usable lesson",
    error: null
  }
};

type Rgb = readonly [number, number, number];

function contrastRatio(first: Rgb, second: Rgb) {
  const luminance = (color: Rgb) => {
    const [red, green, blue] = color.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }) as Rgb;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

async function openLibrary(page: Page, bookCourseApi: BookCourseApiFixture) {
  bookCourseApi.useStageFiveFlow();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
  await expect(page.locator(".home-primary-action")).toBeVisible();
  await page.locator(".home-primary-action").click();
  await expect(page.locator(".library-course-grid")).toBeVisible();
}

async function openCourse(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openLibrary(page, bookCourseApi);
  await page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true }).click();
  await expect(page.locator(".book-course-screen")).toBeVisible();
}

async function openLesson(page: Page, bookCourseApi: BookCourseApiFixture) {
  await openCourse(page, bookCourseApi);
  await page.locator(".course-action-grid").getByRole("button", { name: /RAG 片段/ }).click();
  await expect(page.locator(".lesson-screen")).toBeVisible();
}

async function readTouchViolations(page: Page) {
  return page.evaluate(() => {
    const selector = [
      "button:not([disabled])",
      "[role='button']:not([aria-disabled='true'])",
      "a.button",
      "input:not([type='checkbox']):not([type='radio']):not([type='hidden']):not([type='file']):not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])"
    ].join(",");
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && bounds.width > 0 && bounds.height > 0;
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
          className: element.className,
          height: Math.round(bounds.height * 10) / 10,
          width: Math.round(bounds.width * 10) / 10
        };
      })
      .filter((target) => target.width < 44 || target.height < 44);
  });
}

test.describe("P2 card-system acceptance", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

  test("keeps real home and lesson interactions at least 44px, with 48px primary CTAs", async ({ page, bookCourseApi }) => {
    await page.goto("/?embedded=device-preview");
    await expect(page.locator(".home-primary-action")).toBeVisible();
    const tokenValues = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        primary: root.getPropertyValue("--color-primary").trim(),
        surface: root.getPropertyValue("--color-surface").trim(),
        surfaceSoft: root.getPropertyValue("--color-surface-soft").trim(),
        text: root.getPropertyValue("--color-text").trim(),
        secondary: root.getPropertyValue("--color-text-secondary").trim(),
        muted: root.getPropertyValue("--color-text-muted").trim(),
        touch: root.getPropertyValue("--touch-target-min").trim(),
        primaryTouch: root.getPropertyValue("--touch-target-primary").trim()
      };
    });
    const white: Rgb = [255, 255, 255];
    const tokenColor = (value: string): Rgb => {
      const hex = value.replace("#", "");
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16)
      ];
    };
    expect(tokenValues.touch).toBe("44px");
    expect(tokenValues.primaryTouch).toBe("48px");
    expect(contrastRatio(tokenColor(tokenValues.primary), white), "primary token carries white text at AA").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenColor(tokenValues.text), tokenColor(tokenValues.surface)), "body text token is AA on surface").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenColor(tokenValues.secondary), tokenColor(tokenValues.surface)), "secondary text token is AA on surface").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenColor(tokenValues.muted), tokenColor(tokenValues.surfaceSoft)), "muted text token is AA on subdued surface").toBeGreaterThanOrEqual(4.5);

    const homeViolations = await readTouchViolations(page);
    expect(homeViolations, "home non-inline targets are all at least 44 x 44 CSS px").toEqual([]);

    const homePrimary = await page.locator(".home-primary-action").evaluate((element) => element.getBoundingClientRect().height);
    expect(homePrimary, "home primary CTA is at least 48px high").toBeGreaterThanOrEqual(48);

    await openLesson(page, bookCourseApi);
    const lessonViolations = await readTouchViolations(page);
    expect(lessonViolations, "lesson non-inline targets are all at least 44 x 44 CSS px").toEqual([]);

    const lessonPrimary = await page.locator(".lesson-bottom-actions .button-primary").evaluate((element) => element.getBoundingClientRect().height);
    expect(lessonPrimary, "lesson completion CTA is at least 48px high").toBeGreaterThanOrEqual(48);
    await expect(page.getByRole("button", { name: "做练习", exact: true }), "exercise is a secondary learning tool").toHaveClass(/button-secondary/);
    await expect(page.getByRole("button", { name: "完成章节", exact: true }), "chapter completion remains the outcome CTA").toHaveClass(/button-primary/);
    await expect(page.locator(".lesson-screen .button-primary"), "the lesson exposes exactly one solid primary action").toHaveCount(1);
  });

  test("gives Library one primary course entry and groups course tools into one 2x2 surface", async ({ page, bookCourseApi }) => {
    await openLibrary(page, bookCourseApi);
    const courseEntry = page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true });
    const libraryUpload = page.getByRole("button", { name: "上传新教材", exact: true }).last();
    const libraryActions = await Promise.all([courseEntry, libraryUpload].map((locator) => locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        color: style.color
      };
    })));
    expect(
      ["rgb(124, 58, 237)", "rgb(91, 33, 182)"],
      "course entry remains the Library card's primary action in rest or hover state"
    ).toContain(libraryActions[0].background);
    expect(libraryActions[1], "upload is visually secondary when a course entry is available").toEqual({
      background: "rgb(255, 255, 255)",
      borderTopWidth: "1px",
      color: "rgb(32, 38, 58)"
    });

    await courseEntry.click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    const group = page.locator(".course-action-grid");
    await expect(group).toHaveAttribute("role", "group");
    await expect(group).toHaveAttribute("aria-label", "课程工具");
    const groupedSurface = await group.evaluate((element) => {
      const groupStyle = getComputedStyle(element);
      const cells = Array.from(element.querySelectorAll<HTMLElement>(".quick-action")).map((cell) => {
        const style = getComputedStyle(cell);
        return {
          backdropFilter: style.backdropFilter,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth,
          borderRadius: Number.parseFloat(style.borderTopLeftRadius),
          borderRightWidth: style.borderRightWidth,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow
        };
      });
      return {
        backdropFilter: groupStyle.backdropFilter,
        borderRadius: Number.parseFloat(groupStyle.borderTopLeftRadius),
        boxShadow: groupStyle.boxShadow,
        columnGap: groupStyle.columnGap,
        rowGap: groupStyle.rowGap,
        cells
      };
    });
    expect(groupedSurface, "course utilities form one ordinary 12–16px reading surface").toMatchObject({
      backdropFilter: "none",
      boxShadow: "none",
      columnGap: "0px",
      rowGap: "0px"
    });
    expect(groupedSurface.borderRadius).toBeGreaterThanOrEqual(12);
    expect(groupedSurface.borderRadius).toBeLessThanOrEqual(16);
    expect(groupedSurface.cells).toHaveLength(4);
    expect(groupedSurface.cells.every((cell) => cell.borderRadius === 0 && cell.boxShadow === "none" && cell.backdropFilter === "none"), "tool cells are rows inside the group, not independent cards").toBe(true);
    expect(groupedSurface.cells.map((cell) => [cell.borderTopWidth, cell.borderRightWidth, cell.borderBottomWidth, cell.borderLeftWidth]), "only the three internal dividers are drawn").toEqual([
      ["0px", "1px", "1px", "0px"],
      ["0px", "0px", "1px", "0px"],
      ["0px", "1px", "0px", "0px"],
      ["0px", "0px", "0px", "0px"]
    ]);
  });

  test("keeps the white fully rounded Liquid Glass primary navigation", async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    const navigation = page.locator(".primary-nav");
    await expect(navigation).toBeVisible();
    await expect(navigation).toHaveAttribute("data-lg-variant", "prominent");

    const navigationStyles = await navigation.evaluate((element) => {
      const style = getComputedStyle(element);
      const items = Array.from(element.querySelectorAll<HTMLElement>(".nav-item")).map((item) => {
        const bounds = item.getBoundingClientRect();
        const itemStyle = getComputedStyle(item);
        return {
          active: item.getAttribute("aria-current") === "page",
          background: itemStyle.backgroundColor,
          height: bounds.height,
          radius: itemStyle.borderTopLeftRadius,
          width: bounds.width
        };
      });
      return {
        background: style.backgroundColor,
        backdropFilter: style.backdropFilter,
        borderRadius: style.borderTopLeftRadius,
        items
      };
    });

    expect(navigationStyles.backdropFilter, "the restored navigation keeps its intentional glass treatment").toContain("blur(24px)");
    expect(navigationStyles.background, "the navigation surface is white rather than pale blue").toBe("rgb(255, 255, 255)");
    expect(navigationStyles.borderRadius, "the navigation uses the requested fully rounded silhouette").toBe("999px");
    expect(navigationStyles.items).toHaveLength(4);
    expect(navigationStyles.items.every((item) => item.width >= 44 && item.height >= 44), "tab targets remain at least 44 x 44 CSS px").toBe(true);
    expect(navigationStyles.items.filter((item) => !item.active).every((item) => item.radius === "999px"), "the press capsule uses the same fully rounded radius").toBe(true);
    expect(navigationStyles.items.find((item) => item.active)?.background, "the original active tab does not become an extra card").toBe("rgba(0, 0, 0, 0)");
  });

  test("uses flat 12–16px reading cards and maintains AA contrast on rendered lesson text", async ({ page, bookCourseApi }) => {
    await openLesson(page, bookCourseApi);

    const surfaceViolations = await page.locator(".screen-content .card, .screen-content .quick-action, .screen-content .metric-card").evaluateAll((elements) => {
      return elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          className: element.className,
          backdropFilter: style.backdropFilter,
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius)
        };
      }).filter((surface) => surface.backdropFilter !== "none" || surface.boxShadow !== "none" || surface.radius < 12 || surface.radius > 16);
    });
    expect(surfaceViolations, "ordinary lesson cards are flat 12–16px reading surfaces").toEqual([]);

    const renderedPairs = await page.locator(
      ".lesson-title-card p, .lesson-evidence-list span, .concept-card-grid small, .lesson-bottom-actions .button-primary"
    ).evaluateAll((elements) => elements.map((element) => {
      const parseRgb = (value: string) => {
        const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
        return channels && channels.length === 3 ? [channels[0], channels[1], channels[2]] as Rgb : null;
      };
      const foreground = parseRgb(getComputedStyle(element).color);
      let parent: HTMLElement | null = element as HTMLElement;
      let background: Rgb | null = null;
      while (parent && !background) {
        const color = getComputedStyle(parent).backgroundColor;
        const rgba = color.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        const alpha = rgba[3] ?? 1;
        if (rgba.length >= 3 && alpha >= 0.99) background = [rgba[0], rgba[1], rgba[2]];
        parent = parent.parentElement;
      }
      return {
        label: element.textContent?.trim() || element.className,
        foreground,
        background
      };
    }));

    const contrastViolations = renderedPairs.map((pair) => {
      if (!pair.foreground || !pair.background) return { ...pair, ratio: 0 };
      return { ...pair, ratio: contrastRatio(pair.foreground, pair.background) };
    }).filter((pair) => pair.ratio < 4.5);
    expect(contrastViolations, "rendered ordinary text, labels and primary button text meet WCAG AA").toEqual([]);

    await page.locator(".lesson-action-grid .button").first().click();
    const chatSheet = page.locator(".sheet[data-sheet-type='chat']");
    await expect(chatSheet).toBeVisible();
    const chatInput = chatSheet.locator("input");
    const chatField = await chatInput.evaluate((element) => {
      const placeholder = getComputedStyle(element, "::placeholder").color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
      const background = getComputedStyle(element).backgroundColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
      const bounds = element.getBoundingClientRect();
      return { background, height: bounds.height, placeholder };
    });
    expect(chatField.height, "chat input keeps the 44px form-control target").toBeGreaterThanOrEqual(44);
    expect(chatField.placeholder).toHaveLength(3);
    expect(chatField.background).toHaveLength(3);
    expect(
      contrastRatio(chatField.placeholder as Rgb, chatField.background as Rgb),
      "placeholder text on the chat input meets WCAG AA"
    ).toBeGreaterThanOrEqual(4.5);
    expect(await readTouchViolations(page), "sheet actions keep the same 44px target contract").toEqual([]);
  });

  test("keeps the P2 cascade active inside the device-preview iframe after studio CSS loads", async ({ page }) => {
    await page.goto("/?device=iphone-17-pro&orientation=portrait&quality=fit&chrome=1");
    const studioStyles = await page.locator(".device-preview-studio").evaluate((element) => {
      const toolbar = document.querySelector<HTMLElement>(".device-preview-toolbar");
      return {
        canvasShadow: getComputedStyle(document.querySelector<HTMLElement>(".device-preview-canvas")!).boxShadow,
        studioBackground: getComputedStyle(element).backgroundImage,
        toolbarBackdrop: toolbar ? getComputedStyle(toolbar).backdropFilter : null
      };
    });
    const preview = page.frameLocator(".device-preview-iframe");
    const primary = preview.locator(".home-primary-action");
    await expect(primary).toBeVisible();
    const finalStyles = await primary.evaluate((element) => {
      const button = getComputedStyle(element);
      const surface = getComputedStyle(document.querySelector<HTMLElement>(".home-focus-panel")!);
      return {
        background: button.backgroundColor,
        height: element.getBoundingClientRect().height,
        radius: Number.parseFloat(button.borderTopLeftRadius),
        surfaceShadow: surface.boxShadow,
        surfaceBackdrop: surface.backdropFilter
      };
    });
    expect(finalStyles.height, "iframe primary CTA keeps the 48px target after device-preview.css").toBeGreaterThanOrEqual(48);
    expect(finalStyles.radius, "iframe primary CTA uses the compact P2 corner radius").toBeGreaterThanOrEqual(12);
    expect(finalStyles.radius).toBeLessThanOrEqual(16);
    expect(finalStyles.background, "iframe primary CTA resolves to the shared navigation purple").toBe("rgb(124, 58, 237)");
    expect(finalStyles.surfaceShadow, "iframe task surface is not a floating ghost card").toBe("none");
    expect(finalStyles.surfaceBackdrop, "iframe task surface has no glass blur").toBe("none");
    expect(studioStyles.studioBackground, "studio background no longer uses a global decorative gradient").toBe("none");
    expect(studioStyles.toolbarBackdrop, "studio toolbar no longer uses glass blur").toBe("none");
    expect(studioStyles.canvasShadow, "preview canvas uses only the compact floating shadow").toMatch(/0px 4px 8px/);
  });
});
