import { expect, type Page } from '@playwright/test';

const ROOM_URL = /\/play\/[A-Z0-9]+$/;

/**
 * Click a button that triggers a client-side navigation, retrying until the URL
 * changes. The first click after a full page load can land before SvelteKit has
 * hydrated (so the onclick handler isn't wired yet); retrying absorbs that race.
 */
async function clickUntilNavigated(page: Page, testId: string): Promise<void> {
	await expect(async () => {
		await page.getByTestId(testId).click();
		await page.waitForURL(ROOM_URL, { timeout: 2500 });
	}).toPass({ timeout: 30_000 });
}

export async function createRoom(page: Page, name: string): Promise<string> {
	await page.goto('/play');
	await page.getByTestId('create-open').click();
	await page.getByTestId('create-name').fill(name);
	await clickUntilNavigated(page, 'create-room');
	const code = new URL(page.url()).pathname.split('/').pop();
	if (!code) throw new Error('No room code in URL after create');
	return code;
}

export async function joinRoom(page: Page, code: string, name: string): Promise<void> {
	await page.goto('/play');
	await page.getByTestId('join-open').click();
	await page.getByTestId('join-code').fill(code);
	await page.getByTestId('join-name').fill(name);
	await clickUntilNavigated(page, 'join-room');
}

export async function claimSeat(page: Page, seat: string, guardianIndex: number): Promise<void> {
	await page.getByTestId(`claim-${seat}`).click();
	await page.getByTestId(`guardian-${seat}`).selectOption({ index: guardianIndex });
	// The <select> uses a one-way value binding, so its DOM value flips instantly
	// on selectOption — that does NOT mean the command persisted. Wait instead on
	// the seat's guardian label, which is driven by the server-confirmed `room`
	// state, so a subsequent startGame can't race ahead of the guardian write.
	await expect(page.getByTestId(`seat-guardian-${seat}`)).not.toHaveText('No guardian selected');
}

export async function startGame(page: Page): Promise<void> {
	await page.getByTestId('start-game').click();
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

/** Drive a fresh 2-player game from the lobby into the active navigation phase. */
export async function setupTwoPlayerGame(host: Page, guest: Page): Promise<{ code: string }> {
	const code = await createRoom(host, 'Host');
	await joinRoom(guest, code, 'Guest');

	await claimSeat(host, 'Red', 1);
	await claimSeat(guest, 'Blue', 2);

	await startGame(host);

	await expectPhase(host, 'navigation');
	await expectPhase(guest, 'navigation');
	return { code };
}
