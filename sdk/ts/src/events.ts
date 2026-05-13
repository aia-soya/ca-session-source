import { ApiError, EventStreamError } from "./errors.ts";
import type {
  EventSubscription,
  SourceEvent,
  WatchEventsOptions,
} from "./types.ts";

export const SOURCE_EVENT_SCHEMA_VERSION = "ca-session.event.v1";

export interface WatchSourceEventsInput extends WatchEventsOptions {
  url: string;
  fetchImpl: typeof fetch;
  headers?: HeadersInit;
  onEvent: (event: SourceEvent) => void | Promise<void>;
}

interface SSEFrame {
  event: string;
  data: string;
}

export function watchSourceEvents(
  input: WatchSourceEventsInput,
): EventSubscription {
  const controller = new AbortController();
  const signal = mergeSignals(controller.signal, input.signal);
  const fetchImpl = input.fetchImpl;
  const reconnect = input.reconnect ?? true;
  const retryDelayMs = input.retryDelayMs ?? 1000;
  const maxRetryDelayMs = input.maxRetryDelayMs ?? 30000;
  const backoffMultiplier = input.backoffMultiplier ?? 2;

  let closed = false;
  let resolveClosed!: () => void;
  let rejectClosed!: (error: unknown) => void;
  const closedPromise = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });

  void (async () => {
    let delayMs = retryDelayMs;

    try {
      while (!closed) {
        try {
          const response = await fetchImpl(input.url, {
            headers: input.headers,
            signal,
          });

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

            const parsed = JSON.parse(frame.data) as SourceEvent;
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
            Math.max(retryDelayMs, Math.round(delayMs * backoffMultiplier)),
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
    closed: closedPromise,
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  const bodyText = await response.text();
  const body = parseJsonBody(bodyText);
  const message = extractErrorMessage(body, bodyText) ?? `API ${response.status}`;
  return new ApiError(response.status, message, body);
}

function parseJsonBody(bodyText: string): unknown {
  if (bodyText.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function extractErrorMessage(body: unknown, bodyText: string): string | undefined {
  if (typeof body === "string" && body.trim() !== "") {
    return body.trim();
  }

  if (typeof body === "object" && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }
  }

  if (bodyText.trim() !== "") {
    return bodyText.trim();
  }

  return undefined;
}

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  onFrame: (frame: SSEFrame) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
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

async function processCompleteFrames(
  buffer: string,
  onFrame: (frame: SSEFrame) => void | Promise<void>,
): Promise<{ rest: string }> {
  let start = 0;

  for (;;) {
    const end = buffer.indexOf("\n\n", start);
    if (end === -1) {
      return { rest: buffer.slice(start) };
    }

    const frame = buffer.slice(start, end);
    start = end + 2;
    await onFrame(parseFrame(frame));
  }
}

function parseFrame(frame: string): SSEFrame {
  let event = "";
  const dataLines: string[] = [];

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
    data: dataLines.join("\n"),
  };
}

function stripOptionalLeadingSpace(value: string): string {
  return value.startsWith(" ") ? value.slice(1) : value;
}

function mergeSignals(
  localSignal: AbortSignal,
  externalSignal?: AbortSignal,
): AbortSignal {
  if (!externalSignal) {
    return localSignal;
  }
  if (externalSignal.aborted) {
    return externalSignal;
  }
  return AbortSignal.any([localSignal, externalSignal]);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new EventStreamError("event stream aborted"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
