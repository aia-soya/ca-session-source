package server

import (
	"net/http"
)

func (s *Server) handleGetMessages(
	w http.ResponseWriter, r *http.Request,
) {
	sessionID := r.PathValue("id")

	params, ok := parseMessageListParams(w, r, writeError)
	if !ok {
		return
	}

	list, err := s.sessions.Messages(r.Context(), sessionID, params.serviceFilter())
	if err != nil {
		if handleContextError(w, err) {
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, list)
}
