// Shared state for the /admin/composition-analysis sub-routes.
// Public interface only — no direct $state access from sub-routes (per design
// finding 1.2-A — typed contract for store access).

import { persistedState, setSerializer } from '$lib/persistedState.svelte';

const KEY_SELECTED_GAMES = 'compositionAnalysis.selectedGameIds';
const KEY_SIDEBAR_OPEN = 'compositionAnalysis.sidebarOpen';
const KEY_SHOW_REFERENCE = 'compositionAnalysis.showReference';
const KEY_SHOW_ARCHIVED = 'compositionAnalysis.showArchived';

const STORE_VERSION = 2;

const selected = persistedState<Set<string>>(KEY_SELECTED_GAMES, new Set(), {
	version: STORE_VERSION,
	...setSerializer
});

const sidebarOpen = persistedState<boolean>(KEY_SIDEBAR_OPEN, true, { version: STORE_VERSION });
const showReference = persistedState<boolean>(KEY_SHOW_REFERENCE, false, { version: STORE_VERSION });
const showArchived = persistedState<boolean>(KEY_SHOW_ARCHIVED, false, { version: STORE_VERSION });

export const compositionAnalysisStore = {
	get selectedGameIds(): ReadonlySet<string> {
		return selected.value;
	},

	get gameFilterActive(): boolean {
		return selected.value.size > 0;
	},

	isGameSelected(gameId: string): boolean {
		return selected.value.has(gameId);
	},

	toggleGame(gameId: string): void {
		const next = new Set(selected.value);
		if (next.has(gameId)) next.delete(gameId);
		else next.add(gameId);
		selected.value = next;
	},

	selectGame(gameId: string): void {
		const next = new Set(selected.value);
		next.add(gameId);
		selected.value = next;
	},

	deselectGame(gameId: string): void {
		const next = new Set(selected.value);
		next.delete(gameId);
		selected.value = next;
	},

	clearSelection(): void {
		selected.value = new Set();
	},

	setSelection(ids: Iterable<string>): void {
		selected.value = new Set(ids);
	},

	get sidebarOpen(): boolean {
		return sidebarOpen.value;
	},

	setSidebarOpen(v: boolean): void {
		sidebarOpen.value = v;
	},

	toggleSidebar(): void {
		sidebarOpen.value = !sidebarOpen.value;
	},

	get showReference(): boolean {
		return showReference.value;
	},

	setShowReference(v: boolean): void {
		showReference.value = v;
	},

	get showArchived(): boolean {
		return showArchived.value;
	},

	setShowArchived(v: boolean): void {
		showArchived.value = v;
	}
};
