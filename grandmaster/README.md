# Grandmaster AI — Personal Chess Coach & Performance System

A mobile-first chess training system that connects **your real games → identified weaknesses → personalised training → measurable improvement**.
Spanish is the primary language; English is fully supported.

> Honest scope: software cannot guarantee a rating or a FIDE title. The app maximises the quality and focus of your
> training; online ratings, FIDE ratings and estimated playing strength are always shown separately.

## What works today

| Area | Status |
|---|---|
| Accounts, secure sessions, editable profile (1650 → 2000+, London / Caro-Kann, 60 min/day, ES/EN) | ✅ |
| Interactive board: drag & tap, legal moves, promotion, arrows, eval bar, FEN/PGN, variation tree, undo/redo, position editor, orientation, coordinates | ✅ |
| **Stockfish 18** in the browser (WASM Web Worker, MultiPV, live arrows) and on the server (bundled WASM or native binary, UCI, cache, background queue) | ✅ |
| Full game analysis: per-move best move, eval before/after, centipawn & win% loss, configurable classification, phases, critical moments, top-3 mistakes, missed opportunities & defences, tactical vs strategic errors, time management from `[%clk]`, repertoire deviations, lessons, exercises generated from your mistakes | ✅ |
| **"Why" explanations** grounded in the board (ignored threats, loose pieces, refutation line, motifs, pawn structure, king safety, activity, outposts, material comparison) | ✅ |
| Chess.com (official Published-Data API): profile, ratings, monthly archives, incremental sync with ETag, dedupe | ✅ (tested with recorded API shapes) |
| Lichess: public connect, OAuth PKCE (encrypted token), games (ndjson, incremental), rating history, study import, opening explorer & Syzygy tablebase proxies | ✅ (tested with recorded API shapes) |
| PGN upload (multi-game files, colour detection, dedupe) | ✅ |
| AI Grandmaster Coach: 7 modes, Socratic guided analysis, RAG over the knowledge base, persistent memory, engine-verified context, **hallucinated-move guard** (retry + disclosure), works without an LLM in verified "engine mode" | ✅ |
| Tactics lab: own-game exercises, curated & engine-verified puzzles, Lichess CC0 importer, SRS review, weakness hunter, GM challenge, blunder prevention, **calculation without moving** (graded by Stockfish) | ✅ |
| Opening lab: London & Caro-Kann trees with ideas/plans/structures/mistakes, drill mode, explorer, your real per-line results & deviations | ✅ |
| Endgame lab: theoretical drills (engine-verified), play vs Stockfish, hints, per-move Syzygy comparison (≤7 pieces) | ✅ |
| Master games: public-domain classics, stops at critical moments, "what would you play?" + reasoning + engine comparison | ✅ |
| Analytics: ratings per pool (7d…all), EWMA smoothing, volatility, significance-tested trends, performance-rating estimate with 95% CI, accuracy, error rates, phases, openings, training, weekly coach report | ✅ |
| Adaptive daily plan, weekly themes, recovery days, streaks, staged curriculum, milestone diagnostics, GM roadmap | ✅ |
| Play modes: tournament simulation (clock + auto-analysis), opening survival, play-against-yourself, blunder-prevention toggle | ✅ |
| Data export & account deletion | ✅ |

See [docs/ROADMAP.md](docs/ROADMAP.md) for what is pending.

## Quick start (local)

Requirements: **Node.js ≥ 20.12** (22 recommended). Nothing else is required — the database is embedded (PGlite) and Stockfish 18 is bundled.

```bash
cd grandmaster
cp .env.example .env          # optional for local use; set JWT_SECRET / TOKEN_ENC_KEY before exposing it
npm install
npm start                     # builds the web app and serves everything on http://localhost:8787
```

Development mode with hot reload (web on :5173 proxying the API on :8787):

```bash
npm run dev
```

### Use it on your iPhone

1. Find your computer's LAN IP (macOS: `ipconfig getifaddr en0`).
2. In `.env` set `PUBLIC_URL=http://<LAN-IP>:8787`, then `npm start`.
3. On the iPhone (same Wi-Fi) open Safari at `http://<LAN-IP>:8787`.
4. Share → **Add to Home Screen**: it runs full-screen like a native app.

To use it away from home, deploy it (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) behind HTTPS.

## What you need to provide

| Item | Needed for | Where |
|---|---|---|
| Nothing | Engine analysis, training, PGN import, Chess.com/Lichess public import, engine-mode coach | — |
| `ANTHROPIC_API_KEY` (or an OpenAI-compatible endpoint) | Conversational AI coach | console.anthropic.com |
| Your Chess.com username + a contact in `CHESSCOM_USER_AGENT` | Chess.com import (public data, no password) | Settings → Chess.com |
| Lichess login (OAuth button) | Private studies, opening explorer (Lichess requires login for the explorer API) | Settings → Lichess |
| `JWT_SECRET`, `TOKEN_ENC_KEY` | Any deployment reachable by others | `openssl rand -hex 32` |
| Native Stockfish (optional) | Faster/deeper server analysis | `STOCKFISH_PATH` |
| FIDE rating (manual) | FIDE tracking — FIDE offers no public API for this | Settings |

## Repository layout

```
grandmaster/
  packages/core   @gm/core — chess intelligence (pure TypeScript, shared by server & web)
  apps/server     @gm/server — Fastify API, Postgres/PGlite, Stockfish worker, integrations, AI coach
  apps/web        @gm/web — React PWA (mobile-first), Stockfish WASM worker
  docs/           architecture, methodology, testing, deployment, roadmap
```

Docs: [Architecture](docs/ARCHITECTURE.md) · [Training methodology](docs/METHODOLOGY.md) · [Testing](docs/TESTING.md) · [Deployment](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md)

## Licences

Stockfish (GPL-3.0) is bundled as a separate program; piece images are the "cburnett" set (CC BY-SA 3.0).
Because Stockfish is GPL, if you distribute this app publicly, distribute it under GPL-3.0-compatible terms.
Master games are 19th-century public-domain games; all annotations, explanations and puzzles are original.
