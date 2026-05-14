import type { Message, MessageAnchor } from "./types.ts";

export class SessionMessageBuffer {
  private readonly messagesByOrdinal = new Map<number, Message>();
  private earliestOrdinalValue = Number.POSITIVE_INFINITY;
  private latestOrdinalValue = Number.NEGATIVE_INFINITY;
  private sortedMessagesCache: Message[] | null = null;
  readonly sessionId: string;

  constructor(sessionId: string, initialMessages: Message[] = []) {
    this.sessionId = sessionId;
    this.append(initialMessages);
  }

  get size(): number {
    return this.messagesByOrdinal.size;
  }

  get latestOrdinal(): number {
    if (this.messagesByOrdinal.size === 0) {
      return -1;
    }
    return this.latestOrdinalValue;
  }

  get earliestOrdinal(): number {
    if (this.messagesByOrdinal.size === 0) {
      return -1;
    }
    return this.earliestOrdinalValue;
  }

  get messages(): Message[] {
    if (!this.sortedMessagesCache) {
      this.sortedMessagesCache = [...this.messagesByOrdinal.entries()]
        .sort((left, right) => left[0] - right[0])
        .map((entry) => entry[1]);
    }
    return [...this.sortedMessagesCache];
  }

  get latestMessage(): Message | undefined {
    if (this.messagesByOrdinal.size === 0) {
      return undefined;
    }
    return this.messagesByOrdinal.get(this.latestOrdinalValue);
  }

  get latestAnchor(): MessageAnchor | undefined {
    const message = this.latestMessage;
    if (!message) {
      return undefined;
    }
    return createMessageAnchor(message);
  }

  append(messages: Message[]): Message[] {
    const appended: Message[] = [];

    for (const message of messages) {
      if (message.sessionId !== this.sessionId) {
        throw new Error(
          `message session mismatch: expected ${this.sessionId}, got ${message.sessionId}`,
        );
      }
      if (this.messagesByOrdinal.has(message.ordinal)) {
        continue;
      }

      this.messagesByOrdinal.set(message.ordinal, message);
      this.earliestOrdinalValue = Math.min(
        this.earliestOrdinalValue,
        message.ordinal,
      );
      this.latestOrdinalValue = Math.max(
        this.latestOrdinalValue,
        message.ordinal,
      );
      appended.push(message);
    }

    if (appended.length > 0) {
      this.sortedMessagesCache = null;
    }

    return appended;
  }
}

export function createMessageAnchor(message: Message): MessageAnchor {
  return omitUndefined({
    sessionId: message.sessionId,
    messageOrdinal: message.ordinal,
    sourceUuid: message.sourceUuid,
    sourceType: message.sourceType,
    sourceSubtype: message.sourceSubtype,
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
