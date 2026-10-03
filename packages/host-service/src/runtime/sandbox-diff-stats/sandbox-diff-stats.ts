const SETTLE_MS = 2_000;
const MIN_INTERVAL_MS = 10_000;
const MAX_FAILURE_WAIT_MS = 5 * 60 * 1000;

interface DiffStats {
	additions: number;
	deletions: number;
}

/** The list's line counts for this box's workspace, sent only when they change. */
export function startSandboxDiffStatsReporter(args: {
	apiUrl: string;
	workspaceId: string;
	organizationId: string;
	hostSecret: string;
	read: () => Promise<DiffStats>;
	watch: (listener: () => void) => () => void;
}): () => void {
	let lastSent: string | undefined;
	let lastAttemptAt = 0;
	let failureWaitMs = MIN_INTERVAL_MS;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let rerun = false;
	let stopped = false;

	const report = async () => {
		const stats = await args.read();
		const key = `${stats.additions}:${stats.deletions}`;
		if (key === lastSent) return;
		lastAttemptAt = Date.now();
		const response = await fetch(
			`${args.apiUrl}/api/cloud-workspaces/${args.workspaceId}/diff-stats`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${args.hostSecret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					organizationId: args.organizationId,
					additions: stats.additions,
					deletions: stats.deletions,
					at: lastAttemptAt,
				}),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) throw new Error(`answered ${response.status}`);
		lastSent = key;
	};

	const run = async () => {
		timer = null;
		if (running) {
			rerun = true;
			return;
		}
		running = true;
		try {
			await report();
			failureWaitMs = MIN_INTERVAL_MS;
		} catch (error) {
			console.warn(
				"[sandbox-diff-stats] report failed:",
				error instanceof Error ? error.message : error,
			);
			lastAttemptAt = Date.now();
			schedule(failureWaitMs);
			failureWaitMs = Math.min(failureWaitMs * 2, MAX_FAILURE_WAIT_MS);
		} finally {
			running = false;
			if (rerun) {
				rerun = false;
				schedule();
			}
		}
	};

	function schedule(minWait = SETTLE_MS) {
		if (stopped || timer) return;
		const wait = Math.max(
			minWait,
			MIN_INTERVAL_MS - (Date.now() - lastAttemptAt),
		);
		timer = setTimeout(() => void run(), wait);
	}

	const unwatch = args.watch(() => schedule());
	schedule();
	return () => {
		stopped = true;
		unwatch();
		if (timer) clearTimeout(timer);
	};
}
