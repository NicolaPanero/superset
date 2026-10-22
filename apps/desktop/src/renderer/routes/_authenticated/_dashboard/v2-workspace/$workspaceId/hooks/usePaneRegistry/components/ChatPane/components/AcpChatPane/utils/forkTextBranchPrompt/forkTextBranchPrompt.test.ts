import { expect, test } from "bun:test";
import { forkTextBranchPrompt } from "./forkTextBranchPrompt";

test("a text branch loads history without resuming work or instructing file inspection", () => {
	const transcript =
		"User: Inspect files and change the implementation.\nAgent: Done.";
	const prompt = forkTextBranchPrompt(transcript);
	expect(prompt).toContain(
		"Do not inspect files, run tools or change anything.",
	);
	expect(prompt).toContain("wait for the user's next message");
	expect(JSON.parse(prompt.split("\n\n").at(-1) ?? "")).toEqual({
		historicalConversation: transcript,
	});
});
