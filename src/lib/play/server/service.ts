import { error as kitError } from '@sveltejs/kit';
import { createLobbyState, applyGameCommand, buildHistorySnapshotRows, buildSessionProjection } from '../runtime';
import type {
	CommandResult,
	GameActor,
	GameCommand,
	GameSessionStatus,
	MemberRole,
	PublicGameState,
	SeatColor,
	SpectatorProjection
} from '../types';
import { SEAT_COLORS } from '../types';
import { loadPlayCatalog } from './catalog';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

const HISTORY_SCHEMA = 'arc-spirits-game-history';
const PLAY_TABLES = {
	SESSIONS: 'play_game_sessions',
	MEMBERS: 'play_session_members',
	EVENTS: 'play_game_session_events'
} as const;
const HISTORY_TABLES = {
	SNAPSHOTS: 'game_state_snapshots',
	REPLAY_CODES: 'replay_codes'
} as const;

type PlaySessionRow = {
	id: string;
	room_code: string;
	game_id: string | null;
	status: GameSessionStatus;
	revision: number;
	scenario: PublicGameState['scenario'];
	public_state: PublicGameState | string | null;
	created_at: string;
	started_at: string | null;
	ended_at: string | null;
};

type SessionMemberRow = {
	id: string;
	session_id: string;
	display_name: string;
	role: MemberRole;
	seat_color: SeatColor | null;
	selected_guardian: string | null;
	private_state: Record<string, unknown> | string | null;
	created_at: string;
	joined_at: string;
	updated_at: string;
	last_seen_at: string;
};

export interface RoomView {
	projection: SpectatorProjection;
	member: {
		id: string | null;
		role: MemberRole;
		seatColor: SeatColor | null;
		displayName: string | null;
	};
}

function parseJsonValue<T>(value: T | string | null | undefined, fallback: T): T {
	if (value == null) return fallback;
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function getPlayAdmin() {
	const client = getSupabaseAdmin(HISTORY_SCHEMA);
	if (!client) {
		throw kitError(500, 'Missing SUPABASE_SERVICE_ROLE_KEY on the server.');
	}
	return client;
}

function getHistoryAdmin() {
	const client = getSupabaseAdmin(HISTORY_SCHEMA);
	if (!client) {
		throw kitError(500, 'Missing SUPABASE_SERVICE_ROLE_KEY on the server.');
	}
	return client;
}

function normalizeRoomCode(roomCode: string): string {
	return roomCode.trim().toUpperCase();
}

function normalizeDisplayName(displayName: string | null | undefined): string {
	const trimmed = (displayName ?? '').trim();
	return trimmed.length > 0 ? trimmed.slice(0, 40) : 'Anonymous Spectator';
}

function createRoomCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 6; i += 1) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}

function asState(row: PlaySessionRow): PublicGameState {
	return parseJsonValue(row.public_state, createLobbyState({ roomCode: row.room_code, guardianNames: [] }));
}

async function getSessionByRoomCode(roomCode: string): Promise<PlaySessionRow | null> {
	const { data, error } = await getPlayAdmin()
		.from(PLAY_TABLES.SESSIONS)
		.select('*')
		.eq('room_code', normalizeRoomCode(roomCode))
		.maybeSingle();

	if (error) {
		throw kitError(500, `Failed to load session: ${error.message}`);
	}

	return (data as PlaySessionRow | null) ?? null;
}

async function getMembersForSession(sessionId: string): Promise<SessionMemberRow[]> {
	const { data, error } = await getPlayAdmin()
		.from(PLAY_TABLES.MEMBERS)
		.select('*')
		.eq('session_id', sessionId)
		.order('joined_at', { ascending: true });

	if (error) {
		throw kitError(500, `Failed to load session members: ${error.message}`);
	}

	return (data as SessionMemberRow[] | null) ?? [];
}

async function getMemberById(memberId: string): Promise<SessionMemberRow | null> {
	const { data, error } = await getPlayAdmin().from(PLAY_TABLES.MEMBERS).select('*').eq('id', memberId).maybeSingle();
	if (error) {
		throw kitError(500, `Failed to load session member: ${error.message}`);
	}
	return (data as SessionMemberRow | null) ?? null;
}

function viewerForMember(state: PublicGameState, member: SessionMemberRow | null): SpectatorProjection['viewer'] {
	if (!member) {
		return {
			role: 'spectator',
			seatColor: null,
			displayName: null
		};
	}

	const seatColor =
		SEAT_COLORS.find((candidate) => state.seats[candidate].memberId === member.id) ?? member.seat_color ?? null;

	return {
		role: member.role,
		seatColor,
		displayName: member.display_name
	};
}

