import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessEnv } from "../terminal-agents/harness-sessions/types";
import { TRANSFER_AGENTS, type TransferAgent } from "./registry";

export function defaultNativeStore(agent: TransferAgent, env: HarnessEnv = {}) {
	const adapter = TRANSFER_AGENTS[agent];
	if (agent === "claude" || agent === "codex") {
		const profile = env?.[TRANSFER_AGENTS[agent].profileKey]?.trim();
		return join(
			profile || join(homedir(), TRANSFER_AGENTS[agent].home),
			TRANSFER_AGENTS[agent].store,
		);
	}
	for (const key of [
		"HOME",
		"XDG_DATA_HOME",
		"GROK_HOME",
		"OPENCODE_DB",
		"CURSOR_CONFIG_DIR",
	]) {
		const value = env?.[key]?.trim();
		if (value && !(key === "HOME" && value === homedir()))
			throw new Error("native_profile_unverified");
	}
	return join(homedir(), adapter.home, adapter.store);
}

export function peerSessionReference(
	agent: "cursor-agent" | "grok" | "opencode",
	root: string,
	sessionId: string,
	cwd: string,
) {
	if (!/^[\w-]{1,128}$/.test(sessionId)) throw new Error("invalid_session_id");
	if (agent === "opencode") return root;
	if (agent === "cursor-agent") {
		return join(
			root,
			createHash("md5").update(cwd).digest("hex"),
			sessionId,
			"store.db",
		);
	}
	const encoded = encodeURIComponent(cwd).replace(
		/[!'()*]/g,
		(value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return join(root, encoded, sessionId);
}
