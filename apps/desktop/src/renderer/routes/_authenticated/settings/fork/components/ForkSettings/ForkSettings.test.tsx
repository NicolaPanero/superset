import { afterEach, expect, test } from "bun:test";
import { ForkProFeature } from "renderer/components/ForkProFeature";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { useForkHomeAppearance } from "renderer/stores/fork-home-appearance";
import { useSettingsStore } from "renderer/stores/settings-state";
import {
	act,
	cleanup,
	fireEvent,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { getVisibleMatchCountBySection } from "../../../utils/settings-search";
import { ForkSettings } from "./ForkSettings";

afterEach(() => {
	cleanup();
	useForkCliOptionsStore.getState().setHideCliOptions(true);
	useForkCliOptionsStore.getState().setHideProFeatures(true);
	useForkHomeAppearance.getState().setInteractiveBackground(false);
	useSettingsStore.getState().setSearchQuery("");
});

test("Fork Settings restores Pro UI and persists independent hide preferences", () => {
	const view = render(
		<>
			<ForkSettings />
			<ForkProFeature>
				<span>Paid action</span>
			</ForkProFeature>
		</>,
		{ wrapper: queryFixture().wrapper },
	);
	const cli = view.getByRole("switch", { name: "Hide CLI options" });
	const pro = view.getByRole("switch", { name: "Hide Pro features" });
	expect(cli.getAttribute("aria-checked")).toBe("true");
	expect(pro.getAttribute("aria-checked")).toBe("true");
	expect(view.queryByText("Paid action")).toBeNull();
	fireEvent.click(pro);
	expect(view.getByText("Paid action")).toBeTruthy();
	expect(cli.getAttribute("aria-checked")).toBe("true");
	const saved = JSON.parse(
		localStorage.getItem("superset-fork-cli-options") ?? "{}",
	);
	expect(saved.state).toEqual({ hideCliOptions: true, hideProFeatures: false });
	fireEvent.click(pro);
	expect(view.queryByText("Paid action")).toBeNull();
});

test("settings search offers Fork Settings and omits hidden Pro sections", () => {
	const hidden = getVisibleMatchCountBySection("", true, true, true, true);
	expect(hidden.fork).toBe(6);
	expect(hidden.billing).toBeUndefined();
	expect(hidden.teams).toBeUndefined();
	expect(hidden.mobile).toBeUndefined();
	expect(hidden.localAgentAccounts).toBeGreaterThan(0);
	const visible = getVisibleMatchCountBySection("", true, true, true, false);
	expect(visible.billing).toBeGreaterThan(0);
});

test("the home background is opt-in, survives reload and appears in settings search", async () => {
	useSettingsStore.getState().setSearchQuery("ascii");
	const view = render(<ForkSettings />, { wrapper: queryFixture().wrapper });
	const toggle = view.getByRole("switch", {
		name: "Interactive home background",
	});
	expect(toggle.getAttribute("aria-checked")).toBe("false");
	expect(view.queryByRole("switch", { name: "Hide Pro features" })).toBeNull();
	fireEvent.click(toggle);
	const saved = localStorage.getItem("superset-fork-home-appearance");
	expect(JSON.parse(saved ?? "{}").state).toEqual({
		interactiveBackground: true,
	});
	await act(async () => {
		useForkHomeAppearance.setState({ interactiveBackground: false });
		localStorage.setItem("superset-fork-home-appearance", saved ?? "");
		await useForkHomeAppearance.persist.rehydrate();
	});
	expect(useForkHomeAppearance.getState().interactiveBackground).toBe(true);
	fireEvent.click(toggle);
	expect(useForkHomeAppearance.getState().interactiveBackground).toBe(false);
});

test("the background is on by default and an explicit off survives a reload", async () => {
	const rehydrate = async (saved: string | null) => {
		await act(async () => {
			useForkHomeAppearance.setState({ interactiveBackground: true });
			if (saved === null)
				localStorage.removeItem("superset-fork-home-appearance");
			else localStorage.setItem("superset-fork-home-appearance", saved);
			await useForkHomeAppearance.persist.rehydrate();
		});
		return useForkHomeAppearance.getState().interactiveBackground;
	};
	const saved = localStorage.getItem("superset-fork-home-appearance");
	try {
		expect(await rehydrate(null)).toBe(true);
		expect(await rehydrate("{}")).toBe(true);
		expect(
			await rehydrate(
				JSON.stringify({ state: { interactiveBackground: false }, version: 0 }),
			),
		).toBe(false);
	} finally {
		await rehydrate(saved);
	}
});

test("external provider actions remain available when native Pro features are hidden", () => {
	const view = render(
		<>
			<ForkProFeature available>
				<span>Jira action</span>
			</ForkProFeature>
			<ForkProFeature>
				<span>Native action</span>
			</ForkProFeature>
		</>,
	);
	expect(view.getByText("Jira action")).toBeTruthy();
	expect(view.queryByText("Native action")).toBeNull();
});
