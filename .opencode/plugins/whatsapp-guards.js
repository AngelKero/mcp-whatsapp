// whatsapp-guards OpenCode plugin
// Equivalente a hooks de Claude Code (PreToolUse / PostToolUse):
// - Pre: bloquea Edit/Write a secretos y DBs (constraint + fix).
// - Post: gofmt -w automático en .go editados.
// Antigravity: este repo también expone reglas espejo en .agents/rules/;
// este plugin es la enforcement para opencode.

const BLOCKED_PATTERNS = [
  /\.env(\.|$)/,
  /store\/.*\.db$/,
  /store\/\.lock$/,
  /\.qr\.png$/,
  /whatsapp\.db-wal$/,
  /whatsapp\.db-shm$/,
  /messages\.db-wal$/,
  /messages\.db-shm$/,
];

function pickPath(args) {
  if (!args || typeof args !== "object") return null;
  return (
    args.filePath ||
    args.path ||
    args.file ||
    args.target ||
    null
  );
}

export const WhatsAppGuardsPlugin = async ({ $ }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const tool = input?.tool || "";
      if (tool !== "edit" && tool !== "write") return;
      const p = pickPath(output?.args) || pickPath(input?.args);
      if (!p) return;
      const s = String(p);
      if (BLOCKED_PATTERNS.some((re) => re.test(s))) {
        throw new Error(
          `Bloqueado por whatsapp-guards: no editar ${s}. ` +
            `Constraint: secretos/DBs/locks nunca se editan directo ` +
            `(AGENTS.md). Fix: usa login/serve para regenerar, ` +
            `o borra el archivo y deja que se recree; para .env edita manual fuera del agente.`
        );
      }
    },

    "tool.execute.after": async (input) => {
      const tool = input?.tool || "";
      if (tool !== "edit" && tool !== "write") return;
      const p = pickPath(input?.args);
      if (!p || !String(p).endsWith(".go")) return;
      try {
        await $`gofmt -w ${String(p)}`;
      } catch {
        // gofmt ausente o archivo borrado: no romper la sesión, solo skip.
      }
    },
  };
};

export default WhatsAppGuardsPlugin;
