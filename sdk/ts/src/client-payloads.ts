import type {
  Message,
  Session,
  SessionPage,
  SourceHealth,
  SourceVersion,
  ToolCall,
} from "./types.ts";

export interface SourceSessionPageEnvelope {
  schemaVersion?: string;
  sessions?: Session[] | null;
  nextCursor?: SessionPage["nextCursor"];
  total: number;
}

export interface SourceMessagePageEnvelope {
  schemaVersion?: string;
  messages?: Message[] | null;
  count: number;
}

export interface SourceToolCallsEnvelope {
  schemaVersion?: string;
  toolCalls?: ToolCall[] | null;
}

export type SourceVersionEnvelope = SourceVersion;

export type SourceHealthEnvelope = SourceHealth;
