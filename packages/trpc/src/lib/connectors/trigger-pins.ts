import { db } from "@superset/db/client";
import {
	type AutomationTriggerKind,
	automations,
	automationTriggers,
	connections,
} from "@superset/db/schema";
import {
	accountToPinTo,
	triggerKindsForConnector,
} from "@superset/shared/automation-triggers";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function liveConnectionIds(
	organizationId: string,
	connector: string,
	userId: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: connections.id })
		.from(connections)
		.where(
			and(
				eq(connections.organizationId, organizationId),
				eq(connections.connector, connector),
				eq(connections.connectedByUserId, userId),
				isNull(connections.disconnectedAt),
			),
		);
	return rows.map((row) => row.id);
}

export async function pinTriggersToExistingAccount(params: {
	organizationId: string;
	connector: string;
	userId: string;
	previousConnectionIds: string[];
	connectionId: string;
}): Promise<{ pinned: number }> {
	const existing = accountToPinTo(
		params.previousConnectionIds,
		params.connectionId,
	);
	if (!existing) return { pinned: 0 };

	const kinds = triggerKindsForConnector(params.connector);
	if (kinds.length === 0) return { pinned: 0 };

	const owned = db
		.select({ id: automations.id })
		.from(automations)
		.where(
			and(
				eq(automations.organizationId, params.organizationId),
				eq(automations.ownerUserId, params.userId),
			),
		);

	const rows = await db
		.update(automationTriggers)
		.set({ connectionId: existing })
		.where(
			and(
				eq(automationTriggers.organizationId, params.organizationId),
				inArray(automationTriggers.kind, kinds as AutomationTriggerKind[]),
				isNull(automationTriggers.connectionId),
				inArray(automationTriggers.automationId, owned),
			),
		)
		.returning({ id: automationTriggers.id });

	return { pinned: rows.length };
}
