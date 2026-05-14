import { runClientSessionRestContractSuite } from "./client-session-rest-contract.js";
import { runClientMessageRestContractSuite } from "./client-message-rest-contract.js";
import { runClientToolCallRestContractSuite } from "./client-tool-call-rest-contract.js";
import { runClientMetadataRestContractSuite } from "./client-metadata-rest-contract.js";
import { runClientErrorRestContractSuite } from "./client-error-rest-contract.js";

export function runClientRestContractSuite({
  assert,
  describe,
  test,
  loadModule,
}) {
  describe("REST", () => {
    const suiteArgs = {
      assert,
      test,
      loadModule,
    };
    runClientSessionRestContractSuite(suiteArgs);
    runClientMessageRestContractSuite(suiteArgs);
    runClientToolCallRestContractSuite(suiteArgs);
    runClientMetadataRestContractSuite(suiteArgs);
    runClientErrorRestContractSuite(suiteArgs);
  });
}
