import { expect, test } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { ForkAgentSetup } from "./ForkAgentSetup";
import type { useForkAgentSetup } from "./hooks/useForkAgentSetup";

const config: HostAgentConfig = {
	id: "config",
	presetId: "grok",
	label: "Grok",
	command: "grok",
	args: [],
	promptTransport: "argv",
	promptArgs: [],
	resumeArgs: [],
	forkArgs: [],
	env: {},
	order: 0,
	iconId: null,
};
function fixture() {
	const actions: unknown[] = [];
	const data = {
		command: "/provider/grok",
		version: "1.0.50",
		chat: true,
		auth: "login",
		modelOverrides: false,
		model: null,
		revision: "a".repeat(64),
		cursorApiKeySupported: true,
	};
	let isError = false;
	const hook = () => ({
		data,
		isError,
		isPending: false,
		isFetching: false,
		refetch: async () => {
			actions.push("check");
		},
		apply: {
			isPending: false,
			reset: () => {},
			mutate: (
				input: unknown,
				callbacks: { onSuccess: (value: unknown) => void },
			) => {
				actions.push(input);
				callbacks.onSuccess(config);
			},
		},
	});
	return {
		data,
		actions,
		unavailable: () => {
			isError = true;
		},
		hook: hook as unknown as typeof useForkAgentSetup,
	};
}
test("the default setup row stays compact and does not launch login or apply settings", () => {
	const f = fixture();
	const view = render(
		<ForkAgentSetup
			config={config}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	expect(view.getByText("Connected via subscription")).toBeDefined();
	expect(view.queryByRole("button", { name: "Sign in" })).toBeNull();
	expect(f.actions).toEqual([]);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	expect(view.getByRole("button", { name: "Sign in" })).toBeDefined();
	expect(f.actions).toEqual([]);
});
test("API setup is an explicit billed choice and requires a key before applying", async () => {
	const f = fixture();
	const view = render(
		<ForkAgentSetup
			config={config}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	fireEvent.click(view.getByRole("button", { name: "Use an API key" }));
	expect(view.getByText(/separate billing/)).toBeDefined();
	expect(
		(
			view.getByRole("button", {
				name: "Apply recommended settings",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	fireEvent.change(view.getByLabelText("API key"), {
		target: { value: "my-fixture-key" },
	});
	expect((view.getByLabelText("API key") as HTMLInputElement).type).toBe(
		"password",
	);
	fireEvent.click(
		view.getByRole("button", { name: "Apply recommended settings" }),
	);
	await flush();
	expect(f.actions).toEqual([{ key: "my-fixture-key", model: "grok-4.7" }]);
	expect((view.getByLabelText("API key") as HTMLInputElement).value).toBe("");
	expect(view.getByText(/Settings applied/)).toBeDefined();
});
test("login opens the correct binary and does not disappear when the probe refreshes", async () => {
	const f = fixture();
	const commands: string[] = [];
	const Terminal = ({ command }: { command: string }) => {
		commands.push(command);
		return <div>Provider login</div>;
	};
	const view = render(
		<ForkAgentSetup
			config={config}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
			Terminal={Terminal}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	fireEvent.click(view.getByRole("button", { name: "Sign in" }));
	await flush();
	expect(commands).toContain("/provider/grok login");
	expect(view.getByRole("dialog")).toBeDefined();
	f.data.auth = "api";
	view.rerender(
		<ForkAgentSetup
			config={config}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
			Terminal={Terminal}
		/>,
	);
	expect(view.getByRole("dialog")).toBeDefined();
	fireEvent.click(view.getByRole("button", { name: "Done" }));
	await flush();
	expect(view.queryByRole("dialog")).toBeNull();
});
test("older hosts keep advanced settings available without claiming readiness", () => {
	const f = fixture();
	f.unavailable();
	let advanced = false;
	const view = render(
		<ForkAgentSetup
			config={config}
			hostUrl="http://old-host"
			onChanged={() => {}}
			onAdvanced={() => {
				advanced = true;
			}}
			useSetup={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	expect(view.queryByText("Connected via subscription")).toBeNull();
	expect(
		view.queryByRole("button", { name: "Apply recommended settings" }),
	).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Advanced configuration" }));
	expect(advanced).toBe(true);
});
test("a model credential override prevents entering a second ambiguous API key", () => {
	const f = fixture();
	f.data.modelOverrides = true;
	const view = render(
		<ForkAgentSetup
			config={config}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	fireEvent.click(view.getByRole("button", { name: "Use an API key" }));
	expect(view.queryByLabelText("API key")).toBeNull();
	expect(
		(
			view.getByRole("button", {
				name: "Apply recommended settings",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
});

test("an inconclusive setup probe does not imply that only terminal mode is available", () => {
	const f = fixture();
	f.data.chat = false;
	const view = render(
		<ForkAgentSetup
			config={{ ...config, presetId: "cursor-agent" }}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	expect(view.getByText("Connected via subscription")).toBeDefined();
	expect(view.queryByText("Chat support not verified")).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	expect(
		view.getByText("Chat support is checked when you open a chat."),
	).toBeDefined();
	expect(
		view.getByRole("button", { name: "Apply recommended settings" }),
	).toBeDefined();
});

test("Cursor offers a masked API key field without a Grok model field", async () => {
	const f = fixture();
	const view = render(
		<ForkAgentSetup
			config={{ ...config, presetId: "cursor-agent" }}
			hostUrl="http://host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	fireEvent.click(view.getByRole("button", { name: "Use an API key" }));
	const input = view.getByLabelText("API key") as HTMLInputElement;
	expect(input.type).toBe("password");
	expect(view.queryByLabelText("Model")).toBeNull();
	fireEvent.change(input, { target: { value: "cursor-fixture-key" } });
	fireEvent.click(view.getByRole("button", { name: "Save" }));
	await flush();
	expect(f.actions).toContainEqual({
		key: "cursor-fixture-key",
		model: "grok-4.7",
	});
	expect(input.value).toBe("");
});
test("remote host setup never starts login on this computer", () => {
	const f = fixture();
	const view = render(
		<ForkAgentSetup
			config={config}
			hostUrl="http://remote"
			allowLocalLogin={false}
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	expect(
		(view.getByRole("button", { name: "Sign in" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});

test("older hosts do not offer a Cursor key they would silently ignore", () => {
	const f = fixture();
	f.data.cursorApiKeySupported = false;
	const view = render(
		<ForkAgentSetup
			config={{ ...config, presetId: "cursor-agent" }}
			hostUrl="http://old-host"
			onChanged={() => {}}
			onAdvanced={() => {}}
			useSetup={f.hook}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Configure" }));
	expect(view.queryByRole("button", { name: "Use an API key" })).toBeNull();
	expect(view.getByRole("button", { name: "Sign in" })).toBeDefined();
});
