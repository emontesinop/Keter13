# Testing

```bash
cd grandmaster
npm test            # core unit tests + server tests (API, engine, content verification)
npm run typecheck   # all workspaces
```

| Suite | What it covers |
|---|---|
| `packages/core/test/core.test.ts` (30) | eval model, classification thresholds, PGN/clock parsing, fingerprints, SEE/threats/pawn structure, motif geometry, grounded explanations, full game report, SM-2, rating statistics, plans, curriculum, repertoire legality & matching, master-game legality and stop positions, BM25 retrieval, calculation grading, LLM move guard |
| `apps/server/test/engine.test.ts` | UCI parsing, real Stockfish 18 mate detection with MultiPV, terminal positions |
| `apps/server/test/engine-content.test.ts` | **Every bundled puzzle** must have a unique winning first move and **every endgame drill** its stated result, verified by Stockfish 18 (this caught and fixed 4 flawed positions during development) |
| `apps/server/test/api.test.ts` | Auth, profile validation, PGN upload/dedupe, job-queue analysis with real Stockfish, explanations, Chess.com incremental sync (ETag, skipped variants), Lichess sync, OAuth PKCE with encrypted tokens and state replay protection, 429 back-off, coach in engine mode and with an LLM (hallucination retry), Socratic endpoints, SRS, diagnostics, separated rating pools, export/deletion |
| `apps/server/test/postgres.test.ts` | Migrations on a real PostgreSQL server (`TEST_DATABASE_URL=postgres://… npm test -w @gm/server`) |

External APIs are not called in tests: Chess.com and Lichess are replaced by fakes that follow the documented response
shapes. Live calls could not be exercised from the development sandbox (network policy), so the first real sync should be
watched in Settings → Integrations (errors are shown per account).

Manual end-to-end check (performed with Playwright, iPhone 13 viewport): login → upload PGN → background analysis →
report → analysis board with browser Stockfish → tactics from own mistakes → coach answer → drag-and-drop move.
