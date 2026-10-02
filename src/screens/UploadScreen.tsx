import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../components/ui";
import { StickerIcon } from "../components/icons/StickerIcon";
import { useAppContext } from "../context/AppContext";
import { bookIdFromResourceId, localResourceId } from "../features/courses/model";

export function UploadScreen() {
  const { courses, sourceSummaries, importCourseFile, go } = useAppContext();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function addMockFile() {
    if (files.length) return;
    const file = new File([
      "学习入门\n每天安排一小段学习时间，阅读资料中的重点，记录自己的理解，再通过练习和复盘巩固知识。"
    ], "示例课程资料.txt", { type: "text/plain", lastModified: 0 });
    setFiles([file]);
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
      courses.startDraft(undefined, { suggestedName: files[0]?.name.replace(/\.[^.]+$/, "") ?? "我的课程" });
      const errors: string[] = [];
      for (const file of files) { try { await importCourseFile(file); } catch (cause) { errors.push(`${file.name}：${cause instanceof Error ? cause.message : "整理失败"}`); } }
      setFiles([]);
      if (errors.length) setError(errors.join("；")); else continueSetup();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "资料保存失败"); }
    finally { setBusy(false); }
  }
  return <div className="screen-stack upload-sheet-screen upload-flow-screen"><section className="upload-sheet-card upload-flow-primary">
    <button className={`upload-add-tile ${files.length ? "has-selection" : ""}`} type="button" disabled={busy} onClick={addMockFile} aria-label={files.length ? "已添加示例课程资料" : "选择课程资料"}><span className="upload-add-icon" aria-hidden="true">{files.length ? <StickerIcon name="FileText" size={44} /> : <Plus size={38} />}</span></button>
    <h3>添加课程资料</h3><p>点击添加示例资料，继续设置你的专属学习方式。</p>
    <div className="course-upload-files" aria-live="polite">{files.map((file, index) => <div key={`${file.name}:${index}`}><StickerIcon name="FileText" size={24} /><span>{file.name}</span><button type="button" disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={18} /></button></div>)}</div>
    {error ? <p className="status-error-copy" role="alert">{error}</p> : null}
    <Button disabled={!files.length || busy} loading={busy} onClick={() => void save()}>{busy ? "正在整理…" : "保存资料并继续"}</Button>
    {courses.state.draft?.resourceIds.length ? <Button variant="secondary" disabled={busy} onClick={continueSetup}>继续设置课程</Button> : null}
  </section></div>;
}
