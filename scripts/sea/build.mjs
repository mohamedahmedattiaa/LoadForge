import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "../..");

const entryPoint = resolve(projectRoot, "src/index.ts");
const outputFile = resolve(currentDirectory, "bundle.cjs");

try {
  await build({
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    packages: "bundle",
    minify: false,
    sourcemap: false,
  });

  console.log("LoadForge bundle created successfully.");
  console.log(`Output: ${outputFile}`);
} catch (error) {
  console.error("Failed to create LoadForge bundle:", error);
  process.exitCode = 1;
}