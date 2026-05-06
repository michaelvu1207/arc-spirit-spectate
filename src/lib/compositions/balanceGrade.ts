export type BalanceGrade = 'A' | 'B' | 'C' | 'D';

export interface BalanceActualPoint {
	round: number;
	avgVp: number;
}

export interface BalanceGradeInput {
	tags: string[];
	categoryByTag: Readonly<Record<string, string | null | undefined>>;
	idealPointsByTag: Readonly<Record<string, readonly number[] | undefined>>;
	actualByTag: Readonly<Record<string, readonly BalanceActualPoint[] | undefined>>;
}

export interface BalanceGradeResult {
	grade: BalanceGrade | null;
	avgDelta: number | null;
	comparedTags: number;
	comparedPoints: number;
	avgRoundTo30: number | null;
	categories: BalanceCategoryBreakdown[];
}

export interface BalanceCategoryBreakdown {
	category: string;
	avgDelta: number;
	comparedTags: number;
	comparedPoints: number;
	avgRoundTo30: number | null;
}

function gradeForAverageDelta(avgDelta: number): BalanceGrade {
	if (avgDelta <= 1.5) return 'A';
	if (avgDelta <= 3) return 'B';
	if (avgDelta <= 5) return 'C';
	return 'D';
}

function categoryIdealAtRound(
	category: string,
	round: number,
	tags: readonly string[],
	categoryByTag: Readonly<Record<string, string | null | undefined>>,
	idealPointsByTag: Readonly<Record<string, readonly number[] | undefined>>
): number | null {
	let sum = 0;
	let count = 0;
	const index = round - 1;
	for (const tag of tags) {
		if (categoryByTag[tag] !== category) continue;
		const value = idealPointsByTag[tag]?.[index];
		if (typeof value !== 'number' || !Number.isFinite(value)) continue;
		sum += value;
		count += 1;
	}
	return count > 0 ? sum / count : null;
}

export function computeBalanceGrade(input: BalanceGradeInput): BalanceGradeResult {
	let totalDelta = 0;
	let comparedPoints = 0;
	const comparedTags = new Set<string>();
	const roundsTo30: number[] = [];
	const byCategory = new Map<
		string,
		{
			totalDelta: number;
			comparedPoints: number;
			comparedTags: Set<string>;
			roundsTo30: number[];
		}
	>();

	for (const tag of input.tags) {
		const category = input.categoryByTag[tag];
		if (!category) continue;
		const actual = input.actualByTag[tag] ?? [];
		let tagHadComparedPoint = false;
		for (const point of actual) {
			const ideal = categoryIdealAtRound(
				category,
				point.round,
				input.tags,
				input.categoryByTag,
				input.idealPointsByTag
			);
			if (ideal == null) continue;
			const delta = Math.abs(point.avgVp - ideal);
			totalDelta += delta;
			comparedPoints += 1;
			comparedTags.add(tag);
			tagHadComparedPoint = true;
			const cat = byCategory.get(category) ?? {
				totalDelta: 0,
				comparedPoints: 0,
				comparedTags: new Set<string>(),
				roundsTo30: []
			};
			cat.totalDelta += delta;
			cat.comparedPoints += 1;
			cat.comparedTags.add(tag);
			byCategory.set(category, cat);
		}
		if (tagHadComparedPoint) {
			const roundTo30 = firstRoundAtOrAbove(actual, 30);
			if (roundTo30 != null) {
				roundsTo30.push(roundTo30);
				const cat = byCategory.get(category);
				if (cat) cat.roundsTo30.push(roundTo30);
			}
		}
	}

	if (comparedPoints === 0) {
		return {
			grade: null,
			avgDelta: null,
			comparedTags: 0,
			comparedPoints: 0,
			avgRoundTo30: null,
			categories: []
		};
	}

	const avgDelta = Number((totalDelta / comparedPoints).toFixed(2));
	return {
		grade: gradeForAverageDelta(avgDelta),
		avgDelta,
		comparedTags: comparedTags.size,
		comparedPoints,
		avgRoundTo30: average(roundsTo30),
		categories: Array.from(byCategory.entries())
			.map(([category, item]) => ({
				category,
				avgDelta: Number((item.totalDelta / item.comparedPoints).toFixed(2)),
				comparedTags: item.comparedTags.size,
				comparedPoints: item.comparedPoints,
				avgRoundTo30: average(item.roundsTo30)
			}))
			.sort((a, b) => b.avgDelta - a.avgDelta || a.category.localeCompare(b.category))
	};
}

function firstRoundAtOrAbove(
	points: readonly BalanceActualPoint[],
	target: number
): number | null {
	for (const point of points) {
		if (point.avgVp >= target) return point.round;
	}
	return null;
}

function average(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sum = values.reduce((total, value) => total + value, 0);
	return Number((sum / values.length).toFixed(2));
}
