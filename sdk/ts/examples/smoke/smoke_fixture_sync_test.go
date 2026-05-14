package smoke

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wesm/agentsview/internal/db"
	syncpkg "github.com/wesm/agentsview/internal/sync"
)

func TestSmokeHarness_SyncsTopLevelFixturesWithoutTouchingRealHomeDirs(t *testing.T) {
	t.Parallel()

	env := newSmokeEnv(t, smokeEnvOptions{})

	assertAgentDirIsIsolatedFromHome(t, env.claudeDir, ".claude")
	assertAgentDirIsIsolatedFromHome(t, env.codexDir, ".codex")

	claudeFixture := repoFixturePath(
		t, "testdata", "claude", "minimal_session.jsonl",
	)
	codexFixture := repoFixturePath(
		t, "testdata", "codex", "minimal_session.jsonl",
	)

	claudePath := copyFixtureToDir(
		t,
		claudeFixture,
		filepath.Join(env.claudeDir, "fixture-proj", "fixture-session.jsonl"),
	)
	codexPath := copyFixtureToDir(
		t,
		codexFixture,
		filepath.Join(
			env.codexDir,
			"2024", "01", "01",
			"rollout-20240101-abc-123.jsonl",
		),
	)

	stats := env.engine.SyncAll(context.Background(), nil)
	wantStats := syncpkg.SyncStats{TotalSessions: 2, Synced: 2, Skipped: 0}
	assert.Equal(t, wantStats.TotalSessions, stats.TotalSessions)
	assert.Equal(t, wantStats.Synced, stats.Synced)
	assert.Equal(t, wantStats.Skipped, stats.Skipped)
	assert.Zero(t, stats.Failed)
	assert.False(t, stats.Aborted)

	assertFixtureSessionState(t, env.db, "fixture-session", "claude", 4, claudePath)
	assertFixtureSessionState(t, env.db, "codex:abc-123", "codex", 2, codexPath)
	assertFixtureSessionProject(t, env.db, "fixture-session", "my_app")
	assertFixtureSessionProject(t, env.db, "codex:abc-123", "my_api")
	assertFixtureToolCallCount(t, env.db, "fixture-session", 1)
}

func TestSmokeHarness_SyncsMalformedClaudeFixtureWithoutTouchingRealHomeDirs(t *testing.T) {
	t.Parallel()

	env := newSmokeEnv(t, smokeEnvOptions{})

	assertAgentDirIsIsolatedFromHome(t, env.claudeDir, ".claude")

	malformedFixture := repoFixturePath(
		t, "testdata", "claude", "malformed_session.jsonl",
	)
	malformedPath := copyFixtureToDir(
		t,
		malformedFixture,
		filepath.Join(env.claudeDir, "fixture-proj", "malformed-session.jsonl"),
	)

	stats := env.engine.SyncAll(context.Background(), nil)
	wantStats := syncpkg.SyncStats{TotalSessions: 1, Synced: 1, Skipped: 0}
	assert.Equal(t, wantStats.TotalSessions, stats.TotalSessions)
	assert.Equal(t, wantStats.Synced, stats.Synced)
	assert.Equal(t, wantStats.Skipped, stats.Skipped)
	assert.Zero(t, stats.Failed)
	assert.False(t, stats.Aborted)

	assertFixtureSessionState(t, env.db, "malformed-session", "claude", 4, malformedPath)
	assertFixtureSessionProject(t, env.db, "malformed-session", "my_app")
	assertFixtureToolCallCount(t, env.db, "malformed-session", 1)
	assertFixtureParserState(t, env.db, "malformed-session", 1, false)
}

