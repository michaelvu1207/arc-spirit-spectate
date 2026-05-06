<script lang="ts">
	import type { PageData } from './$types';
	import IdealCurveEditor from '$lib/components/composition-analysis/IdealCurveEditor.svelte';
	import EmptyState from '$lib/components/composition-analysis/EmptyState.svelte';
	import { compositionAnalysisStore as store } from '$lib/stores/compositionAnalysis.svelte';
	import { CURVE_POINTS, REFERENCE_NAME } from '$lib/compositions/schema';
	import type { Composition } from '$lib/compositions/schema';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();

	let compositions = $state<Composition[]>(data.compositions);

	const visibleComps = $derived.by(() => {
		const list = compositions.filter((c) => store.showReference || !c.is_reference);
		return list;
	});

	let selectedId = $state<string | null>(visibleComps[0]?.id ?? null);
	const selected = $derived<Composition | null>(
		compositions.find((c) => c.id === selectedId) ?? null
	);

	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let lastSavedAt = $state<string | null>(null);
	let lastError = $state<string | null>(null);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function bumpStatus(next: 'saving' | 'saved' | 'error', err?: string): void {
		saveStatus = next;
		if (next === 'saved') {
			lastSavedAt = new Date().toISOString();
			lastError = null;
			setTimeout(() => {
				if (saveStatus === 'saved') saveStatus = 'idle';
			}, 1100);
		}
		if (next === 'error') lastError = err ?? 'Unknown error';
	}

	async function persistPatch(id: string, patch: Partial<Composition>): Promise<void> {
		bumpStatus('saving');
		try {
			const res = await fetch(`/api/compositions/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => `HTTP ${res.status}`);
				throw new Error(txt);
			}
			const updated = (await res.json()) as Composition;
			compositions = compositions.map((c) => (c.id === id ? updated : c));
			bumpStatus('saved');
		} catch (err) {
			bumpStatus('error', err instanceof Error ? err.message : String(err));
		}
	}

	function debouncedSave(id: string, patch: Partial<Composition>): void {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void persistPatch(id, patch);
		}, 300);
	}

	function onCurveChange(next: number[]): void {
		if (!selected) return;
		// Optimistic local update so UI feels instant.
		compositions = compositions.map((c) =>
			c.id === selected.id ? { ...c, ideal_curve_points: next } : c
		);
		debouncedSave(selected.id, { ideal_curve_points: next });
	}

	function onMetadataChange(patch: Partial<Composition>): void {
		if (!selected) return;
		compositions = compositions.map((c) => (c.id === selected.id ? { ...c, ...patch } : c));
		debouncedSave(selected.id, patch);
	}

	async function createNewComposition(): Promise<void> {
		const name = window.prompt('Name for the new composition:')?.trim();
		if (!name) return;
		try {
			const res = await fetch('/api/compositions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
			const created = (await res.json()) as Composition;
			compositions = [...compositions, created].sort((a, b) => a.name.localeCompare(b.name));
			selectedId = created.id;
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		}
	}

	async function createIdealForSelected(): Promise<void> {
		if (!selected) return;
		const seed = Array.from({ length: CURVE_POINTS }, (_, i) => i + 1);
		await persistPatch(selected.id, { ideal_curve_points: seed });
	}

	async function deleteIdealForSelected(): Promise<void> {
		if (!selected) return;
		if (!window.confirm(`Delete the ideal curve for "${selected.name}"? The composition stays.`)) return;
		await persistPatch(selected.id, { ideal_curve_points: null });
	}

	let reassignModalOpen = $state(false);
	let reassignTargetId = $state<string | null>(null);
	let reassignBusy = $state(false);
	let reassignError = $state<string | null>(null);

	async function deleteComposition(): Promise<void> {
		if (!selected) return;
		const confirm = window.prompt(
			`Type "${selected.name}" to delete this composition. This is permanent.`
		);
		if (confirm !== selected.name) return;
		try {
			const res = await fetch(`/api/compositions/${selected.id}`, { method: 'DELETE' });
			if (res.status === 409) {
				// FK in use — open reassign modal.
				reassignTargetId =
					compositions.find((c) => c.id !== selected.id && !c.is_reference)?.id ?? null;
				reassignError = null;
				reassignModalOpen = true;
				return;
			}
			if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
			compositions = compositions.filter((c) => c.id !== selected.id);
			selectedId = compositions[0]?.id ?? null;
		} catch (err) {
			alert(err instanceof Error ? err.message : String(err));
		}
	}

	async function reassignAndDelete(): Promise<void> {
		if (!selected || !reassignTargetId) return;
		reassignBusy = true;
		reassignError = null;
		try {
			const reassignRes = await fetch('/api/player-compositions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					reassign_from: selected.id,
					composition_id: reassignTargetId
				})
			});
			if (!reassignRes.ok) {
				throw new Error(await reassignRes.text().catch(() => `HTTP ${reassignRes.status}`));
			}
			const deleteRes = await fetch(`/api/compositions/${selected.id}`, { method: 'DELETE' });
			if (!deleteRes.ok) {
				throw new Error(await deleteRes.text().catch(() => `HTTP ${deleteRes.status}`));
			}
			compositions = compositions.filter((c) => c.id !== selected.id);
			selectedId = compositions[0]?.id ?? null;
			reassignModalOpen = false;
		} catch (err) {
			reassignError = err instanceof Error ? err.message : String(err);
		} finally {
			reassignBusy = false;
		}
	}

	const SWATCHES = ['#ff2bc7', '#7b1dff', '#24d4ff', '#20e0c1', '#ffba3d', '#ff704d'];

	function fmtSavedAt(iso: string | null): string {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleTimeString();
		} catch {
			return '';
		}
	}
</script>

{#if compositions.length === 0}
	<div class="lib-empty">
		<EmptyState
			title="No compositions yet"
			description="Compositions are the strategies you tag games with. Build your first."
			variant="amber"
		>
			{#snippet action()}
				<button class="btn-primary" type="button" onclick={createNewComposition}>+ Create composition</button>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="lib">
		<aside class="lib__list" aria-label="Compositions">
			<header class="lib__list-head">
				<span class="eyebrow">02 · COMPOSITIONS</span>
				<button class="btn-ghost" type="button" onclick={createNewComposition}>+ New</button>
			</header>

			<label class="lib__toggle">
				<input
					type="checkbox"
					checked={store.showReference}
					onchange={(e) => store.setShowReference((e.currentTarget as HTMLInputElement).checked)}
				/>
				Show reference baseline
			</label>

			<ul role="list">
				{#each visibleComps as c (c.id)}
					{@const isActive = selectedId === c.id}
					<li>
						<button
							class="lib__row"
							class:lib__row--active={isActive}
							class:lib__row--archived={!c.is_active}
							type="button"
							onclick={() => (selectedId = c.id)}
						>
							<span class="lib__row-swatch" style="background:{c.color}"></span>
							<span class="lib__row-text">
								<span class="lib__row-name">{c.name}</span>
								<span class="lib__row-meta">
									{#if c.category}{c.category}{:else}—{/if}
									{#if c.ideal_curve_points}· curve set{:else}· no curve{/if}
									{#if !c.is_active}· archived{/if}
								</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</aside>

		<section class="lib__editor brand-panel">
			{#if !selected}
				<EmptyState title="Pick a composition" variant="cyan" />
			{:else}
				<header class="lib__editor-head">
					<div>
						<span class="eyebrow">EDITING</span>
						<input
							class="lib__name-input brand-flame-text"
							value={selected.name}
							onchange={(e) =>
								onMetadataChange({ name: (e.currentTarget as HTMLInputElement).value })}
							readonly={selected.is_reference}
							aria-label="Composition name"
						/>
					</div>

					<div
						class="lib__save"
						class:lib__save--saving={saveStatus === 'saving'}
						class:lib__save--saved={saveStatus === 'saved'}
						class:lib__save--error={saveStatus === 'error'}
						aria-live="polite"
						title={lastSavedAt ? `Last saved: ${fmtSavedAt(lastSavedAt)}` : ''}
					>
						{#if saveStatus === 'saving'}
							Saving…
						{:else if saveStatus === 'saved'}
							Saved
						{:else if saveStatus === 'error'}
							Save failed
						{:else if lastSavedAt}
							Saved at {fmtSavedAt(lastSavedAt)}
						{:else}
							Idle
						{/if}
					</div>
				</header>

				<div class="lib__metadata">
					<label class="lib__field">
						<span>Category</span>
						<input
							type="text"
							value={selected.category ?? ''}
							placeholder="e.g. Aggro"
							onchange={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value.trim();
								onMetadataChange({ category: v.length ? v : null });
							}}
						/>
					</label>

					<label class="lib__field">
						<span>Color</span>
						<div class="lib__color-row">
							<input
								type="color"
								value={selected.color}
								onchange={(e) =>
									onMetadataChange({ color: (e.currentTarget as HTMLInputElement).value })}
							/>
							{#each SWATCHES as s (s)}
								<button
									class="lib__swatch"
									class:lib__swatch--active={selected.color.toLowerCase() === s}
									type="button"
									style="background:{s}"
									aria-label="Use {s}"
									onclick={() => onMetadataChange({ color: s })}
								></button>
							{/each}
						</div>
					</label>

					<label class="lib__field lib__field--checkbox">
						<input
							type="checkbox"
							checked={selected.is_active}
							disabled={selected.is_reference}
							onchange={(e) =>
								onMetadataChange({ is_active: (e.currentTarget as HTMLInputElement).checked })}
						/>
						<span>Active (showable in tag picker)</span>
					</label>
				</div>

				<div class="lib__chart">
					{#if selected.ideal_curve_points}
						<IdealCurveEditor
							points={selected.ideal_curve_points}
							color={selected.color}
							readonly={selected.is_reference && !store.showReference}
							onchange={onCurveChange}
						/>
					{:else}
						<EmptyState
							title="No ideal curve yet"
							description="Create a starting curve, then drag points to shape it."
							variant="cyan"
						>
							{#snippet action()}
								<button class="btn-primary" type="button" onclick={createIdealForSelected}>
									+ Create curve
								</button>
							{/snippet}
						</EmptyState>
					{/if}
				</div>

				<label class="lib__field">
					<span>Description</span>
					<textarea
						rows="3"
						value={selected.description ?? ''}
						placeholder="What's this composition's strategy?"
						onchange={(e) => {
							const v = (e.currentTarget as HTMLTextAreaElement).value;
							onMetadataChange({ description: v.length ? v : null });
						}}
					></textarea>
				</label>

				{#if !selected.is_reference}
					<footer class="lib__danger">
						<span class="eyebrow">DANGER</span>
						<div class="lib__danger-row">
							{#if selected.ideal_curve_points}
								<button class="btn-danger-ghost" type="button" onclick={deleteIdealForSelected}>
									Delete curve only
								</button>
							{/if}
							<button class="btn-danger" type="button" onclick={deleteComposition}>
								Delete composition
							</button>
						</div>
					</footer>
				{/if}

				{#if lastError}
					<p class="lib__error" role="alert">{lastError}</p>
				{/if}
			{/if}
		</section>
	</div>
{/if}

{#if reassignModalOpen && selected}
	<div class="lib-modal-backdrop" role="presentation" onclick={() => (reassignModalOpen = false)}></div>
	<div
		class="lib-modal brand-panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="reassign-title"
	>
		<header class="lib-modal__head">
			<h3 id="reassign-title">Reassign tags before delete</h3>
			<button
				class="lib-modal__close"
				type="button"
				aria-label="Cancel"
				onclick={() => (reassignModalOpen = false)}>×</button
			>
		</header>
		<p class="lib-modal__body">
			<strong>{selected.name}</strong> is tagged on existing games. Pick a replacement composition to
			move every tag onto, then this composition will be deleted.
		</p>

		<label class="lib-modal__label">
			<span>Reassign to:</span>
			<select bind:value={reassignTargetId} disabled={reassignBusy}>
				{#each compositions.filter((c) => c.id !== selected!.id && !c.is_reference) as c (c.id)}
					<option value={c.id}>{c.name}{c.is_active ? '' : ' (archived)'}</option>
				{/each}
			</select>
		</label>

		{#if reassignError}
			<p class="lib-modal__error" role="alert">{reassignError}</p>
		{/if}

		<footer class="lib-modal__foot">
			<button
				class="btn-ghost"
				type="button"
				disabled={reassignBusy}
				onclick={() => (reassignModalOpen = false)}>Cancel</button
			>
			<button
				class="btn-danger"
				type="button"
				disabled={reassignBusy || !reassignTargetId}
				onclick={() => void reassignAndDelete()}
			>
				{reassignBusy ? 'Working…' : 'Reassign all & delete'}
			</button>
		</footer>
	</div>
{/if}

<style>
	.lib-empty {
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lib {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 24px;
		min-height: calc(100vh - 220px);
	}

	.lib__list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.lib__list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--color-mist);
	}

	.lib__list-head :global(.eyebrow) {
		display: inline-block;
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.lib__toggle {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		color: var(--color-fog);
	}

	.lib__list ul {
		list-style: none;
		padding: 0;
		margin: 0;
		overflow: auto;
		flex: 1;
	}

	.lib__row {
		display: grid;
		grid-template-columns: 16px 1fr;
		gap: 12px;
		align-items: center;
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--color-shadow);
		color: var(--color-parchment);
		font-family: var(--font-body);
		cursor: pointer;
		border-radius: 4px;
		transition: background-color 120ms ease-in-out;
	}

	.lib__row:hover {
		background: var(--color-shadow);
	}

	.lib__row--active {
		background: rgba(36, 212, 255, 0.08);
		color: var(--color-bone);
	}

	.lib__row--archived {
		opacity: 0.55;
	}

	.lib__row-swatch {
		width: 12px;
		height: 12px;
		border-radius: 9999px;
		display: inline-block;
	}

	.lib__row-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.lib__row-name {
		font-family: var(--font-display);
		font-size: 14px;
	}

	.lib__row-meta {
		font-size: 11px;
		color: var(--color-fog);
		font-family: var(--font-mono);
	}

	.lib__editor {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 24px;
		min-height: 0;
	}

	.lib__editor-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--color-mist);
	}

	.lib__editor-head :global(.eyebrow) {
		display: inline-block;
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 4px;
	}

	.lib__name-input {
		font-family: var(--font-display);
		font-size: 24px;
		background: transparent;
		border: 0;
		color: var(--color-bone);
		min-width: 320px;
	}

	.lib__name-input:focus-visible {
		outline: none;
		box-shadow: 0 0 0 1px var(--brand-cyan);
		border-radius: 2px;
	}

	.lib__save {
		font-size: 12px;
		font-family: var(--font-mono);
		padding: 4px 12px;
		border-radius: 9999px;
		background: var(--color-shadow);
		color: var(--color-fog);
		transition: color 200ms ease-out, background-color 200ms ease-out;
	}

	.lib__save--saving {
		color: var(--brand-amber);
	}

	.lib__save--saved {
		color: var(--brand-teal);
		box-shadow: 0 0 12px rgba(32, 224, 193, 0.45);
	}

	.lib__save--error {
		color: var(--brand-coral);
	}

	@media (prefers-reduced-motion: reduce) {
		.lib__save {
			transition: none;
		}
	}

	.lib__metadata {
		display: grid;
		grid-template-columns: minmax(160px, 220px) 1fr auto;
		gap: 16px;
		align-items: end;
	}

	.lib__field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--color-fog);
	}

	.lib__field input[type='text'],
	.lib__field textarea {
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 13px;
		padding: 8px 10px;
	}

	.lib__field input[type='color'] {
		width: 40px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		padding: 2px;
	}

	.lib__color-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.lib__swatch {
		width: 22px;
		height: 22px;
		border-radius: 9999px;
		border: 2px solid transparent;
		cursor: pointer;
	}

	.lib__swatch--active {
		border-color: var(--color-bone);
		box-shadow: 0 0 8px currentColor;
	}

	.lib__field--checkbox {
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}

	.lib__chart {
		flex: 1;
		min-height: 360px;
		display: flex;
		flex-direction: column;
	}

	.lib__danger {
		padding-top: 12px;
		border-top: 1px solid var(--color-mist);
	}

	.lib__danger :global(.eyebrow) {
		display: block;
		color: var(--brand-coral);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 8px;
	}

	.lib__danger-row {
		display: flex;
		gap: 8px;
	}

	.lib__error {
		margin: 0;
		padding: 8px 12px;
		color: var(--brand-coral);
		background: rgba(255, 112, 77, 0.08);
		border: 1px solid var(--brand-coral);
		border-radius: 4px;
		font-size: 12px;
	}

	/* Buttons — local definitions to keep the file self-contained.
	   Use brand utility classes (.btn-flame, .btn-ghost) where they exist in layout.css. */
	.btn-primary,
	.btn-ghost,
	.btn-danger,
	.btn-danger-ghost {
		font-family: var(--font-display);
		font-size: 12px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 8px 14px;
		border-radius: 6px;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--brand-magenta), var(--brand-violet));
		color: var(--color-bone);
		border-color: transparent;
	}

	.btn-ghost {
		background: transparent;
		border-color: var(--brand-cyan);
		color: var(--brand-cyan);
	}

	.btn-danger {
		background: var(--brand-coral);
		color: var(--color-void);
	}

	.btn-danger-ghost {
		background: transparent;
		border-color: var(--brand-coral);
		color: var(--brand-coral);
	}

	.lib-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 3, 16, 0.7);
		z-index: 60;
	}

	.lib-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 32px));
		padding: 20px 24px;
		z-index: 61;
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: 0 4px 24px rgba(36, 212, 255, 0.12);
	}

	.lib-modal__head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.lib-modal__head h3 {
		font-family: var(--font-display);
		font-size: 18px;
		margin: 0;
	}

	.lib-modal__close {
		background: transparent;
		border: 0;
		color: var(--color-fog);
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		padding: 0 6px;
	}

	.lib-modal__close:hover {
		color: var(--color-bone);
	}

	.lib-modal__body {
		margin: 0;
		font-size: 13px;
		color: var(--color-parchment);
	}

	.lib-modal__label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--color-fog);
	}

	.lib-modal__label select {
		padding: 8px 10px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 13px;
	}

	.lib-modal__error {
		margin: 0;
		padding: 8px 12px;
		font-size: 12px;
		color: var(--brand-coral);
		background: rgba(255, 112, 77, 0.08);
		border: 1px solid var(--brand-coral);
		border-radius: 4px;
	}

	.lib-modal__foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--color-mist);
	}
</style>
