import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("published type entry points", () => {
  test("package.json points runtime and declaration entrypoints to dist", () => {
    const pkg = JSON.parse(read("package.json"));

    assert.equal(pkg.main, "./dist/index.js");
    assert.equal(pkg.types, "./dist/index.d.ts");
    assert.deepEqual(pkg.files, ["README.md", "dist"]);
    assert.equal(pkg.scripts.build.includes("unbuild"), true);
    assert.equal(pkg.scripts.typecheck, "tsc --noEmit");

    assert.deepEqual(pkg.exports["."], {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    });
    assert.deepEqual(pkg.exports["./transcript"], {
      types: "./dist/transcript.d.ts",
      import: "./dist/transcript.js",
      default: "./dist/transcript.js",
    });
    assert.deepEqual(pkg.exports["./types"], {
      types: "./dist/types.d.ts",
      import: "./dist/types.js",
      default: "./dist/types.js",
    });
  });

  test("dist artifacts use published .js specifiers instead of source .ts paths", () => {
    for (const relativePath of [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/client.d.ts",
      "dist/transcript.d.ts",
      "dist/types.d.ts",
    ]) {
      const source = read(relativePath);
      assert.doesNotMatch(source, /\.ts["']/u, `${relativePath} still references .ts`);
    }

    assert.match(
      read("dist/index.d.ts"),
      /export \{ CaSessionSourceClient \} from "\.\/client\.js";/u,
    );
    assert.match(
      read("dist/transcript.d.ts"),
      /export declare class SessionMessageBuffer/u,
    );
    assert.match(
      read("dist/types.d.ts"),
      /export interface SessionTranscriptHistoryPage/u,
    );
  });

  test("src/types.ts preserves key source DTO fields", () => {
    const source = read("src/types.ts");

    for (const snippet of [
      "export interface Session {",
      "gitBranch?: string",
      "userMessageCount?: number",
      "sourcePath?: string",
      "updatedAt?: string",
      "export interface Message {",
      "sessionId: string;",
      "thinkingText?: string",
      "tokenUsage?: unknown",
      "sourceUuid?: string",
      "toolCalls?: ToolCall[]",
      "export interface SourceEvent {",
      "schemaVersion: string;",
      "messageOrdinal?: number",
      "export interface WatchEventsOptions {",
      "onError?:",
      "export interface CaSessionSourceClientOptions {",
      "fetch?: typeof fetch",
      "sourceEventsPath?: string",
      "export interface SessionTranscriptSnapshot {",
      "startOrdinal: number;",
      "export interface SessionTranscriptHistoryPage {",
      "beforeOrdinal: number;",
      "hasMore: boolean;",
    ]) {
      assert.match(
        source,
        new RegExp(escapeRegExp(snippet)),
        `missing DTO source snippet: ${snippet}`,
      );
    }
  });

  test("src/transcript.ts preserves transcript helper signatures", () => {
    const source = read("src/transcript.ts");

    for (const snippet of [
      "export interface FetchSessionTranscriptOptions {",
      "expectedMessageCount?: number",
      "tailMessageCount?: number",
      "export interface ConsumeTranscriptEventOptions {",
      "export interface FetchEarlierSessionTranscriptPageOptions {",
      "beforeOrdinal?: number",
      "export interface WatchSessionTranscriptOptions",
      "extends FetchSessionTranscriptOptions,",
      "WatchEventsOptions {",
      "onEvent?: (event: SourceEvent) => void | Promise<void>;",
      "onUpdate?: (",
      "export interface WatchedSessionTranscript {",
      "fetchEarlierPage(",
      "readonly closed: Promise<void>;",
      "export class SessionMessageBuffer {",
      "get earliestOrdinal(): number {",
      "get latestOrdinal(): number {",
      "append(messages: Message[]): Message[] {",
      "export async function fetchSessionTranscriptSnapshot(",
      "export async function consumeTranscriptEvent(",
      "export async function fetchEarlierSessionTranscriptPage(",
      "export async function watchSessionTranscript(",
    ]) {
      assert.match(
        source,
        new RegExp(escapeRegExp(snippet)),
        `missing transcript source snippet: ${snippet}`,
      );
    }
  });
});

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
