<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Tooltip,
		Legend,
		type ChartConfiguration
	} from 'chart.js';
	import EmptyState from '$lib/components/composition-analysis/EmptyState.svelte';
	import { compositionAnalysisStore as store } from '$lib/stores/compositionAnalysis.svelte';
	import { xAxisAllRounds, yAxisVp, dashForCategory } from '$lib/chartConfig';
	import { generateDiagnosticReport, type PlayerVp } from '$lib/compositions/diagnosticReport';
	import { PLAYER_COLOR_HEX, type PlayerColor } from '$lib/types';
	import type { GameDataPayload } from '../../../api/composition-analysis/game-data/+server';

	Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

	const focusGameId = $derived.by<string | null>(() => {
		const ids = Array.from(store.selectedGameIds);
		return ids[0] ?? null;
	});

	let payload = $state<GameDataPayload | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let canvas = $state<HTMLCanvasElement | null>(null);
	let chart: Chart | null = null;

	let reportOpen = $state(false);
	let reportMarkdown = $state<string>('');
	let reportCopied = $state(false);

	$effect(() => {
		const id = focusGameId;
		if (!id) {
			payload = null;
			error = null;
			return;
		}
		loading = true;
		error = null;
		const ac = new AbortController();
		fetch(`/api/composition-analysis/game-data?game_id=${encodeURIComponent(id)}`, {
			signal: ac.signal
		})
			.then((r) =>
				r.ok ? (r.json() as Promise<GameDataPayload>) : Promise.reject(new Error(`HTTP ${r.status}`))
			)
			.then((p) => {
				payload = p;
				loading = false;
			})
			.catch((e) => {
				if (e?.name === 'AbortError') return;
				error = e instanceof Error ? e.message : String(e);
				loading = false;
			});
		return () => ac.abort();
	});

	function buildConfig(p: GameDataPayload): ChartConfiguration<'line'> {
		const datasets: ChartConfiguration<'line'>['data']['datasets'] = [];

		for (const playerColor of p.playerOrder) {
			const tag = p.tags.find((t) => t.playerColor === playerColor);
			const lineColor =
				PLAYER_COLOR_HEX[playerColor as PlayerColor] ?? tag?.composition?.color ?? '#24d4ff';

			// Player actual VP (solid).
			const vps = p.vpsByPlayer[playerColor] ?? [];
			datasets.push({
				label: tag?.composition
					? `${playerColor} (${tag.composition.name})`
					: `${playerColor} (untagged)`,
				data: vps.map((v) => ({ x: v.round, y: v.vp })),
				borderColor: lineColor,
				backgroundColor: lineColor + '33',
				borderWidth: 2.5,
				borderDash: [],
				tension: 0,
				pointRadius: 3,
				pointHoverRadius: 5,
				pointBackgroundColor: lineColor
			});

			// Ideal curve (dashed) — only if comp has a curve.
			if (tag?.composition?.ideal_curve_points) {
				datasets.push({
					label: `${playerColor} ideal (${tag.composition.name})`,
					data: tag.composition.ideal_curve_points.map((y, i) => ({ x: i + 1, y })),
					borderColor: lineColor,
					backgroundColor: 'transparent',
					borderWidth: 1.5,
					borderDash: dashForCategory(tag.composition.category) as number[],
					tension: 0,
					pointRadius: 0,
					pointHoverRadius: 3
				});
			}
		}

		return {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				plugins: {
					tooltip: { mode: 'nearest', intersect: false },
					legend: { display: true, position: 'bottom', labels: { color: '#d8cfee' } }
				},
				scales: {
					x: { ...xAxisAllRounds, ticks: { ...xAxisAllRounds.ticks, color: '#9a8fb8' } },
					y: { ...yAxisVp, ticks: { color: '#9a8fb8' } }
				},
				interaction: { mode: 'nearest', intersect: false }
			}
		};
	}

	function rebuildChart(): void {
		if (!canvas || !payload) return;
		chart?.destroy();
		chart = new Chart(canvas, buildConfig(payload));
	}

	$effect(() => {
		if (payload && canvas) rebuildChart();
	});

	onMount(() => {
		if (payload && canvas) rebuildChart();
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});

	function generateReport(): void {
		if (!payload) return;
		const tags = payload.tags.map((t) => ({
			playerColor: t.playerColor,
			composition: t.composition
		}));
		const vpsMap = new Map<string, PlayerVp[]>();
		for (const [color, vps] of Object.entries(payload.vpsByPlayer)) {
			vpsMap.set(
				color,
				vps.map((v) => ({ playerColor: color, round: v.round, vp: v.vp }))
			);
		}
		reportMarkdown = generateDiagnosticReport(tags, vpsMap, {
			gameId: payload.gameId,
			gameDisplayName: payload.displayName ?? undefined,
			gameDate: payload.endedAt ?? undefined
		});
		reportOpen = true;
		reportCopied = false;
	}

	async function copyReport(): Promise<void> {
		if (!reportMarkdown) return;
		try {
			await navigator.clipboard.writeText(reportMarkdown);
			reportCopied = true;
			setTimeout(() => (reportCopied = false), 1400);
		} catch {
			// fallback: select-all in a textarea is overkill; just toggle a "copy failed" hint.
			reportCopied = false;
		}
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString();
		} catch {
			return iso.slice(0, 10);
		}
	}
</script>

