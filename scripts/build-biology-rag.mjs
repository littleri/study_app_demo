import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import {
  BIOLOGY_FRONTMATTER,
  BIOLOGY_RAG,
  assert,
  assertMissingChapterOneFrontmatterMetadata,
  assertPinnedRagSourceHashes,
  findMineruFile,
  projectPath,
  readJson,
  sha256,
  sha256File,
  writeJsonAtomic
} from "./rag-common.mjs";

const sourcePdf = resolve(process.env.RAG_SOURCE_PDF ?? BIOLOGY_RAG.defaultSourcePdf);
const mineruDirectory = resolve(process.env.RAG_MINERU_DIR ?? BIOLOGY_RAG.defaultMineruDirectory);
const corpusDirectory = projectPath(BIOLOGY_RAG.corpusDirectory);
const modelDirectory = projectPath(BIOLOGY_RAG.modelDirectory);
const chaptersPath = projectPath("src", "data", "generated", "chapters.json");
const evaluationSetPath = projectPath("scripts", "biology-rag-evaluation-set.json");

const TARGET_CHUNK_MINIMUM = 320;
const TARGET_CHUNK_MAXIMUM = 700;
const TARGET_CHUNK_OVERLAP = 80;
// Leave room for the overlap and the joining newline. A source record larger
// than this is split before the section-level chunker sees it.
const TARGET_CHUNK_PAYLOAD_MAXIMUM = 600;
const EMBEDDING_BATCH_SIZE = 6;

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ \t\u3000]+/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function hashJson(value) {
  return sha256(JSON.stringify(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function flattenMiddleText(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => flattenMiddleText(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const candidate = value.content;
  if (typeof candidate === "string" && cleanText(candidate)) {
    output.push(cleanText(candidate));
  }
  Object.entries(value).forEach(([key, child]) => {
    if (key !== "content" && key !== "image_path" && key !== "bbox") {
      flattenMiddleText(child, output);
    }
  });
  return output;
}

function recoveredMiddlePageText(page) {
  const preprocessed = unique(flattenMiddleText(page.preproc_blocks ?? []));
  const discarded = unique(flattenMiddleText(page.discarded_blocks ?? []));
  return unique([...preprocessed, ...discarded]).join("\n");
}

function contentText(entry) {
  const fragments = [];
  if (typeof entry.text === "string") fragments.push(entry.text);
  if (Array.isArray(entry.image_caption)) fragments.push(...entry.image_caption);
  if (Array.isArray(entry.image_footnote)) fragments.push(...entry.image_footnote);
  return cleanText(fragments.join("\n"));
}

function classifyPageContent(pageNumber, text, entries, section) {
  if (pageNumber <= 6) return pageNumber >= 4 ? "catalog" : "frontmatter";
  if (section?.source_title?.includes("科学家的故事") || section?.source_title?.includes("科学前沿")) {
    return "scientist_story";
  }
  if (section?.source_title?.includes("科学·技术·社会") || section?.source_title?.includes("职业")) {
    return "extension";
  }
  if (/练习|复习题|思考与讨论/u.test(text)) return "exercise";
  if (entries.length > 0 && entries.every((entry) => entry.type === "image")) return "figure_caption";
  return "body";
}

function titlePathFor(section, chaptersById) {
  if (!section) return ["封面与目录"];
  const path = [];
  let cursor = section;
  while (cursor) {
    path.unshift(cursor.source_title);
    cursor = cursor.parent_id ? chaptersById.get(cursor.parent_id) : null;
  }
  return path;
}

function resolveSection(pageNumber, chapters) {
  const candidates = chapters
    .filter((chapter) => pageNumber >= chapter.page_start && pageNumber <= chapter.page_end)
    .sort((left, right) => (
      right.level - left.level
      || (left.page_end - left.page_start) - (right.page_end - right.page_start)
      || left.chapter_id.localeCompare(right.chapter_id)
    ));
  return candidates[0] ?? null;
}

function resolveChapter(section, chaptersById) {
  let cursor = section;
  while (cursor?.parent_id) cursor = chaptersById.get(cursor.parent_id) ?? null;
  return cursor;
}

function printedPageFor(pdfPage) {
  return pdfPage >= 7 ? pdfPage + 5 : null;
}

function splitEntryText(text, maximum = TARGET_CHUNK_PAYLOAD_MAXIMUM) {
  const source = cleanText(text);
  if (!source) return [];
  const sentences = source.match(/[^。！？!?；;\n]+[。！？!?；;\n]*/gu) ?? [source];
  const parts = [];
  let current = "";
  const flush = () => {
    const cleaned = cleanText(current);
    if (cleaned) parts.push(cleaned);
    current = "";
  };
  for (const sentence of sentences) {
    const cleaned = cleanText(sentence);
    if (!cleaned) continue;
    if (cleaned.length > maximum) {
      flush();
      for (let offset = 0; offset < cleaned.length; offset += maximum) {
        parts.push(cleaned.slice(offset, offset + maximum));
      }
      continue;
    }
    if (current.length > 0 && current.length + cleaned.length + 1 > maximum) flush();
    current = current ? current + "\n" + cleaned : cleaned;
  }
  flush();
  return parts;
}

function keyConceptsFor(chunk) {
  const titleTerms = chunk.title_path
    .flatMap((title) => title
      .replace(/^第\s*\d+\s*[章节]\s*/u, "")
      .split(/[、，,：:（）()\s·—-]+/u))
    .map((term) => cleanText(term))
    .filter((term) => term.length >= 2 && term.length <= 24);
  const highlighted = chunk.text.match(/(?:减数分裂|受精作用|同源染色体|姐妹染色单体|伴性遗传|DNA|基因|RNA|遗传密码|基因突变|基因重组|染色体变异|基因工程|种群|基因频率|隔离|共同进化|生物多样性)/gu) ?? [];
  return unique([...titleTerms, ...highlighted]).slice(0, 12);
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
  return tokens.filter((token) => !new Set(["的", "了", "和", "是", "在", "与", "及", "为", "中", "第"]).has(token));
}

function buildBm25(chunks) {
  const documentLengths = [];
  const postingMaps = new Map();
  chunks.forEach((chunk, documentIndex) => {
    const tokens = tokenizeForBm25(chunk.title_path.join(" ") + " " + chunk.key_concepts.join(" ") + " " + chunk.text);
    documentLengths.push(tokens.length);
    const frequencies = new Map();
    tokens.forEach((token) => frequencies.set(token, (frequencies.get(token) ?? 0) + 1));
    frequencies.forEach((frequency, token) => {
      const postings = postingMaps.get(token) ?? [];
      postings.push([documentIndex, frequency]);
      postingMaps.set(token, postings);
    });
  });
  const documentCount = chunks.length;
  const postings = Object.fromEntries([...postingMaps.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([token, entries]) => [
      token,
      {
        idf: Math.log(1 + ((documentCount - entries.length + 0.5) / (entries.length + 0.5))),
        postings: entries
      }
    ]));
  return {
    schema_version: BIOLOGY_RAG.schemaVersion,
    tokenizer_version: BIOLOGY_RAG.tokenizerVersion,
    document_count: documentCount,
    average_document_length: documentLengths.reduce((total, length) => total + length, 0) / Math.max(1, documentCount),
    document_lengths: documentLengths,
    k1: 1.2,
    b: 0.75,
    postings
  };
}

function makeSourceReference({ entry, entryIndex, pageIndex, kind, recoveredBlock }) {
  const rawText = kind === "middle_recovery" ? recoveredBlock : contentText(entry);
  return {
    source_kind: kind,
    page_idx: pageIndex,
    pdf_page: pageIndex + 1,
    content_list_entry_index: Number.isInteger(entryIndex) ? entryIndex : null,
    raw_ocr_text_sha256: sha256(rawText),
    content_list_entry_sha256: entry ? hashJson({ ...entry, entryIndex }) : null,
    middle_block_sha256: recoveredBlock ? hashJson(recoveredBlock) : null
  };
}

function buildChunks(pages, chapters) {
  const chaptersById = new Map(chapters.map((chapter) => [chapter.chapter_id, chapter]));
  const unitsBySection = new Map();
  pages.forEach((page) => {
    const section = resolveSection(page.pdf_page, chapters);
    const chapter = resolveChapter(section, chaptersById);
    const sectionId = section?.chapter_id ?? "frontmatter";
    const entries = page.entries.flatMap((entryRecord) => splitEntryText(entryRecord.text).map((text) => ({
      text,
      pdf_page: page.pdf_page,
      printed_page: page.printed_page,
      content_type: page.content_type,
      source_references: [entryRecord.source_reference],
      chapter_id: chapter?.chapter_id ?? "frontmatter",
      section_id: sectionId,
      title_path: titlePathFor(section, chaptersById),
      ocr_status: page.ocr_status
    })));
    if (entries.length === 0 && page.text) {
      entries.push({
        text: page.text,
        pdf_page: page.pdf_page,
        printed_page: page.printed_page,
        content_type: page.content_type,
        source_references: page.source_references,
        chapter_id: chapter?.chapter_id ?? "frontmatter",
        section_id: sectionId,
        title_path: titlePathFor(section, chaptersById),
        ocr_status: page.ocr_status
      });
    }
    const current = unitsBySection.get(sectionId) ?? [];
    current.push(...entries);
    unitsBySection.set(sectionId, current);
  });

  const textLength = (items) => cleanText(items.map((item) => item.text).join("\n")).length;
  const pageRange = (items) => [
    Math.min(...items.map((item) => item.pdf_page)),
    Math.max(...items.map((item) => item.pdf_page))
  ];
  const createOverlap = (items, desiredCharacters = TARGET_CHUNK_OVERLAP) => {
    const lastPage = items.at(-1)?.pdf_page;
    const overlap = [];
    let overlapLength = 0;
    for (let index = items.length - 1; index >= 0 && overlapLength < desiredCharacters; index -= 1) {
      const item = items[index];
      // Preserve the real page of every carried-over OCR record. Keeping
      // overlap on the last page also makes the next chunk's two-page rule
      // independently verifiable.
      if (item.pdf_page !== lastPage) break;
      const remaining = desiredCharacters - overlapLength;
      const text = item.text.length > remaining
        ? item.text.slice(-remaining)
        : item.text;
      overlap.unshift({ ...item, text });
      overlapLength += text.length;
    }
    return overlap;
  };

  const chunks = [];
  const flush = (items) => {
    if (items.length === 0) return null;
    const text = cleanText(items.map((item) => item.text).join("\n"));
    if (!text) return null;
    const first = items[0];
    const [pageStart, pageEnd] = pageRange(items);
    const printedPages = items.map((item) => item.printed_page).filter(Number.isInteger);
    const sourceReferences = [...new Map(
      items.flatMap((item) => item.source_references)
        .map((reference) => [JSON.stringify(reference), reference])
    ).values()];
    const fingerprint = [
      BIOLOGY_RAG.bookId,
      first.chapter_id,
      first.section_id,
      pageStart,
      pageEnd,
      text
    ].join("|");
    const chunk = {
      chunk_id: "rag_" + sha256(fingerprint).slice(0, 20),
      book_id: BIOLOGY_RAG.bookId,
      chapter_id: first.chapter_id,
      section_id: first.section_id,
      page_start: pageStart,
      page_end: pageEnd,
      printed_page_start: printedPages[0] ?? null,
      printed_page_end: printedPages.at(-1) ?? null,
      title_path: first.title_path,
      content_type: unique(items.map((item) => item.content_type)).length === 1
        ? first.content_type
        : "body",
      text,
      text_characters: text.length,
      chunking_exception: text.length < TARGET_CHUNK_MINIMUM
        ? "isolated_section_or_page_boundary_shorter_than_minimum"
        : null,
      asset_ids: [],
      key_concepts: [],
      source_entries: sourceReferences,
      source_metadata: {
        parser: "mineru",
        source_pdf_sha256: BIOLOGY_RAG.sourcePdfSha256,
        pdf_pages: [pageStart, pageEnd],
        printed_pages: [printedPages[0] ?? null, printedPages.at(-1) ?? null],
        ocr_status: unique(items.map((item) => item.ocr_status)),
        source_entry_count: sourceReferences.length,
        source_entry_sha256: sha256(JSON.stringify(sourceReferences))
      }
    };
    chunk.key_concepts = keyConceptsFor(chunk);
    return chunk;
  };

  unitsBySection.forEach((units) => {
    let current = [];
    let currentPrimaryItems = [];
    let primaryCharacters = 0;
    let hasPrimaryContent = false;
    let pendingOverlap = [];
    let previousEmittedItems = null;

    const emitCurrent = () => {
      if (!hasPrimaryContent) {
        current = [];
        primaryCharacters = 0;
        return;
      }
      const emittedItems = current;
      const chunk = flush(emittedItems);
      if (chunk) chunks.push(chunk);
      previousEmittedItems = emittedItems;
      pendingOverlap = createOverlap(emittedItems);
      current = [];
      currentPrimaryItems = [];
      primaryCharacters = 0;
      hasPrimaryContent = false;
    };

    units.forEach((unit) => {
      // A pending overlap is only materialized when there is a following
      // source unit, so a section never ends with an overlap-only chunk.
      if (current.length === 0 && pendingOverlap.length > 0) {
        current = pendingOverlap;
        pendingOverlap = [];
      }

      const addWouldOverflow = () => {
        if (current.length === 0) return false;
        const candidate = [...current, unit];
        const [pageStart, pageEnd] = pageRange(candidate);
        return textLength(candidate) > TARGET_CHUNK_MAXIMUM || pageEnd - pageStart > 1;
      };

      while (addWouldOverflow()) {
        if (hasPrimaryContent) {
          emitCurrent();
          if (current.length === 0 && pendingOverlap.length > 0) {
            current = pendingOverlap;
            pendingOverlap = [];
          }
          continue;
        }
        // The carried-over words alone would make this chunk invalid. Drop
        // only the overlap; never mutate its source-page metadata.
        current = [];
        pendingOverlap = [];
      }

      current.push(unit);
      currentPrimaryItems.push(unit);
      hasPrimaryContent = true;
      primaryCharacters += unit.text.length;
      if (primaryCharacters >= TARGET_CHUNK_PAYLOAD_MAXIMUM) emitCurrent();
    });
    // If a section ends with a small residual, widen the *real* same-page
    // overlap just enough to meet the target. This avoids inventing text,
    // crossing a section, or assigning an OCR reference to the wrong page.
    if (hasPrimaryContent && textLength(current) < TARGET_CHUNK_MINIMUM && previousEmittedItems) {
      const desiredOverlap = Math.max(
        TARGET_CHUNK_OVERLAP,
        TARGET_CHUNK_MINIMUM - textLength(currentPrimaryItems) + 8
      );
      const widenedOverlap = createOverlap(previousEmittedItems, desiredOverlap);
      const candidate = [...widenedOverlap, ...currentPrimaryItems];
      const [candidateStart, candidateEnd] = pageRange(candidate);
      if (
        candidate.length > 0
        && candidateEnd - candidateStart <= 1
        && textLength(candidate) <= TARGET_CHUNK_MAXIMUM
      ) {
        current = candidate;
      }
    }
    emitCurrent();
  });

  return chunks.map((chunk, vectorPosition) => ({ ...chunk, vector_position: vectorPosition }));
}

async function embedChunks(chunks) {
  const modelFile = resolve(modelDirectory, "onnx", "model_int8.onnx");
  assert(existsSync(modelFile), "Local BGE int8 model is missing. Run npm run rag:prepare-model first.");
  assert(
    sha256File(modelFile) === BIOLOGY_RAG.modelInt8Sha256,
    "Local BGE int8 model hash does not match the required fixed revision."
  );
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = modelDirectory.slice(0, modelDirectory.length - "Xenova/bge-small-zh-v1.5".length);
  const extractor = await pipeline("feature-extraction", BIOLOGY_RAG.modelId, {
    revision: BIOLOGY_RAG.modelRevision,
    dtype: "int8",
    local_files_only: true
  });
  const vectors = new Float32Array(chunks.length * BIOLOGY_RAG.modelDimension);
  for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE).map((chunk) => chunk.text);
    const result = await extractor(batch, {
      pooling: "cls",
      normalize: true,
      truncation: true,
      max_length: 512
    });
    assert(
      result.data.length === batch.length * BIOLOGY_RAG.modelDimension,
      "Unexpected BGE vector dimension for chunk batch at offset " + offset
    );
    vectors.set(result.data, offset * BIOLOGY_RAG.modelDimension);
    console.log("Embedded " + Math.min(offset + batch.length, chunks.length) + "/" + chunks.length + " chunks");
  }
  return vectors;
}

assert(existsSync(sourcePdf), "Source PDF was not found: " + sourcePdf);
assert(existsSync(mineruDirectory), "MinerU output directory was not found: " + mineruDirectory);

const contentListPath = findMineruFile(mineruDirectory, /_content_list\.json$/u);
const middlePath = findMineruFile(mineruDirectory, /_middle\.json$/u);
const sourceHashes = assertPinnedRagSourceHashes({ sourcePdf, contentListPath, middlePath });
const contentList = await readJson(contentListPath);
const middle = await readJson(middlePath);
const chapters = await readJson(chaptersPath);
const evaluationSet = await readJson(evaluationSetPath);

assert(Array.isArray(contentList) && contentList.length === 2013, "Expected 2,013 MinerU content entries.");
assert(Array.isArray(middle.pdf_info) && middle.pdf_info.length === BIOLOGY_RAG.sourcePdfPageCount, "MinerU middle.json page count must be 125.");
assert(Array.isArray(chapters) && chapters.length > 0, "Chapter metadata is missing.");
assert(Array.isArray(evaluationSet.queries) && evaluationSet.queries.length === 50, "Evaluation set must contain exactly 50 queries.");
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters,
  label: "RAG build directory"
});

