/**
 * Shared summon-FX state. The draw tray (which unmounts the moment the last spirit
 * is picked) fires these effects, but they must keep playing AFTER it's gone — so
 * the flyers/bursts live here and are rendered by a persistent <SummonFxLayer/>
 * mounted at the board level. Browser-only state (mutated from click handlers).
 */

import { playSfx } from './gameAudio.svelte';

export interface SummonFlyer {
	id: number;
	img: string | null;
	name: string;
	src: DOMRect;
	dst: DOMRect | null;
}
export interface SummonSpark {
	id: number;
	tx: number;
	ty: number;
	delay: number;
	hue: number;
	size: number;
}
export interface SummonBurst {
	id: number;
	x: number;
	y: number;
	sparks: SummonSpark[];
}

let nextId = 0;

/**
 * Particle count scaled by device capability. Low-core (≤4 logical CPUs, typical
 * mid/low phone) or coarse-pointer (touch) devices get a lighter burst (~7) so the
 * effect stays recognizable without flooding the compositor; desktop keeps the full
 * 16. SSR-safe: defaults to the full count when window/navigator are unavailable.
 */
function summonSparkCount(): number {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return 16;
	const lowCore =
		typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
	const coarse =
		typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
	return lowCore || coarse ? 7 : 16;
}

export const summonFx = $state<{ flyers: SummonFlyer[]; bursts: SummonBurst[] }>({
	flyers: [],
	bursts: []
});

/**
 * Fire the full summon flourish at a spirit's on-screen rect: a sparkle/ring burst
 * at the source, plus a flyer that twists into the tableau (`dst`, or the
 * bottom-right corner if the tableau isn't found).
 */
export function launchSummonFx(
	src: DOMRect,
	dst: DOMRect | null,
	img: string | null,
	name: string
): void {
	const burstId = ++nextId;
	const sparkCount = summonSparkCount();
	const sparks: SummonSpark[] = Array.from({ length: sparkCount }, (_, i) => {
		const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.5;
		const dist = 55 + Math.random() * 110;
		return {
			id: i,
			tx: Math.cos(angle) * dist,
			ty: Math.sin(angle) * dist,
			delay: Math.random() * 90,
			hue: 250 + Math.random() * 110, // violet → cyan → magenta band
			size: 5 + Math.random() * 8
		};
	});
	summonFx.bursts = [
		...summonFx.bursts,
		{ id: burstId, x: src.left + src.width / 2, y: src.top + src.height / 2, sparks }
	];
	if (typeof window !== 'undefined') {
		window.setTimeout(() => {
			summonFx.bursts = summonFx.bursts.filter((b) => b.id !== burstId);
		}, 1200);
	}

	summonFx.flyers = [...summonFx.flyers, { id: ++nextId, img, name, src, dst }];
	// The flyer reaches the tableau mid-flight — land the impact sting then.
	if (typeof window !== 'undefined') window.setTimeout(() => playSfx('summon-impact'), 650);
}

export function removeSummonFlyer(id: number): void {
	summonFx.flyers = summonFx.flyers.filter((f) => f.id !== id);
}
