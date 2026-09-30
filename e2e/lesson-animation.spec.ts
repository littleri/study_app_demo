import { expect, test } from "./fixtures";

test("opens the meiosis explainer from the lesson figure", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?embedded=device-preview");
  await expect(page.getByRole("listbox", { name: "选择教材" })).toBeVisible();
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

  const confirmDialog = page.getByRole("dialog", { name: "是否生成讲解视频？" });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toContainText("本次生成消耗 10 积分");
  await expect(confirmDialog).toContainText("当前剩余 100 积分");
  await expect(confirmDialog).not.toContainText("当前 Demo 使用已准备好的教学动画");
  const iconAlignment = await confirmDialog.evaluate((dialog) => {
    const dialogBounds = dialog.getBoundingClientRect();
    const iconBounds = dialog.querySelector(".lesson-video-confirm-icon")!.getBoundingClientRect();
    return Math.abs((iconBounds.left + iconBounds.right) / 2 - (dialogBounds.left + dialogBounds.right) / 2);
  });
  expect(iconAlignment).toBeLessThanOrEqual(3);
  await expect(confirmDialog.locator("video")).toHaveCount(0);
  await expect(page.locator("#lesson-animation-dialog")).toHaveCount(0);
  await confirmDialog.getByRole("button", { name: "否，暂不生成" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(animationEntry).toBeFocused();

  await animationEntry.click();
  await confirmDialog.getByRole("button", { name: "是，生成视频" }).click();
  await expect(confirmDialog).toHaveCount(0);

  const loadingDialog = page.getByRole("dialog", { name: "正在生成讲解视频" });
  await expect(loadingDialog).toBeVisible();
  await expect(loadingDialog.locator(".lesson-video-loading-ring")).toHaveCSS("animation-name", "lesson-video-loading-spin");
  await expect(loadingDialog.locator(".lesson-animation-positioner")).toHaveCSS("visibility", "hidden");
  expect(await loadingDialog.locator("video").evaluate((video: HTMLVideoElement) => ({
    paused: video.paused,
    currentTime: video.currentTime,
    autoPlay: video.autoplay
  }))).toEqual({ paused: true, currentTime: 0, autoPlay: false });
  await expect(loadingDialog.getByRole("button", { name: "取消生成" })).toBeFocused();
  await loadingDialog.getByRole("button", { name: "取消生成" }).click();
  await expect(loadingDialog).toHaveCount(0);
  await expect(page.locator("#lesson-animation-dialog")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bookcourse.credits.v1")!).balance)).toBe(100);

  await animationEntry.click();
  await confirmDialog.getByRole("button", { name: "是，生成视频" }).click();
  await expect(loadingDialog).toBeVisible();
  const reveal = await page.evaluate(() => new Promise<{ player: string; loading: string; paused: boolean }>((resolve) => {
    const dialog = document.querySelector<HTMLElement>("#lesson-animation-dialog")!;
    const observer = new MutationObserver(() => {
      if (dialog.dataset.videoPhase !== "revealing") return;
      observer.disconnect();
      resolve({
        player: getComputedStyle(dialog.querySelector<HTMLElement>(".lesson-animation-positioner")!).animationName,
        loading: getComputedStyle(dialog.querySelector<HTMLElement>(".lesson-video-loading-screen")!).animationName,
        paused: dialog.querySelector<HTMLVideoElement>("video")!.paused
      });
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["data-video-phase"] });
  }));
  expect(reveal).toEqual({ player: "lesson-video-player-reveal", loading: "lesson-video-loading-recede", paused: true });
  await expect(loadingDialog).toHaveCount(0);

  const animationDialog = page.getByRole("dialog", { name: "看懂减数分裂", exact: true });
  await expect(animationDialog).toBeVisible();
  await expect(animationDialog).toHaveAttribute("data-video-phase", "playing");
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
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bookcourse.credits.v1") ?? "null");
    return state && !state.transactions.some((item: { status: string }) => item.status === "reserved")
      && (state.balance === 90 || state.balance === 100);
  })).toBe(true);
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

  const pager = page.locator(".lesson-knowledge-pager");
  await pager.focus();
  await page.keyboard.press("ArrowRight");
  const figures = page.locator(".lesson-knowledge-section .lesson-inline-figure");
  await expect(figures).toHaveCount(2);
  await expect(figures.locator(".lesson-figure-animation-button")).toHaveCount(2);
  await figures.getByRole("button", { name: /看懂这张图/ }).click();
  const unavailableDialog = page.getByRole("dialog", { name: "这张图暂时无法生成视频" });
  await expect(unavailableDialog).toContainText("尚未接入通用视频生成服务");
  await expect(unavailableDialog.getByRole("button", { name: "是，生成视频" })).toHaveCount(0);
  await expect(page.locator("#lesson-animation-dialog")).toHaveCount(0);
  await unavailableDialog.getByRole("button", { name: "知道了" }).click();
  await expect(unavailableDialog).toHaveCount(0);
});
