import { afterEach, expect, test } from "bun:test";
import { ForkProFeature } from "renderer/components/ForkProFeature";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { useSettingsStore } from "renderer/stores/settings-state";
import { cleanup, fireEvent, render } from "renderer/test-utils/fork-ui";
import { getVisibleMatchCountBySection } from "../../../utils/settings-search";
import { ForkSettings } from "./ForkSettings";

afterEach(() => {
	cleanup();
	useForkCliOptionsStore.getState().setHideCliOptions(true);
	useForkCliOptionsStore.getState().setHideProFeatures(true);
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
	expect(hidden.fork).toBe(2);
	expect(hidden.billing).toBeUndefined();
	expect(hidden.teams).toBeUndefined();
	expect(hidden.mobile).toBeUndefined();
	expect(hidden.localAgentAccounts).toBeGreaterThan(0);
	const visible = getVisibleMatchCountBySection("", true, true, true, false);
	expect(visible.billing).toBeGreaterThan(0);
});
