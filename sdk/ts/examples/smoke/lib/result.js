export function createSmokeResult(baseUrl, sessionId) {
  return {
    baseUrl,
    sessionId,
    snapshot: {
      version: {
        schemaVersion: "",
        version: "",
        commit: "",
        buildDate: "",
        readOnly: null,
      },
      health: {
        schemaVersion: "",
        status: "",
        readOnly: null,
        eventStreamAvailable: false,
      },
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
}
