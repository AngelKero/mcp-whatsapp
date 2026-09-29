const assert = require('assert');

// Test AntiEchoTracker
class AntiEchoTracker {
  constructor(ttlMs = 5 * 60 * 1000, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.signatures = new Map();
  }

  static computeSignature(text) {
    if (!text) return null;
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!normalized) return null;

    let hash = 2166136261;
    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${normalized.length}:${(hash >>> 0).toString(36)}`;
  }

  remember(text) {
    const sig = AntiEchoTracker.computeSignature(text);
    if (!sig) return;
    const now = Date.now();
    this.signatures.set(sig, now);
  }

  consume(text) {
    const sig = AntiEchoTracker.computeSignature(text);
    if (!sig) return false;
    const sentAt = this.signatures.get(sig);
    if (!sentAt) return false;
    const now = Date.now();
    this.signatures.delete(sig);
    return (now - sentAt) <= this.ttlMs;
  }
}

const tracker = new AntiEchoTracker();

// 1. Exact match
const original = "¡Hola Angel! Aquí andamos con todo :3";
tracker.remember(original);
assert.strictEqual(tracker.consume(original), true, "Debe consumir el texto exacto");
assert.strictEqual(tracker.consume(original), false, "No debe consumir dos veces");

// 2. Formatting variation (CRLF, extra spaces, casing)
const multiline = "Línea 1\r\nLínea 2   con   espacios";
tracker.remember(multiline);
const echoedByWhatsApp = "Línea 1\nLínea 2 con espacios";
assert.strictEqual(tracker.consume(echoedByWhatsApp), true, "Debe detectar variaciones normalizadas de WhatsApp");

// 3. User message should not be falsely consumed if not remembered
assert.strictEqual(tracker.consume("Un mensaje nuevo de Angel"), false, "Mensajes no recordados no son ecos");

console.log("✅ AntiEchoTracker unit tests passed successfully!");
