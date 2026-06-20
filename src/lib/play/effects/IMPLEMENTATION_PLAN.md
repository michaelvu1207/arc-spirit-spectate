# Rules Engine — Class Abilities & Awakening Implementation Plan

Goal: implement **every** class ability and **every** spirit awakening requirement in the
server-authoritative rules engine, each covered by automated tests. Code must be
**modular across many small files** — never one monolith.

## Architecture (today)

- Pure reducer `applyGameCommand(state, actor, command, catalog)` — `src/lib/play/runtime.ts:401`.
  Returns `{ok,state}` / `{ok:false,error}` via `success()`/`failure()`. All randomness flows
  through `state.rng` (deterministic → testable).
- Rules siblings in `src/lib/play/`: `phases.ts`, `combat.ts`, `effects/apply.ts`,
  `effects/registry.ts`, `locations.ts`, `rng.ts`. Server-only glue under `server/`.
- Class effects: `applyTrigger(state,seat,trigger,log)` (`effects/apply.ts:110`) reads
  `awakenedClassCounts` (face-up spirits only), iterates the hand-authored `CLASS_EFFECTS`
  registry (`effects/registry.ts`), `selectBreakpoint` picks highest met count, `runAction`
  dispatches `EffectAction` kinds. **Only 5 of 38 classes encoded** (Fighter/Enchanter/
  Elementalist/Healer onRest, Fairy onMonsterKill).
- Wired triggers: `onRest` (runtime.ts:1047), `onCultivate` (applyCultivate), `onMonsterKill`
  (combat.ts:127). **Dead** triggers (declared, never fired): onNavigate, onSpiritSummon, awakening.
- **Awakening: NOT checked at all.** `awakenSpirit` (runtime.ts:1026) just flips
  `isFaceDown=false`. `awaken_condition` is never loaded into the catalog.

## Three additive seams

1. **Catalog load** — add `awaken_condition` + `effect_schema` to `HexSpiritAsset`/`ClassAsset`
   (`src/lib/types.ts`) + the supabase select; add `awaken` to `PlayCatalogSpirit` and a
   `classes[]` field to `PlayCatalog` (`src/lib/play/types.ts`); `normalizeAwaken()` in
   `server/catalog.ts` groups repeated rune UUIDs → `{runeId,name,kind,count,wildcard}`.
2. **Trigger dispatch** — keep `applyTrigger` as the single dispatch point; widen `EffectContext`
   (add catalog, command, opponent, old/newStatus, combat, colocated); add the missing call
   sites (awakening, onSpiritSummon, onNavigate, onStatusChange, cultivate class hooks).
3. **Awakening gate** — `checkAwakenCondition(ctx)` before `isFaceDown=false`; on fail return
   `failure('awaken_unmet')` or push a `manualPrompt` for un-encodable text. Optional
   `runeInstanceIds` payload on `awakenSpirit`.

## Effect framework

- **Typed `EffectContext`** `{ state, seat, player, catalog, log, trigger, command?, traitCount,
  opponent?, oldStatus?, newStatus?, combat?, colocated[] }` — biggest coverage multiplier.
- **Declarative path** (`CLASS_EFFECTS` by class name): widen `EffectTrigger`
  (+onStatusChange, onTakeDamage, onLocationInteraction, onPlayerInteraction); `count: number|'1+'`
  → `selectBreakpoint` returns `{bp, multiplier}` (`1+` ⇒ multiplier = traitCount); extend
  `EffectAction` (gainVP, gainInitiative, reduceIncomingDamage, deflect, combatBonus, gainAugment,
  gainRelic, arcaneBlood, conditional, extraAction, manual). New `PrivatePlayerState` fields
  (default 0/false): damageReduction, deflect, combatDamageBonus, stunImmune, spiritAugments,
  relics, arcaneBlood, extraActions.
