<script lang="ts">
	import { onMount } from 'svelte';
	import { loadAssets, getAssetState } from '$lib/stores/assetStore.svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';
	import type { ClassTrait, OriginTrait, ClassBreakpoint, EffectEntry, HexSpiritAsset } from '$lib/types';

	const assetState = getAssetState();
	let search = $state('');
	let typeFilter = $state<'all' | 'class' | 'origin'>('all');

	function url(path: string | null): string | null {
		if (!path) return null;
		if (path.startsWith('http')) return path;
		return `${STORAGE_BASE_URL}/${path}`;
	}

	type Trait =
		| (ClassTrait & { kind: 'class' })
		| (OriginTrait & { kind: 'origin' });

	const traits = $derived(() => {
		const list: Trait[] = [];
		for (const c of assetState.classTraits.values()) list.push({ ...c, kind: 'class' });
		for (const o of assetState.originTraits.values()) list.push({ ...o, kind: 'origin' });
		return list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	});

	const filteredTraits = $derived(() => {
		const q = search.trim().toLowerCase();
		return traits().filter((t) => {
			if (typeFilter !== 'all' && t.kind !== typeFilter) return false;
			if (!q) return true;
			return t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
		});
	});

	const spiritsByTrait = $derived(() => {
		const byClass = new Map<string, Map<string, HexSpiritAsset>>();
		const byOrigin = new Map<string, Map<string, HexSpiritAsset>>();
		for (const spirit of assetState.spiritAssets.values()) {
			const traitsObj = (spirit as HexSpiritAsset).traits as { class_ids?: string[]; origin_ids?: string[] } | null;
			for (const cid of traitsObj?.class_ids ?? []) {
				if (!byClass.has(cid)) byClass.set(cid, new Map());
				byClass.get(cid)!.set(spirit.id, spirit);
			}
			for (const oid of traitsObj?.origin_ids ?? []) {
				if (!byOrigin.has(oid)) byOrigin.set(oid, new Map());
				byOrigin.get(oid)!.set(spirit.id, spirit);
			}
		}
		const sortFn = (a: HexSpiritAsset, b: HexSpiritAsset) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name);
		const finalize = (m: Map<string, Map<string, HexSpiritAsset>>) => {
			const out = new Map<string, HexSpiritAsset[]>();
			for (const [k, inner] of m) out.set(k, Array.from(inner.values()).sort(sortFn));
			return out;
		};
		return { byClass: finalize(byClass), byOrigin: finalize(byOrigin) };
	});

	function spiritsFor(t: Trait): HexSpiritAsset[] {
		const map = t.kind === 'class' ? spiritsByTrait().byClass : spiritsByTrait().byOrigin;
		return map.get(t.id) ?? [];
	}

	function spiritImage(s: HexSpiritAsset): string | null {
		const path = (s as HexSpiritAsset).game_print_image_path ?? (s as HexSpiritAsset).art_raw_image_path ?? null;
		return url(path);
	}

	function bpColorClass(color?: string): string {
		return `bp-${color ?? 'bronze'}`;
	}

	function bpDescription(bp: ClassBreakpoint): string {
		const parts: string[] = [];
		const effects = (bp.effects ?? []) as EffectEntry[];
		for (const e of effects) {
			const d = (e?.description ?? '').trim();
			if (d) parts.push(d);
		}
		if (parts.length > 0) return parts.join(' ');
		return (bp.description ?? '').trim();
	}

	function classBreakpoints(t: Trait): ClassBreakpoint[] {
		if (t.kind !== 'class') return [];
		const list = (t.effect_schema ?? []) as ClassBreakpoint[];
		return list.slice().sort((a, b) => {
			const an = typeof a.count === 'number' ? a.count : Number(a.count) || 99;
			const bn = typeof b.count === 'number' ? b.count : Number(b.count) || 99;
			return an - bn;
		});
	}

	function originBreakpoints(t: Trait): { count: number; label?: string; iconCount: number }[] {
		if (t.kind !== 'origin') return [];
		const cc = t.calling_card;
		if (!cc?.enabled || !cc.breakpoints?.length) return [];
		return cc.breakpoints
			.slice()
			.sort((a, b) => a.count - b.count)
			.map((b) => ({ count: b.count, label: b.label, iconCount: (b.icon_ids ?? []).length }));
	}

	const classCount = $derived(() => Array.from(assetState.classTraits.values()).length);
	const originCount = $derived(() => Array.from(assetState.originTraits.values()).length);

	onMount(() => { void loadAssets(); });
</script>

<svelte:head>
	<title>Classes & Origins | Arc Spirits Spectate</title>
</svelte:head>

