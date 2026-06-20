import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { getRoomMemberCookie } from '$lib/play/server/cookies';
import { runRoomCommand } from '$lib/play/server/service';
import type { GameCommand } from '$lib/play/types';

export const POST: RequestHandler = async ({ request, params, cookies }) => {
	const roomCode = String(params.roomCode ?? '');
	const memberId = getRoomMemberCookie(cookies, roomCode);
	if (!memberId) {
		throw error(401, 'Join this room before sending commands.');
	}

	const body = await request.json().catch(() => ({}));
	const expectedRevision =
		typeof body?.expectedRevision === 'number' ? body.expectedRevision : null;
	const command = (body?.command ?? null) as GameCommand | null;

	if (!command || typeof command.type !== 'string') {
		throw error(400, 'Missing command.');
	}

	// God-mode grants are a dev-only tool — never resolvable in production.
	if (command.type === 'debugGrant' && !dev) {
		throw error(404, 'Not found.');
	}

	return json(
		await runRoomCommand({
			roomCode,
			memberId,
			expectedRevision,
			command
		})
	);
};
