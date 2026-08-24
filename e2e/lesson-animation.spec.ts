import { expect, test } from "./fixtures";

test("opens the meiosis explainer from the lesson figure", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?embedded=device-preview");
  await page.getByRole("button", { name: "学习", exact: true }).click();

  const secondChapter = page.getByRole("button", { name: /第 2 章 基因和染色体的关系/ });
  if (await secondChapter.getAttribute("aria-expanded") !== "true") await secondChapter.click();

  const meiosisSection = page.getByRole("button", { name: /第 1 节 减数分裂和受精作用/ });
  if (await meiosisSection.getAttribute("aria-expanded") !== "true") await meiosisSection.click();
  await meiosisSection.locator("..").getByRole("button", { name: "进入学习", exact: true }).click();

  const animationEntry = page.getByRole("button", { name: "看懂减数分裂", exact: true });
  await expect(animationEntry).toBeVisible();
  await expect(animationEntry.locator("svg")).toBeVisible();
  await animationEntry.click();

  const animationDialog = page.getByRole("dialog", { name: "看懂减数分裂", exact: true });
  await expect(animationDialog).toBeVisible();
  await expect(animationDialog.locator(".lesson-animation-shared-surface")).toHaveCount(1);
  await expect(animationDialog).toHaveAttribute("data-motion-state", "idle");
  await expect(animationDialog.getByText("一次复制，两次分裂", { exact: true })).toBeVisible();
  await expect(animationDialog.locator("video")).toHaveAttribute(
    "poster",
    "/assets/lesson/meiosis-overview-v2.webp"
  );
  await expect(animationDialog.locator("source")).toHaveAttribute(
    "src",
    "/assets/lesson/meiosis-explainer-demo-v1.mp4"
  );
  const playbackLayerStyles = await animationDialog.evaluate((dialog) => {
    const scrim = dialog.querySelector<HTMLElement>(".lesson-animation-scrim")!;
    const player = dialog.querySelector<HTMLElement>(".lesson-animation-player")!;
    const video = dialog.querySelector<HTMLVideoElement>("video")!;
    return {
      layerIsolation: getComputedStyle(dialog).isolation,
      playerContain: getComputedStyle(player).contain,
      playerIsolation: getComputedStyle(player).isolation,
      scrimBackdropFilter: getComputedStyle(scrim).backdropFilter,
      videoBackfaceVisibility: getComputedStyle(video).backfaceVisibility
    };
  });
  expect(playbackLayerStyles).toEqual({
    layerIsolation: "isolate",
    playerContain: "paint",
    playerIsolation: "isolate",
    scrimBackdropFilter: "none",
    videoBackfaceVisibility: "hidden"
  });

  const closeAnimation = animationDialog.getByRole("button", { name: "关闭教学动画", exact: true });
  await expect(closeAnimation).toBeFocused();
  await closeAnimation.click();
  await expect(animationDialog).toHaveAttribute("data-motion-state", "closing");
  await expect(animationDialog).toHaveCount(0);
  await expect(animationEntry).toBeFocused();
});
