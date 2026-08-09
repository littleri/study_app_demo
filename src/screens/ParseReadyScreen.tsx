import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  FolderOpen
} from "lucide-react";
import {
  Button,
  Card,
  Metric,
  Pill,
  ProgressBar
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useBookCourseRepository } from "../context/BookCourseRepositoryContext";
import {
  coursePreparationSteps,
  formatFileSize,
  getFileKind
} from "./shared";
import { startConfirmedCourseParse } from "./uploadFlow";

export function ParseReadyScreen() {
  const bookcourseRepository = useBookCourseRepository();
  const { clearCourseSession, clearLoadedCourse, go, parseJobId, parseJobStatus, selectedUpload, uploadedFile, setParseJobId, setParseJobStatus, setSelectedUpload, showToast } = useAppContext();
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  async function startParse() {
    if (!uploadedFile) {
      go("upload");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const job = await startConfirmedCourseParse(uploadedFile, bookcourseRepository);
      setParseJobId(job.job_id);
      setParseJobStatus({
        job_id: job.job_id,
        book_id: uploadedFile.bookId,
        status: "pending",
        stage: "queued",
        progress: 1,
        message: "后台 OCR/解析任务已创建",
        error: null
      });
      clearLoadedCourse();
      showToast("后台解析已开始；你可以安全离开，进度会保留");
      go("processing");
    } catch (err) {
      const message = err instanceof Error ? err.message : "解析任务创建失败";
      setParseError(message);
      showToast(message, "warning");
    } finally {
      setParsing(false);
    }
  }

  if (!uploadedFile) {
    return (
      <div className="screen-stack parse-ready-screen parse-flow-screen parse-flow-empty">
        <Card className="parse-empty-card">
          <FileText size={34} aria-hidden="true" />
          <h2>还没有选择学习资料</h2>
          <p>先上传 PDF、图片或文档，再进入解析确认。</p>
          <Button icon={<FolderOpen size={18} aria-hidden="true" />} onClick={() => go("upload")}>
            去上传
          </Button>
        </Card>
      </div>
    );
  }

  const fileKind = getFileKind(uploadedFile.name, uploadedFile.contentType);
  const uploadTime = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(uploadedFile.uploadedAt);
  const jobProgress = Math.max(0, Math.min(100, parseJobStatus?.progress ?? (parseJobId ? 5 : 0)));
  const jobMessage = parseError
    ?? (parseJobStatus?.status === "failed"
      ? parseJobStatus.error ?? parseJobStatus.message ?? "解析失败，请检查文件后重试"
      : parseJobStatus?.message ?? (parseJobId ? "后台正在整理教材，完成后会自动生成目录。你可以安全离开，稍后回来查看。" : "文件已上传。点击下方按钮后才会开始后台解析；开始后可以安全离开。"));
  const parseStatus = parseError
    ? "start-error"
    : parseJobStatus?.status === "failed"
      ? "failed"
      : parseJobStatus?.status === "done"
        ? "complete"
        : parseJobId
          ? "running"
          : "ready";
  const jobTone = parseStatus === "failed" || parseStatus === "start-error" ? "orange" : parseStatus === "complete" ? "mint" : "sky";
  const parseStatusLabel = parseStatus === "complete"
    ? "已完成"
    : parseStatus === "failed" || parseStatus === "start-error"
      ? "解析失败"
      : parseJobId
        ? "后台处理中"
      : "等待你开始";
  const retryable = parseError !== null || parseJobStatus?.status === "failed";
  const primaryActionText = parseJobStatus?.status === "done"
    ? "查看目录"
    : retryable
      ? "重新解析"
      : parseJobId
        ? "查看后台进度"
        : "开始后台解析";

  return (
    <div className="screen-stack parse-ready-screen parse-flow-screen">
      <div className="parse-flow-primary">
      <Card className="parse-file-card">
        <span className="parse-file-icon">
          <FileText size={28} aria-hidden="true" />
        </span>
        <div>
          <div className="parse-upload-heading">
            <Pill tone="sky">已上传，待确认</Pill>
            {selectedUpload ? <span className="upload-success-mark" aria-hidden="true"><CheckCircle2 size={16} /></span> : null}
          </div>
          <h2>{uploadedFile.name}</h2>
          <p>{fileKind} · {formatFileSize(uploadedFile.sizeBytes)} · {uploadTime}</p>
        </div>
      </Card>
      </div>

      <aside className="parse-flow-support" aria-label="解析状态与支持信息">
      <div className="parse-info-grid">
        <Metric label="文件类型" value={fileKind} />
        <Metric label="文件大小" value={formatFileSize(uploadedFile.sizeBytes)} />
        <Metric label="下一步" value="后台解析" />
      </div>

      <div className="parse-checklist">
        {coursePreparationSteps.map((item, index) => (
          <div className="parse-check-row" key={item}>
            <span>{index === 0 ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}</span>
            <strong>{item}</strong>
          </div>
        ))}
        <p className="helper-text">这些步骤会在你明确开始后在后台完成，不必停留在这个页面等待。</p>
      </div>

      <div
        key={`parse-status:${parseStatus}`}
        className="parse-status-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Card className="insight-card">
          <div className="parse-status-heading">
            <Pill tone={jobTone}>{parseStatusLabel}</Pill>
            {parseStatus === "failed" || parseStatus === "start-error" ? <CircleAlert size={16} aria-hidden="true" /> : null}
          </div>
          <p>{jobMessage}</p>
          <ProgressBar value={jobProgress} label={`解析进度 ${jobProgress}%`} />
        </Card>
      </div>

      </aside>
      <div className="parse-flow-actions">
      <div className="parse-actions">
        <Button
          loading={parsing}
          disabled={parsing}
          onClick={() => {
            if (parseJobStatus?.status === "done") {
              go("chapterConfirm");
              return;
            }
            if (retryable) {
              void startParse();
              return;
            }
            if (parseJobId) {
              go("processing");
              return;
            }
            void startParse();
          }}
        >
          {primaryActionText}
        </Button>
        <Button variant="secondary" disabled={parsing} onClick={() => go("home")}>
          稍后开始
        </Button>
        <Button
          variant="secondary"
          disabled={parsing}
          onClick={() => {
            clearLoadedCourse();
            clearCourseSession();
            setSelectedUpload(false);
            go("upload");
          }}
        >
          更换文件
        </Button>
      </div>
      </div>
    </div>
  );
}
