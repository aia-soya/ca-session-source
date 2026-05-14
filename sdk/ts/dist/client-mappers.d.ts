import type { Message, MessagePage, Session, SessionPage, SourceHealth, SourceVersion, ToolCall } from "./types.js";
import type { SourceHealthEnvelope, SourceMessagePageEnvelope, SourceSessionPageEnvelope, SourceToolCallsEnvelope, SourceVersionEnvelope } from "./client-payloads.js";
export declare function mapSessionPage(raw: SourceSessionPageEnvelope): SessionPage;
export declare function mapMessagePage(raw: SourceMessagePageEnvelope): MessagePage;
export declare function mapSourceVersion(raw: SourceVersionEnvelope): SourceVersion;
export declare function mapSourceHealth(raw: SourceHealthEnvelope): SourceHealth;
export declare function mapToolCallPage(raw: SourceToolCallsEnvelope): ToolCall[];
export declare function mapSession(raw: Session): Session;
export declare function mapMessage(raw: Message): Message;
