import type { ClassAbility } from './types';

// Infiltrator — "swap 1 Attack Die with all players in your Location." An ENGINE-handled
// standalone Location-phase action (the `infiltratorSwap` command + a dedicated swap UI),
// not a trigger effect — so it carries no effect-system entry. Listed in the coverage
// harness's ENGINE_HANDLED_CLASSES.
export const ability: ClassAbility[] = [];
