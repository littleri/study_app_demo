import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const BIOLOGY_RAG = Object.freeze({
  bookId: "book_biology_2",
  corpusVersion: "biology-required-2-rag-v1",
  schemaVersion: 1,
  missingChapterOneBody: true,
  sourcePdfSha256: "d35ca6844f22e87bef5cd3deb286c7965f386ba13924a8195eddaefa41db533a",
  sourcePdfPageCount: 125,
  mineruContentListSha256: "3f448ccbf6e3be4bf73768604d4973caf070320ed930a94d78e5bebd2314e55d",
  mineruMiddleSha256: "4137d7d7e993b551dbb08acbaae5e8ba55d06be2af87438389ef66cbc413245f",
  modelId: "Xenova/bge-small-zh-v1.5",
  modelRevision: "75c43b069aac4d136ba6bc1122f995fedcfd2781",
  modelInt8Sha256: "b9837c19ce154ff0726d398ee77abbc03a7faf0476c6f93016c84e531be7ebb5",
  modelDimension: 512,
  queryPrefix: "为这个句子生成表示以用于检索相关文章：",
  retrievalWeights: {
    semantic: 0.75,
    bm25: 0.20,
    chapterPrior: 0.05
  },
  defaultSourcePdf: "C:\\Users\\asd25\\Desktop\\示范文件\\人教版高中生物必修2遗传与进化 (人民教育出版社, 课程教材研究所, 生物课程教材研究开发中心.pdf",
  defaultMineruDirectory: "D:\\code\\MinerU\\output\\028dd1ac-f681-4a80-b2cd-9ec209c8ed37\\人教版高中生物必修2遗传与进化_人民教育出版社_课程教材研究所_生物课程教材研究开发中心_z-library.sk_1lib.sk_z-lib.sk_\\auto",
  publicDirectory: "public/rag",
  corpusDirectory: "public/rag/biology-required-2-rag-v1",
  modelDirectory: "public/rag/models/Xenova/bge-small-zh-v1.5",
  wasmDirectory: "public/rag/runtime/wasm",
  tokenizerVersion: "zh-bigram-and-latin-v1"
});

// The supplied PDF starts with cover, publication, preface, and contents
// material. It does not contain the body of Chapter 1, so these pages must
// never be represented as a synthetic Chapter 1 merely to make the directory
// look consecutive.
export const BIOLOGY_FRONTMATTER = Object.freeze({
  chapterId: "frontmatter",
  title: "教材封面、前言与目录",
  pageStart: 1,
  pageEnd: 9
});

