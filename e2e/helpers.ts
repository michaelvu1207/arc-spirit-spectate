import { expect, type Page } from '@playwright/test';

/**
 * POST a play API endpoint from inside a page's browser context, so the session-member
 * cookie the server sets (and re-reads) belongs to THAT player. Returns the parsed
 * RoomView. Throws with the status + body on a non-2xx so setup failures are legible.
 *
 * Why API and not the UI for setup: the room create/join/seat/guardian/start flow is
 * not what these specs exercise — the round LOOP is. Driving setup through the API is
 * far more robust than racing SvelteKit hydration on the Server Browser's create button
 * (a click landing pre-hydration silently no-ops), and `expectedRevision` is documented
 * as un-gated server-side (play is simultaneous), so no revision threading is needed.
 */
async function apiPost(
	page: Page,
	path: string,
	body: Record<string, unknown> = {}
): Promise<{ projection: { roomCode: string; revision: number; guardianPool: string[] } }> {
	return page.evaluate(
		async ({ path, body }) => {
			const r = await fetch(path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const text = await r.text();
			if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${text.slice(0, 300)}`);
			return JSON.parse(text);
		},
		{ path, body }
	);
}

export async function expectPhase(page: Page, phase: string): Promise<void> {
	await expect(page.getByTestId('round-banner')).toHaveAttribute('data-phase', phase);
}

export async function expectRound(page: Page, round: number): Promise<void> {
	await expect(page.getByTestId('round-banner')).toHaveAttribute('data-round', String(round));
}

export async function lockDestination(page: Page, location: string): Promise<void> {
	// Clicking a location now locks it in immediately (no separate confirm button).
	await page.getByTestId(`location-${location}`).click();
}

/** End the player's current phase via the single "Pass turn" control. */
export async function passTurn(page: Page): Promise<void> {
	await page.getByTestId('pass-turn').click();
}

/**
 * If defeating the Arcane Abyss monster opened a reward selection, claim the first
 * available reward and dismiss whatever follow-up it produces. No-op when no menu
 * is shown (the monster survived) — keeps the combat flow robust whether or not the
 * player's dice land a kill.
 *
 * Reward cards are keyed by reward-track index (with gaps where unresolvable tokens
 * were dropped), so we select the first RENDERED card position-independently rather
 * than assuming `reward-0` exists. The picked reward may be a summon (opens a draw
 * tray → return it) or a resource/VP/rune token (shows a result card → continue).
 */
export async function claimMonsterRewardIfPresent(page: Page): Promise<void> {
	const menu = page.getByTestId('monster-reward-menu');
	if (!(await menu.isVisible().catch(() => false))) return;
	await page.getByTestId('reward-grid').locator('[data-testid^="reward-"]').first().click();
	await page.getByTestId('reward-claim').click();
	await expect(menu).toBeHidden();
	// A summon reward opens the draw tray (return the unchosen spirits); any other
	// reward shows a brief result card. Handle whichever appears so the seat can pass.
	const drawTray = page.getByTestId('draw-tray');
	const resultContinue = page.getByTestId('result-continue');
	if (await drawTray.isVisible().catch(() => false)) {
		await page.getByTestId('draw-discard').click();
	} else if (await resultContinue.isVisible().catch(() => false)) {
		await resultContinue.click();
	}
}

/**
 * Stand up a fresh 2-player game and land both clients in the active navigation phase.
 *
 * Setup runs through the API (see {@link apiPost}); each player's call executes in
 * their own browser context so the member cookie is scoped correctly. Then both pages
 * navigate into the room via the UI — which is where the specs take over and drive the
 * real round loop. Host takes Red, guest takes Blue, each with a distinct Guardian from
 * the room's pool; the host then starts the game.
 */
export async function setupTwoPlayerGame(host: Page, guest: Page): Promise<{ code: string }> {
	// Land on a same-origin page first so in-context fetch() + Set-Cookie work.
	await host.goto('/play');
	await guest.goto('/play');

	const created = await apiPost(host, '/api/play/sessions', { displayName: 'Host' });
	const code = created.projection.roomCode;
	const pool = created.projection.guardianPool;

	await apiPost(guest, `/api/play/sessions/${code}/join`, { displayName: 'Guest' });

	await apiPost(host, `/api/play/sessions/${code}/claim-seat`, { seatColor: 'Red' });
	await apiPost(host, `/api/play/sessions/${code}/commands`, {
		command: { type: 'selectGuardian', guardianName: pool[0] }
	});
	await apiPost(guest, `/api/play/sessions/${code}/claim-seat`, { seatColor: 'Blue' });
	await apiPost(guest, `/api/play/sessions/${code}/commands`, {
		command: { type: 'selectGuardian', guardianName: pool[1] }
	});

	await apiPost(host, `/api/play/sessions/${code}/start`);

	// Hand off to the UI: load both players into the now-active game. `?e2e` skips the
	// ~240-image board-art preload (which otherwise saturates the network, starves the
	// presence poll, and gets the room reaped mid-load) — the board renders with
	// placeholder art, which is all the round-loop assertions need.
	await Promise.all([host.goto(`/play/${code}?e2e=1`), guest.goto(`/play/${code}?e2e=1`)]);
	await expectPhase(host, 'navigation');
	await expectPhase(guest, 'navigation');
	return { code };
}
