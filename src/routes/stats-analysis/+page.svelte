<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		Filler,
		type ChartConfiguration
	} from 'chart.js';
	import type { AvgVpGameSeries, PlayerCountSeries } from './+page.server';

	interface Props {
		data: { games: AvgVpGameSeries[]; byPlayerCount: PlayerCountSeries[] };
	}
	let { data }: Props = $props();

	Chart.register(
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		Filler
	);

	// Recency ramp: index 0 (most recent game) = lightest pink; last index = deep
	// magenta. The server returns games sorted ended_at DESC, so dataset[0] is
	// always the newest. HSL lightness goes 78% → 30% across the eight lines.
	function recencyColor(index: number, total: number): string {
		const hue = 322; // brand magenta
		const sat = 92;
		const maxL = 82; // newest, near-white pink
		const minL = 28; // oldest, deep magenta
		const t = total > 1 ? index / (total - 1) : 0;
		const lightness = maxL - (maxL - minL) * t;
		return `hsl(${hue}, ${sat}%, ${lightness}%)`;
	}

	function shortGameLabel(gameId: string, endedAt: string | null): string {
		// gameId is "game_YYYYMMDD_HHMMSS_XXXX" — trim down to "MMDD HHMM" for the legend.
		const parts = gameId.split('_');
		if (parts.length >= 3) {
			const date = parts[1];
			const time = parts[2];
			if (date?.length === 8 && time?.length === 6) {
				return `${date.slice(4, 6)}/${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}`;
			}
		}
		if (endedAt) {
			const d = new Date(endedAt);
			if (!Number.isNaN(d.getTime())) {
				const mm = String(d.getMonth() + 1).padStart(2, '0');
				const dd = String(d.getDate()).padStart(2, '0');
				const hh = String(d.getHours()).padStart(2, '0');
				const mi = String(d.getMinutes()).padStart(2, '0');
				return `${mm}/${dd} ${hh}:${mi}`;
			}
		}
		return gameId.slice(-6);
	}

	let canvasEl: HTMLCanvasElement;
	let chart: Chart | null = null;

	function buildConfig(): ChartConfiguration<'line'> {
		const total = data.games.length;
		const datasets = data.games.map((game, i) => {
			const color = recencyColor(i, total);
			// Newer games (lower index) get a touch more line weight so the
			// brightest series also reads as the most prominent.
			const isNewest = i === 0;
			return {
				label: `${shortGameLabel(game.gameId, game.endedAt)} · ${game.totalRounds}r`,
				data: game.points.map((p) => ({ x: p.normalizedRound, y: p.avgVp })),
				borderColor: color,
				backgroundColor: color,
				borderWidth: isNewest ? 3 : 2,
				pointRadius: isNewest ? 4 : 3,
				pointHoverRadius: 6,
				pointBackgroundColor: color,
				pointBorderColor: '#0a0718',
				pointBorderWidth: 1,
				tension: 0.25,
				fill: false,
				spanGaps: true
			};
		});

		return {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'nearest', intersect: false },
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: '#d8cfee',
							font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: 600 },
							usePointStyle: true,
							padding: 14,
							boxWidth: 8
						}
					},
					tooltip: {
						backgroundColor: '#1a0f2e',
						borderColor: '#3a2670',
						borderWidth: 1,
						titleColor: '#f5f0ff',
						titleFont: { family: 'Bebas Neue', size: 14, weight: 'normal' },
						bodyColor: '#d8cfee',
						bodyFont: { family: 'Inter, system-ui, sans-serif', size: 12 },
						padding: 12,
						callbacks: {
							title: (ctx) => {
								const x = ctx[0]?.parsed.x ?? 0;
								return `Game progress: ${(x * 100).toFixed(0)}%`;
							},
							label: (ctx) => {
								const series = data.games[ctx.datasetIndex];
								const point = series?.points[ctx.dataIndex];
								const round = point ? `R${point.round}/${series.totalRounds}` : '';
								const y = typeof ctx.parsed.y === 'number' ? ctx.parsed.y.toFixed(2) : '—';
								return `${ctx.dataset.label} — ${round} avg ${y} VP`;
							}
						}
					},
					title: { display: false }
				},
				scales: {
					x: {
						type: 'linear',
						min: 0,
						max: 1,
						title: {
							display: true,
							text: 'GAME PROGRESS  (NORMALIZED)',
							color: '#9a8fb8',
							font: { family: 'Bebas Neue', size: 13, weight: 'normal' },
							padding: { top: 12 }
						},
						ticks: {
							color: '#9a8fb8',
							font: { family: 'Inter, system-ui, sans-serif', size: 11 },
							stepSize: 0.1,
							callback: (v) => `${Math.round(Number(v) * 100)}%`
						},
						grid: { color: 'rgba(58, 38, 112, 0.35)' }
					},
					y: {
						type: 'linear',
						beginAtZero: true,
						title: {
							display: true,
							text: 'AVG VICTORY POINTS',
							color: '#9a8fb8',
							font: { family: 'Bebas Neue', size: 13, weight: 'normal' },
							padding: { bottom: 12 }
						},
						ticks: {
							color: '#9a8fb8',
							font: { family: 'Inter, system-ui, sans-serif', size: 11 }
						},
						grid: { color: 'rgba(58, 38, 112, 0.35)' }
					}
				}
			}
		};
	}

	// Distinct brand color per player count for the second chart.
	const PLAYER_COUNT_COLORS: Record<number, string> = {
		2: '#ff704d', // brand-coral
		3: '#ff2bc7', // brand-magenta
		4: '#24d4ff', // brand-cyan
		5: '#ffba3d', // brand-amber
		6: '#20e0c1' // brand-teal
	};
	function colorForPlayerCount(pc: number, fallbackIndex: number): string {
		return PLAYER_COUNT_COLORS[pc] ?? SERIES_FALLBACK[fallbackIndex % SERIES_FALLBACK.length];
	}
	const SERIES_FALLBACK = ['#9d4dff', '#6be3ff', '#ff5dd1', '#ffd56a'];

	let pcCanvasEl: HTMLCanvasElement;
	let pcChart: Chart | null = null;

	function buildPlayerCountConfig(): ChartConfiguration<'line'> {
		const datasets = data.byPlayerCount.map((series, i) => {
			const color = colorForPlayerCount(series.playerCount, i);
			return {
				label: `${series.playerCount}P · ${series.gameCount}g`,
				data: series.points.map((p) => ({ x: p.round, y: p.avgVp })),
				borderColor: color,
				backgroundColor: color,
				borderWidth: 2.5,
				pointRadius: 3,
				pointHoverRadius: 6,
				pointBackgroundColor: color,
				pointBorderColor: '#0a0718',
				pointBorderWidth: 1,
				tension: 0.25,
				fill: false,
				spanGaps: true
			};
		});

		const maxRound = data.byPlayerCount.reduce(
			(m, s) => Math.max(m, s.points[s.points.length - 1]?.round ?? 0),
			1
		);

		return {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'nearest', intersect: false },
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: '#d8cfee',
							font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: 600 },
							usePointStyle: true,
							padding: 14,
							boxWidth: 8
						}
					},
					tooltip: {
						backgroundColor: '#1a0f2e',
						borderColor: '#3a2670',
						borderWidth: 1,
						titleColor: '#f5f0ff',
						titleFont: { family: 'Bebas Neue', size: 14, weight: 'normal' },
						bodyColor: '#d8cfee',
						bodyFont: { family: 'Inter, system-ui, sans-serif', size: 12 },
						padding: 12,
						callbacks: {
							title: (ctx) => `Round ${ctx[0]?.parsed.x ?? 0}`,
							label: (ctx) => {
								const series = data.byPlayerCount[ctx.datasetIndex];
								const point = series?.points[ctx.dataIndex];
								const games = point ? `${point.gameCount} games` : '';
								const y = typeof ctx.parsed.y === 'number' ? ctx.parsed.y.toFixed(2) : '—';
								return `${series?.playerCount}P — avg ${y} VP  (${games})`;
							}
						}
					}
				},
				scales: {
					x: {
						type: 'linear',
						min: 1,
						max: maxRound,
						title: {
							display: true,
							text: 'NAVIGATION ROUND',
							color: '#9a8fb8',
							font: { family: 'Bebas Neue', size: 13, weight: 'normal' },
							padding: { top: 12 }
						},
						ticks: {
							color: '#9a8fb8',
							font: { family: 'Inter, system-ui, sans-serif', size: 11 },
							stepSize: 2
						},
						grid: { color: 'rgba(58, 38, 112, 0.35)' }
					},
					y: {
						type: 'linear',
						beginAtZero: true,
						title: {
							display: true,
							text: 'AVG VICTORY POINTS',
							color: '#9a8fb8',
							font: { family: 'Bebas Neue', size: 13, weight: 'normal' },
							padding: { bottom: 12 }
						},
						ticks: {
							color: '#9a8fb8',
							font: { family: 'Inter, system-ui, sans-serif', size: 11 }
						},
						grid: { color: 'rgba(58, 38, 112, 0.35)' }
					}
				}
			}
		};
	}

	onMount(() => {
		if (canvasEl) chart = new Chart(canvasEl, buildConfig());
		if (pcCanvasEl && data.byPlayerCount.length > 0) {
			pcChart = new Chart(pcCanvasEl, buildPlayerCountConfig());
		}
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
		pcChart?.destroy();
		pcChart = null;
	});

	// Re-render if data changes (SvelteKit reload, navigation back, etc.)
	$effect(() => {
		if (!chart || !canvasEl) return;
		const cfg = buildConfig();
		chart.data = cfg.data;
		chart.options = cfg.options ?? {};
		chart.update();
	});

	$effect(() => {
		if (!pcChart || !pcCanvasEl) return;
		const cfg = buildPlayerCountConfig();
		pcChart.data = cfg.data;
		pcChart.options = cfg.options ?? {};
		pcChart.update();
	});

	const totalGames = $derived(data.games.length);
	const totalPlayers = $derived(data.games.reduce((sum, g) => sum + g.playerCount, 0));
	const avgRounds = $derived(
		totalGames > 0
			? Math.round(data.games.reduce((sum, g) => sum + g.totalRounds, 0) / totalGames)
			: 0
	);

	// "VP gain rate" per game = final-round average VP / total rounds.
	// One number per game that captures how fast the table accumulated points.
	interface PaceRow {
		gameId: string;
		label: string;
		endedAt: string | null;
		totalRounds: number;
		playerCount: number;
		finalAvgVp: number;
		vpPerRound: number;
	}

	const paceRows = $derived((): PaceRow[] => {
		return data.games
			.map((game) => {
				const last = game.points[game.points.length - 1];
				const finalAvgVp = last?.avgVp ?? 0;
				const denom = Math.max(1, game.totalRounds);
				return {
					gameId: game.gameId,
					label: shortGameLabel(game.gameId, game.endedAt),
					endedAt: game.endedAt,
					totalRounds: game.totalRounds,
					playerCount: game.playerCount,
					finalAvgVp,
					vpPerRound: finalAvgVp / denom
				};
			})
			.sort((a, b) => b.vpPerRound - a.vpPerRound);
	});

