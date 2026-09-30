import { useCallback, useMemo, useRef, useState } from "react";
import { validateCourseFile } from "../../screens/shared";
import type { UploadedCourseFile } from "../../types/app";
import {
  courseResourceId,
  emptyLearningSetState,
  isCompleteDiagnosis,
  learningSetStorageKey,
  localResourceId,
  type LearnerPreferences,
  type LearningResource,
  type LearningSetDraft,
  type LearningSetState,
  type OnboardingDraft,
  type SetDiagnosis
} from "./model";

const resourceDatabaseName = "bookcourse-learning-resources";
const maximumLocalFileBytes = 100 * 1024 * 1024;
let databasePromise: Promise<IDBDatabase> | null = null;

function openResourceDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("当前设备无法保存资料文件"));
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(resourceDatabaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("资料文件存储无法打开"));
    };
  });
  return databasePromise;
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("资料文件保存失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("资料文件保存中断"));
  });
}

export async function saveLearningResourceFile(id: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const database = await openResourceDatabase();
  const transaction = database.transaction("files", "readwrite");
  // Binary bytes avoid WebKit's Blob/File storage failure in the Android and
  // browser test paths; the display name stays in versioned metadata.
  const request = transaction.objectStore("files").put({ id, bytes, contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("资料文件写入失败"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("资料文件保存失败"));
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("资料文件保存中断"));
  });
}

export async function getLearningResourceFile(id: string): Promise<Blob | null> {
  const database = await openResourceDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction("files", "readonly").objectStore("files").get(id);
    request.onsuccess = () => {
      const stored = request.result as { bytes?: Uint8Array; contentType?: string } | undefined;
      if (!stored?.bytes) {
        resolve(null);
        return;
      }
      const bytes = new Uint8Array(stored.bytes.length);
      bytes.set(stored.bytes);
      resolve(new Blob([bytes.buffer], { type: stored.contentType ?? "application/octet-stream" }));
    };
    request.onerror = () => reject(request.error ?? new Error("资料文件读取失败"));
  });
}

async function deleteLearningResourceFile(id: string) {
  const database = await openResourceDatabase();
  const transaction = database.transaction("files", "readwrite");
  transaction.objectStore("files").delete(id);
  await waitForTransaction(transaction);
}

export function loadLearningSetState(): LearningSetState {
  if (typeof window === "undefined") return emptyLearningSetState();
  try {
    const raw = window.localStorage.getItem(learningSetStorageKey);
    if (!raw) return emptyLearningSetState();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return emptyLearningSetState();
    const candidate = value as Partial<LearningSetState>;
    if (candidate.version !== 1 || !Array.isArray(candidate.sets) || !Array.isArray(candidate.resources)) {
      return emptyLearningSetState();
    }
    return {
      version: 1,
      preferences: candidate.preferences ?? null,
      onboardingDraft: candidate.onboardingDraft ?? emptyLearningSetState().onboardingDraft,
      sets: candidate.sets,
      resources: candidate.resources,
      draft: candidate.draft ?? null,
      activeSetId: candidate.activeSetId ?? null
    };
  } catch {
    return emptyLearningSetState();
  }
}

function persistLearningSetState(state: LearningSetState) {
  try {
    window.localStorage.setItem(learningSetStorageKey, JSON.stringify(state));
  } catch {
    throw new Error("本地存储空间不足，学习偏好或学习集尚未保存。请清理空间后重试。");
  }
}

export type LearningSetController = ReturnType<typeof useLearningSetStore>;

