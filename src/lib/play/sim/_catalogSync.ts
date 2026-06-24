/**
 * Synchronous offline catalog load from the frozen ml/catalog.json, for tests that run in the
 * normal (offline) suite (e.g. the parity gate). Node-only; imported by *.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlayCatalog } from '../types';

export function catalogPath(): string {
	return resolve(process.cwd(), 'ml', 'catalog.json');
}

export function hasCatalog(): boolean {
	return existsSync(catalogPath());
}

export function loadPlayCatalogSync(): PlayCatalog {
	return JSON.parse(readFileSync(catalogPath(), 'utf8')) as PlayCatalog;
}
