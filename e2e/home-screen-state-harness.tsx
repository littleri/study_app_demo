import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider, type AppContextValue, type SourceSummariesLoadState, type SourceSummariesReadyKind } from "../src/context/AppContext";
import { defaultCourseDiagnosis, emptyCourseState } from "../src/features/courses/model";
import { HomeScreen } from "../src/screens/HomeScreen";
import type { ApiChapter, CourseSourceSummary, ScanResult, StudyPlan, StudyTask } from "../src/types/api";
import type { Screen, UploadedCourseFile } from "../src/types/app";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "../src/styles/home.css";
import "../src/styles/chapter-tools.css";

type HarnessMode =
  | "loading"
  | "error"
  | "empty"
  | "selection-failure"
  | "review-success"
  | "review-failure"
  | "global-actions"
  | "global-no-plan";

type HomeScreenStateHarness = {
  getRoutes: () => Screen[];
  releaseRefresh: () => void;
  removeFailedBook: () => void;
  setMode: (mode: HarnessMode) => void;
};

declare global {
  interface Window {
    __homeScreenStateHarness?: HomeScreenStateHarness;
  }
}

function course(bookId: string, title: string): CourseSourceSummary {
  return {
    book_id: bookId,
    title,
    filename: `${bookId}.pdf`,
    status: "ready",
    page_count: 80,
    chapter_count: 2,
    chunk_count: 1,
    asset_count: 0,
    average_confidence: .96,
    updated_at: 1
  };
}

const readyCourses = [
  course("book-a", "已加载的生物教材"),
  course("book-b", "即将被删除的失败教材")
];
const reviewCourse: CourseSourceSummary = {
  ...course("book-review", "需要确认目录的物理教材"),
  status: "needs_review"
};

const chapters: ApiChapter[] = [
  {
    chapter_id: "root-a",
    level: 1,
    source_title: "第一章",
    ai_title: "第一章",
    page_start: 1,
    page_end: 10,
    confidence: 1,
    status: "匹配良好",
    source: "state-harness",
    parent_id: null
  },
  {
    chapter_id: "section-a",
    level: 2,
    source_title: "第一节 可学习内容",
    ai_title: "可学习内容",
    page_start: 2,
    page_end: 4,
    confidence: 1,
    status: "匹配良好",
    source: "state-harness",
    parent_id: "root-a"
  }
];

const uploadedFile: UploadedCourseFile = {
  bookId: "book-a",
  name: "book-a.pdf",
  sizeBytes: 1,
  contentType: "application/pdf",
  uploadedAt: 1,
  origin: "remote-course"
};

function studyTask(taskId: string, status: string): StudyTask {
  return {
    task_id: taskId,
    user_id: "state-harness-user",
    day: 1,
    title: `首页任务 ${taskId}`,
    task_type: "lesson",
    minutes: 20,
    chapter_id: "section-a",
    status,
    weak_points: []
  };
}

function HarnessView() {
  const [mode, setModeState] = useState<HarnessMode>("loading");
  const [removedFailedBook, setRemovedFailedBook] = useState(false);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const releaseRefreshRef = useRef<(() => void) | null>(null);
  const routes = useMemo<Screen[]>(() => [], []);
  const selectionMode = mode === "selection-failure" || mode === "global-actions" || mode === "global-no-plan";
  const reviewMode = mode === "review-success" || mode === "review-failure";
  const courses = selectionMode
    ? readyCourses.filter((item) => !removedFailedBook || item.book_id !== "book-b")
    : reviewMode
      ? [reviewCourse]
      : [];
  const loadState: SourceSummariesLoadState = mode === "loading"
    ? "loading"
    : mode === "error"
      ? "error"
      : "ready";
  const readyKind: SourceSummariesReadyKind = courses.length > 0 ? "content" : "empty";
  const scan = selectionMode ? ({ book_id: "book-a" } as ScanResult) : null;
  const plan = selectionMode ? ({
    user_id: "state-harness-user",
    book_id: "book-a",
    days: 7,
    daily_minutes: 20,
    tasks: mode === "global-actions"
      ? [studyTask("done", "done"), studyTask("pending", "pending")]
      : []
  } satisfies StudyPlan) : null;

  async function refreshCourses() {
    setRefreshing(true);
    setModeState("loading");
    await new Promise<void>((resolve) => {
      releaseRefreshRef.current = resolve;
    });
    setModeState("empty");
    setRefreshing(false);
  }

  async function selectCourse(bookId: string) {
    bookId = bookId.replace(/^parent:/, "");
    if (bookId === "book-review") return mode === "review-success";
    if (bookId === "book-a") return true;
    setPendingBookId(bookId);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    setPendingBookId(null);
    return false;
  }

  const value = {
    courses: {
      state: { ...emptyCourseState(), activeCourseId: courses[0] ? `parent:${courses[0].book_id}` : null,
        courses: courses.map((source) => ({ id: `parent:${source.book_id}`, name: source.title, resourceIds: [`source:${source.book_id}`], diagnosis: defaultCourseDiagnosis(), createdAt: 1, updatedAt: 1 })) },
      startDraft: () => undefined
    },
    cancelSourceSelection: () => setPendingBookId(null),
    sourceSummaries: courses,
    sourceSummariesError: mode === "error" ? "Failed to fetch state harness" : null,
    sourceSummariesLoadState: loadState,
    sourceSummariesReadyKind: readyKind,
    sourceSummariesRefreshing: refreshing,
    currentStudyPlan: plan,
    generatedFlashcards: selectionMode ? [] : null,
    generatedLessons: selectionMode ? [] : null,
    generatedQuizzes: selectionMode ? [] : null,
    go: (screen: Screen) => routes.push(screen),
    loadedBookId: selectionMode ? "book-a" : null,
    openSourcePage: () => routes.push("source"),
    parseJobId: null,
    parseJobStatus: null,
    parsedAssets: selectionMode ? [] : null,
    parsedChapters: selectionMode ? chapters : null,
    parsedChunks: selectionMode ? [] : null,
    parsedScanResult: scan,
    pendingBookId,
    refreshSources: refreshCourses,
    selectCourse,
    setActiveChapterId: () => undefined,
    studyLocations: selectionMode ? {
      "book-a": { expandedChapterId: "root-a", expandedSectionId: "section-a" }
    } : {},
    updateStudyLocation: () => undefined,
    uploadedFile: selectionMode ? uploadedFile : null
  } as unknown as AppContextValue;

  window.__homeScreenStateHarness = {
    getRoutes: () => [...routes],
    releaseRefresh: () => {
      releaseRefreshRef.current?.();
      releaseRefreshRef.current = null;
    },
    removeFailedBook: () => setRemovedFailedBook(true),
    setMode(nextMode) {
      releaseRefreshRef.current?.();
      releaseRefreshRef.current = null;
      routes.length = 0;
      setModeState(nextMode);
      setRemovedFailedBook(false);
      setPendingBookId(null);
      setRefreshing(false);
    }
  };

  return (
    <AppProvider value={value}>
      <HomeScreen />
    </AppProvider>
  );
}

const rootElement = document.getElementById("home-screen-state-root");
if (!rootElement) throw new Error("Home screen state harness root is missing.");
createRoot(rootElement).render(<HarnessView />);
