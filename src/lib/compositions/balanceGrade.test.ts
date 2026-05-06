import { describe, expect, test } from 'vitest';
import { computeBalanceGrade } from './balanceGrade';

const tags = ['fast-a', 'fast-b', 'slow-a'];

describe('computeBalanceGrade', () => {
	test('grades historical actuals against their category ideal average', () => {
		const result = computeBalanceGrade({
			tags,
			categoryByTag: {
				'fast-a': 'Fast',
				'fast-b': 'Fast',
				'slow-a': 'Slow'
			},
			idealPointsByTag: {
				'fast-a': [0, 10, 20],
				'fast-b': [2, 12, 22],
				'slow-a': [0, 5, 10]
			},
			actualByTag: {
				'fast-a': [
					{ round: 1, avgVp: 1 },
					{ round: 2, avgVp: 11 },
					{ round: 3, avgVp: 21 }
				],
				'fast-b': [
					{ round: 1, avgVp: 1 },
					{ round: 2, avgVp: 11 },
					{ round: 3, avgVp: 21 }
				]
			}
		});

		expect(result.grade).toBe('A');
		expect(result.avgDelta).toBe(0);
		expect(result.comparedTags).toBe(2);
		expect(result.comparedPoints).toBe(6);
		expect(result.avgRoundTo30).toBe(null);
		expect(result.categories).toEqual([
			{
				category: 'Fast',
				avgDelta: 0,
				comparedTags: 2,
				comparedPoints: 6,
				avgRoundTo30: null
			}
		]);
	});

	test('uses the whole category ideal rather than the tag ideal', () => {
		const result = computeBalanceGrade({
			tags: ['a', 'b'],
			categoryByTag: { a: 'Tempo', b: 'Tempo' },
			idealPointsByTag: {
				a: [0, 0],
				b: [10, 10]
			},
			actualByTag: {
				a: [
					{ round: 1, avgVp: 5 },
					{ round: 2, avgVp: 5 }
				]
			}
		});

		expect(result.grade).toBe('A');
		expect(result.avgDelta).toBe(0);
	});

	test('returns no-data when there are no comparable categorized actuals', () => {
		const result = computeBalanceGrade({
			tags,
			categoryByTag: { 'fast-a': null },
			idealPointsByTag: { 'fast-a': [0, 10, 20] },
			actualByTag: {
				'fast-a': [{ round: 1, avgVp: 0 }]
			}
		});

		expect(result.grade).toBe(null);
		expect(result.comparedPoints).toBe(0);
	});

	test('maps larger average deltas to lower grades', () => {
		const result = computeBalanceGrade({
			tags: ['a'],
			categoryByTag: { a: 'Tempo' },
			idealPointsByTag: { a: [0, 0, 0] },
			actualByTag: {
				a: [
					{ round: 1, avgVp: 7 },
					{ round: 2, avgVp: 8 },
					{ round: 3, avgVp: 9 }
				]
			}
		});

		expect(result.grade).toBe('D');
		expect(result.avgDelta).toBe(8);
	});

	test('reports average round where historical lines reach 30 VP', () => {
		const result = computeBalanceGrade({
			tags: ['a', 'b'],
			categoryByTag: { a: 'Tempo', b: 'Tempo' },
			idealPointsByTag: {
				a: [10, 20, 30, 30],
				b: [10, 20, 30, 30]
			},
			actualByTag: {
				a: [
					{ round: 1, avgVp: 10 },
					{ round: 2, avgVp: 30 },
					{ round: 3, avgVp: 31 }
				],
				b: [
					{ round: 1, avgVp: 10 },
					{ round: 2, avgVp: 20 },
					{ round: 3, avgVp: 30 }
				]
			}
		});

		expect(result.avgRoundTo30).toBe(2.5);
		expect(result.categories[0]).toMatchObject({
			category: 'Tempo',
			avgRoundTo30: 2.5,
			comparedTags: 2
		});
	});

	test('breaks down category differences independently', () => {
		const result = computeBalanceGrade({
			tags: ['tempo-a', 'control-a'],
			categoryByTag: { 'tempo-a': 'Tempo', 'control-a': 'Control' },
			idealPointsByTag: {
				'tempo-a': [0, 10],
				'control-a': [0, 10]
			},
			actualByTag: {
				'tempo-a': [
					{ round: 1, avgVp: 1 },
					{ round: 2, avgVp: 11 }
				],
				'control-a': [
					{ round: 1, avgVp: 4 },
					{ round: 2, avgVp: 14 }
				]
			}
		});

		expect(result.categories).toEqual([
			{
				category: 'Control',
				avgDelta: 4,
				comparedTags: 1,
				comparedPoints: 2,
				avgRoundTo30: null
			},
			{
				category: 'Tempo',
				avgDelta: 1,
				comparedTags: 1,
				comparedPoints: 2,
				avgRoundTo30: null
			}
		]);
	});
});
