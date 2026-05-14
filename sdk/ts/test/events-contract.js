import { jsonResponse, makeSSEStream, waitFor } from "./contract-helpers.js";

export function runEventsContractSuite({
  assert,
  describe,
  test,
  loadModule,
}) {
  describe("Events", () => {
    test("watchEvents parses source_event frames and ignores heartbeat", async () => {
      const { CaSessionSourceClient } = await loadModule();
      globalThis.fetch = async () =>
        new Response(makeSSEStream([
          "event: heartbeat\ndata: 2026-05-13T05:00:00Z\n\n",
          "event: source_event\ndata: {\"schemaVersion\":\"ca-session.event.v1\",\"type\":\"session.updated\",\"sessionId\":\"sess-1\",\"messageCount\":5}\n\n",
        ]), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });

      const events = [];
      const client = new CaSessionSourceClient();
      const sub = client.watchEvents(
        (event) => {
          events.push(event);
        },
        { reconnect: false },
      );

      await sub.closed;

      assert.deepEqual(events, [{
        schemaVersion: "ca-session.event.v1",
        type: "session.updated",
        sessionId: "sess-1",
        messageCount: 5,
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
          `event: source_event\ndata: {"schemaVersion":"ca-session.event.v1","type":"message.appended","sessionId":"sess-1","messageOrdinal":${attempts}}\n\n`,
        ]), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
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
          },
        },
      );

      await waitFor(() => seen.length === 2);
      await sub.closed;

      assert.equal(attempts, 3);
      assert.deepEqual(seen, [
        "message.appended:2",
        "message.appended:3",
      ]);
      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof ApiError);
    });
  });
}
