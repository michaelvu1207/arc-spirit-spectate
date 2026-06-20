# Arc Spirits — Bot Meta Report

What wins, measured by bot-vs-bot self-play on the **current** engine. Every number is in-engine
self-play (`src/lib/play/sim/`), deterministic by seed, against the live Supabase catalog. Design
intent lives in [balancing-goals.md](balancing-goals.md); this is the measured reality.

> **Model note (current balance).** Specialized locations (Rest@Floral, Cultivate@Lantern,
> Summon@Tidal; one location/round; reward-row interactions only). **Moderated super-linear
> breakpoints** — Fighter & Cultivator at counts **2/3/4/5 → +1/+2/+5/+10** dice/potential (capped
> at 10), bought-augment crossing is *opportunistic* (only when already adjacent). Corruption =
> instant full heal + escalating forced spirit-sacrifice; **PvP = unanimous Evil group attack,
> +3 VP each, once/round, excludes the Abyss.** Regenerated from 4,800 free-for-all seat-games +
> matchups.

## TL;DR

1. **The Evil hunter (`pvphunter`) is the strongest strategy and dominant at 4+ players** — corrupt
   to Fallen, then camp the Rest chokepoint and group-attack the Good players for +3/round. FFA win
   rate **21% (2p) → 24% (3p) → 44% (4p) → 63% (6p)**; pooled **44%** (clear #1); and it beats a
   **pure** field of every Good build **65–81%** head-to-head. **Evil > Good holds — your #1 goal.**
2. **It loses at 2–3 players** (21–24%) — heads-up/small tables, a builder out-races the slow setup.
3. **⚠️ The Good economy is now very slow and corruption-saturated.** Good builds end **Fallen
   62–68%** of games (forced to corrupt by an under-built ladder climb), win in ~**45–75 rounds**,
   and **many low-player games never finish** (decisive rate: 2p **39%**, 4p **59%**, 6p 86%). The
   breakpoint moderation that restored evil dominance also over-slowed good — a tuning flag (below).
4. **`cursed` (corruption without PvP) and `fighter` (no potential) are dead** (5% / 0%).

## Win rate by player count (free-for-all, all 14 strategies)

| Strategy | 2p | 3p | 4p | 6p |
|---|---:|---:|---:|---:|
| **pvphunter** | 21% | 24% | **44%** | **63%** |
| cullean | 33% | 36% | 26% | 26% |
| hard | 31% | **38%** | 31% | 19% |
| culrush | **42%** | 22% | 18% | 17% |
| survivor | 28% | 19% | 18% | 14% |
| rushpatient | 15% | 24% | 11% | 13% |
| cursed | 0% | 14% | 2% | 3% |
| fighter | 0% | 0% | 0% | 0% |

*(fair share = 1/N: 50/33/25/17%. Hunter is below fair at 2p, ~1.8× fair at 4p, ~3.8× at 6p.)*

The trend is clean: the hunter's edge **grows with table size** (more Good prey), while the economy
builds peak at low counts and fade. At 2p, the fast economy (`culrush` 42%) wins; by 6p the hunter
laps the field.

## Pooled ranking (2/3/4/6p)

| Strategy | Win% | Avg VP | Fallen% | PvP/g |
|---|---:|---:|---:|---:|
| **pvphunter** | **44%** | 23.0 | 100% | 3.5 |
| cullean | 29% | 21.2 | 65% | 0 |
| hard | 28% | 20.7 | 68% | 0 |
| culrush | 22% | 21.2 | 64% | 0 |
| survivor | 18% | 19.2 | 70% | 0 |
| rushpatient | 15% | 19.4 | 74% | 0 |
| cultivator | 14% | 18.9 | 72% | 0 |
| sim6 | 13% | 17.3 | 66% | 0 |
| flexorigin | 12% | 17.4 | 54% | 0 |
| corruption | 10% | 14.9 | 65% | 0 |
| aggressive | 9% | 14.8 | 73% | 0 |
| sim5 | 6% | 13.5 | 68% | 0 |
| cursed | 5% | 11.2 | 68% | 0 |
| fighter | 0% | 9.7 | 90% | 0 |

Note the **Fallen% column** — *every* build, Good ones included, corrupts in the majority of games.
The economy can't out-heal the monster ladder fast enough anymore, so it descends incidentally.

## Head-to-head — hunter vs a pure field of each Good build (4p)

| Good field | `pvphunter` win% |
|---|---:|
| flexorigin | **81%** |
| cullean | 75% |
| hard | 74% |
| culrush | 74% |
| rushpatient | 70% |
| cultivator | 70% |
| aggressive | 65% |
| fighter | 9% |

Against a **pure** Good field the hunter is crushing (65–81%). `cursed` (no PvP) stays below fair
share against every real build (≤18%). The only field the hunter *loses* to is `fighter` — but
that's because `fighter` corrupts itself out so fast (no potential) there's nobody left to prey on.

## Why the hunter wins — and why FFA (44%) < matchup (74%)

- **It camps the Rest chokepoint.** Rest lives only at Floral Patch and every builder must keep
  returning there; a Fallen hunter parked on Floral finds a victim almost every round (~5 PvP/game
  vs a pure Good field).
- **The FFA number (44% at 4p) is lower than the pure-field matchup (74%)** for a real reason: in a
  mixed 14-strategy field, the *other* strategies also corrupt to Fallen (Fallen% 54–90%), so there
  are **fewer Good targets** to hunt — the hunter's prey pool shrinks. Against a clean Good field
  it dominates; in a corruption-soup field its edge narrows (but it's still #1).
- **Self-limiting:** PvP needs a Good target, so an all-hunter table has no prey and stalls. The
  dominant strategy is *not* an unconditional auto-win.

## ⚠️ Balance flag: the Good economy is over-slowed

Restoring "evil > good" by **moderating the breakpoints** (pushing each up by one count) worked —
but it slowed Good past the point of healthy play:

- **Games don't finish.** Decisive (someone reached 30 VP within 300 rounds): **2p 39%, 3p 58%,
  4p 59%, 6p 86%.** At 2–4 players, ~40–60% of games time out with no winner.
- **Good is forced to corrupt.** Good builds end Fallen 62–68% of games — they fight the ladder
  under-built, take corrupting hits, and descend against their will.
- **Slow wins.** When Good does win, it's ~45–75 rounds (the hunter wins at ~22).

This is the price of the current moderation. If you want Good to be a *snappy* path again without
re-buffing it past evil, the cleaner lever is to **ease the monster ladder for Good / speed VP
accumulation** (so the climb finishes), or **buff evil's income** and put the breakpoints back
steep — either restores decisiveness while keeping evil ahead. (See `tuneEconomy.test.ts` /
`metaBattery.test.ts` for the knobs.)

## Where the design goals stand

| Goal | Status |
|---|---|
| Evil > Good | ✅ hunter #1 overall (44%), dominant 4–6p, beats every Good build 65–81% |
| Evil dominant at scale, weak heads-up | ✅ 21% (2p) → 63% (6p) |
| Cursed/corruption-without-PvP weak | ✅ 5–13% |
| Good is a viable, quicker path (~36 rds) | ❌ over-slowed — ~45–75 rds, often doesn't finish |
| Games resolve | ⚠️ low decisive rate at 2–4p |

## Methodology & reproduce

- Pure deterministic reducer + seeded RNG; win = first to **30 VP**.
- **Free-for-all:** 14 strategies rotated through mixed 2/3/4/6-player tables; win credited only to
  the seat that truly reached 30.
- **Matchup:** one aggressor (rotating seat) vs a pure field of each baseline (4p).
- Telemetry: win%, avg VP, Fallen%, PvP attacks/game, avg winning round.

```bash
PREFIX=final SHARDS=8 FFA_GAMES=40 MU_GAMES=12 MAXR=300 \
  FFA_SEATS="2,3,4,6" \
  FFA_ENTRANTS="pvphunter,cursed,corruption,sim5,sim6,hard,rushpatient,culrush,cullean,cultivator,flexorigin,survivor,aggressive,fighter" \
  MU_AGGRESSORS="pvphunter,cursed" MU_BASELINES="hard,rushpatient,culrush,cullean,cultivator,flexorigin,aggressive,fighter" \
  bash /tmp/runBatteryG.sh
```

Generator: `src/lib/play/sim/metaBattery.test.ts`. Bot-stats table: `botStatsData.test.ts` →
`src/lib/play/sim/bot-stats.json` (the `/bot-stats` page). VP curves: `vpCurvesData.test.ts`.
