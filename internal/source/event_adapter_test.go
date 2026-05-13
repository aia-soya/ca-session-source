package source

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/dbtest"
)

type getMessagesErrorStore struct {
	db.Store
	err error
}

type listSessionsErrorStore struct {
	db.Store
	err error
}

func (s *getMessagesErrorStore) GetMessages(
	ctx context.Context, sessionID string, from, limit int, asc bool,
) ([]db.Message, error) {
	return nil, s.err
}

func (s *listSessionsErrorStore) ListSessions(
	ctx context.Context, f db.SessionFilter,
) (db.SessionPage, error) {
	return db.SessionPage{}, s.err
}

func TestEmitSnapshotDiff_SessionCreatedAndMessagesAppended(t *testing.T) {
	t.Parallel()

	d := dbtest.OpenTestDB(t)
	svc := &AgentsViewStoreService{store: d}

	dbtest.SeedSession(t, d, "new-session", "proj", func(s *db.Session) {
		s.Agent = "codex"
		s.MessageCount = 2
		s.UserMessageCount = 1
	})
	dbtest.SeedMessages(t, d,
		dbtest.UserMsg("new-session", 0, "hello"),
		dbtest.AsstMsg("new-session", 1, "done"),
	)

	out := make(chan Event, 4)
	svc.advanceSnapshot(context.Background(), out, sessionSnapshot{}, sessionSnapshot{
		"new-session": {
			ID:           "new-session",
			Agent:        "codex",
			Project:      "proj",
			MessageCount: 2,
		},
	})
	close(out)

	got := drainEvents(out)
	require.Len(t, got, 3)

	assert.Equal(t, EventTypeSessionCreated, got[0].Type)
	assert.Equal(t, "new-session", got[0].SessionID)
	require.NotNil(t, got[0].MessageCount)
	assert.Equal(t, 2, *got[0].MessageCount)

	assert.Equal(t, EventTypeMessageAppended, got[1].Type)
	require.NotNil(t, got[1].MessageOrdinal)
	assert.Equal(t, 0, *got[1].MessageOrdinal)
	assert.Equal(t, "user", got[1].Role)

	assert.Equal(t, EventTypeMessageAppended, got[2].Type)
	require.NotNil(t, got[2].MessageOrdinal)
	assert.Equal(t, 1, *got[2].MessageOrdinal)
	assert.Equal(t, "assistant", got[2].Role)
}

func TestEmitSnapshotDiff_SessionUpdatedAndMessageAppended(t *testing.T) {
	t.Parallel()

	d := dbtest.OpenTestDB(t)
	svc := &AgentsViewStoreService{store: d}

	dbtest.SeedSession(t, d, "existing", "proj", func(s *db.Session) {
		s.Agent = "claude"
		s.MessageCount = 2
		s.UserMessageCount = 1
	})
	dbtest.SeedMessages(t, d,
		dbtest.UserMsg("existing", 0, "hi"),
		dbtest.AsstMsg("existing", 1, "first"),
	)

	dbtest.SeedMessages(t, d, dbtest.AsstMsg("existing", 2, "second"))

	out := make(chan Event, 4)
	svc.advanceSnapshot(context.Background(), out,
		sessionSnapshot{
			"existing": {
				ID:           "existing",
				Agent:        "claude",
				Project:      "proj",
				MessageCount: 2,
			},
		},
		sessionSnapshot{
			"existing": {
				ID:           "existing",
				Agent:        "claude",
				Project:      "proj",
				MessageCount: 3,
			},
		},
	)
	close(out)

	got := drainEvents(out)
	require.Len(t, got, 2)

	assert.Equal(t, EventTypeSessionUpdated, got[0].Type)
	require.NotNil(t, got[0].MessageCount)
	assert.Equal(t, 3, *got[0].MessageCount)

	assert.Equal(t, EventTypeMessageAppended, got[1].Type)
	require.NotNil(t, got[1].MessageOrdinal)
	assert.Equal(t, 2, *got[1].MessageOrdinal)
	assert.Equal(t, "assistant", got[1].Role)
}

