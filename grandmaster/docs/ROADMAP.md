# Roadmap

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 1 Foundation (project, navigation, visual system, auth, schema, profile, board) | ✅ | |
| 2 Chess engine (Stockfish 18 browser + server, PGN/FEN, move-by-move analysis, MultiPV, legality) | ✅ | |
| 3 Platform integrations (Chess.com, Lichess, history import, ratings, PGN upload) | ✅ | Live endpoints not exercised from the dev sandbox; verified against documented shapes |
| 4 AI Grandmaster (modes, grounded context, Socratic flow, memory, move guard) | ✅ | Requires an LLM key for conversational answers; engine mode otherwise |
| 5 Training academy (tactics, openings, endgames, masters, SRS) | ✅ | Content library is intentionally small but verified; Lichess CC0 puzzle importer included |
| 6 Analytics | ✅ | |
| 7 Adaptive training (daily/weekly plans, curriculum, milestones, memory) | ✅ | |
| 8 Testing & optimisation | 🟡 | 66 automated tests + manual E2E; see below |

## Next improvements (prioritised)

1. **Content depth**: more annotated master games (licensed PGN collections), more endgame drills (triangulation,
   outside passed pawn, opposite-coloured bishops, R+B vs R), deeper London/Caro-Kann trees with model games.
2. **Automated browser E2E** in CI (Playwright) and a GitHub Actions workflow for tests.
3. **Opponent-specific preparation** (Stage 4–5): import an opponent's public games and build a preparation report.
4. **Motif detection**: deflection/decoy/interference/clearance and trapped pieces are only partially detected; refine
   with engine-assisted heuristics and validate on the Lichess themed puzzle set.
5. **Positional diagnostics**: plan-quality exercises ("Think like a GM") scored automatically against engine top-3 with
   LLM rubric grading of the written plan.
6. **Embeddings for RAG** (currently BM25) once the knowledge base grows.
7. **Push notifications / reminders** for daily training (Web Push on iOS 16.4+ home-screen apps).
8. **Capacitor wrapper** for App Store / Play Store distribution.
9. **Multi-threaded Stockfish in the browser** (requires COOP/COEP headers).
