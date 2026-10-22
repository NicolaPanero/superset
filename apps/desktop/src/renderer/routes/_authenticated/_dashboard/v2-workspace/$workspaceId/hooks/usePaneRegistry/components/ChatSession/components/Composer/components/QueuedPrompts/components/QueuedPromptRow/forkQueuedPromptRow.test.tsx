import { expect, test } from "bun:test";
import type { UserMessage } from "@superset/chat/protocol";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { QueuedPromptRow } from "./QueuedPromptRow";

test("the edit pencil works for an image message without opening a single-action menu", () => {
	const prompt: UserMessage = {
		id: "queued",
		kind: "user_message",
		startedAtMs: 1,
		content: [
			{
				type: "text",
				text: 'Review\n<attachment path=".superset/attachments/screen.png" type="image/png" />',
			},
		],
	};
	let edited: UserMessage | undefined;
	const view = render(
		<QueuedPromptRow
			actionable
			prompt={prompt}
			onEdit={(value) => {
				edited = value;
			}}
			onRemove={() => {}}
			onSteer={() => {}}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Edit" }));
	expect(edited).toBe(prompt);
	expect(view.queryByRole("button", { name: "More actions" })).toBeNull();
});