export function projectPath(...parts) {
  return resolve(projectRoot, ...parts);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

function hasLegacyChapterOneName(value) {
  return /(?:第\s*1\s*章|遗传因子的发现)/u.test(String(value ?? ""));
}

function assertFrontmatterDescriptor(value, label) {
  assert(value && typeof value === "object", `${label} frontmatter metadata is missing.`);
  assert(value.chapter_id === BIOLOGY_FRONTMATTER.chapterId, `${label} frontmatter chapter_id is invalid.`);
  assert(value.title === BIOLOGY_FRONTMATTER.title, `${label} frontmatter title is invalid.`);
  assert(value.pdf_page_start === BIOLOGY_FRONTMATTER.pageStart, `${label} frontmatter start page is invalid.`);
  assert(value.pdf_page_end === BIOLOGY_FRONTMATTER.pageEnd, `${label} frontmatter end page is invalid.`);
  assert(!hasLegacyChapterOneName(value.title), `${label} frontmatter must not be named as Chapter 1.`);
}

/**
 * Make the missing-Chapter-1 boundary executable publication policy. This is
 * deliberately shared by source, demo, build, and release validation so a
 * title change cannot make generated fixtures and the static corpus drift.
 */
export function assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody,
  chapters,
  chunks,
  manifest,
  buildReport,
  label = "Biology RAG"
}) {
  if (missingChapterOneBody !== true) return;

  assert(Array.isArray(chapters), `${label} chapter metadata is missing.`);
  const frontmatter = chapters.find((chapter) => chapter?.chapter_id === BIOLOGY_FRONTMATTER.chapterId);
  assert(frontmatter, `${label} frontmatter directory node is missing.`);
  assert(frontmatter.level === 1, `${label} frontmatter must remain a top-level directory node.`);
  assert(frontmatter.source_title === BIOLOGY_FRONTMATTER.title, `${label} frontmatter source title is invalid.`);
  assert(frontmatter.ai_title === BIOLOGY_FRONTMATTER.title, `${label} frontmatter AI title is invalid.`);
  assert(frontmatter.page_start === BIOLOGY_FRONTMATTER.pageStart, `${label} frontmatter start page is invalid.`);
  assert(frontmatter.page_end === BIOLOGY_FRONTMATTER.pageEnd, `${label} frontmatter end page is invalid.`);
  assert(!hasLegacyChapterOneName(frontmatter.source_title), `${label} frontmatter must not be named as Chapter 1.`);

  const rootsCoveringFrontmatter = chapters.filter((chapter) => (
    chapter?.level === 1
    && Number.isInteger(chapter.page_start)
    && Number.isInteger(chapter.page_end)
    && chapter.page_start <= BIOLOGY_FRONTMATTER.pageEnd
    && chapter.page_end >= BIOLOGY_FRONTMATTER.pageStart
  ));
  assert(
    rootsCoveringFrontmatter.length === 1 && rootsCoveringFrontmatter[0]?.chapter_id === BIOLOGY_FRONTMATTER.chapterId,
    `${label} PDF pages 1-9 must map only to the frontmatter node.`
  );

  if (Array.isArray(chunks)) {
    const frontmatterChunks = chunks.filter((chunk) => (
      Number.isInteger(chunk?.page_start)
      && Number.isInteger(chunk?.page_end)
      && chunk.page_start <= BIOLOGY_FRONTMATTER.pageEnd
      && chunk.page_end >= BIOLOGY_FRONTMATTER.pageStart
    ));
    assert(frontmatterChunks.length > 0, `${label} corpus has no chunks for frontmatter PDF pages.`);
    frontmatterChunks.forEach((chunk) => {
      assert(chunk.chapter_id === BIOLOGY_FRONTMATTER.chapterId, `${label} frontmatter chunk is mapped to a non-frontmatter chapter.`);
      assert(chunk.section_id === BIOLOGY_FRONTMATTER.chapterId, `${label} frontmatter chunk section is invalid.`);
      assert(Array.isArray(chunk.title_path) && chunk.title_path.includes(BIOLOGY_FRONTMATTER.title), `${label} frontmatter chunk title path is invalid.`);
      assert(!chunk.title_path.some((title) => hasLegacyChapterOneName(title)), `${label} frontmatter chunk title path must not contain Chapter 1.`);
    });
  }

  if (manifest) {
    assert(manifest.source?.missing_chapter_one_body === true, `${label} manifest must record the missing Chapter 1 body.`);
    assertFrontmatterDescriptor(manifest.source?.frontmatter, `${label} manifest`);
  }
  if (buildReport) {
    assert(buildReport.missing_chapter_one_body === true, `${label} build report must record the missing Chapter 1 body.`);
    assertFrontmatterDescriptor(buildReport.frontmatter, `${label} build report`);
  }
}

/**
 * Reject a structurally plausible but different OCR export before either the
 * source validator or the corpus builder reads it. The caller may supply a
 * test-specific trusted-hash bundle so mutation tests never need the private
 * textbook files.
 */
export function assertPinnedRagSourceHashes({
  sourcePdf,
  contentListPath,
  middlePath,
  trusted = BIOLOGY_RAG
}) {
  const actual = {
    source_pdf: sha256File(sourcePdf),
    content_list: sha256File(contentListPath),
    middle: sha256File(middlePath)
  };
  assert(actual.source_pdf === trusted.sourcePdfSha256, "Source PDF SHA-256 does not match the pinned source.");
  assert(actual.content_list === trusted.mineruContentListSha256, "MinerU content_list SHA-256 does not match the pinned source export.");
  assert(actual.middle === trusted.mineruMiddleSha256, "MinerU middle.json SHA-256 does not match the pinned source export.");
  return actual;
}

