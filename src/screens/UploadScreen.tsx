import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../components/ui";
import { StickerIcon } from "../components/icons/StickerIcon";
import { useAppContext } from "../context/AppContext";
import { bookIdFromResourceId, localResourceId } from "../features/courses/model";

export function UploadScreen() {
  return <div className="screen-stack upload-sheet-screen upload-flow-screen"><CourseMaterialsUpload /></div>;
}

export function CourseMaterialsUpload({ courseId }: { courseId?: string }) {
  const { courses, sourceSummaries, importCourseFile, go, closeSheet, showToast } = useAppContext();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileSequence = useRef(0);
  function addMockFile() {
    const number = files.length ? fileSequence.current + 1 : 1;
    fileSequence.current = number;
    const file = new File([
      "学习入门\n每天安排一小段学习时间，阅读资料中的重点，记录自己的理解，再通过练习和复盘巩固知识。",
      number > 1 ? `\n资料编号：${number}` : ""
    ], number === 1 ? "示例课程资料.txt" : `示例课程资料 ${number}.txt`, { type: "text/plain", lastModified: 0 });
    setFiles((current) => [...current, file]);
    setError(null);
  }
  function continueSetup() {
    try {
      const state = courses.getState();
      const draft = state.draft;
      if (!draft?.resourceIds.length) throw new Error("请先添加课程资料");
      const firstResourceId = draft.resourceIds[0];
      const resource = state.resources.find((item) => localResourceId(item.id) === firstResourceId);
      const fileName = resource?.name ?? draft.uploadedCourse?.name;
      const bookId = bookIdFromResourceId(firstResourceId, state.resources);
      const name = draft.name.trim()
        || fileName?.replace(/\.[^.]+$/, "").trim()
        || sourceSummaries.find((source) => source.book_id === bookId)?.title
        || "我的课程";
      courses.updateDraft({ name, step: Math.max(0, draft.step) });
      go("courseSetup");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法继续设置课程"); }
  }
  async function save() {
    setBusy(true); setError(null);
    try {
      if (!courseId) courses.startDraft(undefined, { suggestedName: files[0]?.name.replace(/\.[^.]+$/, "") ?? "我的课程" });
      const errors: string[] = [];
      for (const file of files) { try { await importCourseFile(file, courseId); } catch (cause) { errors.push(`${file.name}：${cause instanceof Error ? cause.message : "整理失败"}`); } }
      if (errors.length) setError(errors.join("；"));
      else {
        setFiles([]);
        if (courseId) {
          showToast("资料已添加，可以继续学习");
          closeSheet();
        } else continueSetup();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "资料保存失败"); }
    finally { setBusy(false); }
  }
  return <section className="upload-sheet-card upload-flow-primary">
    {files.length ? <div className="upload-add-tile has-selection upload-selected-file-visual" role="group" aria-label={`已选择 ${files.length} 份学习资料`}>
      {files.map((file, index) => <div className="upload-selected-file-item" key={file.name}>
        <span className="upload-selected-file-icon" role="img" aria-label={`资料 ${index + 1}`}>
          <StickerIcon name="FileText" size={28} />
          <span className="upload-file-number" aria-hidden="true">{index + 1}</span>
        </span>
        <button className="upload-remove-file" type="button" disabled={busy} aria-label={`移除资料 ${index + 1}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><span className="upload-remove-file-mark"><X size={10} /></span></button>
      </div>)}
      <button className="upload-add-more" type="button" disabled={busy} onClick={addMockFile} aria-label="继续添加资料"><Plus size={28} /></button>
    </div> : <button className="upload-add-tile" type="button" disabled={busy} onClick={addMockFile} aria-label="选择课程资料"><span className="upload-add-icon" aria-hidden="true"><Plus size={38} /></span></button>}
    <h3>添加课程资料</h3>
    {error ? <p className="status-error-copy" role="alert">{error}</p> : null}
    <Button disabled={!files.length || busy} loading={busy} onClick={() => void save()}>{busy ? "正在整理…" : "保存资料并继续"}</Button>
    {!courseId && courses.state.draft?.resourceIds.length ? <Button variant="secondary" disabled={busy} onClick={continueSetup}>继续设置课程</Button> : null}
  </section>;
}
