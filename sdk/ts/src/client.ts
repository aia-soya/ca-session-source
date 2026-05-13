import { ApiError } from "./errors.ts";
import { watchSourceEvents } from "./events.ts";
import type {
  CaSessionSourceClientOptions,
  EventSubscription,
  Message,
  MessageOptions,
  MessagePage,
  Session,
  SessionFilter,
  SessionPage,
  SourceEvent,
  ToolCall,
  WatchEventsOptions,
} from "./types.ts";

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_REST_BASE_PATH = "api/v1/";
const DEFAULT_SOURCE_EVENTS_PATH = "api/source/v1/events";

type QueryValue = string | number | boolean | undefined;

interface RawSession {
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

interface RawMessage {
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

interface RawEmbeddedToolCall {
  tool_name: string;
  category?: string;
  tool_use_id?: string;
  input_json?: string;
  skill_name?: string;
  result_content?: string;
  result_content_length?: number;
  subagent_session_id?: string;
}

interface RawSessionToolCall {
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

interface RawSessionPage {
  sessions: RawSession[];
  next_cursor?: string;
  total: number;
}

interface RawMessagePage {
  messages: RawMessage[];
  count: number;
}

interface RawToolCallPage {
  tool_calls: RawSessionToolCall[];
}

export class CaSessionSourceClient {
  private readonly baseUrl: string;
  private readonly restBaseUrl: string;
  private readonly sourceEventsUrl: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly headers?: HeadersInit;

  constructor(options: CaSessionSourceClientOptions = {}) {
    this.baseUrl = ensureTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.restBaseUrl = joinBaseUrl(
      this.baseUrl,
      options.restBasePath ?? DEFAULT_REST_BASE_PATH,
    );
    this.sourceEventsUrl = joinResourceUrl(
      this.baseUrl,
      options.sourceEventsPath ?? DEFAULT_SOURCE_EVENTS_PATH,
    );
    this.authToken = options.authToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = options.headers;
  }

  async listSessions(filter: SessionFilter = {}): Promise<SessionPage> {
    const raw = await this.fetchJSON<RawSessionPage>("sessions", {
      project: filter.project,
      exclude_project: filter.excludeProject,
      machine: filter.machine,
      agent: filter.agent,
      date: filter.date,
      date_from: filter.dateFrom,
      date_to: filter.dateTo,
      active_since: filter.activeSince,
      min_messages: filter.minMessages,
      max_messages: filter.maxMessages,
      min_user_messages: filter.minUserMessages,
      include_one_shot: filter.includeOneShot,
      include_automated: filter.includeAutomated,
      include_children: filter.includeChildren,
      outcome: filter.outcome,
      health_grade: filter.healthGrade,
      termination: filter.termination,
      min_tool_failures: filter.minToolFailures,
      cursor: filter.cursor,
      limit: filter.limit,
    });

    return {
      sessions: raw.sessions.map(mapSession),
      nextCursor: raw.next_cursor,
      total: raw.total,
    };
  }

  async getSession(sessionId: string): Promise<Session> {
    return mapSession(await this.fetchJSON<RawSession>(`sessions/${sessionId}`));
  }

  async getMessages(
    sessionId: string,
    options: MessageOptions = {},
  ): Promise<MessagePage> {
    const raw = await this.fetchJSON<RawMessagePage>(
      `sessions/${sessionId}/messages`,
      {
        from: options.from,
        limit: options.limit,
        direction: options.direction,
      },
    );

    return {
      messages: raw.messages.map(mapMessage),
      count: raw.count,
    };
  }

  async getToolCalls(sessionId: string): Promise<ToolCall[]> {
    const raw = await this.fetchJSON<RawToolCallPage>(
      `sessions/${sessionId}/tool-calls`,
    );
    return raw.tool_calls.map(mapSessionToolCall);
  }

  watchEvents(
    onEvent: (event: SourceEvent) => void | Promise<void>,
    options: WatchEventsOptions = {},
  ): EventSubscription {
    return watchSourceEvents({
      ...options,
      url: this.sourceEventsUrl,
      fetchImpl: this.fetchImpl,
      headers: this.requestHeaders(),
      onEvent,
    });
  }

  private async fetchJSON<T>(
    path: string,
    query?: Record<string, QueryValue>,
  ): Promise<T> {
    const url = new URL(stripLeadingSlash(path), this.restBaseUrl);
    appendQuery(url, query);

    const response = await this.fetchImpl(url, {
      headers: this.requestHeaders(),
    });

    if (!response.ok) {
      throw await buildApiError(response);
    }

    return response.json() as Promise<T>;
  }

  private requestHeaders(): Headers {
    const headers = new Headers(this.headers);
    headers.set("Accept", "application/json");
    if (this.authToken) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
    }
    return headers;
  }
}

async function buildApiError(response: Response): Promise<ApiError> {
  const bodyText = await response.text();
  const body = parseJsonBody(bodyText);
  const message = extractErrorMessage(body, bodyText) ?? `API ${response.status}`;
  return new ApiError(response.status, message, body);
}

function parseJsonBody(bodyText: string): unknown {
  if (bodyText.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function extractErrorMessage(
  body: unknown,
  bodyText: string,
): string | undefined {
  if (typeof body === "string" && body.trim() !== "") {
    return body.trim();
  }

  if (typeof body === "object" && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  }

  if (bodyText.trim() !== "") {
    return bodyText.trim();
  }

  return undefined;
}

function mapSession(raw: RawSession): Session {
  return {
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
  };
}

function mapMessage(raw: RawMessage): Message {
  return {
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
  };
}

function mapEmbeddedToolCall(raw: RawEmbeddedToolCall): ToolCall {
  return {
    toolName: raw.tool_name,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.tool_use_id),
    inputJson: emptyToUndefined(raw.input_json),
    skillName: emptyToUndefined(raw.skill_name),
    resultContent: emptyToUndefined(raw.result_content),
    resultContentLength: raw.result_content_length,
    subagentSessionId: emptyToUndefined(raw.subagent_session_id),
  };
}

function mapSessionToolCall(raw: RawSessionToolCall): ToolCall {
  return {
    toolName: raw.tool_name,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.tool_use_id),
    inputJson: emptyToUndefined(raw.input_json),
    skillName: emptyToUndefined(raw.skill_name),
    subagentSessionId: emptyToUndefined(raw.subagent_session_id),
    ordinal: raw.ordinal,
    timestamp: emptyToUndefined(raw.timestamp),
    resultContentLength: raw.result_length,
  };
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function joinBaseUrl(baseUrl: string, path: string): string {
  return ensureTrailingSlash(new URL(stripLeadingSlash(path), baseUrl).toString());
}

function joinResourceUrl(baseUrl: string, path: string): string {
  return new URL(stripLeadingSlash(path), baseUrl).toString();
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
