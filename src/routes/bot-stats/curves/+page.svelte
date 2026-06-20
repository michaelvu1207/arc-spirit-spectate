<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Title,
		Tooltip,
		Legend,
		type ChartConfiguration,
		type Plugin
	} from 'chart.js';
	import rawData from '$lib/play/sim/vp-curves.json';

	Chart.register(LineController, LineElement, PointElement, LinearScale, Title, Tooltip, Legend);

	interface CurvesData {
		note: string;
		gamesPerCount: number;
		maxRound: number;
		counts: number[];
		strategies: { key: string; label: string; group: string }[];
		curves: Record<string, Record<string, number[]>>;
	}
	const data = rawData as CurvesData;

	// Distinct colour per strategy; the PvP hunter is highlighted (thicker, magenta).
	const COLORS: Record<string, string> = {
		pvphunter: '#ff2bc7', // magenta — the dominant aggressive line
		cursed: '#b15cff',
		corruption: '#ff704d',
		sim6: '#ffba3d',
		hard: '#24d4ff',
		rushpatient: '#20e0c1',
		culrush: '#4d8bf0',
		cullean: '#5cdfff',
		cultivator: '#7be38a',
		flexorigin: '#9aa6ff',
		survivor: '#c0cbd6',
		aggressive: '#ff4d6d',
		fighter: '#6b7785'
	};
	const colorFor = (key: string) => COLORS[key] ?? '#8892a0';

	let selectedCount = $state(4);
	let canvasEl: HTMLCanvasElement;
	let chart: Chart | null = null;

	const WIN_VP = 30;
	// Draws the "Win = 30 VP" reference line across the plot area.
	const winLinePlugin: Plugin = {
		id: 'winLine',
		afterDraw(c) {
			const y = c.scales.y?.getPixelForValue(WIN_VP);
			const { left, right } = c.chartArea;
			if (y == null) return;
			const ctx = c.ctx;
			ctx.save();
			ctx.beginPath();
			ctx.setLineDash([6, 5]);
			ctx.lineWidth = 1;
			ctx.strokeStyle = 'rgba(255,255,255,0.32)';
			ctx.moveTo(left, y);
			ctx.lineTo(right, y);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = 'rgba(255,255,255,0.5)';
			ctx.font = '11px ui-monospace, monospace';
			ctx.textAlign = 'right';
			ctx.fillText('WIN · 30 VP', right - 6, y - 6);
			ctx.restore();
		}
	};

	function buildConfig(count: number): ChartConfiguration {
		const byStrat = data.curves[`${count}p`] ?? {};
		const datasets = data.strategies
			.filter((s) => byStrat[s.key])
			.map((s) => {
				const isHunter = s.key === 'pvphunter';
				return {
					label: s.label,
					data: byStrat[s.key].map((vp, round) => ({ x: round, y: vp })),
					borderColor: colorFor(s.key),
					backgroundColor: colorFor(s.key),
					borderWidth: isHunter ? 3.5 : 1.75,
					pointRadius: 0,
					pointHoverRadius: 4,
					tension: 0.25,
					order: isHunter ? 0 : 1
				};
			});
		return {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'nearest', axis: 'x', intersect: false },
				scales: {
					x: {
						type: 'linear',
						title: { display: true, text: 'Rounds', color: '#8892a0' },
						min: 0,
						max: data.maxRound - 1,
						ticks: { color: '#8892a0', maxTicksLimit: 16 },
						grid: { color: 'rgba(255,255,255,0.05)' }
					},
					y: {
						title: { display: true, text: 'Victory Points (avg)', color: '#8892a0' },
						min: 0,
						suggestedMax: 32,
						ticks: { color: '#8892a0' },
						grid: { color: 'rgba(255,255,255,0.05)' }
					}
				},
				plugins: {
					legend: {
						position: 'bottom',
						labels: { color: '#c0cbd6', usePointStyle: true, boxWidth: 8, padding: 14 }
					},
					tooltip: {
						callbacks: {
							title: (items) => `Round ${items[0].parsed.x}`,
							label: (item) => `${item.dataset.label}: ${(item.parsed.y ?? 0).toFixed(1)} VP`
						}
					}
				}
			},
			plugins: [winLinePlugin]
		};
	}

	function render() {
		if (!canvasEl) return;
		chart?.destroy();
		chart = new Chart(canvasEl, buildConfig(selectedCount));
	}

	onMount(render);
	onDestroy(() => chart?.destroy());
	// Rebuild when the player-count toggle changes.
	$effect(() => {
		selectedCount;
		render();
	});
</script>

<svelte:head><title>VP Curves | Arc Spirits Spectate</title></svelte:head>

<div class="page">
	<header class="head">
		<div class="eyebrow">STRATEGY LAB</div>
		<h1 class="title">VP Curves</h1>
		<p class="sub">
			Average <b>Victory Points by round</b> for each strategy, from {data.gamesPerCount} self-play
			games per player count on the real specialized-location model. A game that ends early carries
			its final VP forward, so a curve plateaus once that strategy has won (or stalled). First to
			<b>30 VP</b> wins. Click a strategy in the legend to toggle it.
		</p>
		<a class="back" href="/bot-stats">← Win-rate table</a>
	</header>

	<div class="toggles" role="group" aria-label="Player count">
		{#each data.counts as c (c)}
			<button class="toggle" class:active={selectedCount === c} onclick={() => (selectedCount = c)}>
				{c} Players
			</button>
		{/each}
	</div>

	<div class="chart-wrap">
		<canvas bind:this={canvasEl}></canvas>
	</div>

	<p class="foot">{data.note}</p>
</div>

<style>
	.page { max-width: 1180px; margin: 0 auto; padding: 40px 32px 80px; }
	.head { margin-bottom: 24px; }
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.38em;
		color: var(--brand-cyan);
		margin-bottom: 10px;
	}
	.title {
		font-family: var(--font-display);
		font-size: clamp(2.6rem, 6vw, 4rem);
		line-height: 0.95;
		color: var(--brand-magenta);
		margin: 0 0 14px;
	}
	.sub { color: var(--color-fog); font-size: 0.92rem; line-height: 1.6; max-width: 78ch; margin: 0; }
	.sub b { color: var(--color-bone); font-weight: 400; }
	.back {
		display: inline-block;
		margin-top: 14px;
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-cyan);
		text-decoration: none;
	}
	.back:hover { color: var(--color-bone); }

	.toggles { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
	.toggle {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-fog);
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		padding: 8px 16px;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.toggle:hover { color: var(--color-bone); border-color: var(--brand-cyan); }
	.toggle.active {
		color: var(--color-void, #0a0a0f);
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
	}

	.chart-wrap {
		position: relative;
		height: 540px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		padding: 18px 14px 10px;
	}

	.foot { margin-top: 24px; font-size: 0.74rem; color: var(--color-fog); line-height: 1.5; max-width: 84ch; }

	@media (max-width: 720px) {
		.page { padding: 28px 18px 60px; }
		.chart-wrap { height: 420px; }
	}
</style>
