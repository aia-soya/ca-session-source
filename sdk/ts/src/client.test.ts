import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { runClientContractSuite } from "../test/client-contract.js";

runClientContractSuite({
  assert,
  beforeEach,
  afterEach,
  describe,
  test,
  loadModule: () => import("./index.ts"),
});
