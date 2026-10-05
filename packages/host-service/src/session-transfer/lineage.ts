import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { HostDb } from "../db";
import { sessionLineageEdges, sessionLineageNodes } from "../db/schema";

export type LineageNode = typeof sessionLineageNodes.$inferSelect;
export type LineageNodeInput = Omit<
	LineageNode,
	"id" | "organizationId" | "workspaceId" | "createdAt"
>;
export type LineageCursor = { createdAt: number; id: string };

export class LocalLineageStore {
	constructor(
		private readonly db: HostDb,
		private readonly organizationId: string,
	) {}

	node(workspaceId: string, id: string): LineageNode | undefined {
		return this.db
			.select()
			.from(sessionLineageNodes)
			.where(
				and(
					eq(sessionLineageNodes.id, id),
					eq(sessionLineageNodes.organizationId, this.organizationId),
					eq(sessionLineageNodes.workspaceId, workspaceId),
				),
			)
			.get();
	}

	edge(workspaceId: string, id: string) {
		return this.db
			.select()
			.from(sessionLineageEdges)
			.where(
				and(
					eq(sessionLineageEdges.id, id),
					eq(sessionLineageEdges.organizationId, this.organizationId),
					eq(sessionLineageEdges.workspaceId, workspaceId),
				),
			)
			.get();
	}

	findSession(
		workspaceId: string,
		agent: string,
		sessionId: string,
		terminalId: string,
	) {
		const rows = this.db
			.select()
			.from(sessionLineageNodes)
			.where(
				and(
					eq(sessionLineageNodes.organizationId, this.organizationId),
					eq(sessionLineageNodes.workspaceId, workspaceId),
					eq(sessionLineageNodes.agent, agent as LineageNode["agent"]),
					eq(sessionLineageNodes.sessionId, sessionId),
				),
			)
			.all();
		return (
			rows.find((node) => node.lastTerminalId === terminalId) ??
			(rows.length === 1 ? rows[0] : undefined)
		);
	}

	record(input: {
		id: string;
		workspaceId: string;
		source: LineageNodeInput;
		target: LineageNodeInput;
		warnings: string[];
		createdAt?: number;
	}) {
		return this.db.transaction((tx) => {
			const store = new LocalLineageStore(
				tx as unknown as HostDb,
				this.organizationId,
			);
			const existing = store.edge(input.workspaceId, input.id);
			if (existing) {
				for (const [id, expected] of [
					[existing.sourceNodeId, input.source],
					[existing.targetNodeId, input.target],
				] as const) {
					const node = store.node(input.workspaceId, id);
					if (
						!node ||
						node.agent !== expected.agent ||
						node.sessionId !== expected.sessionId ||
						node.storeRoot !== expected.storeRoot
					)
						throw new Error("lineage_transfer_conflict");
				}
				return existing;
			}
			const createdAt = input.createdAt ?? Date.now();
			const ensureNode = (node: LineageNodeInput) => {
				tx.insert(sessionLineageNodes)
					.values({
						...node,
						id: randomUUID(),
						organizationId: this.organizationId,
						workspaceId: input.workspaceId,
						createdAt,
					})
					.onConflictDoNothing()
					.run();
				const row = tx
					.select()
					.from(sessionLineageNodes)
					.where(
						and(
							eq(sessionLineageNodes.organizationId, this.organizationId),
							eq(sessionLineageNodes.workspaceId, input.workspaceId),
							eq(sessionLineageNodes.agent, node.agent),
							eq(sessionLineageNodes.sessionId, node.sessionId),
							eq(sessionLineageNodes.storeRoot, node.storeRoot),
						),
					)
					.get();
				if (!row) throw new Error("lineage_node_unavailable");
				return row;
			};
			const source = ensureNode(input.source);
			const target = ensureNode(input.target);
			return tx
				.insert(sessionLineageEdges)
				.values({
					id: input.id,
					organizationId: this.organizationId,
					workspaceId: input.workspaceId,
					sourceNodeId: source.id,
					targetNodeId: target.id,
					provider: "native",
					warnings: input.warnings,
					createdAt,
				})
				.returning()
				.get();
		});
	}

	setTerminal(workspaceId: string, nodeId: string, terminalId: string) {
		this.db
			.update(sessionLineageNodes)
			.set({ lastTerminalId: terminalId })
			.where(
				and(
					eq(sessionLineageNodes.id, nodeId),
					eq(sessionLineageNodes.organizationId, this.organizationId),
					eq(sessionLineageNodes.workspaceId, workspaceId),
				),
			)
			.run();
	}

	list(workspaceId: string, limit: number, cursor?: LineageCursor) {
		const pageSize = Math.min(100, Math.max(1, limit));
		const rows = this.db
			.select()
			.from(sessionLineageEdges)
			.where(
				and(
					eq(sessionLineageEdges.organizationId, this.organizationId),
					eq(sessionLineageEdges.workspaceId, workspaceId),
					cursor
						? or(
								lt(sessionLineageEdges.createdAt, cursor.createdAt),
								and(
									eq(sessionLineageEdges.createdAt, cursor.createdAt),
									lt(sessionLineageEdges.id, cursor.id),
								),
							)
						: undefined,
				),
			)
			.orderBy(
				desc(sessionLineageEdges.createdAt),
				desc(sessionLineageEdges.id),
			)
			.limit(pageSize + 1)
			.all();
		const hasMore = rows.length > pageSize;
		const items = rows.slice(0, pageSize).map((edge) => {
			const source = this.node(workspaceId, edge.sourceNodeId);
			const target = this.node(workspaceId, edge.targetNodeId);
			if (!source || !target) throw new Error("lineage_node_unavailable");
			return { ...edge, source, target };
		});
		const last = items.at(-1);
		return {
			items,
			nextCursor:
				hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
		};
	}
}
