import { describe, it, expect } from 'vitest';
import { fire } from './testHelpers';

// Soul Weaver — (1) redraw arming is at DRAW-OPEN (runtime), not a class trigger;
// (2) >=2 simultaneous attack; (3) >=3 rest heal 2.
describe('Soul Weaver', () => {
	// The redraw is armed when a summon draw OPENS (runtime.startDraw) and cleared once
	// the player picks a spirit (runtime spawnHandSpirit) — NOT re-armed per-summon. The
	// class effect therefore does NOT touch redrawAvailable on onSpiritSummon. The full
	// arm-at-open / clear-on-pick flow is covered in runtime.test.ts.
	it('(1) the class effect does NOT arm a redraw on onSpiritSummon (no per-summon re-arm)', () => {
		const { player } = fire({ 'Soul Weaver': 1 }, 'onSpiritSummon');
		expect(player.redrawAvailable).toBe(false);
	});

	it('(2) at >=2, becomes stun-immune on rest (backs simultaneous attack)', () => {
		const { player } = fire({ 'Soul Weaver': 2 }, 'onRest');
		expect(player.stunImmune).toBe(true);
	});

	it('(3) at >=3, restores 2 health on rest and is stun-immune', () => {
		const { player } = fire({ 'Soul Weaver': 3 }, 'onRest', {
			player: { barrier: 0, brokenBarrier: 4, maxBarrier: 4 }
		});
		expect(player.barrier).toBe(2);
		expect(player.stunImmune).toBe(true);
	});

	it('a single Soul Weaver does NOT heal or grant stun-immunity on rest', () => {
		const { player } = fire({ 'Soul Weaver': 1 }, 'onRest', {
			player: { barrier: 0, brokenBarrier: 4, maxBarrier: 4 }
		});
		expect(player.barrier).toBe(0);
		expect(player.stunImmune).toBe(false);
	});

	it('does not redraw on an unrelated trigger', () => {
		const { player } = fire({ 'Soul Weaver': 1 }, 'onRest');
		expect(player.redrawAvailable).toBe(false);
	});
});
