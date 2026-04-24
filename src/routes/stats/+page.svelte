<svelte:head>
	<title>Stats | Arc Spirits Spectate</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 text-white">
	<main class="mx-auto max-w-6xl px-4 py-8">
		<div class="mb-8">
			<h1 class="text-xl font-bold text-gray-100">Stats</h1>
			<p class="mt-1 text-sm text-gray-400">
				Derived from verified games (over 10 turns; players with a TTS username and ≥10 VP).
			</p>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<a
				href="/stats/tags"
				class="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:bg-gray-900/60"
			>
				<div class="text-sm font-semibold text-gray-100">Composition Tags</div>
				<div class="mt-1 text-xs text-gray-500">
					Manual tags you assign per player per game. Ranked by average VP / placement.
				</div>
			</a>

			<a
				href="/stats/characters"
				class="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:bg-gray-900/60"
			>
				<div class="text-sm font-semibold text-gray-100">Characters</div>
				<div class="mt-1 text-xs text-gray-500">Average VP / placement by selected character.</div>
			</a>

			<a
				href="/stats/traits"
				class="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:bg-gray-900/60"
			>
				<div class="text-sm font-semibold text-gray-100">Trait Stats</div>
				<div class="mt-1 text-xs text-gray-500">
					Average VP / placement for exact class/origin counts (e.g. 4 Fighters, 5 Fighters).
				</div>
			</a>
		</div>
	</main>
</div>
