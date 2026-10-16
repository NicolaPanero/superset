import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "@superset/shared/auth-token-crypto";
import type {
	ForkConnection,
	ForkProviderId,
} from "@superset/shared/fork-integrations";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { forkIntegrationConnections } from "../db/fork-schema";

export interface ForkSecret {
	token?: string;
	email?: string;
	cloudId?: string;
	brokerSession?: string;
	refreshToken?: string;
}
export class ForkConnectionStore {
	constructor(
		readonly db: HostDb,
		readonly scope: string,
	) {}
	list(): ForkConnection[] {
		return this.db
			.select()
			.from(forkIntegrationConnections)
			.where(eq(forkIntegrationConnections.scope, this.scope))
			.all()
			.map((r) => r.metadata);
	}
	get(id: string): { connection: ForkConnection; secret: ForkSecret } | null {
		const row = this.db
			.select()
			.from(forkIntegrationConnections)
			.where(
				and(
					eq(forkIntegrationConnections.scope, this.scope),
					eq(forkIntegrationConnections.id, id),
				),
			)
			.get();
		if (!row) return null;
		return {
			connection: row.metadata,
			secret: row.secret
				? (JSON.parse(decrypt(Buffer.from(row.secret, "base64"))) as ForkSecret)
				: {},
		};
	}
	save(connection: ForkConnection, secret?: ForkSecret): ForkConnection {
		const previous = this.get(connection.id);
		connection = {
			...connection,
			revision: (previous?.connection.revision ?? 0) + 1,
		};
		const sealed =
			secret === undefined
				? undefined
				: encrypt(JSON.stringify(secret)).toString("base64");
		this.db
			.insert(forkIntegrationConnections)
			.values({
				id: connection.id,
				scope: this.scope,
				provider: connection.provider,
				metadata: connection,
				secret: sealed ?? (previous ? undefined : null),
			})
			.onConflictDoUpdate({
				target: [
					forkIntegrationConnections.scope,
					forkIntegrationConnections.id,
				],
				set: {
					metadata: connection,
					...(sealed === undefined ? {} : { secret: sealed }),
				},
			})
			.run();
		return connection;
	}
	create(
		provider: ForkProviderId,
		mode: ForkConnection["mode"],
		site: string | null,
	): ForkConnection {
		if (
			this.list().filter((c) => c.provider === provider && c.mode !== "system")
				.length >= 16
		)
			throw new Error("Connection limit reached");
		return {
			id: randomUUID(),
			provider,
			mode,
			label: provider,
			site,
			identity: null,
			enabled: true,
			state: "configured",
			source: mode,
			error: null,
			verifiedAt: null,
			expiresAt: null,
			brokerUrl: null,
		};
	}
	disconnect(id: string): ForkConnection | null {
		const row = this.get(id);
		if (!row) return null;
		const connection: ForkConnection = {
			...row.connection,
			enabled: false,
			state: "disconnected",
			error: null,
		};
		return this.save(connection, {});
	}
}
