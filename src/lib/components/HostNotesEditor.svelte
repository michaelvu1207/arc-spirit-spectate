<script lang="ts">
	import type { GameNotes } from '$lib/types';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		gameId: string;
		existingNotes: GameNotes | null;
		onClose: () => void;
		onSave: () => void;
	}

	let { gameId, existingNotes, onClose, onSave }: Props = $props();

	// Form state
	let hostSecret = $state('');
	let summary = $state(existingNotes?.summary || '');
	let improvements = $state<string[]>(existingNotes?.improvements || ['']);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let showSecret = $state(false);

	// Add a new improvement field
	function addImprovement() {
		improvements = [...improvements, ''];
	}

	// Remove an improvement field
	function removeImprovement(index: number) {
		if (improvements.length > 1) {
			improvements = improvements.filter((_, i) => i !== index);
		}
	}

	// Update improvement at index
	function updateImprovement(index: number, value: string) {
		improvements = improvements.map((item, i) => (i === index ? value : item));
	}

	// Handle form submission
	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!hostSecret.trim()) {
			error = 'Please enter your host secret key';
			return;
		}

		isSubmitting = true;
		error = null;

		// Filter out empty improvements
		const filteredImprovements = improvements.filter((i) => i.trim() !== '');

		try {
			const response = await fetch('/api/notes', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					gameId,
					hostSecret: hostSecret.trim(),
					summary: summary.trim() || null,
					improvements: filteredImprovements
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				onSave();
				onClose();
			} else {
				error = result.message || 'Failed to save notes';
			}
		} catch (err) {
			console.error('Error saving notes:', err);
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
	<div class="brand-panel brand-panel-glow modal-container">
		<!-- Modal Header -->
		<header class="modal-header">
			<div class="modal-title-block">
				<span class="eyebrow eyebrow-magenta">HOST NOTES</span>
				<h2 id="modal-title" class="modal-title">
					<span class="title-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
							<path
								d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z"
							/>
						</svg>
					</span>
					Host Notes Editor
				</h2>
			</div>
			<button class="close-btn btn-ghost" onclick={onClose} aria-label="Close modal">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
					<path
						d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
					/>
				</svg>
			</button>
		</header>

		<!-- Modal Content -->
		<form class="modal-content" onsubmit={handleSubmit}>
			<!-- Secret Key Field -->
			<div class="form-section secret-section">
				<label class="form-label" for="host-secret">
					<span class="label-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M8 7a5 5 0 113.61 4.804l-1.903 1.903A1 1 0 019 14H8v1a1 1 0 01-1 1H6v1a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a1 1 0 01.293-.707L8.196 8.39A5.002 5.002 0 018 7zm5-3a.75.75 0 000 1.5A1.5 1.5 0 0114.5 7 .75.75 0 0016 7a3 3 0 00-3-3z"
								clip-rule="evenodd"
							/>
						</svg>
					</span>
					Host Secret Key
				</label>
				<div class="secret-input-wrapper">
					<input
						id="host-secret"
						type={showSecret ? 'text' : 'password'}
						bind:value={hostSecret}
						placeholder="Enter your secret key..."
						class="form-input secret-input"
						autocomplete="off"
					/>
					<button
						type="button"
						class="toggle-secret-btn"
						onclick={() => (showSecret = !showSecret)}
						aria-label={showSecret ? 'Hide secret' : 'Show secret'}
					>
						{#if showSecret}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
								<path
									fill-rule="evenodd"
									d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z"
									clip-rule="evenodd"
								/>
								<path
									d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"
								/>
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
								<path
									fill-rule="evenodd"
									d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
									clip-rule="evenodd"
								/>
							</svg>
						{/if}
					</button>
				</div>
				<p class="form-hint">Enter your host secret key to save notes.</p>
			</div>

			<!-- Summary Field -->
			<div class="form-section">
				<span class="form-label">
					<span class="label-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
							<path
								d="M3.5 2.75a.75.75 0 00-1.5 0v14.5a.75.75 0 001.5 0v-4.392l1.657-.348a6.449 6.449 0 014.271.572 7.948 7.948 0 005.965.524l2.078-.64A.75.75 0 0018 11.75V3.332a.75.75 0 00-.96-.72l-2.142.658a6.45 6.45 0 01-4.635-.468 7.949 7.949 0 00-5.498-.648L3.5 2.475v.275z"
							/>
						</svg>
					</span>
					Game Summary
				</span>
				<MarkdownEditor
					content={summary}
					placeholder="Write a summary of this game session..."
					onUpdate={(markdown) => (summary = markdown)}
				/>
			</div>

			<!-- Improvements Field -->
			<div class="form-section">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<span class="form-label" id="improvements-label">
					<span class="label-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"
								clip-rule="evenodd"
							/>
						</svg>
					</span>
					Areas for Improvement
				</span>
				<div class="improvements-list" role="group" aria-labelledby="improvements-label">
					{#each improvements as improvement, i}
						<div class="improvement-row">
							<span class="improvement-number">{String(i + 1).padStart(2, '0')}</span>
							<input
								type="text"
								value={improvement}
								oninput={(e) => updateImprovement(i, e.currentTarget.value)}
								placeholder="Enter an improvement suggestion..."
								class="form-input improvement-input"
								aria-label="Improvement {i + 1}"
							/>
							<button
								type="button"
								class="remove-btn"
								onclick={() => removeImprovement(i)}
								aria-label="Remove improvement"
								disabled={improvements.length === 1}
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
									<path
										fill-rule="evenodd"
										d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
				<button type="button" class="add-btn btn-pill" onclick={addImprovement}>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path
							d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
						/>
					</svg>
					Add Improvement
				</button>
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
				<button type="button" class="btn-ghost" onclick={onClose} disabled={isSubmitting}>
					Cancel
				</button>
				<button type="submit" class="btn-flame" disabled={isSubmitting}>
					{#if isSubmitting}
						<span class="spinner"></span>
						Saving...
					{:else}
						Save Notes
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
		backdrop-filter: blur(6px);
		animation: backdrop-in 0.2s ease-out;
	}

	@keyframes backdrop-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	.modal-container {
		width: 100%;
		max-width: 560px;
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

	.modal-title-block {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
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
		width: 18px;
		height: 18px;
		color: var(--brand-magenta);
	}
	.title-icon svg { width: 100%; height: 100%; }

	.close-btn {
		padding: 8px 10px;
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
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--brand-violet-soft);
	}

	.label-icon {
		display: flex;
		width: 14px;
		height: 14px;
		color: var(--brand-magenta);
	}
	.label-icon svg { width: 100%; height: 100%; }

	.form-input {
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--color-bone);
		background: rgba(5, 3, 16, 0.5);
		border: 1px solid var(--color-mist);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		transition: border-color 180ms ease, box-shadow 180ms ease;
		width: 100%;
	}
	.form-input::placeholder { color: var(--color-whisper); }
	.form-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
		box-shadow: 0 0 0 3px rgba(255, 43, 199, 0.12);
	}

	.secret-section {
		padding: 1rem;
		background: rgba(255, 43, 199, 0.04);
		border: 1px solid rgba(255, 43, 199, 0.18);
		border-radius: 10px;
	}

	.secret-input-wrapper {
		position: relative;
		display: flex;
	}

	.secret-input {
		flex: 1;
		padding-right: 3rem;
		font-family: var(--font-mono);
		letter-spacing: 0.05em;
	}

	.toggle-secret-btn {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		color: var(--color-whisper);
		cursor: pointer;
		transition: color 180ms ease;
	}
	.toggle-secret-btn:hover { color: var(--brand-magenta); }
	.toggle-secret-btn svg   { width: 18px; height: 18px; }

	.form-hint {
		font-size: 0.75rem;
		color: var(--color-whisper);
		margin: 0;
	}

	.improvements-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.improvement-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.improvement-number {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--brand-cyan);
		background: rgba(36, 212, 255, 0.1);
		padding: 0.375rem 0.5rem;
		border-radius: 4px;
		flex-shrink: 0;
		letter-spacing: 0.05em;
	}

	.improvement-input { flex: 1; }

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid rgba(255, 77, 109, 0.25);
		border-radius: 6px;
		color: var(--color-blood);
		cursor: pointer;
		transition: all 180ms ease;
		flex-shrink: 0;
	}
	.remove-btn:hover:not(:disabled) {
		background: rgba(255, 77, 109, 0.1);
		border-color: var(--color-blood);
	}
	.remove-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.remove-btn svg      { width: 14px; height: 14px; }

	.add-btn {
		align-self: flex-start;
		margin-top: 0.25rem;
	}
	.add-btn svg { width: 14px; height: 14px; }

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
		color: var(--color-blood);
		background: rgba(255, 77, 109, 0.08);
		border: 1px solid rgba(255, 77, 109, 0.25);
		border-radius: 8px;
	}
	.error-message svg { width: 16px; height: 16px; flex-shrink: 0; }

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-mist);
	}

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
		background: rgba(123, 29, 255, 0.35);
		border-radius: 3px;
	}
	.modal-container::-webkit-scrollbar-thumb:hover {
		background: var(--brand-violet);
	}
</style>
