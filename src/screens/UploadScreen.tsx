import { useRef, useState } from "react";
import {
  CircleAlert,
  FileText,
  FolderOpen,
  Microscope,
  Plus,
  ShieldCheck,
  Upload
} from "lucide-react";
import {
  Button,
  Card
} from "../components/ui";
import { bookcourseApi } from "../api/bookcourseApi";
import { useAppContext } from "../context/AppContext";
import {
  QuickAction,
  acceptedCourseFileTypes
} from "./shared";

export function UploadScreen() {
  const { go, setParseJobId, setParseJobStatus, setActiveChapterId, setCurrentStudyPlan, setGeneratedFlashcards, setGeneratedLessons, setGeneratedQuizzes, setLatestDiagnosis, setLessonBuildJobId, setLessonBuildJobStatus, setParsedAssets, setParsedChapters, setParsedChunks, setParsedScanResult, setSelectedUpload, setUploadedFile, showToast } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadSelectedFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const init = await bookcourseApi.initUpload({
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size
      });
      await bookcourseApi.uploadFile(init.book_id, file);
      setParseJobId(null);
      setParseJobStatus(null);
      setActiveChapterId(null);
      setCurrentStudyPlan(null);
      setLatestDiagnosis(null);
      setParsedAssets(null);
      setParsedChapters(null);
      setParsedChunks(null);
      setParsedScanResult(null);
      setGeneratedLessons(null);
      setGeneratedFlashcards(null);
      setGeneratedQuizzes(null);
      setLessonBuildJobId(null);
      setLessonBuildJobStatus(null);
      setUploadedFile({
        bookId: init.book_id,
        name: file.name,
        sizeBytes: file.size,
        contentType: file.type || "application/octet-stream",
        uploadedAt: Date.now()
      });
      setSelectedUpload(true);
      const job = await bookcourseApi.startParse(init.book_id);
      setParseJobId(job.job_id);
      setParseJobStatus({
        job_id: job.job_id,
        book_id: init.book_id,
        status: "pending",
        stage: "queued",
        progress: 1,
        message: "后台 OCR/解析任务已创建",
        error: null
      });
      showToast("文件已上传，后台 OCR/解析已启动");
      go("parseReady");
    } catch (err) {
      const message = err instanceof Error ? err.message : "文件上传失败";
      setUploadError(message);
      showToast(message, "warning");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void uploadSelectedFile(file);
  }

  return (
    <div className="screen-stack upload-sheet-screen upload-flow-screen">
      <section className="upload-sheet-card upload-flow-primary">
        <div className="upload-sheet-copy">
          <h2>上传一本书</h2>
          <p>PDF、图片及 DOCX / PPTX / XLSX 都可以生成课程</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedCourseFileTypes}
          onChange={handleFileChange}
          className="hidden-file-input"
        />
        <button
          className={`upload-add-tile ${uploading ? "is-loading" : ""}`}
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label="选择学习资料"
        >
          <span className="upload-add-icon">{uploading ? <Upload size={36} aria-hidden="true" /> : <Plus size={38} aria-hidden="true" />}</span>
        </button>
        <div className="upload-source-copy">
          {uploading ? (
            <div key="upload-status:uploading" className="upload-status-feedback" aria-live="polite">
              <h3>选择学习资料</h3>
              <p>正在上传文件，请稍候</p>
            </div>
          ) : (
            <>
              <h3>选择学习资料</h3>
              <p>支持 PDF、常用图片、Word、PowerPoint 和 Excel</p>
            </>
          )}
        </div>
        <span className="upload-privacy-pill">
          <ShieldCheck size={14} aria-hidden="true" />
          内容仅用于生成你的 AI 课程
        </span>
        <Button icon={<FolderOpen size={18} aria-hidden="true" />} loading={uploading} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "上传中" : "选择文件"}
        </Button>
      </section>

      <aside className="upload-flow-support" aria-label="上传支持信息">
        <div className="upload-mini-actions">
          <QuickAction icon={<Microscope size={19} aria-hidden="true" />} title="拍照导入" helper="PNG/JPG" onClick={() => fileInputRef.current?.click()} />
          <QuickAction icon={<FileText size={19} aria-hidden="true" />} title="本地文档" helper="PDF/Office" onClick={() => fileInputRef.current?.click()} />
        </div>

        {uploadError ? (
          <p key={`upload-error:${uploadError}`} className="helper-text upload-error status-error-copy upload-status-feedback" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{uploadError}</span>
          </p>
        ) : null}

        <Card className="privacy-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>文件会先上传到后端课程空间，确认后再开始 OCR、版面解析和 RAG 索引构建。</p>
        </Card>
      </aside>
    </div>
  );
}
