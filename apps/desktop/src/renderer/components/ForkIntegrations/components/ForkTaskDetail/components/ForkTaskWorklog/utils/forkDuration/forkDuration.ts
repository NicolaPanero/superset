const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60 };

/** Reads "45m", "1h 30m", "2h", "1.5h" or plain minutes ("90"). */
export function parseForkDuration(value: string): number | null {
	const text = value.trim().toLowerCase().replace(",", ".");
	if (!text) return null;
	if (/^\d+$/.test(text)) {
		const minutes = Number(text);
		return minutes > 0 && minutes <= 24 * 60 ? minutes * 60 : null;
	}
	const parts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([hm])/g)];
	const rest = text.replace(/(\d+(?:\.\d+)?)\s*([hm])/g, "").trim();
	if (parts.length === 0 || rest) return null;
	const units = parts.map((part) => part[2]);
	if (new Set(units).size !== units.length) return null;
	const seconds = parts.reduce(
		(sum, part) => sum + Number(part[1]) * (UNIT_SECONDS[part[2] ?? "m"] ?? 0),
		0,
	);
	const rounded = Math.round(seconds / 60) * 60;
	return rounded >= 60 && rounded <= 24 * 3600 ? rounded : null;
}

export function formatForkDuration(seconds: number): string {
	const minutes = Math.round(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest}m`;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
