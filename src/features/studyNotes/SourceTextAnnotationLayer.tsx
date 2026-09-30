import { useRef } from "react";
import { MessageSquareText } from "lucide-react";
import { textNotePosition } from "./textAnnotations";
import type { TextNotePosition, TextStudyNote } from "./types";

export type TextNoteLocation = {
  position: TextNotePosition;
  pageElement: HTMLElement;
};

export function SourceTextAnnotationLayer({
  activeNoteId,
  enabled,
  notes,
  placing,
  onOpen,
  onPlace
}: {
  activeNoteId?: string;
  enabled: boolean;
  notes: TextStudyNote[];
  placing: boolean;
  onOpen: (note: TextStudyNote, location: TextNoteLocation) => void;
  onPlace: (location: TextNoteLocation) => void;
}) {
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const multiplePointersRef = useRef(false);

  if (!enabled) return null;

  return (
    <div className="source-text-annotation-layer">
      {placing ? (
        <button
          className="source-text-placement-target"
          type="button"
          aria-label="点击原文添加文字批注"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (pointersRef.current.size === 0) multiplePointersRef.current = false;
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointersRef.current.size > 1) multiplePointersRef.current = true;
          }}
          onPointerUp={(event) => {
            const start = pointersRef.current.get(event.pointerId);
            pointersRef.current.delete(event.pointerId);
            if (!start || multiplePointersRef.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
            const pageElement = event.currentTarget.parentElement!.parentElement!;
            onPlace({ position: textNotePosition(event.clientX, event.clientY, pageElement.getBoundingClientRect()), pageElement });
          }}
          onPointerCancel={(event) => pointersRef.current.delete(event.pointerId)}
          onClick={(event) => {
            // Keyboard and assistive activation have no pointer coordinates.
            if (event.detail !== 0) return;
            onPlace({ position: { x: .5, y: .35 }, pageElement: event.currentTarget.parentElement!.parentElement! });
          }}
        />
      ) : null}
      {notes.filter((note) => note.position && note.body.trim()).map((note) => (
        <button
          className="source-text-note-marker"
          type="button"
          key={note.id}
          aria-label={`查看文字批注：${note.body.slice(0, 32)}`}
          aria-expanded={activeNoteId === note.id}
          title={note.body.slice(0, 80)}
          data-note-id={note.id}
          style={{
            left: `clamp(22px, ${note.position!.x * 100}%, calc(100% - 22px))`,
            top: `clamp(22px, ${note.position!.y * 100}%, calc(100% - 22px))`
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(note, { position: note.position!, pageElement: event.currentTarget.parentElement!.parentElement! });
          }}
        >
          <span><MessageSquareText size={15} aria-hidden="true" /></span>
        </button>
      ))}
    </div>
  );
}
