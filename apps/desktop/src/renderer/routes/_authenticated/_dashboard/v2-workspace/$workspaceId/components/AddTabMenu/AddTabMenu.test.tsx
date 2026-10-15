import { expect, test } from "bun:test";
import { createWorkspaceStore, Workspace } from "@superset/panes";
import { Dialog, DialogContent, DialogTitle } from "@superset/ui/dialog";
import { useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { act, fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { AddTabMenu } from "./AddTabMenu";

const noop = () => {};

function AgentMenuFixture() {
	const [store] = useState(() => createWorkspaceStore());
	const [open, setOpen] = useState(false);
	return (
		<DndProvider backend={HTML5Backend}>
			<style>{`
				[data-slot="dropdown-menu-content"][data-state="open"] { animation-name: menu-in; }
				[data-slot="dropdown-menu-content"][data-state="closed"] { animation-name: menu-out; }
			`}</style>
			<Workspace
				store={store}
				registry={{}}
				renderAddTabMenu={({ afterClose }) => (
					<AddTabMenu
						onAddAgent={() =>
							afterClose(() => {
								expect(
									document.querySelector('[data-slot="dropdown-menu-content"]'),
								).toBeNull();
								setOpen(true);
							})
						}
						onAddTerminal={noop}
						onAddBrowser={noop}
						onAddChanges={noop}
						showPresetsBar={false}
						onToggleShowPresetsBar={noop}
					/>
				)}
			/>
			{open && (
				<Dialog open onOpenChange={setOpen}>
					<DialogContent aria-describedby={undefined}>
						<DialogTitle>New agent</DialogTitle>
						<input aria-label="Agent name" />
					</DialogContent>
				</Dialog>
			)}
		</DndProvider>
	);
}

test.each([
	"text",
	"icon",
	"padding",
	"keyboard",
])("opening an agent from the tab menu keeps dialog focus (%s)", async (target) => {
	const view = render(<AgentMenuFixture />);
	const trigger = view.getByRole("button");
	fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
	await flush();
	const item = view.getByRole("menuitem", { name: "Agent" });
	const menu = view.getByRole("menu");
	if (target === "keyboard") {
		fireEvent.focus(item);
		fireEvent.keyDown(item, { key: "Enter", code: "Enter" });
	} else {
		fireEvent.click(
			target === "icon"
				? (item.querySelector("svg") ?? item)
				: target === "text"
					? (item.querySelector("span") ?? item)
					: item,
		);
	}
	await flush();
	expect(menu.isConnected).toBe(true);
	expect(view.queryByRole("dialog")).toBeNull();
	fireEvent.animationEnd(menu, { animationName: "menu-out" });
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	await flush();
	expect(view.queryByRole("menu")).toBeNull();
	expect(view.getByRole("dialog")).toBeDefined();
	expect(document.activeElement).toBe(
		view.getByRole("textbox", { name: "Agent name" }),
	);
	fireEvent.keyDown(view.getByRole("textbox"), { key: "Escape" });
	await flush();
	expect(view.queryByRole("dialog")).toBeNull();
});
