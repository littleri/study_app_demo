import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BIOLOGY_RAG,
  assertMissingChapterOneFrontmatterMetadata
} from "./rag-common.mjs";

const root = resolve(import.meta.dirname, "..");
const generatedDir = join(root, "src", "data", "generated");
const curatedPath = join(root, "src", "data", "seed", "curated-content.json");
const chapterOneSupplementPath = join(root, "src", "data", "seed", "chapter-one-supplement.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const curated = readJson(curatedPath);
const chapterOneSupplement = readJson(chapterOneSupplementPath);
const demoStatePath = join(generatedDir, "demo-state.json");
const bookPath = join(generatedDir, "book.json");
const chaptersPath = join(generatedDir, "chapters.json");
const metaPath = join(generatedDir, "demo-state-meta.json");
const demoState = readJson(demoStatePath);
const generatedBook = readJson(bookPath);
const meta = readJson(metaPath);

const availableChapters = curated.chapters.map((chapter) => chapter.chapter_id === "c2s1"
  ? { ...chapter, source: "manual_toc_reference+mineru" }
  : chapter);
const frontmatter = availableChapters.find((chapter) => chapter.chapter_id === "frontmatter");
assert(frontmatter, "Curated directory is missing its frontmatter node.");
const chapters = [
  frontmatter,
  ...chapterOneSupplement,
  ...availableChapters.filter((chapter) => chapter.chapter_id !== "frontmatter")
];
const ids = new Set(chapters.map((chapter) => chapter.chapter_id));
const rootCount = chapters.filter((chapter) => chapter.level === 1 && chapter.chapter_id !== "frontmatter").length;
const formalSectionCount = chapters.filter((chapter) => /^第\s*\d+\s*节/.test(chapter.source_title)).length;

assert(ids.size === chapters.length, "Directory contains duplicate chapter IDs.");
assert(rootCount === curated.book.chapterCount + 1, "Expanded directory must add the source-missing Chapter 1 root.");
assert(formalSectionCount === curated.book.sectionCount + 2, "Expanded directory must add both Chapter 1 sections.");
assert(chapters.every((chapter) => !chapter.parent_id || ids.has(chapter.parent_id)), "Directory contains an unknown parent ID.");
assert(chapters.every((chapter) => chapter.page_start <= chapter.page_end), "Directory contains an invalid PDF page range.");
assert(chapters.every((chapter) => chapter.printed_page_start <= chapter.printed_page_end), "Directory contains an invalid printed page range.");
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters: curated.chapters,
  label: "Demo directory seed"
});
assert(chapterOneSupplement.every((chapter) => chapter.page_start === 0 && chapter.page_end === 0), "Chapter 1 supplement must not claim frontmatter PDF pages as body pages.");
const directoryPolicy = "目录按当前 PDF 实际页核验：PDF 第 1–9 页为教材封面、前言与目录；第 1 章仅以 AI 补充节点呈现并保留 0–0 缺源页语义，第 2 章起使用 MinerU OCR 证据。";
const provenance = {
  ...demoState.provenance,
  content_scope: curated.provenance.content_scope,
  fixture_policy: directoryPolicy
};
const book = {
  ...generatedBook,
  provenance,
  ...curated.book,
  pages: demoState.book.pages,
  chapterCount: rootCount,
  sectionCount: formalSectionCount
};

writeJson(chaptersPath, chapters);
writeJson(bookPath, book);
writeJson(demoStatePath, {
  ...demoState,
  provenance,
  book: {
    ...demoState.book,
    ...curated.book,
    pages: demoState.book.pages,
    chapterCount: rootCount,
    sectionCount: formalSectionCount
  },
  chapters,
  studyPlan: curated.studyPlan
});
writeJson(metaPath, { ...meta, provenance, studyPlan: curated.studyPlan });

console.log(`Synced ${chapters.length} directory entries (${rootCount} chapters plus frontmatter, ${formalSectionCount} formal sections).`);
