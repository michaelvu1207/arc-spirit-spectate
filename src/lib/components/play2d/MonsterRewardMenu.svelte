<script lang="ts">
	import type { PendingRewardState } from '$lib/play/types';
	import type { IconPoolEntry } from '$lib/types';
	import { buildMonsterRewards, type MonsterRewardOption } from '$lib/play/monsterRewards';
	import { storageUrl } from './helpers';

	interface Props {
		pending: PendingRewardState;
		iconPool?: Map<string, IconPoolEntry>;
		accent?: string;
		busy?: boolean;
		/** Claim the selected rewards. `picks` are track indices; `choices[k]` is the
		 *  option for the k-th rune-CHOICE pick, in pick order. */
		onClaim?: (picks: number[], choices: number[]) => void;
	}

	let {
		pending,
		iconPool = new Map(),
		accent = 'var(--brand-magenta, #ff2bc7)',
		busy = false,
		onClaim
	}: Props = $props();

	const options = $derived(buildMonsterRewards(pending.rewardTrack));
	const max = $derived(pending.chooseAmount);

	// Selection in click order (so the choices cursor aligns with the engine).
	let selected = $state<number[]>([]);
	// For a rune-choice option, which option index is chosen (keyed by track index).
	let runeChoice = $state<Record<number, number>>({});

	const atMax = $derived(selected.length >= max);

	function iconUrl(id: string): string | null {
		return storageUrl(iconPool.get(id)?.file_path ?? null);
	}
	function isSelected(opt: MonsterRewardOption): boolean {
		return selected.includes(opt.index);
	}
	function toggle(opt: MonsterRewardOption) {
		if (busy) return;
		if (isSelected(opt)) {
			selected = selected.filter((i) => i !== opt.index);
		} else if (!atMax) {
			selected = [...selected, opt.index];
		}
	}
	function chooseRune(opt: MonsterRewardOption, optionIndex: number) {
		if (busy) return;
		runeChoice = { ...runeChoice, [opt.index]: optionIndex };
		if (!isSelected(opt) && !atMax) selected = [...selected, opt.index];
	}
	function selectedRune(opt: MonsterRewardOption): number {
		return runeChoice[opt.index] ?? 0;
	}

	function claim() {
		if (busy || selected.length === 0) return;
		// Build the choices array aligned to the picked rune-CHOICE options, in pick order.
		const byIndex = new Map(options.map((o) => [o.index, o]));
		const choices: number[] = [];
		for (const idx of selected) {
			const opt = byIndex.get(idx);
			if (opt?.effect.type === 'chooseRune') choices.push(runeChoice[idx] ?? 0);
		}
		onClaim?.([...selected], choices);
	}
</script>

