<script lang="ts">
	import type { SeatColor, NavigationDestination, MonsterState } from '$lib/play/types';
	import { LOCATION_ACCENT, type LocationConfig } from '$lib/play/locations';
	import { buildMonsterRewards } from '$lib/play/monsterRewards';
	import type { GameLocationAsset, IconPoolEntry, RewardIconToken } from '$lib/types';
	import { seatAccent, storageUrl } from './helpers';

	interface Props {
		config: LocationConfig;
		location?: GameLocationAsset | null;
		iconPool?: Map<string, IconPoolEntry>;
		occupants?: SeatColor[];
		seatNames?: Partial<Record<SeatColor, string>>;
		selectable?: boolean;
		selected?: boolean;
		/** Emphasised (hovered / locked pick / spectator follow). */
		focused?: boolean;
		/** Render as the circular compass hub (the Arcane Abyss core). */
		hub?: boolean;
		onHover?: (destination: NavigationDestination | null) => void;
		/** Invading monster (Arcane Abyss only). */
		monster?: MonsterState | null;
		mySeat?: SeatColor | null;
		onSelect?: (destination: NavigationDestination) => void;
	}

	let {
		config,
		location = null,
		iconPool = new Map(),
		occupants = [],
		seatNames = {},
		selectable = false,
		selected = false,
		focused = false,
		hub = false,
		onHover,
		monster = null,
		mySeat = null,
		onSelect
	}: Props = $props();

	const accent = $derived(LOCATION_ACCENT[config.name] ?? '#8d8aa1');
	const rewardRows = $derived(location?.reward_rows ?? []);
	// Always surface the unconditional "Gain" action row(s) at the top of the list
	// (stable sort keeps every other row's relative order).
	const orderedRows = $derived(
		[...rewardRows].sort((a, b) => (a.type === 'gain' ? 0 : 1) - (b.type === 'gain' ? 0 : 1))
	);
	// The Arcane Abyss has no location reward_rows — its rewards come from the
	// invading monster's reward track. Build them for the card's reward preview.
	const monsterRewards = $derived(monster ? buildMonsterRewards(monster.rewardTrack) : []);

	// Touch: tap the card to toggle the hover preview (pointer: coarse devices).
	let tapFocused = $state(false);
	function handlePointerEnter() {
		if (selectable) onHover?.(config.name);
	}
	function handlePointerLeave() {
		if (selectable) onHover?.(null);
	}
	function handleClick() {
		if (!selectable) return;
		// On touch devices also toggle the preview so the info is reachable without hover.
		if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
			tapFocused = !tapFocused;
			onHover?.(tapFocused ? config.name : null);
		}
		onSelect?.(config.name);
	}

	function tokenIcons(token: RewardIconToken): { id: string; url: string | null }[] {
		const ids = typeof token === 'string' ? [token] : token.icon_ids;
		return ids.map((id) => ({ id, url: storageUrl(iconPool.get(id)?.file_path ?? null) }));
	}
</script>

<button
	type="button"
	class="loc"
	data-testid="location-{config.name}"
	class:selectable
	class:selected
	class:focused
	class:tap-focused={tapFocused}
	class:hub
	class:abyss={config.combatOnly}
	style="--accent: {accent}"
	disabled={!selectable}
	onclick={handleClick}
	onpointerenter={handlePointerEnter}
	onpointerleave={handlePointerLeave}
	onfocus={() => selectable && onHover?.(config.name)}
	onblur={() => selectable && onHover?.(null)}
