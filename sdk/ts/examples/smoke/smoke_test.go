package smoke

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/config"
	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/parser"
	"github.com/wesm/agentsview/internal/server"
	syncpkg "github.com/wesm/agentsview/internal/sync"
)

type smokeResult struct {
	SessionID string `json:"sessionId"`
	Snapshot  struct {
		ListedSessionIDs    []string `json:"listedSessionIds"`
		ListedTotal         int      `json:"listedTotal"`
		SessionMessageCount int      `json:"sessionMessageCount"`
		StartOrdinal        int      `json:"startOrdinal"`
		FetchedPageSizes    []int    `json:"fetchedPageSizes"`
		CachedOrdinals      []int    `json:"cachedOrdinals"`
		ToolCallCount       int      `json:"toolCallCount"`
	} `json:"snapshot"`
	EventFlow struct {
		OpenCount  int      `json:"openCount"`
		Errors     []string `json:"errors"`
		SeenEvents []struct {
			Type           string `json:"type"`
			MessageOrdinal *int   `json:"messageOrdinal"`
			MessageCount   *int   `json:"messageCount"`
		} `json:"seenEvents"`
		Fetches []struct {
			Trigger          string `json:"trigger"`
			From             int    `json:"from"`
			FetchedOrdinals  []int  `json:"fetchedOrdinals"`
			AppendedOrdinals []int  `json:"appendedOrdinals"`
		} `json:"fetches"`
		FinalOrdinals     []int `json:"finalOrdinals"`
		FinalMessageCount int   `json:"finalMessageCount"`
	} `json:"eventFlow"`
	History struct {
		Fetches []struct {
			BeforeOrdinal    int   `json:"beforeOrdinal"`
			FetchedOrdinals  []int `json:"fetchedOrdinals"`
			AppendedOrdinals []int `json:"appendedOrdinals"`
			EarliestOrdinal  int   `json:"earliestOrdinal"`
			LatestOrdinal    int   `json:"latestOrdinal"`
			HasMore          bool  `json:"hasMore"`
		} `json:"fetches"`
	} `json:"history"`
}

func TestSmokeHarness_ClosesSnapshotAndIncrementalLoop(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "smoke-session",
		InitialMessageCount: 4,
		ToolCallOrdinal:     3,
		WithToolCall:        true,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "smoke-session",
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: 5,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "smoke-session", 4, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, "smoke-session", result.SessionID)
	assert.Contains(t, result.Snapshot.ListedSessionIDs, "smoke-session")
	assert.Equal(t, 4, result.Snapshot.SessionMessageCount)
	assert.Equal(t, []int{2, 2}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{0, 1, 2, 3}, result.Snapshot.CachedOrdinals)
	assert.Equal(t, 1, result.Snapshot.ToolCallCount)

	assert.Equal(t, 1, result.EventFlow.OpenCount)
	require.Len(t, result.EventFlow.SeenEvents, 2)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[1].Type)

	require.Len(t, result.EventFlow.Fetches, 2)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[1].Trigger)
	assert.Equal(t, 4, result.EventFlow.Fetches[1].From)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)

	assert.Equal(t, []int{0, 1, 2, 3, 4}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 5, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_ReconnectBackfillsGapFromLatestOrdinal(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{
		httpWrapper: disconnectFirstSourceEventsRequestAfter(50 * time.Millisecond),
	})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "reconnect-session",
		InitialMessageCount: 4,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "reconnect-session",
		PageLimit:               2,
		EventTimeoutMs:          12000,
		ExpectFinalMessageCount: 6,
		Reconnect:               true,
		RetryDelayMs:            100,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "reconnect-session", 4, "assistant", 1)

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_REOPEN 2"
	}, 5*time.Second)

	appendSmokeMessages(t, env.db, "reconnect-session", 5, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 15*time.Second)

	assert.Equal(t, 2, result.EventFlow.OpenCount)
	require.Len(t, result.EventFlow.SeenEvents, 2)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[1].Type)

	require.Len(t, result.EventFlow.Fetches, 2)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, 4, result.EventFlow.Fetches[0].From)
	assert.Equal(t, []int{4, 5}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{4, 5}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[1].Trigger)
	assert.Equal(t, 5, result.EventFlow.Fetches[1].From)
	assert.Equal(t, []int{5}, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)

	assert.Equal(t, []int{0, 1, 2, 3, 4, 5}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_SnapshotPathSurvivesEmptyToolCalls(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "no-tool-session",
		InitialMessageCount: 5,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "no-tool-session",
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: 6,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "no-tool-session", 5, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, 0, result.Snapshot.ToolCallCount)
	assert.Equal(t, []int{2, 2, 1}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{0, 1, 2, 3, 4}, result.Snapshot.CachedOrdinals)
	assert.Equal(t, []int{0, 1, 2, 3, 4, 5}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_TailSnapshotLimitsLargeSessionBootstrap(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	env := newSmokeEnv(t, smokeEnvOptions{})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "tail-session",
		InitialMessageCount: 10,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "tail-session",
		PageLimit:               2,
		EventTimeoutMs:          8000,
		ExpectFinalMessageCount: 6,
		SnapshotTailCount:       3,
		HistoryPageLimit:        2,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "tail-session", 10, "assistant", 1)
	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 10*time.Second)

	assert.Equal(t, 10, result.Snapshot.SessionMessageCount)
	assert.Equal(t, 7, result.Snapshot.StartOrdinal)
	assert.Equal(t, []int{2, 1}, result.Snapshot.FetchedPageSizes)
	assert.Equal(t, []int{7, 8, 9}, result.Snapshot.CachedOrdinals)
	require.Len(t, result.History.Fetches, 1)
	assert.Equal(t, 7, result.History.Fetches[0].BeforeOrdinal)
	assert.Equal(t, []int{5, 6}, result.History.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{5, 6}, result.History.Fetches[0].AppendedOrdinals)
	assert.Equal(t, 5, result.History.Fetches[0].EarliestOrdinal)
	assert.Equal(t, 9, result.History.Fetches[0].LatestOrdinal)
	assert.True(t, result.History.Fetches[0].HasMore)
	assert.Equal(t, []int{5, 6, 7, 8, 9, 10}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 6, result.EventFlow.FinalMessageCount)
}

