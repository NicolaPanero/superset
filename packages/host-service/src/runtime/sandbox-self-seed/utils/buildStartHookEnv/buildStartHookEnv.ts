import { stripTerminalRuntimeEnv } from "../../../../terminal/env-strip.ts";

export function buildStartHookEnv(
	hostEnv: NodeJS.ProcessEnv,
	managedEnv: Record<string, string>,
): Record<string, string> {
	const stringEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(hostEnv)) {
		if (typeof value === "string") stringEnv[key] = value;
	}
	// A dev host-service started by the hook would otherwise share
	// SUPERSET_RUN_DIR's ptyd.sock with this one and replace its daemon.
	const env = stripTerminalRuntimeEnv(stringEnv);
	delete env.PORT;
	if (hostEnv.SUPERSET_SANDBOX_WORKSPACE_ID) {
		env.SUPERSET_SANDBOX_WORKSPACE_ID = hostEnv.SUPERSET_SANDBOX_WORKSPACE_ID;
	}
	return { ...env, ...managedEnv, IS_SANDBOX: "1" };
}
