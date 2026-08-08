export type StudyToolId = "source" | "assignment" | "flashcards";

export type StudyToolDefinition = Readonly<{
  id: StudyToolId;
  title: string;
  description: string;
}>;

/**
 * The study panel is intentionally data-driven: adding a tool here is enough
 * to reserve its position in the section flow without changing the accordion.
 */
export const studyToolDefinitions: readonly StudyToolDefinition[] = [
  {
    id: "source",
    title: "进入学习",
    description: "阅读教材原页，从上下文开始本节学习"
  },
  {
    id: "assignment",
    title: "作业诊断",
    description: "提交解题过程，定位理解卡点"
  },
  {
    id: "flashcards",
    title: "闪卡复习",
    description: "用短时回忆巩固本节概念"
  }
] as const;
