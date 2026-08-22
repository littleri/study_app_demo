import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  BIOLOGY_RAG,
  BIOLOGY_FRONTMATTER,
  assert,
  assertMissingChapterOneFrontmatterMetadata,
  assertPinnedRagSourceHashes,
  findMineruFile,
  projectPath,
  readJson,
} from "./rag-common.mjs";

const sourcePdf = resolve(process.env.RAG_SOURCE_PDF ?? BIOLOGY_RAG.defaultSourcePdf);
const mineruDirectory = resolve(process.env.RAG_MINERU_DIR ?? BIOLOGY_RAG.defaultMineruDirectory);

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ \t\u3000]+/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function flattenedContent(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => flattenedContent(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (typeof value.content === "string" && cleanText(value.content)) output.push(cleanText(value.content));
  Object.entries(value).forEach(([key, child]) => {
    if (!["content", "image_path", "bbox"].includes(key)) flattenedContent(child, output);
  });
  return output;
}

assert(existsSync(sourcePdf), "Source PDF not found: " + sourcePdf);
assert(existsSync(mineruDirectory), "MinerU directory not found: " + mineruDirectory);

const contentListPath = findMineruFile(mineruDirectory, /_content_list\.json$/u);
const middlePath = findMineruFile(mineruDirectory, /_middle\.json$/u);
const sourceHashes = assertPinnedRagSourceHashes({ sourcePdf, contentListPath, middlePath });
const [contentList, middle, seed, chapters] = await Promise.all([
  readJson(contentListPath),
  readJson(middlePath),
  readJson(projectPath("src", "data", "seed", "curated-content.json")),
  readJson(projectPath("src", "data", "generated", "chapters.json"))
]);
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters: seed.chapters,
  label: "RAG source seed"
});
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters,
  label: "RAG source generated directory"
});
const seedFrontmatter = seed.chapters.find((chapter) => chapter.chapter_id === BIOLOGY_FRONTMATTER.chapterId);
const generatedFrontmatter = chapters.find((chapter) => chapter.chapter_id === BIOLOGY_FRONTMATTER.chapterId);
assert(
  JSON.stringify(seedFrontmatter) === JSON.stringify(generatedFrontmatter),
  "Generated frontmatter metadata drifted from the pinned curated seed."
);
assert(Array.isArray(contentList) && contentList.length === 2013, "Expected exactly 2,013 entries in MinerU content_list.json.");
assert(Array.isArray(middle.pdf_info) && middle.pdf_info.length === 125, "Expected exactly 125 pages in MinerU middle.json.");
const p6Entries = contentList.filter((entry) => Number(entry.page_idx) === 5);
const p6DirectText = p6Entries.map((entry) => cleanText(entry.text)).filter(Boolean).join("\n");
const p6RecoveredText = [...new Set([
  ...flattenedContent(middle.pdf_info[5].preproc_blocks ?? []),
  ...flattenedContent(middle.pdf_info[5].discarded_blocks ?? [])
])].join("\n");
assert(!p6DirectText, "Expected PDF page 6 to require recovery rather than be treated as an ordinary content-list text page.");
assert(p6RecoveredText.length > 0, "PDF page 6 could not be recovered from middle.json preprocessed blocks.");

console.log(JSON.stringify({
  status: "passed",
  source_pdf_bytes: 38847801,
  source_pdf_sha256: sourceHashes.source_pdf,
  source_pdf_pages: 125,
  content_list_entries: contentList.length,
  content_list_sha256: sourceHashes.content_list,
  middle_sha256: sourceHashes.middle,
  frontmatter: {
    chapter_id: generatedFrontmatter.chapter_id,
    title: generatedFrontmatter.source_title,
    pdf_page_start: generatedFrontmatter.page_start,
    pdf_page_end: generatedFrontmatter.page_end
  },
  recovered_page_6: {
    content_list_records: p6Entries.length,
    recovered_characters: p6RecoveredText.length
  }
}, null, 2));
