package server

import (
	"net/http"
	"strconv"

	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/service"
	"github.com/wesm/agentsview/internal/source"
	"github.com/wesm/agentsview/internal/timeutil"
)

type responseErrorWriter func(http.ResponseWriter, int, string)

type sessionListParams struct {
	Project          string
	ExcludeProject   string
	Machine          string
	Agent            string
	Date             string
	DateFrom         string
	DateTo           string
	ActiveSince      string
	MinMessages      int
	MaxMessages      int
	MinUserMessages  int
	IncludeOneShot   bool
	IncludeAutomated bool
	IncludeChildren  bool
	Outcome          string
	HealthGrade      string
	Termination      string
	MinToolFailures  *int
	Cursor           string
	Limit            int
}

func (p sessionListParams) serviceFilter() service.ListFilter {
	return service.ListFilter{
		Project:          p.Project,
		ExcludeProject:   p.ExcludeProject,
		Machine:          p.Machine,
		Agent:            p.Agent,
		Date:             p.Date,
		DateFrom:         p.DateFrom,
		DateTo:           p.DateTo,
		ActiveSince:      p.ActiveSince,
		MinMessages:      p.MinMessages,
		MaxMessages:      p.MaxMessages,
		MinUserMessages:  p.MinUserMessages,
		IncludeOneShot:   p.IncludeOneShot,
		IncludeAutomated: p.IncludeAutomated,
		IncludeChildren:  p.IncludeChildren,
		Outcome:          p.Outcome,
		HealthGrade:      p.HealthGrade,
		Termination:      p.Termination,
		MinToolFailures:  p.MinToolFailures,
		Cursor:           p.Cursor,
		Limit:            p.Limit,
	}
}

func (p sessionListParams) sourceFilter() source.SessionFilter {
	return source.SessionFilter{
		Project:          p.Project,
		ExcludeProject:   p.ExcludeProject,
		Machine:          p.Machine,
		Agent:            p.Agent,
		Date:             p.Date,
		DateFrom:         p.DateFrom,
		DateTo:           p.DateTo,
		ActiveSince:      p.ActiveSince,
		MinMessages:      p.MinMessages,
		MaxMessages:      p.MaxMessages,
		MinUserMessages:  p.MinUserMessages,
		IncludeOneShot:   p.IncludeOneShot,
		IncludeAutomated: p.IncludeAutomated,
		IncludeChildren:  p.IncludeChildren,
		Outcome:          p.Outcome,
		HealthGrade:      p.HealthGrade,
		Termination:      p.Termination,
		MinToolFailures:  p.MinToolFailures,
		Cursor:           p.Cursor,
		Limit:            p.Limit,
	}
}

type messageListParams struct {
	From      *int
	Limit     int
	Direction string
}

func (p messageListParams) serviceFilter() service.MessageFilter {
	return service.MessageFilter{
		From:      p.From,
		Limit:     p.Limit,
		Direction: p.Direction,
	}
}

func (p messageListParams) sourceFilter() source.MessageFilter {
	return source.MessageFilter{
		From:      p.From,
		Limit:     p.Limit,
		Direction: p.Direction,
	}
}

func parseSessionListParams(
	w http.ResponseWriter, r *http.Request, writeErr responseErrorWriter,
) (sessionListParams, bool) {
	q := r.URL.Query()

	limit, ok := parseIntParam(w, r, "limit")
	if !ok {
		return sessionListParams{}, false
	}
	limit = clampLimit(limit, db.DefaultSessionLimit, db.MaxSessionLimit)

	minMsgs, ok := parseIntParam(w, r, "min_messages")
	if !ok {
		return sessionListParams{}, false
	}
	maxMsgs, ok := parseIntParam(w, r, "max_messages")
	if !ok {
		return sessionListParams{}, false
	}
	minUserMsgs, ok := parseIntParam(w, r, "min_user_messages")
	if !ok {
		return sessionListParams{}, false
	}

	date := q.Get("date")
	dateFrom := q.Get("date_from")
	dateTo := q.Get("date_to")

	for _, d := range []string{date, dateFrom, dateTo} {
		if d != "" && !timeutil.IsValidDate(d) {
			writeErr(w, http.StatusBadRequest,
				"invalid date format: use YYYY-MM-DD")
			return sessionListParams{}, false
		}
	}
	if dateFrom != "" && dateTo != "" && dateFrom > dateTo {
		writeErr(w, http.StatusBadRequest,
			"date_from must not be after date_to")
		return sessionListParams{}, false
	}

	activeSince := q.Get("active_since")
	if activeSince != "" && !timeutil.IsValidTimestamp(activeSince) {
		writeErr(w, http.StatusBadRequest,
			"invalid active_since: use RFC3339 timestamp")
		return sessionListParams{}, false
	}

	params := sessionListParams{
		Project:          q.Get("project"),
		ExcludeProject:   q.Get("exclude_project"),
		Machine:          q.Get("machine"),
		Agent:            q.Get("agent"),
		Date:             date,
		DateFrom:         dateFrom,
		DateTo:           dateTo,
		ActiveSince:      activeSince,
		MinMessages:      minMsgs,
		MaxMessages:      maxMsgs,
		MinUserMessages:  minUserMsgs,
		IncludeOneShot:   q.Get("include_one_shot") == "true",
		IncludeAutomated: q.Get("include_automated") == "true",
		IncludeChildren:  q.Get("include_children") == "true",
		Outcome:          q.Get("outcome"),
		HealthGrade:      q.Get("health_grade"),
		Termination:      q.Get("termination"),
		Cursor:           q.Get("cursor"),
		Limit:            limit,
	}
	if v := q.Get("min_tool_failures"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			writeErr(w, http.StatusBadRequest,
				"invalid min_tool_failures parameter")
			return sessionListParams{}, false
		}
		params.MinToolFailures = &n
	}

	return params, true
}

func parseMessageListParams(
	w http.ResponseWriter, r *http.Request, writeErr responseErrorWriter,
) (messageListParams, bool) {
	limit, ok := parseIntParam(w, r, "limit")
	if !ok {
		return messageListParams{}, false
	}
	limit = clampLimit(limit, db.DefaultMessageLimit, db.MaxMessageLimit)

	direction := r.URL.Query().Get("direction")
	switch direction {
	case "", "asc", "desc":
	default:
		writeErr(w, http.StatusBadRequest,
			"invalid direction: must be asc or desc")
		return messageListParams{}, false
	}

	params := messageListParams{
		Limit:     limit,
		Direction: direction,
	}
	if r.URL.Query().Get("from") != "" {
		from, ok := parseIntParam(w, r, "from")
		if !ok {
			return messageListParams{}, false
		}
		params.From = &from
	}

	return params, true
}
