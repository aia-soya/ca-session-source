import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("published declaration files", () => {
  test("dist/index.d.ts exports the same public surface as src/index.ts", () => {
    const dist = read("dist/index.d.ts");

    for (const normalized of [
      "export { CaSessionSourceClient } from \"./client.js\";",
      "ApiError,",
      "CaSessionSourceError,",
      "EventStreamError,",
      "SOURCE_EVENT_SCHEMA_VERSION,",
      "watchSourceEvents,",
      "CaSessionSourceClientOptions,",
      "EventSubscription,",
      "Message,",
      "MessageOptions,",
      "MessagePage,",
      "Session,",
      "SessionFilter,",
      "SessionPage,",
      "SourceEvent,",
      "SourceEventType,",
      "ToolCall,",
      "WatchEventsOptions,",
    ]) {
      assert.match(
        dist,
        new RegExp(escapeRegExp(normalized)),
        `missing declaration export snippet: ${normalized}`,
      );
    }
  });

  test("dist/client.d.ts matches the published client contract", () => {
    const dist = read("dist/client.d.ts");

    for (const snippet of [
      "constructor(options?: CaSessionSourceClientOptions);",
      "listSessions(filter?: SessionFilter): Promise<SessionPage>;",
      "getSession(sessionId: string): Promise<Session>;",
      "getMessages(",
      "getToolCalls(sessionId: string): Promise<ToolCall[]>;",
      "watchEvents(",
      "options?: WatchEventsOptions,",
      "): EventSubscription;",
    ]) {
      assert.match(
        dist,
        new RegExp(escapeRegExp(snippet)),
        `missing client declaration snippet: ${snippet}`,
      );
    }
  });

  test("dist/types.d.ts preserves key source DTO fields", () => {
    const dist = read("dist/types.d.ts");

    for (const snippet of [
      "export interface Session {",
      "gitBranch?: string;",
      "userMessageCount?: number;",
      "sourcePath?: string;",
      "updatedAt?: string;",
      "export interface Message {",
      "sessionId: string;",
      "thinkingText?: string;",
      "tokenUsage?: unknown;",
      "sourceUuid?: string;",
      "toolCalls?: ToolCall[];",
      "export interface SourceEvent {",
      "schemaVersion: string;",
      "messageOrdinal?: number;",
      "export interface WatchEventsOptions {",
      "onError?: (error: unknown) => void;",
      "export interface CaSessionSourceClientOptions {",
      "fetch?: typeof fetch;",
      "sourceEventsPath?: string;",
    ]) {
      assert.match(
        dist,
        new RegExp(escapeRegExp(snippet)),
        `missing DTO declaration snippet: ${snippet}`,
      );
    }
  });

  test("dist/events.d.ts preserves the source event watcher signature", () => {
    const dist = read("dist/events.d.ts");

    for (const snippet of [
      "export declare const SOURCE_EVENT_SCHEMA_VERSION = \"ca-session.event.v1\";",
      "export interface WatchSourceEventsInput extends WatchEventsOptions {",
      "fetchImpl: typeof fetch;",
      "onEvent: (event: SourceEvent) => void | Promise<void>;",
      "export declare function watchSourceEvents(",
      "): EventSubscription;",
    ]) {
      assert.match(
        dist,
        new RegExp(escapeRegExp(snippet)),
        `missing event declaration snippet: ${snippet}`,
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
