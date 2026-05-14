import { jsonResponse } from "./contract-helpers.js";
import { makeSessionPage, makeSession } from "./contract-fixtures.js";

export function runClientSessionRestContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("listSessions maps source-oriented fields and auth headers", async () => {
    const { CaSessionSourceClient } = await loadModule();
    const calls = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(makeSessionPage({
        sessions: [makeSession()],
        total: 10,
        nextCursor: "cursor-1",
      }));
    };

    const client = new CaSessionSourceClient({
      authToken: "secret",
    });

    const page = await client.listSessions({
      agent: "codex",
      limit: 10,
      includeChildren: true,
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
      updatedAt: "2026-05-13T02:00:00Z",
    });

    const requestUrl = calls[0]?.input;
    assert.ok(requestUrl instanceof URL);
    assert.equal(requestUrl.origin, "http://127.0.0.1:8080");
    assert.equal(requestUrl.pathname, "/api/source/v1/sessions");
    assert.equal(requestUrl.searchParams.get("agent"), "codex");
    assert.equal(requestUrl.searchParams.get("limit"), "10");
    assert.equal(requestUrl.searchParams.get("include_children"), "true");

    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer secret");
    assert.equal(headers.get("Accept"), "application/json");
  });
}
