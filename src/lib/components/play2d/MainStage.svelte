<script lang="ts">
	import type {
		AwakenDiscardRef,
		SpectatorProjection,
		SeatColor,
		NavigationDestination,
		PlayerProjection
	} from '$lib/play/types';
	import { isEvilAlignment } from '$lib/play/types';
	import { getLocationConfig, LOCATION_ACCENT, splatFor } from '$lib/play/locations';
	import type { getAssetState } from '$lib/stores/assetStore.svelte';
	import { seatAccent } from './helpers';
	import SpiritWorldBoard from './SpiritWorldBoard.svelte';
	import ConfirmDestinationCircle from './ConfirmDestinationCircle.svelte';
	import DrawTray from './DrawTray.svelte';
	import CombatOverlay from './CombatOverlay.svelte';
	import LocationInteractionMenu from './LocationInteractionMenu.svelte';
	import MonsterRewardMenu from './MonsterRewardMenu.svelte';
	import ActionResult from './ActionResult.svelte';
	import StageCard from './StageCard.svelte';
	import InfiltratorSwap from './InfiltratorSwap.svelte';
	import AwakeningSheet from './AwakeningSheet.svelte';
	import AugmentPlacement from './AugmentPlacement.svelte';
	import CorruptionDiscard from './CorruptionDiscard.svelte';
	import DecisionCards from './DecisionCards.svelte';

	export type ActiveAction = 'rest' | 'cultivate' | 'combat' | 'reward' | null;

	interface Props {
		room: SpectatorProjection;
		mySeat: SeatColor | null;
		myPlayer: PlayerProjection | null;
		assets: ReturnType<typeof getAssetState>;
		spiritImages?: Map<string, string>;
		activeAction: ActiveAction;
		/** Navigation: can this viewer still pick/lock a destination. */
		canPick: boolean;
		lockedDestination: NavigationDestination | null;
		/** When the local player has locked (navigation still open), the chosen
		 *  destination — drives the full-screen "confirmed" zoom panel. */
		confirmedDestination?: NavigationDestination | null;
		onExitConfirmed?: () => void;
		/** True once the local player has stepped into the committed realm. */
		inRealm?: boolean;
		/** While the reveal → realm-enter choreography is playing, keep the stage clear
		 *  so the location interaction UI doesn't flash in before the zoom completes. */
		holdRealmEntry?: boolean;
		/** The carousel card to render as the live "portal" (hover preview / locked pick). */
		focusedDestination?: NavigationDestination | null;
		onHoverDestination?: (destination: NavigationDestination | null) => void;
		onSelectDestination: (destination: NavigationDestination) => void;
		onResolveInteraction: (rowIndex: number, choices: number[]) => void;
		onStartCombat: () => void;
		/** Claim monster-kill rewards (Arcane Abyss): picks = track indices. */
		onClaimReward: (picks: number[], choices: number[]) => void;
		onSummon: (guid: string) => void;
		onDiscard: () => void;
		/** Soul Weaver: return the current draw and draw again (one-shot per summon). */
		onRedraw: () => void;
		/** Dismiss a result/combat stage → back to the action grid. */
		onContinue: () => void;
		/** Awaken a face-down spirit; `discardRefs` names which items pay a discard
		 *  cost when the owner chose (omitted ⇒ engine auto-picks). */
		onAwaken: (slotIndex: number, discardRefs?: AwakenDiscardRef[]) => void;
		/** Discard a held rune/relic during Cleanup to get under the carry limit. */
		onDiscardRune: (slotIndex: number) => void;
		/** Infiltrator: swap one attack die with each co-located player. */
		onInfiltratorSwap: (
			swaps: { targetSeat: SeatColor; myInstanceId: string; theirInstanceId: string }[]
		) => void;
		/** Cast this Evil player's vote to attack the Good players sharing the location. */
		onAttackGroup: () => void;
		/** Hold/decline the encounter (an Evil decline cancels the group attack here). */
		onPass: () => void;
		/** Claim the Awakening-Phase rewards (Cleanup). `taintedPotential` = Cursed
		 *  Spirit Tainted units taken as potential (rest Enchanted Attack); `relicPicks`
		 *  = chosen relic index (into the 5 relics) per Cursed Spirit Corrupt unit. */
		onClaimAwakenReward: (taintedPotential: number, relicPicks: number[]) => void;
		/** Resolve an opt-in/choice ability card (Purifier class pick, etc.) in the sheet. */
		onResolveDecision: (decisionId: string, optionId: string) => void;
		/** Dismiss a hand-resolved (manual) prompt from the sheet. */
		onDismissManual: (id: string) => void;
		/** Place a chosen Spirit Augment (class) onto a spirit (in-stage placement). */
		onPlaceAugment: (
			augmentIndex: number,
			augmentRuneId: string,
			spiritSlotIndex: number,
			className: string
		) => void;
		/** Discard a spirit by slot index (forced corruption discard). */
		onDiscardSpirit: (slotIndex: number) => void;
		busy?: boolean;
	}

	let {
		room,
		mySeat,
		myPlayer,
		assets,
		spiritImages = new Map(),
		activeAction,
		canPick,
		lockedDestination,
		confirmedDestination = null,
		onExitConfirmed,
		inRealm = false,
		holdRealmEntry = false,
		focusedDestination = null,
		onHoverDestination,
		onSelectDestination,
		onResolveInteraction,
		onStartCombat,
		onClaimReward,
		onSummon,
		onDiscard,
		onRedraw,
		onContinue,
		onAwaken,
		onDiscardRune,
		onInfiltratorSwap,
		onAttackGroup,
		onPass,
		onClaimAwakenReward,
		onResolveDecision,
		onDismissManual,
		onPlaceAugment,
		onDiscardSpirit,
		busy = false
	}: Props = $props();

	const myLocationConfig = $derived(
		myPlayer?.navigationDestination ? getLocationConfig(myPlayer.navigationDestination) : null
	);
	const myLocationAsset = $derived(
		myPlayer?.navigationDestination
			? (assets.gameLocations.get(myPlayer.navigationDestination) ?? null)
			: null
	);
	const myAccent = $derived(
		myLocationConfig ? (LOCATION_ACCENT[myLocationConfig.name] ?? '#8d8aa1') : '#8d8aa1'
	);
	const pendingDraw = $derived(myPlayer?.pendingDraw ?? null);
	const pendingReward = $derived(myPlayer?.pendingReward ?? null);
	// The Awakening-phase claim/awaken/decision UX moved to AwakeningSheet (driven by
	// the unified `abilityInteractions`); this stage just hosts it during cleanup.
	const myReady = $derived(myPlayer?.phaseReady ?? false);

	// At the Abyss, monster combat is once per round (plus any extra-action credits).
	// Once it's spent, the "Fight the Monster" card becomes a passive prompt.
	// Monster-combat allowance is 1 + extra credits (Ironmane grants +1 ⇒ two fights),
	// so we render ONE fight card per allowed fight; each is spent left-to-right as
	// `combatUsedCount` rises.
	const combatUsedCount = $derived(
		(myPlayer?.actionsUsedThisRound ?? []).filter((a) => a === 'combat').length
	);
	const combatAllowance = $derived(1 + (myPlayer?.extraActions?.combat ?? 0));

	// ── Infiltrator: standalone Location-phase dice swap ───────────────────────
	// Eligible when the local player has an awakened Infiltrator, hasn't swapped
	// this round, holds ≥1 attack die, and shares a location with players who have
	// dice to swap. Targets carry each co-located player's (public) attack pool.
	const infiltratorTargets = $derived.by(() => {
		const dest = myPlayer?.navigationDestination;
		if (!dest || dest === 'Arcane Abyss') return [];
		return room.activeSeats
			.filter((s) => s !== mySeat && room.players[s]?.navigationDestination === dest)
			.map((s) => ({
				seat: s,
				name: room.players[s]?.playerColor ?? s,
				accent: seatAccent(s),
				dice: room.players[s]?.attackDice ?? []
			}))
			.filter((t) => t.dice.length > 0);
	});
	const canInfiltrate = $derived(
		(myPlayer?.spirits ?? []).some((s) => !s.isFaceDown && (s.classes?.Infiltrator ?? 0) > 0) &&
			!(myPlayer?.actionsUsedThisRound ?? []).includes('infiltratorSwap') &&
			(myPlayer?.attackDice.length ?? 0) > 0 &&
			infiltratorTargets.length > 0
	);
	let showInfiltrator = $state(false);
	$effect(() => {
		// Auto-close the swap screen if eligibility lapses (swap done / left location).
		if (showInfiltrator && !canInfiltrate) showInfiltrator = false;
	});

	// Spectators always see the read-only destination board.
	const showNavBoard = $derived(room.phase === 'navigation' || !mySeat);

	const myDestination = $derived(myPlayer?.navigationDestination ?? null);
	const amEvil = $derived(myPlayer ? isEvilAlignment(myPlayer.statusLevel) : false);
	const encounterTargets = $derived.by(() => {
		if (!amEvil || !myDestination || myDestination === 'Arcane Abyss') return [] as SeatColor[];
		return room.activeSeats.filter(
			(s) =>
				s !== mySeat &&
				room.players[s]?.navigationDestination === myDestination &&
				!isEvilAlignment(room.players[s]?.statusLevel ?? 0)
		);
	});
