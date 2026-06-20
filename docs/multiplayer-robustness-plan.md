# Multiplayer Robustness Plan — disconnects, refreshes, leaving

> Authored 2026-06-16.
> Scope: the `play` multiplayer system — SvelteKit 2 + Svelte 5 on Vercel, Supabase
> Postgres, SSE-polling sync. Goal: a game can never permanently stall on a player who
> disconnects, refreshes, or leaves — and state never corrupts when they do.
>
> **Status: P0 implemented & verified (2026-06-16)** — `npm run check` 0 errors,
> `vitest` 339 passing (incl. `src/lib/play/deadlineEnforcement.test.ts`). No DB
> migration required (the new `phaseDeadline` lives inside the `public_state` jsonb;
> `last_seen_at` already existed). P1/P2 remain to do. See §5 / §8 for details, and the
> changelog at the bottom.

---

## 1. TL;DR

The entire liveness / timeout / bot system is **client-driven, and specifically
host-browser-driven, with no server authority.** Every stall traces back to one root cause:

- The only thing that can advance a phase past a silent player is the **host's browser**
  calling the host-only `forceAdvancePhase`.
- The 60s navigation deadline is stamped server-side but **enforced only by the host's
  browser** (the pure reducer can't read the clock). The other phases have **no deadline at
  all**.
- **Bots are driven by the host's browser** `setInterval`. Host tab closes → all bots freeze.
- **Seats can't be released mid-game** (`releaseSeat` is lobby-only), reclaimed, or bot-filled.
- `last_seen_at` is **written but never read**, and is bumped for *all* members on every
  command — so today it can't even tell us who is online.

**The fix:** make the server authoritative for timeouts and bot driving by *piggybacking on
existing server touchpoints*. Vercel has no always-on process, but every connected client
already pings the server ~1s via the SSE poll (`loadRoomView`) and on every command
(`runRoomCommand`). We hang **opportunistic enforcement** off those two hooks: per-phase
deadlines + a host-independent bot nudge, made concurrency-safe by the **existing CAS on
`revision`** (single winner). Plus a **zero-clients floor** (lazy fast-forward on the next
visit) for the case where nobody is polling at all.

This removes the host as a single point of failure for stalls with **near-zero new
infrastructure**.

---

## 2. How it works today (verified against code)

| Concern | Mechanism | File |
|---|---|---|
| Sync | Server-side `setInterval(1000)` per client → `loadRoomView()` → SSE `snapshot` only when `revision` changes. One interval **per connected client**. No heartbeat, no resume. | `routes/api/play/sessions/[roomCode]/events/+server.ts` |
| Commands | `runRoomCommand()` = optimistic-concurrency **CAS loop** on `revision` (≤6 immediate retries, no backoff). Deliberately ignores client `expectedRevision`. | `lib/play/server/service.ts:448` |
| CAS persist | `UPDATE … WHERE id=? AND revision=?`; returns `null` on miss → retry. | `service.ts:289‑304` |
| Identity | Per-room `httpOnly` cookie holds `memberId` (30d). Refresh rehydrates via `+page.server.ts` load. | `lib/play/server/cookies.ts` |
| Presence | `last_seen_at` bumped as a **side effect** of `loadRoomView` (the SSE poll) **and** for *all* members in `syncMemberMirrors` on every command. **Nothing reads it.** | `service.ts:181, 201` |
| Phase gate | `allActiveSeatsReady()` requires **every** seat in `activeSeats` (frozen at game start) to have `phaseReady=true`. | `lib/play/phases.ts:30‑32` |
| Nav deadline | `navigationDeadline = Date.now()+60000` stamped server-side; **enforced only by host's browser** firing host-only `forceAdvancePhase`. | `service.ts:487`, `GameBoard2D.svelte`, `runtime.ts` |
| Straggler rescue | Pure `forceAdvancePhase` (phases.ts:246) shoves phases + auto-readies. **The pending-draw / pending-reward drain is NOT in the pure fn** — it lives in the `forceAdvancePhase` *command* case in `runtime.ts:1422‑1435`. | `phases.ts:246`, `runtime.ts:1422` |
| Bots | Members tagged by `🤖 ` display-name prefix (no `is_bot` column). Driven by **host browser** `setInterval(1300)` → `POST /bots/tick` (host-cookie-gated). | `lib/play/server/botSim.ts`, `[roomCode]/+page.svelte:122` |
| Seats | `claimSeat` / `releaseSeat` are **lobby-only**. `activeSeats` never shrinks. Bots can only be added in lobby. | `runtime.ts:662‑708` |

DB schema (Supabase schema `arc-spirits-game-history`, RLS on):
`play_game_sessions(id, room_code, game_id, status, revision, scenario, public_state jsonb,
created_at, updated_at, started_at, ended_at)`,
`play_session_members(id, session_id, display_name, role, seat_color, selected_guardian,
private_state, created_at, joined_at, updated_at, last_seen_at)`,
`play_game_session_events(id, session_id, revision, actor_member_id, command_type,
command_payload, created_at)`. No `is_bot` / `disconnected_at` / `left_at` columns.

---

## 3. Failure matrix (what breaks today)

| Event | Navigation | Encounter / Location / Cleanup | Bots present | Host leaves |
|---|---|---|---|---|
| **Tab close / crash / network drop (seated player)** | Phase waits for their lock forever unless host force-advances. Host gone → stall forever. | `allActiveSeatsReady` never true → **stall forever**. Seat can't be freed or bot-filled mid-game. | If a **bot** seat is blocked and host is gone, bots are frozen → stall. | Host's seat un-readies **and** all bots freeze **and** force/nav-expire die. Solo host-vs-bots → frozen until they return. |
| **Refresh / reload** | Rehydrates via cookie (OK). In-flight command may be lost; brief dual-stream window; `phaseReady` flags not reset. | Same. | Host refresh: bot `setInterval` lost during reconnect window; may tick on stale state. | — |
| **Deliberate leave** | `leaveRoom()` calls lobby-only `releaseSeat`, which **fails mid-game** and the error is swallowed → seat dangles. | Same → ghost seat blocks advance permanently. | — | No host migration; room becomes a zombie. |
| **All clients disconnect** (1-human-vs-bots: human closes tab) | **Frozen forever** — no poll, no command, nothing drives anything. | Same. | Same. | Same. |

Plus a correctness gap independent of phase: the **accumulator** commands
(`adjustVictoryPoints/blood/barrier/maxTokens/status`, all raw `+= amount`) are
**non-idempotent**; a manual retry after a lost-but-applied response double-applies (could
hand a player an undeserved win, since `findWinner` keys on `victoryPoints >= VP_TO_WIN`).
Note: `resolveMonsterReward` (nulls `pendingReward`, re-fails `no_reward`) and
`resolveLocationInteraction` (guarded by `actionsUsedThisRound`) are **already idempotent on
retry** — don't waste effort "fixing" them.

---

## 4. Core design: opportunistic server-authoritative enforcement

The single highest-leverage change. Generalize the host-only `forceAdvancePhase` into a
**host-independent, clock-gated** enforcement that any connected client's existing 1s SSE
poll triggers.

```
                 every SSE poll (~1s, any client)         every command
                          │                                    │
                          ▼                                    ▼
                  loadRoomView(room)                  runRoomCommand(room) ── top of attempt loop
                          │                                    │
                          └──────────────┬─────────────────────┘
                                         ▼
                          enforceRoomDeadlines(room)            ← server-clock only
                          if status==='active'
                             && phaseDeadline != null
                             && SERVER now > phaseDeadline:
                                drainPendingBeforeAdvance()      ← shared w/ host command
                                forceAdvancePhaseMachine()       ← reuse straggler logic
                                bump revision
                                re-stamp next phase's deadline
                                persist UNDER EXISTING revision CAS
                          (advance AT MOST one phase per call)
```

**Why it's safe under concurrency (verified):** `persistSessionUpdate` already does
`eq('id').eq('revision', session.revision)` and returns `null` on miss. Two simultaneous
polls past the same deadline both load `revision=Y`, both compute the same transition, both
`UPDATE … WHERE revision=Y`; Postgres serializes them, exactly one row matches, the loser
gets `null` and no-ops. **Single winner, no double-advance** — provided (a) enforce advances
**at most one phase per call** (no while-loop racing the whole round), and (b) the transition
bumps `revision`.

**Two non-negotiable corrections** the adversarial review surfaced:

1. **Server clock only.** Stamp *and* compare `phaseDeadline` with server `Date.now()` only —
   never the client's echoed value. The client copy is display-only (countdown UI). Kills
   clock skew naturally since enforce runs server-side.
2. **Zero-clients floor (see §5 P0-c).** Opportunistic enforcement structurally cannot fire
   when nobody polls. For a 1-human-vs-bots game, the human closing their tab = zero pollers =
   frozen forever — *reproducing the very stall we're removing.* A floor is mandatory, not
   optional.

**Subtlety — multi-phase commands:** a single command can cross multiple phase entries
(`passEncounter → enterLocation`; `enterEncounter` auto-skips to location when no aggressors;
`commitCleanup → beginNavigation`). So: every phase-entry reducer sets `phaseDeadline = null`,
and the **server boundary stamps the FINAL phase after the whole command resolves** (not gated
only on `== null` for an intermediate phase). Otherwise an intermediate phase inherits a stale
deadline (instant spurious advance) or a null one (never expires).

**Subtlety — drain or leak:** the pure `forceAdvancePhase` does **not** return drawn spirits
to bags. Extract `runtime.ts:1422‑1435` into a shared `drainPendingBeforeAdvance(state,
catalog)` and call it from **both** the host command and the enforce path, or a disconnect
mid-summon leaks spirits out of their bag and corrupts bag counts + history.

---

## 5. Phased implementation

### P0 — Make the game un-stallable

**P0-a · Per-phase deadline + opportunistic enforcement** — *closes the silent/disconnected/
missing-player stall in every phase; removes host as a stall SPOF.*

- `engine/types.ts`: add `phaseDeadline: number | null` to `PublicGameState` +
  `SpectatorProjection`. Add `PHASE_DURATION_MS` (navigation 60s exists;
  encounter/location/cleanup default ~120s — see P2 activity-extension). Pure helper
  `phaseDurationMs(phase)`.
- `engine/phases.ts`: every phase-entry fn (`beginNavigation`, `enterEncounter`,
  `enterLocation`, `enterCleanup`) sets `phaseDeadline = null`.
- `engine/runtime.ts`: extract `runtime.ts:1422‑1435` (autoClaim reward + return hand draws +
  clear queue) into shared `drainPendingBeforeAdvance(state, catalog)`; call it from the host
  `forceAdvancePhase` command and the new enforce path.
- `server/service.ts`: new `enforceRoomDeadlines(roomCode)` — load raw state; if
  `status==='active' && phaseDeadline!=null && Date.now() > phaseDeadline`: clone →
  `drainPendingBeforeAdvance` → `forceAdvancePhaseMachine` → bump revision → re-stamp next
  phase deadline → persist under the existing revision CAS; CAS miss ⇒ return (a poller won).
  Append a synthetic event row (`actor_member_id=null`, `command_type='enforceDeadline'`) for
  audit. **Advance at most one phase per call.**
- `server/service.ts`: stamp `phaseDeadline` at the boundary **after the full command
  resolves**, keyed to the final phase (same place `navigationDeadline` is stamped today, but
  fixed for multi-phase commands). Call `enforceRoomDeadlines` at the **top of each
  `runRoomCommand` attempt** and inside `loadRoomView` before projecting.
- `client/GameBoard2D.svelte`: drop the `isHost` gate on the nav-expire auto-fire (server is
  now authoritative); keep the manual force button host-only as an escape hatch. Generic
  per-phase countdown from `phaseDeadline`.

**P0-b · Fix `last_seen_at` to be a real liveness signal** — *enables presence-aware early
advance and future UX; verified nothing reads it today, so safe.*

- `server/service.ts`: in `syncMemberMirrors` **stop** writing `last_seen_at` for all members
  (keep `seat_color`/`selected_guardian`/`role`). Keep `updateLastSeen(member.id)` in
  `loadRoomView` (polling member) and **add** `updateLastSeen(actingMember.id)` in
  `runRoomCommand`. Now `last_seen_at` ticks ~1s only while that member's SSE is open and goes
  stale ~1s after disconnect.

**P0-c · Zero-clients floor (lazy-on-reconnect)** — *closes the all-clients-gone hole that the
opportunistic design cannot reach.*

- Because `+page.server.ts` load → `loadRoomView` already runs `enforceRoomDeadlines`, make
  the **first returning visitor fast-forward all overdue phases**: loop the one-phase-per-call
  enforce until caught up (bounded by phase count × rounds, e.g. max ~50 iterations as a
  guard). Zero infrastructure.
- Residual behavior, stated honestly: a room with **zero pollers stays frozen until someone
  returns**, then snaps to current. For a small private game this is acceptable. (Option B in
  §7 eliminates even this.)

> P0 alone makes the game recover from every disconnect/leave scenario as long as *anyone*
> ever reconnects, and never corrupts state. P1/P2 reduce how often a human notices.

### P1 — Keep bots and connections alive

**P1-a · Host-independent bot driving** — *bots act without the host's tab.*

- `server/service.ts` + `botSim.ts`: `driveRoomBots(roomCode)` called from the same
  `loadRoomView`/`runRoomCommand` hook as enforcement. If `status==='active'` and any seated
  bot `botSeatNeedsToAct`, issue **one** bot seat's `planBotPhaseActions` via `runRoomCommand`,
  then return (one seat per call). Debounce with a `botTickedAt` wall-clock in `public_state`
  (≥1300ms) so N pollers don't all drive — single effective driver per ~1.3s, self-limited by
  CAS.
- `client/[roomCode]/+page.svelte`: remove the host-only `setInterval(1300)` bot loop.
  `bots/tick/+server.ts`: drop the host-only check (or keep as an any-member fast-path) since
  `driveRoomBots` is self-gating and idempotent under CAS.
- Note: bots share the zero-clients hole; the P0-c floor covers them too.

**P1-b · SSE keepalive + active client reconnect + surface drops** — *survive Vercel timeouts;
stop showing a frozen board.*

- `events/+server.ts`: send a comment heartbeat `: ping` every ~15s even when `revision` is
  unchanged, to defeat the idle-proxy timeout.
- **Prerequisite the drafts missed:** there is **no `vercel.json` and no `maxDuration`** — the
  serverless function has a short default duration cap that will hard-kill even an *active* SSE
  stream regardless of heartbeats. Set `maxDuration` for the events route (via `vercel.json` or
  `export const config`), **and/or** accept periodic forced reconnect and lean on the client.
- `client/playStore.svelte.ts`: replace the passive `error` handler (only sets
  `isConnected=false`) with **bounded backoff + jitter reconnect** (1s, 2s, 4s, cap ~15s; reset
  on `open`); add a **watchdog** (no snapshot/heartbeat for >20s ⇒ force reconnect); **stop
  silently dropping** the error snapshot (lines 71‑73) and surface a "Reconnecting…" banner.
  `disconnect()` before each retry to avoid stacked `EventSource`s. Full-state snapshots make
  `Last-Event-ID` unnecessary.

**P1-c · Idempotency for the actually-non-idempotent commands + CAS jitter** — *correctly
scoped.*

- Only the **accumulators** (`adjustVictoryPoints/blood/barrier/maxTokens/status`) need this.
  Add optional `clientRequestId` (uuid) to `GameCommand` + a `client_request_id` column on
  `play_game_session_events` with a partial `UNIQUE(session_id, client_request_id) WHERE NOT
  NULL`. Client generates one id per logical action, reuses it on manual retry. In
  `runRoomCommand`, before the CAS loop, look up by `(session_id, client_request_id)`; if
  found, short-circuit to the current projection. System commands (enforce/bot/force) carry
  `NULL`.
- Add small **backoff + jitter** between the 6 CAS attempts (currently immediate) — polls now
  also write (enforce + bots), so guard real commands against 409 starvation.

### P2 — Make it feel good

**P2-a · Activity-based deadline extension** — *don't steal a thinking human's turn.* On every
accepted command from a not-yet-ready seat, **reset/extend that phase's deadline** at the
server boundary, so only *truly idle* seats get force-advanced. Combine with P0-b presence: if
the only un-ready seats are provably absent (`last_seen_at` stale), advance early (~10s)
instead of waiting the full window. Keep clock reads at the boundary, never in the reducer.

**P2-b · Graceful mid-game leave (vacate-to-bot / auto-ready)** — *closes the ghost-seat
block.* Add a mid-game `vacateSeat` command (distinct from lobby-only `releaseSeat`). It must
**not** shrink `activeSeats` (load-bearing for `findWinner` and history snapshots) — instead
flag the seat absent so the P0 enforce path auto-readies it each phase. Gate any seat→bot
conversion on a **confirmed stale `last_seen_at`** (>~10s) to avoid replacing a mid-reconnect
player; the 30d cookie lets a returning player reclaim their seat. Fix `leaveRoom` to call
`vacateSeat` mid-game. Optional: `navigator.sendBeacon` on `beforeunload` for fast vacate.

**P2-c · Host migration + presence UX** — *lowest priority; P0+P1 already remove host as a
stall SPOF.* Once enforcement and bots are host-independent, host powers shrink to
`startGame` + manual force + bot management. Add single-winner host migration inside the
enforce/CAS path: when the host is confirmed offline, promote the longest-seated online member
(gate on current host still offline to avoid two hosts). Surface per-seat presence
(online/away/offline + isBot) in the projection for presence dots and an "auto-advancing in
Ns" badge. Add an `is_bot` column (backfill from the `🤖 ` prefix) only if/when presence UI or
the cron floor actually ships.

---

## 6. Risks, gotchas & edge cases to test

- **Write-on-read:** enforcement/bot-driving now mutate inside `loadRoomView` (a read path), so
  every spectator poll can write. Acceptable at this scale, but: one-phase / one-bot-seat per
  call, debounce bots (`botTickedAt`), ensure **no edge cache** fronts `/events` or
  `+page.server.ts`, and ship CAS jitter so the amplified write load doesn't 409-starve real
  commands.
- **Multi-phase command stamping** — test `enterEncounter` auto-skip→location and
  `commitCleanup`→`beginNavigation`: assert the freshly-entered phase always has a fresh,
  future `phaseDeadline` (never stale, never null).
- **Disconnect mid-summon** — open a `pendingDraw`, expire the deadline, run enforce: assert
  **bag totals are conserved** (the `drainPendingBeforeAdvance` wiring).
- **Two polls race the same deadline** — assert single advance, revision increments by one.
- **Host == sole player** disconnects — collapses into the zero-clients case; verify
  lazy-on-reconnect fast-forwards correctly on their return.
- **Absent-human seat with a null player object** — `botSeatNeedsToAct` returns false for null
  players, so prefer the `forceAdvancePhase` auto-ready path (sets `phaseReady` directly) over
  routing an absent human through the bot policy.
- **Accumulator double-apply** — simulate a lost-but-applied response + manual retry with the
  same `clientRequestId`; assert VP applied once.

---

## 7. Decisions for you

1. **Zero-clients floor (§5 P0-c):**
   - **(A) Lazy-on-reconnect — recommended.** Zero infra. A room with nobody connected stays
     frozen until someone reopens it, then snaps to current. Fine for private rooms.
   - **(B) `pg_cron` sweeper** (~15-30s) hitting a service-secret-gated `/api/play/sweep` that
     calls the **TS** `enforceRoomDeadlines` + bot nudge (never reimplement phase logic in
     plpgsql). Only worth it if games must **complete unattended**.
2. **Phase durations** — navigation 60s exists; propose encounter/location/cleanup ~120s with
   P2 activity-extension. Tune to taste.
3. **Idempotency scope** — confirm we only harden the accumulator commands (the audit shows
   reward/location are already idempotent).

---

## 8. Suggested order of work

1. **P0-a + P0-b + P0-c** together (one coherent change: server-authoritative enforcement +
   real presence signal + recovery floor). This is the whole "un-stallable" win.
2. **P1-a** (host-independent bots) — small, high value, removes the other host SPOF.
3. **P1-b** (reconnect + keepalive + maxDuration) — UX; stops frozen boards.
4. **P1-c** (accumulator idempotency + CAS jitter) — cheap correctness insurance.
5. **P2** polish (activity extension → graceful leave → host migration / presence UX) as time
   allows.

Each phase is independently shippable and testable against the existing vitest engine suite +
playwright e2e flows.

---

## 9. Changelog

### 2026-06-16 — P0 implemented (un-stallable)

- **`types.ts`** — added `phaseDeadline: number | null` to `PublicGameState` +
  `SpectatorProjection`; added `ENCOUNTER_SECONDS=90` / `LOCATION_SECONDS=120` /
  `CLEANUP_SECONDS=90` and a pure `phaseDurationMs(phase)` helper.
- **`phases.ts`** — every phase-entry fn (`beginNavigation`, `enterEncounter`,
  `enterLocation`, `enterCleanup`) now nulls `phaseDeadline`, so the server always
  re-stamps the freshly-entered phase.
- **`runtime.ts`** — extracted the location reward/draw drain into shared
  `drainPendingBeforeAdvance(state, catalog)` (now used by both the host
  `forceAdvancePhase` command and enforcement); added exported pure
  `applyDeadlineAdvance(state, catalog)` (= forced advance minus the host check, bumps
  revision); added `phaseDeadline` to lobby state, `ensureStateShape` backfill, and the
  projection.
- **`server/service.ts`** — added `stampPhaseDeadline` (server-clock-only stamp of the
  current phase, mirrors `navigationDeadline`), `maybeEnforceDeadline` (single-winner CAS
  advance when `Date.now() > phaseDeadline`), and exported `enforceRoomDeadlines`. Wired
  into `loadRoomView` (every SSE poll + the page-load/reconnect path = the P0-c lazy floor)
  and the top of `runRoomCommand`. **P0-b:** `syncMemberMirrors` no longer writes
  `last_seen_at`; `runRoomCommand` now bumps it for the acting member — so `last_seen_at`
  is a real per-player liveness signal (verified nothing reads it yet).
- **`deadlineEnforcement.test.ts`** (new) — 7 tests: each phase advances past a silent
  seat, `phaseDeadline` nulled on entry, revision bumped, no-op when inactive, and the
  bag-conservation leak guard (an open summon's draws are returned, not leaked).

**Decisions baked in:** server clock only (no client timestamp trusted); one phase
advanced per call (re-stamps a future deadline) so a long-idle room steps forward one
phase per poll; the host's client-side `onNavExpire` was left host-gated (NOT dropped) —
server enforcement makes it redundant, and dropping it would make non-hosts spam a
host-only command. Zero-clients floor = option A (lazy-on-reconnect), which falls out for
free because the page-load path calls `loadRoomView`.
