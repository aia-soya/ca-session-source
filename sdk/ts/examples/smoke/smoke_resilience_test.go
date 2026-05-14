package smoke

import (
	"errors"
	"os/exec"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/db"
)

func TestSmokeHarness_ReconnectBackfillsGapFromLatestOrdinal(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{
		httpWrapper: disconnectFirstSourceEventsRequestAfter(50 * time.Millisecond),
	})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "reconnect-session",
		InitialMessageCount: 4,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "reconnect-session",
		PageLimit:               2,
		EventTimeoutMs:          12000,
		ExpectFinalMessageCount: 6,
		Reconnect:               true,
		RetryDelayMs:            100,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "reconnect-session", 4, "assistant", 1)

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_REOPEN 2"
	}, 5*time.Second)

	appendSmokeMessages(t, env.db, "reconnect-session", 5, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 15*time.Second)

	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	assert.Equal(t, 2, result.EventFlow.OpenCount)
	require.Len(t, result.EventFlow.SeenEvents, 2)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[1].Type)

	require.Len(t, result.EventFlow.Fetches, 2)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, 4, result.EventFlow.Fetches[0].From)
	assert.Equal(t, []int{4, 5}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{4, 5}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[1].Trigger)
	assert.Equal(t, 5, result.EventFlow.Fetches[1].From)
	assert.Equal(t, []int{5}, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)

	assert.Equal(t, []int{0, 1, 2, 3, 4, 5}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_SourceErrorIsSurfacedAndGapCanRecover(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	failSignal := make(chan struct{}, 1)
	env := newSmokeEnv(t, smokeEnvOptions{
		storeWrapper: func(base db.Store) db.Store {
			return &failOnceGetMessagesStore{
				Store:       base,
				sessionID:   "source-error-session",
				fromAtLeast: 4,
				err:         errors.New("forced appended lookup failure"),
				failedCh:    failSignal,
			}
		},
	})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "source-error-session",
		InitialMessageCount: 4,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "source-error-session",
		PageLimit:               2,
		EventTimeoutMs:          12000,
		ExpectFinalMessageCount: 5,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "source-error-session", 4, "assistant", 1)
	env.broadcaster.Emit("messages")

	select {
	case <-failSignal:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for source adapter failure")
	}

	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 12*time.Second)

	assert.Equal(t, "ca-session.source.v1", result.Snapshot.Version.SchemaVersion)
	assert.True(t, result.Snapshot.Health.EventStreamAvailable)
	require.Len(t, result.EventFlow.SeenEvents, 4)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "source.error", result.EventFlow.SeenEvents[1].Type)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[2].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[3].Type)
	assert.Empty(t, result.EventFlow.Errors)

	require.Len(t, result.EventFlow.Fetches, 4)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "source_error", result.EventFlow.Fetches[1].Trigger)
	assert.Empty(t, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[2].Trigger)
	assert.Empty(t, result.EventFlow.Fetches[2].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[2].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[3].Trigger)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[3].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[3].AppendedOrdinals)

	assert.Equal(t, []int{0, 1, 2, 3, 4}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 5, result.EventFlow.FinalMessageCount)
}
