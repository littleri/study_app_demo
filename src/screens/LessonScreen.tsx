import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MessageCircle,
  NotebookPen,
  SearchCheck,
  Upload,
  WandSparkles
} from "lucide-react";
import {
  Button,
  Card,
  CitationCard,
  Pill,
  ProgressBar
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useBookCourseRepository } from "../context/BookCourseRepositoryContext";
import { CollapsibleRegion, useLocalMotionItem } from "../motion";
import {
  isLessonBuildTerminal,
  lessonBuildSummary,
  successfulLessonChapterIds
} from "../utils/lessonGeneration";
import {
  backendAssetUrl,
  chapterConcepts,
  liveBookTitle
} from "./shared";
import {
  collectLessonEvidenceSources,
  detailedCitationPageLabel,
  learnerCitationPageLabel
} from "./lessonEvidence";

export function LessonScreen() {
  const bookcourseRepository = useBookCourseRepository();
  const { activeChapterId, generatedFlashcards, generatedLessons, generatedQuizzes, go, lessonBuildJobStatus, openSourcePage, openSheet, parsedAssets, parsedChapters, parsedChunks, setGeneratedFlashcards, setGeneratedLessons, setGeneratedQuizzes, setLessonBuildJobId, setLessonBuildJobStatus, setParsedAssets, showToast, uploadedFile } = useAppContext();
  const [generatingFigure, setGeneratingFigure] = useState(false);
  const [buildingLesson, setBuildingLesson] = useState(false);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const evidenceToggleRef = useRef<HTMLButtonElement | null>(null);
  const liveChapter = parsedChapters?.find((chapter) => chapter.chapter_id === activeChapterId) ?? parsedChapters?.[0] ?? null;
  const lesson = liveChapter
    ? generatedLessons?.find((item) => item.chapter_id === liveChapter.chapter_id) ?? null
    : generatedLessons?.[0] ?? null;
  const liveChunks = liveChapter ? parsedChunks?.filter((chunk) => chunk.chapter_id === liveChapter.chapter_id) ?? [] : [];
  const sourceChunkIds = lesson?.source_chunk_ids.length ? lesson.source_chunk_ids : liveChunks.filter((chunk) => chunk.content_type !== "ocr_pending").map((chunk) => chunk.chunk_id);
  const liveAssets = liveChapter ? parsedAssets?.filter((asset) => asset.chapter_id === liveChapter.chapter_id) ?? [] : [];
  const sourceAsset = liveAssets.find((asset) => asset.source_type === "extracted") ?? null;
  const aiAsset = liveAssets.find((asset) => asset.source_type === "ai_generated") ?? null;
  const displayAsset = sourceAsset ?? aiAsset;
  const concepts = lesson?.key_concepts.length ? lesson.key_concepts : chapterConcepts(liveChapter, liveChunks[0]);
  const lessonTitle = lesson?.title ?? liveChapter?.ai_title ?? "等待章节课程";
  const sourceTitle = lesson?.source_title ?? liveChapter?.source_title ?? "等待章节";
  const pages = lesson ? `第 ${lesson.page_start}-${lesson.page_end} 页` : liveChapter ? `第 ${liveChapter.page_start}-${liveChapter.page_end} 页` : "等待页码";
  const sourceImage = backendAssetUrl(displayAsset?.image_url);
  const lessonBlocks = lesson?.blocks ?? [];
  const evidenceSources = collectLessonEvidenceSources(lessonBlocks);
  const activeCards = generatedFlashcards?.filter((card) => !liveChapter || card.chapter_id === liveChapter.chapter_id) ?? [];
  const activeQuizzes = generatedQuizzes?.filter((quiz) => !liveChapter || quiz.chapter_id === liveChapter.chapter_id) ?? [];
  const lessonMotionKey = `${uploadedFile?.bookId ?? "empty"}:${liveChapter?.chapter_id ?? "empty"}:${lesson?.lesson_id ?? "pending"}`;
  const evidenceRegionId = `lesson-evidence-${lessonMotionKey}`;
  const evidenceToggleId = `${evidenceRegionId}-toggle`;
  const evidenceLessonKeyRef = useRef(lessonMotionKey);
  const emptyMotion = useLocalMotionItem(`lesson:${lessonMotionKey}:empty`);
  const titleMotion = useLocalMotionItem(`lesson:${lessonMotionKey}:title`);
  const primaryMotion = useLocalMotionItem(`lesson:${lessonMotionKey}:primary`);
  const conceptsMotion = useLocalMotionItem(`lesson:${lessonMotionKey}:concepts`);

  useEffect(() => {
    if (evidenceLessonKeyRef.current === lessonMotionKey) return;
    evidenceLessonKeyRef.current = lessonMotionKey;
    setEvidenceExpanded(false);
  }, [lessonMotionKey]);

  if (!uploadedFile || !liveChapter) {
    return (
      <div className="screen-stack lesson-screen">
        <Card {...emptyMotion.attributes} className="parse-empty-card">
          <BookOpen size={34} aria-hidden="true" />
          <h2>没有可学习的章节</h2>
          <p>请先上传教材并完成目录解析，章节学习页只展示真实后端生成的课程内容。</p>
          <Button icon={<Upload size={18} aria-hidden="true" />} onClick={() => go("upload")}>上传教材</Button>
          <Button variant="secondary" onClick={() => go("library")}>查看课程库</Button>
        </Card>
      </div>
    );
  }

  const activeUploadedFile = uploadedFile;
  const activeLiveChapter = liveChapter;

  function openPrimaryEvidence() {
    const primaryEvidence = evidenceSources[0];
    openSourcePage({
      bookId: activeUploadedFile.bookId,
      title: primaryEvidence?.blockTitles[0] ?? sourceTitle,
      pageStart: primaryEvidence?.citation.page_start ?? activeLiveChapter.page_start,
      pageEnd: primaryEvidence?.citation.page_end ?? activeLiveChapter.page_end
    });
  }

  function openCitationSource(blockTitle: string, citation: typeof evidenceSources[number]["citation"]) {
    if (uploadedFile) {
      openSourcePage({
        bookId: uploadedFile.bookId,
        title: blockTitle,
        pageStart: citation.page_start,
        pageEnd: citation.page_end
      });
      return;
    }
    openSheet({
      type: "source",
      title: blockTitle,
      page: detailedCitationPageLabel(citation),
      image: sourceImage
    });
  }

  async function buildCurrentLesson() {
    if (!uploadedFile || !liveChapter) {
      showToast("需要先选择已解析章节", "warning");
      return;
    }
    setBuildingLesson(true);
    try {
      const job = await bookcourseRepository.buildLessons(uploadedFile.bookId, { chapter_ids: [liveChapter.chapter_id], force: true });
      setLessonBuildJobId(job.job_id);
      setLessonBuildJobStatus(job);
      let finalJob = job;
      for (let attempt = 0; attempt < 50 && !isLessonBuildTerminal(finalJob.status); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        finalJob = await bookcourseRepository.getLessonJob(job.job_id);
        setLessonBuildJobStatus(finalJob);
      }
      if (finalJob.status === "failed") throw new Error(finalJob.error ?? "本章课程生成失败");
      const generatedChapterIds = successfulLessonChapterIds(finalJob);
      if (generatedChapterIds.length === 0) throw new Error("本次没有章节成功生成课程");
      const nextLessons = await bookcourseRepository.getLessons(uploadedFile.bookId);
      const [cards, quizzes] = await Promise.all([
        bookcourseRepository.buildFlashcards(uploadedFile.bookId, { chapter_ids: generatedChapterIds }),
        bookcourseRepository.buildQuizzes(uploadedFile.bookId, { chapter_ids: generatedChapterIds })
      ]);
      const affectedChapterIds = new Set(finalJob.chapter_results.map((item) => item.chapter_id));
      setGeneratedLessons(nextLessons);
      setGeneratedFlashcards([...(generatedFlashcards ?? []).filter((card) => !affectedChapterIds.has(card.chapter_id)), ...cards]);
      setGeneratedQuizzes([...(generatedQuizzes ?? []).filter((quiz) => !affectedChapterIds.has(quiz.chapter_id)), ...quizzes]);
      const summary = lessonBuildSummary(finalJob);
      showToast(summary.message, summary.warningCount > 0 ? "warning" : "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "本章课程生成失败", "warning");
    } finally {
      setBuildingLesson(false);
    }
  }

  async function generateFigure() {
    if (!uploadedFile || !liveChapter || sourceChunkIds.length === 0) {
      showToast("需要先完成课程生成并取得 source chunks", "warning");
      return;
    }
    setGeneratingFigure(true);
    try {
      const result = await bookcourseRepository.generateAsset({
        book_id: uploadedFile.bookId,
        lesson_id: lesson?.lesson_id ?? `lesson_${liveChapter.chapter_id}`,
        chapter_id: liveChapter.chapter_id,
        concepts,
        style: "clean_educational_diagram",
        purpose: `为 ${sourceTitle} 生成辅助理解示意图`,
        source_chunk_ids: sourceChunkIds.slice(0, 5)
      });
      if (result.asset) {
        setParsedAssets([...(parsedAssets ?? []), result.asset]);
        showToast("AI 生成示意图已保存");
      } else {
        showToast("AI 生图任务已提交，稍后刷新查看", "info");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI 生图失败", "warning");
    } finally {
      setGeneratingFigure(false);
    }
  }

  return (
    <div className="screen-stack lesson-screen">
      <div className="lesson-layout">
      <main className="lesson-reading-column">
      <Card {...titleMotion.attributes} className="lesson-title-card">
        <Pill tone={lesson ? "mint" : "orange"}>{lesson ? "全文课程" : "待生成"}</Pill>
        <h2>{lessonTitle}</h2>
        <p>来源：{liveBookTitle(uploadedFile)} / {pages}</p>
        <ProgressBar
          value={lessonBuildJobStatus && lessonBuildJobStatus.status !== "done" ? lessonBuildJobStatus.progress : lesson?.confidence ?? liveChapter?.confidence ?? 0}
          label={lesson ? `课程可信度 ${lesson.confidence}%` : `可用全文片段 ${sourceChunkIds.length} 个`}
        />
        {!lesson ? (
          <Button loading={buildingLesson} disabled={buildingLesson || !uploadedFile} onClick={buildCurrentLesson}>
            基于全文生成本章课程
          </Button>
        ) : null}
      </Card>

      {lesson ? (
        <Card {...primaryMotion.attributes} className="ai-explain-card lesson-objectives-card">
          <div className="lesson-card-title">
            <SearchCheck size={18} aria-hidden="true" />
            <h3>学习目标</h3>
          </div>
          <ul>
            {lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}
          </ul>
          <p>{lesson.summary}</p>
        </Card>
      ) : (
        <Card {...primaryMotion.attributes} className="source-fragment-card">
          <div className="lesson-card-title">
            <FileText size={18} aria-hidden="true" />
            <h3>全文依据状态</h3>
          </div>
          <p>后端已经为本章准备了 {sourceChunkIds.length} 个可用 RAG/source chunks。点击上方按钮后，会把这些片段聚合成学习目标、讲解、易错点、闪卡和小测。</p>
        </Card>
      )}

      {lessonBlocks.map((block) => (
        <Card className="ai-explain-card" key={block.block_id}>
          <div className="lesson-card-title">
            <Brain size={18} aria-hidden="true" />
            <h3>{block.title}</h3>
          </div>
          <p>{block.content}</p>
          {block.citations[0] ? (
            <button
              className="lesson-source-link"
              type="button"
              onClick={() => openCitationSource(block.title, block.citations[0])}
            >
              来自{learnerCitationPageLabel(block.citations[0])}
            </button>
          ) : null}
        </Card>
      ))}

      <Card className="source-fragment-card lesson-evidence-summary">
        <div className="lesson-card-title">
          <FileText size={18} aria-hidden="true" />
          <h3>本节来源</h3>
        </div>
        {evidenceSources.length > 0 ? (
          <>
            <button
              ref={evidenceToggleRef}
              className="lesson-evidence-toggle"
              type="button"
              id={evidenceToggleId}
              aria-expanded={evidenceExpanded}
              aria-controls={evidenceRegionId}
              onClick={() => setEvidenceExpanded((current) => !current)}
            >
              <span>本节 {evidenceSources.length} 个来源</span>
              <span aria-hidden="true">{evidenceExpanded ? "收起" : "展开"}</span>
            </button>
            <CollapsibleRegion
              expanded={evidenceExpanded}
              id={evidenceRegionId}
              labelledBy={evidenceToggleId}
              focusFallbackRef={evidenceToggleRef}
              className="lesson-evidence-region"
            >
              <div className="lesson-evidence-list">
                {evidenceSources.map((item) => (
                  <button
                    className="lesson-evidence-source"
                    type="button"
                    key={item.key}
                    onClick={() => openCitationSource(item.blockTitles[0] ?? sourceTitle, item.citation)}
                  >
                    <strong>{item.blockTitles.join("、")}</strong>
                    <span>{detailedCitationPageLabel(item.citation)}</span>
                  </button>
                ))}
              </div>
            </CollapsibleRegion>
          </>
        ) : (
          <p>生成课程后会在这里显示可点击的教材页来源。</p>
        )}
      </Card>

      {displayAsset ? (
        <CitationCard
          title={displayAsset.caption}
          page={displayAsset.page ? `第 ${displayAsset.page} 页` : pages}
          quote={displayAsset.source_type === "extracted" ? "原文件抽取插图" : "AI 生成示意图"}
          image={sourceImage}
          imageMotion
          onOpen={() => uploadedFile && displayAsset.page
            ? openSourcePage({
                bookId: uploadedFile.bookId,
                title: displayAsset.caption,
                pageStart: displayAsset.page,
                pageEnd: displayAsset.page
              })
            : openSheet({ type: "source", title: displayAsset.caption, page: displayAsset.page ? `第 ${displayAsset.page} 页` : pages, image: sourceImage })}
        />
      ) : null}

      <Card {...conceptsMotion.attributes} className="concept-flash-card">
        <div className="lesson-card-title">
          <NotebookPen size={18} aria-hidden="true" />
          <h3>核心概念</h3>
          <button className="inline-link" type="button" onClick={() => go("flashcards")}>练本节闪卡</button>
        </div>
        <div className="concept-card-grid">
          {concepts.slice(0, 6).map((concept) => (
            <button type="button" key={concept} onClick={() => openSheet({ type: "note", concept })}>
              <strong>{concept}</strong>
              <small>核心概念</small>
            </button>
          ))}
        </div>
        <p className="helper-text">{activeCards.length} 张闪卡 · {activeQuizzes.length} 道小测题</p>
      </Card>

      <Card className="ai-explain-card">
        <div className="lesson-card-title">
          <WandSparkles size={18} aria-hidden="true" />
          <h3>课程插图</h3>
        </div>
        <p>{sourceAsset ? "本章优先使用原文件抽取插图；AI 生图只作为辅助示意。" : "本章暂未找到稳定的原文件插图，可以基于 source chunks 生成辅助示意图。"}</p>
        <Button variant="secondary" loading={generatingFigure} disabled={generatingFigure || sourceChunkIds.length === 0} onClick={generateFigure}>
          {aiAsset ? "重新生成辅助示意图" : "AI 生成辅助示意图"}
        </Button>
      </Card>

      </main>
      <aside className="lesson-learning-tools" aria-label="学习工具栏">
        <div className="lesson-tools-heading">
          <strong>学习工具</strong>
          <span>随时打开，不离开当前章节</span>
        </div>
        <Button variant="secondary" icon={<FileText size={18} aria-hidden="true" />} onClick={openPrimaryEvidence}>查看引用</Button>
        <div className="lesson-action-grid">
        <Button variant="secondary" icon={<MessageCircle size={18} aria-hidden="true" />} onClick={() => openSheet({ type: "chat" })}>问 AI</Button>
        <Button variant="secondary" icon={<BookOpen size={18} aria-hidden="true" />} onClick={() => go("flashcards")}>背闪卡</Button>
        <Button variant="secondary" icon={<ClipboardCheck size={18} aria-hidden="true" />} onClick={() => go("assignment")}>做练习</Button>
        </div>
        <div className="lesson-bottom-actions">
        <Button variant="secondary" onClick={() => go("study")}>返回学习目录</Button>
        <Button icon={<CheckCircle2 size={18} aria-hidden="true" />} onClick={() => go("report")}>完成章节</Button>
        </div>
      </aside>
      </div>
    </div>
  );
}
