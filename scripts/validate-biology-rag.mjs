import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BIOLOGY_RAG,
  assert,
  assertArtifactFileIntegrity,
  assertMissingChapterOneFrontmatterMetadata,
  assertRetrievalCalibrationConsistency,
  projectPath,
  readJson,
  sha256File,
  writeJsonAtomic
} from "./rag-common.mjs";
import { assertPublishedCitationSourcePageAssets } from "./citation-source-assets.mjs";

const ragDirectory = projectPath("public", "rag");
const corpusDirectory = projectPath(BIOLOGY_RAG.corpusDirectory);
const modelDirectory = projectPath(BIOLOGY_RAG.modelDirectory);
const chunksPath = resolve(corpusDirectory, "chunks.json");
const bm25Path = resolve(corpusDirectory, "bm25.json");
const pageMapPath = resolve(corpusDirectory, "page-map.json");
const vectorsPath = resolve(corpusDirectory, "vectors.f32");
const evaluationSetPath = resolve(corpusDirectory, "evaluation-set.json");
const evaluationReportPath = resolve(corpusDirectory, "evaluation-report.json");
const buildReportPath = resolve(corpusDirectory, "build-report.json");
const manifestPath = resolve(corpusDirectory, "manifest.json");
const citationSourceAssetsPath = projectPath("src", "data", "published-citation-source-page-assets.json");

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  }));
  return nested.flat();
}

function allChunkPages(chunks) {
  const pages = new Set();
  chunks.forEach((chunk) => {
    for (let page = chunk.page_start; page <= chunk.page_end; page += 1) pages.add(page);
  });
  return pages;
}

function assertSourceReferenceIsInChunk(chunk) {
  (chunk.source_entries ?? []).forEach((reference) => {
    assert(
      Number.isInteger(reference.pdf_page)
        && reference.pdf_page >= chunk.page_start
        && reference.pdf_page <= chunk.page_end,
      "Chunk " + chunk.chunk_id + " contains an OCR reference outside its page range."
    );
  });
}

assert(existsSync(manifestPath), "Corpus manifest is missing. Run npm run rag:build first.");
const [manifest, chunksDocument, bm25, pageMap, evaluationSet, evaluationReport, buildReport] = await Promise.all([
  readJson(manifestPath),
  readJson(chunksPath),
  readJson(bm25Path),
  readJson(pageMapPath),
  readJson(evaluationSetPath),
  readJson(evaluationReportPath),
  readJson(buildReportPath)
]);
const chapters = await readJson(projectPath("src", "data", "generated", "chapters.json"));
const citationSourceAssets = await readJson(citationSourceAssetsPath);
assertPublishedCitationSourcePageAssets({
  assetManifest: citationSourceAssets,
  publicDirectory: projectPath("public")
});
const chunks = chunksDocument.chunks;

assert(manifest.schema_version === BIOLOGY_RAG.schemaVersion, "Manifest schema version is not supported.");
assert(manifest.corpus_version === BIOLOGY_RAG.corpusVersion, "Manifest corpus version does not match the published corpus directory.");
assert(manifest.source.sha256 === BIOLOGY_RAG.sourcePdfSha256, "Manifest source PDF hash does not match the pinned source.");
assert(manifest.source.pdf_page_count === BIOLOGY_RAG.sourcePdfPageCount, "Manifest source page count is not 125.");
assert(manifest.source.missing_chapter_one_body === true, "Manifest must explicitly record the missing Chapter 1 body.");
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: manifest.source.missing_chapter_one_body,
  chapters,
  chunks: chunksDocument.chunks,
  manifest,
  buildReport,
  label: "Published Biology RAG"
});
assert(manifest.mineru?.content_list_sha256 === BIOLOGY_RAG.mineruContentListSha256, "Manifest content_list hash does not match the pinned MinerU export.");
assert(manifest.mineru?.middle_sha256 === BIOLOGY_RAG.mineruMiddleSha256, "Manifest middle.json hash does not match the pinned MinerU export.");
assert(buildReport.source_inputs?.source_pdf_sha256 === BIOLOGY_RAG.sourcePdfSha256, "Build report source PDF hash does not match the pinned source.");
assert(buildReport.source_inputs?.content_list_sha256 === BIOLOGY_RAG.mineruContentListSha256, "Build report content_list hash does not match the pinned MinerU export.");
assert(buildReport.source_inputs?.middle_sha256 === BIOLOGY_RAG.mineruMiddleSha256, "Build report middle.json hash does not match the pinned MinerU export.");
assert(manifest.embeddings.model_id === BIOLOGY_RAG.modelId, "Manifest model id is not the pinned BGE model.");
assert(manifest.embeddings.revision === BIOLOGY_RAG.modelRevision, "Manifest model revision is not pinned.");
assert(manifest.embeddings.dimension === BIOLOGY_RAG.modelDimension, "Manifest vector dimension is not 512.");
assert(manifest.retrieval.weights.semantic === 0.75, "Semantic retrieval weight must be 0.75.");
assert(manifest.retrieval.weights.bm25 === 0.20, "BM25 retrieval weight must be 0.20.");
assert(manifest.retrieval.weights.chapterPrior === 0.05, "Chapter prior weight must be 0.05.");
assert(Number.isFinite(manifest.retrieval.high_confidence_threshold), "A calibrated high-confidence threshold is required.");
assert(Number.isFinite(manifest.retrieval.minimum_evidence_threshold), "A calibrated minimum-evidence threshold is required.");

