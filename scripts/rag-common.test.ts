import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BIOLOGY_FRONTMATTER,
  assertArtifactFileIntegrity,
  assertMissingChapterOneFrontmatterMetadata,
  assertPinnedRagSourceHashes,
  assertRetrievalCalibrationConsistency,
  sha256
} from "./rag-common.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function trustedFixture() {
  const directory = await mkdtemp(join(tmpdir(), "biology-rag-hash-test-"));
  temporaryDirectories.push(directory);
  const sourcePdf = join(directory, "source.pdf");
  const contentListPath = join(directory, "source_content_list.json");
  const middlePath = join(directory, "source_middle.json");
  const source = "trusted-pdf";
  const contentList = "trusted-content-list";
  const middle = "trusted-middle";
  await Promise.all([
    writeFile(sourcePdf, source),
    writeFile(contentListPath, contentList),
    writeFile(middlePath, middle)
  ]);
  return {
    sourcePdf,
    contentListPath,
    middlePath,
    trusted: {
      sourcePdfSha256: sha256(source),
      mineruContentListSha256: sha256(contentList),
      mineruMiddleSha256: sha256(middle)
    }
  };
}

describe("pinned Biology RAG source hashes", () => {
  it("accepts the exact trusted PDF and both trusted MinerU exports", async () => {
    const fixture = await trustedFixture();

    expect(assertPinnedRagSourceHashes(fixture)).toEqual({
      source_pdf: fixture.trusted.sourcePdfSha256,
      content_list: fixture.trusted.mineruContentListSha256,
      middle: fixture.trusted.mineruMiddleSha256
    });
  });

  it("fails closed when a structurally plausible content_list export is mutated", async () => {
    const fixture = await trustedFixture();
    await writeFile(fixture.contentListPath, "trusted-content-list-with-one-changed-character");

    expect(() => assertPinnedRagSourceHashes(fixture))
      .toThrow("MinerU content_list SHA-256 does not match the pinned source export.");
  });

  it("fails closed when the middle export is mutated", async () => {
    const fixture = await trustedFixture();
    await writeFile(fixture.middlePath, "trusted-middle-with-one-changed-character");

    expect(() => assertPinnedRagSourceHashes(fixture))
      .toThrow("MinerU middle.json SHA-256 does not match the pinned source export.");
  });
});

function frontmatterPublicationFixture() {
  const frontmatter = {
    chapter_id: BIOLOGY_FRONTMATTER.chapterId,
    title: BIOLOGY_FRONTMATTER.title,
    pdf_page_start: BIOLOGY_FRONTMATTER.pageStart,
    pdf_page_end: BIOLOGY_FRONTMATTER.pageEnd
  };
  return {
    chapters: [{
      chapter_id: "frontmatter",
      level: 1,
      source_title: BIOLOGY_FRONTMATTER.title,
      ai_title: BIOLOGY_FRONTMATTER.title,
      page_start: 1,
      page_end: 9
    }, {
      chapter_id: "c2",
      level: 1,
      source_title: "第 2 章 基因和染色体的关系",
      ai_title: "第 2 章 基因和染色体的关系",
      page_start: 10,
      page_end: 35
    }],
    chunks: [{
      chapter_id: "frontmatter",
      section_id: "frontmatter",
      page_start: 1,
      page_end: 2,
      title_path: [BIOLOGY_FRONTMATTER.title]
    }],
    manifest: {
      source: {
        missing_chapter_one_body: true,
        frontmatter: { ...frontmatter }
      }
    },
    buildReport: {
      missing_chapter_one_body: true,
      frontmatter: { ...frontmatter }
    }
  };
}

