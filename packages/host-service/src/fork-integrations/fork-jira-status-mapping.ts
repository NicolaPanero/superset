import { and, eq } from "drizzle-orm";
import { forkJiraStatusMappings } from "../db/fork-schema";
import type { HostServiceContext } from "../types";

export interface ForkJiraStatusMapping {
	progressStatusId: string | null;
	reviewStatusId: string | null;
}

export function forkJiraProjectKey(issueKey: string): string {
	return issueKey.slice(0, issueKey.lastIndexOf("-"));
}

export function forkJiraStatusMapping(
	ctx: Pick<HostServiceContext, "db" | "organizationId">,
	connectionId: string,
	projectKey: string,
): ForkJiraStatusMapping | null {
	const row = ctx.db
		.select()
		.from(forkJiraStatusMappings)
		.where(
			and(
				eq(forkJiraStatusMappings.scope, ctx.organizationId),
				eq(forkJiraStatusMappings.connectionId, connectionId),
				eq(forkJiraStatusMappings.projectKey, projectKey),
			),
		)
		.get();
	return row
		? {
				progressStatusId: row.progressStatusId,
				reviewStatusId: row.reviewStatusId,
			}
		: null;
}

export function forkSetJiraStatusMapping(
	ctx: Pick<HostServiceContext, "db" | "organizationId">,
	input: { connectionId: string; projectKey: string } & ForkJiraStatusMapping,
): void {
	const where = and(
		eq(forkJiraStatusMappings.scope, ctx.organizationId),
		eq(forkJiraStatusMappings.connectionId, input.connectionId),
		eq(forkJiraStatusMappings.projectKey, input.projectKey),
	);
	if (!input.progressStatusId && !input.reviewStatusId) {
		ctx.db.delete(forkJiraStatusMappings).where(where).run();
		return;
	}
	const values = {
		progressStatusId: input.progressStatusId,
		reviewStatusId: input.reviewStatusId,
	};
	ctx.db
		.insert(forkJiraStatusMappings)
		.values({
			scope: ctx.organizationId,
			connectionId: input.connectionId,
			projectKey: input.projectKey,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				forkJiraStatusMappings.scope,
				forkJiraStatusMappings.connectionId,
				forkJiraStatusMappings.projectKey,
			],
			set: values,
		})
		.run();
}
