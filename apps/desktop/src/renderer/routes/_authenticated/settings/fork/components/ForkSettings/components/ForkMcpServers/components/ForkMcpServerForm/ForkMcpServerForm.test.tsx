import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkMcpServerForm } from "./ForkMcpServerForm";

afterEach(cleanup);

test("an edited server keeps stored secrets it does not retype", () => {
	const onSave = mock();
	const view = render(
		<ForkMcpServerForm
			initial={{
				transport: "http",
				name: "remote",
				enabled: false,
				url: "https://mcp.example.com/",
				secretNames: ["Authorization"],
			}}
			pending={false}
			error={null}
			onSave={onSave}
			onCancel={() => {}}
		/>,
	);
	expect(view.getByPlaceholderText("Unchanged")).toBeTruthy();
	fireEvent.submit(view.getByRole("button", { name: "Save" }));
	expect(onSave).toHaveBeenCalledWith({
		transport: "http",
		name: "remote",
		enabled: false,
		url: "https://mcp.example.com/",
		headers: [{ name: "Authorization" }],
	});
});

test("a new stdio server sends one argument per line and its variables", () => {
	const onSave = mock();
	const view = render(
		<ForkMcpServerForm
			pending={false}
			error={null}
			onSave={onSave}
			onCancel={() => {}}
		/>,
	);
	fireEvent.click(view.getByRole("radio", { name: "stdio" }));
	fireEvent.change(view.getByLabelText("Name"), {
		target: { value: "local" },
	});
	fireEvent.change(view.getByLabelText("Command"), {
		target: { value: "npx" },
	});
	fireEvent.change(view.getByLabelText("Arguments"), {
		target: { value: "-y\n @scope/server \n\n" },
	});
	fireEvent.click(view.getByRole("button", { name: "Add" }));
	const secretName = view.getAllByLabelText("Name").at(-1);
	if (!secretName) throw new Error("missing variable name field");
	fireEvent.change(secretName, { target: { value: "API_KEY" } });
	fireEvent.change(view.getByLabelText("Value"), {
		target: { value: "secret" },
	});
	fireEvent.submit(view.getByRole("button", { name: "Save" }));
	expect(onSave).toHaveBeenCalledWith({
		transport: "stdio",
		name: "local",
		enabled: true,
		command: "npx",
		args: ["-y", "@scope/server"],
		env: [{ name: "API_KEY", value: "secret" }],
	});
});
