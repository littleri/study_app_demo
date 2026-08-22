import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BIOLOGY_RAG,
  assert,
  projectPath,
  sha256File,
  writeJsonAtomic
} from "./rag-common.mjs";

const pageCount = BIOLOGY_RAG.sourcePdfPageCount;
const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
const sourceDirectory = sourceArgument
  ? resolve(sourceArgument.slice("--source=".length))
  : projectPath(".cache", "unpublished-textbook-pages");
const destinationDirectory = projectPath("public", "assets", "textbook", "pages");
const manifestPath = projectPath("src", "data", "published-citation-source-page-assets.json");

function pageFilename(page) {
  return `page_${String(page).padStart(3, "0")}.jpeg`;
}

function pageUrl(page) {
  return `/assets/textbook/pages/${pageFilename(page)}`;
}

const sourceDetails = await stat(sourceDirectory).catch(() => null);
assert(sourceDetails?.isDirectory(), `Source page cache is unavailable: ${sourceDirectory}`);

const sourceFiles = new Set(await readdir(sourceDirectory));
const expectedFiles = Array.from({ length: pageCount }, (_, index) => pageFilename(index + 1));
const missingFiles = expectedFiles.filter((filename) => !sourceFiles.has(filename));
assert(
  missingFiles.length === 0,
  `Source page cache is incomplete; missing ${missingFiles.length} page(s)${missingFiles[0] ? `, beginning with ${missingFiles[0]}` : ""}.`
);

await mkdir(destinationDirectory, { recursive: true });

const assets = [];
for (let page = 1; page <= pageCount; page += 1) {
  const filename = pageFilename(page);
  const sourcePath = resolve(sourceDirectory, filename);
  const destinationPath = resolve(destinationDirectory, filename);
  await copyFile(sourcePath, destinationPath);
  assets.push({
    book_id: BIOLOGY_RAG.bookId,
    pdf_page: page,
    url: pageUrl(page),
    sha256: sha256File(destinationPath)
  });
}

await writeJsonAtomic(manifestPath, {
  schema_version: 1,
  book_id: BIOLOGY_RAG.bookId,
  page_count: pageCount,
  assets
});

console.log(JSON.stringify({
  status: "published",
  book_id: BIOLOGY_RAG.bookId,
  page_count: pageCount,
  source_directory: sourceDirectory,
  destination_directory: destinationDirectory,
  manifest: manifestPath
}, null, 2));
