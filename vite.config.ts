import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const certificateDirectory = resolve(projectRoot, "certs");
const certificateKeyPath = resolve(certificateDirectory, "lan-key.pem");
const certificatePath = resolve(certificateDirectory, "lan-cert.pem");
const hasLanCertificate = existsSync(certificateKeyPath) && existsSync(certificatePath);
const httpsOptions = hasLanCertificate
  ? {
      https: {
        key: readFileSync(certificateKeyPath),
        cert: readFileSync(certificatePath)
      }
    }
  : {};

if (!hasLanCertificate) {
  console.warn(
    "[vite] LAN HTTPS certificate not found. Run the project certificate setup before starting the PWA demo."
  );
}

export default defineConfig({
  plugins: [react()],
  // Transformers.js imports ONNX Runtime inside the textbook Worker. Select
  // ONNX Runtime's documented external-WASM condition so Vite does not copy a
  // second bundled JSEP runtime; the pinned one-thread WASM lives under
  // public/rag/runtime/wasm and is configured by the worker itself.
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm", "module", "browser", "production"]
  },
  server: {
    host: true,
    port: 5173,
    ...httpsOptions
  },
  preview: {
    host: true,
    port: 4173,
    ...httpsOptions
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"]
  }
});
