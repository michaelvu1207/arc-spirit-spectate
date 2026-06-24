/**
 * Ranked matchmaking pairing.
 *
 * `tryFormRankedMatch` asks the DB (under a transaction-level advisory lock — see
 * the `arc_spirits_2d.try_form_ranked_match` SQL function) to atomically claim one
 * in-window group of RANKED_LOBBY_SIZE queued players, then creates a started ranked
 * session for them and stamps each claimed queue row with the new session id.
 *
 * Race-safe: the SQL function serializes all pairing attempts and flips the chosen
 * rows to status='matched' in the same statement, so two concurrent polls can never
 * pair the same player twice. If session creation fails after the claim, the rows
 * are rolled back to 'queued' so the players re-enter the pool.
 *
 * All writes go through the play admin client (arc_spirits_2d schema).
 */
import { ordinal, rating } from 'openskill';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { RANKED_LOBBY_SIZE } from '../types';
import { createRankedSession, type RankedPlayer } from './service';
import { botsOnlineAt } from './botRoster';

const PLAY_SCHEMA = 'arc_spirits_2d';
const QUEUE_TABLE = 'match_queue';
const RATINGS_TABLE = 'player_ratings';
const SESSIONS_TABLE = 'play_game_sessions';
const MEMBERS_TABLE = 'play_session_members';

// Ordinal-spread matchmaking window (in ordinal units). Starts tight and widens with
// the oldest queued player's wait so nobody waits forever for a perfect-skill group.
const BASE_WINDOW = 5.0; // initial acceptable ordinal spread
const WIDEN_PER_SEC = 0.5; // widen by this much per second of the oldest member's wait
const MAX_WINDOW = 100.0; // hard cap on the spread

// A 'matched' queue row whose updated_at is older than this has long since handed off
// to a session; reap it so the queue table doesn't accumulate stale matched rows.
const STALE_MATCHED_MS = 10 * 60 * 1000; // 10 minutes

interface QueueRow {
	user_id: string;
	display_name: string | null;
	status: string;
	is_bot: boolean;
	bot_profile: string | null;
}

function getAdmin() {
	return getSupabaseAdmin(PLAY_SCHEMA);
}

/** A bot account eligible for matchmaking backfill (one row of player_ratings). */
export interface BotCandidate {
	user_id: string;
	display_name: string | null;
	mu: number;
	sigma: number;
	bot_profile: string | null;
}

/** Compute a bot's ordinal the same way OpenSkill does (mu - 3*sigma); player_ratings
 *  has no ordinal column for bots, so we derive it from mu/sigma. */
export function botOrdinal(c: Pick<BotCandidate, 'mu' | 'sigma'>): number {
	return c.mu - 3 * c.sigma;
}

/**
 * Pure helper: order bot candidates by skill proximity to the human (nearest ordinal
 * first) and take the nearest `take`. Extracted so the selection/ordering is unit-testable
 * without a live DB. Stable for equal distances (preserves input order via index tiebreak).
 */
export function pickNearestBots(
	candidates: BotCandidate[],
	humanOrdinal: number,
	take: number
): BotCandidate[] {
	return candidates
		.map((c, i) => ({ c, i, dist: Math.abs(botOrdinal(c) - humanOrdinal) }))
		.sort((a, b) => a.dist - b.dist || a.i - b.i)
		.slice(0, Math.max(0, take))
		.map((x) => x.c);
}

/**
 * Attempt to form ONE ranked match from the current queue. Returns the created room
 * code when a group was paired + a session created, or null when there aren't enough
 * in-window players yet. Best-effort: logs and swallows transient errors (callers
 * poll again shortly).
 */
