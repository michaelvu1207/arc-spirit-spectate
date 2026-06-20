<script lang="ts">
	import { summonFx, removeSummonFlyer, type SummonFlyer } from '$lib/stores/summonFx.svelte';

	// Move the overlay to <body> so position:fixed resolves against the viewport and
	// is never clipped by a transformed/overflow-hidden board ancestor.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}

	// Honor reduced-motion: skip the heavy WAAPI burst (the overlay itself is also
	// hidden via CSS under this media query). SSR-safe — flyTo only runs in the DOM.
	const reduceMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Fly the clone from its spawn point into the tableau, twisting + shrinking, then
	// pulse the tableau card on arrival.
	function flyTo(node: HTMLElement, flyer: SummonFlyer) {
		if (reduceMotion) {
			// No animation: retire the flyer immediately so state doesn't accumulate.
			removeSummonFlyer(flyer.id);
			return { destroy() {} };
		}
		const sc = { x: flyer.src.left + flyer.src.width / 2, y: flyer.src.top + flyer.src.height / 2 };
		const dc = flyer.dst
			? { x: flyer.dst.left + flyer.dst.width / 2, y: flyer.dst.top + flyer.dst.height / 2 }
			: { x: window.innerWidth - 90, y: window.innerHeight - 90 };
		const dx = dc.x - sc.x;
		const dy = dc.y - sc.y;
		// Promote to its own layer only for the duration of the flight — a permanent
		// will-change on every flyer wastes GPU memory once the animation is done.
		node.style.willChange = 'transform, opacity';
		const anim = node.animate(
			[
				{ offset: 0, transform: 'translate(0,0) scale(1) rotateY(0deg) rotateZ(0deg)', opacity: 1, filter: 'brightness(1.5) drop-shadow(0 0 16px rgba(180,120,255,.95))' },
				{ offset: 0.28, transform: `translate(${dx * 0.12}px, ${dy * 0.08 - 80}px) scale(1.22) rotateY(220deg) rotateZ(-10deg)`, opacity: 1, filter: 'brightness(1.7) drop-shadow(0 0 26px rgba(200,150,255,1))' },
				{ offset: 0.72, transform: `translate(${dx * 0.62}px, ${dy * 0.55}px) scale(0.5) rotateY(600deg) rotateZ(14deg)`, opacity: 1, filter: 'brightness(1.4) drop-shadow(0 0 18px rgba(120,220,255,.95))' },
				{ offset: 1, transform: `translate(${dx}px, ${dy}px) scale(0.06) rotateY(1100deg) rotateZ(0deg)`, opacity: 0.1, filter: 'brightness(2.2) drop-shadow(0 0 6px rgba(120,220,255,.6))' }
			],
			{ duration: 980, easing: 'cubic-bezier(.55,.06,.25,1)' }
		);
		anim.onfinish = () => {
			// Drop the layer-promotion hint now the flight is done.
			node.style.willChange = '';
			removeSummonFlyer(flyer.id);
			document
				.querySelector('[data-testid="spirit-hex-card"]')
				?.animate(
					[
						{ transform: 'scale(1)', filter: 'brightness(1)' },
						{ transform: 'scale(1.16)', filter: 'brightness(1.6) drop-shadow(0 0 18px rgba(150,120,255,.9))' },
						{ transform: 'scale(1)', filter: 'brightness(1)' }
					],
					{ duration: 460, easing: 'cubic-bezier(.34,1.56,.64,1)' }
				);
		};
		return {
			destroy() {
				node.style.willChange = '';
				try {
					anim.cancel();
				} catch {
					/* noop */
				}
			}
		};
	}
</script>

{#if summonFx.flyers.length > 0 || summonFx.bursts.length > 0}
	<div class="fx-overlay" use:portal aria-hidden="true">
		{#each summonFx.bursts as burst (burst.id)}
			<div class="burst" style="left: {burst.x}px; top: {burst.y}px;">
				<span class="ring r1"></span>
				<span class="ring r2"></span>
				<span class="ring r3"></span>
				{#each burst.sparks as s (s.id)}
					<span
						class="spark"
						style="--tx: {s.tx}px; --ty: {s.ty}px; --d: {s.delay}ms; --hue: {s.hue}; --sz: {s.size}px;"
					></span>
				{/each}
			</div>
		{/each}
		{#each summonFx.flyers as flyer (flyer.id)}
			<div
				class="flyer"
				style="left: {flyer.src.left}px; top: {flyer.src.top}px; width: {flyer.src.width}px; height: {flyer.src.height}px;"
				use:flyTo={flyer}
			>
				{#if flyer.img}
					<img src={flyer.img} alt="" />
				{:else}
					<span class="flyer-fallback">{flyer.name}</span>
				{/if}
				<span class="flyer-trail" aria-hidden="true"></span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.fx-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
		overflow: visible;
	}
	.flyer {
		position: fixed;
		/* will-change is applied imperatively in flyTo() only for the flight's duration
		   and cleared on finish/cancel — a permanent hint on every flyer wastes GPU
		   memory. */
	}
	.flyer img,
	.flyer .flyer-fallback {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 10px;
	}
	.flyer .flyer-fallback {
		display: grid;
		place-items: center;
		color: #fff;
		background: rgba(20, 10, 40, 0.85);
		font-family: var(--font-display);
	}
	.flyer .flyer-trail {
		position: absolute;
		inset: -12%;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(190, 150, 255, 0.55), rgba(120, 220, 255, 0.18) 55%, transparent 72%);
		filter: blur(8px);
		z-index: -1;
	}

	.burst {
		position: fixed;
		width: 0;
		height: 0;
	}
	.ring {
		position: absolute;
		left: 0;
		top: 0;
		width: 44px;
		height: 44px;
		margin: -22px 0 0 -22px;
		border-radius: 50%;
		border: 2px solid rgba(190, 140, 255, 0.9);
		opacity: 0;
		animation: fx-ring 820ms ease-out forwards;
	}
	.ring.r2 {
		animation-delay: 110ms;
		border-color: rgba(120, 220, 255, 0.9);
	}
	.ring.r3 {
		animation-delay: 220ms;
		border-color: rgba(255, 150, 230, 0.9);
	}
	.spark {
		position: absolute;
		left: 0;
		top: 0;
		width: var(--sz);
		height: var(--sz);
		border-radius: 50%;
		background: radial-gradient(circle, hsl(var(--hue) 100% 82%) 0%, hsl(var(--hue) 100% 62%) 45%, transparent 72%);
		box-shadow: 0 0 8px hsl(var(--hue) 100% 70%);
		opacity: 0;
		animation: fx-spark 920ms var(--d) cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
	}
	@keyframes fx-ring {
		0% {
			transform: scale(0.2);
			opacity: 0.95;
		}
		100% {
			transform: scale(5);
			opacity: 0;
		}
	}
	@keyframes fx-spark {
		0% {
			transform: translate(-50%, -50%) scale(0.2);
			opacity: 0;
		}
		18% {
			opacity: 1;
		}
		100% {
			transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fx-overlay {
			display: none;
		}
	}
</style>
