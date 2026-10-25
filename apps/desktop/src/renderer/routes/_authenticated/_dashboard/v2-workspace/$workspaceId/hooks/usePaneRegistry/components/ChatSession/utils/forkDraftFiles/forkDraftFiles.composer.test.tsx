import { afterEach, expect, test } from "bun:test";
import {
	PromptInput,
	type PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import { createRef } from "react";
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

test("restored queued files merge with an existing composer draft and survive a tab remount", async () => {
	const key = "chat-v3-draft:queue-edit";
	const existing = new File(["draft"], "draft.txt", { type: "text/plain" });
	const queued = new File(["queued"], "queued.txt", { type: "text/plain" });
	forkDraftFiles(key).onChange([existing]);
	const ref = createRef<PromptInputHandle>();
	const view = render(
		<PromptInput
			ref={ref}
			commands={[]}
			mentionProviders={[]}
			draftFiles={forkDraftFiles(key)}
		/>,
	);
	await flush();
	ref.current?.addFiles([queued]);
	ref.current?.appendText("Edited message");
	await flush();
	expect(forkDraftFiles(key).initial).toEqual([existing, queued]);
	view.unmount();
	const restored = render(
		<PromptInput
			commands={[]}
			mentionProviders={[]}
			defaultValue="Edited message"
			draftFiles={forkDraftFiles(key)}
		/>,
	);
	await flush();
	expect(restored.container.innerHTML).toContain("queued.txt");
	expect(restored.container.innerHTML).toContain("draft.txt");
});
