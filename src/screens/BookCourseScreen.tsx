import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  FileText,
  NotebookPen,
  Upload
} from "lucide-react";
import {
  Button,
  Card,
  ProgressBar,
  Section
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useLocalMotionItem } from "../motion";
import {
  QuickAction,
  apiChapterToChapter,
  averageConfidence,
  liveBookTitle,
  sourceUnitCountLabel
} from "./shared";

export function BookCourseScreen() {
  const { generatedLessons, go, currentStudyPlan, parsedAssets, parsedChapters, parsedChunks, parsedScanResult, setActiveChapterId, uploadedFile } = useAppContext();
  const lessonByChapterId = new Map((generatedLessons ?? []).map((lesson) => [lesson.chapter_id, lesson]));
  const isLiveCourse = Boolean(uploadedFile && parsedChapters?.length && generatedLessons?.length);
  const displayChapters = isLiveCourse
    ? parsedChapters!
        .filter((chapter) => lessonByChapterId.has(chapter.chapter_id))
        .map(apiChapterToChapter)
    : [];
  const courseTitle = liveBookTitle(uploadedFile, parsedScanResult);
  const average = isLiveCourse ? averageConfidence(displayChapters) : 0;
  const motionBookKey = uploadedFile?.bookId ?? "empty";
  const emptyMotion = useLocalMotionItem(`book-course:${motionBookKey}:empty`);
  const heroMotion = useLocalMotionItem(`book-course:${motionBookKey}:hero`);
  const actionsMotion = useLocalMotionItem(`book-course:${motionBookKey}:actions`);

  if (!isLiveCourse) {
    return (
      <div className="screen-stack">
        <Card {...emptyMotion.attributes} className="parse-empty-card">
          <BookOpen size={34} aria-hidden="true" />
          <h2>还没有可学习的真实课程</h2>
          <p>请先上传教材并完成解析，后端会把章节、chunk、embedding 和检索索引准备好。</p>
          <Button icon={<Upload size={18} aria-hidden="true" />} onClick={() => go("upload")}>上传教材</Button>
          <Button variant="secondary" onClick={() => go("library")}>查看课程库</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="screen-stack book-course-screen">
      <div className="book-course-overview">
      <Card {...heroMotion.attributes} className="course-hero">
        <span className="book-summary-icon">
          <FileText size={32} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">{`${currentStudyPlan?.days ?? 14} 天计划 · ${sourceUnitCountLabel(parsedScanResult)}`}</p>
          <h2>{courseTitle}</h2>
          <ProgressBar value={0} label={`目录平均置信度 ${average}%`} />
          <p>{`${parsedChunks?.length ?? 0} 个 RAG 片段 · ${parsedAssets?.length ?? 0} 个课程插图 · ${currentStudyPlan?.tasks.length ?? 0} 个学习任务`}</p>
        </div>
      </Card>
      <div {...actionsMotion.attributes} className="course-action-grid" role="group" aria-label="课程工具">
        <QuickAction icon={<CalendarDays size={19} aria-hidden="true" />} title="学习计划" helper={`${currentStudyPlan?.tasks.length ?? 14} 项`} onClick={() => go("plan")} />
        <QuickAction icon={<BookOpen size={19} aria-hidden="true" />} title="RAG 片段" helper={`${parsedChunks?.length ?? 0} 条`} onClick={() => go("lesson")} />
        <QuickAction icon={<CircleAlert size={19} aria-hidden="true" />} title="本书错题" helper="实时诊断" onClick={() => go("mistakes")} />
        <QuickAction icon={<NotebookPen size={19} aria-hidden="true" />} title="课程插图" helper={`${parsedAssets?.length ?? 0} 张`} onClick={() => go("notes")} />
      </div>
      </div>
      <Section title="课程目录">
        <div className="chapter-list">
          {displayChapters.map((chapter) => (
            <button className="chapter-row clickable" type="button" key={chapter.id} onClick={() => {
              setActiveChapterId(chapter.id);
              go("lesson");
            }}>
              <div>
                <h3>{chapter.sourceTitle}</h3>
                <p>{chapter.aiTitle} · {lessonByChapterId.get(chapter.id)?.lesson_kind === "module_intro" ? "模块导读" : chapter.duration}</p>
                <ProgressBar value={chapter.progress} />
              </div>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
