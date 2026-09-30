import type { UploadedCourseFile } from "../../types/app";

export const learningSetStorageKey = "bookcourse.learning-sets.v1";

export const primaryGoals = [
  { value: "systematic", label: "系统学习" },
  { value: "exam", label: "备考冲刺" },
  { value: "growth", label: "能力提升" },
  { value: "interest", label: "日常兴趣" }
] as const;

export const dailyTimes = [
  { value: "under30", label: "30分钟以内", minutes: 20 },
  { value: "30to60", label: "30分钟-60分钟", minutes: 45 },
  { value: "1to2h", label: "1-2小时", minutes: 90 },
  { value: "over2h", label: "2小时以上", minutes: 120 }
] as const;

export const diagnosisQuestions = [
  {
    key: "urgency",
    title: "你当前学习的紧迫程度？",
    helper: "我们会据此安排重点和复盘节奏。",
    multiple: false,
    options: [
      { value: "urgent", label: "很紧急，短期要学完" },
      { value: "steady", label: "正常节奏，按计划来" },
      { value: "relaxed", label: "不着急，慢慢看" }
    ]
  },
  {
    key: "timePattern",
    title: "你的学习时间是哪种类型？",
    helper: "选择最接近你日常学习的方式。",
    multiple: false,
    options: [
      { value: "block", label: "整块固定时间" },
      { value: "fragmented", label: "碎片化零散时间" }
    ]
  },
  {
    key: "goals",
    title: "这个学习集主要用于什么？",
    helper: "可以选择多个目标，先选择的会优先考虑。",
    multiple: true,
    options: [
      { value: "systematic", label: "系统学习" },
      { value: "exam", label: "应试备考" },
      { value: "professional", label: "专业提升" },
      { value: "interest", label: "兴趣阅读" },
      { value: "gaps", label: "查漏补缺" }
    ]
  },
  {
    key: "contentFoci",
    title: "你希望内容更侧重什么？",
    helper: "这些选择会调整学习入口的展示顺序。",
    multiple: true,
    options: [
      { value: "keyPoints", label: "重点和考点" },
      { value: "principles", label: "原理和逻辑" },
      { value: "practice", label: "联系实际" },
      { value: "exercises", label: "多做练习" },
      { value: "notes", label: "生成笔记" }
    ]
  },
  {
    key: "aids",
    title: "你最需要哪些学习辅助？",
    helper: "已有工具会优先出现在你面前。",
    multiple: true,
    options: [
      { value: "chat", label: "AI 自话讲解" },
      { value: "video", label: "AI 视频讲解" },
      { value: "mistakes", label: "错题智能复盘" },
      { value: "guidedNotes", label: "导学笔记沉淀" }
    ]
  },
  {
    key: "reviews",
    title: "你习惯怎样巩固这本书？",
    helper: "自由复习会关闭固定复盘提醒。",
    multiple: true,
    options: [
      { value: "alongside", label: "边学边练" },
      { value: "notes", label: "学完整理笔记" },
      { value: "periodic", label: "定期复盘" },
      { value: "mistakes", label: "错题重点突破" },
      { value: "free", label: "自由复习" }
    ]
  }
] as const;

export type PrimaryGoal = typeof primaryGoals[number]["value"];
export type DailyTime = typeof dailyTimes[number]["value"];
export type Urgency = typeof diagnosisQuestions[0]["options"][number]["value"];
export type TimePattern = typeof diagnosisQuestions[1]["options"][number]["value"];
export type SetGoal = typeof diagnosisQuestions[2]["options"][number]["value"];
export type ContentFocus = typeof diagnosisQuestions[3]["options"][number]["value"];
export type Aid = typeof diagnosisQuestions[4]["options"][number]["value"];
export type ReviewMode = typeof diagnosisQuestions[5]["options"][number]["value"];

export type LearnerPreferences = {
  displayName: string;
  primaryGoal: PrimaryGoal | null;
  dailyTime: DailyTime | null;
  completedAt: number;
};

export type SetDiagnosis = {
  urgency: Urgency;
  timePattern: TimePattern;
  goals: SetGoal[];
  contentFoci: ContentFocus[];
  aids: Aid[];
  reviews: ReviewMode[];
};

export type LearningResource = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  addedAt: number;
  status: "pending";
};

export type LearningSet = {
  id: string;
  name: string;
  resourceIds: string[];
  diagnosis: SetDiagnosis;
  createdAt: number;
  updatedAt: number;
};

export type LearningSetDraft = {
  id: string;
  name: string;
  resourceIds: string[];
  diagnosis: Partial<SetDiagnosis>;
  step: number;
  editingSetId: string | null;
  uploadedCourse?: UploadedCourseFile | null;
  parseJobId?: string | null;
  parseCompleted?: boolean;
};

export type OnboardingDraft = {
  displayName: string;
  primaryGoal: PrimaryGoal | null;
  dailyTime: DailyTime | null;
  step: number;
};

export type LearningSetState = {
  version: 1;
  preferences: LearnerPreferences | null;
  onboardingDraft: OnboardingDraft;
  sets: LearningSet[];
  resources: LearningResource[];
  draft: LearningSetDraft | null;
  activeSetId: string | null;
};

export function emptyLearningSetState(): LearningSetState {
  return {
    version: 1,
    preferences: null,
    onboardingDraft: { displayName: "", primaryGoal: null, dailyTime: null, step: 0 },
    sets: [],
    resources: [],
    draft: null,
    activeSetId: null
  };
}

export function courseResourceId(bookId: string) {
  return `course:${bookId}`;
}

export function localResourceId(id: string) {
  return `local:${id}`;
}

export function bookIdFromResourceId(resourceId: string) {
  return resourceId.startsWith("course:") ? resourceId.slice("course:".length) : null;
}

export function dailyMinuteBudget(preferences: LearnerPreferences | null) {
  return dailyTimes.find((option) => option.value === preferences?.dailyTime)?.minutes ?? 45;
}

export function toggleDiagnosisValue<T extends string>(current: readonly T[], value: T): T[] {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (value === "free") return [value];
  return [...current.filter((item) => item !== "free"), value];
}

export function isCompleteDiagnosis(value: Partial<SetDiagnosis>): value is SetDiagnosis {
  return Boolean(
    value.urgency && value.timePattern && value.goals?.length
    && value.contentFoci?.length && value.aids?.length && value.reviews?.length
  );
}