export async function tryFormRankedMatch(): Promise<{ roomCode: string } | null> {
	const admin = getAdmin();
	if (!admin) return null;

	// 1) Atomically claim an in-window group (advisory-locked SQL function). The chosen
	//    rows come back already flipped to status='matched'.
	const claimed = await admin.rpc('try_form_ranked_match', {
		p_lobby_size: RANKED_LOBBY_SIZE,
		p_base_window: BASE_WINDOW,
		p_widen_per_sec: WIDEN_PER_SEC,
		p_max_window: MAX_WINDOW
	});
	if (claimed.error) {
		console.error('[matchmaking] try_form_ranked_match RPC failed:', claimed.error.message);
		return null;
	}

	const rows = (claimed.data as QueueRow[] | null) ?? [];
	if (rows.length < RANKED_LOBBY_SIZE) {
		// Either no in-window group, or a partial/empty claim — nothing to start.
		// (A non-empty-but-short claim shouldn't happen given the SQL, but guard anyway:
		// release any stray claimed rows back to the pool.)
		if (rows.length > 0) await releaseToQueue(rows.map((r) => r.user_id));
		return null;
	}

	// Build the player list, carrying each row's bot flags through. Sort humans first so
	// createRankedSession's host (players[0]) is always a human (the SQL matcher guarantees
	// ≥1 human per claimed group). Stable within each group preserves queued order.
	const players: RankedPlayer[] = rows
		.map((r) => ({
			userId: r.user_id,
			displayName: r.display_name ?? 'Player',
			isBot: r.is_bot,
			botProfile: r.bot_profile
		}))
		.sort((a, b) => Number(a.isBot) - Number(b.isBot));

	// 2) Create the started ranked session for the claimed group.
	let created: { roomCode: string; sessionId: string };
	try {
		created = await createRankedSession(players);
	} catch (err) {
		console.error('[matchmaking] createRankedSession failed; releasing claim:', err);
		await releaseToQueue(players.map((p) => p.userId));
		return null;
	}

	// 3) Stamp each claimed queue row with the new session id so the owners' next poll
	//    resolves the room. Best-effort — the session already exists; a stamp failure
	//    just means a slightly slower hand-off (the row stays 'matched').
	const stamp = await admin
		.from(QUEUE_TABLE)
		.update({ claimed_session_id: created.sessionId, updated_at: new Date().toISOString() })
		.in(
			'user_id',
			players.map((p) => p.userId)
		);
	if (stamp.error) {
		console.error('[matchmaking] failed to stamp claimed_session_id:', stamp.error.message);
	}

	return { roomCode: created.roomCode };
}

/** Roll a set of claimed rows back to 'queued' (used when session creation fails). */
async function releaseToQueue(userIds: string[]): Promise<void> {
	const admin = getAdmin();
	if (!admin || userIds.length === 0) return;
	const res = await admin
		.from(QUEUE_TABLE)
		.update({ status: 'queued', claimed_session_id: null, updated_at: new Date().toISOString() })
		.in('user_id', userIds)
		.eq('status', 'matched');
	if (res.error) {
		console.error('[matchmaking] failed to release claim back to queue:', res.error.message);
	}
}

/**
 * Backfill the ranked queue with rating-appropriate bots so a waiting human sees real-
 * looking players "join" over a few seconds and is reliably matched. Best-effort: any
 * failure is swallowed so it can never break the human's poll path.
 *
 * Time-ramp: the longer the human waits, the more bots we enqueue (a "lobby filling"
 * feel). Once they've waited ≥4s we always top the queue up to RANKED_LOBBY_SIZE so a
 * match is guaranteed fillable by ~4-6s.
 */
