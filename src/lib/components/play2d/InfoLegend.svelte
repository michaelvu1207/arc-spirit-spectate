<script lang="ts">
	import type { getAssetState } from '$lib/stores/assetStore.svelte';
	import type { DiceTier } from '$lib/play/types';
	import { DICE_TIER_ORDER, STATUS_LADDER, SPIRIT_LIMIT_BY_STATUS } from '$lib/play/types';
	import { DICE_TIER_FACES } from '$lib/play/combat';
	import { iconPoolUrl, storageUrl, statusAccent } from './helpers';

	interface Props {
		assets: ReturnType<typeof getAssetState>;
		onClose: () => void;
	}
	let { assets, onClose }: Props = $props();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	// ── Resources & rewards (real art, sourced by icon_pool id) ──────────────────
	// Entries may carry one icon, two (a shared category like Runes & Relics), or a
	// glyph fallback where no art exists (Spirit Augment is a counter, not an icon).
	const resources = $derived(
		[
			{
				ids: ['70792514-aa43-4526-a7a4-0f1e4ca55d71'],
				label: 'Victory Point',
				desc: 'Your score. The first player to reach 30 points wins the game.'
			},
			{
				ids: ['6746f875-a1bc-453c-94b5-718d6ebeb025'],
				label: 'Potential (Health)',
				desc: 'Health tokens that absorb combat damage. When a hit exceeds your potential you corrupt (your status drops a rung).'
			},
			{
				ids: ['80f1d5a8-812e-4bb2-b341-68e69d9a3e38'],
				label: 'Arcane Blood',
				desc: 'Corrupted potential — health flipped to its dark side when you take damage.'
			},
			{
				ids: [
					'36aab6c9-b98c-4e84-b097-e743f45dde82',
					'6a85e06a-52cc-483c-aa59-38395a377307'
				],
				label: 'Runes & Relics',
				desc: 'Tokens you spend to awaken your face-down spirits — each spirit lists a rune cost you pay from the runes you hold. You gain them off your location’s action cards, by Cultivating (1 rune for every 2 spirits sharing an origin), and from monster-kill rewards; you keep up to 4 between rounds (extras are discarded in Cleanup). Relics are the rarer “special” runes, used wherever an awaken cost calls for one.'
			},
			{
				ids: [] as string[],
				glyph: '✦',
				label: 'Spirit Augment',
				desc: 'A class token you place onto one of your spirits to give it an extra class trait. It follows its host — active while that spirit is awakened (face-up), dormant when face-down.'
			}
		].map((e) => ({
			...e,
			urls: e.ids.map((id) => iconPoolUrl(assets.iconPool, id)).filter((u): u is string => !!u)
		}))
	);

	// ── Player status / corruption ladder (grounded in the engine) ───────────────
	// STATUS_LADDER + SPIRIT_LIMIT_BY_STATUS: Pure 7 → Tainted 6 → Corrupt 5 → Fallen 4;
	// only Fallen is Evil (isEvilAlignment); corrupting past the bottom discards a spirit.
	const STATUS_NOTE: Record<string, string> = {
		Pure: 'Uncorrupted and fully Good — your strongest standing.',
		Tainted: 'Lightly corrupted. Still Good-aligned.',
		Corrupt: 'Deeply corrupted. Still Good-aligned.',
		Fallen:
			'Evil-aligned. In the Encounter phase you may attack co-located Good players for +2 VP each. You can’t fall any further — corrupting damage now forces you to discard a spirit instead.'
	};
	const statusLevels = STATUS_LADDER.map((name, i) => ({
		name,
		color: statusAccent(name),
		slots: SPIRIT_LIMIT_BY_STATUS[i],
		note: STATUS_NOTE[name] ?? ''
	}));

	// ── Spirit World actions (the Location-phase actions, grounded in the engine) ─
	const spiritActions = $derived(
		[
			{
				id: '76e58219-e805-4b94-acf4-6d62dfe4c515',
				label: 'Spirit World Summon',
				desc: 'Draw 4 spirits from the Spirit World, then summon up to 2 onto your board. They arrive awakened — face-up, with their class traits active immediately.'
			},
			{
				id: '12ff8ffe-20cb-4a86-a493-5e4ff8b9dc3e',
				label: 'Arcane Abyss Summon',
				desc: 'Draw 3 spirits from the Arcane Abyss, then summon up to 1. It arrives unawakened — face-down; awaken it later to switch its traits on.'
			},
			{
				id: '60e40dd5-c3cc-4f26-9aa3-2043b4106ade',
				label: 'Cultivate',
				desc: 'Harvest runes from your spirits’ origins — gain 1 origin rune for every 2 spirits sharing a core origin. Also triggers Cultivate class effects (e.g. Cultivator: a same-origin trio → 2 runes + 1 potential).'
			},
			{
				id: 'bdded3f5-e405-4b68-b63a-9f5c2139beea',
				label: 'Rest',
				desc: 'Recover and grow — triggers your Rest class effects: gaining attack dice or potential, or upgrading your dice, depending on your classes.'
			}
		]
			.map((e) => ({ ...e, url: iconPoolUrl(assets.iconPool, e.id) }))
			.filter((e) => e.url)
	);

	// ── Attack dice (the four tiers, with their average damage) ──────────────────
	const TIER_DIE_NAME: Record<DiceTier, string> = {
		basic: 'Basic Attack',
		enchanted: 'Enchanted Attack',
		exalted: 'Exalted Attack',
		arcane: 'Arcane Attack'
	};
	function tierDieImage(tier: DiceTier): string | null {
		const want = TIER_DIE_NAME[tier].toLowerCase();
		for (const die of assets.customDiceAssets.values()) {
			if (die.name.toLowerCase() !== want) continue;
			const firstFace = die.sides?.slice().sort((a, b) => a.side_number - b.side_number)[0];
			return storageUrl(firstFace?.image_path ?? die.background_image_path ?? die.exported_template_path);
		}
		return null;
	}
	const diceTiers = $derived(
		DICE_TIER_ORDER.map((tier) => {
			const faces = DICE_TIER_FACES[tier];
			const avg = faces.reduce((a, b) => a + b, 0) / faces.length;
			return {
				tier,
				label: TIER_DIE_NAME[tier],
				avg: avg.toFixed(2).replace(/\.?0+$/, ''),
				url: tierDieImage(tier)
			};
		})
	);

