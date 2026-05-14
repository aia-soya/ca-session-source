package source

import (
	"context"

	"github.com/wesm/agentsview/internal/db"
)

// AgentsViewStoreService adapts the existing AgentsView db.Store
// into the narrower source-oriented facade.
type AgentsViewStoreService struct {
	store       db.Store
	watchEvents EventWatchFunc
}

// NewAgentsViewStoreService creates a source facade backed by an
// existing AgentsView store. The optional watchEvents hook is a
// thin seam for M2's event adapter.
func NewAgentsViewStoreService(
	store db.Store, watchEvents EventWatchFunc,
) Service {
	return &AgentsViewStoreService{
		store:       store,
		watchEvents: watchEvents,
	}
}

func (s *AgentsViewStoreService) ListSessions(
	ctx context.Context, f SessionFilter,
) (SessionPage, error) {
	if err := validateSessionFilter(f); err != nil {
		return SessionPage{}, err
	}

	page, err := s.store.ListSessions(ctx, sessionFilterToDB(f))
	if err != nil {
		return SessionPage{}, err
	}

	fullByID, err := s.loadSessionsFull(ctx, page.Sessions)
	if err != nil {
		return SessionPage{}, err
	}

	sessions := make([]Session, 0, len(page.Sessions))
	for _, sess := range page.Sessions {
		if full, ok := fullByID[sess.ID]; ok {
			sessions = append(sessions, mapSession(full))
			continue
		}
		sessions = append(sessions, mapSession(sess))
	}

	return SessionPage{
		Sessions:   sessions,
		NextCursor: page.NextCursor,
		Total:      page.Total,
	}, nil
}

func (s *AgentsViewStoreService) GetSession(
	ctx context.Context, id string,
) (*Session, error) {
	sess, err := s.store.GetSession(ctx, id)
	if err != nil || sess == nil {
		return nil, err
	}

	mapped, err := s.mapSessionWithFull(ctx, *sess)
	if err != nil {
		return nil, err
	}
	return &mapped, nil
}

func (s *AgentsViewStoreService) GetMessages(
	ctx context.Context, sessionID string, f MessageFilter,
) (MessagePage, error) {
	from, limit, asc, err := normalizeMessageFilter(f)
	if err != nil {
		return MessagePage{}, err
	}

	msgs, err := s.store.GetMessages(ctx, sessionID, from, limit, asc)
	if err != nil {
		return MessagePage{}, err
	}

	messages := make([]Message, 0, len(msgs))
	for _, msg := range msgs {
		messages = append(messages, mapMessage(msg))
	}

	return MessagePage{
		Messages: messages,
		Count:    len(messages),
	}, nil
}

func (s *AgentsViewStoreService) GetToolCalls(
	ctx context.Context, sessionID string,
) ([]ToolCall, error) {
	msgs, err := s.store.GetAllMessages(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	calls := make([]ToolCall, 0)
	for _, msg := range msgs {
		for _, call := range msg.ToolCalls {
			mapped := mapToolCall(call)
			mapped.Ordinal = msg.Ordinal
			mapped.Timestamp = msg.Timestamp
			calls = append(calls, mapped)
		}
	}

	return calls, nil
}

func (s *AgentsViewStoreService) WatchEvents(
	ctx context.Context,
) (<-chan Event, error) {
	if s.watchEvents == nil {
		return nil, ErrEventsNotConfigured
	}
	return s.watchEvents(ctx)
}
