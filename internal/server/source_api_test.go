package server_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/dbtest"
	"github.com/wesm/agentsview/internal/server"
	"github.com/wesm/agentsview/internal/sourceapi"
)

func TestSourceListSessions_UsesStableSchemaAndCamelCase(t *testing.T) {
	t.Parallel()

	te := setup(t)
	sourcePath := "/tmp/source-session.jsonl"
	displayName := "Source Session"
	firstMessage := "stabilize source api"

	te.seedSession(t, "sess-source", "proj-source", 2, func(s *db.Session) {
		s.Agent = "codex"
		s.Machine = "devbox"
		s.Cwd = "/repo/source"
		s.GitBranch = "feature/m6"
		s.DisplayName = dbtest.Ptr(displayName)
		s.FirstMessage = dbtest.Ptr(firstMessage)
		s.FilePath = dbtest.Ptr(sourcePath)
	})
	require.NoError(t, te.db.UpdateSessionSignals("sess-source", db.SessionSignalUpdate{}))

	w := te.get(t, "/api/source/v1/sessions?include_one_shot=true&limit=10")
	assertStatus(t, w, http.StatusOK)

	resp := decode[sourceapi.SessionPageResponse](t, w)
	require.Len(t, resp.Sessions, 1)
	assert.Equal(t, sourceapi.SchemaVersion, resp.SchemaVersion)
	assert.Equal(t, "sess-source", resp.Sessions[0].ID)
	assert.Equal(t, "feature/m6", resp.Sessions[0].GitBranch)
	assert.Equal(t, sourcePath, *resp.Sessions[0].SourcePath)
	assert.NotNil(t, resp.Sessions[0].UpdatedAt)

	raw := decode[map[string]any](t, w)
	assert.Equal(t, sourceapi.SchemaVersion, raw["schemaVersion"])
	_, hasSnakeCursor := raw["next_cursor"]
	assert.False(t, hasSnakeCursor)
	sessions, ok := raw["sessions"].([]any)
	require.True(t, ok)
	first, ok := sessions[0].(map[string]any)
	require.True(t, ok)
	_, hasSnakeGitBranch := first["git_branch"]
	assert.False(t, hasSnakeGitBranch)
	assert.Equal(t, "feature/m6", first["gitBranch"])
}

func TestSourceGetSession_NotFoundUsesSourceErrorEnvelope(t *testing.T) {
	t.Parallel()

	te := setup(t)

	w := te.get(t, "/api/source/v1/sessions/missing")
	assertStatus(t, w, http.StatusNotFound)

	resp := decode[sourceapi.ErrorResponse](t, w)
	assert.Equal(t, sourceapi.SchemaVersion, resp.SchemaVersion)
	assert.Equal(t, "session not found", resp.Error)
}

func TestSourceGetMessages_UsesStableSchemaAndCamelCase(t *testing.T) {
	t.Parallel()

	te := setup(t)
	te.seedSession(t, "sess-msg", "proj", 1)
	dbtest.SeedMessages(t, te.db, db.Message{
		SessionID:     "sess-msg",
		Ordinal:       3,
		Role:          "assistant",
		Content:       "done",
		ContentLength: 4,
		ThinkingText:  "reasoning",
		Timestamp:     "2026-05-14T08:00:00Z",
		HasThinking:   true,
		HasToolUse:    true,
		Model:         "gpt-5.5",
		TokenUsage:    []byte(`{"input":10,"output":20}`),
		SourceUUID:    "uuid-1",
		SourceType:    "message",
		SourceSubtype: "assistant_output",
		ToolCalls: []db.ToolCall{{
			ToolName:            "read_file",
			Category:            "io",
			ToolUseID:           "tool-1",
			InputJSON:           `{"path":"main.go"}`,
			SkillName:           "files",
			ResultContent:       "ok",
			ResultContentLength: 2,
			SubagentSessionID:   "sub-1",
		}},
	})

	w := te.get(t, "/api/source/v1/sessions/sess-msg/messages?from=3&direction=asc")
	assertStatus(t, w, http.StatusOK)

	resp := decode[sourceapi.MessagePageResponse](t, w)
	require.Len(t, resp.Messages, 1)
	assert.Equal(t, sourceapi.SchemaVersion, resp.SchemaVersion)
	assert.Equal(t, "sess-msg", resp.Messages[0].SessionID)
	assert.Equal(t, "uuid-1", resp.Messages[0].SourceUUID)
	require.Len(t, resp.Messages[0].ToolCalls, 1)
	assert.Equal(t, "tool-1", resp.Messages[0].ToolCalls[0].ToolUseID)
	assert.Equal(t, 2, resp.Messages[0].ToolCalls[0].ResultContentLength)

	raw := decode[map[string]any](t, w)
	assert.Equal(t, sourceapi.SchemaVersion, raw["schemaVersion"])
	messages, ok := raw["messages"].([]any)
	require.True(t, ok)
	first, ok := messages[0].(map[string]any)
	require.True(t, ok)
	_, hasSnakeSessionID := first["session_id"]
	assert.False(t, hasSnakeSessionID)
	assert.Equal(t, "sess-msg", first["sessionId"])
	toolCalls, ok := first["toolCalls"].([]any)
	require.True(t, ok)
	call, ok := toolCalls[0].(map[string]any)
	require.True(t, ok)
	_, hasSnakeToolName := call["tool_name"]
	assert.False(t, hasSnakeToolName)
	assert.Equal(t, "read_file", call["toolName"])
}

