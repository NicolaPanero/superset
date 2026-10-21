const TTL_MS = 20_000;

interface Entry<T> {
	at: number;
	promise: Promise<T>;
	settled: boolean;
}

/**
 * Scanning every agent store takes seconds. Requests for the same project
 * share one scan, a quick list reuses a recent full one, and Refresh skips it.
 */
export function createExternalSessionsCache<T>(now = () => Date.now()) {
	const entries = new Map<string, Entry<T>>();
	const fresh = (key: string) => {
		const entry = entries.get(key);
		return entry && now() - entry.at < TTL_MS ? entry : undefined;
	};
	return (
		scope: string,
		preview: boolean,
		refresh: boolean,
		load: () => Promise<T>,
	): Promise<T> => {
		const key = `${scope}\n${preview}`;
		if (!refresh) {
			const full = fresh(`${scope}\ntrue`);
			if (!preview && full?.settled) return full.promise;
			const own = fresh(key);
			if (own) return own.promise;
		}
		const entry: Entry<T> = {
			at: now(),
			settled: false,
			promise: load(),
		};
		entries.set(key, entry);
		entry.promise.then(
			() => {
				entry.settled = true;
			},
			() => {
				if (entries.get(key) === entry) entries.delete(key);
			},
		);
		return entry.promise;
	};
}
