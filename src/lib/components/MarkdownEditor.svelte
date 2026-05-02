<script lang="ts">
	import { marked } from 'marked';

	interface Props {
		content: string;
		placeholder?: string;
		onUpdate?: (markdown: string) => void;
	}

	let { content, placeholder = 'Write in Markdown...', onUpdate }: Props = $props();

	let mode = $state<'write' | 'preview'>('write');
	let textareaValue = $state(content || '');

	// Configure marked for safe rendering
	marked.setOptions({
		breaks: true,
		gfm: true
	});

	// Parse markdown to HTML
	const renderedHtml = $derived(marked.parse(textareaValue) as string);

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		textareaValue = target.value;
		onUpdate?.(target.value);
	}

	// Insert markdown syntax helpers
	function insertSyntax(before: string, after: string = '') {
		const textarea = document.querySelector('.markdown-textarea') as HTMLTextAreaElement;
		if (!textarea) return;

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selectedText = textareaValue.substring(start, end);
		const newText =
			textareaValue.substring(0, start) +
			before +
			selectedText +
			after +
			textareaValue.substring(end);

		textareaValue = newText;
		onUpdate?.(newText);

		// Restore cursor position
		setTimeout(() => {
			textarea.focus();
			const newCursorPos = start + before.length + selectedText.length + after.length;
			textarea.setSelectionRange(
				selectedText ? newCursorPos : start + before.length,
				selectedText ? newCursorPos : start + before.length
			);
		}, 0);
	}
</script>

