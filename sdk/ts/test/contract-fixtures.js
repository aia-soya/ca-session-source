export const SOURCE_SCHEMA_VERSION = "ca-session.source.v1";
export const EVENT_SCHEMA_VERSION = "ca-session.event.v1";

export function makeSession(overrides = {}) {
  return {
    id: "sess-1",
    project: "proj",
    machine: "mbp",
    agent: "codex",
    cwd: "/repo",
    gitBranch: "main",
    firstMessage: "hello",
    displayName: "Demo",
    startedAt: "2026-05-13T01:00:00Z",
    endedAt: null,
    messageCount: 4,
    userMessageCount: 2,
    sourcePath: "/tmp/session.jsonl",
    updatedAt: "2026-05-13T02:00:00Z",
    createdAt: "2026-05-13T00:59:00Z",
    ...overrides,
  };
}

export function makeMessage(overrides = {}) {
  return {
    id: 1,
    sessionId: "sess-1",
    ordinal: 0,
    role: "user",
    content: "hello",
    ...overrides,
  };
}

export function makeToolCall(overrides = {}) {
  return {
    toolName: "bash",
    category: "exec",
    toolUseId: "tool-1",
    inputJson: "{\"cmd\":\"pwd\"}",
    skillName: "shell",
    ...overrides,
  };
}

export function makeSessionPage(overrides = {}) {
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    sessions: [makeSession()],
    nextCursor: "cursor-1",
    total: 1,
    ...overrides,
  };
}

export function makeMessagePage(overrides = {}) {
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    messages: [makeMessage()],
    count: 1,
    ...overrides,
  };
}

export function makeToolCallsPage(overrides = {}) {
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    toolCalls: [makeToolCall()],
    count: 1,
    ...overrides,
  };
}

export function makeSourceVersion(overrides = {}) {
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    version: "v1.2.3",
    commit: "abc1234",
    buildDate: "2026-05-14T00:00:00Z",
    readOnly: true,
    ...overrides,
  };
}

export function makeSourceHealth(overrides = {}) {
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    status: "ok",
    readOnly: false,
    eventStreamAvailable: true,
    ...overrides,
  };
}

export function makeSourceEvent(overrides = {}) {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    type: "session.updated",
    sessionId: "sess-1",
    ...overrides,
  };
}
