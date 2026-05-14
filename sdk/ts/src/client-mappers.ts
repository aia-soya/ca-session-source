import type {
  Message,
  MessagePage,
  Session,
  SessionPage,
  ToolCall,
} from "./types.ts";

export interface RawSession {
  id: string;
  project: string;
  machine: string;
  agent: string;
  cwd?: string;
  git_branch?: string;
  first_message?: string | null;
  display_name?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  message_count: number;
  user_message_count?: number;
  file_path?: string | null;
  local_modified_at?: string | null;
  created_at?: string;
}

export interface RawMessage {
  id: number;
  session_id: string;
  ordinal: number;
  role: string;
  content: string;
  thinking_text?: string;
  timestamp?: string;
  has_thinking?: boolean;
  has_tool_use?: boolean;
  model?: string;
  token_usage?: unknown;
  source_uuid?: string;
  source_type?: string;
  source_subtype?: string;
  tool_calls?: RawEmbeddedToolCall[];
}

export interface RawEmbeddedToolCall {
  tool_name: string;
  category?: string;
  tool_use_id?: string;
  input_json?: string;
  skill_name?: string;
  result_content?: string;
  result_content_length?: number;
  subagent_session_id?: string;
}

export interface RawSessionToolCall {
  tool_name: string;
  category?: string;
  tool_use_id?: string;
  input_json?: string;
  skill_name?: string;
  subagent_session_id?: string;
  ordinal?: number;
  timestamp?: string;
  result_length?: number;
}

export interface RawSessionPage {
  sessions?: RawSession[] | null;
  next_cursor?: string;
  total: number;
}

export interface RawMessagePage {
  messages?: RawMessage[] | null;
  count: number;
}

export interface RawToolCallPage {
  tool_calls?: RawSessionToolCall[] | null;
}

export function mapSessionPage(raw: RawSessionPage): SessionPage {
  return omitUndefined({
    sessions: normalizeArray(raw.sessions).map(mapSession),
    nextCursor: raw.next_cursor,
    total: raw.total,
  });
}

export function mapMessagePage(raw: RawMessagePage): MessagePage {
  return {
    messages: normalizeArray(raw.messages).map(mapMessage),
    count: raw.count,
  };
}

export function mapToolCallPage(raw: RawToolCallPage): ToolCall[] {
  return normalizeArray(raw.tool_calls).map(mapSessionToolCall);
}

export function mapSession(raw: RawSession): Session {
  return omitUndefined({
    id: raw.id,
    agent: raw.agent,
    project: raw.project,
    machine: emptyToUndefined(raw.machine),
    cwd: emptyToUndefined(raw.cwd),
    gitBranch: emptyToUndefined(raw.git_branch),
    firstMessage: nullableToUndefined(raw.first_message),
    displayName: nullableToUndefined(raw.display_name),
    startedAt: nullableToUndefined(raw.started_at),
    endedAt: nullableToUndefined(raw.ended_at),
    messageCount: raw.message_count,
    userMessageCount: raw.user_message_count,
    sourcePath: nullableToUndefined(raw.file_path),
    updatedAt:
      nullableToUndefined(raw.local_modified_at) ??
      nullableToUndefined(raw.ended_at) ??
      nullableToUndefined(raw.started_at) ??
      emptyToUndefined(raw.created_at),
  });
}

export function mapMessage(raw: RawMessage): Message {
  return omitUndefined({
    id: raw.id,
    sessionId: raw.session_id,
    ordinal: raw.ordinal,
    role: raw.role,
    content: raw.content,
    thinkingText: emptyToUndefined(raw.thinking_text),
    timestamp: emptyToUndefined(raw.timestamp),
    hasThinking: raw.has_thinking,
    hasToolUse: raw.has_tool_use,
    model: emptyToUndefined(raw.model),
    tokenUsage: raw.token_usage,
    sourceUuid: emptyToUndefined(raw.source_uuid),
    sourceType: emptyToUndefined(raw.source_type),
    sourceSubtype: emptyToUndefined(raw.source_subtype),
    toolCalls: raw.tool_calls?.map(mapEmbeddedToolCall),
  });
}

function mapEmbeddedToolCall(raw: RawEmbeddedToolCall): ToolCall {
  return omitUndefined({
    toolName: raw.tool_name,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.tool_use_id),
    inputJson: emptyToUndefined(raw.input_json),
    skillName: emptyToUndefined(raw.skill_name),
    resultContent: emptyToUndefined(raw.result_content),
    resultContentLength: raw.result_content_length,
    subagentSessionId: emptyToUndefined(raw.subagent_session_id),
  });
}

function mapSessionToolCall(raw: RawSessionToolCall): ToolCall {
  return omitUndefined({
    toolName: raw.tool_name,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.tool_use_id),
    inputJson: emptyToUndefined(raw.input_json),
    skillName: emptyToUndefined(raw.skill_name),
    subagentSessionId: emptyToUndefined(raw.subagent_session_id),
    ordinal: raw.ordinal,
    timestamp: emptyToUndefined(raw.timestamp),
    resultContentLength: raw.result_length,
  });
}

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
