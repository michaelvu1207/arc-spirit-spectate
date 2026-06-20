# Arc Spirits — Balance Review

> **Authoritative meta:** see [`docs/meta-report.md`](./meta-report.md) for the current bot-vs-bot
> findings. This review is grounded in that report and the live engine (`src/lib/play/`). Earlier
> editions of this doc described a placeholder model where build actions were free anywhere and PvP
> was a tempo-negative disruption — those claims are **void**. The game now runs the
> **specialized-location model** (reward-row interactions only) with a strong PvP win condition.

Produced by a panel of analyst agents (difficulty curve, build diversity, dead content, item economy)
grounded in the engine + **thousands of deterministic self-play games** from the meta-report and
bot-ladder work. The core measurements behind every claim:

- **Ladder:** 8 rungs, HP `[1,2,4,5,7,10,12,14]`, damage `[2,3,4,4,4,5,6,7]` (boss damage **7**),
  claim-VP `[3,3,2,2,3,4,6,10]` (cum 33 → win by climbing once). Win = first to **30 VP**
  (`VP_TO_WIN`), from monster-kill rewards **or** the PvP group attack.
- **Corruption (rewritten):** you corrupt only when a hit takes damage **> barrier** (drives barrier
  to zero). Corrupting gives an **instant full heal** but bills an **escalating spirit sacrifice**
  (1st corruption discard 1 spirit, 2nd discard 2, 3rd discard 3, …; no hard spirit-slot limit).
  Status descends Pure → Tainted → Corrupt → Fallen; **Fallen = Evil** (`statusLevel >= 3`).
- **PvP is real and strong.** Evil players co-located with Good players at a **non-Abyss** location can
  unanimously launch **one** group attack per round for a flat **+3 VP each** (no roll, no kill). The
  Arcane Abyss is PvP-immune.
- **Strategy regimes (from the meta report):** the Evil-hunter line is dominant at 4+ players (**75%**
  at 4p, **79%** at 6p; beats every economy strategy **64–93%** head-to-head) but *loses* at 2p and is
  self-limiting (all-hunter fields stall). The economy "safe-scaler" is the best line only at 2p
  (~60%). There **is** strategy headroom — the table size selects the dominant line.

---

## 1. Overall verdict

The game is **mechanically functional and strategically branching**, not solved. Two genuinely
different archetypes win different tables: the **economy safe-scaler** (race the monster ladder to 30)
owns heads-up play, while the **Evil hunter** (corrupt to Fallen, camp the Rest chokepoint, farm the
+3-VP group attack) dominates 4+ players. The dominant line **flips with player count**, which is real
strategic headroom — the choice of build is load-bearing, not cosmetic.

