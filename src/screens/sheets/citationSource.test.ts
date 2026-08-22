import { describe, expect, it } from "vitest";
import type { ApiAsset } from "../../types/api";
import { getExtractedCitationSourcePageImage } from "./citationSource";

const generatedDiagram: ApiAsset = {
  asset_id: "asset-generated-diagram",
  book_id: "book-1",
  chapter_id: "chapter-1",
  source_type: "ai_generated",
  type: "diagram",
  caption: "AI 生成示意图",
  image_url: "/assets/generated-diagram.webp",
  thumbnail_url: "/assets/generated-diagram-thumb.webp",
  source_page_image_url: null,
  source_chunk_ids: ["chunk-citation"],
  concepts: ["DNA"],
  generation_provider: "fixture",
  review_status: "ready"
};

const extractedCrop: ApiAsset = {
  asset_id: "asset-extracted-crop",
  book_id: "book-1",
  chapter_id: "chapter-1",
  source_type: "extracted",
  page: 15,
  type: "figure",
  caption: "教材页内裁剪图",
  bbox: [10, 10, 120, 120],
  image_url: "/assets/page-15-crop.webp",
  thumbnail_url: "/assets/page-15-crop-thumb.webp",
  source_page_image_url: "/assets/source-page-15.webp",
  source_chunk_ids: ["chunk-citation"],
  concepts: ["DNA"]
};

describe("citation source page image", () => {
  it("rejects AI-generated assets and adopts only the extracted source page URL", () => {
    const generatedAssetWithPretendPage = {
      ...generatedDiagram,
      source_page_image_url: "/assets/not-a-textbook-page.webp"
    } as unknown as ApiAsset;

    expect(getExtractedCitationSourcePageImage("chunk-citation", [
      generatedAssetWithPretendPage,
      extractedCrop
    ])).toBe("/assets/source-page-15.webp");
  });

  it("does not treat a generated diagram or a cropped image URL as a textbook original page", () => {
    expect(getExtractedCitationSourcePageImage("chunk-citation", [generatedDiagram])).toBeUndefined();

    const extractedWithoutSourcePage: ApiAsset = {
      ...extractedCrop,
      asset_id: "asset-crop-without-page",
      source_page_image_url: "   "
    };
    expect(getExtractedCitationSourcePageImage("chunk-citation", [
      extractedWithoutSourcePage
    ])).toBeUndefined();
  });

  it("requires an exact citation chunk association", () => {
    expect(getExtractedCitationSourcePageImage("other-chunk", [extractedCrop])).toBeUndefined();
  });
});
