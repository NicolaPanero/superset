import { beforeEach, describe, expect, it } from "bun:test";
import { useSelectedRepoStore } from "./selectedRepoStore";

describe("useSelectedRepoStore", () => {
	beforeEach(() => {
		useSelectedRepoStore.setState({ keys: {} });
	});

	it("returns to the main repo when the choice is cleared", () => {
		const { select } = useSelectedRepoStore.getState();
		select("a", "pf~a~f1");
		select("b", "pf~b~f2");

		select("a", null);

		expect(useSelectedRepoStore.getState().keys).toEqual({ b: "pf~b~f2" });
	});

	it("keeps state identity when nothing changes", () => {
		useSelectedRepoStore.getState().select("a", "pf~a~f1");
		const before = useSelectedRepoStore.getState().keys;

		useSelectedRepoStore.getState().select("a", "pf~a~f1");
		useSelectedRepoStore.getState().select("missing", null);

		expect(useSelectedRepoStore.getState().keys).toBe(before);
	});
});