async function ensureBotPresence(humanUserId: string, humanOrdinal: number): Promise<void> {
	const admin = getAdmin();
	if (!admin) return;
	try {
		// 1) How long has this human been waiting, how many are queued, which bots are
		//    already queued, and which bots are currently seated in a live session.
		const [meRes, queuedCountRes, queuedBotIdsRes, seatedBotIdsRes] = await Promise.all([
			admin.from(QUEUE_TABLE).select('queued_at').eq('user_id', humanUserId).maybeSingle(),
			admin.from(QUEUE_TABLE).select('user_id', { count: 'exact', head: true }).eq('status', 'queued'),
			admin.from(QUEUE_TABLE).select('user_id').eq('status', 'queued').eq('is_bot', true),
			// Bots seated in a non-finished session: inner-join members→sessions and keep only
			// rows whose session is still lobby/active. Best-effort — see the swallow below.
			admin
				.from(MEMBERS_TABLE)
				.select('user_id, play_game_sessions!inner(status)')
				.eq('is_bot', true)
				.in('play_game_sessions.status', ['lobby', 'active'])
		]);

		const queuedAtMs = meRes.data?.queued_at ? Date.parse(meRes.data.queued_at as string) : Date.now();
		const waitSec = Math.max(0, (Date.now() - queuedAtMs) / 1000);
		const currentQueued = queuedCountRes.count ?? 0;

		// Exclusion set: bots already queued PLUS bots currently seated in a live session.
		// The latter prevents the same bot (e.g. "Mia") appearing in two concurrent games.
		// If the seated-bots query errored, we just skip that exclusion (fall back to prior
		// behavior) — match reliability must never depend on this guard.
		const excludedBotIds = new Set<string>(
			((queuedBotIdsRes.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id)
		);
		for (const r of (seatedBotIdsRes.data as { user_id: string }[] | null) ?? []) {
			excludedBotIds.add(r.user_id);
		}

		// 2) Pull bot candidates from player_ratings (bot_profile is non-null only for the
		//    seeded bot accounts). Drop any excluded (already-queued or mid-game) bots.
		const candidatesRes = await admin
			.from(RATINGS_TABLE)
			.select('user_id, display_name, mu, sigma, bot_profile')
			.not('bot_profile', 'is', null);
		const allBots = ((candidatesRes.data as BotCandidate[] | null) ?? []).filter(
			(b) => !excludedBotIds.has(b.user_id)
		);

		// 2b) Anti-detection rotation: prefer the deterministic "online" subset for this time
		//     bucket so the visible cast rotates rather than always being the same ~30 names.
		//     Keyed on user_id (candidates have no slug). NEVER let rotation starve a match:
		//     pick from online first, then top up from the full eligible pool if the nearest
		//     online bots don't cover what we need. Match reliability beats rotation purity.
		const onlineIds = new Set(
			botsOnlineAt(allBots, Date.now(), { key: (b) => b.user_id }).map((b) => b.user_id)
		);
		const onlineBots = allBots.filter((b) => onlineIds.has(b.user_id));
		// Nearest ~5 from the online subset, then nearest ~5 from the full pool as fallback,
		// de-duplicated with online taking precedence (so rotation is honored when sufficient).
		const nearestOnline = pickNearestBots(onlineBots, humanOrdinal, 5);
		const nearestAll = pickNearestBots(allBots, humanOrdinal, 5);
		const nearestSeen = new Set(nearestOnline.map((b) => b.user_id));
		const nearest = [...nearestOnline, ...nearestAll.filter((b) => !nearestSeen.has(b.user_id))];
		if (nearest.length === 0) return;

		// 3) Decide how many to enqueue this tick.
		//    - Ramp: ~1 bot immediately, +1 per 2s of waiting (the visible "players joining").
		//    - Floor: once waited ≥4s, ALWAYS enqueue enough to reach RANKED_LOBBY_SIZE so a
		//      match can form by ~4-6s.
		const ramp = Math.max(1, Math.floor(waitSec / 2) + 1);
		const topUpToFull = waitSec >= 4 ? Math.max(0, RANKED_LOBBY_SIZE - currentQueued) : 0;
		const want = Math.min(nearest.length, Math.max(ramp, topUpToFull));
		const toEnqueue = nearest.slice(0, want);
		if (toEnqueue.length === 0) return;

		// 4) Upsert each chosen bot into the queue (keyed on user_id).
		const now = new Date().toISOString();
		const rows = toEnqueue.map((b) => ({
			user_id: b.user_id,
			display_name: b.display_name,
			mu: b.mu,
			sigma: b.sigma,
			ordinal: botOrdinal(b),
			party_size: 1,
			status: 'queued',
			claimed_session_id: null,
			is_bot: true,
			bot_profile: b.bot_profile,
			queued_at: now,
			updated_at: now
		}));
		await admin.from(QUEUE_TABLE).upsert(rows, { onConflict: 'user_id' });
	} catch (err) {
		console.error('[matchmaking] ensureBotPresence failed (swallowed):', err);
	}
}

/**
 * Reap lingering queued bots when no human is left waiting: if ZERO human rows are
 * status='queued', cancel every queued bot so they don't sit in an empty queue (and
 * can't form a bot-only match — the SQL matcher already forbids that, but this keeps the
 * queue clean). Best-effort: swallows errors.
 */
async function reapQueuedBots(): Promise<void> {
	const admin = getAdmin();
	if (!admin) return;
	try {
		const humans = await admin
			.from(QUEUE_TABLE)
			.select('user_id', { count: 'exact', head: true })
			.eq('status', 'queued')
			.eq('is_bot', false);
		if ((humans.count ?? 0) > 0) return; // a human is still waiting — leave bots in place

		await admin
			.from(QUEUE_TABLE)
			.update({ status: 'cancelled', updated_at: new Date().toISOString() })
			.eq('status', 'queued')
			.eq('is_bot', true);
	} catch (err) {
		console.error('[matchmaking] reapQueuedBots failed (swallowed):', err);
	}
}

/**
 * Reap stale 'matched' queue rows (humans + bots). Once a group is paired, its rows are
 * flipped to status='matched' and the session takes over; the rows are never touched
 * again and would otherwise accumulate forever. Cancel any whose updated_at is older than
 * STALE_MATCHED_MS — long past the hand-off window, so this can't clobber a just-formed
 * match still resolving its room. Best-effort: swallows errors.
 */
async function reapStaleQueueRows(): Promise<void> {
	const admin = getAdmin();
	if (!admin) return;
	try {
		const cutoff = new Date(Date.now() - STALE_MATCHED_MS).toISOString();
		await admin
			.from(QUEUE_TABLE)
			.update({ status: 'cancelled', updated_at: new Date().toISOString() })
			.eq('status', 'matched')
			.lt('updated_at', cutoff);
	} catch (err) {
		console.error('[matchmaking] reapStaleQueueRows failed (swallowed):', err);
	}
}

/** A single player currently waiting in the ranked queue. */
export interface QueuedPlayer {
	userId: string;
	displayName: string;
	/** True for the polling user's own row, so the client can highlight "you". */
	you: boolean;
}

/** Outcome of a queue poll, returned to the client. */
export interface QueuePollResult {
	status: 'searching' | 'matched';
	/** Room code to navigate to, when matched and the session id is resolvable. */
	roomCode?: string;
	/** This user's session member id in the matched game (for cookie/cross-origin storage). */
	memberId?: string;
	/** How many players are currently queued (this user included). */
	queued: number;
	/** Target lobby size. */
	needed: number;
	/** The players currently waiting in the queue (oldest first, capped). */
	players: QueuedPlayer[];
}

/**
 * Enqueue (or refresh) this user for ranked, run one pairing attempt, and report
 * back this user's status. Idempotent per user (the queue pk is user_id): re-calling
 * while 'queued' just refreshes; while 'matched' it resolves the room. Throws only on
 * a hard enqueue failure; pairing/resolution errors degrade to 'searching'.
 */
export async function enqueueAndPoll(
	userId: string,
	displayName: string
): Promise<QueuePollResult> {
	const admin = getAdmin();
	if (!admin) throw new Error('Matchmaking is unavailable (no service-role key).');

	// If already matched, skip re-enqueue and just resolve the room.
	const existing = await admin
		.from(QUEUE_TABLE)
		.select('status, claimed_session_id')
		.eq('user_id', userId)
		.maybeSingle();
	if (existing.error) throw new Error(`Queue lookup failed: ${existing.error.message}`);

	const alreadyMatched =
		existing.data?.status === 'matched' && existing.data?.claimed_session_id != null;

	if (!alreadyMatched) {
		// Seed mu/sigma/ordinal from the player's current rating (default for new players).
		const ratingRes = await admin
			.from(RATINGS_TABLE)
			.select('mu, sigma')
			.eq('user_id', userId)
			.maybeSingle();
		if (ratingRes.error) throw new Error(`Rating lookup failed: ${ratingRes.error.message}`);
		const seed = ratingRes.data
			? rating({ mu: ratingRes.data.mu, sigma: ratingRes.data.sigma })
			: rating();
		const ord = ordinal(seed);

		const upsert = await admin.from(QUEUE_TABLE).upsert(
			{
				user_id: userId,
				display_name: displayName,
				mu: seed.mu,
				sigma: seed.sigma,
				ordinal: ord,
				party_size: 1,
				status: 'queued',
				claimed_session_id: null,
				queued_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);
		if (upsert.error) throw new Error(`Failed to enqueue: ${upsert.error.message}`);

		// Backfill the queue with rating-appropriate bots (best-effort, never throws) so the
		// human sees players join and a match is reliably fillable. Runs BEFORE pairing so the
		// fresh bots are in the pool for this tick's match attempt.
		await ensureBotPresence(userId, ord);

		// Try to form a match now that this player (and any backfilled bots) are in the pool.
		await tryFormRankedMatch();
	}

	return resolveQueueStatus(userId);
}

/** Resolve a user's current queue status into a client poll result. */
export async function resolveQueueStatus(userId: string): Promise<QueuePollResult> {
	const admin = getAdmin();
	if (!admin) return { status: 'searching', queued: 0, needed: RANKED_LOBBY_SIZE, players: [] };

	// Best-effort: clear out any bots lingering in an empty (human-less) queue, and any
	// long-stale 'matched' rows that already handed off to a session, before we report
	// status — so the counts the client sees stay honest and the queue table stays lean.
	await reapQueuedBots();
	await reapStaleQueueRows();

	const [me, countRes, listRes] = await Promise.all([
		admin.from(QUEUE_TABLE).select('status, claimed_session_id').eq('user_id', userId).maybeSingle(),
		admin.from(QUEUE_TABLE).select('user_id', { count: 'exact', head: true }).eq('status', 'queued'),
		admin
			.from(QUEUE_TABLE)
			.select('user_id, display_name')
			.eq('status', 'queued')
			.order('queued_at', { ascending: true })
			.limit(12)
	]);

	const queued = countRes.count ?? 0;
	const players: QueuedPlayer[] = (
		(listRes.data as { user_id: string; display_name: string | null }[] | null) ?? []
	).map((r) => ({
		userId: r.user_id,
		displayName: r.display_name ?? 'Player',
		you: r.user_id === userId
	}));
	const base = { queued, needed: RANKED_LOBBY_SIZE, players } as const;

	if (me.data?.status === 'matched' && me.data?.claimed_session_id != null) {
		const sessionId = me.data.claimed_session_id as string;
		// Resolve the room code + this user's member id in the matched session, so the
		// endpoint can set the room-member cookie and the client can store it.
		const [sess, mem] = await Promise.all([
			admin.from(SESSIONS_TABLE).select('room_code').eq('id', sessionId).maybeSingle(),
			admin
				.from(MEMBERS_TABLE)
				.select('id')
				.eq('session_id', sessionId)
				.eq('user_id', userId)
				.maybeSingle()
		]);
		const roomCode = (sess.data as { room_code?: string } | null)?.room_code;
		const memberId = (mem.data as { id?: string } | null)?.id;
		if (roomCode) return { status: 'matched', roomCode, memberId, ...base };
	}

	return { status: 'searching', ...base };
}

/** Remove this user from the queue (cancel search). */
export async function leaveQueue(userId: string): Promise<void> {
	const admin = getAdmin();
	if (!admin) return;
	// Only cancel a still-searching row — never clobber a 'matched' hand-off.
	const res = await admin
		.from(QUEUE_TABLE)
		.update({ status: 'cancelled', updated_at: new Date().toISOString() })
		.eq('user_id', userId)
		.eq('status', 'queued');
	if (res.error) {
		console.error('[matchmaking] leaveQueue failed:', res.error.message);
		throw new Error(res.error.message);
	}

	// This human just left — if they were the last one, reap any queued bots so they don't
	// linger in an empty queue. Best-effort (never throws).
	await reapQueuedBots();
}
