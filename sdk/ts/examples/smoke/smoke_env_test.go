package smoke

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/config"
	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/parser"
	"github.com/wesm/agentsview/internal/server"
	syncpkg "github.com/wesm/agentsview/internal/sync"
)

type smokeEnv struct {
	srv         *server.Server
	db          *db.DB
	broadcaster *server.Broadcaster
	httpServer  *httptest.Server
}

type smokeEnvOptions struct {
	storeWrapper func(db.Store) db.Store
	httpWrapper  func(http.Handler) http.Handler
}

func newSmokeEnv(t *testing.T, opts smokeEnvOptions) *smokeEnv {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "smoke.db")
	database, err := db.Open(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, database.Close())
	})

	claudeDir := filepath.Join(dir, "claude")
	codexDir := filepath.Join(dir, "codex")
	require.NoError(t, os.MkdirAll(claudeDir, 0o755))
	require.NoError(t, os.MkdirAll(codexDir, 0o755))

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := ln.Addr().(*net.TCPAddr).Port

	broadcaster := server.NewBroadcaster(0)
	engine := syncpkg.NewEngine(database, syncpkg.EngineConfig{
		AgentDirs: map[parser.AgentType][]string{
			parser.AgentClaude: {claudeDir},
			parser.AgentCodex:  {codexDir},
		},
		Machine: "test",
		Emitter: broadcaster,
	})

	store := db.Store(database)
	if opts.storeWrapper != nil {
		store = opts.storeWrapper(store)
	}

	srv := server.New(config.Config{
		Host:         "127.0.0.1",
		Port:         port,
		DataDir:      dir,
		DBPath:       dbPath,
		WriteTimeout: 30 * time.Second,
	}, store, engine, server.WithBroadcaster(broadcaster))

	handler := srv.Handler()
	if opts.httpWrapper != nil {
		handler = opts.httpWrapper(handler)
	}

	httpServer := httptest.NewUnstartedServer(handler)
	httpServer.Listener = ln
	httpServer.Start()
	t.Cleanup(httpServer.Close)

	return &smokeEnv{
		srv:         srv,
		db:          database,
		broadcaster: broadcaster,
		httpServer:  httpServer,
	}
}