func TestSmokeHarness_SourceErrorIsSurfacedAndGapCanRecover(t *testing.T) {
	t.Parallel()

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not available")
	}

	failSignal := make(chan struct{}, 1)
	env := newSmokeEnv(t, smokeEnvOptions{
		storeWrapper: func(base db.Store) db.Store {
			return &failOnceGetMessagesStore{
				Store:       base,
				sessionID:   "source-error-session",
				fromAtLeast: 4,
				err:         errors.New("forced appended lookup failure"),
				failedCh:    failSignal,
			}
		},
	})
	seedSmokeSession(t, env.db, smokeSessionSeed{
		SessionID:           "source-error-session",
		InitialMessageCount: 4,
	})

	proc := startSmokeProcess(t, smokeRunConfig{
		BaseURL:                 env.httpServer.URL,
		SessionID:               "source-error-session",
		PageLimit:               2,
		EventTimeoutMs:          12000,
		ExpectFinalMessageCount: 5,
	})
	defer proc.Close()

	proc.WaitForLine(t, func(line string) bool {
		return line == "SMOKE_READY"
	}, 3*time.Second)

	appendSmokeMessages(t, env.db, "source-error-session", 4, "assistant", 1)
	env.broadcaster.Emit("messages")

	select {
	case <-failSignal:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for source adapter failure")
	}

	env.broadcaster.Emit("messages")

	result := proc.WaitForResult(t, 12*time.Second)

	require.Len(t, result.EventFlow.SeenEvents, 4)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[0].Type)
	assert.Equal(t, "source.error", result.EventFlow.SeenEvents[1].Type)
	assert.Equal(t, "session.updated", result.EventFlow.SeenEvents[2].Type)
	assert.Equal(t, "message.appended", result.EventFlow.SeenEvents[3].Type)
	assert.Empty(t, result.EventFlow.Errors)

	require.Len(t, result.EventFlow.Fetches, 4)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[0].Trigger)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].FetchedOrdinals)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[0].AppendedOrdinals)
	assert.Equal(t, "source_error", result.EventFlow.Fetches[1].Trigger)
	assert.Empty(t, result.EventFlow.Fetches[1].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[1].AppendedOrdinals)
	assert.Equal(t, "session.updated", result.EventFlow.Fetches[2].Trigger)
	assert.Empty(t, result.EventFlow.Fetches[2].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[2].AppendedOrdinals)
	assert.Equal(t, "message.appended", result.EventFlow.Fetches[3].Trigger)
	assert.Equal(t, []int{4}, result.EventFlow.Fetches[3].FetchedOrdinals)
	assert.Empty(t, result.EventFlow.Fetches[3].AppendedOrdinals)

	assert.Equal(t, []int{0, 1, 2, 3, 4}, result.EventFlow.FinalOrdinals)
	assert.Equal(t, 5, result.EventFlow.FinalMessageCount)
}

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

type smokeRunConfig struct {
	BaseURL                 string
	SessionID               string
	PageLimit               int
	EventTimeoutMs          int
	ExpectFinalMessageCount int
	SnapshotTailCount       int
	HistoryPageLimit        int
	Reconnect               bool
	RetryDelayMs            int
}

type smokeProcess struct {
	cmd       *exec.Cmd
	lines     <-chan string
	stderrBuf *bytes.Buffer
	done      <-chan error
}

