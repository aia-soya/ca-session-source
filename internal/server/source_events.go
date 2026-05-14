package server

import (
	"context"
	"net/http"
	gosync "sync"
	"time"

	"github.com/wesm/agentsview/internal/source"
)

const sourceEventBroadcasterBufferCap = 32

type sourceEventBroadcaster struct {
	ctx         context.Context
	watchEvents source.EventWatchFunc

	mu      gosync.Mutex
	subs    map[chan source.Event]struct{}
	started bool
	cancel  context.CancelFunc
	runGen  uint64
}

func newSourceEventBroadcaster(
	ctx context.Context, watchEvents source.EventWatchFunc,
) *sourceEventBroadcaster {
	if ctx == nil {
		ctx = context.Background()
	}
	return &sourceEventBroadcaster{
		ctx:         ctx,
		watchEvents: watchEvents,
		subs:        make(map[chan source.Event]struct{}),
	}
}

func (b *sourceEventBroadcaster) Subscribe() (<-chan source.Event, func(), error) {
	b.mu.Lock()
	if err := b.ensureStartedLocked(); err != nil {
		b.mu.Unlock()
		return nil, nil, err
	}

	ch := make(chan source.Event, sourceEventBroadcasterBufferCap)
	b.subs[ch] = struct{}{}
	b.mu.Unlock()

	var once gosync.Once
	unsub := func() {
		once.Do(func() {
			b.removeSubscriber(ch)
		})
	}

	return ch, unsub, nil
}

func (b *sourceEventBroadcaster) ensureStartedLocked() error {
	if b.started {
		return nil
	}
	if b.watchEvents == nil {
		return source.ErrEventsNotConfigured
	}

	watchCtx, cancel := context.WithCancel(b.ctx)
	events, err := b.watchEvents(watchCtx)
	if err != nil {
		cancel()
		return err
	}

	b.runGen++
	gen := b.runGen
	b.started = true
	b.cancel = cancel
	go b.run(gen, events)
	return nil
}

func (b *sourceEventBroadcaster) run(gen uint64, events <-chan source.Event) {
	for ev := range events {
		b.broadcast(ev)
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	if gen != b.runGen {
		return
	}
	b.started = false
	b.cancel = nil
	b.closeAllSubsLocked()
}

func (b *sourceEventBroadcaster) broadcast(ev source.Event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for ch := range b.subs {
		select {
		case ch <- ev:
		default:
			b.removeSubscriberLocked(ch)
		}
	}
}

func (b *sourceEventBroadcaster) stopLocked() {
	if !b.started || b.cancel == nil {
		return
	}
	b.started = false
	b.cancel()
	b.cancel = nil
	b.runGen++
}

func (b *sourceEventBroadcaster) maybeStopLocked() {
	if len(b.subs) == 0 {
		b.stopLocked()
	}
}

func (b *sourceEventBroadcaster) removeSubscriberLocked(ch chan source.Event) {
	if _, ok := b.subs[ch]; !ok {
		return
	}
	delete(b.subs, ch)
	close(ch)
	b.maybeStopLocked()
}

func (b *sourceEventBroadcaster) removeSubscriber(ch chan source.Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.removeSubscriberLocked(ch)
}

func (b *sourceEventBroadcaster) closeAllSubsLocked() {
	for ch := range b.subs {
		delete(b.subs, ch)
		close(ch)
	}
}

func (b *sourceEventBroadcaster) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.stopLocked()
	b.closeAllSubsLocked()
}

func (s *Server) sourceScopeWatch(
	ctx context.Context,
) (<-chan source.ScopeSignal, func(), error) {
	if s.engine == nil || s.broadcaster == nil {
		return nil, nil, source.ErrEventsNotConfigured
	}

	watchCtx, cancel := context.WithCancel(ctx)
	sub, unsub := s.broadcaster.Subscribe()
	out := make(chan source.ScopeSignal, 8)
	go func() {
		defer close(out)
		defer cancel()
		defer unsub()

		for {
			select {
			case <-watchCtx.Done():
				return
			case ev, ok := <-sub:
				if !ok {
					return
				}
				select {
				case <-watchCtx.Done():
					return
				case out <- source.ScopeSignal{Scope: ev.Scope}:
				}
			}
		}
	}()
	return out, cancel, nil
}

func (s *Server) handleSourceEvents(
	w http.ResponseWriter, r *http.Request,
) {
	if s.engine == nil || s.broadcaster == nil || s.sourceEvents == nil {
		w.Header().Set("Retry-After", "300")
		writeSourceError(w, http.StatusServiceUnavailable,
			"source events not available in this mode")
		return
	}

	events, unsub, err := s.sourceEvents.Subscribe()
	if err != nil {
		w.Header().Set("Retry-After", "300")
		writeSourceError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	defer unsub()

	stream, err := NewSSEStream(w)
	if err != nil {
		writeError(w, http.StatusInternalServerError,
			"streaming not supported")
		return
	}

	heartbeat := time.NewTicker(
		15 * time.Second,
	)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-events:
			if !ok {
				return
			}
			stream.SendJSON("source_event", ev)
		case <-heartbeat.C:
			stream.Send("heartbeat",
				time.Now().UTC().Format(time.RFC3339))
		}
	}
}