const entriesByPage = Array.from({ length: BIOLOGY_RAG.sourcePdfPageCount }, () => []);
contentList.forEach((entry, entryIndex) => {
  const pageIndex = Number(entry.page_idx);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= entriesByPage.length) return;
  const text = contentText(entry);
  if (!text) return;
  entriesByPage[pageIndex].push({
    text,
    source_reference: makeSourceReference({
      entry,
      entryIndex,
      pageIndex,
      kind: "content_list"
    })
  });
});

const pages = entriesByPage.map((entries, pageIndex) => {
  const pdfPage = pageIndex + 1;
  let recovered = null;
  if (entries.length === 0) {
    const rawRecovered = recoveredMiddlePageText(middle.pdf_info[pageIndex]);
    if (rawRecovered) {
      recovered = rawRecovered;
      entries.push({
        text: rawRecovered,
        source_reference: makeSourceReference({
          entry: null,
          entryIndex: null,
          pageIndex,
          kind: "middle_recovery",
          recoveredBlock: rawRecovered
        })
      });
    }
  }
  const text = cleanText(entries.map((entry) => entry.text).join("\n"));
  const section = resolveSection(pdfPage, chapters);
  const contentType = classifyPageContent(pdfPage, text, entries, section);
  return {
    pdf_page: pdfPage,
    printed_page: printedPageFor(pdfPage),
    ocr_status: recovered ? "recovered_from_middle_preproc" : text ? "mineru_content_list" : "no_text_documented",
    content_type: contentType,
    text,
    text_characters: text.length,
    content_sha256: sha256(text),
    source_references: entries.map((entry) => entry.source_reference),
    entries
  };
});

