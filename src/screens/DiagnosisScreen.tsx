import type { CSSProperties } from "react";
import {
  ClipboardCheck,
  Save
} from "lucide-react";
import {
  Button,
  Card,
  Metric,
  Pill
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useDiagnosisMotion } from "../motion";
import {
  backendAssetUrl
} from "./shared";

function DiagnosisKnowledgeProgress({
  count,
  motionKey,
  motionState,
  settle
}: {
  count: number;
  motionKey: string;
  motionState: "entering" | "idle";
  settle: (key: string) => void;
}) {
  const value = count > 0 ? 1 : 0;
  const progressKey = `${motionKey}:knowledge-points`;

  return (
    <div className="diagnosis-knowledge-progress">
      <div
        className="diagnosis-knowledge-progress-track"
        role="progressbar"
        aria-label={`已返回 ${count} 个知识点`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value * 100}
      >
        <span
          className="diagnosis-knowledge-progress-fill"
          data-motion-diagnosis-progress-key={progressKey}
          data-motion-diagnosis-progress-state={motionState}
          style={{ "--diagnosis-progress-scale": value } as CSSProperties}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && event.animationName === "motion-diagnosis-progress-in") settle(motionKey);
          }}
        />
      </div>
      <span>{`已返回 ${count} 个知识点`}</span>
    </div>
  );
}

export function DiagnosisScreen() {
  const { go, latestDiagnosis, showToast, openSourcePage, openSheet, uploadedFile } = useAppContext();
  const diagnosisMotion = useDiagnosisMotion(latestDiagnosis?.submission_id ?? null);
  const liveCitation = latestDiagnosis?.review_citations[0] ?? null;
  const liveAsset = latestDiagnosis?.related_assets[0] ?? null;

  if (!latestDiagnosis) {
    return (
      <div className="screen-stack diagnosis-screen">
        <Card className="parse-empty-card">
          <ClipboardCheck size={34} aria-hidden="true" />
          <h2>还没有真实诊断结果</h2>
          <p>提交作业后，后端会用 BM25 + 向量检索 + reranker 找到教材证据，再生成诊断与复习建议。</p>
          <Button onClick={() => go("assignment")}>去提交作业</Button>
          <Button variant="secondary" onClick={() => go("lesson")}>回到章节</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="screen-stack diagnosis-screen">
      <div className="diagnosis-workspace">
        <div className="diagnosis-results-column">
      <Card
        className="diagnosis-card"
        data-motion-item="content"
        data-motion-item-key={diagnosisMotion.motionKey ?? "diagnosis:empty"}
        data-motion-item-state={diagnosisMotion.state}
        data-motion-diagnosis-key={diagnosisMotion.motionKey ?? "diagnosis:empty"}
        data-motion-diagnosis-state={diagnosisMotion.state}
      >
        <div>
          <p className="eyebrow">本题诊断</p>
          <h2><strong>{latestDiagnosis.mistake_recorded ? "需要修正" : "已完成诊断"}</strong></h2>
          <p>{latestDiagnosis.stuck_point}</p>
        </div>
        <div className="score-number">
          <strong>{latestDiagnosis.knowledge_points.length}</strong>
          <span>个卡点</span>
        </div>
      </Card>
      <div className="metric-grid diagnosis-metrics">
        <Metric label="关联知识点" value={`${latestDiagnosis.knowledge_points.length} 个`} />
        <Metric label="错题记录" value={latestDiagnosis.mistake_recorded ? "1 条" : "0 条"} />
        <Metric label="引用来源" value={`${latestDiagnosis.review_citations.length} 条`} />
      </div>
      <Card className="diagnosis-analysis-card">
        <h3>错题解析</h3>
        <p><strong>{liveCitation?.chapter_title ?? "未返回引用章节"}</strong></p>
        <p>{latestDiagnosis.result}</p>
        {liveCitation ? (
          <button className="inline-link" type="button" onClick={() => uploadedFile
            ? openSourcePage({
                bookId: uploadedFile.bookId,
                title: liveCitation.chapter_title || "诊断来源页",
                pageStart: liveCitation.page,
                pageEnd: liveCitation.page
              })
            : openSheet({
                type: "source",
                title: "诊断来源页",
                page: `第 ${liveCitation.page} 页`,
                image: backendAssetUrl(liveAsset?.image_url)
              })}>
            建议回看原文中相关描述
          </button>
        ) : (
          <p className="helper-text">本次诊断没有返回可点击引用，请检查后端检索结果。</p>
        )}
      </Card>
        </div>
        <div className="diagnosis-next-steps-column">
      <Card className="ai-feedback-card">
        <h3>AI 诊断反馈</h3>
        <div className="feedback-stack">
          <div><Pill tone="mint">检索依据</Pill><p>诊断来自后端返回的教材引用片段，优先使用精排后的高相关 chunk。</p></div>
          <div><Pill tone="orange">知识卡点</Pill><p>{latestDiagnosis.stuck_point || "后端未标注具体卡点"}</p></div>
          <div><Pill tone="sky">再试提示</Pill><p>{latestDiagnosis.hint}</p></div>
          <div><Pill tone="sky">对应知识点</Pill><p>{latestDiagnosis.knowledge_points.join("、") || "暂无"}</p></div>
          <div><Pill tone="purple">计划联动</Pill><p>{latestDiagnosis.mistake_recorded ? "该卡点已写入后端错题本，可进入错题页查看。" : "本次诊断未记录错题，可继续学习下一节。"}</p></div>
        </div>
      </Card>
      <div className="diagnosis-actions">
        <Button variant="secondary" onClick={() => go("assignment")}>重新作答</Button>
        <Button variant="secondary" onClick={() => go("flashcards")}>背错题闪卡</Button>
        <Button icon={<Save size={18} aria-hidden="true" />} onClick={() => {
          showToast("已加入错题本");
          go("mistakes");
        }}>
          加入错题本
        </Button>
      </div>
      <DiagnosisKnowledgeProgress
        count={latestDiagnosis.knowledge_points.length}
        motionKey={diagnosisMotion.motionKey ?? "diagnosis:empty"}
        motionState={diagnosisMotion.state}
        settle={diagnosisMotion.settle}
      />
        </div>
      </div>
    </div>
  );
}