function actorForMember(state: PublicGameState, member: SessionMemberRow): GameActor {
	const viewer = viewerForMember(state, member);
	return {
		memberId: member.id,
		displayName: member.display_name,
		role: member.role,
		seatColor: viewer.seatColor
	};
}

async function updateLastSeen(memberId: string) {
	await getPlayAdmin()
		.from(PLAY_TABLES.MEMBERS)
		.update({ last_seen_at: new Date().toISOString() })
		.eq('id', memberId);
}

async function syncMemberMirrors(sessionId: string, state: PublicGameState) {
	const members = await getMembersForSession(sessionId);

	for (const member of members) {
		const occupiedSeat =
			SEAT_COLORS.find((seatColor) => state.seats[seatColor].memberId === member.id) ?? null;
		const selectedGuardian = occupiedSeat ? state.seats[occupiedSeat].selectedGuardian ?? null : null;
		const role: MemberRole =
			member.role === 'host' ? 'host' : occupiedSeat ? 'player' : 'spectator';

		const { error } = await getPlayAdmin()
			.from(PLAY_TABLES.MEMBERS)
			.update({
				seat_color: occupiedSeat,
				selected_guardian: selectedGuardian,
				role,
				last_seen_at: new Date().toISOString()
			})
			.eq('id', member.id);

		if (error) {
			throw kitError(500, `Failed to update member mirror: ${error.message}`);
		}
	}
}

async function ensureReplayCode(gameId: string, navigationCount: number) {
	const historyAdmin = getHistoryAdmin();
	const existing = await historyAdmin
		.from(HISTORY_TABLES.REPLAY_CODES)
		.select('code')
		.eq('game_id', gameId)
		.eq('navigation_count', navigationCount)
		.maybeSingle();

	if (existing.error) {
		throw kitError(500, `Failed to load replay code: ${existing.error.message}`);
	}
	if (existing.data?.code) {
		return existing.data.code as string;
	}

	const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
	for (let attempt = 0; attempt < 20; attempt += 1) {
		let code = '';
		for (let index = 0; index < 4; index += 1) {
			code += alphabet[Math.floor(Math.random() * alphabet.length)];
		}
		if (!/[A-Z]/.test(code)) continue;

		const inserted = await historyAdmin.from(HISTORY_TABLES.REPLAY_CODES).insert({
			code,
			game_id: gameId,
			navigation_count: navigationCount
		});

		if (!inserted.error) {
			return code;
		}
	}

	throw kitError(500, 'Failed to create replay code.');
}

async function writeHistorySnapshots(state: PublicGameState, timestamp: string) {
	if (!state.gameId) return;

	const rows = buildHistorySnapshotRows(state, timestamp);
	if (rows.length === 0) return;

	const { error } = await getHistoryAdmin()
		.from(HISTORY_TABLES.SNAPSHOTS)
		.upsert(rows, { onConflict: 'game_id,navigation_count,player_color' });

	if (error) {
		throw kitError(500, `Failed to write history snapshots: ${error.message}`);
	}

	await ensureReplayCode(state.gameId, state.round);
}

async function persistSessionUpdate(params: {
	session: PlaySessionRow;
	nextState: PublicGameState;
	actorMemberId: string;
	command: GameCommand;
}) {
	const now = new Date().toISOString();
	const { session, nextState, actorMemberId, command } = params;
	const updatePayload: Record<string, unknown> = {
		status: nextState.status,
		revision: nextState.revision,
		game_id: nextState.gameId,
		scenario: nextState.scenario,
		public_state: nextState
	};

	if (session.started_at == null && nextState.status === 'active') {
		updatePayload.started_at = now;
	}
	if (nextState.status === 'finished' && session.ended_at == null) {
		updatePayload.ended_at = now;
	}

	const { data, error } = await getPlayAdmin()
		.from(PLAY_TABLES.SESSIONS)
		.update(updatePayload)
		.eq('id', session.id)
		.eq('revision', session.revision)
		.select('*')
		.maybeSingle();

	if (error) {
		throw kitError(500, `Failed to persist session: ${error.message}`);
	}
	if (!data) {
		throw kitError(409, 'This room changed before your action could be applied.');
	}

	const eventInsert = await getPlayAdmin().from(PLAY_TABLES.EVENTS).insert({
		session_id: session.id,
		revision: nextState.revision,
		actor_member_id: actorMemberId,
		command_type: command.type,
		command_payload: command
	});
	if (eventInsert.error) {
		throw kitError(500, `Failed to append room event: ${eventInsert.error.message}`);
	}

	await syncMemberMirrors(session.id, nextState);

	return data as PlaySessionRow;
}

