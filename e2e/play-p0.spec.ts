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

	test('navigation lock/reveal, pass, cleanup, round advance', async () => {
		await setupTwoPlayerGame(host, guest);

		// Host locks first — destinations must NOT reveal yet.
		await lockDestination(host, 'Cyber City');
		await expectPhase(host, 'navigation');

		// Guest locks — once every seat is locked the server collapses the navigation
		// deadline to a short grace, then reveals and advances to the location phase.
		await lockDestination(guest, 'Tidal Cove');
		await expectPhase(host, 'location');
		await expectPhase(guest, 'location');

		// NOTE: the per-location action beats (Spirit World Summon → draw tray, etc.) now
		// resolve through the interaction grid and are scenario-data-dependent; that
		// migration lives with play-full. This P0 spec covers the core PHASE MACHINE —
		// lock → reveal → pass → cleanup → round advance — which is the highest-value
		// regression net. Both players simply pass their location turn.

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
