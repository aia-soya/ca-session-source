import { ApiError } from "./errors.js";
import { watchSourceEvents } from "./events.js";
const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_REST_BASE_PATH = "api/v1/";
const DEFAULT_SOURCE_EVENTS_PATH = "api/source/v1/events";
export class CaSessionSourceClient {
  baseUrl;
  restBaseUrl;
  sourceEventsUrl;
  authToken;
  fetchImpl;
  headers;
  constructor(options = {}) {
    this.baseUrl = ensureTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.restBaseUrl = joinBaseUrl(
      this.baseUrl,
      options.restBasePath ?? DEFAULT_REST_BASE_PATH
    );
    this.sourceEventsUrl = joinResourceUrl(
      this.baseUrl,
      options.sourceEventsPath ?? DEFAULT_SOURCE_EVENTS_PATH
    );
    this.authToken = options.authToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = options.headers;
  }
  async listSessions(filter = {}) {
    const raw = await this.fetchJSON("sessions", {
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
      limit: filter.limit
    });
    return omitUndefined({
      sessions: normalizeArray(raw.sessions).map(mapSession),
      nextCursor: raw.next_cursor,
      total: raw.total
    });
  }
  async getSession(sessionId) {
    return mapSession(await this.fetchJSON(`sessions/${sessionId}`));
  }
  async getMessages(sessionId, options = {}) {
    const raw = await this.fetchJSON(
      `sessions/${sessionId}/messages`,
      {
        from: options.from,
        limit: options.limit,
        direction: options.direction
      }
    );
    return {
      messages: normalizeArray(raw.messages).map(mapMessage),
      count: raw.count
    };
  }
  async getToolCalls(sessionId) {
    const raw = await this.fetchJSON(
      `sessions/${sessionId}/tool-calls`
    );
    return normalizeArray(raw.tool_calls).map(mapSessionToolCall);
  }
  watchEvents(onEvent, options = {}) {
    return watchSourceEvents({
      ...options,
      url: this.sourceEventsUrl,
      fetchImpl: this.fetchImpl,
      headers: this.requestHeaders(),
      onEvent
    });
  }
  async fetchJSON(path, query) {
    const url = new URL(stripLeadingSlash(path), this.restBaseUrl);
    appendQuery(url, query);
    const response = await this.fetchImpl(url, {
      headers: this.requestHeaders()
    });
    if (!response.ok) {
      throw await buildApiError(response);
    }
    return response.json();
  }
  requestHeaders() {
    const headers = new Headers(this.headers);
    headers.set("Accept", "application/json");
    if (this.authToken) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
    }
    return headers;
  }
}
async function buildApiError(response) {
  const bodyText = await response.text();
  const body = parseJsonBody(bodyText);
  const message = extractErrorMessage(body, bodyText) ?? `API ${response.status}`;
  return new ApiError(response.status, message, body);
}
function parseJsonBody(bodyText) {
  if (bodyText.trim() === "") {
    return void 0;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}
function extractErrorMessage(body, bodyText) {
  if (typeof body === "string" && body.trim() !== "") {
    return body.trim();
  }
  if (typeof body === "object" && body !== null) {
    const error = body.error;
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  }
  if (bodyText.trim() !== "") {
    return bodyText.trim();
  }
  return void 0;
}
function mapSession(raw) {
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
    updatedAt: nullableToUndefined(raw.local_modified_at) ?? nullableToUndefined(raw.ended_at) ?? nullableToUndefined(raw.started_at) ?? emptyToUndefined(raw.created_at)
  });
}
function mapMessage(raw) {
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
    toolCalls: raw.tool_calls?.map(mapEmbeddedToolCall)
  });
}
function mapEmbeddedToolCall(raw) {
  return omitUndefined({
    toolName: raw.tool_name,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.tool_use_id),
    inputJson: emptyToUndefined(raw.input_json),
    skillName: emptyToUndefined(raw.skill_name),
    resultContent: emptyToUndefined(raw.result_content),
    resultContentLength: raw.result_content_length,
    subagentSessionId: emptyToUndefined(raw.subagent_session_id)
  });
}
function mapSessionToolCall(raw) {
  return omitUndefined({
    toolName: raw.tool_name,
    category: emptyToUndefined(raw.category),
    toolUseId: emptyToUndefined(raw.tool_use_id),
    inputJson: emptyToUndefined(raw.input_json),
    skillName: emptyToUndefined(raw.skill_name),
    subagentSessionId: emptyToUndefined(raw.subagent_session_id),
    ordinal: raw.ordinal,
    timestamp: emptyToUndefined(raw.timestamp),
    resultContentLength: raw.result_length
  });
}
function appendQuery(url, query) {
  if (!query) {
    return;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0 || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function stripLeadingSlash(value) {
  return value.replace(/^\/+/, "");
}
function joinBaseUrl(baseUrl, path) {
  return ensureTrailingSlash(new URL(stripLeadingSlash(path), baseUrl).toString());
}
function joinResourceUrl(baseUrl, path) {
  return new URL(stripLeadingSlash(path), baseUrl).toString();
}
function nullableToUndefined(value) {
  if (value == null || value === "") {
    return void 0;
  }
  return value;
}
function emptyToUndefined(value) {
  if (!value) {
    return void 0;
  }
  return value;
}
function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}
function omitUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== void 0)
  );
}
