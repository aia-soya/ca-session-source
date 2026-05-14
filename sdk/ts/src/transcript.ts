import type { CaSessionSourceClient } from "./client.ts";
import type {
  SessionTranscriptEventResult,
  SessionTranscriptHistoryPage,
  SessionTranscriptSnapshot,
  SourceEvent,
  WatchEventsOptions,
} from "./types.ts";
import {
  consumeTranscriptEvent,
  fetchEarlierSessionTranscriptPage,
  fetchSessionTranscriptSnapshot,
} from "./transcript-sync.ts";
import type {
  FetchEarlierSessionTranscriptPageOptions,
  FetchSessionTranscriptOptions,
} from "./transcript-sync.ts";
import { SessionMessageBuffer, createMessageAnchor } from "./transcript-buffer.ts";

export {
  consumeTranscriptEvent,
  createMessageAnchor,
  fetchEarlierSessionTranscriptPage,
  fetchSessionTranscriptSnapshot,
  SessionMessageBuffer,
};

export type {
  ConsumeTranscriptEventOptions,
  FetchEarlierSessionTranscriptPageOptions,
  FetchSessionTranscriptOptions,
} from "./transcript-sync.ts";

export interface WatchSessionTranscriptOptions
  extends FetchSessionTranscriptOptions,
    WatchEventsOptions {
  onEvent?: (event: SourceEvent) => void | Promise<void>;
  onUpdate?: (
    update: Exclude<SessionTranscriptEventResult, null>,
  ) => void | Promise<void>;
}

export interface WatchedSessionTranscript {
  buffer: SessionMessageBuffer;
  snapshot: SessionTranscriptSnapshot & { buffer: SessionMessageBuffer };
  fetchEarlierPage(
    options?: FetchEarlierSessionTranscriptPageOptions,
  ): Promise<SessionTranscriptHistoryPage>;
  close(): void;
  readonly closed: Promise<void>;
}

export async function watchSessionTranscript(
  client: Pick<
    CaSessionSourceClient,
    "getSession" | "getMessages" | "watchEvents"
  >,
  sessionId: string,
  options: WatchSessionTranscriptOptions = {},
): Promise<WatchedSessionTranscript> {
  const snapshot = await fetchSessionTranscriptSnapshot(client, sessionId, {
    pageLimit: options.pageLimit,
    expectedMessageCount: options.expectedMessageCount,
    tailMessageCount: options.tailMessageCount,
  });

  const subscription = client.watchEvents(
    async (event) => {
      await options.onEvent?.(event);

      const update = await consumeTranscriptEvent(client, snapshot.buffer, event, {
        pageLimit: options.pageLimit,
      });
      if (!update) {
        return;
      }

      await options.onUpdate?.(update);
    },
    {
      signal: options.signal,
      reconnect: options.reconnect,
      retryDelayMs: options.retryDelayMs,
      maxRetryDelayMs: options.maxRetryDelayMs,
      backoffMultiplier: options.backoffMultiplier,
      onOpen: options.onOpen,
      onError: options.onError,
    },
  );

  return {
    buffer: snapshot.buffer,
    snapshot,
    fetchEarlierPage(historyOptions = {}) {
      return fetchEarlierSessionTranscriptPage(
        client,
        snapshot.buffer,
        historyOptions,
      );
    },
    close() {
      subscription.close();
    },
    get closed() {
      return subscription.closed;
    },
  };
}
