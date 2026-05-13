package source_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/dbtest"
	"github.com/wesm/agentsview/internal/source"
)

type batchStoreSpy struct {
	db.Store
	batchCalls  int
	singleCalls int
}

type skipHydrationSpy struct {
	*batchStoreSpy
}

func (s *batchStoreSpy) GetSessionFull(
	ctx context.Context, id string,
) (*db.Session, error) {
	s.singleCalls++
	return s.Store.GetSessionFull(ctx, id)
}

func (s *batchStoreSpy) GetSessionsFull(
	ctx context.Context, ids []string,
) (map[string]db.Session, error) {
	s.batchCalls++
	out := make(map[string]db.Session, len(ids))
	for _, id := range ids {
		sess, err := s.Store.GetSessionFull(ctx, id)
		if err != nil {
			return nil, err
		}
		if sess != nil {
			out[id] = *sess
		}
	}
	return out, nil
}

func (s *skipHydrationSpy) SkipFullSessionHydration() bool { return true }

func newSourceService(t *testing.T) (source.Service, *db.DB) {
	t.Helper()
	d := dbtest.OpenTestDB(t)
	return source.NewAgentsViewStoreService(d, nil), d
}

func TestAgentsViewStoreService_ListSessions_MapsAndPaginates(t *testing.T) {
	t.Parallel()
	svc, d := newSourceService(t)

	pathA := "/tmp/session-a.jsonl"
	pathB := "/tmp/session-b.jsonl"
	first := "first prompt"
	display := "Latest Session"
	startA := "2026-05-13T09:00:00Z"
	endA := "2026-05-13T09:10:00Z"
	startB := "2026-05-13T10:00:00Z"
	endB := "2026-05-13T10:20:00Z"

	dbtest.SeedSession(t, d, "s-a", "proj-a", func(s *db.Session) {
		s.Agent = "codex"
		s.Machine = "devbox-a"
		s.Cwd = "/repo/a"
		s.GitBranch = "main"
		s.FirstMessage = &first
		s.StartedAt = &startA
		s.EndedAt = &endA
		s.MessageCount = 2
		s.UserMessageCount = 1
		s.FilePath = &pathA
	})
	dbtest.SeedSession(t, d, "s-b", "proj-b", func(s *db.Session) {
		s.Agent = "claude"
		s.Machine = "devbox-b"
		s.Cwd = "/repo/b"
		s.GitBranch = "feature/m1"
		s.DisplayName = &display
		s.StartedAt = &startB
		s.EndedAt = &endB
		s.MessageCount = 3
		s.UserMessageCount = 2
		s.FilePath = &pathB
	})
	require.NoError(t, d.UpdateSessionSignals("s-b", db.SessionSignalUpdate{}))
	fullB, err := d.GetSessionFull(context.Background(), "s-b")
	require.NoError(t, err)
	require.NotNil(t, fullB)
	require.NotNil(t, fullB.LocalModifiedAt)

	page1, err := svc.ListSessions(context.Background(), source.SessionFilter{
		IncludeOneShot: true,
		Limit:          1,
	})
	require.NoError(t, err)
	require.Len(t, page1.Sessions, 1)
	assert.Equal(t, 2, page1.Total)
	assert.NotEmpty(t, page1.NextCursor)

	got := page1.Sessions[0]
	assert.Equal(t, "s-b", got.ID)
	assert.Equal(t, "claude", got.Agent)
	assert.Equal(t, "proj-b", got.Project)
	assert.Equal(t, "devbox-b", got.Machine)
	assert.Equal(t, "/repo/b", got.Cwd)
	assert.Equal(t, "feature/m1", got.GitBranch)
	assert.Equal(t, &display, got.DisplayName)
	assert.Equal(t, fullB.LocalModifiedAt, got.UpdatedAt)
	assert.Equal(t, &pathB, got.SourcePath)
	require.NotNil(t, got.UserMessageCount)
	assert.Equal(t, 2, *got.UserMessageCount)

	page2, err := svc.ListSessions(context.Background(), source.SessionFilter{
		IncludeOneShot: true,
		Limit:          1,
		Cursor:         page1.NextCursor,
	})
	require.NoError(t, err)
	require.Len(t, page2.Sessions, 1)
	assert.Equal(t, "s-a", page2.Sessions[0].ID)
}