assert(Array.isArray(chunks) && chunks.length > 100, "Corpus chunks are missing or unexpectedly small.");
const ids = new Set();
chunks.forEach((chunk, index) => {
  assert(typeof chunk.chunk_id === "string" && chunk.chunk_id.length > 8, "A chunk has no stable id.");
  assert(!ids.has(chunk.chunk_id), "Duplicate chunk id: " + chunk.chunk_id);
  ids.add(chunk.chunk_id);
  assert(chunk.vector_position === index, "Chunk vector positions must be contiguous and stable.");
  assert(typeof chunk.chapter_id === "string" && typeof chunk.section_id === "string", "Chunk chapter metadata is missing.");
  assert(Number.isInteger(chunk.page_start) && Number.isInteger(chunk.page_end), "Chunk PDF page mapping is invalid.");
  assert(chunk.page_start >= 1 && chunk.page_end <= 125 && chunk.page_end - chunk.page_start <= 1, "Chunk page range exceeds two consecutive source PDF pages.");
  assert(typeof chunk.text === "string" && chunk.text.length > 0, "Chunk text is empty.");
  assert(chunk.text.length <= 700, "Chunk exceeds the 700-character maximum.");
  assert(chunk.text.length >= 320 || chunk.chunking_exception, "Short chunk lacks an explicit exception.");
  assert(Array.isArray(chunk.title_path) && chunk.title_path.length > 0, "Chunk title path is missing.");
  assertSourceReferenceIsInChunk(chunk);
});
assert(allChunkPages(chunks).size === 125, "Not every PDF page is represented by at least one chunk.");

assert(pageMap.source_pdf_page_count === 125 && pageMap.pages.length === 125, "Page map must cover exactly 125 source PDF pages.");
pageMap.pages.forEach((page, index) => {
  assert(page.pdf_page === index + 1, "Page map ordering is not stable.");
  assert(page.ocr_status !== "no_text_documented", "Page " + page.pdf_page + " was silently omitted.");
  assert(typeof page.content_sha256 === "string" && page.content_sha256.length === 64, "Page " + page.pdf_page + " has no content hash.");
});
assert(pageMap.pages[5].ocr_status === "recovered_from_middle_preproc", "PDF page 6 must be documented as middle.json recovery.");
assert(pageMap.pages[5].text_characters > 0, "Recovered PDF page 6 has no visible text.");

assert(bm25.schema_version === BIOLOGY_RAG.schemaVersion, "BM25 schema version is invalid.");
assert(bm25.document_count === chunks.length, "BM25 document count does not match chunks.");
assert(bm25.document_lengths.length === chunks.length, "BM25 document lengths do not match chunks.");
Object.values(bm25.postings).forEach((posting) => {
  posting.postings.forEach(([documentIndex]) => {
    assert(Number.isInteger(documentIndex) && documentIndex >= 0 && documentIndex < chunks.length, "BM25 posting references an invalid chunk.");
  });
});
const vectorStat = await stat(vectorsPath);
assert(vectorStat.size === chunks.length * 512 * Float32Array.BYTES_PER_ELEMENT, "vectors.f32 byte length is not chunks × 512 × 4.");
assert(evaluationSet.queries?.length === 50, "Evaluation corpus must contain exactly 50 queries.");
assert(evaluationReport.query_count === 50, "Evaluation report must cover exactly 50 queries.");
assert(evaluationReport.metrics.recall_at_5 >= 0.85, "Evaluation Recall@5 is below 85%.");
assert(evaluationReport.metrics.top_3_chapter_or_page_hit_rate >= 0.85, "Evaluation Top-3 chapter/page hit rate is below 85%.");
assert(evaluationReport.metrics.accepted_citation_precision >= 0.95, "Evaluation precision is below 95%.");
assert(evaluationReport.metrics.false_citation_rate <= 0.05, "Evaluation false-citation rate exceeds 5%.");
assert(evaluationReport.source_inputs?.source_pdf_sha256 === BIOLOGY_RAG.sourcePdfSha256, "Evaluation report source PDF hash does not match the pinned source.");
assert(evaluationReport.source_inputs?.content_list_sha256 === BIOLOGY_RAG.mineruContentListSha256, "Evaluation report content_list hash does not match the pinned MinerU export.");
assert(evaluationReport.source_inputs?.middle_sha256 === BIOLOGY_RAG.mineruMiddleSha256, "Evaluation report middle.json hash does not match the pinned MinerU export.");
assertRetrievalCalibrationConsistency(manifest, evaluationReport);
assert(evaluationReport.lexical_fallback?.metrics?.accepted_citation_precision >= 0.95, "BM25 fallback precision is below 95%.");
assert(evaluationReport.lexical_fallback?.metrics?.false_citation_rate <= 0.05, "BM25 fallback false-citation rate exceeds 5%.");

