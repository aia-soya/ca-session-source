package source

import (
	"context"
	"errors"
)

// ErrEventsNotConfigured indicates that the source facade was
// created without a source-wide event stream adapter. M2 will
// wire a concrete implementation onto this seam.
var ErrEventsNotConfigured = errors.New(
	"source events watcher not configured",
)

// EventWatchFunc is a thin injection seam for the source-wide
// event stream. It keeps M1 scoped to facade/DTO work while
// leaving M2 free to attach broadcaster/SSE-backed behavior.
type EventWatchFunc func(ctx context.Context) (<-chan Event, error)

// Service exposes the narrow source-oriented contract used by
// future source API and SDK layers.
type Service interface {
	ListSessions(ctx context.Context, f SessionFilter) (SessionPage, error)
	GetSession(ctx context.Context, id string) (*Session, error)
	GetMessages(
		ctx context.Context, sessionID string, f MessageFilter,
	) (MessagePage, error)
	GetToolCalls(ctx context.Context, sessionID string) ([]ToolCall, error)
	WatchEvents(ctx context.Context) (<-chan Event, error)
}
