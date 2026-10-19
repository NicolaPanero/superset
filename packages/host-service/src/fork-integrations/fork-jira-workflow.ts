import type { ForkTaskLink } from "@superset/shared/fork-integrations";
import { and, eq } from "drizzle-orm";
import { forkExternalTaskLinks } from "../db/fork-schema";
import type { HostServiceContext } from "../types";
import { forkServices } from "./fork-services";

export function forkLinkTask(
	ctx: HostServiceContext,
	workspaceId: string,
	link: ForkTaskLink,
): void {
	ctx.db
		.insert(forkExternalTaskLinks)
		.values({
			scope: ctx.organizationId,
			workspaceId,
			taskKey: `${link.connectionId}:${link.taskId}`,
			task: link,
		})
		.onConflictDoUpdate({
			target: [
				forkExternalTaskLinks.scope,
				forkExternalTaskLinks.workspaceId,
				forkExternalTaskLinks.taskKey,
			],
			set: { task: link },
		})
		.run();
}

export function forkLinkedTasks(
	ctx: HostServiceContext,
	workspaceId: string,
): ForkTaskLink[] {
	return ctx.db
		.select()
		.from(forkExternalTaskLinks)
		.where(
			and(
				eq(forkExternalTaskLinks.scope, ctx.organizationId),
				eq(forkExternalTaskLinks.workspaceId, workspaceId),
			),
		)
		.all()
		.map((row) => row.task);
}

/** "APP-12: title" for a workspace linked to issues, unless a key is there. */
export function forkPullRequestTitle(
	ctx: HostServiceContext,
	workspaceId: string,
	title: string,
): string {
	const keys = forkLinkedTasks(ctx, workspaceId).map((task) => task.key);
	const [first] = keys;
	if (!first || keys.some((key) => title.includes(key))) return title;
	return `${first}: ${title}`;
}

/** Best effort: a workflow that has no matching transition is left as it is. */
export async function forkAdvanceLinkedTasks(
	ctx: HostServiceContext,
	workspaceId: string,
	target: "progress" | "review",
): Promise<void> {
	const { jira, store } = forkServices(ctx);
	await Promise.all(
		forkLinkedTasks(ctx, workspaceId)
			.filter((task) => store.get(task.connectionId)?.connection.enabled)
			.map((task) =>
				jira.advance(task.connectionId, task.key, target).catch((error) => {
					console.warn("[fork-jira] could not move", task.key, error);
					return false;
				}),
			),
	);
}
