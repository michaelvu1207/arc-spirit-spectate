import type { PageServerLoad } from './$types';
import { supabase, TABLES } from '$lib/supabase';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

// Each ideal curve is exactly POINTS_PER_LINE y-values, indexed by round
// (round = index + 1, so points[0] is round 1, points[23] is round 24).
const POINTS_PER_LINE = 30;
const REFERENCE_TAG = '__reference__';
// y = x: round N earns N VP. Simplest possible "ideal pace" baseline.
const DEFAULT_REFERENCE_POINTS: number[] = Array.from({ length: POINTS_PER_LINE }, (_, i) => i + 1);
const DEFAULT_FLAT_POINTS: number[] = Array.from({ length: POINTS_PER_LINE }, () => 0);
// Max distinct (game_id, player_color) instances we surface per tag. Big
// enough to cover any realistic composition-tag history while keeping the
// payload bounded. Aggregate (avg) is computed across these.
const TAG_INSTANCE_LIMIT = 25;

// One game played under a composition tag — emitted per (game_id, player_color)
// so the detail view can offer a per-game dropdown.
export interface TagGameInstance {
	gameId: string;
	playerColor: string;
	endedAt: string | null;
	totalRounds: number;
	points: Array<{ round: number; vp: number }>;
}

export interface TagSeries {
	tag: string;
	sampleSize: number;
	points: Array<{ round: number; avgVp: number }>;
	instances: TagGameInstance[];
}

export interface TagTarget {
	tag: string;
	// `null` when the user has not defined an ideal curve for this tag.
	ideal_points: number[] | null;
	category: string | null;
}

interface TagRow {
	game_id: string;
	player_color: string;
	tag: string;
	created_at: string | null;
}

interface SnapRow {
	game_id: string;
	player_color: string;
	navigation_count: number;
	victory_points: number | null;
}

interface RawTargetRow {
	tag: string;
	ideal_points: unknown;
	category: string | null;
}

function normalizePointsArray(raw: unknown, fallback: number[]): number[] {
	if (!Array.isArray(raw)) return [...fallback];
	const out: number[] = [];
	for (let i = 0; i < POINTS_PER_LINE; i++) {
		const v = raw[i];
		const n = typeof v === 'number' ? v : Number(v);
		out.push(Number.isFinite(n) ? n : fallback[i] ?? 0);
	}
	return out;
}

