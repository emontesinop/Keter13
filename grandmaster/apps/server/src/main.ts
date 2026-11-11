import { config, assertProductionSecrets } from "./config";
import { createDb, migrate } from "./db";
import { EnginePool } from "./engine/uci";
import { createLlmProvider } from "./llm/provider";
import { buildApp } from "./app";
import { startAnalysisWorker } from "./services/analysis";
import { seedGlobalContent } from "./services/training";
import { syncChessCom } from "./integrations/chesscom";
import { syncLichess } from "./integrations/lichess";

assertProductionSecrets();
const db = await createDb();
await migrate(db);
await seedGlobalContent(db);
const engine = new EnginePool();
const llm = createLlmProvider();
const ctx = { db, engine, llm };
const app = await buildApp(ctx, { logger: true });
if (config.workerEnabled) startAnalysisWorker(ctx);

// Scheduled synchronisation for users who chose hourly/daily (runs every 10 minutes, one account at a time).
setInterval(async () => {
  const due = await db.query<any>(`SELECT a.user_id, a.platform, a.username FROM accounts a JOIN profiles p ON p.user_id=a.user_id
    WHERE p.sync_frequency <> 'manual' AND a.status <> 'syncing' AND (a.last_sync_at IS NULL OR a.last_sync_at < now() - (CASE p.sync_frequency WHEN 'hourly' THEN interval '1 hour' ELSE interval '1 day' END))`);
  for (const a of due) {
    try { a.platform === "chesscom" ? await syncChessCom(db, a.user_id, a.username) : await syncLichess(db, a.user_id); }
    catch (e) { await db.query("UPDATE accounts SET last_error=$3 WHERE user_id=$1 AND platform=$2", [a.user_id, a.platform, (e as Error).message]); }
  }
}, 10 * 60 * 1000);

await app.listen({ port: config.port, host: config.host });
app.log.info(`Grandmaster AI server on ${config.publicUrl} — DB: ${db.kind}, engine: ${engine.label}, LLM: ${llm.available ? llm.name : "none (grounded mode)"}`);
const shutdown = async () => { await app.close(); await engine.quit(); await db.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
