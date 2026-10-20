export class TransferJobs<T> {
	private readonly jobs = new Map<
		string,
		{
			fingerprint: string;
			expiresAt: number;
			promise: Promise<T>;
			controller: AbortController;
		}
	>();
	private readonly cancellations = new Map<string, number>();
	constructor(
		private readonly limit = 128,
		private readonly ttl = 30 * 60_000,
		private readonly now = Date.now,
	) {}
	get(key: string): Promise<T> | undefined {
		const job = this.jobs.get(key);
		if (job && job.expiresAt <= this.now()) {
			job.controller.abort();
			this.jobs.delete(key);
			return undefined;
		}
		return job?.promise;
	}
	cancel(key: string): void {
		this.prune();
		if (!this.cancellations.has(key) && this.cancellations.size >= this.limit)
			throw new Error("transfer_limit_reached");
		this.cancellations.set(key, this.now() + this.ttl);
		this.jobs.get(key)?.controller.abort();
		this.jobs.delete(key);
	}

	private prune() {
		for (const [id, job] of this.jobs)
			if (job.expiresAt <= this.now()) {
				job.controller.abort();
				this.jobs.delete(id);
			}
		for (const [id, expiresAt] of this.cancellations)
			if (expiresAt <= this.now()) this.cancellations.delete(id);
	}

	run(
		key: string,
		fingerprint: string,
		create: (signal: AbortSignal) => Promise<T>,
	): Promise<T> {
		this.prune();
		if (this.cancellations.has(key)) throw new Error("transfer_cancelled");
		const existing = this.jobs.get(key);
		if (existing) {
			if (existing.fingerprint !== fingerprint)
				throw new Error("transfer_id_conflict");
			return existing.promise;
		}
		if (this.jobs.size >= this.limit) throw new Error("transfer_limit_reached");
		const controller = new AbortController();
		const promise = Promise.resolve().then(() => {
			controller.signal.throwIfAborted();
			return create(controller.signal);
		});
		this.jobs.set(key, {
			fingerprint,
			expiresAt: this.now() + this.ttl,
			promise,
			controller,
		});
		void promise.catch(() => {
			if (this.jobs.get(key)?.promise === promise) this.jobs.delete(key);
		});
		return promise;
	}
}
