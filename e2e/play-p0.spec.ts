import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupTwoPlayerGame, lockDestination, passTurn, expectPhase, expectRound } from './helpers';

/**
 * P0: two networked players run the simultaneous round loop end to end through the
 * morphing main stage — navigation lock/reveal, a Spirit World summon action,
 * pass-turn, cleanup, and round advance.
 */
test.describe('2D play — P0 round loop', () => {
	let hostCtx: BrowserContext;
	let guestCtx: BrowserContext;
	let host: Page;
	let guest: Page;

	test.beforeEach(async ({ browser }) => {
		hostCtx = await browser.newContext();
		guestCtx = await browser.newContext();
		host = await hostCtx.newPage();
		guest = await guestCtx.newPage();
	});

	test.afterEach(async () => {
		await hostCtx.close();
		await guestCtx.close();
	});

	test('navigation lock/reveal, summon, cleanup, round advance', async () => {
		await setupTwoPlayerGame(host, guest);

		// Host locks first — destinations must NOT reveal yet.
		await lockDestination(host, 'Cyber City');
		await expectPhase(host, 'navigation');

		// Guest locks — now both reveal and advance to the location phase.
		await lockDestination(guest, 'Tidal Cove');
		await expectPhase(host, 'location');
		await expectPhase(guest, 'location');

		// Host picks the Spirit World Summon action card → the stage shows the draw tray.
		await host.getByTestId('action-spiritWorldSummon').click();
		await expect(host.getByTestId('draw-tray')).toBeVisible();
		await expect(host.getByTestId('picks-left')).toHaveText('Picks left: 2');
		await host.getByTestId('draw-card').first().click();
		await expect(host.getByTestId('picks-left')).toHaveText('Picks left: 1');
		await host.getByTestId('draw-card').first().click();
		// Both picks spent → tray clears and the stage returns to the action grid.
		await expect(host.getByTestId('draw-tray')).toHaveCount(0);

		// Both pass their turn → cleanup.
		await passTurn(host);
		await expectPhase(host, 'location'); // still waiting on guest
		await passTurn(guest);
		await expectPhase(host, 'cleanup');
		await expectPhase(guest, 'cleanup');

		// Both pass cleanup → round 2, navigation.
		await passTurn(host);
		await passTurn(guest);
		await expectRound(host, 2);
		await expectPhase(host, 'navigation');
		await expectPhase(guest, 'navigation');
	});
});
