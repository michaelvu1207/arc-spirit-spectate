import { describe, it, expect } from 'vitest';
import { ability, decisions } from './healer';
import { fire, ctxFor, makePlayer } from './testHelpers';

/**
 * Healer — DB intent: "On rest, if you have 10 potential, you may restore 3 health
 * and gain 1 VP."
 *
 * Encoding: a bespoke `onRest` run handler gated on `maxTokens >= 10`. Only then is
 * an opt-in decision card offered (`healerRestore`). The colocated `healerRestore`
 * resolver performs the restore-3 barrier (self only) and +1 VP when "yes" is picked.
 *
 * UX channels: a decision card (the "may" choice) + log lines. Below 10 potential a
 * log breadcrumb keeps the gate observable (no silent no-op).
 */
describe('Healer (onRest → 10-potential gated restore-3 + 1 VP decision)', () => {
	it('offers the opt-in decision card when at 10 potential', () => {
		const { player } = fire({ Healer: 1 }, 'onRest', { player: { maxTokens: 10, barrier: 5 } });
		const decision = player.pendingDecisions.find((d) => d.kind === 'healerRestore');
		expect(decision).toBeDefined();
		expect(decision?.options.map((o) => o.id)).toEqual(['yes', 'no']);
	});

	it('surfaces the offered decision via the log (no silent no-op)', () => {
		const { log } = fire({ Healer: 1 }, 'onRest', { player: { maxTokens: 10, barrier: 5 } });
		expect(log.some((l) => l.includes('Decision:'))).toBe(true);
	});

	it('does NOT offer the decision below 10 potential', () => {
		const { player } = fire({ Healer: 1 }, 'onRest', { player: { maxTokens: 4, barrier: 1 } });
		expect(player.pendingDecisions.find((d) => d.kind === 'healerRestore')).toBeUndefined();
	});

	it('logs the gate breadcrumb when below 10 potential (no silent no-op)', () => {
		const { log } = fire({ Healer: 1 }, 'onRest', { player: { maxTokens: 4, barrier: 1 } });
		expect(log.some((l) => /need 10 potential/i.test(l))).toBe(true);
	});

	it('does not fire on an unrelated trigger', () => {
		const { player } = fire({ Healer: 1 }, 'onTakeDamage', { player: { maxTokens: 10, barrier: 5 } });
		expect(player.pendingDecisions).toHaveLength(0);
	});

	it('exposes a single bespoke onRest run handler (no declarative ladder)', () => {
		expect(ability).toHaveLength(1);
		expect(ability[0].on).toBe('onRest');
		expect(typeof ability[0].run).toBe('function');
		expect(ability[0].breakpoints).toBeUndefined();
	});
});

describe('Healer — healerRestore resolver (the "may restore + gain VP")', () => {
	it('on "yes" restores 3 barrier (self only) and gains 1 VP', () => {
		// maxTokens 10, barrier 5 → restore 3 brings barrier to 8 (not capped).
		const player = makePlayer({ maxTokens: 10, barrier: 5, victoryPoints: 0 });
		const ctx = ctxFor(player);
		decisions.healerRestore(ctx, 'yes');
		expect(player.barrier).toBe(8);
		expect(player.victoryPoints).toBe(1);
	});

	it('does NOT restore colocated allies (self only)', () => {
		const self = makePlayer({ maxTokens: 10, barrier: 5 });
		const ally = makePlayer({
			playerColor: 'Blue',
			maxTokens: 10,
			barrier: 5,
			navigationDestination: 'Floral Patch'
		});
		self.navigationDestination = 'Floral Patch';
		const ctx = ctxFor(self, { extra: { Blue: ally } });
		decisions.healerRestore(ctx, 'yes');
		expect(self.barrier).toBe(8);
		expect(ally.barrier).toBe(5);
	});

	it('surfaces the restore and VP gain via log lines (no silent no-op)', () => {
		const player = makePlayer({ maxTokens: 10, barrier: 5 });
		const ctx = ctxFor(player);
		decisions.healerRestore(ctx, 'yes');
		expect(ctx.log.some((l) => /restored 3 barrier/i.test(l))).toBe(true);
		expect(ctx.log.some((l) => /gained 1 vp/i.test(l))).toBe(true);
	});

	it('on "no" changes nothing', () => {
		const player = makePlayer({ maxTokens: 10, barrier: 5, victoryPoints: 0 });
		const ctx = ctxFor(player);
		decisions.healerRestore(ctx, 'no');
		expect(player.barrier).toBe(5);
		expect(player.victoryPoints).toBe(0);
		expect(ctx.log).toHaveLength(0);
	});
});
