import assert from "node:assert/strict";

import {
  CaSessionSourceClient,
  watchSessionTranscript,
} from "../../dist/index.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_EVENT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_DELAY_MS = 1000;

async function main() {
  const baseUrl = process.env.CASS_BASE_URL ?? DEFAULT_BASE_URL;
  const sessionId = requiredEnv("CASS_SESSION_ID");
  const authToken = optionalEnv("CASS_AUTH_TOKEN");
  const pageLimit = parsePositiveIntEnv("CASS_PAGE_LIMIT", DEFAULT_PAGE_LIMIT);
  const eventTimeoutMs = parsePositiveIntEnv(
    "CASS_EVENT_TIMEOUT_MS",
    DEFAULT_EVENT_TIMEOUT_MS,
  );
  const expectedFinalMessageCount = parsePositiveIntEnvOptional(
    "CASS_EXPECT_FINAL_MESSAGE_COUNT",
  );
  const snapshotTailCount = parsePositiveIntEnvOptional(
    "CASS_SNAPSHOT_TAIL_COUNT",
  );
  const historyPageLimit = parsePositiveIntEnvOptional(
    "CASS_HISTORY_PAGE_LIMIT",
  );
  const reconnect = parseBooleanEnv("CASS_RECONNECT", false);
  const retryDelayMs = parsePositiveIntEnv(
    "CASS_RETRY_DELAY_MS",
    DEFAULT_RETRY_DELAY_MS,
  );

  const client = new CaSessionSourceClient({ baseUrl, authToken });
  const result = {
    baseUrl,
    sessionId,
    snapshot: {
      listedSessionIds: [],
      listedTotal: 0,
      sessionMessageCount: 0,
      startOrdinal: 0,
      fetchedPageSizes: [],
      cachedOrdinals: [],
      toolCallCount: 0,
    },
    eventFlow: {
      openCount: 0,
      errors: [],
      seenEvents: [],
      fetches: [],
      finalOrdinals: [],
      finalMessageCount: 0,
    },
    history: {
      fetches: [],
    },
  };

  const page = await client.listSessions({
    includeOneShot: true,
    includeAutomated: true,
    includeChildren: true,
    limit: 50,
  });
  result.snapshot.listedSessionIds = page.sessions.map((session) => session.id);
  result.snapshot.listedTotal = page.total;

  const listedSession = page.sessions.find((session) => session.id === sessionId);
  assert(listedSession, `session ${sessionId} not found in listSessions()`);

  const session = await client.getSession(sessionId);
  result.snapshot.sessionMessageCount = session.messageCount;

  const targetFinalMessageCount =
    expectedFinalMessageCount ?? session.messageCount + 1;

  const toolCalls = await client.getToolCalls(sessionId);
  result.snapshot.toolCallCount = toolCalls.length;

  let sawSessionUpdated = false;
  let sawMessageAppended = false;
  let settled = false;
  let settleDone;
  let settleError;
  const done = new Promise((resolve, reject) => {
    settleDone = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    settleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
  });

  const timeout = setTimeout(() => {
    settleError(
      new Error(
        `timed out after ${eventTimeoutMs}ms waiting for session.updated + message.appended`,
      ),
    );
  }, eventTimeoutMs);

  const watched = await watchSessionTranscript(client, sessionId, {
    pageLimit,
    expectedMessageCount: session.messageCount,
    tailMessageCount: snapshotTailCount,
    reconnect,
    retryDelayMs,
    onEvent(event) {
      if (event.sessionId !== sessionId) {
        return;
      }

      result.eventFlow.seenEvents.push({
        type: event.type,
        messageOrdinal: event.messageOrdinal ?? null,
        messageCount: event.messageCount ?? null,
      });

      if (event.type === "session.updated") {
        sawSessionUpdated = true;
      }
      if (event.type === "message.appended") {
        sawMessageAppended = true;
      }
    },
    async onUpdate(update) {
      if (update.kind === "source_error") {
        result.eventFlow.fetches.push({
          trigger: update.kind,
          error: update.event.error ?? null,
          from: null,
          fetchedOrdinals: [],
          appendedOrdinals: [],
        });
        return;
      }

      result.eventFlow.fetches.push({
        trigger: update.trigger,
        from: update.from,
        fetchedOrdinals: update.fetchedMessages.map((message) => message.ordinal),
        appendedOrdinals: update.appendedMessages.map((message) => message.ordinal),
      });

      if (
        sawSessionUpdated &&
        sawMessageAppended &&
        watched.buffer.size >= targetFinalMessageCount
      ) {
        settleDone();
      }
    },
    onOpen() {
      result.eventFlow.openCount += 1;
      if (result.eventFlow.openCount === 1) {
        process.stdout.write("SMOKE_READY\n");
        return;
      }
      process.stdout.write(`SMOKE_REOPEN ${result.eventFlow.openCount}\n`);
    },
    onError(error) {
      const message = error instanceof Error ? error.message : String(error);
      result.eventFlow.errors.push(message);
      if (!reconnect) {
        settleError(error instanceof Error ? error : new Error(message));
      }
    },
  });

  result.snapshot.startOrdinal = watched.snapshot.startOrdinal;
  result.snapshot.fetchedPageSizes = watched.snapshot.fetchedPageSizes;
  result.snapshot.cachedOrdinals = watched.snapshot.messages.map((message) => message.ordinal);

  if (historyPageLimit) {
    const historyPage = await watched.fetchEarlierPage({
      pageLimit: historyPageLimit,
    });
    result.history.fetches.push({
      beforeOrdinal: historyPage.beforeOrdinal,
      fetchedOrdinals: historyPage.fetchedMessages.map((message) => message.ordinal),
      appendedOrdinals: historyPage.appendedMessages.map((message) => message.ordinal),
      earliestOrdinal: historyPage.earliestOrdinal,
      latestOrdinal: historyPage.latestOrdinal,
      hasMore: historyPage.hasMore,
    });
  }

  try {
    await done;
  } finally {
    clearTimeout(timeout);
    watched.close();
    await watched.closed;
  }

  result.eventFlow.finalOrdinals = watched.buffer.messages.map((message) => message.ordinal);
  result.eventFlow.finalMessageCount = watched.buffer.size;

  process.stdout.write(`SMOKE_RESULT ${JSON.stringify(result)}\n`);
}

function requiredEnv(name) {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  return value.trim() === "" ? undefined : value;
}

function parsePositiveIntEnv(name, fallback) {
  const value = optionalEnv(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parsePositiveIntEnvOptional(name) {
  const value = optionalEnv(name);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseBooleanEnv(name, fallback) {
  const value = optionalEnv(name);
  if (!value) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
