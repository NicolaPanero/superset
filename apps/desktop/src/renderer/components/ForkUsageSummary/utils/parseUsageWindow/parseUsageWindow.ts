export type ParsedUsageWindow =
	| { kind: "session"; hours: number; scope: string | null }
	| { kind: "weekly"; scope: string | null }
	| { kind: "other"; label: string };

const SESSION_LABEL = /^Session \((\d+)h\)(?: · (.+))?$/;
const WEEKLY_LABEL = /^Weekly(?: · (.+))?$/;

export function parseUsageWindow(label: string): ParsedUsageWindow {
	const session = SESSION_LABEL.exec(label);
	if (session?.[1])
		return {
			kind: "session",
			hours: Number(session[1]),
			scope: session[2] ?? null,
		};
	const weekly = WEEKLY_LABEL.exec(label);
	if (weekly) return { kind: "weekly", scope: weekly[1] ?? null };
	return { kind: "other", label };
}

export function usageWindowShortLabel(label: string): string {
	const parsed = parseUsageWindow(label);
	if (parsed.kind === "session") return `${parsed.hours}h`;
	if (parsed.kind === "weekly") return "7d";
	return parsed.label;
}

export function displayUsedPercent(usedPercent: number): number {
	if (!Number.isFinite(usedPercent)) return 0;
	const rounded = Math.round(Math.max(0, usedPercent));
	return usedPercent < 100 ? Math.min(99, rounded) : 100;
}

export function usageTone(usedPercent: number): "ok" | "warning" | "danger" {
	if (usedPercent >= 90) return "danger";
	if (usedPercent >= 70) return "warning";
	return "ok";
}