<div class="markdown-editor-container">
	<!-- Toolbar -->
	<div class="editor-toolbar">
		<div class="toolbar-left">
			<div class="toolbar-group">
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('**', '**')}
					title="Bold (**text**)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M8 11h4.5a2.5 2.5 0 0 0 0-5H8v5Zm10 4.5a4.5 4.5 0 0 1-4.5 4.5H6V4h6.5a4.5 4.5 0 0 1 3.256 7.606A4.5 4.5 0 0 1 18 15.5ZM8 13v5h5.5a2.5 2.5 0 0 0 0-5H8Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('*', '*')}
					title="Italic (*text*)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path d="M15 20H7v-2h2.927l2.116-12H9V4h8v2h-2.927l-2.116 12H15v2Z" />
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('~~', '~~')}
					title="Strikethrough (~~text~~)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M17.154 14c.23.516.346 1.09.346 1.72 0 1.342-.524 2.392-1.571 3.147C14.88 19.622 13.433 20 11.586 20c-1.64 0-3.263-.381-4.87-1.144V16.6c1.52.877 3.075 1.316 4.666 1.316 2.551 0 3.83-.732 3.839-2.197a2.21 2.21 0 0 0-.648-1.603l-.12-.117H3v-2h18v2h-3.846Zm-4.078-3H7.629a4.086 4.086 0 0 1-.481-.522C6.716 9.92 6.5 9.246 6.5 8.452c0-1.236.466-2.287 1.397-3.153C8.83 4.433 10.271 4 12.222 4c1.471 0 2.879.328 4.222.984v2.152c-1.2-.687-2.515-1.03-3.946-1.03-2.48 0-3.719.782-3.719 2.346 0 .42.218.786.654 1.099.436.313.974.562 1.613.75.62.18 1.297.414 2.03.699Z"
						/>
					</svg>
				</button>
			</div>

			<div class="toolbar-divider"></div>

			<div class="toolbar-group">
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('## ')}
					title="Heading (## text)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M4 4v7h7V4h2v16h-2v-7H4v7H2V4h2Zm14.5 4a3.75 3.75 0 0 1 2.978 6.03l-.148.18L18.034 18H22v2h-7v-1.556l4.82-5.546c.268-.307.43-.709.43-1.148a1.75 1.75 0 0 0-3.482-.22l-.018.22h-2A3.75 3.75 0 0 1 18.5 8Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('- ')}
					title="Bullet List (- item)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M8 4h13v2H8V4ZM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM8 11h13v2H8v-2Zm0 7h13v2H8v-2Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('1. ')}
					title="Numbered List (1. item)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M8 4h13v2H8V4ZM5 3v3h1v1H3V6h1V4H3V3h2Zm-2 7h3.5v1H4v1h1.5v1H3v-4h2.5V9H3V8Zm2 5.5H3v-1h2V13h1v4H3v-1h2v-.5ZM8 11h13v2H8v-2Zm0 7h13v2H8v-2Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('> ')}
					title="Quote (> text)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('`', '`')}
					title="Inline Code (`code`)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M24 12l-5.657 5.657-1.414-1.414L21.172 12l-4.243-4.243 1.414-1.414L24 12ZM2.828 12l4.243 4.243-1.414 1.414L0 12l5.657-5.657L7.07 7.757 2.828 12Zm6.96 9H7.66l6.552-18h2.128L9.788 21Z"
						/>
					</svg>
				</button>
			</div>

			<div class="toolbar-divider"></div>

			<div class="toolbar-group">
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('[', '](url)')}
					title="Link ([text](url))"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M18.364 15.536 16.95 14.12l1.414-1.414a5 5 0 1 0-7.071-7.071L9.879 7.05 8.464 5.636 9.88 4.222a7 7 0 0 1 9.9 9.9l-1.415 1.414Zm-2.828 2.828-1.415 1.414a7 7 0 0 1-9.9-9.9l1.415-1.414L7.05 9.88l-1.414 1.414a5 5 0 1 0 7.071 7.071l1.414-1.414 1.415 1.414Zm-.708-10.607 1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07Z"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn-pill toolbar-btn"
					onclick={() => insertSyntax('\n---\n')}
					title="Horizontal Rule (---)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path d="M2 11h2v2H2v-2Zm4 0h12v2H6v-2Zm14 0h2v2h-2v-2Z" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Mode Toggle -->
		<div class="mode-toggle">
			<button
				type="button"
				class="mode-btn"
				class:active={mode === 'write'}
				onclick={() => (mode = 'write')}
			>
				Write
			</button>
			<button
				type="button"
				class="mode-btn"
				class:active={mode === 'preview'}
				onclick={() => (mode = 'preview')}
			>
				Preview
			</button>
		</div>
	</div>

	<!-- Editor Content -->
	<div class="editor-content">
		{#if mode === 'write'}
			<textarea class="markdown-textarea" value={textareaValue} oninput={handleInput} {placeholder}
			></textarea>
		{:else}
			<div class="brand-panel markdown-preview">
				{#if textareaValue.trim()}
					{@html renderedHtml}
				{:else}
					<p class="preview-placeholder">Nothing to preview</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Markdown Help -->
	<div class="markdown-help">
		<span class="help-text">
			<strong>Markdown supported:</strong>
			**bold** | *italic* | ~~strike~~ | `code` | [link](url) | # heading | - list | > quote
		</span>
	</div>
</div>

<style>
	.markdown-editor-container {
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		overflow: hidden;
		background: var(--color-crypt);
	}

	.editor-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--color-tomb);
		border-bottom: 1px solid var(--color-mist);
		flex-wrap: wrap;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.toolbar-group {
		display: flex;
		gap: 0.125rem;
	}

	.toolbar-divider {
		width: 1px;
		height: 24px;
		background: var(--color-mist);
		margin: 0 0.25rem;
	}

	/* Toolbar buttons — solid dark squares, magenta on active/hover */
	.toolbar-btn {
		padding: 6px 8px;
		border-radius: 4px;
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
		color: var(--color-fog);
		transition: border-color 150ms ease, color 150ms ease;
	}
	.toolbar-btn:hover {
		color: var(--brand-magenta);
		border-color: var(--brand-magenta);
	}
	.toolbar-btn svg {
		width: 15px;
		height: 15px;
	}

	.mode-toggle {
		display: flex;
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
		border-radius: 2px;
		overflow: hidden;
		padding: 2px;
		gap: 2px;
	}

	.mode-btn {
		padding: 0.3rem 0.85rem;
		font-family: var(--font-display);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-fog);
		background: transparent;
		border: none;
		border-radius: 2px;
		cursor: pointer;
		transition: background 150ms ease, color 150ms ease;
	}
	.mode-btn:hover { color: var(--color-parchment); }
	.mode-btn.active {
		background: var(--brand-magenta);
		color: #fff;
	}

	.editor-content {
		min-height: 150px;
		max-height: 350px;
	}

	.markdown-textarea {
		width: 100%;
		min-height: 150px;
		max-height: 350px;
		padding: 0.75rem 1rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		line-height: 1.65;
		color: var(--color-parchment);
		background: transparent;
		border: none;
		resize: vertical;
		outline: none;
		box-sizing: border-box;
	}
	.markdown-textarea::placeholder { color: var(--color-whisper); }

	.markdown-preview {
		padding: 0.75rem 1rem;
		min-height: 150px;
		max-height: 350px;
		overflow-y: auto;
		font-family: var(--font-body);
		font-size: 0.95rem;
		line-height: 1.75;
		color: var(--color-parchment);
		border-radius: 0;
		border: none;
		background: var(--color-crypt);
	}

	.preview-placeholder {
		color: var(--color-whisper);
		font-style: italic;
	}

	/* Markdown rendered styles */
	.markdown-preview :global(h1),
	.markdown-preview :global(h2),
	.markdown-preview :global(h3),
	.markdown-preview :global(h4) {
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--color-bone);
		margin: 0 0 0.75rem 0;
		letter-spacing: 0.05em;
	}
	.markdown-preview :global(h1) { font-size: 1.5rem; }
	.markdown-preview :global(h2) { font-size: 1.25rem; }
	.markdown-preview :global(h3) { font-size: 1.1rem; }

	.markdown-preview :global(p)           { margin: 0 0 0.75rem 0; }
	.markdown-preview :global(p:last-child) { margin-bottom: 0; }

	.markdown-preview :global(ul),
	.markdown-preview :global(ol) { margin: 0 0 0.75rem 0; padding-left: 1.5rem; }
	.markdown-preview :global(li) { margin-bottom: 0.25rem; }

	.markdown-preview :global(blockquote) {
		margin: 0.75rem 0;
		padding: 0.5rem 1rem;
		border-left: 3px solid var(--brand-magenta);
		background: rgba(255, 43, 199, 0.04);
		color: var(--color-fog);
		font-style: italic;
		border-radius: 0 6px 6px 0;
	}
	.markdown-preview :global(blockquote p) { margin: 0; }

	.markdown-preview :global(strong) { font-weight: 700; color: var(--color-bone); }
	.markdown-preview :global(em)     { font-style: italic; }
	.markdown-preview :global(del)    { text-decoration: line-through; color: var(--color-fog); }

	.markdown-preview :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		padding: 0.125rem 0.375rem;
		background: rgba(123, 29, 255, 0.18);
		border-radius: 4px;
		color: var(--brand-violet-soft);
	}

	.markdown-preview :global(pre) {
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		background: rgba(5, 3, 16, 0.6);
		border-radius: 8px;
		overflow-x: auto;
	}
	.markdown-preview :global(pre code) { padding: 0; background: transparent; }

	.markdown-preview :global(a)       { color: var(--brand-cyan); text-decoration: underline; }
	.markdown-preview :global(a:hover) { color: var(--brand-cyan-soft); }

	.markdown-preview :global(hr) {
		margin: 1rem 0;
		border: none;
		border-top: 1px solid var(--color-mist);
	}

	.markdown-help {
		padding: 0.5rem 0.75rem;
		background: rgba(26, 15, 46, 0.4);
		border-top: 1px solid var(--color-mist);
	}

	.help-text {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--color-whisper);
	}
	.help-text strong { color: var(--color-fog); }

	/* Scrollbar */
	.markdown-textarea::-webkit-scrollbar,
	.markdown-preview::-webkit-scrollbar         { width: 6px; }
	.markdown-textarea::-webkit-scrollbar-track,
	.markdown-preview::-webkit-scrollbar-track   { background: transparent; }
	.markdown-textarea::-webkit-scrollbar-thumb,
	.markdown-preview::-webkit-scrollbar-thumb   {
		background: rgba(123, 29, 255, 0.35);
		border-radius: 3px;
	}
	.markdown-textarea::-webkit-scrollbar-thumb:hover,
	.markdown-preview::-webkit-scrollbar-thumb:hover { background: var(--brand-violet); }
</style>