What's left to tune is the *shape* of that headroom: at 4–6p the hunter's 75–79% is an upper bound
under non-adversarial bots (Good bots don't dodge the chokepoint or shelter in the Abyss), and the
weaker corruption/Cursed-Spirit economy builds (6–19%) haven't been swept. So the open balance
question is "is the hunter's 4+p dominance the *intended* strength, and can the cursed economy be made
to pay without PvP?" — not "is the game one solved race?"

## 2. Top issues (by impact)

1. **Potential is single-sourced — a hard binary gate.** Only the Cultivator origin-trio raises it, and
   you *must* reach 10 to survive the boss (damage 7). Remove it → `fighter` wins **~1%**. This is the
   root of the forced *economy* build (the hunter sidesteps it by winning on VP, not the ladder).
2. **The hunter's edge is the Rest chokepoint, not the math.** Every economy build must keep returning
   to **Floral Patch** to Rest for dice, so a Fallen player parked there finds a Good victim almost
   every round (~4–5 attacks/game). Spread the hunt instead of camping and its win rate collapses
   (~60% → ~7% at 4p) — co-location is ~90% of the strategy's value. This is a *location-design* lever,
   not a combat-math one.
3. **The Cursed-Spirit economy underperforms without PvP (~6%) — but it's one un-swept config.**
   Holding Cursed Spirits through corruption pays out at each crossing (Tainted → potential-or-Enchanted,
   Corrupt → relic, Fallen → augment, scaled by how many you hold), yet stacking them and descending for
   the threshold rewards didn't pay for the tempo + spirit sacrifice on its own here. The descent only
   earned its keep when cashed into the PvP loop (`pvphunter` does this; `cursed` doesn't). The
   corruption family spans 6–19% on a single potential knob, so this is **tuning-sensitive**, not a
   proven dead end.
4. **The Arcane Abyss is a real refuge that bots don't use.** PvP can't fire at the Abyss, so a Good
   player under threat could farm monsters there untouchably — the bots only visit the Abyss to kill,
   never to hide. The lane is mechanically complete; the gap is opponent modeling, not balance.
5. **~32 of ~38 classes are never competitively used.** The recruiter values only the ~6 core economy
   classes; most Evil/arcane/utility classes don't fire in self-play.
6. *(Secondary)* runes and relics are mechanically near-identical (no decision), and there's no comeback
   mechanic, so a player 1–2 rungs behind on the economy line stalls out late.

## 3. Prioritized changes

### A. Quick data-tweaks (ship first)
| Lever | Change | Effect |
|---|---|---|
| Cultivator trio gate | trio needs ≥3 same-origin → **≥2** | forms ~50%→85%; origin-focus stops being mandatory, opening non-trio economy builds. |
| Spread the Rest chokepoint | put Rest (or partial Rest) on a 2nd location, or move the most-needed build action around each game | co-location becomes unreliable → softens the hunter's 75–79% directly (the meta report's #1 lever). |
| Cursed-Spirit crossing payouts | retune the potential/relic/augment thresholds so holding Cursed Spirits pays for the sacrifice **without** PvP | turns `cursed` from a ~6% trap into a real non-PvP corruption economy. |

### B. Small-code (opens / softens the PvP fork)
| Lever | Change | Effect |
|---|---|---|
| **Diminishing PvP** | a Good player attacked recently grants less, or the +3 decays with repeated attacks on the same victim | stops the per-round farm without killing the win condition → caps the hunter's 4+p dominance. |
| **Make the Abyss a real dodge** | (mechanically already true — PvP excludes the Abyss) surface it so the meta uses it as shelter | gives Good players counterplay to a camping hunter → narrows the 75–79% upper bound. |
| **2nd sustain source** | e.g. +1 barrier on monster-kill | enables an aggressive fast-tempo economy path vs careful scaling. |
| **Differentiate relics vs runes** | separate slot pools/caps; relics rarer | the item economy becomes a budgeting decision. |
| **Comeback valve** | a once/game "Respite" (free heal or rung-advance) at rung 4+ | condenses stall rounds into a decision + a behind-player tempo vector. |

### C. Larger (structural diversity)
- **38-class economy audit:** give every non-core class a ≥25%-win path (buffs / cross-class synergies)
  — the largest dead-content recovery now that PvP and corruption already fire.
- **A rung that forces arcane** (unsurvivable on exalted dice at potential-10) — but only after the
  arcane-tempo costs are made competitive, or it just re-walls the game.
- **Counter-Evil tooling** (a Good-side answer to a camping hunter beyond the Abyss dodge) so the
  rock-paper-scissors between economy and hunter stays live as fields adapt.

## 4. What's genuinely good (preserve it)
- **The dominant line flips with player count** — economy owns 2p, the hunter owns 4+p. That's real,
  measured strategic headroom: the right build is a *decision*, not a fixed answer.
- **PvP is a primary win condition, and it's self-limiting.** The +3-VP group attack makes Evil a real
  race line, yet a predator needs prey: an all-hunter field stalls (~5% reach 30) because hunters can't
  feed on each other. That's a healthy rock-paper-scissors property, not an oppressive auto-win.
- **Corruption is a meaningful gamble, not a veto.** The instant full heal makes corrupting a real
  option (recover now), and the escalating sacrifice makes it a real cost (lose 1, then 2, then 3
  spirits) — and holding Cursed Spirits through the descent converts the cost into staged rewards.
- **The ladder is coherent + well-tuned** (HP `[1,2,4,5,7,10,12,14]`, damage `[2,3,4,4,4,5,6,7]`,
  claim-VP `[3,3,2,2,3,4,6,10]` = 33 → climb-once win at 30 VP). Clean, legible engine.
- **Numbers are flat data + single constants** — the highest-impact fixes (trio ≥3→≥2, spreading Rest,
  Cursed-Spirit thresholds, diminishing PvP) are mostly data/constant tweaks, so you can move the
  diversity needle a lot before writing much new code.

> Bottom line: the game already has two winning archetypes that trade places by table size, with a
> live PvP win condition that self-limits. The single most valuable balance question is **how strong
> the 4+p hunter should be** — soften it (if 75–79% is too high) via *spreading the Rest chokepoint*
> and *diminishing repeated PvP*, and make the **Cursed-Spirit economy pay without PvP** so corruption
> has a non-aggressive home. Pair those with the **trio ≥2** data-tweak and the field of viable builds
> widens with almost no code.
