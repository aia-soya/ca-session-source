package source

import (
	"context"
	"fmt"
	"reflect"
	"slices"

	"github.com/wesm/agentsview/internal/db"
)

const sourceEventBufferCap = 32

// ScopeSignal is the coarse-grained change notice emitted by the
// existing AgentsView broadcaster. M2 adapts these signals into
// stable source-level events.
type ScopeSignal struct {
	Scope string
}

// ScopeWatchFunc subscribes to coarse-grained change signals for the
// lifetime of ctx.
type ScopeWatchFunc func(ctx context.Context) (<-chan ScopeSignal, func(), error)

type sessionSnapshot map[string]Session

// NewScopeEventWatchFunc adapts coarse-grained scope notifications
// onto the stable source event contract exposed by WatchEvents.
func NewScopeEventWatchFunc(
	store db.Store, watchScopes ScopeWatchFunc,
) EventWatchFunc {
	if watchScopes == nil {
		return nil
	}

	svc := &AgentsViewStoreService{store: store}
	return func(ctx context.Context) (<-chan Event, error) {
		scopes, cleanup, err := watchScopes(ctx)
		if err != nil {
			return nil, err
		}
		if cleanup == nil {
			cleanup = func() {}
		}

		previous, err := svc.loadSessionSnapshot(ctx)
		if err != nil {
			cleanup()
			return nil, err
		}

		out := make(chan Event, sourceEventBufferCap)
		go svc.runScopeEventAdapter(ctx, previous, scopes, cleanup, out)
		return out, nil
	}
}

func (s *AgentsViewStoreService) runScopeEventAdapter(
	ctx context.Context,
	previous sessionSnapshot,
	scopes <-chan ScopeSignal,
	cleanup func(),
	out chan<- Event,
) {
	defer close(out)
	defer cleanup()

	for {
		select {
		case <-ctx.Done():
			return
		case scope, ok := <-scopes:
			if !ok {
				return
			}

			current, err := s.loadSessionSnapshot(ctx)
			if err != nil {
				s.emitSourceError(
					ctx,
					out,
					"",
					fmt.Errorf("refresh scope %q: %w", scope.Scope, err),
				)
				continue
			}

			previous = s.advanceSnapshot(ctx, out, previous, current)
		}
	}
}

func (s *AgentsViewStoreService) loadSessionSnapshot(
	ctx context.Context,
) (sessionSnapshot, error) {
	snapshot := make(sessionSnapshot)
	cursor := ""

	for {
		page, err := s.ListSessions(ctx, SessionFilter{
			IncludeOneShot:   true,
			IncludeAutomated: true,
			IncludeChildren:  true,
			Limit:            db.MaxSessionLimit,
			Cursor:           cursor,
		})
		if err != nil {
			return nil, err
		}
		for _, sess := range page.Sessions {
			snapshot[sess.ID] = sess
		}
		if page.NextCursor == "" {
			return snapshot, nil
		}
		cursor = page.NextCursor
	}
}

func (s *AgentsViewStoreService) advanceSnapshot(
	ctx context.Context,
	out chan<- Event,
	previous, current sessionSnapshot,
) sessionSnapshot {
	next := make(sessionSnapshot, len(current))

	ids := make([]string, 0, len(current))
	for id := range current {
		ids = append(ids, id)
	}
	slices.Sort(ids)

	for _, id := range ids {
		curr := current[id]
		prev, existed := previous[id]
		if !existed {
			if !sendEvent(ctx, out, newSessionEvent(EventTypeSessionCreated, curr)) {
				return next
			}
			next[id] = s.snapshotAfterAppends(ctx, out, curr, 0)
			continue
		}

		if reflect.DeepEqual(prev, curr) {
			next[id] = curr
			continue
		}

		if !sendEvent(ctx, out, newSessionEvent(EventTypeSessionUpdated, curr)) {
			next[id] = prev
			return next
		}
		if curr.MessageCount > prev.MessageCount {
			next[id] = s.snapshotAfterAppends(
				ctx,
				out,
				curr,
				prev.MessageCount,
			)
			continue
		}

		next[id] = curr
	}

	return next
}

func (s *AgentsViewStoreService) emitAppendedMessages(
	ctx context.Context,
	out chan<- Event,
	session Session,
	fromOrdinal int,
) (int, bool) {
	if session.MessageCount <= fromOrdinal {
		return session.MessageCount, true
	}

	nextOrdinal := fromOrdinal
	for nextOrdinal < session.MessageCount {
		limit := session.MessageCount - nextOrdinal
		if limit > db.MaxMessageLimit {
			limit = db.MaxMessageLimit
		}

		msgs, err := s.store.GetMessages(
			ctx, session.ID, nextOrdinal, limit, true,
		)
		if err != nil {
			s.emitSourceError(ctx, out, session.ID, err)
			return nextOrdinal, false
		}
		if len(msgs) == 0 {
			return nextOrdinal, false
		}

		for _, msg := range msgs {
			ordinal := msg.Ordinal
			if !sendEvent(ctx, out, Event{
				SchemaVersion:  eventSchemaVersion,
				Type:           EventTypeMessageAppended,
				SessionID:      session.ID,
				Agent:          session.Agent,
				MessageCount:   cloneIntPtr(session.MessageCount),
				MessageOrdinal: &ordinal,
				Role:           msg.Role,
				SourcePath:     valueOrEmpty(session.SourcePath),
			}) {
				return nextOrdinal, false
			}
			nextOrdinal = ordinal + 1
		}
	}

	return session.MessageCount, true
}

func (s *AgentsViewStoreService) emitSourceError(
	ctx context.Context,
	out chan<- Event,
	sessionID string,
	err error,
) {
	if err == nil {
		return
	}
	_ = sendEvent(ctx, out, Event{
		SchemaVersion: eventSchemaVersion,
		Type:          EventTypeSourceError,
		SessionID:     sessionID,
		Error:         err.Error(),
	})
}

func newSessionEvent(t EventType, session Session) Event {
	return Event{
		SchemaVersion: eventSchemaVersion,
		Type:          t,
		SessionID:     session.ID,
		Agent:         session.Agent,
		MessageCount:  cloneIntPtr(session.MessageCount),
		SourcePath:    valueOrEmpty(session.SourcePath),
	}
}

func (s *AgentsViewStoreService) snapshotAfterAppends(
	ctx context.Context,
	out chan<- Event,
	session Session,
	fromOrdinal int,
) Session {
	deliveredCount, complete := s.emitAppendedMessages(
		ctx,
		out,
		session,
		fromOrdinal,
	)
	if complete {
		return session
	}

	session.MessageCount = deliveredCount
	return session
}

func sendEvent(
	ctx context.Context, out chan<- Event, ev Event,
) bool {
	select {
	case <-ctx.Done():
		return false
	case out <- ev:
		return true
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
