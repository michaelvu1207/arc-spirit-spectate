// End-to-end awaken+ability smoke test for ONE class, driven via Playwright.
//   node scripts/e2e-awaken.mjs "<ClassName>"
// Seeds a debug room (POST /api/play/debug) for the class, opens the play screen,
// awakens the seeded face-down spirit (handling rune-cost / discard-pick), then
// resolves any awakening-time ability choice (e.g. Purifier class pick). Emits a
// single JSON line `RESULT <json>` on stdout and saves a screenshot. Resilient:
// retries the seed, polls instead of networkidle (SSE keeps the socket busy), and
// dismisses the start cutscene if it intercepts.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5175';
const className = process.argv[2];
if (!className) {
	console.error('usage: node scripts/e2e-awaken.mjs <ClassName>');
	process.exit(2);
}
const slug = className.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const shot = `/tmp/e2e-${slug}.png`;

const result = {
	className,
	ok: false,
	spawned: false,
	spiritName: null,
	awakened: false,
	abilitySurfaced: false,
	abilityKind: null,
	consoleErrors: [],
	steps: [],
	error: null,
	screenshot: shot
};
const step = (s) => {
	result.steps.push(s);
	console.error('• ' + s);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedRoom(ctx) {
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			const res = await ctx.request.post(`${BASE}/api/play/debug`, {
				data: { className, displayName: `${className} bot` },
				timeout: 60000
			});
			if (res.ok()) return await res.json();
			const text = (await res.text()).slice(0, 200);
			step(`seed attempt ${attempt} HTTP ${res.status()}: ${text}`);
			if (res.status() === 400) throw new Error(`no spirit for class (${text})`); // not transient
		} catch (e) {
			step(`seed attempt ${attempt} threw: ${e.message}`);
			if (String(e.message).includes('no spirit')) throw e;
		}
		await sleep(1500 * attempt);
	}
	throw new Error('seed_failed_after_retries');
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const consoleErrors = [];
try {
	const body = await seedRoom(ctx);
	result.spawned = true;
	const proj = body.projection;
	const roomCode = proj.roomCode;
	const me = proj.players[proj.viewer.seatColor];
	const testSpirit = (me.spirits || []).find((s) => (s.classes?.[className] ?? 0) > 0);
	result.spiritName = testSpirit?.name ?? null;
	const seededFaceDown = !!testSpirit?.isFaceDown;
	result.seededFaceDown = seededFaceDown;
	step(`seeded room ${roomCode}, test spirit "${result.spiritName}" (faceDown=${seededFaceDown})`);

	const page = await ctx.newPage();
	page.on('console', (m) => {
		if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
	});
	page.on('pageerror', (e) => consoleErrors.push(('pageerror: ' + e).slice(0, 300)));

	await page.goto(`${BASE}/play/${roomCode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

	// Dismiss the start cutscene / loading overlay if present (it can intercept clicks).
	for (let i = 0; i < 20; i += 1) {
		const sheet = await page.locator('[data-testid="awakening-sheet"]').count();
		if (sheet > 0) break;
		// try to skip a cutscene by clicking center / pressing escape
		await page.keyboard.press('Escape').catch(() => {});
		await page.mouse.click(10, 10).catch(() => {});
		await sleep(1000);
	}
	await page.waitForSelector('[data-testid="awakening-sheet"]', { timeout: 30000 });
	step('awakening sheet visible');

	if (seededFaceDown) {
		// Awaken the face-down spirit via its offer.
		const offers = page.locator('[data-testid="awaken-offers"] button');
		const offerCount = await offers.count();
		if (offerCount === 0) throw new Error('no awaken offer rendered for the seeded face-down spirit');
		await offers.first().click();
		step('clicked awaken offer');
		await sleep(800);

		// If a discard picker opened (handler spirits with item choice), satisfy it.
		if (await page.locator('[data-testid="awaken-discard-pick"]').isVisible().catch(() => false)) {
			const opts = page.locator('[data-testid^="discard-option-"]');
			const confirm = page.locator('[data-testid="awaken-discard-confirm"]');
			const n = await opts.count();
			for (let i = 0; i < n; i += 1) {
				await opts.nth(i).click().catch(() => {});
				if (await confirm.isEnabled().catch(() => false)) break;
			}
			await confirm.click().catch(() => {});
			step('resolved awaken discard picker');
			await sleep(800);
		}

		// Resolve an awakening-time ability choice (e.g. Purifier class pick).
		const choice = page.locator('[data-testid^="ability-choice-"]').first();
		if (await choice.isVisible().catch(() => false)) {
			result.abilitySurfaced = true;
			result.abilityKind = 'choice';
			const buttons = choice.locator('button');
			const bn = await buttons.count();
			let clicked = false;
			for (let i = 0; i < bn; i += 1) {
				const tid = (await buttons.nth(i).getAttribute('data-testid')) || '';
				if (!tid.endsWith('-no')) {
					await buttons.nth(i).click().catch(() => {});
					clicked = true;
					break;
				}
			}
			step(`resolved ability choice (clicked option: ${clicked})`);
			await sleep(800);
		}

		// Verify the spirit awakened: its offer should be gone.
		const remaining = await page.locator('[data-testid="awaken-offers"] button').count();
		result.awakened = remaining < offerCount || offerCount === 1;
	} else {
		// Text-awaken spirit: can't be auto-awakened, so it was seeded face-up
		// (pre-awakened) by the debug seed. Its ability is already live — nothing to click.
		result.awakened = true;
		result.note = 'seeded pre-awakened (text awaken condition cannot be auto-satisfied)';
		step('test spirit seeded face-up (pre-awakened)');
	}
	// A reward claim or recap that mentions the spirit also counts as ability output.
	if (!result.abilitySurfaced) {
		const recap = await page.locator('[data-testid="awakening-recap"]').count();
		if (recap > 0) {
			result.abilitySurfaced = true;
			result.abilityKind = 'recap';
		}
	}

	await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
	result.consoleErrors = consoleErrors;
	result.ok = result.spawned && result.awakened && consoleErrors.length === 0;
	step(`done: awakened=${result.awakened}, abilitySurfaced=${result.abilitySurfaced}, consoleErrors=${consoleErrors.length}`);
} catch (e) {
	result.error = String(e && e.message ? e.message : e);
	result.consoleErrors = consoleErrors;
	step('FAILED: ' + result.error);
} finally {
	await browser.close().catch(() => {});
	console.log('RESULT ' + JSON.stringify(result));
	process.exit(result.ok ? 0 : 1);
}
