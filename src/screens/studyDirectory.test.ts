import { describe, expect, it } from "vitest";
import chapters from "../data/generated/chapters.json";
import type { ApiChapter } from "../types/api";
import { buildStudyDirectory, normalizeStudyLocation } from "./studyDirectory";

describe("buildStudyDirectory", () => {
  const directory = buildStudyDirectory(chapters as ApiChapter[]);

  it("removes the textbook cover/frontmatter entry", () => {
    expect(directory.map((node) => node.chapter.chapter_id)).not.toContain("frontmatter");
    expect(directory).toHaveLength(7);
  });

  it("keeps only chapter and formal-section levels", () => {
    expect(directory.flatMap((node) => node.children)).toHaveLength(19);
    expect(directory.flatMap((node) => node.children).every((node) => node.children.length === 0)).toBe(true);
  });

  it("does not expose parsed subheadings as separate entrances", () => {
    const chapterTwo = directory.find((node) => node.chapter.chapter_id === "c2");
    expect(chapterTwo?.children.map((node) => node.chapter.chapter_id)).toEqual(["c2s1", "c2s2", "c2s3"]);
    expect(chapterTwo?.children.map((node) => node.chapter.chapter_id)).not.toContain("c2s1a");
    expect(chapterTwo?.children.map((node) => node.chapter.chapter_id)).not.toContain("c2s1b");
  });

  it("migrates saved frontmatter and nested-heading locations to visible sections", () => {
    expect(normalizeStudyLocation(directory, {
      expandedChapterId: "frontmatter",
      expandedSectionId: "frontmatter"
    })).toEqual({ expandedChapterId: "c1", expandedSectionId: "c1s1" });
    expect(normalizeStudyLocation(directory, {
      expandedChapterId: "c2",
      expandedSectionId: "c2s1a"
    })).toEqual({ expandedChapterId: "c2", expandedSectionId: "c2s1" });
  });
});
