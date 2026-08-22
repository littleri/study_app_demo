import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import {
  BIOLOGY_RAG,
  assert,
  projectPath,
  readJson,
  sha256File,
  writeJsonAtomic
} from "./rag-common.mjs";

const corpusDirectory = projectPath(BIOLOGY_RAG.corpusDirectory);
const modelDirectory = projectPath(BIOLOGY_RAG.modelDirectory);
const chunksPath = resolve(corpusDirectory, "chunks.json");
const bm25Path = resolve(corpusDirectory, "bm25.json");
const vectorsPath = resolve(corpusDirectory, "vectors.f32");
const manifestPath = resolve(corpusDirectory, "manifest.json");
const evaluationSetPath = resolve(corpusDirectory, "evaluation-set.json");
const reportPath = resolve(corpusDirectory, "evaluation-report.json");

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ \t\u3000]+/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function tokenizeForBm25(value) {
  const normalized = cleanText(value).toLocaleLowerCase("zh-CN");
  const tokens = [];
  const latin = normalized.match(/[a-z0-9]+/gu) ?? [];
  tokens.push(...latin.filter((term) => term.length >= 2));
  const chineseRuns = normalized.match(/[\u3400-\u9fff]+/gu) ?? [];
  chineseRuns.forEach((run) => {
    for (let index = 0; index < run.length; index += 1) {
      tokens.push(run[index]);
      if (index + 1 < run.length) tokens.push(run.slice(index, index + 2));
    }
  });
  const stopWords = new Set(["的", "了", "和", "是", "在", "与", "及", "为", "中", "第"]);
  return tokens.filter((token) => !stopWords.has(token));
}

function bm25Scores(query, index) {
  const scores = new Float32Array(index.document_count);
  const frequencies = new Map();
  tokenizeForBm25(query).forEach((token) => frequencies.set(token, (frequencies.get(token) ?? 0) + 1));
  frequencies.forEach((queryFrequency, token) => {
    const posting = index.postings[token];
    if (!posting) return;
    posting.postings.forEach(([documentIndex, termFrequency]) => {
      const length = index.document_lengths[documentIndex];
      const denominator = termFrequency + index.k1 * (1 - index.b + index.b * length / index.average_document_length);
      scores[documentIndex] += posting.idf * ((termFrequency * (index.k1 + 1)) / denominator) * Math.min(queryFrequency, 3);
    });
  });
  return scores;
}

function semanticScore(queryVector, vectors, index, dimension) {
  let sum = 0;
  const offset = index * dimension;
  for (let valueIndex = 0; valueIndex < dimension; valueIndex += 1) {
    sum += queryVector[valueIndex] * vectors[offset + valueIndex];
  }
  return sum;
}

function pageRangeOverlaps(chunk, expectedRange) {
  return chunk.page_start <= expectedRange[1] && chunk.page_end >= expectedRange[0];
}

function isExpected(chunk, item) {
  if (!item.expected_rag) return false;
  return chunk.section_id === item.expected_chapter_id
    || (chunk.section_id.startsWith(item.expected_chapter_id) && pageRangeOverlaps(chunk, item.expected_pdf_page_range))
    || pageRangeOverlaps(chunk, item.expected_pdf_page_range);
}

function rank(queryVector, query, chunks, bm25, vectors) {
  const lexical = bm25Scores(query, bm25);
  const ranked = chunks.map((chunk, index) => {
    const semantic = semanticScore(queryVector, vectors, index, BIOLOGY_RAG.modelDimension);
    // BM25's raw score is unbounded. This monotonic saturation preserves
    // lexical evidence without allowing a repeated token to dominate the
    // 0.75 semantic component.
    const lexicalNormalized = lexical[index] / (lexical[index] + 8);
    return {
      chunk,
      semantic,
      lexical: lexical[index],
      lexical_normalized: lexicalNormalized,
      chapter_prior: 0,
      score: BIOLOGY_RAG.retrievalWeights.semantic * semantic
        + BIOLOGY_RAG.retrievalWeights.bm25 * lexicalNormalized
    };
  });
  ranked.sort((left, right) => right.score - left.score || left.chunk.chunk_id.localeCompare(right.chunk.chunk_id));
  return ranked.slice(0, 5);
}

function rankLexically(query, chunks, bm25) {
  const lexical = bm25Scores(query, bm25);
  return chunks
    .map((chunk, index) => ({ chunk, score: lexical[index] }))
    .sort((left, right) => right.score - left.score || left.chunk.chunk_id.localeCompare(right.chunk.chunk_id))
    .slice(0, 5);
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value) {
  return Number(value.toFixed(4));
}

