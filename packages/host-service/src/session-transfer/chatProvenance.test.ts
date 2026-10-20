import { describe, expect, test } from "bun:test";
import { chatProvenance } from "./chatProvenance";
import type { LocalLineageStore } from "./lineage";

const node = (agent: string, sessionId: string, label: string) => ({
	agent,
	sessionId,
	label,
	profileOverride: null,
});

function store(
	edges: { source: ReturnType<typeof node>; target: ReturnType<typeof node> }[],
) {
	return {
		list: () => ({ items: edges, nextCursor: null }),
	} as unknown as Pick<LocalLineageStore, "list">;
}

describe("chatProvenance", () => {
	test("names the agent of the newest handoff into the session", async () => {
		const provenance = await chatProvenance(
			store([
				{
					source: node("cursor-agent", "c2", "Cursor Agent"),
					target: node("opencode", "o1", "OpenCode"),
				},
				{
					source: node("cursor-agent", "c1", "Cursor Agent"),
					target: node("grok", "g1", "Grok"),
				},
			]),
			"workspace",
			{ agent: "opencode", sessionId: "o1" },
		);
		expect(provenance).toEqual({
			agent: "cursor-agent",
			label: "Cursor Agent",
			email: null,
		});
	});

	test("is null for a session no handoff produced", async () => {
		expect(
			await chatProvenance(store([]), "workspace", {
				agent: "claude",
				sessionId: "s1",
			}),
		).toBeNull();
	});
});
