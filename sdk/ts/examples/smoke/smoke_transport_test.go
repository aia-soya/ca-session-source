package smoke

import (
	"context"
	"net/http"
	"sync/atomic"
	"time"
)

func disconnectFirstSourceEventsRequestAfter(delay time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		var seen atomic.Bool
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/source/v1/events" || seen.Swap(true) {
				next.ServeHTTP(w, r)
				return
			}

			ctx, cancel := context.WithCancel(r.Context())
			timer := time.AfterFunc(delay, cancel)
			defer timer.Stop()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
