package smoke

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	syncpkg "github.com/wesm/agentsview/internal/sync"
)

func TestSmokeHarness_FixtureDrivenRichToolSemantics(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	tests := []fixtureRichToolSmokeCase{
		{
			name:         "Claude",
			agent:        "claude",
			fixtureParts: []string{"testdata", "claude", "rich_tool_session.jsonl"},
			sessionID:    "rich-tool-session",
			project:      "my_app",
			messageCount: 2,
			dstPath: filepath.Join(
				"fixture-proj",
				"rich-tool-session.jsonl",
			),
			homeDirName: ".claude",
			expectedToolCalls: []expectedSmokeToolCall{{
				ToolName:            "Agent",
				ResultContent:       "schema inspected",
				ResultContentLength: len("schema inspected"),
				SubagentSessionID:   "agent-childschema1",
			}},
		},
		{
			name:         "Codex",
			agent:        "codex",
			fixtureParts: []string{"testdata", "codex", "rich_tool_session.jsonl"},
			sessionID:    "codex:rich-tool-codex-123",
			project:      "my_api",
			messageCount: 4,
			dstPath: filepath.Join(
				"2024", "01", "01",
				"rollout-20240101-rich-tool-codex-123.jsonl",
			),
			homeDirName: ".codex",
			expectedToolCalls: []expectedSmokeToolCall{
				{
					ToolName:            "spawn_agent",
					ResultContent:       "",
					ResultContentLength: 0,
					SubagentSessionID:   "codex:019c9c96-6ee7-77c0-ba4c-380f844289d5",
				},
				{
					ToolName:            "wait",
					ResultContent:       "Finished successfully",
					ResultContentLength: len("Finished successfully"),
					SubagentSessionID:   "",
				},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			runFixtureRichToolSmoke(t, tc)
		})
	}
}

type fixtureRichToolSmokeCase struct {
	name              string
	agent             string
	fixtureParts      []string
	sessionID         string
	project           string
	messageCount      int
	dstPath           string
	homeDirName       string
	expectedToolCalls []expectedSmokeToolCall
}

type expectedSmokeToolCall struct {
	ToolName            string
	ResultContent       string
	ResultContentLength int
	SubagentSessionID   string
}

func runFixtureRichToolSmoke(t *testing.T, tc fixtureRichToolSmokeCase) {
	t.Helper()

	env := newSmokeEnv(t, smokeEnvOptions{})

	agentDir := env.claudeDir
	if tc.agent == "codex" {
		agentDir = env.codexDir
	}
	assertAgentDirIsIsolatedFromHome(t, agentDir, tc.homeDirName)

	fixture := repoFixturePath(t, tc.fixtureParts...)
	fixturePath := copyFixtureToDir(
		t,
		fixture,
		filepath.Join(agentDir, tc.dstPath),
	)

	stats := env.engine.SyncAll(context.Background(), nil)
	wantStats := syncpkg.SyncStats{TotalSessions: 1, Synced: 1, Skipped: 0}
	assert.Equal(t, wantStats.TotalSessions, stats.TotalSessions)
	assert.Equal(t, wantStats.Synced, stats.Synced)
	assert.Equal(t, wantStats.Skipped, stats.Skipped)
	assert.Zero(t, stats.Failed)
	assert.False(t, stats.Aborted)

	assertFixtureSessionState(t, env.db, tc.sessionID, tc.agent, tc.messageCount, fixturePath)
	assertFixtureSessionProject(t, env.db, tc.sessionID, tc.project)
	assertFixtureToolCallCount(t, env.db, tc.sessionID, len(tc.expectedToolCalls))

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               tc.sessionID,
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: tc.messageCount + 1,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, tc.sessionID, tc.messageCount, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, tc.sessionID, result.SessionID)
	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Health.SchemaVersion)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	assert.Contains(t, result.Snapshot.ListedSessionIDs, tc.sessionID)
	assert.Equal(t, tc.messageCount, result.Snapshot.SessionMessageCount)
	assert.Equal(t, len(tc.expectedToolCalls), result.Snapshot.ToolCallCount)
	require.Len(t, result.Snapshot.ToolCalls, len(tc.expectedToolCalls))

	for i, want := range tc.expectedToolCalls {
		got := result.Snapshot.ToolCalls[i]
		assert.Equal(t, want.ToolName, got.ToolName)
		assert.Equal(t, want.ResultContentLength, got.ResultContentLength)
		if want.ResultContent == "" {
			assert.Nil(t, got.ResultContent)
		} else {
			require.NotNil(t, got.ResultContent)
			assert.Equal(t, want.ResultContent, *got.ResultContent)
		}
		if want.SubagentSessionID == "" {
			assert.Nil(t, got.SubagentSessionID)
		} else {
			require.NotNil(t, got.SubagentSessionID)
			assert.Equal(t, want.SubagentSessionID, *got.SubagentSessionID)
		}
	}

	assert.Equal(t, 1, result.EventFlow.OpenCount)
	require.Len(t, result.EventFlow.SeenEvents, 2)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[1].Type)
	assert.Equal(t, tc.messageCount+1, result.EventFlow.FinalMessageCount)
}