<div class="page">
	<div class="section-marker">
		<div class="sm-num">14</div>
		<div class="sm-label">Codex of Traits</div>
	</div>

	<h1 class="page-title">Classes &amp;<br />Origins</h1>
	<p class="subhead-meta">
		Every trait spirits can carry — their breakpoints, effects, and the spirits that bear them.
		Pulled live from the Arc Spirits database.
	</p>

	<div class="controls">
		<div class="tabs-underline">
			<button class="tab-btn" class:active={typeFilter === 'all'} onclick={() => (typeFilter = 'all')}>All <span class="tab-num">{classCount() + originCount()}</span></button>
			<button class="tab-btn" class:active={typeFilter === 'class'} onclick={() => (typeFilter = 'class')}>Classes <span class="tab-num">{classCount()}</span></button>
			<button class="tab-btn" class:active={typeFilter === 'origin'} onclick={() => (typeFilter = 'origin')}>Origins <span class="tab-num">{originCount()}</span></button>
		</div>
		<div class="search-bare">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg>
			<input class="input-bare" bind:value={search} placeholder="Filter traits…" />
		</div>
	</div>

	{#if assetState.isLoading && filteredTraits().length === 0}
		<div class="msg"><div class="spin-ring"></div><p>Unfurling the codex…</p></div>
	{:else if assetState.error}
		<div class="msg msg-error"><h3>Failed to load traits</h3><p>{assetState.error}</p></div>
	{:else if filteredTraits().length === 0}
		<div class="msg"><h3>No traits match this filter</h3></div>
	{:else}
		<div class="trait-grid">
			{#each filteredTraits() as trait (trait.kind + ':' + trait.id)}
				{@const spirits = spiritsFor(trait)}
				{@const iconUrl = url(trait.icon_png)}
				{@const accent = trait.color ?? 'var(--brand-magenta)'}
				<article class="card" style:--accent={accent}>
					<!-- single accent embellishment: left border colored by trait -->
					<header class="card-head">
						<div class="hex-icon" aria-hidden="true">
							{#if iconUrl}
								<img src={iconUrl} alt="" loading="lazy" />
							{:else}
								<div class="hex-icon-empty">{trait.name.slice(0, 1)}</div>
							{/if}
						</div>
						<div class="card-title">
							<div class="card-name">{trait.name}</div>
							<div class="card-kind">{trait.kind}</div>
						</div>
						<div class="card-count" title={`${spirits.length} spirit${spirits.length === 1 ? '' : 's'}`}>{spirits.length}</div>
					</header>

					<hr class="card-rule" />

					{#if trait.description}
						<p class="card-desc">{trait.description}</p>
					{/if}

					{#if trait.kind === 'class'}
						{@const bps = classBreakpoints(trait)}
						{#if bps.length > 0}
							<div class="bp-list">
								{#each bps as bp, i (i + ':' + String(bp.count) + ':' + (bp.color ?? ''))}
									<div class="bp-row">
										<span class="bp-count {bpColorClass(bp.color)}">{bp.count}</span>
										{#if bpDescription(bp)}
											<div class="bp-desc">{bpDescription(bp)}</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						{#if trait.footer}
							<p class="card-footer">{trait.footer}</p>
						{/if}
					{:else}
						{@const obps = originBreakpoints(trait)}
						{#if obps.length > 0}
							<div class="bp-list">
								{#each obps as bp, i (i + ':' + bp.count)}
									<div class="bp-row">
										<span class="bp-count bp-prismatic">{bp.count}</span>
										<div class="bp-desc">
											{bp.label ?? 'Calling Card'}
											{#if bp.iconCount > 0}<span class="bp-meta"> · {bp.iconCount} icon{bp.iconCount === 1 ? '' : 's'}</span>{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/if}

					{#if spirits.length > 0}
						<hr class="card-rule" />
						<div class="card-spirits">
							{#each spirits as s (s.id)}
								{@const img = spiritImage(s)}
								<div class="spirit-cell" title={s.name}>
									<div class="spirit-portrait">
										{#if img}
											<img src={img} alt={s.name} loading="lazy" />
										{:else}
											<div class="spirit-empty">{s.name.slice(0, 2)}</div>
										{/if}
									</div>
									<div class="spirit-name">{s.name}</div>
								</div>
							{/each}
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page { max-width: 1400px; margin: 0 auto; padding: 56px 32px 80px; position: relative; z-index: 1; }

	.page-title {
		font-family: var(--font-display);
		font-size: clamp(3.5rem, 8vw, 6.5rem);
		font-weight: 400;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 0.88;
		color: var(--brand-magenta);
		margin: 20px 0 16px;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 28px;
	}
	.tab-num { margin-left: 4px; font-family: var(--font-mono); font-weight: 500; font-size: 0.62rem; color: var(--color-whisper); letter-spacing: 0; }
	.search-bare { position: relative; display: flex; align-items: center; min-width: 280px; }
	.search-bare svg { position: absolute; left: 0; width: 16px; height: 16px; color: var(--color-fog); pointer-events: none; }
	.search-bare .input-bare { padding-left: 28px; min-width: 240px; }

	/* CARDS */
	.trait-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 2px;
	}

	.card {
		display: flex;
		flex-direction: column;
		padding: 22px 24px 24px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		position: relative;
		transition: border-color 200ms ease, transform 200ms ease;
	}
	/* accent embellishment: solid left bar tinted by trait color */
	.card::before {
		content: '';
		position: absolute;
		left: 0; top: 0; bottom: 0;
		width: 4px;
		background: var(--accent, var(--brand-magenta));
	}
	.card:hover {
		border-color: var(--accent, var(--brand-magenta));
		transform: translateY(-2px);
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 14px;
	}
	.hex-icon {
		width: 52px; height: 52px;
		flex: none;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		background: var(--color-shadow);
		border: 1px solid var(--accent, var(--brand-magenta));
		display: grid;
		place-items: center;
		position: relative;
	}
	.hex-icon img {
		width: 70%; height: 70%;
		object-fit: contain;
		filter: drop-shadow(0 0 6px var(--accent, var(--brand-magenta)));
	}
	.hex-icon-empty {
		font-family: var(--font-display);
		font-size: 1.6rem;
		color: var(--accent, var(--brand-magenta));
	}
	.card-title { flex: 1; min-width: 0; }
	.card-name {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		line-height: 1;
	}
	.card-kind {
		margin-top: 4px;
		font-family: var(--font-display);
		font-size: 0.58rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.card-count {
		display: grid;
		place-items: center;
		min-width: 40px;
		height: 40px;
		padding: 0 8px;
		background: rgba(255, 186, 61, 0.12);
		border: 1px solid rgba(255, 186, 61, 0.45);
		color: var(--brand-amber-soft);
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-variant-numeric: tabular-nums;
	}

	.card-rule { height: 1px; background: var(--color-mist); border: 0; margin: 4px 0 14px; }

	.card-desc { font-size: 0.92rem; line-height: 1.55; color: var(--color-parchment); margin: 0 0 16px; }

	.bp-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
	.bp-row { display: grid; grid-template-columns: 36px 1fr; gap: 14px; align-items: flex-start; }
	.bp-count {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		font-family: var(--font-display);
		font-size: 0.95rem;
		color: var(--color-void);
		font-variant-numeric: tabular-nums;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		flex: none;
	}
	.bp-bronze { background: linear-gradient(135deg, #c08560, #8b5a3c); color: #fff; }
	.bp-silver { background: linear-gradient(135deg, #e6e6f0, #9090a0); color: #1a0f2e; }
	.bp-gold { background: linear-gradient(135deg, #ffd56a, #c89028); color: #1a0f2e; }
	.bp-prismatic { background: linear-gradient(135deg, var(--brand-magenta), var(--brand-violet), var(--brand-cyan)); color: #fff; }
	.bp-desc { font-size: 0.86rem; line-height: 1.5; color: var(--color-bone); padding-top: 5px; }
	.bp-meta { color: var(--color-fog); }

	.card-footer { font-style: italic; font-size: 0.8rem; color: var(--color-fog); margin: 0 0 14px; }

	.card-spirits {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
		gap: 8px;
		padding-top: 8px;
	}
	.spirit-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.spirit-portrait {
		width: 50px; height: 50px;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		background: var(--accent, var(--brand-magenta));
		padding: 1.5px;
	}
	.spirit-portrait img {
		width: 100%; height: 100%;
		object-fit: cover;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		display: block;
	}
	.spirit-empty {
		width: 100%; height: 100%;
		display: grid; place-items: center;
		background: var(--color-void);
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		font-family: var(--font-display);
		font-size: 0.65rem;
		color: var(--color-parchment);
	}
	.spirit-name {
		font-size: 0.62rem;
		color: var(--color-parchment);
		text-align: center;
		max-width: 60px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		letter-spacing: 0.02em;
	}

	.msg { padding: 80px 24px; text-align: center; color: var(--color-fog); display: flex; flex-direction: column; align-items: center; gap: 12px; }
	.msg h3 { font-family: var(--font-display); font-size: 1.5rem; color: var(--color-bone); margin: 0; }
	.msg p { max-width: 50ch; margin: 0; }
	.msg-error h3 { color: var(--color-blood); }
	.spin-ring { width: 32px; height: 32px; border: 2px solid var(--color-mist); border-top-color: var(--brand-magenta); border-radius: 50%; animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 560px) {
		.page { padding: 36px 18px 60px; }
		.trait-grid { grid-template-columns: 1fr; gap: 1px; }
		.controls { flex-direction: column; align-items: stretch; }
	}
</style>
