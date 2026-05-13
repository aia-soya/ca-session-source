import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(root, "dist");

for (const filePath of await listBuildOutputs(distDir)) {
  const source = await readFile(filePath, "utf8");
  const rewritten = rewriteRelativeTypeScriptExtensions(source);

  if (rewritten !== source) {
    await writeFile(filePath, rewritten, "utf8");
  }
}

async function listBuildOutputs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listBuildOutputs(fullPath));
      continue;
    }

    if (isBuildOutput(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function isBuildOutput(filePath) {
  return filePath.endsWith(".js") || filePath.endsWith(".d.ts");
}

function rewriteRelativeTypeScriptExtensions(source) {
  return source.replace(
    /((?:from\s*|import\s*\()\s*["'])(\.{1,2}\/[^"']+)\.ts(["'])/gu,
    "$1$2.js$3",
  );
}
