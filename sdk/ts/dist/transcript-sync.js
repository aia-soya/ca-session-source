import { SessionMessageBuffer } from "./transcript-buffer.js";
const DEFAULT_PAGE_LIMIT = 100;
export async function fetchSessionTranscriptSnapshot(client, sessionId, options = {}) {
  const expectedMessageCount = options.expectedMessageCount ?? (await client.getSession(sessionId)).messageCount;
  const startOrdinal = computeSnapshotStartOrdinal(
    expectedMessageCount,
    options.tailMessageCount
  );
  const fetchedPageSizes = [];
  const messages = await fetchMessagesFromOrdinal(
    client,
    sessionId,
    startOrdinal,
    omitUndefined({
      pageLimit: options.pageLimit,
      stopWhenTotalAtLeast: expectedMessageCount,
      pageSizes: fetchedPageSizes
    })
  );
  const buffer = new SessionMessageBuffer(sessionId, messages);
  return {
    buffer,
    startOrdinal,
    messages: buffer.messages,
    fetchedPageSizes,
    latestOrdinal: buffer.latestOrdinal,
    latestAnchor: buffer.latestAnchor
  };
}
export async function consumeTranscriptEvent(client, buffer, event, options = {}) {
  if (event.sessionId !== buffer.sessionId) {
    return null;
  }
  if (event.type === "source.error") {
    const result2 = {
      kind: "source_error",
      event
    };
    return result2;
  }
  if (event.type !== "session.updated" && event.type !== "message.appended") {
    return null;
  }
  const from = incrementalFetchStart(
    buffer,
    event.type,
    event.messageOrdinal
  );
  const fetchedMessages = await fetchMessagesFromOrdinal(
    client,
    buffer.sessionId,
    from,
    omitUndefined({
      pageLimit: options.pageLimit,
      stopWhenTotalAtLeast: event.messageCount
    })
  );
  const appendedMessages = buffer.append(fetchedMessages);
  const result = {
    kind: "messages",
    trigger: event.type,
    from,
    fetchedMessages,
    appendedMessages,
    latestOrdinal: buffer.latestOrdinal,
    latestAnchor: buffer.latestAnchor
  };
  return result;
}
export async function fetchEarlierSessionTranscriptPage(client, buffer, options = {}) {
  const beforeOrdinal = normalizeBeforeOrdinal(buffer, options.beforeOrdinal);
  if (beforeOrdinal <= 0) {
    return emptyHistoryPage(buffer, beforeOrdinal);
  }
  const pageLimit = normalizePageLimit(options.pageLimit);
  const page = await client.getMessages(buffer.sessionId, {
    from: beforeOrdinal - 1,
    limit: pageLimit,
    direction: "desc"
  });
  const fetchedMessages = [...page.messages].reverse();
  const appendedMessages = buffer.append(fetchedMessages);
  const earliestFetchedOrdinal = fetchedMessages.length > 0 ? fetchedMessages[0].ordinal : buffer.earliestOrdinal;
  return {
    kind: "history",
    beforeOrdinal,
    fetchedMessages,
    appendedMessages,
    earliestOrdinal: buffer.earliestOrdinal,
    latestOrdinal: buffer.latestOrdinal,
    latestAnchor: buffer.latestAnchor,
    hasMore: earliestFetchedOrdinal > 0
  };
}
function emptyHistoryPage(buffer, beforeOrdinal) {
  return {
    kind: "history",
    beforeOrdinal,
    fetchedMessages: [],
    appendedMessages: [],
    earliestOrdinal: buffer.earliestOrdinal,
    latestOrdinal: buffer.latestOrdinal,
    latestAnchor: buffer.latestAnchor,
    hasMore: false
  };
}
function incrementalFetchStart(buffer, eventType, messageOrdinal) {
  if (eventType === "message.appended" && typeof messageOrdinal === "number") {
    return messageOrdinal;
  }
  return Math.max(buffer.latestOrdinal + 1, 0);
}
async function fetchMessagesFromOrdinal(client, sessionId, from, options = {}) {
  const pageLimit = normalizePageLimit(options.pageLimit);
  const messages = [];
  const pageSizes = options.pageSizes ?? [];
  let nextFrom = from;
  for (; ; ) {
    const page = await client.getMessages(sessionId, {
      from: nextFrom,
      limit: pageLimit,
      direction: "asc"
    });
    pageSizes.push(page.messages.length);
    if (page.messages.length === 0) {
      return messages;
    }
    messages.push(...page.messages);
    nextFrom = page.messages.at(-1).ordinal + 1;
    if (typeof options.stopWhenTotalAtLeast === "number" && options.stopWhenTotalAtLeast > 0 && nextFrom >= options.stopWhenTotalAtLeast) {
      return messages;
    }
    if (page.messages.length < pageLimit) {
      return messages;
    }
  }
}
function normalizePageLimit(value) {
  if (!Number.isInteger(value) || value === void 0 || value <= 0) {
    return DEFAULT_PAGE_LIMIT;
  }
  return value;
}
function computeSnapshotStartOrdinal(expectedMessageCount, tailMessageCount) {
  if (tailMessageCount === void 0 || !Number.isInteger(tailMessageCount) || tailMessageCount <= 0) {
    return 0;
  }
  return Math.max(expectedMessageCount - tailMessageCount, 0);
}
function normalizeBeforeOrdinal(buffer, beforeOrdinal) {
  if (beforeOrdinal !== void 0 && Number.isInteger(beforeOrdinal) && beforeOrdinal >= 0) {
    return beforeOrdinal;
  }
  return Math.max(buffer.earliestOrdinal, 0);
}
function omitUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== void 0)
  );
}
