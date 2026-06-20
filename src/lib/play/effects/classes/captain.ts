import { runAction } from '../actions';
import type { ClassAbility, ClassHandler } from './types';

/**
 * "If you Cultivate with 3 Heroes, gain 1 Spirit Augment." Heroes are the Human
 * Enclave faction spirits; counts every Human Enclave spirit (origin is always
 * active, awakened or not); grants once when ≥3.
 */
const captainOnCultivate: ClassHandler = (ctx) => {
	const heroes = ctx.player.spirits.filter((s) =>
		Object.keys(s.origins ?? {}).includes('Human Enclave')
	).length;
	if (heroes >= 3) runAction(ctx, { kind: 'gainAugment', amount: 1 });
};

export const ability: ClassAbility[] = [{ on: 'onCultivate', run: captainOnCultivate }];
