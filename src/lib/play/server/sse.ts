const defaultEncoder = new TextEncoder();

export interface SseController {
	enqueue(chunk: Uint8Array): void;
	close(): void;
}

export function formatSseEvent(eventName: string, data: unknown, encoder: TextEncoder = defaultEncoder): Uint8Array {
	return encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createSseSession(controller: SseController, onDeactivate: () => void) {
	let active = true;

	const deactivate = () => {
		if (!active) return false;
		active = false;
		onDeactivate();
		return true;
	};

	const close = () => {
		deactivate();
		try {
			controller.close();
		} catch {
			// The runtime may have already closed the stream.
		}
	};

	const send = (eventName: string, payload: unknown) => {
		if (!active) return false;
		try {
			controller.enqueue(formatSseEvent(eventName, payload));
			return true;
		} catch {
			close();
			return false;
		}
	};

	return {
		get active() {
			return active;
		},
		send,
		sendSnapshot(payload: unknown) {
			return send('snapshot', payload);
		},
		deactivate,
		close
	};
}