</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div
	class="legend-backdrop"
	data-testid="info-legend"
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	aria-label="Icon guide"
	onclick={onClose}
>
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="legend-panel" onclick={(e) => e.stopPropagation()}>
		<header class="legend-head">
			<span class="legend-title">Icon Guide</span>
			<button
				type="button"
				class="legend-close"
				data-testid="info-legend-close"
				aria-label="Close icon guide"
				onclick={onClose}
			>✕</button>
		</header>

		<div class="legend-body">
			<!-- Resources & rewards -->
			{#if resources.length > 0}
				<section class="legend-section">
					<div class="section-head"><span class="section-eyebrow">Resources &amp; Rewards</span><span class="section-rule"></span></div>
					<div class="icon-list">
						{#each resources as ic (ic.label)}
							<div class="icon-row">
								<span class="icon-cell">
									{#if ic.urls.length > 0}
										{#each ic.urls as u (u)}<img src={u} alt={ic.label} loading="lazy" />{/each}
									{:else if ic.glyph}
										<span class="icon-glyph" aria-hidden="true">{ic.glyph}</span>
									{/if}
								</span>
								<div class="icon-text">
									<span class="entry-label">{ic.label}</span>
									<p class="entry-desc">{ic.desc}</p>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Player status / corruption -->
			<section class="legend-section">
				<div class="section-head"><span class="section-eyebrow">Player Status</span><span class="section-rule"></span></div>
				<p class="section-note">
					Every player sits on a corruption ladder. Taking more combat damage than your remaining
					Potential corrupts you — your status drops one level and your spirit board shrinks to the
					new cap (you discard spirits down to the new limit).
				</p>
				<div class="status-list">
					{#each statusLevels as s (s.name)}
						<div class="status-row" style="--c: {s.color}">
							<span class="status-dot" aria-hidden="true"></span>
							<div class="icon-text">
								<span class="entry-label">{s.name} <span class="status-slots">· {s.slots} spirit slots</span></span>
								<p class="entry-desc">{s.note}</p>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Spirit World actions -->
			{#if spiritActions.length > 0}
				<section class="legend-section">
					<div class="section-head"><span class="section-eyebrow">Spirit World Actions</span><span class="section-rule"></span></div>
					<div class="icon-list">
						{#each spiritActions as ic (ic.id)}
							<div class="icon-row">
								<span class="icon-cell"><img src={ic.url} alt={ic.label} loading="lazy" /></span>
								<div class="icon-text">
									<span class="entry-label">{ic.label}</span>
									<p class="entry-desc">{ic.desc}</p>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Attack dice -->
			<section class="legend-section">
				<div class="section-head"><span class="section-eyebrow">Attack Dice</span><span class="section-rule"></span></div>
				<p class="section-note">Weakest → strongest. The number is each die’s average damage per roll.</p>
				<div class="dice-row">
					{#each diceTiers as d (d.tier)}
						<div class="dice-cell">
							{#if d.url}<img src={d.url} alt={d.label} loading="lazy" />{:else}<span class="dice-fb">{d.label.slice(0, 1)}</span>{/if}
							<span class="dice-label">{d.label.replace(' Attack', '')}</span>
							<span class="dice-avg">avg {d.avg}</span>
						</div>
					{/each}
				</div>
			</section>

		</div>
	</div>
</div>

<style>
	.legend-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: grid;
		place-items: center;
		padding: 2rem 1rem;
		background: rgba(5, 3, 12, 0.78);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		animation: fade 140ms ease both;
	}
	.legend-panel {
		width: min(960px, 96vw);
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: linear-gradient(180deg, rgba(14, 9, 28, 0.98), rgba(8, 5, 16, 0.99));
		box-shadow: 0 30px 80px -24px rgba(0, 0, 0, 0.8);
		animation: rise 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
		overflow: hidden;
	}
	.legend-head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.1rem 1.4rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.14);
	}
	.legend-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #fff;
		line-height: 1;
	}
	.legend-close {
		flex: 0 0 auto;
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(10, 7, 20, 0.6);
		color: rgba(255, 255, 255, 0.7);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		transition: border-color 140ms ease, color 140ms ease;
	}
	.legend-close:hover {
		border-color: var(--brand-coral, #ff7a59);
		color: #fff;
	}
	.legend-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 1.2rem 1.4rem 1.6rem;
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
	}

	.section-head {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 0.85rem;
	}
	.section-eyebrow {
		flex: 0 0 auto;
		font-family: var(--font-display);
		font-size: 0.95rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--brand-cyan, #5cdfff);
	}
	.section-rule {
		flex: 1 1 auto;
		height: 1px;
		background: rgba(255, 255, 255, 0.16);
	}
	.section-note {
		margin: -0.4rem 0 0.85rem;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--color-fog, #9a93b0);
	}

	.entry-label {
		font-family: var(--font-display);
		font-size: 1.1rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
	}
	.entry-desc {
		margin: 0.15rem 0 0;
		font-size: 0.95rem;
		line-height: 1.45;
		color: var(--color-parchment, #e7e0cf);
	}

	/* Icon rows (resources + spirit-world actions) */
	.icon-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: 0.9rem 1.4rem;
	}
	.icon-row {
		display: flex;
		align-items: flex-start;
		gap: 0.9rem;
	}
	.icon-cell {
		flex: 0 0 auto;
		min-width: 2.8rem;
		height: 2.8rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0 0.4rem;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.32);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
	}
	.icon-cell img {
		width: 2rem;
		height: 2rem;
		object-fit: contain;
	}
	.icon-glyph {
		font-family: var(--font-display);
		font-size: 1.6rem;
		line-height: 1;
		color: var(--brand-cyan, #5cdfff);
	}
	.icon-text {
		min-width: 0;
	}

	/* Player status */
	.status-list {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.status-row {
		display: flex;
		align-items: flex-start;
		gap: 0.9rem;
	}
	.status-dot {
		flex: 0 0 auto;
		width: 1rem;
		height: 1rem;
		margin-top: 0.35rem;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 10px color-mix(in srgb, var(--c) 60%, transparent);
	}
	.status-slots {
		font-size: 0.78em;
		letter-spacing: 0.04em;
		color: var(--color-fog, #9a93b0);
	}

	/* Attack dice */
	.dice-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.dice-cell {
		flex: 0 1 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.6rem 0.9rem;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.28);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
	}
	.dice-cell img {
		width: 2.6rem;
		height: 2.6rem;
		object-fit: contain;
	}
	.dice-fb {
		width: 2.6rem;
		height: 2.6rem;
		display: grid;
		place-items: center;
		font-family: var(--font-display);
		font-size: 1.2rem;
		color: #fff;
	}
	.dice-label {
		font-family: var(--font-display);
		font-size: 0.9rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #fff;
	}
	.dice-avg {
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brand-coral, #ff7a59);
		font-variant-numeric: tabular-nums;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.985);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.legend-backdrop,
		.legend-panel {
			animation: none;
		}
	}
</style>
