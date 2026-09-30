import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, BookOpen, CalendarDays, FileDown, FilePlus2, Pencil, Plus, Sparkles, X } from "lucide-react";
import { runtimeConfig } from "../../config/runtime";
import { useAppContext } from "../../context/AppContext";
import { useBookCourseRepository } from "../../context/BookCourseRepositoryContext";
import { communityBooks } from "../../data/mockBook";
import type { StudyPlan } from "../../types/api";
import { bookIdFromResourceId, courseResourceId, diagnosisQuestions, localResourceId } from "./model";
import { getLearningResourceFile } from "./repository";
import { buildLearningSetRecommendations, preferredToolIds, type SetRecommendation } from "./recommendations";

export function AddCourseToSetControl({ bookId, label = "加入学习集" }: { bookId: string; label?: string }) {
  const { courseSummaries, go, learningSets, showToast } = useAppContext();
  const { sets } = learningSets.state;

  if (sets.length === 0) {
    return <button className="learning-course-join" type="button" onClick={() => {
      try {
        const title = courseSummaries.find((course) => course.book_id === bookId)?.title
          ?? communityBooks.find((book) => book.id === bookId)?.title
          ?? "我的学习集";
        learningSets.startDraft(courseResourceId(bookId), { suggestedName: title });
        go("upload");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "学习集无法创建", "warning");
      }
    }}><Plus size={16} aria-hidden="true" />创建学习集并加入</button>;
  }

  return (
    <label className="learning-course-join-select">
      <span>{label}</span>
      <select defaultValue="" aria-label={`${label}：选择学习集`} onChange={(event) => {
        const setId = event.target.value;
        event.target.value = "";
        if (!setId) return;
        try {
          learningSets.addCourse(setId, bookId);
          showToast("已加入学习集");
        } catch (error) {
          showToast(error instanceof Error ? error.message : "加入失败", "warning");
        }
      }}>
        <option value="" disabled>选择学习集</option>
        {sets.map((learningSet) => <option value={learningSet.id} key={learningSet.id}>{learningSet.name}</option>)}
      </select>
    </label>
  );
}

