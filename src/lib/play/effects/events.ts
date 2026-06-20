/**
 * The canonical game-event vocabulary — the single ordered timeline every class
 * ability hooks into. This is the foundation of the rules/events system
 * (see `docs/rules-events-refinement-plan.md`): an ability declares the event it
 * fires on, and the dispatcher (`applyTrigger`) runs it at exactly that beat.
 *
 * Phase 1 re-homes the event names here (previously inline in `registry.ts` as
 * `EffectTrigger`, kept as an alias) so the vocabulary lives in one place. Later
 * phases split the coarse events into the precise rulebook beats noted below and
 * thread typed payloads; the string values stay stable so nothing breaks meanwhile.
 */

export type GameEvent =
	// ── Navigation Phase ──────────────────────────────────────────────────────
	/** Destinations revealed + occupancy computed (Deep Sea Hunter, Rune Traveler). */
	| 'onNavigate'
	// ── Encounter Phase ───────────────────────────────────────────────────────
	/** A player-vs-player interaction / pre-combat beat (Infiltrator dice swap). */
	| 'onPlayerInteraction'
	// ── Location Interaction Phase ────────────────────────────────────────────
	/**
	 * A spirit was summoned (Soul Weaver redraw, Abyss Summoner, Mod Injector).
	 * PLANNED SPLIT: carry `{ world: 'spiritWorld' | 'abyss' }` so the redraw scopes.
	 */
	| 'onSpiritSummon'
	/** The Cultivate action (Cultivator, Arc Mage, Captain). */
	| 'onCultivate'
	/** The Rest action (Fighter, Elementalist, Healer, Soul Weaver, Strategist, Arcane Advisor). */
	| 'onRest'
	/**
	 * A location interaction — e.g. a rune/relic trade (Rune Mage).
	 * PLANNED SPLIT: a dedicated trade event carrying `{ given: { kind }, gained }`.
	 */
	| 'onLocationInteraction'
	// ── Combat (shared framework) ─────────────────────────────────────────────
	/** Combat prep: fires for the attacker BEFORE rolling (combat-bonus / initiative classes). */
	| 'inCombat'
	/** Inside `takeDamage`, BEFORE damage applies (Guardian, Disruptor, Aquamaiden, Firekeeper). */
	| 'onTakeDamage'
	/** A combat killed its target (Adaptive Fighter). */
	| 'onMonsterKill'
	// ── Awakening & Cleanup Phase ─────────────────────────────────────────────
	/** A single spirit awakens (Fairy, Dragon Warrior, Firekeeper, Fairy Droid, Purifier). */
	| 'awakening'
	/** A player's corruption status changed (carries old/new); sets the round's threshold flags. */
	| 'onStatusChange'
	/**
	 * The Awakening Phase, folded into cleanup. Fires once per active player at
	 * `enterCleanup`, BEFORE `findWinner` — status-driven grants (Cursed Spirit,
	 * The Corruptor) and VP win-cons (Golden Ruler, World Ender/Guardian).
	 */
	| 'awakeningPhase';

/**
 * The events in rough rulebook order (navigation → encounter → location → combat →
 * awakening/cleanup). Cross-cutting `onStatusChange` sits with combat where it
 * usually fires. Useful for ordering/validation and as the authoritative reference.
 */
export const EVENT_TIMELINE: readonly GameEvent[] = [
	'onNavigate',
	'onPlayerInteraction',
	'onSpiritSummon',
	'onCultivate',
	'onRest',
	'onLocationInteraction',
	'inCombat',
	'onTakeDamage',
	'onStatusChange',
	'onMonsterKill',
	'awakening',
	'awakeningPhase'
];
