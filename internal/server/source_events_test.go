package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/source"
	syncpkg "github.com/wesm/agentsview/internal/sync"
)

func TestSourceEventBroadcaster_SubscribeStartsUpstreamOnce(t *testing.T) {
	t.Parallel()

	var watchCalls atomic.Int32
	events := make(chan source.Event)
	b := newSourceEventBroadcaster(
		context.Background(),
		func(ctx context.Context) (<-chan source.Event, error) {
			watchCalls.Add(1)
			return events, nil
		},
	)

	ch1, unsub1, err := b.Subscribe()
	require.NoError(t, err)
	defer unsub1()
	ch2, unsub2, err := b.Subscribe()
	require.NoError(t, err)
	defer unsub2()

	assert.Equal(t, int32(1), watchCalls.Load())

	ev := source.Event{
		SchemaVersion: "ca-session.event.v1",
		Type:          source.EventTypeSessionUpdated,
		SessionID:     "s-1",
	}
	events <- ev

	select {
	case got := <-ch1:
		assert.Equal(t, ev, got)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for first subscriber event")
	}

	select {
	case got := <-ch2:
		assert.Equal(t, ev, got)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for second subscriber event")
	}
	close(events)
}

func TestSourceEventBroadcaster_RestartsAfterUpstreamStops(t *testing.T) {
	t.Parallel()

	var watchCalls atomic.Int32
	firstEvents := make(chan source.Event)
	secondEvents := make(chan source.Event)
	b := newSourceEventBroadcaster(
		context.Background(),
		func(ctx context.Context) (<-chan source.Event, error) {
			call := watchCalls.Add(1)
			if call == 1 {
				return firstEvents, nil
			}
			return secondEvents, nil
		},
	)

	ch1, unsub1, err := b.Subscribe()
	require.NoError(t, err)
	defer unsub1()

	close(firstEvents)

	select {
	case _, ok := <-ch1:
		assert.False(t, ok)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for first subscriber to close")
	}

	ch2, unsub2, err := b.Subscribe()
	require.NoError(t, err)
	defer unsub2()
	assert.Equal(t, int32(2), watchCalls.Load())

	ev := source.Event{
		SchemaVersion: "ca-session.event.v1",
		Type:          source.EventTypeMessageAppended,
		SessionID:     "s-2",
	}
	secondEvents <- ev

	select {
	case got := <-ch2:
		assert.Equal(t, ev, got)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for restarted subscriber event")
	}

	close(secondEvents)
}

func TestSourceEventBroadcaster_StopsUpstreamAfterLastSubscriberLeaves(t *testing.T) {
	t.Parallel()

	stopped := make(chan struct{})
	var once sync.Once
	b := newSourceEventBroadcaster(
		context.Background(),
		func(ctx context.Context) (<-chan source.Event, error) {
			events := make(chan source.Event)
			go func() {
				<-ctx.Done()
				once.Do(func() { close(stopped) })
				close(events)
			}()
			return events, nil
		},
	)

	_, unsub, err := b.Subscribe()
	require.NoError(t, err)
	unsub()

	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for upstream watch to stop")
	}
}

func TestHandleSourceEvents_SubscribeErrorReturnsJSON503(t *testing.T) {
	t.Parallel()

	s := &Server{
		engine:      &syncpkg.Engine{},
		broadcaster: NewBroadcaster(0),
		sourceEvents: newSourceEventBroadcaster(
			context.Background(),
			func(ctx context.Context) (<-chan source.Event, error) {
				return nil, errors.New("snapshot failed")
			},
		),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/source/v1/events", nil)
	w := httptest.NewRecorder()

	s.handleSourceEvents(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Equal(t, "300", w.Header().Get("Retry-After"))
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	assert.NotEqual(t, "text/event-stream", w.Header().Get("Content-Type"))
	assert.Contains(t, w.Body.String(), "snapshot failed")
}
