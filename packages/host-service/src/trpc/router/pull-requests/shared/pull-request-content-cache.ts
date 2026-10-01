// Browsing the PR list re-opens the detail panel constantly; the `gh pr view`
// response is held for a short TTL so repeat clicks don't burn the user's
// GitHub token bucket.
const PULL_REQUEST_CONTENT_CACHE_TTL_MS = 30_000;

interface CacheEntry {
	promise: Promise<unknown>;
	fetchedAt: number;
}

const entries = new Map<string, CacheEntry>();

interface RepoIdentity {
	owner: string;
	name: string;
}

export function pullRequestContentCacheKey(
	repo: RepoIdentity,
	prNumber: number,
): string {
	return `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${prNumber}`;
}

export function readPullRequestContentCache<T>(key: string): Promise<T> | null {
	const cached = entries.get(key);
	if (
		!cached ||
		Date.now() - cached.fetchedAt >= PULL_REQUEST_CONTENT_CACHE_TTL_MS
	) {
		return null;
	}
	return cached.promise as Promise<T>;
}

/**
 * Concurrent callers share the in-flight promise. A rejection evicts its own
 * entry so the next caller retries instead of replaying the error for the
 * rest of the TTL.
 */
export function writePullRequestContentCache<T>(
	key: string,
	promise: Promise<T>,
): void {
	entries.set(key, { promise, fetchedAt: Date.now() });
	promise.catch(() => {
		if (entries.get(key)?.promise === promise) {
			entries.delete(key);
		}
	});
}

/**
 * For writes the host made itself (merge, close, reopen): the cached
 * `gh pr view` would otherwise answer the caller's refetch with the pre-write
 * state for the rest of the TTL.
 */
export function evictPullRequestContent(
	repo: RepoIdentity,
	prNumber: number,
): void {
	entries.delete(pullRequestContentCacheKey(repo, prNumber));
}
