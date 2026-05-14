package server

import (
	"errors"
	"net/http"

	"github.com/wesm/agentsview/internal/db"
)

func (s *Server) handleListSessions(
	w http.ResponseWriter, r *http.Request,
) {
	params, ok := parseSessionListParams(w, r, writeError)
	if !ok {
		return
	}

	page, err := s.sessions.List(r.Context(), params.serviceFilter())
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		if errors.Is(err, db.ErrInvalidCursor) {
			writeError(w, http.StatusBadRequest, "invalid cursor")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, page)
}

func (s *Server) handleGetSession(
	w http.ResponseWriter, r *http.Request,
) {
	id := r.PathValue("id")
	detail, err := s.sessions.Get(r.Context(), id)
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if detail == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleGetChildSessions(
	w http.ResponseWriter, r *http.Request,
) {
	id := r.PathValue("id")
	children, err := s.db.GetChildSessions(r.Context(), id)
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if children == nil {
		children = []db.Session{}
	}
	writeJSON(w, http.StatusOK, children)
}

// handleSearchSession handles GET /api/v1/sessions/{id}/search?q=...
// Returns matching message ordinals in document order.
func (s *Server) handleSearchSession(
	w http.ResponseWriter, r *http.Request,
) {
	id := r.PathValue("id")
	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSON(w, http.StatusOK, map[string]any{"ordinals": []int{}})
		return
	}
	ordinals, err := s.db.SearchSession(r.Context(), id, q)
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ordinals == nil {
		ordinals = []int{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ordinals": ordinals})
}
