<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import GameBoard2D from '$lib/components/play2d/GameBoard2D.svelte';
	import AssetLoadingScreen from '$lib/components/play2d/AssetLoadingScreen.svelte';
	import MenuShell from '$lib/components/play2d/MenuShell.svelte';
	import GuardianPicker from '$lib/components/play2d/GuardianPicker.svelte';
	import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
	import { seatAccent } from '$lib/components/play2d/helpers';
	import { requestWakeLock, releaseWakeLock } from '$lib/play/wakeLock';
	import {
		getAssetState,
		preloadAssetImages,
		loadAssetDataSkipImages,
		getGuardianAsset
	} from '$lib/stores/assetStore.svelte';
	import { stopMenu, playMenuSfx, primeMenuSfx } from '$lib/stores/menuAudio.svelte';
	import {
		claimSeat,
		getPlayState,
		hydratePlayRoom,
		sendPlayCommand,
		startPlayGame
	} from '$lib/stores/playStore.svelte';
	import type { RoomView } from '$lib/play/server/service';
	import type { SeatColor } from '$lib/play/types';
	import { SEAT_COLORS, NAVIGATION_TIMER_OPTIONS } from '$lib/play/types';

	interface Props {
		data: { initialView: RoomView };
	}
	let { data }: Props = $props();

	const playState = getPlayState();
	const assetState = getAssetState();

	let pendingAction = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	const room = $derived(playState.room ?? data.initialView.projection);
	const member = $derived(playState.member ?? data.initialView.member);
	const isLobby = $derived(room.status === 'lobby');
	// Terminal state: the room was reaped server-side — a lobby that aged out
	// (≥30 min unstarted) or was abandoned, or a live game everyone left. Show a
	// closed card and bounce back to the browser.
	const isClosed = $derived(room.status === 'closed');
	const isHost = $derived(member.role === 'host');

	$effect(() => {
		if (!isLobby) stopMenu();
	});

	// Once the room reports `closed`, stop the live connection and return the player
	// to the server browser after a short beat so they can read the message.
	$effect(() => {
		if (!isClosed) return;
		playState.disconnect();
		const timer = setTimeout(() => void goto('/play'), 4000);
		return () => clearTimeout(timer);
	});

	// Keep the screen awake during an active match so the device doesn't sleep
	// mid-turn (and silently drop the player). Released when the game ends/unmounts.
	$effect(() => {
		if (room.status === 'active') {
			requestWakeLock();
			return () => void releaseWakeLock();
		}
	});

	// Bots carry this display-name prefix (see botSim.ts).
	const BOT_PREFIX = '🤖 ';
	const isBot = (name?: string | null) => !!name && name.startsWith(BOT_PREFIX);
	const botLabel = (name: string) => name.replace(BOT_PREFIX, '').trim();
	const hasBots = $derived(SEAT_COLORS.some((s) => isBot(room.seats[s]?.displayName)));

	// ── Party derivations ────────────────────────────────────────────────────
	const mySeat = $derived(SEAT_COLORS.find((s) => room.seats[s]?.memberId === member.id) ?? null);
	const occupiedSeats = $derived(SEAT_COLORS.filter((s) => room.seats[s]?.memberId));
	const openSeats = $derived(SEAT_COLORS.filter((s) => !room.seats[s]?.memberId));
	const canStart = $derived(occupiedSeats.length > 0);

	function guardianArt(name: string): string | null {
		const g = getGuardianAsset(name);
		// Show the character icon (fall back to chibi/mat only if it's missing).
		return g?.iconUrl ?? g?.chibiUrl ?? g?.matUrl ?? null;
	}
	function takenByOthers(exceptSeat: SeatColor | null): Set<string> {
		const set = new Set<string>();
		for (const s of SEAT_COLORS) {
			if (s === exceptSeat) continue;
			const g = room.seats[s]?.selectedGuardian;
			if (g) set.add(g);
		}
		return set;
	}

	// ── Character picker ─────────────────────────────────────────────────────
	let pickerSeat = $state<SeatColor | null>(null);
	let pickerIsBot = $state(false);
	function openMyPicker() {
		if (mySeat) {
			pickerSeat = mySeat;
			pickerIsBot = false;
		}
	}
	function openBotPicker(seat: SeatColor) {
		pickerSeat = seat;
		pickerIsBot = true;
	}
	async function handlePick(name: string) {
		const seat = pickerSeat;
		const bot = pickerIsBot;
		pickerSeat = null;
		if (!seat) return;
		if (bot)
			await runAction('botguardian', () => postBots('guardian', { seat, guardianName: name }));
		else
			await runAction('guardian', () =>
				sendPlayCommand({ type: 'selectGuardian', guardianName: name })
			);
	}

	// ── Invite ───────────────────────────────────────────────────────────────
	let inviteOpen = $state(false);
	let copied = $state(false);
	const inviteUrl = $derived(
		browser ? `${location.origin}/play/${room.roomCode}` : `/play/${room.roomCode}`
	);
	async function copyInvite() {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard blocked — the field is selectable as a fallback */
		}
	}

	onMount(() => {
		hydratePlayRoom(data.initialView);

		const preloadAbort = new AbortController();
		// E2E: `?e2e` skips the ~240-image board-art preload (which otherwise saturates
		// the network and gates the board) and renders with placeholder art instead.
		if (browser && new URLSearchParams(location.search).has('e2e')) {
			void loadAssetDataSkipImages();
		} else {
			void preloadAssetImages(preloadAbort.signal);
		}

		let botTimer: ReturnType<typeof setInterval> | null = null;
		if (browser) {
			document.documentElement.classList.add('immersive-play');
			document.body.classList.add('immersive-play');
			botTimer = setInterval(() => {
				if (!isHost || room.status !== 'active' || !hasBots) return;
				void fetch(`/api/play/sessions/${room.roomCode}/bots/tick`, { method: 'POST' }).catch(
					() => {}
				);
			}, 1300);
		}

		return () => {
			preloadAbort.abort();
			playState.disconnect();
			if (botTimer) clearInterval(botTimer);
			if (browser) {
				document.documentElement.classList.remove('immersive-play');
				document.body.classList.remove('immersive-play');
			}
		};
	});

	onDestroy(() => {
		if (!browser) playState.disconnect();
	});

	async function runAction(label: string, work: () => Promise<unknown>) {
		pendingAction = label;
		actionError = null;
		try {
			await work();
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Action failed.';
		} finally {
			pendingAction = null;
		}
	}

	async function postBots(path: string, body?: unknown) {
		const res = await fetch(`/api/play/sessions/${room.roomCode}/bots/${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body ?? {})
		});
		if (!res.ok) {
			const m = (await res.json().catch(() => null))?.message;
			throw new Error(typeof m === 'string' ? m : 'Request failed.');
		}
	}

	async function takeSeat() {
		const seat = openSeats[0];
		if (!seat) return;
		await runAction('claim', () => claimSeat(seat));
		// Seated — open the character picker straight away.
		pickerSeat = seat;
		pickerIsBot = false;
	}
	// Strategy/difficulty for newly added bots. Every value is a real BOT_PROFILES key (validated
	// server-side via profileFor); the strategy rides in the bot's display name. Trimmed to the THREE
	// strongest PLAYABLE bots (fast heuristics — no rollout-search lag in live, host-run play), ordered
	// by head-to-head ELO: PvP Hunter (multiplayer champion, ELO 1930), then the two top economy racers.
	// (Slow search/ISMCTS tiers were dropped — they stutter live play; full roster still in BOT_PROFILES.)
	let botDifficulty = $state('fast');
	const BOT_DIFFICULTIES: { value: string; label: string }[] = [
		{ value: 'pvphunter', label: 'PvP Hunter (hardest · evil)' },
		{ value: 'fast', label: 'Fast (economy · EA-tuned)' },
		{ value: 'culrush', label: 'Culrush (economy)' }
	];
	const addBotAction = () =>
		runAction('add-bot', () => postBots('add', { difficulty: botDifficulty }));
	// Navigation timer (host-only, lobby-only). The <select> works in strings, so "none"
	// is the sentinel for the no-limit (null) preset.
	const navTimerValue = $derived(
		room.navigationDurationMs == null ? 'none' : String(room.navigationDurationMs)
	);
	const navTimerLabel = $derived(
		NAVIGATION_TIMER_OPTIONS.find((o) => o.ms === room.navigationDurationMs)?.label ?? 'Custom'
	);
	const setNavTimer = (value: string) =>
		runAction('nav-timer', () =>
			sendPlayCommand({
				type: 'setNavigationTimer',
				durationMs: value === 'none' ? null : Number(value)
			})
		);
	const removeBotAction = (seat: SeatColor) =>
		runAction(`remove-${seat}`, () => postBots('remove', { seat }));
	const releaseMySeat = () => runAction('release', () => sendPlayCommand({ type: 'releaseSeat' }));
	const startGame = () => {
		playMenuSfx('game-start', { volume: 0.85 });
		return runAction('start', () => startPlayGame());
	};

	// Lobby UI sounds via a delegated action: every button/link plays a hover +
	// click one-shot (Start Game gets its own launch sound, fired in startGame).
	// Using use: keeps the handlers off the element as inline attributes, so the
	// container <div> stays a clean non-interactive node (no a11y warnings).
	function lobbySfx(node: HTMLElement) {
		let last: Element | null = null;
		const over = (e: Event) => {
			const btn = (e.target as Element)?.closest?.('button, a');
			if (!btn || (btn as HTMLButtonElement).disabled) {
				last = null;
				return;
			}
			if (btn === last) return;
			last = btn;
			playMenuSfx('ui-hover', { volume: 0.4 });
		};
		const click = (e: Event) => {
			const btn = (e.target as Element)?.closest?.('button, a');
			if (!btn || (btn as HTMLButtonElement).disabled) return;
			if (btn.getAttribute('data-testid') === 'start-game') return; // launch sound instead
			playMenuSfx('ui-click');
		};
		node.addEventListener('pointerover', over);
		node.addEventListener('click', click);
		return {
			destroy() {
				node.removeEventListener('pointerover', over);
				node.removeEventListener('click', click);
			}
		};
	}

	async function leaveRoom() {
		// Give up my seat (if I hold one) so it frees up, then exit to the play home.
		if (member.seatColor) {
			try {
				await sendPlayCommand({ type: 'releaseSeat' });
			} catch {
				/* leave regardless */
			}
		}
		await goto('/play');
	}
</script>

<svelte:head>
	<title>{room.roomCode} | Arc Spirits Play</title>
</svelte:head>

<div class:immersive-route={!isLobby && !isClosed} class="play-room">
	{#if isClosed}
		<MenuShell>
			<div class="closed">
				<span class="kicker"
					><span class="kn">RM</span><span class="kl"></span> {room.roomCode}</span
				>
				<h1 class="closed-title brand-flame-text">Room closed</h1>
				<p class="closed-sub">
					This room was closed because everyone left, or it stayed open too long without a game
					finishing.
				</p>
				<button type="button" class="closed-btn" onclick={() => goto('/play')}>
					<span class="arrow" aria-hidden="true">←</span> Back to Servers
				</button>
				<span class="closed-hint">Returning you to the server browser…</span>
			</div>
		</MenuShell>
	{:else if isLobby}
		<MenuShell>
			<div class="lobby" use:lobbySfx>
				<button
					type="button"
					class="leave-btn"
					data-testid="leave-room"
					title="Leave this room"
					onclick={leaveRoom}
				>
					<span class="arrow" aria-hidden="true">←</span> Leave
				</button>
				<header class="lhead reveal" style="--d: 0.04s">
					<div>
						<span class="kicker">
							<span class="kn">RM</span><span class="kl"></span> Live Room · {occupiedSeats.length}/{SEAT_COLORS.length}
						</span>
						<h1 class="code brand-flame-text">{room.roomCode}</h1>
					</div>
					<span class="pill" class:off={!playState.isConnected}>
						{playState.isConnected
							? '● Live'
							: playState.isReconnecting
								? '○ Reconnecting'
								: '○ Offline'}
					</span>
				</header>

				{#if actionError}
					<div class="error reveal" role="alert">{actionError}</div>
				{/if}

				<ul class="party reveal" style="--d: 0.12s">
					{#each occupiedSeats as seat (seat)}
						{@const s = room.seats[seat]}
						{@const bot = isBot(s.displayName)}
						{@const mine = s.memberId === member.id}
						{@const art = s.selectedGuardian ? guardianArt(s.selectedGuardian) : null}
						<li class="row" class:mine style="--seat: {seatAccent(seat)}">
							<span class="seatdot"></span>
							<div class="ava" class:empty={!art}>
								{#if art}
									<img src={art} alt={s.selectedGuardian} loading="lazy" />
								{:else}
									<span>{(s.selectedGuardian ?? s.displayName ?? '?').slice(0, 1)}</span>
								{/if}
							</div>
							<div class="info">
								<span class="nm">
									{bot ? botLabel(s.displayName ?? '') : (s.displayName ?? 'Player')}
									{#if mine}<b class="tag you">You</b>{/if}
									{#if bot}<b class="tag bot">Bot</b>{/if}
								</span>
								<span class="ch" class:none={!s.selectedGuardian}>
									{s.selectedGuardian ?? 'No character'}
								</span>
							</div>
							<div class="rowacts">
								{#if mine}
									<button class="mini" onclick={openMyPicker} disabled={pendingAction !== null}>
										{s.selectedGuardian ? 'Change' : 'Choose'}
									</button>
									<button
										class="mini ghosted"
										onclick={releaseMySeat}
										disabled={pendingAction !== null}
									>
										Leave
									</button>
								{:else if isHost && bot}
									<button
										class="mini"
										onclick={() => openBotPicker(seat)}
										disabled={pendingAction !== null}
									>
										{s.selectedGuardian ? 'Change' : 'Choose'}
									</button>
									<button
										class="mini danger"
										data-testid="remove-bot-{seat}"
										onclick={() => removeBotAction(seat)}
										disabled={pendingAction !== null}
									>
										Remove
									</button>
								{/if}
							</div>
						</li>
					{/each}

					{#each openSeats as seat (seat)}
						<li class="row open" style="--seat: {seatAccent(seat)}">
							<span class="seatdot"></span>
							<div class="ava empty">＋</div>
							<div class="info">
								<span class="nm none">Open seat</span>
								<span class="ch none">{seat}</span>
							</div>
						</li>
					{/each}
				</ul>

				<div class="bar reveal" style="--d: 0.2s">
					{#if isHost}
						<label class="setting" data-testid="nav-timer-field">
							<span class="setting-label">Nav timer</span>
							<select
								class="botdiff"
								data-testid="nav-timer"
								value={navTimerValue}
								onchange={(e) => setNavTimer((e.currentTarget as HTMLSelectElement).value)}
								disabled={pendingAction !== null}
								aria-label="Navigation timer per round"
							>
								{#each NAVIGATION_TIMER_OPTIONS as opt (opt.label)}
									<option value={opt.ms == null ? 'none' : String(opt.ms)}>{opt.label}</option>
								{/each}
							</select>
						</label>
					{:else}
						<span class="setting-chip" data-testid="nav-timer-readonly"
							>Nav timer · {navTimerLabel}</span
						>
					{/if}
					{#if !mySeat && openSeats.length}
						<button
							class="primary"
							data-testid="take-seat"
							onclick={takeSeat}
							disabled={pendingAction !== null}
						>
							{pendingAction === 'claim' ? 'Seating…' : 'Take a seat'}
						</button>
					{/if}
					{#if isHost}
						<select
							class="botdiff"
							data-testid="bot-difficulty"
							bind:value={botDifficulty}
							disabled={pendingAction !== null || openSeats.length === 0}
							aria-label="Bot difficulty"
						>
							{#each BOT_DIFFICULTIES as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						<button
							class="ghost"
							data-testid="add-bot"
							onclick={addBotAction}
							disabled={pendingAction !== null || openSeats.length === 0}
						>
							{pendingAction === 'add-bot' ? 'Summoning…' : '+ Add bot'}
						</button>
					{/if}
					<button class="ghost" onclick={() => (inviteOpen = !inviteOpen)}>
						{inviteOpen ? 'Hide invite' : 'Invite player'}
					</button>
					{#if isHost}
						<button
							class="start"
							data-testid="start-game"
							onclick={startGame}
							disabled={pendingAction !== null || !canStart}
						>
							<span>{pendingAction === 'start' ? 'Opening gate…' : 'Start Game'}</span>
							<svg viewBox="0 0 24 24" aria-hidden="true"
								><path
									d="M5 12h14M13 6l6 6-6 6"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							>
						</button>
					{/if}
				</div>

				{#if inviteOpen}
					<div class="invite reveal">
						<span class="ieyebrow">Share this link</span>
						<div class="irow">
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<input
								readonly
								value={inviteUrl}
								onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
							/>
							<button class="ghost" onclick={copyInvite}>{copied ? 'Copied ✓' : 'Copy'}</button>
						</div>
					</div>
				{/if}
			</div>

			<GuardianPicker
				open={pickerSeat !== null}
				title={pickerIsBot ? `Set ${pickerSeat} bot's Guardian` : 'Choose your Guardian'}
				subtitle={pickerIsBot
					? 'As host, you pick the bot’s champion.'
					: 'Bind a champion to your seat.'}
				guardians={room.guardianPool ?? []}
				taken={takenByOthers(pickerSeat)}
				current={pickerSeat ? (room.seats[pickerSeat]?.selectedGuardian ?? null) : null}
				accent={pickerSeat ? seatAccent(pickerSeat) : '#ff2bc7'}
				onPick={handlePick}
				onClose={() => (pickerSeat = null)}
			/>
		</MenuShell>
	{:else}
		<div class="game-viewport">
			{#if !assetState.imagesReady}
				<AssetLoadingScreen progress={assetState.imageProgress} dataReady={assetState.isLoaded} />
			{:else}
				<GameBoard2D {room} {member} assets={assetState} />
			{/if}
		</div>
	{/if}

	<ConnectionStatus
		isConnected={playState.isConnected}
		isReconnecting={playState.isReconnecting}
		onReconnect={() => playState.connect()}
	/>
</div>

<style>
	:global(html.immersive-play),
	:global(body.immersive-play) {
		height: 100%;
		overflow: hidden;
	}
	:global(body.immersive-play .topbar) {
		display: none !important;
	}
	:global(body.immersive-play .app),
	:global(body.immersive-play .app > .flex-1) {
		height: 100vh; /* fallback */
		height: 100dvh;
		overflow: hidden;
	}

	.play-room {
		max-width: 1320px;
		margin: 0 auto;
		padding: 32px 24px 80px;
	}
	.play-room.immersive-route {
		position: fixed;
		inset: 0;
		max-width: none;
		width: 100vw;
		height: 100vh; /* fallback */
		height: 100dvh;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
	.game-viewport {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--color-void);
	}

	/* ── Lobby (minimal list over the abyss) ──────────────────── */
	.lobby {
		position: relative;
		width: 100%;
		min-height: 100%;
		max-width: 680px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 104px 24px 64px;
	}

	/* Top-left "leave room" — sits in the lobby's top padding band. */
	.leave-btn {
		position: absolute;
		top: 30px;
		left: 24px;
		z-index: 3;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-parchment, #e7e0cf);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 999px;
		cursor: pointer;
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		transition:
			background 140ms ease,
			border-color 140ms ease,
			transform 140ms ease,
			color 140ms ease;
	}
	.leave-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: var(--brand-magenta, #ff2bc7);
		color: #fff;
		transform: translateX(-2px);
	}
	.leave-btn .arrow {
		font-size: 0.95rem;
		line-height: 1;
	}

	.lhead {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-display);
		font-size: 0.64rem;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--color-fog, #9a8fb8);
	}
	.kicker .kn {
		font-family: var(--font-mono);
		color: var(--brand-cyan, #24d4ff);
	}
	.kicker .kl {
		width: 20px;
		height: 1px;
		background: currentColor;
		opacity: 0.5;
	}
	.code {
		margin: 6px 0 0;
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 5vw, 3.8rem);
		line-height: 0.9;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		filter: drop-shadow(0 6px 22px rgba(123, 29, 255, 0.45));
	}
	.pill {
		flex: 0 0 auto;
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--brand-teal, #20e0c1);
		color: var(--brand-teal, #20e0c1);
		font-family: var(--font-display);
		font-size: 0.64rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		background: rgba(5, 3, 16, 0.4);
		backdrop-filter: blur(6px);
	}
	.pill.off {
		border-color: var(--color-blood, #ff4d6d);
		color: var(--color-blood, #ff4d6d);
	}

	.error {
		padding: 11px 16px;
		border-left: 3px solid var(--color-blood, #ff4d6d);
		background: rgba(196, 26, 61, 0.3);
		color: var(--color-bone, #f5f0ff);
		border-radius: 2px;
		backdrop-filter: blur(6px);
	}

	/* ── Party list ───────────────────────────────────────────── */
	.party {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		border-radius: 14px;
		overflow: hidden;
		border: 1px solid rgba(123, 29, 255, 0.22);
		background: linear-gradient(180deg, rgba(20, 12, 38, 0.55), rgba(8, 5, 18, 0.66));
		backdrop-filter: blur(14px);
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: background 160ms ease;
	}
	.row:last-child {
		border-bottom: none;
	}
	.row:hover {
		background: rgba(255, 255, 255, 0.03);
	}
	.row.mine {
		background: color-mix(in srgb, var(--seat) 9%, transparent);
	}
	.row.open {
		opacity: 0.5;
	}
	.seatdot {
		flex: 0 0 auto;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--seat);
		box-shadow: 0 0 10px var(--seat);
	}
	.ava {
		flex: 0 0 auto;
		width: 46px;
		height: 46px;
		border-radius: 12px;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: rgba(0, 0, 0, 0.4);
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--seat) 60%, transparent);
	}
	.ava img {
		width: 100%;
		height: 100%;
		/* Character icon — show it whole (vs. cropping the wide player mat). */
		object-fit: contain;
		padding: 10%;
	}
	.ava.empty {
		color: var(--seat);
		font-family: var(--font-display);
		font-size: 1.3rem;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nm {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-size: 1.02rem;
		letter-spacing: 0.04em;
		color: var(--color-bone, #f5f0ff);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tag {
		font-size: 0.56rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 999px;
	}
	.tag.you {
		color: var(--brand-cyan, #24d4ff);
		border: 1px solid rgba(36, 212, 255, 0.4);
	}
	.tag.bot {
		color: var(--brand-amber, #ffba3d);
		border: 1px solid rgba(255, 186, 61, 0.4);
	}
	.ch {
		font-size: 0.8rem;
		color: var(--color-parchment, #d8cfee);
	}
	.ch.none,
	.nm.none {
		color: var(--color-whisper, #6a5d8a);
	}

	.rowacts {
		display: flex;
		gap: 6px;
		flex: 0 0 auto;
	}
	.mini {
		padding: 7px 13px;
		border-radius: 8px;
		border: 1px solid var(--color-aether, #3a2670);
		background: transparent;
		color: var(--color-parchment, #d8cfee);
		font-family: var(--font-display);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			color 150ms ease,
			background 150ms ease;
	}
	.mini:hover:not(:disabled) {
		border-color: var(--brand-magenta, #ff2bc7);
		color: var(--brand-magenta-soft, #ff5dd1);
		background: rgba(255, 43, 199, 0.07);
	}
	.mini.ghosted {
		opacity: 0.7;
	}
	.mini.danger:hover:not(:disabled) {
		border-color: var(--color-blood, #ff4d6d);
		color: var(--color-blood, #ff4d6d);
		background: rgba(255, 77, 109, 0.08);
	}
	.mini:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Action bar ───────────────────────────────────────────── */
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		margin-top: 4px;
	}
	/* Lobby game-setting control (host select) + read-only chip (everyone else). */
	.setting {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.setting-label {
		font-family: var(--font-display);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fog, #9a93b0);
	}
	.setting-chip {
		padding: 9px 14px;
		border-radius: 9px;
		border: 1px solid color-mix(in srgb, var(--brand-violet, #7b1dff) 45%, transparent);
		background: rgba(123, 29, 255, 0.06);
		color: var(--color-parchment, #d8d2e8);
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.ghost {
		padding: 11px 18px;
		border-radius: 9px;
		border: 1px solid var(--brand-violet, #7b1dff);
		background: transparent;
		color: var(--brand-violet-soft, #9d4dff);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 150ms ease;
	}
	.ghost:hover:not(:disabled) {
		color: var(--brand-magenta-soft, #ff5dd1);
		border-color: var(--brand-magenta, #ff2bc7);
		background: rgba(255, 43, 199, 0.07);
	}
	.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.botdiff {
		padding: 11px 14px;
		border-radius: 9px;
		border: 1px solid var(--brand-violet, #7b1dff);
		background: transparent;
		color: var(--brand-violet-soft, #9d4dff);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 150ms ease;
	}
	.botdiff:hover:not(:disabled) {
		color: var(--brand-magenta-soft, #ff5dd1);
		border-color: var(--brand-magenta, #ff2bc7);
		background: rgba(255, 43, 199, 0.07);
	}
	.botdiff:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.botdiff option {
		background: #1a0b2e;
		color: var(--brand-violet-soft, #9d4dff);
	}
	.primary {
		padding: 11px 20px;
		border-radius: 9px;
		border: 1px solid var(--brand-cyan, #24d4ff);
		background: rgba(36, 212, 255, 0.1);
		color: var(--brand-cyan-soft, #6be3ff);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 150ms ease;
	}
	.primary:hover:not(:disabled) {
		background: rgba(36, 212, 255, 0.18);
	}
	.start {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 12px 24px;
		border: none;
		border-radius: 10px;
		background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff, #5a2bff));
		background-size: 180% 180%;
		color: #fff;
		font-family: var(--font-display);
		font-size: 0.92rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		cursor: pointer;
		box-shadow: 0 12px 32px -14px rgba(255, 43, 199, 0.7);
		transition:
			transform 160ms ease,
			background-position 500ms ease,
			box-shadow 160ms ease;
	}
	.start svg {
		width: 19px;
		height: 19px;
		transition: transform 160ms ease;
	}
	.start:hover:not(:disabled) {
		transform: translateY(-2px);
		background-position: 100% 0;
	}
	.start:hover:not(:disabled) svg {
		transform: translateX(4px);
	}
	.start:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Invite reveal ────────────────────────────────────────── */
	.invite {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--color-mist, #2e1d52);
		background: rgba(8, 5, 18, 0.7);
		backdrop-filter: blur(10px);
	}
	.ieyebrow {
		font-family: var(--font-display);
		font-size: 0.6rem;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--brand-cyan, #24d4ff);
	}
	.irow {
		display: flex;
		gap: 10px;
	}
	.irow input {
		flex: 1;
		min-width: 0;
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid var(--color-aether, #3a2670);
		background: rgba(5, 3, 16, 0.7);
		color: var(--color-parchment, #d8cfee);
		font-family: var(--font-mono);
		font-size: 0.84rem;
	}
	.irow input:focus {
		outline: none;
		border-color: var(--brand-magenta, #ff2bc7);
	}

	/* ── Reveal ───────────────────────────────────────────────── */
	.reveal {
		opacity: 0;
		transform: translateY(14px);
		animation: reveal-up 560ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
		animation-delay: var(--d, 0s);
	}
	@keyframes reveal-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Closed room ──────────────────────────────────────────── */
	.closed {
		position: relative;
		width: 100%;
		min-height: 100%;
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 14px;
		padding: 120px 24px 64px;
	}
	.closed-title {
		margin: 4px 0 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 5vw, 3rem);
		line-height: 0.95;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		filter: drop-shadow(0 6px 22px rgba(123, 29, 255, 0.45));
	}
	.closed-sub {
		margin: 0;
		max-width: 42ch;
		color: var(--color-parchment, #d8cfee);
		font-family: var(--font-body);
		font-size: 0.95rem;
		line-height: 1.5;
	}
	.closed-btn {
		margin-top: 10px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 22px;
		border-radius: 10px;
		border: 1px solid var(--brand-magenta, #ff2bc7);
		background: rgba(255, 43, 199, 0.08);
		color: var(--color-bone, #f5f0ff);
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background 150ms ease,
			transform 150ms ease;
	}
	.closed-btn:hover {
		background: rgba(255, 43, 199, 0.16);
		transform: translateY(-1px);
	}
	.closed-btn .arrow {
		font-size: 0.95rem;
		line-height: 1;
	}
	.closed-hint {
		margin-top: 4px;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--color-fog, #9a8fb8);
	}

	@media (max-width: 540px) {
		.lobby {
			padding: 92px 16px 48px;
		}
		.start {
			margin-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.reveal {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
