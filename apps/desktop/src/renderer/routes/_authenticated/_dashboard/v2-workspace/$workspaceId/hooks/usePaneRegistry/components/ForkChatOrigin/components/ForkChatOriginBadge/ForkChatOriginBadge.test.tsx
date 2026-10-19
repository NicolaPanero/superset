import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkChatOriginBadge } from "./ForkChatOriginBadge";

afterEach(cleanup);

test("a chat switched in place offers going back to the agent it came from", () => {
	const onReturn = mock();
	const view = render(
		<ForkChatOriginBadge
			origin={{ label: "Grok", email: null, summaryOnly: true, onReturn }}
		/>,
	);
	expect(view.getByText("Continued from Grok")).toBeTruthy();
	fireEvent.click(view.getByRole("button", { name: "Back to Grok" }));
	expect(onReturn).toHaveBeenCalledTimes(1);
});
