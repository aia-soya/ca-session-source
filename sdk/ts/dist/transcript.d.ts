import type { CaSessionSourceClient } from "./client.js";
import type { Message, SessionTranscriptHistoryPage, SessionTranscriptEventResult, SessionTranscriptSnapshot, SourceEvent, WatchEventsOptions } from "./types.js";
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
export declare class SessionMessageBuffer {
    private readonly messagesByOrdinal;
    private earliestOrdinalValue;
    private latestOrdinalValue;
    private sortedMessagesCache;
    readonly sessionId: string;
    constructor(sessionId: string, initialMessages?: Message[]);
    get size(): number;
    get latestOrdinal(): number;
    get earliestOrdinal(): number;
    get messages(): Message[];
    append(messages: Message[]): Message[];
}
export declare function fetchSessionTranscriptSnapshot(client: Pick<CaSessionSourceClient, "getSession" | "getMessages">, sessionId: string, options?: FetchSessionTranscriptOptions): Promise<SessionTranscriptSnapshot & {
    buffer: SessionMessageBuffer;
}>;
export declare function consumeTranscriptEvent(client: Pick<CaSessionSourceClient, "getMessages">, buffer: SessionMessageBuffer, event: SourceEvent, options?: ConsumeTranscriptEventOptions): Promise<SessionTranscriptEventResult>;
export declare function fetchEarlierSessionTranscriptPage(client: Pick<CaSessionSourceClient, "getMessages">, buffer: SessionMessageBuffer, options?: FetchEarlierSessionTranscriptPageOptions): Promise<SessionTranscriptHistoryPage>;
export declare function watchSessionTranscript(client: Pick<CaSessionSourceClient, "getSession" | "getMessages" | "watchEvents">, sessionId: string, options?: WatchSessionTranscriptOptions): Promise<WatchedSessionTranscript>;
