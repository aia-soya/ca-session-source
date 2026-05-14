package smoke

type smokeResult struct {
	SessionID string `json:"sessionId"`
	Snapshot  struct {
		Version struct {
			SchemaVersion string `json:"schemaVersion"`
			Version       string `json:"version"`
			Commit        string `json:"commit"`
			BuildDate     string `json:"buildDate"`
			ReadOnly      *bool  `json:"readOnly"`
		} `json:"version"`
		Health struct {
			SchemaVersion        string `json:"schemaVersion"`
			Status               string `json:"status"`
			ReadOnly             *bool  `json:"readOnly"`
			EventStreamAvailable bool   `json:"eventStreamAvailable"`
		} `json:"health"`
		ListedSessionIDs    []string `json:"listedSessionIds"`
		ListedTotal         int      `json:"listedTotal"`
		SessionMessageCount int      `json:"sessionMessageCount"`
		StartOrdinal        int      `json:"startOrdinal"`
		FetchedPageSizes    []int    `json:"fetchedPageSizes"`
		CachedOrdinals      []int    `json:"cachedOrdinals"`
		ToolCallCount       int      `json:"toolCallCount"`
		ToolCallNames       []string `json:"toolCallNames"`
		ToolCalls           []struct {
			ToolName            string  `json:"toolName"`
			ResultContentLength int     `json:"resultContentLength"`
			ResultContent       *string `json:"resultContent"`
			SubagentSessionID   *string `json:"subagentSessionId"`
		} `json:"toolCalls"`
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
