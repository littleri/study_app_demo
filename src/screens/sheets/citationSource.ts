import type { ApiAsset } from "../../types/api";

/**
 * A citation card may show only the original textbook page supplied by an
 * extracted asset that explicitly traces back to the cited chunk. Generated
 * diagrams and cropped asset images are not original-page evidence.
 */
export function getExtractedCitationSourcePageImage(
  citationChunkId: string,
  relatedAssets: ApiAsset[]
): string | undefined {
  const sourceAsset = relatedAssets.find((asset) => (
    asset.source_type === "extracted"
    && asset.source_chunk_ids.includes(citationChunkId)
    && typeof asset.source_page_image_url === "string"
    && asset.source_page_image_url.trim().length > 0
  ));
  return sourceAsset?.source_page_image_url ?? undefined;
}
