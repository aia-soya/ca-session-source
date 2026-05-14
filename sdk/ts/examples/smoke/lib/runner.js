import assert from "node:assert/strict";

import {
  CaSessionSourceClient,
  watchSessionTranscript,
} from "../../../dist/index.js";

import { createSmokeResult } from "./result.js";

export async function runSmoke(config, { stdout = process.stdout } = {}) {
  const client = new CaSessionSourceClient({
    baseUrl: config.baseUrl,
    authToken: config.authToken,
  });
  const result = createSmokeResult(config.baseUrl, config.sessionId);

  await recordServiceMetadata(client, result);

  const page = await client.listSessions({
    includeOneShot: true,
    includeAutomated: true,
    includeChildren: true,
    limit: 50,
  });
  result.snapshot.listedSessionIds = page.sessions.map((session) => session.id);
  result.snapshot.listedTotal = page.total;

  const listedSession = page.sessions.find(
    (session) => session.id === config.sessionId,
  );
  assert(listedSession, `session ${config.sessionId} not found in listSessions()`);

  const session = await client.getSession(config.sessionId);
  result.snapshot.sessionMessageCount = session.messageCount;

  const targetFinalMessageCount =
    config.expectedFinalMessageCount ?? session.messageCount + 1;

  const toolCalls = await client.getToolCalls(config.sessionId);
  result.snapshot.toolCallCount = toolCalls.length;

  const signals = createEventSignals(config.eventTimeoutMs);
  let sawSessionUpdated = false;
  let sawMessageAppended = false;

  const watched = await watchSessionTranscript(client, config.sessionId, {
    pageLimit: config.pageLimit,
    expectedMessageCount: session.messageCount,
    tailMessageCount: config.snapshotTailCount,
    reconnect: config.reconnect,
    retryDelayMs: config.retryDelayMs,
    onEvent(event) {
      if (event.sessionId !== config.sessionId) {
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
        signals.resolve();
      }
    },
    onOpen() {
      result.eventFlow.openCount += 1;
      if (result.eventFlow.openCount === 1) {
        stdout.write("SMOKE_READY\n");
        return;
      }
      stdout.write(`SMOKE_REOPEN ${result.eventFlow.openCount}\n`);
    },
    onError(error) {
      const message = error instanceof Error ? error.message : String(error);
      result.eventFlow.errors.push(message);
      if (!config.reconnect) {
        signals.reject(error instanceof Error ? error : new Error(message));
      }
    },
  });

  result.snapshot.startOrdinal = watched.snapshot.startOrdinal;
  result.snapshot.fetchedPageSizes = watched.snapshot.fetchedPageSizes;
  result.snapshot.cachedOrdinals = watched.snapshot.messages.map(
    (message) => message.ordinal,
  );

  if (config.historyPageLimit) {
    const historyPage = await watched.fetchEarlierPage({
      pageLimit: config.historyPageLimit,
    });
    result.history.fetches.push({
      beforeOrdinal: historyPage.beforeOrdinal,
      fetchedOrdinals: historyPage.fetchedMessages.map((message) => message.ordinal),
      appendedOrdinals: historyPage.appendedMessages.map(
        (message) => message.ordinal,
      ),
      earliestOrdinal: historyPage.earliestOrdinal,
      latestOrdinal: historyPage.latestOrdinal,
      hasMore: historyPage.hasMore,
    });
  }

  try {
    await signals.done;
  } finally {
    signals.dispose();
    watched.close();
    await watched.closed;
  }

  result.eventFlow.finalOrdinals = watched.buffer.messages.map(
    (message) => message.ordinal,
  );
  result.eventFlow.finalMessageCount = watched.buffer.size;

  stdout.write(`SMOKE_RESULT ${JSON.stringify(result)}\n`);
}

async function recordServiceMetadata(client, result) {
  const version = await client.getVersion();
  result.snapshot.version = {
    schemaVersion: version.schemaVersion,
    version: version.version,
    commit: version.commit,
    buildDate: version.buildDate,
    readOnly: version.readOnly ?? null,
  };

  const health = await client.getHealth();
  result.snapshot.health = {
    schemaVersion: health.schemaVersion,
    status: health.status,
    readOnly: health.readOnly ?? null,
    eventStreamAvailable: health.eventStreamAvailable,
  };
}

function createEventSignals(eventTimeoutMs) {
  let settled = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    rejectDone = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
  });

  const timeout = setTimeout(() => {
    rejectDone(
      new Error(
        `timed out after ${eventTimeoutMs}ms waiting for session.updated + message.appended`,
      ),
    );
  }, eventTimeoutMs);

  return {
    done,
    resolve: resolveDone,
    reject: rejectDone,
    dispose() {
      clearTimeout(timeout);
    },
  };
}
