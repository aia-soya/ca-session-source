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
  get latestMessage() {
    if (this.messagesByOrdinal.size === 0) {
      return void 0;
    }
    return this.messagesByOrdinal.get(this.latestOrdinalValue);
  }
  get latestAnchor() {
    const message = this.latestMessage;
    if (!message) {
      return void 0;
    }
    return createMessageAnchor(message);
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
export function createMessageAnchor(message) {
  return omitUndefined({
    sessionId: message.sessionId,
    messageOrdinal: message.ordinal,
    sourceUuid: message.sourceUuid,
    sourceType: message.sourceType,
    sourceSubtype: message.sourceSubtype
  });
}
function omitUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== void 0)
  );
}
