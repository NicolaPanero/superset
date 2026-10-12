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
	} = {},
) {
	const state = {
		supported: options.supported ?? true,
		switchAccounts: false,
		resumeAtReset: false,
		phase: "idle",
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
			/>
		</workspaceTrpc.Provider>
	);
	const view = render(widget(), { wrapper: queries.wrapper });
	return { state, writes, view, widget };
}
test("a quota-limited current chat saves waiting immediately without a handoff command", async () => {
	const f = fixture();
	await flush();
	fireEvent.click(f.view.getByLabelText("Wait and continue when quota resets"));
	await flush();
	expect(f.writes).toEqual([
		{
			workspaceId: "00000000-0000-0000-0000-000000000001",
			terminalId: "current-chat",
			resumeAtReset: true,
		},
	]);
	expect(f.state.switchAccounts).toBe(false);
	expect(f.view.container.textContent).toContain("Waiting for quota");
	expect(f.view.queryByRole("button", { name: "Continue" })).toBeNull();
});
test("the two continuation options remain independent and are retained across remount", async () => {
	const f = fixture();
	await flush();
	fireEvent.click(
		f.view.getByLabelText(
			"Switch to the suggested account when quota runs out",
		),
	);
	await flush();
	expect(f.state).toMatchObject({ switchAccounts: true, resumeAtReset: false });
	fireEvent.click(f.view.getByLabelText("Wait and continue when quota resets"));
	await flush();
	f.view.rerender(<span />);
	f.view.rerender(f.widget());
	await flush();
	expect(
		f.view
			.getByLabelText("Switch to the suggested account when quota runs out")
			.getAttribute("aria-checked"),
	).toBe("true");
	expect(
		f.view
			.getByLabelText("Wait and continue when quota resets")
			.getAttribute("aria-checked"),
	).toBe("true");
	fireEvent.click(
		f.view.getByLabelText(
			"Switch to the suggested account when quota runs out",
		),
	);
	await flush();
	expect(f.state).toMatchObject({ switchAccounts: false, resumeAtReset: true });
});
test("a rejected save does not display an enabled option", async () => {
	const f = fixture({ fail: true });
	await flush();
	fireEvent.click(f.view.getByLabelText("Wait and continue when quota resets"));
	await flush();
	expect(f.state.resumeAtReset).toBe(false);
	expect(
		f.view
			.getByLabelText("Wait and continue when quota resets")
			.getAttribute("aria-checked"),
	).toBe("false");
});
test.each([
	{ supported: false },
	{ oldHost: true },
])("unsupported hosts do not break the surrounding chat", async (options) => {
	const f = fixture(options);
	await flush();
	expect(f.view.container.textContent).toBe("");
	expect(f.writes).toEqual([]);
});
test("a stopped chat explains that Resume is required before the options can act", async () => {
	const f = fixture({ live: false });
	await flush();
	expect(f.view.container.textContent).toContain(
		"Resume this chat to activate these options.",
	);
	expect(f.view.container.textContent).not.toContain("Applies immediately");
});
