import { describe, expect, it } from 'vitest';
import { ability } from './modInjector';

// Mod Injector — "When trading for a Spirit Augment at a Spirit World Location, you
// don't have to pay a cost." This is ENGINE-handled: a trade-cost waiver in
// runtime's resolveLocationInteraction (free augment trades while awakened). The
// end-to-end waiver is covered in runtime.test.ts; here we just pin that the class
// carries NO effect-system entry (and emits no manual prompt).
describe('Mod Injector (engine-handled free augment trade)', () => {
	it('has no effect-system ability (handled by the runtime trade-cost waiver)', () => {
		expect(ability).toEqual([]);
	});
});
