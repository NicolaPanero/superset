import { expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { CommandTerminal } from "renderer/routes/_authenticated/components/CommandTerminal";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { OpenCodeConnection } from "./OpenCodeConnection";

const config = { label: "OpenCode", command: "opencode" } as HostAgentConfig;
test("OpenCode login starts only after an explicit click and closing refreshes accounts", async () => {
	let checks = 0;
	const Terminal = (({ command }: { command: string }) => (
		<output>{command}</output>
	)) as typeof CommandTerminal;
	const view = render(
		<OpenCodeConnection
			config={config}
			hostUrl="http://local"
			allowLocalLogin
			onChanged={async () => {
				checks++;
			}}
			Terminal={Terminal}
		/>,
	);
	expect(view.queryByRole("dialog")).toBeNull();
	expect(checks).toBe(0);
	fireEvent.click(view.getByRole("button", { name: "Sign in" }));
	expect(view.getByText("opencode auth login")).toBeDefined();
	fireEvent.click(view.getByRole("button", { name: "Done" }));
	await flush();
	expect(view.queryByRole("dialog")).toBeNull();
	expect(checks).toBe(1);
});
test("OpenCode cannot start a local login when viewing a remote host", () => {
	const view = render(
		<OpenCodeConnection
			config={config}
			hostUrl="http://remote"
			allowLocalLogin={false}
			onChanged={async () => {}}
		/>,
	);
	expect(
		(view.getByRole("button", { name: "Sign in" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
