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
        endedAt: undefined,
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