function chooseThreshold(results, { scoreKey, correctnessKey, label }) {
  const possible = [...new Set(results.map((result) => result[scoreKey]))]
    .sort((left, right) => left - right);
  const positives = results.filter((result) => result.expected_rag);
  const negatives = results.filter((result) => !result.expected_rag);
  const candidates = possible.map((threshold) => {
    const cited = results.filter((result) => result[scoreKey] >= threshold);
    const correctCitations = cited.filter((result) => result[correctnessKey]).length;
    const falseCitations = cited.filter((result) => !result.expected_rag).length;
    const acceptedPositiveRecall = positives.filter((result) => (
      result[correctnessKey] && result[scoreKey] >= threshold
    )).length;
    return {
      threshold,
      precision: rate(correctCitations, cited.length),
      false_citation_rate: rate(falseCitations, negatives.length),
      accepted_positive_recall: rate(acceptedPositiveRecall, positives.length),
      cited_count: cited.length
    };
  });
  const acceptable = candidates.filter((candidate) => (
    candidate.cited_count > 0
      && candidate.precision >= 0.95
      && candidate.false_citation_rate <= 0.05
  ));
  assert(
    acceptable.length > 0,
    "No " + label + " threshold reached precision >= 95% and false citation <= 5%."
  );
  return acceptable.sort((left, right) => (
    right.accepted_positive_recall - left.accepted_positive_recall
    || left.threshold - right.threshold
  ))[0];
}

assert(existsSync(chunksPath), "Corpus chunks are missing. Run npm run rag:build first.");
assert(existsSync(bm25Path), "Corpus BM25 index is missing. Run npm run rag:build first.");
assert(existsSync(vectorsPath), "Corpus vector index is missing. Run npm run rag:build first.");
assert(existsSync(manifestPath), "Corpus manifest is missing. Run npm run rag:build first.");

