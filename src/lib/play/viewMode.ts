/**
 * Navigator view-mode decision — the single source of truth for whether the
 * spirit-world navigator renders as the fancy round COMPASS or the fallback
 * one-card-at-a-time CARDS reel.
 *
 * The rule is purely SPACE-BASED: "does a genuinely usable circle fit in the
 * board cell?" — `min(width, height) >= threshold`. This replaces the old
 * width/aspect heuristic that wrongly dropped to cards on large windows with an
 * odd aspect ratio (e.g. 1600x500 has a 500px square — plenty of room — yet the
 * old `boardW / boardH > 1.35` check forced cards). Because the circle needs a
 * square, only the SMALLER dimension matters; aspect ratio never does.
 *
 * Hysteresis (separate enter/exit thresholds) stops the mode from flip-flopping
 * while the user drags a window edge across the boundary.
 */

export type NavViewMode = 'compass' | 'cards';

/**
 * The visible navigator circle (the `.ring`) is drawn LARGER than the compass
 * box — it floats outside the reward-row cards. So the box must be sized DOWN by
 * this factor for the full ring to fit inside the cell uncropped. Keep in sync
 * with the `.ring` width in SpiritWorldBoard.svelte (122%).
 */
export const RING_OVERHANG = 1.22;
/** A touch of breathing room so the ring never kisses the cell edge. */
export const COMPASS_MARGIN = 0.97;

/**
 * Switch UP to the compass once the fitting square reaches this diameter (px).
 * Sized so the resulting compass box (cell / RING_OVERHANG) stays large enough
 * for the four realm cards to remain readable.
 */
export const MIN_CIRCLE_ENTER = 480;
/** Drop back to cards once the fitting square falls below this (px). < ENTER. */
export const MIN_CIRCLE_EXIT = 440;
/** Hard cap on the compass box so it never dominates a huge monitor (px). */
export const COMPASS_CAP = 720;

/**
 * Decide the navigator view mode from the measured board cell.
 *
 * @param width   measured board cell width in px (0 before first measure)
 * @param height  measured board cell height in px (0 before first measure)
 * @param prev    the current mode, so we can apply hysteresis and avoid flips
 * @returns the mode to render
 *
 * Before measurement (`width`/`height` is 0) we keep `prev` — which defaults to
 * 'cards' at first paint / SSR, the safe choice (cards work at any size, the
 * compass does not).
 */
export function decideNavMode(width: number, height: number, prev: NavViewMode): NavViewMode {
	if (!width || !height) return prev;
	const fitSquare = Math.min(width, height);
	if (prev === 'compass') {
		return fitSquare < MIN_CIRCLE_EXIT ? 'cards' : 'compass';
	}
	return fitSquare >= MIN_CIRCLE_ENTER ? 'compass' : 'cards';
}

/**
 * The compass BOX size for a given board cell. The box is sized so the visible
 * ring (RING_OVERHANG * box) fits inside the cell with a small margin — so the
 * full circle is NEVER cropped — and is capped so it never dominates a huge
 * monitor. Used to size the compass once `decideNavMode` has chosen it (and to
 * size the confirm circle so it visually rhymes with the compass).
 */
export function compassDiameter(width: number, height: number): number {
	const cell = Math.min(width || COMPASS_CAP, height || COMPASS_CAP);
	const box = (cell * COMPASS_MARGIN) / RING_OVERHANG;
	return Math.min(box, COMPASS_CAP);
}