describe("missing Chapter 1 frontmatter publication policy", () => {
  it("accepts a semantically named PDF 1–9 frontmatter node across all publication layers", () => {
    const fixture = frontmatterPublicationFixture();
    expect(() => assertMissingChapterOneFrontmatterMetadata({
      missingChapterOneBody: true,
      ...fixture,
      label: "fixture"
    })).not.toThrow();
  });

  it("fails closed if a generated directory, corpus, or report maps PDF 1–9 to Chapter 1", () => {
    const directoryFixture = frontmatterPublicationFixture();
    directoryFixture.chapters[0].source_title = "第 1 章 遗传因子的发现";
    expect(() => assertMissingChapterOneFrontmatterMetadata({
      missingChapterOneBody: true,
      ...directoryFixture,
      label: "directory mutation"
    })).toThrow(/frontmatter source title is invalid|must not be named as Chapter 1/);

    const corpusFixture = frontmatterPublicationFixture();
    corpusFixture.chunks[0].chapter_id = "c2";
    expect(() => assertMissingChapterOneFrontmatterMetadata({
      missingChapterOneBody: true,
      ...corpusFixture,
      label: "corpus mutation"
    })).toThrow("frontmatter chunk is mapped to a non-frontmatter chapter.");

    const reportFixture = frontmatterPublicationFixture();
    reportFixture.buildReport.frontmatter.title = "第 1 章 遗传因子的发现";
    expect(() => assertMissingChapterOneFrontmatterMetadata({
      missingChapterOneBody: true,
      ...reportFixture,
      label: "report mutation"
    })).toThrow("build report frontmatter title is invalid.");
  });
});

function calibratedPublicationFixture() {
  const selectedThresholds = {
    high_confidence: 0.6037,
    minimum_evidence: 0.6037,
    lexical_fallback: 58.6184
  };
  const reportHash = "a".repeat(64);
  return {
    manifest: {
      retrieval: {
        high_confidence_threshold: selectedThresholds.high_confidence,
        minimum_evidence_threshold: selectedThresholds.minimum_evidence,
        lexical_fallback_threshold: selectedThresholds.lexical_fallback,
        calibration: {
          report_sha256: reportHash,
          selected_thresholds: { ...selectedThresholds }
        }
      },
      artifacts: {
        evaluation_report: { sha256: reportHash }
      }
    },
    evaluationReport: {
      selected_thresholds: { ...selectedThresholds },
      lexical_fallback: {
        selected: { threshold: selectedThresholds.lexical_fallback }
      }
    }
  };
}

describe("published RAG calibration integrity", () => {
  it("accepts exactly matching evaluator thresholds and report commitment", () => {
    const fixture = calibratedPublicationFixture();
    expect(() => assertRetrievalCalibrationConsistency(fixture.manifest, fixture.evaluationReport)).not.toThrow();
  });

  it("fails closed if a manifest lexical fallback threshold is lowered after evaluation", () => {
    const fixture = calibratedPublicationFixture();
    fixture.manifest.retrieval.lexical_fallback_threshold = 1.2288;

    expect(() => assertRetrievalCalibrationConsistency(fixture.manifest, fixture.evaluationReport))
      .toThrow("Manifest lexical_fallback threshold does not match evaluation-report.selected_thresholds.lexical_fallback.");
  });

  it("fails closed if a manifest hybrid threshold is changed after evaluation", () => {
    const fixture = calibratedPublicationFixture();
    fixture.manifest.retrieval.high_confidence_threshold = 0.1;

    expect(() => assertRetrievalCalibrationConsistency(fixture.manifest, fixture.evaluationReport))
      .toThrow("Manifest high_confidence threshold does not match evaluation-report.selected_thresholds.high_confidence.");
  });

  it("fails closed if the evaluation report threshold is changed without a matching publication", () => {
    const fixture = calibratedPublicationFixture();
    fixture.evaluationReport.selected_thresholds.minimum_evidence = 0.1;

    expect(() => assertRetrievalCalibrationConsistency(fixture.manifest, fixture.evaluationReport))
      .toThrow("Manifest minimum_evidence threshold does not match evaluation-report.selected_thresholds.minimum_evidence.");
  });

  it("fails closed when an evaluated report file is rewritten after its artifact hash was recorded", async () => {
    const directory = await mkdtemp(join(tmpdir(), "biology-rag-artifact-test-"));
    temporaryDirectories.push(directory);
    const reportPath = join(directory, "evaluation-report.json");
    const original = "{\"selected_thresholds\":{\"lexical_fallback\":58.6184}}\n";
    await writeFile(reportPath, original);
    const artifact = { bytes: Buffer.byteLength(original), sha256: sha256(original) };

    expect(() => assertArtifactFileIntegrity({ artifact, absolutePath: reportPath, label: "evaluation_report" })).not.toThrow();
    await writeFile(reportPath, "{\"selected_thresholds\":{\"lexical_fallback\":1.2288}}\n");

    expect(() => assertArtifactFileIntegrity({ artifact, absolutePath: reportPath, label: "evaluation_report" }))
      .toThrow(/Artifact (byte size|SHA-256) does not match manifest for evaluation_report/);
  });
});
