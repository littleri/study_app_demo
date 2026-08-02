import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleAlert,
  ClipboardCheck,
  Cloud,
  FileText,
  Play,
  Upload
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { CourseCardMotion, SkeletonReveal } from "../motion";

type JourneyStepState = "done" | "active" | "error" | "pending";

export function HomeScreen() {
  const {
    courseSummaries,
    courseSummariesError,
    courseSummariesLoadState,
    courseSummariesReadyKind,
    courseSummariesRefreshing,
    go,
    parsedChapters,
    parseJobId,
    parseJobStatus,
    refreshCourses,
    uploadedFile
  } = useAppContext();
  const uploadedCourse = uploadedFile
    ? courseSummaries.find((course) => course.book_id === uploadedFile.bookId) ?? null
    : null;
  const latestCourse = uploadedCourse ?? courseSummaries[0] ?? null;
  const courseCardBookId = uploadedFile?.bookId ?? latestCourse?.book_id ?? null;
  const hasLiveCourse = Boolean(uploadedFile || latestCourse);
  const localJobMatches = Boolean(
    parseJobId
      && uploadedFile
      && (!parseJobStatus || parseJobStatus.book_id === uploadedFile.bookId)
  );
  const localJobState = localJobMatches ? parseJobStatus?.status ?? "processing" : null;
  const courseStatus = parsedChapters?.length
    ? "ready"
    : localJobState === "pending" || localJobState === "processing"
      ? "processing"
      : localJobState === "failed"
        ? "error"
        : latestCourse?.status ?? (uploadedFile ? "uploaded" : "empty");
  const isProcessing = courseStatus === "processing";
  const isReady = courseStatus === "ready";
  const needsReview = courseStatus === "needs_review";
  const hasError = courseStatus === "error";
  const parseProgress = Math.max(
    0,
    Math.min(100, localJobMatches ? parseJobStatus?.progress ?? 1 : latestCourse?.parse_job_progress ?? 1)
  );
  const courseTitle = uploadedFile?.name ?? latestCourse?.title ?? "还没有课程";
  const courseCount = parsedChapters?.length ?? latestCourse?.chapter_count ?? 0;
  const progressTarget = parseJobId ? "processing" : "library";
  const primaryTarget = !hasLiveCourse
    ? "upload"
    : isProcessing || hasError
      ? progressTarget
      : courseStatus === "uploaded" && uploadedFile
        ? "parseReady"
        : "library";
  const primaryLabel = !hasLiveCourse
    ? "上传第一本教材"
    : isProcessing
      ? "查看解析进度"
      : hasError
        ? "处理解析问题"
        : needsReview
          ? "确认课程目录"
          : isReady
            ? "继续学习"
            : "继续生成课程";
  const nextTitle = isProcessing
    ? parseJobStatus?.message ?? latestCourse?.parse_job_message ?? "正在把教材整理成可学习的课程"
    : hasError
      ? parseJobStatus?.error ?? latestCourse?.parse_job_error ?? "解析遇到问题，需要你的确认"
      : parsedChapters?.[0]?.ai_title
        ?? latestCourse?.next_title
        ?? (hasLiveCourse ? "等待生成课程目录" : "把手边的教材变成一条清晰的学习路径");
  const focusDescription = isProcessing
    ? "任务会在后台继续，完成后自动生成原书目录。"
    : hasError
      ? "查看具体原因后可以继续处理或重新上传。"
      : isReady
        ? `已保留原书结构，共识别 ${courseCount} 个目录项。`
        : needsReview
          ? "确认章节边界后，计划、问答与诊断会一起解锁。"
          : hasLiveCourse
            ? "下一步会保留原书章节，并建立可追溯的知识库。"
            : "支持 PDF、图片和 Office 文档，解析过程清晰可追踪。";
  const focusStateLabel = isProcessing
    ? `生成中 ${parseProgress}%`
    : hasError
      ? "需要处理"
      : isReady
        ? "学习路径已就绪"
        : needsReview
          ? "等待确认"
          : hasLiveCourse
            ? "准备生成"
            : "等待教材";
  const courseErrorMessage = courseSummariesError?.includes("Failed to fetch")
    ? "暂时无法连接课程服务"
    : courseSummariesError ?? "请稍后重试";

  const firstStepState: JourneyStepState = hasError
    ? "error"
    : isProcessing
      ? "active"
      : isReady || needsReview || courseCount > 0
        ? "done"
        : "pending";
  const secondStepState: JourneyStepState = courseCount > 0
    ? "done"
    : isProcessing
      ? "pending"
      : "pending";
  const thirdStepState: JourneyStepState = isReady
    ? "done"
    : needsReview
      ? "active"
      : "pending";
  const journeySteps: Array<{
    label: string;
    detail: string;
    state: JourneyStepState;
    target: Parameters<typeof go>[0];
  }> = [
    {
      label: "解析教材",
      detail: isProcessing ? `${parseProgress}%` : hasError ? "异常" : firstStepState === "done" ? "完成" : "未开始",
      state: firstStepState,
      target: hasLiveCourse ? progressTarget : "upload"
    },
    {
      label: "生成目录",
      detail: courseCount > 0 ? `${courseCount} 项` : isProcessing ? "等待解析" : "未开始",
      state: secondStepState,
      target: hasLiveCourse ? primaryTarget : "upload"
    },
    {
      label: "建立知识库",
      detail: isReady ? "可提问" : needsReview ? "待确认" : "未开始",
      state: thirdStepState,
      target: isReady ? "book" : primaryTarget
    }
  ];

  const tools = [
    {
      icon: <Upload size={20} aria-hidden="true" />,
      title: "上传新书",
      helper: "生成 AI 课程",
      onClick: () => go("upload"),
      tone: "sky"
    },
    {
      icon: <CalendarDays size={20} aria-hidden="true" />,
      title: "学习计划",
      helper: isReady ? "按进度安排" : "课程就绪后可用",
      onClick: () => go(isReady && parsedChapters?.length ? "plan" : primaryTarget),
      tone: "violet"
    },
    {
      icon: <ClipboardCheck size={20} aria-hidden="true" />,
      title: "作业诊断",
      helper: isReady ? "带原文引用" : "课程就绪后可用",
      onClick: () => go(isReady && parsedChapters?.length ? "assignment" : primaryTarget),
      tone: "mint"
    },
    {
      icon: <CircleAlert size={20} aria-hidden="true" />,
      title: "错题复习",
      helper: isReady ? "回到薄弱点" : "暂无记录",
      onClick: () => go(isReady && parsedChapters?.length ? "mistakes" : primaryTarget),
      tone: "coral"
    }
  ] as const;

  const courseError = (
    <div className="home-course-error" role="alert">
      <span>
        <strong>课程列表暂时不可用</strong>
        <small>{courseErrorMessage}</small>
      </span>
      <button type="button" disabled={courseSummariesRefreshing} onClick={() => void refreshCourses()}>
        {courseSummariesRefreshing ? "重试中…" : "重试"}
      </button>
    </div>
  );

  return (
    <div className="home-dashboard">
      <header className="home-topline">
        <div>
          <h1>Hi，小明同学</h1>
          <p>今天，沿着原书继续前进</p>
        </div>
        <span className={`home-presence is-${courseStatus}`}>
          <Cloud size={16} aria-hidden="true" />
          {focusStateLabel}
        </span>
      </header>

      <section className={`home-focus-panel is-${courseStatus}`} aria-labelledby="home-focus-title">
        <div className="home-focus-content">
          <div className="home-focus-label">
            <CalendarDays size={16} aria-hidden="true" />
            <span>今日下一步</span>
          </div>
          <p className="home-focus-course" title={courseTitle}>{courseTitle}</p>
          <h2 id="home-focus-title">{nextTitle}</h2>
          <p className="home-focus-description">{focusDescription}</p>
          {isProcessing ? (
            <div className="home-focus-progress" aria-label={`解析进度 ${parseProgress}%`}>
              <span style={{ width: `${parseProgress}%` }} />
            </div>
          ) : null}
          <button className="home-primary-action" type="button" onClick={() => go(primaryTarget)}>
            {hasLiveCourse ? <Play size={17} aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}
            <span>{primaryLabel}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="home-learning-path" aria-label="课程生成路径">
          {journeySteps.map((step, index) => (
            <button
              className={`home-path-step is-${step.state}`}
              key={step.label}
              type="button"
              onClick={() => go(step.target)}
            >
              <span className="home-path-marker" aria-hidden="true">{index + 1}</span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="home-overview-grid">
        <section className="home-course-panel" aria-labelledby="home-course-heading">
          <div className="home-section-heading">
            <div>
              <h2 id="home-course-heading">我的课程</h2>
              <p>最近学习</p>
            </div>
            <button type="button" onClick={() => go("library")}>
              全部 <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>

          {courseSummariesError && courseSummariesLoadState === "ready" ? courseError : null}
          <SkeletonReveal
            state={courseSummariesLoadState}
            readyKind={courseSummariesReadyKind}
            skeleton={(
              <div className="home-course-skeleton" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
            error={courseError}
            minBlockSize="66px"
          >
            {hasLiveCourse && courseCardBookId ? (
              <CourseCardMotion bookId={courseCardBookId} index={0}>
                {(motionAttributes) => {
                  return (
                    <button
                      {...motionAttributes}
                      className="home-course-row"
                      type="button"
                      onClick={() => go(primaryTarget)}
                    >
                      <span className="home-course-icon"><BookOpen size={21} aria-hidden="true" /></span>
                      <span className="home-course-copy">
                        <strong title={courseTitle}>{courseTitle}</strong>
                        <small>
                          {isProcessing
                            ? `教材解析 ${parseProgress}%`
                            : courseCount > 0
                              ? `${courseCount} 个目录项 · ${isReady ? "可以继续学习" : "等待确认"}`
                              : "等待生成目录"}
                        </small>
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  );
                }}
              </CourseCardMotion>
            ) : (
              <button className="home-course-row is-empty" type="button" onClick={() => go("upload")}>
                <span className="home-course-icon"><FileText size={21} aria-hidden="true" /></span>
                <span className="home-course-copy">
                  <strong>把第一本书变成课程</strong>
                  <small>上传教材后，从原书目录开始学习</small>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </SkeletonReveal>
        </section>

        <nav className="home-tools-panel" aria-labelledby="home-tools-heading">
          <div className="home-section-heading">
            <div>
              <h2 id="home-tools-heading">学习工具</h2>
              <p>{isReady ? "围绕原书继续" : "随课程逐步解锁"}</p>
            </div>
          </div>
          <div className="home-tool-grid">
            {tools.map((tool) => (
              <button
                className={`home-tool-button is-${tool.tone}`}
                key={tool.title}
                type="button"
                aria-label={`${tool.title}，${tool.helper}`}
                onClick={tool.onClick}
              >
                <span className="home-tool-icon">{tool.icon}</span>
                <span>
                  <strong>{tool.title}</strong>
                  <small>{tool.helper}</small>
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
