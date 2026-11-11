import { describe, it, expect } from "vitest";
import { createDb, migrate } from "../src/db";

// Runs only when TEST_DATABASE_URL points at a real PostgreSQL server.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL backend", () => {
  it("applies migrations idempotently and round-trips JSONB", async () => {
    const db = await createDb({ url });
    await migrate(db); await migrate(db);
    const u = await db.one<{ id: string }>("INSERT INTO users(email, password_hash) VALUES ($1,'x') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id", ["pg@test.dev"]);
    await db.query("INSERT INTO profiles(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [u!.id]);
    const p = await db.one<any>("SELECT thresholds FROM profiles WHERE user_id=$1", [u!.id]);
    expect(p.thresholds.blunder).toBe(15);
    await db.query("DELETE FROM users WHERE id=$1", [u!.id]);
    await db.close();
  });
});
