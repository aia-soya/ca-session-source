import type {
  Message,
  MessagePage,
  Session,
  SessionPage,
  SourceHealth,
  SourceVersion,
  ToolCall,
} from "./types.ts";
import type {
  SourceHealthEnvelope,
  SourceMessagePageEnvelope,
  SourceSessionPageEnvelope,
  SourceToolCallsEnvelope,
  SourceVersionEnvelope,
} from "./client-payloads.ts";

export function mapSessionPage(raw: SourceSessionPageEnvelope): SessionPage {
  return omitUndefined({
    sessions: normalizeArray(raw.sessions).map(mapSession),
    nextCursor: raw.nextCursor,
    total: raw.total,
  });
}

export function mapMessagePage(raw: SourceMessagePageEnvelope): MessagePage {
  return {
    messages: normalizeArray(raw.messages).map(mapMessage),
    count: raw.count,
  };
}

export function mapSourceVersion(raw: SourceVersionEnvelope): SourceVersion {
  return omitUndefined({
    schemaVersion: raw.schemaVersion,
    version: raw.version,
    commit: raw.commit,
    buildDate: raw.buildDate,
    readOnly: raw.readOnly,
  });
}

export function mapSourceHealth(raw: SourceHealthEnvelope): SourceHealth {
  return omitUndefined({
    schemaVersion: raw.schemaVersion,
    status: raw.status,
    readOnly: raw.readOnly,
    eventStreamAvailable: raw.eventStreamAvailable,
  });
}

export function mapToolCallPage(raw: SourceToolCallsEnvelope): ToolCall[] {
  return normalizeArray(raw.toolCalls).map(mapSessionToolCall);
}

export function mapSession(raw: Session): Session {
  return omitUndefined({
    id: raw.id,
    agent: raw.agent,
    project: raw.project,
    machine: emptyToUndefined(raw.machine),
    cwd: emptyToUndefined(raw.cwd),
    gitBranch: emptyToUndefined(raw.gitBranch),
    firstMessage: nullableToUndefined(raw.firstMessage),
    displayName: nullableToUndefined(raw.displayName),
    startedAt: nullableToUndefined(raw.startedAt),
    endedAt: nullableToUndefined(raw.endedAt),
    messageCount: raw.messageCount,
    userMessageCount: raw.userMessageCount,
    sourcePath: nullableToUndefined(raw.sourcePath),
    updatedAt:
      nullableToUndefined(raw.updatedAt) ??
      nullableToUndefined(raw.endedAt) ??
      nullableToUndefined(raw.startedAt),
  });
}

export function mapMessage(raw: Message): Message {
  return omitUndefined({
    id: raw.id,
    sessionId: raw.sessionId,
    ordinal: raw.ordinal,
    role: raw.role,
    content: raw.content,
    thinkingText: emptyToUndefined(raw.thinkingText),
    timestamp: emptyToUndefined(raw.timestamp),
    hasThinking: raw.hasThinking,
    hasToolUse: raw.hasToolUse,
    model: emptyToUndefined(raw.model),
    tokenUsage: raw.tokenUsage,
    sourceUuid: emptyToUndefined(raw.sourceUuid),
    sourceType: emptyToUndefined(raw.sourceType),
    sourceSubtype: emptyToUndefined(raw.sourceSubtype),
    toolCalls: raw.toolCalls?.map(mapToolCallRecord),
  });
}

function mapToolCallRecord(raw: ToolCall): ToolCall {
  return omitUndefined({
    toolName: raw.toolName,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.toolUseId),
    inputJson: emptyToUndefined(raw.inputJson),
    skillName: emptyToUndefined(raw.skillName),
    resultContent: emptyToUndefined(raw.resultContent),
    resultContentLength: raw.resultContentLength,
    subagentSessionId: emptyToUndefined(raw.subagentSessionId),
    ordinal: raw.ordinal,
    timestamp: emptyToUndefined(raw.timestamp),
  });
}

const mapSessionToolCall = mapToolCallRecord;

function nullableToUndefined(value?: string | null): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return value;
}

function emptyToUndefined(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return value;
}

function normalizeArray<T>(value?: T[] | null): T[] {
  return Array.isArray(value) ? value : [];
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
