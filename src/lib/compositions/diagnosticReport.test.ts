import { describe, expect, test } from 'vitest';
import { generateDiagnosticReport, type PlayerTag, type PlayerVp } from './diagnosticReport';
import { CURVE_POINTS, type Composition } from './schema';

function comp(overrides: Partial<Composition>): Composition {
	return {
		id: overrides.id ?? 'c1',
		name: overrides.name ?? 'Aggro Burn',
		category: overrides.category ?? 'Aggro',
		color: overrides.color ?? '#ff2bc7',
		ideal_curve_points: overrides.ideal_curve_points ?? null,
		description: overrides.description ?? null,
		is_reference: overrides.is_reference ?? false,
		is_active: overrides.is_active ?? true,
		created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
		updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z'
	};
}

const linearCurve = Array.from({ length: CURVE_POINTS }, (_, i) => i + 1); // y = x

function vps(color: string, points: Array<[number, number]>): PlayerVp[] {
	return points.map(([round, vp]) => ({ playerColor: color, round, vp }));
}

describe('generateDiagnosticReport', () => {
	test('renders empty notice when no tags + no skipped players', () => {
		const md = generateDiagnosticReport([], new Map(), {
			gameId: 'abcdef1234'
		});
		expect(md).toContain('Diagnostic — Game abcdef12');
		expect(md).toContain('_No tagged players in this game._');
	});

	test('skips players whose composition lacks an ideal curve', () => {
		const tags: PlayerTag[] = [
			{ playerColor: 'Red', composition: comp({ ideal_curve_points: null, name: 'Mystery' }) }
		];
		const vpsMap = new Map<string, PlayerVp[]>();
		vpsMap.set('Red', vps('Red', [[1, 1]]));
		const md = generateDiagnosticReport(tags, vpsMap, { gameId: 'g1' });
		expect(md).toMatch(/Skipped/);
		expect(md).toMatch(/Mystery.*no ideal curve/);
	});

	test('skips players with no VP snapshots', () => {
		const tags: PlayerTag[] = [
			{ playerColor: 'Red', composition: comp({ ideal_curve_points: linearCurve }) }
		];
		const md = generateDiagnosticReport(tags, new Map(), { gameId: 'g1' });
		expect(md).toMatch(/Skipped/);
		expect(md).toMatch(/no VP snapshots/);
	});

	test('produces per-player diagnostic with deltas + verdict', () => {
		const tags: PlayerTag[] = [
			{ playerColor: 'Red', composition: comp({ ideal_curve_points: linearCurve, name: 'Aggro Burn' }) }
		];
		const vpsMap = new Map<string, PlayerVp[]>();
		// Player overshoots: (round, vp) where vp > ideal at every round
		vpsMap.set(
			'Red',
			vps('Red', [
				[1, 5],
				[2, 8],
				[3, 12]
			])
		);
		const md = generateDiagnosticReport(tags, vpsMap, { gameId: 'g1' });
		expect(md).toMatch(/Red — Aggro Burn/);
		expect(md).toMatch(/Tracked over 3 rounds/);
		// integrated delta = (5-1) + (8-2) + (12-3) = 4 + 6 + 9 = 19 → "Overdelivered"
		expect(md).toMatch(/Overdelivered/);
		expect(md).toMatch(/\+19/);
	});

	test('marks underdelivery with negative integrated delta', () => {
		const tags: PlayerTag[] = [
			{ playerColor: 'Blue', composition: comp({ ideal_curve_points: linearCurve, name: 'Slow Engine' }) }
		];
		const vpsMap = new Map<string, PlayerVp[]>();
		vpsMap.set('Blue', vps('Blue', [[1, 0], [2, 0], [3, 0]]));
		const md = generateDiagnosticReport(tags, vpsMap, { gameId: 'g1' });
		// integrated = (0-1)+(0-2)+(0-3) = -6 → "Underdelivered"
		expect(md).toMatch(/Underdelivered/);
		expect(md).toMatch(/-6/);
	});

	test('marks tracked-close-to-ideal for small integrated delta', () => {
		const tags: PlayerTag[] = [
			{ playerColor: 'Green', composition: comp({ ideal_curve_points: linearCurve }) }
		];
		const vpsMap = new Map<string, PlayerVp[]>();
		// (1-1) + (3-2) = 1 → close
		vpsMap.set('Green', vps('Green', [[1, 1], [2, 3]]));
		const md = generateDiagnosticReport(tags, vpsMap, { gameId: 'g1' });
		expect(md).toMatch(/Tracked close to ideal/);
	});

	test('handles untagged players (no composition) as skipped', () => {
		const tags: PlayerTag[] = [{ playerColor: 'Yellow', composition: null }];
		const md = generateDiagnosticReport(tags, new Map(), { gameId: 'g1' });
		expect(md).toMatch(/Skipped/);
		expect(md).toMatch(/Yellow: no composition tagged/);
	});

	test('emits gameDisplayName + gameDate when provided', () => {
		const md = generateDiagnosticReport(
			[{ playerColor: 'Red', composition: comp({ ideal_curve_points: linearCurve }) }],
			new Map([['Red', vps('Red', [[1, 1]])]]),
			{ gameId: 'g1', gameDisplayName: 'Friday Night', gameDate: '2026-05-03' }
		);
		expect(md).toMatch(/# Diagnostic — Friday Night/);
		expect(md).toMatch(/Date: 2026-05-03/);
	});
});
