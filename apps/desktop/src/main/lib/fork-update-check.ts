import { newerForkRelease } from "./fork-release";

interface ForkUpdateCheckOptions {
	installed: string;
	latestRelease: () => Promise<string>;
	offer: (tag: string) => Promise<boolean>;
	upToDate: () => Promise<void>;
	failed: (error: unknown, interactive: boolean) => Promise<void>;
}

export function createForkUpdateCheck(options: ForkUpdateCheckOptions) {
	let offered: string | null = null;
	let inFlight: Promise<void> | undefined;
	let interactive = false;

	async function run(): Promise<void> {
		try {
			const tag = newerForkRelease(
				options.installed,
				await options.latestRelease(),
			);
			if (!tag) {
				if (interactive) await options.upToDate();
				return;
			}
			if (!interactive && tag === offered) return;
			if ((await options.offer(tag)) !== false) offered = tag;
		} catch (error) {
			await options.failed(error, interactive);
		}
	}

	return (manual = false): Promise<void> => {
		interactive ||= manual;
		inFlight ??= run().finally(() => {
			inFlight = undefined;
			interactive = false;
		});
		return inFlight;
	};
}
