import { watchSourceEvents } from "./events.js";
import {
  mapMessagePage,
  mapSession,
  mapSessionPage,
  mapToolCallPage
} from "./client-mappers.js";
import {
  appendQuery,
  ensureTrailingSlash,
  fetchJSON,
  joinBaseUrl,
  joinResourceUrl,
  stripLeadingSlash
} from "./client-transport.js";
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
    return mapSessionPage(raw);
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
    return mapMessagePage(raw);
  }
  async getToolCalls(sessionId) {
    const raw = await this.fetchJSON(
      `sessions/${sessionId}/tool-calls`
    );
    return mapToolCallPage(raw);
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
    return fetchJSON(this.fetchImpl, url, this.requestHeaders());
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
