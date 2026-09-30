import { putStudyNote } from "../features/studyNotes/repository";

export type SavedStudyNote = {
  id: string;
  title: string;
  body: string;
  quote?: string;
  sourceLabel?: string;
  createdAt: number;
};

const storageKey = "bookcourse.saved-study-notes.v1";

function getStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function loadSavedStudyNotes(): SavedStudyNote[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((note): note is SavedStudyNote => (
      typeof note === "object"
      && note !== null
      && typeof note.id === "string"
      && typeof note.title === "string"
      && typeof note.body === "string"
      && typeof note.createdAt === "number"
    ));
  } catch {
    return [];
  }
}

export function saveStudyNote(note: Omit<SavedStudyNote, "id" | "createdAt">) {
  const savedNote: SavedStudyNote = {
    ...note,
    id: `study-note-${Date.now()}`,
    createdAt: Date.now()
  };
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(storageKey, JSON.stringify([savedNote, ...loadSavedStudyNotes()]));
    } catch {
      // The unified repository below still keeps the current in-memory note
      // and reports persistence failures to feature-level callers.
    }
  }
  void putStudyNote({
    id: savedNote.id,
    kind: "text",
    title: savedNote.title,
    body: savedNote.body,
    anchor: savedNote.quote || savedNote.sourceLabel ? {
      bookId: "local-text-note",
      quote: savedNote.quote,
      chapterTitle: savedNote.sourceLabel
    } : undefined,
    createdAt: savedNote.createdAt,
    updatedAt: savedNote.createdAt,
    noteVersion: 1,
    pipelinePhase: "complete"
  }).catch(() => undefined);
  return savedNote;
}