- **Handler-table escape hatch** (`CLASS_HANDLERS: Record<class, Partial<Record<trigger, (ctx)=>void>>>`)
  for the ~10 irreducibly bespoke classes (Dark Assassin, Disruptor, Guardian, World Ender/Guardian,
  Abyss Summoner, …). `applyTrigger` fires declarative breakpoints FIRST, then handlers.
- **Awakening** (`src/lib/play/effects/awaken.ts`): `AWAKEN_HANDLERS` keyed by spirit id →
  `{check(ctx), pay(ctx)}`. `rune_cost` handled GENERICALLY (wildcard `Any Relic` 19d72567 /
  `Any Rune` 7ca279f0 accept any; named relics by id/name; count via repeated UUIDs). `text`
  dispatches to a handler or pushes a manualPrompt (+ a `manualAwaken`/confirm command).
- **MANUAL fallback**: `MANUAL_CLASSES` + `MANUAL_AWAKEN` allowlists; a class/spirit is "handled"
  iff declaratively-encoded, handler-encoded, or on an allowlist that EMITS a prompt — never a
  silent no-op. Coverage test fails on anything in none of these.

## Phases (run `npm test` GREEN between each)

- **P0** Load awaken_condition + effect_schema into catalog (additive). Test: `catalog.test.ts`.
- **P1** EffectContext + extended action/breakpoint primitives (behavior-preserving). `effects.test.ts`.
- **P2** Awakening gate + generic rune_cost payment + 'awakening' trigger. `awaken.test.ts`.
- **P3** onRest/onCultivate class coverage (declarative). `effects.test.ts`.
- **P4** Combat-trigger classes (onMonsterKill/inCombat/onTakeDamage). `combat.test.ts`+`effects.test.ts`.
- **P5** Trigger-wiring classes (onSpiritSummon/onNavigate/onStatusChange/win-cons). `phases.test.ts`+`runtime.test.ts`.
- **P6** Text-awaken scripts + interaction classes + MANUAL closure. `awaken.test.ts`.
- **P7** Coverage harness (every class id + awaken_condition handled, driven by a committed DB-mirror fixture) + 4-bot integration sweep with effects + awakening ON. `effects/coverage.test.ts` + `effects/__fixtures__/catalog-coverage.ts` + `server/botPolicy.test.ts`.

## Known risks

- DB `description_translations`/`count_translations` are mojibake for unrelated effects — encode ONLY from English `description`.
- ~10 classes gate to MANUAL for missing primitives (Arcane Blood, Relic-vs-rune, Spirit Augment, Stun, Hero trait, Origin-Location typing, explicit Awakening Phase).
- `1+` multiplier must not regress the numeric breakpoint path (Fighter/Enchanter/Elementalist).
- Co-located/multi-player effects (Healer/Rune Traveler/Infiltrator) must stay order-stable + only touch active seats.
- No real Awakening Phase — fold Awakening-Phase effects into `enterCleanup`; ensure status changes resolve before VP win-cons and `findWinner` runs after.
- Extending `awakenSpirit` payload requires updating `botPolicy` legality + the 4-bot integration test.

## Status — ALL DONE ✅

- [x] P0  - [x] P1  - [x] P2  - [x] P3  - [x] P4  - [x] P5  - [x] P6  - [x] P7

P7 proves total coverage offline via a committed DB-mirror fixture
(`effects/__fixtures__/catalog-coverage.ts`) + `effects/coverage.test.ts`: all 38
classes are declarative/handler/MANUAL_CLASSES and all 61 spirits are
null/rune_cost/scripted-text/MANUAL_AWAKEN, with every rune_cost spirit proven
payable (exact runes → ok, one fewer → awaken_unmet) and no stale allowlist
entries. The 4-bot integration sweep (`server/botPolicy.test.ts`) runs 20 rounds
with effects + the awakening gate ENABLED, asserting the all-legal-commands
invariant and phase progression. Final: 16 test files, 311 tests, 0 type errors.
