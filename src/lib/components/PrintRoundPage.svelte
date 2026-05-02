<script lang="ts">
	import type { BagsData, PlayerSnapshot, Spirit } from '$lib/types';

	interface Props {
		gameId: string;
		round: number;
		timestamp: string | null;
		players: PlayerSnapshot[];
		bags: BagsData | null;
	}

	let { gameId, round, timestamp, players, bags }: Props = $props();

	const sortedPlayers = $derived(() =>
		[...players].sort((a, b) => a.playerColor.localeCompare(b.playerColor))
	);

	const spiritWorldCount = $derived(
		() => (bags?.hexSpirits as { count?: number } | undefined)?.count ?? null
	);
	const monstersCount = $derived(
		() => (bags?.monsters as { count?: number } | undefined)?.count ?? null
	);

	const formattedTimestamp = $derived(() => {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return String(timestamp);
		return date.toLocaleString();
	});

	function spiritsBySlot(spirits: Spirit[]) {
		return new Map(spirits.map((s) => [s.slotIndex, s]));
	}
</script>

<section class="print-page">
	<header class="page-header">
		<div class="title">
			Arc Spirits — {gameId}
		</div>
		<div class="meta">
			Round {round}{#if formattedTimestamp}
				• {formattedTimestamp}{/if}
		</div>
	</header>

	<div class="page-body">
		<div class="players-grid">
			{#each sortedPlayers() as p (p.playerColor)}
				{@const spiritMap = spiritsBySlot(p.spirits)}
				<div class="player-card">
					<div class="player-header">
						<div class="player-color">{p.playerColor}</div>
						<div class="player-name">{p.selectedCharacter}</div>
					</div>

					<div class="stats">
						<div class="stat">
							<span class="label">Blood</span><span class="value">{p.blood}</span>
						</div>
						<div class="stat">
							<span class="label">Barrier</span><span class="value">{p.barrier}</span>
						</div>
						<div class="stat">
							<span class="label">Status</span>
							<span class="value">{p.statusToken ?? '—'} ({p.statusLevel})</span>
						</div>
						<div class="stat">
							<span class="label">VP</span><span class="value">{p.victoryPoints}</span>
						</div>
					</div>

					<div class="section">
						<div class="section-title">Spirits</div>
						<div class="slots-grid slots-7">
							{#each [1, 2, 3, 4, 5, 6, 7] as i}
								{@const s = spiritMap.get(i)}
								<div class="slot">
									<div class="slot-index">{i}</div>
									<div class="slot-value">{s?.name ?? '—'}</div>
								</div>
							{/each}
						</div>
					</div>

					<div class="section">
						<div class="section-title">Runes</div>
						<div class="slots-grid slots-4">
							{#each [1, 2, 3, 4] as i}
								{@const r = (p.runes ?? []).find((x) => x.slotIndex === i)}
								<div class="slot">
									<div class="slot-index">{i}</div>
									<div class="slot-value">{r?.hasRune ? (r.name ?? 'Rune') : '—'}</div>
								</div>
							{/each}
						</div>
					</div>

					{#if (p.handDraws ?? []).length > 0}
						<div class="section">
							<div class="section-title">Hand Draws</div>
							<div class="chips">
								{#each (p.handDraws ?? []).slice(0, 10) as draw, i (`${draw.guid ?? 'draw'}-${i}`)}
									<span class="chip">
										{draw.name ?? 'Unknown'}{#if draw.cost != null}
											({draw.cost}){/if}
									</span>
								{/each}
								{#if p.handDraws.length > 10}
									<span class="chip muted">+{p.handDraws.length - 10} more</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="bags-row">
			<div class="bag">
				<span class="label">Spirit World Bag</span>
				<span class="value">{spiritWorldCount == null ? '—' : spiritWorldCount}</span>
			</div>
			<div class="bag">
				<span class="label">Monsters</span>
				<span class="value">{monstersCount == null ? '—' : monstersCount}</span>
			</div>
		</div>
	</div>
</section>

<style>
	/* On-screen: dark brand panel. Print: white. */
	.print-page {
		background: var(--color-shadow);
		color: var(--color-bone);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		padding: 20px;
		margin: 0 auto 16px;
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		padding-bottom: 10px;
		border-bottom: 2px solid var(--brand-magenta);
	}

	.title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-bone);
		line-height: 1;
	}

	.meta {
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.players-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.player-card {
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		break-inside: avoid;
		background: var(--color-tomb);
	}

	.player-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.player-color {
		font-family: var(--font-display);
		font-size: 0.65rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-magenta);
	}

	.player-name {
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: right;
		color: var(--color-bone);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px 10px;
	}

	.stat {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 11px;
		padding: 5px 8px;
		border-radius: 2px;
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
	}

	.stat .label {
		font-family: var(--font-display);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.stat .value {
		font-family: var(--font-display);
		font-size: 0.85rem;
		color: var(--color-bone);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fog);
		margin-bottom: 4px;
	}

	.slots-grid {
		display: grid;
		gap: 4px;
	}

	.slots-7 { grid-template-columns: repeat(7, minmax(0, 1fr)); }
	.slots-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

	.slot {
		border: 1px solid var(--color-mist);
		border-radius: 2px;
		padding: 4px;
		min-height: 40px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		overflow: hidden;
		background: var(--color-crypt);
	}

	.slot-index {
		font-family: var(--font-display);
		font-size: 0.55rem;
		letter-spacing: 0.06em;
		color: var(--brand-magenta);
	}

	.slot-value {
		font-size: 9px;
		font-family: var(--font-body);
		line-height: 1.15;
		color: var(--color-parchment);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.chip {
		font-family: var(--font-body);
		font-size: 9px;
		border: 1px solid var(--color-mist);
		border-radius: 2px;
		padding: 3px 7px;
		background: var(--color-crypt);
		color: var(--color-parchment);
		white-space: nowrap;
	}

	.chip.muted {
		color: var(--color-fog);
	}

	.bags-row {
		margin-top: 10px;
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: flex-end;
	}

	.bag {
		display: flex;
		gap: 8px;
		align-items: baseline;
		padding: 5px 12px;
		border: 1px solid var(--color-mist);
		border-radius: 2px;
		background: var(--color-tomb);
	}

	.bag .label {
		font-family: var(--font-display);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.bag .value {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--color-bone);
	}

	@media print {
		.print-page {
			background: white !important;
			color: black !important;
			border: none;
			border-radius: 0;
			padding: 0;
			margin: 0;
		}
		.player-card, .slot, .stat, .bag, .chip {
			background: white !important;
			border-color: #e5e7eb !important;
			color: black !important;
		}
		.player-color, .slot-index { color: black !important; }
		.player-name, .stat .value, .bag .value { color: black !important; }
		.stat .label, .section-title, .bag .label, .meta { color: #6b7280 !important; }
		.title { color: black !important; font-size: 14px !important; }
		.page-header { border-bottom-color: black !important; }
	}
</style>
