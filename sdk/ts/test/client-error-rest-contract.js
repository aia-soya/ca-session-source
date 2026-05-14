import { jsonResponse } from "./contract-helpers.js";

export function runClientErrorRestContractSuite({
  assert,
  test,
  loadModule,
}) {
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
      },
    );
  });
}
