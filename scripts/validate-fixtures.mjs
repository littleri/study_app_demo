import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BIOLOGY_FRONTMATTER,
  BIOLOGY_RAG,
  assertMissingChapterOneFrontmatterMetadata
} from "./rag-common.mjs";

const root = resolve(import.meta.dirname, "..");
const dir = join(root, "src", "data", "generated");
const curatedPath = join(root, "src", "data", "seed", "curated-content.json");
const chapterOneSupplementPath = join(root, "src", "data", "seed", "chapter-one-supplement.json");
const expandedLessonAssetsPath = join(root, "src", "data", "seed", "expanded-lesson-assets.json");
const ragChunksPath = join(root, "public", "rag", "biology-required-2-rag-v1", "chunks.json");
const latestPath = join(root, ".cache", "mineru", "latest.json");
const required = ["demo-state.json", "book.json", "chapters.json", "lessons.json", "quiz.json", "flashcards.json", "ai-responses.json"];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(name) {
  const path = join(dir, name);
  if (!existsSync(path)) fail(`Missing fixture: ${name}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonHash(value) {
  return sha256(JSON.stringify(value));
}

for (const name of required) read(name);

const state = read("demo-state.json");
const book = read("book.json");
const chapters = read("chapters.json");
const curated = JSON.parse(readFileSync(curatedPath, "utf8"));
const chapterOneSupplement = JSON.parse(readFileSync(chapterOneSupplementPath, "utf8"));
const expandedLessonAssets = JSON.parse(readFileSync(expandedLessonAssetsPath, "utf8"));
const ragChunks = JSON.parse(readFileSync(ragChunksPath, "utf8")).chunks;
const ragChunkById = new Map(ragChunks.map((chunk) => [chunk.chunk_id, chunk]));
const lessons = read("lessons.json");
const quizzes = read("quiz.json");
const flashcards = read("flashcards.json");
const replies = read("ai-responses.json");
const practiceSourceById = new Map([...ragChunks, ...state.chunks].map((chunk) => [chunk.chunk_id, chunk]));
// The checked-in demo must remain locally verifiable without an ignored
// MinerU cache. When a developer has a raw run available we retain the much
// stricter provenance checks below; otherwise validate the published fixture
// contract and report that raw-cache-only checks were intentionally skipped.
assert(state.provenance?.parser === "mineru", "Fixtures must declare MinerU as parser.");
assert(book.id === "book_biology_2" && book.pages === 125, "Unexpected book metadata.");
assert(Array.isArray(chapters) && chapters.length >= 3, "Chapter fixture is too small.");
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters: curated.chapters,
  label: "Curated demo content seed"
});
const generatedFrontmatter = chapters.find((chapter) => chapter.chapter_id === BIOLOGY_FRONTMATTER.chapterId);
const curatedFrontmatter = curated.chapters.find((chapter) => chapter.chapter_id === BIOLOGY_FRONTMATTER.chapterId);
assert(
  JSON.stringify(generatedFrontmatter) === JSON.stringify(curatedFrontmatter),
  "Generated frontmatter metadata drifted from the curated seed. Run npm run demo:content."
);
assert(
  chapters.filter((chapter) => chapter.level === 1 && chapter.chapter_id !== BIOLOGY_FRONTMATTER.chapterId).length === book.chapterCount,
  "Generated book chapter count must exclude the frontmatter node."
);
assert(book.chapterCount === curated.book.chapterCount + 1, "Generated book must include the explicit Chapter 1 supplement.");
assert(book.sectionCount === curated.book.sectionCount + 2, "Generated book must include both Chapter 1 sections.");
assert(chapterOneSupplement.every((chapter) => chapter.page_start === 0 && chapter.page_end === 0), "Chapter 1 supplement must preserve missing-source PDF semantics.");
assert(chapterOneSupplement.every((chapter) => chapters.some((generated) => JSON.stringify(generated) === JSON.stringify(chapter))), "Generated directory is missing Chapter 1 supplement metadata.");
const expectedLessonChapterIds = new Set(["c1s1", "c1s2", "c2s1", "c2s2", "c2s3", "c3s1", "c3s2", "c3s3", "c3s4", "c4s1", "c4s2", "c4s3", "c5s1", "c5s2", "c5s3"]);
assert(Array.isArray(lessons) && lessons.length === expectedLessonChapterIds.size, "Chapter 1–5 lesson library must contain exactly fifteen lessons.");
assert(lessons.every((lesson) => expectedLessonChapterIds.has(lesson.chapter_id)), "Lesson library contains an unexpected section outside the Chapter 1–5 scope.");
assert(new Set(lessons.map((lesson) => lesson.chapter_id)).size === expectedLessonChapterIds.size, "Lesson library contains duplicate or missing section lessons.");
assert(lessons.some((lesson) => lesson.lesson_id === "lesson_meiosis" && lesson.chapter_id === "c2s1"), "Core meiosis lesson is missing.");
for (const lesson of lessons) {
  assert(lesson.objectives?.length === 3 && lesson.blocks?.length === 4, `${lesson.lesson_id}: lesson must render as one introduction plus four content pages.`);
  assert(lesson.blocks.every((block) => String(block.content).split(/\n\s*\n/u).filter(Boolean).length === 3), `${lesson.lesson_id}: each block must contain exactly three paragraphs.`);
}
for (const lesson of lessons.filter((item) => item.chapter_id.startsWith("c1"))) {
  assert(lesson.page_start === 0 && lesson.page_end === 0, `${lesson.lesson_id}: source-missing PDF range must remain 0–0.`);
  assert(lesson.source_chunk_ids.length === 0 && lesson.blocks.every((block) => block.citations.length === 0 && block.source_chunk_ids.length === 0), `${lesson.lesson_id}: Chapter 1 supplement must not fabricate textbook citations.`);
}
const aiAssets = state.assets.filter((asset) => asset.source_type === "ai_generated");
assert(aiAssets.length === 9 + expandedLessonAssets.length, "Expanded ImageGen asset count is incomplete.");
for (const assetSeed of expandedLessonAssets) {
  const asset = aiAssets.find((candidate) => candidate.asset_id === assetSeed.asset_id);
  assert(asset?.image_url === assetSeed.image_url && asset?.metadata?.role === "lesson_overview", `Expanded overview asset ${assetSeed.asset_id} is missing or malformed.`);
  assert(existsSync(join(root, "public", ...assetSeed.image_url.split("/").filter(Boolean))), `Expanded overview image ${assetSeed.image_url} is missing.`);
}
let expandedCitationCount = 0;
for (const lesson of lessons.filter((item) => item.lesson_id !== "lesson_meiosis" && !item.chapter_id.startsWith("c1"))) {
  const overviewAsset = aiAssets.find((asset) => asset.metadata?.role === "lesson_overview" && asset.metadata?.lesson_id === lesson.lesson_id);
  assert(overviewAsset && lesson.blocks.some((block) => block.asset_ids?.includes(overviewAsset.asset_id)), `${lesson.lesson_id}: ImageGen overview must be bound to a lesson block.`);
  for (const block of lesson.blocks) {
    assert(block.ai_generated === true, `${lesson.lesson_id}/${block.block_id}: expanded content must retain its AI-generated disclosure.`);
    assert(block.source_chunk_ids?.length > 0 && block.citations?.length > 0, `${lesson.lesson_id}/${block.block_id}: source-backed content block is missing a RAG citation.`);
    for (const citation of block.citations) {
      expandedCitationCount += 1;
      const chunk = ragChunkById.get(citation.chunk_id);
      assert(chunk, `${lesson.lesson_id}: citation ${citation.chunk_id} is missing from the published RAG corpus.`);
      assert(chunk.section_id === lesson.chapter_id, `${lesson.lesson_id}: citation ${citation.chunk_id} belongs to ${chunk.section_id}, not ${lesson.chapter_id}.`);
      assert(chunk.text.includes(citation.quote), `${lesson.lesson_id}: citation quote is not present in ${citation.chunk_id}.`);
      assert(citation.page_start === chunk.page_start && citation.page_end === chunk.page_end, `${lesson.lesson_id}: citation ${citation.chunk_id} PDF page range drifted.`);
      assert(citation.printed_page_start === chunk.printed_page_start && citation.printed_page_end === chunk.printed_page_end, `${lesson.lesson_id}: citation ${citation.chunk_id} printed-page range drifted.`);
      assert(JSON.stringify(citation.source_metadata) === JSON.stringify(chunk.source_metadata), `${lesson.lesson_id}: citation ${citation.chunk_id} source metadata drifted.`);
    }
  }
}
assert(expandedCitationCount >= 48, "Expanded Chapter 2–5 lessons do not contain enough published-RAG citations.");
assert(flashcards.length === 90 && quizzes.length === 45, "Chapter 1–5 practice fixtures must contain 90 flashcards and 45 exercises.");
assert(JSON.stringify(state.flashcards) === JSON.stringify(flashcards), "Demo state flashcards drifted from the generated flashcard fixture.");
assert(JSON.stringify(state.quizzes) === JSON.stringify(quizzes), "Demo state quizzes drifted from the generated quiz fixture.");
for (const chapterId of expectedLessonChapterIds) {
  const sectionCards = flashcards.filter((card) => card.chapter_id === chapterId);
  const sectionQuizzes = quizzes.filter((quiz) => quiz.chapter_id === chapterId);
  assert(sectionCards.length === 6, `${chapterId}: expected exactly six flashcards.`);
  assert(sectionQuizzes.length === 3, `${chapterId}: expected exactly three exercises.`);
  assert(JSON.stringify(sectionQuizzes.map((quiz) => quiz.question_type)) === JSON.stringify(["judgment", "choice", "short-answer"]), `${chapterId}: exercise order or types are invalid.`);
  assert(sectionQuizzes[0].choices.length === 2 && sectionQuizzes[1].choices.length === 4 && sectionQuizzes[2].choices.length === 0, `${chapterId}: exercise choice shapes are invalid.`);
  for (const practiceItem of [...sectionCards, ...sectionQuizzes]) {
    if (chapterId.startsWith("c1")) {
      assert(practiceItem.source_kind === "ai_supplement", `${practiceItem.card_id ?? practiceItem.question_id}: Chapter 1 practice must disclose AI supplement provenance.`);
      assert(practiceItem.page_start === 0 && practiceItem.page_end === 0 && practiceItem.source_chunk_ids.length === 0, `${practiceItem.card_id ?? practiceItem.question_id}: Chapter 1 practice cannot claim a textbook source.`);
      continue;
    }
    const sourceId = practiceItem.source_chunk_ids?.[0];
    const chunk = practiceSourceById.get(sourceId);
    const itemId = practiceItem.card_id ?? practiceItem.question_id;
    assert(practiceItem.source_kind === "textbook" && practiceItem.source_chunk_ids.length === 1, `${itemId}: grounded practice must point to one textbook chunk.`);
    assert(chunk, `${itemId}: source chunk ${sourceId} is missing from the published RAG corpus.`);
    assert((chunk.section_id ?? chunk.chapter_id) === chapterId, `${itemId}: source chunk crosses section scope.`);
    assert(typeof practiceItem.source_quote === "string" && chunk.text.includes(practiceItem.source_quote), `${itemId}: source quote is not present in its RAG chunk.`);
    assert(practiceItem.page_start === chunk.page_start && practiceItem.page_end === chunk.page_end, `${itemId}: PDF page range drifted from its source chunk.`);
    assert(practiceItem.printed_page_start === chunk.printed_page_start && practiceItem.printed_page_end === chunk.printed_page_end, `${itemId}: printed-page range drifted from its source chunk.`);
    if (chunk.section_id) {
      assert(JSON.stringify(practiceItem.source_metadata) === JSON.stringify(chunk.source_metadata), `${itemId}: source metadata drifted from its RAG chunk.`);
    } else {
      assert(practiceItem.source_metadata?.parser === "mineru", `${itemId}: core source metadata must retain MinerU provenance.`);
    }
  }
}
assert(replies.default && replies.quiz, "AI response fixtures are incomplete.");
if (!existsSync(latestPath)) {
  console.log("Fixtures valid without ignored MinerU cache: " + chapters.length + " directory entries, " + lessons.length + " lessons, " + expandedCitationCount + " expanded citations, " + state.chunks.length + " core chunks, " + flashcards.length + " flashcards, " + quizzes.length + " quizzes.");
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(latestPath, "utf8"));

assert(manifest.status === "completed" && manifest.parser === "mineru", "Latest MinerU manifest is not completed by MinerU.");
assert(manifest.parser_version, "MinerU manifest must record the runtime version.");
assert(Number.isInteger(manifest.page_count) && manifest.page_count > 0, "MinerU manifest must record page_count.");
assert(typeof manifest.run_id === "string" && manifest.run_id.length > 0, "MinerU manifest must record a run_id.");
assert(typeof manifest.ingest_script_sha256 === "string" && manifest.ingest_script_sha256.length === 64, "MinerU manifest must record the ingestion script hash.");
assert(manifest.output_dir?.includes("/runs/"), "MinerU output must be isolated in a per-run directory.");
assert(state.provenance?.parser === "mineru", "Fixtures must declare MinerU as parser.");
assert(state.provenance?.parser_version === manifest.parser_version, "Fixture and manifest MinerU versions differ.");
assert(state.provenance?.source_sha256 === manifest.input_sha256, "Fixture and manifest source SHA-256 differ.");
assert(state.scan?.page_count === manifest.page_count, "Scan page count does not match MinerU manifest.");
assert(state.scan?.has_text_layer === Boolean(manifest.scan_detection?.has_text_layer), "Scan text-layer detection is not tied to MinerU preflight.");
assert(state.scan?.needs_ocr === Boolean(manifest.scan_detection?.needs_ocr), "Scan OCR decision is not tied to MinerU preflight.");
assert(state.scan?.has_text_layer === false && state.scan?.needs_ocr === true, "The designated PDF should be OCR-derived.");
assert(book.id === "book_biology_2" && book.pages === manifest.page_count, "Unexpected book metadata.");
assert(Array.isArray(chapters) && chapters.length >= 3, "Chapter fixture is too small.");
assert(Array.isArray(lessons) && lessons.some((lesson) => lesson.chapter_id === "c2s1"), "Core meiosis lesson is missing.");
assert(flashcards.length === 90 && quizzes.length === 45, "Chapter 1–5 practice fixtures are incomplete.");
assert(replies.default && replies.quiz, "AI response fixtures are incomplete.");

const rawFiles = manifest.files ?? [];
const rawOutput = resolve(root, manifest.output_dir);
function rawPath(file) {
  const path = resolve(rawOutput, file);
  assert(existsSync(path) && statSync(path).isFile(), `MinerU output not found: ${path}`);
  return path;
}

const markdownFile = rawFiles.find((file) => file.toLowerCase().endsWith(".md"));
const middleFile = rawFiles.find((file) => file.toLowerCase().includes("middle") && file.toLowerCase().endsWith(".json"));
const contentListFile = rawFiles.find((file) => file.toLowerCase().includes("content_list") && file.toLowerCase().endsWith(".json"));
assert(markdownFile && middleFile && contentListFile, "MinerU manifest must include markdown, middle JSON, and content_list JSON.");

const markdownPath = rawPath(markdownFile);
const middlePath = rawPath(middleFile);
const contentListPath = rawPath(contentListFile);
const markdown = readFileSync(markdownPath, "utf8");
const middle = JSON.parse(readFileSync(middlePath, "utf8"));
const contentList = JSON.parse(readFileSync(contentListPath, "utf8"));
assert(Array.isArray(contentList), "content_list.json must be an array.");
assert(Array.isArray(middle.pdf_info) && middle.pdf_info.length === manifest.page_count, "middle.json page count mismatch.");

const ingestScriptPath = join(root, "scripts", "ingest-pdf.mjs");
assert(sha256(readFileSync(ingestScriptPath)) === manifest.ingest_script_sha256, "MinerU ingestion script hash is stale.");

for (const file of rawFiles) {
  const path = rawPath(file);
  const expected = manifest.output_file_hashes?.[file];
  assert(expected, `Manifest is missing SHA-256 for ${file}.`);
  assert(Number(expected.bytes) === statSync(path).size, `MinerU output byte count mismatch for ${file}.`);
  assert(sha256(readFileSync(path)) === expected.sha256, `MinerU output hash mismatch for ${file}.`);
}

function outputHashMatches(file, path) {
  const expected = manifest.output_file_hashes?.[file]?.sha256;
  assert(expected, `Manifest is missing SHA-256 for ${file}.`);
  assert(sha256(readFileSync(path)) === expected, `MinerU output hash mismatch for ${file}.`);
}
outputHashMatches(markdownFile, markdownPath);
outputHashMatches(middleFile, middlePath);
outputHashMatches(contentListFile, contentListPath);
assert(state.provenance.markdown_sha256 === manifest.output_file_hashes[markdownFile].sha256, "Markdown provenance hash is stale.");
assert(state.provenance.middle_json_sha256 === manifest.output_file_hashes[middleFile].sha256, "middle.json provenance hash is stale.");
assert(state.provenance.content_list_sha256 === manifest.output_file_hashes[contentListFile].sha256, "content_list provenance hash is stale.");

const pages = new Map();
for (const [entryIndex, entry] of contentList.entries()) {
  const pageIdx = Number(entry.page_idx);
  if (!Number.isInteger(pageIdx)) continue;
  if (!pages.has(pageIdx)) pages.set(pageIdx, { entries: [], texts: [] });
  pages.get(pageIdx).entries.push({ ...entry, entryIndex });
  if (typeof entry.text === "string" && entry.text.trim()) pages.get(pageIdx).texts.push(entry.text);
}
const middlePages = new Map(middle.pdf_info.map((page) => [Number(page.page_idx), page]));
const pageText = (pageIdx) => pages.get(pageIdx)?.texts.join("\n") ?? "";
const printedPageFor = (pageIdx) => pageIdx >= 6 ? pageIdx + 6 : null;

assert(Array.isArray(state.scan.source_locations) && state.scan.source_locations.length === manifest.page_count, "Scan must expose one MinerU source location per PDF page.");
for (const location of state.scan.source_locations) {
  assert(Number.isInteger(location.pdf_page) && location.pdf_page >= 1 && location.pdf_page <= manifest.page_count, "Invalid scan source location PDF page.");
  assert(location.pdf_page === location.index, "Scan source location index must be the one-based PDF page.");
  assert(location.page_idx === location.pdf_page - 1, "Scan source location page_idx mismatch.");
  assert(location.page_text_sha256 === sha256(pageText(location.page_idx)), `Page text hash mismatch for PDF page ${location.pdf_page}.`);
}

const targetLocations = new Map(state.scan.source_locations.map((location) => [location.pdf_page, location]));
assert(targetLocations.get(11)?.printed_page === 16, "PDF page 11 must map to textbook printed page 16.");
assert(targetLocations.get(13)?.printed_page === 18, "PDF page 13 must map to textbook printed page 18.");
assert(targetLocations.get(19)?.printed_page === 24, "PDF page 19 must map to textbook printed page 24.");

function validateMiddleBlocks(reference, context) {
  const page = middlePages.get(Number(reference.page_idx));
  const blocks = page?.para_blocks ?? page?.preproc_blocks ?? [];
  for (const blockReference of reference.middle_blocks ?? []) {
    const block = blocks[Number(blockReference.block_index)];
    assert(block, `${context}: middle block ${blockReference.block_index} is missing.`);
    assert(jsonHash(block) === blockReference.sha256, `${context}: middle block hash mismatch.`);
  }
}

function validateReference(reference, context) {
  assert(reference && Number.isInteger(reference.page_idx), `${context}: source reference has no page_idx.`);
  const pageIdx = Number(reference.page_idx);
  const entryIndex = Number(reference.content_list_entry_index);
  const entry = contentList[entryIndex];
  assert(entry, `${context}: content_list entry ${entryIndex} is missing.`);
  assert(Number(entry.page_idx) === pageIdx, `${context}: content_list page_idx mismatch.`);
  const rawText = typeof entry.text === "string" ? entry.text : "";
  assert(rawText === reference.raw_ocr_text, `${context}: raw OCR text differs from content_list.`);
  assert(reference.raw_ocr_text_sha256 === sha256(rawText), `${context}: raw OCR text hash mismatch.`);
  assert(reference.content_list_entry_sha256 === jsonHash({ ...entry, entryIndex }), `${context}: content_list entry hash mismatch.`);
  assert(pageText(pageIdx).includes(rawText), `${context}: raw OCR text is not present on its MinerU page.`);
  assert(reference.page_text_sha256 === sha256(pageText(pageIdx)), `${context}: page text hash mismatch.`);
  assert(reference.pdf_page === pageIdx + 1, `${context}: PDF page mismatch.`);
  assert(reference.printed_page === printedPageFor(pageIdx), `${context}: printed page mapping mismatch.`);
  validateMiddleBlocks(reference, context);
}

function validateSourceMetadata(metadata, context) {
  assert(metadata?.parser === "mineru", `${context}: source metadata parser is not MinerU.`);
  assert(metadata.parser_version === manifest.parser_version, `${context}: source metadata MinerU version mismatch.`);
  assert(metadata.source_sha256 === manifest.input_sha256, `${context}: source metadata PDF hash mismatch.`);
  assert(metadata.content_list_file === contentListFile, `${context}: content_list filename mismatch.`);
  assert(metadata.middle_file === middleFile, `${context}: middle filename mismatch.`);
  assert(Array.isArray(metadata.source_entries) && metadata.source_entries.length > 0, `${context}: source metadata has no raw OCR entries.`);
  for (const [index, reference] of metadata.source_entries.entries()) validateReference(reference, `${context} entry ${index}`);
  const rawCombined = metadata.source_entries.map((reference) => reference.raw_ocr_text).join("\n");
  assert(metadata.raw_ocr_text === rawCombined, `${context}: combined raw OCR text mismatch.`);
  assert(metadata.raw_ocr_text_sha256 === sha256(rawCombined), `${context}: combined raw OCR hash mismatch.`);
  assert(JSON.stringify(metadata.content_list_entry_indices) === JSON.stringify(metadata.source_entries.map((reference) => reference.content_list_entry_index)), `${context}: entry index list mismatch.`);
}

const chunkById = new Map();
for (const chunk of state.chunks) {
  assert(chunk.chapter_id === "c2s1" && chunk.content_type === "ocr_text", `Chunk ${chunk.chunk_id} is not MinerU OCR content.`);
  assert(Array.isArray(chunk.source_entries) && chunk.source_entries.length > 0, `Chunk ${chunk.chunk_id} has no source entries.`);
  validateSourceMetadata(chunk.source_metadata, `Chunk ${chunk.chunk_id}`);
  for (const reference of chunk.source_entries) validateReference(reference, `Chunk ${chunk.chunk_id}`);
  assert(chunk.text === chunk.source_entries.map((reference) => reference.raw_ocr_text).join("\n\n"), `Chunk ${chunk.chunk_id} text is not generated from raw OCR entries.`);
  assert(chunk.page_start === Math.min(...chunk.source_entries.map((reference) => reference.pdf_page)), `Chunk ${chunk.chunk_id} start page mismatch.`);
  assert(chunk.page_end === Math.max(...chunk.source_entries.map((reference) => reference.pdf_page)), `Chunk ${chunk.chunk_id} end page mismatch.`);
  chunkById.set(chunk.chunk_id, chunk);
}
assert(chunkById.has("chunk_c2s1_11") && chunkById.has("chunk_c2s1_13") && chunkById.has("chunk_c2s1_19"), "Required P0 OCR chunks are missing.");

let p0CitationCount = 0;
for (const lesson of lessons.filter((item) => item.lesson_id === "lesson_meiosis")) {
  for (const block of lesson.blocks ?? []) {
    for (const citation of block.citations ?? []) {
      p0CitationCount += 1;
      const chunk = chunkById.get(citation.chunk_id);
      assert(chunk, `Citation ${citation.chunk_id} points to a missing chunk.`);
      assert(citation.page_start === citation.page_end, `Citation ${citation.chunk_id} must identify an exact PDF page.`);
      validateSourceMetadata(citation.source_metadata, `Citation ${citation.chunk_id}`);
      assert(citation.source_metadata.source_entries.some((reference) => pageText(reference.page_idx).includes(citation.quote)), `Citation ${citation.chunk_id} quote is not present in its OCR page.`);
      assert(citation.source_metadata.pdf_pages.includes(citation.page_start), `Citation ${citation.chunk_id} metadata page mismatch.`);
    }
  }
}
assert(p0CitationCount >= 7, "P0 lesson does not contain enough grounded citations.");

for (const card of flashcards.filter((item) => item.chapter_id === "c2s1")) {
  assert(card.source_chunk_ids?.length === 1, `Flashcard ${card.card_id} must point to one source chunk.`);
  const chunk = chunkById.get(card.source_chunk_ids[0]);
  assert(chunk, `Flashcard ${card.card_id} points to a missing chunk.`);
  assert(card.page_start === chunk.page_start && card.page_end === chunk.page_end, `Flashcard ${card.card_id} page range is stale.`);
  validateSourceMetadata(card.source_metadata, `Flashcard ${card.card_id}`);
}

for (const quiz of quizzes.filter((item) => item.chapter_id === "c2s1")) {
  assert(quiz.source_chunk_ids?.length === 1, `Quiz ${quiz.question_id} must point to one source chunk.`);
  const chunk = chunkById.get(quiz.source_chunk_ids[0]);
  assert(chunk, `Quiz ${quiz.question_id} points to a missing chunk.`);
  assert(quiz.page_start === chunk.page_start && quiz.page_end === chunk.page_end, `Quiz ${quiz.question_id} page range is stale.`);
  validateSourceMetadata(quiz.source_metadata, `Quiz ${quiz.question_id}`);
}

const coreChapter = chapters.find((chapter) => chapter.chapter_id === "c2s1");
const coreLesson = lessons.find((lesson) => lesson.chapter_id === "c2s1");
assert(coreChapter?.page_start === 11 && coreChapter?.page_end === 21, "Core chapter page range is not MinerU-grounded.");
assert(coreLesson?.page_start === 11 && coreLesson?.page_end === 21, "Core lesson page range is not MinerU-grounded.");
assert(state.assignment?.source?.includes("PDF 第 13 页") && state.diagnosis?.review_page?.includes("PDF 第 13 页"), "Assignment and diagnosis still reference the old mock page.");

for (const assetId of ["asset_meiosis_30", "asset_meiosis_35"]) {
  const asset = state.assets.find((item) => item.asset_id === assetId);
  assert(asset, `Missing P0 asset ${assetId}.`);
  assert(asset.mineru_extracted === false && asset.source_origin === "migrated-source-frontend-baseline", `Asset ${assetId} lacks explicit visual-baseline provenance.`);
  assert(asset.authorization_status, `Asset ${assetId} lacks authorization status.`);
}

for (const term of ["减数分裂", "同源染色体", "姐妹染色单体", "受精作用"]) {
  assert(markdown.includes(term), `MinerU markdown is missing required term ${term}.`);
  assert(state.provenance.grounding.required_terms?.[term] === true, `Fixture grounding term ${term} is not recorded.`);
  assert(state.provenance.grounding.term_evidence?.[term]?.present === true, `Fixture grounding evidence ${term} is missing.`);
}

assert(state.provenance.printed_page_mapping?.offset === 6, "Printed-page mapping offset is missing.");
assert(state.provenance.printed_page_mapping?.p0_manual_review?.printed_page === 16, "P0 printed-page review note is missing.");
assert(manifest.model_repository && "revision" in manifest.model_repository, "MinerU manifest must record model repository revision status.");
assert(Array.isArray(manifest.model_files) && manifest.model_files.length > 0, "MinerU manifest must hash local model artifacts.");
for (const model of manifest.model_files) {
  const path = resolve(root, model.path);
  assert(existsSync(path) && statSync(path).isFile(), `MinerU model artifact missing: ${model.path}`);
  assert(sha256(readFileSync(path)) === model.sha256, `MinerU model artifact hash mismatch: ${model.path}`);
}

console.log(`Fixtures valid: ${chapters.length} directory entries, ${lessons.length} lessons, ${state.chunks.length} core MinerU chunks, ${expandedCitationCount + p0CitationCount} grounded citations, ${flashcards.length} flashcards, ${quizzes.length} quizzes.`);
