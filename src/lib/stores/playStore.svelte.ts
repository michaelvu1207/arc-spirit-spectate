import { browser } from '$app/environment';
import type { RoomView } from '$lib/play/server/service';
import { isStaleRoomUpdate } from '$lib/play/roomView';
import { apiUrl, isCrossOrigin } from '$lib/play/apiBase';
import type { GameCommand, RoomSummary, SeatColor, SpectatorProjection } from '$lib/play/types';

let room = $state<SpectatorProjection | null>(null);
let member = $state<RoomView['member'] | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let isConnected = $state(false);
let isReconnecting = $state(false);

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let lifecycleBound = false;

// Force a reconnect if no snapshot or heartbeat arrives within this window — a
// backgrounded mobile socket frequently dies without ever firing `error`.
const WATCHDOG_MS = 20_000;
const MAX_BACKOFF_MS = 15_000;

function setRoomView(view: RoomView) {
	// Ignore stale updates FOR THE SAME ROOM. Play is simultaneous: a player's own
	// command response (older revision) can arrive AFTER an SSE snapshot that
	// already reflects a newer state from another player; applying it would regress
	// the board. A view for a DIFFERENT room is never stale — creating/joining a new
	// room lands on a lower revision than the previous game, and rejecting it would
	// strand the player on that previous game.
	if (isStaleRoomUpdate(room, view.projection)) {
		// Still refresh our own identity (seat/role) if it changed.
		member = view.member;
		return;
	}
	room = view.projection;
	member = view.member;
	error = null;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	// Cross-origin (Capacitor) has no session cookie — authenticate by member id.
	if (isCrossOrigin && member?.id) headers['X-Play-Member'] = member.id;
	const response = await fetch(apiUrl(path), {
		method: 'POST',
		headers,
		credentials: isCrossOrigin ? 'include' : 'same-origin',
		body: JSON.stringify(body)
	});

	const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
	if (!response.ok) {
		const message =
			payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
				? payload.message
				: `Request failed with status ${response.status}`;
		throw new Error(message);
	}

	return payload as T;
}

function clearTimers() {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	if (watchdogTimer) {
		clearTimeout(watchdogTimer);
		watchdogTimer = null;
	}
}

function closeSource() {
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}
}

/** (Re)arm the silent-death watchdog; any snapshot/heartbeat resets it. */
function armWatchdog() {
	if (!browser) return;
	if (watchdogTimer) clearTimeout(watchdogTimer);
	watchdogTimer = setTimeout(() => scheduleReconnect(), WATCHDOG_MS);
}

/** Schedule a reconnect with bounded exponential backoff + jitter. */
function scheduleReconnect() {
	if (!browser || !room?.roomCode) return;
	isConnected = false;
	isReconnecting = true;
	closeSource();
	if (reconnectTimer) return; // already pending
	const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** reconnectAttempts);
	const delay = base / 2 + Math.random() * (base / 2); // 50–100% of base (jitter)
	reconnectAttempts += 1;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		openSource();
	}, delay);
}

/** Reconnect immediately (network/visibility signal) without backoff. */
function forceReconnect() {
	if (!browser || !room?.roomCode) return;
	reconnectAttempts = 0;
	clearTimers();
	isReconnecting = true;
	openSource();
}

function bindLifecycle() {
	if (!browser || lifecycleBound) return;
	lifecycleBound = true;
	// Network came back, or the user returned to a backgrounded tab/app — the
	// existing socket is almost certainly dead, so reconnect (and refetch state).
	window.addEventListener('online', forceReconnect);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') forceReconnect();
	});
}

function openSource() {
	// Never (re)open a stream for a room that's already closed/cancelled — a
	// visibility/online reconnect trigger during the post-close redirect window
	// must not resurrect the connection to a dead room.
	if (!browser || !room?.roomCode || room.status === 'closed') return;
	closeSource();
	// Reconnecting the stream IS the full-state refetch: the events endpoint
	// replays the current snapshot immediately on connect.
	const query = isCrossOrigin && member?.id ? `?member=${encodeURIComponent(member.id)}` : '';
	const url = apiUrl(`/api/play/sessions/${encodeURIComponent(room.roomCode)}/events${query}`);
	const es = new EventSource(url, { withCredentials: isCrossOrigin });
	eventSource = es;
	armWatchdog();

	const markLive = () => {
		isConnected = true;
		isReconnecting = false;
		reconnectAttempts = 0;
		armWatchdog();
	};

	es.addEventListener('open', markLive);
	es.addEventListener('ping', armWatchdog); // server heartbeat — proves liveness
	es.addEventListener('snapshot', (event) => {
		armWatchdog();
		try {
			const next = JSON.parse((event as MessageEvent<string>).data) as RoomView;
			if ((next as { error?: boolean }).error) return;
			setRoomView(next);
			markLive();
		} catch (err) {
			console.error('Failed to parse room snapshot event:', err);
		}
	});
	es.addEventListener('error', () => {
		// On mobile the socket usually dies for good; take over with backoff.
		scheduleReconnect();
	});
}