const [{ chunks }, bm25, evaluationSet, manifest] = await Promise.all([
  readJson(chunksPath),
  readJson(bm25Path),
  readJson(evaluationSetPath),
  readJson(manifestPath)
]);
assert(manifest.source.sha256 === BIOLOGY_RAG.sourcePdfSha256, "Manifest source PDF hash is not the pinned source.");
assert(manifest.mineru?.content_list_sha256 === BIOLOGY_RAG.mineruContentListSha256, "Manifest content_list hash is not the pinned MinerU export.");
assert(manifest.mineru?.middle_sha256 === BIOLOGY_RAG.mineruMiddleSha256, "Manifest middle.json hash is not the pinned MinerU export.");
const vectorBytes = await readFile(vectorsPath);
assert(vectorBytes.byteLength === chunks.length * BIOLOGY_RAG.modelDimension * Float32Array.BYTES_PER_ELEMENT, "Vector byte length does not match chunks × 512.");
const vectors = new Float32Array(vectorBytes.buffer, vectorBytes.byteOffset, vectorBytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
assert(evaluationSet.queries.length === 50, "Evaluation set must have exactly 50 fixed queries.");

const modelFile = resolve(modelDirectory, "onnx", "model_int8.onnx");
assert(existsSync(modelFile), "Local model is missing. Run npm run rag:prepare-model first.");
assert(sha256File(modelFile) === BIOLOGY_RAG.modelInt8Sha256, "Local model hash does not match the pinned revision.");
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = modelDirectory.slice(0, modelDirectory.length - "Xenova/bge-small-zh-v1.5".length);
env.backends.onnx.wasm.numThreads = 1;
const embed = await pipeline("feature-extraction", BIOLOGY_RAG.modelId, {
  revision: BIOLOGY_RAG.modelRevision,
  dtype: "int8",
  local_files_only: true
});

const results = [];
for (const item of evaluationSet.queries) {
  const output = await embed(BIOLOGY_RAG.queryPrefix + item.query, {
    pooling: "cls",
    normalize: true,
    truncation: true,
    max_length: 512
  });
  assert(output.data.length === BIOLOGY_RAG.modelDimension, "Evaluation query did not yield a 512-dimensional vector.");
  const ranked = rank(output.data, item.query, chunks, bm25, vectors);
  const lexicalRanked = rankLexically(item.query, chunks, bm25);
  results.push({
    id: item.id,
    query: item.query,
    expected_rag: item.expected_rag,
    expected_chapter_id: item.expected_chapter_id ?? null,
    category: item.category ?? "textbook",
    top_score: ranked[0]?.score ?? 0,
    top_1_correct: Boolean(ranked[0] && isExpected(ranked[0].chunk, item)),
    top_3_correct: ranked.slice(0, 3).some((entry) => isExpected(entry.chunk, item)),
    top_5_correct: ranked.some((entry) => isExpected(entry.chunk, item)),
    lexical_top_score: lexicalRanked[0]?.score ?? 0,
    lexical_top_1_correct: Boolean(lexicalRanked[0] && isExpected(lexicalRanked[0].chunk, item)),
    top: ranked.map((entry) => ({
      chunk_id: entry.chunk.chunk_id,
      section_id: entry.chunk.section_id,
      page_start: entry.chunk.page_start,
      page_end: entry.chunk.page_end,
      semantic: round(entry.semantic),
      lexical: round(entry.lexical),
      score: round(entry.score)
    })),
    lexical_top: lexicalRanked.map((entry) => ({
      chunk_id: entry.chunk.chunk_id,
      section_id: entry.chunk.section_id,
      page_start: entry.chunk.page_start,
      page_end: entry.chunk.page_end,
      score: round(entry.score)
    }))
  });
}

const positives = results.filter((result) => result.expected_rag);
const negatives = results.filter((result) => !result.expected_rag);
const threshold = chooseThreshold(results, {
  scoreKey: "top_score",
  correctnessKey: "top_1_correct",
  label: "hybrid confidence"
});
const lexicalThreshold = chooseThreshold(results, {
  scoreKey: "lexical_top_score",
  correctnessKey: "lexical_top_1_correct",
  label: "BM25 fallback"
});
const recallAtFive = rate(positives.filter((result) => result.top_5_correct).length, positives.length);
const topThreeChapterPageHit = rate(positives.filter((result) => result.top_3_correct).length, positives.length);
const falseCitationRate = rate(
  negatives.filter((result) => result.top_score >= threshold.threshold).length,
  negatives.length
);
const acceptedPrecision = threshold.precision;

assert(recallAtFive >= 0.85, "Recall@5 is below the required 85%.");
assert(topThreeChapterPageHit >= 0.85, "Top-3 chapter/page hit rate is below the required 85%.");
assert(acceptedPrecision >= 0.95, "Accepted citation precision is below the required 95%.");
assert(falseCitationRate <= 0.05, "False citation rate exceeds the 5% cap.");
assert(lexicalThreshold.precision >= 0.95, "BM25 fallback precision is below the required 95%.");
assert(lexicalThreshold.false_citation_rate <= 0.05, "BM25 fallback false citation rate exceeds the 5% cap.");
const report = {
  schema_version: BIOLOGY_RAG.schemaVersion,
  corpus_version: BIOLOGY_RAG.corpusVersion,
  evaluated_at: new Date().toISOString(),
  source_inputs: {
    source_pdf_sha256: manifest.source.sha256,
    content_list_sha256: manifest.mineru.content_list_sha256,
    middle_sha256: manifest.mineru.middle_sha256
  },
  query_count: results.length,
  textbook_query_count: positives.length,
  non_textbook_query_count: negatives.length,
  retrieval_weights: BIOLOGY_RAG.retrievalWeights,
  selected_thresholds: {
    high_confidence: round(threshold.threshold),
    minimum_evidence: round(threshold.threshold),
    lexical_fallback: round(lexicalThreshold.threshold)
  },
  metrics: {
    recall_at_5: round(recallAtFive),
    top_3_chapter_or_page_hit_rate: round(topThreeChapterPageHit),
    accepted_citation_precision: round(acceptedPrecision),
    accepted_positive_recall: round(threshold.accepted_positive_recall),
    false_citation_rate: round(falseCitationRate)
  },
  threshold_scan: {
    requirement: "precision >= 0.95 and false citation rate <= 0.05",
    selected: {
      threshold: round(threshold.threshold),
      cited_count: threshold.cited_count
    }
  },
  lexical_fallback: {
    requirement: "BM25 top-1 precision >= 0.95 and non-textbook false citation rate <= 0.05",
    selected: {
      threshold: round(lexicalThreshold.threshold),
      cited_count: lexicalThreshold.cited_count
    },
    metrics: {
      accepted_citation_precision: round(lexicalThreshold.precision),
      accepted_positive_recall: round(lexicalThreshold.accepted_positive_recall),
      false_citation_rate: round(lexicalThreshold.false_citation_rate)
    }
  },
  results
};
await writeJsonAtomic(reportPath, report);

manifest.retrieval = {
  ...manifest.retrieval,
  high_confidence_threshold: report.selected_thresholds.high_confidence,
  minimum_evidence_threshold: report.selected_thresholds.minimum_evidence,
  lexical_fallback_threshold: report.selected_thresholds.lexical_fallback,
  calibration: {
    report_path: "rag/" + BIOLOGY_RAG.corpusVersion + "/evaluation-report.json",
    report_sha256: sha256File(reportPath),
    selected_thresholds: report.selected_thresholds,
    metrics: report.metrics,
    lexical_fallback: report.lexical_fallback,
    evaluated_query_count: report.query_count
  }
};
manifest.artifacts.evaluation_report = {
  path: "rag/" + BIOLOGY_RAG.corpusVersion + "/evaluation-report.json",
  bytes: (await stat(reportPath)).size,
  sha256: sha256File(reportPath)
};
await writeJsonAtomic(manifestPath, manifest);

console.log(JSON.stringify({
  evaluation_queries: report.query_count,
  selected_thresholds: report.selected_thresholds,
  metrics: report.metrics,
  lexical_fallback: report.lexical_fallback
}, null, 2));
