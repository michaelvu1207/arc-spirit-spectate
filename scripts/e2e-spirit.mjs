// End-to-end awaken+ability test for ONE specific spirit (by id), driven via Playwright.
//   node scripts/e2e-spirit.mjs "<spiritId>" "<spiritName>"
// Seeds a debug room targeting that exact spirit (face-down, with its REAL awaken
// condition satisfied), opens the play screen, confirms an awaken OFFER card appears
// (not just a locked hint), awakens it through the real handler, then resolves any
// awakening-time ability choice. Emits `RESULT <json>` and a screenshot.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5175';
const spiritId = process.argv[2];
const spiritName = process.argv[3] || spiritId;
if (!spiritId) {
	console.error('usage: node scripts/e2e-spirit.mjs <spiritId> [spiritName]');
	process.exit(2);
}
const slug = spiritName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const shot = `/tmp/e2e-spirit-${slug}.png`;

const result = {
	spiritId,
	spiritName,
	ok: false,
	spawned: false,
	offered: false,
	locked: false,
	awakened: false,
	abilitySurfaced: false,
	abilityKind: null,
	consoleErrors: [],
	error: null,
	screenshot: shot
};
const step = (s) => console.error('• ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedRoom(ctx) {
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			const res = await ctx.request.post(`${BASE}/api/play/debug`, {
				data: { spiritId, displayName: `${spiritName} bot` },
				timeout: 60000
			});
			if (res.ok()) return await res.json();
			const text = (await res.text()).slice(0, 200);
			step(`seed attempt ${attempt} HTTP ${res.status()}: ${text}`);
			if (res.status() === 400) throw new Error(`bad seed (${text})`);
		} catch (e) {
			step(`seed attempt ${attempt} threw: ${e.message}`);
			if (String(e.message).includes('bad seed')) throw e;
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
	const seeded = (me.spirits || []).find((s) => s.id === spiritId && s.isFaceDown);
	const slot = seeded?.slotIndex ?? null;
	result.offered = (me.awakenOffers || []).some((o) => o.slotIndex === slot);
	result.locked = (me.awakenLocked || []).some((o) => o.slotIndex === slot);
	step(`room ${roomCode}, slot ${slot}, offered=${result.offered}, locked=${result.locked}`);

	const page = await ctx.newPage();
	page.on('console', (m) => {
		if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
	});
	page.on('pageerror', (e) => consoleErrors.push(('pageerror: ' + e).slice(0, 300)));
	await page.goto(`${BASE}/play/${roomCode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

	for (let i = 0; i < 25; i += 1) {
		if ((await page.locator('[data-testid="awakening-sheet"]').count()) > 0) break;
		await page.keyboard.press('Escape').catch(() => {});
		await page.mouse.click(8, 8).catch(() => {});
		await sleep(1000);
	}
	await page.waitForSelector('[data-testid="awakening-sheet"]', { timeout: 30000 });
	step('awakening sheet visible');

	if (slot == null) throw new Error('seeded spirit not found face-down in projection');
	if (!result.offered) {
		// The spirit is present but NOT an awaken offer — its real condition was not
		// satisfied by the seed (it shows only as a locked card). This is a finding.
		throw new Error(result.locked ? 'condition not satisfied (shows as locked card only)' : 'no offer and not locked');
	}

	// The live SSE poll re-renders the sheet ~1×/s, so Playwright's actionability checks
	// (and even force-click's scroll-then-click) race the DOM replacement. dispatchEvent
	// fires the onclick handler directly — immune to that — wrapped in a retry loop.
	const dispatch = async (sel) => {
		const loc = page.locator(sel).first();
		if ((await loc.count()) === 0) return false;
		await loc.dispatchEvent('click').catch(() => {});
		return true;
	};
	const offerSel = `[data-testid="awaken-${slot}"]`;
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if ((await page.locator(offerSel).count()) === 0) break; // offer gone ⇒ awakened
		await dispatch(offerSel);
		await sleep(600);
		// Discard picker (relic Faeries with a choice of which relic, etc.).
		if (await page.locator('[data-testid="awaken-discard-pick"]').isVisible().catch(() => false)) {
			const opts = page.locator('[data-testid^="discard-option-"]');
			const confirm = page.locator('[data-testid="awaken-discard-confirm"]');
			const n = await opts.count();
			for (let i = 0; i < n; i += 1) {
				await opts.nth(i).dispatchEvent('click').catch(() => {});
				if (await confirm.isEnabled().catch(() => false)) break;
			}
			await confirm.dispatchEvent('click').catch(() => {});
			await sleep(600);
		}
	}
	step('awaken interaction done');
	await sleep(600);

	// Awakening-time ability choice (e.g. Purifier class pick).
	const choice = page.locator('[data-testid^="ability-choice-"]').first();
	if (await choice.isVisible().catch(() => false)) {
		result.abilitySurfaced = true;
		result.abilityKind = 'choice';
		const buttons = choice.locator('button');
		const bn = await buttons.count();
		for (let i = 0; i < bn; i += 1) {
			const tid = (await buttons.nth(i).getAttribute('data-testid')) || '';
			if (!tid.endsWith('-no')) {
				await buttons.nth(i).dispatchEvent('click').catch(() => {});
				break;
			}
		}
		step('resolved ability choice');
		await sleep(600);
	}

	// Awaken success: the spirit's offer card is gone.
	const stillOffered = (await page.locator(offerSel).count()) > 0;
	result.awakened = !stillOffered;
	if (!result.abilitySurfaced && (await page.locator('[data-testid="awakening-recap"]').count()) > 0) {
		result.abilitySurfaced = true;
		result.abilityKind = 'recap';
	}

	await page.screenshot({ path: shot }).catch(() => {});
	result.consoleErrors = consoleErrors;
	result.ok = result.spawned && result.offered && result.awakened && consoleErrors.length === 0;
	step(`done: awakened=${result.awakened} abilitySurfaced=${result.abilitySurfaced} errors=${consoleErrors.length}`);
} catch (e) {
	result.error = String(e && e.message ? e.message : e);
	result.consoleErrors = consoleErrors;
	step('FAILED: ' + result.error);
} finally {
	await browser.close().catch(() => {});
	console.log('RESULT ' + JSON.stringify(result));
	process.exit(result.ok ? 0 : 1);
}