func TestSmokeHarness_SyncsMalformedCodexFixtureWithoutTouchingRealHomeDirs(t *testing.T) {
	t.Parallel()

	env := newSmokeEnv(t, smokeEnvOptions{})

	assertAgentDirIsIsolatedFromHome(t, env.codexDir, ".codex")

	malformedFixture := repoFixturePath(
		t, "testdata", "codex", "malformed_session.jsonl",
	)
	malformedPath := copyFixtureToDir(
		t,
		malformedFixture,
		filepath.Join(
			env.codexDir,
			"2024", "01", "01",
			"rollout-20240101-bad-codex-123.jsonl",
		),
	)

	stats := env.engine.SyncAll(context.Background(), nil)
	wantStats := syncpkg.SyncStats{TotalSessions: 1, Synced: 1, Skipped: 0}
	assert.Equal(t, wantStats.TotalSessions, stats.TotalSessions)
	assert.Equal(t, wantStats.Synced, stats.Synced)
	assert.Equal(t, wantStats.Skipped, stats.Skipped)
	assert.Zero(t, stats.Failed)
	assert.False(t, stats.Aborted)

	assertFixtureSessionState(t, env.db, "codex:bad-codex-123", "codex", 2, malformedPath)
	assertFixtureSessionProject(t, env.db, "codex:bad-codex-123", "my_api")
	assertFixtureToolCallCount(t, env.db, "codex:bad-codex-123", 0)
	// Current upstream Codex parser skips invalid lines but does not
	// surface parser_malformed_lines/is_truncated metadata like Claude.
	assertFixtureParserState(t, env.db, "codex:bad-codex-123", 0, false)
}

func TestSmokeHarness_SyncsTruncatedCodexFixtureWithoutTouchingRealHomeDirs(t *testing.T) {
	t.Parallel()

	env := newSmokeEnv(t, smokeEnvOptions{})

	assertAgentDirIsIsolatedFromHome(t, env.codexDir, ".codex")

	truncatedFixture := repoFixturePath(
		t, "testdata", "codex", "truncated_session.jsonl",
	)
	truncatedPath := copyFixtureToDir(
		t,
		truncatedFixture,
		filepath.Join(
			env.codexDir,
			"2024", "01", "01",
			"rollout-20240101-truncated-codex-123.jsonl",
		),
	)

	stats := env.engine.SyncAll(context.Background(), nil)
	wantStats := syncpkg.SyncStats{TotalSessions: 1, Synced: 1, Skipped: 0}
	assert.Equal(t, wantStats.TotalSessions, stats.TotalSessions)
	assert.Equal(t, wantStats.Synced, stats.Synced)
	assert.Equal(t, wantStats.Skipped, stats.Skipped)
	assert.Zero(t, stats.Failed)
	assert.False(t, stats.Aborted)

	assertFixtureSessionState(t, env.db, "codex:truncated-codex-123", "codex", 2, truncatedPath)
	assertFixtureSessionProject(t, env.db, "codex:truncated-codex-123", "my_api")
	assertFixtureToolCallCount(t, env.db, "codex:truncated-codex-123", 0)
	// Current upstream Codex semantics skip a malformed tail line
	// without surfacing parser_malformed_lines/is_truncated metadata.
	assertFixtureParserState(t, env.db, "codex:truncated-codex-123", 0, false)
	assertFixtureMissingTerminationStatus(t, env.db, "codex:truncated-codex-123")
}

func TestSmokeHarness_SyncsTruncatedClaudeFixtureWithoutTouchingRealHomeDirs(t *testing.T) {
	t.Parallel()

	env := newSmokeEnv(t, smokeEnvOptions{})

	assertAgentDirIsIsolatedFromHome(t, env.claudeDir, ".claude")

	truncatedFixture := repoFixturePath(
		t, "testdata", "claude", "truncated_session.jsonl",
	)
	truncatedPath := copyFixtureToDir(
		t,
		truncatedFixture,
		filepath.Join(env.claudeDir, "fixture-proj", "truncated-session.jsonl"),
	)

	stats := env.engine.SyncAll(context.Background(), nil)
	wantStats := syncpkg.SyncStats{TotalSessions: 1, Synced: 1, Skipped: 0}
	assert.Equal(t, wantStats.TotalSessions, stats.TotalSessions)
	assert.Equal(t, wantStats.Synced, stats.Synced)
	assert.Equal(t, wantStats.Skipped, stats.Skipped)
	assert.Zero(t, stats.Failed)
	assert.False(t, stats.Aborted)

	assertFixtureSessionState(t, env.db, "truncated-session", "claude", 2, truncatedPath)
	assertFixtureSessionProject(t, env.db, "truncated-session", "my_app")
	assertFixtureToolCallCount(t, env.db, "truncated-session", 0)
	// Current upstream Claude semantics distinguish between a
	// malformed tail line and a physically truncated no-newline
	// write: this fixture records termination_status=truncated
	// but leaves is_truncated=false.
	assertFixtureParserState(t, env.db, "truncated-session", 1, false)
	assertFixtureTerminationStatus(t, env.db, "truncated-session", "truncated")
}

