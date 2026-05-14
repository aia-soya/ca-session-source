import { jsonResponse } from "./contract-helpers.js";
import { makeMessagePage, makeMessage, makeToolCall } from "./contract-fixtures.js";

export function runClientMessageRestContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("getMessages maps embedded tool calls", async () => {
    const { CaSessionSourceClient } = await loadModule();
    globalThis.fetch = async () =>
      jsonResponse(makeMessagePage({
        messages: [makeMessage({
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
          toolCalls: [makeToolCall({
            resultContent: "ok",
            resultContentLength: 2,
            subagentSessionId: "sub-1",
          })],
        })],
      }));

    const client = new CaSessionSourceClient();
    const page = await client.getMessages("sess-1", {
      from: 3,
      direction: "asc",
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
        subagentSessionId: "sub-1",
      }],
    });
  });

  test("getMessages keeps source anchor fields optional when upstream omits them", async () => {
    const { CaSessionSourceClient, createMessageAnchor } = await loadModule();
    globalThis.fetch = async () =>
      jsonResponse(makeMessagePage({
        messages: [makeMessage({
          id: 2,
          sessionId: "sess-2",
          ordinal: 4,
          role: "assistant",
          content: "done",
          timestamp: "2026-05-13T03:10:00Z",
          sourceUuid: "",
          sourceType: "",
          sourceSubtype: "",
        })],
      }));

    const client = new CaSessionSourceClient();
    const page = await client.getMessages("sess-2");

    assert.deepEqual(page.messages[0], {
      id: 2,
      sessionId: "sess-2",
      ordinal: 4,
      role: "assistant",
      content: "done",
      timestamp: "2026-05-13T03:10:00Z",
    });
    assert.deepEqual(createMessageAnchor(page.messages[0]), {
      sessionId: "sess-2",
      messageOrdinal: 4,
    });
  });

  test("getMessages normalizes null pages to an empty array", async () => {
    const { CaSessionSourceClient } = await loadModule();
    globalThis.fetch = async () =>
      jsonResponse(makeMessagePage({
        messages: null,
        count: 0,
      }));

    const client = new CaSessionSourceClient();
    const page = await client.getMessages("sess-empty", {
      from: 10,
      direction: "asc",
    });

    assert.equal(page.count, 0);
    assert.deepEqual(page.messages, []);
  });
}