func TestSourceToolCalls_UsesStableSchemaAndMessageContext(t *testing.T) {
	t.Parallel()

	te := setup(t)
	te.seedSession(t, "sess-tools", "proj", 2)
	dbtest.SeedMessages(t, te.db,
		db.Message{
			SessionID:     "sess-tools",
			Ordinal:       7,
			Role:          "assistant",
			Content:       "first",
			ContentLength: 5,
			Timestamp:     "2026-05-14T08:10:00Z",
			ToolCalls: []db.ToolCall{{
				ToolName:            "read_file",
				ToolUseID:           "tool-a",
				ResultContent:       "abc",
				ResultContentLength: 3,
			}},
		},
		db.Message{
			SessionID:     "sess-tools",
			Ordinal:       8,
			Role:          "assistant",
			Content:       "second",
			ContentLength: 6,
			Timestamp:     "2026-05-14T08:11:00Z",
			ToolCalls: []db.ToolCall{{
				ToolName:          "task",
				Category:          "agent",
				ToolUseID:         "tool-b",
				SubagentSessionID: "sub-2",
			}},
		},
	)

	w := te.get(t, "/api/source/v1/sessions/sess-tools/tool-calls")
	assertStatus(t, w, http.StatusOK)

	resp := decode[sourceapi.ToolCallsResponse](t, w)
	require.Len(t, resp.ToolCalls, 2)
	assert.Equal(t, sourceapi.SchemaVersion, resp.SchemaVersion)
	assert.Equal(t, 7, resp.ToolCalls[0].Ordinal)
	assert.Equal(t, "2026-05-14T08:10:00Z", resp.ToolCalls[0].Timestamp)
	assert.Equal(t, 3, resp.ToolCalls[0].ResultContentLength)
	assert.Equal(t, "sub-2", resp.ToolCalls[1].SubagentSessionID)

	raw := decode[map[string]any](t, w)
	assert.Equal(t, sourceapi.SchemaVersion, raw["schemaVersion"])
	_, hasSnakeToolCalls := raw["tool_calls"]
	assert.False(t, hasSnakeToolCalls)
	assert.NotNil(t, raw["toolCalls"])
}

func TestSourceVersionAndHealth_UseStableSchema(t *testing.T) {
	t.Parallel()

	version := server.VersionInfo{
		Version:   "v1.2.3",
		Commit:    "abc1234",
		BuildDate: "2026-05-14T00:00:00Z",
		ReadOnly:  true,
	}
	te := setupWithServerOpts(t, []server.Option{
		server.WithVersion(version),
	})

	versionResp := te.get(t, "/api/source/v1/version")
	assertStatus(t, versionResp, http.StatusOK)
	gotVersion := decode[sourceapi.VersionResponse](t, versionResp)
	assert.Equal(t, sourceapi.SchemaVersion, gotVersion.SchemaVersion)
	assert.Equal(t, "v1.2.3", gotVersion.Version)
	assert.Equal(t, "abc1234", gotVersion.Commit)
	assert.Equal(t, "2026-05-14T00:00:00Z", gotVersion.BuildDate)
	assert.True(t, gotVersion.ReadOnly)

	rawVersion := decode[map[string]any](t, versionResp)
	_, hasSnakeBuildDate := rawVersion["build_date"]
	assert.False(t, hasSnakeBuildDate)
	assert.Equal(t, "2026-05-14T00:00:00Z", rawVersion["buildDate"])

	healthResp := te.get(t, "/api/source/v1/health")
	assertStatus(t, healthResp, http.StatusOK)
	gotHealth := decode[sourceapi.HealthResponse](t, healthResp)
	assert.Equal(t, sourceapi.SchemaVersion, gotHealth.SchemaVersion)
	assert.Equal(t, "ok", gotHealth.Status)
	assert.True(t, gotHealth.ReadOnly)
	assert.True(t, gotHealth.EventStreamAvailable)

	pg := setupPGMode(t)
	pgHealthResp := pg.get(t, "/api/source/v1/health")
	assertStatus(t, pgHealthResp, http.StatusOK)
	pgHealth := decode[sourceapi.HealthResponse](t, pgHealthResp)
	assert.False(t, pgHealth.EventStreamAvailable)
}
