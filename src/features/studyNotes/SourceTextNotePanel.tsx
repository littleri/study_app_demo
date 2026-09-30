import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { Check, MessageSquareText, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { deleteStudyNote, updateTextStudyNote } from "./repository";
import type { NoteAnchor, TextStudyNote } from "./types";
import type { TextNoteLocation } from "./SourceTextAnnotationLayer";

export type SourceTextNotePanelHandle = { save: () => Promise<TextStudyNote | undefined> };

const saveError = "保存失败，内容仍保留在编辑区，请重试。";

export function SourceTextNotePanel({
  anchor,
  existing,
  noteId,
  location,
  workspaceRef,
  ref,
  onAskAi,
  onClose
}: {
  anchor: NoteAnchor;
  existing?: TextStudyNote;
  noteId: string;
  location: TextNoteLocation;
  workspaceRef: RefObject<HTMLDivElement | null>;
  ref?: Ref<SourceTextNotePanelHandle>;
  onAskAi: (note: TextStudyNote) => void;
  onClose: () => void;
}) {
  const idRef = useRef(existing?.id ?? noteId);
  const anchorRef = useRef(anchor);
  const positionRef = useRef(location.position);
  const panelRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [body, setBody] = useState(existing?.body ?? "");
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const [editing, setEditing] = useState(!existing);
  const savedBodyRef = useRef(existing?.body ?? "");
  const queuedBodyRef = useRef(existing?.body ?? "");
  const lastSavedNoteRef = useRef(existing);
  const saveQueueRef = useRef<Promise<TextStudyNote | undefined>>(Promise.resolve(existing));
  const closingRef = useRef(false);
  const deletedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(existing ? "已保存" : "自动保存");
  const [error, setError] = useState("");
  const [placement, setPlacement] = useState({ left: 8, top: 8, width: 320, maxHeight: 400 });

  const persist = useCallback((content: string) => {
    if (!content.trim() && !lastSavedNoteRef.current) return Promise.resolve(undefined);
    if (content === queuedBodyRef.current && lastSavedNoteRef.current?.position) return saveQueueRef.current;
    if (!content.trim()) {
      setError("批注内容不能为空。需要移除这条批注时，请点击删除。");
      return Promise.reject(new Error("批注内容不能为空"));
    }
    queuedBodyRef.current = content;
    setStatus("保存中…");
    const save = async () => {
      const now = Date.now();
      // Read the latest record so a conversation response never gets overwritten by editing.
      const note = await updateTextStudyNote(idRef.current, (stored) => {
        const previous = stored ?? lastSavedNoteRef.current;
        return {
          ...previous,
          id: idRef.current,
          kind: "text",
          title: previous?.title ?? `教材笔记 · ${anchorRef.current.chapterTitle ?? anchorRef.current.bookTitle ?? "原文"}`,
          anchor: anchorRef.current,
          position: positionRef.current,
          body: content.trim(),
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          noteVersion: (previous?.noteVersion ?? 0) + 1,
          pipelinePhase: "complete"
        };
      });
      if (!note) throw new Error(saveError);
      lastSavedNoteRef.current = note;
      savedBodyRef.current = content;
      if (bodyRef.current === content) setStatus("已保存");
      setError("");
      return note;
    };
    const queued = saveQueueRef.current.catch(() => undefined).then(save);
    const result = queued.catch((reason: unknown) => {
      if (queuedBodyRef.current === content) queuedBodyRef.current = savedBodyRef.current;
      setStatus("未保存");
      setError(saveError);
      throw reason;
    });
    saveQueueRef.current = result;
    return result;
  }, []);

  useImperativeHandle(ref, () => ({ save: () => persist(bodyRef.current) }), [persist]);

  const requestClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setBusy(true);
    try {
      await persist(bodyRef.current);
      onClose();
    } catch {
      // persist keeps the unsaved editor open and exposes a retry action.
    } finally {
      closingRef.current = false;
      setBusy(false);
    }
  }, [onClose, persist]);

  useEffect(() => {
    if (body === savedBodyRef.current || busy) return;
    timerRef.current = window.setTimeout(() => { void persist(body).catch(() => undefined); }, 500);
    return () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  }, [body, busy, persist]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    // Also flush when navigation unmounts the reader immediately after typing.
    if (!deletedRef.current && bodyRef.current !== savedBodyRef.current) void persist(bodyRef.current).catch(() => undefined);
  }, [persist]);

  useEffect(() => {
    const handleBack = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      void requestClose();
    };
    window.addEventListener("bookcourse:native-back", handleBack);
    return () => window.removeEventListener("bookcourse:native-back", handleBack);
  }, [requestClose]);

  useEffect(() => {
    if (editing) inputRef.current?.focus({ preventScroll: true });
    else panelRef.current?.focus({ preventScroll: true });
  }, [editing]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const workspace = workspaceRef.current;
    if (!panel || !workspace) return;
    const update = () => {
      const area = workspace.getBoundingClientRect();
      const page = location.pageElement.getBoundingClientRect();
      if (!area.width || !area.height) return;
      const scaleX = area.width / Math.max(1, workspace.clientWidth);
      const scaleY = area.height / Math.max(1, workspace.clientHeight);
      const x = (page.left + location.position.x * page.width - area.left) / scaleX;
      const y = (page.top + location.position.y * page.height - area.top) / scaleY;
      const viewport = window.visualViewport;
      const visibleTop = Math.max(0, ((viewport?.offsetTop ?? 0) - area.top) / scaleY);
      const visibleBottom = Math.min(workspace.clientHeight, ((viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - area.top) / scaleY);
      const width = Math.min(340, workspace.clientWidth - 16);
      const maxHeight = Math.max(100, visibleBottom - visibleTop - 16);
      const height = Math.min(panel.offsetHeight, maxHeight);
      const left = Math.max(8, Math.min(workspace.clientWidth - width - 8, x + width + 20 <= workspace.clientWidth ? x + 16 : x - width - 16));
      const idealTop = y + height + 24 <= visibleBottom ? y + 20 : y - height - 20;
      const top = Math.max(visibleTop + 8, Math.min(visibleBottom - height - 8, idealTop));
      setPlacement((current) => current.left === left && current.top === top && current.width === width && current.maxHeight === maxHeight
        ? current : { left, top, width, maxHeight });
    };
    const observer = new ResizeObserver(update);
    observer.observe(workspace);
    observer.observe(location.pageElement);
    observer.observe(panel);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [location, workspaceRef]);

  async function askAi() {
    if (closingRef.current || !body.trim()) return;
    closingRef.current = true;
    setBusy(true);
    try {
      const note = await persist(bodyRef.current);
      if (note) onAskAi(note);
    } catch {
      // The draft stays editable when saving fails.
    } finally {
      closingRef.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (closingRef.current) return;
    closingRef.current = true;
    setBusy(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    try {
      await saveQueueRef.current.catch(() => undefined);
      if (lastSavedNoteRef.current) await deleteStudyNote(idRef.current);
      deletedRef.current = true;
      onClose();
    } catch {
      setError("删除失败，批注仍保留，请重试。");
    } finally {
      closingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      ref={panelRef}
      className="source-inline-note-panel source-text-note-popover"
      aria-label="原文文字笔记"
      tabIndex={-1}
      data-editing={editing}
      style={placement}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (editing && (event.metaKey || event.ctrlKey) && event.key === "Enter")) {
          event.preventDefault();
          void requestClose();
        }
      }}
    >
      <header className="source-text-note-heading">
        <MessageSquareText size={17} aria-hidden="true" />
        <strong>文字批注</strong>
        <span role="status">{status}</span>
        <button type="button" aria-label="关闭文字笔记" disabled={busy} onClick={() => void requestClose()}><X size={18} aria-hidden="true" /></button>
      </header>
      <small>{anchor.chapterTitle ?? anchor.bookTitle ?? "教材原文"} · 第 {anchor.printedPageStart ?? anchor.pageStart} 页</small>
      {anchor.quote ? <blockquote>{anchor.quote}</blockquote> : null}
      {editing ? (
        <label className="source-text-note-input">
          <span>我的理解</span>
          <textarea
            ref={inputRef}
            value={body}
            disabled={busy}
            placeholder="在这里写下理解、疑问或联想…"
            onChange={(event) => { setBody(event.target.value); setStatus("未保存"); }}
          />
        </label>
      ) : <p className="source-text-note-body">{body}</p>}
      {error ? <p className="source-note-error" role="alert">{error}</p> : null}
      {error ? <button className="source-note-retry" type="button" disabled={busy} onClick={() => void persist(bodyRef.current).catch(() => undefined)}>重试保存</button> : null}
      <footer className="source-text-note-actions">
        <button className="source-text-note-delete" type="button" aria-label="删除批注" disabled={busy} onClick={() => void remove()}><Trash2 size={17} aria-hidden="true" /></button>
        {editing ? (
          <button type="button" disabled={busy} onClick={() => void requestClose()}><Check size={16} aria-hidden="true" />完成</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden="true" />编辑批注</button>
        )}
        <button className="source-text-note-ai" type="button" disabled={busy || !body.trim()} onClick={() => void askAi()}><Sparkles size={16} aria-hidden="true" />问 AI</button>
      </footer>
    </section>
  );
}
