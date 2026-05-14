import { jsonResponse } from "./contract-helpers.js";
import { makeSourceHealth, makeSourceVersion } from "./contract-fixtures.js";

export function runClientMetadataRestContractSuite({
  assert,
  test,
  loadModule,
}) {
  test("getVersion maps stable source metadata", async () => {
    const { CaSessionSourceClient } = await loadModule();
    globalThis.fetch = async () => jsonResponse(makeSourceVersion());

    const client = new CaSessionSourceClient();
    const version = await client.getVersion();

    assert.deepEqual(version, {
      schemaVersion: "ca-session.source.v1",
      version: "v1.2.3",
      commit: "abc1234",
      buildDate: "2026-05-14T00:00:00Z",
      readOnly: true,
    });
  });

  test("getHealth maps stable source health metadata", async () => {
    const { CaSessionSourceClient } = await loadModule();
    globalThis.fetch = async () => jsonResponse(makeSourceHealth());

    const client = new CaSessionSourceClient();
    const health = await client.getHealth();

    assert.deepEqual(health, {
      schemaVersion: "ca-session.source.v1",
      status: "ok",
      readOnly: false,
      eventStreamAvailable: true,
    });
  });
}
