import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { assert, projectRoot, sha256 } from "./rag-common.mjs";

export const PUBLISHED_SOURCE_PAGE_URL_PREFIX = "/assets/textbook/pages/";
export const SUPPORTED_SOURCE_PAGE_EXTENSIONS = Object.freeze(new Set([
  ".avif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp"
]));

function isTrackedInGit(absolutePath) {
  const repositoryPath = relative(projectRoot, absolutePath).split(sep).join("/");
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", repositoryPath], {
      cwd: projectRoot,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function publishedAssetPath(publicDirectory, url) {
  assert(typeof url === "string" && url.startsWith("/"), "Published citation source asset URL must be an absolute public URL.");
  assert(!url.includes("\\") && !url.split("/").includes(".."), "Published citation source asset URL escapes the public directory.");
  assert(url.startsWith(PUBLISHED_SOURCE_PAGE_URL_PREFIX), "Published citation source asset must be under /assets/textbook/pages/.");
  assert(
    SUPPORTED_SOURCE_PAGE_EXTENSIONS.has(extname(url).toLocaleLowerCase("en-US")),
    "Published citation source asset has an unsupported page-image extension: " + url
  );
  const absolutePath = resolve(publicDirectory, `.${url}`);
  const normalizedPublicDirectory = resolve(publicDirectory);
  assert(
    absolutePath === normalizedPublicDirectory || absolutePath.startsWith(`${normalizedPublicDirectory}${sep}`),
    "Published citation source asset resolves outside the public directory."
  );
  return absolutePath;
}

function publishedAssetUrl(publicDirectory, absolutePath) {
  const normalizedPublicDirectory = resolve(publicDirectory);
  const normalizedPath = resolve(absolutePath);
  assert(
    normalizedPath.startsWith(`${normalizedPublicDirectory}${sep}`),
    "Published citation source page asset resolves outside the public directory."
  );
  return "/" + relative(normalizedPublicDirectory, normalizedPath).split(sep).join("/");
}

function supportedPageImages(pageDirectory) {
  if (!existsSync(pageDirectory)) return [];
  return readdirSync(pageDirectory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(pageDirectory, entry.name);
    if (entry.isDirectory()) return supportedPageImages(entryPath);
    return entry.isFile() && SUPPORTED_SOURCE_PAGE_EXTENSIONS.has(extname(entry.name).toLocaleLowerCase("en-US"))
      ? [entryPath]
      : [];
  });
}

/**
 * A citation source-page bitmap may be selected only after it is physically
 * published, tracked by Git, and committed to a SHA-256 registry. This makes a
 * clean clone/APK release reject author-local OCR page paths instead of serving
 * a citation that opens a 404.
 */
export function assertPublishedCitationSourcePageAssets({
  assetManifest,
  publicDirectory,
  trackedPublicDirectory = publicDirectory,
  isTracked = isTrackedInGit
}) {
  assert(assetManifest?.schema_version === 1, "Published citation source asset manifest schema is unsupported.");
  assert(Array.isArray(assetManifest.assets), "Published citation source asset manifest must contain an assets array.");
  const seenUrls = new Set();

  assetManifest.assets.forEach((asset, index) => {
    assert(asset && typeof asset === "object", `Published citation source asset ${index} is invalid.`);
    const url = asset.url;
    const expectedHash = asset.sha256;
    assert(typeof url === "string" && url.trim().length > 1, `Published citation source asset ${index} has no URL.`);
    assert(typeof expectedHash === "string" && /^[a-f0-9]{64}$/iu.test(expectedHash), `Published citation source asset ${url} has no SHA-256.`);
    assert(!seenUrls.has(url), `Published citation source asset URL is duplicated: ${url}`);
    seenUrls.add(url);

    const absolutePath = publishedAssetPath(publicDirectory, url);
    const trackedAbsolutePath = publishedAssetPath(trackedPublicDirectory, url);
    assert(existsSync(absolutePath), `Published citation source asset does not exist: ${url}`);
    assert(existsSync(trackedAbsolutePath), `Published citation source asset is absent from the tracked public directory: ${url}`);
    assert(isTracked(trackedAbsolutePath), `Published citation source asset is not tracked by Git: ${url}`);
    assert(sha256(readFileSync(trackedAbsolutePath)) === expectedHash, `Published citation source asset SHA-256 mismatch: ${url}`);
    assert(sha256(readFileSync(absolutePath)) === expectedHash, `Published citation source asset SHA-256 mismatch: ${url}`);
  });

  const publishedPageDirectory = resolve(publicDirectory, ".", PUBLISHED_SOURCE_PAGE_URL_PREFIX.slice(1));
  const discoveredPageAssets = supportedPageImages(publishedPageDirectory);
  discoveredPageAssets.forEach((absolutePath) => {
    const url = publishedAssetUrl(publicDirectory, absolutePath);
    assert(seenUrls.has(url), `Published citation source page asset is not registered: ${url}`);
  });

  return {
    published_asset_count: assetManifest.assets.length,
    discovered_page_asset_count: discoveredPageAssets.length
  };
}
