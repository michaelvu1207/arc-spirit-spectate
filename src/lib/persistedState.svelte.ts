// Generic localStorage-backed reactive state for Svelte 5.
// Versioned to support clean migration when shape changes.

export interface PersistedState<T> {
	value: T;
	reset(): void;
}

interface PersistOptions<T> {
	version?: number;
	serialize?: (v: T) => string;
	deserialize?: (raw: string) => T;
}

const VERSION_DELIMITER = '::v';

function readRaw(key: string, version: number): string | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;
		const idx = raw.indexOf(VERSION_DELIMITER);
		if (idx < 0) return null;
		const storedVersion = Number(raw.slice(idx + VERSION_DELIMITER.length));
		if (storedVersion !== version) return null;
		return raw.slice(0, idx);
	} catch {
		return null;
	}
}

function writeRaw(key: string, payload: string, version: number): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(key, `${payload}${VERSION_DELIMITER}${version}`);
	} catch {
		// quota / private mode — ignore
	}
}

export function persistedState<T>(
	key: string,
	initial: T,
	options: PersistOptions<T> = {}
): PersistedState<T> {
	const version = options.version ?? 1;
	const serialize = options.serialize ?? JSON.stringify;
	const deserialize = options.deserialize ?? (JSON.parse as (raw: string) => T);

	let initialValue = initial;
	const raw = readRaw(key, version);
	if (raw !== null) {
		try {
			initialValue = deserialize(raw);
		} catch {
			initialValue = initial;
		}
	}

	const state = $state({ current: initialValue });

	return {
		get value() {
			return state.current;
		},
		set value(next: T) {
			state.current = next;
			writeRaw(key, serialize(next), version);
		},
		reset() {
			state.current = initial;
			writeRaw(key, serialize(initial), version);
		}
	};
}

// Helpers for non-JSON-native types.
export const setSerializer = {
	serialize: (s: Set<string>) => JSON.stringify(Array.from(s)),
	deserialize: (raw: string): Set<string> => {
		const arr = JSON.parse(raw);
		return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : []);
	}
};
