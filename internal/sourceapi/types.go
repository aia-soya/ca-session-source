package sourceapi

import (
	"encoding/json"

	"github.com/wesm/agentsview/internal/source"
)

const SchemaVersion = "ca-session.source.v1"

type Session struct {
	ID               string  `json:"id"`
	Agent            string  `json:"agent"`
	Project          string  `json:"project"`
	Machine          string  `json:"machine,omitempty"`
	Cwd              string  `json:"cwd,omitempty"`
	GitBranch        string  `json:"gitBranch,omitempty"`
	FirstMessage     *string `json:"firstMessage,omitempty"`
	DisplayName      *string `json:"displayName,omitempty"`
	StartedAt        *string `json:"startedAt,omitempty"`
	EndedAt          *string `json:"endedAt,omitempty"`
	MessageCount     int     `json:"messageCount"`
	UserMessageCount *int    `json:"userMessageCount,omitempty"`
	SourcePath       *string `json:"sourcePath,omitempty"`
	UpdatedAt        *string `json:"updatedAt,omitempty"`
}

type Message struct {
	ID            int64           `json:"id"`
	SessionID     string          `json:"sessionId"`
	Ordinal       int             `json:"ordinal"`
	Role          string          `json:"role"`
	Content       string          `json:"content"`
	ThinkingText  string          `json:"thinkingText,omitempty"`
	Timestamp     string          `json:"timestamp,omitempty"`
	HasThinking   bool            `json:"hasThinking,omitempty"`
	HasToolUse    bool            `json:"hasToolUse,omitempty"`
	Model         string          `json:"model,omitempty"`
	TokenUsage    json.RawMessage `json:"tokenUsage,omitempty"`
	SourceUUID    string          `json:"sourceUuid,omitempty"`
	SourceType    string          `json:"sourceType,omitempty"`
	SourceSubtype string          `json:"sourceSubtype,omitempty"`
	ToolCalls     []ToolCall      `json:"toolCalls,omitempty"`
}

type ToolCall struct {
	ToolName            string `json:"toolName"`
	Category            string `json:"category,omitempty"`
	ToolUseID           string `json:"toolUseId,omitempty"`
	InputJSON           string `json:"inputJson,omitempty"`
	SkillName           string `json:"skillName,omitempty"`
	ResultContentLength int    `json:"resultContentLength,omitempty"`
	ResultContent       string `json:"resultContent,omitempty"`
	SubagentSessionID   string `json:"subagentSessionId,omitempty"`
	Ordinal             int    `json:"ordinal,omitempty"`
	Timestamp           string `json:"timestamp,omitempty"`
}

type SessionPageResponse struct {
	SchemaVersion string    `json:"schemaVersion"`
	Sessions      []Session `json:"sessions"`
	NextCursor    string    `json:"nextCursor,omitempty"`
	Total         int       `json:"total"`
}

type SessionResponse struct {
	SchemaVersion string `json:"schemaVersion"`
	Session
}

type MessagePageResponse struct {
	SchemaVersion string    `json:"schemaVersion"`
	Messages      []Message `json:"messages"`
	Count         int       `json:"count"`
}

type ToolCallsResponse struct {
	SchemaVersion string     `json:"schemaVersion"`
	ToolCalls     []ToolCall `json:"toolCalls"`
}

type ErrorResponse struct {
	SchemaVersion string `json:"schemaVersion"`
	Error         string `json:"error"`
}

type VersionResponse struct {
	SchemaVersion string `json:"schemaVersion"`
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	BuildDate     string `json:"buildDate"`
	ReadOnly      bool   `json:"readOnly,omitempty"`
}

type HealthResponse struct {
	SchemaVersion        string `json:"schemaVersion"`
	Status               string `json:"status"`
	ReadOnly             bool   `json:"readOnly,omitempty"`
	EventStreamAvailable bool   `json:"eventStreamAvailable"`
}

func NewSessionPageResponse(page source.SessionPage) SessionPageResponse {
	sessions := make([]Session, 0, len(page.Sessions))
	for _, sess := range page.Sessions {
		sessions = append(sessions, MapSession(sess))
	}

	return SessionPageResponse{
		SchemaVersion: SchemaVersion,
		Sessions:      sessions,
		NextCursor:    page.NextCursor,
		Total:         page.Total,
	}
}

func NewSessionResponse(session source.Session) SessionResponse {
	return SessionResponse{
		SchemaVersion: SchemaVersion,
		Session:       MapSession(session),
	}
}

func NewMessagePageResponse(page source.MessagePage) MessagePageResponse {
	messages := make([]Message, 0, len(page.Messages))
	for _, msg := range page.Messages {
		messages = append(messages, MapMessage(msg))
	}

	return MessagePageResponse{
		SchemaVersion: SchemaVersion,
		Messages:      messages,
		Count:         page.Count,
	}
}

func NewToolCallsResponse(calls []source.ToolCall) ToolCallsResponse {
	toolCalls := make([]ToolCall, 0, len(calls))
	for _, call := range calls {
		toolCalls = append(toolCalls, MapToolCall(call))
	}

	return ToolCallsResponse{
		SchemaVersion: SchemaVersion,
		ToolCalls:     toolCalls,
	}
}

func NewErrorResponse(msg string) ErrorResponse {
	return ErrorResponse{
		SchemaVersion: SchemaVersion,
		Error:         msg,
	}
}

func MapSession(sess source.Session) Session {
	return Session{
		ID:               sess.ID,
		Agent:            sess.Agent,
		Project:          sess.Project,
		Machine:          sess.Machine,
		Cwd:              sess.Cwd,
		GitBranch:        sess.GitBranch,
		FirstMessage:     sess.FirstMessage,
		DisplayName:      sess.DisplayName,
		StartedAt:        sess.StartedAt,
		EndedAt:          sess.EndedAt,
		MessageCount:     sess.MessageCount,
		UserMessageCount: sess.UserMessageCount,
		SourcePath:       sess.SourcePath,
		UpdatedAt:        sess.UpdatedAt,
	}
}

func MapMessage(msg source.Message) Message {
	toolCalls := make([]ToolCall, 0, len(msg.ToolCalls))
	for _, call := range msg.ToolCalls {
		toolCalls = append(toolCalls, MapToolCall(call))
	}

	return Message{
		ID:            msg.ID,
		SessionID:     msg.SessionID,
		Ordinal:       msg.Ordinal,
		Role:          msg.Role,
		Content:       msg.Content,
		ThinkingText:  msg.ThinkingText,
		Timestamp:     msg.Timestamp,
		HasThinking:   msg.HasThinking,
		HasToolUse:    msg.HasToolUse,
		Model:         msg.Model,
		TokenUsage:    msg.TokenUsage,
		SourceUUID:    msg.SourceUUID,
		SourceType:    msg.SourceType,
		SourceSubtype: msg.SourceSubtype,
		ToolCalls:     toolCalls,
	}
}

func MapToolCall(call source.ToolCall) ToolCall {
	return ToolCall{
		ToolName:            call.ToolName,
		Category:            call.Category,
		ToolUseID:           call.ToolUseID,
		InputJSON:           call.InputJSON,
		SkillName:           call.SkillName,
		ResultContentLength: call.ResultContentLength,
		ResultContent:       call.ResultContent,
		SubagentSessionID:   call.SubagentSessionID,
		Ordinal:             call.Ordinal,
		Timestamp:           call.Timestamp,
	}
}
