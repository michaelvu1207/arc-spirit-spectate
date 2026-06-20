import { describe, it, expect } from 'vitest';
import { ability } from './undercover';
import { makePlayer, spirit, ctxFor } from './testHelpers';

/**
 * Undercover (DB): "Gain 3 Initiative. Your next rune-to-relic trade is free, then
 * discard this spirit." Fires on `awakening` for the just-awakened Undercover spirit
 * (command.slotIndex). Initiative + self-discard are deterministic and tested here;
 * the free-trade waiver is engine-side (a `freeNextRelicTrade` flag honored by
 * resolveLocationInteraction) and is covered end-to-end in rewardInteractions.test.ts.
 */
describe('Undercover (awakening)', () => {
	it('gains 3 initiative and discards itself when its spirit awakens', () => {
		const player = makePlayer({
			initiative: 0,
			spirits: [spirit(1, { Undercover: 1 }, { name: 'Mole' })]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		expect(player.initiative).toBe(3);
		// single-use: the awakened Undercover is discarded.
		expect(player.spirits.some((s) => (s.classes?.Undercover ?? 0) > 0)).toBe(false);
		expect(player.spirits.length).toBe(0);
	});

	it('surfaces to the player via the log (no silent no-op)', () => {
		const player = makePlayer({
			spirits: [spirit(1, { Undercover: 1 }, { name: 'Mole' })]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		expect(ctx.log.some((l) => /initiative/i.test(l))).toBe(true);
		expect(ctx.log.some((l) => /free/i.test(l))).toBe(true);
		expect(ctx.log.some((l) => /discard/i.test(l))).toBe(true);
	});

	it('does nothing when a different (non-Undercover) spirit awakens', () => {
		const player = makePlayer({
			initiative: 0,
			spirits: [
				spirit(1, { Fighter: 1 }, { name: 'Brawler' }),
				spirit(2, { Undercover: 1 }, { name: 'Mole' })
			]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		expect(player.initiative).toBe(0);
		// both spirits remain — only the awakened Undercover should self-discard.
		expect(player.spirits.length).toBe(2);
	});

	it('arms the freeNextRelicTrade flag for the engine to honor', () => {
		const player = makePlayer({
			spirits: [spirit(1, { Undercover: 1 }, { name: 'Mole' })]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		// In-file deterministic part: the flag is set. (Honoring it is engine-side.)
		expect((player as unknown as { freeNextRelicTrade?: boolean }).freeNextRelicTrade).toBe(true);
	});

	// The engine-honored waiver (a rune→relic trade after Undercover awakens consumes
	// no rune and unsets the flag) is covered end-to-end through the runtime in
	// rewardInteractions.test.ts → "trade-cost waivers (Mod Injector / Undercover)".
});
