package mcp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"

	"github.com/sealjay/mcp-whatsapp/internal/client"
)

// jpegMagic is the minimum prefix (SOI + APP0 marker) that
// http.DetectContentType recognises as image/jpeg.
var jpegMagic = []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00}

// oggMagic is the "OggS" capture pattern for an Ogg container. The
// http.DetectContentType sniff table matches this even without a Vorbis /
// Opus payload following it.
var oggMagic = []byte("OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00")

// writeFile writes bytes to a fresh path under t.TempDir() and returns the
// absolute path. Fatals the test on any I/O error.
func writeFile(t *testing.T, name string, data []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return path
}

// firstText returns the Text field of the first content block, which the
// downloadMediaResult contract guarantees is a JSON summary.
func firstText(t *testing.T, res *mcp.CallToolResult) string {
	t.Helper()
	if len(res.Content) == 0 {
		t.Fatal("empty content")
	}
	txt, ok := res.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("content[0] should be TextContent, got %T", res.Content[0])
	}
	return txt.Text
}

// assertJSONSummary parses the first (text) content block and checks the
// key fields are what we expected. Any mismatch fatals — this is the
// backwards-compat contract with pre-inline callers.
func assertJSONSummary(t *testing.T, res *mcp.CallToolResult, want client.DownloadResult) {
	t.Helper()
	var got client.DownloadResult
	if err := json.Unmarshal([]byte(firstText(t, res)), &got); err != nil {
		t.Fatalf("summary is not JSON: %v (raw: %q)", err, firstText(t, res))
	}
	if got != want {
		t.Errorf("summary = %+v, want %+v", got, want)
	}
}

