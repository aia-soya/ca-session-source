import type { CaSessionSourceClient } from "./client.js";
import type { SessionTranscriptHistoryPage, SessionTranscriptEventResult, SessionTranscriptSnapshot, SourceEvent } from "./types.js";
import { SessionMessageBuffer } from "./transcript-buffer.js";
export interface FetchSessionTranscriptOptions {
    pageLimit?: number | undefined;
    expectedMessageCount?: number | undefined;
    tailMessageCount?: number | undefined;
}
export interface ConsumeTranscriptEventOptions {
    pageLimit?: number | undefined;
}
export interface FetchEarlierSessionTranscriptPageOptions {
    pageLimit?: number | undefined;
    beforeOrdinal?: number | undefined;
}
export declare function fetchSessionTranscriptSnapshot(client: Pick<CaSessionSourceClient, "getSession" | "getMessages">, sessionId: string, options?: FetchSessionTranscriptOptions): Promise<SessionTranscriptSnapshot & {
    buffer: SessionMessageBuffer;
}>;
export declare function consumeTranscriptEvent(client: Pick<CaSessionSourceClient, "getMessages">, buffer: SessionMessageBuffer, event: SourceEvent, options?: ConsumeTranscriptEventOptions): Promise<SessionTranscriptEventResult>;
export declare function fetchEarlierSessionTranscriptPage(client: Pick<CaSessionSourceClient, "getMessages">, buffer: SessionMessageBuffer, options?: FetchEarlierSessionTranscriptPageOptions): Promise<SessionTranscriptHistoryPage>;
