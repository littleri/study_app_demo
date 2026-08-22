import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BIOLOGY_RAG,
  assert,
  projectPath,
  sha256,
  sha256File,
  writeJsonAtomic
} from "./rag-common.mjs";

const modelRoot = projectPath(BIOLOGY_RAG.modelDirectory);
const wasmRoot = projectPath(BIOLOGY_RAG.wasmDirectory);
const repositoryUrl = `https://huggingface.co/${BIOLOGY_RAG.modelId}/resolve/${BIOLOGY_RAG.modelRevision}/`;
const modelFiles = [
  "config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.txt",
  "onnx/model_int8.onnx"
];

async function downloadFile(relativePath) {
  const target = resolve(modelRoot, relativePath);
  const expectedHash = relativePath === "onnx/model_int8.onnx"
    ? BIOLOGY_RAG.modelInt8Sha256
    : null;
  if (existsSync(target) && (!expectedHash || sha256File(target) === expectedHash)) {
    return {
      path: relativePath,
      bytes: (await stat(target)).size,
      sha256: sha256File(target),
      status: "reused"
    };
  }

  await mkdir(dirname(target), { recursive: true });
  const temporaryPath = `${target}.${process.pid}.tmp`;
  const curlCommand = process.platform === "win32" ? "curl.exe" : "curl";
  try {
    execFileSync(curlCommand, [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--retry",
      "3",
      "--connect-timeout",
      "30",
      "--output",
      temporaryPath,
      `${repositoryUrl}${relativePath}`
    ], {
      stdio: "inherit"
    });
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(
      `Unable to download ${relativePath} with curl: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error }
    );
  }
  const bytes = new Uint8Array(readFileSync(temporaryPath));
  const digest = sha256(bytes);
  if (expectedHash) {
    if (digest !== expectedHash) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new Error(
        `Model hash mismatch for ${relativePath}: expected ${expectedHash}, got ${digest}`
      );
    }
  }
  await rename(temporaryPath, target);
  return {
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: digest,
    status: "downloaded"
  };
}

async function copyWasmRuntime() {
  // ONNX Runtime 1.24's external-WASM build loads the JSEP bridge lazily. Both
  // assets must ship together: omitting the .jsep.mjs bridge silently
  // turns every semantic lookup into a BM25 fallback in browser Workers.
  const runtimeFiles = [
    "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm"
  ];
  await mkdir(wasmRoot, { recursive: true });
  await unlink(resolve(wasmRoot, "ort-wasm-simd-threaded.wasm")).catch(() => undefined);
  return Promise.all(runtimeFiles.map(async (filename) => {
    const source = projectPath("node_modules", "onnxruntime-web", "dist", filename);
    assert(existsSync(source), `Missing onnxruntime-web runtime asset: ${source}`);
    const target = resolve(wasmRoot, filename);
    await copyFile(source, target);
    return {
      path: filename,
      bytes: (await stat(target)).size,
      sha256: sha256File(target)
    };
  }));
}

async function clearStaleTemporaryFiles(directory) {
  if (!existsSync(directory)) return;
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await clearStaleTemporaryFiles(path);
    } else if (entry.isFile() && entry.name.endsWith(".tmp")) {
      await unlink(path);
    }
  }));
}

await clearStaleTemporaryFiles(modelRoot);

const files = [];
for (const file of modelFiles) {
  files.push(await downloadFile(file));
}
const wasmFiles = await copyWasmRuntime();
const wasm = wasmFiles.find((file) => file.path === "ort-wasm-simd-threaded.jsep.wasm");
assert(wasm, "The single-thread ONNX JSEP WASM binary was not copied.");

await writeJsonAtomic(resolve(modelRoot, "model-manifest.json"), {
  schema_version: BIOLOGY_RAG.schemaVersion,
  model_id: BIOLOGY_RAG.modelId,
  revision: BIOLOGY_RAG.modelRevision,
  transformers_version: "3.8.1",
  provider: "wasm",
  wasm_threads: 1,
  pooling: "cls",
  normalize: true,
  dimension: BIOLOGY_RAG.modelDimension,
  query_prefix: BIOLOGY_RAG.queryPrefix,
  files,
  wasm,
  wasm_files: wasmFiles,
  license: "MIT"
});

console.log(
  `Prepared local RAG model: ${files.length} model files, ${wasmFiles.length} ONNX runtime assets, model sha256=${BIOLOGY_RAG.modelInt8Sha256}`
);
