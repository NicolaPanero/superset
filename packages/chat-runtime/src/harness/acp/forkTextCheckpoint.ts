export type ForkCheckpointSchedule = (
	callback: () => void,
	delayMs: number,
) => () => void;

const defaultSchedule: ForkCheckpointSchedule = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	timer.unref?.();
	return () => clearTimeout(timer);
};

export class ForkTextCheckpoint {
	private pending?: { itemId: string; save: () => void };
	private cancel?: () => void;

	constructor(
		private readonly schedule: ForkCheckpointSchedule = defaultSchedule,
	) {}

	track(itemId: string, characters: number, save: () => void): void {
		if (this.pending?.itemId !== itemId) this.clear();
		this.pending = { itemId, save };
		if (this.cancel) return;
		const delayMs = Math.min(
			30_000,
			Math.max(5_000, Math.ceil(characters / 65_536) * 1_000),
		);
		this.cancel = this.schedule(() => {
			const pending = this.pending;
			this.pending = undefined;
			this.cancel = undefined;
			pending?.save();
		}, delayMs);
	}

	clear(): void {
		this.cancel?.();
		this.cancel = undefined;
		this.pending = undefined;
	}
}
