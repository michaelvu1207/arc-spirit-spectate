<script lang="ts">
	import type { PlayerProjection } from '$lib/play/types';

	interface Props {
		player: PlayerProjection | null;
		onResolve: (decisionId: string, optionId: string) => void;
	}

	let { player, onResolve }: Props = $props();

	// Owner-only: the projection redacts pendingDecisions for non-owners, so a
	// populated list always belongs to the local player.
	const decisions = $derived(player?.pendingDecisions ?? []);
</script>

{#if decisions.length > 0}
	<!-- In-stage: rendered inside MainStage's view (replaces the stage content). -->
	<div class="panel" data-testid="decision-cards">
		<div class="stack">
			{#each decisions as decision (decision.id)}
				<section class="card" data-testid={`decision-${decision.id}`}>
					<span class="eyebrow">Ability</span>
					<p class="prompt">{decision.prompt}</p>
					<div class="options" role="group" aria-label="Choose an option">
						{#each decision.options as option (option.id)}
							<button
								type="button"
								class="opt"
								class:primary={option.id !== 'no'}
								data-testid={`decision-${decision.id}-${option.id}`}
								onclick={() => onResolve(decision.id, option.id)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</div>
{/if}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: min(640px, calc(100vw - 680px));
		height: 100%;
		max-height: 100%;
		min-height: 0;
		overflow-y: auto;
	}
	@media (max-width: 900px) {
		.panel {
			max-width: min(640px, 94vw);
		}
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1.4rem 1.6rem;
		border-radius: 12px;
		background: linear-gradient(180deg, rgba(18, 10, 38, 0.92), rgba(8, 5, 16, 0.95));
		border: 1px solid color-mix(in srgb, var(--brand-violet, #7b1dff) 40%, transparent);
		border-top: 3px solid var(--brand-magenta, #ff2bc7);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
	}
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--brand-cyan, #24d4ff);
	}
	.prompt {
		margin: 0;
		font-family: var(--font-body);
		font-size: 1rem;
		line-height: 1.5;
		color: var(--color-bone, #f5f0ff);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.opt {
		flex: 1 1 auto;
		min-height: 44px;
		padding: 10px 18px;
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: 1px solid var(--brand-cyan, #24d4ff);
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.3);
		color: var(--color-parchment, #d8cfee);
		cursor: pointer;
		transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
	}
	.opt.primary {
		border-color: var(--brand-magenta, #ff2bc7);
		background: var(--brand-magenta, #ff2bc7);
		color: #fff;
	}
	@media (hover: hover) and (pointer: fine) {
		.opt:hover {
			color: #fff;
			border-color: var(--brand-cyan, #24d4ff);
		}
		.opt.primary:hover {
			background: var(--brand-magenta-soft, #ff7fd9);
		}
	}
	.opt:focus-visible {
		outline: 2px solid var(--brand-cyan, #24d4ff);
		outline-offset: 2px;
	}
</style>
