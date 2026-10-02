import type { StudyNote, TextStudyNote } from "./types";

const databaseName = "bookcourse-study-notes";
const databaseVersion = 1;
const legacyStorageKey = "bookcourse.saved-study-notes.v1";
const migrationKey = "legacy-text-v1";

type LegacyTextNote = {
  id: string;
  title: string;
  body: string;
  quote?: string;
  sourceLabel?: string;
  createdAt: number;
};

let databasePromise: Promise<IDBDatabase> | null = null;
const memoryNotes = new Map<string, StudyNote>();
const memoryAudio = new Map<string, Blob>();
const noteMutationQueues = new Map<string, Promise<unknown>>();

function serializeNoteMutation<T>(noteId: string, mutate: () => Promise<T>): Promise<T> {
  const result = (noteMutationQueues.get(noteId) ?? Promise.resolve()).catch(() => undefined).then(mutate);
  noteMutationQueues.set(noteId, result);
  const clear = () => { if (noteMutationQueues.get(noteId) === result) noteMutationQueues.delete(noteId); };
  void result.then(clear, clear);
  return result;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      const notes = database.createObjectStore("notes", { keyPath: "id" });
      notes.createIndex("kind", "kind");
      notes.createIndex("bookId", "anchor.bookId");
      notes.createIndex("chapterId", "anchor.chapterId");
      notes.createIndex("updatedAt", "updatedAt");
      database.createObjectStore("audio", { keyPath: "id" });
      database.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open the study note database"));
    };
  });
  return databasePromise;
}

function loadLegacyNotes(): LegacyTextNote[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(legacyStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is LegacyTextNote => (
      typeof value === "object"
      && value !== null
      && typeof value.id === "string"
      && typeof value.title === "string"
      && typeof value.body === "string"
      && typeof value.createdAt === "number"
    ));
  } catch {
    return [];
  }
}

async function migrateLegacyNotes(database: IDBDatabase) {
  const check = database.transaction("meta", "readonly");
  const migrated = await requestResult(check.objectStore("meta").get(migrationKey));
  if (migrated) return;

  const legacyNotes = loadLegacyNotes();
  const transaction = database.transaction(["notes", "meta"], "readwrite");
  const notesStore = transaction.objectStore("notes");
  for (const legacy of legacyNotes) {
    const note: StudyNote = {
      id: legacy.id,
      kind: "text",
      title: legacy.title,
      body: legacy.body,
      anchor: legacy.quote || legacy.sourceLabel ? {
        bookId: "legacy-local",
        quote: legacy.quote,
        chapterTitle: legacy.sourceLabel
      } : undefined,
      createdAt: legacy.createdAt,
      updatedAt: legacy.createdAt,
      noteVersion: 1,
      pipelinePhase: "complete"
    };
    notesStore.put(note);
  }
  transaction.objectStore("meta").put({ key: migrationKey, completedAt: Date.now() });
  await transactionComplete(transaction);
}

async function seedDemoNotes(database: IDBDatabase) {
  const seedKey = "learning-notes-demo-v1";
  const check = database.transaction("meta", "readonly");
  if (await requestResult(check.objectStore("meta").get(seedKey))) return;

  const now = Date.now();
  const uncertainInkNote: StudyNote = {
    id: "ink-demo-needs-confirmation",
    kind: "ink",
    title: "字迹需确认 · 减数分裂",
    anchor: {
      bookId: "book_biology_2",
      bookTitle: "高中生物学·必修2",
      chapterId: "chapter-2",
      chapterTitle: "减数分裂和受精作用",
      pageStart: 16,
      pageEnd: 16
    },
    pages: {
      "16": [{
        id: "demo-uncertain-stroke",
        tool: "pen",
        color: "#7c3aed",
        width: 0.006,
        opacity: 0.92,
        points: [
          { x: 0.29, y: 0.34, pressure: 0.55, t: 0 },
          { x: 0.36, y: 0.32, pressure: 0.62, t: 20 },
          { x: 0.43, y: 0.36, pressure: 0.58, t: 40 },
          { x: 0.51, y: 0.33, pressure: 0.6, t: 60 }
        ]
      }]
    },
    createdAt: now - 86_400_000,
    updatedAt: now - 86_400_000,
    noteVersion: 1,
    pipelinePhase: "needs_confirmation",
    recognizedText: "减数第一次分裂时，同源染色体？离。",
    uncertain: ["？离"],
    fixtureId: "meiosis-uncertain-ink-v1"
  };
  const transaction = database.transaction(["notes", "meta"], "readwrite");
  transaction.objectStore("notes").put(uncertainInkNote);
  transaction.objectStore("meta").put({ key: seedKey, completedAt: now });
  await transactionComplete(transaction);
}