function RecommendationCard({ recommendation, bookTitle, onOpen }: { recommendation: SetRecommendation; bookTitle: string; onOpen: () => void }) {
  return (
    <button className="learning-recommendation" type="button" onClick={onOpen}>
      <span className="learning-recommendation-icon"><CalendarDays size={19} aria-hidden="true" /></span>
      <span className="learning-recommendation-body">
        <strong>{recommendation.title}</strong>
        <small>{bookTitle} · {recommendation.taskType} · 建议 {recommendation.minutes} 分钟{recommendation.originalMinutes > recommendation.minutes ? `（完整任务预计 ${recommendation.originalMinutes} 分钟）` : ""}</small>
        <em>{recommendation.reason}</em>
        {recommendation.segments.length > 1 ? <span className="learning-segments">{recommendation.segments.map((minutes, index) => <span key={index}>{minutes} 分钟</span>)}</span> : null}
      </span>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}

export function LearningSetDetailScreen() {
  const repository = useBookCourseRepository();
  const {
    courseSummaries,
    courseSummariesLoadState,
    go,
    learningSets,
    selectCourse,
    setActiveChapterId,
    showToast
  } = useAppContext();
  const { sets, activeSetId, resources, preferences } = learningSets.state;
  const learningSet = sets.find((item) => item.id === activeSetId) ?? sets[0] ?? null;
  const [plans, setPlans] = useState<Map<string, StudyPlan>>(new Map());
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [openingBookId, setOpeningBookId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const courseById = useMemo(() => new Map(courseSummaries.map((course) => [course.book_id, course])), [courseSummaries]);
  const localById = useMemo(() => new Map(resources.map((resource) => [localResourceId(resource.id), resource])), [resources]);
  const readyBookIds = learningSet?.resourceIds
    .map(bookIdFromResourceId)
    .filter((id): id is string => Boolean(id && courseById.get(id)?.status === "ready")) ?? [];
  const readyBookKey = readyBookIds.join("|");

  useEffect(() => {
    if (!learningSet || courseSummariesLoadState !== "ready") return;
    let active = true;
    setLoadingPlans(true);
    void Promise.allSettled(readyBookIds.map(async (bookId) => ({
      bookId,
      plan: await repository.getStudyPlan(bookId, runtimeConfig.defaultUserId)
    }))).then((results) => {
      if (!active) return;
      const next = new Map<string, StudyPlan>();
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") next.set(result.value.bookId, result.value.plan);
        else errors.push(courseById.get(readyBookIds[index])?.title ?? readyBookIds[index]);
      });
      setPlans(next);
      setPlanErrors(errors);
      setLoadingPlans(false);
    });
    return () => { active = false; };
  }, [courseSummariesLoadState, learningSet?.id, readyBookKey, repository]);

  if (!learningSet) {
    return <div className="learning-set-detail"><h1>暂无学习集</h1><button className="learning-home-primary" type="button" onClick={() => go("home")}>返回首页</button></div>;
  }

  const recommendationState = buildLearningSetRecommendations(learningSet, preferences, plans);
  const availableCourses = courseSummaries.filter((course) => !learningSet.resourceIds.includes(courseResourceId(course.book_id)));
  const availableLocal = resources.filter((resource) => !learningSet.resourceIds.includes(localResourceId(resource.id)));
  const preferredTools = preferredToolIds(learningSet.diagnosis);

  async function openBook(bookId: string, target: "study" | "lesson" | "assignment" | "mistakes" | "flashcards" | "notes" = "study", chapterId?: string | null) {
    setOpeningBookId(bookId);
    try {
      const opened = await selectCourse(bookId);
      if (!opened) return;
      if (chapterId) setActiveChapterId(chapterId);
      go(target);
    } finally {
      setOpeningBookId(null);
    }
  }

  function openRecommendation(recommendation: SetRecommendation) {
    const target = recommendation.kind === "practice" ? "assignment"
      : recommendation.kind === "mistakes" ? "mistakes"
        : recommendation.kind === "flashcards" ? "flashcards"
          : recommendation.kind === "notes" ? "notes" : "lesson";
    void openBook(recommendation.bookId, target, recommendation.chapterId);
  }

  async function downloadLocal(resourceId: string) {
    const resource = localById.get(resourceId);
    if (!resource) return;
    try {
      const file = await getLearningResourceFile(resource.id);
      if (!file) throw new Error("原始文件不在当前设备上，请重新添加");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = resource.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "资料读取失败", "warning");
    }
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setSavingFile(true);
    try {
      for (const file of files) await learningSets.addLocalFile(file, learningSet.id);
      showToast("资料已加入学习集");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "资料保存失败", "warning");
    } finally {
      setSavingFile(false);
    }
  }

  function addResource(resourceId: string) {
    try {
      const bookId = bookIdFromResourceId(resourceId);
      if (bookId) learningSets.addCourse(learningSet.id, bookId);
      else learningSets.addExistingResource(learningSet.id, resourceId);
      showToast("已加入学习集");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加入失败", "warning");
    }
  }

  function removeResource(resourceId: string) {
    try {
      learningSets.removeResource(learningSet.id, resourceId);
      showToast("已从学习集移出，原资料仍保留");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "移出失败", "warning");
    }
  }

  function edit() {
    try {
      learningSets.editSet(learningSet.id);
      go("learningSetSetup");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法编辑学习集", "warning");
    }
  }

  return (
    <div className="learning-set-detail">
      <header className="learning-set-detail-hero">
        <span className="learning-home-eyebrow"><Sparkles size={16} aria-hidden="true" />当前学习集</span>
        <h1>{learningSet.name}</h1>
        <p>{learningSet.resourceIds.length} 份资料 · {learningSet.diagnosis.timePattern === "fragmented" ? "碎片时间学习" : "整块时间学习"}</p>
        <div className="learning-set-detail-actions">
          <button type="button" onClick={edit}><Pencil size={16} aria-hidden="true" />调整画像与名称</button>
          <button type="button" onClick={() => setAdding((value) => !value)} aria-expanded={adding}><Plus size={16} aria-hidden="true" />添加资料</button>
        </div>
      </header>

      <section className="learning-set-section" aria-labelledby="learning-set-today-title">
        <div className="learning-set-section-header"><h2 id="learning-set-today-title">今日建议</h2><span>{recommendationState.budget} 分钟预算</span></div>
        {recommendationState.reviewDays === null ? <p className="learning-set-review-note">按你的自由复习偏好，不安排固定复盘提醒。</p> : <p className="learning-set-review-note">建议每 {recommendationState.reviewDays} 天回看一次重点与错题。</p>}
        {loadingPlans ? <p className="learning-set-state">正在整理各书的待做任务…</p> : null}
        {planErrors.length > 0 ? <p className="learning-set-state warning" role="alert">{planErrors.join("、")} 的任务暂时无法加载，其余书籍仍可继续学习。</p> : null}
        {!loadingPlans && recommendationState.recommendations.length === 0 ? <p className="learning-set-state">当前没有可推荐的待做任务。选择已就绪的教材继续学习，或添加更多书籍。</p> : null}
        <div className="learning-recommendations">
          {recommendationState.recommendations.map((recommendation) => (
            <RecommendationCard
              key={`${recommendation.bookId}:${recommendation.taskId}`}
              recommendation={recommendation}
              bookTitle={courseById.get(recommendation.bookId)?.title ?? "教材"}
              onOpen={() => openRecommendation(recommendation)}
            />
          ))}
        </div>
      </section>

      <section className="learning-set-section" aria-labelledby="learning-set-books-title">
        <div className="learning-set-section-header"><h2 id="learning-set-books-title">书籍资料</h2><span>{learningSet.resourceIds.length} 份</span></div>
        <div className="learning-set-books">
          {learningSet.resourceIds.map((resourceId) => {
            const bookId = bookIdFromResourceId(resourceId);
            const course = bookId ? courseById.get(bookId) : null;
            const communityBook = bookId ? communityBooks.find((item) => item.id === bookId) : null;
            const resource = localById.get(resourceId);
            const ready = course?.status === "ready";
            return (
              <article className="learning-set-book" key={resourceId}>
                <span className="learning-set-book-icon">{bookId ? <BookOpen size={21} aria-hidden="true" /> : <FilePlus2 size={21} aria-hidden="true" />}</span>
                <div><strong>{course?.title ?? communityBook?.title ?? resource?.name ?? "资料暂时不可用"}</strong><small>{ready ? "可开始学习" : resource ? "待整理 · 原文件已保存在本机" : "待整理 · 暂无可用课程内容"}</small></div>
                {ready && bookId ? <button type="button" disabled={openingBookId === bookId} onClick={() => void openBook(bookId)}>{openingBookId === bookId ? "打开中…" : "进入"}<ArrowRight size={16} aria-hidden="true" /></button> : null}
                {resource ? <button type="button" onClick={() => void downloadLocal(resourceId)} aria-label={`下载 ${resource.name}`}><FileDown size={18} aria-hidden="true" /></button> : null}
                <button className="learning-set-remove" type="button" onClick={() => removeResource(resourceId)} aria-label={`从学习集移出 ${course?.title ?? communityBook?.title ?? resource?.name ?? "资料"}`}><X size={18} aria-hidden="true" /></button>
              </article>
            );
          })}
        </div>
        {learningSet.resourceIds.length === 0 ? <p className="learning-set-state">这个学习集暂时没有资料，点击“添加资料”继续。</p> : null}
      </section>

      {adding ? <section className="learning-set-section learning-set-add-panel" aria-label="添加已有或本地资料">
        <div className="learning-set-section-header"><h2>添加到学习集</h2><button type="button" onClick={() => setAdding(false)} aria-label="关闭添加资料"><X size={18} /></button></div>
        {[...availableCourses.map((course) => ({ id: courseResourceId(course.book_id), name: course.title, status: course.status === "ready" ? "可学习" : "待整理" })), ...availableLocal.map((resource) => ({ id: localResourceId(resource.id), name: resource.name, status: "待整理" }))].map((item) => (
          <button className="learning-resource-option" type="button" key={item.id} onClick={() => addResource(item.id)}><BookOpen size={19} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.status}</small></span><Plus size={18} aria-hidden="true" /></button>
        ))}
        <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => void addFiles(event)} />
        <button className="learning-add-file" type="button" disabled={savingFile} onClick={() => fileInputRef.current?.click()}><FilePlus2 size={18} aria-hidden="true" />{savingFile ? "正在保存…" : "上传本地资料"}</button>
      </section> : null}

      <section className="learning-set-section" aria-label="学习画像">
        <div className="learning-set-section-header"><h2>学习画像</h2><button className="learning-set-edit-link" type="button" onClick={edit}>修改</button></div>
        <div className="learning-set-portrait-grid">
          {diagnosisQuestions.map((question) => {
            const answer = learningSet.diagnosis[question.key];
            const values: readonly string[] = Array.isArray(answer) ? answer : [answer];
            return <div key={question.key}><strong>{question.title}</strong><span>{values.map((value) => question.options.find((option) => option.value === value)?.label ?? value).join("、")}</span></div>;
          })}
        </div>
      </section>

      <section className="learning-set-section" aria-label="学习方式">
        <div className="learning-set-section-header"><h2>为你优先展示</h2></div>
        <div className="learning-set-preference-chips">
          {preferredTools.slice(0, 3).map((tool) => <span key={tool}>{tool === "assignment" ? "章节练习" : tool === "mistakes" ? "错题复盘" : tool === "flashcards" ? "闪卡回忆" : "学习笔记"}</span>)}
          {learningSet.diagnosis.aids.includes("chat") ? <span>AI 问答</span> : null}
          {learningSet.diagnosis.aids.includes("video") ? <span>优先图示与动画 · 视频素材待提供</span> : null}
        </div>
      </section>
    </div>
  );
}
