import type { Message, MessagePage, Session, SessionPage, ToolCall } from "./types.js";
export interface RawSession {
    id: string;
    project: string;
    machine: string;
    agent: string;
    cwd?: string;
    git_branch?: string;
    first_message?: string | null;
    display_name?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
    message_count: number;
    user_message_count?: number;
    file_path?: string | null;
    local_modified_at?: string | null;
    created_at?: string;
}
export interface RawMessage {
    id: number;
    session_id: string;
    ordinal: number;
    role: string;
    content: string;
    thinking_text?: string;
    timestamp?: string;
    has_thinking?: boolean;
    has_tool_use?: boolean;
    model?: string;
    token_usage?: unknown;
    source_uuid?: string;
    source_type?: string;
    source_subtype?: string;
    tool_calls?: RawEmbeddedToolCall[];
}
export interface RawEmbeddedToolCall {
    tool_name: string;
    category?: string;
    tool_use_id?: string;
    input_json?: string;
    skill_name?: string;
    result_content?: string;
    result_content_length?: number;
    subagent_session_id?: string;
}
export interface RawSessionToolCall {
    tool_name: string;
    category?: string;
    tool_use_id?: string;
    input_json?: string;
    skill_name?: string;
    subagent_session_id?: string;
    ordinal?: number;
    timestamp?: string;
    result_length?: number;
}
export interface RawSessionPage {
    sessions?: RawSession[] | null;
    next_cursor?: string;
    total: number;
}
export interface RawMessagePage {
    messages?: RawMessage[] | null;
    count: number;
}
export interface RawToolCallPage {
    tool_calls?: RawSessionToolCall[] | null;
}
export declare function mapSessionPage(raw: RawSessionPage): SessionPage;
export declare function mapMessagePage(raw: RawMessagePage): MessagePage;
export declare function mapToolCallPage(raw: RawToolCallPage): ToolCall[];
export declare function mapSession(raw: RawSession): Session;
export declare function mapMessage(raw: RawMessage): Message;