func TestEmitAppendedMessages_EmitsSourceErrorWhenMessageLookupFails(t *testing.T) {
	t.Parallel()

	d := dbtest.OpenTestDB(t)
	svc := &AgentsViewStoreService{
		store: &getMessagesErrorStore{
			Store: d,
			err:   errors.New("boom"),
		},
	}

	out := make(chan Event, 1)
	svc.emitAppendedMessages(context.Background(), out, Session{
		ID:           "broken",
		Agent:        "codex",
		MessageCount: 1,
	}, 0)
	close(out)

	got := drainEvents(out)
	require.Len(t, got, 1)
	assert.Equal(t, EventTypeSourceError, got[0].Type)
	assert.Equal(t, "broken", got[0].SessionID)
	assert.Contains(t, got[0].Error, "boom")
}

func TestNewScopeEventWatchFunc_ReturnsErrorWhenInitialSnapshotFails(t *testing.T) {
	t.Parallel()

	d := dbtest.OpenTestDB(t)
	var cleanupCalls atomic.Int32
	watchEvents := NewScopeEventWatchFunc(
		&listSessionsErrorStore{
			Store: d,
			err:   errors.New("snapshot failed"),
		},
		func(ctx context.Context) (<-chan ScopeSignal, func(), error) {
			ch := make(chan ScopeSignal)
			close(ch)
			return ch, func() { cleanupCalls.Add(1) }, nil
		},
	)

	ch, err := watchEvents(context.Background())
	require.Error(t, err)
	assert.Nil(t, ch)
	assert.Contains(t, err.Error(), "snapshot failed")
	assert.Equal(t, int32(1), cleanupCalls.Load())
}

type flakyGetMessagesStore struct {
	db.Store
	err       error
	failCalls int
	calls     atomic.Int32
}

func (s *flakyGetMessagesStore) GetMessages(
	ctx context.Context, sessionID string, from, limit int, asc bool,
) ([]db.Message, error) {
	call := int(s.calls.Add(1))
	if call <= s.failCalls {
		return nil, s.err
	}
	return s.Store.GetMessages(ctx, sessionID, from, limit, asc)
}

func TestNewScopeEventWatchFunc_RetriesAppendedMessagesAfterBackfillFailure(t *testing.T) {
	t.Parallel()

	d := dbtest.OpenTestDB(t)
	store := &flakyGetMessagesStore{
		Store:     d,
		err:       errors.New("boom"),
		failCalls: 1,
	}

	dbtest.SeedSession(t, d, "retry-session", "proj", func(s *db.Session) {
		s.Agent = "codex"
		s.MessageCount = 1
		s.UserMessageCount = 1
	})
	dbtest.SeedMessages(t, d, dbtest.UserMsg("retry-session", 0, "hello"))

	scopeCh := make(chan ScopeSignal, 2)
	watchEvents := NewScopeEventWatchFunc(
		store,
		func(ctx context.Context) (<-chan ScopeSignal, func(), error) {
			return scopeCh, func() {}, nil
		},
	)

	events, err := watchEvents(context.Background())
	require.NoError(t, err)

	dbtest.SeedSession(t, d, "retry-session", "proj", func(s *db.Session) {
		s.Agent = "codex"
		s.MessageCount = 2
		s.UserMessageCount = 1
	})
	dbtest.SeedMessages(t, d, dbtest.AsstMsg("retry-session", 1, "done"))

	scopeCh <- ScopeSignal{Scope: "messages"}
	first := <-events
	second := <-events
	scopeCh <- ScopeSignal{Scope: "messages"}
	third := <-events
	fourth := <-events

	assert.Equal(t, EventTypeSessionUpdated, first.Type)
	assert.Equal(t, EventTypeSourceError, second.Type)
	assert.Equal(t, EventTypeSessionUpdated, third.Type)
	assert.Equal(t, EventTypeMessageAppended, fourth.Type)
	require.NotNil(t, fourth.MessageOrdinal)
	assert.Equal(t, 1, *fourth.MessageOrdinal)
	assert.Equal(t, "assistant", fourth.Role)
}

func drainEvents(ch <-chan Event) []Event {
	var out []Event
	for ev := range ch {
		out = append(out, ev)
	}
	return out
}
