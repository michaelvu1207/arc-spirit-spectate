/**
 * Co-location helper: which other active seats share a player's destination.
 *
 * Several class/trait effects (Healer, Rune Traveler, Infiltrator, …) act on the
 * players standing in the same location. This resolves that set once, in a
 * stable order, so those effects are deterministic and only ever touch active
 * seats. The acting seat is always excluded from the result.
 */

import type { PrivatePlayerState, PublicGameState, SeatColor } from '../types';

/**
 * Active seats (in `state.activeSeats` order) that share `seat`'s current
 * `navigationDestination`, excluding `seat` itself. Returns the resolved
 * `PrivatePlayerState` for each such seat.
 *
 * Order is `state.activeSeats` order (stable across calls). Seats with no
 * destination set, or whose destination differs, are skipped. If the acting
 * seat has no destination, the result is empty (nobody is "co-located" with an
 * undecided traveler).
 */
export function colocatedPlayers(state: PublicGameState, seat: SeatColor): PrivatePlayerState[] {
	const self = state.players[seat];
	if (!self) return [];
	const here = self.navigationDestination;
	if (here == null) return [];

	const result: PrivatePlayerState[] = [];
	for (const other of state.activeSeats ?? []) {
		if (other === seat) continue;
		const player = state.players[other];
		if (!player) continue;
		if (player.navigationDestination === here) result.push(player);
	}
	return result;
}
