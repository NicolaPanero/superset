import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveAmbientCodexHome } from "@superset/agent-setup";
import type { IsolatedAccount } from "./fork-account-registry";

export async function independentProfile(
	agent: IsolatedAccount["agent"],
	selection: string,
) {
	try {
		if (!(await stat(selection)).isDirectory()) return false;
		const directory = await realpath(selection);
		const external =
			agent === "claude"
				? [join(homedir(), ".claude"), join(homedir(), ".config", "claude")]
				: [resolveAmbientCodexHome()];
		for (const path of external)
			if (directory === (await realpath(path).catch(() => resolve(path))))
				return false;
		for (const file of agent === "claude"
			? [".claude.json", ".credentials.json"]
			: ["auth.json"]) {
			const target = await realpath(join(selection, file)).catch(() => null);
			if (target && target !== join(directory, file)) return false;
		}
		return true;
	} catch {
		return false;
	}
}
