import type {
  EventSubscription,
  SourceEvent,
  WatchEventsOptions,
} from "./types.js";

export declare const SOURCE_EVENT_SCHEMA_VERSION = "ca-session.event.v1";

export interface WatchSourceEventsInput extends WatchEventsOptions {
  url: string;
  fetchImpl: typeof fetch;
  headers?: HeadersInit;
  onEvent: (event: SourceEvent) => void | Promise<void>;
}

export declare function watchSourceEvents(
  input: WatchSourceEventsInput,
): EventSubscription;
