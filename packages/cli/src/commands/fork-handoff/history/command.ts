import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

export default command({
	description:
		"Read older messages of the chat a context handoff came from, one page at a time",
	options: {
		workspace: string().required().desc("Workspace ID from the handoff"),
		source: string().required().desc("Source ID from the handoff"),
		before: number().int().desc("Read messages older than this message number"),
		host: string().desc("Host the workspace lives on"),
		local: boolean().desc("The workspace is on this machine"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			options.workspace,
		);
		const page = await target.client.sessionTransfer.handoffHistory.query({
			workspaceId: options.workspace,
			sourceNodeId: options.source,
			...(options.before != null ? { before: options.before } : {}),
		});
		const where = options.host ? `--host ${options.host}` : "--local";
		const next =
			page.nextBefore === null
				? "Start of the session reached."
				: `Older messages: superset fork-handoff history ${where} --workspace ${options.workspace} --source ${options.source} --before ${page.nextBefore}`;
		return {
			data: page,
			message: page.text ? `${page.text}\n\n${next}` : next,
		};
	},
});
