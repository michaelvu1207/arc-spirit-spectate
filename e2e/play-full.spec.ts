import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
	setupTwoPlayerGame,
	lockDestination,
	passTurn,
	expectPhase,
	expectRound,
	claimMonsterRewardIfPresent
} from './helpers';

/**
 * Full-game pass: drives two networked players through every round phase via the
 * morphing main stage — navigation lock/reveal, location action cards (Spirit
 * World Summon, Rest, Cultivate), Arcane Abyss monster combat, and cleanup —
 * across multiple rounds. (Encounter auto-skips with no mixed alignment; PvP is
 * covered by unit tests.)
 */
test.describe('2D play — full game loop', () => {
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

	test('summon, rest, cultivate, abyss combat, cleanup across rounds', async () => {
		await setupTwoPlayerGame(host, guest);

		// ── Round 1: location actions in the Spirit World ──────────────────
		await lockDestination(host, 'Cyber City');
		await lockDestination(guest, 'Floral Patch');
		await expectPhase(host, 'location');
		await expectPhase(guest, 'location');

		// Spirit World Summon → pick two spirits from the tray; the tray then clears
		// and the stage returns to the action grid.
		await host.getByTestId('action-spiritWorldSummon').click();
		await expect(host.getByTestId('draw-tray')).toBeVisible();
		await host.getByTestId('draw-card').first().click();
		await host.getByTestId('draw-card').first().click();
		await expect(host.getByTestId('draw-tray')).toHaveCount(0);

		// Rest → result card → continue; Cultivate → result card → continue.
		await host.getByTestId('action-rest').click();
		await host.getByTestId('result-continue').click();
		await host.getByTestId('action-cultivate').click();
		await host.getByTestId('result-continue').click();
		await expect(host.locator('.error')).toHaveCount(0);

		await passTurn(host);
		await passTurn(guest);
		await expectPhase(host, 'cleanup');

		await passTurn(host);
		await passTurn(guest);
		await expectRound(host, 2);
		await expectPhase(host, 'navigation');

		// ── Round 2: Arcane Abyss monster combat ───────────────────────────
		await lockDestination(host, 'Arcane Abyss');
		await lockDestination(guest, 'Tidal Cove');
		await expectPhase(host, 'location');

		// Fight the Monster → the stage shows the combat result; continue back.
		await host.getByTestId('action-monsterCombat').click();
		await expect(host.getByTestId('combat-overlay')).toBeVisible();
		await host.getByTestId('combat-continue').click();
		// A defeated monster opens a reward selection (pick up to 2) — claim it if shown.
		await claimMonsterRewardIfPresent(host);

		await passTurn(host);
		await passTurn(guest);
		await expectPhase(host, 'cleanup');
		await passTurn(host);
		await passTurn(guest);

		// ── Reached round 3 with all phases exercised ──────────────────────
		await expectRound(host, 3);
		await expectPhase(host, 'navigation');
		await expectPhase(guest, 'navigation');
	});
});
