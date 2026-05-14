package smoke

import (
	"os/exec"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSmokeHarness_ClosesSnapshotAndIncrementalLoop(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "smoke-session",
		InitialMessageCount: 4,
		ToolCallOrdinal:     3,
		WithToolCall:        true,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "smoke-session",
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: 5,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "smoke-session", 4, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, "smoke-session", result.SessionID)
	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Health.SchemaVersion)
	assert.Equal(t, "ok", result.Snapshot.Health.Status)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	assert.Contains(t, result.Snapshot.ListedSessionIDs, "smoke-session")
	assert.Equal(t, 4, result.Snapshot.SessionMessageCount)
	assert.Equal(t, []int{2, 2}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{0, 1, 2, 3}, result.Snapshot.CachedOrdinals)
	assert.Equal(t, 1, result.Snapshot.ToolCallCount)

	assert.Equal(t, 1, result.EventFlow.OpenCount)
	require.Len(t, result.EventFlow.SeenEvents, 2)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[1].Type)

	require.Len(t, result.EventFlow.Fetches, 2)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[1].Trigger)
	assert.Equal(t, 4, result.EventFlow.Fetches[1].From)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)

	assert.Equal(t, []int{0, 1, 2, 3, 4}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 5, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_SnapshotPathSurvivesEmptyToolCalls(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "no-tool-session",
		InitialMessageCount: 5,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "no-tool-session",
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: 6,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "no-tool-session", 5, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	assert.Equal(t, 0, result.Snapshot.ToolCallCount)
	assert.Equal(t, []int{2, 2, 1}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{0, 1, 2, 3, 4}, result.Snapshot.CachedOrdinals)
	assert.Equal(t, []int{0, 1, 2, 3, 4, 5}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_TailSnapshotLimitsLargeSessionBootstrap(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "tail-session",
		InitialMessageCount: 10,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "tail-session",
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

	appendSmokeMessages(t, env.db, "tail-session", 10, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	assert.Equal(t, 10, result.Snapshot.SessionMessageCount)
	assert.Equal(t, 7, result.Snapshot.StartOrdinal)
	assert.Equal(t, []int{2, 1}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{7, 8, 9}, result.Snapshot.CachedOrdinals)
	require.Len(t, result.History.Fetches, 1)
	assert.Equal(t, 7, result.History.Fetches[0].BeforeOrdinal)
	assert.Equal(t, []int{5, 6}, result.History.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{5, 6}, result.History.Fetches[0].AppendedOrdinals)
	assert.Equal(t, 5, result.History.Fetches[0].EarliestOrdinal)
	assert.Equal(t, 9, result.History.Fetches[0].LatestOrdinal)
	assert.True(t, result.History.Fetches[0].HasMore)
	assert.Equal(t, []int{5, 6, 7, 8, 9, 10}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}
