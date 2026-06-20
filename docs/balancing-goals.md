# Arc Spirits — Balancing Goals & Design Philosophy

The intent behind balancing this game, in the designer's words. Every balance change (class
breakpoints, monster ladder, PvP rewards, location interactions, costs) should be evaluated
against these goals. This is the "why"; the measured meta lives in [meta-report.md](meta-report.md).

## North star: going evil should be the most rewarding — and the most fun — path

- **Aggressive / evil strategies should be *stronger* than good-oriented ones.** The game is more
  fun when you go evil: it invokes a certain stress, and **hunting is fun** — predicting where
  other players will go and preying on them. Players should feel *incentivized* to turn evil.
- **An all-good game is boring** — everyone just does the same thing. The evil option is what
  creates divergence, tension, and player interaction.
- **The thematic arc is the beautiful part of the game:** players who go to the Arcane Abyss get
  **corrupted over time**, and eventually *discover* that **evil is the best way to win**. The
  incentives should teach this on their own — the player arrives at evil because it's optimal, not
  because they were told to.

## The intended evil trajectory (the shape of an evil player's game)

1. **Descend fast.** Evil players want to become Fallen as quickly as possible.
2. **Early VP spike.** Their victory-point curve should *spike early* — a big lead up front.
3. **Monster-killing decays.** Over time their corrupted build struggles to kill the monster.
4. **Forced into PvP.** Eventually killing *players* becomes their best (and only good) option —
   so they lean into hunting.

Mechanical support for this shape:
- Evil leans into **initiative** to strike first in PvP — hit the good players *before they can hit
  back* (a faster side strikes first; a stunned victim can't retaliate).
- **Monsters are tuned harder for evil to kill** (but still reasonably killable by good) — so evil
  can't just farm monsters and is pushed toward preying on players. This must be an **alignment-
  asymmetric** lever (e.g. evil gets less monster value), NOT a global HP/VP change that would
  speed up good and evil alike.

## Good vs evil roles (the core asymmetry)

| | Good | Evil |
|---|---|---|
| Win condition | climb the monster ladder; kill / save / vanquish the Arcane Abyss | prey on the good players via PvP for VP |
| Income | steady PvE (monster kills) | burst PvP (+3 VP/attack), early spike |
| Key stat | potential / dice / sustain | initiative (strike first), corruption tempo |
| Late game | grind the ladder to 30 | hunt; can no longer farm monsters |

The evil line should **beat good head-to-head** in a mixed field, but be **self-limiting** in an
all-evil field — it needs Good players as prey, so a table where everyone goes evil collapses
(no winner). That keeps the dominant strategy from being a degenerate auto-win.

## Skill expression — a wide skill range

- **Newer players do one thing per location.** They visit, take the obvious free action, move on.
- **Better players do *more than one thing* per location**, and **plan ahead** to chain the most
  optimal actions. Target: **> 2 actions per location visit** for strong play.
- Planners simply **do more every turn, get ahead faster, and know how to spend their resources.**
  There should be a clear, rewarded gap between players who plan and players who don't.
- **Action-economy backbone: 1 turn ≈ 1 relic.** Spending a relic to compress an action (e.g. buy
  the augment that crosses a breakpoint, in a turn you're already taking) should beat burning a
  whole extra turn. **Sitting in one location 3+ times should *never* be optimal** — repetitive
  parking-and-resting is the boring failure mode we are designing against.
- **Super-linear class breakpoints** (e.g. Fighter / Cultivator on a `1, 2, 5, 10` ladder) make
  *stacking* a class — by recruiting and by buying its augment — pay off far more than repeat-
  resting a small pool, which is what rewards planning over grinding.
- **Breakpoints are OPPORTUNISTIC, never forced.** Crossing a steep tier is worth it only when you
  are *already adjacent* to it — e.g. you already hold 3 Fighters and an augment crosses you to 4
  (the cheap, planned play). You should *never* grind draws/relics to force a class up from a low
  base (1 → 4) chasing the big number — that's luck-based and bad play. The reward is for noticing
  "I'm one augment away, I'll take it and get ahead," not for tunnel-visioning a count. Bots and
  balance must reflect this: opportunistic crossing good, forced stacking bad.

## The "unrealized points" insight (the deep skill the game rewards)

**Health and status are unrealized victory points.** When you lose health — take damage, corrupt —
you are actually *converting* it into points by killing monsters (and, for evil, by descending
toward the PvP payoff). A player who hoards health and plays safe is sitting on unrealized points
and **falls behind**. The optimal player treats health and status as a *spendable resource*, not
something to protect. Players who don't internalize this play suboptimally — and that gap is a
feature, not a bug.

## Measurable targets (what "balanced" looks like right now)

- **Evil (PvP hunter):** wins by ~**round 24**; an early VP spike; beats every good strategy
  head-to-head; self-limiting in an all-evil field.
- **Good (economy):** wins by ~**round 36**; slower but viable; the steady, lower-variance path.
- **Action density:** strong play resolves **> 2 reward-row actions per location visit** (measured
  via `locRowActions / locVisits` in the self-play harness).
- **No optimal sitting:** the best line should not revisit the same location 3+ times.

## Open levers that follow from these goals

- **Alignment-gated monster value** — make monsters worth less (or unclaimable) for Evil players,
  so evil is pushed to hunt rather than farm. (A global reward/HP change is the *wrong* lever — it
  helps good and evil equally; see the sweep in the meta work.)
- **Evil initiative scaling** — a way for evil to invest in striking first in PvP.
- **Super-linear breakpoints + in-flow augment purchases** — already partly live (Tidal Cove sells
  Fighter/Cultivator/Spirit-Animal augments for a relic); steep breakpoints make crossing a tier
  beat grinding.
- **Action-density + trajectory telemetry** — now captured in the self-play harness, so each of the
  targets above can be measured, not guessed.
