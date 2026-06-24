import { describe, expect, test } from 'vitest';
import {
	BOT_ROSTER,
	ONLINE_BUCKET_MS,
	botsOnlineAt
} from './botRoster';

const BUCKET = ONLINE_BUCKET_MS;

describe('botsOnlineAt', () => {
	test('is deterministic within a bucket (same subset for any epoch in the bucket)', () => {
		const a = botsOnlineAt(BOT_ROSTER, 5 * BUCKET);
		const b = botsOnlineAt(BOT_ROSTER, 5 * BUCKET + BUCKET - 1); // same bucket, later instant
		expect(b.map((x) => x.slug)).toEqual(a.map((x) => x.slug));
	});

	test('rotates over buckets (membership shifts across the time range)', () => {
		// Two adjacent buckets can coincide (top-65% overlap is possible), but the online
		// set must not be frozen across the whole range — at least one bucket differs from
		// bucket 0, and over many buckets the membership genuinely churns.
		const base = new Set(botsOnlineAt(BOT_ROSTER, 0).map((x) => x.slug));
		let anyDifferent = false;
		for (let bucket = 1; bucket <= 24; bucket++) {
			const here = new Set(botsOnlineAt(BOT_ROSTER, bucket * BUCKET).map((x) => x.slug));
			if (here.size !== base.size || [...here].some((s) => !base.has(s))) {
				anyDifferent = true;
				break;
			}
		}
		expect(anyDifferent).toBe(true);
	});

	test('returns ~65% of the pool by default', () => {
		const online = botsOnlineAt(BOT_ROSTER, 5 * BUCKET);
		expect(online.length).toBe(Math.round(BOT_ROSTER.length * 0.65));
	});

	test('honors a custom fraction, clamped to [0,1]', () => {
		expect(botsOnlineAt(BOT_ROSTER, 0, { fraction: 1 }).length).toBe(BOT_ROSTER.length);
		// fraction 0 still yields at least 1 (rotation can never empty a non-empty pool).
		expect(botsOnlineAt(BOT_ROSTER, 0, { fraction: 0 }).length).toBe(1);
		// out-of-range fractions clamp rather than throw.
		expect(botsOnlineAt(BOT_ROSTER, 0, { fraction: 5 }).length).toBe(BOT_ROSTER.length);
		expect(botsOnlineAt(BOT_ROSTER, 0, { fraction: -5 }).length).toBe(1);
	});

	test('every bot appears online across enough buckets (full coverage, no starved name)', () => {
		const seen = new Set<string>();
		for (let bucket = 0; bucket < 200; bucket++) {
			for (const b of botsOnlineAt(BOT_ROSTER, bucket * BUCKET)) seen.add(b.slug);
		}
		expect(seen.size).toBe(BOT_ROSTER.length);
	});

	test('returns subset members drawn from the input pool', () => {
		const slugs = new Set(BOT_ROSTER.map((b) => b.slug));
		for (const b of botsOnlineAt(BOT_ROSTER, 12 * BUCKET)) {
			expect(slugs.has(b.slug)).toBe(true);
		}
	});

	test('empty pool yields empty subset', () => {
		expect(botsOnlineAt([], 5 * BUCKET)).toEqual([]);
	});

	test('respects a custom key extractor (works on candidate-shaped objects)', () => {
		const cands = [
			{ user_id: 'u1' },
			{ user_id: 'u2' },
			{ user_id: 'u3' },
			{ user_id: 'u4' }
		];
		const out = botsOnlineAt(cands, 3 * BUCKET, { key: (c) => c.user_id, fraction: 0.5 });
		expect(out.length).toBe(2);
		// deterministic for the same bucket + key
		const out2 = botsOnlineAt(cands, 3 * BUCKET, { key: (c) => c.user_id, fraction: 0.5 });
		expect(out2.map((c) => c.user_id)).toEqual(out.map((c) => c.user_id));
	});

	test('honors a custom bucketMs (epochs in the same small bucket coincide)', () => {
		const small = 1000;
		// Two instants within the same 1s bucket → identical subset.
		const a = botsOnlineAt(BOT_ROSTER, 0, { bucketMs: small }).map((x) => x.slug);
		const b = botsOnlineAt(BOT_ROSTER, small - 1, { bucketMs: small }).map((x) => x.slug);
		expect(b).toEqual(a);
		// With small buckets, membership churns across the range (full coverage proves
		// nothing is frozen); assert at least one of the first 24 small-buckets differs.
		const base = new Set(a);
		let anyDifferent = false;
		for (let bucket = 1; bucket <= 24; bucket++) {
			const here = new Set(botsOnlineAt(BOT_ROSTER, bucket * small, { bucketMs: small }).map((x) => x.slug));
			if (here.size !== base.size || [...here].some((s) => !base.has(s))) {
				anyDifferent = true;
				break;
			}
		}
		expect(anyDifferent).toBe(true);
	});
});
