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

func TestSmokeHarness_FixtureDrivenTailSnapshotAndHistoryPagination(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	tests := []fixturePaginationSmokeCase{
		{
			name:                  "Claude",
			agent:                 "claude",
			fixtureParts:          []string{"testdata", "claude", "paginated_session.jsonl"},
			sessionID:             "paginated-session",
			expectedToolCalls:     0,
			expectedToolCallNames: []string{},
			project:               "my_app",
			dstPath: filepath.Join(
				"fixture-proj",
				"paginated-session.jsonl",
			),
			homeDirName: ".claude",
		},
		{
			name:                  "Codex",
			agent:                 "codex",
			fixtureParts:          []string{"testdata", "codex", "paginated_session.jsonl"},
			sessionID:             "codex:paginated-codex-123",
			expectedToolCalls:     0,
			expectedToolCallNames: []string{},
			project:               "my_api",
			dstPath: filepath.Join(
				"2024", "01", "01",
				"rollout-20240101-paginated-codex-123.jsonl",
			),
			homeDirName: ".codex",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			runFixturePaginationSmoke(t, tc)
		})
	}
}

func TestSmokeHarness_FixtureDrivenToolCallPagination(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	tests := []fixturePaginationSmokeCase{
		{
			name:                  "Claude",
			agent:                 "claude",
			fixtureParts:          []string{"testdata", "claude", "paginated_tool_session.jsonl"},
			sessionID:             "paginated-tool-session",
			expectedToolCalls:     2,
			expectedToolCallNames: []string{"Read", "Edit"},
			project:               "my_app",
			dstPath: filepath.Join(
				"fixture-proj",
				"paginated-tool-session.jsonl",
			),
			homeDirName: ".claude",
		},
			{
				name:                  "Codex",
				agent:                 "codex",
				fixtureParts:          []string{"testdata", "codex", "paginated_tool_session.jsonl"},
				sessionID:             "codex:tool-paginated-codex-123",
			expectedToolCalls:     2,
			expectedToolCallNames: []string{"shell_command", "apply_patch"},
			project:               "my_api",
			dstPath: filepath.Join(
				"2024", "01", "01",
				"rollout-20240101-tool-paginated-codex-123.jsonl",
			),
			homeDirName: ".codex",
			},
		}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			runFixturePaginationSmoke(t, tc)
		})
	}
}

func TestSmokeHarness_FixtureDrivenRichToolCallPagination(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	tests := []fixturePaginationSmokeCase{
		{
			name:                  "Claude",
			agent:                 "claude",
			fixtureParts:          []string{"testdata", "claude", "paginated_rich_tool_session.jsonl"},
			sessionID:             "paginated-rich-tool-session",
			expectedToolCalls:     2,
			expectedToolCallNames: []string{"Agent", "Read"},
			expectedRichToolCalls: []expectedSmokeToolCall{
				{
					ToolName:            "Agent",
					ResultContent:       "schema inspected",
					ResultContentLength: len("schema inspected"),
					SubagentSessionID:   "agent-childschema1",
				},
				{
					ToolName:            "Read",
					ResultContent:       "README loaded",
					ResultContentLength: len("README loaded"),
					SubagentSessionID:   "",
				},
			},
			project: "my_app",
			dstPath: filepath.Join(
				"fixture-proj",
				"paginated-rich-tool-session.jsonl",
			),
			homeDirName: ".claude",
		},
		{
			name:                  "Codex",
			agent:                 "codex",
			fixtureParts:          []string{"testdata", "codex", "paginated_rich_tool_session.jsonl"},
			sessionID:             "codex:paginated-rich-tool-codex-123",
			expectedToolCalls:     2,
			expectedToolCallNames: []string{"spawn_agent", "wait"},
			expectedRichToolCalls: []expectedSmokeToolCall{
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
			project: "my_api",
			dstPath: filepath.Join(
				"2024", "01", "01",
				"rollout-20240101-paginated-rich-tool-codex-123.jsonl",
			),
			homeDirName: ".codex",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			runFixturePaginationSmoke(t, tc)
		})
	}
}

type fixturePaginationSmokeCase struct {
	name                  string
	agent                 string
	fixtureParts          []string
	sessionID             string
	expectedToolCalls     int
	expectedToolCallNames []string
	expectedRichToolCalls []expectedSmokeToolCall
	project               string
	dstPath               string
	homeDirName           string
}

func runFixturePaginationSmoke(t *testing.T, tc fixturePaginationSmokeCase) {
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

	assertFixtureSessionState(t, env.db, tc.sessionID, tc.agent, 10, fixturePath)
	assertFixtureSessionProject(t, env.db, tc.sessionID, tc.project)
	assertFixtureToolCallCount(t, env.db, tc.sessionID, tc.expectedToolCalls)

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               tc.sessionID,
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: 6,
		SnapshotTailCount:       3,
		HistoryPageLimit:        2,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, tc.sessionID, 10, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, tc.sessionID, result.SessionID)
	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Health.SchemaVersion)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	assert.Contains(t, result.Snapshot.ListedSessionIDs, tc.sessionID)
	assert.Equal(t, 10, result.Snapshot.SessionMessageCount)
	assert.Equal(t, 7, result.Snapshot.StartOrdinal)
	assert.Equal(t, []int{2, 1}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{7, 8, 9}, result.Snapshot.CachedOrdinals)
	assert.Equal(t, tc.expectedToolCalls, result.Snapshot.ToolCallCount)
	assert.Equal(t, tc.expectedToolCallNames, result.Snapshot.ToolCallNames)
	if tc.expectedRichToolCalls != nil {
		require.Len(t, result.Snapshot.ToolCalls, len(tc.expectedRichToolCalls))
		for i, want := range tc.expectedRichToolCalls {
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
	}

	require.Len(t, result.History.Fetches, 1)
	assert.Equal(t, 7, result.History.Fetches[0].BeforeOrdinal)
	assert.Equal(t, []int{5, 6}, result.History.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{5, 6}, result.History.Fetches[0].AppendedOrdinals)
	assert.Equal(t, 5, result.History.Fetches[0].EarliestOrdinal)
	assert.Contains(t, []int{9, 10}, result.History.Fetches[0].LatestOrdinal)
	assert.True(t, result.History.Fetches[0].HasMore)

	assert.Equal(t, 1, result.EventFlow.OpenCount)
	require.Len(t, result.EventFlow.SeenEvents, 2)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[1].Type)

	require.Len(t, result.EventFlow.Fetches, 2)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, 10, result.EventFlow.Fetches[0].From)
	assert.Equal(t, []int{10}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{10}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[1].Trigger)
	assert.Equal(t, 10, result.EventFlow.Fetches[1].From)
	assert.Equal(t, []int{10}, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)

	assert.Equal(t, []int{5, 6, 7, 8, 9, 10}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}