func TestAgentsViewStoreService_ListSessions_UsesBatchHydration(t *testing.T) {
	t.Parallel()
	d := dbtest.OpenTestDB(t)
	spy := &batchStoreSpy{Store: d}
	svc := source.NewAgentsViewStoreService(spy, nil)

	path := "/tmp/batch-session.jsonl"
	dbtest.SeedSession(t, d, "batch-session", "proj", func(s *db.Session) {
		s.MessageCount = 2
		s.UserMessageCount = 2
		s.FilePath = &path
	})

	page, err := svc.ListSessions(context.Background(), source.SessionFilter{
		IncludeOneShot: true,
		Limit:          10,
	})
	require.NoError(t, err)
	require.Len(t, page.Sessions, 1)
	assert.Equal(t, 1, spy.batchCalls)
	assert.Equal(t, 0, spy.singleCalls)
	assert.Equal(t, &path, page.Sessions[0].SourcePath)
}

func TestAgentsViewStoreService_ListSessions_SkipsHydrationWhenStoreOptedOut(t *testing.T) {
	t.Parallel()
	d := dbtest.OpenTestDB(t)
	spy := &skipHydrationSpy{batchStoreSpy: &batchStoreSpy{Store: d}}
	svc := source.NewAgentsViewStoreService(spy, nil)

	dbtest.SeedSession(t, d, "skip-session", "proj", func(s *db.Session) {
		s.MessageCount = 2
		s.UserMessageCount = 2
	})

	page, err := svc.ListSessions(context.Background(), source.SessionFilter{
		IncludeOneShot: true,
		Limit:          10,
	})
	require.NoError(t, err)
	require.Len(t, page.Sessions, 1)
	assert.Equal(t, 0, spy.batchCalls)
	assert.Equal(t, 0, spy.singleCalls)
}

func TestAgentsViewStoreService_GetSession_NotFound(t *testing.T) {
	t.Parallel()
	svc, _ := newSourceService(t)

	session, err := svc.GetSession(context.Background(), "missing")
	require.NoError(t, err)
	assert.Nil(t, session)
}

func TestAgentsViewStoreService_GetSession_ExcludesTrashed(t *testing.T) {
	t.Parallel()
	svc, d := newSourceService(t)

	dbtest.SeedSession(t, d, "trashed-session", "proj")
	require.NoError(t, d.SoftDeleteSession("trashed-session"))

	session, err := svc.GetSession(context.Background(), "trashed-session")
	require.NoError(t, err)
	assert.Nil(t, session)
}

func TestAgentsViewStoreService_GetSession_MapsFullRecord(t *testing.T) {
	t.Parallel()
	svc, d := newSourceService(t)

	path := "/tmp/full-session.jsonl"
	start := "2026-05-13T11:00:00Z"
	end := "2026-05-13T11:05:00Z"
	first := "inspect logs"

	dbtest.SeedSession(t, d, "full-session", "proj", func(s *db.Session) {
		s.Agent = "codex"
		s.FirstMessage = &first
		s.StartedAt = &start
		s.EndedAt = &end
		s.MessageCount = 4
		s.UserMessageCount = 2
		s.FilePath = &path
	})
	require.NoError(t, d.UpdateSessionSignals("full-session", db.SessionSignalUpdate{}))
	full, err := d.GetSessionFull(context.Background(), "full-session")
	require.NoError(t, err)
	require.NotNil(t, full)
	require.NotNil(t, full.LocalModifiedAt)

	session, err := svc.GetSession(context.Background(), "full-session")
	require.NoError(t, err)
	require.NotNil(t, session)
	assert.Equal(t, "full-session", session.ID)
	assert.Equal(t, &path, session.SourcePath)
	assert.Equal(t, full.LocalModifiedAt, session.UpdatedAt)
	assert.Equal(t, &first, session.FirstMessage)
	require.NotNil(t, session.UserMessageCount)
	assert.Equal(t, 2, *session.UserMessageCount)
}

