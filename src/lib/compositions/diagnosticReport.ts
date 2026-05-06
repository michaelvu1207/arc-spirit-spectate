// Pure function: snapshots + curves -> markdown diagnostic report.
// Skips players whose composition has no ideal_curve_points (per CEO 2.3-A).

import type { Composition } from './schema';

export interface PlayerVp {
	playerColor: string;
	round: number;
	vp: number;
}

export interface PlayerTag {
	playerColor: string;
	composition: Composition | null;
}

export interface ReportOptions {
	gameId: string;
	gameDisplayName?: string;
	gameDate?: string;
}

interface PerPlayer {
	playerColor: string;
	composition: Composition;
	deltas: number[];          // actual - ideal per round
	peakOverRound: number;     // round of peak positive delta
	peakOver: number;
	peakUnderRound: number;
	peakUnder: number;
	integrated: number;        // sum of all deltas
	totalRounds: number;
}

function computePerPlayer(
	tag: PlayerTag,
	vps: PlayerVp[]
): PerPlayer | null {
	const c = tag.composition;
	if (!c || !c.ideal_curve_points) return null;

	const deltas: number[] = [];
	let peakOver = -Infinity;
	let peakOverRound = 0;
	let peakUnder = Infinity;
	let peakUnderRound = 0;

	for (const v of vps) {
		const idx = v.round - 1;
		if (idx < 0 || idx >= c.ideal_curve_points.length) continue;
		const ideal = c.ideal_curve_points[idx];
		const delta = v.vp - ideal;
		deltas.push(delta);
		if (delta > peakOver) {
			peakOver = delta;
			peakOverRound = v.round;
		}
		if (delta < peakUnder) {
			peakUnder = delta;
			peakUnderRound = v.round;
		}
	}

	if (deltas.length === 0) return null;

	const integrated = deltas.reduce((s, d) => s + d, 0);
	return {
		playerColor: tag.playerColor,
		composition: c,
		deltas,
		peakOverRound,
		peakOver: peakOver === -Infinity ? 0 : peakOver,
		peakUnderRound,
		peakUnder: peakUnder === Infinity ? 0 : peakUnder,
		integrated,
		totalRounds: vps.length
	};
}

function fmtSigned(n: number): string {
	const r = Math.round(n * 10) / 10;
	if (r > 0) return `+${r}`;
	return `${r}`;
}

export function generateDiagnosticReport(
	tags: PlayerTag[],
	vpsByPlayer: Map<string, PlayerVp[]>,
	opts: ReportOptions
): string {
	const header = opts.gameDisplayName
		? `# Diagnostic — ${opts.gameDisplayName}`
		: `# Diagnostic — Game ${opts.gameId.slice(0, 8)}`;

	const dateLine = opts.gameDate ? `_Date: ${opts.gameDate}_` : '';

	const computed: PerPlayer[] = [];
	const skipped: string[] = [];

	for (const tag of tags) {
		if (!tag.composition) {
			skipped.push(`${tag.playerColor}: no composition tagged`);
			continue;
		}
		if (!tag.composition.ideal_curve_points) {
			skipped.push(`${tag.playerColor} (${tag.composition.name}): no ideal curve defined`);
			continue;
		}
		const vps = vpsByPlayer.get(tag.playerColor) ?? [];
		const result = computePerPlayer(tag, vps);
		if (result) computed.push(result);
		else skipped.push(`${tag.playerColor} (${tag.composition.name}): no VP snapshots`);
	}

	const lines: string[] = [header];
	if (dateLine) lines.push('', dateLine);

	if (computed.length === 0 && skipped.length === 0) {
		lines.push('', '_No tagged players in this game._');
		return lines.join('\n');
	}

	if (computed.length > 0) {
		lines.push('', '## Player diagnostics', '');
		for (const p of computed) {
			lines.push(`### ${p.playerColor} — ${p.composition.name}`);
			if (p.composition.category) {
				lines.push(`*Category: ${p.composition.category}*`);
			}
			lines.push('');
			lines.push(`- Tracked over ${p.totalRounds} rounds`);
			lines.push(
				`- Peak over ideal: ${fmtSigned(p.peakOver)} VP at round ${p.peakOverRound}`
			);
			lines.push(
				`- Peak under ideal: ${fmtSigned(p.peakUnder)} VP at round ${p.peakUnderRound}`
			);
			lines.push(`- Integrated delta: ${fmtSigned(p.integrated)} VP across the game`);

			const verdict =
				p.integrated > 5
					? '**Overdelivered** — composition may be too strong'
					: p.integrated < -5
						? '**Underdelivered** — composition may be too weak or misplayed'
						: 'Tracked close to ideal';
			lines.push('', `> ${verdict}`, '');
		}
	}

	if (skipped.length > 0) {
		lines.push('## Skipped', '');
		for (const s of skipped) lines.push(`- ${s}`);
	}

	return lines.join('\n');
}
