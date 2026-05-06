// Composition entity schema + validation. Shared between client and server.
// Manual validators (no Zod dep yet) — keeps bundle small + matches existing
// API style in src/routes/api/composition-targets/+server.ts.
//
// If we add zod later, swap these out — but the function signatures stay.

export const CURVE_POINTS = 30;
export const CURVE_Y_MIN = 0;
export const CURVE_Y_MAX = 40;

export const NAME_MAX_LEN = 64;
export const CATEGORY_MAX_LEN = 64;
export const DESCRIPTION_MAX_LEN = 500;

export const COLOR_HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Reference baseline pseudo-name (legacy from string-tag era).
export const REFERENCE_NAME = '__reference__';

export interface Composition {
	id: string;
	name: string;
	category: string | null;
	color: string;
	ideal_curve_points: number[] | null;
	description: string | null;
	is_reference: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface CompositionCreateInput {
	name: string;
	category?: string | null;
	color?: string;
	ideal_curve_points?: number[] | null;
	description?: string | null;
	is_active?: boolean;
}

export interface CompositionUpdateInput {
	name?: string;
	category?: string | null;
	color?: string;
	ideal_curve_points?: number[] | null;
	description?: string | null;
	is_active?: boolean;
}

export class CompositionValidationError extends Error {
	constructor(
		public field: string,
		message: string
	) {
		super(message);
		this.name = 'CompositionValidationError';
	}
}

export function validateName(raw: unknown): string {
	if (typeof raw !== 'string') {
		throw new CompositionValidationError('name', 'name must be a string');
	}
	const trimmed = raw.trim();
	if (trimmed.length < 1) {
		throw new CompositionValidationError('name', 'name is required');
	}
	if (trimmed.length > NAME_MAX_LEN) {
		throw new CompositionValidationError('name', `name must be ≤ ${NAME_MAX_LEN} chars`);
	}
	if (trimmed.startsWith('__') && trimmed !== REFERENCE_NAME) {
		throw new CompositionValidationError('name', 'name may not start with __');
	}
	return trimmed;
}

export function validateCategory(raw: unknown): string | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw !== 'string') {
		throw new CompositionValidationError('category', 'category must be a string or null');
	}
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	if (trimmed.length > CATEGORY_MAX_LEN) {
		throw new CompositionValidationError('category', `category must be ≤ ${CATEGORY_MAX_LEN} chars`);
	}
	if (trimmed.startsWith('__')) {
		throw new CompositionValidationError('category', 'category may not start with __');
	}
	return trimmed;
}

export function validateColor(raw: unknown): string {
	if (typeof raw !== 'string') {
		throw new CompositionValidationError('color', 'color must be a string');
	}
	if (!COLOR_HEX_RE.test(raw)) {
		throw new CompositionValidationError('color', 'color must be a 6-digit hex like #24d4ff');
	}
	return raw.toLowerCase();
}

export function validateDescription(raw: unknown): string | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw !== 'string') {
		throw new CompositionValidationError('description', 'description must be a string or null');
	}
	if (raw.length > DESCRIPTION_MAX_LEN) {
		throw new CompositionValidationError(
			'description',
			`description must be ≤ ${DESCRIPTION_MAX_LEN} chars`
		);
	}
	return raw;
}

export function validateCurvePoints(raw: unknown): number[] | null {
	if (raw === null || raw === undefined) return null;
	if (!Array.isArray(raw) || raw.length !== CURVE_POINTS) {
		throw new CompositionValidationError(
			'ideal_curve_points',
			`ideal_curve_points must be an array of exactly ${CURVE_POINTS} finite numbers (or null)`
		);
	}
	const out: number[] = [];
	for (let i = 0; i < raw.length; i++) {
		const v = raw[i];
		const n = typeof v === 'number' ? v : Number(v);
		if (!Number.isFinite(n)) {
			throw new CompositionValidationError(
				'ideal_curve_points',
				`ideal_curve_points[${i}] is not a finite number`
			);
		}
		out.push(Math.max(CURVE_Y_MIN, Math.min(CURVE_Y_MAX, n)));
	}
	return out;
}
