import type { Page } from "playwright/test";
import { expect, test } from "./fixtures";
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
    message: "状态动效测试正在准备课程",
    error: null
  }
};

async function installPreparedCourse(page: Page, bookCourseApi: BookCourseApiFixture) {
  bookCourseApi.usePreparedCourse();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
}

async function installStageSixCourse(page: Page, bookCourseApi: BookCourseApiFixture) {
  bookCourseApi.useStageSixFlow();
  await page.addInitScript((session) => {
    window.localStorage.setItem("bookcourse-active-parse-session", JSON.stringify(session));
  }, preparedCourseSession);
  await page.goto("/?embedded=device-preview");
}

test.describe("state feedback primitives", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test.afterEach(({ bookCourseApi }, testInfo) => {
    expect(bookCourseApi.unhandledRequests, `${testInfo.title}: every API request has a local fixture`).toEqual([]);
    expect(bookCourseApi.externalRequests, `${testInfo.title}: no external network request is permitted`).toEqual([]);
    expect(bookCourseApi.consoleErrors, `${testInfo.title}: no console errors are emitted`).toEqual([]);
    expect(bookCourseApi.pageErrors, `${testInfo.title}: no page errors are emitted`).toEqual([]);
  });

  test("settles text, accordion, skeleton, tabs, icon, and error states from real browser events", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.goto("/e2e/state-motion-harness.html");
    const state = page.locator("#state-motion-harness");
    await expect(state).toBeVisible();

    const harness = async (method: string, ...args: unknown[]) => {
      await page.evaluate(({ method: methodName, args: methodArgs }) => {
        const api = window.__stateMotionHarness;
        if (!api) throw new Error("State motion harness is not ready.");
        (api[methodName as keyof typeof api] as (...values: unknown[]) => void)(...methodArgs);
      }, { method, args });
    };

    await expect(state.locator(".motion-state-swap")).toHaveAttribute("data-motion-text-state", "idle");
    await harness("setText", "处理中");
    await expect(state.locator(".motion-state-swap")).toHaveAttribute("data-motion-text-state", "swapping");
    await expect.poll(() => page.evaluate(() => window.__stateMotionEvents?.animationEnd ?? 0)).toBeGreaterThan(0);
    await expect(state.locator(".motion-state-swap")).toHaveAttribute("data-motion-text-state", "idle");

    await harness("setExpanded", true);
    await expect(state.locator("#accordion-region")).toHaveAttribute("data-motion-collapsible", "expanded");
    await expect(state.locator("#accordion-region")).not.toHaveAttribute("inert", "true");
    await state.locator("#accordion-focus-target").focus();
    await harness("setExpanded", false);
    await expect(state.locator("#accordion-region")).toHaveAttribute("aria-hidden", "true");
    await expect(state.locator("#accordion-toggle")).toBeFocused();

    await harness("setLoadState", "ready", "content");
    await expect(state.locator(".motion-skeleton-reveal")).toHaveAttribute("data-motion-load-state", "revealing");
    await expect.poll(() => page.evaluate(() => window.__stateMotionEvents?.transitionEnd ?? 0)).toBeGreaterThan(0);
    await expect(state.locator(".motion-skeleton-reveal")).toHaveAttribute("data-motion-load-state", "ready");
    await expect(state.locator(".motion-skeleton-reveal")).toHaveAttribute("data-motion-ready-kind", "content");

    await harness("setFilter", "chapter");
    await expect(state.locator(".motion-sliding-filter-button[aria-pressed='true']")).toHaveText("章节");
    await expect(state.locator(".motion-sliding-filter")).toHaveAttribute("data-motion-selection-state", "idle");

    await harness("triggerError");
    const errorShake = state.locator(".motion-error-shake");
    await expect(errorShake).toHaveAttribute("data-motion-error-state", "shaking");
    await expect.poll(() => page.evaluate(() => window.__stateMotionEvents?.animationEnd ?? 0)).toBeGreaterThan(1);
    await expect(errorShake).toHaveAttribute("data-motion-error-state", "idle");

    const beforeUnmount = await page.evaluate(() => ({
      created: window.__motionObserverAudit?.created ?? 0,
      disconnected: window.__motionObserverAudit?.disconnected ?? 0
    }));
    await harness("unmount");
    await expect.poll(() => page.evaluate(() => ({
      created: window.__motionObserverAudit?.created ?? 0,
      disconnected: window.__motionObserverAudit?.disconnected ?? 0
    }))).toEqual({ created: beforeUnmount.created, disconnected: beforeUnmount.created });
  });

  test("reduced motion keeps state changes direct and preserves semantics", async ({ page, bookCourseApi }) => {
    void bookCourseApi;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/e2e/state-motion-harness.html");
    const state = page.locator("#state-motion-harness");
    const harness = async (method: string, ...args: unknown[]) => {
      await page.evaluate(({ method: methodName, args: methodArgs }) => {
        const api = window.__stateMotionHarness;
        if (!api) throw new Error("State motion harness is not ready.");
        (api[methodName as keyof typeof api] as (...values: unknown[]) => void)(...methodArgs);
      }, { method, args });
    };
    await harness("setText", "完成");
    await expect(state.locator(".motion-state-swap")).toHaveAttribute("data-motion-text-state", "idle");
    await harness("setLoadState", "ready", "empty");
    await expect(state.locator(".motion-skeleton-reveal")).toHaveAttribute("data-motion-ready-kind", "empty");
    await expect.poll(() => state.locator(".motion-sliding-filter-indicator").evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  });

  test("real assignment path blocks an empty answer before either backend call", async ({ page, bookCourseApi }) => {
    await installPreparedCourse(page, bookCourseApi);
    await expect(page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true })).toBeVisible();
    await page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true }).click();
    await page.getByRole("button", { name: "进入课程", exact: true }).first().click();
    await page.locator(".course-action-grid").getByRole("button", { name: /RAG 片段/ }).click();
    await expect(page.locator(".lesson-layout")).toBeVisible();
    await page.getByRole("button", { name: "做练习", exact: true }).click();
    await expect(page.locator(".assignment-screen")).toBeVisible();
    const beforeRequests = bookCourseApi.requests.length;
    await page.getByRole("button", { name: "提交作业", exact: true }).click();
    await expect(page.locator("#assignment-answer-error")).toHaveText("请先填写答案，再提交作业诊断。");
    await expect(page.locator(".assignment-card textarea")).toBeFocused();
    expect(bookCourseApi.requests.slice(beforeRequests).filter(({ path }) => path.includes("/assignments/") || path.includes("/diagnose")).length).toBe(0);
  });

  test("real mistake filters use knowledge_points and expose a filtered empty state", async ({ page, bookCourseApi }) => {
    await installStageSixCourse(page, bookCourseApi);
    await page.locator(".daily-task-copy").getByRole("button", { name: "继续学习", exact: true }).click();
    await expect(page.locator(".library-course-grid")).toBeVisible();
    await page.locator(".library-course-grid .course-space-card").first().getByRole("button", { name: "进入课程", exact: true }).click();
    await expect(page.locator(".book-course-screen")).toBeVisible();
    await page.locator(".course-action-grid .quick-action").nth(2).click();
    await expect(page.locator(".mistake-detail-card")).toBeVisible();

    await page.locator(".filter-pill").filter({ hasText: "遗传规律" }).click();
    await expect(page.locator(".filter-pill").filter({ hasText: "遗传规律" })).toHaveClass(/active/);
    await expect(page.locator(".mistake-list-item")).toHaveCount(0);
    await expect(page.locator(".mistake-workspace")).toHaveAttribute("data-mistake-list-empty", "true");
    await expect(page.locator(".mistake-state-card h3")).toHaveText("当前分类暂无错题");

    await page.getByRole("button", { name: "查看全部错题", exact: true }).click();
    await expect(page.locator(".mistake-list-item")).toHaveCount(1);
    await expect(page.locator(".mistake-detail-card")).toBeVisible();
  });
});
