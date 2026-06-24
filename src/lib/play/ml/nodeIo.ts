/**
 * Node-only IO helpers for the ML pipeline. Imported ONLY by the `_*.test.ts` runners
 * (which execute under vitest/node), never by the SvelteKit app — so the `node:fs`
 * import never reaches the client bundle.
 *
 *   - loadOrSnapshotCatalog(): freeze the live Supabase catalog to ml/catalog.json once,
 *     then load it from disk on every subsequent run (offline, deterministic, portable).
 *   - JSONL sample writer + meta writer for the training data.
 *   - weights loader for neural self-play / evaluation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadPlayCatalog } from '../server/catalog';
import type { PlayCatalog } from '../types';
import { OBS_DIM, ACT_DIM } from './encode';
import { loadPolicyWeights, type NeuralPolicy } from './net';
import type { Sample } from './driver';

/** Repo-root-relative path (vitest runs with cwd = repo root). */
export function mlPath(...parts: string[]): string {
	return resolve(process.cwd(), 'ml', ...parts);
}

function ensureDir(file: string): void {
	mkdirSync(dirname(file), { recursive: true });
}

/**
 * Load the frozen catalog from ml/catalog.json, snapshotting it from Supabase on first
 * use (or when `force`). This is the Phase-1 "freeze the catalog" deliverable: training
 * never depends on the network after the first snapshot.
 */
export async function loadOrSnapshotCatalog(force = false): Promise<PlayCatalog> {
	const file = mlPath('catalog.json');
	if (!force && existsSync(file)) {
		return JSON.parse(readFileSync(file, 'utf8')) as PlayCatalog;
	}
	const catalog = await loadPlayCatalog();
	ensureDir(file);
	writeFileSync(file, JSON.stringify(catalog));
	return catalog;
}

/** Append samples to a JSONL shard (one decision per line). */
export function appendSamples(file: string, samples: Sample[], iter = 0): void {
	if (samples.length === 0) return;
	ensureDir(file);
	const lines = samples
		.map((s) => JSON.stringify({ obs: round4(s.obs), cands: s.cands.map(round4), chosen: s.chosen, ret: r4(s.ret), iter }))
		.join('\n');
	appendFileSync(file, lines + '\n');
}

/** Truncate floats to 4 decimals to shrink JSONL ~3x with no learning impact. */
function r4(x: number): number {
	return Math.round(x * 1e4) / 1e4;
}
function round4(a: number[]): number[] {
	return a.map(r4);
}

export function writeMeta(samples: number, games: number, extra: Record<string, unknown> = {}): void {
	const file = mlPath('data', 'meta.json');
	ensureDir(file);
	writeFileSync(file, JSON.stringify({ obs_dim: OBS_DIM, act_dim: ACT_DIM, samples, games, ...extra }, null, 2));
}

/** Load an exported policy weights file (ml/weights/policy.json), or null if absent. */
export function loadWeightsIfPresent(file = mlPath('weights', 'policy.json')): NeuralPolicy | null {
	if (!existsSync(file)) return null;
	return loadPolicyWeights(JSON.parse(readFileSync(file, 'utf8')));
}
