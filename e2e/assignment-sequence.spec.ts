import { expect, test, type Page } from "playwright/test";

async function openAssignmentFromCurrentCourse(page: Page) {
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "作业诊断 提交解题过程，定位理解卡点", exact: true }).click();
  await expect(page.locator(".assignment-screen")).toBeVisible();
  await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
}

test.describe("assignment exercise sequence", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "reduce", timezoneId: "Asia/Hong_Kong" });

  test("runs judgment, choice, and short answer in order without a type selector", async ({ page }) => {
    await openAssignmentFromCurrentCourse(page);

    const exerciseCard = page.locator(".assignment-exercise-card");
    const action = page.locator(".assignment-primary-action .button");
    const source = page.locator(".assignment-source-button");
    await expect(page.locator('[role="tablist"]')).toHaveCount(0);
    await expect(page.locator(".assignment-workspace > .card")).toHaveCount(2);
    await expect(exerciseCard.locator(".assignment-primary-action")).toHaveCount(1);
    await expect(exerciseCard.locator(".assignment-source-button")).toHaveCount(1);
    await expect(source.locator("svg")).toHaveCount(0);
    await expect(exerciseCard).toHaveAttribute("data-assignment-type", "judgment");
    await expect(page.locator(".assignment-progress-heading > strong")).toHaveText("1 / 3");
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");

    const judgmentComposition = await page.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      const progressCard = document.querySelector(".assignment-progress-card");
      const progressTitle = document.querySelector(".assignment-progress-heading h2");
      const card = document.querySelector('.assignment-exercise-card[data-assignment-type="judgment"]');
      const question = card?.querySelector(".assignment-question");
      const instruction = card?.querySelector(".assignment-exercise-instruction");
      if (!shell || !progressCard || !progressTitle || !card || !question || !instruction) throw new Error("Judgment composition is missing.");
      const shellBounds = shell.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const questionBounds = question.getBoundingClientRect();
      const instructionBounds = instruction.getBoundingClientRect();
      return {
        bottomReachesEdge: cardBounds.bottom >= shellBounds.bottom - 1,
        instructionGap: instructionBounds.top - questionBounds.bottom,
        leftReachesEdge: cardBounds.left <= shellBounds.left + 1,
        progressRadius: Number.parseFloat(getComputedStyle(progressCard).borderTopLeftRadius),
        progressTitleFits: progressTitle.scrollWidth <= progressTitle.clientWidth && progressTitle.scrollHeight <= progressTitle.clientHeight,
        rightReachesEdge: cardBounds.right >= shellBounds.right - 1,
        topLeftRadius: Number.parseFloat(getComputedStyle(card).borderTopLeftRadius)
      };
    });
    const viewport = page.viewportSize();
    const expectsPhonePortraitFullBleed = Boolean(
      viewport && viewport.width < 720 && viewport.width <= viewport.height
    );
    if (expectsPhonePortraitFullBleed) {
      expect(judgmentComposition.leftReachesEdge).toBe(true);
      expect(judgmentComposition.rightReachesEdge).toBe(true);
      expect(judgmentComposition.bottomReachesEdge).toBe(true);
      expect(judgmentComposition.topLeftRadius).toBeGreaterThanOrEqual(44);
      expect(judgmentComposition.instructionGap).toBeGreaterThanOrEqual(70);
    }
    expect(judgmentComposition.progressRadius).toBe(999);
    expect(judgmentComposition.progressTitleFits).toBe(true);

    await page.locator(".assignment-judgment-options button").first().click();
    await action.click();
    await expect(exerciseCard).toHaveAttribute("data-motion-assignment-card-state", "idle");
    await expect(exerciseCard).toHaveAttribute("data-assignment-type", "choice");
    await expect(page.locator(".assignment-progress-heading > strong")).toHaveText("2 / 3");

    await page.locator(".assignment-choice-options button").nth(1).click();
    await action.click();
    await expect(exerciseCard).toHaveAttribute("data-assignment-type", "short-answer");
    await expect(page.locator(".assignment-progress-heading > strong")).toHaveText("3 / 3");

    await page.locator(".assignment-card textarea").fill("染色体只复制一次，细胞连续分裂两次；第一次分裂时同源染色体分离，使染色体数目减半。");
    await expect(action).toBeEnabled();

    const layout = await page.evaluate(() => {
      const card = document.querySelector(".assignment-exercise-card");
      const source = document.querySelector(".assignment-source-button");
      const submit = document.querySelector(".assignment-primary-action .button");
      const appShell = document.querySelector(".app-shell");
      if (!card || !source || !submit || !appShell) throw new Error("Assignment layout controls are missing.");
      const cardBounds = card.getBoundingClientRect();
      const sourceBounds = source.getBoundingClientRect();
      const submitBounds = submit.getBoundingClientRect();
      const shellStyle = getComputedStyle(appShell);
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        shellBackgroundColor: shellStyle.backgroundColor,
        shellBackgroundImage: shellStyle.backgroundImage,
        sourceInsideCard: sourceBounds.left >= cardBounds.left && sourceBounds.right <= cardBounds.right && sourceBounds.bottom <= cardBounds.bottom,
        submitInsideCard: submitBounds.left >= cardBounds.left && submitBounds.right <= cardBounds.right && submitBounds.bottom <= cardBounds.bottom,
        sourceToSubmitGap: submitBounds.top - sourceBounds.bottom,
        submitHeight: submitBounds.height
      };
    });
    expect(layout.horizontalOverflow).toBe(0);
    expect(layout.shellBackgroundColor).toBe("rgb(217, 210, 255)");
    expect(layout.shellBackgroundImage).toBe("none");
    expect(layout.sourceInsideCard).toBe(true);
    expect(layout.submitInsideCard).toBe(true);
    expect(layout.sourceToSubmitGap).toBeGreaterThanOrEqual(8);
    expect(layout.submitHeight).toBeGreaterThanOrEqual(44);

    await expect(source).toHaveText(/查看原文/);

    await action.click();
    await expect(page.locator(".diagnosis-screen")).toBeVisible();
  });
});