for (const key of ["chunks", "bm25", "page_map", "evaluation_set", "vectors", "build_report", "evaluation_report"]) {
  const artifact = manifest.artifacts?.[key];
  const absolute = projectPath("public", artifact?.path ?? "");
  assertArtifactFileIntegrity({ artifact, absolutePath: absolute, label: key });
}

const modelPath = resolve(modelDirectory, "onnx", "model_int8.onnx");
const modelManifestPath = resolve(modelDirectory, "model-manifest.json");
assert(existsSync(modelPath), "Pinned local ONNX model is absent.");
assert(sha256File(modelPath) === BIOLOGY_RAG.modelInt8Sha256, "Pinned local ONNX model hash is incorrect.");
assert(existsSync(modelManifestPath), "Pinned local model manifest is absent.");
const modelManifest = await readJson(modelManifestPath);
assert(modelManifest.model_id === BIOLOGY_RAG.modelId, "Local model manifest model id is incorrect.");
assert(modelManifest.revision === BIOLOGY_RAG.modelRevision, "Local model manifest revision is incorrect.");
assert(modelManifest.transformers_version === "3.8.1", "Local model manifest transformers version is incorrect.");
const requiredWasmFiles = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm"
];
assert(Array.isArray(modelManifest.wasm_files), "Local model manifest lacks the complete ONNX runtime file list.");
requiredWasmFiles.forEach((filename) => {
  const recorded = modelManifest.wasm_files.find((file) => file.path === filename);
  const runtimePath = projectPath(BIOLOGY_RAG.wasmDirectory, filename);
  assert(recorded, "Local model manifest is missing runtime asset " + filename + ".");
  assert(existsSync(runtimePath), "Pinned local ONNX runtime asset is absent: " + filename);
  assert(sha256File(runtimePath) === recorded.sha256, "Local ONNX runtime hash mismatch: " + filename);
});

async function publishedStaticBytes() {
  const ragFiles = await filesRecursively(ragDirectory);
  assert(!ragFiles.some((path) => path.endsWith(".tmp")), "Temporary RAG assets must not be published.");
  return (await Promise.all(ragFiles.map(async (path) => (await stat(path)).size)))
    .reduce((total, bytes) => total + bytes, 0);
}

async function writeValidatedMetadata(staticRagBytes) {
  buildReport.page_map_validation = {
    status: "passed",
    checked_pages: 125,
    recovered_page_6: true,
    chunk_page_coverage: allChunkPages(chunks).size
  };
  buildReport.static_rag_bytes = staticRagBytes;
  await writeJsonAtomic(buildReportPath, buildReport);
  manifest.artifacts.build_report = {
    ...manifest.artifacts.build_report,
    bytes: (await stat(buildReportPath)).size,
    sha256: sha256File(buildReportPath)
  };
  await writeJsonAtomic(manifestPath, manifest);
}

// The report records the size of the report and manifest themselves. A fresh
// build initially lacks those validation fields, so converge locally before
// printing the result instead of requiring a second validation command.
let totalStaticBytes = await publishedStaticBytes();
let metadataConverged = false;
for (let attempt = 0; attempt < 3; attempt += 1) {
  await writeValidatedMetadata(totalStaticBytes);
  const nextTotalStaticBytes = await publishedStaticBytes();
  if (nextTotalStaticBytes === totalStaticBytes) {
    metadataConverged = true;
    break;
  }
  totalStaticBytes = nextTotalStaticBytes;
}
assert(metadataConverged, "Static RAG metadata did not converge after three validation writes.");
assert(totalStaticBytes <= 65 * 1024 * 1024, "Static RAG package exceeds the 65 MiB release budget.");

console.log(JSON.stringify({
  status: "passed",
  chunks: chunks.length,
  pages: pageMap.pages.length,
  static_rag_bytes: totalStaticBytes,
  high_confidence_threshold: manifest.retrieval.high_confidence_threshold
}, null, 2));
