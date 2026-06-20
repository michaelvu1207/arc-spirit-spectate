import type { ClassAbility } from './types';

// Mod Injector — "When trading for a Spirit Augment at a Spirit World Location, you
// don't have to pay a cost." This is an ENGINE-handled trade-cost waiver: while the
// player has an awakened Mod Injector, an augment-granting trade row skips consuming
// its cost (see runtime `resolveLocationInteraction`, the cost-waiver block). It is
// not a trigger effect, so it carries no effect-system entry here — listed in the
// coverage harness's ENGINE_HANDLED_CLASSES. (Shares the cost-waiver path with
// Undercover's one-shot free rune→relic trade.)
export const ability: ClassAbility[] = [];
