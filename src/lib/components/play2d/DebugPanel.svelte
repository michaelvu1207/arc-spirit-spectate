<script lang="ts">
	import type { DebugGrant, DiceTier, SeatColor, SpectatorProjection } from '$lib/play/types';
	import type { getAssetState } from '$lib/stores/assetStore.svelte';

	interface Props {
		room: SpectatorProjection;
		mySeat: SeatColor | null;
		assets: ReturnType<typeof getAssetState>;
		busy?: boolean;
		onGrant: (grant: DebugGrant, seatColor?: SeatColor) => void;
	}

	let { room, mySeat, assets, busy = false, onGrant }: Props = $props();

	let open = $state(false);

	// Players currently in the game — pick whose status to set ('' = your own seat).
	const players = $derived(
		room.activeSeats.map((seat) => ({
			seat,
			label: `${room.seats[seat]?.displayName ?? seat}${seat === mySeat ? ' (you)' : ''}`
		}))
	);
	let statusSeat = $state<SeatColor | ''>('');

	const DICE_TIERS: DiceTier[] = ['basic', 'enchanted', 'exalted', 'arcane'];
	const STATUS_LABELS = ['Pure', 'Tainted', 'Corrupt', 'Fallen'];

	// Catalog lists (sorted) from the asset store.
	const spirits = $derived(
		[...assets.spiritAssets.values()]
			.map((s) => ({ id: s.id, name: s.name, cost: s.cost }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const runes = $derived(
		[...assets.runeAssets.entries()]
			.map(([id, r]) => ({ id, name: r.name ?? 'Rune' }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	// Form state.
	let diceTier = $state<DiceTier>('basic');
	let diceAmount = $state(1);
	let augmentAmount = $state(1);
	let spiritFilter = $state('');
	let spiritId = $state('');
	let spiritFaceDown = $state(true);
	let runeId = $state('');
	let statusLevel = $state(0);

	const filteredSpirits = $derived(
		spiritFilter.trim()
			? spirits.filter((s) => s.name.toLowerCase().includes(spiritFilter.trim().toLowerCase()))
			: spirits
	);

	function grant(g: DebugGrant, seatColor?: SeatColor) {
		if (busy) return;
		onGrant(g, seatColor);
	}
	function giveSpirit() {
		if (!spiritId) return;
		grant({ kind: 'spirit', spiritId, faceDown: spiritFaceDown });
	}
	function giveRune() {
		if (!runeId) return;
		grant({ kind: 'rune', runeId });
	}
	function giveAugment() {
		grant({ kind: 'augment', amount: augmentAmount });
	}
</script>

<div class="debug-root">
	<button
		type="button"
		class="toggle"
		class:on={open}
		data-testid="debug-panel-toggle"
		onclick={() => (open = !open)}
	>
		🛠 DEBUG
	</button>

	{#if open}
		<div class="panel" data-testid="debug-panel">
			<!-- Quick resources -->
			<section class="grp">
				<span class="grp-h">Resources</span>
				<div class="row">
					<button class="b" disabled={busy} onclick={() => grant({ kind: 'potential', amount: 1 })}>+1 Potential</button>
					<button class="b" disabled={busy} onclick={() => grant({ kind: 'potential', amount: 4 })}>+4 Potential</button>
					<button class="b" disabled={busy} onclick={() => grant({ kind: 'vp', amount: 1 })}>+1 VP</button>
					<button class="b" disabled={busy} onclick={() => grant({ kind: 'vp', amount: 5 })}>+5 VP</button>
					<button class="b" disabled={busy} onclick={() => grant({ kind: 'fullHeal' })}>Full heal</button>
				</div>
				<div class="row">
					<span class="lbl">Status</span>
					<select class="sel" aria-label="Player" bind:value={statusSeat}>
						<option value="">You</option>
						{#each players as p (p.seat)}
							{#if p.seat !== mySeat}<option value={p.seat}>{p.label}</option>{/if}
						{/each}
					</select>
					<select class="sel" aria-label="Status level" bind:value={statusLevel}>
						{#each STATUS_LABELS as label, i (i)}<option value={i}>{label}</option>{/each}
					</select>
					<button
						class="b"
						disabled={busy}
						onclick={() =>
							grant({ kind: 'status', level: statusLevel }, statusSeat === '' ? undefined : statusSeat)}
					>Set</button>
				</div>
			</section>

			<!-- Attack dice -->
			<section class="grp">
				<span class="grp-h">Attack dice</span>
				<div class="row">
					<select class="sel" bind:value={diceTier}>
						{#each DICE_TIERS as t (t)}<option value={t}>{t}</option>{/each}
					</select>
					<input class="num" type="number" min="1" max="20" bind:value={diceAmount} />
					<button class="b" disabled={busy} onclick={() => grant({ kind: 'attackDice', tier: diceTier, amount: diceAmount })}>Give</button>
				</div>
			</section>

			<!-- Augments (you pick which of the 6 Spirit Augments at placement time) -->
			<section class="grp">
				<span class="grp-h">Spirit Augments</span>
				<div class="row">
					<input class="num" type="number" min="1" max="10" bind:value={augmentAmount} />
					<button class="b" disabled={busy} onclick={giveAugment}>Give to place</button>
				</div>
			</section>

			<!-- Spirit -->
			<section class="grp">
				<span class="grp-h">Spirit</span>
				<input class="text" placeholder="filter…" bind:value={spiritFilter} />
				<div class="row">
					<select class="sel grow" bind:value={spiritId}>
						<option value="">— pick a spirit —</option>
						{#each filteredSpirits as s (s.id)}<option value={s.id}>{s.name} (c{s.cost})</option>{/each}
					</select>
				</div>
				<div class="row">
					<label class="chk"><input type="checkbox" bind:checked={spiritFaceDown} /> face-down (awaken test)</label>
					<button class="b" disabled={busy || !spiritId} onclick={giveSpirit}>Give</button>
				</div>
			</section>

			<!-- Rune / relic -->
			<section class="grp">
				<span class="grp-h">Rune / Relic</span>
				<div class="row">
					<select class="sel grow" bind:value={runeId}>
						<option value="">— pick a rune —</option>
						{#each runes as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
					</select>
					<button class="b" disabled={busy || !runeId} onclick={giveRune}>Give</button>
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.debug-root {
		position: fixed;
		left: 12px;
		bottom: 12px;
		z-index: 90;
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.toggle {
		font-family: var(--font-mono, monospace);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		padding: 5px 9px;
		border-radius: 5px;
		border: 1px solid var(--brand-cyan, #24d4ff);
		background: rgba(8, 5, 16, 0.85);
		color: var(--brand-cyan, #24d4ff);
		cursor: pointer;
	}
	.toggle.on {
		background: var(--brand-cyan, #24d4ff);
		color: #04121a;
	}
	.panel {
		margin-top: 8px;
		width: min(320px, 88vw);
		max-height: 70vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border-radius: 8px;
		border: 1px solid color-mix(in srgb, var(--brand-cyan, #24d4ff) 45%, transparent);
		background: rgba(6, 4, 14, 0.96);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}
	.grp {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.grp:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}
	.grp-h {
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--brand-cyan, #5cdfff);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.b {
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
		padding: 5px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.06);
		color: #e7e0cf;
		cursor: pointer;
	}
	.b:not(:disabled):hover {
		border-color: var(--brand-cyan, #24d4ff);
		color: #fff;
	}
	.b:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.sel,
	.num,
	.text {
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(8, 5, 16, 0.8);
		color: #e7e0cf;
	}
	.sel.grow {
		flex: 1;
		min-width: 0;
	}
	.num {
		width: 56px;
	}
	.text {
		width: 100%;
	}
	.lbl {
		font-size: 0.68rem;
		color: var(--color-fog, #9a8fb8);
	}
	.chk {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 0.66rem;
		color: var(--color-fog, #b9b2cf);
	}
</style>
