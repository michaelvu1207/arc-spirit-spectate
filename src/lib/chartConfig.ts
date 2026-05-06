// Chart.js dataset builders + dash patterns. Extracted from the legacy
// composition-analysis monolith so dataset shape is uniform across views.

import { CURVE_POINTS } from './compositions/schema';

// Per-category dash pattern. Cycles through the array — categories with the
// same index get the same pattern, so visual differentiation comes from color
// + dash style together (a11y: WCAG colorblind-safe).
const DASH_CYCLE: ReadonlyArray<readonly number[]> = [
	[],          // solid
	[6, 4],      // dashed
	[2, 3],      // dotted
	[8, 4, 2, 4] // dash-dot
];

export function dashForCategory(category: string | null): readonly number[] {
	if (!category) return DASH_CYCLE[0];
	let h = 0;
	for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) | 0;
	return DASH_CYCLE[Math.abs(h) % DASH_CYCLE.length];
}

export interface CurveDataset {
	label: string;
	data: Array<{ x: number; y: number }>;
	borderColor: string;
	backgroundColor: string;
	borderDash: readonly number[];
	tension: number;
	pointRadius: number;
	pointHoverRadius: number;
	dragData?: boolean;
}

interface BuildOpts {
	label: string;
	color: string;
	category: string | null;
	points: number[] | Array<{ x: number; y: number }>;
	kind: 'ideal' | 'actual';
	editable?: boolean;
}

function toXY(points: number[] | Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
	if (points.length === 0) return [];
	if (typeof points[0] === 'number') {
		return (points as number[]).map((y, i) => ({ x: i + 1, y }));
	}
	return points as Array<{ x: number; y: number }>;
}

export function buildDataset(opts: BuildOpts): CurveDataset {
	const dash = opts.kind === 'ideal' ? [] : dashForCategory(opts.category);
	return {
		label: opts.label,
		data: toXY(opts.points),
		borderColor: opts.color,
		backgroundColor: opts.color + '22',
		borderDash: dash,
		tension: 0,
		pointRadius: opts.editable ? 5 : opts.kind === 'ideal' ? 3 : 2,
		pointHoverRadius: opts.editable ? 7 : 4,
		dragData: opts.editable === true
	};
}

export const xAxisAllRounds = {
	type: 'linear' as const,
	min: 1,
	max: CURVE_POINTS,
	ticks: { stepSize: 1, autoSkip: false, maxRotation: 0, precision: 0 },
	grid: { color: 'rgba(58, 38, 112, 0.35)' }
};

export const yAxisVp = {
	min: 0,
	suggestedMax: 40,
	grid: { color: 'rgba(58, 38, 112, 0.35)' }
};
