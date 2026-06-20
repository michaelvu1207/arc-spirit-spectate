import type { ClassAbility } from './types';

// Cursed Spirit — Awakening-Phase rewards are NOT auto-granted. They're a CLAIMABLE
// Cleanup selection: `enterCleanup` (phases.ts) builds `pendingAwakenReward` (one line
// per corruption stage entered this round, ×N Cursed Spirits) and `resolveAwakenReward`
// (runtime.ts) applies the picks. So there is no effect-system entry here.
export const ability: ClassAbility[] = [];