assert(pages.length === BIOLOGY_RAG.sourcePdfPageCount, "Page coverage must include all 125 source pages.");
assert(pages.every((page) => page.ocr_status !== "no_text_documented"), "No PDF page may be silently omitted from the corpus.");
assert(pages[5].ocr_status === "recovered_from_middle_preproc", "PDF page 6 must be recovered from middle.json.");

const chunks = buildChunks(pages, chapters);
assert(chunks.length > 100, "Full textbook build produced too few chunks.");
assert(chunks.every((chunk) => chunk.page_end - chunk.page_start <= 1), "A chunk may cover at most two consecutive PDF pages.");
assert(chunks.every((chunk) => chunk.text.length <= TARGET_CHUNK_MAXIMUM), "A chunk exceeded the 700-character maximum.");
assert(
  chunks.every((chunk) => chunk.text.length >= TARGET_CHUNK_MINIMUM || chunk.chunking_exception),
  "A short chunk must carry an explicit, reviewable exception."
);
assert(chunks.every((chunk) => chunk.vector_position >= 0), "Each chunk must have a stable vector position.");
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters,
  chunks,
  label: "RAG build corpus"
});

const vectors = await embedChunks(chunks);
assert(
  vectors.length === chunks.length * BIOLOGY_RAG.modelDimension,
  "Vector count and dimensions do not match generated chunks."
);
const bm25 = buildBm25(chunks);

