import { jsonResponse } from "./contract-helpers.js";
import { makeToolCallsPage, makeToolCall } from "./contract-fixtures.js";

export function runClientToolCallRestContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("getToolCalls maps flattened session tool calls", async () => {
    const { CaSessionSourceClient } = await loadModule();
    globalThis.fetch = async () =>
      jsonResponse(makeToolCallsPage({
        toolCalls: [makeToolCall({
          toolName: "read_file",
          category: "io",
          toolUseId: "tool-2",
          inputJson: "{\"path\":\"/tmp/a\"}",
          skillName: "files",
          subagentSessionId: "sub-2",
          ordinal: 8,
          timestamp: "2026-05-13T04:00:00Z",
          resultContentLength: 42,
        })],
      }));

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
      resultContentLength: 42,
    }]);
  });
}
