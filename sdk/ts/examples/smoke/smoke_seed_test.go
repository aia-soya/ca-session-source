package smoke

import (
	"context"
	"strconv"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/db"
)

type smokeSessionSeed struct {
	SessionID           string
	InitialMessageCount int
	ToolCallOrdinal     int
	WithToolCall        bool
}

type failOnceGetMessagesStore struct {
	db.Store
	sessionID   string
	fromAtLeast int
	err         error
	failed      atomic.Bool
	failedCh    chan<- struct{}
}

func (s *failOnceGetMessagesStore) GetMessages(
	ctx context.Context, sessionID string, from, limit int, asc bool,
) ([]db.Message, error) {
	if sessionID == s.sessionID && from >= s.fromAtLeast && s.failed.CompareAndSwap(false, true) {
		if s.failedCh != nil {
			select {
			case s.failedCh <- struct{}{}:
			default:
			}
		}
		return nil, s.err
	}
	return s.Store.GetMessages(ctx, sessionID, from, limit, asc)
}

func seedSmokeSession(t *testing.T, database *db.DB, seed smokeSessionSeed) {
	t.Helper()

	require.Greater(t, seed.InitialMessageCount, 0)
	sessionID := seed.SessionID

	userMessages := (seed.InitialMessageCount + 1) / 2
	require.NoError(t, database.UpsertSession(db.Session{
		ID:               sessionID,
		Project:          "proj",
		Machine:          "local",
		Agent:            "codex",
		MessageCount:     seed.InitialMessageCount,
		UserMessageCount: userMessages,
	}))

	msgs := make([]db.Message, 0, seed.InitialMessageCount)
	for ordinal := 0; ordinal < seed.InitialMessageCount; ordinal++ {
		role := "user"
		content := "user-msg-" + strconv.Itoa(ordinal)
		if ordinal%2 == 1 {
			role = "assistant"
			content = "assistant-msg-" + strconv.Itoa(ordinal)
		}

		msg := db.Message{
			SessionID:     sessionID,
			Ordinal:       ordinal,
			Role:          role,
			Content:       content,
			ContentLength: len(content),
		}
		if seed.WithToolCall && ordinal == seed.ToolCallOrdinal {
			msg.HasToolUse = true
			msg.ToolCalls = []db.ToolCall{{
				ToolName:            "shell",
				Category:            "exec",
				ToolUseID:           "tool-1",
				InputJSON:           "{\"cmd\":\"pwd\"}",
				ResultContentLength: len("/tmp"),
				ResultContent:       "/tmp",
			}}
		}
		msgs = append(msgs, msg)
	}

	require.NoError(t, database.InsertMessages(msgs))
}

func appendSmokeMessages(
	t *testing.T,
	database *db.DB,
	sessionID string,
	startOrdinal int,
	role string,
	count int,
) {
	t.Helper()

	require.Greater(t, count, 0)

	session, err := database.GetSession(context.Background(), sessionID)
	require.NoError(t, err)
	require.NotNil(t, session)

	userMessageCount := session.UserMessageCount
	if role == "user" {
		userMessageCount += count
	}

	require.NoError(t, database.UpsertSession(db.Session{
		ID:               session.ID,
		Project:          session.Project,
		Machine:          session.Machine,
		Agent:            session.Agent,
		MessageCount:     startOrdinal + count,
		UserMessageCount: userMessageCount,
	}))

	msgs := make([]db.Message, 0, count)
	for offset := 0; offset < count; offset++ {
		ordinal := startOrdinal + offset
		content := role + "-msg-" + strconv.Itoa(ordinal)
		msgs = append(msgs, db.Message{
			SessionID:     sessionID,
			Ordinal:       ordinal,
			Role:          role,
			Content:       content,
			ContentLength: len(content),
		})
	}

	require.NoError(t, database.InsertMessages(msgs))
}
