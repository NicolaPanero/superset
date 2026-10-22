import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../providers/ChatPaneActionsProvider";
import { ForkChatFileMenu } from "./ForkChatFileMenu";

afterEach(cleanup);

const openLink: OpenLink = () => true;

test("a chat without a workspace shows the chip as it is, with no menu around it", () => {
	const view = render(
		<ChatPaneActionsProvider openLink={openLink}>
			<ForkChatFileMenu text="demo.mp4">
				<code>demo.mp4</code>
			</ForkChatFileMenu>
		</ChatPaneActionsProvider>,
	);
	const chip = view.getByText("demo.mp4");
	expect(chip.getAttribute("data-state")).toBeNull();
});

test("a chat with a workspace keeps the chip and opens no menu until right-clicked", () => {
	const view = render(
		<ChatPaneActionsProvider openLink={openLink} workspaceId="workspace-1">
			<ForkChatFileMenu text="demo.mp4">
				<code>demo.mp4</code>
			</ForkChatFileMenu>
		</ChatPaneActionsProvider>,
	);
	const chip = view.getByText("demo.mp4");
	expect(chip.getAttribute("data-state")).toBe("closed");
	expect(view.queryByRole("menu")).toBeNull();
});
