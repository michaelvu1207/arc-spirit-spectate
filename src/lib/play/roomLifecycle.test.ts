import { describe, expect, test } from 'vitest';
import {
	roomCloseReason,
	isRoomOpen,
	humanLastSeen,
	LOBBY_MAX_AGE_MS,
	LOBBY_PRESENCE_WINDOW_MS,
	ACTIVE_PRESENCE_WINDOW_MS,
	BOT_NAME_PREFIX,
	type RoomLiveness
} from './roomLifecycle';

const NOW = 1_000_000_000_000;

/** A fresh, human-occupied lobby: created just now, one human seen just now. */
function freshLobby(overrides: Partial<RoomLiveness> = {}): RoomLiveness {
	return {
		status: 'lobby',
		createdAtMs: NOW,
		startedAtMs: null,
		humanLastSeenMs: [NOW],
		...overrides
	};
}

/** An in-progress game started a while ago with one human seen just now. */
function activeGame(overrides: Partial<RoomLiveness> = {}): RoomLiveness {
	return {
		status: 'active',
		createdAtMs: NOW - 2 * LOBBY_MAX_AGE_MS,
		startedAtMs: NOW - LOBBY_MAX_AGE_MS,
		humanLastSeenMs: [NOW],
		...overrides
	};
}

describe('roomCloseReason — lobbies', () => {
	test('a fresh lobby with an active human stays open', () => {
		expect(roomCloseReason(freshLobby(), NOW)).toBeNull();
		expect(isRoomOpen(freshLobby(), NOW)).toBe(true);
	});

	test('closes as expired once ≥ 30 min old, even with an active human present', () => {
		const lobby = freshLobby({ createdAtMs: NOW - LOBBY_MAX_AGE_MS, humanLastSeenMs: [NOW] });
		expect(roomCloseReason(lobby, NOW)).toBe('expired');
		expect(isRoomOpen(lobby, NOW)).toBe(false);
	});

	test('does not expire one millisecond before the age cap', () => {
		const lobby = freshLobby({ createdAtMs: NOW - LOBBY_MAX_AGE_MS + 1 });
		expect(roomCloseReason(lobby, NOW)).toBeNull();
	});

	test('closes as abandoned when every human has gone stale', () => {
		const lobby = freshLobby({
			createdAtMs: NOW - 5 * 60_000,
			humanLastSeenMs: [NOW - LOBBY_PRESENCE_WINDOW_MS - 1]
		});
		expect(roomCloseReason(lobby, NOW)).toBe('abandoned');
	});

	test('a human seen exactly at the presence-window edge still counts as present', () => {
		const lobby = freshLobby({
			createdAtMs: NOW - 5 * 60_000,
			humanLastSeenMs: [NOW - LOBBY_PRESENCE_WINDOW_MS]
		});
		expect(roomCloseReason(lobby, NOW)).toBeNull();
	});

	test('closes as abandoned when the only members are bots (frozen last_seen)', () => {
		const lobby = freshLobby({ createdAtMs: NOW - 5 * 60_000, humanLastSeenMs: [] });
		expect(roomCloseReason(lobby, NOW)).toBe('abandoned');
	});

	test('one fresh human keeps the lobby open despite other stale members', () => {
		const lobby = freshLobby({
			createdAtMs: NOW - 5 * 60_000,
			humanLastSeenMs: [NOW - 30_000, NOW - 10 * 60_000]
		});
		expect(roomCloseReason(lobby, NOW)).toBeNull();
	});

	test('expiry takes precedence over abandonment when both apply', () => {
		const lobby = freshLobby({ createdAtMs: NOW - LOBBY_MAX_AGE_MS - 60_000, humanLastSeenMs: [] });
		expect(roomCloseReason(lobby, NOW)).toBe('expired');
	});
});

describe('roomCloseReason — active games', () => {
	test('an active game with a present human stays open', () => {
		expect(roomCloseReason(activeGame(), NOW)).toBeNull();
		expect(isRoomOpen(activeGame(), NOW)).toBe(true);
	});

	test('an active game never expires on age alone, however old, while a human is present', () => {
		const game = activeGame({
			createdAtMs: NOW - 100 * LOBBY_MAX_AGE_MS,
			humanLastSeenMs: [NOW - 10_000]
		});
		expect(roomCloseReason(game, NOW)).toBeNull();
	});

	test('cancels as abandoned once every human passes the active window', () => {
		const game = activeGame({ humanLastSeenMs: [NOW - ACTIVE_PRESENCE_WINDOW_MS - 1] });
		expect(roomCloseReason(game, NOW)).toBe('abandoned');
	});

	test('tolerates a brief all-disconnect inside the active window', () => {
		// A blip just shy of the window must NOT cancel a real game.
		const game = activeGame({ humanLastSeenMs: [NOW - LOBBY_PRESENCE_WINDOW_MS - 1] });
		expect(roomCloseReason(game, NOW)).toBeNull();
	});

	test('a bot-only active game (host left) is cancelled', () => {
		const game = activeGame({ humanLastSeenMs: [] });
		expect(roomCloseReason(game, NOW)).toBe('abandoned');
	});
});

describe('roomCloseReason — terminal statuses', () => {
	test('finished and closed are never reconsidered', () => {
		for (const status of ['finished', 'closed'] as const) {
			const room: RoomLiveness = {
				status,
				createdAtMs: NOW - 100 * LOBBY_MAX_AGE_MS,
				startedAtMs: NOW - 50 * LOBBY_MAX_AGE_MS,
				humanLastSeenMs: []
			};
			expect(roomCloseReason(room, NOW)).toBeNull();
		}
	});
});

describe('humanLastSeen', () => {
	test('drops bot members and keeps human timestamps', () => {
		const result = humanLastSeen([
			{ displayName: 'Maiko', lastSeenAtMs: 10 },
			{ displayName: `${BOT_NAME_PREFIX}Blue`, lastSeenAtMs: 20 },
			{ displayName: `${BOT_NAME_PREFIX}Medium Red`, lastSeenAtMs: 30 },
			{ displayName: 'Spirit', lastSeenAtMs: 40 }
		]);
		expect(result).toEqual([10, 40]);
	});

	test('treats a null/empty display name as human (never silently dropped)', () => {
		expect(humanLastSeen([{ displayName: null, lastSeenAtMs: 5 }])).toEqual([5]);
		expect(humanLastSeen([{ displayName: '', lastSeenAtMs: 7 }])).toEqual([7]);
	});
});
