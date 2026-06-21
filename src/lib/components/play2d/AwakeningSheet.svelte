<script lang="ts">
	import type {
		AbilityInteraction,
		AwakenGrant,
		AwakenDiscardOption,
		AwakenDiscardRef,
		PlayerProjection,
		SpectatorProjection
	} from '$lib/play/types';
	import { RUNE_CARRY_LIMIT } from '$lib/play/types';
	import { relicOptions } from '$lib/play/locationInteractions';
	import type { getAssetState } from '$lib/stores/assetStore.svelte';
	import { runeIconUrl, storageUrl, spiritBackImageUrl } from './helpers';

	interface Props {
		room: SpectatorProjection;
		myPlayer: PlayerProjection | null;
		assets: ReturnType<typeof getAssetState>;
		busy?: boolean;
		/** Awaken a face-down spirit; `discardRefs` names which items pay a discard cost. */
		onAwaken: (slotIndex: number, discardRefs?: AwakenDiscardRef[]) => void;
		/** Resolve an opt-in/choice ability card (Purifier class pick, etc.). */
		onResolveDecision: (decisionId: string, optionId: string) => void;
		/** Claim the Awakening-Phase reward grants (Cursed Spirit / Golden Ruler / …). */
		onClaimAwakenReward: (taintedPotential: number, relicPicks: number[]) => void;
		/** Discard a held rune/relic to get under the carry limit. */
		onDiscardRune: (slotIndex: number) => void;
		/** Dismiss a hand-resolved (manual) prompt. */
		onDismissManual: (id: string) => void;
	}

	let {
		room,
		myPlayer,
		assets,
		busy = false,
		onAwaken,
		onResolveDecision,
		onClaimAwakenReward,
		onDiscardRune,
		onDismissManual
	}: Props = $props();

	/** The unawakened (face-down) back-side art for the spirit in this slot. */
	function spiritArt(slotIndex: number): string | null {
		const id = myPlayer?.spirits.find((s) => s.slotIndex === slotIndex)?.id;
		return id ? spiritBackImageUrl(id) : null;
	}

	// ── Summon-style card flourishes (mirrors DrawTray) ────────────────────────
	// ~1 in 3 spirits barrel-roll as they fly in (stable per slot).
	function spins(slotIndex: number): boolean {
		return slotIndex % 3 === 0;
	}
	// Cursor-parallax tilt: rotate the spirit toward the pointer for a 3D feel.
	// Disabled on coarse (touch) pointers — the tilt would freeze on lift.
	const isFinePointer =
		typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
	function tilt(event: PointerEvent) {
		if (!isFinePointer) return;
		const card = event.currentTarget as HTMLElement;
		const inner = card.querySelector('.tiltable') as HTMLElement | null;
		if (!inner) return;
		const r = card.getBoundingClientRect();
		const px = (event.clientX - r.left) / r.width - 0.5;
		const py = (event.clientY - r.top) / r.height - 0.5;
		inner.style.transform = `rotateY(${px * 26}deg) rotateX(${-py * 26}deg) scale(1.06)`;
	}
	function untilt(event: PointerEvent) {
		if (!isFinePointer) return;
		const inner = (event.currentTarget as HTMLElement).querySelector(
			'.tiltable'
		) as HTMLElement | null;
		if (inner) inner.style.transform = '';
	}

	// The unified interaction list, split by kind. Corruption discard + augment
	// placement are board interactions handled by their dedicated forced overlays
	// (which layer above this sheet); everything else renders here as one screen.
	const interactions = $derived<AbilityInteraction[]>(myPlayer?.abilityInteractions ?? []);
	const reward = $derived(
		interactions.find((i) => i.kind === 'reward') as
			| Extract<AbilityInteraction, { kind: 'reward' }>
			| undefined
	);
	const choices = $derived(
		interactions.filter((i) => i.kind === 'choice') as Extract<
			AbilityInteraction,
			{ kind: 'choice' }
		>[]
	);
	const offers = $derived(
		interactions.filter((i) => i.kind === 'awaken') as Extract<
			AbilityInteraction,
			{ kind: 'awaken' }
		>[]
	);
	const locked = $derived(
		interactions.filter((i) => i.kind === 'awakenLocked') as Extract<
			AbilityInteraction,
			{ kind: 'awakenLocked' }
		>[]
	);
	const manuals = $derived(
		interactions.filter((i) => i.kind === 'manual') as Extract<
			AbilityInteraction,
			{ kind: 'manual' }
		>[]
	);

	// ── Awakening-phase recap (passive grants that fired this cleanup) ─────────
	const recap = $derived(
		myPlayer?.lastAction?.key === 'awakening' ? (myPlayer.lastAction.log ?? []) : []
	);

	// ── Reward claim (tainted split + relic chooser) ──────────────────────────
	const grants = $derived<AwakenGrant[]>(reward?.grants ?? []);
	const taintedGrant = $derived(grants.find((g) => g.kind === 'taintedChoice') ?? null);
	const relicGrant = $derived(grants.find((g) => g.kind === 'relicChoice') ?? null);
	const fixedGrants = $derived(
		grants.filter((g) => g.kind === 'vp' || g.kind === 'attackDice' || g.kind === 'augment')
	);
	const relicChoices = $derived(
		relicOptions().map((r) => ({
			name: r.name,
			icon: storageUrl(assets.matAssets.get(r.runeId)?.icon_path ?? null)
		}))
	);
	function grantLabel(g: AwakenGrant): string {
		if (g.kind === 'vp') return `Gain ${g.amount} Victory Point${g.amount === 1 ? '' : 's'}`;
		if (g.kind === 'attackDice') {
			const tier = g.tier.charAt(0).toUpperCase() + g.tier.slice(1);
			return `Gain ${g.amount} ${tier} Attack die${g.amount === 1 ? '' : 's'}`;
		}
		if (g.kind === 'augment') return `Gain ${g.amount} Spirit Augment${g.amount === 1 ? '' : 's'}`;
		return '';
	}
	let taintedPotential = $state(0);
	let relicPicks = $state<number[]>([]);
	let hadReward = false;
	$effect(() => {
		const has = !!reward;
		if (has && !hadReward) {
			taintedPotential = 0;
			relicPicks = Array.from({ length: relicGrant?.amount ?? 0 }, () => 0);
		}
		hadReward = has;
	});
	const taintedMax = $derived(taintedGrant?.amount ?? 0);
	const taintedPotentialClamped = $derived(Math.max(0, Math.min(taintedPotential, taintedMax)));
	const taintedEnchanted = $derived(taintedMax - taintedPotentialClamped);
	function pickRelic(unit: number, choice: number) {
		relicPicks = relicPicks.map((v, i) => (i === unit ? choice : v));
	}

	// ── Awaken discard picker (choose which item to spend) ─────────────────────
	let pickingSlot = $state<number | null>(null);
	let pickedIdx = $state<number[]>([]);
	const pickingOffer = $derived(
		pickingSlot === null ? null : (offers.find((o) => o.slotIndex === pickingSlot) ?? null)
	);
	$effect(() => {
		if (pickingSlot !== null && !pickingOffer) {
			pickingSlot = null;
			pickedIdx = [];
		}
	});
	function optionIcon(option: AwakenDiscardOption): string | null {
		if (!option.runeId) return null;
		return storageUrl(assets.matAssets.get(option.runeId)?.icon_path ?? null);
	}
	function clickOffer(offer: Extract<AbilityInteraction, { kind: 'awaken' }>) {
		// Open the picker whenever the cost lists selectable items — even when the count
		// of candidates equals the required number — so the owner always chooses/confirms
		// WHICH items are discarded (especially spirits, which you never want auto-shed).
		// Fixed costs report no options (e.g. "discard 4 attack dice") ⇒ awaken on click.
		if (offer.discardCount > 0 && offer.options.length >= offer.discardCount) {
			pickingSlot = offer.slotIndex;
			pickedIdx = [];
			return;
		}
		onAwaken(offer.slotIndex);
	}
	function togglePick(offer: Extract<AbilityInteraction, { kind: 'awaken' }>, index: number) {
		if (pickedIdx.includes(index)) pickedIdx = pickedIdx.filter((i) => i !== index);
		else if (pickedIdx.length < offer.discardCount) pickedIdx = [...pickedIdx, index];
	}
	function confirmPick(offer: Extract<AbilityInteraction, { kind: 'awaken' }>) {
		if (pickedIdx.length !== offer.discardCount) return;
		onAwaken(
			offer.slotIndex,
			pickedIdx.map((i) => offer.options[i].ref)
		);
		pickingSlot = null;
		pickedIdx = [];
	}
	function cancelPick() {
		pickingSlot = null;
		pickedIdx = [];
	}

	// ── Rune overflow (carry-limit trim) ──────────────────────────────────────
	const heldRunes = $derived((myPlayer?.mats ?? []).filter((r) => r.hasRune));
	const runeOverLimit = $derived(heldRunes.length > RUNE_CARRY_LIMIT);

	const myReady = $derived(myPlayer?.phaseReady ?? false);

	// ── Three-step resolution sequence (benefits → awakening → cleanup) ────────
	const STEPS = [
		{ key: 'benefits', label: 'Benefits' },
		{ key: 'awakening', label: 'Awakening' },
		{ key: 'cleanup', label: 'Cleanup' }
	] as const;
	const stepIndex = $derived(STEPS.findIndex((s) => s.key === room.phase));
	const stepEyebrow = $derived(
		room.phase === 'benefits'
			? 'Benefits'
			: room.phase === 'awakening'
				? 'Awakening'
				: 'Cleanup'
	);
	const stepTitle = $derived(
		room.phase === 'benefits'
			? 'Claim what your spirits earned'
			: room.phase === 'awakening'
				? 'Awaken your spirits'
				: 'Tidy up, then pass your turn'
	);
	// Per-step "nothing left to do" — the footer Pass/Continue control handles the advance.
	const benefitsEmpty = $derived(!reward);
	const awakeningEmpty = $derived(
		choices.length === 0 &&
			offers.length === 0 &&
			locked.length === 0 &&
			manuals.length === 0 &&
			!pickingOffer
	);
	const cleanupEmpty = $derived(!runeOverLimit);
