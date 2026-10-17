import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkChatProvenanceProvider } from "../../../../providers/ForkChatProvenanceProvider";
import { ForkChatProvenance } from "./ForkChatProvenance";

afterEach(cleanup);

test("a chat switched in place offers going back to the agent it came from", () => {
	const onReturn = mock();
	const view = render(
		<ForkChatProvenanceProvider
			value={{ label: "Grok", email: null, summaryOnly: true, onReturn }}
		>
			<ForkChatProvenance />
		</ForkChatProvenanceProvider>,
	);
	expect(
		view.getByText("This agent received the messages so far."),
	).toBeTruthy();
	fireEvent.click(view.getByRole("button", { name: "Back to Grok" }));
	expect(onReturn).toHaveBeenCalledTimes(1);
});
