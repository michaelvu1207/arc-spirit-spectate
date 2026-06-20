# Rules & Events System — Refinement Plan

Goal: a **robust but simple** event/hook system where every spirit ability plugs in at the
**exact timing the rulebook specifies**, and adding a new interaction is a one-liner. This
supersedes the ad‑hoc split that exists today (declarative `CLASS_EFFECTS` + bespoke
`CLASS_HANDLERS` + `MANUAL_CLASSES` prompts), without throwing away what works.

## Why change

The engine already has good bones — one dispatch point (`applyTrigger`) and ~12 triggers.
But three things make abilities hard to express, so ~10 get punted to MANUAL prompts:

1. **Coarse timings.** Real abilities fire at precise moments ("On Navigation Reveal",
   "Before Player Interaction", "In the Battle Step", "On *this spirit's* Awakening",
   "When you Take Damage") that the current trigger set blurs together.
2. **Thin event context.** A hook says *that* something happened, rarely *what* — e.g.
   `onLocationInteraction` carries no traded item, so Rune Mage ("trade a rune → Enchanted
   Attack; a relic → Exalted Attack") can't tell rune from relic and falls back to a prompt.
3. **Missing primitives.** Stun, rune‑vs‑relic trades, placeable augments + "gain any X"
   choices, origin‑location typing — abilities needing these can't auto‑resolve.

## The model (one abstraction)

Every ability is one record:

```ts
type Ability = {
  on: GameEvent;            // WHEN — a precise point on the timeline below
  when?: Condition;         // optional gate (alignment, counts, parity, status, …)
  scale?: 'flat' | 'perTrait' | 'perMatchingOrigin';
  do: Effect;               // WHAT — see the three effect kinds
};
```

`do` is one of three first‑class effect kinds (today's three buckets, unified so they're
interchangeable and composable):

- **`grant`** — declarative state mutation (`+N dice`, `+potential`, `restore`, `+VP`,
  `+initiative`, `deflect`, …). Auto‑applies.
- **`run`** — a bespoke function `(ctx, event) => void` for irreducibly stateful logic
  (barrier parity, opponent initiative, spirit‑list mutation). The current escape hatch.
- **`choose`** — surfaces a **decision card** (the parked "benefits as cleanup cards"
  idea) for "may"/optional/player‑choice effects, resolved by one generic command.
  Replaces MANUAL text prompts with an actual, resolvable card.

Registry stays **one map keyed by class name**; each class lists one or more `Ability`
records. No more "is this declarative, a handler, or manual?" — it's always an `Ability`.

## The canonical event timeline (the "hooks")

Ordered, precise, mapped 1:1 to the rulebook's four phases + the shared combat framework.
Each event carries a typed payload (the "what").

| Event | Payload | Rulebook moment | Abilities |
|---|---|---|---|
| `round:start` | — | round begins | (resets) |
| `navigation:reveal` | `{occupancy}` | picks flip public | Deep Sea Hunter, Rune Traveler |
| `encounter:start` | `{colocated, aggressors}` | before PvP | Infiltrator |
| `action:summon` | `{world: 'spiritWorld'\|'abyss', drawn}` | Summon interaction | Soul Weaver, Abyss Summoner, Mod Injector |
| `action:cultivate` | `{originTrios}` | Cultivate | Cultivator, Arc Mage, Captain |
| `action:rest` | — | Rest | Fighter, Elementalist, Healer, Soul Weaver, Strategist, Arcane Advisor |
| `action:trade` | `{given:{kind}, gained}` | Trade interaction | Rune Mage |
| `combat:prep` | `{kind:'monster'\|'pvp', opponent}` | initiative/setup | Spirit Animal, The Corruptor, Sharpshooter, Blood Hunter, Dragon Warrior, Golem of Wishes, Dark Assassin, Dark Fighter |
| `combat:takeDamage` | `{incoming, opponent}` | Take Damage step | Guardian, Disruptor, Aquamaiden, Firekeeper |
| `combat:battleStep` | `{rolled}` | Battle Step | Dark Fighter (reroll) |
| `combat:kill` | `{target, overkill}` | on kill | Adaptive Fighter, Fairy(old) |
| `spirit:awaken` | `{spirit}` | a spirit awakens | Fairy, Dragon Warrior, Firekeeper, Fairy Droid, Purifier |
| `cleanup:awakeningPhase` | `{statusCrossed}` | Awakening & Cleanup | Cursed Spirit, The Corruptor, Golden Ruler, World Ender, World Guardian |
| `cleanup:monsterAdvance` | — | monster tracker | (monster spawn) |
| `status:change` | `{old, new}` | corruption ladder | (cross‑cutting; sets becameX flags) |

Most of these exist already; the refinement is (a) **splitting the blurry ones** (e.g.
`action:summon` carries the world so Soul Weaver's redraw scopes correctly; `combat:prep`
vs `combat:takeDamage` vs `combat:battleStep` are distinct), and (b) **typing the payloads**.

## Missing primitives to add (unlocks the MANUAL abilities)

| Primitive | Unlocks |
|---|---|
| **Stun** state + stun‑application gate | Soul Weaver, Sharpshooter ("cannot be stunned" stops being a no‑op) |
| **Trade hook** carrying `{kind: rune\|relic}` | Rune Mage |
| **Origin‑Location typing** (mark which destinations are origin locations) | Undercover |
| **Placeable augment + "gain any augment/relic" choice card** | Mod Injector, Fairy Droid, Captain, Cursed Spirit (Corrupt/Fallen), Strategist |
| **Repeatable‑interaction credits** (already have `extraActions`) | Child Prodigy, Ironmane |
| **Multi‑player dice swap** with a choice card | Infiltrator |
| **Summon‑flow override** (alt draw/bag + auto‑awaken) | Abyss Summoner |

With the decision‑card kind in place, the "gain any X" / "may" abilities become real
cards instead of dead prompts — which is also the cleanup‑benefit‑cards UX you asked for.

## Migration (incremental, `npm test` GREEN between each)

1. **Type the events.** Introduce the `GameEvent` union + payloads; keep the current
   trigger strings as aliases so nothing breaks. (Pure additive.)
2. **Unify the registry shape** to `Ability[]` per class; mechanically convert the existing
   `CLASS_EFFECTS`/`CLASS_HANDLERS`/`MANUAL_CLASSES` entries into `grant`/`run`/`choose`.
   Behavior‑preserving; the coverage test still passes.
3. **Split the blurry events** + thread typed payloads (summon world, trade kind, combat
   sub‑steps). Re‑point the few abilities that need the finer timing.
4. **Add primitives** one at a time, each converting its MANUAL abilities to real effects
   with a focused test: Stun → Trade → Origin‑Location → Augment‑choice‑card → swap/summon.
5. **Decision cards UI** — render `choose` effects as cleanup/phase cards (the benefit‑card
   surface), resolved by a single `resolveDecisionCard` command.

Each phase is independently shippable and leaves the suite green; the coverage harness
(`effects/coverage.test.ts`) stays the gate that proves every class is handled.

## Design guardrails (keep it simple)

- **One registry, one record shape.** Resist re‑introducing parallel buckets.
- **Events are data, effects are data** (with a `run` escape hatch) — serialisable, testable,
  deterministic (randomness only via `state.rng`).
- **Timing lives in `on`, not in call‑site special‑casing.** Adding an ability never means
  editing the dispatcher — only adding a record.
- **No silent no‑ops.** Every ability is a `grant`, a `run`, or a `choose`; the coverage
  test fails otherwise (as it does today).
