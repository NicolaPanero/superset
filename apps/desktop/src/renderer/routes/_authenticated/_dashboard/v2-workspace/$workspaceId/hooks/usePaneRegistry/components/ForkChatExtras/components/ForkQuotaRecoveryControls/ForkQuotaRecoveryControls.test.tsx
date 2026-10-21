import { expect, test } from "bun:test";
import { workspaceTrpc } from "@superset/workspace-client";
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import {
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { ForkQuotaRecoveryControls } from "./ForkQuotaRecoveryControls";

function fixture(
	options: {
		supported?: boolean;
		fail?: boolean;
		oldHost?: boolean;
		live?: boolean;
		agent?: string;
		capabilities?: { switchAccounts: boolean; resumeAtReset: boolean };
	} = {},
) {
	const state = {
		supported: options.supported ?? true,
		switchAccounts: false,
		resumeAtReset: false,
		phase: "idle",
		capabilities: options.capabilities,
	};
	const writes: unknown[] = [];
	const queries = queryFixture();
	const connection = workspaceTrpc.createClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						if (options.oldHost) {
							observer.error(
								new TRPCClientError("No procedure", {
									result: {
										error: {
											code: -32004,
											message: "No procedure",
											data: {
												code: "NOT_FOUND",
												httpStatus: 404,
												i18nKey: null,
												i18nParams: null,
												teardownFailure: undefined,
												projectNotSetup: undefined,
												projectDirMissing: undefined,
												deleteInProgress: undefined,
											},
										},
									},
								}),
							);
							return;
						}
						if (op.path === "agents.setQuotaRecovery") {
							writes.push(op.input);
							if (options.fail) {
								observer.error(new TRPCClientError("Save failed"));
								return;
							}
							Object.assign(state, op.input);
							state.phase = state.resumeAtReset ? "waiting" : "idle";
						} else if (op.path !== "agents.quotaRecovery")
							throw new Error("unexpected model or agent RPC");
						observer.next({
							result: {
								data: op.type === "mutation" ? { saved: true } : { ...state },
							},
						});
						observer.complete();
					}),
		],
	});
	const widget = () => (
		<workspaceTrpc.Provider client={connection} queryClient={queries.client}>
			<ForkQuotaRecoveryControls
				workspaceId="00000000-0000-0000-0000-000000000001"
				terminalId="current-chat"
				enabled
				sessionLive={options.live ?? true}
				agent={options.agent}
			/>
		</workspaceTrpc.Provider>
	);
	const view = render(widget(), { wrapper: queries.wrapper });
	return { state, writes, view, widget };
}
test("choosing to wait saves both options immediately without a handoff command", async () => {
	const f = fixture();
	await flush();
	fireEvent.click(f.view.getByRole("radio", { name: /^Wait for the reset/ }));
	await flush();
	expect(f.writes).toEqual([
		{
			workspaceId: "00000000-0000-0000-0000-000000000001",
			terminalId: "current-chat",
			switchAccounts: false,
			resumeAtReset: true,
		},
	]);
	expect(f.state.switchAccounts).toBe(false);
	expect(f.view.container.textContent).toContain("Waiting for quota");
	expect(f.view.queryByRole("button", { name: "Continue" })).toBeNull();
});
test("each answer saves both options and survives a remount", async () => {
	const f = fixture();
	await flush();
	const radio = (name: RegExp) => f.view.getByRole("radio", { name });
	fireEvent.click(radio(/^Switch account/));
	await flush();
	expect(f.state).toMatchObject({ switchAccounts: true, resumeAtReset: false });
	fireEvent.click(radio(/^Switch, or wait/));
	await flush();
	f.view.rerender(<span />);
	f.view.rerender(f.widget());
	await flush();
	expect((radio(/^Switch, or wait/) as HTMLInputElement).checked).toBe(true);
	fireEvent.click(radio(/^Wait for the reset/));
	await flush();
	expect(f.state).toMatchObject({ switchAccounts: false, resumeAtReset: true });
	fireEvent.click(radio(/^Pause/));
	await flush();
	expect(f.state).toMatchObject({
		switchAccounts: false,
		resumeAtReset: false,
	});
});
test("a rejected save does not display an enabled option", async () => {
	const f = fixture({ fail: true });
	await flush();
	fireEvent.click(f.view.getByRole("radio", { name: /^Wait for the reset/ }));
	await flush();
	expect(f.state.resumeAtReset).toBe(false);
	expect(
		(
			f.view.getByRole("radio", {
				name: /^Wait for the reset/,
			}) as HTMLInputElement
		).checked,
	).toBe(false);
});
test.each([
	{ supported: false },
	{ oldHost: true },
])("unsupported hosts do not break the surrounding chat", async (options) => {
	const f = fixture(options);
	await flush();
	expect(f.view.queryAllByRole("radio")).toHaveLength(0);
	expect(f.view.container.textContent).toContain(
		"Automatic continuation is not supported on this host.",
	);
	expect(f.writes).toEqual([]);
});
test("a stopped chat explains that Resume is required before the options can act", async () => {
	const f = fixture({ live: false });
	await flush();
	expect(f.view.container.textContent).toContain(
		"Resume this chat to activate these options.",
	);
});

test("Codex shows both options and saves them to the current Codex chat", async () => {
	const f = fixture({
		agent: "codex",
		capabilities: { switchAccounts: true, resumeAtReset: true },
	});
	await flush();
	fireEvent.click(f.view.getByRole("radio", { name: /^Wait for the reset/ }));
	await flush();
	expect(f.writes).toEqual([
		{
			workspaceId: "00000000-0000-0000-0000-000000000001",
			terminalId: "current-chat",
			agent: "codex",
			switchAccounts: false,
			resumeAtReset: true,
		},
	]);
	expect(f.view.container.textContent).not.toContain("Claude conversation");
});
test("an older host never offers a Codex choice that it cannot execute", async () => {
	const f = fixture({ agent: "codex" });
	await flush();
	expect(f.view.queryAllByRole("radio")).toHaveLength(0);
	expect(f.writes).toEqual([]);
});
test.each([
	"cursor-agent",
	"grok",
	"opencode",
	"gemini",
	"agy",
	"custom",
])("%s explains why continuation is unavailable without offering choices", async (agent) => {
	const f = fixture({ agent });
	await flush();
	expect(f.view.queryAllByRole("radio")).toHaveLength(0);
	expect(f.view.container.textContent).toContain(
		"Automatic account switching needs isolated profiles",
	);
	expect(f.view.container.textContent).toContain(
		"Automatic continuation needs verified quota",
	);
	expect(f.writes).toEqual([]);
});
test("waiting and rotation are shown independently when a host only supports waiting", async () => {
	const f = fixture({
		agent: "codex",
		capabilities: { switchAccounts: false, resumeAtReset: true },
	});
	await flush();
	expect(f.view.queryAllByRole("radio")).toHaveLength(2);
	fireEvent.click(f.view.getByRole("radio", { name: /^Wait for the reset/ }));
	await flush();
	expect(f.state.resumeAtReset).toBe(true);
});