func repoFixturePath(t *testing.T, elems ...string) string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	require.True(t, ok, "runtime.Caller(0) failed")

	parts := []string{filepath.Dir(filename), "..", "..", "..", ".."}
	parts = append(parts, elems...)
	return filepath.Clean(filepath.Join(parts...))
}

func copyFixtureToDir(t *testing.T, srcPath, dstPath string) string {
	t.Helper()

	data, err := os.ReadFile(srcPath)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Dir(dstPath), 0o755))
	require.NoError(t, os.WriteFile(dstPath, data, 0o644))
	return dstPath
}

func assertAgentDirIsIsolatedFromHome(t *testing.T, dirPath, homeAgentDir string) {
	t.Helper()

	home, err := os.UserHomeDir()
	require.NoError(t, err)

	realAgentRoot := filepath.Join(home, homeAgentDir)
	assert.False(
		t,
		pathWithin(realAgentRoot, dirPath),
		"agent dir %q should not live under real home dir %q",
		dirPath,
		realAgentRoot,
	)
}

func pathWithin(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return rel == "." || (!strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && rel != "..")
}

func assertFixtureSessionState(
	t *testing.T,
	database *db.DB,
	sessionID, wantAgent string,
	wantMessageCount int,
	wantFilePath string,
) {
	t.Helper()

	session, err := database.GetSessionFull(context.Background(), sessionID)
	require.NoError(t, err)
	require.NotNil(t, session)
	assert.Equal(t, wantAgent, session.Agent)
	assert.Equal(t, wantMessageCount, session.MessageCount)
	require.NotNil(t, session.FilePath)
	assert.Equal(t, wantFilePath, *session.FilePath)
}

func assertFixtureSessionProject(
	t *testing.T,
	database *db.DB,
	sessionID, wantProject string,
) {
	t.Helper()

	session, err := database.GetSession(context.Background(), sessionID)
	require.NoError(t, err)
	require.NotNil(t, session)
	assert.Equal(t, wantProject, session.Project)
}

func assertFixtureToolCallCount(
	t *testing.T,
	database *db.DB,
	sessionID string,
	want int,
) {
	t.Helper()

	var got int
	err := database.Reader().QueryRow(
		"SELECT COUNT(*) FROM tool_calls WHERE session_id = ?",
		sessionID,
	).Scan(&got)
	require.NoError(t, err)
	assert.Equal(t, want, got)
}

func assertFixtureParserState(
	t *testing.T,
	database *db.DB,
	sessionID string,
	wantMalformedLines int,
	wantTruncated bool,
) {
	t.Helper()

	session, err := database.GetSessionFull(context.Background(), sessionID)
	require.NoError(t, err)
	require.NotNil(t, session)
	assert.Equal(t, wantMalformedLines, session.ParserMalformedLines)
	assert.Equal(t, wantTruncated, session.IsTruncated)
}

func assertFixtureTerminationStatus(
	t *testing.T,
	database *db.DB,
	sessionID string,
	want string,
) {
	t.Helper()

	session, err := database.GetSessionFull(context.Background(), sessionID)
	require.NoError(t, err)
	require.NotNil(t, session)
	require.NotNil(t, session.TerminationStatus)
	assert.Equal(t, want, *session.TerminationStatus)
}

func assertFixtureMissingTerminationStatus(
	t *testing.T,
	database *db.DB,
	sessionID string,
) {
	t.Helper()

	session, err := database.GetSessionFull(context.Background(), sessionID)
	require.NoError(t, err)
	require.NotNil(t, session)
	assert.Nil(t, session.TerminationStatus)
}