>
	<span class="name">{config.name}</span>
	{#if config.origin}<span class="origin">{config.origin}</span>{/if}

	{#if config.combatOnly}
		{#if monster}
			<span class="monster">
				<span
					class="lives"
					title="{monster.livesRemaining} of {monster.livesTotal} lives left"
					aria-label="{monster.livesRemaining} of {monster.livesTotal} lives left"
				>
					{#each Array.from({ length: monster.livesTotal }) as _pip, i (i)}
						<span class="life" class:spent={i >= monster.livesRemaining}></span>
					{/each}
				</span>
				<span class="m-stats">
					<span class="m-stat">HP {monster.maxHp}</span>
					<span class="m-stat">DMG {monster.damage}</span>
				</span>
			</span>
			{#if monsterRewards.length > 0}
				<span class="reward-preview">
					<span class="reward-head">On kill, choose {monster.chooseAmount}</span>
					<span class="icons">
						{#each monsterRewards as opt (opt.index)}
							{#each tokenIcons(opt.token) as ic, k (ic.id + k)}
								<span class="ico">{#if ic.url}<img src={ic.url} alt={opt.label} loading="lazy" />{/if}</span>
							{/each}
						{/each}
					</span>
				</span>
			{/if}
		{:else}
			<span class="empty">No monster invading</span>
		{/if}
	{:else if orderedRows.length > 0}
		<ul class="rows">
			{#each orderedRows as row, i (i)}
				<li class="row">
					{#if row.type === 'text'}
						<span class="row-text">{row.text}</span>
					{:else if row.type === 'gain'}
						<span class="tag">Gain</span>
						<span class="icons">
							{#each row.gain_icon_ids as token, ti (ti)}
								{#each tokenIcons(token) as ic, k (ic.id + k)}
									{#if k > 0}<span class="or">/</span>{/if}
									<span class="ico">{#if ic.url}<img src={ic.url} alt="" loading="lazy" />{/if}</span>
								{/each}
							{/each}
						</span>
					{:else}
						<span class="icons">
							{#each row.cost_icon_ids as token, ti (ti)}
								{#each tokenIcons(token) as ic, k (ic.id + k)}
									<span class="ico">{#if ic.url}<img src={ic.url} alt="" loading="lazy" />{/if}</span>
								{/each}
							{/each}
						</span>
						<span class="arrow">→</span>
						<span class="icons">
							{#each row.gain_icon_ids as token, ti (ti)}
								{#each tokenIcons(token) as ic, k (ic.id + k)}
									<span class="ico">{#if ic.url}<img src={ic.url} alt="" loading="lazy" />{/if}</span>
								{/each}
							{/each}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<span class="empty">Choose this realm to act here.</span>
	{/if}

	{#if occupants.length}
		<span class="tokens">
			{#each occupants as seat (seat)}
				<span
					class="tok"
					class:mine={seat === mySeat}
					style="background:{seatAccent(seat)}"
					title={seatNames[seat] ?? seat}
				></span>
			{/each}
		</span>
	{/if}
</button>

<style>
	/* A location node: name + reward rows. Used both as a compass arm (cardinal) and,
	   with .hub, as the round centre (the Arcane Abyss core). */
	.loc {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.6rem;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: default;
		text-align: center;
		transition: background 140ms ease, transform 140ms ease;
	}
	.loc.selectable {
		cursor: pointer;
	}
	/* No rectangle around cardinal cards — the quadrant wedge does the highlighting.
	   Hover/focus just lifts the name; the locked pick tints it. */
	@media (hover: hover) and (pointer: fine) {
		.loc.selectable:hover .name {
			text-shadow:
				0 1px 8px rgba(0, 0, 0, 0.85),
				0 0 16px color-mix(in srgb, var(--accent) 65%, transparent);
		}
	}
	.loc.focused .name,
	.loc.tap-focused .name {
		text-shadow:
			0 1px 8px rgba(0, 0, 0, 0.85),
			0 0 16px color-mix(in srgb, var(--accent) 65%, transparent);
	}
	.loc.selected .name {
		color: color-mix(in srgb, var(--accent) 75%, #fff);
	}
	.loc:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.name {
		font-family: var(--font-display);
		font-size: clamp(0.82rem, 1.1vw, 1.05rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
		line-height: 1.1;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
	}
	.origin {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--accent) 82%, #fff);
		margin-top: -2px;
	}

	.rows {
		list-style: none;
		margin: 0.15rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		width: 100%;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 4px 9px;
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.34);
	}
	.tag {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 3px;
		color: #05030c;
		background: var(--brand-teal, #2fc7c7);
	}
	.icons {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.ico {
		width: 27px;
		height: 27px;
		display: grid;
		place-items: center;
	}
	.ico img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.or {
		color: var(--color-whisper, #6a6680);
		font-size: 0.9rem;
	}
	.arrow {
		color: var(--brand-amber, #ffba3d);
		font-size: 1.1rem;
	}
	.row-text {
		font-size: 0.9rem;
		color: var(--color-fog, #8d8aa1);
		line-height: 1.2;
	}

	.monster {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	/* Monster lives left — filled pips for remaining, hollow for spent. */
	.lives {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.life {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--brand-coral, #ff7a7a);
		box-shadow: 0 0 6px color-mix(in srgb, var(--brand-coral, #ff7a7a) 60%, transparent);
	}
	.life.spent {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.28);
		box-shadow: none;
	}
	.m-stats {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}
	.m-stat {
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--brand-coral, #ff7a7a);
	}
	/* Monster reward track — a caption over a single wrapping row of reward icons. */
	.reward-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		margin-top: 4px;
	}
	.reward-head {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-fog, #8d8aa1);
		text-align: center;
	}
	.reward-preview .icons {
		flex-wrap: wrap;
		justify-content: center;
	}
	.empty {
		font-size: 0.8rem;
		color: var(--color-whisper, #6a6680);
		line-height: 1.2;
	}

	.tokens {
		display: flex;
		gap: 4px;
		justify-content: center;
		flex-wrap: wrap;
		margin-top: 2px;
	}
	.tok {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
	}
	.tok.mine {
		box-shadow: 0 0 0 2px #fff;
	}

	/* ── Hub: the circular Arcane Abyss core at the centre of the compass ─────── */
	.loc.hub {
		aspect-ratio: 1;
		width: 100%;
		justify-content: center;
		gap: 0.3rem;
		padding: 1rem;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 38%, rgba(60, 8, 36, 0.65) 0%, #0a0714 72%);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent),
			0 0 0 6px rgba(10, 7, 20, 0.9),
			0 0 0 7px color-mix(in srgb, var(--accent) 30%, transparent),
			0 0 34px color-mix(in srgb, var(--accent) 28%, transparent),
			inset 0 0 40px rgba(0, 0, 0, 0.6);
	}
	@media (hover: hover) and (pointer: fine) {
		.loc.hub.selectable:hover {
			background: radial-gradient(circle at 50% 38%, rgba(80, 10, 48, 0.7) 0%, #0a0714 72%);
			transform: scale(1.03);
		}
	}
	.loc.hub.focused,
	.loc.hub.tap-focused {
		background: radial-gradient(circle at 50% 38%, rgba(80, 10, 48, 0.7) 0%, #0a0714 72%);
		transform: scale(1.03);
	}
	.loc.hub.selected {
		box-shadow:
			0 0 0 3px var(--accent),
			0 0 0 7px rgba(10, 7, 20, 0.9),
			0 0 46px color-mix(in srgb, var(--accent) 50%, transparent),
			inset 0 0 40px rgba(0, 0, 0, 0.6);
	}
	.loc.hub .name {
		font-size: clamp(0.95rem, 1.5vw, 1.35rem);
	}

	/* ── Touch / tap-target hardening ──────────────────────────────────────── */
	.loc.selectable {
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}

	/* Icon hit areas: native size is 27px — boost to ≥44px on touch so fingers land. */
	@media (pointer: coarse) {
		.ico {
			width: 44px;
			height: 44px;
		}
		.ico img {
			width: 27px;
			height: 27px;
		}
		/* Give the card itself a comfortable minimum tap height. */
		.loc.selectable {
			min-height: 44px;
		}
	}
</style>