<div class="games">
	{#if !focusGameId}
		<div class="games__empty brand-panel">
			<EmptyState
				title="Pick a game"
				description="Click a game in the sidebar to overlay each player's VP against their tagged composition's ideal curve."
				variant="cyan"
			/>
		</div>
	{:else if error}
		<div class="games__error" role="alert">{error}</div>
	{:else if loading || !payload}
		<div class="games__loading brand-panel">
			<EmptyState title="Loading…" variant="cyan" />
		</div>
	{:else}
		<header class="games__head">
			<div>
				<span class="eyebrow">03 · GAME</span>
				<h2 class="brand-flame-text">{payload.displayName ?? payload.gameId.slice(0, 12)}</h2>
				<p class="games__meta">
					{fmtDate(payload.endedAt)} · {payload.totalRounds ?? '—'} rounds · {payload.tags.filter(
						(t) => t.composition
					).length}/{payload.tags.length} tagged
				</p>
			</div>
			<div class="games__head-actions">
				<button class="btn-flame" type="button" onclick={generateReport}>Generate report</button>
			</div>
		</header>

		<section class="games__chart brand-panel">
			<canvas bind:this={canvas} aria-label="Player VP overlay vs ideal curves"></canvas>
		</section>

		<aside class="games__legend">
			{#each payload.tags as t (t.playerColor)}
				<div class="games__legend-row">
					<span
						class="games__color"
						style="background:{PLAYER_COLOR_HEX[t.playerColor as PlayerColor] ??
							t.composition?.color ??
							'#24d4ff'}"
						aria-hidden="true"
					></span>
					<span class="games__legend-name">{t.playerColor}</span>
					{#if t.composition}
						<span class="games__legend-comp" style="color:{t.composition.color}">
							{t.composition.name}{#if t.composition.category}<span class="games__legend-cat">
									· {t.composition.category}</span
								>{/if}
						</span>
						{#if !t.composition.ideal_curve_points}
							<span class="games__legend-warn">no ideal curve</span>
						{/if}
					{:else}
						<span class="games__legend-warn">untagged</span>
					{/if}
				</div>
			{/each}
		</aside>

		{#if reportOpen}
			<aside class="games__report" role="dialog" aria-labelledby="diag-title">
				<header class="games__report-head">
					<h3 id="diag-title">Diagnostic report</h3>
					<div class="games__report-actions">
						<button class="btn-ghost" type="button" onclick={copyReport}>
							{reportCopied ? 'Copied!' : 'Copy markdown'}
						</button>
						<button
							class="games__report-close"
							type="button"
							aria-label="Close report"
							onclick={() => (reportOpen = false)}
						>
							×
						</button>
					</div>
				</header>
				<pre class="games__report-body">{reportMarkdown}</pre>
			</aside>
		{/if}
	{/if}
</div>

<style>
	.games {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 240px;
		gap: 24px;
		grid-template-areas:
			'head head'
			'chart legend';
	}

	.games__empty,
	.games__loading {
		grid-column: 1 / -1;
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.games__error {
		grid-column: 1 / -1;
		padding: 16px;
		background: rgba(255, 112, 77, 0.08);
		border: 1px solid var(--brand-coral);
		color: var(--brand-coral);
		border-radius: 4px;
	}

	.games__head {
		grid-area: head;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--color-mist);
	}

	.eyebrow {
		display: block;
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 4px;
	}

	.games__head h2 {
		font-family: var(--font-display);
		font-size: 24px;
		margin: 0;
	}

	.games__meta {
		font-size: 12px;
		color: var(--color-fog);
		font-family: var(--font-mono);
		margin: 4px 0 0;
	}

	.games__chart {
		grid-area: chart;
		min-height: 480px;
		padding: 16px;
		display: flex;
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
	}

	.games__legend {
		grid-area: legend;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 8px;
		max-height: 480px;
		overflow: auto;
	}

	.games__legend-row {
		display: grid;
		grid-template-columns: 14px 60px 1fr;
		gap: 8px;
		align-items: center;
		font-size: 12px;
		color: var(--color-parchment);
	}

	.games__color {
		width: 12px;
		height: 12px;
		border-radius: 9999px;
	}

	.games__legend-name {
		font-family: var(--font-display);
	}

	.games__legend-comp {
		font-family: var(--font-body);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.games__legend-cat {
		color: var(--color-fog);
		font-family: var(--font-mono);
		font-size: 10px;
	}

	.games__legend-warn {
		color: var(--brand-amber);
		font-family: var(--font-mono);
		font-size: 10px;
		text-transform: uppercase;
	}

	.games__report {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 50vw;
		max-width: 720px;
		background: var(--color-shadow);
		border-left: 1px solid var(--color-mist);
		display: flex;
		flex-direction: column;
		z-index: 50;
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
	}

	.games__report-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid var(--color-mist);
	}

	.games__report-head h3 {
		font-family: var(--font-display);
		font-size: 18px;
		margin: 0;
	}

	.games__report-actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.games__report-close {
		background: transparent;
		border: 0;
		color: var(--color-fog);
		font-size: 24px;
		cursor: pointer;
		line-height: 1;
		padding: 0 8px;
	}

	.games__report-close:hover {
		color: var(--color-bone);
	}

	.games__report-body {
		flex: 1;
		margin: 0;
		padding: 20px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--color-bone);
		white-space: pre-wrap;
		overflow: auto;
	}

	/* Local button defs (would extract if reused beyond library/games) */
	.btn-flame,
	.btn-ghost {
		font-family: var(--font-display);
		font-size: 12px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 8px 14px;
		border-radius: 6px;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn-flame {
		background: linear-gradient(135deg, var(--brand-magenta), var(--brand-violet));
		color: var(--color-bone);
	}

	.btn-ghost {
		background: transparent;
		border-color: var(--brand-cyan);
		color: var(--brand-cyan);
	}

	@media (prefers-reduced-motion: reduce) {
		.games__report {
			box-shadow: none;
		}
	}
</style>
