import { browser } from '$app/environment';
import type { RoomView } from '$lib/play/server/service';
import type { GameCommand, SeatColor, SpectatorProjection } from '$lib/play/types';

let room = $state<SpectatorProjection | null>(null);
let member = $state<RoomView['member'] | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let isConnected = $state(false);

let eventSource: EventSource | null = null;

function setRoomView(view: RoomView) {
	room = view.projection;
	member = view.member;
	error = null;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
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

function disconnect() {
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}
	isConnected = false;
}

function connect() {
	if (!browser || !room?.roomCode) return;
	disconnect();

	eventSource = new EventSource(`/api/play/sessions/${encodeURIComponent(room.roomCode)}/events`);
	eventSource.addEventListener('open', () => {
		isConnected = true;
	});
	eventSource.addEventListener('snapshot', (event) => {
		try {
			const next = JSON.parse((event as MessageEvent<string>).data) as RoomView;
			if ((next as { error?: boolean }).error) {
				return;
			}
			setRoomView(next);
			isConnected = true;
		} catch (err) {
			console.error('Failed to parse room snapshot event:', err);
		}
	});
	eventSource.addEventListener('error', () => {
		isConnected = false;
	});
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
		connect,
		disconnect
	};
}
