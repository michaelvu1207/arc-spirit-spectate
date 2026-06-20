// Shared, dependency-free formatters used by both the web pages (/, /leaderboard,
// /players/[username]) and the in-game screens (/play/champions, /play/records).
// Consolidated here so the two surfaces never drift on how a duration, date, or
// relative time renders.

/** "Jun 16, 2026" — month + day, always with year. */
export function formatDate(s: string | null): string {
	if (!s) return '—';
	const d = new Date(s);
	if (Number.isNaN(d.getTime())) return String(s);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jun 16" — month + day, with the year only when it differs from the current one. */
export function formatDateCompact(t: string | null): string {
	if (!t) return '—';
	const d = new Date(t);
	if (Number.isNaN(d.getTime())) return String(t);
	const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
	if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
	return d.toLocaleDateString('en-US', opts);
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / "4mo ago". */
export function formatRelative(t: string | null): string {
	if (!t) return '—';
	const d = Date.parse(t);
	if (Number.isNaN(d)) return '—';
	const diff = Date.now() - d;
	const mins = Math.round(diff / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.round(hrs / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	return `${months}mo ago`;
}

/** Precise duration: "1h 04m" / "12m 30s" / "45s". */
export function formatDuration(ms: number | null): string {
	if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
	const totalSeconds = Math.floor(ms / 1000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
	if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
	return `${seconds}s`;
}

/** Coarse duration for game lengths: "<1m" / "12m" / "1h 04m". */
export function formatDurationHoursMinutes(ms: number | null): string {
	if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
	if (ms < 60_000) return '<1m';
	const totalMinutes = Math.floor(ms / 60_000);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
	return `${minutes}m`;
}

/** Non-negative elapsed ms between two ISO timestamps, or null when unknowable. */
export function safeDurationMs(start: string | null, end: string | null): number | null {
	if (!start || !end) return null;
	const sM = Date.parse(start);
	const eM = Date.parse(end);
	if (Number.isNaN(sM) || Number.isNaN(eM)) return null;
	const diff = eM - sM;
	return diff >= 0 ? diff : null;
}

export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const s = [...values].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(values: number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Two-letter avatar fallback from a display name. */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}
