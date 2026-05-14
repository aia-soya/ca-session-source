package server

import (
	"errors"
	"net/http"

	"github.com/wesm/agentsview/internal/db"
	"github.com/wesm/agentsview/internal/source"
	"github.com/wesm/agentsview/internal/sourceapi"
)

func (s *Server) handleSourceListSessions(
	w http.ResponseWriter, r *http.Request,
) {
	params, ok := parseSessionListParams(w, r, writeSourceError)
	if !ok {
		return
	}

	page, err := s.sourceService().ListSessions(r.Context(), params.sourceFilter())
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		if errors.Is(err, db.ErrInvalidCursor) {
			writeSourceError(w, http.StatusBadRequest, "invalid cursor")
			return
		}
		writeSourceError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, sourceapi.NewSessionPageResponse(page))
}

func (s *Server) handleSourceGetSession(
	w http.ResponseWriter, r *http.Request,
) {
	session, err := s.sourceService().GetSession(r.Context(), r.PathValue("id"))
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeSourceError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if session == nil {
		writeSourceError(w, http.StatusNotFound, "session not found")
		return
	}

	writeJSON(w, http.StatusOK, sourceapi.NewSessionResponse(*session))
}

func (s *Server) handleSourceGetMessages(
	w http.ResponseWriter, r *http.Request,
) {
	params, ok := parseMessageListParams(w, r, writeSourceError)
	if !ok {
		return
	}

	page, err := s.sourceService().GetMessages(
		r.Context(), r.PathValue("id"), params.sourceFilter(),
	)
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeSourceError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, sourceapi.NewMessagePageResponse(page))
}

func (s *Server) handleSourceToolCalls(
	w http.ResponseWriter, r *http.Request,
) {
	calls, err := s.sourceService().GetToolCalls(r.Context(), r.PathValue("id"))
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeSourceError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, sourceapi.NewToolCallsResponse(calls))
}

func (s *Server) handleSourceVersion(
	w http.ResponseWriter, _ *http.Request,
) {
	writeJSON(w, http.StatusOK, sourceapi.VersionResponse{
		SchemaVersion: sourceapi.SchemaVersion,
		Version:       s.version.Version,
		Commit:        s.version.Commit,
		BuildDate:     s.version.BuildDate,
		ReadOnly:      s.version.ReadOnly,
	})
}

func (s *Server) handleSourceHealth(
	w http.ResponseWriter, _ *http.Request,
) {
	writeJSON(w, http.StatusOK, sourceapi.HealthResponse{
		SchemaVersion:        sourceapi.SchemaVersion,
		Status:               "ok",
		ReadOnly:             s.version.ReadOnly,
		EventStreamAvailable: s.sourceEvents != nil,
	})
}

func (s *Server) sourceService() source.Service {
	return source.NewAgentsViewStoreService(s.db, nil)
}

func writeSourceError(
	w http.ResponseWriter, status int, msg string,
) {
	writeJSON(w, status, sourceapi.NewErrorResponse(msg))
}
