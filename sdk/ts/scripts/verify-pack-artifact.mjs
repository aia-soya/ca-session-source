import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = resolve(root, "package.json");
const tarballPath = process.argv[2];

if (!tarballPath) {
  console.error("usage: node ./scripts/verify-pack-artifact.mjs <tarball-path>");
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const tarEntries = await listTarEntries(tarballPath);

assertEntry(tarEntries, "package/package.json");
assertEntry(tarEntries, "package/README.md");

for (const publishedPath of collectPublishedPaths(packageJson)) {
  assertEntry(tarEntries, "package/" + stripLeadingDotSlash(publishedPath));
}

function collectPublishedPaths(packageJson) {
  const paths = new Set();

  if (typeof packageJson.main === "string") {
    paths.add(packageJson.main);
  }
  if (typeof packageJson.types === "string") {
    paths.add(packageJson.types);
  }

  const exportsField = packageJson.exports;
  if (exportsField && typeof exportsField === "object") {
    for (const value of Object.values(exportsField)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      for (const target of Object.values(value)) {
        if (typeof target === "string") {
          paths.add(target);
        }
      }
    }
  }

  return [...paths].sort();
}

async function listTarEntries(tarballPath) {
  const { stdout } = await execFile("tar", ["-tf", tarballPath], {
    cwd: root,
  });

  return new Set(
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function assertEntry(entries, expected) {
  if (!entries.has(expected)) {
    console.error(
      `packed artifact ${basename(tarballPath)} is missing required entry: ${expected}`,
    );
    process.exit(1);
  }
}

function stripLeadingDotSlash(value) {
  return value.startsWith("./") ? value.slice(2) : value;
}
