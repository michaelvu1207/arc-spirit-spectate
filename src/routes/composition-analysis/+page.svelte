<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Title,
		Tooltip,
		Legend,
		Filler,
		type ChartConfiguration
	} from 'chart.js';
	import { BoxPlotController, BoxAndWiskers } from '@sgratzl/chartjs-chart-boxplot';
	import type { TagSeries, TagTarget } from './+page.server';
	import { PLAYER_COLOR_HEX } from '$lib/types';
	import {
		isActualVisible as computeActualVisible,
		isCategoryActualVisible as computeCategoryActualVisible,
		isCategoryIdealVisible as computeCategoryIdealVisible,
		isIdealVisible as computeIdealVisible,
		isTagIdealRendered as computeTagIdealRendered,
		type VisibilityContext
	} from '$lib/visibility';
	import { computeBalanceGrade } from '$lib/compositions/balanceGrade';

	interface Props {
		data: {
			tagSeries: TagSeries[];
			referencePoints: number[];
			targets: TagTarget[];
			pointsPerLine: number;
			gameDisplayNames?: Record<string, string>;
		};
	}
	let { data }: Props = $props();

	Chart.register(
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Title,
		Tooltip,
		Legend,
		Filler,
		BoxPlotController,
		BoxAndWiskers
	);

	const POINTS = data.pointsPerLine; // one y-value per round 1..POINTS
	const REFERENCE_TAG = '__reference__';
	const REFERENCE_COLOR = '#24d4ff';
	const TAG_PALETTE = [
		'#ff2bc7', // magenta
		'#ffba3d', // amber
		'#20e0c1', // teal
		'#ff704d', // coral
		'#9d4dff', // violet-soft
		'#ff5dd1', // magenta-soft
		'#6be3ff', // cyan-soft
		'#ffd56a' // amber-soft
	];

	// ----- Initial state — union of tagSeries (data) + targets (ideals) ------
	// A composition tag may exist in either set independently:
	//  - in tagSeries only: someone tagged a game but no ideal saved yet
	//  - in targets only: tag was defined here for design, no games tagged yet
	//  - in both: normal case
	const initialTagNames = (() => {
		const set = new Set<string>();
		for (const s of data.tagSeries) set.add(s.tag);
		for (const t of data.targets) set.add(t.tag);
		return Array.from(set).sort();
	})();

	const tagSampleByName: Record<string, number> = Object.fromEntries(
		data.tagSeries.map((s) => [s.tag, s.sampleSize])
	);
	const tagActualByName: Record<string, Array<{ round: number; avgVp: number }>> = Object.fromEntries(
		data.tagSeries.map((s) => [s.tag, s.points])
	);
	// Per-game instances of each tag — drives the detail-view games dropdown
	// and lets the chart swap an aggregate line for a single-game line.
	const tagInstancesByName: Record<
		string,
		Array<{ gameId: string; playerColor: string; endedAt: string | null; totalRounds: number; points: Array<{ round: number; vp: number }> }>
	> = Object.fromEntries(data.tagSeries.map((s) => [s.tag, s.instances]));

	// ----- Game inclusion filter (left popout sidebar) -----------------------
	// Empty set = "all games included". Non-empty = whitelist; tag actual lines
	// recompute their per-round average from only the selected games.
	const GAME_FILTER_KEY = 'compositionAnalysis.selectedGameIds.v1';
	const GAME_SIDEBAR_KEY = 'compositionAnalysis.gameSidebarOpen.v1';
	const gameDisplayNames: Record<string, string> = data.gameDisplayNames ?? {};

	function loadInitialSelectedGameIds(): Set<string> {
		if (typeof window === 'undefined') return new Set();
		try {
			const raw = window.localStorage.getItem(GAME_FILTER_KEY);
			if (!raw) return new Set();
			const arr = JSON.parse(raw);
			return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === 'string')) : new Set();
		} catch {
			return new Set();
		}
	}
	function loadInitialGameSidebarOpen(): boolean {
		if (typeof window === 'undefined') return true;
		const v = window.localStorage.getItem(GAME_SIDEBAR_KEY);
		return v === null ? true : v === '1';
	}

	let selectedGameIds = $state<Set<string>>(loadInitialSelectedGameIds());
	let gameSidebarOpen = $state<boolean>(loadInitialGameSidebarOpen());
	let gameFilterQuery = $state('');

	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(GAME_FILTER_KEY, JSON.stringify(Array.from(selectedGameIds)));
		} catch {
			// quota / private mode — ignore
		}
	});
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(GAME_SIDEBAR_KEY, gameSidebarOpen ? '1' : '0');
		} catch {
			// ignore
		}
	});

	// Unique games across every tag instance, with their best (latest) endedAt
	// timestamp + how many tags reference them. Sorted recency-desc so the
	// most-recent games surface at the top of the picker.
	type GameRow = { gameId: string; label: string; endedAt: string | null; tagCount: number };
	const allGames = $derived((): GameRow[] => {
		const byId = new Map<string, { endedAt: string | null; tags: Set<string> }>();
		for (const series of data.tagSeries) {
			for (const inst of series.instances) {
				const e = byId.get(inst.gameId);
				if (e) {
					e.tags.add(series.tag);
					if (inst.endedAt && (!e.endedAt || inst.endedAt > e.endedAt)) e.endedAt = inst.endedAt;
				} else {
					byId.set(inst.gameId, { endedAt: inst.endedAt, tags: new Set([series.tag]) });
				}
			}
		}
		const rows: GameRow[] = Array.from(byId.entries()).map(([gameId, v]) => ({
			gameId,
			label: gameDisplayNames[gameId] ?? gameId,
			endedAt: v.endedAt,
			tagCount: v.tags.size
		}));
		rows.sort((a, b) => {
			const ae = a.endedAt ? Date.parse(a.endedAt) : 0;
			const be = b.endedAt ? Date.parse(b.endedAt) : 0;
			return be - ae;
		});
		return rows;
	});

	const filteredGameRows = $derived(() => {
		const q = gameFilterQuery.trim().toLowerCase();
		if (!q) return allGames();
		return allGames().filter(
			(g) => g.label.toLowerCase().includes(q) || g.gameId.toLowerCase().includes(q)
		);
	});

	// `true` when the current row passes the game-inclusion filter (no filter
	// = include everything).
	function gameRowIncluded(gameId: string): boolean {
		return selectedGameIds.size === 0 || selectedGameIds.has(gameId);
	}

	function toggleGame(gameId: string) {
		const next = new Set(selectedGameIds);
		if (next.has(gameId)) next.delete(gameId);
		else next.add(gameId);
		selectedGameIds = next;
	}
	function selectAllGames() {
		selectedGameIds = new Set();
	}
	function selectNoGames() {
		// Pick a sentinel by adding a non-existent id — but simpler: empty
		// set means "all", so to truly hide everything use a fresh set with
		// a known-empty filter. We instead just clear selection (= all) and
		// rely on per-tag visibility. So `selectNoGames` toggles to empty
		// (all) — UI shows "Select all" only when explicit subset.
		selectedGameIds = new Set();
	}

	// Per-tag, recomputed actual VP-per-round series filtered through
	// `selectedGameIds`. Falls back to the precomputed `tagActualByName`
	// when no filter is active and normalization is off (cheaper).
	const effectiveTagActual = $derived(() => {
		const out: Record<string, Array<{ round: number; avgVp: number }>> = {};
		for (const tag of Object.keys(tagInstancesByName)) {
			if (selectedGameIds.size === 0 && !normalizeRounds) {
				out[tag] = tagActualByName[tag] ?? [];
				continue;
			}
			const insts = (tagInstancesByName[tag] ?? []).filter((i) =>
				selectedGameIds.size === 0 || selectedGameIds.has(i.gameId)
			);
			if (insts.length === 0) {
				out[tag] = [];
				continue;
			}
			const byRound = new Map<number, { sum: number; n: number }>();
			for (const inst of insts) {
				const pts = normalizeRounds
					? resamplePointsToTarget(inst.points, POINTS)
					: inst.points;
				for (const p of pts) {
					const e = byRound.get(p.round) ?? { sum: 0, n: 0 };
					e.sum += p.vp;
					e.n += 1;
					byRound.set(p.round, e);
				}
			}
			out[tag] = Array.from(byRound.entries())
				.sort(([a], [b]) => a - b)
				.map(([round, e]) => ({ round, avgVp: e.sum / Math.max(1, e.n) }));
		}
		return out;
	});

	const effectiveTagSample = $derived(() => {
		const out: Record<string, number> = {};
		for (const tag of Object.keys(tagInstancesByName)) {
			if (selectedGameIds.size === 0) {
				out[tag] = tagSampleByName[tag] ?? 0;
			} else {
				out[tag] = (tagInstancesByName[tag] ?? []).filter((i) =>
					selectedGameIds.has(i.gameId)
				).length;
			}
		}
		return out;
	});

	let tagNames = $state<string[]>(initialTagNames);
	let referencePoints = $state<number[]>([...data.referencePoints]);
	// `tagPointsMap` always carries some array per tag (so dragging logic
	// stays simple), but the chart only renders the ideal line when the tag
	// is in `tagsWithIdeal`. New tags start with NO ideal — the user has to
	// explicitly Create one from the kebab menu.
	let tagPointsMap = $state<Record<string, number[]>>(
		Object.fromEntries(
			initialTagNames.map((tag) => {
				const saved = data.targets.find((t) => t.tag === tag)?.ideal_points;
				return [tag, saved ? [...saved] : [...data.referencePoints]];
			})
		)
	);
	let tagsWithIdeal = $state<Set<string>>(
		new Set(
			data.targets.filter((t) => Array.isArray(t.ideal_points)).map((t) => t.tag)
		)
	);

	function tagHasIdeal(tag: string): boolean {
		return tagsWithIdeal.has(tag);
	}

	// Add an ideal curve to a tag that has none. Seeds the curve with the
	// reference baseline so the user has something visible to start dragging.
	async function createIdealFor(tag: string) {
		if (tag === REFERENCE_TAG) return;
		if (tagsWithIdeal.has(tag)) return;
		const seed = (tagPointsMap[tag] ?? referencePoints).slice();
		tagPointsMap = { ...tagPointsMap, [tag]: seed };
		const next = new Set(tagsWithIdeal);
		next.add(tag);
		tagsWithIdeal = next;
		// Persist so reloads remember the user wants an ideal here.
		try {
			saveStatus = { ...saveStatus, [tag]: 'saving' };
			const res = await fetch('/api/composition-targets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag, ideal_points: seed })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			saveStatus = { ...saveStatus, [tag]: 'saved' };
		} catch {
			saveStatus = { ...saveStatus, [tag]: 'error' };
		}
	}

	// Drop the ideal curve for a tag. Cancels any pending autosave so the
	// stale points don't get re-uploaded after the clear.
	async function deleteIdealFor(tag: string) {
		if (tag === REFERENCE_TAG) return;
		if (!tagsWithIdeal.has(tag)) return;
		const pending = saveTimers.get(tag);
		if (pending) {
			clearTimeout(pending);
			saveTimers.delete(tag);
		}
		const next = new Set(tagsWithIdeal);
		next.delete(tag);
		tagsWithIdeal = next;
		// If this tag was the one being edited, drop the active selection so
		// the editing cursor doesn't dangle on a missing curve.
		if (activeLine === tag) activeLine = REFERENCE_TAG;
		openMenu = null;
		try {
			saveStatus = { ...saveStatus, [tag]: 'saving' };
			const res = await fetch('/api/composition-targets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag, ideal_points: null })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			saveStatus = { ...saveStatus, [tag]: 'saved' };
		} catch {
			saveStatus = { ...saveStatus, [tag]: 'error' };
			// Roll back local state if the server rejected the clear.
			const restored = new Set(tagsWithIdeal);
			restored.add(tag);
			tagsWithIdeal = restored;
		}
	}

	// Color is stable per tag based on creation order across the session.
	let tagColorByName = $state<Record<string, string>>(
		Object.fromEntries(
			initialTagNames.map((tag, i) => [tag, TAG_PALETTE[i % TAG_PALETTE.length]])
		)
	);

	function colorForTag(tag: string): string {
		return tagColorByName[tag] ?? TAG_PALETTE[tagNames.indexOf(tag) % TAG_PALETTE.length] ?? TAG_PALETTE[0];
	}

	// ----- Category assignments (per tag) ------------------------------------
	let tagCategoryByName = $state<Record<string, string | null>>(
		Object.fromEntries(
			initialTagNames.map((tag) => [
				tag,
				data.targets.find((t) => t.tag === tag)?.category ?? null
			])
		)
	);
	// Palette for category-average lines. Distinct tone family from TAG_PALETTE
	// so the category lines visually separate from individual-tag lines.
	const CATEGORY_PALETTE = [
		'#a78bfa', // soft violet
		'#fbbf24', // warm yellow
		'#34d399', // mint
		'#fb7185', // rose
		'#60a5fa', // sky
		'#fcd34d', // pale gold
		'#a3e635', // lime
		'#f472b6' // pink
	];

	function colorForCategory(cat: string): string {
		// Stable hash based on first occurrence in sorted distinct list.
		const ordered = Array.from(
			new Set(Object.values(tagCategoryByName).filter((c): c is string => Boolean(c)))
		).sort();
		const idx = ordered.indexOf(cat);
		return CATEGORY_PALETTE[(idx >= 0 ? idx : 0) % CATEGORY_PALETTE.length];
	}

	// Tags grouped by category, with `null` (uncategorized) last.
	const tagsByCategory = $derived(() => {
		const groups = new Map<string | null, string[]>();
		for (const tag of tagNames) {
			const cat = tagCategoryByName[tag] ?? null;
			const list = groups.get(cat) ?? [];
			list.push(tag);
			groups.set(cat, list);
		}
		// Stable order: named categories alphabetical, uncategorized last.
		const namedCats = Array.from(groups.keys())
			.filter((c): c is string => typeof c === 'string')
			.sort();
		const ordered: Array<{ category: string | null; tags: string[] }> = namedCats.map((c) => ({
			category: c,
			tags: (groups.get(c) ?? []).slice().sort()
		}));
		const uncategorized = groups.get(null);
		if (uncategorized && uncategorized.length > 0) {
			ordered.push({ category: null, tags: uncategorized.slice().sort() });
		}
		return ordered;
	});

	// Distinct categories with ≥2 member tags get computed average lines on the
	// chart. Single-member categories are skipped (the average would just be the
	// tag itself, which is already drawn).
	const categoriesWithAverages = $derived(() => {
		return tagsByCategory()
			.filter((g) => g.category != null && g.tags.length >= 2)
			.map((g) => g.category as string);
	});

	// Distinct named categories, alphabetised. Used by the filter dropdown.
	const categoryList = $derived(() => {
		const names = new Set<string>();
		for (const c of Object.values(tagCategoryByName)) {
			if (typeof c === 'string' && c.length > 0) names.add(c);
		}
		return Array.from(names).sort();
	});

	// Same shape as tagsByCategory but obeys the categoryFilter. The
	// game-include filter does NOT touch this list — every tag stays visible
	// in the right sidebar so its toggles / rename / delete actions stay
	// reachable. The game filter only affects which lines render on the
	// chart for each tag.
	const filteredTagsByCategory = $derived(() => {
		const groups = tagsByCategory();
		if (categoryFilter == null) return groups;
		return groups.filter((g) => g.category === categoryFilter);
	});

	// Save category change for a single tag (debounced via the standard save
	// pipeline, since saveStatus is shared with point-edits).
	async function saveCategoryFor(tag: string, category: string | null) {
		if (tag === REFERENCE_TAG) return;
		tagCategoryByName = { ...tagCategoryByName, [tag]: category };
		saveStatus = { ...saveStatus, [tag]: 'saving' };
		try {
			const res = await fetch('/api/composition-targets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag, category })
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
			}
			saveStatus = { ...saveStatus, [tag]: 'saved' };
			lastSaveError = { ...lastSaveError, [tag]: null };
		} catch (e) {
			saveStatus = { ...saveStatus, [tag]: 'error' };
			lastSaveError = {
				...lastSaveError,
				[tag]: e instanceof Error ? e.message : String(e)
			};
		}
	}

	let activeLine = $state<string>(REFERENCE_TAG);
	// When a tag is focused, the chart hides every other tag's actual + ideal
	// lines (reference still always renders). Toggling the same tag again, or
	// clicking REFERENCE, returns to "show everything" mode.
	let focusedTag = $state<string | null>(null);
	let hideActuals = $state<boolean>(false);
	let hideIdeals = $state<boolean>(false);
	// Per-tag visibility toggles — tri-state via booleans:
	//   undefined = follow defaults (game filter applies)
	//   true      = explicit hide
	//   false     = explicit show (overrides game filter)
	// Lets the user mute one tag, or force a tag visible even when the active
	// game filter would normally hide it.
	let hiddenIdealsByTag = $state<Record<string, boolean>>({});
	let hiddenActualsByTag = $state<Record<string, boolean>>({});
	// Same idea but for category-average lines.
	let hiddenIdealsByCategory = $state<Record<string, boolean>>({});
	let hiddenActualsByCategory = $state<Record<string, boolean>>({});

	// Helpers — single source of truth for "is this tag's ideal/actual line
	// currently rendered on the chart?" Used both by the chart builder and
	// the right-sidebar toggle visuals.
	//
	// Defaults change once a game subset is active so opening a game
	// surfaces only its historical lines (per individual tag) and the
	// ideal target curve (per composition category):
	//
	//   no game filter      → individual tags: ideal SHOW, actual SHOW;
	//                         categories: ideal SHOW, actual SHOW
	//   game filter active  → individual tags with matching data:
	//                                       ideal HIDE, actual SHOW
	//                         individual tags without matching data:
	//                                       ideal HIDE, actual HIDE
	//                         categories:    ideal SHOW, actual HIDE
	//
	// All defaults are overridable via the per-row I/A buttons (tri-state).
	function isTagFilteredOut(tag: string): boolean {
		if (selectedGameIds.size === 0) return false;
		const insts = tagInstancesByName[tag] ?? [];
		return !insts.some((i) => selectedGameIds.has(i.gameId));
	}
	function visibilityContext(): VisibilityContext {
		return {
			tagsWithIdeal,
			gameFilterActive: selectedGameIds.size > 0,
			hiddenIdealsByTag,
			hiddenActualsByTag,
			hiddenIdealsByCategory,
			hiddenActualsByCategory,
			tagInGameFilter: (tag) => !isTagFilteredOut(tag)
		};
	}
	function isLineBeingEdited(tag: string): boolean {
		return sidebarView === 'detail' && detailTag === tag && activeLine === tag;
	}
	function isIdealVisible(tag: string): boolean {
		return computeIdealVisible(visibilityContext(), tag);
	}
	function isIdealRendered(tag: string): boolean {
		return computeTagIdealRendered(visibilityContext(), tag, {
			globalHideIdeals: hideIdeals,
			isEditing: isLineBeingEdited(tag)
		});
	}
	function isActualVisible(tag: string): boolean {
		return computeActualVisible(visibilityContext(), tag);
	}
	function isCategoryIdealVisible(cat: string): boolean {
		return computeCategoryIdealVisible(visibilityContext(), cat);
	}
	function isCategoryActualVisible(cat: string): boolean {
		return computeCategoryActualVisible(visibilityContext(), cat);
	}

	function toggleIdealHidden(tag: string) {
		// Flip rendered visibility by writing an explicit row override.
		// Include the legacy global flag so a row click can recover from
		// "hide all" style states instead of fighting them.
		const visible = isIdealRendered(tag);
		if (!visible) hideIdeals = false;
		hiddenIdealsByTag = {
			...hiddenIdealsByTag,
			[tag]: visible // true = hide, false = force-show
		};
	}
	function toggleActualHidden(tag: string) {
		const visible = !hideActuals && isActualVisible(tag);
		if (!visible) hideActuals = false;
		hiddenActualsByTag = {
			...hiddenActualsByTag,
			[tag]: visible
		};
	}
	function toggleCategoryIdealHidden(cat: string) {
		const visible = !hideIdeals && isCategoryIdealVisible(cat);
		if (!visible) hideIdeals = false;
		hiddenIdealsByCategory = {
			...hiddenIdealsByCategory,
			[cat]: visible // true = hide, false = force-show
		};
	}
	function toggleCategoryActualHidden(cat: string) {
		const visible = !hideActuals && isCategoryActualVisible(cat);
		if (!visible) hideActuals = false;
		hiddenActualsByCategory = {
			...hiddenActualsByCategory,
			[cat]: visible
		};
	}

	function hideAllLines() {
		activeLine = REFERENCE_TAG;
		focusedTag = null;
		hideActuals = false;
		hideIdeals = false;
		hiddenActualsByTag = Object.fromEntries(tagNames.map((tag) => [tag, true]));
		hiddenIdealsByTag = Object.fromEntries(tagNames.map((tag) => [tag, true]));
		hiddenActualsByCategory = Object.fromEntries(categoryList().map((cat) => [cat, true]));
		hiddenIdealsByCategory = Object.fromEntries(categoryList().map((cat) => [cat, true]));
	}

	function showAllLines() {
		focusedTag = null;
		hideActuals = false;
		hideIdeals = false;
		hiddenActualsByTag = Object.fromEntries(tagNames.map((tag) => [tag, false]));
		hiddenIdealsByTag = Object.fromEntries(tagNames.map((tag) => [tag, false]));
		hiddenActualsByCategory = Object.fromEntries(categoryList().map((cat) => [cat, false]));
		hiddenIdealsByCategory = Object.fromEntries(categoryList().map((cat) => [cat, false]));
	}
	let saveStatus = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	let lastSaveError = $state<Record<string, string | null>>({});
	const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// ----- Sidebar menu + inline edit state ----------------------------------
	// At most one popover menu is open at a time. `null` = none, 'section' = the
	// LINES-section menu (add tag), 'tag:<name>' = a per-tag kebab menu.
	let openMenu = $state<string | null>(null);
	// Inline editor that's currently revealed. Replaces always-visible inputs
	// so the sidebar reads cleaner by default.
	type EditMode =
		| { kind: 'add' }
		| { kind: 'rename'; tag: string }
		| { kind: 'category'; tag: string }
		| null;
	let editMode = $state<EditMode>(null);

	// Sidebar drill-down: 'lines' = the list of every tag, 'detail' = focused
	// view of one tag with its per-game instances.
	let sidebarView = $state<'lines' | 'detail'>('lines');
	let detailTag = $state<string | null>(null);
	let selectedInstance = $state<{ gameId: string; playerColor: string } | null>(null);
	// When set, the line list filters to just tags whose category matches.
	// `null` = "All" (no filter).
	let categoryFilter = $state<string | null>(null);

	const balanceGrade = $derived(() => {
		const scopedTags =
			categoryFilter == null
				? tagNames
				: tagNames.filter((tag) => tagCategoryByName[tag] === categoryFilter);
		return computeBalanceGrade({
			tags: scopedTags,
			categoryByTag: tagCategoryByName,
			idealPointsByTag: tagPointsMap,
			actualByTag: effectiveTagActual()
		});
	});

	const balanceScopeLabel = $derived(() => {
		const gameLabel =
			selectedGameIds.size === 0
				? 'all games'
				: `${selectedGameIds.size} selected game${selectedGameIds.size === 1 ? '' : 's'}`;
		return categoryFilter ? `${categoryFilter} · ${gameLabel}` : gameLabel;
	});

	// Global line smoothing — Gaussian-kernel smoother that interprets the
	// slider as a sigma in *rounds*. 0 = no smoothing (lines pass through
	// every point exactly), larger values blur points across their
	// neighbours, producing a curve that does NOT have to hit each point.
	// Persisted to localStorage so the user's choice survives reloads.
	const SMOOTHING_KEY = 'compositionAnalysis.lineSmoothing.v2';
	const SMOOTHING_MAX = 5;
	function loadInitialSmoothing(): number {
		if (typeof window === 'undefined') return 0;
		const raw = window.localStorage.getItem(SMOOTHING_KEY);
		if (!raw) return 0;
		const n = Number.parseFloat(raw);
		return Number.isFinite(n) ? Math.min(SMOOTHING_MAX, Math.max(0, n)) : 0;
	}
	let lineSmoothing = $state<number>(loadInitialSmoothing());
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(SMOOTHING_KEY, String(lineSmoothing));
		} catch {
			// ignore quota / private mode errors
		}
	});

	// Top-level view toggle — 'chart' = the curves canvas, 'scoreboard' = the
	// aggregate per-comp table, 'boxplot' = per-comp distribution of VP/round.
	// Persisted so the user lands where they left.
	type ViewMode = 'chart' | 'scoreboard' | 'boxplot';
	const VIEW_MODE_KEY = 'compositionAnalysis.viewMode.v1';
	function loadInitialViewMode(): ViewMode {
		if (typeof window === 'undefined') return 'chart';
		const raw = window.localStorage.getItem(VIEW_MODE_KEY);
		if (raw === 'scoreboard' || raw === 'boxplot') return raw;
		return 'chart';
	}
	let viewMode = $state<ViewMode>(loadInitialViewMode());
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
		} catch {
			// ignore quota / private mode errors
		}
	});

	// Normalize actuals to "% of game" — each game's round range maps to the
	// 0–100% progress axis (rendered as positions 1..POINTS on the shared
	// canvas). Lets us compare curve shape across games of different length
	// and average them against the ideals on a common axis.
	const NORMALIZE_KEY = 'compositionAnalysis.normalizeRounds.v1';
	function loadInitialNormalize(): boolean {
		if (typeof window === 'undefined') return false;
		return window.localStorage.getItem(NORMALIZE_KEY) === '1';
	}
	let normalizeRounds = $state<boolean>(loadInitialNormalize());
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(NORMALIZE_KEY, normalizeRounds ? '1' : '0');
		} catch {
			// ignore quota / private mode errors
		}
	});

	// Resample a per-round VP series so its rounds span exactly 1..targetRounds,
	// preserving curve shape via linear interpolation between adjacent stored
	// points. Single-round inputs collapse to a flat line at that VP.
	function resamplePointsToTarget(
		points: Array<{ round: number; vp: number }>,
		targetRounds: number
	): Array<{ round: number; vp: number }> {
		if (points.length === 0 || targetRounds < 2) return points.map((p) => ({ ...p }));
		const sorted = [...points].sort((a, b) => a.round - b.round);
		const minR = sorted[0].round;
		const maxR = sorted[sorted.length - 1].round;
		if (maxR === minR) {
			return Array.from({ length: targetRounds }, (_, i) => ({
				round: i + 1,
				vp: sorted[0].vp
			}));
		}
		const out: Array<{ round: number; vp: number }> = new Array(targetRounds);
		let j = 0;
		for (let k = 1; k <= targetRounds; k++) {
			const source = ((k - 1) / (targetRounds - 1)) * (maxR - minR) + minR;
			while (j + 1 < sorted.length - 1 && sorted[j + 1].round < source) j++;
			const lo = sorted[j];
			const hi = sorted[j + 1] ?? lo;
			const span = hi.round - lo.round;
			const t = span > 0 ? Math.max(0, Math.min(1, (source - lo.round) / span)) : 0;
			out[k - 1] = { round: k, vp: lo.vp + t * (hi.vp - lo.vp) };
		}
		return out;
	}

	// Gaussian-kernel smoothing in x-space. For each input point i, the
	// returned y is a weighted mean of every input within ±3σ on x. Sigma
	// is in the same units as `x` (rounds) so the slider is intuitive: σ=1
	// blurs across one round, σ=3 across about three. With σ=0 the array
	// passes through unchanged. Cheap (O(N · radius)) — N is small.
	function smoothSeries(
		points: Array<{ x: number; y: number }>,
		sigma: number
	): Array<{ x: number; y: number }> {
		if (sigma <= 0 || points.length < 3) return points;
		const radiusX = sigma * 3;
		const twoSigmaSq = 2 * sigma * sigma;
		const out: Array<{ x: number; y: number }> = new Array(points.length);
		for (let i = 0; i < points.length; i++) {
			const xi = points[i].x;
			let sumW = 0;
			let sumWY = 0;
			for (let j = 0; j < points.length; j++) {
				const dx = points[j].x - xi;
				if (dx > radiusX || dx < -radiusX) continue;
				const w = Math.exp(-(dx * dx) / twoSigmaSq);
				sumW += w;
				sumWY += w * points[j].y;
			}
			out[i] = { x: xi, y: sumW > 0 ? sumWY / sumW : points[i].y };
		}
		return out;
	}

	// ---------- Scoreboard view: aggregate per-comp performance ----------
	// One row per composition tag. Built from the same instance data the chart
	// uses, but reports length-aware metrics (rounds-to-30, pacing windows,
	// VP/round, etc.) so different-length games stay comparable without
	// normalization. Every aggregate cell carries the spread (sample stddev,
	// Bessel-corrected) so a "12.0 ± 4.2" reading tells you how tightly the
	// instances cluster around that number — wide spread = noisy comp.
	const VP_THRESHOLD = 30;
	const PACE_WINDOWS = [
		{ key: 'early', label: 'Early (1–10)', start: 0, end: 10 },
		{ key: 'mid', label: 'Mid (10–20)', start: 10, end: 20 },
		{ key: 'late', label: 'Late (20+)', start: 20, end: Infinity }
	] as const;
	type ScoreboardRow = {
		tag: string;
		category: string | null;
		color: string;
		n: number;
		reachCount: number;
		reachRate: number;
		medFinalVp: number;
		sdFinalVp: number | null;
		meanVpPerRound: number;
		sdVpPerRound: number | null;
		meanEarly: number;
		sdEarly: number | null;
		meanMid: number;
		sdMid: number | null;
		meanLate: number;
		sdLate: number | null;
		endShare: number;
		sparkline: Array<{ round: number; vp: number }>;
	};

	function median(xs: number[]): number | null {
		if (xs.length === 0) return null;
		const sorted = [...xs].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	}

	// Sample standard deviation (Bessel-corrected, n−1). Returns null when n<2
	// so the UI can render "—" rather than a misleading 0.
	function stddev(xs: number[]): number | null {
		if (xs.length < 2) return null;
		const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
		const sq = xs.reduce((s, v) => s + (v - mean) ** 2, 0);
		return Math.sqrt(sq / (xs.length - 1));
	}

	function mean(xs: number[]): number {
		if (xs.length === 0) return 0;
		return xs.reduce((s, v) => s + v, 0) / xs.length;
	}

	// VP at the latest stored round ≤ target. Snapshots come in at round 1,2,…
	// so for integer targets this is usually an exact lookup; the bounded walk
	// also covers gaps without bringing interpolation noise into the windows.
	function vpAtOrBefore(points: ReadonlyArray<{ round: number; vp: number }>, target: number): number {
		if (points.length === 0 || target < points[0].round) return 0;
		let last = 0;
		for (const p of points) {
			if (p.round <= target) last = p.vp;
			else break;
		}
		return last;
	}

	// VP gained inside [start, end] — clamped to whatever the instance actually
	// reached. Games that ended before `start` contribute 0; games that ended
	// inside the window contribute only the partial gain. That keeps short
	// games honestly weighted instead of being excluded.
	function windowGain(
		points: ReadonlyArray<{ round: number; vp: number }>,
		totalRounds: number,
		start: number,
		end: number
	): number {
		if (totalRounds <= start) return 0;
		const effectiveEnd = Math.min(end, totalRounds);
		return Math.max(0, vpAtOrBefore(points, effectiveEnd) - vpAtOrBefore(points, start));
	}

	const scoreboardRows = $derived((): ScoreboardRow[] => {
		const eff = effectiveTagActual();
		const rows: ScoreboardRow[] = [];
		for (const tag of tagNames) {
			if (tag === REFERENCE_TAG) continue;
			const insts = (tagInstancesByName[tag] ?? []).filter(
				(i) => selectedGameIds.size === 0 || selectedGameIds.has(i.gameId)
			);
			if (insts.length === 0) continue;

			const finalVps: number[] = [];
			const vpPerRoundList: number[] = [];
			const earlyGains: number[] = [];
			const midGains: number[] = [];
			const lateGains: number[] = [];
			let reachCount = 0;
			let wins = 0;

			for (const inst of insts) {
				const pts = inst.points;
				if (pts.length === 0) continue;
				const finalVp = pts[pts.length - 1].vp;
				finalVps.push(finalVp);
				vpPerRoundList.push(finalVp / Math.max(1, inst.totalRounds));

				const r30 = pts.find((p) => p.vp >= VP_THRESHOLD);
				if (r30) {
					reachCount++;
					if (inst.totalRounds <= r30.round + 1) wins++;
				}

				earlyGains.push(windowGain(pts, inst.totalRounds, 0, 10));
				midGains.push(windowGain(pts, inst.totalRounds, 10, 20));
				lateGains.push(windowGain(pts, inst.totalRounds, 20, Infinity));
			}

			const n = insts.length;
			rows.push({
				tag,
				category: tagCategoryByName[tag] ?? null,
				color: colorForTag(tag),
				n,
				reachCount,
				reachRate: reachCount / n,
				medFinalVp: median(finalVps) ?? 0,
				sdFinalVp: stddev(finalVps),
				meanVpPerRound: mean(vpPerRoundList),
				sdVpPerRound: stddev(vpPerRoundList),
				meanEarly: mean(earlyGains),
				sdEarly: stddev(earlyGains),
				meanMid: mean(midGains),
				sdMid: stddev(midGains),
				meanLate: mean(lateGains),
				sdLate: stddev(lateGains),
				endShare: wins / n,
				sparkline: (eff[tag] ?? []).map((p) => ({ round: p.round, vp: p.avgVp }))
			});
		}
		return rows;
	});

	type ScoreSortKey =
		| 'tag'
		| 'n'
		| 'reachRate'
		| 'medFinalVp'
		| 'vpPerRound'
		| 'meanEarly'
		| 'meanMid'
		| 'meanLate'
		| 'endShare';
	let scoreSortKey = $state<ScoreSortKey>('reachRate');
	let scoreSortDir = $state<'asc' | 'desc'>('desc');

	function cycleScoreSort(key: ScoreSortKey) {
		if (scoreSortKey === key) {
			scoreSortDir = scoreSortDir === 'desc' ? 'asc' : 'desc';
		} else {
			scoreSortKey = key;
			// tag = alphabetical ascending; everything else "bigger is better" descending.
			scoreSortDir = key === 'tag' ? 'asc' : 'desc';
		}
	}

	const scoreboardRowsSorted = $derived((): ScoreboardRow[] => {
		const rows = [...scoreboardRows()];
		const mult = scoreSortDir === 'asc' ? 1 : -1;
		rows.sort((a, b) => {
			let av: number | string | null;
			let bv: number | string | null;
			switch (scoreSortKey) {
				case 'tag':
					av = a.tag;
					bv = b.tag;
					break;
				case 'n':
					av = a.n;
					bv = b.n;
					break;
				case 'reachRate':
					av = a.reachRate;
					bv = b.reachRate;
					break;
				case 'medFinalVp':
					av = a.medFinalVp;
					bv = b.medFinalVp;
					break;
				case 'vpPerRound':
					av = a.meanVpPerRound;
					bv = b.meanVpPerRound;
					break;
				case 'meanEarly':
					av = a.meanEarly;
					bv = b.meanEarly;
					break;
				case 'meanMid':
					av = a.meanMid;
					bv = b.meanMid;
					break;
				case 'meanLate':
					av = a.meanLate;
					bv = b.meanLate;
					break;
				case 'endShare':
					av = a.endShare;
					bv = b.endShare;
					break;
			}
			// Nulls always last regardless of direction.
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			if (typeof av === 'string' && typeof bv === 'string') {
				return mult * av.localeCompare(bv);
			}
			return mult * ((av as number) - (bv as number));
		});
		return rows;
	});

	const scoreboardTotals = $derived(() => {
		const rows = scoreboardRows();
		return {
			comps: rows.length,
			instances: rows.reduce((s, r) => s + r.n, 0)
		};
	});

	// Build a tiny SVG path for an inline sparkline. y is clamped to [0, yMax].
	function sparklinePath(
		points: Array<{ round: number; vp: number }>,
		w: number,
		h: number,
		yMax: number
	): string {
		if (points.length === 0) return '';
		let xMin = Infinity;
		let xMax = -Infinity;
		for (const p of points) {
			if (p.round < xMin) xMin = p.round;
			if (p.round > xMax) xMax = p.round;
		}
		const xSpan = xMax - xMin || 1;
		let out = '';
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			const x = ((p.round - xMin) / xSpan) * w;
			const y = h - (Math.max(0, Math.min(yMax, p.vp)) / yMax) * h;
			out += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
		}
		return out.trim();
	}

	function openTagInChart(tag: string) {
		viewMode = 'chart';
		enterDetail(tag);
	}

	// ---------- Box plot view: VP/round distribution per comp ----------
	// One entry per comp with its raw (final VP ÷ totalRounds) values. Chart.js
	// + @sgratzl/chartjs-chart-boxplot computes Q1/Q2/Q3/whiskers/outliers from
	// the raw arrays, so we just hand it the per-comp samples.
	type BoxplotEntry = {
		tag: string;
		color: string;
		n: number;
		values: number[];
	};

	const boxplotEntries = $derived((): BoxplotEntry[] => {
		const entries: BoxplotEntry[] = [];
		for (const tag of tagNames) {
			if (tag === REFERENCE_TAG) continue;
			const insts = (tagInstancesByName[tag] ?? []).filter(
				(i) => selectedGameIds.size === 0 || selectedGameIds.has(i.gameId)
			);
			if (insts.length === 0) continue;
			const values: number[] = [];
			for (const inst of insts) {
				const pts = inst.points;
				if (pts.length === 0) continue;
				const finalVp = pts[pts.length - 1].vp;
				values.push(finalVp / Math.max(1, inst.totalRounds));
			}
			if (values.length === 0) continue;
			values.sort((a, b) => a - b);
			entries.push({ tag, color: colorForTag(tag), n: values.length, values });
		}
		// Sort by median descending — Chart.js doesn't sort for us.
		entries.sort((a, b) => {
			const am = a.values[Math.floor(a.values.length / 2)];
			const bm = b.values[Math.floor(b.values.length / 2)];
			return bm - am;
		});
		return entries;
	});

	let categoriesMenuOpen = $state(false);
	let addPopoverOpen = $state(false);

	function enterDetail(tag: string) {
		if (tag === REFERENCE_TAG) return;
		detailTag = tag;
		sidebarView = 'detail';
		activeLine = tag;
		focusedTag = tag;
		selectedInstance = null;
		openMenu = null;
	}

	async function editIdealCurveFor(tag: string) {
		if (tag === REFERENCE_TAG) return;
		if (!tagsWithIdeal.has(tag)) {
			await createIdealFor(tag);
			if (!tagsWithIdeal.has(tag)) return;
		}
		enterDetail(tag);
	}

	function exitDetail() {
		sidebarView = 'lines';
		detailTag = null;
		selectedInstance = null;
		activeLine = REFERENCE_TAG;
		focusedTag = null;
	}

	function openTagMenu(tag: string) {
		const key = `tag:${tag}`;
		openMenu = openMenu === key ? null : key;
	}
	function openSectionMenu() {
		openMenu = openMenu === 'section' ? null : 'section';
	}
	function closeMenu() {
		openMenu = null;
	}
	function startEdit(mode: EditMode) {
		editMode = mode;
		openMenu = null;
	}
	function cancelEdit() {
		editMode = null;
	}
	function isEditing(kind: NonNullable<EditMode>['kind'], tag?: string): boolean {
		if (editMode == null || editMode.kind !== kind) return false;
		if (tag == null) return true;
		return 'tag' in editMode && editMode.tag === tag;
	}

	// Click anywhere outside an open menu/editor closes it.
	function handleDocumentClick(ev: MouseEvent) {
		const target = ev.target as HTMLElement | null;
		if (!target) return;
		if (target.closest('[data-menu-keep-open]')) return;
		if (openMenu != null) openMenu = null;
	}

	// ----- Rename a tag -------------------------------------------------------
	let renameDraft = $state('');
	let renameBusy = $state(false);
	let renameError = $state<string | null>(null);

	async function commitRename(oldTag: string) {
		const next = renameDraft.trim();
		if (!next) {
			cancelEdit();
			return;
		}
		if (next === oldTag) {
			cancelEdit();
			return;
		}
		if (next.startsWith('__')) {
			renameError = 'Reserved name — choose another.';
			return;
		}
		// If `next` already exists, this rename becomes a merge: oldTag's row
		// is dropped server-side and its game tags re-key into next; next's
		// own ideal_points + category survive.
		const merging = tagNames.includes(next);
		renameBusy = true;
		renameError = null;
		try {
			const res = await fetch('/api/composition-targets/rename', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ oldTag, newTag: next })
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
			}
			if (merging) {
				// Drop oldTag locally; keep next's existing settings intact.
				tagNames = tagNames.filter((t) => t !== oldTag);
				tagPointsMap = dropKey(tagPointsMap, oldTag);
				tagColorByName = dropKey(tagColorByName, oldTag);
				tagCategoryByName = dropKey(tagCategoryByName, oldTag);
				saveStatus = dropKey(saveStatus, oldTag);
				lastSaveError = dropKey(lastSaveError, oldTag);
				if (tagsWithIdeal.has(oldTag)) {
					const set = new Set(tagsWithIdeal);
					set.delete(oldTag);
					tagsWithIdeal = set;
				}
			} else {
				// Plain rename: migrate every map's key from oldTag → next.
				const idx = tagNames.indexOf(oldTag);
				const nextNames = tagNames.slice();
				if (idx >= 0) nextNames[idx] = next;
				tagNames = nextNames;
				tagPointsMap = renameKey(tagPointsMap, oldTag, next);
				tagColorByName = renameKey(tagColorByName, oldTag, next);
				tagCategoryByName = renameKey(tagCategoryByName, oldTag, next);
				saveStatus = renameKey(saveStatus, oldTag, next);
				lastSaveError = renameKey(lastSaveError, oldTag, next);
				if (tagsWithIdeal.has(oldTag)) {
					const set = new Set(tagsWithIdeal);
					set.delete(oldTag);
					set.add(next);
					tagsWithIdeal = set;
				}
			}
			if (activeLine === oldTag) activeLine = next;
			if (focusedTag === oldTag) focusedTag = next;
			cancelEdit();
		} catch (e) {
			renameError = e instanceof Error ? e.message : String(e);
		} finally {
			renameBusy = false;
		}
	}

	function dropKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
		if (!(key in obj)) return obj;
		const next: Record<string, T> = {};
		for (const k of Object.keys(obj)) {
			if (k !== key) next[k] = obj[k];
		}
		return next;
	}

	function startRename(tag: string) {
		renameDraft = tag;
		renameError = null;
		openMenu = null;
		startEdit({ kind: 'rename', tag });
	}

	// ----- Duplicate a tag ----------------------------------------------------
	let duplicateBusy = $state<string | null>(null);

	function uniqueDuplicateName(source: string): string {
		const base = `${source} (copy)`;
		if (!tagNames.includes(base)) return base;
		for (let i = 2; i < 200; i++) {
			const candidate = `${source} (copy ${i})`;
			if (!tagNames.includes(candidate)) return candidate;
		}
		return `${source}-${Date.now()}`;
	}

	async function duplicateTag(source: string) {
		if (source === REFERENCE_TAG) return;
		if (duplicateBusy) return;
		const newName = uniqueDuplicateName(source);
		// Snapshot the source's points + category. Use Array.from so any
		// $state proxy is unwrapped to a plain number[] before serialization
		// or storage.
		const srcSnapshot = tagPointsMap[source];
		const sourcePoints: number[] = Array.from(srcSnapshot ?? referencePoints).map((v) => Number(v));
		const sourceCategory = tagCategoryByName[source] ?? null;
		// Pick the NEXT palette slot (not the source's color) so the duplicate
		// is visually distinct on the chart — otherwise its ideal renders
		// directly on top of the source's and they look like one line.
		const nextColor = TAG_PALETTE[tagNames.length % TAG_PALETTE.length];

		// Carry the source's "has ideal" flag forward — duplicating a tag
		// with no ideal produces a duplicate with no ideal either.
		const sourceHasIdeal = tagsWithIdeal.has(source);

		duplicateBusy = source;
		openMenu = null;
		try {
			const res = await fetch('/api/composition-targets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tag: newName,
					ideal_points: sourceHasIdeal ? sourcePoints : null,
					category: sourceCategory
				})
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
			}
			// Slot the duplicate immediately after its source so they sit
			// side-by-side in the sorted-by-category sidebar.
			const sourceIdx = tagNames.indexOf(source);
			const insertAt = sourceIdx >= 0 ? sourceIdx + 1 : tagNames.length;
			const nextNames = tagNames.slice();
			nextNames.splice(insertAt, 0, newName);
			tagNames = nextNames;
			tagPointsMap = { ...tagPointsMap, [newName]: sourcePoints };
			tagCategoryByName = { ...tagCategoryByName, [newName]: sourceCategory };
			tagColorByName = { ...tagColorByName, [newName]: nextColor };
			if (sourceHasIdeal) {
				const next = new Set(tagsWithIdeal);
				next.add(newName);
				tagsWithIdeal = next;
			}
			saveStatus = { ...saveStatus, [newName]: 'saved' };
			activeLine = newName;
			if (focusedTag != null) focusedTag = newName;
		} catch (e) {
			lastSaveError = {
				...lastSaveError,
				[source]: e instanceof Error ? e.message : String(e)
			};
		} finally {
			duplicateBusy = null;
		}
	}

	// ----- Delete a tag ------------------------------------------------------
	let deleteBusy = $state<string | null>(null);

	async function deleteTag(target: string) {
		if (target === REFERENCE_TAG) return;
		if (deleteBusy) return;
		const sample = tagSampleByName[target] ?? 0;
		const msg = sample > 0
			? `Delete "${target}"?\n\nThis removes the curve AND all ${sample} game tag${sample === 1 ? '' : 's'} for this composition. Cannot be undone.`
			: `Delete "${target}"? Cannot be undone.`;
		if (!confirm(msg)) return;

		deleteBusy = target;
		openMenu = null;
		try {
			const res = await fetch('/api/composition-targets', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag: target })
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
			}
			// Drop from every local map. Reset the active line if it pointed
			// at the deleted tag.
			tagNames = tagNames.filter((t) => t !== target);
			tagPointsMap = dropKey(tagPointsMap, target);
			tagColorByName = dropKey(tagColorByName, target);
			tagCategoryByName = dropKey(tagCategoryByName, target);
			saveStatus = dropKey(saveStatus, target);
			lastSaveError = dropKey(lastSaveError, target);
			hiddenIdealsByTag = dropKey(hiddenIdealsByTag, target);
			hiddenActualsByTag = dropKey(hiddenActualsByTag, target);
			if (tagsWithIdeal.has(target)) {
				const set = new Set(tagsWithIdeal);
				set.delete(target);
				tagsWithIdeal = set;
			}
			if (activeLine === target) activeLine = REFERENCE_TAG;
			if (focusedTag === target) focusedTag = null;
			if (detailTag === target) {
				exitDetail();
			}
		} catch (e) {
			lastSaveError = {
				...lastSaveError,
				[target]: e instanceof Error ? e.message : String(e)
			};
		} finally {
			deleteBusy = null;
		}
	}

	// Svelte action: focus + select-all on the input as soon as it mounts.
	function autofocusInput(node: HTMLInputElement) {
		// Defer to next tick so layout is settled before focus().
		setTimeout(() => {
			try {
				node.focus();
				node.select();
			} catch {
				/* ignore */
			}
		}, 0);
	}

	function handleRenameKeydown(ev: KeyboardEvent, tag: string) {
		if (ev.key === 'Enter') {
			ev.preventDefault();
			void commitRename(tag);
		} else if (ev.key === 'Escape') {
			ev.preventDefault();
			cancelEdit();
		}
	}

	function renameKey<T>(obj: Record<string, T>, oldKey: string, newKey: string): Record<string, T> {
		if (!(oldKey in obj)) return obj;
		const next: Record<string, T> = {};
		for (const k of Object.keys(obj)) {
			if (k === oldKey) next[newKey] = obj[k];
			else next[k] = obj[k];
		}
		return next;
	}

	// ----- New tag definition -------------------------------------------------
	let newTagDraft = $state('');
	let newTagBusy = $state(false);
	let newTagError = $state<string | null>(null);

	async function createNewTag() {
		const name = newTagDraft.trim();
		if (!name) {
			newTagError = 'Enter a tag name.';
			return;
		}
		if (name === REFERENCE_TAG || name.startsWith('__')) {
			newTagError = 'Reserved name — choose another.';
			return;
		}
		if (tagNames.includes(name)) {
			newTagError = 'Tag already exists.';
			activeLine = name;
			newTagDraft = '';
			return;
		}
		if (name.length > 64) {
			newTagError = 'Keep names under 64 characters.';
			return;
		}
		newTagBusy = true;
		newTagError = null;
		try {
			// New tags start without an ideal curve. The user creates one
			// later via the kebab menu's "Create ideal" action. We still
			// store reference points in tagPointsMap so the future seed
			// has a reasonable starting shape.
			const seed = [...referencePoints];
			const res = await fetch('/api/composition-targets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag: name, ideal_points: null })
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
			}
			const nextNames = [...tagNames, name];
			tagNames = nextNames;
			tagPointsMap = { ...tagPointsMap, [name]: seed };
			tagColorByName = {
				...tagColorByName,
				[name]: TAG_PALETTE[(nextNames.length - 1) % TAG_PALETTE.length]
			};
			saveStatus = { ...saveStatus, [name]: 'saved' };
			newTagDraft = '';
		} catch (e) {
			newTagError = e instanceof Error ? e.message : String(e);
		} finally {
			newTagBusy = false;
		}
	}

	// ----- Point edits + autosave --------------------------------------------
	function getPointsFor(tag: string): number[] {
		if (tag === REFERENCE_TAG) return referencePoints;
		return tagPointsMap[tag] ?? [];
	}

	function setPoint(tag: string, index: number, value: number) {
		if (tag === REFERENCE_TAG) {
			referencePoints = referencePoints.map((v, i) => (i === index ? value : v));
		} else {
			const current = tagPointsMap[tag] ?? [];
			const next = current.map((v, i) => (i === index ? value : v));
			tagPointsMap = { ...tagPointsMap, [tag]: next };
		}
		scheduleSave(tag);
	}

	function setAllPoints(tag: string, points: number[]) {
		if (tag === REFERENCE_TAG) {
			referencePoints = [...points];
		} else {
			tagPointsMap = { ...tagPointsMap, [tag]: [...points] };
		}
		scheduleSave(tag);
	}

	// Update several indices in a single state mutation so the autosave only
	// schedules once per group drag tick.
	function setManyPoints(tag: string, updates: Array<{ index: number; value: number }>) {
		if (updates.length === 0) return;
		const map = new Map(updates.map((u) => [u.index, u.value]));
		if (tag === REFERENCE_TAG) {
			referencePoints = referencePoints.map((v, i) => (map.has(i) ? map.get(i)! : v));
		} else {
			const current = tagPointsMap[tag] ?? [];
			const next = current.map((v, i) => (map.has(i) ? map.get(i)! : v));
			tagPointsMap = { ...tagPointsMap, [tag]: next };
		}
		scheduleSave(tag);
	}

	function scheduleSave(tag: string) {
		const existing = saveTimers.get(tag);
		if (existing) clearTimeout(existing);
		saveStatus = { ...saveStatus, [tag]: 'saving' };
		const timer = setTimeout(() => {
			void persistSave(tag);
		}, 350);
		saveTimers.set(tag, timer);
	}

	async function persistSave(tag: string) {
		try {
			const pts = getPointsFor(tag);
			const res = await fetch('/api/composition-targets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag, ideal_points: pts })
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
			}
			saveStatus = { ...saveStatus, [tag]: 'saved' };
			lastSaveError = { ...lastSaveError, [tag]: null };
		} catch (e) {
			saveStatus = { ...saveStatus, [tag]: 'error' };
			lastSaveError = {
				...lastSaveError,
				[tag]: e instanceof Error ? e.message : String(e)
			};
		}
	}

	function setActiveLine(tag: string) {
		// Reference click always returns to "show everything" mode and edits the
		// reference baseline.
		if (tag === REFERENCE_TAG) {
			activeLine = REFERENCE_TAG;
			focusedTag = null;
			return;
		}
		// Clicking the already-focused tag deselects it (returns to show-all).
		if (focusedTag === tag) {
			activeLine = REFERENCE_TAG;
			focusedTag = null;
			return;
		}
		// Otherwise focus on this tag and make it the editable line.
		activeLine = tag;
		focusedTag = tag;
	}

	function copyReferenceToActive() {
		if (activeLine === REFERENCE_TAG) return;
		setAllPoints(activeLine, referencePoints);
	}

	function flattenActive() {
		setAllPoints(activeLine, new Array(POINTS).fill(0));
	}

	function linearActive() {
		const current = getPointsFor(activeLine);
		const start = current[0] ?? 0;
		const end = current[POINTS - 1] ?? 30;
		const span = POINTS - 1;
		const next = Array.from({ length: POINTS }, (_, i) =>
			Number((start + ((end - start) * i) / span).toFixed(2))
		);
		setAllPoints(activeLine, next);
	}

	function smoothActive() {
		const current = getPointsFor(activeLine);
		const next = current.map((_, i) => {
			const a = current[i - 1] ?? current[i];
			const b = current[i];
			const c = current[i + 1] ?? current[i];
			return Number(((a + b + c) / 3).toFixed(2));
		});
		setAllPoints(activeLine, next);
	}

	// ----- Chart wiring -------------------------------------------------------
	let canvasEl: HTMLCanvasElement;
	let chart: Chart | null = null;
	let dragIndex = $state<number | null>(null);
	// Marquee + multi-select state. Drag from empty canvas area to draw a
	// selection rectangle; on release every active-line point inside becomes
	// selected. Then dragging a selected point moves the whole group by the
	// same y-delta.
	// Stored as a plain sorted number[] (Svelte 5 doesn't deep-track Set
	// internals; arrays are first-class reactive). Lookups use .includes which
	// is fine at this curve size. selectedSet is a derived for hot-path checks.
	let selectedIndices = $state<number[]>([]);
	const selectedSet = $derived(() => new Set(selectedIndices));
	let marqueeRect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let marqueeStart: { x: number; y: number } | null = null;
	// Pre-drag snapshot used to compute group deltas precisely (no drift).
	let groupDragOrigin: Map<number, number> | null = null;
	let groupDragStartY: number | null = null;
	const HIT_RADIUS_PX = 18;
	const MARQUEE_THRESHOLD_PX = 4; // ignore tiny drags so a click clears selection
	const SNAP_STEP = 1;
	const Y_MIN = 0;
	// Y axis is fixed at 0–30 — the bold horizontal line at 30 doubles as the
	// chart's top edge so every line reads as a fraction of that target.
	const Y_MAX = 30;

	function pointsToData(arr: number[]) {
		return arr.map((y, i) => ({ x: i + 1, y }));
	}

	function editableLine(): string | null {
		if (activeLine === REFERENCE_TAG) return null;
		if (!tagsWithIdeal.has(activeLine)) return null;
		if (!isLineBeingEdited(activeLine)) return null;
		return activeLine;
	}

	function buildConfig(): ChartConfiguration<'line'> {
		const datasets: ChartConfiguration<'line'>['data']['datasets'] = [];

		const sel = selectedSet();
		// Bold horizontal target line at y = 30 — replaces the old editable
		// reference curve. Always rendered, ignores focus / hide-* toggles.
		datasets.push({
			label: '30 VP target',
			data: [
				{ x: 0, y: 30 },
				{ x: POINTS, y: 30 }
			],
			borderColor: '#ffba3d',
			backgroundColor: '#ffba3d',
			borderWidth: 6,
			pointRadius: 0,
			pointHoverRadius: 0,
			tension: 0,
			fill: false
		});

		// Per-tag actual (data, only if present) + ideal (editable). Filter by:
		//  - focusedTag: when set, only that tag's lines pass through
		//  - hideActuals / hideIdeals: header toggles, applied per dataset kind
		//  - selectedGameIds: actuals recomputed across only those games
		const effActual = effectiveTagActual();
		const effSample = effectiveTagSample();
		const filteringByGame = selectedGameIds.size > 0;
		// Default-hide tags filtered out by game selection. Sidebar I/A
		// toggles can override either way (force-show or force-hide), per
		// `isIdealVisible` / `isActualVisible`.
		for (const tag of tagNames) {
			if (focusedTag != null && tag !== focusedTag) continue;

			const color = colorForTag(tag);
			const isActive = isLineBeingEdited(tag);
			const actual = effActual[tag];
			const sampleSize = effSample[tag] ?? 0;
			// Tags with no defined ideal never render the dashed ideal line.
			// Editor-open visibility is temporary and does not write a persistent
			// row override, so closing the panel returns to the normal view rules.
			const showIdeal = isIdealRendered(tag);
			const showActual = isActualVisible(tag);
			if (!showIdeal && !showActual) continue;
			void filteringByGame;

			// In detail view with a specific game selected, swap the aggregate
			// avg-VP line for that single (game, player) instance's per-round VP.
			let actualData: Array<{ x: number; y: number }> | null = null;
			let actualLabel = `${tag} · actual · ${sampleSize}g`;
			if (
				sidebarView === 'detail' &&
				detailTag === tag &&
				selectedInstance != null
			) {
				const inst = (tagInstancesByName[tag] ?? []).find(
					(i) => i.gameId === selectedInstance!.gameId && i.playerColor === selectedInstance!.playerColor
				);
				if (inst) {
					const instPts = normalizeRounds
						? resamplePointsToTarget(inst.points, POINTS)
						: inst.points;
					actualData = instPts.map((p) => ({ x: p.round, y: p.vp }));
					actualLabel = `${tag} · ${inst.playerColor} · ${inst.gameId.slice(-6)}`;
				}
			} else if (actual && actual.length > 0) {
				actualData = actual.map((p) => ({ x: p.round, y: p.avgVp }));
			}

			if (!hideActuals && showActual && actualData) {
				datasets.push({
					label: actualLabel,
					data: smoothSeries(actualData, lineSmoothing),
					borderColor: color,
					backgroundColor: color,
					borderWidth: 2.5,
					pointRadius: 3,
					pointHoverRadius: 5,
					pointBackgroundColor: color,
					pointBorderColor: '#0a0718',
					pointBorderWidth: 1,
					tension: 0,
					fill: false,
					spanGaps: true
				});
			}

			if (showIdeal) {
				const idealPts = tagPointsMap[tag] ?? data.referencePoints;
				const idealRadius = idealPts.map((_, i) =>
					isActive ? (sel.has(i) ? 9 : 6) : 0
				);
				const idealBorderWidth = idealPts.map((_, i) =>
					isActive && sel.has(i) ? 3 : isActive ? 2 : 1
				);
				const idealBorderColor = idealPts.map((_, i) =>
					isActive && sel.has(i) ? '#ffffff' : '#0a0718'
				);
				// Skip smoothing while the line is being edited so dragged
				// points stay anchored where the user dropped them.
				const idealSeries = pointsToData(idealPts);
				datasets.push({
					label: isActive ? `${tag} · ideal (editing)` : `${tag} · ideal`,
					data: isActive ? idealSeries : smoothSeries(idealSeries, lineSmoothing),
					borderColor: color,
					backgroundColor: color,
					borderWidth: isActive ? 3 : 1.5,
					borderDash: [4, 4],
					pointRadius: idealRadius,
					pointHoverRadius: isActive ? 8 : 4,
					pointBackgroundColor: color,
					pointBorderColor: idealBorderColor,
					pointBorderWidth: idealBorderWidth,
					tension: 0,
					fill: false
				});
			}
		}

		// Category averages — one composite ideal line + one composite actual
		// line per category that has ≥2 member tags. Skipped when the user is
		// focused on a single tag (those views are about a single comp).
		if (focusedTag == null) {
			for (const cat of categoriesWithAverages()) {
				const memberTags = tagNames.filter((t) => tagCategoryByName[t] === cat);
				if (memberTags.length < 2) continue;
				const catColor = colorForCategory(cat);

				// Average ideal: per-round mean of member tags' ideal_points.
				if (!hideIdeals && isCategoryIdealVisible(cat)) {
					const avgIdeal: Array<{ x: number; y: number }> = [];
					for (let r = 0; r < POINTS; r++) {
						let sum = 0;
						let n = 0;
						for (const t of memberTags) {
							const pts = tagPointsMap[t];
							if (!pts) continue;
							const v = pts[r];
							if (typeof v === 'number' && Number.isFinite(v)) {
								sum += v;
								n += 1;
							}
						}
						if (n > 0) avgIdeal.push({ x: r + 1, y: sum / n });
					}
					datasets.push({
						label: `${cat} · ideal avg (${memberTags.length})`,
						data: smoothSeries(avgIdeal, lineSmoothing),
						borderColor: catColor,
						backgroundColor: catColor,
						borderWidth: 4,
						borderDash: [10, 4],
						pointRadius: 0,
						pointHoverRadius: 5,
						tension: 0,
						fill: false
					});
				}

				// Average actual: per-round mean of member tags' game-driven VP
				// (recomputed through the active game filter).
				if (!hideActuals && isCategoryActualVisible(cat)) {
					const byRound = new Map<number, { sum: number; n: number }>();
					for (const t of memberTags) {
						const series = effActual[t];
						if (!series) continue;
						for (const p of series) {
							const e = byRound.get(p.round) ?? { sum: 0, n: 0 };
							e.sum += p.avgVp;
							e.n += 1;
							byRound.set(p.round, e);
						}
					}
					if (byRound.size > 0) {
						const avgActual = Array.from(byRound.entries())
							.sort(([a], [b]) => a - b)
							.map(([round, e]) => ({ x: round, y: e.sum / e.n }));
						datasets.push({
							label: `${cat} · actual avg (${memberTags.length})`,
							data: smoothSeries(avgActual, lineSmoothing),
							borderColor: catColor,
							backgroundColor: catColor,
							borderWidth: 4,
							pointRadius: 4,
							pointHoverRadius: 6,
							pointBackgroundColor: catColor,
							pointBorderColor: '#0a0718',
							pointBorderWidth: 1,
							tension: 0,
							fill: false,
							spanGaps: true
						});
					}
				}
			}
		}

		return {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				interaction: { mode: 'nearest', intersect: false },
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: '#d8cfee',
							font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: 600 },
							usePointStyle: true,
							padding: 12,
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
						padding: 10,
						callbacks: {
							title: (ctx) => `Round ${ctx[0]?.parsed.x ?? 0}`,
							label: (ctx) => {
								const y = typeof ctx.parsed.y === 'number' ? ctx.parsed.y.toFixed(2) : '—';
								return `${ctx.dataset.label} — ${y}`;
							}
						}
					}
				},
				scales: {
					x: {
						type: 'linear',
						min: 1,
						max: POINTS,
						title: {
							display: true,
							text: 'ROUND',
							color: '#9a8fb8',
							font: { family: 'Bebas Neue', size: 13, weight: 'normal' }
						},
						ticks: {
							color: '#9a8fb8',
							font: { family: 'Inter, system-ui, sans-serif', size: 11 },
							stepSize: 1,
							autoSkip: false,
							maxRotation: 0,
							precision: 0
						},
						grid: { color: 'rgba(58, 38, 112, 0.35)' }
					},
					y: {
						type: 'linear',
						min: Y_MIN,
						max: Y_MAX,
						title: {
							display: true,
							text: 'VICTORY POINTS',
							color: '#9a8fb8',
							font: { family: 'Bebas Neue', size: 13, weight: 'normal' }
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

	// Hit-test against the ACTIVE line's points only.
	function findActivePointAt(canvasX: number, canvasY: number): number | null {
		if (!chart) return null;
		const editable = editableLine();
		if (!editable) return null;
		const xScale = chart.scales.x;
		const yScale = chart.scales.y;
		const pts = getPointsFor(editable);
		let best = -1;
		let bestDist = Infinity;
		for (let i = 0; i < pts.length; i++) {
			const px = xScale.getPixelForValue(i + 1);
			const py = yScale.getPixelForValue(pts[i]);
			const d = Math.hypot(px - canvasX, py - canvasY);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		return bestDist <= HIT_RADIUS_PX ? best : null;
	}

	function canvasCoords(ev: MouseEvent | PointerEvent): { x: number; y: number } {
		const rect = canvasEl.getBoundingClientRect();
		return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
	}

	function valueForPixelY(py: number): number | null {
		if (!chart) return null;
		const v = chart.scales.y.getValueForPixel(py);
		if (typeof v !== 'number' || !Number.isFinite(v)) return null;
		const cur = chart.scales.y;
		const min = cur.min ?? 0;
		const max = cur.max ?? 100;
		const clamped = Math.max(min, Math.min(max, v));
		return Math.round(clamped / SNAP_STEP) * SNAP_STEP;
	}

	function handlePointerDown(ev: PointerEvent) {
		if (!chart) return;
		const editable = editableLine();
		if (!editable) return;
		const { x, y } = canvasCoords(ev);
		const idx = findActivePointAt(x, y);

		if (idx != null) {
			// Hit a point. If it's part of an existing multi-selection, this drag
			// becomes a group move; otherwise we drop the selection and drag this
			// single point.
			if (selectedIndices.includes(idx) && selectedIndices.length > 1) {
				const pts = getPointsFor(editable);
				const origin = new Map<number, number>();
				for (const i of selectedIndices) origin.set(i, pts[i] ?? 0);
				groupDragOrigin = origin;
				groupDragStartY = y;
			} else {
				selectedIndices = [];
				groupDragOrigin = null;
				groupDragStartY = null;
			}
			dragIndex = idx;
			canvasEl.setPointerCapture(ev.pointerId);
			ev.preventDefault();
			return;
		}

		// Empty area → start a marquee. Treated as a "click" until the pointer
		// has moved past MARQUEE_THRESHOLD_PX, at which point it becomes a real
		// rectangle.
		marqueeStart = { x, y };
		marqueeRect = null;
		canvasEl.setPointerCapture(ev.pointerId);
		ev.preventDefault();
	}

	function handlePointerMove(ev: PointerEvent) {
		if (!chart) return;
		const editable = editableLine();
		if (!editable) {
			canvasEl.style.cursor = 'default';
			return;
		}
		const { x, y } = canvasCoords(ev);

		// Marquee drag
		if (marqueeStart) {
			const dx = x - marqueeStart.x;
			const dy = y - marqueeStart.y;
			if (
				Math.abs(dx) >= MARQUEE_THRESHOLD_PX ||
				Math.abs(dy) >= MARQUEE_THRESHOLD_PX ||
				marqueeRect != null
			) {
				marqueeRect = {
					x: Math.min(marqueeStart.x, x),
					y: Math.min(marqueeStart.y, y),
					w: Math.abs(dx),
					h: Math.abs(dy)
				};
			}
			canvasEl.style.cursor = 'crosshair';
			return;
		}

		// Point drag (single or group)
		if (dragIndex != null) {
			if (groupDragOrigin && groupDragStartY != null) {
				// Convert pixel delta → value delta and apply uniformly, snapping
				// each result to SNAP_STEP and clamping into the current y range.
				const startVal = chart.scales.y.getValueForPixel(groupDragStartY);
				const curVal = chart.scales.y.getValueForPixel(y);
				if (typeof startVal !== 'number' || typeof curVal !== 'number') return;
				const rawDelta = curVal - startVal;
				const yScale = chart.scales.y;
				const yMin = yScale.min ?? 0;
				const yMax = yScale.max ?? 100;
				const updates: Array<{ index: number; value: number }> = [];
				groupDragOrigin.forEach((originVal, i) => {
					const next = Math.round((originVal + rawDelta) / SNAP_STEP) * SNAP_STEP;
					updates.push({ index: i, value: Math.max(yMin, Math.min(yMax, next)) });
				});
				setManyPoints(editable, updates);
				canvasEl.style.cursor = 'grabbing';
				return;
			}
			const value = valueForPixelY(y);
			if (value == null) return;
			setPoint(editable, dragIndex, value);
			canvasEl.style.cursor = 'grabbing';
			return;
		}

		// Idle hover hint
		const hover = findActivePointAt(x, y);
		canvasEl.style.cursor = hover != null ? 'grab' : 'crosshair';
	}

	function handlePointerUp(ev: PointerEvent) {
		// Marquee release
		if (marqueeStart) {
			if (marqueeRect && (marqueeRect.w >= MARQUEE_THRESHOLD_PX || marqueeRect.h >= MARQUEE_THRESHOLD_PX)) {
				const indices = computeMarqueeSelection(marqueeRect);
				selectedIndices = Array.from(indices).sort((a, b) => a - b);
			} else {
				// Treat tiny marquees / pure clicks as "clear selection".
				selectedIndices = [];
			}
			marqueeRect = null;
			marqueeStart = null;
			try {
				canvasEl.releasePointerCapture(ev.pointerId);
			} catch {
				/* ignore */
			}
			canvasEl.style.cursor = 'default';
			return;
		}

		if (dragIndex == null) return;
		dragIndex = null;
		groupDragOrigin = null;
		groupDragStartY = null;
		try {
			canvasEl.releasePointerCapture(ev.pointerId);
		} catch {
			/* ignore */
		}
		canvasEl.style.cursor = 'default';
	}

	function computeMarqueeSelection(rect: {
		x: number;
		y: number;
		w: number;
		h: number;
	}): Set<number> {
		const out = new Set<number>();
		if (!chart) return out;
		const editable = editableLine();
		if (!editable) return out;
		const xScale = chart.scales.x;
		const yScale = chart.scales.y;
		const pts = getPointsFor(editable);
		const x1 = rect.x;
		const x2 = rect.x + rect.w;
		const y1 = rect.y;
		const y2 = rect.y + rect.h;
		for (let i = 0; i < pts.length; i++) {
			const px = xScale.getPixelForValue(i + 1);
			const py = yScale.getPixelForValue(pts[i]);
			if (px >= x1 && px <= x2 && py >= y1 && py <= y2) out.add(i);
		}
		return out;
	}

	function handleKeydown(ev: KeyboardEvent) {
		if (ev.key !== 'Escape') return;
		if (openMenu != null) {
			openMenu = null;
			return;
		}
		if (editMode != null) {
			cancelEdit();
			return;
		}
		if (selectedIndices.length > 0) {
			selectedIndices = [];
		}
	}

	onMount(() => {
		if (!canvasEl) return;
		chart = new Chart(canvasEl, buildConfig());
		canvasEl.addEventListener('pointerdown', handlePointerDown);
		canvasEl.addEventListener('pointermove', handlePointerMove);
		canvasEl.addEventListener('pointerup', handlePointerUp);
		canvasEl.addEventListener('pointercancel', handlePointerUp);
		window.addEventListener('keydown', handleKeydown);
		document.addEventListener('click', handleDocumentClick);
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
		boxChart?.destroy();
		boxChart = null;
		canvasEl?.removeEventListener('pointerdown', handlePointerDown);
		canvasEl?.removeEventListener('pointermove', handlePointerMove);
		canvasEl?.removeEventListener('pointerup', handlePointerUp);
		canvasEl?.removeEventListener('pointercancel', handlePointerUp);
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeydown);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleDocumentClick);
		}
		for (const t of saveTimers.values()) clearTimeout(t);
	});

	// Box plot chart lifecycle. The canvas only exists while viewMode is
	// 'boxplot', so we create the Chart instance when the canvas mounts and
	// destroy it when it unmounts. Data updates rebuild the chart instead of
	// in-place mutating because the boxplot dataset shape is awkward to patch.
	let boxCanvasEl: HTMLCanvasElement | null = $state(null);
	let boxChart: Chart | null = null;

	function buildBoxplotConfig(): ChartConfiguration {
		const entries = boxplotEntries();
		// Per-element colors via arrays — the boxplot element honors them per
		// box. Borders use the comp color at full strength; fills are alpha'd.
		const fillColors = entries.map((e) => withAlpha(e.color, 0.18));
		const borderColors = entries.map((e) => e.color);
		return {
			type: 'boxplot' as 'bar',
			data: {
				labels: entries.map((e) => `${e.tag}  (n=${e.n})`),
				datasets: [
					{
						label: 'VP / round',
						data: entries.map((e) => e.values) as unknown as number[],
						backgroundColor: fillColors,
						borderColor: borderColors,
						borderWidth: 1.5,
						outlierBackgroundColor: borderColors,
						outlierBorderColor: borderColors,
						outlierRadius: 3.5,
						itemRadius: 2.5,
						itemBackgroundColor: borderColors,
						itemBorderColor: borderColors,
						medianColor: '#ffffff',
						meanRadius: 0
					} as unknown as Record<string, unknown>
				]
			},
			options: {
				indexAxis: 'y',
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							title: (items: Array<{ label: string }>) => items[0]?.label ?? '',
							label: (item: { raw: unknown }) => {
								const raw = item.raw as
									| { min?: number; q1?: number; median?: number; q3?: number; max?: number; mean?: number }
									| undefined;
								if (!raw) return '';
								const f = (n: number | undefined) => (typeof n === 'number' ? n.toFixed(2) : '—');
								return [
									`median ${f(raw.median)}`,
									`Q1 ${f(raw.q1)}  ·  Q3 ${f(raw.q3)}`,
									`min ${f(raw.min)}  ·  max ${f(raw.max)}`,
									`mean ${f(raw.mean)}`
								].join('  ·  ');
							}
						}
					}
				},
				scales: {
					x: {
						title: { display: true, text: 'VP / round', color: 'rgba(220,220,230,0.7)' },
						grid: { color: 'rgba(255,255,255,0.06)' },
						ticks: { color: 'rgba(220,220,230,0.85)' }
					},
					y: {
						grid: { color: 'rgba(255,255,255,0.04)' },
						ticks: { color: 'rgba(220,220,230,0.85)' }
					}
				},
				onClick: (_event: unknown, elements: Array<{ index: number }>) => {
					if (!elements.length) return;
					const idx = elements[0].index;
					const e = boxplotEntries()[idx];
					if (e) openTagInChart(e.tag);
				}
			}
		} as unknown as ChartConfiguration;
	}

	function withAlpha(hex: string, alpha: number): string {
		// Accept either #rrggbb or rgb(...) — falls back to a translucent overlay.
		if (/^#([0-9a-f]{6})$/i.test(hex)) {
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
		return hex;
	}

	$effect(() => {
		// Re-creates the chart whenever the canvas appears, or the data changes
		// while it's visible. Destroying first avoids "canvas already in use".
		const canvas = boxCanvasEl;
		// Touch entries so the effect re-runs on data changes.
		const _entries = boxplotEntries();
		void _entries;
		if (!canvas) {
			boxChart?.destroy();
			boxChart = null;
			return;
		}
		boxChart?.destroy();
		boxChart = new Chart(canvas, buildBoxplotConfig());
	});

	// Switching the active line discards any prior selection — indices are
	// per-line and don't survive a context switch. We deliberately do NOT read
	// selectedIndices here, otherwise the effect would re-fire on every selection
	// change and immediately wipe the user's marquee.
	$effect(() => {
		void activeLine;
		selectedIndices = [];
	});

	$effect(() => {
		if (!chart || !canvasEl) return;
		void referencePoints;
		void tagPointsMap;
		void tagNames;
		void tagCategoryByName;
		void activeLine;
		void focusedTag;
		void hideActuals;
		void hideIdeals;
		void hiddenIdealsByTag;
		void hiddenActualsByTag;
		void hiddenIdealsByCategory;
		void hiddenActualsByCategory;
		void selectedIndices;
		void sidebarView;
		void detailTag;
		void selectedInstance;
		// Trigger rebuild when the user changes which games to include.
		void selectedGameIds;
		void lineSmoothing;
		// Adding/removing ideals must redraw the chart.
		void tagsWithIdeal;
		const cfg = buildConfig();
		chart.data = cfg.data;
		chart.options = cfg.options ?? {};
		chart.update('none');
	});

	// ----- Drift -------------------------------------------------------------
	interface DriftRow {
		tag: string;
		sampleSize: number;
		lastRound: number | null;
		actualVp: number | null;
		idealVp: number | null;
		delta: number | null;
	}

	const driftRows = $derived((): DriftRow[] => {
		return data.tagSeries.map((series) => {
			const last = series.points[series.points.length - 1] ?? null;
			const actualVp = last?.avgVp ?? null;
			const idealArr = tagPointsMap[series.tag];
			const idealVp =
				idealArr && last && last.round >= 1 && last.round <= POINTS
					? (idealArr[last.round - 1] ?? null)
					: null;
			const delta = actualVp != null && idealVp != null ? actualVp - idealVp : null;
			return {
				tag: series.tag,
				sampleSize: series.sampleSize,
				lastRound: last?.round ?? null,
				actualVp,
				idealVp,
				delta
			};
		});
	});

	function fmtDelta(d: number | null): string {
		if (d == null) return '—';
		const sign = d >= 0 ? '+' : '';
		return `${sign}${d.toFixed(2)}`;
	}

	function deltaClass(d: number | null): string {
		if (d == null) return '';
		if (Math.abs(d) < 1) return 'on-target';
		if (d > 0) return 'over';
		return 'under';
	}

	function statusLabel(tag: string): string {
		const s = saveStatus[tag];
		if (s === 'saving') return 'Saving…';
		if (s === 'saved') return '✓ Saved';
		if (s === 'error') return '⚠ Error';
		return '';
	}

	const activeName = $derived(() =>
		activeLine === REFERENCE_TAG ? 'Reference' : activeLine
	);
	const activeColor = $derived(() =>
		activeLine === REFERENCE_TAG ? REFERENCE_COLOR : colorForTag(activeLine)
	);

	function handleNewTagKeydown(ev: KeyboardEvent) {
		if (ev.key === 'Enter') {
			ev.preventDefault();
			void createNewTag();
		}
	}
</script>

<svelte:head>
	<title>Composition Analysis | Arc Spirits</title>
</svelte:head>

<div class="app-shell">
	<!-- Top header (title / EDITING / SHAPE / VIEW) intentionally removed
	     to keep the surface as just chart + sidebar. The script-side state
	     (activeLine, focusedTag, hideActuals/hideIdeals, shape helpers,
	     EDITING save status) stays around so the controls can be re-exposed
	     later via per-line kebab menus or a section ⋮ without re-plumbing. -->
	{#if false}
	<header class="app-header">
		<div class="app-header__title">
			<span class="eyebrow">BALANCE</span>
			<h1>COMPOSITION ANALYSIS</h1>
		</div>

		<div class="app-header__editing">
			<span class="field-label">EDITING</span>
			<div class="editing-row">
				<span class="active-swatch" style="background: {activeColor()}"></span>
				<span class="active-name">{activeName()}</span>
				<span class="active-status status-{saveStatus[activeLine] ?? 'idle'}">
					{statusLabel(activeLine)}
				</span>
			</div>
			{#if lastSaveError[activeLine]}
				<div class="error">{lastSaveError[activeLine]}</div>
			{/if}
		</div>

		<div class="app-header__tools">
			<span class="field-label">SHAPE</span>
			<div class="tools-row">
				<button class="tool-btn" onclick={flattenActive} title="Set all points to 0">Flat</button>
				<button class="tool-btn" onclick={linearActive} title="Interpolate linearly between current endpoints">Linear</button>
				<button class="tool-btn" onclick={smoothActive} title="3-tap moving average">Smooth</button>
				{#if activeLine !== REFERENCE_TAG}
					<button class="tool-btn" onclick={copyReferenceToActive} title="Copy the reference curve">Copy ref</button>
				{/if}
			</div>
		</div>

		<div class="app-header__view">
			<span class="field-label">VIEW</span>
			<div class="tools-row">
				<button
					class="tool-btn"
					class:tool-btn--on={hideActuals}
					onclick={() => (hideActuals = !hideActuals)}
					title="Hide every game-data line"
					aria-pressed={hideActuals}
				>
					{hideActuals ? '✓ Hide actuals' : 'Hide actuals'}
				</button>
				<button
					class="tool-btn"
					class:tool-btn--on={hideIdeals}
					onclick={() => (hideIdeals = !hideIdeals)}
					title="Hide every ideal curve"
					aria-pressed={hideIdeals}
				>
					{hideIdeals ? '✓ Hide ideals' : 'Hide ideals'}
				</button>
				{#if focusedTag != null}
					<button
						class="tool-btn"
						onclick={() => (focusedTag = null)}
						title="Show every tag again"
					>
						✕ Clear focus
					</button>
				{/if}
			</div>
		</div>
	</header>
	{/if}

	<nav class="view-tabs" aria-label="Composition analysis view">
		<button
			type="button"
			class="view-tab"
			class:view-tab--active={viewMode === 'chart'}
			onclick={() => (viewMode = 'chart')}
			aria-pressed={viewMode === 'chart'}
		>
			<span class="view-tab__label">Curves</span>
		</button>
		<button
			type="button"
			class="view-tab"
			class:view-tab--active={viewMode === 'scoreboard'}
			onclick={() => (viewMode = 'scoreboard')}
			aria-pressed={viewMode === 'scoreboard'}
		>
			<span class="view-tab__label">Scoreboard</span>
		</button>
		<button
			type="button"
			class="view-tab"
			class:view-tab--active={viewMode === 'boxplot'}
			onclick={() => (viewMode = 'boxplot')}
			aria-pressed={viewMode === 'boxplot'}
		>
			<span class="view-tab__label">Box plot</span>
		</button>
	</nav>

	<div
		class="app-grid"
		class:app-grid--games-open={gameSidebarOpen}
		class:app-grid--scoreboard={viewMode === 'scoreboard' || viewMode === 'boxplot'}
	>
		<aside
			class="games-pane"
			class:games-pane--collapsed={!gameSidebarOpen}
			aria-label="Games to include in analysis"
		>
			{#if gameSidebarOpen}
				<header class="games-head">
					<span class="games-eyebrow">Games</span>
					<button
						type="button"
						class="games-toggle"
						title="Collapse games panel"
						aria-label="Collapse games panel"
						onclick={() => (gameSidebarOpen = false)}
					>◀</button>
				</header>
				<div class="games-status">
					{#if selectedGameIds.size === 0}
						<span class="games-status-line">All <strong>{allGames().length}</strong> included</span>
					{:else}
						<span class="games-status-line">
							<strong>{selectedGameIds.size}</strong> / {allGames().length} included
						</span>
						<button
							type="button"
							class="games-clear"
							onclick={selectAllGames}
							title="Show all games"
						>Reset</button>
					{/if}
				</div>
				<input
					type="search"
					class="games-search"
					placeholder="Filter games…"
					bind:value={gameFilterQuery}
				/>
				<div class="games-list" role="listbox" aria-label="Games">
					{#each filteredGameRows() as g (g.gameId)}
						{@const checked = gameRowIncluded(g.gameId)}
						{@const explicit = selectedGameIds.has(g.gameId)}
						<button
							type="button"
							class="game-row"
							class:game-row--on={explicit}
							class:game-row--implicit={selectedGameIds.size === 0}
							onclick={() => toggleGame(g.gameId)}
							role="option"
							aria-selected={checked}
							title={g.gameId}
						>
							<span class="game-checkbox" aria-hidden="true">
								{#if explicit}✓{:else if selectedGameIds.size === 0}·{:else}{''}{/if}
							</span>
							<span class="game-row-text">
								<span class="game-row-label">{g.label}</span>
								<span class="game-row-meta">
									{#if g.endedAt}{new Date(g.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {/if}{g.tagCount} tag{g.tagCount === 1 ? '' : 's'}
								</span>
							</span>
						</button>
					{/each}
					{#if filteredGameRows().length === 0}
						<div class="games-empty">No games match.</div>
					{/if}
				</div>
			{:else}
				<button
					type="button"
					class="games-toggle games-toggle--strip"
					title="Open games panel"
					aria-label="Open games panel"
					onclick={() => (gameSidebarOpen = true)}
				>
					<span class="games-toggle-arrow">▶</span>
					<span class="games-toggle-label">Games</span>
					{#if selectedGameIds.size > 0}
						<span class="games-toggle-badge">{selectedGameIds.size}</span>
					{/if}
				</button>
			{/if}
		</aside>

		<section
			class="chart-pane"
			class:chart-pane--scoreboard={viewMode === 'scoreboard' || viewMode === 'boxplot'}
			aria-label="Composition VP curves"
		>
			<div class="chart-canvas-wrap">
				<canvas bind:this={canvasEl}></canvas>
				{#if marqueeRect}
					<div
						class="marquee"
						style="left: {marqueeRect.x}px; top: {marqueeRect.y}px; width: {marqueeRect.w}px; height: {marqueeRect.h}px"
					></div>
				{/if}
				{#if selectedIndices.length > 0}
					<div class="selection-badge">
						{selectedIndices.length} selected
						<button
							type="button"
							class="selection-clear"
							onclick={() => (selectedIndices = [])}
							title="Clear selection (Esc)"
						>
							✕
						</button>
					</div>
				{/if}
			</div>
			<div class="chart-controls" data-menu-keep-open>
				<button
					type="button"
					class="normalize-toggle"
					class:on={normalizeRounds}
					onclick={() => (normalizeRounds = !normalizeRounds)}
					aria-pressed={normalizeRounds}
					title="Stretch each game's curve onto a 0–100% game-progress axis so games of different length can be compared and averaged against ideals."
				>
					<span class="normalize-toggle__label">0–100%</span>
					<span class="normalize-toggle__state">{normalizeRounds ? 'ON' : 'OFF'}</span>
				</button>
				<span class="chart-controls__sep" aria-hidden="true"></span>
				<label for="line-smoothing" class="smoothing-label">SMOOTH</label>
				<input
					id="line-smoothing"
					type="range"
					min="0"
					max="5"
					step="0.25"
					bind:value={lineSmoothing}
					class="smoothing-range"
					title="Gaussian smoothing radius (in rounds) — 0 is no smoothing, larger values blur each point with its neighbours so the curve no longer has to pass through every point"
				/>
				<span class="smoothing-value tabular-nums">{lineSmoothing.toFixed(2)}</span>
			</div>
			<div class="chart-hint">
				{#if selectedIndices.length > 1}
					Drag any selected point to move all <strong>{selectedIndices.length}</strong> together.
					Press Esc or click empty space to clear.
				{:else}
					Click & drag a point to shape the
					<span style="color: {activeColor()}">{activeName()}</span> line. Drag empty space to
					marquee-select multiple points. Saves automatically.
					{/if}
					{#if focusedTag != null}
						<span class="chart-hint__focus">Focused on {focusedTag} — use Back to return to every line.</span>
					{/if}
				</div>

				{#if viewMode === 'boxplot'}
					{@const entries = boxplotEntries()}
					{@const rowH = 38}
					{@const canvasHeight = Math.max(220, 64 + entries.length * rowH)}
					<div class="boxplot">
						<header class="boxplot__head">
							<div class="boxplot__title">
								<span class="eyebrow">DISTRIBUTION</span>
								<h2>VP per round — per comp</h2>
							</div>
							<div class="boxplot__legend muted">
								<span>Box = Q1–Q3</span>
								<span>Line = median</span>
								<span>Whiskers = 1.5·IQR</span>
								<span>Dots = raw values / outliers</span>
							</div>
						</header>
						{#if entries.length === 0}
							<div class="boxplot__empty muted">
								No comps match the current game filter.
							</div>
						{:else}
							<div class="boxplot__canvas-wrap" style="height: {canvasHeight}px">
								<canvas bind:this={boxCanvasEl}></canvas>
							</div>
						{/if}
					</div>
				{/if}

				{#if viewMode === 'scoreboard'}
					{@const rows = scoreboardRowsSorted()}
					{@const totals = scoreboardTotals()}
					<div class="scoreboard">
						<header class="scoreboard__head">
							<div class="scoreboard__title">
								<span class="eyebrow">SCOREBOARD</span>
								<h2>Composition performance</h2>
							</div>
							<div class="scoreboard__meta muted">
								{totals.comps} comp{totals.comps === 1 ? '' : 's'} · {totals.instances} game-instance{totals.instances === 1 ? '' : 's'}
								{#if selectedGameIds.size > 0}
									<span class="scoreboard__chip">filtered: {selectedGameIds.size} game{selectedGameIds.size === 1 ? '' : 's'}</span>
								{/if}
							</div>
						</header>
						{#if rows.length === 0}
							<div class="scoreboard__empty muted">
								No game-instances match the current game filter. Clear the games filter to see all comps.
							</div>
						{:else}
							<div class="scoreboard__scroll">
								<table class="scoreboard__table">
									<thead>
										<tr>
											<th
												class="sb-th sb-th--tag"
												aria-sort={scoreSortKey === 'tag' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('tag')}>
													Comp{scoreSortKey === 'tag' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Game-instances of this comp included after the games filter"
												aria-sort={scoreSortKey === 'n' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('n')}>
													N{scoreSortKey === 'n' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Win rate — percentage of game-instances that ever reached 30 VP (game-ending threshold)"
												aria-sort={scoreSortKey === 'reachRate' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('reachRate')}>
													Win rate{scoreSortKey === 'reachRate' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Median final VP across all instances, including ones that fell short of 30 (± sample stddev)"
												aria-sort={scoreSortKey === 'medFinalVp' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('medFinalVp')}>
													Final VP{scoreSortKey === 'medFinalVp' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Mean of (final VP ÷ total rounds played) across instances (± sample stddev) — length-independent pace"
												aria-sort={scoreSortKey === 'vpPerRound' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('vpPerRound')}>
													VP/round{scoreSortKey === 'vpPerRound' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Mean VP gained in rounds 1–10 (± sample stddev) — early-game pace"
												aria-sort={scoreSortKey === 'meanEarly' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('meanEarly')}>
													Early 1–10{scoreSortKey === 'meanEarly' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Mean VP gained in rounds 10–20 (± sample stddev) — mid-game pace"
												aria-sort={scoreSortKey === 'meanMid' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('meanMid')}>
													Mid 10–20{scoreSortKey === 'meanMid' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Mean VP gained from round 20 to game end (± sample stddev) — late-game pace"
												aria-sort={scoreSortKey === 'meanLate' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('meanLate')}>
													Late 20+{scoreSortKey === 'meanLate' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th
												class="sb-th sb-th--num"
												title="Share of instances where the game ended on or right after this comp crossed 30 — proxy for winning"
												aria-sort={scoreSortKey === 'endShare' ? (scoreSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
											>
												<button type="button" onclick={() => cycleScoreSort('endShare')}>
													End-share %{scoreSortKey === 'endShare' ? (scoreSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
												</button>
											</th>
											<th class="sb-th sb-th--spark">Shape</th>
										</tr>
									</thead>
									<tbody>
										{#each rows as row (row.tag)}
											{@const yMax = Math.max(VP_THRESHOLD, ...row.sparkline.map((p) => p.vp), 1)}
											{@const sparkW = 96}
											{@const sparkH = 28}
											{@const thresholdY = sparkH - (VP_THRESHOLD / yMax) * sparkH}
											<tr class="sb-row">
												<td class="sb-td sb-td--tag">
													<button
														type="button"
														class="sb-tag"
														onclick={() => openTagInChart(row.tag)}
														title="Open {row.tag} in the curves view"
													>
														<span class="sb-tag__swatch" style="background: {row.color}"></span>
														<span class="sb-tag__name">{row.tag}</span>
														{#if row.category}
															<span class="sb-tag__cat">{row.category}</span>
														{/if}
													</button>
												</td>
												<td class="sb-td sb-td--num tabular-nums">{row.n}</td>
												<td class="sb-td sb-td--num tabular-nums">
													{Math.round(row.reachRate * 100)}%
													<span class="sb-sub">{row.reachCount}/{row.n}</span>
												</td>
												<td class="sb-td sb-td--num tabular-nums">
													{row.medFinalVp.toFixed(1)}{#if row.sdFinalVp != null}<span class="sb-sd">±{row.sdFinalVp.toFixed(1)}</span>{/if}
												</td>
												<td class="sb-td sb-td--num tabular-nums">
													{row.meanVpPerRound.toFixed(2)}{#if row.sdVpPerRound != null}<span class="sb-sd">±{row.sdVpPerRound.toFixed(2)}</span>{/if}
												</td>
												<td class="sb-td sb-td--num tabular-nums">
													{row.meanEarly.toFixed(1)}{#if row.sdEarly != null}<span class="sb-sd">±{row.sdEarly.toFixed(1)}</span>{/if}
												</td>
												<td class="sb-td sb-td--num tabular-nums">
													{row.meanMid.toFixed(1)}{#if row.sdMid != null}<span class="sb-sd">±{row.sdMid.toFixed(1)}</span>{/if}
												</td>
												<td class="sb-td sb-td--num tabular-nums">
													{row.meanLate.toFixed(1)}{#if row.sdLate != null}<span class="sb-sd">±{row.sdLate.toFixed(1)}</span>{/if}
												</td>
												<td class="sb-td sb-td--num tabular-nums">{Math.round(row.endShare * 100)}%</td>
												<td class="sb-td sb-td--spark">
													{#if row.sparkline.length >= 2}
														<svg
															class="sb-spark"
															viewBox="0 0 {sparkW} {sparkH}"
															width={sparkW}
															height={sparkH}
															aria-hidden="true"
														>
															<line
																x1="0"
																y1={thresholdY}
																x2={sparkW}
																y2={thresholdY}
																stroke="rgba(255,186,61,0.45)"
																stroke-dasharray="2,2"
																stroke-width="1"
															/>
															<path
																d={sparklinePath(row.sparkline, sparkW, sparkH, yMax)}
																stroke={row.color}
																stroke-width="1.75"
																fill="none"
																stroke-linecap="round"
																stroke-linejoin="round"
															/>
														</svg>
													{:else}
														<span class="sb-dash">—</span>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/if}
		</section>

		<aside class="side-pane">
			<div class="side-section side-section--scroll">
				{#if sidebarView === 'detail' && detailTag}
					<!-- ====== DETAIL VIEW: drill-in for one composition line ====== -->
					{@const dTag = detailTag}
					{@const dColor = colorForTag(dTag)}
					{@const dInstances = tagInstancesByName[dTag] ?? []}
					{@const dCategory = tagCategoryByName[dTag]}
					{@const dIdealOn = isIdealRendered(dTag)}
					{@const dActualOn = isActualVisible(dTag)}
					<header class="detail-header">
						<button
							type="button"
							class="detail-back"
							onclick={exitDetail}
							title="Back to lines"
							aria-label="Back to lines"
						>←</button>
						<span class="tag-swatch tag-swatch--lg" style="background: {dColor}"></span>
						<span class="detail-title" title={dTag}>{dTag}</span>
					</header>
					<div class="detail-meta">
						{#if dCategory}
							<span class="muted">in <strong>{dCategory}</strong></span>
						{:else}
							<span class="muted">untagged</span>
						{/if}
						<span class="muted">{dInstances.length} game{dInstances.length === 1 ? '' : 's'}</span>
					</div>
					<section class="ideal-editor" style="--tag-color: {dColor}" aria-label="Ideal curve tools">
						<div class="ideal-editor__head">
							<div>
								<span class="field-label">IDEAL CURVE</span>
								<span class="ideal-editor__status status-{saveStatus[dTag] ?? 'idle'}">
									{statusLabel(dTag)}
								</span>
							</div>
							<div class="line-card__viz-wrap" data-menu-keep-open>
								<button
									type="button"
									class="line-card__viz line-card__viz--ideal"
									class:off={!dIdealOn}
									style="--tag-color: {dColor}"
									onclick={(e) => { e.stopPropagation(); toggleIdealHidden(dTag); }}
									title={dIdealOn ? 'Hide this ideal' : 'Show this ideal'}
									aria-pressed={dIdealOn}
								>I</button>
								<button
									type="button"
									class="line-card__viz line-card__viz--actual"
									class:off={!dActualOn}
									style="--tag-color: {dColor}"
									onclick={(e) => { e.stopPropagation(); toggleActualHidden(dTag); }}
									title={dActualOn ? 'Hide this historical line' : 'Show this historical line'}
									aria-pressed={dActualOn}
									disabled={dInstances.length === 0}
								>A</button>
							</div>
						</div>
						<div class="ideal-editor__tools">
							<button type="button" class="tool-btn" onclick={flattenActive} title="Set this ideal to 0">Flat</button>
							<button type="button" class="tool-btn" onclick={linearActive} title="Interpolate this ideal between current endpoints">Linear</button>
							<button type="button" class="tool-btn" onclick={smoothActive} title="Smooth this ideal with a 3-point moving average">Smooth</button>
							<button type="button" class="tool-btn" onclick={copyReferenceToActive} title="Copy the 30 VP target shape to this ideal">Copy target</button>
						</div>
						{#if lastSaveError[dTag]}
							<div class="error">{lastSaveError[dTag]}</div>
						{/if}
					</section>
					<div class="instance-list">
						<button
							type="button"
							class="instance-card"
							class:active={selectedInstance === null}
							onclick={() => (selectedInstance = null)}
						>
							<span class="instance-swatch instance-swatch--avg"></span>
							<div class="instance-text">
								<span class="instance-label">All games (avg)</span>
								<span class="instance-meta">aggregate across {dInstances.length} game{dInstances.length === 1 ? '' : 's'}</span>
							</div>
						</button>
						{#each dInstances as inst (`${inst.gameId}:${inst.playerColor}`)}
							{@const isSel = selectedInstance != null && selectedInstance.gameId === inst.gameId && selectedInstance.playerColor === inst.playerColor}
							{@const playerHex = PLAYER_COLOR_HEX[inst.playerColor as keyof typeof PLAYER_COLOR_HEX] ?? '#888'}
							<button
								type="button"
								class="instance-card"
								class:active={isSel}
								onclick={() => (selectedInstance = { gameId: inst.gameId, playerColor: inst.playerColor })}
							>
								<span class="instance-swatch" style="background: {playerHex}"></span>
								<div class="instance-text">
									<span class="instance-label">{inst.playerColor}</span>
									<span class="instance-meta">{inst.gameId.slice(-8)} · {inst.totalRounds}r</span>
								</div>
							</button>
						{/each}
						{#if dInstances.length === 0}
							<div class="empty">No games tagged with this line yet.</div>
						{/if}
					</div>
				{:else}
					<!-- ====== LINES LIST VIEW ====== -->
					{@const balance = balanceGrade()}
					<section
						class="balance-card balance-card--grade-{balance.grade ?? 'none'}"
						class:balance-card--empty={balance.grade == null}
						aria-label="Game balance"
					>
						<div class="balance-card__top">
							<div class="balance-card__grade grade-{balance.grade ?? 'none'}">
								{balance.grade ?? '—'}
							</div>
							<div class="balance-card__body">
								<div class="balance-card__label">Game balance</div>
								<div class="balance-card__scope">{balanceScopeLabel()}</div>
								<div class="balance-card__meta">
									{#if balance.avgDelta != null}
										Avg distance {balance.avgDelta.toFixed(2)} VP from category ideals
									{:else}
										Need categorized historical lines with ideal curves
									{/if}
								</div>
							</div>
						</div>
						<div class="balance-card__stats">
							<div class="balance-stat">
								<span class="balance-stat__value">
									{balance.avgRoundTo30 == null ? '—' : balance.avgRoundTo30.toFixed(1)}
								</span>
								<span class="balance-stat__label">Avg 30 VP round</span>
							</div>
							<div class="balance-stat">
								<span class="balance-stat__value">{balance.comparedTags}</span>
								<span class="balance-stat__label">Historical lines</span>
							</div>
						</div>
						{#if balance.categories.length > 0}
							<div class="balance-breakdown">
								{#each balance.categories.slice(0, 5) as row (row.category)}
									<div class="balance-breakdown__row">
										<span
											class="balance-breakdown__swatch"
											style="background: {colorForCategory(row.category)}"
										></span>
										<span class="balance-breakdown__name">{row.category}</span>
										<span class="balance-breakdown__metric">
											Δ {row.avgDelta.toFixed(2)} VP
										</span>
										<span class="balance-breakdown__round">
											30@{row.avgRoundTo30 == null ? '—' : row.avgRoundTo30.toFixed(1)}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<header class="lines-header">
						<span class="eyebrow">LINES</span>
						<div class="lines-header__actions">
							<div class="lines-header__btn-wrap" data-menu-keep-open>
								<button
									type="button"
									class="filter-btn"
									onclick={(e) => { e.stopPropagation(); categoriesMenuOpen = !categoriesMenuOpen; addPopoverOpen = false; }}
									aria-haspopup="menu"
									aria-expanded={categoriesMenuOpen}
								>
									<span>{categoryFilter ?? 'All'}</span>
									<span class="filter-btn__caret">▾</span>
								</button>
								{#if categoriesMenuOpen}
									<div class="filter-menu" role="menu">
										<button
											type="button"
											class="line-menu__item"
											onclick={() => { categoryFilter = null; categoriesMenuOpen = false; }}
										>
											<span class="line-menu__glyph">◯</span>
											<span>All</span>
										</button>
										{#each categoryList() as cat (cat)}
											<button
												type="button"
												class="line-menu__item"
												onclick={() => { categoryFilter = cat; categoriesMenuOpen = false; }}
											>
												<span class="line-menu__swatch" style="background: {colorForCategory(cat)}"></span>
												<span>{cat}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
							<div class="lines-header__btn-wrap" data-menu-keep-open>
								<button
									type="button"
									class="filter-btn filter-btn--add"
									onclick={(e) => { e.stopPropagation(); addPopoverOpen = !addPopoverOpen; categoriesMenuOpen = false; newTagError = null; }}
									aria-haspopup="menu"
									aria-expanded={addPopoverOpen}
								>+ Add</button>
								{#if addPopoverOpen}
									<div class="filter-menu filter-menu--add" role="menu" data-menu-keep-open>
										<input
											type="text"
											class="add-input"
											bind:value={newTagDraft}
											use:autofocusInput
											onkeydown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													void createNewTag().then(() => { if (!newTagError) addPopoverOpen = false; });
												} else if (e.key === 'Escape') {
													e.preventDefault();
													addPopoverOpen = false;
												}
											}}
											placeholder="Line name…"
											spellcheck="false"
											maxlength="64"
										/>
										<button
											type="button"
											class="line-menu__item"
											disabled={newTagBusy || !newTagDraft.trim()}
											onclick={async () => { await createNewTag(); if (!newTagError) addPopoverOpen = false; }}
										>
											<span class="line-menu__glyph">+</span>
											<span>{newTagBusy ? 'Adding…' : 'Add line'}</span>
										</button>
										{#if newTagError}
											<div class="error" style="padding: 4px 14px;">{newTagError}</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
						<div class="lines-header__visibility" data-menu-keep-open>
							<button
								type="button"
								class="filter-btn filter-btn--compact"
								onclick={hideAllLines}
								title="Hide every composition line"
							>Hide all</button>
							<button
								type="button"
								class="filter-btn filter-btn--compact"
								onclick={showAllLines}
								title="Show every composition line"
							>Show all</button>
						</div>
					</header>

				<datalist id="composition-categories-list">
					{#each categoryList() as cat}
						<option value={cat}></option>
					{/each}
				</datalist>

				<div class="line-list">
					<!-- Reference card removed; the chart shows a static bold
					     horizontal line at y = 30 instead. This non-clickable
					     marker just labels the chart for the sidebar reader. -->
					<div class="target-marker">
						<span class="target-swatch"></span>
						<span class="target-label">30 VP target</span>
					</div>

					{#each filteredTagsByCategory() as group (group.category ?? '__none__')}
						{@const catLabel = group.category ?? 'Uncategorized'}
						{@const catCount = group.tags.length}
						{@const catColor = group.category ? colorForCategory(group.category) : 'var(--color-mist)'}
						{@const showCatToggles = group.category != null && group.tags.length >= 2}
						<div class="cat-header">
							<span class="cat-swatch" style="background: {catColor}"></span>
							<span class="cat-label">{catLabel}</span>
							<span class="cat-count">{catCount}</span>
							{#if showCatToggles}
								{@const cat = group.category as string}
								{@const catIdealOn = isCategoryIdealVisible(cat)}
								{@const catActualOn = isCategoryActualVisible(cat)}
								<div class="line-card__viz-wrap" data-menu-keep-open>
									<button
										type="button"
										class="line-card__viz line-card__viz--ideal"
										class:off={!catIdealOn}
										style="--tag-color: {catColor}"
										onclick={(e) => { e.stopPropagation(); toggleCategoryIdealHidden(cat); }}
										title={catIdealOn ? `Hide ${cat} ideal avg` : `Show ${cat} ideal avg`}
										aria-pressed={catIdealOn}
									>I</button>
									<button
										type="button"
										class="line-card__viz line-card__viz--actual"
										class:off={!catActualOn}
										style="--tag-color: {catColor}"
										onclick={(e) => { e.stopPropagation(); toggleCategoryActualHidden(cat); }}
										title={catActualOn ? `Hide ${cat} historical avg` : `Show ${cat} historical avg`}
										aria-pressed={catActualOn}
									>A</button>
								</div>
							{/if}
						</div>

						{#each group.tags as tag (tag)}
							{@const color = colorForTag(tag)}
							{@const isActive = activeLine === tag}
							{@const sample = tagSampleByName[tag] ?? 0}
							<div
								class="line-card line-card--inline"
								class:active={isActive}
								style="--tag-color: {color}"
							>
								<div class="line-card__top">
									{#if isEditing('rename', tag)}
										<input
											type="text"
											class="rename-input"
											bind:value={renameDraft}
											onkeydown={(e) => handleRenameKeydown(e, tag)}
											use:autofocusInput
											placeholder={tag}
											spellcheck="false"
											maxlength="64"
											data-menu-keep-open
										/>
										<button
											type="button"
											class="line-card__icon"
											onclick={() => commitRename(tag)}
											disabled={renameBusy}
											title="Save (Enter)"
											data-menu-keep-open
										>
											{renameBusy ? '…' : '✓'}
										</button>
										<button
											type="button"
											class="line-card__icon"
											onclick={cancelEdit}
											disabled={renameBusy}
											title="Cancel (Esc)"
											data-menu-keep-open
										>
											✕
										</button>
									{:else}
										<button
											type="button"
											class="line-card__select"
											onclick={() => enterDetail(tag)}
											aria-pressed={isActive}
											title="Open detail view"
										>
											<span class="tag-swatch" style="background: {color}"></span>
											<span class="tag-name" title={tag}>{tag}</span>
											<span class="tag-badge" class:tag-badge--unassigned={sample === 0}>
												{sample === 0 ? '—' : `${sample}g`}
											</span>
										</button>
										{@const idealOn = isIdealVisible(tag)}
										{@const actualOn = isActualVisible(tag)}
										{@const hasIdeal = tagsWithIdeal.has(tag)}
											<div class="line-card__viz-wrap" data-menu-keep-open>
												<button
													type="button"
													class="line-card__viz line-card__viz--ideal"
													class:off={!idealOn}
													style="--tag-color: {color}"
													onclick={(e) => { e.stopPropagation(); if (hasIdeal) toggleIdealHidden(tag); }}
													title={hasIdeal
														? (idealOn ? 'Hide ideal' : 'Show ideal')
														: 'No ideal — use edit to create one'}
													aria-pressed={idealOn}
													disabled={!hasIdeal}
												>I</button>
												<button
													type="button"
													class="line-card__viz line-card__viz--actual"
												class:off={!actualOn}
												style="--tag-color: {color}"
												onclick={(e) => { e.stopPropagation(); toggleActualHidden(tag); }}
												title={actualOn ? 'Hide historical' : 'Show historical'}
													aria-pressed={actualOn}
													disabled={sample === 0}
												>A</button>
										</div>
										<div class="line-card__menu-wrap" data-menu-keep-open>
											<button
												type="button"
												class="line-card__icon"
												onclick={(e) => { e.stopPropagation(); openTagMenu(tag); }}
												title="More actions"
												aria-haspopup="menu"
												aria-expanded={openMenu === `tag:${tag}`}
											>
												⋮
											</button>
										</div>
									{/if}
								</div>
								{#if openMenu === `tag:${tag}`}
									<div class="line-menu" role="menu" data-menu-keep-open>
										<button
											type="button"
											class="line-menu__item"
											role="menuitem"
											onclick={() => startRename(tag)}
										>
											<span class="line-menu__glyph">✎</span>
											<span>Rename / merge…</span>
										</button>
										<button
											type="button"
											class="line-menu__item"
											role="menuitem"
											disabled={duplicateBusy === tag}
											onclick={() => duplicateTag(tag)}
										>
											<span class="line-menu__glyph">⧉</span>
											<span>{duplicateBusy === tag ? 'Duplicating…' : 'Duplicate'}</span>
										</button>
										<button
											type="button"
											class="line-menu__item"
											role="menuitem"
											onclick={() => { openMenu = null; startEdit({ kind: 'category', tag }); }}
										>
											<span class="line-menu__glyph">#</span>
											<span>{tagCategoryByName[tag] ? `Tag: ${tagCategoryByName[tag]}` : 'Set tag…'}</span>
										</button>
										{#if tagsWithIdeal.has(tag)}
											<button
												type="button"
												class="line-menu__item"
												role="menuitem"
												onclick={() => { openMenu = null; void editIdealCurveFor(tag); }}
											>
												<span class="line-menu__glyph">✎</span>
												<span>Edit line details</span>
											</button>
											<button
												type="button"
												class="line-menu__item"
												role="menuitem"
												onclick={() => { openMenu = null; void deleteIdealFor(tag); }}
											>
												<span class="line-menu__glyph">⌫</span>
												<span>Delete ideal curve</span>
											</button>
										{:else}
											<button
												type="button"
												class="line-menu__item"
												role="menuitem"
												onclick={() => { openMenu = null; void editIdealCurveFor(tag); }}
											>
												<span class="line-menu__glyph">✎</span>
												<span>Create ideal and edit line</span>
											</button>
										{/if}
										<button
											type="button"
											class="line-menu__item line-menu__item--danger"
											role="menuitem"
											disabled={deleteBusy === tag}
											onclick={() => deleteTag(tag)}
										>
											<span class="line-menu__glyph">🗑</span>
											<span>{deleteBusy === tag ? 'Deleting…' : 'Delete…'}</span>
										</button>
									</div>
								{/if}
								{#if isEditing('rename', tag) && renameError}
									<div class="error">{renameError}</div>
								{/if}
								{#if isEditing('category', tag)}
									<input
										type="text"
										class="cat-input"
										list="composition-categories-list"
										placeholder="Tag (category)…"
										use:autofocusInput
										value={tagCategoryByName[tag] ?? ''}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === 'Escape') {
												e.preventDefault();
												(e.currentTarget as HTMLInputElement).blur();
											}
										}}
										onblur={(e) => {
											const v = (e.currentTarget as HTMLInputElement).value.trim();
											const next = v.length > 0 ? v : null;
											if (next !== (tagCategoryByName[tag] ?? null)) {
												void saveCategoryFor(tag, next);
											}
											cancelEdit();
										}}
										maxlength="64"
										data-menu-keep-open
									/>
								{/if}
							</div>
						{/each}
					{/each}

					{#if tagNames.length === 0}
						<div class="empty">No composition lines yet. Hit "+ Add" to create one.</div>
					{:else if categoryFilter != null && filteredTagsByCategory().length === 0}
						<div class="empty">No lines tagged "{categoryFilter}". Pick another from the filter.</div>
					{/if}
				</div>
				{/if}
			</div>

			<!-- DRIFT · FINAL ROUND section removed per user request. The
			     `driftRows` derived stays around so it can be re-used later. -->
		</aside>
	</div>
</div>

<style>
	.app-shell {
		height: calc(100vh - var(--app-topbar-height, 72px));
		display: grid;
		/* Single row now (top header removed). Chart + sidebar fill the
		   entire viewport below the global topbar. */
		grid-template-rows: 1fr;
		gap: 12px;
		padding: 12px;
		background: var(--color-void);
		overflow: hidden;
		box-sizing: border-box;
	}

	.app-header {
		display: grid;
		grid-template-columns:
			minmax(200px, 1fr)
			minmax(240px, 1.3fr)
			minmax(240px, 1fr)
			minmax(260px, 1fr);
		gap: 12px;
		align-items: stretch;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 10px 16px;
	}

	.app-header__title,
	.app-header__editing,
	.app-header__tools,
	.app-header__view {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		min-width: 0;
	}

	.tool-btn--on {
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
		color: var(--color-void);
	}

	.tool-btn--on:hover {
		background: var(--brand-magenta-soft, #ff5dd1);
		border-color: var(--brand-magenta-soft, #ff5dd1);
		color: var(--color-void);
	}

	.app-header__title h1 {
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 2.4vw, 2.2rem);
		line-height: 0.95;
		color: var(--brand-magenta);
		margin: 0;
		letter-spacing: 0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.eyebrow,
	.field-label {
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.18em;
		color: var(--brand-cyan);
		text-transform: uppercase;
	}

	.field-label {
		color: var(--color-fog, #9a8fb8);
		display: block;
	}

	.editing-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.active-swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.active-name {
		font-family: var(--font-display);
		font-size: 1.4rem;
		color: var(--color-bone);
		text-transform: uppercase;
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.active-status {
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 600;
	}
	.status-saving { color: var(--brand-amber); }
	.status-saved  { color: var(--brand-teal); }
	.status-error  { color: var(--brand-coral); }
	.status-idle   { color: transparent; }

	.tools-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.tool-btn {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.12em;
		padding: 6px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		cursor: pointer;
	}

	.tool-btn:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}

	.error {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--brand-coral);
		margin-top: 4px;
	}

	.app-grid {
		display: grid;
		/* games-pane (collapsed strip 36px) | chart | side-pane */
		grid-template-columns: 36px minmax(0, 1fr) minmax(360px, 440px);
		gap: 12px;
		min-height: 0;
		height: 100%;
	}
	.app-grid.app-grid--games-open {
		grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(360px, 440px);
	}
	.app-grid.app-grid--scoreboard {
		grid-template-columns: 36px minmax(0, 1fr);
	}
	.app-grid.app-grid--scoreboard.app-grid--games-open {
		grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
	}
	.app-grid.app-grid--scoreboard .side-pane {
		display: none;
	}

	/* ============ View tabs (Curves / Scoreboard) ============ */
	.view-tabs {
		display: flex;
		gap: 4px;
		padding: 0 0 10px 0;
		flex-shrink: 0;
	}
	.view-tab {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 18px;
		background: transparent;
		border: 1px solid var(--color-mist);
		border-bottom: 2px solid transparent;
		color: var(--color-fog);
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 120ms ease,
			border-color 120ms ease,
			background 120ms ease;
	}
	.view-tab:hover {
		color: var(--color-bone);
		border-color: var(--color-bone);
	}
	.view-tab--active {
		color: var(--color-bone);
		border-color: var(--brand-magenta);
		border-bottom-color: var(--brand-magenta);
		background: color-mix(in srgb, var(--brand-magenta) 12%, transparent);
	}
	.view-tab__label {
		line-height: 1;
	}

	/* ============ Scoreboard table ============ */
	.chart-pane--scoreboard .chart-canvas-wrap,
	.chart-pane--scoreboard .chart-controls,
	.chart-pane--scoreboard .chart-hint {
		display: none;
	}
	.chart-pane--scoreboard {
		padding: 0;
	}
	.scoreboard {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		gap: 12px;
	}
	.scoreboard__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
		padding: 4px 4px 0;
		flex-shrink: 0;
	}
	.scoreboard__title h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		letter-spacing: 0.06em;
		color: var(--color-bone);
		text-transform: uppercase;
	}
	.scoreboard__title .eyebrow {
		display: block;
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.24em;
		color: var(--brand-cyan);
		text-transform: uppercase;
		margin-bottom: 2px;
	}
	.scoreboard__meta {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.76rem;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.scoreboard__chip {
		display: inline-block;
		padding: 2px 8px;
		border: 1px solid var(--color-mist);
		font-size: 0.7rem;
		color: var(--color-bone);
	}
	.scoreboard__empty {
		padding: 24px 4px;
		font-style: italic;
	}
	.scoreboard__scroll {
		overflow: auto;
		min-height: 0;
		flex: 1;
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
	}
	.scoreboard__table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.scoreboard__table thead {
		position: sticky;
		top: 0;
		background: var(--color-tomb);
		z-index: 1;
	}
	.sb-th {
		text-align: left;
		padding: 0;
		border-bottom: 1px solid var(--color-mist);
		font-family: var(--font-display);
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.sb-th button {
		width: 100%;
		text-align: inherit;
		background: transparent;
		border: 0;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		padding: 10px 12px;
		cursor: pointer;
	}
	.sb-th button:hover {
		color: var(--color-bone);
	}
	.sb-th--num {
		text-align: right;
	}
	.sb-th--num button {
		text-align: right;
	}
	.sb-th--spark {
		text-align: center;
		padding: 10px 12px;
	}
	.sb-row {
		border-bottom: 1px solid color-mix(in srgb, var(--color-mist) 50%, transparent);
		transition: background 120ms ease;
	}
	.sb-row:hover {
		background: color-mix(in srgb, var(--color-mist) 18%, transparent);
	}
	.sb-td {
		padding: 8px 12px;
		color: var(--color-bone);
		vertical-align: middle;
	}
	.sb-td--num {
		text-align: right;
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.sb-td--tag {
		min-width: 200px;
	}
	.sb-td--spark {
		text-align: center;
		width: 1%;
		white-space: nowrap;
	}
	.sb-tag {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: transparent;
		border: 0;
		padding: 2px 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.sb-tag:hover .sb-tag__name {
		color: var(--brand-magenta);
		text-decoration: underline;
	}
	.sb-tag__swatch {
		width: 12px;
		height: 12px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.sb-tag__name {
		font-weight: 600;
		color: var(--color-bone);
	}
	.sb-tag__cat {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		padding: 1px 6px;
		border: 1px solid var(--color-mist);
		color: var(--color-fog);
		text-transform: lowercase;
		letter-spacing: 0.04em;
	}
	.sb-sub {
		display: inline-block;
		margin-left: 6px;
		color: var(--color-fog);
		font-size: 0.72rem;
	}
	.sb-sd {
		display: inline-block;
		margin-left: 4px;
		color: var(--color-fog);
		font-size: 0.7rem;
		opacity: 0.85;
	}
	.sb-dash {
		color: var(--color-fog);
		opacity: 0.6;
	}
	.sb-spark {
		display: block;
	}

	/* ============ Box plot ============ */
	.boxplot {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		gap: 12px;
	}
	.boxplot__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
		padding: 4px 4px 0;
		flex-shrink: 0;
	}
	.boxplot__title h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		letter-spacing: 0.06em;
		color: var(--color-bone);
		text-transform: uppercase;
	}
	.boxplot__title .eyebrow {
		display: block;
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.24em;
		color: var(--brand-cyan);
		text-transform: uppercase;
		margin-bottom: 2px;
	}
	.boxplot__legend {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 12px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.72rem;
	}
	.boxplot__empty {
		padding: 24px 4px;
		font-style: italic;
	}
	.boxplot__canvas-wrap {
		position: relative;
		overflow: auto;
		min-height: 0;
		flex: 1;
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
		padding: 12px;
	}
	.boxplot__canvas-wrap canvas {
		display: block;
		width: 100% !important;
	}

	/* ============ Games-include left popout sidebar ============ */
	.games-pane {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
	.games-pane--collapsed {
		padding: 0;
	}
	.games-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px 8px;
		border-bottom: 1px solid var(--color-mist);
	}
	.games-eyebrow {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-cyan);
		line-height: 1;
	}
	.games-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px 8px;
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: var(--color-fog);
		background: transparent;
		border: 1px solid var(--color-mist);
		cursor: pointer;
		line-height: 1;
		transition: color 140ms, border-color 140ms;
	}
	.games-toggle:hover {
		color: var(--color-bone);
		border-color: var(--brand-magenta-soft);
	}
	.games-toggle--strip {
		flex-direction: column;
		gap: 8px;
		width: 100%;
		height: 100%;
		border: 0;
		padding: 8px 4px;
		writing-mode: vertical-rl;
		text-orientation: mixed;
	}
	.games-toggle--strip .games-toggle-arrow {
		font-family: inherit;
		writing-mode: horizontal-tb;
		font-size: 0.85rem;
		color: var(--brand-cyan);
	}
	.games-toggle--strip .games-toggle-label {
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.18em;
		color: var(--color-bone);
		text-transform: uppercase;
	}
	.games-toggle--strip .games-toggle-badge {
		writing-mode: horizontal-tb;
		font-family: var(--font-display);
		font-size: 0.7rem;
		color: var(--color-void);
		background: var(--brand-magenta);
		padding: 2px 6px;
		border-radius: 999px;
		min-width: 18px;
		text-align: center;
	}

	.games-status {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px;
		font-size: 0.78rem;
		color: var(--color-fog);
	}
	.games-status-line strong {
		color: var(--color-bone);
		font-family: var(--font-display);
	}
	.games-clear {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--brand-magenta-soft);
		background: transparent;
		border: 0;
		cursor: pointer;
		padding: 2px 4px;
	}
	.games-clear:hover { color: var(--color-bone); }

	.games-search {
		margin: 0 12px 8px;
		padding: 5px 8px;
		font-family: inherit;
		font-size: 0.8rem;
		color: var(--color-bone);
		background: var(--color-void);
		border: 1px solid var(--color-mist);
	}
	.games-search:focus {
		outline: none;
		border-color: var(--brand-magenta-soft);
	}

	.games-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0 6px 8px;
		min-height: 0;
		overflow-y: auto;
	}
	.game-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		text-align: left;
		background: transparent;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
		color: inherit;
		font: inherit;
		transition: background 140ms, color 140ms;
	}
	.game-row:hover { background: rgba(255, 255, 255, 0.04); }
	.game-row--on {
		background: rgba(255, 43, 199, 0.1);
		color: var(--color-bone);
	}
	.game-row--on:hover { background: rgba(255, 43, 199, 0.18); }

	.game-checkbox {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-size: 0.85rem;
		line-height: 1;
		color: var(--brand-magenta);
		border: 1px solid var(--color-mist);
		border-radius: 3px;
	}
	.game-row--on .game-checkbox {
		border-color: var(--brand-magenta);
		background: var(--brand-magenta);
		color: var(--color-void);
	}
	.game-row--implicit .game-checkbox {
		color: var(--color-fog);
	}

	.game-row-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.game-row-label {
		font-size: 0.85rem;
		color: var(--color-bone);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.game-row-meta {
		font-size: 0.7rem;
		color: var(--color-fog);
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.games-empty {
		font-size: 0.8rem;
		color: var(--color-fog);
		padding: 8px 12px;
		font-style: italic;
	}

	.chart-pane {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 16px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		gap: 8px;
	}

	.chart-canvas-wrap {
		flex: 1;
		position: relative;
		min-height: 0;
		min-width: 0;
	}

	/* Marquee rectangle drawn over the canvas while the user drags from
	   empty space. Pointer-events stay on the canvas. */
	.marquee {
		position: absolute;
		pointer-events: none;
		border: 1.5px dashed var(--brand-magenta);
		background: rgba(255, 43, 199, 0.12);
		z-index: 2;
	}

	.selection-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px 4px 10px;
		background: var(--brand-magenta);
		color: var(--color-void);
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		z-index: 3;
	}

	.selection-clear {
		background: transparent;
		border: none;
		color: var(--color-void);
		font: inherit;
		cursor: pointer;
		padding: 0 2px;
		font-size: 0.95rem;
		line-height: 1;
	}

	.selection-clear:hover {
		color: var(--color-bone);
	}

	canvas {
		width: 100% !important;
		height: 100% !important;
		touch-action: none;
	}

	.chart-hint {
		font-family: var(--font-body);
		font-size: 0.8rem;
		color: var(--color-fog, #9a8fb8);
		text-align: center;
	}

	.chart-hint__focus {
		display: inline-block;
		margin-left: 8px;
		color: var(--brand-magenta);
	}

	.side-pane {
		display: grid;
		grid-template-rows: 1fr;
		gap: 12px;
		min-height: 0;
		min-width: 0;
		height: 100%;
	}

	.side-section {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
		height: 100%;
		box-sizing: border-box;
	}

	.side-section--scroll {
		overflow: hidden;
	}

	.side-section--drift {
		max-height: 38vh;
	}

	.side-section__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.muted {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--color-fog, #9a8fb8);
	}

	/* New tag definition row */
	.new-tag-row {
		display: flex;
		gap: 6px;
	}

	.new-tag-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		padding: 6px 10px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		border-radius: 0;
	}

	.new-tag-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	.btn-compact {
		font-size: 0.78rem !important;
		padding: 6px 12px !important;
		letter-spacing: 0.14em;
	}

	/* ===== Static "30 VP target" marker in sidebar ===== */
	.target-marker {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		background: var(--color-shadow);
		border: 1px dashed var(--color-mist);
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fog, #9a8fb8);
	}

	.target-swatch {
		display: inline-block;
		width: 22px;
		height: 4px;
		background: var(--brand-amber);
		flex-shrink: 0;
	}

	.target-label {
		flex: 1;
	}

	/* ===== Lines list header (eyebrow + filter + add) ===== */
	.lines-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 4px;
	}

	.chart-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
	}
	.smoothing-label {
		font-family: var(--font-display);
		font-size: 0.65rem;
		letter-spacing: 0.18em;
		color: var(--color-fog);
		text-transform: uppercase;
	}
	.smoothing-range {
		flex: 1;
		min-width: 0;
		accent-color: var(--brand-magenta);
		cursor: pointer;
	}
	.smoothing-value {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.72rem;
		color: var(--color-bone);
		min-width: 2.4em;
		text-align: right;
	}

	.normalize-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 9px;
		background: transparent;
		border: 1px solid var(--color-mist);
		color: var(--color-fog);
		font-family: var(--font-display);
		font-size: 0.65rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 120ms ease,
			border-color 120ms ease,
			background 120ms ease;
	}
	.normalize-toggle:hover {
		color: var(--color-bone);
		border-color: var(--color-bone);
	}
	.normalize-toggle.on {
		color: var(--color-bone);
		border-color: var(--brand-magenta);
		background: color-mix(in srgb, var(--brand-magenta) 14%, transparent);
	}
	.normalize-toggle__state {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		color: var(--color-fog);
	}
	.normalize-toggle.on .normalize-toggle__state {
		color: var(--brand-magenta);
	}
	.chart-controls__sep {
		width: 1px;
		height: 18px;
		background: var(--color-mist);
		opacity: 0.6;
	}

	.lines-header__actions {
		display: flex;
		gap: 6px;
	}

	.lines-header__visibility {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
	}

	.lines-header__btn-wrap {
		position: relative;
	}

	.balance-card {
		margin: 0 0 10px;
		padding: 10px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-left: 3px solid var(--grade-color, var(--brand-cyan));
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.025);
	}

	.balance-card__top {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
	}

	.balance-card--empty {
		--grade-color: var(--color-mist);
		opacity: 0.8;
	}

	.balance-card__grade {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 900;
		line-height: 1;
		color: var(--color-void);
		background: var(--grade-color, var(--brand-cyan));
		border: 1px solid var(--grade-color, var(--brand-cyan));
		box-shadow: 0 0 16px color-mix(in srgb, var(--grade-color, var(--brand-cyan)) 22%, transparent);
	}

	.balance-card__grade.grade-A { --grade-color: #20e0c1; }
	.balance-card__grade.grade-B { --grade-color: #6be3ff; }
	.balance-card__grade.grade-C { --grade-color: #ffba3d; }
	.balance-card__grade.grade-D { --grade-color: #ff704d; }
	.balance-card__grade.grade-none {
		--grade-color: var(--color-mist);
		color: var(--color-fog);
		background: var(--color-shadow);
		box-shadow: none;
	}

	.balance-card--grade-A { --grade-color: #20e0c1; }
	.balance-card--grade-B { --grade-color: #6be3ff; }
	.balance-card--grade-C { --grade-color: #ffba3d; }
	.balance-card--grade-D { --grade-color: #ff704d; }

	.balance-card__body {
		min-width: 0;
	}

	.balance-card__label {
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}

	.balance-card__scope,
	.balance-card__meta {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.balance-card__scope {
		margin-top: 2px;
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-bone);
		white-space: nowrap;
	}

	.balance-card__meta {
		margin-top: 3px;
		font-size: 0.72rem;
		line-height: 1.25;
		color: var(--color-fog);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.balance-card__stats {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 6px;
		margin-top: 10px;
	}

	.balance-stat {
		min-width: 0;
		padding: 7px 8px 6px;
		background: var(--color-void);
		border: 1px solid var(--color-mist);
	}

	.balance-stat__value,
	.balance-stat__label {
		display: block;
	}

	.balance-stat__value {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 900;
		color: var(--grade-color, var(--color-bone));
	}

	.balance-stat__label {
		margin-top: 1px;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fog);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.balance-breakdown {
		display: grid;
		gap: 0;
		margin-top: 10px;
		border-top: 1px solid var(--color-mist);
	}

	.balance-breakdown__row {
		display: grid;
		grid-template-columns: 10px minmax(0, 1fr);
		gap: 7px;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid color-mix(in srgb, var(--color-mist) 55%, transparent);
		font-size: 0.68rem;
		color: var(--color-fog);
	}

	.balance-breakdown__swatch {
		width: 10px;
		height: 10px;
		grid-row: 1 / span 2;
	}

	.balance-breakdown__name {
		grid-column: 2;
		grid-row: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-display);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-bone);
	}

	.balance-breakdown__metric {
		grid-column: 2;
		grid-row: 2;
		font-family: var(--font-mono);
		color: var(--brand-amber-soft);
		font-variant-numeric: tabular-nums;
	}

	.balance-breakdown__round {
		grid-column: 2;
		grid-row: 2;
		justify-self: end;
		font-family: var(--font-mono);
		color: var(--brand-cyan-soft);
		font-variant-numeric: tabular-nums;
	}

	.filter-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		cursor: pointer;
	}

	.filter-btn:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}

	.filter-btn--add {
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
		color: var(--color-void);
	}

	.filter-btn--add:hover {
		background: var(--brand-magenta-soft, #ff5dd1);
		border-color: var(--brand-magenta-soft, #ff5dd1);
		color: var(--color-void);
	}

	.filter-btn--compact {
		justify-content: center;
		padding-inline: 8px;
		font-size: 0.72rem;
		width: 100%;
	}

	.filter-btn__caret {
		font-size: 0.65rem;
		opacity: 0.7;
	}

	.filter-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 10;
		min-width: 200px;
		background: var(--color-crypt);
		border: 1px solid var(--brand-magenta);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		display: flex;
		flex-direction: column;
		padding: 4px 0;
	}

	.filter-menu--add {
		padding: 8px;
		gap: 6px;
	}

	.line-menu__swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		flex-shrink: 0;
	}

	.add-input {
		font-family: var(--font-mono);
		font-size: 0.88rem;
		padding: 6px 8px;
		background: var(--color-void);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		border-radius: 0;
	}

	.add-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	/* ===== Detail view ===== */
	.detail-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--color-mist);
		margin-bottom: 4px;
	}

	.detail-back {
		width: 30px;
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		font-size: 1rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.detail-back:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}

	.tag-swatch--lg {
		width: 18px;
		height: 18px;
	}

	.detail-title {
		flex: 1;
		min-width: 0;
		font-family: var(--font-display);
		font-size: 1.2rem;
		color: var(--color-bone);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.detail-meta {
		display: flex;
		gap: 12px;
		padding-bottom: 6px;
		font-family: var(--font-body);
		font-size: 0.8rem;
	}

	.detail-meta strong {
		color: var(--brand-cyan);
		font-weight: 600;
	}

	.ideal-editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		background: color-mix(in srgb, var(--tag-color) 8%, var(--color-shadow));
		border: 1px solid var(--color-mist);
		border-left: 3px dashed var(--tag-color);
	}

	.ideal-editor__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.ideal-editor__status {
		display: inline-block;
		margin-left: 8px;
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 600;
	}

	.ideal-editor__tools {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.ideal-editor__tools .tool-btn {
		width: 100%;
		padding-inline: 8px;
	}

	.instance-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-y: auto;
		min-height: 0;
		flex: 1 1 auto;
		padding-right: 4px;
	}

	.instance-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}

	.instance-card:hover {
		background: var(--color-crypt);
	}

	.instance-card.active {
		background: color-mix(in srgb, var(--brand-magenta) 14%, var(--color-shadow));
		border-color: var(--brand-magenta);
		box-shadow: inset 0 0 0 1px var(--brand-magenta);
	}

	.instance-swatch {
		width: 14px;
		height: 14px;
		display: inline-block;
		flex-shrink: 0;
	}

	.instance-swatch--avg {
		background: repeating-linear-gradient(
			135deg,
			var(--brand-magenta) 0 4px,
			transparent 4px 7px
		);
		border: 1px solid var(--brand-magenta);
	}

	.instance-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}

	.instance-label {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--color-bone);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.instance-meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fog, #9a8fb8);
	}

	.line-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-y: auto;
		padding-right: 4px;
		padding-bottom: 180px;
		min-height: 0;
		flex: 1 1 auto;
	}

	.line-list::-webkit-scrollbar,
	.drift-table-wrap::-webkit-scrollbar {
		width: 8px;
	}
	.line-list::-webkit-scrollbar-thumb,
	.drift-table-wrap::-webkit-scrollbar-thumb {
		background: var(--color-mist);
	}
	.line-list::-webkit-scrollbar-thumb:hover,
	.drift-table-wrap::-webkit-scrollbar-thumb:hover {
		background: var(--brand-magenta);
	}

	.line-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-left: 3px solid var(--tag-color);
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
		transition: background 120ms ease, border-color 120ms ease;
	}

	.line-card:hover {
		background: var(--color-crypt);
	}

	.line-card.active {
		background: color-mix(in srgb, var(--tag-color) 12%, var(--color-shadow));
		border-color: var(--tag-color);
		box-shadow: inset 0 0 0 1px var(--tag-color);
	}

	.line-card--inline {
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		padding: 8px 10px;
		cursor: default;
	}

	.line-card__select {
		display: flex;
		align-items: center;
		gap: 8px;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
		min-width: 0;
	}

	.line-card__select:hover .tag-name {
		color: var(--tag-color);
	}

	.line-card__top {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.line-card__select {
		flex: 1;
		min-width: 0;
	}

	.line-card__icon {
		flex-shrink: 0;
		width: 26px;
		height: 26px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-void);
		border: 1px solid var(--color-mist);
		color: var(--color-parchment, #d8cfee);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0;
	}

	.line-card__icon:hover:not(:disabled) {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}

	.line-card__icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.rename-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.92rem;
		padding: 5px 8px;
		background: var(--color-void);
		border: 1px solid var(--brand-magenta);
		color: var(--color-bone);
		border-radius: 0;
	}

	.rename-input:focus {
		outline: none;
	}

	.line-card__menu-wrap {
		position: relative;
		flex-shrink: 0;
	}

	/* Per-line ideal/actual visibility toggles. Filled with the tag color
	   when on; outlined dim when off. Dashed border for "I" mirrors the
	   chart's dashed ideal lines, solid border for "A" mirrors actuals. */
	.line-card__viz-wrap {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.line-card__viz {
		width: 22px;
		height: 22px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: bold;
		background: var(--tag-color);
		color: var(--color-void);
		border: 1px solid var(--tag-color);
		cursor: pointer;
		padding: 0;
		line-height: 1;
		letter-spacing: 0;
	}

	.line-card__viz--ideal {
		border-style: dashed;
	}

	.line-card__viz.off {
		background: transparent;
		color: var(--color-fog, #9a8fb8);
		border-color: var(--color-mist);
	}

	.line-card__viz:hover:not(:disabled) {
		filter: brightness(1.15);
	}

	.line-card__viz.off:hover:not(:disabled) {
		filter: none;
		border-color: var(--tag-color);
		color: var(--color-bone);
	}

	.line-card__viz:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.line-menu {
		width: 100%;
		background: var(--color-crypt);
		border: 1px solid var(--brand-magenta);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		display: flex;
		flex-direction: column;
		padding: 4px 0;
		box-sizing: border-box;
	}

	.line-menu__item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		background: none;
		border: none;
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 0.88rem;
		text-align: left;
		cursor: pointer;
		width: 100%;
	}

	.line-menu__item:hover:not(:disabled) {
		background: color-mix(in srgb, var(--brand-magenta) 18%, transparent);
		color: var(--brand-magenta);
	}

	.line-menu__item--danger {
		color: var(--brand-coral);
	}

	.line-menu__item--danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--brand-coral) 18%, transparent);
		color: var(--brand-coral);
	}

	.line-menu__item--danger .line-menu__glyph {
		color: var(--brand-coral);
	}

	.line-menu__item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.line-menu__glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		font-size: 0.95rem;
		color: var(--color-fog, #9a8fb8);
	}

	.line-menu__item:hover:not(:disabled) .line-menu__glyph {
		color: var(--brand-magenta);
	}

	.cat-input {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 4px 8px;
		background: var(--color-void);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		border-radius: 0;
	}

	.cat-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	.cat-input::placeholder {
		color: var(--color-fog, #9a8fb8);
		font-style: italic;
	}

	.cat-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		margin-top: 4px;
		border-bottom: 1px dashed var(--color-mist);
	}

	.cat-header:first-of-type {
		margin-top: 0;
	}

	.cat-swatch {
		width: 10px;
		height: 10px;
		display: inline-block;
		flex-shrink: 0;
	}

	.cat-label {
		flex: 1;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		color: var(--color-fog, #9a8fb8);
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cat-count {
		font-family: var(--font-display);
		font-size: 0.72rem;
		color: var(--color-parchment, #d8cfee);
		padding: 1px 6px;
		border: 1px solid var(--color-mist);
		flex-shrink: 0;
	}

	.tag-swatch {
		width: 12px;
		height: 12px;
		display: inline-block;
		flex-shrink: 0;
	}

	.tag-name {
		flex: 1;
		min-width: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--color-bone);
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-badge {
		font-family: var(--font-display);
		font-size: 0.72rem;
		padding: 1px 6px;
		border: 1px solid var(--color-mist);
		color: var(--color-parchment, #d8cfee);
		letter-spacing: 0.1em;
		flex-shrink: 0;
	}

	.tag-badge--unassigned {
		color: var(--color-fog, #9a8fb8);
		font-style: italic;
	}

	.empty {
		padding: 16px;
		text-align: center;
		color: var(--color-fog, #9a8fb8);
		font-family: var(--font-body);
		font-size: 0.85rem;
		border: 1px dashed var(--color-mist);
	}

	.drift-table-wrap {
		overflow-y: auto;
		min-height: 0;
		flex: 1;
	}

	.drift-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-body);
	}

	.drift-table thead {
		background: var(--brand-magenta);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.drift-table th {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-void);
		padding: 6px 8px;
		text-align: left;
	}

	.drift-table th.col-num,
	.drift-table td.col-num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.drift-table tbody tr {
		border-top: 1px solid var(--color-mist);
	}
	.drift-table tbody tr:nth-child(even) {
		background: rgba(255, 255, 255, 0.02);
	}

	.drift-table td {
		padding: 6px 8px;
		color: var(--color-parchment, #d8cfee);
		font-size: 0.85rem;
	}

	.drift-table td.col-tag {
		font-family: var(--font-display);
		font-size: 0.92rem;
		letter-spacing: 0.04em;
		color: var(--color-bone);
		text-transform: uppercase;
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.drift-table td.delta {
		font-family: var(--font-display);
		font-size: 1.1rem;
		line-height: 1;
		color: var(--color-bone);
	}

	.drift-table td.delta.on-target { color: var(--brand-teal); }
	.drift-table td.delta.over      { color: var(--brand-amber); }
	.drift-table td.delta.under     { color: var(--brand-coral); }

	@media (max-width: 900px) {
		.app-shell {
			height: auto;
			min-height: calc(100vh - var(--app-topbar-height, 72px));
			overflow: visible;
		}
		.app-header {
			grid-template-columns: 1fr;
		}
		.app-grid {
			grid-template-columns: 1fr;
		}
		.chart-pane {
			height: 60vh;
		}
		.side-section--drift {
			max-height: none;
		}
	}
</style>
