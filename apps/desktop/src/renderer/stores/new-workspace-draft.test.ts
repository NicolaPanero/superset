import { beforeEach, describe, expect, it } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

describe("useNewWorkspaceDraftStore checkout", () => {
	beforeEach(() => {
		useNewWorkspaceDraftStore.getState().resetDraft();
	});

	it("starts every new workspace on the local checkout", () => {
		expect(useNewWorkspaceDraftStore.getState().checkout).toBe("local");

		useNewWorkspaceDraftStore.getState().updateDraft({ checkout: "worktree" });
		useNewWorkspaceDraftStore.getState().resetDraft();

		expect(useNewWorkspaceDraftStore.getState().checkout).toBe("local");
	});
});
