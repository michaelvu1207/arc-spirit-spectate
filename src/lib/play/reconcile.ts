/**
 * Deep, identity-preserving reconcile of a fresh value into an existing one.
 *
 * Why: the play store receives a FULL room projection on every revision (the DB
 * only broadcasts `{revision}`, we refetch the whole `/view`). Assigning it
 * wholesale (`room = next`) swaps the top-level reference, so Svelte 5's deep
 * `$state` proxy invalidates EVERY reader — a phase tick re-renders the trait
 * tracker, the board, every player panel, etc.
 *
 * `reconcile` instead walks the new value and mutates the existing reactive
 * object IN PLACE, only writing the leaves that actually changed. Unchanged
 * subtrees keep their object/array identity, so Svelte only invalidates the
 * handful of properties that moved — fine-grained updates from a full refetch,
 * no server-side patch protocol required.
 *
 * The data is plain JSON (no Date/Map/Set/class instances), so structural
 * recursion over arrays + plain objects is sufficient.
 *
 * Returns the value to store at the parent slot: the same `target` reference
 * when it could be mutated in place, otherwise `source` (primitive change or a
 * shape change such as object↔array↔primitive).
 */
export function reconcile<T>(target: unknown, source: T): T {
	// Primitives (and null/undefined): nothing to merge — the parent compares and
	// only writes when the value actually differs.
	if (source === null || typeof source !== 'object') {
		return source;
	}

	if (Array.isArray(source)) {
		if (!Array.isArray(target)) {
			// Shape change → replace wholesale.
			return source;
		}
		const arr = target as unknown[];
		if (arr.length !== source.length) {
			arr.length = source.length;
		}
		for (let i = 0; i < source.length; i++) {
			const next = reconcile(arr[i], source[i]);
			if (next !== arr[i]) arr[i] = next;
		}
		return arr as unknown as T;
	}

	// Plain object. If the target isn't a mergeable plain object, replace.
	if (target === null || typeof target !== 'object' || Array.isArray(target)) {
		return source;
	}

	const tgt = target as Record<string, unknown>;
	const src = source as Record<string, unknown>;

	// Drop keys that no longer exist so removals propagate.
	for (const key of Object.keys(tgt)) {
		if (!(key in src)) delete tgt[key];
	}
	// Merge / add keys present in the source.
	for (const key of Object.keys(src)) {
		const next = reconcile(tgt[key], src[key]);
		if (next !== tgt[key]) tgt[key] = next;
	}
	return tgt as unknown as T;
}
