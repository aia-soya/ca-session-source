package source

import "encoding/json"

const eventSchemaVersion = "ca-session.event.v1"

type EventType string

const (
	EventTypeSessionCreated  EventType = "session.created"
	EventTypeSessionUpdated  EventType = "session.updated"
	EventTypeMessageAppended EventType = "message.appended"
	EventTypeSourceError     EventType = "source.error"
)

type Session struct {
	ID               string  `json:"id"`
	Agent            string  `json:"agent"`
	Project          string  `json:"project"`
	Machine          string  `json:"machine,omitempty"`
	Cwd              string  `json:"cwd,omitempty"`
	GitBranch        string  `json:"git_branch,omitempty"`
	FirstMessage     *string `json:"first_message,omitempty"`
	DisplayName      *string `json:"display_name,omitempty"`
	StartedAt        *string `json:"started_at,omitempty"`
	EndedAt          *string `json:"ended_at,omitempty"`
	MessageCount     int     `json:"message_count"`
	UserMessageCount *int    `json:"user_message_count,omitempty"`
	SourcePath       *string `json:"source_path,omitempty"`
	UpdatedAt        *string `json:"updated_at,omitempty"`
}

type Message struct {
	ID            int64           `json:"id"`
	SessionID     string          `json:"session_id"`
	Ordinal       int             `json:"ordinal"`
	Role          string          `json:"role"`
	Content       string          `json:"content"`
	ThinkingText  string          `json:"thinking_text,omitempty"`
	Timestamp     string          `json:"timestamp,omitempty"`
	HasThinking   bool            `json:"has_thinking,omitempty"`
	HasToolUse    bool            `json:"has_tool_use,omitempty"`
	Model         string          `json:"model,omitempty"`
	TokenUsage    json.RawMessage `json:"token_usage,omitempty"`
	SourceUUID    string          `json:"source_uuid,omitempty"`
	SourceType    string          `json:"source_type,omitempty"`
	SourceSubtype string          `json:"source_subtype,omitempty"`
	ToolCalls     []ToolCall      `json:"tool_calls,omitempty"`
}

type ToolCall struct {
	ToolName            string `json:"tool_name"`
	Category            string `json:"category,omitempty"`
	ToolUseID           string `json:"tool_use_id,omitempty"`
	InputJSON           string `json:"input_json,omitempty"`
	SkillName           string `json:"skill_name,omitempty"`
	ResultContentLength int    `json:"result_content_length,omitempty"`
	ResultContent       string `json:"result_content,omitempty"`
	SubagentSessionID   string `json:"subagent_session_id,omitempty"`
	Ordinal             int    `json:"ordinal,omitempty"`
	Timestamp           string `json:"timestamp,omitempty"`
}

type Event struct {
	SchemaVersion  string    `json:"schemaVersion"`
	Type           EventType `json:"type"`
	SessionID      string    `json:"sessionId,omitempty"`
	Agent          string    `json:"agent,omitempty"`
	MessageCount   *int      `json:"messageCount,omitempty"`
	MessageOrdinal *int      `json:"messageOrdinal,omitempty"`
	Role           string    `json:"role,omitempty"`
	SourcePath     string    `json:"sourcePath,omitempty"`
	Error          string    `json:"error,omitempty"`
}

type SessionFilter struct {
	Project          string `json:"project,omitempty"`
	ExcludeProject   string `json:"exclude_project,omitempty"`
	Machine          string `json:"machine,omitempty"`
	Agent            string `json:"agent,omitempty"`
	Date             string `json:"date,omitempty"`
	DateFrom         string `json:"date_from,omitempty"`
	DateTo           string `json:"date_to,omitempty"`
	ActiveSince      string `json:"active_since,omitempty"`
	MinMessages      int    `json:"min_messages,omitempty"`
	MaxMessages      int    `json:"max_messages,omitempty"`
	MinUserMessages  int    `json:"min_user_messages,omitempty"`
	IncludeOneShot   bool   `json:"include_one_shot,omitempty"`
	IncludeAutomated bool   `json:"include_automated,omitempty"`
	IncludeChildren  bool   `json:"include_children,omitempty"`
	Outcome          string `json:"outcome,omitempty"`
	HealthGrade      string `json:"health_grade,omitempty"`
	Termination      string `json:"termination,omitempty"`
	MinToolFailures  *int   `json:"min_tool_failures,omitempty"`
	Cursor           string `json:"cursor,omitempty"`
	Limit            int    `json:"limit,omitempty"`
}

type MessageFilter struct {
	From      *int   `json:"from,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Direction string `json:"direction,omitempty"`
}

type SessionPage struct {
	Sessions   []Session `json:"sessions"`
	NextCursor string    `json:"next_cursor,omitempty"`
	Total      int       `json:"total"`
}

type MessagePage struct {
	Messages []Message `json:"messages"`
	Count    int       `json:"count"`
}
