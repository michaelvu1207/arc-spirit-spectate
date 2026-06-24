/**
 * Reward shaping for VP-MAXIMIZATION.
 *
 * Objective (per the design): the bot maximizes the Victory Points it accumulates — total VP
 * by game end, and VP/turn (efficiency). It is NOT trying to beat opponents; opponents are just
 * part of the environment. This is a dense, well-defined objective, which is what makes it
 * learnable (unlike sparse "win the game").
 *
 * Per-step reward  r_t = ΔVP (normalized)  +  λ · (Φ_build(s_{t+1}) − Φ_build(s_t))
 *   - ΔVP is the PRIMARY signal — summed over a game it telescopes to final VP.
 *   - Φ_build (attack dice, max barrier = Cultivator scaling, awakened spirits, corruption) is
 *     a potential-based shaping term: POLICY-INVARIANT (Ng et al. 1999), so it can't change WHAT
 *     is optimal (max VP) — it only guides discovery toward the build that produces VP, which is
 *     how the strong economy line gets found instead of the bot flailing.
 * Return-to-go  G_t = Σ_k γ^{k−t} r_k.  γ<1 ⇒ near-term VP worth more ⇒ optimizes VP/TURN.
 *
 * Build weights are configurable so a population of agents can be guided toward distinct VP
 * routes (economy-scaler vs pvp) — the diversity lever — while all maximizing VP.
 */

import { VP_TO_WIN, type PrivatePlayerState } from '../types';

/** Auxiliary build-progress proxies (NOT VP — VP is the direct reward). */
export interface ShapingWeights {
	dice: number;
	maxBarrier: number;
	awakened: number;
	status: number;
}

/** Balanced default: modest build guidance toward dice + barrier (the economy core). */
export const BALANCED_SHAPING: ShapingWeights = { dice: 0.15, maxBarrier: 0.15, awakened: 0.1, status: 0.05 };

/** Population playstyle presets — same VP objective, different build guidance → diverse VP routes. */
export const SHAPING_PRESETS: Record<string, ShapingWeights> = {
	balanced: BALANCED_SHAPING,
	economy: { dice: 0.25, maxBarrier: 0.25, awakened: 0.15, status: 0 },
	pvp: { dice: 0.05, maxBarrier: 0.05, awakened: 0.05, status: 0.2 },
	lean: { dice: 0.05, maxBarrier: 0.05, awakened: 0.05, status: 0.02 } // mostly raw VP
};

export function shapingFor(name: string | undefined): ShapingWeights {
	return SHAPING_PRESETS[name ?? 'balanced'] ?? BALANCED_SHAPING;
}

/** Raw VP of a player. */
export function vpOf(p: PrivatePlayerState | undefined): number {
	return p?.victoryPoints ?? 0;
}

/** Build-progress potential Φ_build(player) — auxiliary shaping only, excludes VP. */
export function buildPotential(p: PrivatePlayerState | undefined, w: ShapingWeights): number {
	if (!p) return 0;
	const dice = Math.min(1, (p.attackDice?.length ?? 0) / 10);
	const barrier = Math.min(1, (p.maxBarrier ?? 0) / 10);
	const awakened = Math.min(1, (p.spirits?.filter((s) => !s.isFaceDown).length ?? 0) / 7);
	const status = Math.min(1, (p.statusLevel ?? 0) / 3);
	return w.dice * dice + w.maxBarrier * barrier + w.awakened * awakened + w.status * status;
}

/**
 * Return-to-go that maximizes discounted VP (+ build shaping) for ONE seat's decisions, in
 * play order. `vp[i]`/`build[i]` are the VP and build potential at decision i's state;
 * `finalVp`/`finalBuild` are the seat's values at game end (so the VP gained AFTER the last
 * recorded decision is still credited). Per-step reward = ΔVP/VP_TO_WIN + (Φ_build delta);
 * G_t = r_t + γ·G_{t+1}, computed backwards. γ<1 favors VP/turn.
 */
export function vpReturnsToGo(
	vp: number[],
	build: number[],
	finalVp: number,
	finalBuild: number,
	gamma = 0.97
): number[] {
	const n = vp.length;
	const g = new Array<number>(n).fill(0);
	let running = 0;
	for (let i = n - 1; i >= 0; i--) {
		const nextVp = i < n - 1 ? vp[i + 1] : finalVp;
		const nextBuild = i < n - 1 ? build[i + 1] : finalBuild;
		const r = (nextVp - vp[i]) / VP_TO_WIN + (nextBuild - build[i]);
		running = r + gamma * running;
		g[i] = running;
	}
	return g;
}
