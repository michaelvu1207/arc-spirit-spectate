<script lang="ts">
	import type { AttackDie, DiceTier, SeatColor } from '$lib/play/types';

	interface SwapTarget {
		seat: SeatColor;
		name: string;
		accent: string;
		dice: AttackDie[];
	}

	interface Props {
		myDice: AttackDie[];
		targets: SwapTarget[];
		busy?: boolean;
		onConfirm: (swaps: { targetSeat: SeatColor; myInstanceId: string; theirInstanceId: string }[]) => void;
		onCancel: () => void;
	}

	let { myDice, targets, busy = false, onConfirm, onCancel }: Props = $props();

	const TIER_LABEL: Record<DiceTier, string> = {
		basic: 'Basic',
		enchanted: 'Enchanted',
		exalted: 'Exalted',
		arcane: 'Arcane'
	};
	const TIER_COLOR: Record<DiceTier, string> = {
		basic: '#8d8aa1',
		enchanted: '#4d8bf0',
		exalted: '#b06bff',
		arcane: '#ff2bc7'
	};

	// Per-target selection: which of MY dice to give + which of THEIRS to take.
	let pick = $state<Record<string, { mine?: string; theirs?: string }>>({});

	// A die of mine already committed to another target can't be reused.
	function mineUsedElsewhere(seat: SeatColor, instanceId: string): boolean {
		return Object.entries(pick).some(([s, p]) => s !== seat && p.mine === instanceId);
	}
	function setMine(seat: SeatColor, instanceId: string) {
		const cur = pick[seat] ?? {};
		pick = { ...pick, [seat]: { ...cur, mine: cur.mine === instanceId ? undefined : instanceId } };
	}
	function setTheirs(seat: SeatColor, instanceId: string) {
		const cur = pick[seat] ?? {};
		pick = { ...pick, [seat]: { ...cur, theirs: cur.theirs === instanceId ? undefined : instanceId } };
	}

	const swaps = $derived(
		targets
			.map((t) => ({ targetSeat: t.seat, myInstanceId: pick[t.seat]?.mine, theirInstanceId: pick[t.seat]?.theirs }))
			.filter((s): s is { targetSeat: SeatColor; myInstanceId: string; theirInstanceId: string } =>
				Boolean(s.myInstanceId && s.theirInstanceId)
			)
	);
</script>

<div class="infil" data-testid="infiltrator-swap">
	<div class="head">Infiltrator — swap 1 attack die with each player</div>

	{#each targets as t (t.seat)}
		<div class="target" style="--seat: {t.accent}">
			<div class="t-name">{t.name}</div>
			<div class="rows">
				<div class="line">
					<span class="line-label">Their die to take</span>
					<div class="dice">
						{#if t.dice.length === 0}
							<span class="none">no dice</span>
						{/if}
						{#each t.dice as die (die.instanceId)}
							<button
								type="button"
								class="die"
								class:selected={pick[t.seat]?.theirs === die.instanceId}
								style="--tier: {TIER_COLOR[die.tier]}"
								disabled={busy}
								data-testid={`infil-theirs-${t.seat}-${die.instanceId}`}
								onclick={() => setTheirs(t.seat, die.instanceId)}
							>
								{TIER_LABEL[die.tier]}
							</button>
						{/each}
					</div>
				</div>
				<div class="line">
					<span class="line-label">Your die to give</span>
					<div class="dice">
						{#if myDice.length === 0}
							<span class="none">no dice</span>
						{/if}
						{#each myDice as die (die.instanceId)}
							<button
								type="button"
								class="die"
								class:selected={pick[t.seat]?.mine === die.instanceId}
								style="--tier: {TIER_COLOR[die.tier]}"
								disabled={busy || mineUsedElsewhere(t.seat, die.instanceId)}
								data-testid={`infil-mine-${t.seat}-${die.instanceId}`}
								onclick={() => setMine(t.seat, die.instanceId)}
							>
								{TIER_LABEL[die.tier]}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/each}

	<div class="actions">
		<button
			type="button"
			class="confirm"
			disabled={busy || swaps.length === 0}
			data-testid="infil-confirm"
			onclick={() => onConfirm(swaps)}
		>
			Swap {swaps.length} die{swaps.length === 1 ? '' : 's'}
		</button>
		<button type="button" class="cancel" disabled={busy} onclick={() => onCancel()}>Cancel</button>
	</div>
</div>

<style>
	.infil {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
		max-width: min(820px, calc(100vw - 680px));
		width: 100%;
	}
	.head {
		font-family: var(--font-display);
		font-size: clamp(1rem, 1.6vw, 1.25rem);
		letter-spacing: 0.04em;
		color: var(--brand-violet-soft, #b6a8ff);
		text-align: center;
	}
	.target {
		width: 100%;
		border: 1px solid color-mix(in srgb, var(--seat) 50%, transparent);
		border-left: 3px solid var(--seat);
		border-radius: 12px;
		background: rgba(15, 10, 28, 0.5);
		padding: 0.8rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.t-name {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--seat);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.line-label {
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		color: var(--color-fog, #8d8aa1);
		min-width: 8.5rem;
	}
	.dice {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.none {
		font-size: 0.78rem;
		color: var(--color-fog, #8d8aa1);
		font-style: italic;
	}
	.die {
		font: inherit;
		font-size: 0.78rem;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--tier);
		background: color-mix(in srgb, var(--tier) 16%, transparent);
		color: #fff;
		cursor: pointer;
		transition: box-shadow 140ms ease, transform 140ms ease, opacity 140ms ease;
	}
	.die.selected {
		box-shadow: 0 0 0 2px var(--tier);
		transform: translateY(-2px);
	}
	.die:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.actions {
		display: flex;
		gap: 0.8rem;
	}
	.confirm,
	.cancel {
		font: inherit;
		padding: 0.55rem 1.2rem;
		border-radius: 8px;
		cursor: pointer;
	}
	.confirm {
		border: 1px solid var(--brand-violet, #5a2bff);
		background: color-mix(in srgb, var(--brand-violet, #5a2bff) 30%, transparent);
		color: #fff;
	}
	.cancel {
		border: 1px solid rgba(255, 255, 255, 0.25);
		background: transparent;
		color: inherit;
	}
	.confirm:disabled,
	.cancel:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
