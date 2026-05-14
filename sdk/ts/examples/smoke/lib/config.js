const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_EVENT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_DELAY_MS = 1000;

export function loadSmokeConfig(env = process.env) {
  return {
    baseUrl: env.CASS_BASE_URL ?? DEFAULT_BASE_URL,
    sessionId: requiredEnv(env, "CASS_SESSION_ID"),
    authToken: optionalEnv(env, "CASS_AUTH_TOKEN"),
    pageLimit: parsePositiveIntEnv(env, "CASS_PAGE_LIMIT", DEFAULT_PAGE_LIMIT),
    eventTimeoutMs: parsePositiveIntEnv(
      env,
      "CASS_EVENT_TIMEOUT_MS",
      DEFAULT_EVENT_TIMEOUT_MS,
    ),
    expectedFinalMessageCount: parsePositiveIntEnvOptional(
      env,
      "CASS_EXPECT_FINAL_MESSAGE_COUNT",
    ),
    snapshotTailCount: parsePositiveIntEnvOptional(
      env,
      "CASS_SNAPSHOT_TAIL_COUNT",
    ),
    historyPageLimit: parsePositiveIntEnvOptional(
      env,
      "CASS_HISTORY_PAGE_LIMIT",
    ),
    reconnect: parseBooleanEnv(env, "CASS_RECONNECT", false),
    retryDelayMs: parsePositiveIntEnv(
      env,
      "CASS_RETRY_DELAY_MS",
      DEFAULT_RETRY_DELAY_MS,
    ),
  };
}

function requiredEnv(env, name) {
  const value = optionalEnv(env, name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalEnv(env, name) {
  const value = env[name];
  if (!value) {
    return undefined;
  }
  return value.trim() === "" ? undefined : value;
}

function parsePositiveIntEnv(env, name, fallback) {
  const value = optionalEnv(env, name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parsePositiveIntEnvOptional(env, name) {
  const value = optionalEnv(env, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseBooleanEnv(env, name, fallback) {
  const value = optionalEnv(env, name);
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