/**
 * Thresholds are publication-critical data, not advisory display metadata.
 * The evaluator is the only producer of the chosen values, so a published
 * manifest must repeat them exactly (within a deliberately tiny JSON-number
 * tolerance) and must point at the same evaluated report artifact.
 */
export function assertRetrievalCalibrationConsistency(manifest, evaluationReport, tolerance = 1e-9) {
  const manifestThresholds = manifest?.retrieval;
  const reportThresholds = evaluationReport?.selected_thresholds;
  const calibrationThresholds = manifestThresholds?.calibration?.selected_thresholds;
  const mappings = [
    ["high_confidence", manifestThresholds?.high_confidence_threshold],
    ["minimum_evidence", manifestThresholds?.minimum_evidence_threshold],
    ["lexical_fallback", manifestThresholds?.lexical_fallback_threshold]
  ];

  mappings.forEach(([key, manifestValue]) => {
    const reportValue = reportThresholds?.[key];
    const calibrationValue = calibrationThresholds?.[key];
    assert(Number.isFinite(manifestValue), `Manifest ${key} threshold is missing or invalid.`);
    assert(Number.isFinite(reportValue), `Evaluation report ${key} threshold is missing or invalid.`);
    assert(
      Math.abs(manifestValue - reportValue) <= tolerance,
      `Manifest ${key} threshold does not match evaluation-report.selected_thresholds.${key}.`
    );
    assert(Number.isFinite(calibrationValue), `Manifest calibration ${key} threshold is missing or invalid.`);
    assert(
      Math.abs(calibrationValue - reportValue) <= tolerance,
      `Manifest calibration ${key} threshold does not match evaluation-report.selected_thresholds.${key}.`
    );
  });

  const lexicalSelected = evaluationReport?.lexical_fallback?.selected?.threshold;
  assert(Number.isFinite(lexicalSelected), "Evaluation report lexical fallback selected threshold is missing or invalid.");
  assert(
    Math.abs(reportThresholds.lexical_fallback - lexicalSelected) <= tolerance,
    "Evaluation report lexical fallback threshold does not match lexical_fallback.selected.threshold."
  );

  const reportArtifactHash = manifest?.artifacts?.evaluation_report?.sha256;
  const calibrationReportHash = manifestThresholds?.calibration?.report_sha256;
  assert(typeof reportArtifactHash === "string" && reportArtifactHash.length === 64, "Manifest evaluation report artifact hash is missing.");
  assert(
    calibrationReportHash === reportArtifactHash,
    "Manifest calibration report hash does not match the evaluation report artifact hash."
  );
}

/**
 * Keep artifact hashing in one place so tests can prove that a report file
 * modified after evaluation is rejected rather than merely re-parsed.
 */
export function assertArtifactFileIntegrity({ artifact, absolutePath, label }) {
  assert(artifact, `Manifest is missing ${label} artifact metadata.`);
  assert(existsSync(absolutePath), `Artifact does not exist: ${artifact.path ?? label}`);
  const details = readFileSync(absolutePath);
  assert(details.byteLength === artifact.bytes, `Artifact byte size does not match manifest for ${label}.`);
  assert(sha256(details) === artifact.sha256, `Artifact SHA-256 does not match manifest for ${label}.`);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJsonAtomic(path, value) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function findMineruFile(directory, expression) {
  const match = readdirSync(directory, { withFileTypes: true })
    .find((entry) => entry.isFile() && expression.test(entry.name));
  if (!match) throw new Error(`MinerU output is missing ${expression} under ${directory}`);
  return resolve(directory, match.name);
}

export function pathExists(path) {
  return existsSync(path);
}
