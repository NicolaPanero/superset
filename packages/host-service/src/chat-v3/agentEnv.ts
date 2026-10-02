import { delimiter } from "node:path";
import { getBinDir, resolveSupersetHomeDir } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
import {
	buildV2TerminalEnv,
	getTerminalBaseEnv,
	resolveLaunchShell,
} from "../terminal/env";
import { resolveDefaultAccountTerminalEnv } from "../trpc/router/usage/default-account";

function rootPathFor(db: HostDb, workspaceId: string): string {
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace?.projectId) return "";
	const project = db.query.projects
		.findFirst({ where: eq(projects.id, workspace.projectId) })
		.sync();
	return project?.repoPath ?? "";
}

function withSupersetBinFirst(
	env: Record<string, string>,
): Record<string, string> {
	const binDir = getBinDir();
	const entries = (env.PATH ?? "")
		.split(delimiter)
		.filter((entry) => entry && entry !== binDir);
	return { ...env, PATH: [binDir, ...entries].join(delimiter) };
}

export function buildChatAgentEnv(options: {
	db: HostDb;
	cwd: string;
	workspaceId: string;
}): Record<string, string> {
	const baseEnv = getTerminalBaseEnv();
	const supersetHomeDir = resolveSupersetHomeDir();
	return withSupersetBinFirst({
		...buildV2TerminalEnv({
			baseEnv,
			shell: resolveLaunchShell(baseEnv),
			supersetHomeDir,
			organizationId: process.env.ORGANIZATION_ID || "",
			cwd: options.cwd,
			terminalId: "",
			workspaceId: options.workspaceId,
			workspacePath: options.cwd,
			rootPath: rootPathFor(options.db, options.workspaceId),
			supersetEnv:
				process.env.NODE_ENV === "development" ? "development" : "production",
			agentHookPort: process.env.SUPERSET_AGENT_HOOK_PORT || "",
			agentHookVersion: process.env.SUPERSET_AGENT_HOOK_VERSION || "",
		}),
		...resolveDefaultAccountTerminalEnv(options.db),
	});
}
