import type {
	ForkConnection,
	ForkServiceAvailability,
} from "@superset/shared/fork-integrations";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import type { HostDb } from "../db";
import type { ForkConnectionStore } from "./fork-store";

export class ForkAvailability {
	private failures = new Map<string, ForkServiceAvailability>();
	private probes = new Map<string, Promise<void>>();
	constructor(private readonly now: () => number = Date.now) {}

	async run<T>(connection: ForkConnection, operation: () => Promise<T>) {
		try {
			const result = await operation();
			this.failures.delete(connection.id);
			return result;
		} catch (error) {
			if (isForkServiceUnavailable(error)) {
				const now = this.now();
				this.failures.set(connection.id, {
					connectionId: connection.id,
					provider: connection.provider,
					since: this.failures.get(connection.id)?.since ?? now,
					retryAt: now + 30_000,
				});
			} else {
				this.failures.delete(connection.id);
			}
			throw error;
		}
	}

	async check(
		connections: ForkConnection[],
		probe: (connection: ForkConnection) => Promise<unknown>,
	) {
		const enabled = connections.filter((c) => c.enabled);
		const ids = new Set(enabled.map((c) => c.id));
		for (const id of this.failures.keys())
			if (!ids.has(id)) this.failures.delete(id);
		await Promise.all(
			enabled.map(async (connection) => {
				const failure = this.failures.get(connection.id);
				if (!failure || failure.retryAt > this.now()) return;
				const pending = this.probes.get(connection.id);
				if (pending) return pending;
				const operation = this.run(connection, () => probe(connection))
					.then(
						() => {},
						() => {},
					)
					.finally(() => this.probes.delete(connection.id));
				this.probes.set(connection.id, operation);
				return operation;
			}),
		);
		return [...this.failures.values()];
	}
}

const trackers = new WeakMap<HostDb, Map<string, ForkAvailability>>();
export function forkAvailability(store: ForkConnectionStore) {
	let scopes = trackers.get(store.db);
	if (!scopes) {
		scopes = new Map();
		trackers.set(store.db, scopes);
	}
	let tracker = scopes.get(store.scope);
	if (!tracker) {
		tracker = new ForkAvailability();
		scopes.set(store.scope, tracker);
	}
	return tracker;
}
