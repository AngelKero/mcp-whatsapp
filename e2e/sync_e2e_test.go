//go:build e2e

package e2e

import (
	"strings"
	"testing"
)

// Offline-safe: all cases return before any WhatsApp network call.

func TestRequestSyncRequiresChatJID(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("request_sync", map[string]any{})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "chat_jid: required") {
		t.Fatalf("error should mention chat_jid: required, got %q", res.Text)
	}
}

func TestRequestSyncRejectsBadAnchor(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("request_sync", map[string]any{
		"chat_jid": "00000000@s.whatsapp.net",
		"anchor":   "middle",
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "anchor") {
		t.Fatalf("error should mention anchor, got %q", res.Text)
	}
}

func TestRequestSyncRejectsNegativeCount(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("request_sync", map[string]any{
		"chat_jid": "00000000@s.whatsapp.net",
		"count":    -1,
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "must not be negative") {
		t.Fatalf("error should mention must not be negative, got %q", res.Text)
	}
}

func TestRequestSyncRejectsBadTimestamp(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("request_sync", map[string]any{
		"chat_jid":       "00000000@s.whatsapp.net",
		"from_timestamp": "not-a-date",
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "invalid from_timestamp") {
		t.Fatalf("error should mention invalid from_timestamp, got %q", res.Text)
	}
}
