import { ApiError, EventStreamError } from "./errors.js";
export const SOURCE_EVENT_SCHEMA_VERSION = "ca-session.event.v1";
export function watchSourceEvents(input) {
  const controller = new AbortController();
  const signal = mergeSignals(controller.signal, input.signal);
  const fetchImpl = input.fetchImpl;
  const reconnect = input.reconnect ?? true;
  const retryDelayMs = input.retryDelayMs ?? 1e3;
  const maxRetryDelayMs = input.maxRetryDelayMs ?? 3e4;
  const backoffMultiplier = input.backoffMultiplier ?? 2;
  let closed = false;
  let resolveClosed;
  let rejectClosed;
  const closedPromise = new Promise((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  void (async () => {
    let delayMs = retryDelayMs;
    try {
      while (!closed) {
        try {
          const requestInit = { signal };
          if (input.headers !== void 0) {
            requestInit.headers = input.headers;
          }
          const response = await fetchImpl(input.url, requestInit);
          if (!response.ok) {
            throw await toApiError(response);
          }
          if (!response.body) {
            throw new EventStreamError("event stream body is empty");
          }
          input.onOpen?.();
          delayMs = retryDelayMs;
          await consumeStream(response.body, async (frame) => {
            if (frame.event !== "source_event" || frame.data === "") {
              return;
            }
            const parsed = JSON.parse(frame.data);
            await input.onEvent(parsed);
          });
          if (!reconnect) {
            resolveClosed();
            return;
          }
        } catch (error) {
          if (closed || signal.aborted) {
            resolveClosed();
            return;
          }
          input.onError?.(error);
          if (!reconnect) {
            rejectClosed(error);
            return;
          }
          await sleep(delayMs, signal);
          delayMs = Math.min(
            maxRetryDelayMs,
            Math.max(retryDelayMs, Math.round(delayMs * backoffMultiplier))
          );
        }
      }
      resolveClosed();
    } catch (error) {
      if (closed || signal.aborted) {
        resolveClosed();
        return;
      }
      rejectClosed(error);
    }
  })();
  return {
    close() {
      if (closed) {
        return;
      }
      closed = true;
      controller.abort();
      resolveClosed();
    },
    closed: closedPromise
  };
}
async function toApiError(response) {
  const bodyText = await response.text();
  const body = parseJsonBody(bodyText);
  const message = extractErrorMessage(body, bodyText) ?? `API ${response.status}`;
  return new ApiError(response.status, message, body);
}
function parseJsonBody(bodyText) {
  if (bodyText.trim() === "") {
    return void 0;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}
function extractErrorMessage(body, bodyText) {
  if (typeof body === "string" && body.trim() !== "") {
    return body.trim();
  }
  if (typeof body === "object" && body !== null) {
    const error = body.error;
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  }
  if (bodyText.trim() !== "") {
    return bodyText.trim();
  }
  return void 0;
}
async function consumeStream(stream, onFrame) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");
      const processed = await processCompleteFrames(buffer, onFrame);
      buffer = processed.rest;
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") {
      await onFrame(parseFrame(buffer));
    }
  } finally {
    reader.releaseLock();
  }
}
async function processCompleteFrames(buffer, onFrame) {
  let start = 0;
  for (; ; ) {
    const end = buffer.indexOf("\n\n", start);
    if (end === -1) {
      return { rest: buffer.slice(start) };
    }
    const frame = buffer.slice(start, end);
    start = end + 2;
    await onFrame(parseFrame(frame));
  }
}
function parseFrame(frame) {
  let event = "";
  const dataLines = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = stripOptionalLeadingSpace(line.slice(6));
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(stripOptionalLeadingSpace(line.slice(5)));
    }
  }
  return {
    event,
    data: dataLines.join("\n")
  };
}
function stripOptionalLeadingSpace(value) {
  return value.startsWith(" ") ? value.slice(1) : value;
}
function mergeSignals(localSignal, externalSignal) {
  if (!externalSignal) {
    return localSignal;
  }
  if (externalSignal.aborted) {
    return externalSignal;
  }
  return AbortSignal.any([localSignal, externalSignal]);
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new EventStreamError("event stream aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
