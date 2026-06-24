/**
 * Canonical roster of persistent ranked bot accounts — the SINGLE source of truth shared
 * by the seed script (scripts/seed-bots.ts) and Phase 2 matchmaking backfill.
 *
 * Each bot is a REAL account (seeded into auth.users by the seed script) with a human-
 * looking display name and a `bot_profile` difficulty key from BOT_PROFILES (botPolicy.ts).
 * They sit on the leaderboard and affect OpenSkill ratings exactly like humans; only the
 * `is_bot` column + the bot engine driving their turns distinguishes them.
 *
 * The display names are deliberately ordinary first-name handles (no 🤖, no "bot") so a
 * matchmade human can't tell a bot apart by name. `slug` derives the stable bot email
 * (bot+<slug>@arcspirits.bot) used for idempotent seeding.
 */

/** A difficulty/strategy key that MUST exist in BOT_PROFILES (botPolicy.ts). */
export type BotProfileKey = 'medium' | 'hard' | 'extrahard' | 'insane' | 'godly';

export interface BotRosterEntry {
	/** Human-looking display name shown in lobbies, the leaderboard, and match results. */
	displayName: string;
	/** Stable slug → bot email (bot+<slug>@arcspirits.bot). Lowercase, unique. */
	slug: string;
	/** BOT_PROFILES key driving this bot's play; also stored on player_ratings/auth metadata. */
	botProfile: BotProfileKey;
}

/** The bot email for a roster slug (the idempotency key for seeding). */
export function botEmail(slug: string): string {
	return `bot+${slug}@arcspirits.bot`;
}

// ── Online rotation (anti-detection) ─────────────────────────────────────────
// The full bot pool is ~30 fixed names; if all of them were always eligible to
// appear, a human would notice the same cast every game. `botsOnlineAt` returns a
// rotating, deterministic subset ("who's online right now") so the visible roster
// shifts over time without any randomness or DB state. Pure + exported so it's
// unit-testable, and so matchmaking can prefer-but-not-require the online subset.

/** Default rotation bucket length: the online subset changes every 8 minutes. */
export const ONLINE_BUCKET_MS = 8 * 60 * 1000;
/** Default fraction of the pool considered "online" in any bucket (~65%). */
export const ONLINE_FRACTION = 0.65;

/** Deterministic uint32 hash of a string (same family as the seed-bots slug hash). */
function hashSlug(slug: string): number {
	let h = 0;
	for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return h >>> 0;
}

/**
 * Return the rotating "online" subset of `bots` for the time bucket containing
 * `epochMs`. Deterministic: the same bucket always yields the same subset, and the
 * subset shifts to a different (overlapping) set in adjacent buckets.
 *
 * How: each bot gets a per-bucket score from a stable hash of (a per-bot key + the
 * bucket index). We sort by that score and take the top `fraction` of the pool.
 * Because the bucket index feeds the hash, the ordering re-shuffles every bucket — no
 * Math.random, no DB, fully reproducible from epochMs.
 *
 * Generic over the identity field via `opts.key` (defaults to a `slug` property) so it
 * works on both the static roster (`slug`) and live bot candidates (e.g. `user_id`).
 *
 * @param opts.bucketMs  bucket length in ms (default ONLINE_BUCKET_MS)
 * @param opts.fraction  share of the pool to mark online, clamped to [0,1] (default ONLINE_FRACTION)
 * @param opts.key       stable per-bot identity string (default `b.slug`)
 */
export function botsOnlineAt<T>(
	bots: readonly T[],
	epochMs: number,
	opts?: { bucketMs?: number; fraction?: number; key?: (b: T) => string }
): T[] {
	const n = bots.length;
	if (n === 0) return [];
	const bucketMs = opts?.bucketMs ?? ONLINE_BUCKET_MS;
	const fraction = Math.min(1, Math.max(0, opts?.fraction ?? ONLINE_FRACTION));
	const keyOf = opts?.key ?? ((b: T) => (b as { slug: string }).slug);
	// Floor toward -inf so negative epochMs still buckets sanely.
	const bucket = Math.floor(epochMs / bucketMs) >>> 0;
	// At least 1 online whenever the pool is non-empty, so rotation can never empty it.
	const take = Math.max(1, Math.round(n * fraction));
	return bots
		.map((b, i) => ({ b, i, score: hashSlug(`${keyOf(b)}#${bucket}`) }))
		.sort((a, b) => a.score - b.score || a.i - b.i)
		.slice(0, take)
		.map((x) => x.b);
}

/**
 * ~30 persistent bots spread across difficulty tiers — weaker tiers are the majority (so
 * the rating pool skews low-to-mid and a new human lands mid-pack), with a few strong ones
 * up top. Difficulty correlates with the seeded mu in the seed script, so the leaderboard
 * spread looks believably earned.
 */
export const BOT_ROSTER: readonly BotRosterEntry[] = [
	{ displayName: 'Nameless Spirit', slug: 'mia', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'leo', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'ava', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'noah', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'ella', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'finn', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'ruby', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'owen', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'iris', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'jack', botProfile: 'medium' },
	{ displayName: 'Nameless Spirit', slug: 'nora', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'theo', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'hazel', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'milo', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'clara', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'wyatt', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'lena', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'caleb', botProfile: 'hard' },
	{ displayName: 'Nameless Spirit', slug: 'faye', botProfile: 'extrahard' },
	{ displayName: 'Nameless Spirit', slug: 'reid', botProfile: 'extrahard' },
	{ displayName: 'Nameless Spirit', slug: 'tessa', botProfile: 'extrahard' },
	{ displayName: 'Nameless Spirit', slug: 'dax', botProfile: 'extrahard' },
	{ displayName: 'Nameless Spirit', slug: 'vera', botProfile: 'extrahard' },
	{ displayName: 'Nameless Spirit', slug: 'cole', botProfile: 'extrahard' },
	{ displayName: 'Nameless Spirit', slug: 'mara', botProfile: 'insane' },
	{ displayName: 'Nameless Spirit', slug: 'silas', botProfile: 'insane' },
	{ displayName: 'Nameless Spirit', slug: 'juno', botProfile: 'insane' },
	{ displayName: 'Nameless Spirit', slug: 'ezra', botProfile: 'insane' },
	{ displayName: 'Nameless Spirit', slug: 'wren', botProfile: 'godly' },
	{ displayName: 'Nameless Spirit', slug: 'kai', botProfile: 'godly' }
];
