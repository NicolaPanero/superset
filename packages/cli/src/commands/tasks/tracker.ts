import { CLIError, string } from "@superset/cli-framework";
import type { CliContext } from "../../lib/command";

export type TaskTracker = "superset" | "linear";

export const trackerOption = string()
	.enum("superset", "linear")
	.desc(
		"Work on Superset tasks or Linear issues (default: the organization's setting)",
	);

export function requireOrganizationId(ctx: CliContext): string {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	return organizationId;
}

export async function resolveTracker(
	ctx: CliContext,
	requested: string | undefined,
): Promise<TaskTracker> {
	if (requested === "superset" || requested === "linear") return requested;
	const organization = await ctx.api.organization.getActive.query();
	return organization?.taskTracker ?? "superset";
}

export type ResolvedTask =
	| {
			tracker: "superset";
			task: NonNullable<
				Awaited<ReturnType<CliContext["api"]["task"]["byIdOrSlug"]["query"]>>
			>;
	  }
	| { tracker: "linear"; issueId: string };

/**
 * A Superset id or slug wins, so agents keep reaching the task linked to their
 * workspace in an organization that tracks in Linear; anything else is a Linear
 * identifier there.
 */
export async function resolveTask(
	ctx: CliContext,
	idOrSlug: string,
	requested: string | undefined,
): Promise<ResolvedTask> {
	if (requested !== "linear") {
		const task = await ctx.api.task.byIdOrSlug.query(idOrSlug);
		if (task) return { tracker: "superset", task };
		if (requested === "superset") {
			throw new CLIError(`Task not found: ${idOrSlug}`);
		}
	}
	if ((await resolveTracker(ctx, requested)) === "linear") {
		return { tracker: "linear", issueId: idOrSlug };
	}
	throw new CLIError(`Task not found: ${idOrSlug}`);
}
