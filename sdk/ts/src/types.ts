export type SourceEventType =
  | "session.created"
  | "session.updated"
  | "message.appended"
  | "source.error";

export interface Session {
  id: string;
  agent: string;
  project: string;
  machine?: string;
  cwd?: string;
  gitBranch?: string;
  firstMessage?: string;
  displayName?: string;
  startedAt?: string;
  endedAt?: string;
  messageCount: number;
  userMessageCount?: number;
  sourcePath?: string;
  updatedAt?: string;
}

export interface ToolCall {
  toolName: string;
  category?: string;
  toolUseId?: string;
  inputJson?: string;
  skillName?: string;
  resultContent?: string;
  resultContentLength?: number;
  subagentSessionId?: string;
  ordinal?: number;
  timestamp?: string;
}

export interface Message {
  id: number;
  sessionId: string;
  ordinal: number;
  role: string;
  content: string;
  thinkingText?: string;
  timestamp?: string;
  hasThinking?: boolean;
  hasToolUse?: boolean;
  model?: string;
  tokenUsage?: unknown;
  sourceUuid?: string;
  sourceType?: string;
  sourceSubtype?: string;
  toolCalls?: ToolCall[];
}

export interface SourceEvent {
  schemaVersion: string;
  type: SourceEventType;
  sessionId?: string;
  agent?: string;
  messageCount?: number;
  messageOrdinal?: number;
  role?: string;
  sourcePath?: string;
  error?: string;
}

export interface SessionPage {
  sessions: Session[];
  nextCursor?: string;
  total: number;
}

export interface MessagePage {
  messages: Message[];
  count: number;
}

export interface SessionFilter {
  project?: string;
  excludeProject?: string;
  machine?: string;
  agent?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  activeSince?: string;
  minMessages?: number;
  maxMessages?: number;
  minUserMessages?: number;
  includeOneShot?: boolean;
  includeAutomated?: boolean;
  includeChildren?: boolean;
  outcome?: string;
  healthGrade?: string;
  termination?: string;
  minToolFailures?: number;
  cursor?: string;
  limit?: number;
}

export interface MessageOptions {
  from?: number;
  limit?: number;
  direction?: "asc" | "desc";
}

export interface WatchEventsOptions {
  signal?: AbortSignal;
  reconnect?: boolean;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  backoffMultiplier?: number;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
}

export interface EventSubscription {
  close(): void;
  readonly closed: Promise<void>;
}

export interface CaSessionSourceClientOptions {
  baseUrl?: string;
  authToken?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  restBasePath?: string;
  sourceEventsPath?: string;
}
