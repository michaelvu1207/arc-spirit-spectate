/**
 * Generate monster-fight sound effects via the ElevenLabs text-to-sound-effects
 * API and drop them into static/sfx/. Re-runnable (overwrites).
 *
 *   node scripts/generate-combat-sfx.mjs           # generate all
 *   node scripts/generate-combat-sfx.mjs combat-attack combat-defeat  # subset
 *
 * Reads ELEVENLABS_API_KEY from the environment or .env.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'sfx');

function apiKey() {
	if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
	const envPath = join(root, '.env');
	if (existsSync(envPath)) {
		for (const line of readFileSync(envPath, 'utf8').split('\n')) {
			const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/);
			if (m) return m[1].replace(/^["']|["']$/g, '');
		}
	}
	throw new Error('ELEVENLABS_API_KEY not found in env or .env');
}

// Monster-fight SFX set. Keep them SHORT and punchy — one-shots that overlap the
// combat overlay's dramatic reveal.
const SFX = [
	{
		name: 'combat-start',
		prompt:
			'Epic dark-fantasy battle begins: a sudden ominous low brass swell with a deep war-drum hit and a metallic ring, cinematic and tense, no music loop, short impactful sting.',
		duration_seconds: 2.5,
		prompt_influence: 0.4
	},
	{
		name: 'combat-attack',
		prompt:
			'A huge monster attacks a hero: guttural beast roar with a heavy claw slash and a bone-crunch impact, visceral, dark, dry, short.',
		duration_seconds: 1.6,
		prompt_influence: 0.5
	},
	{
		name: 'combat-strike',
		prompt:
			'Hero counterattacks an enemy: fast metallic sword slash with an arcane magic shimmer impact and a quick dice clatter, crisp and bright, short.',
		duration_seconds: 1.3,
		prompt_influence: 0.4
	},
	{
		name: 'combat-corrupt',
		prompt:
			'Dark corruption overtakes a soul: an ominous demonic whoosh with a low distorted drone and an eerie reverse magical shimmer, unsettling, short.',
		duration_seconds: 1.8,
		prompt_influence: 0.45
	},
	{
		name: 'combat-defeat',
		prompt:
			'A monster is defeated: a dying creature groan collapsing into dust, followed by a triumphant magical chime and a soft ember crackle, satisfying, short.',
		duration_seconds: 2.2,
		prompt_influence: 0.4
	}
];

async function generate(key, spec) {
	const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
		method: 'POST',
		headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			text: spec.prompt,
			duration_seconds: spec.duration_seconds,
			prompt_influence: spec.prompt_influence
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${spec.name}: HTTP ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	const file = join(outDir, `${spec.name}.mp3`);
	writeFileSync(file, buf);
	return { file, bytes: buf.length };
}

const only = process.argv.slice(2);
const targets = only.length ? SFX.filter((s) => only.includes(s.name)) : SFX;
if (!targets.length) {
	console.error('No matching SFX. Names:', SFX.map((s) => s.name).join(', '));
	process.exit(1);
}

const key = apiKey();
let failed = 0;
for (const spec of targets) {
	try {
		const { file, bytes } = await generate(key, spec);
		console.log(`✓ ${spec.name}.mp3  (${(bytes / 1024).toFixed(1)} KB)`);
		if (bytes < 1000) console.warn(`  ⚠ ${spec.name} is suspiciously small`);
		void statSync(file);
	} catch (err) {
		failed += 1;
		console.error(`✗ ${err.message}`);
	}
}
process.exit(failed ? 1 : 0);
