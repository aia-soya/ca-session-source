import { makeMessage, makeSourceEvent } from "./contract-fixtures.js";

export function runTranscriptWatchContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("watchSessionTranscript orchestrates snapshot, watch, and buffer updates", async () => {
    const {
      SessionMessageBuffer,
      watchSessionTranscript,
    } = await loadModule();

    const calls = [];
    const seenEvents = [];
    const seenUpdates = [];
    let watchHandler;
    let closeCalls = 0;
    let resolveClosed;
    const closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });

    const client = {
      async getSession(sessionId) {
        assert.equal(sessionId, "sess-1");
        return { messageCount: 1 };
      },
      async getMessages(sessionId, options) {
        calls.push({ sessionId, options });
        if (options.from === 0) {
          return {
            messages: [makeMessage({
              id: 1,
              sessionId,
              ordinal: 0,
              role: "user",
              content: "hello",
            })],
            count: 1,
          };
        }
        if (options.from === 1) {
          return {
            messages: [makeMessage({
              id: 2,
              sessionId,
              ordinal: 1,
              role: "assistant",
              content: "world",
            })],
            count: 1,
          };
        }
        return { messages: [], count: 0 };
      },
      watchEvents(handler, options) {
        watchHandler = handler;
        assert.equal(options.reconnect, true);
        assert.equal(options.retryDelayMs, 5);
        return {
          close() {
            closeCalls += 1;
            resolveClosed();
          },
          closed,
        };
      },
    };

    const watched = await watchSessionTranscript(client, "sess-1", {
      pageLimit: 2,
      reconnect: true,
      retryDelayMs: 5,
      onEvent(event) {
        seenEvents.push(event.type);
      },
      onUpdate(update) {
        seenUpdates.push(update);
      },
    });

    assert.ok(watched.buffer instanceof SessionMessageBuffer);
    assert.equal(watched.snapshot.buffer, watched.buffer);
    assert.equal(watched.buffer.earliestOrdinal, 0);
    assert.deepEqual(watched.snapshot.messages.map((message) => message.ordinal), [0]);

    const historyPage = await watched.fetchEarlierPage({
      pageLimit: 2,
      beforeOrdinal: 0,
    });
    assert.equal(historyPage.kind, "history");
    assert.equal(historyPage.hasMore, false);
    assert.deepEqual(historyPage.latestAnchor, {
      sessionId: "sess-1",
      messageOrdinal: 0,
    });
    assert.deepEqual(historyPage.fetchedMessages, []);

    await watchHandler(makeSourceEvent({
      messageCount: 2,
    }));
    await watchHandler(makeSourceEvent({
      type: "source.error",
      error: "boom",
    }));

    assert.deepEqual(seenEvents, ["session.updated", "source.error"]);
    assert.equal(seenUpdates.length, 2);
    assert.equal(seenUpdates[0].kind, "messages");
    assert.equal(seenUpdates[0].trigger, "session.updated");
    assert.deepEqual(seenUpdates[0].appendedMessages.map((message) => message.ordinal), [1]);
    assert.equal(seenUpdates[1].kind, "source_error");
    assert.equal(seenUpdates[1].event.error, "boom");
    assert.deepEqual(watched.buffer.messages.map((message) => message.ordinal), [0, 1]);
    assert.deepEqual(calls, [
      {
        sessionId: "sess-1",
        options: { from: 0, limit: 2, direction: "asc" },
      },
      {
        sessionId: "sess-1",
        options: { from: 1, limit: 2, direction: "asc" },
      },
    ]);

    watched.close();
    await watched.closed;
    assert.equal(closeCalls, 1);
  });
}
