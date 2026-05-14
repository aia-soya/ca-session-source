import type { CaSessionSourceClient } from "./client.js";
import type { SessionTranscriptEventResult, SessionTranscriptHistoryPage, SessionTranscriptSnapshot, SourceEvent, WatchEventsOptions } from "./types.js";
import { consumeTranscriptEvent, fetchEarlierSessionTranscriptPage, fetchSessionTranscriptSnapshot } from "./transcript-sync.js";
import type { FetchEarlierSessionTranscriptPageOptions, FetchSessionTranscriptOptions } from "./transcript-sync.js";
import { SessionMessageBuffer, createMessageAnchor } from "./transcript-buffer.js";
export { consumeTranscriptEvent, createMessageAnchor, fetchEarlierSessionTranscriptPage, fetchSessionTranscriptSnapshot, SessionMessageBuffer, };
export type { ConsumeTranscriptEventOptions, FetchEarlierSessionTranscriptPageOptions, FetchSessionTranscriptOptions, } from "./transcript-sync.js";
export interface WatchSessionTranscriptOptions extends FetchSessionTranscriptOptions, WatchEventsOptions {
    onEvent?: (event: SourceEvent) => void | Promise<void>;
    onUpdate?: (update: Exclude<SessionTranscriptEventResult, null>) => void | Promise<void>;
}
export interface WatchedSessionTranscript {
    buffer: SessionMessageBuffer;
    snapshot: SessionTranscriptSnapshot & {
        buffer: SessionMessageBuffer;
    };
    fetchEarlierPage(options?: FetchEarlierSessionTranscriptPageOptions): Promise<SessionTranscriptHistoryPage>;
    close(): void;
    readonly closed: Promise<void>;
}
export declare function watchSessionTranscript(client: Pick<CaSessionSourceClient, "getSession" | "getMessages" | "watchEvents">, sessionId: string, options?: WatchSessionTranscriptOptions): Promise<WatchedSessionTranscript>;
