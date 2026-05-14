import { runClientRestContractSuite } from "./client-rest-contract.js";
import { runTranscriptContractSuite } from "./transcript-contract.js";
import { runEventsContractSuite } from "./events-contract.js";

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

    const suiteArgs = {
      assert,
      describe,
      test,
      loadModule,
    };
    runClientRestContractSuite(suiteArgs);
    runTranscriptContractSuite(suiteArgs);
    runEventsContractSuite(suiteArgs);
  });
}