</script>

<div class="stage" class:realm={inRealm} data-testid="main-stage" data-phase={room.phase}>
	{#if inRealm}<div class="realm-veil" aria-hidden="true"></div>{/if}
	<div class="view">
	{#if holdRealmEntry}
		<!-- Reveal → realm-enter choreography is playing over the splat; hold the stage
		     clear so the location interaction UI doesn't flash in before the zoom. -->
	{:else if showNavBoard}
		{#if confirmedDestination && mySeat}
			<!-- The navigator clears to an enhanced "Going to {World}" circle hosting the
			     chosen world's OWN masked splat. It measures its cell and sizes itself with
			     compassDiameter (like the compass) so it is never cropped, and falls back to
			     the plain confirmed panel when a circle won't fit. -->
			<ConfirmDestinationCircle
				destination={confirmedDestination}
				location={assets.gameLocations.get(confirmedDestination) ?? null}
				iconPool={assets.iconPool}
				accent={LOCATION_ACCENT[confirmedDestination] ?? '#8d8aa1'}
				monster={room.monster}
				splatSrc={splatFor(confirmedDestination)}
				canExit={true}
				onExit={() => onExitConfirmed?.()}
			/>
		{:else}
			<SpiritWorldBoard
				{room}
				{mySeat}
				selectable={canPick}
				selectedDestination={lockedDestination}
				focusedDestination={focusedDestination}
				onHover={onHoverDestination}
				onSelect={onSelectDestination}
				monster={room.monster}
				gameLocations={assets.gameLocations}
				iconPool={assets.iconPool}
			/>
		{/if}
	{:else if (myPlayer?.pendingCorruptionDiscard?.count ?? 0) > 0}
		<!-- Forced corruption discard — a sacrifice owed the moment you corrupt; surfaced
		     in-stage in whatever phase it's pending (combat sets it in location/encounter). -->
		<CorruptionDiscard
			player={myPlayer}
			{assets}
			{spiritImages}
			{busy}
			count={myPlayer?.pendingCorruptionDiscard?.count ?? 0}
			onDiscard={onDiscardSpirit}
		/>
	{:else if (myPlayer?.unplacedAugments?.length ?? 0) > 0}
		<!-- Spirit Augment placement — in-stage (pick an augment icon, click a spirit). -->
		<AugmentPlacement player={myPlayer} {assets} {spiritImages} {busy} onPlace={onPlaceAugment} />
	{:else if (room.phase === 'location' || room.phase === 'encounter') && (myPlayer?.pendingDecisions?.length ?? 0) > 0}
		<!-- Ability decision cards — in-stage (Awakening-step decisions render in the AwakeningSheet). -->
		<DecisionCards player={myPlayer} onResolve={onResolveDecision} />
	{:else if room.phase === 'encounter'}
		{#if myReady}
			<div class="waiting" data-testid="stage-waiting">Waiting for other players…</div>
		{:else if encounterTargets.length > 0}
			<div class="stage-head">You are Evil — strike together</div>
			<div class="enc-sub">
				Attack the Good players here for +2 VP. Every Evil player at this location must agree.
			</div>
			<div class="encounter-targets" data-testid="encounter-targets">
				{#each encounterTargets as target (target)}
					<span class="enc-target" style={`--c:${seatAccent(target)}`}>{target}</span>
				{/each}
			</div>
			<div class="encounter-actions">
				<button
					type="button"
					class="enc-btn attack"
					data-testid="encounter-attack"
					disabled={busy}
					onclick={() => onAttackGroup()}
				>⚔ Attack together</button>
				<button
					type="button"
					class="enc-btn hold"
					data-testid="encounter-hold"
					disabled={busy}
					onclick={() => onPass()}
				>Hold</button>
			</div>
		{:else}
			<div class="waiting">Resolving encounters…</div>
		{/if}
	{:else if room.phase === 'location'}
		{#if pendingDraw}
			<div class="summon-stage"><DrawTray player={myPlayer} {spiritImages} disabled={busy} {onSummon} {onDiscard} {onRedraw} /></div>
		{:else if activeAction === 'combat'}
			<div class="combat-stage">
				<CombatOverlay combats={room.combats} {mySeat} />
				<button type="button" class="continue" data-testid="combat-continue" onclick={() => onContinue()}>
					{pendingReward ? 'Claim rewards' : 'Continue'}
				</button>
			</div>
		{:else if pendingReward}
			<MonsterRewardMenu
				pending={pendingReward}
				iconPool={assets.iconPool}
				accent={myAccent}
				{busy}
				onClaim={onClaimReward}
			/>
		{:else if activeAction === 'rest' || activeAction === 'cultivate' || activeAction === 'reward'}
			<ActionResult result={myPlayer?.lastAction ?? null} {onContinue} />
		{:else if myReady}
			<div class="waiting" data-testid="stage-waiting">You're ready — waiting for other players…</div>
		{:else}
			<div class="stage-head">{myLocationConfig?.name ?? 'Location'} — choose an action</div>
			{#if myLocationConfig?.combatOnly}
				<div class="card-grid">
					{#each Array(combatAllowance) as _, i (i)}
						{@const spent = i < combatUsedCount}
						<StageCard
							title="Fight the Monster"
							subtitle={combatAllowance > 1
								? spent
									? `Fight ${i + 1} of ${combatAllowance} — done.`
									: `Fight ${i + 1} of ${combatAllowance} — battle the invading monster.`
								: spent
									? 'You have fought this round — pass your turn.'
									: 'Battle the invading monster for Victory Points and rewards.'}
							glyph="⚔"
							accent={myAccent}
							disabled={busy || spent}
							testid={combatAllowance > 1 ? `action-monsterCombat-${i}` : 'action-monsterCombat'}
							onClick={() => onStartCombat()}
						/>
					{/each}
				</div>
			{:else if showInfiltrator}
				<InfiltratorSwap
					myDice={myPlayer?.attackDice ?? []}
					targets={infiltratorTargets}
					{busy}
					onConfirm={(swaps) => {
						onInfiltratorSwap(swaps);
						showInfiltrator = false;
					}}
					onCancel={() => (showInfiltrator = false)}
				/>
			{:else}
				{#if canInfiltrate}
					<button
						type="button"
						class="infil-open"
						disabled={busy}
						data-testid="infiltrator-open"
						onclick={() => (showInfiltrator = true)}
					>
						🎴 Infiltrator — swap dice with co-located players
					</button>
				{/if}
				<LocationInteractionMenu
					location={myLocationAsset}
					iconPool={assets.iconPool}
					player={myPlayer}
					accent={myAccent}
					{busy}
					onResolve={onResolveInteraction}
				/>
			{/if}
		{/if}
	{:else if room.phase === 'benefits' || room.phase === 'awakening' || room.phase === 'cleanup'}
		<AwakeningSheet
			{room}
			{myPlayer}
			{assets}
			{busy}
			{onAwaken}
			{onResolveDecision}
			{onClaimAwakenReward}
			{onDiscardRune}
			{onDismissManual}
		/>
	{/if}
	</div>
</div>

<style>
	/* Each phase renders exactly ONE .view. The stage is a robust full-area grid
	   that centers that view on both axes — independent of any other view's
	   layout, and with no bottom reservation pinning it upward. */
	.stage {
		width: 100%;
		height: 100%;
		display: grid;
		/* minmax(0,1fr) caps the column at the container width. Without it the
		   implicit `auto` column sizes to its content's max-content — which a wide
		   child (e.g. the mobile nav carousel's 5 slides) blows past the viewport,
		   overflowing/clipping instead of letting overflow-x scroll. */
		grid-template-columns: minmax(0, 1fr);
		place-items: center;
		min-height: 0;
		overflow: hidden;
	}
	/* A self-contained, centered block per phase (header + content stack). It takes
	   the FULL stage height (not shrink-to-content) so children that need a definite
	   container — the location interaction menu's scroll region, and the navigator
	   board whose compass-vs-cards decision measures the available area — get a
	   stable size. Content still centers via justify-content. */
	.view {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		width: 100%;
		max-width: 100%;
		height: 100%;
		max-height: 100%;
		min-height: 0;
	}
	/* Inside the realm the splat is sharp and full behind the HUD — a soft pool of
	   shade under the centered content keeps it legible against the live world
	   without hiding the surrounding scene. */
	.realm-veil {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background: radial-gradient(
			ellipse 58% 54% at 50% 52%,
			rgba(8, 5, 16, 0.62) 0%,
			rgba(8, 5, 16, 0.32) 55%,
			transparent 100%
		);
		animation: veil-in 700ms ease forwards;
	}
	/* The HUD rises into place as the camera dollies into the realm. */
	.stage.realm .view {
		animation: hud-rise 620ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
	}
	@keyframes veil-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes hud-rise {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.realm-veil,
		.stage.realm .view {
			animation-duration: 1ms;
			animation-delay: 0ms;
		}
	}
	.view :global(.board) {
		width: 100%;
		align-self: center;
	}
	.stage-head {
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 3.2vw, 2.8rem);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #fff;
		text-align: center;
		line-height: 1.1;
	}
	.card-grid {
		display: flex;
		flex-wrap: nowrap; /* always a single row */
		gap: 0.85rem;
		justify-content: center;
		align-items: stretch;
		/* Stay centered and clear of the side floats (matches .action-grid). */
		width: 100%;
		max-width: min(1100px, calc(100vw - 700px));
		margin: 0 auto;
	}
	/* Awakening-Phase recap — a small attributed banner for passive grants this
	   cleanup (World Ender VP, etc.) so they aren't a silent number change. */
	.card-grid > :global(.stage-card) {
		flex: 1 1 0;
		min-width: 0;
		width: auto;
		max-width: 16rem;
	}
	.waiting {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 2.4vw, 2rem);
		letter-spacing: 0.06em;
		color: var(--brand-cyan, #5cdfff);
		text-align: center;
	}
	.summon-stage {
		width: 100%;
	}
	.infil-open {
		font: inherit;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.04em;
		padding: 0.6rem 1.1rem;
		margin-bottom: 0.8rem;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--brand-violet, #5a2bff) 60%, transparent);
		background: color-mix(in srgb, var(--brand-violet, #5a2bff) 18%, rgba(15, 10, 28, 0.5));
		color: #fff;
		cursor: pointer;
		transition: transform 140ms ease, box-shadow 140ms ease;
	}
	.infil-open:not(:disabled):hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 18px color-mix(in srgb, var(--brand-violet, #5a2bff) 35%, transparent);
	}
	.infil-open:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.combat-stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		width: min(560px, 100%);
	}
	.continue {
		padding: 10px 22px;
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border: none;
		border-radius: 3px;
		background: var(--brand-magenta, #ff2bc7);
		color: #fff;
		cursor: pointer;
		transition: background 140ms ease;
	}
	.continue:hover {
		background: var(--brand-magenta-soft, #ff7fd9);
	}

	/* ── Encounter (group PvP) decision ─────────────────────────────────────── */
	.enc-sub {
		font-size: clamp(0.95rem, 1.6vw, 1.15rem);
		color: var(--color-parchment, #d8d2e8);
		text-align: center;
		max-width: 34rem;
		line-height: 1.5;
	}
	.encounter-targets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
	}
	.enc-target {
		font-family: var(--font-display);
		font-size: 1.1rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fff;
		padding: 0.3rem 0.85rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
		background: color-mix(in srgb, var(--c) 16%, rgba(10, 7, 24, 0.6));
	}
	.encounter-actions {
		display: flex;
		gap: 0.85rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.enc-btn {
		padding: 12px 26px;
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-radius: 4px;
		border: 1px solid transparent;
		cursor: pointer;
		transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
	}
	.enc-btn.attack {
		border: none;
		background: var(--color-blood, #e05858);
		color: #fff;
	}
	.enc-btn.attack:not(:disabled):hover {
		background: #ff7373;
	}
	.enc-btn.hold {
		background: rgba(10, 7, 24, 0.6);
		border-color: var(--color-mist, #3a2670);
		color: var(--color-fog, #b9b2cf);
	}
	.enc-btn.hold:not(:disabled):hover {
		border-color: var(--color-fog, #b9b2cf);
		color: #fff;
	}
	.enc-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