await mkdir(corpusDirectory, { recursive: true });
const chunksPath = resolve(corpusDirectory, "chunks.json");
const bm25Path = resolve(corpusDirectory, "bm25.json");
const pageMapPath = resolve(corpusDirectory, "page-map.json");
const evaluationOutputPath = resolve(corpusDirectory, "evaluation-set.json");
const vectorsPath = resolve(corpusDirectory, "vectors.f32");
const buildReportPath = resolve(corpusDirectory, "build-report.json");

await writeJsonAtomic(chunksPath, {
  schema_version: BIOLOGY_RAG.schemaVersion,
  corpus_version: BIOLOGY_RAG.corpusVersion,
  chunks
});
await writeJsonAtomic(bm25Path, bm25);
await writeJsonAtomic(pageMapPath, {
  schema_version: BIOLOGY_RAG.schemaVersion,
  source_pdf_page_count: BIOLOGY_RAG.sourcePdfPageCount,
  pages: pages.map((page) => Object.fromEntries(
    Object.entries(page).filter(([key]) => key !== "entries")
  ))
});
await writeJsonAtomic(evaluationOutputPath, evaluationSet);
await writeFile(vectorsPath, new Uint8Array(vectors.buffer));

const shortChunkExceptions = chunks
  .filter((chunk) => chunk.chunking_exception)
  .map((chunk) => ({
    chunk_id: chunk.chunk_id,
    section_id: chunk.section_id,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    text_characters: chunk.text.length,
    reason: chunk.chunking_exception
  }));
