export function runClientContractSuite({
  assert,
  beforeEach,
  afterEach,
  describe,
  test,
  loadModule,
}) {
  describe("CaSessionSourceClient", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      delete globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("listSessions maps source-oriented fields and auth headers", async () => {
      const { CaSessionSourceClient } = await loadModule();
      const calls = [];
      globalThis.fetch = async (input, init) => {
        calls.push({ input, init });
        return jsonResponse({
          sessions: [{
            id: "sess-1",
            project: "proj",
            machine: "mbp",
            agent: "codex",
            cwd: "/repo",
            git_branch: "main",
            first_message: "hello",
            display_name: "Demo",
            started_at: "2026-05-13T01:00:00Z",
            ended_at: null,
            message_count: 4,
            user_message_count: 2,
            file_path: "/tmp/session.jsonl",
            local_modified_at: "2026-05-13T02:00:00Z",
            created_at: "2026-05-13T00:59:00Z"
          }],
          next_cursor: "cursor-1",
          total: 10
        });
      };

      const client = new CaSessionSourceClient({
        authToken: "secret"
      });

      const page = await client.listSessions({
        agent: "codex",
        limit: 10,
        includeChildren: true
      });

      assert.equal(page.total, 10);
      assert.equal(page.nextCursor, "cursor-1");
      assert.deepEqual(page.sessions[0], {
        id: "sess-1",
        agent: "codex",
        project: "proj",
        machine: "mbp",
        cwd: "/repo",
        gitBranch: "main",
        firstMessage: "hello",
        displayName: "Demo",
        startedAt: "2026-05-13T01:00:00Z",
        messageCount: 4,
        userMessageCount: 2,
        sourcePath: "/tmp/session.jsonl",
        updatedAt: "2026-05-13T02:00:00Z"
      });

      const requestUrl = calls[0]?.input;
      assert.ok(requestUrl instanceof URL);
      assert.equal(requestUrl.origin, "http://127.0.0.1:8080");
      assert.equal(requestUrl.pathname, "/api/v1/sessions");
      assert.equal(requestUrl.searchParams.get("agent"), "codex");
      assert.equal(requestUrl.searchParams.get("limit"), "10");
      assert.equal(requestUrl.searchParams.get("include_children"), "true");

      const headers = new Headers(calls[0]?.init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer secret");
      assert.equal(headers.get("Accept"), "application/json");
    });

    test("getMessages maps embedded tool calls", async () => {
      const { CaSessionSourceClient } = await loadModule();
      globalThis.fetch = async () =>
        jsonResponse({
          messages: [{
            id: 1,
            session_id: "sess-1",
            ordinal: 3,
            role: "assistant",
            content: "done",
            thinking_text: "reasoning",
            timestamp: "2026-05-13T03:00:00Z",
            has_thinking: true,
            has_tool_use: true,
            model: "gpt-5",
            token_usage: { input: 10, output: 20 },
            source_uuid: "msg-uuid",
            source_type: "assistant",
            source_subtype: "message",
            tool_calls: [{
              tool_name: "bash",
              category: "exec",
              tool_use_id: "tool-1",
              input_json: "{\"cmd\":\"pwd\"}",
              skill_name: "shell",
              result_content: "ok",
              result_content_length: 2,
              subagent_session_id: "sub-1"
            }]
          }],
          count: 1
        });

      const client = new CaSessionSourceClient();
      const page = await client.getMessages("sess-1", {
        from: 3,
        direction: "asc"
      });

      assert.equal(page.count, 1);
      assert.deepEqual(page.messages[0], {
        id: 1,
        sessionId: "sess-1",
        ordinal: 3,
        role: "assistant",
        content: "done",
        thinkingText: "reasoning",
        timestamp: "2026-05-13T03:00:00Z",
        hasThinking: true,
        hasToolUse: true,
        model: "gpt-5",
        tokenUsage: { input: 10, output: 20 },
        sourceUuid: "msg-uuid",
        sourceType: "assistant",
        sourceSubtype: "message",
        toolCalls: [{
          toolName: "bash",
          category: "exec",
          toolUseId: "tool-1",
          inputJson: "{\"cmd\":\"pwd\"}",
          skillName: "shell",
          resultContent: "ok",
          resultContentLength: 2,
          subagentSessionId: "sub-1"
        }]
      });
    });

    test("getMessages keeps source anchor fields optional when upstream omits them", async () => {
      const { CaSessionSourceClient, createMessageAnchor } = await loadModule();
      globalThis.fetch = async () =>
        jsonResponse({
          messages: [{
            id: 2,
            session_id: "sess-2",
            ordinal: 4,
            role: "assistant",
            content: "done",
            timestamp: "2026-05-13T03:10:00Z",
            source_uuid: "",
            source_type: "",
            source_subtype: ""
          }],
          count: 1
        });

      const client = new CaSessionSourceClient();
      const page = await client.getMessages("sess-2");

      assert.deepEqual(page.messages[0], {
        id: 2,
        sessionId: "sess-2",
        ordinal: 4,
        role: "assistant",
        content: "done",
        timestamp: "2026-05-13T03:10:00Z"
      });
      assert.deepEqual(createMessageAnchor(page.messages[0]), {
        sessionId: "sess-2",
        messageOrdinal: 4
      });
    });

    test("getMessages normalizes null pages to an empty array", async () => {
      const { CaSessionSourceClient } = await loadModule();
      globalThis.fetch = async () =>
        jsonResponse({
          messages: null,
          count: 0
        });

      const client = new CaSessionSourceClient();
      const page = await client.getMessages("sess-empty", {
        from: 10,
        direction: "asc"
      });

      assert.equal(page.count, 0);
      assert.deepEqual(page.messages, []);
    });

    test("fetchSessionTranscriptSnapshot paginates and builds transcript state", async () => {
      const {
        SessionMessageBuffer,
        fetchSessionTranscriptSnapshot
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
                { id: 1, sessionId, ordinal: 0, role: "user", content: "a" },
                { id: 2, sessionId, ordinal: 1, role: "assistant", content: "b" }
              ],
              count: 2
            };
          }
          if (options.from === 2) {
            return {
              messages: [
                { id: 3, sessionId, ordinal: 2, role: "assistant", content: "c" }
              ],
              count: 1
            };
          }
          return { messages: [], count: 0 };
        }
      };

      const snapshot = await fetchSessionTranscriptSnapshot(client, "sess-1", {
        pageLimit: 2
      });

      assert.ok(snapshot.buffer instanceof SessionMessageBuffer);
      assert.equal(snapshot.buffer.sessionId, "sess-1");
      assert.equal(snapshot.startOrdinal, 0);
      assert.equal(snapshot.latestOrdinal, 2);
      assert.deepEqual(snapshot.latestAnchor, {
        sessionId: "sess-1",
        messageOrdinal: 2
      });
      assert.deepEqual(snapshot.fetchedPageSizes, [2, 1]);
      assert.deepEqual(
        snapshot.messages.map((message) => message.ordinal),
        [0, 1, 2]
      );
      assert.deepEqual(calls, [
        {
          sessionId: "sess-1",
          options: { from: 0, limit: 2, direction: "asc" }
        },
        {
          sessionId: "sess-1",
          options: { from: 2, limit: 2, direction: "asc" }
        }
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
                { id: 8, sessionId, ordinal: 7, role: "assistant", content: "h" },
                { id: 9, sessionId, ordinal: 8, role: "assistant", content: "i" }
              ],
              count: 2
            };
          }
          if (options.from === 9) {
            return {
              messages: [
                { id: 10, sessionId, ordinal: 9, role: "assistant", content: "j" }
              ],
              count: 1
            };
          }
          return { messages: [], count: 0 };
        }
      };

      const snapshot = await fetchSessionTranscriptSnapshot(client, "sess-tail", {
        pageLimit: 2,
        tailMessageCount: 3
      });

      assert.equal(snapshot.startOrdinal, 7);
      assert.equal(snapshot.latestOrdinal, 9);
      assert.deepEqual(snapshot.fetchedPageSizes, [2, 1]);
      assert.deepEqual(
        snapshot.messages.map((message) => message.ordinal),
        [7, 8, 9]
      );
      assert.deepEqual(calls, [
        {
          sessionId: "sess-tail",
          options: { from: 7, limit: 2, direction: "asc" }
        },
        {
          sessionId: "sess-tail",
          options: { from: 9, limit: 2, direction: "asc" }
        }
      ]);
    });

    test("fetchEarlierSessionTranscriptPage prepends older messages into the buffer", async () => {
      const {
        SessionMessageBuffer,
        fetchEarlierSessionTranscriptPage
      } = await loadModule();

      const calls = [];
      const buffer = new SessionMessageBuffer("sess-tail", [
        { id: 8, sessionId: "sess-tail", ordinal: 7, role: "assistant", content: "h" },
        { id: 9, sessionId: "sess-tail", ordinal: 8, role: "assistant", content: "i" },
        { id: 10, sessionId: "sess-tail", ordinal: 9, role: "assistant", content: "j" }
      ]);

      const page = await fetchEarlierSessionTranscriptPage({
        async getMessages(sessionId, options) {
          calls.push({ sessionId, options });
          return {
            messages: [
              { id: 7, sessionId, ordinal: 6, role: "user", content: "g" },
              { id: 6, sessionId, ordinal: 5, role: "assistant", content: "f" }
            ],
            count: 2
          };
        }
      }, buffer, {
        pageLimit: 2
      });

      assert.equal(page.kind, "history");
      assert.equal(page.beforeOrdinal, 7);
      assert.equal(page.earliestOrdinal, 5);
      assert.equal(page.latestOrdinal, 9);
      assert.equal(page.hasMore, true);
      assert.deepEqual(
        page.fetchedMessages.map((message) => message.ordinal),
        [5, 6]
      );
      assert.deepEqual(
        page.appendedMessages.map((message) => message.ordinal),
        [5, 6]
      );
      assert.deepEqual(
        buffer.messages.map((message) => message.ordinal),
        [5, 6, 7, 8, 9]
      );
      assert.deepEqual(calls, [
        {
          sessionId: "sess-tail",
          options: { from: 6, limit: 2, direction: "desc" }
        }
      ]);
    });

    test("consumeTranscriptEvent surfaces source.error and dedupes incremental appends", async () => {
      const {
        SessionMessageBuffer,
        consumeTranscriptEvent
      } = await loadModule();

      const buffer = new SessionMessageBuffer("sess-1", [{
        id: 1,
        sessionId: "sess-1",
        ordinal: 0,
        role: "user",
        content: "hello"
      }]);

      const sourceErrorEvent = {
        schemaVersion: "ca-session.event.v1",
        type: "source.error",
        sessionId: "sess-1",
        error: "boom"
      };

      const sourceErrorResult = await consumeTranscriptEvent(
        { getMessages: async () => ({ messages: [], count: 0 }) },
        buffer,
        sourceErrorEvent
      );
      assert.deepEqual(sourceErrorResult, {
        kind: "source_error",
        event: sourceErrorEvent
      });

      const calls = [];
      const client = {
        async getMessages(sessionId, options) {
          calls.push({ sessionId, options });
          return {
            messages: [{
              id: 2,
              sessionId,
              ordinal: 1,
              role: "assistant",
              content: "done"
            }],
            count: 1
          };
        }
      };

      const updated = await consumeTranscriptEvent(client, buffer, {
        schemaVersion: "ca-session.event.v1",
        type: "session.updated",
        sessionId: "sess-1",
        messageCount: 2
      }, {
        pageLimit: 5
      });

      assert.equal(updated.kind, "messages");
      assert.equal(updated.trigger, "session.updated");
      assert.equal(updated.from, 1);
      assert.deepEqual(updated.latestAnchor, {
        sessionId: "sess-1",
        messageOrdinal: 1
      });
      assert.deepEqual(
        updated.appendedMessages.map((message) => message.ordinal),
        [1]
      );
      assert.equal(updated.latestOrdinal, 1);

      const appended = await consumeTranscriptEvent(client, buffer, {
        schemaVersion: "ca-session.event.v1",
        type: "message.appended",
        sessionId: "sess-1",
        messageOrdinal: 1,
        messageCount: 2
      });

      assert.equal(appended.kind, "messages");
      assert.equal(appended.trigger, "message.appended");
      assert.equal(appended.from, 1);
      assert.deepEqual(appended.latestAnchor, {
        sessionId: "sess-1",
        messageOrdinal: 1
      });
      assert.deepEqual(appended.fetchedMessages.map((message) => message.ordinal), [1]);
      assert.deepEqual(appended.appendedMessages, []);
      assert.deepEqual(
        buffer.messages.map((message) => message.ordinal),
        [0, 1]
      );
      assert.deepEqual(calls, [
        {
          sessionId: "sess-1",
          options: { from: 1, limit: 5, direction: "asc" }
        },
        {
          sessionId: "sess-1",
          options: { from: 1, limit: 100, direction: "asc" }
        }
      ]);
    });

    test("consumeTranscriptEvent ignores unknown event types", async () => {
      const { SessionMessageBuffer, consumeTranscriptEvent } = await loadModule();

      const buffer = new SessionMessageBuffer("sess-1", [{
        id: 1,
        sessionId: "sess-1",
        ordinal: 0,
        role: "user",
        content: "hello"
      }]);

      const result = await consumeTranscriptEvent(
        { getMessages: async () => ({ messages: [], count: 0 }) },
        buffer,
        {
          schemaVersion: "ca-session.event.v1",
          type: "session.deleted",
          sessionId: "sess-1"
        }
      );

      assert.equal(result, null);
      assert.deepEqual(buffer.latestAnchor, {
        sessionId: "sess-1",
        messageOrdinal: 0
      });
    });

    test("watchSessionTranscript orchestrates snapshot, watch, and buffer updates", async () => {
      const {
        SessionMessageBuffer,
        watchSessionTranscript
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
              messages: [{
                id: 1,
                sessionId,
                ordinal: 0,
                role: "user",
                content: "hello"
              }],
              count: 1
            };
          }
          if (options.from === 1) {
            return {
              messages: [{
                id: 2,
                sessionId,
                ordinal: 1,
                role: "assistant",
                content: "world"
              }],
              count: 1
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
            closed
          };
        }
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
        }
      });

      assert.ok(watched.buffer instanceof SessionMessageBuffer);
      assert.equal(watched.snapshot.buffer, watched.buffer);
      assert.equal(watched.buffer.earliestOrdinal, 0);
      assert.deepEqual(
        watched.snapshot.messages.map((message) => message.ordinal),
        [0]
      );

      const historyPage = await watched.fetchEarlierPage({
        pageLimit: 2,
        beforeOrdinal: 0
      });
      assert.equal(historyPage.kind, "history");
      assert.equal(historyPage.hasMore, false);
      assert.deepEqual(historyPage.latestAnchor, {
        sessionId: "sess-1",
        messageOrdinal: 0
      });
      assert.deepEqual(historyPage.fetchedMessages, []);

      await watchHandler({
        schemaVersion: "ca-session.event.v1",
        type: "session.updated",
        sessionId: "sess-1",
        messageCount: 2
      });
      await watchHandler({
        schemaVersion: "ca-session.event.v1",
        type: "source.error",
        sessionId: "sess-1",
        error: "boom"
      });

      assert.deepEqual(seenEvents, ["session.updated", "source.error"]);
      assert.equal(seenUpdates.length, 2);
      assert.equal(seenUpdates[0].kind, "messages");
      assert.equal(seenUpdates[0].trigger, "session.updated");
      assert.deepEqual(
        seenUpdates[0].appendedMessages.map((message) => message.ordinal),
        [1]
      );
      assert.equal(seenUpdates[1].kind, "source_error");
      assert.equal(seenUpdates[1].event.error, "boom");
      assert.deepEqual(
        watched.buffer.messages.map((message) => message.ordinal),
        [0, 1]
      );
      assert.deepEqual(calls, [
        {
          sessionId: "sess-1",
          options: { from: 0, limit: 2, direction: "asc" }
        },
        {
          sessionId: "sess-1",
          options: { from: 1, limit: 2, direction: "asc" }
        }
      ]);

      watched.close();
      await watched.closed;
      assert.equal(closeCalls, 1);
    });

    test("getToolCalls maps flattened session tool calls", async () => {
      const { CaSessionSourceClient } = await loadModule();
      globalThis.fetch = async () =>
        jsonResponse({
          tool_calls: [{
            tool_name: "read_file",
            category: "io",
            tool_use_id: "tool-2",
            input_json: "{\"path\":\"/tmp/a\"}",
            skill_name: "files",
            subagent_session_id: "sub-2",
            ordinal: 8,
            timestamp: "2026-05-13T04:00:00Z",
            result_length: 42
          }],
          count: 1
        });

      const client = new CaSessionSourceClient();
      const toolCalls = await client.getToolCalls("sess-1");

      assert.deepEqual(toolCalls, [{
        toolName: "read_file",
        category: "io",
        toolUseId: "tool-2",
        inputJson: "{\"path\":\"/tmp/a\"}",
        skillName: "files",
        subagentSessionId: "sub-2",
        ordinal: 8,
        timestamp: "2026-05-13T04:00:00Z",
        resultContentLength: 42
      }]);
    });

    test("throws ApiError for JSON error responses", async () => {
      const { CaSessionSourceClient, ApiError } = await loadModule();
      globalThis.fetch = async () =>
        jsonResponse({ error: "session not found" }, { status: 404 });

      const client = new CaSessionSourceClient();

      await assert.rejects(
        () => client.getSession("missing"),
        (error) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 404);
          assert.equal(error.message, "session not found");
          return true;
        }
      );
    });

    test("watchEvents parses source_event frames and ignores heartbeat", async () => {
      const { CaSessionSourceClient } = await loadModule();
      globalThis.fetch = async () =>
        new Response(makeSSEStream([
          "event: heartbeat\ndata: 2026-05-13T05:00:00Z\n\n",
          "event: source_event\ndata: {\"schemaVersion\":\"ca-session.event.v1\",\"type\":\"session.updated\",\"sessionId\":\"sess-1\",\"messageCount\":5}\n\n"
        ]), {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });

      const events = [];
      const client = new CaSessionSourceClient();
      const sub = client.watchEvents(
        (event) => {
          events.push(event);
        },
        { reconnect: false }
      );

      await sub.closed;

      assert.deepEqual(events, [{
        schemaVersion: "ca-session.event.v1",
        type: "session.updated",
        sessionId: "sess-1",
        messageCount: 5
      }]);
    });

    test("watchEvents retries after stream failure and reconnects", async () => {
      const { CaSessionSourceClient, ApiError } = await loadModule();
      let attempts = 0;
      const seen = [];

      globalThis.fetch = async () => {
        attempts += 1;
        if (attempts === 1) {
          return jsonResponse({ error: "temporarily unavailable" }, { status: 503 });
        }

        return new Response(makeSSEStream([
          `event: source_event\ndata: {"schemaVersion":"ca-session.event.v1","type":"message.appended","sessionId":"sess-1","messageOrdinal":${attempts}}\n\n`
        ]), {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });
      };

      const errors = [];
      const client = new CaSessionSourceClient();
      const sub = client.watchEvents(
        (event) => {
          seen.push(`${event.type}:${event.messageOrdinal}`);
          if (seen.length === 2) {
            sub.close();
          }
        },
        {
          retryDelayMs: 5,
          maxRetryDelayMs: 10,
          onError: (error) => {
            errors.push(error);
          }
        }
      );

      await waitFor(() => seen.length === 2);
      await sub.closed;

      assert.equal(attempts, 3);
      assert.deepEqual(seen, [
        "message.appended:2",
        "message.appended:3"
      ]);
      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ApiError);
    });
  });
}

function jsonResponse(
  body,
  init = {},
) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

function makeSSEStream(chunks) {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    }
  });
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("timed out waiting for condition");
}
