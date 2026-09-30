import { useRef, useState } from "react";
import {
  CircleAlert,
  FileText,
  Plus,
  X
} from "lucide-react";
import { Button } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useBookCourseRepository } from "../context/BookCourseRepositoryContext";
import { communityBooks } from "../data/mockBook";
import { bookIdFromResourceId, courseResourceId, localResourceId } from "../features/learningSets/model";
import {
  acceptedCourseFileTypes,
  validateCourseFile
} from "./shared";
import {
  createPresetBiologyCourseFile,
  isPresetBiologyCourseFile,
  uploadConfirmedCourseFiles
} from "./uploadFlow";

const maxSelectedFiles = 4;
const fileOrdinalLabels = ["文件一", "文件二", "文件三", "文件四"];

function suggestedSetName(fileName: string) {
  return fileName.replace(/\.[^.]+$/u, "").trim();
}

export function UploadScreen() {
  const bookcourseRepository = useBookCourseRepository();
  const { clearCourseSession, clearLoadedCourse, courseSummaries, go, learningSets, setSelectedUpload, setUploadedFile } = useAppContext();
  const draft = learningSets.state.draft?.editingSetId ? null : learningSets.state.draft;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const draftedResources = (draft?.resourceIds ?? []).map((resourceId) => {
    const bookId = bookIdFromResourceId(resourceId);
    if (bookId) {
      return { id: resourceId, name: courseSummaries.find((course) => course.book_id === bookId)?.title
        ?? communityBooks.find((book) => book.id === bookId)?.title
        ?? (draft?.uploadedCourse?.bookId === bookId ? draft.uploadedCourse.name : "已选择的课程") };
    }
    return { id: resourceId, name: learningSets.state.resources.find((resource) => localResourceId(resource.id) === resourceId)?.name ?? "已保存的资料" };
  });
  const selectedCount = draftedResources.length + selectedFiles.length;

  function resetCourseGenerationState() {
    clearLoadedCourse();
    clearCourseSession();
  }

  function chooseFile() {
    if (!uploading) fileInputRef.current?.click();
  }

  function selectPresetCourseFile() {
    if (uploading) return;
    setSelectedFiles([createPresetBiologyCourseFile()]);
    setUploadError(null);
  }

  async function uploadSelectedFiles() {
    const name = draft?.name.trim()
      || suggestedSetName(selectedFiles[0]?.name ?? draftedResources[0]?.name ?? "")
      || "我的学习集";
    if (selectedFiles.length === 0) {
      if (draftedResources.length > 0) {
        try {
          if (draft?.uploadedCourse && !draft.parseCompleted) {
            learningSets.updateDraft({ name, step: -2 });
            go(draft.parseJobId ? "processing" : "parseReady");
          } else {
            learningSets.updateDraft({ name, step: 0 });
            go("learningSetSetup");
          }
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : "草稿保存失败，请重试");
        }
        return;
      }
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      if (!isPresetBiologyCourseFile(selectedFiles[0])) {
        learningSets.startDraft(undefined, { suggestedName: name, uploadedCourse: draft?.uploadedCourse ?? null });
        for (const file of selectedFiles) await learningSets.addLocalFile(file);
        learningSets.updateDraft({ name, step: 0 });
        go("learningSetSetup");
        return;
      }
      const uploadedFile = await uploadConfirmedCourseFiles(selectedFiles, bookcourseRepository);
      learningSets.startDraft(courseResourceId(uploadedFile.bookId), {
        suggestedName: name,
        uploadedCourse: uploadedFile
      });
      learningSets.updateDraft({ name, step: -2, parseJobId: null, parseCompleted: false });
      resetCourseGenerationState();
      setUploadedFile(uploadedFile);
      setSelectedUpload(true);
      go("parseReady");
    } catch (err) {
      const message = err instanceof Error ? err.message : "文件上传失败";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    const validationError = files.map(validateCourseFile).find(Boolean);
    if (validationError) {
      setUploadError(validationError);
      return;
    }
    const currentFiles = selectedFiles.length === 1
      && isPresetBiologyCourseFile(selectedFiles[0])
      && files.some((file) => !isPresetBiologyCourseFile(file))
      ? []
      : selectedFiles;
    const existingKeys = new Set(currentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const additions = files.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
    const nextFiles = [...currentFiles, ...additions];
    if (nextFiles.length > maxSelectedFiles) {
      setUploadError(`一次最多选择 ${maxSelectedFiles} 份学习资料`);
      return;
    }
    setSelectedFiles(nextFiles);
    setUploadError(null);
  }

  function removeSelectedFile(index: number) {
    if (uploading) return;
    setSelectedFiles((files) => files.filter((_, fileIndex) => fileIndex !== index));
    setUploadError(null);
  }

  function removeDraftedResource(resourceId: string) {
    if (uploading || !draft) return;
    try {
      learningSets.updateDraft({ resourceIds: draft.resourceIds.filter((id) => id !== resourceId) });
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "资料移除失败，请重试");
    }
  }

  return (
    <div className="screen-stack upload-sheet-screen upload-flow-screen">
      <section className="upload-sheet-card upload-flow-primary">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedCourseFileTypes}
          onChange={handleFileChange}
          className="hidden-file-input"
        />
        {selectedCount > 0 ? (
          <div
            className={`upload-add-tile has-selection ${uploading ? "is-loading" : ""}`}
            role="group"
            aria-label={`已选择 ${selectedCount} 份学习资料`}
          >
            <div className="upload-selected-file-visual">
              {draftedResources.map((resource, index) => (
                <div className="upload-selected-file-item" key={resource.id}>
                  <span className="upload-selected-file-icon">
                    <FileText size={30} aria-hidden="true" />
                    <button
                      className="upload-remove-file"
                      type="button"
                      disabled={uploading}
                      onClick={() => removeDraftedResource(resource.id)}
                      aria-label={`删除${fileOrdinalLabels[index] ?? `资料${index + 1}`}`}
                    >
                      <span className="upload-remove-file-mark"><X size={14} /></span>
                    </button>
                  </span>
                  <strong title={resource.name}>{fileOrdinalLabels[index] ?? `资料${index + 1}`}</strong>
                </div>
              ))}
              {selectedFiles.map((file, index) => (
                <div className="upload-selected-file-item" key={`${file.name}:${file.size}:${file.lastModified}`}>
                  <span className="upload-selected-file-icon">
                    <FileText size={30} aria-hidden="true" />
                    <button
                      className="upload-remove-file"
                      type="button"
                      disabled={uploading}
                      onClick={() => removeSelectedFile(index)}
                      aria-label={`删除${fileOrdinalLabels[draftedResources.length + index] ?? `资料${draftedResources.length + index + 1}`}`}
                    >
                      <span className="upload-remove-file-mark"><X size={14} /></span>
                    </button>
                  </span>
                  <strong>{fileOrdinalLabels[draftedResources.length + index] ?? `资料${draftedResources.length + index + 1}`}</strong>
                </div>
              ))}
              {selectedFiles.length < maxSelectedFiles ? (
                <button
                  className="upload-add-more"
                  type="button"
                  disabled={uploading}
                  onClick={chooseFile}
                  aria-label="添加更多学习资料"
                >
                  <Plus size={22} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            className="upload-add-tile"
            type="button"
            disabled={uploading}
            onClick={selectPresetCourseFile}
            aria-label="选择学习资料"
          >
            <span className="upload-add-icon"><Plus size={38} aria-hidden="true" /></span>
          </button>
        )}
        <div className="upload-source-copy">
          {uploading ? (
            <div key="upload-status:uploading" className="upload-status-feedback" aria-live="polite">
              <h3>正在上传文件</h3>
              <p>上传完成后先填写学习集偏好，再决定何时开始解析。</p>
            </div>
          ) : (
            <div className="upload-status-feedback">
              <h3>{draftedResources.length > 0 && selectedFiles.length === 0 ? "资料已上传" : "选择学习资料"}</h3>
              <p>{draftedResources.length > 0 && selectedFiles.length === 0 ? "可以继续填写学习方式问卷。" : "支持 PDF、常用图片、Word、PowerPoint 和 Excel。新资料会先加入学习集，等待整理。"}</p>
            </div>
          )}
        </div>
        {uploadError ? (
          <p key={`upload-error:${uploadError}`} className="helper-text upload-error status-error-copy upload-status-feedback" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{uploadError}</span>
          </p>
        ) : null}
        <Button
          loading={uploading}
          disabled={uploading || selectedCount === 0}
          onClick={() => void uploadSelectedFiles()}
        >
          {uploading ? "上传中" : "上传并继续"}
        </Button>
      </section>
    </div>
  );
}