const textFingerprints = new Set(chunks.map((chunk) => sha256(chunk.text)));
const corpusArtifactBytes = (await Promise.all([
  chunksPath,
  bm25Path,
  pageMapPath,
  evaluationOutputPath,
  vectorsPath
].map(async (path) => (await stat(path)).size))).reduce((total, bytes) => total + bytes, 0);
const report = {
  schema_version: BIOLOGY_RAG.schemaVersion,
  missing_chapter_one_body: BIOLOGY_RAG.missingChapterOneBody,
  frontmatter: {
    chapter_id: BIOLOGY_FRONTMATTER.chapterId,
    title: BIOLOGY_FRONTMATTER.title,
    pdf_page_start: BIOLOGY_FRONTMATTER.pageStart,
    pdf_page_end: BIOLOGY_FRONTMATTER.pageEnd
  },
  source_inputs: {
    source_pdf_sha256: sourceHashes.source_pdf,
    content_list_sha256: sourceHashes.content_list,
    middle_sha256: sourceHashes.middle
  },
  source_pdf_page_count: BIOLOGY_RAG.sourcePdfPageCount,
  covered_page_count: pages.length,
  content_list_entries: contentList.length,
  pages_from_content_list: pages.filter((page) => page.ocr_status === "mineru_content_list").length,
  recovered_pages: pages.filter((page) => page.ocr_status === "recovered_from_middle_preproc").map((page) => page.pdf_page),
  no_text_documented_pages: pages.filter((page) => page.ocr_status === "no_text_documented").map((page) => page.pdf_page),
  text_characters: pages.reduce((total, page) => total + page.text_characters, 0),
  chunk_count: chunks.length,
  chunk_characters: {
    minimum: Math.min(...chunks.map((chunk) => chunk.text.length)),
    maximum: Math.max(...chunks.map((chunk) => chunk.text.length)),
    short_exception_count: shortChunkExceptions.length,
    short_exceptions: shortChunkExceptions
  },
  vector_dimension: BIOLOGY_RAG.modelDimension,
  vector_bytes: (await stat(vectorsPath)).size,
  index_artifact_bytes: corpusArtifactBytes,
  duplicate_chunk_ratio: 1 - textFingerprints.size / chunks.length,
  page_map_validation: "pending rag:validate"
};
await writeJsonAtomic(buildReportPath, report);

