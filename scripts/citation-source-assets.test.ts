import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "./rag-common.mjs";
import { assertPublishedCitationSourcePageAssets } from "./citation-source-assets.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "citation-source-assets-"));
  temporaryDirectories.push(directory);
  const sourceDirectory = join(directory, "assets", "textbook", "pages");
  await mkdir(sourceDirectory, { recursive: true });
  const sourcePath = join(sourceDirectory, "page-015.jpeg");
  const sourceText = "tracked textbook source page";
  await writeFile(sourcePath, sourceText);
  return {
    directory,
    sourcePath,
    sourceText,
    manifest: {
      schema_version: 1,
      assets: [{
        url: "/assets/textbook/pages/page-015.jpeg",
        sha256: sha256(sourceText)
      }]
    }
  };
}

describe("published citation source assets", () => {
  it("accepts a hash-verified tracked asset", async () => {
    const data = await fixture();
    expect(assertPublishedCitationSourcePageAssets({
      assetManifest: data.manifest,
      publicDirectory: data.directory,
      isTracked: (path: string) => path === data.sourcePath
    })).toEqual({ published_asset_count: 1, discovered_page_asset_count: 1 });
  });

  it("validates a copied build asset against the separately tracked public source", async () => {
    const data = await fixture();
    const outputDirectory = join(data.directory, "dist");
    const outputPath = join(outputDirectory, "assets", "textbook", "pages", "page-015.jpeg");
    await mkdir(join(outputDirectory, "assets", "textbook", "pages"), { recursive: true });
    await copyFile(data.sourcePath, outputPath);

    expect(assertPublishedCitationSourcePageAssets({
      assetManifest: data.manifest,
      publicDirectory: outputDirectory,
      trackedPublicDirectory: data.directory,
      isTracked: (path: string) => path === data.sourcePath
    })).toEqual({ published_asset_count: 1, discovered_page_asset_count: 1 });
  });

  it("rejects a local-only untracked asset even when its file and hash exist", async () => {
    const data = await fixture();
    expect(() => assertPublishedCitationSourcePageAssets({
      assetManifest: data.manifest,
      publicDirectory: data.directory,
      isTracked: () => false
    })).toThrow("Published citation source asset is not tracked by Git: /assets/textbook/pages/page-015.jpeg");
  });

  it("rejects a rewritten page asset after its registry hash was recorded", async () => {
    const data = await fixture();
    await writeFile(data.sourcePath, "rewritten author-local page");
    expect(() => assertPublishedCitationSourcePageAssets({
      assetManifest: data.manifest,
      publicDirectory: data.directory,
      isTracked: () => true
    })).toThrow("Published citation source asset SHA-256 mismatch: /assets/textbook/pages/page-015.jpeg");
  });

  it("rejects an unlisted supported image even when the manifest has a valid tracked entry", async () => {
    const data = await fixture();
    await writeFile(join(data.directory, "assets", "textbook", "pages", "page-016.jpeg"), "unlisted page");

    expect(() => assertPublishedCitationSourcePageAssets({
      assetManifest: data.manifest,
      publicDirectory: data.directory,
      isTracked: () => true
    })).toThrow("Published citation source page asset is not registered: /assets/textbook/pages/page-016.jpeg");
  });

  it("requires an empty page directory when the publication manifest is empty", async () => {
    const data = await fixture();
    const emptyManifest = { schema_version: 1, assets: [] };

    expect(() => assertPublishedCitationSourcePageAssets({
      assetManifest: emptyManifest,
      publicDirectory: data.directory,
      isTracked: () => true
    })).toThrow("Published citation source page asset is not registered: /assets/textbook/pages/page-015.jpeg");
  });

  it("accepts an empty manifest only when no supported page images are published", async () => {
    const directory = await mkdtemp(join(tmpdir(), "citation-source-assets-empty-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "assets", "textbook", "pages"), { recursive: true });

    expect(assertPublishedCitationSourcePageAssets({
      assetManifest: { schema_version: 1, assets: [] },
      publicDirectory: directory,
      isTracked: () => false
    })).toEqual({ published_asset_count: 0, discovered_page_asset_count: 0 });
  });
});
