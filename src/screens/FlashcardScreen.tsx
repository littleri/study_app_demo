import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Pill
} from "../components/ui";
import { bookcourseApi } from "../api/bookcourseApi";
import { useAppContext } from "../context/AppContext";
import { useReducedMotion } from "../motion";

export function FlashcardScreen() {
  const { activeChapterId, generatedFlashcards, generatedLessons, go, openSourcePage, setGeneratedFlashcards, showToast, uploadedFile } = useAppContext();
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [buildingCards, setBuildingCards] = useState(false);
  const [flipState, setFlipState] = useState<"flipping" | "idle">("idle");
  const [nextCardMotionState, setNextCardMotionState] = useState<"entering" | "idle">("idle");
  const [nextCardMotionKey, setNextCardMotionKey] = useState("flashcard:next:initial");
  const nextCardSequenceRef = useRef(0);
  const liveCards = uploadedFile
    ? (generatedFlashcards ?? [])
        .filter((card) => !activeChapterId || card.chapter_id === activeChapterId)
        .map((card) => ({
          id: card.card_id,
          front: card.front,
          back: card.back,
          concept: card.concept,
          due: card.due === "today" ? "今天复习" : card.due,
          mastery: card.mastery,
          source: `第 ${card.page_start}-${card.page_end} 页`,
          pageStart: card.page_start,
          pageEnd: card.page_end,
          reason: `${card.reason}；依据 ${card.source_chunk_ids.slice(0, 3).join(", ")}`
        }))
    : [];
  const cards = liveCards;
  const current = cards.length > 0 ? cards[index % cards.length] : null;
  const dueCount = cards.filter((card) => card.due === "今天复习" || card.due === "today").length;
  const hasLesson = Boolean(uploadedFile && (generatedLessons ?? []).some((lesson) => !activeChapterId || lesson.chapter_id === activeChapterId));

  useEffect(() => {
    if (!reducedMotion) return;
    setFlipState("idle");
    setNextCardMotionState("idle");
  }, [reducedMotion]);

  useEffect(() => {
    const settleInterruptedMotion = () => {
      setFlipState("idle");
      setNextCardMotionState("idle");
    };
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", settleInterruptedMotion);
    window.addEventListener("orientationchange", settleInterruptedMotion);
    visualViewport?.addEventListener("resize", settleInterruptedMotion);
    return () => {
      window.removeEventListener("resize", settleInterruptedMotion);
      window.removeEventListener("orientationchange", settleInterruptedMotion);
      visualViewport?.removeEventListener("resize", settleInterruptedMotion);
    };
  }, []);

  function toggleAnswer() {
    if (!current || flipState === "flipping") return;
    setNextCardMotionState("idle");
    setShowAnswer((value) => !value);
    setFlipState(reducedMotion ? "idle" : "flipping");
  }

  function settleAnswerMotion(animationName: string, targetIsRoot: boolean) {
    if (
      targetIsRoot
      && (
        animationName === "motion-flashcard-next-in"
        || animationName === "motion-flashcard-next-tablet-in"
        || animationName === "motion-flashcard-next-short-in"
      )
    ) {
      setNextCardMotionState("idle");
      return;
    }
    if (
      animationName === "motion-flashcard-flip-to-back"
      || animationName === "motion-flashcard-flip-to-front"
      || animationName === "motion-flashcard-crossfade-in"
    ) {
      setFlipState("idle");
    }
  }

  async function buildCards() {
    if (!uploadedFile) return;
    if (!hasLesson) {
      showToast("需要先生成本章全文课程，再生成闪卡", "warning");
      return;
    }
    setBuildingCards(true);
    try {
      const cards = await bookcourseApi.buildFlashcards(uploadedFile.bookId, {
        chapter_ids: activeChapterId ? [activeChapterId] : undefined
      });
      setGeneratedFlashcards([...(generatedFlashcards ?? []).filter((card) => activeChapterId && card.chapter_id !== activeChapterId), ...cards]);
      setIndex(0);
      setShowAnswer(false);
      setFlipState("idle");
      setNextCardMotionState("idle");
      showToast("闪卡已基于结构化课程生成");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "闪卡生成失败", "warning");
    } finally {
      setBuildingCards(false);
    }
  }

  function moveNext(feedback: "again" | "known") {
    if (!current) return;
    showToast(feedback === "known" ? "已记录为掌握" : "已加入复习队列", feedback === "known" ? "success" : "info");
    setFlipState("idle");
    setShowAnswer(false);
    setIndex((value) => (value + 1) % Math.max(cards.length, 1));
    if (reducedMotion) {
      setNextCardMotionState("idle");
      return;
    }
    nextCardSequenceRef.current += 1;
    setNextCardMotionKey(`flashcard:next:${current.id}:${nextCardSequenceRef.current}`);
    setNextCardMotionState("entering");
  }

  if (!current) {
    return (
      <div className="screen-stack flashcard-screen">
        <Card className="flashcard-hero">
          <div>
            <Pill tone={hasLesson ? "orange" : "sky"}>{uploadedFile ? hasLesson ? "待生成" : "需要课程" : "需要教材"}</Pill>
            <h2>本章暂无结构化闪卡</h2>
            <p>{uploadedFile ? hasLesson ? "闪卡会根据课程目标、核心概念和原文证据生成。" : "请先回到章节学习页生成本章全文课程。" : "请先上传并解析教材，前端不会展示内置样例闪卡。"}</p>
          </div>
        </Card>
        <Button loading={buildingCards} disabled={buildingCards || !hasLesson} onClick={buildCards}>生成本章闪卡</Button>
        <Button variant="secondary" onClick={() => go(uploadedFile ? "lesson" : "upload")}>{uploadedFile ? "回到章节" : "上传教材"}</Button>
      </div>
    );
  }

  return (
    <div className="screen-stack flashcard-screen">
      <div className="flashcard-workspace">
      <Card className="flashcard-hero">
        <div>
          <Pill tone="sky">结构化复习</Pill>
          <h2>{dueCount} 张待复习闪卡</h2>
          <p>这组闪卡来自后端课程生成结果，并保留页码与 source chunk 依据。</p>
        </div>
        <div className="flashcard-progress">
          <strong>{index + 1}</strong>
          <span>/ {cards.length}</span>
        </div>
      </Card>

      <section className={`memory-card ${showAnswer ? "revealed" : ""}`} aria-label="当前闪卡">
        <div className="memory-card-head">
          <Pill tone={current.due === "今天复习" ? "orange" : "mint"}>{current.due}</Pill>
          <span>{current.mastery}% 掌握</span>
        </div>
        <div className="memory-card-source-row">
          <p className="memory-card-source">{current.source}</p>
          {uploadedFile && current.pageStart ? (
            <button
              className="inline-link"
              type="button"
              onClick={() => {
                const pageStart = current.pageStart;
                if (!uploadedFile || !pageStart) return;
                const pageEnd = current.pageEnd ?? pageStart;
                openSourcePage({
                  bookId: uploadedFile.bookId,
                  title: current.concept,
                  pageStart,
                  pageEnd
                });
              }}
            >
              查看原文页
            </button>
          ) : null}
        </div>
        <div
          className="memory-card-answer-motion"
          data-motion-flash-card={current.id}
          data-motion-flash-side={showAnswer ? "back" : "front"}
          data-motion-flash-state={flipState}
          data-motion-flash-next-key={nextCardMotionKey}
          data-motion-flash-next-state={nextCardMotionState}
          onAnimationEnd={(event) => settleAnswerMotion(event.animationName, event.target === event.currentTarget)}
        >
          <div className="memory-card-answer-3d">
            <div className="memory-card-answer-face memory-card-answer-face-front" aria-hidden={showAnswer} inert={showAnswer}>
              <h2>{current.front}</h2>
              <p>{`先在心里回答，再查看答案。概念：${current.concept}`}</p>
            </div>
            <div className="memory-card-answer-face memory-card-answer-face-back" aria-hidden={!showAnswer} inert={!showAnswer}>
              <h2>{current.back}</h2>
              <p>{current.reason}</p>
            </div>
          </div>
        </div>
        <button className="memory-reveal" type="button" aria-pressed={showAnswer} disabled={flipState === "flipping"} onClick={toggleAnswer}>
          {showAnswer ? "收起答案" : "查看答案"}
        </button>
      </section>

      <div className="flashcard-actions">
        <Button variant="secondary" onClick={() => moveNext("again")}>还不熟</Button>
        <Button onClick={() => moveNext("known")}>已记住</Button>
      </div>

      <Card className="flashcard-context-card">
        <h3>为什么现在复习？</h3>
        <p>系统根据本章全文课程、核心概念和引用证据生成闪卡，后续可以继续和错题诊断联动。</p>
        <aside className="flashcard-source-sidebar" aria-label="当前闪卡来源">
          <span>来源</span>
          <strong>{current.source}</strong>
          {uploadedFile && current.pageStart ? (
            <button
              className="inline-link"
              type="button"
              onClick={() => {
                const pageStart = current.pageStart;
                if (!uploadedFile || !pageStart) return;
                const pageEnd = current.pageEnd ?? pageStart;
                openSourcePage({
                  bookId: uploadedFile.bookId,
                  title: current.concept,
                  pageStart,
                  pageEnd
                });
              }}
            >
              查看原文页
            </button>
          ) : null}
        </aside>
        <div className="button-row">
          <Button variant="secondary" onClick={() => go("lesson")}>回到章节</Button>
          <Button variant="secondary" loading={buildingCards} disabled={buildingCards} onClick={buildCards}>重新生成</Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
