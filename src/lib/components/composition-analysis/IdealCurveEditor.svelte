<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		Tooltip,
		Filler,
		type ChartConfiguration
	} from 'chart.js';
	import {
		CURVE_POINTS,
		CURVE_Y_MAX,
		CURVE_Y_MIN
	} from '$lib/compositions/schema';
	import { xAxisAllRounds, yAxisVp } from '$lib/chartConfig';

	Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler);

	interface Props {
		points: number[];
		color: string;
		readonly?: boolean;
		onchange?: (next: number[]) => void;
	}
	let { points, color, readonly = false, onchange }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let chart: Chart | null = null;

	// Local copy for optimistic drag updates. Seeded once; subsequent prop
	// changes flow through the $effect below.
	let local = $state<number[]>(untrack(() => [...points]));

	// Selected point index (for keyboard nudge accessibility — A11y-6.1).
	let selectedIdx = $state<number | null>(null);
	let draggingIdx: number | null = null;

	$effect(() => {
		// Re-sync when the props points reference changes (parent updated externally).
		// Untrack local so we don't loop.
		const next = points;
		untrack(() => {
			local = [...next];
			if (chart) {
				chart.data.datasets[0].data = local.map((y, i) => ({ x: i + 1, y }));
				chart.update('none');
			}
		});
	});

	function buildConfig(): ChartConfiguration<'line'> {
		return {
			type: 'line',
			data: {
				datasets: [
					{
						label: 'Ideal',
						data: local.map((y, i) => ({ x: i + 1, y })),
						borderColor: color,
						backgroundColor: color + '22',
						borderWidth: 2.5,
						tension: 0,
						pointRadius: (ctx) => (ctx.dataIndex === selectedIdx ? 8 : 5),
						pointHoverRadius: 8,
						pointBackgroundColor: color,
						pointBorderColor: 'var(--color-void)',
						pointBorderWidth: 1
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				plugins: { tooltip: { mode: 'nearest', intersect: false }, legend: { display: false } },
				scales: { x: xAxisAllRounds, y: yAxisVp },
				interaction: { mode: 'nearest', intersect: false }
			}
		};
	}

	onMount(() => {
		if (!canvas) return;
		chart = new Chart(canvas, buildConfig());
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});

	function commit(): void {
		if (readonly) return;
		onchange?.([...local]);
	}

	function pickPointAt(evt: PointerEvent): number | null {
		if (!chart || !canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const px = evt.clientX - rect.left;
		const py = evt.clientY - rect.top;

		const xScale = chart.scales.x;
		const yScale = chart.scales.y;
		if (!xScale || !yScale) return null;

		// Find nearest round by x distance, threshold 16px (forgiving).
		let bestIdx = -1;
		let bestDist = Infinity;
		for (let i = 0; i < local.length; i++) {
			const px_i = xScale.getPixelForValue(i + 1);
			const py_i = yScale.getPixelForValue(local[i]);
			const dx = px - px_i;
			const dy = py - py_i;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestDist) {
				bestDist = d2;
				bestIdx = i;
			}
		}
		// Accept within 24px radius.
		return bestDist <= 24 * 24 ? bestIdx : null;
	}

	function setLocal(idx: number, y: number): void {
		const clamped = Math.max(CURVE_Y_MIN, Math.min(CURVE_Y_MAX, y));
		const rounded = Math.round(clamped * 10) / 10;
		const next = [...local];
		next[idx] = rounded;
		local = next;
		if (chart) {
			chart.data.datasets[0].data = local.map((yy, i) => ({ x: i + 1, y: yy }));
			chart.update('none');
		}
	}

	function onPointerDown(evt: PointerEvent): void {
		if (readonly) return;
		const idx = pickPointAt(evt);
		if (idx === null) {
			selectedIdx = null;
			if (chart) chart.update('none');
			return;
		}
		selectedIdx = idx;
		draggingIdx = idx;
		canvas?.setPointerCapture(evt.pointerId);
		if (chart) chart.update('none');
		evt.preventDefault();
	}

	function onPointerMove(evt: PointerEvent): void {
		if (draggingIdx === null || !chart) return;
		const rect = canvas!.getBoundingClientRect();
		const py = evt.clientY - rect.top;
		const yVal = chart.scales.y.getValueForPixel(py);
		if (yVal === undefined || yVal === null) return;
		setLocal(draggingIdx, yVal);
	}

	function onPointerUp(evt: PointerEvent): void {
		if (draggingIdx === null) return;
		canvas?.releasePointerCapture(evt.pointerId);
		draggingIdx = null;
		commit();
	}

	function onKeyDown(evt: KeyboardEvent): void {
		if (readonly) return;
		if (selectedIdx === null) return;
		const step = evt.shiftKey ? 5 : 1;
		if (evt.key === 'ArrowUp') {
			setLocal(selectedIdx, local[selectedIdx] + step);
			evt.preventDefault();
			commit();
		} else if (evt.key === 'ArrowDown') {
			setLocal(selectedIdx, local[selectedIdx] - step);
			evt.preventDefault();
			commit();
		} else if (evt.key === 'ArrowLeft') {
			selectedIdx = Math.max(0, selectedIdx - 1);
			if (chart) chart.update('none');
			evt.preventDefault();
		} else if (evt.key === 'ArrowRight') {
			selectedIdx = Math.min(CURVE_POINTS - 1, selectedIdx + 1);
			if (chart) chart.update('none');
			evt.preventDefault();
		} else if (evt.key === 'Escape') {
			selectedIdx = null;
			if (chart) chart.update('none');
			evt.preventDefault();
		}
	}
</script>

<div class="ce">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
	<div class="ce__chart-wrap" tabindex="0" onkeydown={onKeyDown} role="application" aria-label="Ideal curve editor">
		<canvas
			bind:this={canvas}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		></canvas>
	</div>

	{#if !readonly}
		<p class="ce__hint">
			{#if selectedIdx !== null}
				Round {selectedIdx + 1} selected · {local[selectedIdx]?.toFixed(1)} VP · ↑/↓ nudge ±1, Shift+↑/↓ ±5, Esc to deselect
			{:else}
				Drag any point to adjust · click to select for keyboard nudging
			{/if}
		</p>
	{/if}
</div>

<style>
	.ce {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
		flex: 1;
	}

	.ce__chart-wrap {
		flex: 1;
		min-height: 320px;
		position: relative;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 8px;
		padding: 12px;
		touch-action: none;
		cursor: crosshair;
	}

	.ce__chart-wrap:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--brand-cyan);
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
	}

	.ce__hint {
		margin: 0;
		font-size: 12px;
		color: var(--color-fog);
		font-family: var(--font-mono);
	}
</style>
