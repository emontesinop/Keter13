import fs from "node:fs";
import { config } from "../config";
import { MIGRATIONS } from "./migrations";

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}

export async function createDb(opts: { url?: string; dataDir?: string | null } = {}): Promise<Db> {
  const url = opts.url ?? config.databaseUrl;
  if (url) {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db: Db = {
      kind: "postgres",
      async query(sql, params = []) { return (await pool.query(sql, params as any[])).rows; },
      async one(sql, params = []) { return (await pool.query(sql, params as any[])).rows[0] ?? null; },
      async exec(sql) { await pool.query(sql); },
      async close() { await pool.end(); },
    };
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = opts.dataDir === null ? undefined : (opts.dataDir ?? config.dataDir + "/pg");
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const lite = dir ? new PGlite(dir) : new PGlite();
  await lite.waitReady;
  // serialize access: PGlite is single-connection
  let chain: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>) => { const p = chain.then(fn, fn); chain = p.catch(() => undefined); return p; };
  return {
    kind: "pglite",
    query: (sql, params = []) => run(async () => (await lite.query(sql, params as any[])).rows as any[]),
    one: (sql, params = []) => run(async () => ((await lite.query(sql, params as any[])).rows[0] as any) ?? null),
    exec: (sql) => run(async () => { await lite.exec(sql); }),
    close: () => run(() => lite.close()),
  };
}

export async function migrate(db: Db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id INT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ id: number }>("SELECT id FROM schema_migrations")).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.exec(`BEGIN; ${m.sql}; INSERT INTO schema_migrations(id, name) VALUES (${m.id}, '${m.name}'); COMMIT;`);
  }
}
