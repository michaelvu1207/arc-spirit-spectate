import { describe, expect, test } from 'vitest';
import {
	CURVE_POINTS,
	CURVE_Y_MAX,
	CURVE_Y_MIN,
	CompositionValidationError,
	REFERENCE_NAME,
	validateCategory,
	validateColor,
	validateCurvePoints,
	validateDescription,
	validateName
} from './schema';

describe('validateName', () => {
	test('rejects non-string input', () => {
		expect(() => validateName(42)).toThrow(CompositionValidationError);
	});

	test('rejects empty string after trim', () => {
		expect(() => validateName('   ')).toThrow(/required/);
	});

	test('rejects names > 64 chars', () => {
		expect(() => validateName('x'.repeat(65))).toThrow(/64/);
	});

	test('rejects names starting with __ except reference baseline', () => {
		expect(() => validateName('__system')).toThrow(/may not start with __/);
		expect(validateName(REFERENCE_NAME)).toBe(REFERENCE_NAME);
	});

	test('trims whitespace', () => {
		expect(validateName('  Aggro Burn  ')).toBe('Aggro Burn');
	});
});

describe('validateCategory', () => {
	test('null and undefined return null', () => {
		expect(validateCategory(null)).toBeNull();
		expect(validateCategory(undefined)).toBeNull();
	});

	test('empty string returns null', () => {
		expect(validateCategory('   ')).toBeNull();
	});

	test('rejects non-string', () => {
		expect(() => validateCategory(123)).toThrow(/string or null/);
	});

	test('rejects > 64 chars', () => {
		expect(() => validateCategory('x'.repeat(65))).toThrow(/64/);
	});

	test('rejects __ prefix', () => {
		expect(() => validateCategory('__hidden')).toThrow(/may not start with __/);
	});

	test('trims valid input', () => {
		expect(validateCategory('  Aggro  ')).toBe('Aggro');
	});
});

describe('validateColor', () => {
	test('accepts 6-digit hex', () => {
		expect(validateColor('#ff2bc7')).toBe('#ff2bc7');
		expect(validateColor('#FF2BC7')).toBe('#ff2bc7'); // lowercased
	});

	test('rejects 3-digit hex', () => {
		expect(() => validateColor('#abc')).toThrow();
	});

	test('rejects no hash', () => {
		expect(() => validateColor('ff2bc7')).toThrow();
	});

	test('rejects non-string', () => {
		expect(() => validateColor(0xff2bc7)).toThrow();
	});
});

describe('validateDescription', () => {
	test('null/undefined return null', () => {
		expect(validateDescription(null)).toBeNull();
		expect(validateDescription(undefined)).toBeNull();
	});

	test('rejects > 500 chars', () => {
		expect(() => validateDescription('x'.repeat(501))).toThrow(/500/);
	});

	test('preserves whitespace and length up to limit', () => {
		const desc = 'A '.repeat(50);
		expect(validateDescription(desc)).toBe(desc);
	});
});

describe('validateCurvePoints', () => {
	test('null returns null', () => {
		expect(validateCurvePoints(null)).toBeNull();
		expect(validateCurvePoints(undefined)).toBeNull();
	});

	test(`rejects arrays not of length ${CURVE_POINTS}`, () => {
		expect(() => validateCurvePoints([1, 2, 3])).toThrow();
		expect(() => validateCurvePoints(Array(CURVE_POINTS - 1).fill(0))).toThrow();
	});

	test('rejects non-array', () => {
		expect(() => validateCurvePoints('not an array')).toThrow();
	});

	test('rejects non-finite numbers', () => {
		const arr = Array(CURVE_POINTS).fill(0);
		arr[3] = NaN;
		expect(() => validateCurvePoints(arr)).toThrow(/finite/);
	});

	test('clamps to [CURVE_Y_MIN, CURVE_Y_MAX]', () => {
		const arr = Array(CURVE_POINTS)
			.fill(0)
			.map((_, i) => (i % 3 === 0 ? -100 : i % 3 === 1 ? 1000 : 12));
		const out = validateCurvePoints(arr);
		expect(out).not.toBeNull();
		for (const v of out!) {
			expect(v).toBeGreaterThanOrEqual(CURVE_Y_MIN);
			expect(v).toBeLessThanOrEqual(CURVE_Y_MAX);
		}
	});

	test('coerces numeric strings', () => {
		const arr = Array(CURVE_POINTS).fill('5');
		const out = validateCurvePoints(arr);
		expect(out).not.toBeNull();
		expect(out!.every((v) => v === 5)).toBe(true);
	});
});
