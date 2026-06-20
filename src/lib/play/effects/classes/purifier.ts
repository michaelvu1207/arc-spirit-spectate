import { nextId } from '../../rng';
import type { PrivatePlayerState } from '../../types';
import type { ClassAbility, ClassHandler } from './types';

// Purifier — "When Awakened, you may place 2 of any Spirit Augment on each summoned
// cursed spirit."
//
// Built-in, no manual prompt. When a Purifier awakens AND the player holds at least
// one Cursed Spirit, it grants 2 placeable Spirit Augments per Cursed Spirit into the
// to-place pouch (`unplacedAugments`). The player then places them with the SAME
// in-stage Augment-placement UX as the Captain's gained augments — pick an augment
// icon, click a spirit — but each one is restricted to a Cursed Spirit host
// (`hostClass: 'Cursed Spirit'`) and a Cursed Spirit may hold up to 2 of them
// (`hostCapacity: 2`, overriding the default 1-per-spirit cap). The class is chosen by
// the player at placement (command.className), matching "any Spirit Augment".

const AUGMENTS_PER_SPIRIT = 2;

/** The player's summoned Cursed Spirits (face-up or down — "summoned" = in the tableau). */
function cursedSpirits(player: PrivatePlayerState) {
	return player.spirits.filter((s) => (s.classes?.['Cursed Spirit'] ?? 0) > 0);
}

const purifierAwakening: ClassHandler = (ctx) => {
	// awakening fires per-spirit; only act when the spirit that just awakened is a Purifier.
	const slot = (ctx.command as { slotIndex?: number } | undefined)?.slotIndex;
	if (slot == null) return;
	const purifier = ctx.player.spirits.find((s) => s.slotIndex === slot);
	if (!purifier || (purifier.classes?.Purifier ?? 0) <= 0) return;

	const targets = cursedSpirits(ctx.player);
	if (targets.length === 0) {
		// No-silent-no-op: nothing to augment ⇒ no grant, but leave an observable trace.
		ctx.log.push('Purifier: no Cursed Spirit to augment.');
		return;
	}

	const total = AUGMENTS_PER_SPIRIT * targets.length;
	ctx.player.unplacedAugments ??= [];
	for (let i = 0; i < total; i += 1) {
		ctx.player.unplacedAugments.push({
			runeId: nextId(ctx.state.rng, 'aug'),
			name: 'Spirit Augment',
			// Restrict placement to Cursed Spirit hosts, 2 per host (Purifier's grant).
			hostClass: 'Cursed Spirit',
			hostCapacity: AUGMENTS_PER_SPIRIT,
			boundLabel: 'a Cursed Spirit'
		});
	}
	ctx.log.push(
		`Purifier: place ${total} Spirit Augment${total === 1 ? '' : 's'} on your ${targets.length} Cursed Spirit${targets.length === 1 ? '' : 's'}.`
	);
};

export const ability: ClassAbility[] = [{ on: 'awakening', run: purifierAwakening }];
