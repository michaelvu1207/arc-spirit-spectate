# Arc Spirits — ML Bot Pipeline

A self-play training pipeline for a game-winning Arc Spirits bot, plus the headless,
portable environment others can use to build and submit their own bots.

The **game engine is the single source of truth** (TypeScript, `src/lib/play/`). The
**learning is Python** (PyTorch/MPS, `ml/`). They communicate through files on disk — TS
generates self-play data and runs inference; Python trains and exports weights. No slow
per-step bridge; both languages do what they're best at.

```
 TS self-play (native speed)            Python training (PyTorch / Apple MPS)
 ─────────────────────────────         ─────────────────────────────────────
 legalActions + encode + reward         model.py   candidate-scorer + value head
 driver.ts  → ml/data/*.jsonl   ──────▶ train.py   AWR / behaviour-cloning
 net.ts     ← ml/weights/*.json ◀────── export     weights → JSON
 arena/eval (win-rate gate)
```

## Why this shape

- **The engine is already a pure, deterministic reducer** (`applyGameCommand`), so full
  games run headless with no Supabase/DOM. `sim/selfPlay.ts` already proved this.
- **Candidate-scoring policy** handles the game's *parametric* action space cleanly: the net
  scores each *legal* action `score(concat(obs, actionFeat)) → logit`; softmax over the legal
  set is the policy. No brittle fixed action head.
- **`legalActions` uses the engine as its own legality oracle**: enumerate candidate commands,
  dry-run each through the pure reducer, keep the `ok` ones. The bot can take *any* real
  in-game action (full rules action set; manual/sandbox/debug commands excluded).

## Current meta (measured, June 2026)

Under current rules the **economy line is dead** (rune-strip migration → can't reach 30 VP;
best economy bot tops out ~12 VP in 120 rounds). The **PvP "Evil-hunter" line is the only
winner** (~88% finish vs prey). So the bot is trained on **placement/VP returns from the live
engine**, not by trusting the now-stale heuristics, and the success bar is beating
`pvphunter`. See `docs/bot-ladder-research.md`, `docs/meta-report.md`.

## Files

**TypeScript (`src/lib/play/ml/`)**
| File | Role |
|---|---|
| `encode.ts` | `encodeObs` (OBS_DIM=48) + `encodeAction` (ACT_DIM=40) — the feature contract |
| `actions.ts` | `legalActions` — full legal candidate set (dry-run filtered) + `commandMatches` |
| `reward.ts` | `computeReturns` — placement blended with VP progress; winner pinned to 1.0 |
| `net.ts` | pure-TS forward pass of the exported weights (`NeuralPolicy`) |
| `driver.ts` | `playRecordingGame` — headless self-play; heuristic (BC) or neural (AWR) seats |
| `neuralBot.ts` | `planNeuralPhaseActions` / `getNeuralPolicy` — production planner for `botSim` |
| `nodeIo.ts` | catalog snapshot + JSONL/weights IO (node-only, test-runner use) |
| `_gen.test.ts` | data generation runner (`GEN=1 …`) |
| `_eval.test.ts` | win-rate evaluation vs heuristic fields (`EVAL=1 …`) |
| `_health.test.ts` | engine/heuristic finish-rate probe (`HEALTH=1 …`) |

**Python (`ml/`)**: `model.py`, `train.py`, `verify_export.py`, `make_synthetic_data.py`
(see `README_train.md`). Plus shell orchestration: `run_gen.sh`, `train.sh`, `pipeline.sh`.

## Run it

```bash
# 0. one-time: snapshot the live catalog to ml/catalog.json (happens automatically on first gen)

# 1. cold-start data (parallel shards): MODE GAMES/shard SHARDS PREFIX
GEN_MAXROUNDS=90 ./ml/run_gen.sh heur 60 6 cold        # ~200k samples

# 2. full iterated pipeline: train → eval → (neural self-play → retrain → eval) × ITERS
ITERS=2 GEN_PER=45 SHARDS=6 EVAL_GAMES=24 ./ml/pipeline.sh

# individual steps:
EPOCHS=12 BETA=1.0 ./ml/train.sh                        # train → ml/weights/policy.json
EVAL=1 EVAL_OPPONENTS=pvphunter,mixed npx vitest run src/lib/play/ml/_eval.test.ts --disable-console-intercept
```

`pipeline.sh` writes `ml/eval_iter*.json` after each round so you can watch the bot improve.

## Productionizing the bot (Phase 6)

`ml/train.py` exports `ml/weights/policy.json`; copy it to
`src/lib/play/ml/policy-weights.json` (bundled) and the live server picks it up: a session
member with `bot_profile = 'neural'` is driven by `planNeuralPhaseActions` in
`server/botSim.ts` (heuristic fallback if no weights). It then slots into the existing
ranked-bots-as-players machinery — a rated, leaderboard-visible, indistinguishable player.

```bash
cp ml/weights/policy.json src/lib/play/ml/policy-weights.json
```

## Results (M4, ~1-hour training budget) — the bot beats every heuristic

Trained end-to-end on the M4 (Apple MPS) via `ml/overnight.sh`. Deployable **hybrid**
selection, 24 games per opponent, **25% = fair share** in a 4-player game:

| Neural bot vs | Win rate | avg place | avg VP |
|---|---|---|---|
| **pvphunter** (strongest heuristic) | **~70–75%** | ~1.3 | ~20 |
| **medium** (economy) | **~71–79%** | ~1.0 | ~26–28 |
| **mixed field** | **~75–88%** | ~1.0 | ~26–29 |

~3× fair share against the strongest heuristic, confirmed across multiple training
iterations. The bot learns the only winning line under current rules: descend to **Fallen**
and farm the +3-VP group attack.

### The recipe that worked (and the dead ends)
The win came from making three things line up — see `neuralBot.ts` / `ml/overnight.sh`:
1. **Champion-only behaviour-cloning prior** — imitate `pvphunter` (the only heuristic that
   wins now), not the whole field (whole-field BC collapses to `refillMarket` spam → 0 VP).
2. **AWR self-play, hard-filtered to winners (β=4)** — explore with value-lookahead + sampling
   (a Fallen-seeking shaping term + a no-op penalty get it to ~20–27% self-play wins), then
   advantage-weight so only the *winning* trajectories shape the policy.
3. **Hybrid deployment selection** — outright win > fire `initiatePvp` when legal (the +3 VP is
   credited at encounter *resolution*, so pure BC/value miss this rare decisive action) >
   grab immediate VP > learned-policy positioning.

Dead ends (all gave ~0 VP): whole-field BC; pure policy-greedy (misses the rare PvP trigger);
1-ply value-lookahead alone (too myopic — camps the Rest chokepoint and idles); and an
*incoherent* loop that explored with one policy and trained/evaluated another. Coherence
(train + eval the same agent) plus the hard winner-filter was the unlock.

## Scaling beyond the M4 (later)

The same pipeline scales to a rented GPU (e.g. A100): bump net width in `model.py`, raise
`SHARDS`/`GEN_PER`/`ITERS`, and (for real RL throughput) the next step is a PettingZoo wrapper
over a WASM build of the engine so Python steps it in-process. The TS env + Agent contract are
unchanged — only the trainer scales.
