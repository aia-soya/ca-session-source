export function mapSessionPage(raw) {
  return omitUndefined({
    sessions: normalizeArray(raw.sessions).map(mapSession),
    nextCursor: raw.nextCursor,
    total: raw.total
  });
}
export function mapMessagePage(raw) {
  return {
    messages: normalizeArray(raw.messages).map(mapMessage),
    count: raw.count
  };
}
export function mapSourceVersion(raw) {
  return omitUndefined({
    schemaVersion: raw.schemaVersion,
    version: raw.version,
    commit: raw.commit,
    buildDate: raw.buildDate,
    readOnly: raw.readOnly
  });
}
export function mapSourceHealth(raw) {
  return omitUndefined({
    schemaVersion: raw.schemaVersion,
    status: raw.status,
    readOnly: raw.readOnly,
    eventStreamAvailable: raw.eventStreamAvailable
  });
}
export function mapToolCallPage(raw) {
  return normalizeArray(raw.toolCalls).map(mapSessionToolCall);
}
export function mapSession(raw) {
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
    updatedAt: nullableToUndefined(raw.updatedAt) ?? nullableToUndefined(raw.endedAt) ?? nullableToUndefined(raw.startedAt)
  });
}
export function mapMessage(raw) {
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
    toolCalls: raw.toolCalls?.map(mapToolCallRecord)
  });
}
function mapToolCallRecord(raw) {
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
    timestamp: emptyToUndefined(raw.timestamp)
  });
}
const mapSessionToolCall = mapToolCallRecord;
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