<div class="reward" style="--accent: {accent}" data-testid="monster-reward-menu">
	<div class="head">
		<span class="eyebrow">Spoils of the Abyss</span>
		<h2 class="title">{pending.monsterName} defeated</h2>
		<p class="sub" data-testid="reward-pick-count">
			Claim {max} reward{max === 1 ? '' : 's'} — selected {selected.length}/{max}
		</p>
	</div>

	<div class="grid" data-testid="reward-grid">
		{#each options as opt (opt.index)}
			{@const chosen = isSelected(opt)}
			{@const isChoice = opt.effect.type === 'chooseRune'}
			{@const full = atMax && !chosen}
			<div
				class="card"
				class:selected={chosen}
				class:disabled={busy || full}
				role="button"
				tabindex={busy || full ? -1 : 0}
				data-testid={`reward-${opt.index}`}
				aria-pressed={chosen}
				onclick={() => toggle(opt)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						toggle(opt);
					}
				}}
			>
				<span class="pick-dot" aria-hidden="true">{chosen ? '✓' : ''}</span>
				<span class="ico">
					{#if iconUrl(opt.token)}<img src={iconUrl(opt.token)} alt="" loading="lazy" />{/if}
				</span>
				<span class="label">{opt.label}</span>

				{#if isChoice && opt.effect.type === 'chooseRune'}
					<div class="chooser" role="group" aria-label="Choose a rune">
						{#each opt.effect.options as runeOpt, oi (runeOpt.runeId + oi)}
							<button
								type="button"
								class="rune-opt"
								class:active={selectedRune(opt) === oi}
								disabled={busy || full}
								onclick={(e) => {
									e.stopPropagation();
									chooseRune(opt, oi);
								}}
							>
								{runeOpt.name}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<button
		type="button"
		class="claim"
		data-testid="reward-claim"
		disabled={busy || selected.length === 0}
		onclick={() => claim()}
	>
		{selected.length === 0
			? 'Select a reward'
			: `Claim ${selected.length} reward${selected.length === 1 ? '' : 's'}`}
	</button>
</div>

<style>
	.reward {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.1rem;
		width: 100%;
		/* On desktop allow the leaderboard + other panels to share horizontal space.
		   On phones the calc would go negative, so clamp to 100% of the viewport. */
		max-width: min(1100px, max(320px, calc(100vw - 700px)));
		margin: 0 auto;
		box-sizing: border-box;
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		text-align: center;
	}
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.title {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 2.8vw, 2.4rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
		line-height: 1.05;
	}
	.sub {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-fog, #8d8aa1);
	}
	.grid {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.75rem;
		justify-content: center;
		align-items: stretch;
		width: 100%;
	}
	.card {
		position: relative;
		display: flex;
		flex: 1 1 0;
		min-width: 0;
		max-width: 15rem;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 0.7rem;
		min-height: 13rem;
		padding: 1.3rem 1rem 1rem;
		text-align: center;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-top: 3px solid color-mix(in srgb, var(--accent) 70%, transparent);
		border-radius: 8px;
		background: linear-gradient(180deg, rgba(24, 10, 38, 0.7), rgba(8, 5, 16, 0.92));
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease,
			opacity 140ms ease;
		/* Perf (Phase 3): each reward card is a self-contained flex item — its inner
		   layout (icon, label, rune chooser) never affects the others, so isolate
		   reflow. `layout` only — the hover lift translateY, .selected glow ring, and
		   the absolutely-positioned .pick-dot all extend past the card box, so paint
		   containment would clip them. Visually identical everywhere. */
		contain: layout;
	}
	/* Lift on hover only for fine-pointer devices; touch would leave it stuck lifted. */
	@media (hover: hover) and (pointer: fine) {
		.card:not(.disabled):hover {
			transform: translateY(-4px);
			border-color: var(--accent);
			box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
		}
	}
	.card.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent), 0 12px 30px rgba(0, 0, 0, 0.5);
		background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, rgba(24, 10, 38, 0.7)), rgba(8, 5, 16, 0.92));
	}
	.card.disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}
	.card:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.pick-dot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.8rem;
		color: var(--color-void, #0c0518);
		background: var(--accent);
		opacity: 0;
		transition: opacity 120ms ease;
	}
	.card.selected .pick-dot {
		opacity: 1;
	}
	.ico {
		width: 56px;
		height: 56px;
		display: grid;
		place-items: center;
	}
	.ico img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.label {
		font-family: var(--font-display);
		font-size: 0.96rem;
		letter-spacing: 0.03em;
		color: #fff;
		line-height: 1.15;
	}
	.chooser {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		justify-content: center;
		margin-top: auto;
	}
	.rune-opt {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		/* bump to minimum 44px tap target height on all devices */
		min-height: 44px;
		padding: 4px 10px;
		border-radius: 4px;
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		background: rgba(0, 0, 0, 0.3);
		color: var(--color-fog, #b9b4cc);
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.rune-opt:hover {
			color: #fff;
		}
	}
	.rune-opt:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		color: #fff;
	}
	.rune-opt.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--color-void, #0c0518);
	}
	.claim {
		padding: 12px 28px;
		/* minimum 44px height for touch */
		min-height: 44px;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		border: none;
		border-radius: 3px;
		background: var(--accent);
		color: #fff;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition: background 140ms ease, opacity 140ms ease;
	}
	.claim:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	@media (hover: hover) and (pointer: fine) {
		.claim:not(:disabled):hover {
			background: var(--brand-magenta-soft, #ff7fd9);
		}
	}
	.claim:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 3px;
	}

	/* ── Mobile layout (phones ≤600px) ─────────────────────────────────────── */
	@media (max-width: 600px) {
		.reward {
			/* Full viewport width with safe-area padding on phones. */
			max-width: 100%;
			padding-left: env(safe-area-inset-left);
			padding-right: env(safe-area-inset-right);
			padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
			/* Allow the whole menu to scroll if the reward list is tall. */
			max-height: 100vh;           /* fallback */
			max-height: 100dvh;
			overflow-y: auto;
			gap: 0.75rem;
		}

		.title {
			font-size: clamp(1.2rem, 6vw, 1.7rem);
		}

		/* Cards wrap to 2-per-row on phones instead of a single overflowing row. */
		.grid {
			flex-wrap: wrap;
		}
		.card {
			/* Each card takes at least ~45% of the row width (2-up with gap). */
			flex: 1 1 calc(50% - 0.75rem);
			max-width: calc(50% - 0.375rem);
			min-height: 10rem;
			padding: 1rem 0.75rem 0.85rem;
		}

		.ico {
			width: 44px;
			height: 44px;
		}

		.label {
			font-size: 0.82rem;
		}

		/* Claim button: full-width and taller on phone. */
		.claim {
			width: 100%;
			padding: 14px 20px;
			font-size: 0.9rem;
		}
	}

	/* Very small phones (≤360px): single column if 2-up becomes too tight. */
	@media (max-width: 360px) {
		.card {
			flex: 1 1 100%;
			max-width: 100%;
		}
	}
</style>