</script>

<div class="sheet" data-testid="awakening-sheet" data-step={room.phase}>
	<header class="sheet-head">
		<span class="sheet-eyebrow">{stepEyebrow}</span>
		<h2 class="sheet-title">{stepTitle}</h2>
		<ol class="stepper" data-testid="cleanup-stepper">
			{#each STEPS as s, i (s.key)}
				<li class:active={s.key === room.phase} class:done={i < stepIndex}>
					<span class="step-dot">{i + 1}</span>
					<span class="step-name">{s.label}</span>
				</li>
			{/each}
		</ol>
	</header>

	{#if myReady}
		<div class="waiting" data-testid="stage-waiting">Ready ✓ — waiting for other players…</div>
	{:else if room.phase === 'benefits'}
		<!-- Step 1 · Benefits — claim Awakening-Phase class grants ───────────── -->
		{#if recap.length > 0}
			<section class="card recap" data-testid="awakening-recap">
				<span class="card-eyebrow">This round</span>
				{#each recap as line (line)}<span class="recap-line">{line}</span>{/each}
			</section>
		{/if}
		{#if reward}
			<section class="card claim" data-testid="awaken-claim">
				<span class="card-eyebrow">Claim your rewards</span>
				{#each fixedGrants as g (g.source + g.kind)}
					<div class="claim-line">
						<span class="claim-label">{g.source}</span>
						<span class="claim-fixed">{grantLabel(g)}</span>
						{#if g.kind === 'vp' && g.note}<span class="claim-note">{g.note}</span>{/if}
					</div>
				{/each}
				{#if taintedGrant}
					<div class="claim-line">
						<span class="claim-label">Cursed Spirit · Tainted — split {taintedMax}:</span>
						<div class="claim-split">
							<button
								type="button"
								class="step"
								data-testid="claim-potential-minus"
								disabled={busy || taintedPotentialClamped <= 0}
								aria-label="Fewer potential"
								onclick={() => (taintedPotential = Math.max(0, taintedPotentialClamped - 1))}
							>−</button>
							<span class="claim-choice"><strong data-testid="claim-potential">{taintedPotentialClamped}</strong> Potential</span>
							<button
								type="button"
								class="step"
								data-testid="claim-potential-plus"
								disabled={busy || taintedPotentialClamped >= taintedMax}
								aria-label="More potential"
								onclick={() => (taintedPotential = Math.min(taintedMax, taintedPotentialClamped + 1))}
							>+</button>
							<span class="claim-sep" aria-hidden="true">·</span>
							<span class="claim-choice"><strong data-testid="claim-enchanted">{taintedEnchanted}</strong> Enchanted Attack</span>
						</div>
					</div>
				{/if}
				{#if relicGrant}
					<div class="claim-line">
						<span class="claim-label">Cursed Spirit · Corrupt — choose {relicGrant.amount} relic{relicGrant.amount === 1 ? '' : 's'}:</span>
						<div class="relic-picks" data-testid="claim-relic-picks">
							{#each relicPicks as pick, unit (unit)}
								<div class="relic-pick">
									{#each relicChoices as rc, ri (ri)}
										<button
											type="button"
											class="relic-opt"
											class:sel={pick === ri}
											disabled={busy}
											title={rc.name}
											aria-label={rc.name}
											aria-pressed={pick === ri}
											data-testid={`claim-relic-${unit}-${ri}`}
											onclick={() => pickRelic(unit, ri)}
										>
											{#if rc.icon}<img src={rc.icon} alt={rc.name} />{:else}<span class="relic-fb">{rc.name.slice(0, 1)}</span>{/if}
										</button>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				{/if}
				<button
					type="button"
					class="primary-btn"
					data-testid="awaken-claim-btn"
					disabled={busy}
					onclick={() => onClaimAwakenReward(taintedPotentialClamped, relicPicks)}
				>Claim rewards</button>
			</section>
		{/if}
		{#if benefitsEmpty}
			<div class="all-clear" data-testid="awaken-clear">No benefits this round — continue.</div>
		{/if}
	{:else if room.phase === 'awakening'}
		<!-- Step 2 · Awakening — flip & pay for face-down spirits ───────────── -->
		<!-- Ability choices (Purifier class pick, Mod Injector, …) ─────────── -->
		{#each choices as choice (choice.id)}
			<section class="card choice" data-testid={`ability-choice-${choice.id}`}>
				<span class="card-eyebrow">Ability</span>
				<p class="choice-prompt">{choice.prompt}</p>
				<div class="choice-opts">
					{#each choice.options as option (option.id)}
						<button
							type="button"
							class="opt-btn"
							class:decline={option.id === 'no'}
							data-testid={`ability-choice-${choice.id}-${option.id}`}
							disabled={busy}
							onclick={() => onResolveDecision(choice.id, option.id)}
						>{option.label}</button>
					{/each}
				</div>
			</section>
		{/each}

		<!-- Awaken a spirit — discard picker when a choice is required ─────── -->
		{#if pickingOffer}
			<section class="card awaken-pick">
				<span class="card-eyebrow">Awaken {pickingOffer.spiritName}</span>
				<p class="pick-req">{pickingOffer.requirement} — choose {pickingOffer.discardCount} to discard</p>
				<div class="pick-grid" data-testid="awaken-discard-pick">
					{#each pickingOffer.options as option, i (i)}
						{@const url = optionIcon(option)}
						<button
							type="button"
							class="pick-opt"
							class:selected={pickedIdx.includes(i)}
							disabled={busy}
							title={option.label}
							data-testid={`discard-option-${i}`}
							onclick={() => togglePick(pickingOffer, i)}
						>
							{#if url}<img src={url} alt={option.label} />{/if}
							<span class="pick-label">{option.label}</span>
						</button>
					{/each}
				</div>
				<div class="pick-actions">
					<button
						type="button"
						class="primary-btn"
						disabled={busy || pickedIdx.length !== pickingOffer.discardCount}
						data-testid="awaken-discard-confirm"
						onclick={() => confirmPick(pickingOffer)}
					>Discard &amp; awaken ({pickedIdx.length}/{pickingOffer.discardCount})</button>
					<button type="button" class="ghost-btn" disabled={busy} onclick={cancelPick}>Cancel</button>
				</div>
			</section>
		{:else if offers.length > 0}
			<!-- No card frame — floating spirits on the stage, exactly like the Summon UX. -->
			<div class="offer-grid" data-testid="awaken-offers">
				{#each offers as offer, i (offer.slotIndex)}
					{@const art = spiritArt(offer.slotIndex)}
					<button
						type="button"
						class="offer"
						class:spin={spins(offer.slotIndex)}
						style="--i: {i}; --art: {art ? `url('${art}')` : 'none'};"
						data-testid={`awaken-${offer.slotIndex}`}
						disabled={busy}
						onclick={() => clickOffer(offer)}
						onpointermove={tilt}
						onpointerleave={untilt}
					>
						<span class="floater">
							<span class="tiltable">
								<span class="aura" aria-hidden="true"></span>
								{#if art}
									<img src={art} alt={offer.spiritName} loading="lazy" />
								{:else}
									<span class="offer-glyph" aria-hidden="true">✦</span>
								{/if}
								<span class="sheen" aria-hidden="true"></span>
							</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Not-yet-awakenable hints ───────────────────────────────────────── -->
		{#if locked.length > 0}
			<section class="card locked" data-testid="awaken-locked">
				<span class="card-eyebrow">Not ready yet</span>
				<div class="locked-grid">
					{#each locked as hint (hint.slotIndex)}
						<div class="locked-card" data-testid={`awaken-locked-${hint.slotIndex}`}>
							<span class="locked-lock" aria-hidden="true">🔒</span>
							<span class="locked-name">{hint.spiritName}</span>
							<span class="locked-req">{hint.requirement}</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Manual prompts (rare) ──────────────────────────────────────────── -->
		{#each manuals as prompt (prompt.id)}
			<section class="card manual" data-testid={`ability-manual-${prompt.id}`}>
				<span class="card-eyebrow">{prompt.source} — resolve by hand</span>
				<p class="manual-text">{prompt.text}</p>
				<button type="button" class="ghost-btn" disabled={busy} onclick={() => onDismissManual(prompt.id)}>
					Done
				</button>
			</section>
		{/each}
		{#if awakeningEmpty}
			<div class="all-clear" data-testid="awaken-clear">Nothing to awaken — continue.</div>
		{/if}
	{:else if room.phase === 'cleanup'}
		<!-- Step 3 · Cleanup — trim runes to the carry limit, then pass ─────── -->
		<!-- Rune overflow trim ─────────────────────────────────────────────── -->
		{#if runeOverLimit}
			<section class="card overflow" data-testid="rune-discard">
				<span class="card-eyebrow">Runes overflow</span>
				<p class="overflow-note">
					Only {RUNE_CARRY_LIMIT} runes carry over — discard {heldRunes.length - RUNE_CARRY_LIMIT} more.
				</p>
				<div class="rune-grid">
					{#each heldRunes as rune (rune.slotIndex)}
						{@const url = runeIconUrl(assets, rune)}
						<button
							type="button"
							class="rune-pick"
							disabled={busy}
							title={`Discard ${rune.name ?? 'rune'}`}
							data-testid={`discard-rune-${rune.slotIndex}`}
							onclick={() => onDiscardRune(rune.slotIndex)}
						>
							{#if url}<img src={url} alt={rune.name ?? 'Rune'} />{/if}
							<span class="x" aria-hidden="true">✕</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if cleanupEmpty}
			<div class="all-clear" data-testid="awaken-clear">Nothing to tidy — pass your turn.</div>
		{/if}
	{/if}
</div>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		width: 100%;
		max-width: min(640px, calc(100vw - 680px));
		max-height: 100%;
		overflow-y: auto;
		padding: 0.25rem;
	}
	@media (max-width: 900px) {
		.sheet {
			max-width: min(640px, 94vw);
		}
	}
	/* The awakening step is a full stage of floating spirits — give it the same room as
	   the Summon DrawTray so the cards render at the same size. */
	.sheet[data-step='awakening'] {
		max-width: min(1100px, calc(100vw - 700px));
	}
	@media (max-width: 900px) {
		.sheet[data-step='awakening'] {
			max-width: min(1100px, 94vw);
		}
	}
	.sheet-head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		text-align: center;
	}
	.sheet-eyebrow {
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--brand-violet-soft, #b9a7ff);
	}
	.sheet-title {
		margin: 0;
		font-family: var(--font-display);
		/* Match the other in-stage view headers (.stage-head, DrawTray .title). */
		font-size: clamp(1.8rem, 3.2vw, 2.8rem);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		line-height: 1.1;
		color: #fff;
	}

	/* Three-step progress: Benefits · Awakening · Cleanup. */
	.stepper {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1.2rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}
	.stepper li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		opacity: 0.45;
		transition: opacity 160ms ease;
	}
	.stepper li.active,
	.stepper li.done {
		opacity: 1;
	}
	.step-dot {
		width: 1.4rem;
		height: 1.4rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-family: var(--font-display);
		font-size: 0.72rem;
		color: var(--color-fog, #9a8fb8);
		border: 1px solid color-mix(in srgb, var(--brand-violet, #5a2bff) 45%, transparent);
		background: color-mix(in srgb, var(--brand-violet, #5a2bff) 12%, transparent);
	}
	.stepper li.active .step-dot {
		color: #fff;
		border-color: var(--brand-violet, #5a2bff);
		background: var(--brand-violet, #5a2bff);
		box-shadow: 0 0 12px color-mix(in srgb, var(--brand-violet, #5a2bff) 55%, transparent);
	}
	.stepper li.done .step-dot {
		color: var(--brand-cyan, #5cdfff);
		border-color: color-mix(in srgb, var(--brand-cyan, #5cdfff) 55%, transparent);
	}
	.step-name {
		font-family: var(--font-display);
		font-size: 0.74rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-parchment, #d8cfee);
	}
	@media (max-width: 640px) {
		.step-name {
			display: none;
		}
	}

	/* One consistent card frame for every ability interaction. */
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.9rem 1.05rem;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--brand-violet, #5a2bff) 28%, transparent);
		border-top: 2px solid color-mix(in srgb, var(--brand-violet, #5a2bff) 70%, transparent);
		background: color-mix(in srgb, var(--brand-violet, #5a2bff) 9%, rgba(8, 5, 16, 0.3));
		box-shadow: 0 14px 44px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.card-eyebrow {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-cyan, #5cdfff);
	}
	.recap {
		border-top-color: var(--brand-violet, #5a2bff);
	}
	.recap-line {
		font-size: 0.85rem;
		color: var(--color-parchment, #e7e0cf);
	}
	.waiting {
		font-family: var(--font-display);
		font-size: clamp(1.2rem, 2vw, 1.6rem);
		letter-spacing: 0.06em;
		color: var(--brand-cyan, #5cdfff);
		text-align: center;
		padding: 1.5rem 0;
	}
	.all-clear {
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.04em;
		color: var(--color-fog, #9a8fb8);
		text-align: center;
		padding: 0.5rem;
	}

	/* ── Buttons ─────────────────────────────────────────────────────────── */
	.primary-btn {
		align-self: flex-start;
		padding: 0.55rem 1.2rem;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: none;
		border-radius: 6px;
		background: var(--brand-magenta, #ff2bc7);
		color: #fff;
		cursor: pointer;
		transition: background 140ms ease, opacity 140ms ease;
	}
	.primary-btn:not(:disabled):hover {
		background: var(--brand-magenta-soft, #ff7fd9);
	}
	.primary-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ghost-btn {
		padding: 0.5rem 1rem;
		font: inherit;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.ghost-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Reward claim ────────────────────────────────────────────────────── */
	.claim-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.12);
	}
	.claim-label {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--brand-cyan, #5cdfff);
	}
	.claim-split {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.step {
		width: 1.9rem;
		height: 1.9rem;
		display: grid;
		place-items: center;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		background: rgba(10, 7, 20, 0.6);
		color: #fff;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}
	.step:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.claim-choice {
		font-size: 0.9rem;
		color: var(--color-bone, #efeaf7);
	}
	.claim-choice strong {
		font-family: var(--font-display);
		font-size: 1.15rem;
		color: #fff;
	}
	.claim-sep {
		color: var(--color-fog, #8d8aa1);
	}
	.claim-fixed {
		font-size: 0.95rem;
		color: var(--color-bone, #efeaf7);
	}
	.claim-note {
		font-size: 0.82rem;
		font-style: italic;
		color: var(--color-fog, #9a93b0);
	}
	.relic-picks {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.relic-pick {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.relic-opt {
		width: 2.4rem;
		height: 2.4rem;
		display: grid;
		place-items: center;
		padding: 0;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(10, 7, 20, 0.5);
		cursor: pointer;
		opacity: 0.55;
		transition: opacity 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
	}
	.relic-opt:not(:disabled):hover {
		opacity: 0.85;
	}
	.relic-opt.sel {
		opacity: 1;
		border-color: var(--brand-amber-soft, #ffd56a);
		box-shadow: 0 0 0 1px var(--brand-amber-soft, #ffd56a), 0 0 10px rgba(255, 213, 106, 0.4);
	}
	.relic-opt:disabled {
		cursor: not-allowed;
	}
	.relic-opt img {
		width: 1.8rem;
		height: 1.8rem;
		object-fit: contain;
	}
	.relic-fb {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--color-bone, #efeaf7);
	}

	/* ── Ability choice ──────────────────────────────────────────────────── */
	.choice-prompt {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--color-bone, #f5f0ff);
	}
	.choice-opts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.opt-btn {
		flex: 0 1 auto;
		min-height: 40px;
		padding: 0.5rem 0.95rem;
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid var(--brand-cyan, #24d4ff);
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.3);
		color: var(--color-parchment, #d8cfee);
		cursor: pointer;
		transition: background 140ms ease, color 140ms ease;
	}
	.opt-btn:not(:disabled):hover {
		background: color-mix(in srgb, var(--brand-cyan, #24d4ff) 25%, transparent);
		color: #fff;
	}
	.opt-btn.decline {
		border-color: rgba(255, 255, 255, 0.25);
		color: var(--color-fog, #9a8fb8);
	}
	.opt-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Awaken offers — floating spirit cards, identical to the Summon DrawTray ─ */
	/* 3D scene: the cards share one perspective so they read as volumetric. */
	.offer-grid {
		display: flex;
		gap: 1.4rem;
		flex-wrap: nowrap;
		justify-content: center;
		align-items: center;
		width: 100%;
		margin: 0 auto;
		padding: 2.5rem 0;
		perspective: 1200px;
		perspective-origin: 50% 40%;
	}
	.offer {
		display: block;
		flex: 1 1 0;
		min-width: 0;
		max-width: 17rem;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		color: inherit;
		font: inherit;
		transform-style: preserve-3d;
	}
	.offer:disabled {
		cursor: not-allowed;
	}
	.offer:disabled .floater {
		opacity: 0.5;
		animation-play-state: paused;
	}
	/* Layer 1 — emerges from the bag, then bobs/sways in 3D forever. */
	.floater {
		display: block;
		transform-style: preserve-3d;
		animation:
			summon-in 0.95s cubic-bezier(0.18, 0.7, 0.2, 1) calc(var(--i) * 0.1s) both,
			float3d calc(5.5s + var(--i) * 0.5s) ease-in-out calc(var(--i) * 0.1s + 0.95s) infinite;
	}
	.offer.spin .floater {
		animation:
			summon-in-spin 1.05s cubic-bezier(0.18, 0.7, 0.2, 1) calc(var(--i) * 0.1s) both,
			float3d calc(5.5s + var(--i) * 0.5s) ease-in-out calc(var(--i) * 0.1s + 1.05s) infinite;
	}
	/* Layer 2 — tilts toward the cursor (transform set inline by JS). */
	.tiltable {
		position: relative;
		display: block;
		transform-style: preserve-3d;
		transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.offer img {
		display: block;
		width: 100%;
		height: auto;
		object-fit: contain;
		border-radius: 10px;
		position: relative;
		z-index: 1;
		backface-visibility: hidden;
		filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.55));
		transition: filter 200ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.offer:hover img {
			filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.6))
				drop-shadow(0 0 22px color-mix(in srgb, var(--brand-magenta, #ff2bc7) 60%, transparent));
		}
	}
	.offer-glyph {
		display: grid;
		place-items: center;
		aspect-ratio: 13 / 17;
		font-size: 2.2rem;
		color: var(--brand-violet-soft, #b9a7ff);
	}
	/* A breathing aura behind the spirit (sits closer to the viewer in 3D). */
	.aura {
		position: absolute;
		inset: -14%;
		z-index: 0;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			color-mix(in srgb, var(--brand-violet, #5a2bff) 55%, transparent) 0%,
			color-mix(in srgb, var(--brand-magenta, #ff2bc7) 28%, transparent) 45%,
			transparent 70%
		);
		filter: blur(10px);
		opacity: 0.55;
		animation: aura-pulse 3.6s ease-in-out infinite;
		transform: translateZ(-40px);
	}
	@media (hover: hover) and (pointer: fine) {
		.offer:hover .aura {
			opacity: 0.9;
		}
	}
	/* A moving holographic sheen across the art, clipped to its silhouette. */
	.sheen {
		position: absolute;
		inset: 0;
		z-index: 2;
		background: linear-gradient(
			115deg,
			transparent 30%,
			rgba(255, 255, 255, 0.34) 47%,
			rgba(180, 230, 255, 0.2) 53%,
			transparent 70%
		);
		background-size: 280% 280%;
		mix-blend-mode: screen;
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms ease;
		-webkit-mask-image: var(--art, none);
		mask-image: var(--art, none);
		-webkit-mask-size: contain;
		mask-size: contain;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-position: center;
		mask-position: center;
	}
	@media (hover: hover) and (pointer: fine) {
		.offer:hover .sheen {
			opacity: 1;
			animation: sheen-sweep 1.1s ease-in-out;
		}
	}
	@keyframes summon-in {
		0% {
			opacity: 0;
			transform: translateY(190px) translateZ(-420px) rotateX(38deg) rotateZ(-10deg) scale(0.16);
			filter: blur(8px) brightness(2.6);
		}
		45% {
			opacity: 1;
			filter: blur(0) brightness(1.45);
		}
		72% {
			transform: translateY(-10px) translateZ(0) rotateX(0) rotateZ(2deg) scale(1.09);
			filter: brightness(1.12);
		}
		100% {
			opacity: 1;
			transform: translateY(0) translateZ(0) rotateX(0) rotateZ(0) scale(1);
			filter: blur(0) brightness(1);
		}
	}
	@keyframes summon-in-spin {
		0% {
			opacity: 0;
			transform: translateY(190px) translateZ(-420px) rotateY(-360deg) scale(0.16);
			filter: blur(8px) brightness(2.6);
		}
		45% {
			opacity: 1;
			filter: blur(0) brightness(1.45);
		}
		72% {
			transform: translateY(-10px) translateZ(0) rotateY(0deg) scale(1.09);
			filter: brightness(1.12);
		}
		100% {
			opacity: 1;
			transform: translateY(0) translateZ(0) rotateY(0deg) scale(1);
			filter: blur(0) brightness(1);
		}
	}
	@keyframes float3d {
		0% {
			transform: translate3d(0, 0, 0) rotateZ(0deg) rotateY(-7deg) rotateX(3deg);
		}
		25% {
			transform: translate3d(7px, -11px, 0) rotateZ(1.6deg) rotateY(6deg) rotateX(-2deg);
		}
		50% {
			transform: translate3d(0, -17px, 0) rotateZ(0deg) rotateY(9deg) rotateX(-3deg);
		}
		75% {
			transform: translate3d(-7px, -9px, 0) rotateZ(-1.6deg) rotateY(2deg) rotateX(2deg);
		}
		100% {
			transform: translate3d(0, 0, 0) rotateZ(0deg) rotateY(-7deg) rotateX(3deg);
		}
	}
	@keyframes aura-pulse {
		0%,
		100% {
			opacity: 0.45;
			transform: translateZ(-40px) scale(0.94);
		}
		50% {
			opacity: 0.75;
			transform: translateZ(-40px) scale(1.06);
		}
	}
	@keyframes sheen-sweep {
		0% {
			background-position: 150% 0;
		}
		100% {
			background-position: -150% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.floater,
		.aura {
			animation: none;
		}
	}
	@media (max-width: 600px) {
		.offer-grid {
			flex-wrap: wrap;
			gap: 1rem;
			padding: 1.5rem 0.75rem;
		}
		.offer {
			flex: 0 1 calc(50% - 0.5rem);
			max-width: calc(50% - 0.5rem);
			touch-action: manipulation;
			-webkit-tap-highlight-color: transparent;
			user-select: none;
		}
	}

	/* ── Awaken discard picker ───────────────────────────────────────────── */
	.pick-req {
		margin: 0;
		font-size: 0.9rem;
		color: var(--brand-violet-soft, #b6a8ff);
	}
	.pick-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}
	.pick-opt {
		position: relative;
		display: grid;
		grid-template-rows: 1fr auto;
		place-items: center;
		gap: 0.3rem;
		width: 5rem;
		min-height: 5.5rem;
		padding: 0.45rem;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--brand-violet, #5a2bff) 45%, transparent);
		background: color-mix(in srgb, var(--brand-violet, #5a2bff) 12%, transparent);
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
	}
	.pick-opt.selected {
		border-color: var(--brand-violet, #5a2bff);
		box-shadow: 0 0 0 2px var(--brand-violet, #5a2bff);
	}
	.pick-opt:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.pick-opt img {
		width: 3rem;
		height: 3rem;
		object-fit: contain;
	}
	.pick-label {
		font-size: 0.7rem;
		line-height: 1.1;
		text-align: center;
		opacity: 0.9;
	}
	.pick-actions {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
	}

	/* ── Locked hints ────────────────────────────────────────────────────── */
	.locked {
		border-top-color: var(--color-mist, #3a2670);
	}
	.locked-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.locked-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0.55rem 0.85rem;
		border: 1px dashed var(--color-mist, #3a2670);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		opacity: 0.85;
		min-width: 9rem;
		max-width: 14rem;
	}
	.locked-lock {
		font-size: 0.9rem;
		opacity: 0.7;
	}
	.locked-name {
		font-family: var(--font-display);
		font-size: 0.9rem;
		color: var(--color-parchment, #e7e0cf);
		text-align: center;
	}
	.locked-req {
		font-size: 0.76rem;
		color: var(--brand-cyan, #5cdfff);
		text-align: center;
		line-height: 1.2;
	}

	/* ── Manual ──────────────────────────────────────────────────────────── */
	.manual {
		border-top-color: var(--brand-amber-soft, #ffd56a);
	}
	.manual-text {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--color-bone, #f5f0ff);
	}

	/* ── Rune overflow ───────────────────────────────────────────────────── */
	.overflow {
		border-top-color: var(--brand-coral, #ff704d);
	}
	.overflow-note {
		margin: 0;
		font-size: 0.9rem;
		color: var(--brand-coral, #ff704d);
	}
	.rune-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}
	.rune-pick {
		position: relative;
		display: grid;
		place-items: center;
		width: 4.4rem;
		height: 4.4rem;
		padding: 0.45rem;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--brand-coral, #ff704d) 55%, transparent);
		background: color-mix(in srgb, var(--brand-coral, #ff704d) 10%, transparent);
		cursor: pointer;
		transition: transform 140ms ease, border-color 140ms ease;
	}
	.rune-pick:not(:disabled):hover {
		transform: translateY(-3px);
		border-color: var(--brand-coral, #ff704d);
	}
	.rune-pick:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.rune-pick img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.rune-pick .x {
		position: absolute;
		top: -8px;
		right: -8px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.8rem;
		color: #fff;
		background: var(--brand-coral, #ff704d);
		opacity: 0;
		transition: opacity 140ms ease;
	}
	.rune-pick:not(:disabled):hover .x {
		opacity: 1;
	}
</style>