async function readyDatabase() {
  const database = await openDatabase();
  await migrateLegacyNotes(database);
  await seedDemoNotes(database);
  return database;
}

export async function listStudyNotes(): Promise<StudyNote[]> {
  try {
    const database = await readyDatabase();
    const transaction = database.transaction("notes", "readonly");
    const notes = await requestResult(transaction.objectStore("notes").getAll()) as StudyNote[];
    return notes.sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    if (memoryNotes.size === 0) {
      for (const legacy of loadLegacyNotes()) {
        memoryNotes.set(legacy.id, {
          id: legacy.id,
          kind: "text",
          title: legacy.title,
          body: legacy.body,
          createdAt: legacy.createdAt,
          updatedAt: legacy.createdAt,
          noteVersion: 1,
          pipelinePhase: "complete"
        });
      }
    }
    return Array.from(memoryNotes.values()).sort((left, right) => right.updatedAt - left.updatedAt);
  }
}

export async function getStudyNote(noteId: string): Promise<StudyNote | null> {
  try {
    const database = await readyDatabase();
    const transaction = database.transaction("notes", "readonly");
    return (await requestResult(transaction.objectStore("notes").get(noteId)) as StudyNote | undefined) ?? null;
  } catch {
    return memoryNotes.get(noteId) ?? null;
  }
}

export async function putStudyNote(note: StudyNote) {
  memoryNotes.set(note.id, note);
  try {
    const database = await readyDatabase();
    const transaction = database.transaction("notes", "readwrite");
    transaction.objectStore("notes").put(note);
    await transactionComplete(transaction);
  } catch (error) {
    throw error instanceof Error ? error : new Error("笔记保存失败");
  }
  window.dispatchEvent(new CustomEvent("bookcourse:study-notes-changed"));
  return note;
}

export function updateTextStudyNote(noteId: string, update: (existing: TextStudyNote | undefined) => TextStudyNote | undefined) {
  return serializeNoteMutation(noteId, async () => {
    const stored = await getStudyNote(noteId);
    const next = update(stored?.kind === "text" ? stored : undefined);
    if (next) await putStudyNote(next);
    return next;
  });
}

export function deleteStudyNote(noteId: string) {
  return serializeNoteMutation(noteId, async () => {
    const database = await readyDatabase();
    const transaction = database.transaction("notes", "readwrite");
    transaction.objectStore("notes").delete(noteId);
    await transactionComplete(transaction);
    memoryNotes.delete(noteId);
    window.dispatchEvent(new CustomEvent("bookcourse:study-notes-changed"));
  });
}

export async function saveAudioBlob(id: string, blob: Blob) {
  memoryAudio.set(id, blob);
  try {
    // ArrayBuffer is supported by IndexedDB even in WebViews that cannot clone
    // Blob objects. Keep the MIME type so playback can reconstruct the audio.
    const buffer = await blob.arrayBuffer();
    const database = await readyDatabase();
    const transaction = database.transaction("audio", "readwrite");
    transaction.objectStore("audio").put({ id, buffer, mimeType: blob.type, updatedAt: Date.now() });
    await transactionComplete(transaction);
    return true;
  } catch {
    return false;
  }
}

export async function getAudioBlob(id: string) {
  try {
    const database = await readyDatabase();
    const transaction = database.transaction("audio", "readonly");
    const result = await requestResult(transaction.objectStore("audio").get(id)) as { id: string; blob?: Blob; buffer?: ArrayBuffer; mimeType?: string } | undefined;
    // Read recordings saved by both the old Blob format and the portable one.
    return result?.blob ?? (result?.buffer ? new Blob([result.buffer], { type: result.mimeType }) : memoryAudio.get(id) ?? null);
  } catch {
    return memoryAudio.get(id) ?? null;
  }
}

export async function deleteAudioBlob(id: string) {
  memoryAudio.delete(id);
  try {
    const database = await readyDatabase();
    const transaction = database.transaction("audio", "readwrite");
    transaction.objectStore("audio").delete(id);
    await transactionComplete(transaction);
  } catch {
    // An orphaned demo blob is preferable to making re-recording fail.
  }
}

export function createStudyNoteId(kind: StudyNote["kind"]) {
  return `${kind}-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSilentWavBlob(durationSeconds = 5) {
  const sampleRate = 8_000;
  const sampleCount = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  return new Blob([buffer], { type: "audio/wav" });
}
