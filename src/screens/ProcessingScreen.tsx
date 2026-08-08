import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Upload,
  WandSparkles
} from "lucide-react";
import {
  Button,
  Card,
  ProgressBar
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { StateSwapText, useMotionHistory, useReducedMotion } from "../motion";

type StageCompletionSnapshot = {
  completed: boolean[];
  jobId: string | null;
};

function StageCompletionCheck({
  motionKey,
  motionState,
  settle
}: {
  motionKey: string;
  motionState: "entering" | "idle";
  settle: (key: string) => void;
}) {
  const checkRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = checkRef.current;
    if (!element) return;
    const handleAnimationCancel = (event: AnimationEvent) => {
      if (event.animationName === "motion-stage-check-in") settle(motionKey);
    };
    element.addEventListener("animationcancel", handleAnimationCancel);
    return () => element.removeEventListener("animationcancel", handleAnimationCancel);
  }, [motionKey, settle]);

  return (
    <span
      ref={checkRef}
      className="stage-completion-check"
      data-motion-stage-key={motionKey}
      data-motion-stage-state={motionState}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.animationName === "motion-stage-check-in") settle(motionKey);
      }}
    >
      <CheckCircle2 size={18} />
    </span>
  );
}

export function ProcessingScreen() {
  const { go, parseJobId, parseJobStatus, parsedChapters, uploadedFile } = useAppContext();
  const { consume } = useMotionHistory();
  const reducedMotion = useReducedMotion();
  const stageCompletionSnapshotRef = useRef<StageCompletionSnapshot | null>(null);
  const [enteringStageKeys, setEnteringStageKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [progress, setProgress] = useState(parseJobId ? 5 : 8);
  const liveProgress = parseJobStatus ? Math.max(0, Math.min(100, parseJobStatus.progress)) : progress;
  const jobMessage = parseJobStatus?.message ?? (parseJobId ? "已提交云端解析任务，正在后台运行" : "");
  const parseError = parseJobStatus?.status === "failed" ? parseJobStatus.error ?? "解析失败，请重新上传或检查文件格式" : null;
  const isDone = parseJobStatus?.status === "done";
  const stages = ["解析页面与版面", "抽取标题段落图表", "写入 PostgreSQL", "BGE-M3 embedding", "BM25 + pgvector 索引"];
  const activeStage = liveProgress <= 0 ? -1 : Math.min(stages.length - 1, Math.floor(liveProgress / 22));
  const stageCount = stages.length;
  const completedStages = stages.map((_, index) => index < activeStage);
  const progressBucket = Math.max(0, Math.min(100, Math.floor(liveProgress / 10) * 10));
  const processingStatusText = parseError
    ?? (jobMessage || `已识别 ${parsedChapters?.length ?? 0} 个目录项，正在生成课程结构和检索索引`);
  const processingLiveAnnouncement = parseError
    ? `解析失败：${parseError}`
    : isDone
      ? `解析完成，进度 ${liveProgress}%`
      : `${activeStage >= 0 ? `正在${stages[activeStage]}` : "正在准备解析"}，进度约 ${progressBucket}%`;

  const settleStageMotion = useCallback((key: string) => {
    setEnteringStageKeys((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!parseJobId) {
      stageCompletionSnapshotRef.current = null;
      setEnteringStageKeys((current) => current.size === 0 ? current : new Set());
      return;
    }

    const previous = stageCompletionSnapshotRef.current;
    const currentCompletedStages = Array.from({ length: stageCount }, (_, index) => index < activeStage);
    stageCompletionSnapshotRef.current = {
      completed: currentCompletedStages,
      jobId: parseJobId
    };

    // The first Processing render establishes the real polling baseline. A
    // later job starts from an incomplete baseline so its newly complete
    // checks can play once; ordinary rerenders and same-value polls cannot.
    if (!previous) return;

    const isNewJob = previous.jobId !== parseJobId;
    const previousCompletedStages = !isNewJob
      ? previous.completed
      : Array.from({ length: stageCount }, () => false);
    const enteringKeys: string[] = [];

    currentCompletedStages.forEach((completed, index) => {
      if (!completed || previousCompletedStages[index]) return;
      const key = `parse:${parseJobId}:stage:${index}`;
      if (consume(key) && !reducedMotion) enteringKeys.push(key);
    });

    if (enteringKeys.length === 0 && !isNewJob) return;
    setEnteringStageKeys((current) => {
      const next = isNewJob ? new Set<string>() : new Set(current);
      enteringKeys.forEach((key) => next.add(key));
      return next;
    });
  }, [activeStage, consume, parseJobId, reducedMotion, stageCount]);

  useLayoutEffect(() => {
    if (!reducedMotion) return;
    setEnteringStageKeys((current) => current.size === 0 ? current : new Set());
  }, [reducedMotion]);

  useEffect(() => {
    if (parseJobId) return;
    setProgress(0);
  }, [go, parseJobId]);

  if (!parseJobId) {
    return (
      <div className="screen-stack processing-flow-screen processing-empty-screen">
        <Card className="parse-empty-card">
          <FileText size={34} aria-hidden="true" />
          <h2>没有正在运行的解析任务</h2>
          <p>请先上传教材并创建后端解析任务，前端不会用本地假进度代替真实状态。</p>
          <Button icon={<Upload size={18} aria-hidden="true" />} onClick={() => go("upload")}>去上传教材</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="screen-stack processing-flow-screen">
      <div className="processing-flow-primary">
        <Card surface="celebration" className="processing-card">
          <WandSparkles size={32} aria-hidden="true" />
          <h2>正在构建 RAG 知识库</h2>
          <p>{uploadedFile?.name ?? "后端解析任务"}</p>
          <strong>
            <StateSwapText value={`${liveProgress}%`} reserveValues={["100%"]} />
          </strong>
          <ProgressBar value={liveProgress} label={`解析进度 ${liveProgress}%`} />
        </Card>
      </div>
      <div className="processing-flow-support">
        <div className="stage-list" aria-label="解析处理阶段">
          {stages.map((stage, index) => (
            <div className={`stage-row ${index <= activeStage ? "done" : ""}`} key={stage}>
              <span>
                {completedStages[index] ? (
                  <StageCompletionCheck
                    motionKey={`parse:${parseJobId}:stage:${index}`}
                    motionState={enteringStageKeys.has(`parse:${parseJobId}:stage:${index}`) ? "entering" : "idle"}
                    settle={settleStageMotion}
                  />
                ) : index + 1}
              </span>
              <div>
                <strong>{stage}</strong>
                <small>{index <= activeStage ? "已完成" : "等待中"}</small>
              </div>
            </div>
          ))}
        </div>
        <Card className="insight-card processing-status-card">
          <p>
            <StateSwapText value={processingStatusText} reserveValues={["解析失败，请重新上传或检查文件格式"]} />
          </p>
        </Card>
      </div>
      <p className="motion-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {processingLiveAnnouncement}
      </p>
      <div className="processing-flow-actions">
        {parseError ? <Button variant="secondary" onClick={() => go("parseReady")}>返回重新解析</Button> : null}
        {isDone ? <Button onClick={() => go("chapterConfirm")}>查看目录</Button> : null}
        {parseJobId && !isDone && !parseError ? <Button variant="secondary" onClick={() => go("home")}>后台运行，先回首页</Button> : null}
      </div>
    </div>
  );
}
