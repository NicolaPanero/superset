import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireOrganizationId, resolveTask, trackerOption } from "../tracker";

export default command({
	description: "Delete tasks (Linear issues are archived)",
	args: [positional("ids").required().variadic().desc("Task IDs or slugs")],
	options: { tracker: trackerOption },
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const deleted: string[] = [];
		const failed: { id: string; reason: string }[] = [];

		for (const idOrSlug of ids) {
			try {
				const resolved = await resolveTask(ctx, idOrSlug, options.tracker);
				if (resolved.tracker === "linear") {
					await ctx.api.integration.linear.archiveIssue.mutate({
						organizationId: requireOrganizationId(ctx),
						issueId: resolved.issueId,
					});
				} else {
					await ctx.api.task.delete.mutate(resolved.task.id);
				}
				deleted.push(idOrSlug);
			} catch (error) {
				failed.push({
					id: idOrSlug,
					reason: error instanceof Error ? error.message : "unknown error",
				});
			}
		}

		if (failed.length > 0) {
			const summary = `Deleted ${deleted.length}/${ids.length}; ${failed.length} failed (${failed.map((f) => `${f.id}: ${f.reason}`).join("; ")})`;
			throw new CLIError(summary);
		}

		return {
			data: { deleted, failed },
			message:
				deleted.length === 1
					? `Deleted task ${deleted[0]}`
					: `Deleted ${deleted.length} tasks`,
		};
	},
});
