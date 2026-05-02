<script lang="ts">
	interface Props {
		currentRound: number;
		maxRound: number;
		onRoundChange: (round: number) => void;
		isLive: boolean;
		onToggleLive: () => void;
	}

	let { currentRound, maxRound, onRoundChange, isLive, onToggleLive }: Props = $props();

	const canGoPrevious = $derived(!isLive && currentRound > 1);
	const canGoNext = $derived(!isLive && currentRound < maxRound);
	const canGoFirst = $derived(!isLive && currentRound > 1);
	const canGoLast = $derived(!isLive && currentRound < maxRound);

	function goToFirst() {
		if (canGoFirst) onRoundChange(1);
	}

	function goToPrevious() {
		if (canGoPrevious) onRoundChange(currentRound - 1);
	}

	function goToNext() {
		if (canGoNext) onRoundChange(currentRound + 1);
	}

	function goToLast() {
		if (canGoLast) onRoundChange(maxRound);
	}

	function handleSliderChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newRound = parseInt(target.value, 10);
		if (!isNaN(newRound) && newRound !== currentRound) {
			onRoundChange(newRound);
		}
	}
</script>

<div class="nav-selector">
	<!-- Main navigation row -->
	<div class="nav-row">
		<!-- Navigation buttons and round display -->
		<div class="nav-controls">
			<!-- First button -->
			<button
				type="button"
				onclick={goToFirst}
				disabled={!canGoFirst}
				class="nav-btn"
				aria-label="Go to first round"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
					<path d="M15.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L11.832 10l3.938 3.71a.75.75 0 01.02 1.06zm-6 0a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L5.832 10l3.938 3.71a.75.75 0 01.02 1.06z" />
				</svg>
			</button>

			<!-- Previous button -->
			<button
				type="button"
				onclick={goToPrevious}
				disabled={!canGoPrevious}
				class="nav-btn"
				aria-label="Go to previous round"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
					<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
				</svg>
			</button>

			<!-- Round display -->
			<div class="round-display">
				<span class="round-eyebrow">Round</span>
				<span class="round-number">{currentRound}</span>
				<span class="round-sep">/</span>
				<span class="round-max">{maxRound}</span>
			</div>

			<!-- Next button -->
			<button
				type="button"
				onclick={goToNext}
				disabled={!canGoNext}
				class="nav-btn"
				aria-label="Go to next round"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
					<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
				</svg>
			</button>

			<!-- Last button -->
			<button
				type="button"
				onclick={goToLast}
				disabled={!canGoLast}
				class="nav-btn"
				aria-label="Go to last round"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
					<path d="M4.21 5.23a.75.75 0 011.06-.02l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.04-1.08L8.168 10 4.23 6.29a.75.75 0 01-.02-1.06zm6 0a.75.75 0 011.06-.02l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.04-1.08L14.168 10 10.23 6.29a.75.75 0 01-.02-1.06z" />
				</svg>
			</button>
		</div>

		<!-- Live toggle button -->
		<button
			type="button"
			onclick={onToggleLive}
			class="live-btn"
			class:live-btn-active={isLive}
			aria-label={isLive ? 'Disable live mode' : 'Enable live mode'}
			aria-pressed={isLive}
		>
			<span class="live-dot" class:live-dot-active={isLive}></span>
			<span class="live-label">Live</span>
		</button>
	</div>

	<!-- Slider for quick navigation -->
	{#if maxRound > 1}
		<div class="slider-row">
			<span class="slider-bound">1</span>
			<input
				type="range"
				min="1"
				max={maxRound}
				value={currentRound}
				oninput={handleSliderChange}
				disabled={isLive}
				class="brand-slider"
				class:brand-slider-disabled={isLive}
				aria-label="Round slider"
			/>
			<span class="slider-bound">{maxRound}</span>
		</div>
	{/if}
</div>

<style>
	.nav-selector {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 16px;
		border-radius: 4px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
	}

	.nav-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.nav-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	/* Nav arrow buttons — solid dark squares */
	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 4px;
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
		color: var(--color-parchment);
		transition: border-color 150ms ease, color 150ms ease;
		cursor: pointer;
	}
	.nav-btn:hover:not(:disabled) {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}
	.nav-btn:active:not(:disabled) {
		transform: scale(0.93);
	}
	.nav-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Round display */
	.round-display {
		min-width: 120px;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
	}
	.round-eyebrow {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.round-number {
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 1;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
	}
	.round-sep {
		font-size: 0.85rem;
		color: var(--color-whisper);
	}
	.round-max {
		font-family: var(--font-display);
		font-size: 0.9rem;
		color: var(--color-fog);
	}

	/* Live button — solid chip */
	.live-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 16px;
		border-radius: 2px;
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
		color: var(--color-fog);
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
	}
	.live-btn:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}
	.live-btn-active {
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
		color: #fff;
	}
	.live-btn-active:hover {
		background: var(--brand-magenta-soft);
		border-color: var(--brand-magenta-soft);
	}
	.live-label { line-height: 1; }

	/* Live indicator dot */
	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-fog);
		flex-shrink: 0;
		transition: background 200ms ease;
	}
	.live-dot-active {
		background: #fff;
	}

	/* Slider */
	.slider-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.slider-bound {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--color-whisper);
		flex-shrink: 0;
	}

	.brand-slider {
		flex: 1;
		height: 4px;
		border-radius: 999px;
		background: var(--color-mist);
		appearance: none;
		cursor: pointer;
		accent-color: var(--brand-magenta);
	}
	.brand-slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--brand-magenta);
		box-shadow: 0 0 8px rgba(255, 43, 199, 0.7);
		cursor: pointer;
		transition: transform 150ms ease, box-shadow 150ms ease;
	}
	.brand-slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
		box-shadow: 0 0 14px rgba(255, 43, 199, 1);
	}
	.brand-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: none;
		border-radius: 50%;
		background: var(--brand-magenta);
		box-shadow: 0 0 8px rgba(255, 43, 199, 0.7);
		cursor: pointer;
		transition: transform 150ms ease;
	}
	.brand-slider::-moz-range-thumb:hover {
		transform: scale(1.15);
	}
	.brand-slider::-moz-range-track {
		background: var(--color-mist);
		border-radius: 999px;
		height: 4px;
	}
	.brand-slider-disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.brand-slider-disabled::-webkit-slider-thumb { cursor: not-allowed; }
	.brand-slider-disabled::-moz-range-thumb     { cursor: not-allowed; }
</style>
