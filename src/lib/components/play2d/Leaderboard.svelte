<script lang="ts">
	import type { getAssetState } from '$lib/stores/assetStore.svelte';
	import type { PrivatePlayerState, SeatColor, SpectatorProjection } from '$lib/play/types';
	import { expectedAttack } from '$lib/play/combat';
	import { buildMonsterRewards } from '$lib/play/monsterRewards';
	import { statusAccent, seatAccent, storageUrl, iconPoolUrl, RESOURCE_ICON_IDS } from './helpers';

	interface Props {
		room: SpectatorProjection;
		mySeat: SeatColor | null;
		assets: ReturnType<typeof getAssetState>;
		/** Seat currently being scouted/viewed (highlighted). */
		activeSeat?: SeatColor | null;
		/** Click a row to scout that seat. */
		onSelectSeat?: (seat: SeatColor) => void;
	}

	let { room, mySeat, assets, activeSeat = null, onSelectSeat }: Props = $props();

	const vpIcon = $derived(iconPoolUrl(assets.iconPool, RESOURCE_ICON_IDS.vp));
	const barrierIcon = $derived(iconPoolUrl(assets.iconPool, RESOURCE_ICON_IDS.barrier));
	const brokenBarrierIcon = $derived(iconPoolUrl(assets.iconPool, RESOURCE_ICON_IDS.blood));

	const rows = $derived(
		room.activeSeats
			.map((seat) => {
				const player = room.players[seat];
				const guardian = player?.selectedGuardian ?? room.seats[seat]?.selectedGuardian ?? '';
				const statusToken = player?.statusToken ?? 'Pure';
				return {
					seat,
					name: room.seats[seat]?.displayName ?? seat,
					vp: player?.victoryPoints ?? 0,
					// Combat initiative — only meaningful (non-zero) during a fight; shown
					// only when the player actually has some.
					init: Math.max(0, player?.initiative ?? 0),
					// Resting average attack of a roll (dice-tier averages + Spirit Animal
					// bonus) — same number as the scout dice-pool readout.
					atk: player ? expectedAttack(player as unknown as PrivatePlayerState) : 0,
					barrierFull: Math.max(0, player?.barrier ?? 0),
					barrierMax: Math.max(Math.max(0, player?.barrier ?? 0), player?.maxBarrier ?? 0),
					icon: storageUrl(assets.guardianAssets.get(guardian)?.icon_image_path ?? null),
					ring: statusAccent(statusToken),
					ready:
						room.phase === 'navigation'
							? (room.navigation[seat]?.locked ?? false)
							: (player?.phaseReady ?? false)
				};
			})
			// Sort by victory points, highest first; tie-break on seat order.
			.sort(
				(a, b) => b.vp - a.vp || room.activeSeats.indexOf(a.seat) - room.activeSeats.indexOf(b.seat)
			)
	);

	// The Arcane Abyss monster rides the leaderboard as a boss "competitor" — pinned at the
	// top, purple, and styled apart from the human players. Its art, stats (HP / DMG), lives,
	// and kill rewards all come from the live monster state + asset map.
	const monster = $derived(room.monster);
	const monsterRewards = $derived(
		monster
			? buildMonsterRewards(monster.rewardTrack)
					.map((opt) => ({ index: opt.index, label: opt.label, url: iconPoolUrl(assets.iconPool, opt.token) }))
					.filter((r) => r.url)
			: []
	);
</script>

