<script lang="ts">
	import { submitPlayerFeedback } from '$lib/supabase';

	interface Props {
		gameId: string;
		onClose: () => void;
		onSubmit: () => void;
	}

	let { gameId, onClose, onSubmit }: Props = $props();

	// Form state
	let playerName = $state('');
	let feedbackText = $state('');
	let ratingComplexity = $state(5);
	let ratingEnjoyment = $state(5);
	let ratingOthersEnjoyment = $state(5);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Active slider for visual feedback
	let activeSlider = $state<string | null>(null);

	// Handle form submission
	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!playerName.trim()) {
			error = 'Please enter your name';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			const result = await submitPlayerFeedback({
				gameId,
				playerName: playerName.trim(),
				feedbackText: feedbackText.trim() || null,
				ratingComplexity,
				ratingEnjoyment,
				ratingOthersEnjoyment
			});

			if (result.success) {
				onSubmit();
				onClose();
			} else {
				error = result.message || 'Failed to submit feedback';
			}
		} catch (err) {
			console.error('Error submitting feedback:', err);
			error = 'An unexpected error occurred';
		} finally {
			isSubmitting = false;
		}
	}

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	// Get rating label based on value
	function getRatingLabel(value: number): string {
		if (value <= 2) return 'Very Low';
		if (value <= 4) return 'Low';
		if (value <= 6) return 'Medium';
		if (value <= 8) return 'High';
		return 'Very High';
	}

	// Get rating color based on type and value — using brand CSS vars
	function getRatingColor(type: string): string {
		switch (type) {
			case 'complexity':
				return 'var(--brand-amber)';
			case 'enjoyment':
				return 'var(--brand-teal)';
			case 'others':
				return 'var(--brand-cyan)';
			default:
				return 'var(--brand-violet-soft)';
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
<!-- Modal Backdrop -->
<div
	class="modal-backdrop"
	onclick={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-labelledby="modal-title"
>
	<div class="modal-container">
		<!-- Modal Header -->
		<header class="modal-header">
			<h2 id="modal-title" class="modal-title">
				<span class="title-icon">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
							clip-rule="evenodd"
						/>
					</svg>
				</span>
				Rate This Game
			</h2>
			<button class="close-btn" onclick={onClose} aria-label="Close modal">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
					<path
						d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
					/>
				</svg>
			</button>
		</header>

		<!-- Modal Content -->
		<form class="modal-content" onsubmit={handleSubmit}>
			<!-- Player Name Field -->
			<div class="form-section">
				<label class="form-label" for="player-name">
					<span class="label-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
							<path
								d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z"
							/>
						</svg>
					</span>
					Your Name
				</label>
				<input
					id="player-name"
					type="text"
					bind:value={playerName}
					placeholder="Enter your name..."
					class="form-input"
					autocomplete="off"
				/>
			</div>

			<!-- Ratings Section -->
			<div class="ratings-section">
				<h3 class="ratings-title">Your Ratings</h3>

				<!-- Complexity Rating -->
				<div class="rating-group" class:active={activeSlider === 'complexity'}>
					<div class="rating-header">
						<label class="rating-label" for="rating-complexity">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								style="color: {getRatingColor('complexity')}"
							>
								<path
									d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.06a.75.75 0 011.06 0zM3 8a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 013 8zm11 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0114 8zm-8.082.757a.75.75 0 01.424.974l-1 2.414A.75.75 0 013.944 11.6l1-2.414a.75.75 0 01.974-.429zm8.164 0a.75.75 0 01.974.43l1 2.413a.75.75 0 01-1.398.544l-1-2.414a.75.75 0 01.424-.973zM10 11a1 1 0 100-2 1 1 0 000 2z"
								/>
							</svg>
							Complexity
						</label>
						<div class="rating-value" style="color: {getRatingColor('complexity')}">
							<span class="value-number">{ratingComplexity}</span>
							<span class="value-label">{getRatingLabel(ratingComplexity)}</span>
						</div>
					</div>
					<div class="slider-container">
						<input
							id="rating-complexity"
							type="range"
							min="1"
							max="10"
							bind:value={ratingComplexity}
							class="slider complexity"
							onfocus={() => (activeSlider = 'complexity')}
							onblur={() => (activeSlider = null)}
						/>
						<div class="slider-track">
							<div
								class="slider-fill"
								style="width: {((ratingComplexity - 1) / 9) * 100}%; background: {getRatingColor(
									'complexity'
								)}"
							></div>
						</div>
					</div>
					<p class="rating-hint">How complex did you find this game?</p>
				</div>

				<!-- Enjoyment Rating -->
				<div class="rating-group" class:active={activeSlider === 'enjoyment'}>
					<div class="rating-header">
						<label class="rating-label" for="rating-enjoyment">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								style="color: {getRatingColor('enjoyment')}"
							>
								<path
									d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.572.729 6.016 6.016 0 002.856 0A.75.75 0 0012 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.553 7.553 0 01-2.274 0z"
								/>
							</svg>
							My Enjoyment
						</label>
						<div class="rating-value" style="color: {getRatingColor('enjoyment')}">
							<span class="value-number">{ratingEnjoyment}</span>
							<span class="value-label">{getRatingLabel(ratingEnjoyment)}</span>
						</div>
					</div>
					<div class="slider-container">
						<input
							id="rating-enjoyment"
							type="range"
							min="1"
							max="10"
							bind:value={ratingEnjoyment}
							class="slider enjoyment"
							onfocus={() => (activeSlider = 'enjoyment')}
							onblur={() => (activeSlider = null)}
						/>
						<div class="slider-track">
							<div
								class="slider-fill"
								style="width: {((ratingEnjoyment - 1) / 9) * 100}%; background: {getRatingColor(
									'enjoyment'
								)}"
							></div>
						</div>
					</div>
					<p class="rating-hint">How much did you enjoy playing?</p>
				</div>

				<!-- Others' Enjoyment Rating -->
				<div class="rating-group" class:active={activeSlider === 'others'}>
					<div class="rating-header">
						<label class="rating-label" for="rating-others">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								style="color: {getRatingColor('others')}"
							>
								<path
									d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z"
								/>
							</svg>
							Others' Enjoyment
						</label>
						<div class="rating-value" style="color: {getRatingColor('others')}">
							<span class="value-number">{ratingOthersEnjoyment}</span>
							<span class="value-label">{getRatingLabel(ratingOthersEnjoyment)}</span>
						</div>
					</div>
					<div class="slider-container">
						<input
							id="rating-others"
							type="range"
							min="1"
							max="10"
							bind:value={ratingOthersEnjoyment}
							class="slider others"
							onfocus={() => (activeSlider = 'others')}
							onblur={() => (activeSlider = null)}
						/>
						<div class="slider-track">
							<div
								class="slider-fill"
								style="width: {((ratingOthersEnjoyment - 1) / 9) *
									100}%; background: {getRatingColor('others')}"
							></div>
						</div>
					</div>
					<p class="rating-hint">How much did other players seem to enjoy it?</p>
				</div>
			</div>

			<!-- Feedback Text Field -->
			<div class="form-section">
				<label class="form-label" for="feedback-text">
					<span class="label-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 001.28.53l3.58-3.579a.78.78 0 01.527-.224 41.202 41.202 0 005.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zm0 7a1 1 0 100-2 1 1 0 000 2zM8 8a1 1 0 11-2 0 1 1 0 012 0zm5 1a1 1 0 100-2 1 1 0 000 2z"
								clip-rule="evenodd"
							/>
						</svg>
					</span>
					Additional Comments
					<span class="optional-tag">(Optional)</span>
				</label>
				<textarea
					id="feedback-text"
					bind:value={feedbackText}
					placeholder="Share your thoughts about the game..."
					class="feedback-input form-input"
					rows="3"
				></textarea>
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="error-message">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
							clip-rule="evenodd"
						/>
					</svg>
					{error}
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-actions">
				<button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSubmitting}>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={isSubmitting}>
					{#if isSubmitting}
						<span class="spinner"></span>
						Submitting...
					{:else}
						Submit Review
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(5, 3, 16, 0.85);
		animation: backdrop-in 0.2s ease-out;
	}

	@keyframes backdrop-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	.modal-container {
		width: 100%;
		max-width: 480px;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		animation: modal-in 0.3s ease-out;
	}

	@keyframes modal-in {
		from { opacity: 0; transform: scale(0.95) translateY(10px); }
		to   { opacity: 1; transform: scale(1) translateY(0); }
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-mist);
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-bone);
		margin: 0;
		line-height: 1;
	}

	.title-icon {
		display: flex;
		width: 20px;
		height: 20px;
		color: var(--brand-magenta);
	}
	.title-icon svg { width: 100%; height: 100%; }

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-fog);
		cursor: pointer;
		transition: border-color 180ms ease, color 180ms ease;
	}
	.close-btn:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}
	.close-btn svg { width: 16px; height: 16px; }

	.modal-content {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.label-icon {
		display: flex;
		width: 14px;
		height: 14px;
		color: var(--brand-magenta);
	}
	.label-icon svg { width: 100%; height: 100%; }

	.optional-tag {
		color: var(--color-whisper);
		font-size: 0.65rem;
		text-transform: none;
		letter-spacing: 0;
	}

	.form-input {
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--color-bone);
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		padding: 0.75rem 1rem;
		transition: border-color 180ms ease;
		width: 100%;
	}
	.form-input::placeholder { color: var(--color-whisper); }
	.form-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	.feedback-input {
		resize: vertical;
		min-height: 80px;
		line-height: 1.6;
	}

	/* Ratings Section */
	.ratings-section {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1rem;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
	}

	.ratings-title {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-fog);
		margin: 0 0 0.25rem 0;
	}

	.rating-group {
		padding: 0.75rem;
		border-radius: 4px;
		background: transparent;
		border: 1px solid transparent;
		transition: border-color 180ms ease;
	}
	.rating-group.active {
		border-color: var(--color-mist);
	}

	.rating-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.rating-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-parchment);
		cursor: pointer;
	}
	.rating-label svg { width: 16px; height: 16px; }

	.rating-value {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	/* Big Bebas Neue number */
	.value-number {
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 1;
	}

	.value-label {
		font-family: var(--font-display);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-fog);
	}

	.slider-container {
		position: relative;
		height: 24px;
	}

	.slider {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		z-index: 2;
	}

	.slider-track {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 5px;
		background: var(--color-mist);
		border-radius: 2px;
		transform: translateY(-50%);
		overflow: hidden;
	}

	.slider-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.1s ease-out;
	}

	.rating-hint {
		font-size: 0.75rem;
		font-family: var(--font-body);
		color: var(--color-whisper);
		margin: 0.5rem 0 0 0;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		font-family: var(--font-body);
		font-size: 0.85rem;
		color: var(--brand-coral);
		background: var(--color-shadow);
		border-left: 4px solid var(--brand-coral);
		border-radius: 2px;
	}
	.error-message svg { width: 16px; height: 16px; flex-shrink: 0; }

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-mist);
	}

	/* Cancel = dark with magenta outline */
	.btn-secondary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-magenta);
		background: transparent;
		border: 1px solid var(--brand-magenta);
		border-radius: 2px;
		cursor: pointer;
		transition: background 180ms ease;
	}
	.btn-secondary:hover:not(:disabled) {
		background: rgba(255, 43, 199, 0.08);
	}
	.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Submit = solid magenta fill */
	.btn-primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1.5rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #fff;
		background: var(--brand-magenta);
		border: none;
		border-radius: 2px;
		cursor: pointer;
		transition: background 180ms ease;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--brand-magenta-soft);
	}
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Scrollbar */
	.modal-container::-webkit-scrollbar       { width: 6px; }
	.modal-container::-webkit-scrollbar-track { background: transparent; }
	.modal-container::-webkit-scrollbar-thumb {
		background: var(--brand-violet-deep);
		border-radius: 3px;
	}
	.modal-container::-webkit-scrollbar-thumb:hover { background: var(--brand-violet); }
</style>
