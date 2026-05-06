import { describe, expect, test } from 'vitest';
import {
	isActualVisible,
	isCategoryActualVisible,
	isCategoryIdealVisible,
	isIdealVisible,
	isTagIdealRendered,
	type VisibilityContext
} from './visibility';

function ctx(overrides: Partial<VisibilityContext> = {}): VisibilityContext {
	return {
		tagsWithIdeal: new Set(['aggro', 'engine']),
		gameFilterActive: false,
		hiddenIdealsByTag: {},
		hiddenActualsByTag: {},
		hiddenIdealsByCategory: {},
		hiddenActualsByCategory: {},
		tagInGameFilter: () => true,
		...overrides
	};
}

describe('isIdealVisible', () => {
	test('returns false when tag has no ideal', () => {
		expect(isIdealVisible(ctx(), 'no-curve')).toBe(false);
	});

	test('returns true by default for tags with ideal and no game filter', () => {
		expect(isIdealVisible(ctx(), 'aggro')).toBe(true);
	});

	test('returns false when explicit override is true (hidden)', () => {
		expect(isIdealVisible(ctx({ hiddenIdealsByTag: { aggro: true } }), 'aggro')).toBe(false);
	});

	test('returns true when explicit override is false (force-show), even with game filter active', () => {
		expect(
			isIdealVisible(
				ctx({ gameFilterActive: true, hiddenIdealsByTag: { aggro: false } }),
				'aggro'
			)
		).toBe(true);
	});

	test('returns false when game filter is active and tag has no override', () => {
		expect(isIdealVisible(ctx({ gameFilterActive: true }), 'aggro')).toBe(false);
	});

	test('returns false when tag is filtered out by game-filter even without explicit override', () => {
		expect(
			isIdealVisible(ctx({ tagInGameFilter: () => false }), 'aggro')
		).toBe(false);
	});
});

describe('isActualVisible', () => {
	test('default-visible when tag is in game-filter set', () => {
		expect(isActualVisible(ctx(), 'aggro')).toBe(true);
	});

	test('hidden when override is true', () => {
		expect(isActualVisible(ctx({ hiddenActualsByTag: { aggro: true } }), 'aggro')).toBe(false);
	});

	test('force-shown when override is false even if filtered out', () => {
		expect(
			isActualVisible(
				ctx({ tagInGameFilter: () => false, hiddenActualsByTag: { aggro: false } }),
				'aggro'
			)
		).toBe(true);
	});

	test('hidden when not in game-filter set and no override', () => {
		expect(isActualVisible(ctx({ tagInGameFilter: () => false }), 'aggro')).toBe(false);
	});
});

describe('isCategoryIdealVisible', () => {
	test('default-true', () => {
		expect(isCategoryIdealVisible(ctx(), 'aggro-cat')).toBe(true);
	});

	test('hidden when override true', () => {
		expect(
			isCategoryIdealVisible(ctx({ hiddenIdealsByCategory: { 'aggro-cat': true } }), 'aggro-cat')
		).toBe(false);
	});

	test('force-show override (false) keeps it visible', () => {
		expect(
			isCategoryIdealVisible(ctx({ hiddenIdealsByCategory: { 'aggro-cat': false } }), 'aggro-cat')
		).toBe(true);
	});
});

describe('isCategoryActualVisible', () => {
	test('default-true when no game filter', () => {
		expect(isCategoryActualVisible(ctx(), 'aggro-cat')).toBe(true);
	});

	test('default-false when game filter is active', () => {
		expect(isCategoryActualVisible(ctx({ gameFilterActive: true }), 'aggro-cat')).toBe(false);
	});

	test('force-show even with game filter', () => {
		expect(
			isCategoryActualVisible(
				ctx({ gameFilterActive: true, hiddenActualsByCategory: { 'aggro-cat': false } }),
				'aggro-cat'
			)
		).toBe(true);
	});

	test('explicit hide always wins', () => {
		expect(
			isCategoryActualVisible(
				ctx({ hiddenActualsByCategory: { 'aggro-cat': true } }),
				'aggro-cat'
			)
		).toBe(false);
	});
});

describe('isTagIdealRendered', () => {
	test('renders a game-filter-hidden ideal while it is actively being edited', () => {
		expect(
			isTagIdealRendered(ctx({ gameFilterActive: true }), 'aggro', {
				globalHideIdeals: false,
				isEditing: true
			})
		).toBe(true);
	});

	test('does not keep rendering after the editor is closed', () => {
		expect(
			isTagIdealRendered(ctx({ gameFilterActive: true }), 'aggro', {
				globalHideIdeals: false,
				isEditing: false
			})
		).toBe(false);
	});

	test('explicit per-tag hide wins even while editing', () => {
		expect(
			isTagIdealRendered(
				ctx({ hiddenIdealsByTag: { aggro: true } }),
				'aggro',
				{ globalHideIdeals: false, isEditing: true }
			)
		).toBe(false);
	});

	test('global hide wins outside the editor', () => {
		expect(
			isTagIdealRendered(ctx(), 'aggro', {
				globalHideIdeals: true,
				isEditing: false
			})
		).toBe(false);
	});
});
