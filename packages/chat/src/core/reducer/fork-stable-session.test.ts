import { expect, test } from "bun:test";
import type { SessionState } from "../../protocol/envelope";
import { withStableSession } from "./fork-stable-session";
import { emptySnapshot, reduce } from "./reducer";

const commands = () => [
	{ name: "review", description: "Review the diff" },
	{ name: "deploy", description: "Deploy the app" },
];
const session = (patch: Partial<SessionState> = {}): SessionState => ({
	status: "idle",
	harness: "claude-acp",
	availableCommands: commands(),
	availableModes: [{ id: "default", label: "Default" }],
	...patch,
});
const envelope = (seq: number, state: SessionState) => ({
	v: 1 as const,
	sessionId: "s",
	cursor: { epoch: "e", seq },
	ts: seq,
	event: { type: "session" as const, session: state },
});

test("a status change keeps the equal lists of the previous session", () => {
	const first = reduce(emptySnapshot(), envelope(1, session()));
	const second = reduce(first, envelope(2, session({ status: "running" })));
	expect(second.session?.status).toBe("running");
	expect(second.session?.availableCommands).toBe(
		first.session?.availableCommands,
	);
	expect(second.session?.availableModes).toBe(first.session?.availableModes);
});

test("changed lists replace the previous ones", () => {
	const previous = session();
	const next = session({
		availableCommands: [...commands(), { name: "new", description: "New" }],
	});
	const result = withStableSession(previous, next);
	expect(result.availableCommands).toBe(next.availableCommands);
	expect(result.availableModes).toBe(previous.availableModes);
});

test("an identical session keeps its identity and a removed list stays removed", () => {
	const previous = session();
	expect(withStableSession(previous, session())).toBe(previous);
	const { availableModes: _removed, ...withoutModes } = session();
	expect(
		withStableSession(previous, withoutModes).availableModes,
	).toBeUndefined();
});
