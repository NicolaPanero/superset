import { expect, test } from "bun:test";
import { forkDraftFiles } from "./forkDraftFiles";

test("a draft's files come back after its composer remounts, until it is sent", () => {
	const image = new File(["png"], "screen.png", { type: "image/png" });
	forkDraftFiles("chat-v3-draft:a").onChange([image]);
	expect(forkDraftFiles("chat-v3-draft:a").initial).toEqual([image]);
	expect(forkDraftFiles("chat-v3-draft:b").initial).toEqual([]);
	forkDraftFiles("chat-v3-draft:a").onChange([]);
	expect(forkDraftFiles("chat-v3-draft:a").initial).toEqual([]);
});
