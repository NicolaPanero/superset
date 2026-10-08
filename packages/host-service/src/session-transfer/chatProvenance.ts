import { homedir } from "node:os";
import { join } from "node:path";
import { readAccountIdentity } from "../trpc/router/usage/session-account/session-account";
import type { LocalLineageStore } from "./lineage";

export interface ChatProvenance {
	agent: string;
	label: string;
	email: string | null;
}

/** Where a native session came from: the newest handoff that produced it. */
export async function chatProvenance(
	store: Pick<LocalLineageStore, "list">,
	workspaceId: string,
	target: { agent: string; sessionId: string },
): Promise<ChatProvenance | null> {
	const edge = store
		.list(workspaceId, 100)
		.items.find(
			(item) =>
				item.target.agent === target.agent &&
				item.target.sessionId === target.sessionId,
		);
	if (!edge) return null;
	const { source } = edge;
	const profile =
		source.profileOverride ||
		(source.agent === "claude"
			? join(homedir(), ".claude")
			: source.agent === "codex"
				? join(homedir(), ".codex")
				: null);
	const identity =
		profile && (source.agent === "claude" || source.agent === "codex")
			? await readAccountIdentity(source.agent, profile)
			: null;
	return {
		agent: source.agent,
		label: source.label,
		email: identity?.email ?? null,
	};
}
