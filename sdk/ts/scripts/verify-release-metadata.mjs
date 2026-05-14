import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = resolve(root, "package.json");
const readmePath = resolve(root, "README.md");
const licensePath = resolve(root, "LICENSE");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const errors = [];

assertStringField(errors, packageJson, "name");
assertStringField(errors, packageJson, "version");
assertStringField(errors, packageJson, "description");
assertStringField(errors, packageJson, "license");
assertStringField(errors, packageJson, "main");
assertStringField(errors, packageJson, "types");

assertSemver(errors, packageJson.version);
assertStringField(errors, packageJson.engines ?? {}, "node", "engines.node");
assertStringField(errors, packageJson.publishConfig ?? {}, "access", "publishConfig.access");

assertStringArray(errors, packageJson.keywords, "keywords");
assertIncludes(errors, packageJson.files, "README.md", "files");
assertIncludes(errors, packageJson.files, "LICENSE", "files");
assertIncludes(errors, packageJson.files, "dist", "files");

assertRepository(errors, packageJson.repository);
assertUrl(errors, packageJson.homepage, "homepage");
assertBugs(errors, packageJson.bugs);

await assertReadable(errors, readmePath, "README.md");
await assertReadable(errors, licensePath, "LICENSE");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

if (packageJson.private === true) {
  console.log(
    "release-check: package.json keeps private=true; npm publish --dry-run skipped under current tarball-first strategy.",
  );
  process.exit(0);
}

await execFile("npm", ["publish", "--dry-run"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

function assertStringField(errors, object, key, label = key) {
  if (!object || typeof object[key] !== "string" || object[key].trim() === "") {
    errors.push(`release-check: missing required string field ${label}`);
  }
}

function assertSemver(errors, version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push("release-check: package.json version must be semver-like (X.Y.Z)");
  }
}

function assertStringArray(errors, value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    errors.push(`release-check: ${label} must be a non-empty string array`);
  }
}

function assertIncludes(errors, value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    errors.push(`release-check: ${label} must include ${expected}`);
  }
}

function assertRepository(errors, repository) {
  if (!repository || typeof repository !== "object") {
    errors.push("release-check: repository must be an object with type/url/directory");
    return;
  }
  assertStringField(errors, repository, "type", "repository.type");
  assertStringField(errors, repository, "url", "repository.url");
  assertStringField(errors, repository, "directory", "repository.directory");
}

function assertBugs(errors, bugs) {
  if (!bugs || typeof bugs !== "object") {
    errors.push("release-check: bugs must be an object with url");
    return;
  }
  assertUrl(errors, bugs.url, "bugs.url");
}

function assertUrl(errors, value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`release-check: missing required URL field ${label}`);
    return;
  }
  try {
    new URL(value);
  } catch {
    errors.push(`release-check: ${label} must be a valid URL`);
  }
}

async function assertReadable(errors, filePath, label) {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    errors.push(`release-check: required file not readable: ${label}`);
  }
}
