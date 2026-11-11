import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Load grandmaster/.env if present (Node ≥ 20.12). Real environment variables take precedence.
for (const f of [path.resolve(here, "../../../.env"), path.resolve(process.cwd(), ".env")]) {
  try { (process as any).loadEnvFile?.(f); break; } catch { /* no .env file */ }
}
const env = (k: string, d?: string) => process.env[k] ?? d;

export const config = {
  port: Number(env("PORT", "8787")),
  host: env("HOST", "0.0.0.0")!,
  publicUrl: env("PUBLIC_URL", "http://localhost:8787")!,
  corsOrigin: env("CORS_ORIGIN", "http://localhost:5173")!,
  /** If unset, an embedded PostgreSQL (PGlite) database is stored in DATA_DIR. */
  databaseUrl: env("DATABASE_URL"),
  dataDir: env("DATA_DIR", path.resolve(here, "../../../.data"))!,
  jwtSecret: env("JWT_SECRET", "dev-only-insecure-secret-change-me")!,
  /** 32-byte key, base64 or hex, used to encrypt OAuth tokens at rest. */
  tokenEncKey: env("TOKEN_ENC_KEY"),
  llm: {
    provider: env("LLM_PROVIDER", process.env.ANTHROPIC_API_KEY ? "anthropic" : "none") as "anthropic" | "openai_compatible" | "none",
    anthropicModel: env("ANTHROPIC_MODEL", "claude-opus-5-5")!,
    anthropicEffort: env("ANTHROPIC_EFFORT", "high") as "low" | "medium" | "high" | "xhigh" | "max",
    openaiBaseUrl: env("OPENAI_COMPAT_BASE_URL"),
    openaiApiKey: env("OPENAI_COMPAT_API_KEY"),
    openaiModel: env("OPENAI_COMPAT_MODEL"),
  },
  engine: {
    /** Native Stockfish binary (recommended for deep analysis). Falls back to the bundled Stockfish 18 WASM build. */
    path: env("STOCKFISH_PATH"),
    flavor: env("STOCKFISH_WASM_FLAVOR", "lite-single") as "lite-single" | "single",
    depth: Number(env("ENGINE_DEPTH", "16")),
    poolSize: Number(env("ENGINE_POOL", "1")),
    threads: Number(env("ENGINE_THREADS", "1")),
    hashMb: Number(env("ENGINE_HASH_MB", "64")),
  },
  chesscom: {
    /** Chess.com asks API clients to identify themselves; put a contact in this header. */
    userAgent: env("CHESSCOM_USER_AGENT", "GrandmasterAI/0.1 (personal chess training app)")!,
  },
  lichess: {
    clientId: env("LICHESS_CLIENT_ID", "grandmaster-ai")!,
    host: env("LICHESS_HOST", "https://lichess.org")!,
    explorerHost: env("LICHESS_EXPLORER_HOST", "https://explorer.lichess.ovh")!,
    tablebaseHost: env("LICHESS_TABLEBASE_HOST", "https://tablebase.lichess.ovh")!,
  },
  webDist: env("WEB_DIST", path.resolve(here, "../../web/dist"))!,
  workerEnabled: env("ANALYSIS_WORKER", "on") !== "off",
  syncIntervalMinutes: Number(env("SYNC_INTERVAL_MINUTES", "0")),
};

export function assertProductionSecrets() {
  if (process.env.NODE_ENV === "production") {
    if (config.jwtSecret.startsWith("dev-only")) throw new Error("Set JWT_SECRET in production");
    if (!config.tokenEncKey) throw new Error("Set TOKEN_ENC_KEY in production");
  }
}
