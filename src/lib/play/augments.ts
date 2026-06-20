/**
 * Spirit-augment policy — pure helpers shared by the engine (server) and the trait
 * list UI (client).
 *
 * A spirit augment is a class-linked rune permanently attached to one spirit. Rules:
 *  - One augment per spirit by default; it cannot be removed, replaced, or moved.
 *  - Once placed it is permanent — if the host spirit is removed/discarded, the
 *    augment goes with it (the engine cleans the attachment by spirit slot).
 *  - Some spirits raise their own augment capacity. The Fairy Droid class — "You may
 *    place unlimited Spirit Augments on this spirit" — is the current example.
 *  - An augment contributes its class toward the owner's trait totals, but only while
 *    its host spirit is awakened (face-up); face-down, it's dormant — i.e. it follows
 *    the spirit, exactly like the spirit's own classes do.
 */

import type { PlaySpirit } from './types';

/**
 * The canonical Spirit Augment token set. A Spirit Augment is its OWN token type
 * (NOT a rune — the Swordsman/Sorcerer/… rows in the `runes` table are only an
 * organizational artifact and are not used here). There are exactly these six, each
 * identified by the class it grants; placing one adds one of that class to the host
 * spirit and renders that class's icon. "Any Spirit Augment" = the player picks one
 * of these six.
 */
export const SPIRIT_AUGMENT_CLASSES = [
	'Fighter',
	'Elementalist',
	'Cultivator',
	'Soul Weaver',
	'Spirit Animal',
	'Cursed Spirit'
] as const;
export type SpiritAugmentClass = (typeof SPIRIT_AUGMENT_CLASSES)[number];
/** Is `name` one of the six real Spirit Augment classes? */
export function isSpiritAugmentClass(name: string): boolean {
	return (SPIRIT_AUGMENT_CLASSES as readonly string[]).includes(name);
}

/**
 * Classes that, when present on a spirit, let it hold MORE than the default one
 * augment. Fairy Droid grants unlimited placement. Add future "augment-capacity"
 * classes here.
 */
export const UNLIMITED_AUGMENT_CLASSES: ReadonlySet<string> = new Set(['Fairy Droid']);

/**
 * A spirit with an {@link UNLIMITED_AUGMENT_CLASSES} class can hold "unlimited"
 * augments. We model that as a large finite cap (99) rather than `Infinity` so the
 * value stays a plain integer everywhere it flows (capacity checks, bot scoring,
 * UI) — 99 is far beyond any reachable augment count in a real game.
 */
export const UNLIMITED_AUGMENT_CAPACITY = 99;

/**
 * Maximum number of augments that may be permanently placed on this spirit. Default
 * 1; a spirit with an {@link UNLIMITED_AUGMENT_CLASSES} class (e.g. Fairy Droid —
 * "You may place unlimited Spirit Augments on this spirit") can hold up to
 * {@link UNLIMITED_AUGMENT_CAPACITY}.
 */
export function augmentCapacityForSpirit(spirit: Pick<PlaySpirit, 'classes'>): number {
	for (const [cls, n] of Object.entries(spirit.classes ?? {})) {
		const count = typeof n === 'number' ? n : 1;
		if (count > 0 && UNLIMITED_AUGMENT_CLASSES.has(cls)) return UNLIMITED_AUGMENT_CAPACITY;
	}
	return 1;
}

/** One placed augment's contribution to its owner's class traits. */
export interface AugmentContribution {
	/** The class the augment adds one of. */
	className: string;
	/** Follows the host spirit: awakened (face-up) ⇒ active; face-down ⇒ dormant. */
	awake: boolean;
}

/** The minimal player shape {@link augmentContributions} reads — satisfied by both
 *  the engine's PrivatePlayerState and the client's PlayerProjection. */
interface AugmentCountablePlayer {
	spirits: { slotIndex: number; isFaceDown: boolean }[];
	spiritRuneAttachments?: { spiritSlotIndex: number; className?: unknown }[];
}

/**
 * Class contributions from a player's PLACED spirit augments. Each augment adds one
 * of its class; `awake` mirrors the host spirit's awaken state. Attachments without a
 * resolved class (plain rune attachments) and orphaned attachments (host spirit gone)
 * are ignored.
 */
export function augmentContributions(player: AugmentCountablePlayer): AugmentContribution[] {
	const out: AugmentContribution[] = [];
	for (const att of player.spiritRuneAttachments ?? []) {
		const className = typeof att.className === 'string' ? att.className : null;
		if (!className) continue; // not a class-linked augment
		const host = player.spirits.find((s) => s.slotIndex === att.spiritSlotIndex);
		if (!host) continue; // host removed — its augments are cleaned with it
		out.push({ className, awake: !host.isFaceDown });
	}
	return out;
}
