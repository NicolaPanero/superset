import { expect, test } from "bun:test";
import { FULL_ACCESS_CHAT_MODE } from "@superset/chat/protocol";
import { FakeHarness, type HarnessStartOptions } from "@superset/chat-runtime";
import { startInFullAccess } from "./forkFullAccessStart";

function started(
	fullAccessModeId?: string,
	options?: Partial<HarnessStartOptions>,
) {
	const harness = new FakeHarness({ turns: [], start: [] });
	const seen: HarnessStartOptions[] = [];
	const start = harness.start.bind(harness);
	harness.start = (startOptions) => {
		seen.push(startOptions);
		return start(startOptions);
	};
	void startInFullAccess(harness, fullAccessModeId).start({
		cwd: "/work",
		...options,
	});
	return seen[0];
}

test("a new or resumed chat without a mode starts in the agent's full access", () => {
	expect(started("bypassPermissions")?.modeId).toBe("bypassPermissions");
	expect(
		started("agent-full-access", { resume: { harnessSessionId: "s-1" } })
			?.modeId,
	).toBe("agent-full-access");
});

test("an agent without a native full-access mode gets the client-side one", () => {
	expect(started()?.modeId).toBe(FULL_ACCESS_CHAT_MODE);
});

test("a picked mode wins", () => {
	expect(started("bypassPermissions", { modeId: "plan" })?.modeId).toBe("plan");
	expect(
		started("bypassPermissions", { modeId: "agent-default" })?.modeId,
	).toBe("agent-default");
});
