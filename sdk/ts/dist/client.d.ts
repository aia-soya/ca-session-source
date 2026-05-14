import type { CaSessionSourceClientOptions, EventSubscription, MessagePage, MessageOptions, Session, SessionFilter, SessionPage, SourceHealth, SourceEvent, SourceVersion, ToolCall, WatchEventsOptions } from "./types.js";
export declare class CaSessionSourceClient {
    private readonly baseUrl;
    private readonly restBaseUrl;
    private readonly sourceEventsUrl;
    private readonly authToken;
    private readonly fetchImpl;
    private readonly headers;
    constructor(options?: CaSessionSourceClientOptions);
    listSessions(filter?: SessionFilter): Promise<SessionPage>;
    getSession(sessionId: string): Promise<Session>;
    getMessages(sessionId: string, options?: MessageOptions): Promise<MessagePage>;
    getToolCalls(sessionId: string): Promise<ToolCall[]>;
    getVersion(): Promise<SourceVersion>;
    getHealth(): Promise<SourceHealth>;
    watchEvents(onEvent: (event: SourceEvent) => void | Promise<void>, options?: WatchEventsOptions): EventSubscription;
    private fetchJSON;
    private requestHeaders;
}
