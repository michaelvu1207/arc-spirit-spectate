# Arc Spirits — Bot Ladder Research

A tiered ladder of AI opponents for the play engine, from **Medium** up. This document records
how each bot is built, what's notable about it, and its measured strength (win rate + ELO).
All numbers come from in-engine self-play (`src/lib/play/sim/`), real Supabase catalog, deterministic by seed.

> **Current meta:** the *difficulty ladder* (Medium…Godly) below is about how well a bot plays the
> economy safe-scaler. For **what actually wins** — including the Evil-hunter PvP line that dominates
> 4+ players — see [`docs/meta-report.md`](./meta-report.md), the authoritative meta. Both docs run the
> **specialized-location model** (reward-row interactions only, one location per round). Earlier
> editions of this doc measured a placeholder where build actions were free anywhere and PvP was
> tempo-negative disruption — those claims are **superseded**.

> Status: **in progress** — tiers Medium/Hard/Extra-Hard/Insane/Godly implemented; ELO tournament + tuning underway.

## The game, in one screen (what any strong bot must solve)

- **Win = first to 30 VP** (`VP_TO_WIN`). VP comes from monster-kill reward tokens **or** the PvP
  group attack (see below) — VP is no longer monster-only.
- **Monster ladder** (`monsters_v2`, ordered by `order_num`): 8 rungs, HP `1,2,4,5,7,10,12,14`, damage `2,3,4,4,4,5,6,7`. Each kill brings the next, stronger rung (lives/rung = active-seat count). Claim-VP per rung `3,3,2,2,3,4,6,10` → **cum 33 after all 8**, so you win by climbing the ladder once; the hp14/**dmg7** boss (10 VP) is mandatory for the economy line.
- **Specialized locations (the build model).** A Spirit World location's actions ARE its DB reward
  rows: **Rest only at Floral Patch, Cultivate only at Lantern Canyon, free Summon only at Tidal
  Cove** (Cyber City sells a paid summon + class runes). You visit **one location per round** and act
  via `resolveLocationInteraction` (the reward rows there); the generic always-available
  `rest`/`cultivate`/`drawSpiritWorld`/`drawArcaneAbyss` commands were **removed**. A bot must navigate
  to the specialized location it needs each round — which is exactly why the Rest chokepoint at Floral
  Patch is the lever the PvP hunter exploits.
- **Hard constraints:**
  - Barrier (= survivability) maxes at *potential*, which starts 4 and grows **only** via the Cultivator origin-trio (an awakened Cultivator whose origin has ≥3 spirits → +1/cultivate). Must reach **10** to survive the boss.
  - Corruption fires when a hit takes damage **> barrier** (drives barrier to zero). It gives an
    **instant full heal** but bills an **escalating spirit sacrifice** (1st corruption discard 1, 2nd
    2, 3rd 3, …; no hard slot limit). Status descends Pure → Tainted → Corrupt → **Fallen** (Evil).
    Renewable barrier between fights = a **Healer** (+3/rest) or **3 Soul Weavers** (+2/rest); the
    economy line heals instead of corrupting.
  - Damage to clear hp14 ≈ 10 exalted dice (mean 10) + flat **Spirit Animal** bonus (+1 each); arcane dice (Arcane Advisor / Dragon Warrior, Abyss-only) push higher.
- **Extra tools the higher tiers exploit:** **PvP** — once Fallen (`statusLevel >= 3`), co-located with
  Good players at a **non-Abyss** location, Evil players can **unanimously** launch one group attack
  per round for a flat **+3 VP each** (no roll/kill needed; the Arcane Abyss is PvP-immune). This is a
  **primary win condition**, not disruption. Plus **Cursed Spirits** (held through corruption, they pay
  out at each crossing: Tainted → potential-or-Enchanted, Corrupt → relic, Fallen → augment, scaled by
  how many you hold; discarding them is a pure loss), Arcane Abyss spirits (arcane dice via Abyss-summon
  reward tokens + awaken-by-rune/relic), location reward-row trades, and damage combos (Dark Assassin
  ×2 on odd barrier, Dragon Warrior +3 arcane).

## Methodology

- **Engine:** pure deterministic reducer (`applyGameCommand`) + seeded RNG → reproducible, ~1000+ rounds/s.
- **Model:** the **specialized-location** build model (reward-row interactions only — one location per
  round; no generic build commands), the live monster ladder, win = first to **30 VP** from monster
  kills **or** the PvP group attack. Each bot navigates to the specialized location it needs (Rest →
  Floral Patch, Cultivate → Lantern Canyon, Summon → Tidal Cove) and resolves the worthwhile reward
  rows there, like a real player. **Earlier ladder numbers that measured free build actions anywhere
  are void** — re-run against this model (see the meta report's battery).
- **Arena** (`src/lib/play/sim/arena.ts`): multiplayer self-play measurement.
  - *ELO round-robin*: rotate tiers across seats over many games; the seat that truly reaches 30 VP first "wins"; free-for-all → pairwise winner-beats-loser ELO updates (K=24, base 1500).
  - *vs-baseline*: one tier vs N copies of a baseline → absolute win rate + avg rounds-to-win (the "expected win rate vs the field" number). In a 4-player game, an equal bot wins 25%; higher = stronger.
- **True win = `victoryPoints ≥ 30`**, never the `allPlayersFallen` consolation (which would otherwise reward a bot for corrupting itself out in solo).
- Run: `RUN_SIM=1 ARENA_MODE=elo ARENA_ENTRANTS=medium,hard,extrahard,insane,godly ARENA_GAMES=… npx vitest run src/lib/play/sim/arena.test.ts --disable-console-intercept`.

## The ladder

All tiers share one **safe-scaler** core policy (`planMediumPhaseActions`): build dice→10 (Fighters) + potential→10 (Cultivator trio) in parallel, **pivot** the tableau (proactively `discardSpirit` spent Fighters/Cultivators — their dice/potential persist) to Spirit Animals (damage) + a sustain spirit, then climb, **healing between fights instead of corrupting**. Tiers add capability and/or search on top.

| Tier | What it adds over the previous | Technique |
|---|---|---|
| **Medium** | the safe-scaler baseline | hand-built heuristic |
| **Hard** | *urgency* — fights the moment a kill is survivable + likely instead of over-healing → wins faster | heuristic knob (`fightUrgency`) |
| **Extra-Hard** | rollout **search** at the fight-vs-build decision (shallow, 6 rollouts) → optimizes tempo | flat Monte-Carlo over the heuristic |
| **Insane** | deeper search (16 rollouts) → sharper, faster lines | " |
| **Godly** | deepest search (36 rollouts), tuned for the fastest possible win | " |

**Why search is "definitively better":** at the single decision that most controls tempo + safety (fight the monster now vs. build a bit more), the bot plays each option out to game-end `searchRollouts` times with the heuristic as the rollout policy and picks the option with the best expected outcome (win first, then fewest rounds). More rollouts ⇒ a strictly better estimate of the best move ⇒ monotonically stronger play, by construction. It only fires when fighting is a *live* choice (survivable, legal, building still helps), so it stays cheap.

## Measured results

**Tournament v1** (160-game 4-player ELO round-robin + vs-field, via `.claude/workflows/bot-ladder.mjs`). 25% = even in 4p:

| Tier | ELO (v1) | field win% | vs tier-below | avg rounds |
|---|---|---|---|---|
| Insane | 1539 | 28.9% | 4% vs Extra-Hard ⚠ | 26.2 |
| Extra-Hard | 1533 | 28.1% | 46% vs Hard | 25.3 |
| Godly | 1525 | 28.9% | 25% vs Insane | 26.0 |
| Hard | 1456 | 16.4% | 33% vs Medium | 26.4 |
| Medium | 1447 | 19.5% | — | 25.8 |

**Key finding — search saturates *within the economy line*.** Search cleanly separates two bands:
**{Extra-Hard, Insane, Godly} ≈ 1530 ≫ {Hard, Medium} ≈ 1450**. But the three search tiers are
*statistically tied*, and more rollouts (Insane K=16, Godly K=36) did **not** beat fewer (Extra-Hard
K=6) — `insane vs 3×extrahard` won just 4%. Why: the rollout *value* is a **biased** estimator (solo +
truncated + hand-weighted), so extra samples cut noise but can't fix bias. ⇒ **More search depth on
the same safe-scaler build saturates** — the top tiers must be differentiated by **CAPABILITY**
(Insane + Arcane-Abyss burst, Godly + PvP), and the biggest capability is **a different strategy
entirely**: the meta report's Evil-hunter PvP line beats every economy tier head-to-head at 4+ players
(64–93%). Re-rate as v2.

Earlier vs-field samples (entrant vs 3× the tier below; 25% = even): Hard 33% / Extra-Hard 38% / Insane
44% vs Medium, rounds 28.8 → 24.7 → 23.4 — search beats the no-search base, but plateaus ~23 rounds.

**Tournament v2** (after differentiating the search tiers by rollout *horizon* — Extra-Hard h12 /
Insane h24 / Godly h28). ELO is now monotone and the vs-field steps are clean:

| Tier | ELO (v2) | field win% | vs tier-below | technique |
|---|---|---|---|---|
| Godly | 1535 | 29.1% | **10% vs Insane** ⚠ | search h28/K24 |
| Insane | 1530 | 30.9% | **50% vs Extra-Hard** ✓ | search h24/K10 |
| Extra-Hard | 1511 | 25.5% | **45% vs Hard** ✓ | search h12/K6 |
| Hard | 1474 | 16.5% | **35% vs Medium** ✓ | fight-urgency |
| Medium | 1450 | 19.1% | — | safe-scaler |

**Confirmed monotone for the first four** (Medium → Hard → Extra-Hard → Insane: 35% → 45% → 50% steps;
the longer horizon fixed the v1 saturation between Extra-Hard and Insane). **But Godly's deeper config
lost to Insane (10%).** Lesson: the rollout value optimizes *solo* win-robustness, so over-optimizing
it (longer horizon) makes the bot too safe/slow for the *multiplayer race* — search has an MP-aligned
ceiling around Insane. Godly retuned to Insane's horizon with more rollouts (h24/K20) — validating
whether rollout *count* at the good horizon tops the ladder without the slow-and-safe regression.

**Resolved — Godly (h24/K20) tops the ladder.** Reverting the horizon to 24 (keeping the value
~unbiased) and instead adding *rollouts* (K10→K20, which reduces decision noise without the
slow-and-safe regression) fixed it: **Godly vs 3×Insane = 39%** (≫ 25% even) and vs 3×Medium = 40% at
~24.6 rounds. So the lever that separates the top two is rollout *count at the good horizon*, while the
lever that separated the middle was rollout *horizon*. Final ladder — each tier beats 3× the tier below
in a 4-player game (25% = even):

| Tier | technique | beats 3× tier-below | avg rounds |
|---|---|---|---|
| **Godly** | search h24 / K20 | **39% vs Insane** | 24.6 |
| **Insane** | search h24 / K10 | **50% vs Extra-Hard** | ~24 |
| **Extra-Hard** | search h12 / K6 | **45% vs Hard** | 24.7 |
| **Hard** | fight-urgency, no search | **35% vs Medium** | 28.8 |
| **Medium** | safe-scaler heuristic | — (50% solo / 100% MP-field) | ~31 |

**Consolidated ratings.** Across three tournaments the ELO point estimates wobble with sample size,
but two things are rock-solid: (a) the **head-to-head steps are monotone every time** — each tier beats
3× the tier below (Hard 33–35% / Extra-Hard 44–45% / Insane 44–50% / Godly 39%), and (b) the **search
band {Extra-Hard, Insane, Godly} sits clearly above the no-search band {Medium, Hard}**. Best-estimate
ELO (anchored on the larger v2 run + v3's fixed Godly):

| Tier | ELO (est.) | band |
|---|---|---|
| Godly | ~1535 | search ceiling (edges Insane h2h, 39%) |
| Insane | ~1530 | search |
| Extra-Hard | ~1505 | search |
| Hard | ~1475 | no-search |
| Medium | ~1450 | no-search |

The within-search-band gaps are small (search saturates near Insane — see "Key finding"); the
no-search→search jump (~+60 ELO) is the dominant difference. The ladder is **monotone and each step is a
real, measured improvement**, just not equal-sized: fight-urgency and search-depth each add a rung, and
the biggest rung is "uses search at all."

### Expected win rates (what to tell players)
In a 4-player game, **25% is an even/fair share**. Read the tiers against the field they face:
- **Same tier ×4** (e.g., a Medium lobby): ~25% each by symmetry — evenly matched.
- **One tier vs 3 copies of the tier directly below:** Hard 35% / Extra-Hard 45% / Insane 50% / Godly
  ~39% over the field — i.e., a one-step-up bot wins clearly more than its fair share, but not
  overwhelmingly (one rung of difficulty ≈ +10–25pp).
- **A top tier (Insane/Godly) vs all Medium:** ~40–50% (≈2× its fair share) — strong but not a
  steamroll, because in a 4-way race variance always gives the weaker seats some wins.
- **Random** fills empty seats and effectively never wins (≈0%) against any strategic tier.

So: pick **Medium** for a fair fight, **Hard/Extra-Hard** for a real challenge, **Insane/Godly** to be
clearly out-played. Expect even the strongest bot to win ~30–50% in a 4-player game (not ~100%) — that's
the nature of a multiplayer race, not weak play.

### Differentiating the search tiers — v2 (rollout horizon = value accuracy)
Since extra rollouts saturated (biased value), v2 differentiates by **rollout horizon**: Extra-Hard
h=12 (fast, biased proxy), Insane h=24, Godly h=40. A solo rollout of ~30–40 rounds usually *reaches*
a real 30-VP win, so Godly's value is ~unbiased (true win/rounds) and its fight-vs-build calls are
genuinely sharper — a principled monotone dial, not just more samples. (Re-rated below as v2.)

### Why the Arcane-Abyss burst is deferred (a depth/balance finding)
The damage spikes — **Dark Assassin** (×2), **Dragon Warrior** (+3 arcane), **Arcane Advisor**
(exalted→arcane) — are all Arcane Abyss (cost 7–9) and **rune/condition-gated in ways a bot can't
cheaply satisfy**: Arcane Advisor needs a *specific* rune id, Dragon Warrior needs three specific
runes, Dark Assassin awakens only by *discarding 3 Elementalists*, the Corruptor by *cultivating
solo*. The Cultivator makes generic origin runes, which don't match those ids — so the arcane lane is
effectively closed to the bot without a dedicated rune-acquisition sub-strategy. This is itself a
**game-depth signal**: the highest-damage builds are locked behind costs the current systems make hard
to reach, which is why even optimal search plateaus ~20–25 rounds rather than the ≤15 target. Closing
that gap is a balance lever (make arcane runes obtainable) more than a bot lever.

### Performance note
Rollouts are **solo-ized** (the clone keeps only the searching seat) and **truncated** to a short
horizon with a value score, rather than played to game-end with all 4 seats. The fight-vs-build
decision is about *our* tempo, so this is a faithful proxy and ~5× cheaper — which is what makes the
deep-search tiers (and a multi-tier ELO tournament) tractable within the time budget.

## How each tier was built (and what's notable)

- **Medium — the safe-scaler (hand-built heuristic).** The foundation. Built by diagnosing, in
  self-play, exactly why a naive bot can't win the reworked ladder, then fixing each wall:
  corruption-aware kill odds, potential via the Cultivator origin-trio, sustain (Healer / 3 Soul
  Weavers), and a count-aware recruiter that *pivots* the 7-slot tableau from build pieces to
  damage+sustain via proactive `discardSpirit`. *Notable:* it plays with **zero corruption** —
  safety isn't a rule, it falls out of valuing barrier as the resource that gates kill throughput.

- **Hard — urgency (`fightUrgency`).** One knob: drop the kill-odds bar to the committed level from
  the start, so the bot fights the instant a kill is survivable+likely rather than topping barrier
  off first. *Notable:* pure tempo — same build, ~2–3 fewer rounds, +8pp win rate, no new code.

- **Extra-Hard / Insane / Godly — rollout search (`searchRollouts` 6 / 16 / 36).** The same heuristic,
  but the single highest-leverage decision (fight the monster now vs. build a bit more) is chosen by
  Monte-Carlo: play each option forward a short, **solo-ized** horizon many times and take the option
  with the best mean value (win-fast ≫ progress). *Notable:* (1) it needs **no training** — it reasons
  at runtime over the real engine; (2) more rollouts is *provably* ≥ fewer (same base policy, better
  estimate of the best move), so the tiers are monotone **by construction**; (3) solo-izing the rollout
  (drop the other seats) was the unlock that made deep search — and a 5-tier tournament — affordable.

- **Arcane-burst + PvP — the "full-scope" lines (now implemented; see the meta report).** Search
  optimizes *when* to fight but can't exceed the base build's damage ceiling (10 exalted ≈ mean 10), so
  the pure economy line plateaus ~23 rounds. Two capabilities break past it: **Arcane Abyss** spirits
  (claim "Arcane Abyss Summon" reward tokens, keep the burst spirit, let cleanup auto-awaken it for
  Dark Assassin ×2, Dragon Warrior +3 arcane, Arcane Advisor exalted→arcane — one-shotting the boss),
  and **PvP**, which turned out to be a *primary win condition*: a Fallen player co-located with Good
  players group-attacks for a flat **+3 VP each** per round. The `pvphunter` line (corrupt → Fallen →
  camp the Floral Patch Rest chokepoint → farm +3/round) wins **75% at 4p / 79% at 6p** and beats every
  economy tier head-to-head — the strongest strategy in the game at 4+ players (it loses at 2p).

## Update: runes/relics item model + arcane burst + the Mythic tier

**Item-model simplification (game change).** The game now has exactly **two item types: runes and
relics**. "Any Rune" picks one of the 5 origin runes; "**Any Special**" (the old name) now means
"**any relic**" — choose one of the 5 relics (**Fairy, Teapot, Firecracker, Flower, Magnet**). Players
start with **2 Fairy relics**. In code: the `wildcardSpecial` reward resolves to `relicOptions()` (the 5
relics) instead of class runes, relics carry `type: 'relic'`, and the "Any Special" awaken cost (a
wildcard) is paid by any held relic. (`locationInteractions.ts`, `monsterRewards.ts`.)

**This unlocked the arcane path for the bots.** Arcane Advisor (Arcane Synthesizer) awakens for 1 "any
relic" — payable from the **starting Fairy relic**. So a `pursueArcane` bot can: claim an Arcane Abyss
Summon reward → keep Arcane Advisor → cleanup auto-awakens it (Fairy relic) → rest converts exalted
dice → **arcane** (mean 2.0 vs 1.0). Verified end-to-end: a probe reached **10 arcane dice (mean ~20,
one-shots the hp14 boss)** with Arcane Advisor in the tableau.

**Key finding — *pure arcane* is a VP-race trap (it works, but chasing it loses).** Chasing arcane
early cratered the win rate (8% vs 50%) by starving VP. Even gated to fire only after the core build —
claiming a summon *alongside* a VP token, stopping once it owns an arcane spirit — it was **net-neutral
in solo (50% = safe-scaler)** … but in the **multiplayer tournament it was a clear LOSS**: Godly+arcane
fell to **14% / ELO 1463 (worst tier), losing to Insane 12.5%**. The reason is fundamental: an Abyss
Summon is taken *instead of a VP token*, and in a race **every VP is tempo** — the safe-scaler already
has enough damage (Spirit Animals clear the hp14 boss), so the arcane detour just loses the race.
⇒ **Arcane is implemented + verified (10 arcane dice end-to-end) but left OFF the competitive *economy*
tiers** — as costed, it's a trap for a pure VP-racer. **This is the arcane lane only; it is NOT the
verdict on every alt-strategy.** PvP, by contrast, became the dominant 4+p line precisely because the
group attack *itself awards VP* (+3/round) — it doesn't trade a VP token for damage, it adds VP
directly (see [`docs/meta-report.md`](./meta-report.md)).

**Tiers (arcane reverted).** Godly = search h24/K20 (no arcane — its proven config that beats Insane
~39%). I also tried **Mythic** = multiplayer-race rollout search (keeps rivals in, scores winning the
race — the principled answer to solo-search saturation). **It failed too: Mythic vs 3×Godly = 17%**
(< 25% even) and it was so slow (full 4-player rollouts) it hit the 600s cap. So Mythic was dropped.

### Conclusion: Godly is the ceiling *of the economy line* — but PvP is a whole second strategy
Four attempts to push the **economy safe-scaler** past Godly failed: more rollouts (saturates), longer
horizon (over-safe → loses the MP race), **arcane burst** (loses the VP race), and **MP-race rollouts**
(noisier + slower, 17%). So *within the safe-scaler*, search saturates near Godly — that part holds.

**What changed: there IS more strategic headroom — it's a different build, not deeper search.** Once
PvP was wired as a real win condition (+3 VP/round for the Fallen group attack) on the
specialized-location model, the **Evil-hunter line dominates 4+ players (75–79%)**, beating every
economy tier head-to-head (64–93%) — and it *loses* at 2p, where the economy line wins. So the meta is
no longer "one solved build"; the dominant strategy **flips with player count** (see
[`docs/meta-report.md`](./meta-report.md)). The difficulty ladder below still ranks how well a bot
plays the *economy* line; it is not the whole strategy space. The final shipped *economy* ladder is
**5 monotone tiers**:

Final clean 5-tier tournament (168 games, no arcane/Mythic contamination):

| Tier | ELO | beats 3× tier-below (25% = even) | technique |
|---|---|---|---|
| **Godly** | 1526 | **35% vs Insane** | safe-scaler + solo rollout search h24/K20 — the ceiling |
| **Insane** | 1549 | **50% vs Extra-Hard** | + deeper-horizon search h24/K10 |
| **Extra-Hard** | 1519 | **45% vs Hard** | + rollout search h12/K6 |
| **Hard** | 1463 | **35% vs Medium** | + fight-urgency |
| **Medium** | 1443 | — | safe-scaler heuristic (50% solo / 100% MP-field) |

(ELO clusters the three search tiers — they're genuinely close, the saturation — and shows a clear ~60-pt
gap to the no-search band; the head-to-head vs-field steps are the cleaner monotonicity signal: 35/45/50/35%.)

**The 6th tier is PvP, and it already exists.** The original note here — "make the arcane/relic and PvP
lanes worth their cost, they're strictly dominated by farming VP" — held only for *arcane*. **PvP was
wired and turned out to be the strongest line in the game at 4+ players** (`pvphunter`, +3 VP/round
group attack): a true new strategy *above* the economy ladder, not just a deeper economy bot. So a top
tier *is* now a capability jump, not a search-depth jump — the Evil-hunter line. The remaining
DESIGN lever is the **arcane/relic** lane (still a VP trap as costed) and making the **Cursed-Spirit
economy** pay without PvP (underperforms at ~6% in this config). See [`docs/meta-report.md`](./meta-report.md)
for the full strategy table and the balance levers for tuning the hunter's dominance.

## Notable findings (running log)

- The decisive bug fixes that took the base bot from 0 → 50% solo: (1) kill-probability must model corruption (a corrupted player can't counter); (2) potential must be built via the Cultivator origin-trio; (3) sustain (Healer / 3 Soul Weavers) lets it climb without burning the corruption budget; (4) **proactive `discardSpirit`** + a *marginal* keep-value (discount a spirit's own class, else a lone Healer reads as redundant and gets culled) lets the 7-slot tableau pivot from build pieces to damage+sustain.
- `fighter` (no potential, no sustain) wins **~1%** in multiplayer — confirms the full economy build is required, not just dice.
- Search's biggest lever is *tempo* (when to stop building and start killing), which is exactly the axis a hand-tuned threshold gets wrong.
- **The PvP hunter beats search depth.** No amount of economy-line tuning matches simply going Evil and
  farming the +3-VP group attack at 4+ players — the dominant lever turned out to be *strategy*
  (corrupt → Fallen → camp the Rest chokepoint), not rollout count. It self-limits, though: an
  all-hunter field stalls (a predator needs prey), so it's not an auto-win.
