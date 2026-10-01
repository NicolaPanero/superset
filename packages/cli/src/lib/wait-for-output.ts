export interface WaitForOutputMatchDeps {
	/** `signal` aborts once the deadline passes while a read is in flight. */
	readText: (signal: AbortSignal) => Promise<string>;
	sleep: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface WaitForOutputMatchOptions {
	regex: RegExp;
	timeoutMs: number;
	pollIntervalMs: number;
}

export interface OutputMatchResult {
	text: string;
	match: string;
}

export class WaitForOutputTimeoutError extends Error {
	constructor(regex: RegExp, timeoutMs: number) {
		super(`Timed out after ${timeoutMs}ms waiting for ${regex} to match`);
		this.name = "WaitForOutputTimeoutError";
	}
}

/**
 * Poll `readText` until it matches `regex` or `timeoutMs` elapses. The first
 * read happens before any sleep, so text already on the screen matches at
 * once. The deadline also cuts a read that never settles.
 */
export async function waitForOutputMatch(
	deps: WaitForOutputMatchDeps,
	options: WaitForOutputMatchOptions,
): Promise<OutputMatchResult> {
	const now = deps.now ?? Date.now;
	const deadline = now() + options.timeoutMs;
	const timeout = () =>
		new WaitForOutputTimeoutError(options.regex, options.timeoutMs);

	while (true) {
		const budget = deadline - now();
		if (budget <= 0) throw timeout();

		const text = await readWithin(deps.readText, budget, timeout);
		const match = text.match(options.regex);
		if (match) return { text, match: match[0] };

		const remaining = deadline - now();
		if (remaining <= 0) throw timeout();
		await deps.sleep(Math.min(options.pollIntervalMs, remaining));
	}
}

function readWithin(
	readText: WaitForOutputMatchDeps["readText"],
	budgetMs: number,
	timeout: () => Error,
): Promise<string> {
	const controller = new AbortController();
	const expired = new Promise<never>((_, reject) => {
		controller.signal.addEventListener("abort", () => reject(timeout()), {
			once: true,
		});
	});
	const timer = setTimeout(() => controller.abort(), budgetMs);
	return Promise.race([readText(controller.signal), expired]).finally(() =>
		clearTimeout(timer),
	);
}
