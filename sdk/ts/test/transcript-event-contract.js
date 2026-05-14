import { makeMessage, makeSourceEvent } from "./contract-fixtures.js";

export function runTranscriptEventContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("consumeTranscriptEvent surfaces source.error and dedupes incremental appends", async () => {
    const {
      SessionMessageBuffer,
      consumeTranscriptEvent,
    } = await loadModule();

    const buffer = new SessionMessageBuffer("sess-1", [{
      ...makeMessage({
        id: 1,
        sessionId: "sess-1",
        ordinal: 0,
        role: "user",
        content: "hello",
      }),
    }]);

    const sourceErrorEvent = makeSourceEvent({
      type: "source.error",
      error: "boom",
    });

    const sourceErrorResult = await consumeTranscriptEvent(
      { getMessages: async () => ({ messages: [], count: 0 }) },
      buffer,
      sourceErrorEvent,
    );
    assert.deepEqual(sourceErrorResult, {
      kind: "source_error",
      event: sourceErrorEvent,
    });

    const calls = [];
    const client = {
      async getMessages(sessionId, options) {
        calls.push({ sessionId, options });
        return {
          messages: [makeMessage({
            id: 2,
            sessionId,
            ordinal: 1,
            role: "assistant",
            content: "done",
          })],
          count: 1,
        };
      },
    };

    const updated = await consumeTranscriptEvent(client, buffer, makeSourceEvent({
      messageCount: 2,
    }), {
      pageLimit: 5,
    });

    assert.equal(updated.kind, "messages");
    assert.equal(updated.trigger, "session.updated");
    assert.equal(updated.from, 1);
    assert.deepEqual(updated.latestAnchor, {
      sessionId: "sess-1",
      messageOrdinal: 1,
    });
    assert.deepEqual(updated.appendedMessages.map((message) => message.ordinal), [1]);
    assert.equal(updated.latestOrdinal, 1);

    const appended = await consumeTranscriptEvent(client, buffer, makeSourceEvent({
      type: "message.appended",
      messageOrdinal: 1,
      messageCount: 2,
    }));

    assert.equal(appended.kind, "messages");
    assert.equal(appended.trigger, "message.appended");
    assert.equal(appended.from, 1);
    assert.deepEqual(appended.latestAnchor, {
      sessionId: "sess-1",
      messageOrdinal: 1,
    });
    assert.deepEqual(appended.fetchedMessages.map((message) => message.ordinal), [1]);
    assert.deepEqual(appended.appendedMessages, []);
    assert.deepEqual(buffer.messages.map((message) => message.ordinal), [0, 1]);
    assert.deepEqual(calls, [
      {
        sessionId: "sess-1",
        options: { from: 1, limit: 5, direction: "asc" },
      },
      {
        sessionId: "sess-1",
        options: { from: 1, limit: 100, direction: "asc" },
      },
    ]);
  });

  test("consumeTranscriptEvent ignores unknown event types", async () => {
    const { SessionMessageBuffer, consumeTranscriptEvent } = await loadModule();

    const buffer = new SessionMessageBuffer("sess-1", [{
      ...makeMessage({
        id: 1,
        sessionId: "sess-1",
        ordinal: 0,
        role: "user",
        content: "hello",
      }),
    }]);

    const result = await consumeTranscriptEvent(
      { getMessages: async () => ({ messages: [], count: 0 }) },
      buffer,
      makeSourceEvent({
        type: "session.deleted",
      }),
    );

    assert.equal(result, null);
    assert.deepEqual(buffer.latestAnchor, {
      sessionId: "sess-1",
      messageOrdinal: 0,
    });
  });
}
