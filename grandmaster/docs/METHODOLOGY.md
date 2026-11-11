# Training methodology

The app implements an original methodology built on established chess pedagogy and learning science. Attributions are
limited to what those sources are widely known to contain; no book content is reproduced.

| Principle | Implementation |
|---|---|
| **Error-based learning** | Every mistake/blunder in an analysed game becomes an exercise ("find a better move", "what did your opponent threaten?") scheduled with spaced repetition. |
| **Spaced repetition** (SM-2 family) | `srs_cards` for exercises, opening lines, endgames; quality derived from correctness, hints and time. |
| **Active recall** | Positions are shown without the answer; explanation only after an attempt. |
| **Deliberate practice** (Ericsson et al.) | Daily plan allocates ~15 of 60 minutes to the 3 most damaging recent weaknesses; each block has a measurable target. |
| **Calculation training** (candidate moves / analysis tree — Kotov, *Think Like a Grandmaster*) | "Calculation without moving": candidates + full line, graded ply-by-ply by Stockfish (including whether you assumed the best defence). |
| **Threat awareness / prophylaxis** (Nimzowitsch, *My System*) | Blunder-prevention mode and Socratic step 1: name the opponent's threat before moving; graded with null-move analysis. |
| **Imbalances** (Silman) | Positional coach mode; explanations compare structure, activity, king safety, outposts. |
| **Pattern recognition / Woodpecker** (Smith & Tikkanen) | Repeated cycles of your own failed patterns via SRS. |
| **Interleaving** | Weekly themes rotate domains; plan mixes tactics, openings, endgames and review each day. |
| **Master game analysis** | Stops at critical moments; you write your reasoning before moving, then compare with the master and Stockfish. |
| **Self-analysis before the engine** | Engine toggle on every board; Socratic flow hides the engine until the end. |
| **Understanding openings instead of memorising** | Each module explains the idea of its moves, leads to named pawn structures and teaches each side's plans and pawn breaks. "Why this move?" quizzes and "find the thematic break" exercises (answers checked by Stockfish in tests) train understanding; trees are deliberately short. Games are matched to the best-fitting module, flagging when you played outside your repertoire. |
| **Endgame technique** (de la Villa; Dvoretsky) | Theoretical drills checked against Syzygy tablebases. |

**Honest measurement.** Ratings from different systems/time controls are never merged. Trends are only reported when a
least-squares slope exceeds two standard errors with n ≥ 15; weekly reports require ≥ 8 analysed games per period.
"Estimated playing strength" is a performance rating with a 95% interval inside a single pool.

**Classification.** Moves are classified by the drop in win probability (Lichess-style logistic model, thresholds
5/10/15 points by default, user-configurable). The app states explicitly that centipawn loss is a model and does not
capture practical factors (time, risk, complexity).
