package source

import (
	"encoding/json"

	"github.com/wesm/agentsview/internal/db"
)

func mapSession(s db.Session) Session {
	return Session{
		ID:               s.ID,
		Agent:            s.Agent,
		Project:          s.Project,
		Machine:          s.Machine,
		Cwd:              s.Cwd,
		GitBranch:        s.GitBranch,
		FirstMessage:     cloneStringPtr(s.FirstMessage),
		DisplayName:      cloneStringPtr(s.DisplayName),
		StartedAt:        cloneStringPtr(s.StartedAt),
		EndedAt:          cloneStringPtr(s.EndedAt),
		MessageCount:     s.MessageCount,
		UserMessageCount: cloneIntPtr(s.UserMessageCount),
		SourcePath:       cloneStringPtr(s.FilePath),
		UpdatedAt:        sessionUpdatedAt(s),
	}
}

func mapMessage(m db.Message) Message {
	msg := Message{
		ID:            m.ID,
		SessionID:     m.SessionID,
		Ordinal:       m.Ordinal,
		Role:          m.Role,
		Content:       m.Content,
		ThinkingText:  m.ThinkingText,
		Timestamp:     m.Timestamp,
		HasThinking:   m.HasThinking,
		HasToolUse:    m.HasToolUse,
		Model:         m.Model,
		TokenUsage:    cloneRawMessage(m.TokenUsage),
		SourceUUID:    m.SourceUUID,
		SourceType:    m.SourceType,
		SourceSubtype: m.SourceSubtype,
	}

	if len(m.ToolCalls) > 0 {
		msg.ToolCalls = make([]ToolCall, 0, len(m.ToolCalls))
		for _, call := range m.ToolCalls {
			msg.ToolCalls = append(msg.ToolCalls, mapToolCall(call))
		}
	}

	return msg
}

func mapToolCall(call db.ToolCall) ToolCall {
	return ToolCall{
		ToolName:            call.ToolName,
		Category:            call.Category,
		ToolUseID:           call.ToolUseID,
		InputJSON:           call.InputJSON,
		SkillName:           call.SkillName,
		ResultContentLength: call.ResultContentLength,
		ResultContent:       call.ResultContent,
		SubagentSessionID:   call.SubagentSessionID,
	}
}

func sessionUpdatedAt(s db.Session) *string {
	switch {
	case s.LocalModifiedAt != nil && *s.LocalModifiedAt != "":
		return cloneStringPtr(s.LocalModifiedAt)
	case s.EndedAt != nil && *s.EndedAt != "":
		return cloneStringPtr(s.EndedAt)
	case s.StartedAt != nil && *s.StartedAt != "":
		return cloneStringPtr(s.StartedAt)
	case s.CreatedAt != "":
		return cloneString(s.CreatedAt)
	default:
		return nil
	}
}

func cloneString(value string) *string {
	if value == "" {
		return nil
	}
	v := value
	return &v
}

func cloneStringPtr(value *string) *string {
	if value == nil || *value == "" {
		return nil
	}
	return cloneString(*value)
}

func cloneIntPtr(value int) *int {
	v := value
	return &v
}

func cloneRawMessage(value json.RawMessage) json.RawMessage {
	if len(value) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), value...)
}
