import { useEffect, useState } from "react";
import { runtimeConfig } from "../config/runtime";
import type {
  MistakeRecord
} from "../types/api";
import {
  Button,
  Card,
  Pill
} from "../components/ui";
import { bookcourseApi } from "../api/bookcourseApi";
import { useAppContext } from "../context/AppContext";
import { SlidingFilterGroup, useLocalMotionItem } from "../motion";

const allMistakesFilter = "全部";

const mistakeFilterDefinitions = [
  { value: allMistakesFilter, label: allMistakesFilter, terms: [] as readonly string[] },
  { value: "meiosis", label: "减数分裂", terms: ["meiosis", "减数分裂"] },
  { value: "inheritance", label: "遗传规律", terms: ["inheritance", "genetics", "遗传规律"] }
] as const;

export function MistakeBookScreen() {
  const { go, uploadedFile } = useAppContext();
  const [filter, setFilter] = useState(allMistakesFilter);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [loadingMistakes, setLoadingMistakes] = useState(false);
  const [mistakeError, setMistakeError] = useState<string | null>(null);
  const [selectedMistakeId, setSelectedMistakeId] = useState<string | null>(null);
  const [detailMotionSelection, setDetailMotionSelection] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const filterOptions = mistakeFilterDefinitions.map(({ value, label }) => ({ value, label }));
  const activeFilter = mistakeFilterDefinitions.find((definition) => definition.value === filter) ?? mistakeFilterDefinitions[0];
  const filteredMistakes = filter === allMistakesFilter
    ? mistakes
    : mistakes.filter((mistake) => mistake.knowledge_points.some((point) => {
      const normalizedPoint = point.trim().toLocaleLowerCase();
      return activeFilter.terms.some((term) => normalizedPoint.includes(term));
    }));
  const selectedMistake = filteredMistakes.find((mistake) => mistake.mistake_id === selectedMistakeId)
    ?? filteredMistakes[0]
    ?? null;
  const hasVisibleMistakeList = Boolean(uploadedFile && !mistakeError && !loadingMistakes && filteredMistakes.length > 0);
  const detailMotion = useLocalMotionItem(
    `mistake-detail:${detailMotionSelection ?? "initial"}:${detailRevision}`,
    "content",
    { animateInitial: false }
  );

  useEffect(() => {
    if (!uploadedFile) return;
    let active = true;
    setLoadingMistakes(true);
    setMistakeError(null);
    bookcourseApi
      .getMistakes(runtimeConfig.defaultUserId, uploadedFile.bookId)
      .then((records) => {
        if (!active) return;
        setMistakes(records);
        setSelectedMistakeId((current) => current && records.some((record) => record.mistake_id === current)
          ? current
          : records[0]?.mistake_id ?? null);
      })
      .catch((err) => {
        if (active) setMistakeError(err instanceof Error ? err.message : "错题记录加载失败");
      })
      .finally(() => {
        if (active) setLoadingMistakes(false);
      });
    return () => {
      active = false;
    };
  }, [uploadedFile]);

  useEffect(() => {
    if (selectedMistakeId && !filteredMistakes.some((mistake) => mistake.mistake_id === selectedMistakeId)) {
      const nextMistakeId = filteredMistakes[0]?.mistake_id ?? null;
      setSelectedMistakeId(nextMistakeId);
      setDetailMotionSelection(nextMistakeId);
      setDetailRevision((current) => current + 1);
    }
  }, [filteredMistakes, selectedMistakeId]);

  function selectMistake(mistakeId: string) {
    if (mistakeId === selectedMistake?.mistake_id) return;
    setSelectedMistakeId(mistakeId);
    setDetailMotionSelection(mistakeId);
    setDetailRevision((current) => current + 1);
  }

  return (
    <div className="screen-stack mistake-book-screen">
      <div className="filter-row">
        <SlidingFilterGroup
          className="mistake-filter-group"
          value={filter}
          options={filterOptions}
          onChange={setFilter}
          ariaLabel="错题分类筛选"
        />
      </div>

      <div className="mistake-workspace" data-mistake-list-empty={hasVisibleMistakeList ? "false" : "true"}>
        {hasVisibleMistakeList ? (
          <div className="mistake-list" aria-label="错题列表">
            {filteredMistakes.map((mistake) => (
              <button
                className="mistake-list-item"
                data-selected={mistake.mistake_id === selectedMistake?.mistake_id ? "true" : "false"}
                type="button"
                key={mistake.mistake_id}
                aria-pressed={mistake.mistake_id === selectedMistake?.mistake_id}
                onClick={() => selectMistake(mistake.mistake_id)}
              >
                <strong>{mistake.question}</strong>
                <span>{mistake.stuck_point}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!uploadedFile ? (
          <Card {...detailMotion.attributes} key={detailMotion.motionKey} className="mistake-card mistake-state-card">
            <h3>暂无真实错题本</h3>
            <p>请先上传教材并完成一次作业诊断，后端错题记录会显示在这里。</p>
            <Button onClick={() => go("upload")}>上传教材</Button>
          </Card>
        ) : mistakeError ? (
          <Card {...detailMotion.attributes} key={detailMotion.motionKey} className="mistake-card mistake-state-card">
            <h3>错题记录加载失败</h3>
            <p>{mistakeError}</p>
            <Button onClick={() => go("assignment")}>去做一次诊断</Button>
          </Card>
        ) : loadingMistakes ? (
          <Card {...detailMotion.attributes} key={detailMotion.motionKey} className="mistake-card mistake-state-card">
            <h3>正在读取错题记录</h3>
            <p>完成一次作业诊断后，后端会把识别出的卡点写入这里。</p>
            <Button onClick={() => go("assignment")}>去做一次诊断</Button>
          </Card>
        ) : selectedMistake ? (
          <Card {...detailMotion.attributes} key={detailMotion.motionKey} className="mistake-card mistake-detail-card">
            <div className="mistake-detail-content">
              <h3>{selectedMistake.question}</h3>
              <p>你的答案：{selectedMistake.answer}</p>
              <p>错因：{selectedMistake.stuck_point}</p>
              <div className="chip-row static">
                {(selectedMistake.knowledge_points.length > 0 ? selectedMistake.knowledge_points : ["待复习"]).map((point) => (
                  <Pill tone="orange" key={point}>{point}</Pill>
                ))}
              </div>
            </div>
            <div className="mistake-detail-content">
              <div className="plan-link-card">
                <h3>已加入后续计划</h3>
                <p>{selectedMistake.citation_ids.length} 条引用来源已记录，可回到章节原文复习。</p>
              </div>
              <div className="mistake-actions">
                <div className="button-row">
                  <Button variant="secondary" onClick={() => go("assignment")}>重新练习</Button>
                  <Button variant="secondary" onClick={() => go("lesson")}>查看原文</Button>
                </div>
                <Button onClick={() => go("flashcards")}>用闪卡巩固</Button>
              </div>
            </div>
          </Card>
        ) : mistakes.length > 0 ? (
          <Card {...detailMotion.attributes} key={detailMotion.motionKey} className="mistake-card mistake-state-card">
            <h3>当前分类暂无错题</h3>
            <p>后端记录中没有匹配“{activeFilter.label}”的知识点，可切换分类查看其他错题。</p>
            <Button variant="secondary" onClick={() => setFilter(allMistakesFilter)}>查看全部错题</Button>
          </Card>
        ) : (
          <Card {...detailMotion.attributes} key={detailMotion.motionKey} className="mistake-card mistake-state-card">
            <h3>暂无后端错题记录</h3>
            <p>完成一次作业诊断后，后端会把识别出的卡点写入这里。</p>
            <Button onClick={() => go("assignment")}>去做一次诊断</Button>
          </Card>
        )}
      </div>
    </div>
  );
}
