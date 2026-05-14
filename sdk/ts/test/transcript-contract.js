import { runTranscriptSnapshotContractSuite } from "./transcript-snapshot-contract.js";
import { runTranscriptEventContractSuite } from "./transcript-event-contract.js";
import { runTranscriptWatchContractSuite } from "./transcript-watch-contract.js";

export function runTranscriptContractSuite({
  assert,
  describe,
  test,
  loadModule,
}) {
  describe("Transcript", () => {
    const suiteArgs = {
      assert,
      test,
      loadModule,
    };
    runTranscriptSnapshotContractSuite(suiteArgs);
    runTranscriptEventContractSuite(suiteArgs);
    runTranscriptWatchContractSuite(suiteArgs);
  });
}
