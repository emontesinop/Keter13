# Architecture

```
 iPhone / Android / desktop browser (PWA)
 ┌──────────────────────────────────────────────┐
 │ React + TypeScript (apps/web)                │
 │  • custom board (pointer events, SVG arrows) │
 │  • Stockfish 18 lite WASM in a Web Worker    │──── live analysis, play vs engine, hints
 │  • @gm/core (rules, motifs, grading)         │
 └───────────────┬──────────────────────────────┘
                 │ /api (cookie session or Bearer JWT)
 ┌───────────────▼──────────────────────────────┐
 │ Fastify API (apps/server)                    │
 │  auth · profile · games · analysis jobs      │
 │  coach (LLM + RAG + memory + move guard)     │
 │  training (SRS, plan, diagnostics)           │
 │  analytics · integrations · data rights      │
 ├──────────────┬───────────────┬───────────────┤
 │ UCI engine   │ PostgreSQL /  │ LLM provider  │
 │ pool (SF 18  │ Supabase or   │ (Anthropic or │
 │ WASM/native) │ embedded      │ OpenAI-compat)│
 │ + FEN cache  │ PGlite        │ server-side   │
 └──────────────┴───────────────┴───────────────┘
        ▲                ▲
  Chess.com Published-Data API · Lichess API (OAuth PKCE) · Lichess explorer & Syzygy tablebase
```

## Key decisions

**PWA instead of React Native/Expo.** The brief preferred Expo "or an equally suitable cross-platform architecture".
A PWA was chosen because (1) Stockfish's WASM build runs natively in a browser Web Worker but not in React Native's
Hermes runtime (it would need a WebView bridge or a native module per platform), (2) it installs on iPhone from Safari
with no App Store/TestFlight step, and (3) one codebase serves phone, tablet and desktop. The UI is strictly mobile-first
(bottom tab bar, safe areas, touch drag). If App Store distribution is wanted later, the same build can be wrapped with
Capacitor (see ROADMAP). `@gm/core` is framework-free and could be reused by an Expo app unchanged.

**Shared chess intelligence (`@gm/core`).** All chess logic — evaluation model, classification, motif detection,
explanations, reports, SRS, plan generation, ratings statistics, repertoire matching, calculation grading, the LLM
hallucination guard — is pure TypeScript with unit tests. Server and browser use the same code.

**Engine-grounded AI.** The LLM never sees a position without a *verified facts* block (legal moves, threats, loose
pieces, pawn structure, king safety, Stockfish lines). After it answers, every SAN token is checked against the legal
moves and the verified lines; unverified moves trigger one self-correction round, and anything still unverified is
disclosed to the user. Without an LLM the coach still answers from engine + board facts ("engine mode").

**Database.** SQL migrations target PostgreSQL 14+. If `DATABASE_URL` is unset, the server uses PGlite (PostgreSQL
compiled to WASM) on disk, so a personal install needs zero setup; Supabase works by setting `DATABASE_URL`.

**Analysis pipeline.** `POST /games/:id/analyze` enqueues a job; a background worker analyses every position
(cached by FEN+depth+MultiPV), builds the report with `@gm/core`, stores error records (for weakness detection) and
creates SRS exercises from the student's own mistakes. Interrupted jobs are re-queued at startup.

**Integrations.** Requests are serialised per client and back off on HTTP 429. Chess.com: completed monthly archives
are downloaded once, the current month is re-checked with `If-None-Match`. Lichess: `since` cursor on the games
export. Games are deduplicated by platform id and by a normalised PGN fingerprint.

## Data model (tables)

`users`, `profiles` (all coaching parameters incl. thresholds), `accounts` (platform links, encrypted OAuth tokens,
sync cursors), `games`, `analyses` (JSONB report), `analysis_jobs`, `engine_cache`, `error_records`, `rating_points`
(one row per pool/time — pools never mixed), `exercises` (global + per-user), `srs_cards`, `training_attempts`,
`training_sessions`, `coach_messages`, `coach_memory`, `oauth_states`. See `apps/server/src/db/migrations.ts`.

## Security

* Passwords: scrypt (N=2¹⁵). Sessions: HS256 JWT in an httpOnly SameSite=Lax cookie (Secure when served over HTTPS).
* OAuth tokens encrypted at rest with AES-256-GCM (`TOKEN_ENC_KEY`); never returned by the API or the export.
* API keys live only on the server; the browser never sees them.
* Input validation with zod; rate limits on auth, coach and engine endpoints; production refuses to start without secrets.
* Data export (`GET /api/export`) and full deletion (`DELETE /api/account`, cascades).
