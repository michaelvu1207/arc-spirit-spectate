import { describe, expect, test, vi } from 'vitest';
import { createSseSession, formatSseEvent } from './sse';

describe('SSE helpers', () => {
	test('formats snapshot events as SSE payloads', () => {
		const bytes = formatSseEvent('snapshot', { roomCode: 'ABC123' });
		const text = new TextDecoder().decode(bytes);

		expect(text).toBe('event: snapshot\ndata: {"roomCode":"ABC123"}\n\n');
	});

	test('deactivates after enqueue fails so callers stop polling', () => {
		const onDeactivate = vi.fn();
		const controller = {
			enqueue: vi.fn(() => {
				throw new TypeError('Controller is already closed');
			}),
			close: vi.fn(() => {
				throw new TypeError('Controller is already closed');
			})
		};

		const session = createSseSession(controller, onDeactivate);

		expect(session.sendSnapshot({ ok: true })).toBe(false);
		expect(session.active).toBe(false);
		expect(onDeactivate).toHaveBeenCalledTimes(1);
		expect(controller.enqueue).toHaveBeenCalledTimes(1);
		expect(controller.close).toHaveBeenCalledTimes(1);
		expect(session.sendSnapshot({ ok: true })).toBe(false);
		expect(onDeactivate).toHaveBeenCalledTimes(1);
	});
});
