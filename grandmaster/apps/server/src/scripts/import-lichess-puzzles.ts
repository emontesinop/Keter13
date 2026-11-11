/**
 * Import puzzles from the Lichess puzzle database (CC0 — https://database.lichess.org/#puzzles).
 * Usage: download & decompress lichess_db_puzzle.csv.zst, then
 *   npm run import:puzzles -w @gm/server -- /path/to/lichess_db_puzzle.csv [maxRows] [minRating] [maxRating]
 * Puzzles are stored as global exercises (available to every user) and served near each user's level.
 */
import fs from "node:fs";
import readline from "node:readline";
import { parseLichessPuzzleCsv } from "@gm/core";
import { createDb, migrate } from "../db";

const [file, maxRows = "20000", minR = "1200", maxR = "2600"] = process.argv.slice(2);
if (!file) { console.error("Usage: import-lichess-puzzles <csv> [maxRows] [minRating] [maxRating]"); process.exit(1); }
const db = await createDb();
await migrate(db);
const rl = readline.createInterface({ input: fs.createReadStream(file) });
let n = 0, seen = 0;
for await (const line of rl) {
  seen++;
  const p = parseLichessPuzzleCsv(line);
  if (!p || p.rating < Number(minR) || p.rating > Number(maxR)) continue;
  const exists = await db.one("SELECT 1 FROM exercises WHERE user_id IS NULL AND source='lichess_cc0' AND source_ref=$1", [p.id]);
  if (exists) continue;
  await db.query("INSERT INTO exercises(user_id, kind, domain, fen, solution, motifs, rating, source, source_ref) VALUES (NULL,'puzzle','tactics',$1,$2,$3,$4,'lichess_cc0',$5)",
    [p.fen, JSON.stringify(p.solution), JSON.stringify(p.motifs), p.rating, p.id]);
  if (++n >= Number(maxRows)) break;
  if (n % 1000 === 0) console.log(`${n} imported (${seen} rows read)`);
}
console.log(`Done: ${n} puzzles imported.`);
await db.close();
