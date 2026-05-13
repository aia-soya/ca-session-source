const DEFAULT_PAGE_LIMIT = 100;
export class SessionMessageBuffer {
  messagesByOrdinal = /* @__PURE__ */ new Map();
  earliestOrdinalValue = Number.POSITIVE_INFINITY;
  latestOrdinalValue = Number.NEGATIVE_INFINITY;
  sortedMessagesCache = null;
  sessionId;
  constructor(sessionId, initialMessages = []) {
    this.sessionId = sessionId;
    this.append(initialMessages);
  }
  get size() {
    return this.messagesByOrdinal.size;
  }
  get latestOrdinal() {
    if (this.messagesByOrdinal.size === 0) {
      return -1;
    }
    return this.latestOrdinalValue;
  }
  get earliestOrdinal() {
    if (this.messagesByOrdinal.size === 0) {
      return -1;
    }
    return this.earliestOrdinalValue;
  }
  get messages() {
    if (!this.sortedMessagesCache) {
      this.sortedMessagesCache = [...this.messagesByOrdinal.entries()].sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);
    }
    return [...this.sortedMessagesCache];
  }
  append(messages) {
    const appended = [];
    for (const message of messages) {
      if (message.sessionId !== this.sessionId) {
        throw new Error(
          `message session mismatch: expected ${this.sessionId}, got ${message.sessionId}`
        );
      }
      if (this.messagesByOrdinal.has(message.ordinal)) {
        continue;
      }
      this.messagesByOrdinal.set(message.ordinal, message);
      this.earliestOrdinalValue = Math.min(
        this.earliestOrdinalValue,
        message.ordinal
      );
      this.latestOrdinalValue = Math.max(
        this.latestOrdinalValue,
        message.ordinal
      );
      appended.push(message);
    }
    if (appended.length > 0) {
      this.sortedMessagesCache = null;
    }
    return appended;
  }
}
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
    latestOrdinal: buffer.latestOrdinal
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
  const from = event.type === "message.appended" && typeof event.messageOrdinal === "number" ? event.messageOrdinal : Math.max(buffer.latestOrdinal + 1, 0);
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
    latestOrdinal: buffer.latestOrdinal
  };
  return result;
}
export async function fetchEarlierSessionTranscriptPage(client, buffer, options = {}) {
  const beforeOrdinal = normalizeBeforeOrdinal(buffer, options.beforeOrdinal);
  if (beforeOrdinal <= 0) {
    return {
      kind: "history",
      beforeOrdinal,
      fetchedMessages: [],
      appendedMessages: [],
      earliestOrdinal: buffer.earliestOrdinal,
      latestOrdinal: buffer.latestOrdinal,
      hasMore: false
    };
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
    hasMore: earliestFetchedOrdinal > 0
  };
}
export async function watchSessionTranscript(client, sessionId, options = {}) {
  const snapshot = await fetchSessionTranscriptSnapshot(
    client,
    sessionId,
    omitUndefined({
      pageLimit: options.pageLimit,
      expectedMessageCount: options.expectedMessageCount,
      tailMessageCount: options.tailMessageCount
    })
  );
  const subscription = client.watchEvents(
    async (event) => {
      await options.onEvent?.(event);
      const update = await consumeTranscriptEvent(
        client,
        snapshot.buffer,
        event,
        omitUndefined({
          pageLimit: options.pageLimit
        })
      );
      if (!update) {
        return;
      }
      await options.onUpdate?.(update);
    },
    omitUndefined({
      signal: options.signal,
      reconnect: options.reconnect,
      retryDelayMs: options.retryDelayMs,
      maxRetryDelayMs: options.maxRetryDelayMs,
      backoffMultiplier: options.backoffMultiplier,
      onOpen: options.onOpen,
      onError: options.onError
    })
  );
  return {
    buffer: snapshot.buffer,
    snapshot,
    fetchEarlierPage(historyOptions = {}) {
      return fetchEarlierSessionTranscriptPage(
        client,
        snapshot.buffer,
        historyOptions
      );
    },
    close() {
      subscription.close();
    },
    get closed() {
      return subscription.closed;
    }
  };
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
