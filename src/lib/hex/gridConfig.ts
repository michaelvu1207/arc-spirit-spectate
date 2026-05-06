import { defineHex, Grid, Orientation } from 'honeycomb-grid';

/**
 * Flat-top spirit hex. xRadius/yRadius dialed in to remove visible column
 * gaps when spirit art uses `preserveAspectRatio="meet"`.
 */
export const SpiritHex = defineHex({
	dimensions: { xRadius: 60, yRadius: 60 },
	origin: 'topLeft',
	orientation: Orientation.FLAT
});

export type SpiritHexType = InstanceType<typeof SpiritHex>;

/**
 * Axial coordinate tuple type [q, r]
 */
type AxialCoord = [number, number];

/**
 * Mapping from TTS slotIndex (1-7) to hex axial coordinates
 * Slot 4 is center, others form a ring around it
 *
 * Layout (flat-top orientation - two vertices on bottom):
 *            [7]
 *         /      \
 *       [6]      [1]
 *         \      /
 *          [4]         <- Center
 *         /      \
 *       [5]      [2]
 *         \      /
 *            [3]
 */
export const SLOT_TO_COORDS: Record<number, AxialCoord> = {
	4: [0, 0], // Center
	1: [1, -1], // Top-right
	2: [1, 0], // Right
	3: [0, 1], // Bottom-right
	5: [-1, 1], // Bottom-left
	6: [-1, 0], // Left
	7: [0, -1] // Top-left
};

/**
 * Reverse mapping from axial coordinates to slot index
 */
export const COORDS_TO_SLOT: Map<string, number> = new Map(
	Object.entries(SLOT_TO_COORDS).map(([slot, coords]) => {
		return [`${coords[0]},${coords[1]}`, parseInt(slot)];
	})
);

/**
 * Get slot index from hex coordinates
 */
export function getSlotFromCoords(q: number, r: number): number | undefined {
	return COORDS_TO_SLOT.get(`${q},${r}`);
}

/**
 * Create a 7-hex spirit grid using the default cell dimensions.
 */
export function createSpiritGrid(): Grid<SpiritHexType> {
	return new Grid(SpiritHex, Object.values(SLOT_TO_COORDS));
}

/**
 * Get the hex object for a specific slot index
 */
export function getHexForSlot(
	grid: Grid<SpiritHexType>,
	slotIndex: number
): SpiritHexType | undefined {
	const coords = SLOT_TO_COORDS[slotIndex];
	if (!coords) return undefined;
	return grid.getHex(coords);
}

/**
 * Get all hexes as an array sorted by slot index
 */
export function getHexesBySlot(
	grid: Grid<SpiritHexType>
): Array<{ slot: number; hex: SpiritHexType }> {
	const result: Array<{ slot: number; hex: SpiritHexType }> = [];

	for (const [slot, coords] of Object.entries(SLOT_TO_COORDS)) {
		const hex = grid.getHex(coords);
		if (hex) {
			result.push({ slot: parseInt(slot), hex });
		}
	}

	return result.sort((a, b) => a.slot - b.slot);
}

/**
 * Calculate the bounding box of the grid for SVG viewBox
 */
export function getGridBounds(grid: Grid<SpiritHexType>): {
	minX: number;
	minY: number;
	width: number;
	height: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	grid.forEach((hex) => {
		for (const corner of hex.corners) {
			minX = Math.min(minX, corner.x);
			minY = Math.min(minY, corner.y);
			maxX = Math.max(maxX, corner.x);
			maxY = Math.max(maxY, corner.y);
		}
	});

	return {
		minX,
		minY,
		width: maxX - minX,
		height: maxY - minY
	};
}