function disconnect() {
	clearTimers();
	closeSource();
	isConnected = false;
	isReconnecting = false;
}

function connect() {
	if (!browser || !room?.roomCode) return;
	bindLifecycle();
	reconnectAttempts = 0;
	isReconnecting = false;
	clearTimers();
	openSource();
}

export function hydratePlayRoom(view: RoomView) {
	setRoomView(view);
	if (browser) {
		connect();
	}
}

export async function createPlayRoom(displayName: string) {
	isLoading = true;
	try {
		const view = await postJson<RoomView>('/api/play/sessions', { displayName });
		setRoomView(view);
		if (browser) connect();
		return view;
	} catch (err) {
		error = err instanceof Error ? err.message : 'Failed to create room.';
		throw err;
	} finally {
		isLoading = false;
	}
}

/** Dev-only: spawn a seeded solo game parked in the Awakening phase to test a
 *  class's ability UX. Returns the room view so the caller can navigate in. */
export async function createDebugPlayRoom(className: string, displayName = 'Debug Player') {
	isLoading = true;
	try {
		const view = await postJson<RoomView>('/api/play/debug', { className, displayName });
		setRoomView(view);
		if (browser) connect();
		return view;
	} catch (err) {
		error = err instanceof Error ? err.message : 'Failed to create debug room.';
		throw err;
	} finally {
		isLoading = false;
	}
}

export async function joinPlayRoom(roomCode: string, displayName: string) {
	isLoading = true;
	try {
		const view = await postJson<RoomView>(
			`/api/play/sessions/${encodeURIComponent(roomCode)}/join`,
			{ displayName }
		);
		setRoomView(view);
		if (browser) connect();
		return view;
	} catch (err) {
		error = err instanceof Error ? err.message : 'Failed to join room.';
		throw err;
	} finally {
		isLoading = false;
	}
}

/** Fetch the public server-browser list of open lobbies + live games. */
export async function fetchOpenRooms(): Promise<RoomSummary[]> {
	const response = await fetch(apiUrl('/api/play/sessions'), {
		headers: { Accept: 'application/json' },
		credentials: isCrossOrigin ? 'include' : 'same-origin'
	});
	if (!response.ok) {
		throw new Error(`Failed to load rooms (status ${response.status})`);
	}
	const payload = (await response.json().catch(() => null)) as { rooms?: RoomSummary[] } | null;
	return payload?.rooms ?? [];
}

export async function claimSeat(seatColor: SeatColor) {
	if (!room) throw new Error('No room is loaded.');
	const view = await postJson<RoomView>(
		`/api/play/sessions/${encodeURIComponent(room.roomCode)}/claim-seat`,
		{ seatColor, expectedRevision: room.revision }
	);
	setRoomView(view);
	return view;
}

export async function startPlayGame() {
	if (!room) throw new Error('No room is loaded.');
	const view = await postJson<RoomView>(
		`/api/play/sessions/${encodeURIComponent(room.roomCode)}/start`,
		{ expectedRevision: room.revision }
	);
	setRoomView(view);
	return view;
}

export async function sendPlayCommand(command: GameCommand) {
	if (!room) throw new Error('No room is loaded.');
	const view = await postJson<RoomView>(
		`/api/play/sessions/${encodeURIComponent(room.roomCode)}/commands`,
		{
			expectedRevision: room.revision,
			command
		}
	);
	setRoomView(view);
	return view;
}

export function getPlayState() {
	return {
		get room() {
			return room;
		},
		get member() {
			return member;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get isConnected() {
			return isConnected;
		},
		get isReconnecting() {
			return isReconnecting;
		},
		connect,
		disconnect
	};
}
