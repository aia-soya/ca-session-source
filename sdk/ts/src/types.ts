export type SourceEventType =
  | "session.created"
  | "session.updated"
  | "message.appended"
  | "source.error";

export interface Session {
  id: string;
  agent: string;
  project: string;
  machine?: string | undefined;
  cwd?: string | undefined;
  gitBranch?: string | undefined;
  firstMessage?: string | undefined;
  displayName?: string | undefined;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  messageCount: number;
  userMessageCount?: number | undefined;
  sourcePath?: string | undefined;
  updatedAt?: string | undefined;
}

export interface ToolCall {
  toolName: string;
  category?: string | undefined;
  toolUseId?: string | undefined;
  inputJson?: string | undefined;
  skillName?: string | undefined;
  resultContent?: string | undefined;
  resultContentLength?: number | undefined;
  subagentSessionId?: string | undefined;
  ordinal?: number | undefined;
  timestamp?: string | undefined;
}

export interface Message {
  id: number;
  sessionId: string;
  ordinal: number;
  role: string;
  content: string;
  thinkingText?: string | undefined;
  timestamp?: string | undefined;
  hasThinking?: boolean | undefined;
  hasToolUse?: boolean | undefined;
  model?: string | undefined;
  tokenUsage?: unknown | undefined;
  sourceUuid?: string | undefined;
  sourceType?: string | undefined;
  sourceSubtype?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
}

export interface MessageAnchor {
  sessionId: string;
  messageOrdinal: number;
  sourceUuid?: string | undefined;
  sourceType?: string | undefined;
  sourceSubtype?: string | undefined;
}

export interface SourceEvent {
  schemaVersion: string;
  type: SourceEventType;
  sessionId?: string | undefined;
  agent?: string | undefined;
  messageCount?: number | undefined;
  messageOrdinal?: number | undefined;
  role?: string | undefined;
  sourcePath?: string | undefined;
  error?: string | undefined;
}

export interface SessionPage {
  sessions: Session[];
  nextCursor?: string | undefined;
  total: number;
}

export interface MessagePage {
  messages: Message[];
  count: number;
}

export interface SessionFilter {
  project?: string | undefined;
  excludeProject?: string | undefined;
  machine?: string | undefined;
  agent?: string | undefined;
  date?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  activeSince?: string | undefined;
  minMessages?: number | undefined;
  maxMessages?: number | undefined;
  minUserMessages?: number | undefined;
  includeOneShot?: boolean | undefined;
  includeAutomated?: boolean | undefined;
  includeChildren?: boolean | undefined;
  outcome?: string | undefined;
  healthGrade?: string | undefined;
  termination?: string | undefined;
  minToolFailures?: number | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface MessageOptions {
  from?: number | undefined;
  limit?: number | undefined;
  direction?: "asc" | "desc" | undefined;
}

export interface WatchEventsOptions {
  signal?: AbortSignal | undefined;
  reconnect?: boolean | undefined;
  retryDelayMs?: number | undefined;
  maxRetryDelayMs?: number | undefined;
  backoffMultiplier?: number | undefined;
  onOpen?: (() => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

export interface EventSubscription {
  close(): void;
  readonly closed: Promise<void>;
}

export interface CaSessionSourceClientOptions {
  baseUrl?: string | undefined;
  authToken?: string | undefined;
  fetch?: typeof fetch | undefined;
  headers?: HeadersInit | undefined;
  restBasePath?: string | undefined;
  sourceEventsPath?: string | undefined;
}

export interface SessionTranscriptSnapshot {
  startOrdinal: number;
  messages: Message[];
  fetchedPageSizes: number[];
  latestOrdinal: number;
  latestAnchor?: MessageAnchor | undefined;
}

export interface SessionTranscriptHistoryPage {
  kind: "history";
  beforeOrdinal: number;
  fetchedMessages: Message[];
  appendedMessages: Message[];
  earliestOrdinal: number;
  latestOrdinal: number;
  latestAnchor?: MessageAnchor | undefined;
  hasMore: boolean;
}

export interface SessionTranscriptMessageSync {
  kind: "messages";
  trigger: "session.updated" | "message.appended";
  from: number;
  fetchedMessages: Message[];
  appendedMessages: Message[];
  latestOrdinal: number;
  latestAnchor?: MessageAnchor | undefined;
}

export interface SessionTranscriptSourceError {
  kind: "source_error";
  event: SourceEvent;
}

export type SessionTranscriptEventResult =
  | SessionTranscriptMessageSync
  | SessionTranscriptSourceError
  | null;
