import { LOCATIONS } from '../../locations';
import type { NavigationDestination, SeatColor } from '../../types';
import type { EffectContext } from '../context';
import type { ClassAbility, ClassDecisions } from './types';

// Deep Sea Hunter — "On Navigation Reveal, you may change your destination. Gain 4
// Initiative." +4 init + a change-destination decision (`deepSeaHunterRedirect`).
export const ability: ClassAbility[] = [
	{
		on: 'onNavigate',
		breakpoints: [
			{
				count: 1,
				actions: [
					{ kind: 'gainInitiative', amount: 4 },
					{
						kind: 'choose',
						decisionKind: 'deepSeaHunterRedirect',
						prompt: 'On Navigation Reveal, you may change your destination.',
						options: [
							{ id: 'keep', label: 'Keep my destination' },
							{ id: 'Floral Patch', label: 'Move to Floral Patch' },
							{ id: 'Cyber City', label: 'Move to Cyber City' },
							{ id: 'Tidal Cove', label: 'Move to Tidal Cove' },
							{ id: 'Lantern Canyon', label: 'Move to Lantern Canyon' },
							{ id: 'Arcane Abyss', label: 'Move to Arcane Abyss' }
						]
					}
				]
			}
		]
	}
];

/** Rebuild `locationOccupancy` from every active seat's current destination —
 *  used after a mid-flow destination change. */
function rebuildOccupancy(ctx: EffectContext): void {
	const occ: Partial<Record<NavigationDestination, SeatColor[]>> = {};
	for (const seat of ctx.state.activeSeats) {
		const dest = ctx.state.players[seat]?.navigationDestination as NavigationDestination | null;
		if (dest) (occ[dest] ??= []).push(seat);
	}
	ctx.state.locationOccupancy = occ;
}

// Colocated resolver: the option id is a destination name (or 'keep'). Moving the
// player rebuilds occupancy so co-location stays correct for the upcoming phase.
export const decisions: ClassDecisions = {
	deepSeaHunterRedirect(ctx, optionId) {
		if (optionId === 'keep') return;
		if (!(optionId in LOCATIONS)) return;
		const dest = optionId as NavigationDestination;
		if (ctx.player.navigationDestination === dest) return;
		ctx.player.navigationDestination = dest;
		ctx.player.pendingDestination = dest;
		rebuildOccupancy(ctx);
		ctx.log.push(`Deep Sea Hunter: changed destination to ${dest}.`);
	}
};
