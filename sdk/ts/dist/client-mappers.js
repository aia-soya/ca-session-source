export function mapSessionPage(raw) {
  return omitUndefined({
    sessions: normalizeArray(raw.sessions).map(mapSession),
    nextCursor: raw.next_cursor,
    total: raw.total
  });
}
export function mapMessagePage(raw) {
  return {
    messages: normalizeArray(raw.messages).map(mapMessage),
    count: raw.count
  };
}
export function mapToolCallPage(raw) {
  return normalizeArray(raw.tool_calls).map(mapSessionToolCall);
}
export function mapSession(raw) {
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
export function mapMessage(raw) {
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
