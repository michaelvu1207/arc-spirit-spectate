import { describe, it, expect } from 'vitest';
import { ability, decisions } from './deepSeaHunter';
import { fire, ctxFor, makePlayer } from './testHelpers';

/**
 * Deep Sea Hunter — DB intent: "On Navigation Reveal, you may change your
 * destination. Gain 4 Initiative."
 *
 * Encoding: a single declarative `onNavigate` breakpoint that fires two actions —
 *   1. `gainInitiative 4`  → +4 initiative + "Gained 4 initiative." log
 *   2. `choose deepSeaHunterRedirect` → an opt-in decision card (the "may change
 *      destination" part) with a "Keep" option plus one option per location.
 *
 * UX channels: a passive number (initiative) AND a decision card. The colocated
 * `deepSeaHunterRedirect` resolver actually moves the player when a destination
 * option is picked and rebuilds `locationOccupancy` so co-location stays correct.
 */
describe('Deep Sea Hunter (onNavigate → +4 initiative + change-destination decision)', () => {
	it('grants exactly +4 initiative on navigate', () => {
		const { player } = fire({ 'Deep Sea Hunter': 1 }, 'onNavigate');
		expect(player.initiative).toBe(4);
	});

	it('surfaces the initiative gain via a log line (no silent no-op)', () => {
		const { log } = fire({ 'Deep Sea Hunter': 1 }, 'onNavigate');
		expect(log.some((l) => /gained 4 initiative/i.test(l))).toBe(true);
	});

	it('offers the opt-in change-destination decision card on navigate', () => {
		const { player } = fire({ 'Deep Sea Hunter': 1 }, 'onNavigate');
		const decision = player.pendingDecisions.find((d) => d.kind === 'deepSeaHunterRedirect');
		expect(decision).toBeDefined();
		// First option keeps the current destination; the rest are real locations.
		expect(decision?.options[0].id).toBe('keep');
		expect(decision?.options.length).toBeGreaterThan(1);
	});

	it('surfaces the decision card via the log (no silent no-op)', () => {
		const { log } = fire({ 'Deep Sea Hunter': 1 }, 'onNavigate');
		expect(log.some((l) => l.includes('Decision:'))).toBe(true);
	});

	it('does not fire on an unrelated trigger', () => {
		const { player } = fire({ 'Deep Sea Hunter': 1 }, 'onTakeDamage');
		expect(player.initiative).toBe(0);
		expect(player.pendingDecisions).toHaveLength(0);
	});

	it('exposes a single declarative onNavigate breakpoint with both actions', () => {
		expect(ability).toHaveLength(1);
		expect(ability[0].on).toBe('onNavigate');
		const bp = ability[0].breakpoints![0];
		expect(bp.count).toBe(1);
		expect(bp.actions[0]).toEqual({ kind: 'gainInitiative', amount: 4 });
		expect(bp.actions[1]).toMatchObject({ kind: 'choose', decisionKind: 'deepSeaHunterRedirect' });
	});
});

describe('Deep Sea Hunter — deepSeaHunterRedirect resolver (the "may change destination")', () => {
	it('moves the player to the chosen destination and rebuilds occupancy', () => {
		const player = makePlayer({ navigationDestination: 'Floral Patch' });
		const ctx = ctxFor(player);
		decisions.deepSeaHunterRedirect(ctx, 'Tidal Cove');
		expect(player.navigationDestination).toBe('Tidal Cove');
		expect(player.pendingDestination).toBe('Tidal Cove');
		// Occupancy reflects the new destination, not the old one.
		expect(ctx.state.locationOccupancy['Tidal Cove']).toContain('Red');
		expect(ctx.state.locationOccupancy['Floral Patch'] ?? []).not.toContain('Red');
	});

	it('logs the destination change (no silent no-op)', () => {
		const player = makePlayer({ navigationDestination: 'Floral Patch' });
		const ctx = ctxFor(player);
		decisions.deepSeaHunterRedirect(ctx, 'Cyber City');
		expect(ctx.log.some((l) => /changed destination to Cyber City/i.test(l))).toBe(true);
	});

	it('"keep" leaves the destination untouched', () => {
		const player = makePlayer({ navigationDestination: 'Floral Patch' });
		const ctx = ctxFor(player);
		decisions.deepSeaHunterRedirect(ctx, 'keep');
		expect(player.navigationDestination).toBe('Floral Patch');
		expect(ctx.log).toHaveLength(0);
	});

	it('ignores an unknown option id (not a real location)', () => {
		const player = makePlayer({ navigationDestination: 'Floral Patch' });
		const ctx = ctxFor(player);
		decisions.deepSeaHunterRedirect(ctx, 'Nowhere');
		expect(player.navigationDestination).toBe('Floral Patch');
		expect(ctx.log).toHaveLength(0);
	});

	it('is a no-op (no log) when the chosen destination equals the current one', () => {
		const player = makePlayer({ navigationDestination: 'Tidal Cove' });
		const ctx = ctxFor(player);
		decisions.deepSeaHunterRedirect(ctx, 'Tidal Cove');
		expect(player.navigationDestination).toBe('Tidal Cove');
		expect(ctx.log).toHaveLength(0);
	});
});
