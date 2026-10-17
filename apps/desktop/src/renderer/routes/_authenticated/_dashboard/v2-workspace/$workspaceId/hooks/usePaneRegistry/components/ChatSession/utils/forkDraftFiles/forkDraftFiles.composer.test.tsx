import { afterEach, expect, test } from "bun:test";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { cleanup, flush, render } from "renderer/test-utils/fork-ui";
import { forkDraftFiles } from "./forkDraftFiles";

afterEach(cleanup);

test("a pasted file is still in the composer after its tab comes back", async () => {
	// No preview URL here: the test DOM cannot create one for its own File.
	const notes = new File(["notes"], "notes.txt", { type: "text/plain" });
	forkDraftFiles("chat-v3-draft:remount").onChange([notes]);
	const view = render(
		<PromptInput
			commands={[]}
			mentionProviders={[]}
			draftFiles={forkDraftFiles("chat-v3-draft:remount")}
		/>,
	);
	await flush();
	expect(view.container.innerHTML).toContain("notes.txt");
	expect(forkDraftFiles("chat-v3-draft:remount").initial).toEqual([notes]);
});