export const load: PageServerLoad = async () => {
	const adminClient = getSupabaseAdmin();
	let tagRows: TagRow[] = [];
	let targets: TagTarget[] = [];
	let referencePoints = [...DEFAULT_REFERENCE_POINTS];

	let displayNames: Record<string, string> = {};

	if (adminClient) {
		const [
			{ data: tagsData, error: tagsErr },
			{ data: targetsData, error: targetsErr },
			{ data: metaData, error: metaErr }
		] = await Promise.all([
			adminClient
				.from('player_composition_tags')
				.select('game_id, player_color, tag, created_at')
				.order('created_at', { ascending: false }),
			adminClient.from('composition_tag_targets').select('tag, ideal_points, category'),
			adminClient.from('game_metadata').select('game_id, display_name')
		]);

		if (tagsErr) throw new Error(`Failed to fetch composition tags: ${tagsErr.message}`);
		if (targetsErr) throw new Error(`Failed to fetch composition targets: ${targetsErr.message}`);
		if (metaErr) throw new Error(`Failed to fetch game metadata: ${metaErr.message}`);

		for (const row of (metaData as Array<{ game_id: string; display_name: string | null }> | null) ??
			[]) {
			if (row.display_name && row.display_name.trim()) {
				displayNames[row.game_id] = row.display_name.trim();
			}
		}

		tagRows = (tagsData as TagRow[] | null) ?? [];
		const allTargets = (targetsData as RawTargetRow[] | null) ?? [];

		for (const row of allTargets) {
			if (row.tag === REFERENCE_TAG) {
				referencePoints = normalizePointsArray(row.ideal_points, DEFAULT_REFERENCE_POINTS);
			} else {
				// Only treat the tag as having an ideal when the DB row stored
				// a non-null array; everything else means "no ideal yet".
				const hasIdeal = Array.isArray(row.ideal_points);
				targets.push({
					tag: row.tag,
					ideal_points: hasIdeal
						? normalizePointsArray(row.ideal_points, DEFAULT_FLAT_POINTS)
						: null,
					category: row.category && row.category.trim() ? row.category.trim() : null
				});
			}
		}
	}

	// tag -> ordered list of unique (game, player) instances (recency desc)
	const tagBuckets = new Map<
		string,
		Array<{ gameId: string; playerColor: string; createdAt: string | null }>
	>();
	for (const row of tagRows) {
		if (!row.tag || !row.game_id || !row.player_color) continue;
		let bucket = tagBuckets.get(row.tag);
		if (!bucket) {
			bucket = [];
			tagBuckets.set(row.tag, bucket);
		}
		if (bucket.length >= TAG_INSTANCE_LIMIT) continue;
		const key = `${row.game_id}:${row.player_color}`;
		if (!bucket.some((e) => `${e.gameId}:${e.playerColor}` === key)) {
			bucket.push({
				gameId: row.game_id,
				playerColor: row.player_color,
				createdAt: row.created_at
			});
		}
	}

	const tagGameIds = Array.from(
		new Set(Array.from(tagBuckets.values()).flatMap((b) => b.map((e) => e.gameId)))
	);

	let tagSnaps: SnapRow[] = [];
	if (tagGameIds.length > 0) {
		const { data: snapData, error: snapErr } = await supabase
			.from(TABLES.GAME_STATE_SNAPSHOTS)
			.select('game_id, player_color, navigation_count, victory_points')
			.in('game_id', tagGameIds);
		if (snapErr) {
			throw new Error(`Failed to fetch snapshots for composition tags: ${snapErr.message}`);
		}
		tagSnaps = (snapData as SnapRow[] | null) ?? [];
	}

	// Index snapshots once: (game_id|player_color) -> sorted points
	const snapsByPlayer = new Map<string, Array<{ round: number; vp: number }>>();
	for (const r of tagSnaps) {
		const key = `${r.game_id}:${r.player_color}`;
		const list = snapsByPlayer.get(key) ?? [];
		list.push({ round: r.navigation_count, vp: r.victory_points ?? 0 });
		snapsByPlayer.set(key, list);
	}
	for (const list of snapsByPlayer.values()) list.sort((a, b) => a.round - b.round);

	const tagSeries: TagSeries[] = Array.from(tagBuckets.entries())
		.filter(([, bucket]) => bucket.length > 0)
		.map(([tag, bucket]) => {
			const instances: TagGameInstance[] = bucket.map((b) => {
				const pts = snapsByPlayer.get(`${b.gameId}:${b.playerColor}`) ?? [];
				const totalRounds = pts.length > 0 ? pts[pts.length - 1].round : 0;
				return {
					gameId: b.gameId,
					playerColor: b.playerColor,
					endedAt: b.createdAt,
					totalRounds,
					points: pts.map((p) => ({ round: p.round, vp: p.vp }))
				};
			});

			// Aggregate avg-VP per round across every instance.
			const byRound = new Map<number, { sum: number; n: number }>();
			for (const inst of instances) {
				for (const p of inst.points) {
					const e = byRound.get(p.round) ?? { sum: 0, n: 0 };
					e.sum += p.vp;
					e.n += 1;
					byRound.set(p.round, e);
				}
			}
			const points = Array.from(byRound.entries())
				.sort(([a], [b]) => a - b)
				.map(([round, e]) => ({ round, avgVp: e.sum / Math.max(1, e.n) }));

			return { tag, sampleSize: bucket.length, points, instances };
		})
		.sort((a, b) => a.tag.localeCompare(b.tag));

	return {
		tagSeries,
		referencePoints,
		targets,
		pointsPerLine: POINTS_PER_LINE,
		gameDisplayNames: displayNames
	};
};
