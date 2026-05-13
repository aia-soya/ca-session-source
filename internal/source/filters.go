package source

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/timeutil"
)

func validateSessionFilter(f SessionFilter) error {
	for _, d := range []string{f.Date, f.DateFrom, f.DateTo} {
		if d != "" && !timeutil.IsValidDate(d) {
			return fmt.Errorf(
				"list: invalid date %q: use YYYY-MM-DD", d,
			)
		}
	}
	if f.DateFrom != "" && f.DateTo != "" && f.DateFrom > f.DateTo {
		return errors.New("list: date_from must not be after date_to")
	}
	if f.ActiveSince != "" && !timeutil.IsValidTimestamp(f.ActiveSince) {
		return fmt.Errorf(
			"list: invalid active_since %q: use RFC3339", f.ActiveSince,
		)
	}
	if f.Limit > db.MaxSessionLimit {
		f.Limit = db.MaxSessionLimit
	}
	return nil
}

func sessionFilterToDB(f SessionFilter) db.SessionFilter {
	limit := f.Limit
	if limit > db.MaxSessionLimit {
		limit = db.MaxSessionLimit
	}
	if limit <= 0 {
		limit = db.DefaultSessionLimit
	}

	filter := db.SessionFilter{
		Project:          f.Project,
		ExcludeProject:   f.ExcludeProject,
		Machine:          f.Machine,
		Agent:            f.Agent,
		Date:             f.Date,
		DateFrom:         f.DateFrom,
		DateTo:           f.DateTo,
		ActiveSince:      f.ActiveSince,
		MinMessages:      f.MinMessages,
		MaxMessages:      f.MaxMessages,
		MinUserMessages:  f.MinUserMessages,
		ExcludeOneShot:   !f.IncludeOneShot,
		ExcludeAutomated: !f.IncludeAutomated,
		IncludeChildren:  f.IncludeChildren,
		MinToolFailures:  f.MinToolFailures,
		Cursor:           f.Cursor,
		Limit:            limit,
		Termination:      f.Termination,
	}
	if f.Outcome != "" {
		filter.Outcome = strings.Split(f.Outcome, ",")
	}
	if f.HealthGrade != "" {
		filter.HealthGrade = strings.Split(f.HealthGrade, ",")
	}
	return filter
}

func normalizeMessageFilter(
	f MessageFilter,
) (from int, limit int, asc bool, err error) {
	switch f.Direction {
	case "", "asc", "desc":
	default:
		return 0, 0, false, fmt.Errorf(
			"messages: invalid direction %q: must be asc or desc",
			f.Direction,
		)
	}

	asc = f.Direction != "desc"
	limit = f.Limit
	if limit <= 0 {
		limit = db.DefaultMessageLimit
	}
	if limit > db.MaxMessageLimit {
		limit = db.MaxMessageLimit
	}

	switch {
	case f.From != nil:
		from = *f.From
	case !asc:
		from = math.MaxInt32
	}

	return from, limit, asc, nil
}
