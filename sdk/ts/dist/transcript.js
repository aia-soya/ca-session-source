import {
  consumeTranscriptEvent,
  fetchEarlierSessionTranscriptPage,
  fetchSessionTranscriptSnapshot
} from "./transcript-sync.js";
import { SessionMessageBuffer, createMessageAnchor } from "./transcript-buffer.js";
export {
  consumeTranscriptEvent,
  createMessageAnchor,
  fetchEarlierSessionTranscriptPage,
  fetchSessionTranscriptSnapshot,
  SessionMessageBuffer
};
export async function watchSessionTranscript(client, sessionId, options = {}) {
  const snapshot = await fetchSessionTranscriptSnapshot(client, sessionId, {
    pageLimit: options.pageLimit,
    expectedMessageCount: options.expectedMessageCount,
    tailMessageCount: options.tailMessageCount
  });
  const subscription = client.watchEvents(
    async (event) => {
      await options.onEvent?.(event);
      const update = await consumeTranscriptEvent(client, snapshot.buffer, event, {
        pageLimit: options.pageLimit
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
      onError: options.onError
    }
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
