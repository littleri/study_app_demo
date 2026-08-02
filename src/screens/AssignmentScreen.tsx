import { useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  CheckCircle2,
  Upload
} from "lucide-react";
import { runtimeConfig } from "../config/runtime";
import {
  Button,
  Card,
  CitationCard
} from "../components/ui";
import { bookcourseApi } from "../api/bookcourseApi";
import { useAppContext } from "../context/AppContext";
import { MotionErrorShake, useOneShotFeedback, useReducedMotion } from "../motion";
import {
  backendAssetUrl,
  sourcePageImageUrl
} from "./shared";

export function AssignmentScreen() {
  const { activeChapterId, answer, go, openSourcePage, openSheet, parsedAssets, parsedChapters, parsedChunks, setAnswer, setLatestDiagnosis, showToast, uploadedFile } = useAppContext();
  const reducedMotion = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [answerFieldActive, setAnswerFieldActive] = useState(false);
  const [answerCheckState, setAnswerCheckState] = useState<"entering" | "idle">("idle");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const answerFeedback = useOneShotFeedback();
  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const answerPresenceRef = useRef<boolean | null>(null);
  const liveChapter = parsedChapters?.find((chapter) => chapter.chapter_id === activeChapterId) ?? parsedChapters?.[0] ?? null;
  const liveChunk = liveChapter ? parsedChunks?.find((chunk) => chunk.chapter_id === liveChapter.chapter_id) ?? null : null;
  const liveAsset = liveChapter ? parsedAssets?.find((asset) => asset.chapter_id === liveChapter.chapter_id) ?? null : null;
  const question = liveChapter
    ? `请结合原文说明“${liveChapter.source_title}”的核心内容，并写出一个你最不确定的点。`
    : "";
  const citationImage = liveAsset?.image_url
    ? backendAssetUrl(liveAsset.image_url)
    : uploadedFile && liveChunk
      ? sourcePageImageUrl(uploadedFile.bookId, liveChunk.page_start)
      : "";
  const hasAnswer = answer.trim().length > 0;

  useEffect(() => {
    const previous = answerPresenceRef.current;
    answerPresenceRef.current = hasAnswer;
    if (previous === null || !hasAnswer || reducedMotion) {
      setAnswerCheckState("idle");
      return;
    }
    if (!previous) setAnswerCheckState("entering");
  }, [hasAnswer, reducedMotion]);

  async function submit() {
    if (!uploadedFile || !liveChapter) {
      showToast("请先选择已解析课程章节，再提交作业诊断", "warning");
      return;
    }
    if (!answer.trim()) {
      setAnswerError("请先填写答案，再提交作业诊断。");
      answerFeedback.trigger();
      answerRef.current?.focus({ preventScroll: true });
      answerRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    setAnswerError(null);
    answerFeedback.settle();
    setLoading(true);
    try {
      const assignmentId = `assignment_${liveChapter.chapter_id}`;
      const submission = await bookcourseApi.submitAssignment(assignmentId, {
        user_id: runtimeConfig.defaultUserId,
        book_id: uploadedFile.bookId,
        lesson_id: `lesson_${liveChapter.chapter_id}`,
        chapter_id: liveChapter.chapter_id,
        question,
        answer
      });
      const result = await bookcourseApi.diagnoseAssignment(assignmentId, submission.submission_id);
      setLatestDiagnosis(result);
      showToast("作业已完成 RAG 诊断");
      go("diagnosis");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "作业诊断失败", "warning");
    } finally {
      setLoading(false);
    }
  }

  if (!uploadedFile || !liveChapter) {
    return (
      <div className="screen-stack assignment-screen">
        <Card className="parse-empty-card">
          <ClipboardCheck size={34} aria-hidden="true" />
          <h2>暂无可诊断的真实作业</h2>
          <p>完成教材解析并进入章节后，作业诊断会基于 BM25 + 向量检索 + reranker 找到引用片段。</p>
          <Button icon={<Upload size={18} aria-hidden="true" />} onClick={() => go("upload")}>上传教材</Button>
          <Button variant="secondary" onClick={() => go("library")}>查看课程库</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="screen-stack assignment-screen">
      <div className="assignment-workspace">
        <div className="assignment-source-column">
      <CitationCard
        title={liveChapter.source_title}
        page={liveChunk ? `第 ${liveChunk.page_start}-${liveChunk.page_end} 页` : "等待后端 chunk"}
        quote={liveChunk?.text.slice(0, 160) ?? "后端尚未返回可引用的 chunk，请先确认解析结果。"}
        image={citationImage}
        onOpen={() => liveChunk
          ? openSourcePage({
              bookId: uploadedFile.bookId,
              title: liveChapter.source_title,
              pageStart: liveChunk.page_start,
              pageEnd: liveChunk.page_end
            })
          : openSheet({ type: "source", title: "作业来源页", page: "暂无引用页", image: citationImage })}
      />
        </div>
        <div className="assignment-answer-column">
      <Card
        className="assignment-card"
        data-motion-assignment-selection={answerFieldActive ? "selected" : "idle"}
        data-motion-assignment-submit={loading ? "submitting" : "idle"}
      >
        <h2>本节理解诊断</h2>
        <p>{question}</p>
        <label className="answer-field">
          <span className="assignment-answer-label">
            你的答案
            {hasAnswer ? (
              <CheckCircle2
                className="assignment-answer-check"
                data-motion-assignment-answer-state={answerCheckState}
                size={16}
                strokeWidth={2.5}
                aria-hidden="true"
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget && event.animationName === "motion-stage-check-in") setAnswerCheckState("idle");
                }}
              />
            ) : null}
          </span>
          <MotionErrorShake
            state={answerFeedback.state}
            sequence={answerFeedback.sequence}
            onSettle={answerFeedback.settle}
            className="assignment-answer-input-shake"
          >
            <textarea
              ref={answerRef}
              value={answer}
              aria-invalid={answerError ? true : undefined}
              aria-describedby={answerError ? "assignment-answer-error" : undefined}
              onChange={(event) => {
                const nextAnswer = event.target.value;
                setAnswer(nextAnswer);
                if (answerError && nextAnswer.trim()) {
                  setAnswerError(null);
                  answerFeedback.settle();
                }
              }}
              onFocus={(event) => {
                setAnswerFieldActive(true);
                event.currentTarget.scrollIntoView({ block: "center", inline: "nearest" });
              }}
              onBlur={() => setAnswerFieldActive(false)}
              rows={5}
            />
          </MotionErrorShake>
          {answerError ? <p id="assignment-answer-error" className="field-error" role="alert">{answerError}</p> : null}
        </label>
        <p className="helper-text">提交后 AI 会诊断你的卡点，而不是直接代写答案。</p>
      </Card>
        <div className="assignment-primary-action">
          <Button data-motion-assignment-submit={loading ? "submitting" : "idle"} loading={loading} onClick={submit}>提交作业</Button>
        </div>
        </div>
      </div>
    </div>
  );
}