</script>

<svelte:head>
	<title>Stats Analysis | Arc Spirits</title>
</svelte:head>

<section class="page">
	<header class="hero">
		<span class="eyebrow">ANALYSIS</span>
		<h1>STATS ANALYSIS</h1>
		<p class="lede">
			Average victory points across the last 8 verified games, with each game's round axis
			normalized to a 0–100 % progress scale so they overlay on the same plot.
		</p>
	</header>

	{#if totalGames === 0}
		<div class="empty">
			<p>No completed games available yet.</p>
		</div>
	{:else}
		<div class="kpis">
			<div class="kpi">
				<span class="kpi-eyebrow">Games</span>
				<span class="kpi-value">{totalGames}</span>
			</div>
			<div class="kpi">
				<span class="kpi-eyebrow">Player slots</span>
				<span class="kpi-value">{totalPlayers}</span>
			</div>
			<div class="kpi">
				<span class="kpi-eyebrow">Avg rounds</span>
				<span class="kpi-value">{avgRounds}</span>
			</div>
		</div>

		<div class="chart-shell">
			<div class="chart-canvas-wrap">
				<canvas bind:this={canvasEl}></canvas>
			</div>
		</div>

		{#if data.byPlayerCount.length > 0}
			<section class="pc-section">
				<header class="pc-header">
					<span class="eyebrow">PLAYER COUNT</span>
					<h2>AVG VP PER ROUND BY PLAYER COUNT</h2>
					<p class="pc-lede">
						Average victory points at each absolute navigation round, grouped by table size,
						across every verified game we have on record. Tail rounds with fewer than two
						contributing games are dropped to keep the curves stable.
					</p>
				</header>

				<div class="chart-shell">
					<div class="chart-canvas-wrap">
						<canvas bind:this={pcCanvasEl}></canvas>
					</div>
				</div>
			</section>
		{/if}

		<section class="pace-section">
			<header class="pace-header">
				<span class="eyebrow">PACE</span>
				<h2>VP GAIN RATE</h2>
				<p class="pace-lede">
					Final average victory points divided by total rounds. One number per game — higher
					means the table accumulated points faster.
				</p>
			</header>

			<div class="table-shell">
				<table class="pace-table">
					<thead>
						<tr>
							<th class="col-game">Game</th>
							<th class="col-num">Players</th>
							<th class="col-num">Rounds</th>
							<th class="col-num">Final avg VP</th>
							<th class="col-num col-rate">VP / round</th>
						</tr>
					</thead>
					<tbody>
						{#each paceRows() as row, i (row.gameId)}
							{@const isFastest = i === 0 && row.vpPerRound > 0}
							<tr class:fastest={isFastest}>
								<td class="col-game">{row.label}</td>
								<td class="col-num">{row.playerCount}</td>
								<td class="col-num">{row.totalRounds}</td>
								<td class="col-num">{row.finalAvgVp.toFixed(1)}</td>
								<td class="col-num col-rate">{row.vpPerRound.toFixed(2)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</section>

<style>
	.page {
		max-width: 1280px;
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.hero {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 24px;
		border-bottom: 3px solid var(--brand-magenta);
	}

	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.95rem;
		letter-spacing: 0.18em;
		color: var(--brand-cyan);
		text-transform: uppercase;
	}

	h1 {
		font-family: var(--font-display);
		font-size: clamp(3rem, 7vw, 5.5rem);
		line-height: 0.95;
		color: var(--brand-magenta);
		margin: 0;
		letter-spacing: 0.02em;
	}

	.lede {
		max-width: 720px;
		font-family: var(--font-body);
		color: var(--color-parchment, #d8cfee);
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
	}

	.kpis {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	.kpi {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.kpi-eyebrow {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.15em;
		color: var(--brand-cyan);
		text-transform: uppercase;
	}

	.kpi-value {
		font-family: var(--font-display);
		font-size: 2.6rem;
		line-height: 1;
		color: var(--brand-magenta);
		font-variant-numeric: tabular-nums;
	}

	.chart-shell {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 24px;
	}

	.chart-canvas-wrap {
		position: relative;
		height: 520px;
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
	}

	.empty {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 48px;
		text-align: center;
		color: var(--color-parchment, #d8cfee);
		font-family: var(--font-body);
	}

	.pc-section,
	.pace-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.pc-header,
	.pace-header {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pc-header h2,
	.pace-header h2 {
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.6rem);
		line-height: 0.95;
		color: var(--color-bone);
		margin: 0;
		letter-spacing: 0.02em;
	}

	.pc-lede,
	.pace-lede {
		max-width: 720px;
		font-family: var(--font-body);
		color: var(--color-parchment, #d8cfee);
		font-size: 0.95rem;
		line-height: 1.55;
		margin: 0;
	}

	.table-shell {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		overflow-x: auto;
	}

	.pace-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-body);
	}

	.pace-table thead {
		background: var(--brand-magenta);
	}

	.pace-table th {
		font-family: var(--font-display);
		font-size: 0.95rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-void);
		padding: 10px 16px;
		text-align: left;
	}

	.pace-table th.col-num,
	.pace-table td.col-num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.pace-table tbody tr {
		border-top: 1px solid var(--color-mist);
	}

	.pace-table tbody tr:nth-child(even) {
		background: rgba(255, 255, 255, 0.02);
	}

	.pace-table td {
		padding: 12px 16px;
		color: var(--color-parchment, #d8cfee);
		font-size: 0.95rem;
	}

	.pace-table td.col-game {
		font-family: var(--font-display);
		font-size: 1.15rem;
		letter-spacing: 0.04em;
		color: var(--color-bone);
		text-transform: uppercase;
	}

	.pace-table td.col-rate {
		font-family: var(--font-display);
		font-size: 1.6rem;
		line-height: 1;
		color: var(--brand-magenta);
	}

	.pace-table tr.fastest td.col-rate {
		color: var(--brand-cyan);
	}

	.pace-table tr.fastest td.col-game::before {
		content: '▸ ';
		color: var(--brand-cyan);
	}

	@media (max-width: 720px) {
		.page {
			padding: 20px;
			gap: 24px;
		}
		.kpis {
			grid-template-columns: repeat(3, 1fr);
			gap: 8px;
		}
		.kpi {
			padding: 14px 12px;
		}
		.kpi-value {
			font-size: 1.8rem;
		}
		.chart-canvas-wrap {
			height: 380px;
		}
	}
</style>