test.describe("assignment entry geometry", () => {
  test.use({ colorScheme: "light", locale: "zh-CN", reducedMotion: "no-preference", timezoneId: "Asia/Hong_Kong" });

  test("keeps the full-bleed exercise card edges visible during the phone entry transition", async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 720 || viewport.width > viewport.height, "The full-bleed card is a phone portrait layout.");

    await page.goto("/?embedded=device-preview");
    await expect(page.locator(".motion-screen-transition")).toHaveAttribute("data-motion-state", "idle");
    await page.addStyleTag({
      content: ".motion-screen-surface { animation-play-state: paused !important; }"
    });
    await page.getByRole("button", { name: "作业诊断 提交解题过程，定位理解卡点", exact: true }).click();

    const transition = page.locator('.motion-screen-transition[data-screen="assignment"]');
    const currentSurface = transition.locator(':scope > [data-motion-surface="current"]');
    await expect(transition).toHaveAttribute("data-motion-state", "transitioning");
    await expect(page.locator(".assignment-exercise-card")).toBeVisible();

    const entryGeometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const transition = document.querySelector<HTMLElement>('.motion-screen-transition[data-screen="assignment"]');
      const surface = document.querySelector<HTMLElement>('.motion-screen-surface[data-motion-surface="current"]');
      const card = document.querySelector<HTMLElement>(".assignment-exercise-card");
      if (!shell || !transition || !surface || !card) throw new Error("Assignment entry geometry is missing.");
      const shellBounds = shell.getBoundingClientRect();
      const transitionBounds = transition.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      return {
        animationDuration: getComputedStyle(surface).animationDuration,
        animationName: getComputedStyle(surface).animationName,
        cardExtendsPastTransition: cardBounds.left < transitionBounds.left && cardBounds.right > transitionBounds.right,
        leftInset: cardBounds.left - shellBounds.left,
        rightInset: shellBounds.right - cardBounds.right,
        transitionOverflow: getComputedStyle(transition).overflow
      };
    });

    expect(entryGeometry.animationName).toBe("motion-screen-assignment-in");
    expect(entryGeometry.animationDuration).toBe("0.45s");
    expect(entryGeometry.cardExtendsPastTransition).toBe(true);
    expect(Math.abs(entryGeometry.leftInset)).toBeLessThanOrEqual(1);
    expect(Math.abs(entryGeometry.rightInset)).toBeLessThanOrEqual(1);
    expect(entryGeometry.transitionOverflow).toBe("visible");

    await currentSurface.evaluate((element) => {
      element.dispatchEvent(new AnimationEvent("animationend", {
        animationName: "motion-screen-assignment-in",
        bubbles: true
      }));
    });
    await expect(transition).toHaveAttribute("data-motion-state", "idle");
  });

  test("hands the next exercise across with a postcard-style card switch", async ({ page }) => {
    await openAssignmentFromCurrentCourse(page);

    const card = page.locator(".assignment-exercise-card");
    const action = page.locator(".assignment-primary-action .button");
    const pausedCardMotion = await page.addStyleTag({
      content: ".assignment-exercise-card { animation-play-state: paused !important; }"
    });

    await page.locator(".assignment-judgment-options button").first().click();
    await action.click();
    await expect(card).toHaveAttribute("data-motion-assignment-card-state", "exiting");
    await expect(card).toHaveAttribute("data-assignment-type", "judgment");
    await expect(page.locator(".assignment-progress-heading > strong")).toHaveText("1 / 3");
    let motion = await card.evaluate((element) => ({
      duration: getComputedStyle(element).animationDuration,
      name: getComputedStyle(element).animationName,
      origin: getComputedStyle(element).transformOrigin,
      playState: getComputedStyle(element).animationPlayState
    }));
    expect(motion).toMatchObject({
      duration: "0.15s",
      name: "motion-assignment-card-postcard-out",
      playState: "paused"
    });
    expect(motion.origin).not.toBe("50% 50%");

    await card.evaluate((element) => {
      element.dispatchEvent(new AnimationEvent("animationend", {
        animationName: "motion-assignment-card-postcard-out",
        bubbles: true
      }));
    });
    await expect(card).toHaveAttribute("data-motion-assignment-card-state", "entering");
    await expect(card).toHaveAttribute("data-assignment-type", "choice");
    await expect(page.locator(".assignment-progress-heading > strong")).toHaveText("2 / 3");
    motion = await card.evaluate((element) => ({
      duration: getComputedStyle(element).animationDuration,
      name: getComputedStyle(element).animationName,
      playState: getComputedStyle(element).animationPlayState
    }));
    expect(motion).toMatchObject({
      duration: "0.2s",
      name: "motion-assignment-card-postcard-in",
      playState: "paused"
    });

    await card.evaluate((element) => {
      element.dispatchEvent(new AnimationEvent("animationend", {
        animationName: "motion-assignment-card-postcard-in",
        bubbles: true
      }));
    });
    await expect(card).toHaveAttribute("data-motion-assignment-card-state", "idle");
    await expect(action).toBeDisabled();

    await pausedCardMotion.evaluate((element) => element.remove());
    await page.locator(".assignment-choice-options button").nth(1).click();
    await action.click();
    await expect(card).toHaveAttribute("data-assignment-type", "short-answer");
    await expect(card).toHaveAttribute("data-motion-assignment-card-state", "idle");
  });
});
