package source

import (
	"context"

	"github.com/wesm/agentsview/internal/db"
)

type fullSessionBatchLoader interface {
	GetSessionsFull(
		ctx context.Context, ids []string,
	) (map[string]db.Session, error)
}

type fullSessionHydrationSkipper interface {
	SkipFullSessionHydration() bool
}

func (s *AgentsViewStoreService) loadSessionsFull(
	ctx context.Context, sessions []db.Session,
) (map[string]db.Session, error) {
	if len(sessions) == 0 {
		return map[string]db.Session{}, nil
	}
	if skipper, ok := s.store.(fullSessionHydrationSkipper); ok &&
		skipper.SkipFullSessionHydration() {
		return map[string]db.Session{}, nil
	}

	ids := make([]string, 0, len(sessions))
	for _, sess := range sessions {
		ids = append(ids, sess.ID)
	}

	if loader, ok := s.store.(fullSessionBatchLoader); ok {
		return loader.GetSessionsFull(ctx, ids)
	}

	fullByID := make(map[string]db.Session, len(sessions))
	for _, sess := range sessions {
		full, err := s.store.GetSessionFull(ctx, sess.ID)
		if err != nil {
			return nil, err
		}
		if full != nil {
			fullByID[sess.ID] = *full
		}
	}
	return fullByID, nil
}

func (s *AgentsViewStoreService) mapSessionWithFull(
	ctx context.Context, sess db.Session,
) (Session, error) {
	mapped := mapSession(sess)
	if skipper, ok := s.store.(fullSessionHydrationSkipper); ok &&
		skipper.SkipFullSessionHydration() {
		return mapped, nil
	}

	full, err := s.store.GetSessionFull(ctx, sess.ID)
	if err != nil {
		return Session{}, err
	}
	if full != nil {
		mapped = mapSession(*full)
	}
	return mapped, nil
}
