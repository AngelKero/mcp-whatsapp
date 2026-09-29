//go:build e2e

package e2e

import (
	"strings"
	"testing"
)

// Offline-safe: validation runs before any WhatsApp network call, so these
// exercise the MCP surface without a paired session.

func TestSendPollRejectsSingleOption(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("send_poll", map[string]any{
		"recipient": "00000000@s.whatsapp.net",
		"question":  "q?",
		"options":   []string{"solo"},
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "at least 2") {
		t.Fatalf("error should mention at least 2, got %q", res.Text)
	}
}

func TestSendPollRejectsTooManyOptions(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	opts := make([]string, 33)
	for i := range opts {
		opts[i] = "opt"
	}
	res := h.callTool("send_poll", map[string]any{
		"recipient": "00000000@s.whatsapp.net",
		"question":  "q?",
		"options":   opts,
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "max 32") {
		t.Fatalf("error should mention max 32, got %q", res.Text)
	}
}

func TestSendPollRejectsEmptyQuestion(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("send_poll", map[string]any{
		"recipient": "00000000@s.whatsapp.net",
		"question":  "",
		"options":   []string{"a", "b"},
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "question") {
		t.Fatalf("error should mention question, got %q", res.Text)
	}
}

func TestSendPollVoteRejectsEmptyOptions(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("send_poll_vote", map[string]any{
		"chat_jid":        "00000000@s.whatsapp.net",
		"poll_message_id": "nope",
		"options":         []string{},
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "options: required") {
		t.Fatalf("error should mention options: required, got %q", res.Text)
	}
}

func TestGetPollResultsUnknownPoll(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("get_poll_results", map[string]any{
		"chat_jid":        "00000000@s.whatsapp.net",
		"poll_message_id": "does-not-exist",
	})
	if !res.IsError {
		t.Fatalf("expected error result, got success: %+v", res)
	}
	if !strings.Contains(res.Text, "not found in cache") {
		t.Fatalf("error should mention not found in cache, got %q", res.Text)
	}
}
