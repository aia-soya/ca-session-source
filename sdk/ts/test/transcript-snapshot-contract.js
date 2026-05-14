import { makeMessage } from "./contract-fixtures.js";

export function runTranscriptSnapshotContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("fetchSessionTranscriptSnapshot paginates and builds transcript state", async () => {
    const {
      SessionMessageBuffer,
      fetchSessionTranscriptSnapshot,
    } = await loadModule();

    const calls = [];
    const client = {
      async getSession(sessionId) {
        assert.equal(sessionId, "sess-1");
        return { messageCount: 3 };
      },
      async getMessages(sessionId, options) {
        calls.push({ sessionId, options });
        if (options.from === 0) {
          return {
            messages: [
              makeMessage({ id: 1, sessionId, ordinal: 0, role: "user", content: "a" }),
              makeMessage({ id: 2, sessionId, ordinal: 1, role: "assistant", content: "b" }),
            ],
            count: 2,
          };
        }
        if (options.from === 2) {
          return {
            messages: [
              makeMessage({ id: 3, sessionId, ordinal: 2, role: "assistant", content: "c" }),
            ],
            count: 1,
          };
        }
        return { messages: [], count: 0 };
      },
    };

    const snapshot = await fetchSessionTranscriptSnapshot(client, "sess-1", {
      pageLimit: 2,
    });

    assert.ok(snapshot.buffer instanceof SessionMessageBuffer);
    assert.equal(snapshot.buffer.sessionId, "sess-1");
    assert.equal(snapshot.startOrdinal, 0);
    assert.equal(snapshot.latestOrdinal, 2);
    assert.deepEqual(snapshot.latestAnchor, {
      sessionId: "sess-1",
      messageOrdinal: 2,
    });
    assert.deepEqual(snapshot.fetchedPageSizes, [2, 1]);
    assert.deepEqual(
      snapshot.messages.map((message) => message.ordinal),
      [0, 1, 2],
    );
    assert.deepEqual(calls, [
      {
        sessionId: "sess-1",
        options: { from: 0, limit: 2, direction: "asc" },
      },
      {
        sessionId: "sess-1",
        options: { from: 2, limit: 2, direction: "asc" },
      },
    ]);
  });

  test("fetchSessionTranscriptSnapshot can bootstrap from the tail of a large session", async () => {
    const { fetchSessionTranscriptSnapshot } = await loadModule();

    const calls = [];
    const client = {
      async getSession(sessionId) {
        assert.equal(sessionId, "sess-tail");
        return { messageCount: 10 };
      },
      async getMessages(sessionId, options) {
        calls.push({ sessionId, options });
        if (options.from === 7) {
          return {
            messages: [
              makeMessage({ id: 8, sessionId, ordinal: 7, role: "assistant", content: "h" }),
              makeMessage({ id: 9, sessionId, ordinal: 8, role: "assistant", content: "i" }),
            ],
            count: 2,
          };
        }
        if (options.from === 9) {
          return {
            messages: [
              makeMessage({ id: 10, sessionId, ordinal: 9, role: "assistant", content: "j" }),
            ],
            count: 1,
          };
        }
        return { messages: [], count: 0 };
      },
    };

    const snapshot = await fetchSessionTranscriptSnapshot(client, "sess-tail", {
      pageLimit: 2,
      tailMessageCount: 3,
    });

    assert.equal(snapshot.startOrdinal, 7);
    assert.equal(snapshot.latestOrdinal, 9);
    assert.deepEqual(snapshot.fetchedPageSizes, [2, 1]);
    assert.deepEqual(
      snapshot.messages.map((message) => message.ordinal),
      [7, 8, 9],
    );
    assert.deepEqual(calls, [
      {
        sessionId: "sess-tail",
        options: { from: 7, limit: 2, direction: "asc" },
      },
      {
        sessionId: "sess-tail",
        options: { from: 9, limit: 2, direction: "asc" },
      },
    ]);
  });

  test("fetchEarlierSessionTranscriptPage prepends older messages into the buffer", async () => {
    const {
      SessionMessageBuffer,
      fetchEarlierSessionTranscriptPage,
    } = await loadModule();

    const calls = [];
    const buffer = new SessionMessageBuffer("sess-tail", [
      makeMessage({ id: 8, sessionId: "sess-tail", ordinal: 7, role: "assistant", content: "h" }),
      makeMessage({ id: 9, sessionId: "sess-tail", ordinal: 8, role: "assistant", content: "i" }),
      makeMessage({ id: 10, sessionId: "sess-tail", ordinal: 9, role: "assistant", content: "j" }),
    ]);

    const page = await fetchEarlierSessionTranscriptPage({
      async getMessages(sessionId, options) {
        calls.push({ sessionId, options });
        return {
          messages: [
            makeMessage({ id: 7, sessionId, ordinal: 6, role: "user", content: "g" }),
            makeMessage({ id: 6, sessionId, ordinal: 5, role: "assistant", content: "f" }),
          ],
          count: 2,
        };
      },
    }, buffer, {
      pageLimit: 2,
    });

    assert.equal(page.kind, "history");
    assert.equal(page.beforeOrdinal, 7);
    assert.equal(page.earliestOrdinal, 5);
    assert.equal(page.latestOrdinal, 9);
    assert.equal(page.hasMore, true);
    assert.deepEqual(page.fetchedMessages.map((message) => message.ordinal), [5, 6]);
    assert.deepEqual(page.appendedMessages.map((message) => message.ordinal), [5, 6]);
    assert.deepEqual(buffer.messages.map((message) => message.ordinal), [5, 6, 7, 8, 9]);
    assert.deepEqual(calls, [
      {
        sessionId: "sess-tail",
        options: { from: 6, limit: 2, direction: "desc" },
      },
    ]);
  });
}
