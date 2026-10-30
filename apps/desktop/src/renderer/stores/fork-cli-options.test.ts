import { afterEach, expect, test } from "bun:test";
import { useForkCliOptionsStore } from "./fork-cli-options";

afterEach(() => useForkCliOptionsStore.getState().setShowCliOptions(false));
test("CLI options default to hidden and the setting can be restored", () => {
	expect(useForkCliOptionsStore.getState().showCliOptions).toBe(false);
	useForkCliOptionsStore.getState().setShowCliOptions(true);
	expect(useForkCliOptionsStore.getState().showCliOptions).toBe(true);
	useForkCliOptionsStore.getState().setShowCliOptions(false);
	expect(useForkCliOptionsStore.getState().showCliOptions).toBe(false);
});
test("hydration accepts only an explicit true flag and drops unrelated saved data", () => {
	const { merge, partialize } = useForkCliOptionsStore.persist.getOptions();
	if (!merge || !partialize) throw new Error("Missing persistence policy");
	const state = useForkCliOptionsStore.getState();
	for (const saved of [
		null,
		undefined,
		{},
		{ showCliOptions: "true" },
		{ showCliOptions: 1 },
	]) {
		expect(merge(saved, state).showCliOptions).toBe(false);
	}
	const hydrated = merge(
		{ showCliOptions: true, accounts: ["private"] },
		state,
	);
	expect(hydrated.showCliOptions).toBe(true);
	expect(hydrated).not.toHaveProperty("accounts");
	expect(hydrated.hideCliOptions).toBe(false);
	expect(hydrated.hideProFeatures).toBe(true);
	expect(partialize(hydrated)).toEqual({
		hideCliOptions: false,
		hideProFeatures: true,
		showToday: true,
	});
	expect(typeof hydrated.setShowCliOptions).toBe("function");
});

test("saved hide flags survive hydration without changing the legacy choice", () => {
	const { merge } = useForkCliOptionsStore.persist.getOptions();
	if (!merge) throw new Error("Missing persistence policy");
	const state = useForkCliOptionsStore.getState();
	const restored = merge(
		{ hideCliOptions: false, hideProFeatures: false },
		state,
	);
	expect(restored.hideCliOptions).toBe(false);
	expect(restored.showCliOptions).toBe(true);
	expect(restored.hideProFeatures).toBe(false);
	expect(merge({ showCliOptions: false }, state).hideCliOptions).toBe(true);
});

test("rehydration migrates the previous persisted CLI preference", async () => {
	for (const showCliOptions of [true, false]) {
		localStorage.setItem(
			"superset-fork-cli-options",
			JSON.stringify({
				version: 0,
				state: { showCliOptions },
			}),
		);
		await useForkCliOptionsStore.persist.rehydrate();
		expect(useForkCliOptionsStore.getState().hideCliOptions).toBe(
			!showCliOptions,
		);
		expect(useForkCliOptionsStore.getState().hideProFeatures).toBe(true);
		const saved = JSON.parse(
			localStorage.getItem("superset-fork-cli-options") ?? "{}",
		);
		expect(saved.version).toBe(1);
		expect(saved.state).toEqual({
			hideCliOptions: !showCliOptions,
			hideProFeatures: true,
			showToday: true,
		});
	}
});

test("Today defaults on for old profiles and a hidden choice survives rehydration", async () => {
	const { merge } = useForkCliOptionsStore.persist.getOptions();
	expect(merge?.({}, useForkCliOptionsStore.getState()).showToday).toBe(true);
	useForkCliOptionsStore.getState().setShowToday(false);
	await useForkCliOptionsStore.persist.rehydrate();
	expect(useForkCliOptionsStore.getState().showToday).toBe(false);
	useForkCliOptionsStore.getState().setShowToday(true);
});
