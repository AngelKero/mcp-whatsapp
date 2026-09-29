//go:build e2e

package e2e

import (
	"testing"
)

// Locks the device-suffixed LID fix (#41) at the MCP surface: LID-form JIDs
// must flow through normalization without errors, even on an empty store.
// Offline-safe: read-only store queries, no WhatsApp connection needed.

func TestListMessagesDeviceSuffixedLID(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("list_messages", map[string]any{
		"chat_jid": "123456789012345:12@lid",
		"limit":    5,
	})
	if res.IsError {
		t.Fatalf("device-suffixed LID should not error, got: %q", res.Text)
	}
}

func TestListMessagesBareLIDMatchesSuffixed(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	bare := h.callTool("list_messages", map[string]any{
		"chat_jid": "123456789012345@lid",
		"limit":    5,
	})
	if bare.IsError {
		t.Fatalf("bare LID should not error, got: %q", bare.Text)
	}
	suffixed := h.callTool("list_messages", map[string]any{
		"chat_jid": "123456789012345:7@lid",
		"limit":    5,
	})
	if suffixed.IsError {
		t.Fatalf("suffixed LID should not error, got: %q", suffixed.Text)
	}
	if bare.Text != suffixed.Text {
		t.Fatalf("bare and suffixed LID should normalize alike, got %q vs %q", bare.Text, suffixed.Text)
	}
}

func TestListMessagesLIDSenderFilter(t *testing.T) {
	h := newHarness(t)
	h.initializeMCP()

	res := h.callTool("list_messages", map[string]any{
		"sender_phone_number": "123456789012345@lid",
		"limit":               5,
	})
	if res.IsError {
		t.Fatalf("LID sender filter should not error, got: %q", res.Text)
	}
}