export function useLearningSetStore() {
  const [state, setState] = useState(loadLearningSetState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback((update: (current: LearningSetState) => LearningSetState) => {
    const next = update(stateRef.current);
    persistLearningSetState(next);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const updateOnboardingDraft = useCallback((patch: Partial<OnboardingDraft>) => {
    commit((current) => ({
      ...current,
      onboardingDraft: { ...current.onboardingDraft, ...patch }
    }));
  }, [commit]);

  const completeOnboarding = useCallback(() => {
    const draft = stateRef.current.onboardingDraft;
    const displayName = draft.displayName.trim();
    if (!displayName) throw new Error("请先填写称呼");
    const preferences: LearnerPreferences = {
      displayName,
      primaryGoal: draft.primaryGoal,
      dailyTime: draft.dailyTime,
      completedAt: Date.now()
    };
    commit((current) => ({ ...current, preferences }));
  }, [commit]);

  const updatePreferences = useCallback((patch: Partial<Pick<LearnerPreferences, "displayName" | "primaryGoal" | "dailyTime">>) => {
    commit((current) => {
      if (!current.preferences) throw new Error("请先完成首次引导");
      const next = { ...current.preferences, ...patch };
      if (!next.displayName.trim()) throw new Error("称呼不能为空");
      return { ...current, preferences: { ...next, displayName: next.displayName.trim() } };
    });
  }, [commit]);

  const startDraft = useCallback((resourceId?: string, options?: { suggestedName?: string; uploadedCourse?: UploadedCourseFile | null }) => {
    commit((current) => {
      const draft = current.draft ?? {
        id: crypto.randomUUID(),
        name: options?.suggestedName?.trim() ?? "",
        resourceIds: [],
        diagnosis: {},
        step: -1,
        editingSetId: null,
        uploadedCourse: null,
        parseJobId: null,
        parseCompleted: false
      };
      const updatedDraft = {
        ...draft,
        name: draft.name || options?.suggestedName?.trim() || "",
        uploadedCourse: options && "uploadedCourse" in options ? options.uploadedCourse : draft.uploadedCourse
      };
      return {
        ...current,
        draft: resourceId && !updatedDraft.resourceIds.includes(resourceId)
          ? { ...updatedDraft, resourceIds: [...updatedDraft.resourceIds, resourceId] }
          : updatedDraft
      };
    });
  }, [commit]);

  const editSet = useCallback((setId: string) => {
    commit((current) => {
      const learningSet = current.sets.find((item) => item.id === setId);
      if (!learningSet) throw new Error("学习集不存在");
      return {
        ...current,
        draft: {
          id: learningSet.id,
          name: learningSet.name,
          resourceIds: [...learningSet.resourceIds],
          diagnosis: { ...learningSet.diagnosis },
          step: -1,
          editingSetId: learningSet.id,
          uploadedCourse: null,
          parseJobId: null,
          parseCompleted: false
        }
      };
    });
  }, [commit]);

  const updateDraft = useCallback((patch: Partial<LearningSetDraft>) => {
    commit((current) => {
      if (!current.draft) throw new Error("请先创建学习集");
      return { ...current, draft: { ...current.draft, ...patch } };
    });
  }, [commit]);

  const completeDraft = useCallback(() => {
    const draft = stateRef.current.draft;
    if (!draft) throw new Error("学习集草稿不存在");
    if (!draft.name.trim()) throw new Error("请填写学习集名称");
    if (draft.resourceIds.length === 0) throw new Error("请至少添加一份书籍资料");
    if (!isCompleteDiagnosis(draft.diagnosis)) throw new Error("请回答全部六类问题");
    const now = Date.now();
    commit((current) => {
      const previous = current.sets.find((item) => item.id === draft.editingSetId);
      const learningSet = {
        id: draft.id,
        name: draft.name.trim(),
        resourceIds: draft.resourceIds,
        diagnosis: draft.diagnosis as SetDiagnosis,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      return {
        ...current,
        sets: previous
          ? current.sets.map((item) => item.id === previous.id ? learningSet : item)
          : [...current.sets, learningSet],
        activeSetId: learningSet.id,
        draft: null
      };
    });
    return draft.id;
  }, [commit]);

  const clearDraft = useCallback(() => {
    commit((current) => ({ ...current, draft: null }));
  }, [commit]);

  const setActiveSet = useCallback((setId: string) => {
    commit((current) => {
      if (!current.sets.some((item) => item.id === setId)) throw new Error("学习集不存在");
      return { ...current, activeSetId: setId };
    });
  }, [commit]);

  const addCourse = useCallback((setId: string, bookId: string) => {
    commit((current) => {
      if (!current.sets.some((item) => item.id === setId)) throw new Error("学习集不存在");
      return {
        ...current,
        sets: current.sets.map((item) => item.id !== setId ? item : {
          ...item,
          resourceIds: [...new Set([...item.resourceIds, courseResourceId(bookId)])],
          updatedAt: Date.now()
        })
      };
    });
  }, [commit]);

  const addExistingResource = useCallback((setId: string, resourceId: string) => {
    commit((current) => {
      if (!current.sets.some((item) => item.id === setId)) throw new Error("学习集不存在");
      if (!resourceId.startsWith("local:") || !current.resources.some((item) => localResourceId(item.id) === resourceId)) {
        throw new Error("资料不存在");
      }
      return {
        ...current,
        sets: current.sets.map((item) => item.id !== setId ? item : {
          ...item,
          resourceIds: [...new Set([...item.resourceIds, resourceId])],
          updatedAt: Date.now()
        })
      };
    });
  }, [commit]);

  const removeResource = useCallback((setId: string, resourceId: string) => {
    commit((current) => {
      if (!current.sets.some((item) => item.id === setId)) throw new Error("学习集不存在");
      return {
        ...current,
        sets: current.sets.map((item) => item.id !== setId ? item : {
          ...item,
          resourceIds: item.resourceIds.filter((id) => id !== resourceId),
          updatedAt: Date.now()
        })
      };
    });
  }, [commit]);

  const addLocalFile = useCallback(async (file: File, setId?: string) => {
    const validation = validateCourseFile(file);
    if (validation) throw new Error(validation);
    if (file.size > maximumLocalFileBytes) throw new Error("单份资料不能超过 100MB");
    const id = crypto.randomUUID();
    const resource: LearningResource = {
      id,
      name: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      addedAt: Date.now(),
      status: "pending"
    };
    await saveLearningResourceFile(id, file);
    try {
      commit((current) => {
        const resourceId = localResourceId(id);
        if (setId) {
          if (!current.sets.some((item) => item.id === setId)) throw new Error("学习集不存在");
          return {
            ...current,
            resources: [...current.resources, resource],
            sets: current.sets.map((item) => item.id !== setId ? item : {
              ...item,
              resourceIds: [...item.resourceIds, resourceId],
              updatedAt: Date.now()
            })
          };
        }
        if (!current.draft) throw new Error("请先创建学习集");
        return {
          ...current,
          resources: [...current.resources, resource],
          draft: { ...current.draft, resourceIds: [...current.draft.resourceIds, resourceId] }
        };
      });
    } catch (error) {
      await deleteLearningResourceFile(id).catch(() => undefined);
      throw error;
    }
    return resource;
  }, [commit]);

  return useMemo(() => ({
    state,
    updateOnboardingDraft,
    completeOnboarding,
    updatePreferences,
    startDraft,
    editSet,
    updateDraft,
    completeDraft,
    clearDraft,
    setActiveSet,
    addCourse,
    addExistingResource,
    removeResource,
    addLocalFile
  }), [
    state, updateOnboardingDraft, completeOnboarding, updatePreferences, startDraft,
    editSet, updateDraft, completeDraft, clearDraft, setActiveSet,
    addCourse, addExistingResource, removeResource, addLocalFile
  ]);
}
