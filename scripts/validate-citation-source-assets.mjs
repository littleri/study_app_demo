import { resolve } from "node:path";
import { assert, projectPath, projectRoot, readJson } from "./rag-common.mjs";
import { assertPublishedCitationSourcePageAssets } from "./citation-source-assets.mjs";

const publicDirectoryArgument = process.argv.find((argument) => argument.startsWith("--public-directory="));
const publicDirectory = publicDirectoryArgument
  ? resolve(projectRoot, publicDirectoryArgument.slice("--public-directory=".length))
  : projectPath("public");
assert(
  publicDirectory === projectRoot || publicDirectory.startsWith(`${projectRoot}\\`) || publicDirectory.startsWith(`${projectRoot}/`),
  "Citation source public-directory must remain inside the workspace."
);
const assetManifest = await readJson(projectPath("src", "data", "published-citation-source-page-assets.json"));
const result = assertPublishedCitationSourcePageAssets({
  assetManifest,
  publicDirectory,
  trackedPublicDirectory: projectPath("public")
});

console.log(JSON.stringify({ status: "passed", public_directory: publicDirectory, ...result }, null, 2));
