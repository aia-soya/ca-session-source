package smoke

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

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

func mustGetwd(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	require.NoError(t, err)
	return wd
}
