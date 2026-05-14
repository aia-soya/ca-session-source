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
      /SessionMessageBuffer,\s*\};|SessionMessageBuffer,\s*\n/u,
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
      "export interface MessageAnchor {",
      "messageOrdinal: number;",
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
      "latestAnchor?: MessageAnchor",
      "export interface SessionTranscriptHistoryPage {",
      "beforeOrdinal: number;",
      "latestAnchor?: MessageAnchor",
      "hasMore: boolean;",
    ]) {
      assert.match(
        source,
        new RegExp(escapeRegExp(snippet)),
        `missing DTO source snippet: ${snippet}`,
      );
    }
  });

  test("src/transcript modules preserve focused helper boundaries", () => {
    const transcriptSource = read("src/transcript.ts");
    const bufferSource = read("src/transcript-buffer.ts");
    const syncSource = read("src/transcript-sync.ts");

    for (const snippet of [
      'export {',
      "consumeTranscriptEvent,",
      "fetchEarlierSessionTranscriptPage,",
      "fetchSessionTranscriptSnapshot,",
      "SessionMessageBuffer,",
      "export type {",
      "FetchSessionTranscriptOptions,",
      "ConsumeTranscriptEventOptions,",
      "FetchEarlierSessionTranscriptPageOptions,",
      "export interface WatchSessionTranscriptOptions",
      "extends FetchSessionTranscriptOptions,",
      "WatchEventsOptions {",
      "export interface WatchedSessionTranscript {",
      "fetchEarlierPage(",
      "readonly closed: Promise<void>;",
      "export async function watchSessionTranscript(",
    ]) {
      assert.match(
        transcriptSource,
        new RegExp(escapeRegExp(snippet)),
        `missing transcript facade snippet: ${snippet}`,
      );
    }

    for (const snippet of [
      "export class SessionMessageBuffer {",
      "get earliestOrdinal(): number {",
      "get latestOrdinal(): number {",
      "get latestAnchor(): MessageAnchor | undefined {",
      "append(messages: Message[]): Message[] {",
      "export function createMessageAnchor(message: Message): MessageAnchor {",
    ]) {
      assert.match(
        bufferSource,
        new RegExp(escapeRegExp(snippet)),
        `missing transcript buffer snippet: ${snippet}`,
      );
    }

    for (const snippet of [
      "export interface FetchSessionTranscriptOptions {",
      "expectedMessageCount?: number",
      "tailMessageCount?: number",
      "export interface ConsumeTranscriptEventOptions {",
      "export interface FetchEarlierSessionTranscriptPageOptions {",
      "beforeOrdinal?: number",
      "export async function fetchSessionTranscriptSnapshot(",
      "export async function consumeTranscriptEvent(",
      "export async function fetchEarlierSessionTranscriptPage(",
    ]) {
      assert.match(
        syncSource,
        new RegExp(escapeRegExp(snippet)),
        `missing transcript sync snippet: ${snippet}`,
      );
    }
  });

  test("src/client modules preserve mapper and transport seams", () => {
    const clientSource = read("src/client.ts");
    const mapperSource = read("src/client-mappers.ts");
    const transportSource = read("src/client-transport.ts");

    for (const snippet of [
      'from "./client-mappers.ts";',
      'from "./client-transport.ts";',
      "export class CaSessionSourceClient {",
      "async listSessions(filter: SessionFilter = {}): Promise<SessionPage> {",
      "async getSession(sessionId: string): Promise<Session> {",
      "async getMessages(",
      "): Promise<MessagePage> {",
      "async getToolCalls(sessionId: string): Promise<ToolCall[]> {",
      "private async fetchJSON<T>(",
    ]) {
      assert.match(
        clientSource,
        new RegExp(escapeRegExp(snippet)),
        `missing client facade snippet: ${snippet}`,
      );
    }

    for (const snippet of [
      "export interface RawSession {",
      "export interface RawMessage {",
      "export interface RawToolCallPage {",
      "export function mapSessionPage(raw: RawSessionPage): SessionPage {",
      "export function mapMessagePage(raw: RawMessagePage): MessagePage {",
      "export function mapToolCallPage(raw: RawToolCallPage): ToolCall[] {",
    ]) {
      assert.match(
        mapperSource,
        new RegExp(escapeRegExp(snippet)),
        `missing client mapper snippet: ${snippet}`,
      );
    }

    for (const snippet of [
      "export async function fetchJSON<T>(",
      "export function appendQuery(",
      "export function joinBaseUrl(baseUrl: string, path: string): string {",
      "export function joinResourceUrl(baseUrl: string, path: string): string {",
    ]) {
      assert.match(
        transportSource,
        new RegExp(escapeRegExp(snippet)),
        `missing client transport snippet: ${snippet}`,
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