var (
	buildSDKDistOnce sync.Once
	buildSDKDistErr  error
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

func startSmokeProcess(t *testing.T, cfg smokeRunConfig) *smokeProcess {
	t.Helper()

	ensureSDKDistBuilt(t)

	workDir := mustGetwd(t)
	cmd := exec.Command("node", "run.js")
	cmd.Dir = workDir

	env := append(os.Environ(),
		"CASS_BASE_URL="+cfg.BaseURL,
		"CASS_SESSION_ID="+cfg.SessionID,
		"CASS_PAGE_LIMIT="+strconv.Itoa(cfg.PageLimit),
		"CASS_EVENT_TIMEOUT_MS="+strconv.Itoa(cfg.EventTimeoutMs),
		"CASS_EXPECT_FINAL_MESSAGE_COUNT="+strconv.Itoa(cfg.ExpectFinalMessageCount),
	)
	if cfg.SnapshotTailCount > 0 {
		env = append(env, "CASS_SNAPSHOT_TAIL_COUNT="+strconv.Itoa(cfg.SnapshotTailCount))
	}
	if cfg.HistoryPageLimit > 0 {
		env = append(env, "CASS_HISTORY_PAGE_LIMIT="+strconv.Itoa(cfg.HistoryPageLimit))
	}
	if cfg.Reconnect {
		env = append(env, "CASS_RECONNECT=true")
	}
	if cfg.RetryDelayMs > 0 {
		env = append(env, "CASS_RETRY_DELAY_MS="+strconv.Itoa(cfg.RetryDelayMs))
	}
	cmd.Env = env

	stdout, err := cmd.StdoutPipe()
	require.NoError(t, err)
	stderr, err := cmd.StderrPipe()
	require.NoError(t, err)

	var stderrBuf bytes.Buffer
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		_, _ = io.Copy(&stderrBuf, stderr)
	}()

	lines := make(chan string, 32)
	go func() {
		defer close(lines)
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			lines <- scanner.Text()
		}
	}()

	require.NoError(t, cmd.Start())

	done := make(chan error, 1)
	go func() {
		waitErr := cmd.Wait()
		<-stderrDone
		done <- waitErr
	}()

	return &smokeProcess{
		cmd:       cmd,
		lines:     lines,
		stderrBuf: &stderrBuf,
		done:      done,
	}
}

func ensureSDKDistBuilt(t *testing.T) {
	t.Helper()

	buildSDKDistOnce.Do(func() {
		workDir := filepath.Clean(filepath.Join(mustGetwd(t), "..", ".."))
		cmd := exec.Command("npm", "run", "build")
		cmd.Dir = workDir
		output, err := cmd.CombinedOutput()
		if err != nil {
			buildSDKDistErr = fmt.Errorf(
				"npm run build failed: %w\n%s",
				err,
				string(output),
			)
			return
		}
	})

	require.NoError(t, buildSDKDistErr)
}

func (p *smokeProcess) WaitForLine(
	t *testing.T,
	match func(line string) bool,
	timeout time.Duration,
) string {
	t.Helper()

	deadline := time.NewTimer(timeout)
	defer deadline.Stop()

	for {
		select {
		case line, ok := <-p.lines:
			if !ok {
				t.Fatalf("smoke process exited before line matched\nstderr:\n%s", p.stderrBuf.String())
			}
			if match(line) {
				return line
			}
		case err := <-p.done:
			if err != nil {
				t.Fatalf("smoke process failed early\nstderr:\n%s", p.stderrBuf.String())
			}
			t.Fatalf("smoke process exited before line matched\nstderr:\n%s", p.stderrBuf.String())
		case <-deadline.C:
			t.Fatalf("timed out waiting for smoke output\nstderr:\n%s", p.stderrBuf.String())
		}
	}
}

func (p *smokeProcess) WaitForResult(
	t *testing.T,
	timeout time.Duration,
) smokeResult {
	t.Helper()

	resultLine := p.WaitForLine(t, func(line string) bool {
		return strings.HasPrefix(line, "SMOKE_RESULT ")
	}, timeout)

	var result smokeResult
	require.NoError(t, json.Unmarshal(
		[]byte(strings.TrimPrefix(resultLine, "SMOKE_RESULT ")),
		&result,
	))

	select {
	case err := <-p.done:
		require.NoError(t, err, "stderr:\n%s", p.stderrBuf.String())
	case <-time.After(5 * time.Second):
		t.Fatalf("smoke process did not exit after emitting result\nstderr:\n%s", p.stderrBuf.String())
	}

	return result
}

func (p *smokeProcess) Close() {
	if p.cmd != nil && p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
	}
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

func mustGetwd(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	require.NoError(t, err)
	return wd
}