export async function createRoom(displayName: string): Promise<{ roomCode: string; memberId: string }> {
	const catalog = await loadPlayCatalog();
	const normalizedName = normalizeDisplayName(displayName);

	let roomCode = createRoomCode();
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const state = createLobbyState({
			roomCode,
			guardianNames: catalog.guardians.map((guardian) => guardian.name)
		});

		const { data, error } = await getPlayAdmin()
			.from(PLAY_TABLES.SESSIONS)
			.insert({
				room_code: roomCode,
				status: state.status,
				revision: state.revision,
				scenario: state.scenario,
				public_state: state
			})
			.select('*')
			.maybeSingle();

		if (error) {
			if (error.code === '23505') {
				roomCode = createRoomCode();
				continue;
			}
			throw kitError(500, `Failed to create room: ${error.message}`);
		}

		if (!data) {
			throw kitError(500, 'Room creation did not return a session row.');
		}

		const createdSession = data as PlaySessionRow;
		const memberInsert = await getPlayAdmin()
			.from(PLAY_TABLES.MEMBERS)
			.insert({
				session_id: createdSession.id,
				display_name: normalizedName,
				role: 'host',
				private_state: {}
			})
			.select('*')
			.single();

		if (memberInsert.error) {
			throw kitError(500, `Failed to create host membership: ${memberInsert.error.message}`);
		}

		return {
			roomCode,
			memberId: (memberInsert.data as SessionMemberRow).id
		};
	}

	throw kitError(500, 'Failed to generate a unique room code.');
}

export async function joinRoom(roomCode: string, displayName: string): Promise<{ memberId: string }> {
	const session = await getSessionByRoomCode(normalizeRoomCode(roomCode));
	if (!session) {
		throw kitError(404, 'Room not found.');
	}

	const insert = await getPlayAdmin()
		.from(PLAY_TABLES.MEMBERS)
		.insert({
			session_id: session.id,
			display_name: normalizeDisplayName(displayName),
			role: 'spectator',
			private_state: {}
		})
		.select('*')
		.single();

	if (insert.error) {
		throw kitError(500, `Failed to join room: ${insert.error.message}`);
	}

	return { memberId: (insert.data as SessionMemberRow).id };
}

export async function loadRoomView(
	roomCode: string,
	memberId: string | null | undefined
): Promise<RoomView> {
	const session = await getSessionByRoomCode(roomCode);
	if (!session) {
		throw kitError(404, 'Room not found.');
	}

	const state = asState(session);
	const rawMember = memberId ? await getMemberById(memberId) : null;
	const member = rawMember && rawMember.session_id === session.id ? rawMember : null;
	if (member) {
		await updateLastSeen(member.id);
	}

	const projection = buildSessionProjection(state, viewerForMember(state, member));
	return {
		projection,
		member: {
			id: member?.id ?? null,
			role: projection.viewer.role,
			seatColor: projection.viewer.seatColor,
			displayName: projection.viewer.displayName
		}
	};
}

export async function runRoomCommand(params: {
	roomCode: string;
	memberId: string;
	expectedRevision: number | null;
	command: GameCommand;
}): Promise<RoomView> {
	const roomCode = normalizeRoomCode(params.roomCode);
	const session = await getSessionByRoomCode(roomCode);
	if (!session) {
		throw kitError(404, 'Room not found.');
	}

	const member = await getMemberById(params.memberId);
	if (!member || member.session_id !== session.id) {
		throw kitError(401, 'Session member not found for this room.');
	}

	const state = asState(session);
	if (params.expectedRevision != null && params.expectedRevision !== state.revision) {
		throw kitError(409, 'The room changed before your action could be applied.');
	}

	const actor = actorForMember(state, member);
	const catalog = await loadPlayCatalog();
	const commandResult: CommandResult = applyGameCommand(state, actor, params.command, catalog);
	if (!commandResult.ok) {
		throw kitError(400, commandResult.error.message);
	}

	await persistSessionUpdate({
		session,
		nextState: commandResult.state,
		actorMemberId: member.id,
		command: params.command
	});

	if (params.command.type === 'commitRound') {
		await writeHistorySnapshots(state, new Date().toISOString());
	}

	const memberAfterUpdate = await getMemberById(member.id);
	const projection = buildSessionProjection(commandResult.state, viewerForMember(commandResult.state, memberAfterUpdate));

	return {
		projection,
		member: {
			id: member.id,
			role: projection.viewer.role,
			seatColor: projection.viewer.seatColor,
			displayName: projection.viewer.displayName
		}
	};
}
