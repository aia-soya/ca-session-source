package testutil

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func MustListenTCP(t *testing.T, addr string) net.Listener {
	t.Helper()

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		if strings.Contains(err.Error(), "operation not permitted") {
			t.Skipf("tcp listeners unavailable in this test environment: %v", err)
		}
		t.Fatalf("listen %s: %v", addr, err)
	}
	return ln
}

func NewTCPTestServer(
	t *testing.T, addr string, handler http.Handler,
) *httptest.Server {
	t.Helper()

	ln := MustListenTCP(t, addr)
	return NewTCPTestServerWithListener(t, ln, handler)
}

func NewTCPTestServerWithListener(
	t *testing.T, ln net.Listener, handler http.Handler,
) *httptest.Server {
	t.Helper()

	ts := httptest.NewUnstartedServer(handler)
	ts.Listener.Close()
	ts.Listener = ln
	ts.Start()
	t.Cleanup(ts.Close)
	return ts
}
