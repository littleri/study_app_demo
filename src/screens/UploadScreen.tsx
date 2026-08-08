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
  acceptedCourseFileTypes,
  formatFileSize,
  getFileKind,
  validateCourseFile
} from "./shared";
import { uploadConfirmedCourseFile } from "./uploadFlow";

export function UploadScreen() {
  const { go, setParseJobId, setParseJobStatus, setActiveChapterId, setCurrentStudyPlan, setGeneratedFlashcards, setGeneratedLessons, setGeneratedQuizzes, setLatestDiagnosis, setLessonBuildJobId, setLessonBuildJobStatus, setParsedAssets, setParsedChapters, setParsedChunks, setParsedScanResult, setSelectedUpload, setUploadedFile, showToast } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function resetCourseGenerationState() {
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
  }

  function chooseFile() {
    if (!uploading) fileInputRef.current?.click();
  }

  async function uploadSelectedFile() {
    if (!selectedFile) {
      chooseFile();
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploadedFile = await uploadConfirmedCourseFile(selectedFile, bookcourseApi);
      resetCourseGenerationState();
      setUploadedFile(uploadedFile);
      setSelectedUpload(true);
      showToast("文件已上传。你可以确认后再开始后台解析");
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
    const validationError = validateCourseFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
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
          className={`upload-add-tile ${uploading ? "is-loading" : ""} ${selectedFile ? "has-selection" : ""}`}
          type="button"
          disabled={uploading}
          onClick={chooseFile}
          aria-label={selectedFile ? "替换学习资料" : "选择学习资料"}
        >
          <span className="upload-add-icon">{uploading ? <Upload size={36} aria-hidden="true" /> : <Plus size={38} aria-hidden="true" />}</span>
        </button>
        <div className="upload-source-copy">
          {uploading ? (
            <div key="upload-status:uploading" className="upload-status-feedback" aria-live="polite">
              <h3>正在上传文件</h3>
              <p>上传完成后，你可以自行决定何时开始解析。</p>
            </div>
          ) : selectedFile ? (
            <div key={`upload-status:selected:${selectedFile.name}`} className="upload-status-feedback" aria-live="polite">
              <h3>已选择学习资料</h3>
              <p>确认无误后上传；上传不会自动开始解析。</p>
            </div>
          ) : (
            <>
              <h3>选择学习资料</h3>
              <p>支持 PDF、常用图片、Word、PowerPoint 和 Excel</p>
            </>
          )}
        </div>
        {selectedFile ? (
          <div className="upload-selection-summary" aria-label="已选文件信息">
            <FileText size={22} aria-hidden="true" />
            <div className="upload-selection-details">
              <strong>{selectedFile.name}</strong>
              <span>{getFileKind(selectedFile.name, selectedFile.type)} · {formatFileSize(selectedFile.size)}</span>
              <small>确认上传后会进入解析确认页；你可安全离开，稍后再开始后台解析。</small>
            </div>
            <div className="upload-selection-actions">
              <Button variant="secondary" disabled={uploading} onClick={chooseFile}>替换文件</Button>
              <Button variant="text" disabled={uploading} onClick={() => {
                setSelectedFile(null);
                setUploadError(null);
              }}>取消选择</Button>
            </div>
          </div>
        ) : null}
        <span className="upload-privacy-pill">
          <ShieldCheck size={14} aria-hidden="true" />
          选中文件前不会上传；内容仅用于生成你的 AI 课程
        </span>
        <Button icon={selectedFile ? <Upload size={18} aria-hidden="true" /> : <FolderOpen size={18} aria-hidden="true" />} loading={uploading} disabled={uploading} onClick={() => void uploadSelectedFile()}>
          {uploading ? "上传中" : selectedFile ? uploadError ? "重试上传" : "上传并继续" : "选择文件"}
        </Button>
      </section>

      <aside className="upload-flow-support" aria-label="上传支持信息">
        <div className="upload-mini-actions">
          <QuickAction icon={<Microscope size={19} aria-hidden="true" />} title="拍照导入" helper="PNG/JPG" onClick={chooseFile} />
          <QuickAction icon={<FileText size={19} aria-hidden="true" />} title="本地文档" helper="PDF/Office" onClick={chooseFile} />
        </div>

        {uploadError ? (
          <p key={`upload-error:${uploadError}`} className="helper-text upload-error status-error-copy upload-status-feedback" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{uploadError}</span>
          </p>
        ) : null}

        <Card className="privacy-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>先在本地检查文件名、类型和大小。只有点击“上传并继续”才会上传；解析需要你在下一步明确开始。</p>
        </Card>
      </aside>
    </div>
  );
}