// TestDownloadMediaResult_ImageInlined: a successful image download whose
// file is on disk and under the size cap should yield two content blocks
// — the JSON summary and an ImageContent with base64 bytes.
func TestDownloadMediaResult_ImageInlined(t *testing.T) {
	path := writeFile(t, "img.jpg", jpegMagic)
	r := client.DownloadResult{
		Success:   true,
		Message:   "Successfully downloaded image media",
		MediaType: "image",
		Filename:  "img.jpg",
		Path:      path,
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 2 {
		t.Fatalf("expected 2 content blocks, got %d", len(res.Content))
	}
	assertJSONSummary(t, res, r)

	img, ok := res.Content[1].(mcp.ImageContent)
	if !ok {
		t.Fatalf("content[1] should be ImageContent, got %T", res.Content[1])
	}
	if img.MIMEType != "image/jpeg" {
		t.Errorf("MIMEType = %q, want image/jpeg", img.MIMEType)
	}
	decoded, err := base64.StdEncoding.DecodeString(img.Data)
	if err != nil {
		t.Fatalf("image data is not base64: %v", err)
	}
	if string(decoded) != string(jpegMagic) {
		t.Errorf("decoded bytes = %x, want %x", decoded, jpegMagic)
	}
}

// TestDownloadMediaResult_AudioInlined: successful audio download inlines
// bytes as AudioContent with the sniffed MIME.
func TestDownloadMediaResult_AudioInlined(t *testing.T) {
	path := writeFile(t, "voice.ogg", oggMagic)
	r := client.DownloadResult{
		Success:   true,
		Message:   "Successfully downloaded audio media",
		MediaType: "audio",
		Filename:  "voice.ogg",
		Path:      path,
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 2 {
		t.Fatalf("expected 2 content blocks, got %d", len(res.Content))
	}
	aud, ok := res.Content[1].(mcp.AudioContent)
	if !ok {
		t.Fatalf("content[1] should be AudioContent, got %T", res.Content[1])
	}
	if !strings.HasPrefix(aud.MIMEType, "audio/") {
		t.Errorf("MIMEType = %q, want audio/*", aud.MIMEType)
	}
}

// TestDownloadMediaResult_DocumentPathOnly: documents aren't renderable
// inline, so the result carries only the JSON summary. The caller still
// gets Path and can fetch the file out of band.
func TestDownloadMediaResult_DocumentPathOnly(t *testing.T) {
	path := writeFile(t, "spec.pdf", []byte("%PDF-1.4"))
	r := client.DownloadResult{
		Success:   true,
		Message:   "Successfully downloaded document media",
		MediaType: "document",
		Filename:  "spec.pdf",
		Path:      path,
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 1 {
		t.Fatalf("expected 1 content block (document is not inlined), got %d", len(res.Content))
	}
	assertJSONSummary(t, res, r)
}

// TestDownloadMediaResult_VideoPathOnly: same as document — not embedded,
// caller must fetch via Path.
func TestDownloadMediaResult_VideoPathOnly(t *testing.T) {
	path := writeFile(t, "clip.mp4", []byte{0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p'})
	r := client.DownloadResult{
		Success:   true,
		Message:   "Successfully downloaded video media",
		MediaType: "video",
		Filename:  "clip.mp4",
		Path:      path,
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 1 {
		t.Fatalf("expected 1 content block for video, got %d", len(res.Content))
	}
}

// TestDownloadMediaResult_FailurePathOnly: a failed download still returns
// a well-formed CallToolResult with the JSON error, and no inline attempt
// is made (there's no file to read).
func TestDownloadMediaResult_FailurePathOnly(t *testing.T) {
	r := client.DownloadResult{
		Success: false,
		Message: "failed to download media: download failed with status code 403",
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 1 {
		t.Fatalf("expected 1 content block on failure, got %d", len(res.Content))
	}
	assertJSONSummary(t, res, r)
}

// TestDownloadMediaResult_MissingFileFallsBack: if the daemon says success
// but the file has vanished (unlikely race), the tool still returns the
// JSON summary rather than propagating the read error.
func TestDownloadMediaResult_MissingFileFallsBack(t *testing.T) {
	r := client.DownloadResult{
		Success:   true,
		Message:   "Successfully downloaded image media",
		MediaType: "image",
		Filename:  "gone.jpg",
		Path:      filepath.Join(t.TempDir(), "does-not-exist.jpg"),
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 1 {
		t.Fatalf("expected 1 content block when file is missing, got %d", len(res.Content))
	}
}

// TestDownloadMediaResult_OversizedNotInlined: files above the inline cap
// stay reachable via Path but are NOT embedded. This protects the
// transport frame and the LLM context from multi-megabyte payloads.
func TestDownloadMediaResult_OversizedNotInlined(t *testing.T) {
	// One byte over the cap. Prefix with jpegMagic so http.DetectContentType
	// would return image/jpeg if we did read it — proving the size check is
	// what suppresses embedding, not the sniffer.
	oversized := make([]byte, inlineMediaMaxBytes+1)
	copy(oversized, jpegMagic)
	path := writeFile(t, "huge.jpg", oversized)

	r := client.DownloadResult{
		Success:   true,
		Message:   "Successfully downloaded image media",
		MediaType: "image",
		Filename:  "huge.jpg",
		Path:      path,
	}

	res, err := downloadMediaResult(r)
	if err != nil {
		t.Fatalf("downloadMediaResult: %v", err)
	}
	if len(res.Content) != 1 {
		t.Fatalf("expected 1 content block for oversized file, got %d", len(res.Content))
	}
}

func TestToolErrorWithFix(t *testing.T) {
	err := fmt.Errorf("field is invalid")
	constraint := "field must be a positive integer"
	fix := "pass count=10"

	res := ToolErrorWithFix(err, constraint, fix)
	if res == nil {
		t.Fatal("expected non-nil CallToolResult")
	}
	if !res.IsError {
		t.Error("expected IsError to be true")
	}
	if len(res.Content) == 0 {
		t.Fatal("expected non-empty content in result")
	}

	txt, ok := res.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("expected TextContent, got %T", res.Content[0])
	}

	if !strings.Contains(txt.Text, "Error: field is invalid") {
		t.Errorf("expected error message in text, got: %s", txt.Text)
	}
	if !strings.Contains(txt.Text, "Constraint failed: field must be a positive integer") {
		t.Errorf("expected constraint in text, got: %s", txt.Text)
	}
	if !strings.Contains(txt.Text, "Suggested fix: pass count=10") {
		t.Errorf("expected suggested fix in text, got: %s", txt.Text)
	}
}

func TestSendMessage_ArgValidation(t *testing.T) {
	s := NewServer(nil, nil)
	tool, ok := s.MCP().ListTools()["send_message"]
	if !ok || tool == nil || tool.Handler == nil {
		t.Fatal("send_message tool not registered")
	}

	cases := []struct {
		name         string
		args         map[string]any
		wantInErrMsg string
	}{
		{
			name:         "empty recipient",
			args:         map[string]any{"recipient": "", "message": "hello"},
			wantInErrMsg: "recipient must be a valid phone number",
		},
		{
			name:         "empty message body",
			args:         map[string]any{"recipient": "5213312345678", "message": ""},
			wantInErrMsg: "message body must be a non-empty string",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := mcp.CallToolRequest{}
			req.Params.Arguments = tc.args
			res, err := tool.Handler(context.Background(), req)
			if err != nil {
				t.Fatalf("handler returned error: %v", err)
			}
			if !res.IsError {
				t.Fatalf("args %v: want rejected (IsError: true), got %+v", tc.args, res)
			}
			txt, ok := res.Content[0].(mcp.TextContent)
			if !ok {
				t.Fatalf("content[0] is not TextContent: %T", res.Content[0])
			}
			if !strings.Contains(txt.Text, tc.wantInErrMsg) {
				t.Errorf("expected %q in error output, got %q", tc.wantInErrMsg, txt.Text)
			}
		})
	}
}