func TestAgentsViewStoreService_GetMessages_MapsMessagePage(t *testing.T) {
	t.Parallel()
	svc, d := newSourceService(t)

	dbtest.SeedSession(t, d, "msg-session", "proj", func(s *db.Session) {
		s.MessageCount = 2
		s.UserMessageCount = 1
	})

	dbtest.SeedMessages(t, d,
		db.Message{
			SessionID:     "msg-session",
			Ordinal:       0,
			Role:          "user",
			Content:       "hello",
			ContentLength: 5,
			Timestamp:     "2026-05-13T10:00:00Z",
		},
		db.Message{
			SessionID:     "msg-session",
			Ordinal:       1,
			Role:          "assistant",
			Content:       "done",
			ContentLength: 4,
			ThinkingText:  "trace",
			Timestamp:     "2026-05-13T10:00:01Z",
			HasThinking:   true,
			HasToolUse:    true,
			Model:         "gpt-5.5",
			TokenUsage:    json.RawMessage(`{"input":10,"output":20}`),
			SourceUUID:    "uuid-1",
			SourceType:    "message",
			SourceSubtype: "assistant_output",
			ToolCalls: []db.ToolCall{{
				ToolName:          "Read",
				Category:          "file",
				ToolUseID:         "toolu_1",
				InputJSON:         `{"file_path":"main.go"}`,
				SkillName:         "editor",
				ResultContent:     "package main",
				SubagentSessionID: "sub-1",
			}},
		},
	)

	from := 1
	page, err := svc.GetMessages(context.Background(), "msg-session", source.MessageFilter{
		From:      &from,
		Limit:     1,
		Direction: "asc",
	})
	require.NoError(t, err)
	require.Len(t, page.Messages, 1)
	assert.Equal(t, 1, page.Count)

	msg := page.Messages[0]
	assert.Equal(t, int64(2), msg.ID)
	assert.Equal(t, "msg-session", msg.SessionID)
	assert.Equal(t, 1, msg.Ordinal)
	assert.Equal(t, "assistant", msg.Role)
	assert.Equal(t, "done", msg.Content)
	assert.Equal(t, "trace", msg.ThinkingText)
	assert.Equal(t, "2026-05-13T10:00:01Z", msg.Timestamp)
	assert.True(t, msg.HasThinking)
	assert.True(t, msg.HasToolUse)
	assert.Equal(t, "gpt-5.5", msg.Model)
	assert.JSONEq(t, `{"input":10,"output":20}`, string(msg.TokenUsage))
	assert.Equal(t, "uuid-1", msg.SourceUUID)
	assert.Equal(t, "message", msg.SourceType)
	assert.Equal(t, "assistant_output", msg.SourceSubtype)
	require.Len(t, msg.ToolCalls, 1)
	assert.Equal(t, "Read", msg.ToolCalls[0].ToolName)
	assert.Equal(t, "package main", msg.ToolCalls[0].ResultContent)
}

func TestAgentsViewStoreService_GetToolCalls_FlattensAcrossMessages(t *testing.T) {
	t.Parallel()
	svc, d := newSourceService(t)

	dbtest.SeedSession(t, d, "tc-session", "proj", func(s *db.Session) {
		s.MessageCount = 2
		s.UserMessageCount = 1
	})

	dbtest.SeedMessages(t, d,
		db.Message{
			SessionID:     "tc-session",
			Ordinal:       0,
			Role:          "assistant",
			Content:       "a",
			ContentLength: 1,
			ToolCalls: []db.ToolCall{{
				ToolName:      "Read",
				ToolUseID:     "toolu_1",
				InputJSON:     `{"file_path":"a.go"}`,
				ResultContent: "content-a",
			}},
		},
		db.Message{
			SessionID:     "tc-session",
			Ordinal:       1,
			Role:          "assistant",
			Content:       "b",
			ContentLength: 1,
			ToolCalls: []db.ToolCall{{
				ToolName:          "Task",
				Category:          "agent",
				ToolUseID:         "toolu_2",
				SubagentSessionID: "child-1",
			}},
		},
	)

	calls, err := svc.GetToolCalls(context.Background(), "tc-session")
	require.NoError(t, err)
	require.Len(t, calls, 2)
	assert.Equal(t, "Read", calls[0].ToolName)
	assert.Equal(t, "content-a", calls[0].ResultContent)
	assert.Equal(t, "Task", calls[1].ToolName)
	assert.Equal(t, "child-1", calls[1].SubagentSessionID)
}

func TestAgentsViewStoreService_GetToolCalls_Empty(t *testing.T) {
	t.Parallel()
	svc, d := newSourceService(t)

	dbtest.SeedSession(t, d, "empty-tools", "proj", func(s *db.Session) {
		s.MessageCount = 1
		s.UserMessageCount = 1
	})

	calls, err := svc.GetToolCalls(context.Background(), "empty-tools")
	require.NoError(t, err)
	assert.Empty(t, calls)
}

func TestAgentsViewStoreService_WatchEvents_NotConfigured(t *testing.T) {
	t.Parallel()
	svc, _ := newSourceService(t)

	ch, err := svc.WatchEvents(context.Background())
	require.Error(t, err)
	assert.Nil(t, ch)
	assert.True(t, errors.Is(err, source.ErrEventsNotConfigured))
}
