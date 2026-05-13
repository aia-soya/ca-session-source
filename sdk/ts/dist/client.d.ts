import type {
  CaSessionSourceClientOptions,
  EventSubscription,
  MessagePage,
  MessageOptions,
  Session,
  SessionFilter,
  SessionPage,
  SourceEvent,
  ToolCall,
  WatchEventsOptions,
} from "./types.js";

export declare class CaSessionSourceClient {
  constructor(options?: CaSessionSourceClientOptions);

  listSessions(filter?: SessionFilter): Promise<SessionPage>;
  getSession(sessionId: string): Promise<Session>;
  getMessages(
    sessionId: string,
    options?: MessageOptions,
  ): Promise<MessagePage>;
  getToolCalls(sessionId: string): Promise<ToolCall[]>;
  watchEvents(
    onEvent: (event: SourceEvent) => void | Promise<void>,
    options?: WatchEventsOptions,
  ): EventSubscription;
}
