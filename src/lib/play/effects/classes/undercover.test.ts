import { describe, it, expect } from 'vitest';
import { ability } from './undercover';
import { makePlayer, spirit, ctxFor } from './testHelpers';

/**
 * Undercover (DB): "Gain 3 Initiative. Your next rune-to-relic trade is free, then
 * discard this spirit." Fires on `awakening` for the just-awakened Undercover spirit
 * (command.slotIndex). On awaken it grants +3 Initiative and arms the one-shot
 * `freeNextRelicTrade` flag but does NOT discard — the spirit STAYS on the board until
 * the free trade is actually used. The discard + waiver are engine-side (honored by
 * resolveLocationInteraction) and covered end-to-end in rewardInteractions.test.ts.
 */
describe('Undercover (awakening)', () => {
	it('gains 3 initiative and STAYS on the board when its spirit awakens', () => {
		const player = makePlayer({
			initiative: 0,
			spirits: [spirit(1, { Undercover: 1 }, { name: 'Mole' })]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		expect(player.initiative).toBe(3);
		// Not discarded on awaken — it remains until the free trade is spent.
		expect(player.spirits.some((s) => (s.classes?.Undercover ?? 0) > 0)).toBe(true);
		expect(player.spirits.length).toBe(1);
	});

	it('surfaces to the player via the log (no silent no-op)', () => {
		const player = makePlayer({
			spirits: [spirit(1, { Undercover: 1 }, { name: 'Mole' })]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		expect(ctx.log.some((l) => /initiative/i.test(l))).toBe(true);
		expect(ctx.log.some((l) => /free/i.test(l))).toBe(true);
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
		expect(player.spirits.length).toBe(2);
	});

	it('arms the freeNextRelicTrade flag for the engine to honor', () => {
		const player = makePlayer({
			spirits: [spirit(1, { Undercover: 1 }, { name: 'Mole' })]
		});
		const ctx = ctxFor(player, { trigger: 'awakening', command: { slotIndex: 1 } });
		ability[0].run!(ctx);

		// In-file deterministic part: the flag is set. (Honoring it — including the
		// deferred self-discard — is engine-side.)
		expect((player as unknown as { freeNextRelicTrade?: boolean }).freeNextRelicTrade).toBe(true);
	});

	// The engine-honored waiver (a rune→relic trade after Undercover awakens consumes
	// no rune, unsets the flag, AND discards the awakened Undercover spirit) is covered
	// end-to-end through the runtime in rewardInteractions.test.ts.
});
