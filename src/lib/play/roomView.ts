/**
 * Should an incoming room view be REJECTED as a stale, out-of-order update?
 *
 * The guard only applies to the SAME room: play is simultaneous, so a player's
 * own command response (an older revision) can arrive AFTER a newer SSE snapshot
 * from another player — applying it would regress the board.
 *
 * A view for a DIFFERENT room is NEVER stale. Creating / joining / switching
 * rooms legitimately lands on a room whose revision is lower than the one just
 * being viewed; rejecting it would strand the player on their previous game.
 */
export function isStaleRoomUpdate(
	current: { roomCode: string; revision: number } | null | undefined,
	next: { roomCode: string; revision: number }
): boolean {
	return current != null && next.roomCode === current.roomCode && next.revision < current.revision;
}
