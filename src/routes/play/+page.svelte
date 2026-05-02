<script lang="ts">
	import { goto } from '$app/navigation';
	import { createPlayRoom, joinPlayRoom } from '$lib/stores/playStore.svelte';

	interface Props {
		data: {
			lastRoomCode: string | null;
		};
	}

	let { data }: Props = $props();

	let createName = $state('');
	let joinName = $state('');
	let joinCode = $state('');
	let pending = $state<'create' | 'join' | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!joinCode && data.lastRoomCode) {
			joinCode = data.lastRoomCode;
		}
	});

	async function handleCreate() {
		pending = 'create';
		error = null;
		try {
			const view = await createPlayRoom(createName);
			await goto(`/play/${encodeURIComponent(view.projection.roomCode)}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create room.';
		} finally {
			pending = null;
		}
	}

	async function handleJoin() {
		pending = 'join';
		error = null;
		try {
			const view = await joinPlayRoom(joinCode, joinName);
			await goto(`/play/${encodeURIComponent(view.projection.roomCode)}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join room.';
		} finally {
			pending = null;
		}
	}
</script>

<svelte:head>
	<title>Play Arc Spirits | Arc Spirits Spectate</title>
</svelte:head>

<div class="play-home">
	<section class="hero">
		<div class="eyebrow">Play Surface</div>
		<h1>Run Arc Spirits in the browser.</h1>
		<p>
			Create a live room, claim seats, choose guardians, and move into a real multiplayer game loop
			without leaving the Spectate app.
		</p>
	</section>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<div class="panels">
		<section class="panel">
			<h2>Create Room</h2>
			<label>
				<span>Display name</span>
				<input bind:value={createName} maxlength="40" placeholder="Host Player" />
			</label>
			<button type="button" class="btn-primary" onclick={handleCreate} disabled={pending !== null}>
				{pending === 'create' ? 'Creating…' : 'Create room'}
			</button>
		</section>

		<section class="panel">
			<h2>Join Room</h2>
			<label>
				<span>Room code</span>
				<input bind:value={joinCode} maxlength="12" placeholder="ROOM42" style="text-transform: uppercase;" />
			</label>
			<label>
				<span>Display name</span>
				<input bind:value={joinName} maxlength="40" placeholder="Guest Player" />
			</label>
			<button type="button" class="btn-primary" onclick={handleJoin} disabled={pending !== null}>
				{pending === 'join' ? 'Joining…' : 'Join room'}
			</button>
			{#if data.lastRoomCode}
				<a class="last-room" href={`/play/${encodeURIComponent(data.lastRoomCode)}`}>
					Resume recent room {data.lastRoomCode}
				</a>
			{/if}
		</section>
	</div>
</div>

<style>
	.play-home {
		max-width: 1120px;
		margin: 0 auto;
		padding: 42px 24px 80px;
	}

	/* ── Hero ─────────────────────────────────────────────── */
	.hero {
		padding: 40px 36px 36px;
		background: var(--color-tomb);
		border: 1px solid var(--brand-violet);
		border-radius: 4px;
		position: relative;
	}

	/* Single magenta underline accent on the hero bottom edge */
	.hero::after {
		content: '';
		position: absolute;
		left: 36px;
		bottom: 0;
		width: 72px;
		height: 3px;
		background: var(--brand-magenta);
	}

	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--brand-cyan);
		margin-bottom: 10px;
	}

	.hero h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.8rem, 5vw, 5rem);
		line-height: 0.92;
		color: #fff;
		letter-spacing: 0.02em;
	}

	.hero p {
		max-width: 54rem;
		margin: 20px 0 0;
		font-size: 1rem;
		line-height: 1.7;
		color: var(--color-fog);
	}

	/* ── Error ────────────────────────────────────────────── */
	.error-banner {
		margin-top: 20px;
		padding: 14px 16px;
		background: rgba(110, 18, 35, 0.52);
		border-left: 3px solid var(--color-blood);
		color: var(--color-parchment);
	}

	/* ── Panels ───────────────────────────────────────────── */
	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
		margin-top: 24px;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 28px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
	}

	.panel h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 2rem;
		letter-spacing: 0.04em;
		color: #fff;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--brand-magenta);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	label span {
		font-size: 0.72rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--brand-cyan);
		font-family: var(--font-display);
	}

	input {
		padding: 13px 14px;
		border-radius: 0;
		border: 1px solid var(--color-aether);
		background: var(--color-shadow);
		color: #fff;
		font-size: 1rem;
		font-family: var(--font-body);
		transition: border-color 150ms ease;
	}

	input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	input::placeholder {
		color: var(--color-whisper);
	}

	/* Solid magenta block button — no gradients */
	.btn-primary {
		align-self: flex-start;
		padding: 14px 28px;
		border-radius: 0;
		border: none;
		background: var(--brand-magenta);
		color: #fff;
		font-family: var(--font-display);
		font-size: 1.1rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.btn-primary:hover {
		background: var(--brand-magenta-soft);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.last-room {
		color: var(--brand-cyan);
		text-decoration: none;
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.1em;
	}

	.last-room:hover {
		color: var(--brand-magenta-soft);
	}

	@media (max-width: 800px) {
		.panels {
			grid-template-columns: 1fr;
		}
	}
</style>