<aside class="leaderboard" data-testid="leaderboard">
	{#if monster}
		<!-- The Arcane Abyss monster sits at the apex of the standings in the SAME row grammar
		     as the players (meta-left, avatar-right, threaded on the spine) — but it's the
		     shared antagonist, not a rival: a hexagonal abyssal sigil instead of a soul circle,
		     stat chips for its threat, a bounty for the payoff, and a blood badge counting the
		     kills still needed to bring it down. -->
		<div class="boss" data-testid="lb-monster">
			<span class="meta">
				<span class="boss-name" title="The Arcane Abyss monster">Monster</span>
				<span class="meta-row">
					<span class="chip dmg" title="Damage it deals to you">
						<span class="chip-g" aria-hidden="true">⚔️</span>{monster.damage}
					</span>
					<span class="chip hp" title="Health — damage to defeat it once">
						{#if barrierIcon}<img class="chip-ic" src={barrierIcon} alt="" />{:else}<span class="chip-g" aria-hidden="true">❤</span>{/if}{monster.maxHp}
					</span>
				</span>
				{#if monsterRewards.length > 0}
					<span class="bounty" title="Defeat it to claim {monster.chooseAmount}">
						<span class="bounty-label">Bounty</span>
						<span class="bounty-icons">
							{#each monsterRewards as r (r.index)}
								<span class="bounty-ic"><img src={r.url} alt={r.label} title={r.label} loading="lazy" /></span>
							{/each}
						</span>
					</span>
				{/if}
			</span>

			<span
				class="boss-av"
				title="{monster.livesRemaining} of {monster.livesTotal} {monster.livesTotal === 1 ? 'kill' : 'kills'} left to defeat it"
			>
				<span class="sigil" aria-hidden="true"></span>
				{#if monster.livesRemaining > 0}
					<span class="lives" aria-label="{monster.livesRemaining} kills remaining">×{monster.livesRemaining}</span>
				{/if}
			</span>
		</div>
	{/if}
	{#each rows as row (row.seat)}
		<button
			type="button"
			class="lb-row"
			class:me={row.seat === mySeat}
			class:viewing={row.seat === activeSeat}
			style="--ring: {row.ring}"
			data-testid="lb-row-{row.seat}"
			onclick={() => onSelectSeat?.(row.seat)}
		>
			<span class="meta">
				{#if row.seat !== mySeat}<span class="name" style="color: {seatAccent(row.seat)}" title={row.name}>{row.name}</span>{/if}
				<span class="meta-row">
					<span class="pts" data-testid="lb-vp-{row.seat}">
						{#if vpIcon}<img class="vp-ic" src={vpIcon} alt="VP" />{/if}<span class="pts-num"
							>{row.vp}</span
						>
					</span>
					{#if row.atk > 0}
						<span class="atk" data-testid="lb-atk-{row.seat}" title="Avg attack: {row.atk.toFixed(1)}">
							<span class="atk-glyph" aria-hidden="true">⚔️</span><span class="atk-num">{row.atk.toFixed(1)}</span>
						</span>
					{/if}
					{#if row.init > 0}
						<span class="init" data-testid="lb-init-{row.seat}" title="Initiative: {row.init}">
							<span class="init-glyph" aria-hidden="true">⚡</span><span class="init-num">{row.init}</span>
						</span>
					{/if}
				</span>
				{#if row.barrierMax > 0}
					<span class="potential" title="Max Barrier">
						{#each Array.from({ length: row.barrierMax }) as _, i (i)}
							{@const barrierSide = i < row.barrierFull}
							{@const icon = barrierSide ? barrierIcon : brokenBarrierIcon}
							{#if icon}<img
									class="pot"
									class:arcane={!barrierSide}
									src={icon}
									alt={barrierSide ? 'Barrier' : 'Broken barrier'}
									title={barrierSide ? 'Barrier' : 'Broken barrier'}
								/>{:else}<span class="pot dot" class:arcane={!barrierSide}></span>{/if}
						{/each}
					</span>
				{/if}
			</span>

			<span class="av">
				{#if row.icon}
					<img src={row.icon} alt={row.name} loading="lazy" />
				{:else}
					<span class="av-fb">{row.name.slice(0, 1)}</span>
				{/if}
				{#if row.ready}<span class="ready" title="Ready">✓</span>{/if}
			</span>
		</button>
	{/each}
</aside>

<style>
	.leaderboard {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 40px;
		/* Rows are scout buttons — stay clickable even if the float lets clicks pass. */
		pointer-events: auto;
	}

	/* ── The Arcane Abyss monster — pinned at the apex of the standings in the SAME row
	   grammar as the players (meta-left, sigil-right, threaded on the spine), so it reads as
	   the thing everyone is racing against rather than a bolted-on banner. Its identity is the
	   hexagonal abyssal sigil (see .sigil); a faint always-on aura sets the row apart without a
	   hard card. */
	.boss {
		--mon: #a855f7;
		align-self: flex-end;
		position: relative;
		isolation: isolate;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 2px 0;
	}
	.boss::before {
		content: '';
		position: absolute;
		inset: -6px -6px -6px -18px;
		z-index: -1;
		border-radius: 999px;
		background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--mon) 24%, transparent) 80%);
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--mon) 32%, transparent),
			0 0 14px color-mix(in srgb, var(--mon) 20%, transparent);
	}
	.boss-name {
		font-family: var(--font-display);
		font-size: 0.95rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--mon) 22%, #fff);
		line-height: 1.05;
		text-shadow: 0 0 12px color-mix(in srgb, var(--mon) 70%, transparent);
	}
	/* Threat read-out — small filled chips (a touch more menacing than the players' bare
	   numbers): amber damage it deals, purple health to fell it once. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 7px;
		border-radius: 999px;
		font-family: var(--font-display);
		font-size: 0.82rem;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
		background: rgba(0, 0, 0, 0.34);
		border: 1px solid color-mix(in srgb, var(--mon) 34%, transparent);
	}
	.chip.dmg {
		color: var(--brand-amber, #ffba3d);
	}
	.chip.hp {
		color: color-mix(in srgb, var(--mon) 28%, #fff);
	}
	.chip-g {
		font-size: 0.78em;
	}
	.chip-ic {
		width: 0.95em;
		height: 0.95em;
		object-fit: contain;
	}
	/* Bounty — the payoff for the kill, sitting where a player's barrier pips sit. */
	.bounty {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.bounty-label {
		font-size: 0.54rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--mon) 38%, #fff 50%);
	}
	.bounty-icons {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.bounty-ic {
		width: 21px;
		height: 21px;
		display: grid;
		place-items: center;
	}
	.bounty-ic img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/* ── Signature: the abyssal sigil. Where players are circular souls, the monster is a
	   hexagon holding a slow void vortex with a vertical slit eye — pulsing, ringed in abyss
	   purple. The blood badge counts the kills still needed to bring it down. ───────────── */
	.boss-av {
		position: relative;
		flex: 0 0 auto;
		width: 56px;
		height: 56px;
		margin-right: 2px; /* centre the sigil on the spine lane (≈30px from the right) */
		display: grid;
		place-items: center;
	}
	.sigil {
		position: absolute;
		inset: 0;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--mon) 70%, #fff) 0%, #1a0b2e 48%, #07040f 100%);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--mon) 72%, transparent),
			0 0 13px color-mix(in srgb, var(--mon) 45%, transparent),
			inset 0 0 18px rgba(0, 0, 0, 0.72);
	}
	/* Slow swirl of the void (clip-path on .sigil also clips these pseudo-elements). */
	.sigil::before {
		content: '';
		position: absolute;
		inset: -25%;
		background: conic-gradient(
			from 0deg,
			transparent 0deg,
			color-mix(in srgb, var(--mon) 60%, transparent) 55deg,
			transparent 130deg,
			color-mix(in srgb, var(--mon) 38%, transparent) 210deg,
			transparent 300deg
		);
		opacity: 0.7;
		animation: abyss-spin 7s linear infinite;
	}
	/* The eye: a vertical slit pupil that breathes. */
	.sigil::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 42%;
		width: 6px;
		height: 21px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		background: radial-gradient(circle, #fff 0%, color-mix(in srgb, var(--mon) 80%, #fff) 42%, color-mix(in srgb, var(--mon) 92%, #000) 100%);
		box-shadow: 0 0 10px color-mix(in srgb, var(--mon) 85%, transparent);
		animation: abyss-blink 2.6s ease-in-out infinite;
	}
	@keyframes abyss-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes abyss-blink {
		0%,
		100% {
			opacity: 0.85;
			transform: translate(-50%, -50%) scaleY(1);
		}
		50% {
			opacity: 1;
			transform: translate(-50%, -50%) scaleY(1.16);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sigil::before,
		.sigil::after {
			animation: none;
		}
	}
	.lives {
		position: absolute;
		right: -3px;
		bottom: -3px;
		min-width: 19px;
		height: 19px;
		padding: 0 4px;
		border-radius: 10px;
		background: var(--color-blood, #b1304a);
		color: #fff;
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		display: grid;
		place-items: center;
		box-shadow: 0 0 0 2px var(--color-void, #0c0518);
	}

	/* A thin vertical spine threading through the avatar column, connecting every
	   icon like beads on a string. Sits behind the (opaque) avatars; fades at the
	   ends so the imprecise top/bottom stops read as intentional. */
	.leaderboard::before {
		content: '';
		position: absolute;
		right: 29px;
		top: 30px;
		bottom: 30px;
		width: 2px;
		z-index: 0;
		pointer-events: none;
		background: linear-gradient(
			180deg,
			transparent,
			rgba(255, 255, 255, 0.28) 14%,
			rgba(255, 255, 255, 0.28) 86%,
			transparent
		);
	}
	.lb-row {
		position: relative;
		/* Own stacking context so the .viewing highlight bar (z-index:-1) tucks behind
		   this row's content without slipping behind the leaderboard float. */
		isolation: isolate;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
		border-radius: 999px;
		min-height: 44px;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		transition: transform 120ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.lb-row:hover {
			transform: translateX(-3px);
		}
	}
	.lb-row:focus-visible {
		outline: 2px solid var(--brand-cyan, #5cdfff);
		outline-offset: 4px;
	}
	/* A highlight bar behind the currently-viewed profile — its composition fills the
	   main stage. Click the same row again to hide it. */
	.lb-row.viewing::before {
		content: '';
		position: absolute;
		inset: -5px -8px -5px -16px;
		z-index: -1;
		border-radius: 999px;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16) 72%);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.25),
			0 0 18px rgba(255, 255, 255, 0.12);
	}
	/* The viewed player's avatar also gets a bright white ring. */
	.lb-row.viewing .av {
		box-shadow:
			0 0 0 3px #fff,
			0 0 16px rgba(255, 255, 255, 0.45);
	}
	/* Name + points + potential, stacked to the left of the ringed avatar (no card chrome). */
	.meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
	}
	.meta-row {
		display: inline-flex;
		align-items: center;
		gap: 9px;
	}
	.potential {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 3px;
		max-width: 9rem;
	}
	.pot {
		width: 14px;
		height: 14px;
		object-fit: contain;
	}
	.pot.arcane {
		filter: drop-shadow(0 0 2px rgba(177, 48, 74, 0.7));
	}
	.pot.dot {
		border-radius: 50%;
		background: var(--brand-cyan, #5cdfff);
	}
	.pot.dot.arcane {
		background: var(--color-blood, #b1304a);
	}
	.name {
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.04em;
		color: var(--color-parchment, #e7e0cf);
		max-width: 8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pts {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--brand-amber, #ffba3d);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.vp-ic {
		width: 1.05em;
		height: 1.05em;
		object-fit: contain;
	}
	/* Attack chip — the resting average roll damage (dice + Spirit Animal), shown to
	   the left of the initiative chip. Coral, distinct from amber VP / cyan initiative. */
	.atk {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		font-family: var(--font-display);
		font-size: 0.9rem;
		line-height: 1;
		color: var(--brand-coral, #ff7a59);
		font-variant-numeric: tabular-nums;
	}
	.atk-glyph {
		font-size: 0.85em;
		filter: drop-shadow(0 0 3px color-mix(in srgb, var(--brand-coral, #ff7a59) 55%, transparent));
	}
	/* Initiative chip — cyan, distinct from the amber VP; only rendered when > 0. */
	.init {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		font-family: var(--font-display);
		font-size: 0.9rem;
		line-height: 1;
		color: var(--brand-cyan, #5cdfff);
		font-variant-numeric: tabular-nums;
	}
	.init-glyph {
		font-size: 0.85em;
		filter: drop-shadow(0 0 3px color-mix(in srgb, var(--brand-cyan, #5cdfff) 55%, transparent));
	}
	/* Avatar with a status-coloured ring. */
	.av {
		position: relative;
		z-index: 1;
		flex: 0 0 auto;
		width: 46px;
		height: 46px;
		margin-right: 7px; /* centre the avatar on the spine lane (≈30px from the right) */
		border-radius: 50%;
		overflow: hidden;
		background: var(--color-crypt, #1a1029);
		display: grid;
		place-items: center;
		box-shadow:
			0 0 0 3px var(--ring),
			0 2px 8px rgba(0, 0, 0, 0.5);
	}
	.av img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.av-fb {
		font-family: var(--font-display);
		color: #fff;
		font-size: 1.1rem;
	}
	.ready {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: var(--brand-teal, #2fc7c7);
		color: var(--color-void, #0c0518);
		font-size: 0.8rem;
		display: grid;
		place-items: center;
	}

	/* The current player reads larger, with a bright ring and points-only pill. */
	.lb-row.me .av {
		width: 60px;
		height: 60px;
		margin-right: 0; /* the 60px avatar already centres on the lane */
		box-shadow:
			0 0 0 3px var(--ring),
			0 0 16px color-mix(in srgb, var(--ring) 50%, transparent);
	}
	.lb-row.me .pts {
		font-size: 1.5rem;
		color: #fff;
	}

	@media (max-width: 600px) {
		.leaderboard {
			gap: 24px;
		}
		.av {
			width: 38px;
			height: 38px;
			margin-right: 4px;
		}
		.lb-row.me .av {
			width: 46px;
			height: 46px;
		}
		.name {
			font-size: 0.8rem;
			max-width: 5.5rem;
		}
		.pts {
			font-size: 0.95rem;
		}
		.lb-row.me .pts {
			font-size: 1.1rem;
		}
		.pot {
			width: 11px;
			height: 11px;
		}
		.potential {
			max-width: 6rem;
		}
		.boss-name {
			font-size: 0.82rem;
		}
		.boss-av {
			width: 46px;
			height: 46px;
		}
		.sigil::after {
			height: 17px;
		}
		.bounty-ic {
			width: 18px;
			height: 18px;
		}
	}
</style>
