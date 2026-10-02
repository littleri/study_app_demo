import { expect, test, type Page } from "playwright/test";

async function expectCourseLayout(page: Page) {
  const rail = page.getByRole("listbox", { name: "选择课程" });
  await expect.poll(() => rail.evaluate((element) => {
    const railBounds = element.getBoundingClientRect();
    const selected = element.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    return Math.abs(selected.left + selected.width / 2 - (railBounds.left + railBounds.width * .42));
  })).toBeLessThanOrEqual(2);
  const layout = await page.locator(".home-course-showcase").evaluate((element) => {
    const rail = element.querySelector(".home-book-carousel")!.getBoundingClientRect();
    const controls = element.querySelector(".home-course-controls")!.getBoundingClientRect();
    const selected = element.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    const options = [...element.querySelectorAll('[role="option"]')];
    const adjacent = options.findIndex((option, index) => option.getAttribute("aria-selected") === "false"
      && options[index + 1]?.getAttribute("aria-selected") === "false");
    const unselected = options[adjacent].getBoundingClientRect();
    const next = options[adjacent + 1].getBoundingClientRect();
    const title = element.querySelector<HTMLElement>(".home-book-selection-summary strong")!;
    return {
      rail: rail.toJSON(), controls: controls.toJSON(), selected: selected.toJSON(),
      pickerLeft: element.closest(".home-book-picker")!.getBoundingClientRect().left,
      overlap: unselected.right - next.left, unselectedWidth: unselected.width,
      titleFits: title.scrollHeight <= title.clientHeight + 1,
      actions: [...element.querySelectorAll("aside button")].map((button) => button.getBoundingClientRect().toJSON()),
      documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth
    };
  });
  expect(layout.selected.left).toBeGreaterThanOrEqual(layout.rail.left - 1);
  expect(layout.selected.right).toBeLessThanOrEqual(layout.rail.right + 1);
  expect(layout.selected.width).toBeGreaterThan(125);
  expect(layout.rail.left, "the cover rail reaches beyond the inset that previously clipped its left neighbor").toBeLessThan(layout.pickerLeft - 8);
  expect(layout.overlap).toBeGreaterThan(layout.unselectedWidth * .15);
  expect(layout.overlap).toBeLessThan(layout.unselectedWidth * .4);
  expect(layout.controls.left).toBeGreaterThanOrEqual(layout.rail.right + 7);
  expect(layout.titleFits, "the full current course name fits in the right column").toBe(true);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  for (const action of layout.actions) {
    expect(action.left).toBeGreaterThanOrEqual(layout.controls.left - 1);
    expect(action.right).toBeLessThanOrEqual(layout.controls.right + 1);
    expect(action.height).toBeGreaterThanOrEqual(44);
    expect(action.width).toBeGreaterThanOrEqual(44);
  }
}

test.describe("home course cover layout", () => {
  test.use({ locale: "zh-CN", reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/?embedded=device-preview");
    await expect(page.getByRole("listbox", { name: "选择课程" }).getByRole("option")).toHaveCount(6);
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
  });

  test("keeps larger overlapping covers on the left and preserves selection when rotating", async ({ page }) => {
    const options = page.getByRole("listbox", { name: "选择课程" }).getByRole("option");
    await expect(page.locator(".home-topline button")).toHaveCount(0);
    await expectCourseLayout(page);
    await options.first().press("Home");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".home-book-selection-summary")).toContainText("数学 必修 第二册");
    await options.first().press("ArrowRight");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".home-book-selection-summary")).toContainText(/生物.*遗传与进化/);
    await expectCourseLayout(page);
    await options.nth(1).press("End");
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".home-book-workspace")).toHaveAttribute("data-loaded", "true");
    await expectCourseLayout(page);
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await expectCourseLayout(page);
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await page.setViewportSize(viewport);
    await expectCourseLayout(page);
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await options.last().press("Home");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expectCourseLayout(page);
  });

  test("opens all courses and course creation from the right-hand controls", async ({ page }) => {
    const controls = page.getByRole("complementary", { name: "课程操作" });
    await controls.getByRole("button", { name: "全部课程", exact: true }).click();
    await expect(page.locator(".course-library-card")).toHaveCount(6);
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(controls).toBeVisible();
    await controls.getByRole("button", { name: "创建课程", exact: true }).click();
    await expect(page.getByRole("heading", { name: "创建课程", exact: true })).toBeVisible();
    await expect(page.getByLabel("课程名称", { exact: true })).toBeVisible();
  });
});
