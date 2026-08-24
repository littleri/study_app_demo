import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const generatedDir = join(root, "src", "data", "generated");
const seedDir = join(root, "src", "data", "seed");
const ragPath = join(root, "public", "rag", "biology-required-2-rag-v1", "chunks.json");

const paths = {
  demoState: join(generatedDir, "demo-state.json"),
  lessons: join(generatedDir, "lessons.json"),
  chapters: join(generatedDir, "chapters.json"),
  flashcards: join(generatedDir, "flashcards.json"),
  quizzes: join(generatedDir, "quiz.json"),
  book: join(generatedDir, "book.json"),
  meta: join(generatedDir, "demo-state-meta.json"),
  lessonsOneToThree: join(seedDir, "lessons-chapters-1-3.json"),
  lessonsFourToFive: join(seedDir, "lessons-chapters-4-5.json"),
  chapterOne: join(seedDir, "chapter-one-supplement.json"),
  lessonAssets: join(seedDir, "expanded-lesson-assets.json"),
  practice: join(seedDir, "practice-chapters-1-5.json")
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function paragraphCount(content) {
  return String(content ?? "")
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .length;
}

function uniqueById(items, key) {
  return [...new Map(items.map((item) => [item[key], item])).values()];
}

function extractedAssetPriority(asset) {
  const reviewPriority = asset.review_status === "ready" ? 0 : 1;
  const typePriority = ({ chart: 0, table: 1, figure: 2, formula: 3 })[asset.type] ?? 4;
  const captionPriority = String(asset.caption ?? "").startsWith("教材配图 ·") ? 1 : 0;
  return [reviewPriority, captionPriority, typePriority, Number(asset.page) || 0];
}

function compareAssets(left, right) {
  const leftPriority = extractedAssetPriority(left);
  const rightPriority = extractedAssetPriority(right);
  for (let index = 0; index < leftPriority.length; index += 1) {
    const delta = leftPriority[index] - rightPriority[index];
    if (delta !== 0) return delta;
  }
  return left.asset_id.localeCompare(right.asset_id);
}

const demoState = readJson(paths.demoState);
const generatedBook = readJson(paths.book);
const meta = readJson(paths.meta);
const chapterOneSupplement = readJson(paths.chapterOne);
const lessonSeeds = [
  ...readJson(paths.lessonsOneToThree),
  ...readJson(paths.lessonsFourToFive)
];
const lessonAssetSeeds = readJson(paths.lessonAssets);
const practiceSeeds = readJson(paths.practice);
const ragChunks = readJson(ragPath).chunks;
const ragById = new Map(ragChunks.map((chunk) => [chunk.chunk_id, chunk]));

const expectedSectionIds = [
  "c1s1", "c1s2",
  "c2s1", "c2s2", "c2s3",
  "c3s1", "c3s2", "c3s3", "c3s4",
  "c4s1", "c4s2", "c4s3",
  "c5s1", "c5s2", "c5s3"
];
const expectedGeneratedIds = new Set(expectedSectionIds.filter((chapterId) => chapterId !== "c2s1"));
const seedChapterIds = new Set(lessonSeeds.map((lesson) => lesson.chapter_id));
assert(lessonSeeds.length === expectedGeneratedIds.size, "Expanded lesson seed must contain exactly fourteen new lessons.");
assert(seedChapterIds.size === lessonSeeds.length, "Expanded lesson seed contains duplicate chapter IDs.");
for (const chapterId of expectedGeneratedIds) {
  assert(seedChapterIds.has(chapterId), `Expanded lesson seed is missing ${chapterId}.`);
}

for (const lesson of lessonSeeds) {
  assert(lesson.book_id === demoState.book.id, `${lesson.lesson_id}: unexpected book ID.`);
  assert(lesson.objectives?.length === 3, `${lesson.lesson_id}: expected exactly three objectives.`);
  assert(lesson.blocks?.length === 4, `${lesson.lesson_id}: expected exactly four lesson blocks.`);
  assert(lesson.key_concepts?.length >= 4, `${lesson.lesson_id}: expected at least four key concepts.`);
  assert(Array.isArray(lesson.warnings) && lesson.warnings.length > 0, `${lesson.lesson_id}: provenance warning is required.`);
  const isChapterOneSupplement = lesson.chapter_id.startsWith("c1");
  if (isChapterOneSupplement) {
    assert(lesson.page_start === 0 && lesson.page_end === 0, `${lesson.lesson_id}: missing-source PDF pages must remain 0–0.`);
    assert(lesson.source_chunk_ids.length === 0, `${lesson.lesson_id}: Chapter 1 supplement cannot claim source chunks.`);
  }

  for (const block of lesson.blocks) {
    assert(paragraphCount(block.content) === 3, `${lesson.lesson_id}/${block.block_id}: expected exactly three paragraphs.`);
    assert(block.ai_generated === true, `${lesson.lesson_id}/${block.block_id}: new content must disclose AI generation.`);
    if (isChapterOneSupplement) {
      assert(block.citations.length === 0 && block.source_chunk_ids.length === 0, `${lesson.lesson_id}/${block.block_id}: Chapter 1 supplement cannot claim textbook citations.`);
      continue;
    }
    assert(block.citations.length > 0, `${lesson.lesson_id}/${block.block_id}: grounded block has no citation.`);
    for (const citation of block.citations) {
      const chunk = ragById.get(citation.chunk_id);
      assert(chunk, `${lesson.lesson_id}/${block.block_id}: unknown citation chunk ${citation.chunk_id}.`);
      assert(chunk.section_id === lesson.chapter_id, `${lesson.lesson_id}/${block.block_id}: citation crosses section scope.`);
      assert(chunk.text.includes(citation.quote), `${lesson.lesson_id}/${block.block_id}: quote is not present in its RAG chunk.`);
      assert(citation.page_start === chunk.page_start && citation.page_end === chunk.page_end, `${lesson.lesson_id}/${block.block_id}: citation PDF range does not match RAG chunk.`);
      assert(citation.printed_page_start === chunk.printed_page_start && citation.printed_page_end === chunk.printed_page_end, `${lesson.lesson_id}/${block.block_id}: citation printed-page range does not match RAG chunk.`);
      assert(JSON.stringify(citation.source_metadata) === JSON.stringify(chunk.source_metadata), `${lesson.lesson_id}/${block.block_id}: citation source metadata drifted from RAG chunk.`);
    }
  }
}

assert(lessonAssetSeeds.length === lessonSeeds.length, "Every new lesson must have one generated overview asset.");
const assetSeedByLessonId = new Map(lessonAssetSeeds.map((asset) => [asset.lesson_id, asset]));
assert(assetSeedByLessonId.size === lessonAssetSeeds.length, "Generated overview asset seed contains duplicate lesson IDs.");

const overviewAssets = lessonSeeds.map((lesson) => {
  const seed = assetSeedByLessonId.get(lesson.lesson_id);
  assert(seed, `${lesson.lesson_id}: generated overview asset is missing.`);
  assert(seed.chapter_id === lesson.chapter_id, `${lesson.lesson_id}: overview asset chapter mismatch.`);
  const localPath = join(root, "public", ...seed.image_url.split("/").filter(Boolean));
  assert(existsSync(localPath), `${lesson.lesson_id}: overview image file is missing at ${seed.image_url}.`);
  return {
    asset_id: seed.asset_id,
    book_id: lesson.book_id,
    chapter_id: lesson.chapter_id,
    source_type: "ai_generated",
    page: null,
    type: "diagram",
    caption: seed.caption,
    bbox: null,
    image_url: seed.image_url,
    thumbnail_url: seed.image_url,
    source_page_image_url: null,
    source_chunk_ids: [...lesson.source_chunk_ids],
    concepts: seed.concepts,
    generation_provider: "openai-imagegen",
    review_status: "approved",
    metadata: {
      role: "lesson_overview",
      lesson_id: lesson.lesson_id,
      use_case: "scientific-educational",
      prompt_summary: seed.prompt_summary,
      generated_for_scope: "textbook_chapters_1_to_5",
      generated_at: "2026-08-23"
    }
  };
});

const allAssets = uniqueById([
  ...demoState.assets.filter((asset) => !overviewAssets.some((overview) => overview.asset_id === asset.asset_id)),
  ...overviewAssets
], "asset_id");
const extractedAssets = allAssets.filter((asset) => asset.source_type === "extracted");
const overviewByLessonId = new Map(overviewAssets.map((asset) => [asset.metadata.lesson_id, asset]));

const hydratedLessons = lessonSeeds.map((lesson) => {
  const overview = overviewByLessonId.get(lesson.lesson_id);
  const usedExtractedAssetIds = new Set();
  const blocks = lesson.blocks.map((block, blockIndex) => {
    const citationRanges = block.citations.map((citation) => [citation.page_start, citation.page_end]);
    const extracted = extractedAssets
      .filter((asset) => citationRanges.some(([start, end]) => start <= asset.page && asset.page <= end))
      .filter((asset) => !usedExtractedAssetIds.has(asset.asset_id))
      .sort(compareAssets)[0] ?? null;
    if (extracted) usedExtractedAssetIds.add(extracted.asset_id);
    return {
      ...block,
      asset_ids: [
        ...(blockIndex === 0 ? [overview.asset_id] : []),
        ...(extracted ? [extracted.asset_id] : [])
      ]
    };
  });
  return {
    ...lesson,
    blocks,
    asset_ids: uniqueById([
      overview,
      ...blocks.flatMap((block) => block.asset_ids.map((assetId) => allAssets.find((asset) => asset.asset_id === assetId))).filter(Boolean)
    ], "asset_id").map((asset) => asset.asset_id)
  };
});

const existingMeiosisLesson = demoState.lessons.find((lesson) => lesson.chapter_id === "c2s1");
assert(existingMeiosisLesson, "Existing c2s1 meiosis lesson must be preserved.");
const lessons = [
  ...hydratedLessons.filter((lesson) => lesson.chapter_id.startsWith("c1")),
  existingMeiosisLesson,
  ...hydratedLessons.filter((lesson) => !lesson.chapter_id.startsWith("c1"))
];
assert(lessons.length === expectedSectionIds.length, "Expanded lesson output must contain all fifteen Chapter 1–5 sections.");
assert(new Set(lessons.map((lesson) => lesson.chapter_id)).size === lessons.length, "Expanded lesson output contains duplicate chapter lessons.");

assert(practiceSeeds.length === expectedSectionIds.length, "Practice seed must contain all fifteen Chapter 1–5 sections.");
const practiceByChapterId = new Map(practiceSeeds.map((practice) => [practice.chapter_id, practice]));
assert(practiceByChapterId.size === practiceSeeds.length, "Practice seed contains duplicate chapter IDs.");
const lessonByChapterId = new Map(lessons.map((lesson) => [lesson.chapter_id, lesson]));

function practiceSource(lesson, blockIndex) {
  const block = lesson.blocks[blockIndex];
  assert(block, `${lesson.lesson_id}: practice references missing block ${blockIndex}.`);
  if (lesson.chapter_id.startsWith("c1")) {
    return {
      source_chunk_ids: [],
      page_start: 0,
      page_end: 0,
      printed_page_start: null,
      printed_page_end: null,
      source_kind: "ai_supplement",
      source_quote: null
    };
  }
  const citation = block.citations[0];
  assert(citation, `${lesson.lesson_id}/${block.block_id}: grounded practice source is missing.`);
  return {
    source_chunk_ids: [citation.chunk_id],
    page_start: citation.page_start,
    page_end: citation.page_end,
    printed_page_start: citation.printed_page_start,
    printed_page_end: citation.printed_page_end,
    source_metadata: citation.source_metadata,
    source_kind: "textbook",
    source_quote: citation.quote
  };
}

const flashcards = expectedSectionIds.flatMap((chapterId) => {
  const practice = practiceByChapterId.get(chapterId);
  const lesson = lessonByChapterId.get(chapterId);
  assert(practice && lesson, `${chapterId}: practice cannot be paired with its lesson.`);
  assert(practice.flashcards?.length === 6, `${chapterId}: expected exactly six flashcards.`);
  return practice.flashcards.map((card, index) => ({
    card_id: `fc_${chapterId}_${String(index + 1).padStart(2, "0")}`,
    book_id: lesson.book_id,
    lesson_id: lesson.lesson_id,
    chapter_id: chapterId,
    front: card.front,
    back: card.back,
    concept: card.concept,
    ...practiceSource(lesson, card.block_index),
    due: "today",
    mastery: [42, 50, 58, 64, 72, 80][index],
    reason: chapterId.startsWith("c1")
      ? "基于本节 AI 补充课程生成，待教材原文核验"
      : "基于本节教材原文与核心概念生成"
  }));
});

const quizTypeOrder = ["judgment", "choice", "short-answer"];
const quizzes = expectedSectionIds.flatMap((chapterId) => {
  const practice = practiceByChapterId.get(chapterId);
  const lesson = lessonByChapterId.get(chapterId);
  assert(practice && lesson, `${chapterId}: exercises cannot be paired with their lesson.`);
  assert(practice.exercises?.length === 3, `${chapterId}: expected exactly three exercises.`);
  assert(JSON.stringify(practice.exercises.map((item) => item.question_type)) === JSON.stringify(quizTypeOrder), `${chapterId}: exercise order must be judgment, choice, short-answer.`);
  return practice.exercises.map((exercise, index) => ({
    question_id: `quiz_${chapterId}_${String(index + 1).padStart(2, "0")}`,
    book_id: lesson.book_id,
    lesson_id: lesson.lesson_id,
    chapter_id: chapterId,
    prompt: exercise.prompt,
    choices: exercise.choices,
    answer: exercise.answer,
    explanation: exercise.explanation,
    concept: exercise.concept,
    question_type: exercise.question_type,
    instruction: exercise.instruction,
    ...practiceSource(lesson, exercise.block_index)
  }));
});
assert(flashcards.length === 90, "Expanded practice must contain exactly ninety flashcards.");
assert(quizzes.length === 45, "Expanded practice must contain exactly forty-five exercises.");

const frontmatter = demoState.chapters.find((chapter) => chapter.chapter_id === "frontmatter");
assert(frontmatter, "Demo directory is missing frontmatter.");
const chapters = [
  frontmatter,
  ...chapterOneSupplement,
  ...demoState.chapters.filter((chapter) => chapter.chapter_id !== "frontmatter" && !chapter.chapter_id.startsWith("c1"))
];
const chapterIds = new Set(chapters.map((chapter) => chapter.chapter_id));
for (const lesson of lessons) assert(chapterIds.has(lesson.chapter_id), `${lesson.lesson_id}: directory entry is missing.`);

const expandedProvenance = {
  ...demoState.provenance,
  expanded_lessons: {
    scope: "正式章节第 1–5 章的全部 15 个“第 X 节”节点",
    lesson_count: lessons.length,
    preserved_lesson_ids: [existingMeiosisLesson.lesson_id],
    generated_lesson_count: hydratedLessons.length,
    imagegen_overview_count: overviewAssets.length,
    grounded_section_count: lessons.filter((lesson) => !lesson.chapter_id.startsWith("c1")).length,
    supplemental_section_count: lessons.filter((lesson) => lesson.chapter_id.startsWith("c1")).length,
    chapter_one_source_status: "当前源 PDF 缺少第 1 章正文；仅目录页码可核验，课程为 AI 补充草稿。"
  },
  expanded_practice: {
    scope: "正式章节第 1–5 章的全部 15 个小节",
    flashcard_count: flashcards.length,
    exercise_count: quizzes.length,
    flashcards_per_section: 6,
    exercises_per_section: 3,
    exercise_order: quizTypeOrder,
    grounded_section_count: expectedSectionIds.filter((chapterId) => !chapterId.startsWith("c1")).length,
    supplemental_section_count: expectedSectionIds.filter((chapterId) => chapterId.startsWith("c1")).length
  }
};
const bookValues = {
  ...demoState.book,
  chapterCount: 7,
  sectionCount: 19
};
const nextState = {
  ...demoState,
  provenance: expandedProvenance,
  book: bookValues,
  chapters,
  assets: allAssets,
  lessons,
  flashcards,
  quizzes
};

writeJson(paths.demoState, nextState);
writeJson(paths.lessons, lessons);
writeJson(paths.chapters, chapters);
writeJson(paths.flashcards, flashcards);
writeJson(paths.quizzes, quizzes);
writeJson(paths.book, {
  ...generatedBook,
  provenance: expandedProvenance,
  ...bookValues
});
writeJson(paths.meta, {
  ...meta,
  provenance: expandedProvenance
});

console.log(`Expanded lessons synced: ${lessons.length} lessons across Chapters 1–5 (${overviewAssets.length} ImageGen overviews).`);
console.log(`Grounded lessons: ${lessons.filter((lesson) => !lesson.chapter_id.startsWith("c1")).length}; source-missing supplements: ${lessons.filter((lesson) => lesson.chapter_id.startsWith("c1")).length}.`);
console.log(`Practice synced: ${flashcards.length} flashcards and ${quizzes.length} exercises.`);
