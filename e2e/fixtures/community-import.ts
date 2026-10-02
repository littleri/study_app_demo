import { expect, type Page } from "playwright/test";
import type { CourseDiagnosis } from "../../src/features/courses/model";

export const communityImportDiagnosis: CourseDiagnosis = {
  urgency: "urgent",
  timePattern: "fragmented",
  goals: ["exam", "gaps"],
  contentFoci: ["keyPoints"],
  aids: ["video", "chat"],
  reviews: ["free"]
};

export async function completeCommunityImportQuestions(page: Page) {
  const questions = [
    ["你当前学习的紧迫程度？", ["很紧急，短期要学完"]],
    ["你的学习时间是哪种类型？", ["碎片化零散时间"]],
    ["这门课程主要用于什么？", ["应试备考", "查漏补缺"]],
    ["你希望内容更侧重什么？", ["重点和考点"]],
    ["你最需要哪些学习辅助？", ["AI 视频讲解", "AI 对话讲解"]],
    ["你习惯怎样巩固这门课程？", ["自由复习"]]
  ] as const;

  const flow = page.locator(".course-space-flow");
  for (const [index, [title, answers]] of questions.entries()) {
    await expect(flow.getByRole("heading", { name: title, exact: true })).toBeVisible();
    for (const answer of answers) {
      const option = flow.getByRole("button", { name: answer, exact: true });
      if (await option.getAttribute("aria-pressed") !== "true") await option.click();
    }
    await flow.getByRole("button", { name: index === 5 ? "完成，导入课程" : "下一页", exact: true }).click();
  }
}
