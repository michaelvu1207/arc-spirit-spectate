import { describe, it, expect } from 'vitest';
import { fire } from './testHelpers';

// Abyss Summoner — DB intent: "In the Floral Patch, you may draw 3 and summon 1
// abyss spirit, then awaken it for free."
//
// Surfaces as an opt-in DECISION card (kind `abyssSummonFlorality`) emitted on
// Navigation Reveal, but ONLY when the player navigated to the Floral Patch. The
// "Yes" path (draw 3 / summon 1 / autoAwaken) is driven by the runtime's draw
// machinery in runtime.ts `resolveDecision` — out of this file's reach — so it is
// covered by a skipped placeholder test below.
describe('Abyss Summoner', () => {
	it('offers the opt-in Floral Patch decision on navigate (no silent no-op)', () => {
		const { player } = fire({ 'Abyss Summoner': 1 }, 'onNavigate', {
			player: { navigationDestination: 'Floral Patch' }
		});
		const decision = player.pendingDecisions.find((d) => d.kind === 'abyssSummonFlorality');
		expect(decision).toBeDefined();
		expect(decision?.options.map((o) => o.id)).toEqual(['yes', 'no']);
	});

	it('surfaces the decision via the log (no silent no-op)', () => {
		const { log } = fire({ 'Abyss Summoner': 1 }, 'onNavigate', {
			player: { navigationDestination: 'Floral Patch' }
		});
		expect(log.some((line) => line.includes('Decision:'))).toBe(true);
	});

	it('is gated on the Floral Patch — no decision offered elsewhere', () => {
		const { player } = fire({ 'Abyss Summoner': 1 }, 'onNavigate', {
			player: { navigationDestination: 'Arcane Abyss' }
		});
		expect(player.pendingDecisions.find((d) => d.kind === 'abyssSummonFlorality')).toBeUndefined();
	});

	it('offers nothing when no destination is set', () => {
		const { player } = fire({ 'Abyss Summoner': 1 }, 'onNavigate', {
			player: { navigationDestination: null }
		});
		expect(player.pendingDecisions).toHaveLength(0);
	});

	it('does not fire on unrelated triggers', () => {
		const { player } = fire({ 'Abyss Summoner': 1 }, 'awakening', {
			player: { navigationDestination: 'Floral Patch' }
		});
		expect(player.pendingDecisions.find((d) => d.kind === 'abyssSummonFlorality')).toBeUndefined();
	});

	// TODO: resolving the decision with "yes" should queue an Arcane Abyss draw
	// (drawCount 3, summonLimit 1) flagged autoAwaken so the summoned spirit flips
	// + awakens for free. That path lives in runtime.ts `resolveDecision`
	// (queueOrBeginDraw(..., ARCANE_ABYSS_BAG, true)), which this file does not own
	// and which is not reachable through the effect-context test harness.
	it.skip('resolving "yes" starts a draw-3/summon-1/autoAwaken Abyss flow', () => {});
});