const artifactPaths = {
  chunks: chunksPath,
  bm25: bm25Path,
  page_map: pageMapPath,
  evaluation_set: evaluationOutputPath,
  vectors: vectorsPath,
  build_report: buildReportPath
};
const artifacts = Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async ([key, path]) => [
  key,
  {
    path: "rag/" + BIOLOGY_RAG.corpusVersion + "/" + path.split(/[\\/]/u).at(-1),
    bytes: (await stat(path)).size,
    sha256: sha256File(path)
  }
])));

const manifest = {
  schema_version: BIOLOGY_RAG.schemaVersion,
  corpus_version: BIOLOGY_RAG.corpusVersion,
  book_id: BIOLOGY_RAG.bookId,
  source: {
    filename: sourcePdf.split(/[\\/]/u).at(-1),
    sha256: BIOLOGY_RAG.sourcePdfSha256,
    bytes: (await stat(sourcePdf)).size,
    pdf_page_count: BIOLOGY_RAG.sourcePdfPageCount,
    content_scope: "只覆盖当前源 PDF 的 125 个 PDF 页；源 PDF 的目录后直接进入第 2 章，不含第 1 章正文，构建器不会从互联网补齐另一版本。",
    missing_chapter_one_body: BIOLOGY_RAG.missingChapterOneBody,
    frontmatter: {
      chapter_id: BIOLOGY_FRONTMATTER.chapterId,
      title: BIOLOGY_FRONTMATTER.title,
      pdf_page_start: BIOLOGY_FRONTMATTER.pageStart,
      pdf_page_end: BIOLOGY_FRONTMATTER.pageEnd
    }
  },
  mineru: {
    parser: "MinerU 3.4.4",
    content_list_filename: contentListPath.split(/[\\/]/u).at(-1),
    content_list_sha256: sourceHashes.content_list,
    middle_filename: middlePath.split(/[\\/]/u).at(-1),
    middle_sha256: sourceHashes.middle,
    content_list_entries: contentList.length,
    page_count: middle.pdf_info.length,
    page_6_recovery: "middle.json preproc_blocks directory text"
  },
  chunking: {
    target_characters: [TARGET_CHUNK_MINIMUM, TARGET_CHUNK_MAXIMUM],
    overlap_characters: TARGET_CHUNK_OVERLAP,
    max_consecutive_pdf_pages: 2,
    chunk_count: chunks.length,
    short_chunk_exceptions: shortChunkExceptions
  },
  embeddings: {
    model_id: BIOLOGY_RAG.modelId,
    revision: BIOLOGY_RAG.modelRevision,
    model_int8_sha256: BIOLOGY_RAG.modelInt8Sha256,
    dimension: BIOLOGY_RAG.modelDimension,
    pooling: "cls",
    normalize: true,
    query_prefix: BIOLOGY_RAG.queryPrefix,
    provider: "wasm",
    wasm_threads: 1
  },
  retrieval: {
    algorithm_version: "hybrid-cosine-bm25-v1",
    weights: BIOLOGY_RAG.retrievalWeights,
    high_confidence_threshold: null,
    minimum_evidence_threshold: null,
    lexical_fallback_threshold: null,
    calibration: null
  },
  coverage: {
    required_pdf_pages: BIOLOGY_RAG.sourcePdfPageCount,
    covered_pdf_pages: pages.length,
    recovered_pdf_pages: [6],
    no_text_documented_pages: report.no_text_documented_pages
  },
  artifacts
};
assertMissingChapterOneFrontmatterMetadata({
  missingChapterOneBody: BIOLOGY_RAG.missingChapterOneBody,
  chapters,
  chunks,
  manifest,
  buildReport: report,
  label: "RAG build publication"
});
await writeJsonAtomic(resolve(corpusDirectory, "manifest.json"), manifest);

console.log(JSON.stringify({
  corpus_version: BIOLOGY_RAG.corpusVersion,
  pages: pages.length,
  recovered_pages: report.recovered_pages,
  chunks: chunks.length,
  vector_bytes: report.vector_bytes,
  corpus_directory: corpusDirectory
}, null, 2));
